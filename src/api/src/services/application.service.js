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
import { APPLICATION_STATUS, RESUME_PAGE_COUNT, RESUME_TEMPLATES, resolveUserResumeSettings } from "../constant/application.constant.js";
import { generateResumePdf } from "../pdf/resumePdfService.js";
import { sendApplicationEmail } from "../integrations/email/emailService.js";
import { formatAndCleanEmailBody } from "../agent/prompt/applicationEmail.js";
import { getActiveResumeByUserId } from "../repositories/resume.repository.js";
import { logError, logJobEvent } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * Checks if an application's status is "Locked" (already applied or further in the funnel),
 * preventing any modifications to tailored content or moving back to earlier stages.
 */
const isApplicationLocked = (status) => {
  const lockedStatuses = [
    APPLICATION_STATUS.APPLIED,
    APPLICATION_STATUS.SENT,
    APPLICATION_STATUS.INTERVIEW,
    APPLICATION_STATUS.OFFER,
    APPLICATION_STATUS.REJECTED,
  ];
  return lockedStatuses.includes(status);
};

/**
 * Creates an application for a specific job and initiates the application graph
 * @param {string} userId
 * @param {string} jobId
 * @param {object} options
 * @returns {Promise<object>} Created application record
 */
export const createApplicationFromJob = async (userId, jobId, options = {}) => {
  try {
    const job = await Job.findById(jobId);
    if (!job) {
      throw new appError("Job posting not found", 404);
    }

    // If an application already exists in waiting_for_review and regeneration is not forced, return it
    if (!options.forceRegenerate) {
      const existing = await findApplicationByJobAndUser(userId, jobId);
      if (
        existing &&
        (existing.status === APPLICATION_STATUS.WAITING_FOR_REVIEW ||
          existing.status === APPLICATION_STATUS.APPLIED)
      ) {
        return existing;
      }
    }

    // Pass jobId + userId directly — the graph's initApplicationNode will create or load
    // the application record and execute resume tailoring + email drafting.
    try {
      await runAgent(
        "jobApplication",
        { jobId: jobId.toString(), userId },
        { userId },
      );
    } catch (error) {
      await logError("applicationService.createApplicationFromJob.agentRun", error.message);
      // We still proceed to fetch the application record as the graph might have partially
      // completed and stored error information in the document logs/status.
    }

    // Fetch the application record that was created or updated during the graph run.
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

    if (isApplicationLocked(application.status)) {
      throw new appError(
        `Cannot approve or send an application that is already in '${application.status}' status.`,
        400,
      );
    }

    if (application.status !== APPLICATION_STATUS.WAITING_FOR_REVIEW && application.status !== APPLICATION_STATUS.APPROVED) {
      throw new appError(
        `Cannot approve application in '${application.status}' status. Must be 'waiting_for_review' or 'approved'`,
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

    if (isApplicationLocked(application.status)) {
      throw new appError(
        `Application is already in a final or post-applied state ('${application.status}') and cannot be rejected.`,
        400,
      );
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

    if (isApplicationLocked(application.status)) {
      throw new appError(
        `Cannot edit cover letter for an application that is already in '${application.status}' status.`,
        400,
      );
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

    if (isApplicationLocked(application.status)) {
      throw new appError(
        `Cannot update resume for an application that is already in '${application.status}' status.`,
        400,
      );
    }

    const { targetPageLength, pageCount, tailoredResumeData, template, regenerate } = options;
    const pageLengthParam = targetPageLength || pageCount;
    
    // Resolve dynamic user constants from DB
    const userSettings = await resolveUserResumeSettings(userId);

    // If custom tailored resume JSON data is provided directly, re-render PDF & update database
    if (tailoredResumeData && !regenerate) {
      const pdfPath = await generateResumePdf({
        resumeData: tailoredResumeData,
        userId,
        template: template || userSettings.template,
        targetPages: pageLengthParam || userSettings.pageCount,
      });

      await updateApplicationResume(applicationId, {
        tailoredResumeData,
        pdfPath,
      });

      return await findApplicationById(applicationId);
    }

    // Otherwise, re-trigger AI application graph pipeline with target page count
    // Reset error state before starting
    await updateApplicationStatus(applicationId, APPLICATION_STATUS.PROCESSING, { error: null });

    await runAgent(
      "jobApplication",
      {
        applicationId,
        userId,
        targetPageLength: pageLengthParam || userSettings.pageCount,
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
 * Creates an application record directly (e.g. from Job Search apply button or direct save)
 * Does NOT run the heavy agent pipeline at save time.
 */
export const createDirectApplicationService = async (userId, appData) => {
  try {
    const { jobId, jobTitle, company, location, sourceUrl, status, applicationMethod, email } = appData;
    let targetJobId = jobId;

    if (!targetJobId) {
      let job = sourceUrl ? await Job.findOne({ sourceUrl }) : null;
      if (!job) {
        job = await Job.create({
          title: jobTitle || 'Position',
          company: company || 'Company',
          location: location || 'Remote',
          sourceUrl: sourceUrl || `https://example.com/${Date.now()}`,
          source: 'Job Search',
        });
      }
      targetJobId = job._id;
    }

    const application = await createApplication({
      userId,
      jobId: targetJobId,
      status: status || APPLICATION_STATUS.PENDING,
      applicationMethod,
      email,
    });

    return application;
  } catch (error) {
    await logError("applicationService.createDirectApplicationService", error.message);
    throw error;
  }
};

/**
 * Triggers the AI pipeline to read the job, tailor the resume, generate PDF,
 * and draft outreach email/form responses based on the job's application method,
 * updating the application status to waiting_for_review.
 */
export const tailorApplicationService = async (userId, applicationId) => {
  try {
    const app = await findApplicationById(applicationId);
    if (!app) {
      throw new appError("Application not found", 404);
    }
    const jobId = app.jobId?._id?.toString?.() || app.jobId?.toString?.() || app.jobId;
    if (!jobId) {
      throw new appError("No associated job found for this application to tailor for", 400);
    }

    if (isApplicationLocked(app.status)) {
      throw new appError(
        `Cannot re-tailor an application that is already in '${app.status}' status.`,
        400,
      );
    }

    // Run the jobApplication agent with forceRegenerate to re-tailor and draft
    // Reset error state before starting
    await updateApplicationStatus(applicationId, APPLICATION_STATUS.PENDING, { error: null });
    
    const tailored = await createApplicationFromJob(userId, jobId, { forceRegenerate: true });
    return tailored || (await findApplicationById(applicationId));
  } catch (error) {
    await logError("applicationService.tailorApplicationService", error.message);
    throw error;
  }
};

/**
 * Directly updates application status
 */
export const updateApplicationStatusDirectService = async (id, status) => {
  try {
    const app = await findApplicationById(id);
    if (!app) {
      throw new appError("Application not found", 404);
    }

    // Validate if the new status is valid
    const validStatuses = Object.values(APPLICATION_STATUS);
    if (!validStatuses.includes(status)) {
      throw new appError(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`, 400);
    }

    // If application is locked (Applied/Sent/etc), only allow moving forward to Interview, Offer, Rejected
    if (isApplicationLocked(app.status)) {
      const allowedPostAppliedTransitions = [
        APPLICATION_STATUS.INTERVIEW,
        APPLICATION_STATUS.OFFER,
        APPLICATION_STATUS.REJECTED,
        APPLICATION_STATUS.APPLIED, // Allow re-setting same status
        APPLICATION_STATUS.SENT,    // Allow re-setting same status
      ];

      if (!allowedPostAppliedTransitions.includes(status)) {
        throw new appError(
          `Application is already '${app.status}'. You can only transition to Interview, Offer, or Rejected.`,
          400,
        );
      }
    }

    // Additional rule: Once approved or applied, cannot move back to pending or waiting_for_review
    const currentStatusLockedOrApproved = isApplicationLocked(app.status) || app.status === APPLICATION_STATUS.APPROVED;
    const tryingToMoveBack = status === APPLICATION_STATUS.PENDING || status === APPLICATION_STATUS.WAITING_FOR_REVIEW;
    
    if (currentStatusLockedOrApproved && tryingToMoveBack) {
      throw new appError(
        `Cannot move application back to '${status}' once it has been ${app.status === APPLICATION_STATUS.APPROVED ? 'approved' : 'applied'}.`,
        400
      );
    }

    return await updateApplicationStatus(id, status, { logMessage: `Status manually updated to ${status}` });
  } catch (error) {
    await logError("applicationService.updateApplicationStatusDirectService", error.message);
    throw error;
  }
};

/**
 * Finds application by user and job ID
 */
export const getApplicationByJobAndUserService = async (userId, jobId) => {
  try {
    return await findApplicationByJobAndUser(userId, jobId);
  } catch (error) {
    await logError("applicationService.getApplicationByJobAndUserService", error.message);
    throw error;
  }
};

/**
 * Preview or generate draft email and application verification details before applying
 */
export const previewOrGenerateDraftService = async (userId, payload) => {
  try {
    const {
      jobId,
      jobTitle,
      company,
      description,
      requirements,
      skills,
      hrEmail,
      applicationMethod,
      forceRegenerate,
    } = payload || {};

    // 1. If jobId is provided, check existing application or run the application tailoring agent if explicitly requested
    if (jobId) {
      const existing = await findApplicationByJobAndUser(userId, jobId);
      if (existing && !forceRegenerate && !payload?.triggerTailor) {
        return {
          application: existing,
          email: existing.email || {},
          applicationMethod: existing.applicationMethod || applicationMethod || "email",
          isExisting: true,
          status: existing.status,
          candidateInfo: {
            fullName:
              existing.resume?.tailoredResumeData?.personalInfo?.fullName || "Candidate",
            email: existing.resume?.tailoredResumeData?.personalInfo?.email || "",
            phone: existing.resume?.tailoredResumeData?.personalInfo?.phone || "",
            skills: existing.resume?.tailoredResumeData?.skills || skills || [],
          },
        };
      }

      // If existing is locked, prevent regeneration
      if (existing && (forceRegenerate || payload?.triggerTailor) && isApplicationLocked(existing.status)) {
        throw new appError(`Cannot regenerate tailoring for an application that is already '${existing.status}'.`, 400);
      }

      // Only execute the job application agent pipeline if forceRegenerate or triggerTailor is explicitly requested
      if (forceRegenerate || payload?.triggerTailor) {
        try {
          const tailoredApp = await createApplicationFromJob(userId, jobId, { forceRegenerate: true });
          if (tailoredApp) {
            return {
              application: tailoredApp,
              email: tailoredApp.email || {},
              applicationMethod: tailoredApp.applicationMethod || applicationMethod || "email",
              isExisting: true,
              status: tailoredApp.status || APPLICATION_STATUS.WAITING_FOR_REVIEW,
              candidateInfo: {
                fullName:
                  tailoredApp.resume?.tailoredResumeData?.personalInfo?.fullName || "Candidate",
                email: tailoredApp.resume?.tailoredResumeData?.personalInfo?.email || "",
                phone: tailoredApp.resume?.tailoredResumeData?.personalInfo?.phone || "",
                skills: tailoredApp.resume?.tailoredResumeData?.skills || skills || [],
              },
            };
          }
        } catch (agentErr) {
          await logError(
            "applicationService.previewOrGenerateDraftService.agentRun",
            agentErr.message,
          );
        }
      }
    }

    // 2. Fallback candidate info from active resume or user
    const activeResume = await getActiveResumeByUserId(userId).catch(() => null);
    const parsedData = activeResume?.parsedData || {};
    const candidateName = parsedData.personalInfo?.fullName || "Candidate";
    const candidateEmail = parsedData.personalInfo?.email || "";
    const candidatePhone = parsedData.personalInfo?.phone || "";
    const candidateSkills = Array.isArray(parsedData.skills)
      ? parsedData.skills
      : skills || ["React", "Node.js", "TypeScript"];

    const targetTitle = jobTitle || "Software Engineer";
    const targetCompany = company || "Hiring Team";
    const recipient =
      hrEmail && hrEmail !== "unknown" && hrEmail !== "NOT_SPECIFIED"
        ? hrEmail
        : "";

    const defaultSubject = `Application for ${targetTitle} - ${candidateName}`;
    const defaultBody = formatAndCleanEmailBody(
      `Dear Hiring Team at ${targetCompany},

I am writing to express my strong enthusiasm for the ${targetTitle} opportunity. With my hands-on background and proven expertise in ${candidateSkills.slice(0, 4).join(", ") || "modern software engineering"}, I am confident in my ability to deliver immediate value to your development team.

Throughout my experience, I have developed and deployed robust, scalable applications, ensuring high reliability, clean architecture, and optimized performance. I am particularly excited about the work being done at ${targetCompany} and welcome the chance to contribute to your ongoing goals and technical milestones.

My resume is attached for your review. I look forward to the opportunity to discuss how my skill set aligns with your team's objectives in an interview. Thank you for your time and consideration.

Sincerely,

${candidateName}`,
      candidateName,
    );

    return {
      application: null,
      email: {
        recipient,
        subject: defaultSubject,
        body: defaultBody,
        approved: false,
      },
      candidateInfo: {
        fullName: candidateName,
        email: candidateEmail,
        phone: candidatePhone,
        skills: candidateSkills,
        resumeId: activeResume?._id || null,
      },
      applicationMethod: applicationMethod || "email",
      isExisting: false,
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
    };
  } catch (error) {
    await logError(
      "applicationService.previewOrGenerateDraftService",
      error.message,
    );
    throw error;
  }
};
