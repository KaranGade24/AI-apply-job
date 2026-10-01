import { getSession, createSession, closeSession, getActivePage, waitForSettled } from '../../browser/session/sessionRegistry.js';
import { generateReviewHash, verifySubmission } from './submissionService.js';
import { updateApplicationStatus, findApplicationById } from '../../repositories/application.repository.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';
import { appError } from '../../utils/errors.js';

/**
 * Executes secure human-confirmed form submission for unknown/portal methods.
 */
export const confirmFinalUnknownApplicationService = async (applicationId, userId, payload = {}) => {
  try {
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError("Application not found", 404);
    }

    await logJobEvent(
      'confirmFinalUnknown',
      'START',
      `Triggering final submission execution for application: ${applicationId}`
    );

    // 1. Get or restore the active browser session
    let session = getSession(applicationId);
    if (!session) {
      await logJobEvent('confirmFinalUnknown', 'RESTORE_SESSION', 'Active browser session gone. Restoring and re-observing...');
      const storageState = application.form?.storageState ? JSON.parse(application.form.storageState) : null;
      session = await createSession(applicationId, userId, { storageState });
    }

    const page = getActivePage(session);
    if (!page || page.isClosed()) {
      throw new Error('Active page is closed or unavailable for submission');
    }

    // Re-verify/navigate to make sure we are on the form page
    const currentUrl = page.url();
    if (currentUrl === 'about:blank' && application.unknownPageResult?.pageUrl) {
      await page.goto(application.unknownPageResult.pageUrl, { waitUntil: 'domcontentloaded' });
      await waitForSettled(page);
    }

    // 2. Locate and trigger click on the live submit/apply button
    const submitLocators = [
      page.locator('button[type="submit"], input[type="submit"]').first(),
      page.locator('button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send")').first(),
    ];

    let clicked = false;
    for (const loc of submitLocators) {
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        await logJobEvent('confirmFinalUnknown', 'CLICK_SUBMIT', 'Clicking submit button on live form...');
        await loc.click({ timeout: 5000 }).catch(async () => {
          await loc.click({ force: true }).catch(() => {});
        });
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      throw new Error('Submit/Apply button could not be located on the current view state');
    }

    await page.waitForTimeout(2000).catch(() => {});
    await waitForSettled(page);

    // 3. Verify actual outcome
    const verifyResult = await verifySubmission(page);
    await logJobEvent('confirmFinalUnknown', 'VERIFIED_OUTCOME', `Verification outcome: ${verifyResult.outcome}`);

    // Update statuses based on exact outcome
    if (verifyResult.success && verifyResult.outcome === 'SUBMITTED') {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.SENT, {
        logMessage: `Form submission verified successfully. Text: "${verifyResult.confirmationText}"`
      });
      // Close session on success
      await closeSession(applicationId).catch(() => {});
    } else {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Form submission verification failed. Outcome: ${verifyResult.outcome}. Error: ${verifyResult.confirmationText}`
      });
      // Close session on failure
      await closeSession(applicationId).catch(() => {});
    }

    return await findApplicationById(applicationId);
  } catch (error) {
    await logError('confirmFinalUnknownApplicationService', error.message);
    await closeSession(applicationId).catch(() => {});
    throw error;
  }
};

export default {
  confirmFinalUnknownApplicationService
};
