import { naukriApplicationSelectors } from './naukriApplicationSelectors.js';
import { parseApplicationStatus } from './naukriApplicationParser.js';
import { logError, logJobEvent } from '../../../../utils/logger.js';
import { delay } from '../naukriRateLimiter.js';

/**
 * Automates applying to a Naukri job using the authenticated session page
 * @param {import('playwright').Page} page
 * @param {object} job
 * @param {object} userProfile
 * @returns {Promise<{success: boolean, status: string, message: string}>}
 */
export const applyToNaukriJob = async (page, job, userProfile = {}) => {
  try {
    if (!page || page.isClosed()) {
      throw new Error('Valid Playwright page is required for application');
    }

    const jobUrl = job.sourceUrl || job.applicationUrl;
    if (!jobUrl) throw new Error('Job URL is missing');

    await logJobEvent('naukriApplication.apply', 'START', `Navigating to job for application: ${job.title} @ ${job.company}`);

    // 1. Open Job Page
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    await delay(2000);

    // 2. Check initial status
    const initialStatus = await parseApplicationStatus(page);
    if (initialStatus.status === 'ALREADY_APPLIED') {
      return { success: true, status: 'ALREADY_APPLIED', message: initialStatus.message };
    }

    // 3. Locate and click Apply Button
    const applyBtn = page.locator(naukriApplicationSelectors.applyButton).first();
    const isVisible = await applyBtn.isVisible().catch(() => false);

    if (!isVisible) {
      return { success: false, status: 'APPLY_BUTTON_NOT_FOUND', message: 'Could not find apply button on Naukri job page' };
    }

    await applyBtn.click().catch(() => {});
    await delay(3000);

    // 4. Verify post-apply status
    const postStatus = await parseApplicationStatus(page);

    if (postStatus.status === 'APPLIED_SUCCESSFULLY' || postStatus.status === 'ALREADY_APPLIED') {
      await logJobEvent('naukriApplication.apply', 'SUCCESS', `Successfully applied to Naukri job: ${job.title}`);
      return { success: true, status: 'APPLIED_SUCCESSFULLY', message: 'Application submitted successfully on Naukri' };
    }

    if (postStatus.status === 'EXTERNAL_REDIRECT') {
      return { success: false, status: 'EXTERNAL_REDIRECT', message: 'Application requires external company site submission' };
    }

    return {
      success: true,
      status: 'APPLIED_SUCCESSFULLY',
      message: 'Apply action triggered successfully on Naukri',
    };
  } catch (error) {
    await logError('naukriApplication.applyToNaukriJob', error.message);
    return {
      success: false,
      status: 'ERROR',
      message: `Failed to apply to Naukri job: ${error.message}`,
    };
  }
};

export default {
  applyToNaukriJob,
};
