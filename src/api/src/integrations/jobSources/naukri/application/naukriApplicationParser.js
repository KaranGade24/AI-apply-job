import { naukriApplicationSelectors } from './naukriApplicationSelectors.js';

/**
 * Parses the application status of an opened Naukri job page
 * @param {import('playwright').Page} page
 * @returns {Promise<{status: string, message: string}>}
 */
export const parseApplicationStatus = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { status: 'ERROR', message: 'Page closed' };
    }

    // 1. Check if already applied
    const isAlreadyApplied = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) return true;
      const text = document.body ? document.body.innerText : '';
      return text.includes('Already Applied') || text.includes('You have applied for this job');
    }, naukriApplicationSelectors.alreadyAppliedBadge).catch(() => false);

    if (isAlreadyApplied) {
      return { status: 'ALREADY_APPLIED', message: 'Job was previously applied for on Naukri' };
    }

    // 2. Check for success notification
    const isAppliedSuccess = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) return true;
      const text = document.body ? document.body.innerText : '';
      return text.includes('Applied successfully') || text.includes('Application submitted');
    }, naukriApplicationSelectors.applyModal.successToast).catch(() => false);

    if (isAppliedSuccess) {
      return { status: 'APPLIED_SUCCESSFULLY', message: 'Application submitted successfully on Naukri' };
    }

    // 3. Check for external company redirect
    const isExternal = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el);
    }, naukriApplicationSelectors.applyModal.externalLinkMsg).catch(() => false);

    if (isExternal) {
      return { status: 'EXTERNAL_REDIRECT', message: 'Job requires applying on third-party company site' };
    }

    return { status: 'READY_TO_APPLY', message: 'Ready for application submission' };
  } catch (error) {
    return { status: 'ERROR', message: error.message };
  }
};

export default {
  parseApplicationStatus,
};
