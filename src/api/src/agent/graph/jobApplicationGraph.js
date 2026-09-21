import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { getGeminiModel } from "../config/modelConfig.js";
import { APPLICATION_STATUS, APPLICATION_METHOD } from "../../constant/application.constant.js";
import {
  findApplicationById,
  findNextPendingApplication,
  updateApplicationStatus,
  updateApplicationResume,
  updateApplicationEmail,
} from "../../repositories/application.repository.js";
import { Resume } from "../../model/Resume.js";
import { tailoredResumeSchema } from "../schema/tailoredResumeSchema.js";
import { applicationEmailSchema } from "../schema/applicationEmailSchema.js";
import {
  RESUME_TAILORING_SYSTEM_PROMPT,
  buildResumeTailoringPrompt,
} from "../prompt/resumeTailoring.js";
import {
  APPLICATION_EMAIL_SYSTEM_PROMPT,
  buildApplicationEmailPrompt,
} from "../prompt/applicationEmail.js";
import { generateResumePdf } from "../../pdf/resumePdfService.js";
import { sendApplicationEmail } from "../../integrations/email/emailService.js";
import { logError, logJobEvent } from "../../utils/logger.js";
import { appError } from "../../utils/errors.js";

/**
 * 1. Initialize or load Application Node
 */
const initApplicationNode = async (state) => {
  try {
    let application = null;
    if (state.applicationId) {
      application = await findApplicationById(state.applicationId);
    } else if (state.userId) {
      application = await findNextPendingApplication(state.userId);
    }

    if (!application) {
      await logJobEvent("initApplicationNode", "NO_PENDING", "No pending application found to process");
      return {
        status: "IDLE",
        errorInfo: { message: "No pending job application found" },
      };
    }

    await updateApplicationStatus(application._id.toString(), APPLICATION_STATUS.PROCESSING, {
      logMessage: "Initiating job application pipeline",
    });

    const jobDoc = application.jobId || {};

    return {
      applicationId: application._id.toString(),
      jobId: jobDoc._id ? jobDoc._id.toString() : state.jobId,
      userId: application.userId ? (application.userId._id || application.userId).toString() : state.userId,
      job: {
        id: jobDoc._id ? jobDoc._id.toString() : "",
        title: jobDoc.title || "Job Posting",
        companyName: jobDoc.companyName || "Company",
        location: jobDoc.location || "",
        description: jobDoc.description || "",
        applicationMethod: jobDoc.applicationMethod || application.applicationMethod || "email",
        sourceUrl: jobDoc.sourceUrl || "",
      },
      status: APPLICATION_STATUS.PROCESSING,
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
 * 2. Check Application Method Node
 */
const checkApplicationMethodNode = async (state) => {
  try {
    const rawMethod = state.job?.applicationMethod || "email";
    const textToAnalyze = `${rawMethod} ${state.job?.description || ""}`.toLowerCase();

    let method = APPLICATION_METHOD.EMAIL;
    if (/\b(?:phone|call|whatsapp)\b/i.test(textToAnalyze)) {
      method = APPLICATION_METHOD.PHONE;
    } else if (/google\.com\/forms|forms\.gle/i.test(textToAnalyze)) {
      method = APPLICATION_METHOD.GOOGLE_FORM;
    } else if (/\b(?:apply on website|portal|lever\.co|greenhouse\.io|workday)\b/i.test(textToAnalyze)) {
      method = APPLICATION_METHOD.WEBSITE_FORM;
    }

    if (method !== APPLICATION_METHOD.EMAIL) {
      await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.UNSUPPORTED_METHOD, {
        applicationMethod: method,
        logMessage: `Application method '${method}' is not supported in email-only pipeline`,
      });

      await logJobEvent(
        "checkApplicationMethodNode",
        "UNSUPPORTED",
        `Job requires unsupported method '${method}'. Application marked as unsupported_method`
      );

      return {
        applicationMethod: method,
        status: APPLICATION_STATUS.UNSUPPORTED_METHOD,
      };
    }

    await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.RESUME_GENERATING, {
      applicationMethod: APPLICATION_METHOD.EMAIL,
      logMessage: "Application method confirmed as EMAIL. Generating tailored resume...",
    });

    return {
      applicationMethod: APPLICATION_METHOD.EMAIL,
      status: APPLICATION_STATUS.RESUME_GENERATING,
    };
  } catch (error) {
    await logError("jobApplicationGraph.checkApplicationMethodNode", error.message);
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * 3. Get Candidate Base Resume Node
 */
const getUserResumeNode = async (state) => {
  try {
    const activeResume = await Resume.findOne({
      userId: state.userId,
    }).sort({ createdAt: -1 });

    if (!activeResume || !activeResume.parsedData) {
      throw new appError("No active parsed resume found for user. Please upload a resume first.", 404);
    }

    return {
      resume: activeResume.parsedData,
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
 * 4. Tailor Resume Node
 */
const tailorResumeNode = async (state) => {
  try {
    const model = getGeminiModel();
    const structuredLlm = model.withStructuredOutput(tailoredResumeSchema);

    const promptText = buildResumeTailoringPrompt({
      candidateResume: state.resume,
      jobDetails: state.job,
    });

    const result = await structuredLlm.invoke([
      { role: "system", content: RESUME_TAILORING_SYSTEM_PROMPT },
      { role: "user", content: promptText },
    ]);

    return {
      tailoredResume: result.tailoredResume,
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
 * 5. Generate Resume PDF Node
 */
const generatePdfNode = async (state) => {
  try {
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

    await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.EMAIL_GENERATING, {
      logMessage: "Tailored PDF generated successfully. Generating application email draft...",
    });

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

    await updateApplicationEmail(state.applicationId, {
      recipient: result.recipient,
      subject: result.subject,
      body: result.body,
      approved: false,
    });

    await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
      logMessage: "Application draft created. Paused at human review checkpoint.",
    });

    await logJobEvent(
      "generateEmailNode",
      "WAITING_FOR_REVIEW",
      `Application ${state.applicationId} is ready for human review.`
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
    await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.SENDING, {
      logMessage: "User approved application. Dispatching email...",
    });

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

    await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.SENT, {
      logMessage: `Email successfully sent. MessageId: ${sendResult.messageId}`,
    });

    await logJobEvent(
      "sendApprovedEmailNode",
      "SENT",
      `Application ${state.applicationId} sent successfully to ${state.email.recipient}`
    );

    return {
      status: APPLICATION_STATUS.SENT,
      sendResult,
    };
  } catch (error) {
    await updateApplicationStatus(state.applicationId, APPLICATION_STATUS.FAILED, {
      logMessage: `Email dispatch failed: ${error.message}`,
    });
    await logError("jobApplicationGraph.sendApprovedEmailNode", error.message);
    return {
      status: APPLICATION_STATUS.FAILED,
      errorInfo: { message: error.message },
    };
  }
};

/**
 * Conditional Edge Router: Check Application Method
 */
const routeAfterMethodCheck = (state) => {
  if (state.status === APPLICATION_STATUS.UNSUPPORTED_METHOD || state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  return "getUserResumeNode";
};

/**
 * Conditional Edge Router: Check Failures
 */
const routeCheckFailure = (state) => {
  if (state.status === APPLICATION_STATUS.FAILED) {
    return END;
  }
  return "next";
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
    applicationMethod: { value: (x, y) => y ?? x, default: () => "email" },
    tailoredResume: { value: (x, y) => y ?? x, default: () => null },
    resumeStrategy: { value: (x, y) => y ?? x, default: () => null },
    resumePdfPath: { value: (x, y) => y ?? x, default: () => "" },
    email: { value: (x, y) => y ?? x, default: () => null },
    status: { value: (x, y) => y ?? x, default: () => APPLICATION_STATUS.PENDING },
    rejectionReason: { value: (x, y) => y ?? x, default: () => null },
    errorInfo: { value: (x, y) => y ?? x, default: () => null },
  },
});

workflow.addNode("initApplicationNode", initApplicationNode);
workflow.addNode("checkApplicationMethodNode", checkApplicationMethodNode);
workflow.addNode("getUserResumeNode", getUserResumeNode);
workflow.addNode("tailorResumeNode", tailorResumeNode);
workflow.addNode("generatePdfNode", generatePdfNode);
workflow.addNode("generateEmailNode", generateEmailNode);

// Define edges
workflow.addEdge(START, "initApplicationNode");
workflow.addEdge("initApplicationNode", "checkApplicationMethodNode");

workflow.addConditionalEdges("checkApplicationMethodNode", routeAfterMethodCheck, {
  [END]: END,
  getUserResumeNode: "getUserResumeNode",
});

workflow.addEdge("getUserResumeNode", "tailorResumeNode");
workflow.addEdge("tailorResumeNode", "generatePdfNode");
workflow.addEdge("generatePdfNode", "generateEmailNode");
workflow.addEdge("generateEmailNode", END);

export const memorySaver = new MemorySaver();
export const jobApplicationGraph = workflow.compile({ checkpointer: memorySaver });

export default jobApplicationGraph;
