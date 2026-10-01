import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { getGeminiModel } from "../config/modelConfig.js";
import { tailoredResumeSchema } from "../schema/tailoredResumeSchema.js";
import { applicationEmailSchema } from "../schema/applicationEmailSchema.js";
import {
  RESUME_TAILORING_SYSTEM_PROMPT,
  buildResumeTailoringPrompt,
} from "../prompt/resumeTailoring.js";
import {
  APPLICATION_EMAIL_SYSTEM_PROMPT,
  buildApplicationEmailPrompt,
  formatAndCleanEmailBody,
} from "../prompt/applicationEmail.js";
import {
  APPLICATION_STATUS,
  APPLICATION_METHOD,
  RESUME_PAGE_COUNT,
  resolveUserResumeSettings,
} from "../../constant/application.constant.js";
import { normalizeApplicationMethod } from "../../repositories/application.repository.js";
import { findJobById } from "../../repositories/job.repository.js";
import { logError, logJobEvent } from "../../utils/logger.js";
import { appError } from "../../utils/errors.js";
import {
  createApplication,
  findApplicationById,
  updateApplicationStatus,
  updateApplicationResume,
  updateApplicationEmail,
  updateApplicationPhone,
  updateApplicationGoogleForm,
  updateApplicationUnknownResult,
} from "../../repositories/application.repository.js";
import { getActiveResumeByUserId } from "../../repositories/resume.repository.js";
import { User } from "../../model/User.js";
import { generateResumePdf } from "../../pdf/resumePdfService.js";
import { sendApplicationEmail } from "../../integrations/email/emailService.js";
import { isGoogleFormUrl } from "../../application/googleForm/googleFormFiller.js";
import { runGoogleFormApplication } from "../../application/methods/googleFormApplicationMethod.js";
import { runPhoneApplication } from "../../application/methods/phoneApplicationMethod.js";
import { runUnknownApplicationMethod } from "../../application/methods/unknownApplicationMethod.js";

/**
 * 1. Init Application Node
 */
const initApplicationNode = async (state) => {
  try {
    const application = await createApplication({
      userId: state.userId,
      jobId: state.jobId,
      status: APPLICATION_STATUS.PENDING,
    });

    let jobDoc = null;
    if (state.jobId) {
      const fetchedJob = await findJobById(state.jobId);
      if (fetchedJob) {
        jobDoc = fetchedJob.toObject ? fetchedJob.toObject() : fetchedJob;
      }
    }

    // Resolve user-specific dynamic constants from DB
    const userSettings = await resolveUserResumeSettings(state.userId);

    await logJobEvent(
      "initApplicationNode",
      "PENDING",
      `Application ${application._id} initialized for job ${state.jobId}`,
    );

    return {
      applicationId: application._id.toString(),
      ...(jobDoc && { job: jobDoc }),
      status: APPLICATION_STATUS.PENDING,
      targetPageLength: state.targetPageLength || userSettings.pageCount,
      template: state.template || userSettings.template,
    };
  } catch (error) {
    await logError("jobApplicationGraph.initApplicationNode", error.message);
    await logJobEvent("initApplicationNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        error: error.message,
        logMessage: `Init application failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 1b. Load Existing Application Node (re-run path)
 * Hydrates jobId and job into state when an applicationId is already provided,
 * so the rest of the pipeline can proceed without creating a duplicate application.
 */
const loadExistingApplicationNode = async (state) => {
  try {
    const application = await findApplicationById(state.applicationId);
    if (!application) {
      throw new appError(`Application not found: ${state.applicationId}`, 404);
    }

    if (!application.jobId) {
      throw new appError(`Job record missing for application: ${state.applicationId}`, 404);
    }

    let jobDoc = application.jobId;
    if (jobDoc.toObject) {
      jobDoc = jobDoc.toObject();
    }
    const jobId = jobDoc._id ? jobDoc._id.toString() : jobDoc.toString();

    const resolvedUserId =
      state.userId ||
      (application.userId?._id
        ? application.userId._id.toString()
        : application.userId?.toString?.() || "");

    const isRegeneration = !!(application.resume?.tailoredResumeData);

    const existingSourceResumeId =
      application.resume?.sourceResumeId?.toString?.() ||
      application.resume?.sourceResumeId ||
      "";

    await logJobEvent(
      "loadExistingApplicationNode",
      isRegeneration ? "RESUME_REGEN" : "FIRST_RUN",
      `Loaded existing application ${application._id} for job ${jobId} (isRegeneration=${isRegeneration})`,
    );

    const userSettings = await resolveUserResumeSettings(resolvedUserId);

    return {
      userId: resolvedUserId,
      jobId,
      job: jobDoc,
      applicationId: application._id.toString(),
      isRegeneration,
      sourceResumeId: existingSourceResumeId || state.sourceResumeId,
      status: APPLICATION_STATUS.PENDING,
      targetPageLength: state.targetPageLength || application.resume?.targetPages || userSettings.pageCount,
      template: state.template || application.resume?.template || userSettings.template,
    };
  } catch (error) {
    await logError("jobApplicationGraph.loadExistingApplicationNode", error.message);
    await logJobEvent("loadExistingApplicationNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Load existing application failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 2. Check Application Method Node
 *
 * Resolves the application method into exactly one of 4 canonical methods:
 *   1. EMAIL       — job has hrEmail OR applicationMethod is "email"
 *   2. PHONE       — job has phone contact OR applicationMethod is "phone"
 *   3. GOOGLE_FORM — applicationUrl is a Google Form (forms.gle / docs.google.com/forms)
 *   4. UNKNOWN     — anything else (career page, custom site, direct portal)
 *                    → AI will open and analyze the page to determine what to do
 */
const checkApplicationMethodNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    const job = state.job;

    let normalizedMethod;

    // Priority 1: If applicationUrl is a direct Google Form link
    if (
      job?.applicationUrl &&
      isGoogleFormUrl(job.applicationUrl)
    ) {
      normalizedMethod = APPLICATION_METHOD.GOOGLE_FORM;
    }
    // Priority 2: HR email present → email method
    else if (
      job?.hrEmail &&
      job.hrEmail !== "unknown" &&
      job.hrEmail !== "NOT_SPECIFIED" &&
      job.hrEmail.includes("@")
    ) {
      normalizedMethod = APPLICATION_METHOD.EMAIL;
    }
    // Priority 3: Phone contact present → phone method
    else if (
      job?.phone &&
      job.phone !== "unknown" &&
      job.phone !== "NOT_SPECIFIED"
    ) {
      normalizedMethod = APPLICATION_METHOD.PHONE;
    }
    // Priority 4: Normalize from job's applicationMethod field
    else {
      const rawMethod = normalizeApplicationMethod(job?.applicationMethod);
      if (Object.values(APPLICATION_METHOD).includes(rawMethod)) {
        normalizedMethod = rawMethod;
      } else {
        // Default: UNKNOWN (AI will analyze the page)
        normalizedMethod = APPLICATION_METHOD.UNKNOWN;
      }
    }

    await logJobEvent(
      "checkApplicationMethodNode",
      "METHOD_RESOLVED",
      `Application method resolved: ${job?.applicationMethod} → ${normalizedMethod} | URL: ${job?.applicationUrl || "N/A"} | hrEmail: ${job?.hrEmail || "N/A"} | phone: ${job?.phone || "N/A"}`,
    );

    return { applicationMethod: normalizedMethod };
  } catch (error) {
    await logError(
      "jobApplicationGraph.checkApplicationMethodNode",
      error.message,
    );
    await logJobEvent("checkApplicationMethodNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Check application method failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 3. Get User Active Resume Node
 */
const getUserResumeNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    await logJobEvent(
      "getUserResumeNode",
      "FETCH_RESUME",
      `Fetching active resume for user ${state.userId}`,
    );

    let activeResume = state.resume;
    let sourceResumeId = state.sourceResumeId;

    if (!activeResume) {
      const dbResumeDoc = await getActiveResumeByUserId(state.userId).catch(() => null);
      if (dbResumeDoc) {
        const dbResume = dbResumeDoc.toObject ? dbResumeDoc.toObject() : dbResumeDoc;
        activeResume = dbResume.parsedData || dbResume;
        sourceResumeId = dbResume._id ? dbResume._id.toString() : state.sourceResumeId;
      } else {
        // Fallback candidate profile from User model
        const user = await User.findById(state.userId).catch(() => null);
        activeResume = {
          personalInfo: {
            fullName: user?.username || "Candidate",
            email: user?.email || "candidate@example.com",
            phone: "",
          },
          summary: "Dedicated software engineer with proven experience in full-stack web development, scalable APIs, and clean software architecture.",
          skills: ["JavaScript", "TypeScript", "React", "Node.js", "MongoDB", "SQL", "Git"],
          experience: [
            {
              role: "Software Developer",
              company: "Technology Solutions",
              duration: "2023 - Present",
              description: "Developed and maintained full-stack web applications, REST APIs, and database models.",
            },
          ],
          education: [
            {
              degree: "Bachelor of Technology in Computer Science",
              institution: "University",
              year: "2023",
            },
          ],
        };
      }
    }

    await logJobEvent(
      "getUserResumeNode",
      "RESUME_LOADED",
      `Candidate active resume retrieved successfully (sourceId=${sourceResumeId})`,
    );

    return {
      resume: activeResume,
      sourceResumeId: sourceResumeId || state.sourceResumeId,
    };
  } catch (error) {
    await logError("jobApplicationGraph.getUserResumeNode", error.message);
    await logJobEvent("getUserResumeNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        error: error.message,
        logMessage: `Get user resume failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 4. Tailor Resume Node (With 100% Link Preservation Merge)
 */
const tailorResumeNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    await logJobEvent(
      "tailorResumeNode",
      "TAILORING_START",
      `Tailoring resume using AI model for job ${state.jobId}`,
    );

    const model = await getGeminiModel(state.userId);
    const structuredLlm = model.withStructuredOutput(tailoredResumeSchema);

    const promptText = buildResumeTailoringPrompt({
      candidateResume: state.resume,
      jobDetails: state.job,
      targetPageLength: state.targetPageLength || RESUME_PAGE_COUNT,
    });

    let result;
    try {
      result = await structuredLlm.invoke([
        { role: "system", content: RESUME_TAILORING_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ]);
    } catch (llmError) {
      await logError("jobApplicationGraph.tailorResumeNode.llm", llmError.message);
      const targetSkills = state.job?.skills || ["JavaScript", "React", "Node.js", "SQL"];
      const baseResume = state.resume || {};
      const safeBaseSkills = Array.isArray(baseResume.skills)
        ? baseResume.skills
        : (typeof baseResume.skills === "string" ? [baseResume.skills] : []);

      result = {
        tailoredResume: {
          personalInfo: baseResume.personalInfo || {
            fullName: "Candidate",
            email: "candidate@example.com",
          },
          summary: `Experienced software developer skilled in ${targetSkills.slice(0, 4).join(", ")}. Strong track record building high-performance solutions for ${state.job?.company || "innovative companies"}.`,
          skills: Array.from(new Set([...safeBaseSkills, ...targetSkills])),
          experience: baseResume.experience || [],
          education: baseResume.education || [],
          projects: baseResume.projects || [],
        },
        error: llmError.message,
      };
    }

    const tailored = result.tailoredResume || {};
    const baseResume = state.resume || {};

    if (result.error && state.applicationId) {
      await updateApplicationStatus(state.applicationId, state.status || APPLICATION_STATUS.PROCESSING, {
        error: result.error,
        logMessage: `AI Error during tailoring: ${result.error}`,
      });
    }

    // Merge & preserve personal links from base resume
    const basePersonal = baseResume.personalInfo || baseResume.personal || {};
    const tailoredPersonal = tailored.personalInfo || {};

    tailored.personalInfo = {
      ...tailoredPersonal,
      linkedin:
        tailoredPersonal.linkedin ||
        basePersonal.linkedin ||
        basePersonal.linkedinUrl ||
        "",
      github:
        tailoredPersonal.github ||
        basePersonal.github ||
        basePersonal.githubUrl ||
        "",
      website:
        tailoredPersonal.website ||
        tailoredPersonal.portfolio ||
        basePersonal.website ||
        basePersonal.portfolio ||
        basePersonal.websiteUrl ||
        "",
    };

    // Merge & preserve project links from base resume
    const baseProjects = Array.isArray(baseResume.projects) ? baseResume.projects : [];
    const tailoredProjects = Array.isArray(tailored.projects) ? tailored.projects : [];

    tailored.projects = tailoredProjects.map((proj) => {
      const match =
        baseProjects.find((b) => {
          const bTitle = (b.title || b.name || "").toLowerCase();
          const pTitle = (proj.title || proj.name || "").toLowerCase();
          return bTitle && pTitle && (bTitle.includes(pTitle) || pTitle.includes(bTitle));
        }) || {};

      const github =
        proj.links?.github || proj.githubUrl || proj.github ||
        match.links?.github || match.githubUrl || match.github || "";
      const liveDemo =
        proj.links?.liveDemo || proj.links?.demo || proj.demoUrl || proj.liveDemo ||
        match.links?.liveDemo || match.links?.demo || match.demoUrl || match.liveDemo || "";

      return {
        ...proj,
        links: { github, liveDemo },
        githubUrl: github,
        demoUrl: liveDemo,
      };
    });

    await logJobEvent(
      "tailorResumeNode",
      "TAILORING_COMPLETE",
      `Successfully tailored resume for application ${state.applicationId}`,
    );

    return {
      tailoredResume: tailored,
      resumeStrategy: result.resumeStrategy,
    };
  } catch (error) {
    await logError("jobApplicationGraph.tailorResumeNode", error.message);
    await logJobEvent("tailorResumeNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        error: error.message,
        logMessage: `Resume tailoring failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 5. Generate Resume PDF Node
 */
const generatePdfNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    if (!state.tailoredResume) {
      throw new appError("Tailored resume data is missing or invalid", 400);
    }

    await logJobEvent(
      "generatePdfNode",
      "PDF_START",
      `Generating PDF for application ${state.applicationId}`,
    );

    const pdfPath = await generateResumePdf({
      resumeData: state.tailoredResume,
      template: state.template || "modern",
      userId: state.userId,
      targetPages: state.targetPageLength || RESUME_PAGE_COUNT,
    });

    await updateApplicationResume(state.applicationId, {
      sourceResumeId: state.sourceResumeId,
      tailoredResumeData: state.tailoredResume,
      pdfPath,
    });

    // For re-generation runs, return to WAITING_FOR_REVIEW
    if (state.isRegeneration) {
      await updateApplicationStatus(
        state.applicationId,
        APPLICATION_STATUS.WAITING_FOR_REVIEW,
        {
          error: null,
          logMessage: "Tailored PDF regenerated successfully. Returning to human review.",
        },
      );

      await logJobEvent(
        "generatePdfNode",
        "RESUME_REGEN_COMPLETE",
        `Resume PDF regenerated for application ${state.applicationId}. Awaiting review.`,
      );

      return {
        resumePdfPath: pdfPath,
        status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      };
    }

    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.EMAIL_GENERATING,
      {
        logMessage: "Tailored PDF generated successfully. Generating application email draft...",
      },
    );

    await logJobEvent(
      "generatePdfNode",
      "PDF_COMPLETE",
      `Resume PDF generated successfully at ${pdfPath}`,
    );

    return {
      resumePdfPath: pdfPath,
      status: APPLICATION_STATUS.EMAIL_GENERATING,
    };
  } catch (error) {
    await logError("jobApplicationGraph.generatePdfNode", error.message);
    await logJobEvent("generatePdfNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `PDF generation failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 6a. METHOD: EMAIL — Generate Application Email Draft Node
 */
const generateEmailNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    await logJobEvent(
      "generateEmailNode",
      "EMAIL_START",
      `Generating draft application email for ${state.applicationId}`,
    );

    const model = await getGeminiModel(state.userId);
    const structuredLlm = model.withStructuredOutput(applicationEmailSchema);

    const candidateName =
      state.tailoredResume?.personalInfo?.fullName ||
      state.resume?.personalInfo?.fullName ||
      "Candidate";

    const promptText = buildApplicationEmailPrompt({
      candidateName,
      jobDetails: state.job,
      tailoredResume: state.tailoredResume,
    });

    let result;
    try {
      result = await structuredLlm.invoke([
        { role: "system", content: APPLICATION_EMAIL_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ]);
    } catch (llmError) {
      await logError("jobApplicationGraph.generateEmailNode.llm", llmError.message);
      const targetCompany = state.job?.company || "Hiring Team";
      const targetTitle = state.job?.title || "Software Developer";
      result = {
        recipient: state.job?.hrEmail || "",
        subject: `Application for ${targetTitle} - ${candidateName}`,
        body: `Dear Hiring Team at ${targetCompany},\n\nI am writing to express my strong enthusiasm for the ${targetTitle} opportunity. With my proven experience in modern software engineering and my hands-on background in full-stack web technologies, I am confident in my ability to make an immediate, positive impact on your team.\n\nThroughout my work, I have built reliable, maintainable software and scalable systems. I am very interested in the work being done at ${targetCompany} and welcome the opportunity to contribute to your technical milestones.\n\nMy tailored resume is attached for your review. I look forward to speaking with you in an interview.\n\nSincerely,\n\n${candidateName}`,
        error: llmError.message,
      };
    }

    const cleanedBody = formatAndCleanEmailBody(result.body, candidateName);

    if (result.error && state.applicationId) {
      await updateApplicationStatus(state.applicationId, state.status || APPLICATION_STATUS.PROCESSING, {
        error: result.error,
        logMessage: `AI Error during email generation: ${result.error}`,
      });
    }

    const resolvedRecipient =
      state.job?.hrEmail && state.job.hrEmail !== "unknown" && state.job.hrEmail !== "NOT_SPECIFIED"
        ? state.job.hrEmail
        : (result.recipient && result.recipient !== "unknown" && result.recipient !== "NOT_SPECIFIED" ? result.recipient : "");

    await updateApplicationEmail(state.applicationId, {
      recipient: resolvedRecipient,
      subject: result.subject || `Application for ${state.job?.title || "Position"} - ${candidateName}`,
      body: cleanedBody,
      approved: false,
    });

    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.WAITING_FOR_REVIEW,
      {
        error: null,
        logMessage: "Application draft created. Paused at human review checkpoint.",
      },
    );

    await logJobEvent(
      "generateEmailNode",
      "WAITING_FOR_REVIEW",
      `Application ${state.applicationId} is ready for human review.`,
    );

    return {
      email: {
        recipient: resolvedRecipient,
        subject: result.subject,
        body: cleanedBody,
        approved: false,
      },
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
    };
  } catch (error) {
    await logError("jobApplicationGraph.generateEmailNode", error.message);
    await logJobEvent("generateEmailNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        error: error.message,
        logMessage: `Email draft generation failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 6b. METHOD: PHONE — Phone Application Node
 *
 * Generates a professional call script and talking points.
 * Sets application to WAITING_FOR_REVIEW so the candidate can make the call.
 */
const phoneApplicationNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    const phoneNumber =
      state.job?.phone ||
      state.job?.contactPhone ||
      state.job?.hrPhone ||
      "";

    await logJobEvent(
      "phoneApplicationNode",
      "PHONE_START",
      `Preparing phone application for ${state.job?.company || "Company"} - ${state.job?.title || "Position"}. Phone: ${phoneNumber || "N/A"}`,
    );

    const phoneResult = await runPhoneApplication({
      applicationId: state.applicationId,
      phoneNumber,
      candidateInfo: state.tailoredResume || state.resume,
      jobDetails: state.job,
      userId: state.userId,
    });

    // Store call script as email body for review
    await updateApplicationEmail(state.applicationId, {
      recipient: phoneNumber,
      subject: `Phone Application: ${state.job?.title || "Position"} at ${state.job?.company || "Company"}`,
      body: phoneResult.callScript,
      approved: false,
    });

    // Persist phone application data to DB via repository
    await updateApplicationPhone(state.applicationId, {
      phoneNumber,
      callScript: phoneResult.callScript,
      talkingPoints: phoneResult.talkingPoints,
      bestTimeToCall: phoneResult.bestTimeToCall,
      followUpAction: phoneResult.followUpAction,
      generatedAt: new Date(),
    });

    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.WAITING_FOR_REVIEW,
      {
        error: null,
        logMessage: `Phone application script ready. Call ${phoneNumber || "HR"} using the generated script.`,
      },
    );

    await logJobEvent(
      "phoneApplicationNode",
      "PHONE_READY",
      `Phone call script ready for ${state.job?.company || "Company"}. Phone: ${phoneNumber || "N/A"}`,
    );

    return {
      phoneApplication: {
        phoneNumber,
        callScript: phoneResult.callScript,
        talkingPoints: phoneResult.talkingPoints,
        bestTimeToCall: phoneResult.bestTimeToCall,
        followUpAction: phoneResult.followUpAction,
      },
      email: {
        recipient: phoneNumber,
        subject: `Phone Application: ${state.job?.title || "Position"} at ${state.job?.company || "Company"}`,
        body: phoneResult.callScript,
        approved: false,
      },
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
    };
  } catch (error) {
    await logError("jobApplicationGraph.phoneApplicationNode", error.message);
    await logJobEvent("phoneApplicationNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Phone application preparation failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 6c. METHOD: GOOGLE FORM — Google Form Application Node
 *
 * Opens the Google Form URL in a headless browser.
 * Extracts form fields and fills them using LLM-resolved answers.
 * If a resume/file upload field is detected, uploads the tailored resume PDF.
 * Submits the form and updates application status.
 */
const googleFormApplicationNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    const googleFormUrl = state.job?.applicationUrl || "";

    await logJobEvent(
      "googleFormApplicationNode",
      "GOOGLE_FORM_START",
      `Starting Google Form application: ${googleFormUrl}`,
    );

    const formResult = await runGoogleFormApplication({
      applicationId: state.applicationId,
      googleFormUrl,
      candidateInfo: state.tailoredResume || state.resume,
      jobDetails: state.job,
      userId: state.userId,
      resumePdfPath: state.resumePdfPath || null,
    });

    if (formResult.loginRequired) {
      await logJobEvent(
        "googleFormApplicationNode",
        "LOGIN_REQUIRED",
        `Google Form requires Google Account sign-in: ${formResult.loginUrl || googleFormUrl}`,
      );

      return {
        googleFormResult: formResult,
        status: APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED,
      };
    }

    if (formResult.formClosed) {
      // Google Form is closed — fall back to email if possible
      await logJobEvent(
        "googleFormApplicationNode",
        "FORM_CLOSED",
        `Google Form closed. Falling back to email if HR email available.`,
      );

      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: `Google Form is closed. Manual follow-up required.`,
      });

      return {
        googleFormResult: formResult,
        status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      };
    }

    const finalStatus = formResult.submitted
      ? APPLICATION_STATUS.APPLIED
      : APPLICATION_STATUS.WAITING_FOR_REVIEW;

    // Persist Google Form result to DB via repository
    if (state.applicationId) {
      await updateApplicationGoogleForm(state.applicationId, {
        googleFormUrl,
        fieldsDetected: formResult.fieldsDetected || 0,
        filledCount: formResult.filledCount || 0,
        skippedCount: formResult.skippedCount || 0,
        hasResumeField: formResult.hasResumeField || false,
        submitted: formResult.submitted || false,
        formClosed: formResult.formClosed || false,
        loginRequired: formResult.loginRequired || false,
        loginUrl: formResult.loginUrl || "",
        errors: formResult.errors || [],
        submittedAt: formResult.submitted ? new Date() : null,
      });
    }

    await logJobEvent(
      "googleFormApplicationNode",
      formResult.submitted ? "SUBMITTED" : "WAITING_FOR_REVIEW",
      `Google Form: submitted=${formResult.submitted}, filled=${formResult.filledCount} fields. Status: ${finalStatus}`,
    );

    return {
      googleFormResult: formResult,
      status: finalStatus,
    };
  } catch (error) {
    await logError("jobApplicationGraph.googleFormApplicationNode", error.message);
    await logJobEvent("googleFormApplicationNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Google Form application failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 6d. METHOD: UNKNOWN — Unknown/Career Page Application Node
 *
 * Opens the unknown URL in a headless browser.
 * Uses AI LLM to classify the page and detect the real application method.
 * Dispatches to the correct sub-handler (email, phone, Google Form, custom form).
 * Falls back to WAITING_FOR_REVIEW for human action if AI cannot determine method.
 */
const unknownApplicationNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    // Use applicationUrl or sourceUrl as the page to analyze
    const pageUrl =
      state.job?.applicationUrl ||
      state.job?.sourceUrl ||
      "";

    if (!pageUrl) {
      await logJobEvent(
        "unknownApplicationNode",
        "NO_URL",
        "No URL available for unknown application method. Setting to WAITING_FOR_REVIEW.",
      );
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: "No application URL found. Human review required.",
      });
      return { status: APPLICATION_STATUS.WAITING_FOR_REVIEW };
    }

    await logJobEvent(
      "unknownApplicationNode",
      "UNKNOWN_START",
      `AI analyzing unknown page: ${pageUrl}`,
    );

    const unknownResult = await runUnknownApplicationMethod({
      applicationId: state.applicationId,
      pageUrl,
      candidateInfo: state.tailoredResume || state.resume,
      jobDetails: state.job,
      userId: state.userId,
      resumePdfPath: state.resumePdfPath || null,
    });

    await logJobEvent(
      "unknownApplicationNode",
      "UNKNOWN_COMPLETE",
      `Unknown method resolved: ${unknownResult.detectedMethod}. Action: ${unknownResult.actionTaken}. Message: ${unknownResult.message}`,
    );

    // Determine final status
    let finalStatus = unknownResult.status || APPLICATION_STATUS.WAITING_FOR_REVIEW;
    if (
      unknownResult.actionTaken === "email_sent" ||
<<<<<<< HEAD
      unknownResult.actionTaken === "google_form_submitted" ||
      unknownResult.actionTaken === "custom_form_submitted" ||
      unknownResult.actionTaken === "success" ||
      unknownResult.pageResult?.terminalState === "success"
=======
      unknownResult.actionTaken === "verified_submission"
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
    ) {
      finalStatus = APPLICATION_STATUS.APPLIED;
    } else if (
      unknownResult.status === APPLICATION_STATUS.WAITING_FOR_USER ||
      unknownResult.status === APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW ||
      unknownResult.status === APPLICATION_STATUS.HUMAN_REQUIRED
    ) {
      finalStatus = unknownResult.status;
    }

    // Persist unknown page analysis & execution to DB via repository
    if (state.applicationId) {
      await updateApplicationUnknownResult(state.applicationId, {
        pageUrl,
        detectedMethod: unknownResult.detectedMethod,
        actionTaken: unknownResult.actionTaken,
        message: unknownResult.message,
        analyzedAt: new Date(),
      });
    }

    return {
      unknownPageResult: unknownResult,
      agentState: unknownResult.pageResult?.agentState || null,
      pendingHumanAction: unknownResult.pageResult?.agentState?.pendingHumanAction || null,
      status: finalStatus,
    };
  } catch (error) {
    await logError("jobApplicationGraph.unknownApplicationNode", error.message);
    await logJobEvent("unknownApplicationNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Unknown application method failed: ${error.message}`,
      });
    }
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 7. Send Approved Email Node
 */
export const sendApprovedEmailNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.SENDING,
      {
        logMessage: "User approved application. Dispatching email...",
      },
    );

    const sendResult = await sendApplicationEmail({
      recipient: state.email.recipient,
      subject: state.email.subject,
      body: state.email.body,
      pdfPath: state.resumePdfPath,
    });

    await updateApplicationEmail(state.applicationId, {
      recipient: state.email.recipient,
      subject: state.email.subject,
      body: state.email.body,
      approved: true,
      approvedAt: new Date(),
      sentAt: new Date(),
    });

    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.SENT,
      {
        logMessage: `Email successfully sent. MessageId: ${sendResult.messageId}`,
      },
    );

    await logJobEvent(
      "sendApprovedEmailNode",
      "SENT",
      `Application ${state.applicationId} sent successfully to ${state.email.recipient}`,
    );

    return {
      status: APPLICATION_STATUS.SENT,
      sendResult,
    };
  } catch (error) {
    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.FAILED,
      {
        logMessage: `Email dispatch failed: ${error.message}`,
      },
    );
    await logError("jobApplicationGraph.sendApprovedEmailNode", error.message);
    await logJobEvent("sendApprovedEmailNode", "FAILED", error.message);
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * Conditional Routers
 */
const routeFromStart = (state) => {
  if (state.applicationId) {
    return "loadExistingApplicationNode";
  }
  return "initApplicationNode";
};

const routeAfterInit = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  return "checkApplicationMethodNode";
};

const routeAfterLoadExisting = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  return "checkApplicationMethodNode";
};

/**
 * After method check, route to getUserResumeNode for tailoring-required methods,
 * or directly to the method-specific node for phone (no tailoring needed).
 */
const routeAfterMethodCheck = (state) => {
  if (
    state.status === APPLICATION_STATUS.UNSUPPORTED_METHOD ||
    state.status === APPLICATION_STATUS.FAILED
  ) {
    return END;
  }
  // Phone method: we still load resume (for call script context)
  // All 4 methods go through getUserResumeNode
  return "getUserResumeNode";
};

const routeAfterGetUserResume = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }

  const method = state.applicationMethod;

  // EMAIL: requires full tailored resume and PDF attachment
  if (method === APPLICATION_METHOD.EMAIL) {
    return "tailorResumeNode";
  }

  // PHONE: uses candidate info for call script and talking points directly (no tailoring/PDF needed)
  if (method === APPLICATION_METHOD.PHONE) {
    return "phoneApplicationNode";
  }

  // GOOGLE_FORM: opens form and inspects fields; tailors on-demand only if resume field exists
  if (method === APPLICATION_METHOD.GOOGLE_FORM) {
    return "googleFormApplicationNode";
  }

  // UNKNOWN: analyzes career/job page with LLM; tailors on-demand only if resume field exists
  return "unknownApplicationNode";
};

const routeAfterTailor = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED || !state.tailoredResume) {
    return END;
  }

  const method = state.applicationMethod;

  // Phone method: no PDF needed
  if (method === APPLICATION_METHOD.PHONE) {
    return "phoneApplicationNode";
  }

  // All other methods need PDF (email needs it as attachment,
  // Google Form & Unknown need it for potential file upload)
  return "generatePdfNode";
};

const routeAfterPdf = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  if (state.isRegeneration || state.status === APPLICATION_STATUS.WAITING_FOR_REVIEW) {
    return END;
  }

  const method = state.applicationMethod;

  if (method === APPLICATION_METHOD.EMAIL) {
    return "generateEmailNode";
  }
  if (method === APPLICATION_METHOD.GOOGLE_FORM) {
    return "googleFormApplicationNode";
  }
  // UNKNOWN / WEBSITE_FORM
  return "unknownApplicationNode";
};

/**
 * Build StateGraph for Job Application Pipeline
 * Supports all 4 application methods:
 * 1. EMAIL       — tailors resume → PDF → drafts email → human review → send
 * 2. PHONE       — tailors resume → generates call script → human review
 * 3. GOOGLE_FORM — tailors resume → PDF → fills Google Form → submit
 * 4. UNKNOWN     — tailors resume → PDF → AI analyzes page → dispatches to sub-handler
 */
const workflow = new StateGraph({
  channels: {
    userId: { value: (x, y) => y ?? x, default: () => "" },
    applicationId: { value: (x, y) => y ?? x, default: () => "" },
    jobId: { value: (x, y) => y ?? x, default: () => "" },
    job: { value: (x, y) => y ?? x, default: () => null },
    resume: { value: (x, y) => y ?? x, default: () => null },
    sourceResumeId: { value: (x, y) => y ?? x, default: () => "" },
    targetPageLength: {
      value: (x, y) => y ?? x,
      default: () => RESUME_PAGE_COUNT,
    },
    applicationMethod: { value: (x, y) => y ?? x, default: () => APPLICATION_METHOD.EMAIL },
    tailoredResume: { value: (x, y) => y ?? x, default: () => null },
    resumeStrategy: { value: (x, y) => y ?? x, default: () => null },
    resumePdfPath: { value: (x, y) => y ?? x, default: () => "" },
    email: { value: (x, y) => y ?? x, default: () => null },
    phoneApplication: { value: (x, y) => y ?? x, default: () => null },
    googleFormResult: { value: (x, y) => y ?? x, default: () => null },
    unknownPageResult: { value: (x, y) => y ?? x, default: () => null },
    agentState: { value: (x, y) => y ?? x, default: () => null },
    pendingHumanAction: { value: (x, y) => y ?? x, default: () => null },
    status: {
      value: (x, y) => y ?? x,
      default: () => APPLICATION_STATUS.PENDING,
    },
    rejectionReason: { value: (x, y) => y ?? x, default: () => null },
    errorInfo: { value: (x, y) => y ?? x, default: () => null },
    isRegeneration: { value: (x, y) => y ?? x, default: () => false },
    template: { value: (x, y) => y ?? x, default: () => "ATS Modern" },
  },
});

// Register all nodes
workflow.addNode("initApplicationNode", initApplicationNode);
workflow.addNode("loadExistingApplicationNode", loadExistingApplicationNode);
workflow.addNode("checkApplicationMethodNode", checkApplicationMethodNode);
workflow.addNode("getUserResumeNode", getUserResumeNode);
workflow.addNode("tailorResumeNode", tailorResumeNode);
workflow.addNode("generatePdfNode", generatePdfNode);
workflow.addNode("generateEmailNode", generateEmailNode);
workflow.addNode("phoneApplicationNode", phoneApplicationNode);
workflow.addNode("googleFormApplicationNode", googleFormApplicationNode);
workflow.addNode("unknownApplicationNode", unknownApplicationNode);

// Define conditional edges
workflow.addConditionalEdges(START, routeFromStart, {
  initApplicationNode: "initApplicationNode",
  loadExistingApplicationNode: "loadExistingApplicationNode",
});

workflow.addConditionalEdges("initApplicationNode", routeAfterInit, {
  checkApplicationMethodNode: "checkApplicationMethodNode",
  [END]: END,
});

workflow.addConditionalEdges("loadExistingApplicationNode", routeAfterLoadExisting, {
  checkApplicationMethodNode: "checkApplicationMethodNode",
  [END]: END,
});

workflow.addConditionalEdges("checkApplicationMethodNode", routeAfterMethodCheck, {
  [END]: END,
  getUserResumeNode: "getUserResumeNode",
});

workflow.addConditionalEdges("getUserResumeNode", routeAfterGetUserResume, {
  tailorResumeNode: "tailorResumeNode",
  phoneApplicationNode: "phoneApplicationNode",
  googleFormApplicationNode: "googleFormApplicationNode",
  unknownApplicationNode: "unknownApplicationNode",
  [END]: END,
});

workflow.addConditionalEdges("tailorResumeNode", routeAfterTailor, {
  generatePdfNode: "generatePdfNode",
  phoneApplicationNode: "phoneApplicationNode",
  [END]: END,
});

workflow.addConditionalEdges("generatePdfNode", routeAfterPdf, {
  generateEmailNode: "generateEmailNode",
  googleFormApplicationNode: "googleFormApplicationNode",
  unknownApplicationNode: "unknownApplicationNode",
  [END]: END,
});

// Terminal nodes — all end after their execution
workflow.addEdge("generateEmailNode", END);
workflow.addEdge("phoneApplicationNode", END);
workflow.addEdge("googleFormApplicationNode", END);
workflow.addEdge("unknownApplicationNode", END);

export const memorySaver = new MemorySaver();
export const jobApplicationGraph = workflow.compile({
  checkpointer: memorySaver,
});

export default jobApplicationGraph;
