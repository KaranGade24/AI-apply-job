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

    await logJobEvent(
      "initApplicationNode",
      "PENDING",
      `Application ${application._id} initialized for job ${state.jobId}`,
    );

    return {
      applicationId: application._id.toString(),
      status: APPLICATION_STATUS.PENDING,
    };
  } catch (error) {
    await logError("jobApplicationGraph.initApplicationNode", error.message);
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

    // jobId is populated by findApplicationById; convert to plain object to prevent
    // Mongoose document serialization issues inside LangGraph state channels.
    const jobDoc = application.jobId.toObject ? application.jobId.toObject() : application.jobId;
    const jobId = jobDoc._id.toString();

    // userId may be populated (object) or a raw ObjectId string — normalise to string.
    const resolvedUserId =
      state.userId ||
      (application.userId?._id
        ? application.userId._id.toString()
        : application.userId?.toString?.() || "");

    // isRegeneration is only true when a prior tailored resume already exists on this
    // application. A brand-new application that was pre-created in the service layer
    // (but never processed) must go through the full pipeline.
    const isRegeneration = !!(application.resume?.tailoredResumeData);

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
      status: APPLICATION_STATUS.PENDING,
    };
  } catch (error) {
    await logError("jobApplicationGraph.loadExistingApplicationNode", error.message);
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
    const job = state.job;

    // Normalize the raw value stored in the Job document against the APPLICATION_METHOD enum.
    // This handles values like "NOT_SPECIFIED", "googleForm", "websiteForm", raw freetext, etc.
    const normalizedMethod = normalizeApplicationMethod(job?.applicationMethod);

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
      return { status: APPLICATION_STATUS.UNSUPPORTED_METHOD };
    }

    return { applicationMethod: normalizedMethod };
  } catch (error) {
    await logError(
      "jobApplicationGraph.checkApplicationMethodNode",
      error.message,
    );
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
    const activeResume = await getActiveResumeByUserId(state.userId);
    if (!activeResume) {
      throw new appError("No active resume found for candidate", 404);
    }

    return {
      resume: activeResume.parsedData || activeResume,
      sourceResumeId: activeResume._id.toString(),
    };
  } catch (error) {
    await logError("jobApplicationGraph.getUserResumeNode", error.message);
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

    return {
      tailoredResume: tailored,
      resumeStrategy: result.resumeStrategy,
    };
  } catch (error) {
    await logError("jobApplicationGraph.tailorResumeNode", error.message);
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * Conditional Edge Router: After Tailoring Resume
 */
const routeAfterTailor = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED || !state.tailoredResume) {
    return END;
  }
  return "generatePdfNode";
};

/**
 * 5. Generate Resume PDF Node
 */
const generatePdfNode = async (state) => {
  try {
    if (!state.tailoredResume) {
      throw new appError("Tailored resume data is missing or invalid", 400);
    }

    const pdfPath = await generateResumePdf({
      resumeData: state.tailoredResume,
      template: "modern",
      userId: state.userId,
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

    return {
      resumePdfPath: pdfPath,
      status: APPLICATION_STATUS.EMAIL_GENERATING,
    };
  } catch (error) {
    await logError("jobApplicationGraph.generatePdfNode", error.message);
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * Conditional Edge Router: After PDF Generation
 *
 * - Regeneration runs (re-tailor existing application) → skip email re-generation and exit.
 * - Portal-only methods (websiteForm, googleForm) → skip email generation and exit at WAITING_FOR_REVIEW.
 * - Email method new-application runs → continue to generate the email draft.
 */
const routeAfterPdf = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  if (state.isRegeneration || state.status === APPLICATION_STATUS.WAITING_FOR_REVIEW) {
    return END;
  }
  // Portal methods don't send email — PDF is the deliverable, go straight to review.
  if (
    state.applicationMethod === APPLICATION_METHOD.WEBSITE_FORM ||
    state.applicationMethod === APPLICATION_METHOD.GOOGLE_FORM
  ) {
    return END;
  }
  return "generateEmailNode";
};

/**
 * 6. Generate Application Email Draft Node
 */
const generateEmailNode = async (state) => {
  try {
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
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * Conditional Edge Router: Check Application Method
 *
 * Routes to getUserResumeNode for all supported methods (email, websiteForm, googleForm).
 * Exits for unsupported methods or failures.
 */
const routeAfterMethodCheck = (state) => {
  if (
    state.status === APPLICATION_STATUS.UNSUPPORTED_METHOD ||
    state.status === APPLICATION_STATUS.FAILED
  ) {
    return END;
  }
  return "getUserResumeNode";
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
    // True when this is a resume re-generation run (applicationId supplied upfront).
    // Causes generatePdfNode to skip email re-generation and exit at WAITING_FOR_REVIEW.
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

/**
 * Conditional router from START:
 * - If applicationId is already set, load the existing application (re-run / resume-regen path).
 * - Otherwise, create a new application (new application path).
 */
const routeFromStart = (state) => {
  if (state.applicationId) {
    return "loadExistingApplicationNode";
  }
  return "initApplicationNode";
};

// Define edges
workflow.addConditionalEdges(START, routeFromStart, {
  initApplicationNode: "initApplicationNode",
  loadExistingApplicationNode: "loadExistingApplicationNode",
});
workflow.addEdge("initApplicationNode", "checkApplicationMethodNode");
workflow.addEdge("loadExistingApplicationNode", "checkApplicationMethodNode");

workflow.addConditionalEdges(
  "checkApplicationMethodNode",
  routeAfterMethodCheck,
  {
    [END]: END,
    getUserResumeNode: "getUserResumeNode",
  },
);

workflow.addEdge("getUserResumeNode", "tailorResumeNode");
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
