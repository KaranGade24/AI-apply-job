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
} from "../../repositories/application.repository.js";
import { getActiveResumeByUserId } from "../../repositories/resume.repository.js";
import { generateResumePdf } from "../../pdf/resumePdfService.js";
import { sendApplicationEmail } from "../../integrations/email/emailService.js";

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

    await logJobEvent(
      "initApplicationNode",
      "PENDING",
      `Application ${application._id} initialized for job ${state.jobId}`,
    );

    return {
      applicationId: application._id.toString(),
      ...(jobDoc && { job: jobDoc }),
      status: APPLICATION_STATUS.PENDING,
    };
  } catch (error) {
    await logError("jobApplicationGraph.initApplicationNode", error.message);
    await logJobEvent("initApplicationNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
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

    // jobId is populated by findApplicationById; convert to plain object to prevent
    // Mongoose document serialization issues inside LangGraph state channels.
    let jobDoc = application.jobId;
    if (jobDoc.toObject) {
      jobDoc = jobDoc.toObject();
    }
    const jobId = jobDoc._id ? jobDoc._id.toString() : jobDoc.toString();

    // userId may be populated (object) or a raw ObjectId string — normalise to string.
    const resolvedUserId =
      state.userId ||
      (application.userId?._id
        ? application.userId._id.toString()
        : application.userId?.toString?.() || "");

    // isRegeneration is true when a prior tailored resume already exists on this application.
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

    return {
      userId: resolvedUserId,
      jobId,
      job: jobDoc,
      applicationId: application._id.toString(),
      isRegeneration,
      sourceResumeId: existingSourceResumeId || state.sourceResumeId,
      status: APPLICATION_STATUS.PENDING,
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
 * Supported routing:
 *   - APPLICATION_METHOD.EMAIL       → full pipeline (tailor resume + generate email)
 *   - APPLICATION_METHOD.WEBSITE_FORM
 *   - APPLICATION_METHOD.GOOGLE_FORM → tailor resume + generate PDF only (portal apply)
 *   - Everything else (phone, unknown, NOT_SPECIFIED, etc.) → UNSUPPORTED_METHOD
 */
const checkApplicationMethodNode = async (state) => {
  try {
    if (state.status === APPLICATION_STATUS.FAILED) {
      return { status: APPLICATION_STATUS.FAILED };
    }

    const job = state.job;

    // Normalize the raw value stored in the Job document against the APPLICATION_METHOD enum.
    const normalizedMethod = normalizeApplicationMethod(job?.applicationMethod);

    await logJobEvent(
      "checkApplicationMethodNode",
      "METHOD_CHECK",
      `Checking application method: ${job?.applicationMethod} -> normalized: ${normalizedMethod}`,
    );

    const SUPPORTED_METHODS = [
      APPLICATION_METHOD.EMAIL,
      APPLICATION_METHOD.WEBSITE_FORM,
      APPLICATION_METHOD.GOOGLE_FORM,
    ];

    if (!SUPPORTED_METHODS.includes(normalizedMethod)) {
      await updateApplicationStatus(
        state.applicationId,
        APPLICATION_STATUS.UNSUPPORTED_METHOD,
        {
          rejectionReason: `Unsupported application method: ${job?.applicationMethod} (normalized: ${normalizedMethod})`,
        },
      );
      await logJobEvent(
        "checkApplicationMethodNode",
        "UNSUPPORTED",
        `Unsupported application method: ${normalizedMethod}`,
      );
      return { status: APPLICATION_STATUS.UNSUPPORTED_METHOD };
    }

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
      const dbResume = await getActiveResumeByUserId(state.userId);
      if (!dbResume) {
        throw new appError(`No active resume found for candidate ${state.userId}`, 404);
      }
      activeResume = dbResume.parsedData || dbResume;
      sourceResumeId = dbResume._id ? dbResume._id.toString() : state.sourceResumeId;
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

    const model = getGeminiModel();
    const structuredLlm = model.withStructuredOutput(tailoredResumeSchema);

    const promptText = buildResumeTailoringPrompt({
      candidateResume: state.resume,
      jobDetails: state.job,
      targetPageLength: state.targetPageLength || RESUME_PAGE_COUNT,
    });

    const result = await structuredLlm.invoke([
      { role: "system", content: RESUME_TAILORING_SYSTEM_PROMPT },
      { role: "user", content: promptText },
    ]);

    const tailored = result.tailoredResume || {};
    const baseResume = state.resume || {};

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

    // Merge & preserve project links (Live Demo & GitHub repository) from base resume
    const baseProjects = Array.isArray(baseResume.projects)
      ? baseResume.projects
      : [];
    const tailoredProjects = Array.isArray(tailored.projects)
      ? tailored.projects
      : [];

    tailored.projects = tailoredProjects.map((proj) => {
      const match =
        baseProjects.find((b) => {
          const bTitle = (b.title || b.name || "").toLowerCase();
          const pTitle = (proj.title || proj.name || "").toLowerCase();
          return (
            bTitle &&
            pTitle &&
            (bTitle.includes(pTitle) || pTitle.includes(bTitle))
          );
        }) || {};

      const github =
        proj.links?.github ||
        proj.githubUrl ||
        proj.github ||
        match.links?.github ||
        match.githubUrl ||
        match.github ||
        "";
      const liveDemo =
        proj.links?.liveDemo ||
        proj.links?.demo ||
        proj.demoUrl ||
        proj.liveDemo ||
        match.links?.liveDemo ||
        match.links?.demo ||
        match.demoUrl ||
        match.liveDemo ||
        "";

      return {
        ...proj,
        links: {
          github,
          liveDemo,
        },
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
      template: "modern",
      userId: state.userId,
      targetPages: state.targetPageLength || RESUME_PAGE_COUNT,
    });

    await updateApplicationResume(state.applicationId, {
      sourceResumeId: state.sourceResumeId,
      tailoredResumeData: state.tailoredResume,
      pdfPath,
    });

    // For re-generation runs, keep the existing email draft intact and
    // return to WAITING_FOR_REVIEW without regenerating the email.
    if (state.isRegeneration) {
      await updateApplicationStatus(
        state.applicationId,
        APPLICATION_STATUS.WAITING_FOR_REVIEW,
        {
          logMessage:
            "Tailored PDF regenerated successfully. Returning to human review.",
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
        logMessage:
          "Tailored PDF generated successfully. Generating application email draft...",
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
 * 6. Generate Application Email Draft Node
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

    const model = getGeminiModel();
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

    const result = await structuredLlm.invoke([
      { role: "system", content: APPLICATION_EMAIL_SYSTEM_PROMPT },
      { role: "user", content: promptText },
    ]);

    const cleanedBody = formatAndCleanEmailBody(result.body, candidateName);

    await updateApplicationEmail(state.applicationId, {
      recipient: result.recipient,
      subject: result.subject,
      body: cleanedBody,
      approved: false,
    });

    await updateApplicationStatus(
      state.applicationId,
      APPLICATION_STATUS.WAITING_FOR_REVIEW,
      {
        logMessage:
          "Application draft created. Paused at human review checkpoint.",
      },
    );

    await logJobEvent(
      "generateEmailNode",
      "WAITING_FOR_REVIEW",
      `Application ${state.applicationId} is ready for human review.`,
    );

    return {
      email: {
        recipient: result.recipient,
        subject: result.subject,
        body: result.body,
        approved: false,
      },
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
    };
  } catch (error) {
    await logError("jobApplicationGraph.generateEmailNode", error.message);
    await logJobEvent("generateEmailNode", "FAILED", error.message);
    if (state.applicationId) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
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

const routeAfterMethodCheck = (state) => {
  if (
    state.status === APPLICATION_STATUS.UNSUPPORTED_METHOD ||
    state.status === APPLICATION_STATUS.FAILED
  ) {
    return END;
  }
  return "getUserResumeNode";
};

const routeAfterGetUserResume = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  return "tailorResumeNode";
};

const routeAfterTailor = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED || !state.tailoredResume) {
    return END;
  }
  return "generatePdfNode";
};

const routeAfterPdf = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  if (state.isRegeneration || state.status === APPLICATION_STATUS.WAITING_FOR_REVIEW) {
    return END;
  }
  if (
    state.applicationMethod === APPLICATION_METHOD.WEBSITE_FORM ||
    state.applicationMethod === APPLICATION_METHOD.GOOGLE_FORM
  ) {
    return END;
  }
  return "generateEmailNode";
};

/**
 * Build StateGraph for Job Application Pipeline
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
    applicationMethod: { value: (x, y) => y ?? x, default: () => "email" },
    tailoredResume: { value: (x, y) => y ?? x, default: () => null },
    resumeStrategy: { value: (x, y) => y ?? x, default: () => null },
    resumePdfPath: { value: (x, y) => y ?? x, default: () => "" },
    email: { value: (x, y) => y ?? x, default: () => null },
    status: {
      value: (x, y) => y ?? x,
      default: () => APPLICATION_STATUS.PENDING,
    },
    rejectionReason: { value: (x, y) => y ?? x, default: () => null },
    errorInfo: { value: (x, y) => y ?? x, default: () => null },
    isRegeneration: { value: (x, y) => y ?? x, default: () => false },
  },
});

workflow.addNode("initApplicationNode", initApplicationNode);
workflow.addNode("loadExistingApplicationNode", loadExistingApplicationNode);
workflow.addNode("checkApplicationMethodNode", checkApplicationMethodNode);
workflow.addNode("getUserResumeNode", getUserResumeNode);
workflow.addNode("tailorResumeNode", tailorResumeNode);
workflow.addNode("generatePdfNode", generatePdfNode);
workflow.addNode("generateEmailNode", generateEmailNode);

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

workflow.addConditionalEdges(
  "checkApplicationMethodNode",
  routeAfterMethodCheck,
  {
    [END]: END,
    getUserResumeNode: "getUserResumeNode",
  },
);

workflow.addConditionalEdges("getUserResumeNode", routeAfterGetUserResume, {
  tailorResumeNode: "tailorResumeNode",
  [END]: END,
});

workflow.addConditionalEdges("tailorResumeNode", routeAfterTailor, {
  generatePdfNode: "generatePdfNode",
  [END]: END,
});

workflow.addConditionalEdges("generatePdfNode", routeAfterPdf, {
  generateEmailNode: "generateEmailNode",
  [END]: END,
});

workflow.addEdge("generateEmailNode", END);

export const memorySaver = new MemorySaver();
export const jobApplicationGraph = workflow.compile({
  checkpointer: memorySaver,
});

export default jobApplicationGraph;
