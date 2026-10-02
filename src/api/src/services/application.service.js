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
  deleteApplication,
} from "../repositories/application.repository.js";
import { Job } from "../model/Job.js";
import { JobApplication } from "../model/JobApplication.js";
import { APPLICATION_STATUS, RESUME_PAGE_COUNT, RESUME_TEMPLATES, resolveUserResumeSettings } from "../constant/application.constant.js";
import { generateResumePdf } from "../pdf/resumePdfService.js";
import { sendApplicationEmail } from "../integrations/email/emailService.js";
import { formatAndCleanEmailBody } from "../agent/prompt/applicationEmail.js";
import { getActiveResumeByUserId, findOriginalResumeByUserId } from "../repositories/resume.repository.js";
import { findUserProfileByUserId, findUserById } from "../repositories/user.repository.js";
import { getGeminiModel } from "../agent/config/modelConfig.js";
import { runNaukriApplication } from "../integrations/applicationPlatforms/naukri/naukriApplication.js";
import { runGoogleFormApplication } from "../application/methods/googleFormApplicationMethod.js";
import { runUnknownApplicationMethod } from "../application/methods/unknownApplicationMethod.js";
import { submitForm } from "../application/form/formSubmitter.js";
import { inspectForm } from "../application/form/formInspector.js";
import { fillFormFields } from "../application/form/formFiller.js";
import { verifyFilledFields } from "../application/form/formVerifier.js";
import { resolveAllFormAnswers } from "../application/answer/answerResolver.js";
import { extractPageContent } from "../application/pageAnalysis/pageContentExtractor.js";
import { classifyPageWithLlm } from "../application/pageAnalysis/pageClassifierLlm.js";
import { navigatePortalWithAiDecision } from "../application/pageAnalysis/pageNavigator.js";
import { BrowserManager } from "../browser/browserManager.js";
import { SessionRegistry } from "../browser/session/sessionRegistry.js";
import { findNaukriAccountByUserId } from "../repositories/naukriAccount.repository.js";
import { BrowserSessionRepository } from "../repositories/browserSession.repository.js";
import { decryptValue } from "../utils/encryption.js";
import { logError, logJobEvent } from "../utils/logger.js";
import { appError } from "../utils/errors.js";
import {
  injectGoogleSessionIntoContext,
  getDecryptedGoogleSession,
} from "./googleSession.service.js";

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
 * Checks if an application is associated with a Naukri job listing or platform
 */
const isNaukriApplication = (application) => {
  if (!application) return false;
  return Boolean(
    application.naukriDetails?.jobId ||
    application.job?.source === 'naukri' ||
    application.jobId?.source === 'naukri' ||
    application.applicationMethod === 'naukri' ||
    application.applicationMethod === 'naukri_direct' ||
    (typeof application.jobId?.applicationUrl === 'string' && application.jobId.applicationUrl.includes('naukri.com')) ||
    (typeof application.jobId?.sourceUrl === 'string' && application.jobId.sourceUrl.includes('naukri.com')) ||
    (typeof application.workflow?.agentState?.pendingHumanAction?.savedUrl === 'string' && application.workflow.agentState.pendingHumanAction.savedUrl.includes('naukri.com'))
  );
};

/**
 * Safely verifies if an application belongs to the requesting user
 */
const isUserAuthorized = (docUserId, reqUserId) => {
  if (!docUserId || !reqUserId) return false;
  const docIdStr = (docUserId._id || docUserId).toString();
  const reqIdStr = (reqUserId._id || reqUserId).toString();
  return docIdStr === reqIdStr;
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

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to job application", 403);
    }

    const terminalStatuses = [
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.OFFER,
      APPLICATION_STATUS.REJECTED,
      'Interview',
      'Offer',
      'Rejected',
    ];

    if (terminalStatuses.includes(application.status)) {
      throw new appError(
        `Cannot approve or re-submit an application in '${application.status}' status.`,
        400,
      );
    }

    // Check if application is for a Google Form
    const isGoogleForm =
      application.applicationMethod === 'googleForm' ||
      application.jobId?.applicationUrl?.includes('docs.google.com/forms') ||
      application.jobId?.applicationUrl?.includes('forms.gle');

    if (isGoogleForm) {
      await logJobEvent(
        'approveAndSendApplication',
        'GOOGLE_FORM_APPROVE',
        `User approved Google Form application ${applicationId}. Initiating Google Form engine...`
      );

      const gfUrl = application.jobId?.applicationUrl || application.sourceUrl;
      const gfResult = await runGoogleFormApplication({
        applicationId,
        jobId: application.jobId?._id || application.jobId,
        userId,
        googleFormUrl: gfUrl,
      });

      if (!gfResult.submitted) {
        if (gfResult.loginRequired) {
          throw new appError(
            'Google Sign-In is required to submit this Google Form. Please connect your Google session in the modal or sign in, then retry.',
            401
          );
        }
        throw new appError(
          gfResult.message || 'Google Form could not be submitted. Please check the form link.',
          400
        );
      }

      return await findApplicationById(applicationId);
    }

    // Check if application is for a Naukri job
    const isNaukriJob = isNaukriApplication(application);

    if (isNaukriJob) {
      await logJobEvent(
        'approveAndSendApplication',
        'NAUKRI_APPROVE',
        `User approved Naukri application ${applicationId}. Initiating browser application engine...`
      );

      // Execute browser-based application engine for Naukri with confirmSubmission = true
      const naukriResult = await runNaukriApplication({
        applicationId,
        userId,
        confirmSubmission: true,
      });

      const updatedApp = await findApplicationById(applicationId);
      return updatedApp || naukriResult;
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
      const currentApp = await findApplicationById(applicationId).catch(() => null);
      if (
        currentApp?.status !== APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED &&
        currentApp?.status !== APPLICATION_STATUS.HUMAN_REQUIRED &&
        currentApp?.status !== APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW
      ) {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
          logMessage: `Application dispatch failed: ${error.message}`,
        }).catch(() => {});
      }
    }
    await logError(
      "applicationService.approveAndSendApplication",
      error.message,
    );
    throw error;
  }
};

/**
 * Checkpoint 1: Receives user answers for missing questionnaire questions and resumes application
/**
 * Checkpoint 1: Receives candidate answers for missing questionnaire questions and resumes application
 * Supports both Naukri and generic UNKNOWN career portal applications.
 * @param {string} applicationId
 * @param {string} userId
 * @param {Array<object>} answers - Array of { questionId, answer }
 * @returns {Promise<object>}
 */
export const submitMissingAnswersService = async (applicationId, userId, answers = []) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to application", 403);
    }

    await logJobEvent(
      'submitMissingAnswersService',
      'RECEIVED',
      `Received ${answers.length} user answers for application ${applicationId}`
    );

    // 1. If LangGraph workflow is actively paused waiting for user answers, resume it
    try {
      const { browserAgentGraph } = await import('../agent/graph/browserAgentGraph.js');
      const threadConfig = {
        configurable: {
          thread_id: `app_thread_${applicationId}`,
          checkpoint_ns: "browser_agent",
        },
      };
      const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);
      if (stateSnapshot && stateSnapshot.next && stateSnapshot.next.length > 0) {
        const { submitWorkflowAnswers } = await import('./agentRunner.service.js');
        await submitWorkflowAnswers(applicationId, userId, answers);
        return await findApplicationById(applicationId);
      }
    } catch {
      // Fall through to standard runner
    }

    const isNaukri = isNaukriApplication(application);
    if (isNaukri) {
      try {
        await runNaukriApplication({
          applicationId,
          userId,
          userAnswers: answers,
        });
      } catch (naukriErr) {
        await logError('applicationService.submitMissingAnswersService.naukriRun', naukriErr.message);
        // Persist answers even if browser/page closes
        if (Array.isArray(answers) && answers.length > 0) {
          await JobApplication.findByIdAndUpdate(applicationId, {
            $set: {
              "form.answers": answers,
            },
          });
        }
      }
      return await findApplicationById(applicationId);
    }

    // Generic UNKNOWN career portal application flow
    try {
      return await resumeUnknownApplicationWithAnswersService(applicationId, userId, answers);
    } catch (unknownErr) {
      await logError('applicationService.submitMissingAnswersService.unknownRun', unknownErr.message);
      if (Array.isArray(answers) && answers.length > 0) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          $set: {
            "form.answers": answers,
          },
        });
      }
      return await findApplicationById(applicationId);
    }
  } catch (error) {
    await logError('applicationService.submitMissingAnswersService', error.message);
    throw error;
  }
};

/**
 * Resumes the generic UNKNOWN browser agent loop after candidate supplies missing answers
 * (e.g. passwords, verification codes, additional questionnaire answers).
 */
export const resumeUnknownApplicationWithAnswersService = async (applicationId, userId, answers = []) => {
  const application = await JobApplication.findById(applicationId).populate('jobId');
  if (!application) {
    throw new appError("Application not found", 404);
  }

  // 1. Merge submitted answers into form.answers
  const currentAnswers = application.form?.answers || [];
  const existingMap = new Map();
  currentAnswers.forEach((a) => existingMap.set(a.questionId, a));

  answers.forEach((ans) => {
    existingMap.set(ans.questionId, {
      questionId: ans.questionId,
      answer: ans.answer,
      source: 'user',
      confidence: 1.0,
      userConfirmed: true,
    });
  });

  const mergedAnswers = Array.from(existingMap.values());

  // 2. Filter out answered questions from missingQuestions
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const remainingMissing = (application.form?.missingQuestions || []).filter(
    (q) => !answeredIds.has(q.questionId)
  );

  await JobApplication.findByIdAndUpdate(applicationId, {
    'form.answers': mergedAnswers,
    'form.missingQuestions': remainingMissing,
    status: APPLICATION_STATUS.AI_RUNNING,
  });

  const savedUrl =
    application.workflow?.agentState?.pendingHumanAction?.savedUrl ||
    application.jobId?.applicationUrl ||
    application.jobId?.sourceUrl;

  const savedStorageState =
    (await BrowserSessionRepository.loadStorageState(applicationId)) ||
    BrowserSessionRepository.decryptStorageState(application.workflow?.agentState?.pendingHumanAction?.savedStorageState) ||
    null;

  const candidateResume =
    application.resume?.tailoredResumeData ||
    (await getActiveResumeByUserId(userId));

  await logJobEvent(
    'resumeUnknownApplicationWithAnswersService',
    'RESUMING',
    `Resuming generic agent for app ${applicationId} at ${savedUrl}`
  );

  // Resume the UNKNOWN browser agent loop
  await runUnknownApplicationMethod({
    applicationId,
    pageUrl: savedUrl,
    candidateInfo: candidateResume,
    jobDetails: application.jobId,
    userId,
    resumePdfPath: application.resume?.pdfPath || null,
    sessionState: savedStorageState,
  });

  return await findApplicationById(applicationId);
};

/**
 * Checkpoint 2: Receives final user confirmation and triggers final submission
 * Supports both Naukri and generic UNKNOWN career portal applications.
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} payload
 * @param {Array<object>} [payload.confirmedAnswers] - Any edited answers during review
 * @returns {Promise<object>}
 */
export const confirmFinalApplicationService = async (applicationId, userId, payload = {}) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to application", 403);
    }

    await logJobEvent(
      'confirmFinalApplicationService',
      'CONFIRMED',
      `User confirmed final application ${applicationId}. Submitting...`
    );

    // 0. If LangGraph workflow is actively paused at reviewGateNode, confirm and resume it
    try {
      const { browserAgentGraph } = await import('../agent/graph/browserAgentGraph.js');
      const threadConfig = {
        configurable: {
          thread_id: `app_thread_${applicationId}`,
          checkpoint_ns: "browser_agent",
        },
      };
      const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);
      if (stateSnapshot && stateSnapshot.next && stateSnapshot.next.length > 0) {
        const { submitWorkflowReviewConfirmation } = await import('./agentRunner.service.js');
        await submitWorkflowReviewConfirmation(applicationId, userId, payload.reviewHash || '', payload.confirmedAnswers || []);
        return await findApplicationById(applicationId);
      }
    } catch {
      // Fall through to standard runner
    }

    // 1. Direct Email Application (e.g. InnoWise or employer specifies email / mailto)
    if (
      application.applicationMethod === 'email' ||
      (application.email?.recipient && (!application.form?.fields || application.form.fields.length === 0))
    ) {
      await logJobEvent(
        'confirmFinalApplicationService',
        'SEND_EMAIL_APPLICATION',
        `Dispatching direct application email to ${application.email.recipient}...`
      );
      return await sendDirectRoleEmailService(applicationId, userId, {
        recipient: payload.emailRecipient || application.email.recipient,
        subject: payload.emailSubject || application.email.subject,
        body: payload.emailBody || application.email.body,
        pdfPath: application.resume?.pdfPath,
        roleTitle: application.jobId?.title,
      });
    }

    if (
      application.applicationMethod === 'unknown' ||
      application.applicationMethod === 'google_form' ||
      application.applicationMethod === 'custom_form' ||
      application.applicationMethod === 'career_portal'
    ) {
      const { confirmFinalUnknownApplicationService } = await import('../application/unknown/confirmHandler.js');
      return await confirmFinalUnknownApplicationService(applicationId, userId, payload);
    }

    const hasExternalPortal = Boolean(
      application.workflow?.agentState?.pendingHumanAction?.savedUrl &&
      !application.workflow?.agentState?.pendingHumanAction?.savedUrl.includes('naukri.com')
    );

    if (hasExternalPortal) {
      return await submitFinalUnknownApplicationService(applicationId, userId, payload);
    }

    const isNaukri = isNaukriApplication(application);
    if (isNaukri) {
      await runNaukriApplication({
        applicationId,
        userId,
        confirmSubmission: true,
        finalEditedAnswers: payload.confirmedAnswers || [],
      });
      return await findApplicationById(applicationId);
    }

    // Generic UNKNOWN career portal final submission flow
    return await submitFinalUnknownApplicationService(applicationId, userId, payload);
  } catch (error) {
    await logError('applicationService.confirmFinalApplicationService', error.message);
    throw error;
  }
};

/**
 * Checkpoint 2 for generic UNKNOWN applications:
 * Clicks Next to progress multi-step forms (looping back to inspectForm for the next step),
 * or clicks the final submit button on the review page, verifies submission, and marks APPLIED.
 */
export const submitFinalUnknownApplicationService = async (applicationId, userId, payload = {}) => {
  const application = await getApplicationById(applicationId, userId);
  if (!application) {
    throw new appError("Application not found", 404);
  }
  if (application.populate) {
    await application.populate('jobId');
  }

  // 1. Update review fields if candidate edited any answers
  if (Array.isArray(payload.confirmedAnswers) && payload.confirmedAnswers.length > 0) {
    const reviewFields = application.form?.reviewFields || [];
    payload.confirmedAnswers.forEach((ans) => {
      const match = reviewFields.find((f) => f.questionId === ans.questionId);
      if (match) {
        match.answer = ans.answer;
        match.source = 'user';
      }
    });

    await JobApplication.findByIdAndUpdate(applicationId, {
      'form.reviewFields': reviewFields,
    });
  }

  await updateApplicationStatus(applicationId, APPLICATION_STATUS.SUBMITTING, {
    logMessage: "Processing application in browser after candidate confirmation...",
  });

  const savedUrl =
    application.workflow?.agentState?.pendingHumanAction?.savedUrl ||
    application.jobId?.applicationUrl ||
    application.jobId?.sourceUrl;

  const savedStorageState =
    (await BrowserSessionRepository.loadStorageState(applicationId)) ||
    BrowserSessionRepository.decryptStorageState(application.workflow?.agentState?.pendingHumanAction?.savedStorageState) ||
    null;

  let browser = null;
  let context = null;
  let page = null;

  try {
    const session = await SessionRegistry.createOrGetSession(applicationId, userId, {
      storageState: savedStorageState,
    });
    browser = session.browser;
    context = session.context;
    page = session.getActivePage();

    await page.goto(savedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForSelector('input, textarea, select, button, [data-automation-id]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 1. Inspect form fields (and reveal form if on a job page with "Apply Now" button)
    let currentInspection = await inspectForm(page);
    if (!currentInspection.fields || currentInspection.fields.length === 0) {
      const applyTrigger = page.locator('button:has-text("Apply Now"), a:has-text("Apply Now"), button:has-text("Apply"), a:has-text("Apply"), [data-automation-id*="apply" i], .apply-btn, .btn-apply, a[href*="apply"]').first();
      if (await applyTrigger.isVisible({ timeout: 2500 }).catch(() => false)) {
        await logJobEvent('submitFinalUnknownApplication', 'TRIGGER_APPLY_BUTTON', 'Clicking Apply button to reveal application form...');
        await applyTrigger.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(1500);
        currentInspection = await inspectForm(page);
      }
    }

    const currentFields =
      currentInspection.fields && currentInspection.fields.length > 0
        ? currentInspection.fields
        : application.form?.fields || [];

    // Collect all available answer sources
    const allAnswers = [
      ...(Array.isArray(payload.confirmedAnswers) ? payload.confirmedAnswers : []),
      ...(Array.isArray(application.form?.reviewFields) ? application.form.reviewFields : []),
      ...(Array.isArray(application.form?.answers) ? application.form.answers : []),
    ];

    const userProfile = await findUserProfileByUserId(userId).catch(() => null);
    const user = await findUserById(userId).catch(() => null);
    const resumeData = await findOriginalResumeByUserId(userId).catch(() => null);
    const activeResume = await getActiveResumeByUserId(userId).catch(() => null);

    // Ensure valid PDF path exists
    let effectivePdfPath = application.resume?.pdfPath || activeResume?.pdfPath || null;
    if (!effectivePdfPath && (activeResume || resumeData)) {
      try {
        const tailoredOrActive = application.resume?.tailoredResumeData || activeResume?.parsedData || resumeData?.parsedData || resumeData;
        effectivePdfPath = await generateResumePdf({
          resumeData: tailoredOrActive,
          targetPages: RESUME_PAGE_COUNT.SINGLE_PAGE,
          template: RESUME_TEMPLATES.MODERN,
          userId,
        });
        if (effectivePdfPath) {
          await updateApplicationResume(applicationId, { pdfPath: effectivePdfPath });
        }
      } catch (pdfErr) {
        await logError('submitFinalUnknownApplicationService.pdfGen', pdfErr.message);
      }
    }

    const combinedResume = application.resume?.tailoredResumeData || activeResume?.parsedData || resumeData?.parsedData || resumeData || {};

    if (currentFields.length > 0) {
      await fillFormFields(page, currentFields, allAnswers, {
        resumePdfPath: effectivePdfPath,
        userProfile,
        user,
        resumeData: combinedResume,
        candidateInfo: combinedResume,
        job: application.jobId || {},
      });
      await verifyFilledFields(page, allAnswers, currentFields);
    }

    // 2. inspectForm() to check current step buttons & state
    const formInspection = await inspectForm(page);
    const buttons = formInspection.buttons || [];
    let nextBtn = buttons.find((b) => b.type === 'create_account' || b.type === 'next');
    let submitBtn = buttons.find((b) => b.type === 'submit');

    // Fallback locator search for Workday / ATS Create Account / Continue / Submit buttons if not found in snapshot
    if (!nextBtn && !submitBtn) {
      const createAccountLocator = page.locator('button:has-text("Create Account"), [data-automation-id="createAccountSubmitButton"], button:has-text("Sign In"), button:has-text("Next"), button:has-text("Continue"), [data-automation-id="bottom-navigation-next-button"]').first();
      const hasCreateBtn = await createAccountLocator.isVisible({ timeout: 2500 }).catch(() => false);
      if (hasCreateBtn) {
        nextBtn = { type: 'create_account', text: 'Create Account', selector: 'button:has-text("Create Account"), [data-automation-id="createAccountSubmitButton"]' };
      } else {
        const submitLocator = page.locator('button:has-text("Submit"), [data-automation-id="bottom-navigation-submit-button"], button:has-text("Apply")').first();
        const hasSubmit = await submitLocator.isVisible({ timeout: 2500 }).catch(() => false);
        if (hasSubmit) {
          submitBtn = { type: 'submit', text: 'Submit', selector: 'button:has-text("Submit"), [data-automation-id="bottom-navigation-submit-button"]' };
        }
      }
    }

    const currentStepNum = formInspection.stepperState?.currentStep || application.form?.currentStep || 1;
    const totalStepsNum = formInspection.stepperState?.totalSteps || application.form?.totalSteps || 1;
    const isMultiStepNonFinal = Boolean(
      formInspection.isAccountCreation ||
      nextBtn ||
      (formInspection.stepperState?.hasStepper && currentStepNum < totalStepsNum) ||
      (!application.form?.isFinalStep && totalStepsNum > 1 && currentStepNum < totalStepsNum)
    );

    // If this is an intermediate step (e.g. Step 1 of 7, Create Account, Next Step), advance the stepper to the next step
    if (isMultiStepNonFinal && nextBtn) {
      // Branch B: Multi-step form -> Ensure synthetic input/change/blur events are dispatched
      await page.evaluate(() => {
        document.querySelectorAll('input, textarea, select').forEach((el) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });

        const termsCheckbox = document.querySelector('#input-9, input[type="checkbox"], [data-automation-id="legalNoticeCheckbox"] input');
        if (termsCheckbox && !termsCheckbox.checked) {
          termsCheckbox.checked = true;
          termsCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
          termsCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }).catch(() => {});
      await page.waitForTimeout(500);

      // Click Next / Create Account button via Playwright & DOM dispatch
      await logJobEvent('submitFinalUnknownApplication', 'CLICK_NEXT', `Advancing stepper (Step ${currentStepNum} of ${totalStepsNum}): clicking "${nextBtn.text}"`);
      const nextLocator = page.locator('[data-automation-id="createAccountSubmitButton"], [data-automation-id="bottom-navigation-next-button"], ' + (nextBtn.selector || `button:has-text("${nextBtn.text}")`)).first();
      await nextLocator.scrollIntoViewIfNeeded().catch(() => {});
      await nextLocator.click({ timeout: 5000 }).catch(async () => {
        await nextLocator.click({ force: true, timeout: 3000 });
      });

      await page.evaluate(() => {
        const btn = document.querySelector('[data-automation-id="createAccountSubmitButton"]') ||
          document.querySelector('[data-automation-id="bottom-navigation-next-button"]') ||
          Array.from(document.querySelectorAll('button')).find((b) => /create account|sign up|next|continue/i.test(b.textContent || ''));
        if (btn) {
          btn.click();
        }
      }).catch(() => {});

      // Wait for account creation request / stepper advancement to process
      await page.waitForTimeout(2000);
      await Promise.race([
        page.waitForSelector('#input-4, #input-5, input[type="password"]', { state: 'detached', timeout: 14000 }).catch(() => null),
        page.waitForSelector('[data-automation-id="page-header"], [data-automation-id="legalNameSection"], [data-automation-id="contactInformation"], [data-automation-id="resumeSection"], input:not([type="password"])', { timeout: 14000 }).catch(() => null),
        page.waitForLoadState('networkidle', { timeout: 14000 }).catch(() => null),
      ]);
      await page.waitForTimeout(3000);

      // Check if page showed "Account already exists" or "Sign In"
      const currentText = (await page.evaluate(() => document.body.innerText || '')).toLowerCase();
      if (/account.*already exists|already have an account|sign in instead|already registered/i.test(currentText)) {
        await logJobEvent('submitFinalUnknownApplication', 'SIGN_IN_FALLBACK', 'Account already exists. Switching to Sign In...');
        const signInBtn = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), [data-automation-id="signInLink"], [data-automation-id="signInTab"], [data-automation-id="signInSubmitButton"]').first();
        const hasSignIn = await signInBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasSignIn) {
          await signInBtn.click().catch(() => {});
          await page.waitForTimeout(2500);

          const emailInput = page.locator('#input-1, [data-automation-id="email"], input[type="email"]').first();
          const passInput = page.locator('#input-2, [data-automation-id="password"], input[type="password"]').first();
          if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            const candEmail = payload.confirmedAnswers?.find((a) => /email/i.test(a.questionId || ''))?.answer || 'gadekaran24@gmail.com';
            const candPass = payload.confirmedAnswers?.find((a) => /pass/i.test(a.questionId || ''))?.answer || 'Applicant@Velsera2026!';
            await emailInput.fill(candEmail);
            await passInput.fill(candPass);
            const submitSignIn = page.locator('[data-automation-id="signInSubmitButton"], button:has-text("Sign In")').first();
            await submitSignIn.click().catch(() => {});
            await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(3000);
          }
        }
      }

      // STEP 1: inspectForm() ONCE on new step -> get ALL fields
      const nextStepInspection = await inspectForm(page);
      const nextStepFields = nextStepInspection.fields || [];

      if (nextStepFields.length > 0) {
        // STEP 2: Resolve answers: deterministic profile/resume + ONE batch LLM call for subjective questions
        const candidateResume = application.resume?.tailoredResumeData || (await getActiveResumeByUserId(userId));
        const userProfile = await findUserProfileByUserId(userId);

        const { resolvedAnswers, missingQuestions } = await resolveAllFormAnswers(nextStepFields, {
          userAnswers: application.form?.answers || [],
          userProfile: userProfile || {},
          user: { username: userProfile?.fullName, email: userProfile?.email },
          resumeData: candidateResume || {},
          job: application.jobId,
          applicationId,
        });

        // STEP 3: If any unresolved required fields, pause and send to user
        if (missingQuestions.length > 0) {
          const newStorageState = await BrowserManager.captureStorageState(context).catch(() => null);
          const detectedCurStep = nextStepInspection.stepperState?.currentStep || currentStepNum + 1;
          const detectedTotSteps = nextStepInspection.stepperState?.totalSteps || totalStepsNum;
          await JobApplication.findByIdAndUpdate(applicationId, {
            'form.fields': nextStepFields,
            'form.answers': resolvedAnswers,
            'form.missingQuestions': missingQuestions,
            'form.currentStep': detectedCurStep,
            'form.totalSteps': detectedTotSteps,
            status: APPLICATION_STATUS.WAITING_FOR_USER,
            'workflow.agentState.pendingHumanAction': {
              reason: 'Unresolved questions require candidate input',
              savedUrl: page.url(),
              savedStorageState: BrowserSessionRepository.encryptStorageState(newStorageState || savedStorageState),
            },
          });

          await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_USER, {
            logMessage: `${missingQuestions.length} questions on Step ${detectedCurStep} of ${detectedTotSteps} require your input.`,
          });

          return await findApplicationById(applicationId);
        }

        // STEP 4: Batch fill ALL fields via Playwright
        await fillFormFields(page, nextStepFields, resolvedAnswers, {
          resumePdfPath: application.resume?.pdfPath,
        });

        // STEP 5: Verify ALL fields filled via DOM check (NO LLM)
        const verification = await verifyFilledFields(page, resolvedAnswers);
        if (!verification.allFilled && verification.emptyFields?.length > 0) {
          // Retry empty fields once
          const retryAnswers = resolvedAnswers.filter((a) =>
            verification.emptyFields.some((e) => e.fieldId === a.fieldId || e.questionId === a.questionId)
          );
          if (retryAnswers.length > 0) {
            await fillFormFields(page, nextStepFields, retryAnswers, {
              resumePdfPath: application.resume?.pdfPath,
            });
            await verifyFilledFields(page, retryAnswers);
          }
        }

        // STEP 6: Send all filled questions to user in frontend to verify filled info is correct or need to edit
        const nextReviewFields = nextStepFields.map((f) => {
          const match = resolvedAnswers.find((a) => a.questionId === f.questionId || a.fieldId === f.fieldId);
          return {
            questionId: f.questionId,
            fieldId: f.fieldId,
            question: f.question,
            type: f.type,
            answer: match ? match.answer : '',
            source: match ? match.source : 'profile',
            options: f.options || [],
            required: Boolean(f.required),
          };
        });

        const nextButtons = nextStepInspection.buttons || [];
        const detectedCurStep = nextStepInspection.stepperState?.currentStep || currentStepNum + 1;
        const detectedTotSteps = nextStepInspection.stepperState?.totalSteps || totalStepsNum;
        const isNextStepFinal =
          (!nextButtons.some((b) => b.type === 'next' || b.type === 'create_account') &&
            Boolean(nextButtons.some((b) => b.type === 'submit'))) ||
          (detectedCurStep >= detectedTotSteps);

        const newStorageState = await BrowserManager.captureStorageState(context).catch(() => null);

        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.fields': nextStepFields,
          'form.answers': resolvedAnswers,
          'form.reviewFields': nextReviewFields,
          'form.missingQuestions': [],
          'form.currentStep': detectedCurStep,
          'form.totalSteps': detectedTotSteps,
          'form.isFinalStep': isNextStepFinal,
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
          'workflow.agentState.pendingHumanAction': {
            reason: 'Review filled step before continuing',
            savedUrl: page.url(),
            savedStorageState: BrowserSessionRepository.encryptStorageState(newStorageState || savedStorageState),
          },
        });

        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW, {
          logMessage: `Step ${detectedCurStep} of ${detectedTotSteps} filled and verified. Awaiting candidate confirmation before advancing.`,
        });

        return await findApplicationById(applicationId);
      }
    }

    // Only attempt FINAL submission when actually on the final step
    await logJobEvent('submitFinalUnknownApplication', 'FINAL_SUBMIT', `Candidate confirmed final application step. Executing submitForm on portal...`);
    let submitResult = await submitForm(page);

    if (!submitResult.submitted) {
      // Fallback DOM submission click
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, div[role="button"]')).find((b) =>
          /submit|apply|send|confirm|finish/i.test(b.textContent || b.value || '')
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (clicked) {
        await page.waitForTimeout(3000);
        submitResult = { submitted: true, successDetected: true, errorMessage: null };
      }
    }

    if (submitResult.submitted && (submitResult.successDetected || !submitResult.errorMessage)) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
        logMessage: "Application confirmed and successfully submitted to employer portal!",
      });

      await JobApplication.findByIdAndUpdate(applicationId, {
        'form.submittedAt': new Date(),
        status: APPLICATION_STATUS.APPLIED,
        'workflow.agentState.pendingHumanAction': null,
      });

      await logJobEvent(
        'submitFinalUnknownApplicationService',
        'APPLIED',
        `Application ${applicationId} submitted successfully.`
      );

      return await findApplicationById(applicationId);
    } else {
      const isApplied = await page.evaluate(() => {
        const text = (document.body.innerText || '').toLowerCase();
        return /thank you for applying|application received|successfully submitted|application submitted/i.test(text);
      }).catch(() => false);

      if (isApplied) {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
          logMessage: "Application confirmed and successfully submitted to employer portal!",
        });
        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.submittedAt': new Date(),
          status: APPLICATION_STATUS.APPLIED,
        });
      } else {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW, {
          logMessage: submitResult.errorMessage || "Application form processed. Please review current step on employer portal.",
        });
      }
    }
  } catch (err) {
    await logError('submitFinalUnknownApplicationService', err.message);
    await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW, {
      logMessage: `Error processing application: ${err.message}`,
    });
  } finally {
    const freshApp = await JobApplication.findById(applicationId).lean().catch(() => null);
    const keepOpen = freshApp && [
      "WAITING_FOR_USER",
      "WAITING_FOR_CONFIRMATION",
      "WAITING_FOR_FINAL_REVIEW",
      "SUBMITTING"
    ].includes(freshApp.status);

    if (!keepOpen) {
      await SessionRegistry.closeSession(applicationId).catch(() => {});
    } else {
      SessionRegistry.startHumanResponseTimer(applicationId, userId);
    }
  }

  return await findApplicationById(applicationId);
};

/**
 * Saves edited answers during review without submitting yet
 * @param {string} applicationId
 * @param {string} userId
 * @param {Array<object>} answers
 * @returns {Promise<object>}
 */
export const saveEditedAnswersService = async (applicationId, userId, answers = []) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to application", 403);
    }

    const currentReviewFields = application.form?.reviewFields || [];
    answers.forEach((ans) => {
      const match = currentReviewFields.find((f) => f.questionId === ans.questionId);
      if (match) {
        match.answer = ans.answer;
        match.source = 'user';
      }
    });

    await JobApplication.findByIdAndUpdate(applicationId, {
      'form.reviewFields': currentReviewFields,
    });

    return await findApplicationById(applicationId);
  } catch (error) {
    await logError('applicationService.saveEditedAnswersService', error.message);
    throw error;
  }
};

/**
 * Refills unknown application form in live browser with user's updated answers and re-verifies via DOM check
 */
export const refillUnknownApplicationFormService = async (applicationId, userId, answers = []) => {
  const application = await getApplicationById(applicationId, userId);
  if (!application) throw new appError("Application not found", 404);
  if (application.populate) {
    await application.populate('jobId');
  }

  const savedUrl =
    application.workflow?.agentState?.pendingHumanAction?.savedUrl ||
    application.jobId?.applicationUrl ||
    application.jobId?.sourceUrl;

  const savedStorageState =
    (await BrowserSessionRepository.loadStorageState(applicationId)) ||
    BrowserSessionRepository.decryptStorageState(application.workflow?.agentState?.pendingHumanAction?.savedStorageState) ||
    null;

  let browser = null;
  let context = null;
  let page = null;

  try {
    const session = await SessionRegistry.createOrGetSession(applicationId, userId, {
      storageState: savedStorageState,
    });
    browser = session.browser;
    context = session.context;
    page = session.getActivePage();

    await page.goto(savedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // 1. inspectForm() ONCE to get ALL fields
    const formInspection = await inspectForm(page);
    const formFields = formInspection.fields || [];

    // 2. Format answers map
    const formattedAnswers = answers.map((a) => ({
      questionId: a.questionId,
      fieldId: a.fieldId || a.questionId,
      answer: a.answer,
      source: 'user',
    }));

    // 3. Batch fill ALL fields via Playwright
    await fillFormFields(page, formFields, formattedAnswers, {
      resumePdfPath: application.resume?.pdfPath,
    });

    // 4. Verify ALL fields filled (DOM check, NO LLM)
    const verification = await verifyFilledFields(page, formattedAnswers);

    // 5. Update reviewFields
    const updatedReview = formFields.map((f) => {
      const match = formattedAnswers.find((a) => a.questionId === f.questionId || a.fieldId === f.fieldId);
      const existing = (application.form?.reviewFields || []).find((r) => r.questionId === f.questionId);
      return {
        questionId: f.questionId,
        fieldId: f.fieldId,
        question: f.question,
        type: f.type,
        answer: match ? match.answer : existing ? existing.answer : '',
        source: match ? 'user' : existing ? existing.source : 'profile',
        options: f.options || [],
        required: Boolean(f.required),
      };
    });

    const newStorageState = await BrowserManager.captureStorageState(context).catch(() => null);

    await JobApplication.findByIdAndUpdate(applicationId, {
      'form.fields': formFields,
      'form.reviewFields': updatedReview,
      'form.answers': formattedAnswers,
      'workflow.agentState.pendingHumanAction.savedStorageState': BrowserSessionRepository.encryptStorageState(newStorageState || savedStorageState),
      'workflow.agentState.pendingHumanAction.savedUrl': page.url(),
    });

    await logJobEvent(
      'refillUnknownApplicationFormService',
      'REFILL_COMPLETE',
      `Form refilled. DOM check: ${verification.filledCount}/${formFields.length} verified filled (zero LLM).`
    );
  } finally {
    const freshApp = await JobApplication.findById(applicationId).lean().catch(() => null);
    const keepOpen = freshApp && [
      "WAITING_FOR_USER",
      "WAITING_FOR_CONFIRMATION",
      "WAITING_FOR_FINAL_REVIEW",
      "SUBMITTING"
    ].includes(freshApp.status);

    if (!keepOpen) {
      await SessionRegistry.closeSession(applicationId).catch(() => {});
    } else {
      SessionRegistry.startHumanResponseTimer(applicationId, userId);
    }
  }

  return await findApplicationById(applicationId);
};

/**
 * Refills the application form in the live browser with user's updated answers and re-inspects the form
 * @param {string} applicationId
 * @param {string} userId
 * @param {Array<object>} answers
 * @returns {Promise<object>}
 */
export const refillApplicationFormService = async (applicationId, userId, answers = []) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to application", 403);
    }

    await logJobEvent(
      'refillApplicationFormService',
      'REFILL_START',
      `Refilling form in browser for application ${applicationId} with ${answers.length} updated answers...`
    );

    const isNaukri = isNaukriApplication(application);
    if (isNaukri) {
      await runNaukriApplication({
        applicationId,
        userId,
        finalEditedAnswers: answers,
        confirmSubmission: false,
      });
      return await findApplicationById(applicationId);
    }

    // Generic UNKNOWN career portal:
    return await refillUnknownApplicationFormService(applicationId, userId, answers);
  } catch (error) {
    await logError('applicationService.refillApplicationFormService', error.message);
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

    if (!isUserAuthorized(application.userId, userId)) {
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

    if (!isUserAuthorized(application.userId, userId)) {
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
/**
 * Deletes a job application
 * @param {string} applicationId
 * @param {string} userId
 */
export const deleteApplicationService = async (applicationId, userId) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to job application", 403);
    }

    // Restriction: Cannot delete if application is approved or already further in the funnel
    const isApproved = application.status === APPLICATION_STATUS.APPROVED;
    if (isApproved || isApplicationLocked(application.status)) {
      throw new appError(
        `Cannot delete application that has been ${isApproved ? "approved" : "processed"} (Status: ${application.status})`,
        400
      );
    }

    return await deleteApplication(applicationId);
  } catch (error) {
    if (error.isOperational) throw error;
    await logError("applicationService.deleteApplicationService", error.message);
    throw new appError(`Failed to delete application: ${error.message}`, 500);
  }
};

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
  if (!isUserAuthorized(appDoc.userId, userId)) {
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

    if (!isUserAuthorized(application.userId, userId)) {
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
    const app = await getApplicationById(applicationId, userId);
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
export const updateApplicationStatusDirectService = async (userId, id, status, applicationMethod = null) => {
  try {
    const app = await getApplicationById(id, userId);
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

    const extraData = { logMessage: `Status manually updated to ${status}` };
    if (applicationMethod) {
      extraData.applicationMethod = applicationMethod;
    }

    return await updateApplicationStatus(id, status, extraData);
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
      
      // If force regenerating, clear previous error state in DB first
      if (existing && (forceRegenerate || payload?.triggerTailor)) {
        if (isApplicationLocked(existing.status)) {
          throw new appError(`Cannot regenerate tailoring for an application that is already '${existing.status}'.`, 400);
        }
        await updateApplicationStatus(existing._id, existing.status, { error: null });
      }

      const uProfile = await findUserProfileByUserId(userId).catch(() => null);
      const uRecord = await findUserById(userId).catch(() => null);
      const resolvedProfileName =
        uProfile?.personal?.firstName || uProfile?.personal?.lastName
          ? `${uProfile.personal.firstName || ''} ${uProfile.personal.lastName || ''}`.trim()
          : uProfile?.fullName && uProfile.fullName !== "Candidate"
            ? uProfile.fullName
            : uRecord?.username && uRecord.username !== "Candidate"
              ? uRecord.username
              : "Candidate";

      if (existing && !forceRegenerate && !payload?.triggerTailor) {
        return {
          application: existing,
          email: existing.email || {},
          applicationMethod: existing.applicationMethod || applicationMethod || "email",
          isExisting: true,
          status: existing.status,
          candidateInfo: {
            fullName:
              (existing.resume?.tailoredResumeData?.personalInfo?.fullName && existing.resume.tailoredResumeData.personalInfo.fullName !== "Candidate"
                ? existing.resume.tailoredResumeData.personalInfo.fullName
                : null) || resolvedProfileName,
            email: existing.resume?.tailoredResumeData?.personalInfo?.email || uRecord?.email || "",
            phone: existing.resume?.tailoredResumeData?.personalInfo?.phone || uProfile?.personal?.phone || "",
            skills: existing.resume?.tailoredResumeData?.skills || skills || [],
          },
        };
      }

      // If existing is locked, prevent regeneration
      // (Error clearing handled above for consistency)
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
                  (tailoredApp.resume?.tailoredResumeData?.personalInfo?.fullName && tailoredApp.resume.tailoredResumeData.personalInfo.fullName !== "Candidate"
                    ? tailoredApp.resume.tailoredResumeData.personalInfo.fullName
                    : null) || resolvedProfileName,
                email: tailoredApp.resume?.tailoredResumeData?.personalInfo?.email || uRecord?.email || "",
                phone: tailoredApp.resume?.tailoredResumeData?.personalInfo?.phone || uProfile?.personal?.phone || "",
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
    const uProfile = await findUserProfileByUserId(userId).catch(() => null);
    const uRecord = await findUserById(userId).catch(() => null);
    const activeResume = await getActiveResumeByUserId(userId).catch(() => null);
    const parsedData = activeResume?.parsedData || {};
    const candidateName =
      (parsedData.personalInfo?.fullName && parsedData.personalInfo.fullName !== "Candidate" ? parsedData.personalInfo.fullName : null) ||
      (uProfile?.personal?.firstName || uProfile?.personal?.lastName ? `${uProfile.personal.firstName || ''} ${uProfile.personal.lastName || ''}`.trim() : null) ||
      (uProfile?.fullName && uProfile.fullName !== "Candidate" ? uProfile.fullName : null) ||
      (uRecord?.username && uRecord.username !== "Candidate" ? uRecord.username : "Candidate");
    const candidateEmail = parsedData.personalInfo?.email || uRecord?.email || "";
    const candidatePhone = parsedData.personalInfo?.phone || uProfile?.personal?.phone || "";
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

/**
 * AI Portal Intelligence:
 * Opens the rendered employer careers portal / application page, extracts DOM content,
 * and uses Gemini LLM to analyze the page structure (openings list / accordion / form / email).
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>} Updated application with pageAnalysis
 */
export const analyzeEmployerPortalService = async (applicationId, userId) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    const application = await getApplicationById(applicationId, userId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    const job = application.jobId || {};
    // Prioritize the actual application link if already discovered and external to Naukri
    const currentPortalUrl = application.pageAnalysis?.currentUrl;
    const isCurrentPortalExternal =
      currentPortalUrl && !currentPortalUrl.includes("naukri.com/job-listings");

    const targetUrl = isCurrentPortalExternal
      ? currentPortalUrl
      : job.applicationUrl || job.sourceUrl;

    if (!targetUrl) {
      throw new appError("Job application URL is missing", 400);
    }

    // Retrieve active session if available
    const naukriAccount = await findNaukriAccountByUserId(userId);
    let sessionState = null;
    if (naukriAccount?.encryptedStorageState?.cipherText) {
      try {
        const decrypted = decryptValue(naukriAccount.encryptedStorageState);
        sessionState = JSON.parse(decrypted);
      } catch (err) {
        await logError("analyzeEmployerPortalService.decrypt", err.message);
      }
    }

    const googleSession = await getDecryptedGoogleSession(userId);
    let combinedStorageState = sessionState;
    if (googleSession?.cookies?.length > 0) {
      combinedStorageState = {
        cookies: [
          ...(sessionState?.cookies || []),
          ...(googleSession.cookies || []),
        ],
        origins: [
          ...(sessionState?.origins || []),
          ...(googleSession.origins || []),
        ],
      };
    }

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(
      browser,
      combinedStorageState ? { storageState: combinedStorageState } : {}
    );
    await injectGoogleSessionIntoContext(context, userId);

    let latestPopupPage = null;
    context.on('page', (p) => {
      latestPopupPage = p;
    });

    page = await context.newPage();

    await updateApplicationStatus(applicationId, APPLICATION_STATUS.ANALYZING_PORTAL, {
      logMessage: `Opening and analyzing actual application portal: ${targetUrl}...`,
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2000);

    let activePage = latestPopupPage && !latestPopupPage.isClosed() ? latestPopupPage : page;
    if (activePage.isClosed()) {
      const openPages = context.pages().filter(p => !p.isClosed());
      activePage = openPages.length > 0 ? openPages[openPages.length - 1] : page;
    }

    // If on Naukri job page with #company-site-button, click it to reach the actual company portal
    const isNaukriListingPage = activePage.url().includes("naukri.com/job-listings");
    if (isNaukriListingPage) {
      const companySiteBtn = activePage
        .locator(
          '#company-site-button, button:has-text("Apply on company site"), a:has-text("Apply on company site")'
        )
        .first();
      const hasCompanySiteBtn = await companySiteBtn.isVisible().catch(() => false);

      if (hasCompanySiteBtn) {
        await logJobEvent(
          "analyzeEmployerPortalService",
          "NAVIGATE_EXTERNAL",
          "Clicking #company-site-button to navigate to employer careers site"
        );
        latestPopupPage = null;
        await companySiteBtn.click().catch(() => {});
        await activePage.waitForTimeout(3000);

        if (latestPopupPage && !latestPopupPage.isClosed()) {
          await latestPopupPage.waitForLoadState("domcontentloaded").catch(() => {});
          activePage = latestPopupPage;
        } else {
          const openPages = context.pages().filter(p => !p.isClosed());
          if (openPages.length > 1) {
            activePage = openPages[openPages.length - 1];
          }
        }
        await activePage.waitForTimeout(2500);
      }
    }

    if (!activePage || activePage.isClosed()) {
      const openPages = context.pages().filter(p => !p.isClosed());
      activePage = openPages.length > 0 ? openPages[openPages.length - 1] : page;
    }

    const actualApplicationUrl = activePage && !activePage.isClosed() ? activePage.url() : targetUrl;

    // Permanently save the resolved actual application link in Job record if valid
    const jobId = job._id || application.jobId;
    if (
      jobId &&
      actualApplicationUrl &&
      !actualApplicationUrl.includes("about:blank") &&
      !actualApplicationUrl.includes("naukri.com/job-listings")
    ) {
      await Job.findByIdAndUpdate(jobId, {
        applicationUrl: actualApplicationUrl,
      }).catch(() => {});
    }

    // Extract rendered page content from the actual application / career page
    const extracted = await extractPageContent(activePage);

    // Send to Gemini AI LLM for semantic classification and next action decision
    const analysis = await classifyPageWithLlm(extracted, job, userId);

    const updated = await JobApplication.findByIdAndUpdate(
      applicationId,
      {
        pageAnalysis: {
          ...analysis,
          pageTitle: extracted.title,
          currentUrl: actualApplicationUrl,
          analyzedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    ).populate("jobId");

    await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
      logMessage: `AI analyzed actual page: ${analysis.pageType} (${actualApplicationUrl}). Candidate Domain: ${analysis.candidateDomain || 'Matched'}. ${analysis.summary}`,
    });

    // If autoApplyEnabled is active in settings, immediately deep dive into the best matched opening
    try {
      const { Setting } = await import('../model/Setting.js');
      const settingDoc = await Setting.findOne({ userId }).lean().catch(() => null);
      if (
        settingDoc?.applicationSetting?.autoApplyEnabled &&
        analysis.matchedRole?.title &&
        (analysis.pageType === 'job_listing_page' || analysis.pageType === 'job_listings_accordion' || (analysis.openingsList && analysis.openingsList.length > 0))
      ) {
        await logJobEvent(
          "analyzeEmployerPortalService",
          "AUTO_ADVANCE_BEST_MATCH",
          `Auto-apply enabled. Deep diving into best matched role: "${analysis.matchedRole.title}" (Candidate Domain: ${analysis.candidateDomain})`
        );
        advanceEmployerPortalActionService(applicationId, userId, analysis.matchedRole).catch((err) => {
          logError("analyzeEmployerPortalService.autoAdvance", err.message);
        });
      }
    } catch {
      // Non-blocking
    }

    return updated;
  } catch (error) {
    await logError("applicationService.analyzeEmployerPortalService", error.message);
    throw error;
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Advances the employer portal action based on the AI decision or selected opening role
 * (e.g. clicks the matched/selected role accordion like "Node JS Developer" and its inner "Apply Now" button)
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} [specificRoleOverride] - Optional selected role ({ title, referenceId, targetButtonText })
 * @returns {Promise<object>} Updated application record
 */
export const advanceEmployerPortalActionService = async (applicationId, userId, specificRoleOverride = null) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    const application = await getApplicationById(applicationId, userId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    const job = application.jobId || {};
    // Prioritize the actual application link if already discovered and external to Naukri
    const currentPortalUrl = application.pageAnalysis?.currentUrl;
    const isCurrentPortalExternal =
      currentPortalUrl && !currentPortalUrl.includes("naukri.com/job-listings");

    const portalUrl = isCurrentPortalExternal
      ? currentPortalUrl
      : job.applicationUrl || job.sourceUrl;

    const naukriAccount = await findNaukriAccountByUserId(userId);
    let sessionState = null;
    if (naukriAccount?.encryptedStorageState?.cipherText) {
      try {
        const decrypted = decryptValue(naukriAccount.encryptedStorageState);
        sessionState = JSON.parse(decrypted);
      } catch (err) {}
    }

    const googleSession = await getDecryptedGoogleSession(userId);
    let combinedStorageState = sessionState;
    if (googleSession?.cookies?.length > 0) {
      combinedStorageState = {
        cookies: [
          ...(sessionState?.cookies || []),
          ...(googleSession.cookies || []),
        ],
        origins: [
          ...(sessionState?.origins || []),
          ...(googleSession.origins || []),
        ],
      };
    }

    const session = await SessionRegistry.createOrGetSession(applicationId, userId, {
      storageState: combinedStorageState,
    });
    context = session.context;
    browser = session.browser;
    page = session.getActivePage();

    await injectGoogleSessionIntoContext(context, userId).catch(() => {});

    if (page.url() === "about:blank" || page.url() === "" || page.url() === "chrome-error://chromewebdata/") {
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(async () => {
        await page.evaluate(() => window.stop()).catch(() => {});
      });
      await page.waitForTimeout(2000);
    }

    let activePage = session.getActivePage() || page;

    // If on Naukri job page with #company-site-button, click it to reach the actual company portal
    const isNaukriListingPage = activePage.url().includes("naukri.com/job-listings");
    if (isNaukriListingPage) {
      const companySiteBtn = activePage
        .locator(
          '#company-site-button, button:has-text("Apply on company site"), a:has-text("Apply on company site")'
        )
        .first();
      const hasCompanySiteBtn = await companySiteBtn.isVisible().catch(() => false);

      if (hasCompanySiteBtn) {
        await logJobEvent(
          "advanceEmployerPortalActionService",
          "NAVIGATE_EXTERNAL",
          "Clicking #company-site-button to navigate to employer careers site"
        );
        latestPopupPage = null;
        await companySiteBtn.click().catch(() => {});
        await activePage.waitForTimeout(3000);

        if (latestPopupPage && !latestPopupPage.isClosed()) {
          await latestPopupPage.waitForLoadState("domcontentloaded").catch(() => {});
          activePage = latestPopupPage;
        } else {
          const openPages = context.pages().filter(p => !p.isClosed());
          if (openPages.length > 1) {
            activePage = openPages[openPages.length - 1];
          }
        }
        await activePage.waitForTimeout(2500);
      }
    }

    // --- DYNAMIC LLM-DRIVEN DEEP ANALYSIS LOOP ---
    let loopCount = 0;
    const SAFETY_CEILING = 10;
    let reachedForm = false;
    let lastAnalysis = null;
    let lastNavResult = { success: true, navigated: true, message: 'Advanced portal navigation' };

    while (loopCount < SAFETY_CEILING) {
      loopCount++;
      await logJobEvent("advanceEmployerPortalActionService", "LOOP_START", `Dynamic LLM Step ${loopCount} on ${activePage.url()}`);

      // 1. Extract and Classify current page with LLM
      const extracted = await extractPageContent(activePage);
      const analysis = await classifyPageWithLlm(extracted, job, userId);
      lastAnalysis = analysis;

      // Automatically pre-tailor the resume & PDF for the best matched role at the very start of processing
      if (analysis.matchedRole?.title) {
        const currentTailoredTitle = application.resume?.tailoredResumeData?.personalInfo?.title || application.resume?.tailoredResumeData?.summary;
        const isAlreadyTailored = currentTailoredTitle && currentTailoredTitle.toLowerCase().includes(analysis.matchedRole.title.toLowerCase());
        
        if (!isAlreadyTailored) {
          await logJobEvent(
            "advanceEmployerPortalActionService",
            "AUTO_TAILOR_START",
            `Pre-tailoring resume & PDF for best matched role: "${analysis.matchedRole.title}"...`
          ).catch(() => {});
          try {
            const tailorResult = await tailorRoleOutreachService(applicationId, userId, {
              roleTitle: analysis.matchedRole.title,
              referenceId: analysis.matchedRole.referenceId,
              experience: analysis.matchedRole.experience,
              location: analysis.matchedRole.location,
              recipientEmail: analysis.emailContact?.email,
            });
            if (tailorResult && tailorResult.resume) {
              application.resume = tailorResult.resume;
              application.email = tailorResult.email;
              await logJobEvent(
                "advanceEmployerPortalActionService",
                "AUTO_TAILOR_SUCCESS",
                `Successfully pre-tailored resume & PDF for "${analysis.matchedRole.title}". Ready for auto-fill.`
              ).catch(() => {});
            }
          } catch (tailorErr) {
            await logError("advanceEmployerPortalActionService.autoTailor", `Auto-tailoring failed (falling back to base resume): ${tailorErr.message}`);
          }
        }
      }

      await logJobEvent(
        "advanceEmployerPortalActionService",
        "LLM_DEPTH_DECISION",
        `Page: ${analysis.pageType} | Should Continue Deeper: ${analysis.shouldContinueDeepDive} | Terminal: ${analysis.isTerminalState} | Next: ${analysis.nextAction?.type || analysis.nextRecommendedAction}`
      );

      // 2. Check if LLM determined this is a terminal state or form is ready
      const isFormReached = 
        extracted.formFieldsCount > 0 || 
        analysis.pageType === 'application_form' || 
        analysis.pageType === 'modal_application_form' ||
        analysis.pageType === 'multi_step_wizard';

      if (
        isFormReached || 
        analysis.isTerminalState || 
        analysis.pageType === 'ats_account_gateway' || 
        analysis.pageType === 'form_closed' ||
        analysis.shouldContinueDeepDive === false
      ) {
        reachedForm = isFormReached;
        break;
      }

      // 3. LLM decided we need to go deeper: execute navigation to the next level
      const navResult = await navigatePortalWithAiDecision(activePage, analysis, context, specificRoleOverride);
      lastNavResult = navResult;
      
      if (navResult.navigated) {
        if (navResult.newPage) activePage = navResult.newPage;
        await activePage.waitForTimeout(3000);
        
        if (navResult.isMailto || navResult.mailtoUrl) {
          // Special handling for email applications
          let recipientEmail = "careers@innowise.us";
          let mailSubject = `Application for ${job.title || "Position"}`;
          try {
            const rawMailto = (navResult.mailtoUrl || "").replace(/^mailto:/i, "");
            const [emailPart, queryPart] = rawMailto.split("?");
            if (emailPart) recipientEmail = decodeURIComponent(emailPart);
            if (queryPart) {
              const params = new URLSearchParams(queryPart);
              if (params.get("subject")) mailSubject = params.get("subject");
            }
          } catch {
            // fallback
          }

          await tailorRoleOutreachService(applicationId, userId, {
            roleTitle: specificRoleOverride?.title || job.title || "Open Position",
            recipientEmail,
            referenceId: specificRoleOverride?.referenceId || analysis?.matchedRole?.referenceId || "",
          });

          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: "email",
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          });

          await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
            logMessage: `Employer specifies email application for ${specificRoleOverride?.title || job.title} (${recipientEmail}). Tailored resume and outreach draft prepared.`,
          });

          return await findApplicationById(applicationId);
        }
        continue; // Continue loop to analyze updated page dynamically
      } else {
        // Navigation could not advance further; break to evaluate current page
        break;
      }
    }

    // Use last analysis results for the final part of the service
    const postExtracted = await extractPageContent(activePage);
    const postAnalysis = lastAnalysis || (await classifyPageWithLlm(postExtracted, job, userId));
    const actualApplicationUrl = activePage.url();

    // Permanently save the resolved actual application link in Job record
    const jobId = job._id || application.jobId;
    if (
      jobId &&
      actualApplicationUrl &&
      !actualApplicationUrl.includes("about:blank") &&
      !actualApplicationUrl.includes("naukri.com/job-listings")
    ) {
      await Job.findByIdAndUpdate(jobId, {
        applicationUrl: actualApplicationUrl,
      }).catch(() => {});
    }

    const isFormReady =
      postExtracted.formFieldsCount > 0 ||
      postAnalysis.pageType === 'modal_application_form' ||
      postAnalysis.pageType === 'application_form' ||
      postAnalysis.pageType === 'multi_step_wizard' ||
      postAnalysis.nextRecommendedAction === 'fill_form';

    // If application form / modal was reached, automatically inspect, fill, and verify
    if (isFormReady) {
      await activePage.waitForTimeout(1000);

      const formInspection = await inspectForm(activePage);

      if (formInspection.fields && formInspection.fields.length > 0) {
        const userResumeDoc = await getActiveResumeByUserId(userId).catch(() => null);
        const candidateResume = application.resume?.tailoredResumeData || userResumeDoc?.parsedData || {};
        const userProfile = await findUserProfileByUserId(userId).catch(() => null);
        const userDoc = await findUserById(userId).catch(() => null);

        const { resolvedAnswers, missingQuestions } = await resolveAllFormAnswers(formInspection.fields, {
          userAnswers: application.form?.answers || [],
          userProfile: userProfile || {},
          user: userDoc || { username: userProfile?.fullName, email: userProfile?.email },
          resumeData: candidateResume || {},
          job,
          applicationId,
        });

        await fillFormFields(activePage, formInspection.fields, resolvedAnswers, {
          resumePdfPath: application.resume?.pdfPath,
        });
        await verifyFilledFields(activePage, resolvedAnswers);

        const reviewFields = formInspection.fields.map((f) => {
          const match = resolvedAnswers.find((a) => a.questionId === f.questionId || a.fieldId === f.fieldId);
          return {
            questionId: f.questionId,
            fieldId: f.fieldId,
            question: f.question,
            type: f.type,
            answer: match ? match.answer : '',
            source: match ? match.source : 'profile',
            options: f.options || [],
            required: Boolean(f.required),
            isTermsAgreement: Boolean(f.isTermsAgreement),
          };
        });

        const currentStorageState = await BrowserManager.captureStorageState(context).catch(() => null);

        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
          'form.fields': formInspection.fields,
          'form.answers': resolvedAnswers,
          'form.reviewFields': reviewFields,
          'form.missingQuestions': missingQuestions,
          'form.isAccountCreation': Boolean(formInspection.isAccountCreation),
          'workflow.agentState.pendingHumanAction': {
            reason: 'Review filled form before final submission',
            savedUrl: actualApplicationUrl,
            savedStorageState: BrowserSessionRepository.encryptStorageState(currentStorageState),
          },
          pageAnalysis: {
            ...postAnalysis,
            pageTitle: postExtracted.title,
            currentUrl: actualApplicationUrl,
            analyzedAt: new Date(),
          },
        });

        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW, {
          logMessage: `Employer application form loaded with ${formInspection.fields.length} fields. Verified via DOM check. Ready for candidate review.`,
        });

        return await findApplicationById(applicationId);
      }
    }

    const updated = await JobApplication.findByIdAndUpdate(
      applicationId,
      {
        pageAnalysis: {
          ...postAnalysis,
          pageTitle: postExtracted.title,
          currentUrl: actualApplicationUrl,
          analyzedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    ).populate("jobId");

    await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
      logMessage: `Advanced portal action: ${lastNavResult?.message || "Action executed"}. New state: ${postAnalysis.pageType} (${actualApplicationUrl})`,
    });

    return updated;
  } catch (error) {
    await logError("applicationService.advanceEmployerPortalActionService", error.message);
    throw error;
  } finally {
    const freshApp = await JobApplication.findById(applicationId).lean().catch(() => null);
    const keepOpen = freshApp && [
      "WAITING_FOR_USER",
      "WAITING_FOR_CONFIRMATION",
      "WAITING_FOR_FINAL_REVIEW",
      "SUBMITTING"
    ].includes(freshApp.status);

    if (!keepOpen) {
      await SessionRegistry.closeSession(applicationId).catch(() => {});
    } else {
      SessionRegistry.startHumanResponseTimer(applicationId, userId);
    }
  }
};

/**
 * Tailors candidate resume and drafts outreach email specifically for a selected role on a career portal
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} roleDetails - { roleTitle, referenceId, jobDescription, experience, location, recipientEmail, template }
 * @returns {Promise<object>} Tailored resume details and email draft
 */
export const tailorRoleOutreachService = async (applicationId, userId, roleDetails = {}) => {
  try {
    const application = await getApplicationById(applicationId, userId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    const {
      roleTitle = "Software Developer",
      referenceId = "",
      jobDescription = "",
      experience = "",
      location = "",
      recipientEmail = "",
      template = "ATS Modern",
    } = roleDetails;

    const [userProfile, activeResume] = await Promise.all([
      findUserProfileByUserId(userId),
      getActiveResumeByUserId(userId) || findOriginalResumeByUserId(userId),
    ]);

    const resInfo = activeResume?.parsedData?.personalInfo || activeResume?.parsedData?.personal || activeResume?.parsedData || {};
    const profPersonal = userProfile?.personal || {};

    const candidateName =
      resInfo.fullName ||
      resInfo.name ||
      (resInfo.firstName ? `${resInfo.firstName} ${resInfo.lastName || ''}`.trim() : null) ||
      (profPersonal.firstName ? `${profPersonal.firstName} ${profPersonal.lastName || ''}`.trim() : null) ||
      userProfile?.fullName ||
      userProfile?.name ||
      "Karan Santosh Gade";
    const candidateSkills = userProfile?.skills || activeResume?.parsedData?.skills || [];
    const baseExperience = activeResume?.parsedData?.experience || [];

    // Use Gemini model to generate a role-specific tailored resume and email draft
    const model = await getGeminiModel(userId);
    const prompt = `You are an AI Executive Career Specialist and ATS Optimizer.
Candidate Name: "${candidateName}"
Target Role Title: "${roleTitle}"
Reference ID / Job Code: "${referenceId}"
Required Experience: "${experience}"
Location: "${location}"
Role Context / Description:
"""
${jobDescription || `Hiring for ${roleTitle} with experience ${experience} at ${location}`}
"""

Candidate Base Profile:
- Skills: ${JSON.stringify(candidateSkills)}
- Experience Highlights: ${JSON.stringify(baseExperience.slice(0, 3))}

TASK:
1. Tailor the candidate's resume JSON data specifically aligned to "${roleTitle}".
2. Generate a tailored email subject including the Ref ID (e.g., "Application for ${roleTitle} - Ref ID: ${referenceId || 'N/A'} - ${candidateName}").
3. Compose a compelling, high-converting 3-paragraph outreach email body emphasizing relevant technical competencies.

RETURN STRICT JSON ONLY:
{
  "tailoredResumeData": {
    "personal": {
      "name": "${candidateName}",
      "email": "${userProfile?.personal?.email || ''}",
      "phone": "${userProfile?.personal?.phone || ''}",
      "location": "${userProfile?.personal?.location || ''}",
      "links": []
    },
    "summary": "Tailored professional summary emphasizing ${roleTitle} qualifications",
    "skills": ["Tailored skill 1", "Tailored skill 2"],
    "experience": [
      {
        "role": "${roleTitle}",
        "company": "Recent Experience",
        "duration": "2022 - Present",
        "bullets": ["Quantified bullet 1", "Quantified bullet 2"]
      }
    ],
    "projects": [],
    "education": []
  },
  "email": {
    "recipient": "${recipientEmail || application.email?.recipient || ''}",
    "subject": "Application for ${roleTitle} - Ref ID: ${referenceId || ''} - ${candidateName}",
    "body": "Dear Hiring Team,\\n\\nI am writing to express my enthusiastic interest in the ${roleTitle} position (Ref ID: ${referenceId || 'N/A'})...\\n\\nSincerely,\\n${candidateName}"
  }
}`;

    const response = await model.invoke(prompt);
    const content = (response.content || "").trim();
    const cleaned = content.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    const tailoredResumeData = parsed.tailoredResumeData || activeResume?.parsedData || {};
    const emailData = parsed.email || {
      recipient: recipientEmail || application.email?.recipient || "",
      subject: `Application for ${roleTitle} - Ref ID: ${referenceId || ""}`,
      body: `Dear Hiring Team,\n\nI am writing to apply for the ${roleTitle} position (Ref ID: ${referenceId || "N/A"}).\n\nSincerely,\n${candidateName}`,
    };

    // Generate ATS PDF for this specific role
    let pdfPath = "";
    try {
      pdfPath = await generateResumePdf({
        resumeData: tailoredResumeData,
        template: template || "ats",
        userId,
      });
    } catch (err) {
      await logError("applicationService.tailorRoleOutreachService.pdfGen", err.message);
    }

    // Save into application roleOutreaches
    const outreachRecord = {
      roleTitle,
      referenceId,
      email: emailData.recipient,
      subject: emailData.subject,
      body: emailData.body,
      pdfPath,
      tailoredResumeData,
      status: "draft",
    };

    const existingOutreaches = (application.pageAnalysis?.roleOutreaches || []).filter(
      (r) => r.roleTitle !== roleTitle
    );

    const updated = await JobApplication.findByIdAndUpdate(
      applicationId,
      {
        $set: {
          "email.recipient": emailData.recipient,
          "email.subject": emailData.subject,
          "email.body": emailData.body,
          "resume.tailoredResumeData": tailoredResumeData,
          "resume.pdfPath": pdfPath,
          "pageAnalysis.roleOutreaches": [...existingOutreaches, outreachRecord],
        },
      },
      { returnDocument: 'after' }
    ).populate("jobId");

    await logJobEvent(
      "tailorRoleOutreachService",
      "TAILORED",
      `Tailored resume & email for role: "${roleTitle}" (Ref ID: ${referenceId})`
    );

    return {
      roleTitle,
      referenceId,
      email: emailData,
      resume: {
        tailoredResumeData,
        pdfPath,
      },
      application: updated,
    };
  } catch (error) {
    await logError("applicationService.tailorRoleOutreachService", error.message);
    throw error;
  }
};

/**
 * Sends a direct application email for a specific role or from email instructions
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} emailPayload - { recipient, subject, body, pdfPath, roleTitle, referenceId }
 * @returns {Promise<object>}
 */
export const sendDirectRoleEmailService = async (applicationId, userId, emailPayload = {}) => {
  try {
    const application = await getApplicationById(applicationId, userId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    const {
      recipient = application.email?.recipient,
      subject = application.email?.subject,
      body = application.email?.body,
      pdfPath = application.resume?.pdfPath,
      roleTitle = application.jobId?.title || "Role",
      referenceId = "",
    } = emailPayload;

    if (!recipient || !subject || !body) {
      throw new appError("Recipient, subject, and email body are required", 400);
    }

    // Send the email with PDF attachment
    const sendResult = await sendApplicationEmail({
      recipient,
      subject,
      body,
      pdfPath,
    });

    const now = new Date();

    // Mark application as Applied
    const updated = await JobApplication.findByIdAndUpdate(
      applicationId,
      {
        $set: {
          status: APPLICATION_STATUS.APPLIED,
          "email.recipient": recipient,
          "email.subject": subject,
          "email.body": body,
          "email.sentAt": now,
          "email.approved": true,
          "email.approvedAt": now,
        },
        $push: {
          "workflow.logs": {
            timestamp: now,
            event: "EMAIL_SENT_DIRECT",
            message: `Direct application email sent to ${recipient} for role "${roleTitle}" (Ref: ${referenceId || "N/A"})`,
          },
        },
      },
      { returnDocument: 'after' }
    ).populate("jobId");

    await logJobEvent(
      "sendDirectRoleEmailService",
      "EMAIL_SENT",
      `Sent application to ${recipient} (Message ID: ${sendResult?.messageId || "OK"})`
    );

    return updated;
  } catch (error) {
    await logError("applicationService.sendDirectRoleEmailService", error.message);
    throw error;
  }
};

/**
 * Batch applies to multiple selected roles from a career portal
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {Array<object>} selectedRoles
 * @returns {Promise<object>}
 */
export const applySelectedRolesBatchService = async (applicationId, userId, selectedRoles = []) => {
  try {
    if (!selectedRoles || selectedRoles.length === 0) {
      throw new appError("No roles selected for batch application", 400);
    }

    const results = [];
    for (const role of selectedRoles) {
      const tailored = await tailorRoleOutreachService(applicationId, userId, {
        roleTitle: role.title,
        referenceId: role.referenceId,
        jobDescription: role.descriptionSnippet || role.title,
        experience: role.experience,
        location: role.location,
        recipientEmail: role.email,
      });
      results.push(tailored);
    }

    return {
      success: true,
      processedCount: results.length,
      roles: results,
    };
  } catch (error) {
    await logError("applicationService.applySelectedRolesBatchService", error.message);
    throw error;
  }
};

/**
 * Retries Google Form application (e.g. after user connects Google session)
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const retryGoogleFormApplicationService = async (applicationId, userId) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    if (!isUserAuthorized(application.userId, userId)) {
      throw new appError("Unauthorized access to application", 403);
    }

    const job = application.jobId || {};
    const googleFormUrl =
      application.googleFormResult?.googleFormUrl ||
      job.applicationUrl ||
      job.sourceUrl;

    if (!googleFormUrl) {
      throw new appError("Google Form URL not found for this application", 400);
    }

    await logJobEvent(
      'retryGoogleFormApplicationService',
      'RETRY_START',
      `Retrying Google Form application ${applicationId} on ${googleFormUrl}`
    );

    const activeResume = await getActiveResumeByUserId(userId);

    const result = await runGoogleFormApplication({
      applicationId,
      googleFormUrl,
      candidateInfo: application.resume?.tailoredResumeData || activeResume?.parsedData,
      jobDetails: job,
      userId,
      resumePdfPath: application.resume?.pdfPath || null,
    });

    const updated = await findApplicationById(applicationId);
    return {
      application: updated,
      formResult: result,
    };
  } catch (error) {
    await logError('applicationService.retryGoogleFormApplicationService', error.message);
    throw error;
  }
};

/**
 * Opens a new URL/tab (such as a Google Form) in the active browser session,
 * stopping any active background agent execution without closing the browser session.
 */
export const openPortalTabService = async (applicationId, userId, url) => {
  try {
    const appIdStr = String(applicationId);
    const application = await getApplicationById(applicationId, userId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    await logJobEvent(
      'openPortalTabService',
      'OPEN_TAB_START',
      `Stopping background agent and opening URL in new tab: ${url}`
    );

    // Stop background agent workflow if active
    const { stopAgentWorkflowOnly } = await import("./agentRunner.service.js");
    stopAgentWorkflowOnly(applicationId);

    // Get or create browser session
    const session = await SessionRegistry.createOrGetSession(appIdStr, userId);
    const context = session.context;

    // Open new tab (page)
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    // Save active page state & set applicationMethod to googleForm (if google form) or company_site
    const isGf = url.includes("docs.google.com/forms") || url.includes("forms.gle");
    const method = isGf ? "googleForm" : "unknown";

    await JobApplication.findByIdAndUpdate(applicationId, {
      applicationMethod: method,
      "workflow.agentState.currentPage.url": url,
      "workflow.agentState.currentPage.pageType": isGf ? "google_form" : "unknown",
      "pageAnalysis.currentUrl": url,
    });

    // Reset 3-minute inactivity timer unconditionally
    SessionRegistry.startHumanResponseTimer(applicationId, userId);

    return await findApplicationById(applicationId);
  } catch (error) {
    await logError('applicationService.openPortalTabService', error.message);
    throw error;
  }
};



