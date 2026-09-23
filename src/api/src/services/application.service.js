import { runAgent } from "../agent/agent.js";
import {
  createApplication,
  findApplicationById,
  findApplicationByJobAndUser,
  findNextPendingApplication,
  updateApplicationStatus,
  updateApplicationEmail,
  updateApplicationResume,
  getUserApplications as repositoryGetUserApplications,
} from "../repositories/application.repository.js";
import { Job } from "../model/Job.js";
import { APPLICATION_STATUS, RESUME_PAGE_COUNT, RESUME_PDF_TEMPLATES } from "../constant/application.constant.js";
import { generateResumePdf } from "../pdf/resumePdfService.js";
import { sendApplicationEmail } from "../integrations/email/emailService.js";
import { formatAndCleanEmailBody } from "../agent/prompt/applicationEmail.js";
import { logError, logJobEvent } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * Creates an application for a specific job and initiates the application graph
 * @param {string} userId
 * @param {string} jobId
 * @returns {Promise<object>} Created application record
 */
export const createApplicationFromJob = async (userId, jobId) => {
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      throw new appError("Job posting not found", 404);
    }

    // Pass jobId + userId directly — the graph's initApplicationNode will create the
    // application record. Passing a pre-created applicationId here would route every
    // fresh application through loadExistingApplicationNode, setting isRegeneration=true
    // and skipping resume tailoring + email generation entirely.
    await runAgent(
      "jobApplication",
      { jobId: jobId.toString(), userId },
      { userId },
    );

    // Fetch the application record that was created by the graph during this run.
    const updatedApp = await findApplicationByJobAndUser(userId, jobId);
    return updatedApp;
  } catch (error) {
    await logError(
      "applicationService.createApplicationFromJob",
      error.message,
    );
    throw error;
  }
};

/**
 * Automatically picks the next pending application and runs pipeline
 * @param {string} userId
 * @returns {Promise<object|null>} Processed application or null
 */
export const processNextPendingApplication = async (userId) => {
  try {
    const pendingApp = await findNextPendingApplication(userId);
    if (!pendingApp) {
      return null;
    }

    // Route based on whether this application has ever been processed before.
    // If tailoredResumeData exists, it is a genuine re-generation run (applicationId path).
    // If not, treat it as a brand-new run so the full pipeline (tailor + email) executes.
    const hasExistingTailoredResume = !!(pendingApp.resume?.tailoredResumeData);

    if (hasExistingTailoredResume) {
      // Re-generation: let loadExistingApplicationNode handle it.
      await runAgent(
        "jobApplication",
        { applicationId: pendingApp._id.toString(), userId },
        { userId },
      );
    } else {
      // First-time processing: pass jobId so initApplicationNode creates a fresh run.
      // The graph will reuse the existing application via createApplication's upsert logic.
      const jobId =
        pendingApp.jobId?._id?.toString?.() ||
        pendingApp.jobId?.toString?.() ||
        pendingApp.jobId;
      await runAgent(
        "jobApplication",
        { jobId: jobId.toString(), userId },
        { userId },
      );
    }

    return await findApplicationById(pendingApp._id.toString());
  } catch (error) {
    await logError(
      "applicationService.processNextPendingApplication",
      error.message,
    );
    throw error;
  }
};

/**
 * Human Approval Action: User approves application and triggers email dispatch
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const approveAndSendApplication = async (applicationId, userId) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Job application not found", 404);
    }

    if (
      application.userId._id.toString() !== userId &&
      application.userId.toString() !== userId
    ) {
      throw new appError("Unauthorized access to job application", 403);
    }

    if (application.status !== APPLICATION_STATUS.WAITING_FOR_REVIEW) {
      throw new appError(
        `Cannot approve application in '${application.status}' status. Must be 'waiting_for_review'`,
        400,
      );
    }

    const recipient = application.email?.recipient;
    const subject = application.email?.subject;
    const body = application.email?.body;
    const pdfPath = application.resume?.pdfPath;

    if (!recipient || recipient === "unknown") {
      throw new appError(
        "A valid recipient email address is required before sending",
        400,
      );
    }

    await updateApplicationStatus(applicationId, APPLICATION_STATUS.SENDING, {
      logMessage: "User approved email. Dispatching to recipient...",
    });

    const sendResult = await sendApplicationEmail({
      recipient,
      subject,
      body,
      pdfPath,
    });

    await updateApplicationEmail(applicationId, {
      recipient,
      subject,
      body,
      approved: true,
      approvedAt: new Date(),
      sentAt: new Date(),
    });

    await updateApplicationStatus(applicationId, APPLICATION_STATUS.SENT, {
      logMessage: `Email dispatched successfully. Message ID: ${sendResult.messageId}`,
    });

    await logJobEvent(
      "approveAndSendApplication",
      "SUCCESS",
      `Application ${applicationId} approved and sent to ${recipient}`,
    );

    return await findApplicationById(applicationId);
  } catch (error) {
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Email dispatch failed: ${error.message}`,
      }).catch(() => {});
    }
    await logError(
      "applicationService.approveAndSendApplication",
      error.message,
    );
    throw error;
  }
};

/**
 * Human Rejection Action: User rejects candidate application draft
 * @param {string} applicationId
 * @param {string} userId
 * @param {string} [reason]
 * @returns {Promise<object>}
 */
export const rejectApplication = async (
  applicationId,
  userId,
  reason = "User rejected draft",
) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Job application not found", 404);
    }

    if (
      application.userId._id.toString() !== userId &&
      application.userId.toString() !== userId
    ) {
      throw new appError("Unauthorized access to job application", 403);
    }

    const updated = await updateApplicationStatus(
      applicationId,
      APPLICATION_STATUS.REJECTED,
      {
        rejectionReason: reason,
        logMessage: `Application rejected by user: ${reason}`,
      },
    );

    return updated;
  } catch (error) {
    await logError("applicationService.rejectApplication", error.message);
    throw error;
  }
};

/**
 * Human Edit Action: User edits email draft before approval
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} emailData
 * @returns {Promise<object>}
 */
export const editApplicationEmail = async (
  applicationId,
  userId,
  emailData,
) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Job application not found", 404);
    }

    if (
      application.userId._id.toString() !== userId &&
      application.userId.toString() !== userId
    ) {
      throw new appError("Unauthorized access to job application", 403);
    }

    const rawBody = emailData.body || application.email.body;
    const cleanedBody = formatAndCleanEmailBody(rawBody);

    await updateApplicationEmail(applicationId, {
      recipient: emailData.recipient || application.email.recipient,
      subject: emailData.subject || application.email.subject,
      body: cleanedBody,
    });

    return await findApplicationById(applicationId);
  } catch (error) {
    await logError("applicationService.editApplicationEmail", error.message);
    throw error;
  }
};

/**
 * Fetches user applications list
 * @param {string} userId
 * @param {object} filter
 * @returns {Promise<object>}
 */
export const getUserApplications = async (userId, filter) => {
  return await repositoryGetUserApplications(userId, filter);
};

/**
 * Fetches single application by ID
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getApplicationById = async (applicationId, userId) => {
  const appDoc = await findApplicationById(applicationId);
  if (!appDoc) {
    throw new appError("Application not found", 404);
  }
  if (
    appDoc.userId._id.toString() !== userId &&
    appDoc.userId.toString() !== userId
  ) {
    throw new appError("Unauthorized access to job application", 403);
  }
  return appDoc;
};

/**
 * Updates or regenerates the tailored resume for a specific application ID
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} [options]
 * @param {string|number} [options.targetPageLength] - Target page count
 * @param {string|number} [options.pageCount] - Target page count alias
 * @param {object} [options.tailoredResumeData] - Direct updated resume JSON
 * @param {string} [options.template] - PDF template choice ("modern", "minimal", "ats")
 * @param {boolean} [options.regenerate] - Explicitly force AI regeneration
 * @returns {Promise<object>}
 */
export const updateApplicationResumeService = async (
  applicationId,
  userId,
  options = {}
) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Job application not found", 404);
    }

    if (
      application.userId._id.toString() !== userId &&
      application.userId.toString() !== userId
    ) {
      throw new appError("Unauthorized access to job application", 403);
    }

    if (application.status !== APPLICATION_STATUS.WAITING_FOR_REVIEW) {
      throw new appError(
        `Resume can only be updated for applications in '${APPLICATION_STATUS.WAITING_FOR_REVIEW}' status. Current status: '${application.status}'`,
        400
      );
    }

    const { targetPageLength, pageCount, tailoredResumeData, template, regenerate } = options;
    const pageLengthParam = targetPageLength || pageCount;

    // If custom tailored resume JSON data is provided directly, re-render PDF & update database
    if (tailoredResumeData && !regenerate) {
      const pdfPath = await generateResumePdf({
        resumeData: tailoredResumeData,
        userId,
        template: template || RESUME_PDF_TEMPLATES.MODERN,
        targetPages: pageLengthParam || RESUME_PAGE_COUNT,
      });

      await updateApplicationResume(applicationId, {
        tailoredResumeData,
        pdfPath,
      });

      return await findApplicationById(applicationId);
    }

    // Otherwise, re-trigger AI application graph pipeline with target page count
    await runAgent(
      "jobApplication",
      {
        applicationId,
        userId,
        targetPageLength: pageLengthParam || RESUME_PAGE_COUNT,
      },
      { userId }
    );

    return await findApplicationById(applicationId);
  } catch (error) {
    await logError("applicationService.updateApplicationResumeService", error.message);
    throw error;
  }
};

/**
 * Creates an application record directly (e.g. from Job Search apply button)
 */
export const createDirectApplicationService = async (userId, appData) => {
  try {
    const { jobTitle, company, location, sourceUrl, status } = appData;
    let job = await Job.findOne({ sourceUrl: sourceUrl || `https://example.com/${Date.now()}` });
    if (!job) {
      job = await Job.create({
        title: jobTitle || 'Position',
        company: company || 'Company',
        location: location || 'Remote',
        sourceUrl: sourceUrl || `https://example.com/${Date.now()}`,
        source: 'Job Search',
      });
    }

    const application = await createApplication({
      userId,
      jobId: job._id,
      status: status || 'Applied',
    });

    return application;
  } catch (error) {
    await logError("applicationService.createDirectApplicationService", error.message);
    throw error;
  }
};

/**
 * Directly updates application status
 */
export const updateApplicationStatusDirectService = async (id, status) => {
  try {
    return await updateApplicationStatus(id, status, { logMessage: `Status manually updated to ${status}` });
  } catch (error) {
    await logError("applicationService.updateApplicationStatusDirectService", error.message);
    throw error;
  }
};
