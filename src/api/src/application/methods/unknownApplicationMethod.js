import { logJobEvent, logError } from '../../utils/logger.js';
import { analyzeUnknownPage, fillCustomFormOnPage } from '../unknown/unknownPageHandler.js';
import { runGoogleFormApplication } from './googleFormApplicationMethod.js';
import { runPhoneApplication } from './phoneApplicationMethod.js';
import { sendApplicationEmail } from '../../integrations/email/emailService.js';
import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { updateApplicationStatus, updateApplicationEmail } from '../../repositories/application.repository.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { inspectForm } from '../form/formInspector.js';
import { formatAndCleanEmailBody } from '../../agent/prompt/applicationEmail.js';
import { maskValue } from '../../utils/redact.js';
import { runUnknownAgentLoop } from '../unknown/unknownAgent.js';

/**
 * Runs the full Unknown application method workflow.
 *
 * This is the AI-driven catch-all handler for URLs where the application method
 * is not explicitly known. It:
 * 1. Opens the URL in a headless browser.
 * 2. Analyzes the page with LLM (classifyPageWithLlm) to determine the actual method.
 * 3. Dispatches to the appropriate sub-handler:
 *    - email       → sends application email with resume attached
 *    - phone       → generates call script, sets status to waiting_for_review
 *    - google_form → runs Google Form filler
 *    - custom_form → fills custom employer form fields
 *    - career_portal → sets status to waiting_for_review for human to navigate
 *    - human_review → flags for human review
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.pageUrl - The unknown URL
 * @param {object} params.candidateInfo - Candidate resume data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @param {string} [params.resumePdfPath] - Path to tailored resume PDF
 * @param {object} [params.sessionState] - Optional browser session state
 * @returns {Promise<object>} Result with detectedMethod, action taken, and status
 */
export const runUnknownApplicationMethod = async ({
  applicationId,
  pageUrl,
  candidateInfo,
  jobDetails,
  userId,
  resumePdfPath = null,
  sessionState = null,
}) => {
  try {
    if (!pageUrl) {
      throw new Error('No URL provided for unknown application method');
    }

    await logJobEvent(
      'unknownApplicationMethod',
      'START',
      `Analyzing unknown application page: ${pageUrl}`
    );

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.ANALYZING_PORTAL, {
        logMessage: `AI analyzing unknown page: ${pageUrl}`,
      });
    }

    // Step 1: Analyze the page
    const pageResult = await analyzeUnknownPage({
      url: pageUrl,
      job: jobDetails,
      userId,
      sessionState,
      applicationId,
    });

    const { detectedMethod } = pageResult;

    await logJobEvent(
      'unknownApplicationMethod',
      'METHOD_DETECTED',
      `Detected method: ${detectedMethod} from page: ${pageUrl}`
    );

    // Step 2: Dispatch to appropriate handler

    // --- EMAIL ---
    if (detectedMethod === 'email') {
      const recipientEmail =
        pageResult.emails?.[0] ||
        pageResult.emailInstructions?.email ||
        jobDetails?.hrEmail ||
        '';

      if (!recipientEmail) {
        // No email found — fallback to human review
        if (applicationId) {
          await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
            logMessage: `Email method detected but no recipient found. Human review required.`,
          });
        }
        return {
          detectedMethod,
          actionTaken: 'human_review',
          message: 'Email method detected but no recipient address found on the page.',
          pageResult,
        };
      }

      const candidateName =
        candidateInfo?.personalInfo?.fullName || candidateInfo?.name || 'Candidate';
      const jobTitle = jobDetails?.title || 'Software Developer';
      const company = jobDetails?.company || 'Company';
      const refId = pageResult.referenceIds?.[0] || pageResult.emailInstructions?.referenceId || '';

      const subject = refId
        ? `Application for ${jobTitle} - Ref ID: ${refId} - ${candidateName}`
        : `Application for ${jobTitle} at ${company} - ${candidateName}`;

      const rawBody = `Dear Hiring Team at ${company},

I am writing to express my strong interest in the ${jobTitle} position${refId ? ` (Ref ID: ${refId})` : ''}. ${candidateInfo?.summary || `With expertise in ${(candidateInfo?.skills || []).slice(0, 4).join(', ')}, I am confident in delivering immediate value to your team.`}

My tailored resume is attached for your review. I look forward to the opportunity to discuss my qualifications in an interview.

Sincerely,

${candidateName}`;

      const body = formatAndCleanEmailBody(rawBody, candidateName);

      let effectiveEmailPdfPath = resumePdfPath || null;
      if (!effectiveEmailPdfPath && candidateInfo) {
        try {
          const { tailorResumeForJobDescription } = await import('../../services/resumeTailoring.service.js');
          const tailoredRes = await tailorResumeForJobDescription({
            candidateResume: candidateInfo,
            jobDetails,
            userId,
            applicationId,
          });
          effectiveEmailPdfPath = tailoredRes.pdfPath;
        } catch (tailorErr) {
          await logError('unknownApplicationMethod.emailTailor', tailorErr.message);
        }
      }

      if (applicationId) {
        await updateApplicationEmail(applicationId, {
          recipient: recipientEmail,
          subject,
          body,
          approved: false,
        });
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
          logMessage: `Created draft application email to ${recipientEmail} (awaiting human approval).`,
        });
      }

      return {
        detectedMethod,
        actionTaken: 'email_draft_created',
        recipientEmail,
        subject,
        message: `Draft email created for ${recipientEmail}, pending approval.`,
        pageResult,
      };
    }

    // --- PHONE ---
    if (detectedMethod === 'phone') {
      const phoneNumber = pageResult.phoneNumbers?.[0] || jobDetails?.phone || '';
      const phoneResult = await runPhoneApplication({
        applicationId,
        phoneNumber,
        candidateInfo,
        jobDetails,
        userId,
      });
      return {
        detectedMethod,
        actionTaken: 'phone_script_generated',
        phoneNumber,
        callScript: phoneResult.callScript,
        talkingPoints: phoneResult.talkingPoints,
        message: phoneResult.message,
        pageResult,
      };
    }

    // --- GOOGLE FORM ---
    if (detectedMethod === 'google_form') {
      const googleFormUrl = pageResult.googleFormUrl;
      const formResult = await runGoogleFormApplication({
        applicationId,
        googleFormUrl,
        candidateInfo,
        jobDetails,
        userId,
        resumePdfPath,
      });
      return {
        detectedMethod,
        actionTaken: formResult.submitted ? 'google_form_submitted' : 'google_form_filled',
        googleFormUrl,
        filledCount: formResult.filledCount,
        submitted: formResult.submitted,
        message: formResult.message,
        pageResult,
      };
    }

    // --- CUSTOM FORM / ATS PORTAL ---
    if (detectedMethod === 'custom_form' || detectedMethod === 'career_portal') {
      await logJobEvent(
        'unknownApplicationMethod',
        'TRIGGER_AGENT_LOOP',
        `Custom Form or Career Portal detected. Spawning multi-step secure agent loop...`
      );

      const loopResult = await runUnknownAgentLoop({
        applicationId,
        userId,
        candidateInfo,
        jobDetails
      });

      if (applicationId) {
        await updateApplicationStatus(applicationId, loopResult.status, {
          logMessage: `Agent loop finished with status "${loopResult.status}". Summary: ${loopResult.summary}`,
        });
      }

      return {
        detectedMethod,
        actionTaken: loopResult.status === APPLICATION_STATUS.APPLIED ? 'custom_form_submitted' : 'custom_form_filled',
        filledCount: 0,
        submitted: loopResult.status === APPLICATION_STATUS.APPLIED,
        message: loopResult.summary,
        pageResult,
      };
    }

    // --- CAREER PORTAL / HUMAN REVIEW ---
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: `Unknown page analyzed. Method: ${detectedMethod}. ${pageResult.message}`,
      });
    }

    return {
      detectedMethod,
      actionTaken: 'waiting_for_human_review',
      message: pageResult.message || `Page analyzed as "${detectedMethod}". Human review required.`,
      pageResult,
    };
  } catch (error) {
    await logError('unknownApplicationMethod.runUnknownApplicationMethod', error.message);
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Unknown application method failed: ${error.message}`,
      });
    }
    throw error;
  }
};
