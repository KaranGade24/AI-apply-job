import { parseJobCard, parseJobDetails } from './jobViaReferralParser.js';
import { JOB_VIA_REFERRAL_SELECTORS } from './jobViaReferralSelectors.js';
import { SCRAPER_DEFAULTS } from '../../constant/job.constant.js';
import { JOB_VIA_REFERRAL_CATEGORIES } from '../../constant/jobViaReferral.constant.js';
import { logError } from '../../utils/logger.js';

/**
 * Navigates to JobViaReferral target category or homepage
 * @param {import('playwright').Page} page
 * @param {string} categoryUrl
 */
export const openJobViaReferral = async (
  page,
  categoryUrl = JOB_VIA_REFERRAL_CATEGORIES.FRESHER_REFERRAL
) => {
  try {
    await page.goto(categoryUrl, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_DEFAULTS.NAVIGATION_TIMEOUT_MS
    });
    await page.waitForTimeout(SCRAPER_DEFAULTS.WAIT_AFTER_PAGE_LOAD_MS);
  } catch (error) {
    await logError('jobViaReferralSource.openJobViaReferral', error.message);
    throw error;
  }
};

/**
 * Finds and extracts job URLs from the current listing page
 * @param {import('playwright').Page} page
 * @param {object} searchConfig
 * @returns {Promise<string[]>} List of individual job detail URLs
 */
export const getJobListingUrls = async (page, searchConfig = {}) => {
  try {
    const limit = searchConfig.maxJobs || SCRAPER_DEFAULTS.MAX_JOBS_PER_RUN;
    const cardLocators = page.locator(JOB_VIA_REFERRAL_SELECTORS.jobCards);
    const count = await cardLocators.count();

    const jobUrls = new Set();

    for (let i = 0; i < count && jobUrls.size < limit; i++) {
      const cardLocator = cardLocators.nth(i);
      const cardData = await parseJobCard(cardLocator);
      if (cardData?.url) {
        jobUrls.add(cardData.url);
      }
    }

    return Array.from(jobUrls);
  } catch (error) {
    await logError('jobViaReferralSource.getJobListingUrls', error.message);
    return [];
  }
};

/**
 * Navigates to an individual job detail page
 * @param {import('playwright').Page} page
 * @param {string} jobUrl
 */
export const openJobDetails = async (page, jobUrl) => {
  try {
    await page.goto(jobUrl, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_DEFAULTS.NAVIGATION_TIMEOUT_MS
    });
    await page.waitForTimeout(1000);
  } catch (error) {
    await logError('jobViaReferralSource.openJobDetails', error.message);
    throw error;
  }
};

/**
 * Main Orchestrator: Discovers and extracts normalized job listings from JobViaReferral
 * @param {import('playwright').Page} page - Active Playwright page instance
 * @param {object} searchConfig - Scraper options (categoryUrl, maxJobs, etc.)
 * @returns {Promise<Array<object>>} List of normalized job objects
 */
export const discoverJobs = async (page, searchConfig = {}) => {
  try {
    const categoryUrl = searchConfig.categoryUrl || JOB_VIA_REFERRAL_CATEGORIES.FRESHER_REFERRAL;
    const maxJobs = searchConfig.maxJobs || SCRAPER_DEFAULTS.MAX_JOBS_PER_RUN;

    // 1. Open JobViaReferral category page
    await openJobViaReferral(page, categoryUrl);

    // 2. Collect job detail URLs from listing
    const jobUrls = await getJobListingUrls(page, { maxJobs });

    const discoveredJobs = [];

    // 3. Open each job detail page and parse structured job data
    for (const jobUrl of jobUrls) {
      if (discoveredJobs.length >= maxJobs) break;

      try {
        await openJobDetails(page, jobUrl);
        const jobData = await parseJobDetails(page, jobUrl);
        discoveredJobs.push(jobData);
      } catch (itemError) {
        await logError('jobViaReferralSource.discoverJobs.item', itemError.message);
      }
    }

    return discoveredJobs;
  } catch (error) {
    await logError('jobViaReferralSource.discoverJobs', error.message);
    return [];
  }
};

export default {
  openJobViaReferral,
  getJobListingUrls,
  openJobDetails,
  discoverJobs
};
