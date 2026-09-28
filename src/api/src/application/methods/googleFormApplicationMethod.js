import { logJobEvent, logError } from '../../utils/logger.js';
import { BrowserManager } from '../../browser/browserManager.js';
import {
  extractGoogleFormFields,
  resolveGoogleFormAnswers,
  fillGoogleFormFields,
  submitGoogleForm,
} from '../googleForm/googleFormFiller.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import {
  updateApplicationStatus,
  updateApplicationResume,
  updateApplicationGoogleForm,
} from '../../repositories/application.repository.js';
import { getGeminiModel } from '../../agent/config/modelConfig.js';
import {
  getDecryptedGoogleSession,
  detectGoogleAuthState,
  injectGoogleSessionIntoContext,
} from '../../services/googleSession.service.js';
import {
  updateGoogleAccountStatus,
  upsertGoogleAccount,
} from '../../repositories/googleAccount.repository.js';
import { encryptValue } from '../../utils/encryption.js';
import { GOOGLE_AUTH_STATUS } from '../../constant/google.constant.js';

/**
 * Runs the Google Form application method.
 *
 * Steps:
 * 1. Checks if the user has an active, encrypted Google session (cookies/storageState).
 * 2. Launches browser with restored session to bypass "Sign in to continue to Google Forms".
 * 3. Opens the Google Form URL.
 * 4. Detects if Google Sign-In is required:
 *    - If required & no session exists -> marks application 'google_login_required'
 *    - If required & session existed -> marks session 'expired' and application 'google_login_required'
 * 5. Checks if form is closed / no longer accepting responses.
 * 6. Extracts all form fields.
 * 7. If resume upload field exists, tailors resume on demand and attaches PDF.
 * 8. Uses LLM to resolve best answers for each field.
 * 9. Fills form fields via Playwright automation.
 * 10. Submits form and records submission verification.
 * 11. Refreshes and updates user's Google session storageState for seamless future applies.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.googleFormUrl - Direct Google Form URL
 * @param {object} params.candidateInfo - Candidate resume data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @param {string} [params.resumePdfPath] - Path to tailored resume PDF
 * @returns {Promise<{ success: boolean, submitted: boolean, filledCount: number, message: string, formClosed: boolean, loginRequired: boolean }>}
 */
export const runGoogleFormApplication = async ({
  applicationId,
  googleFormUrl,
  candidateInfo,
  jobDetails,
  userId,
  resumePdfPath = null,
}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!googleFormUrl) {
      throw new Error('Google Form URL is required');
    }

    await logJobEvent(
      'googleFormApplicationMethod',
      'START',
      `Opening Google Form: ${googleFormUrl}`
    );

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.GOOGLE_FORM_FILLING, {
        logMessage: `Opening and filling Google Form: ${googleFormUrl}`,
      });
    }

    // Step 1: Check for stored user Google session
    const googleSession = await getDecryptedGoogleSession(userId);
    if (googleSession) {
      await logJobEvent(
        'googleFormApplicationMethod',
        'SESSION_LOADED',
        `Restored encrypted Google session for User: ${userId}`
      );
    } else {
      await logJobEvent(
        'googleFormApplicationMethod',
        'NO_SESSION',
        `No stored Google session found. Launching standard context.`
      );
    }

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(
      browser,
      googleSession ? { storageState: googleSession } : {}
    );
    if (userId) {
      await injectGoogleSessionIntoContext(context, userId);
    }
    page = await context.newPage();

    await page.goto(googleFormUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(3000);

    // Step 2: Check for Google Sign-in requirement (e.g. for resume file upload or limited responses)
    const googleAuth = await detectGoogleAuthState(page);

    if (googleAuth.isSignInRequired) {
      const loginUrl = googleAuth.currentUrl || googleFormUrl;
      await logJobEvent(
        'googleFormApplicationMethod',
        'GOOGLE_SIGNIN_REQUIRED',
        `Google Form requires sign-in: ${loginUrl}`
      );

      // If user had a session that failed, mark it expired
      if (googleSession && userId) {
        await updateGoogleAccountStatus(userId, GOOGLE_AUTH_STATUS.EXPIRED, new Date());
      }

      if (applicationId) {
        await updateApplicationGoogleForm(applicationId, {
          googleFormUrl,
          loginRequired: true,
          loginUrl,
          submitted: false,
          formClosed: false,
        });

        await updateApplicationStatus(applicationId, APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED, {
          logMessage: `Google Account sign-in required to fill this form (e.g. for file upload or response limit). Please connect your Google session or open the form directly.`,
        });
      }

      return {
        success: false,
        submitted: false,
        filledCount: 0,
        formClosed: false,
        loginRequired: true,
        loginUrl,
        message: 'This Google Form requires Google Account sign-in (e.g. for resume upload). Please connect your Google session in the review panel.',
      };
    }

    // Step 3: Check if form is closed / expired
    const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const isFormClosed =
      /no longer accepting responses|responses are closed|form is closed|form closed/i.test(pageText);

    if (isFormClosed) {
      await logJobEvent(
        'googleFormApplicationMethod',
        'FORM_CLOSED',
        `Google Form is closed: ${googleFormUrl}`
      );
      if (applicationId) {
        await updateApplicationGoogleForm(applicationId, {
          googleFormUrl,
          formClosed: true,
          submitted: false,
          loginRequired: false,
        });
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
          logMessage: `Google Form is closed and no longer accepting responses.`,
        });
      }
      return {
        success: false,
        submitted: false,
        filledCount: 0,
        formClosed: true,
        loginRequired: false,
        message: 'Google Form is closed and no longer accepting responses.',
      };
    }

    // Step 4: Extract fields
    const fields = await extractGoogleFormFields(page);

    if (fields.length === 0) {
      await logJobEvent(
        'googleFormApplicationMethod',
        'NO_FIELDS',
        `No form fields detected on Google Form: ${googleFormUrl}`
      );
      return {
        success: false,
        submitted: false,
        filledCount: 0,
        formClosed: false,
        loginRequired: false,
        message: 'No form fields detected. Page may have loaded incorrectly.',
      };
    }

    // Step 5: Check if resume upload field exists — tailor resume only if resume field exists
    const hasResumeField = fields.some(
      (f) => f.fieldType === 'file' || /resume|cv|upload.*(?:resume|cv)/i.test(f.questionText || '')
    );

    let effectiveResumePdfPath = resumePdfPath || null;

    if (hasResumeField && !effectiveResumePdfPath && candidateInfo) {
      await logJobEvent(
        'googleFormApplicationMethod',
        'TAILOR_ON_DEMAND',
        `Google Form contains a resume upload field. Tailoring resume to job description...`
      );
      try {
        const { tailorResumeForJobDescription } = await import('../../services/resumeTailoring.service.js');
        const tailoredRes = await tailorResumeForJobDescription({
          candidateResume: candidateInfo,
          jobDetails,
          userId,
          applicationId,
        });
        effectiveResumePdfPath = tailoredRes.pdfPath;
      } catch (tailorErr) {
        await logError('googleFormApplicationMethod.tailorOnDemand', tailorErr.message);
      }
    }

    // Step 6: Resolve answers via LLM
    const model = await getGeminiModel(userId);
    const answers = await resolveGoogleFormAnswers(fields, candidateInfo, jobDetails, model);

    // Step 7: Fill form fields
    const fillResult = await fillGoogleFormFields(page, fields, answers, effectiveResumePdfPath);

    await page.waitForTimeout(1000);

    // Step 8: Submit form
    const submitResult = await submitGoogleForm(page);

    // Step 9: Refresh and persist user's Google session cookies if session was active
    if (googleAuth.authenticated && userId) {
      try {
        const freshStorageState = await BrowserManager.captureStorageState(context);
        const encrypted = encryptValue(JSON.stringify(freshStorageState));
        await upsertGoogleAccount(userId, {
          encryptedStorageState: encrypted,
          status: GOOGLE_AUTH_STATUS.CONNECTED,
          lastValidatedAt: new Date(),
        });
      } catch (refreshErr) {
        // Non-blocking session refresh
      }
    }

    const finalStatus = submitResult.submitted
      ? APPLICATION_STATUS.APPLIED
      : APPLICATION_STATUS.WAITING_FOR_REVIEW;

    if (applicationId) {
      await updateApplicationGoogleForm(applicationId, {
        googleFormUrl,
        fieldsDetected: fields.length,
        filledCount: fillResult.filledCount,
        skippedCount: fillResult.skippedCount,
        hasResumeField,
        submitted: submitResult.submitted,
        formClosed: false,
        loginRequired: false,
        errors: fillResult.errors || [],
        submittedAt: submitResult.submitted ? new Date() : null,
      });

      await updateApplicationStatus(
        applicationId,
        finalStatus,
        {
          logMessage: submitResult.submitted
            ? `Google Form submitted successfully! Filled ${fillResult.filledCount} fields.`
            : `Google Form filled (${fillResult.filledCount} fields) but submit confirmation pending review.`,
        }
      );
    }

    await logJobEvent(
      'googleFormApplicationMethod',
      submitResult.submitted ? 'SUBMITTED' : 'SUBMIT_UNCONFIRMED',
      `Filled ${fillResult.filledCount}/${fields.length} fields. Submit: ${submitResult.submitted}`
    );

    return {
      success: submitResult.submitted,
      submitted: submitResult.submitted,
      filledCount: fillResult.filledCount,
      skippedCount: fillResult.skippedCount,
      errors: fillResult.errors,
      formClosed: false,
      loginRequired: false,
      hasResumeField,
      message: submitResult.message,
    };
  } catch (error) {
    await logError('googleFormApplicationMethod.runGoogleFormApplication', error.message);
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Google Form application failed: ${error.message}`,
      });
    }
    return {
      success: false,
      submitted: false,
      filledCount: 0,
      formClosed: false,
      loginRequired: false,
      message: error.message,
    };
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

export const handleGoogleFormApplication = runGoogleFormApplication;

