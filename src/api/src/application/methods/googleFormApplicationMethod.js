import { logJobEvent, logError } from '../../utils/logger.js';
import { BrowserManager } from '../../browser/browserManager.js';
import {
  extractGoogleFormFields,
  resolveGoogleFormAnswers,
  fillGoogleFormFields,
  submitGoogleForm,
} from '../googleForm/googleFormFiller.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { updateApplicationStatus, updateApplicationResume } from '../../repositories/application.repository.js';
import { getGeminiModel } from '../../agent/config/modelConfig.js';

/**
 * Runs the Google Form application method.
 *
 * Steps:
 * 1. Open the Google Form URL in a browser.
 * 2. Check if form is still accepting responses (not closed).
 * 3. Extract all form fields using DOM scraping.
 * 4. Use LLM to resolve best answers for each field based on candidate resume & job context.
 * 5. If a resume/file upload field is detected, use the tailored resume PDF.
 * 6. Fill the form fields using Playwright automation.
 * 7. Submit the form.
 * 8. Update application status accordingly.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.googleFormUrl - Direct Google Form URL
 * @param {object} params.candidateInfo - Candidate resume data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @param {string} [params.resumePdfPath] - Path to tailored resume PDF
 * @returns {Promise<{ success: boolean, submitted: boolean, filledCount: number, message: string, formClosed: boolean }>}
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
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FILLING_FORM, {
        logMessage: `Filling Google Form: ${googleFormUrl}`,
      });
    }

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(browser, {});
    page = await context.newPage();

    await page.goto(googleFormUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(3000);

    // Check if form is closed / expired
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
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
          logMessage: `Google Form is closed and no longer accepting responses.`,
        });
      }
      return {
        success: false,
        submitted: false,
        filledCount: 0,
        formClosed: true,
        message: 'Google Form is closed and no longer accepting responses.',
      };
    }

    // Extract fields
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
        message: 'No form fields detected. Page may have loaded incorrectly.',
      };
    }

    // Check if resume upload field exists — tailor resume only if resume field exists
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

    // Resolve answers via LLM
    const model = await getGeminiModel(userId);
    const answers = await resolveGoogleFormAnswers(fields, candidateInfo, jobDetails, model);

    // Fill form fields
    const fillResult = await fillGoogleFormFields(page, fields, answers, effectiveResumePdfPath);

    await page.waitForTimeout(1000);

    // Submit form
    const submitResult = await submitGoogleForm(page);

    if (applicationId) {
      await updateApplicationStatus(
        applicationId,
        submitResult.submitted ? APPLICATION_STATUS.APPLIED : APPLICATION_STATUS.WAITING_FOR_REVIEW,
        {
          logMessage: submitResult.submitted
            ? `Google Form submitted successfully. Filled ${fillResult.filledCount} fields.`
            : `Google Form filled (${fillResult.filledCount} fields) but could not confirm submission.`,
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
      message: error.message,
    };
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};
