import { logJobEvent } from '../../../utils/logger.js';

/**
 * Attaches a secure dialog handler to a Playwright page.
 * Logs dialog events without auto-accepting any dialog that could submit form data or leak information.
 *
 * @param {import('playwright').Page} page
 * @param {string} [applicationId]
 */
export const attachDialogHandler = (page, applicationId = '') => {
  if (!page || typeof page.on !== 'function') return;

  page.on('dialog', async (dialog) => {
    try {
      const dialogType = dialog.type(); // 'alert', 'confirm', 'prompt', 'beforeunload'
      const rawMessage = dialog.message() || '';
      // Sanitize dialog message for logging (logger will redact secrets)
      const logContext = applicationId ? `application:${applicationId}` : 'browserSession';

      if (dialogType === 'alert') {
        // Informational alert — safe to accept after logging
        await logJobEvent(
          'browserDialog',
          'ALERT_ACCEPTED',
          `[${logContext}] Browser alert observed: "${rawMessage}". Accepted.`
        );
        await dialog.accept().catch(() => {});
      } else {
        // confirm, prompt, beforeunload — dismiss by default to prevent accidental data submission
        await logJobEvent(
          'browserDialog',
          'DIALOG_DISMISSED',
          `[${logContext}] Browser ${dialogType} observed: "${rawMessage}". Dismissed for submission safety.`
        );
        await dialog.dismiss().catch(() => {});
      }
    } catch (error) {
      // Non-blocking fallback
      await dialog.dismiss().catch(() => {});
    }
  });
};

export default attachDialogHandler;
