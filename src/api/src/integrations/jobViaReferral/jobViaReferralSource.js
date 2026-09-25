import { parseJobCard, parseJobDetails } from './jobViaReferralParser.js';
import { JOB_VIA_REFERRAL_SELECTORS } from './jobViaReferralSelectors.js';
import { SCRAPER_DEFAULTS } from '../../constant/job.constant.js';
import { JOB_VIA_REFERRAL_CATEGORIES } from '../../constant/jobViaReferral.constant.js';
import { logError, logJobEvent } from '../../utils/logger.js';
import { getExistingSourceUrls } from '../../repositories/job.repository.js';

/**
 * Navigates to JobViaReferral target category page quickly
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
      timeout: 8000
    });
    await page.waitForSelector('h2 a, .gb-text a', { timeout: 3000 }).catch(() => {});
  } catch (error) {
    await logError('jobViaReferralSource.openJobViaReferral', error.message);
  }
};

/**
 * Finds and extracts job URLs from the current listing page in milliseconds
 * @param {import('playwright').Page} page
 * @param {object} searchConfig
 * @returns {Promise<string[]>} List of individual job detail URLs
 */
export const getJobListingUrls = async (page, searchConfig = {}) => {
  try {
    const limit = searchConfig.maxJobs || SCRAPER_DEFAULTS.MAX_JOBS_PER_RUN;

    const urls = await page.evaluate((maxLimit) => {
      const links = new Set();
      const elements = document.querySelectorAll(
        'h2.gb-text a, h2 a, .gb-text a, header h2 a, main a'
      );
      for (const el of elements) {
        const href = el.href || el.getAttribute('href');
        if (!href) continue;
        const normalized = href.trim();
        if (
          normalized.includes('/category/') ||
          normalized.includes('/page/') ||
          normalized.includes('/tag/') ||
          normalized.includes('/author/') ||
          normalized.includes('/privacy-policy') ||
          normalized.includes('/terms') ||
          normalized.includes('/about') ||
          normalized.includes('/contact') ||
          normalized.includes('/feed/') ||
          normalized.includes('/wp-') ||
          normalized.endsWith('/#')
        ) {
          continue;
        }
        if (normalized.startsWith('http') && normalized.includes('jobviareferral.com/')) {
          links.add(normalized);
          if (links.size >= maxLimit) break;
        }
      }
      return Array.from(links);
    }, limit);

    return urls;
  } catch (error) {
    await logError('jobViaReferralSource.getJobListingUrls', error.message);
    return [];
  }
};

/**
 * Navigates to an individual job detail page fast
 * @param {import('playwright').Page} page
 * @param {string} jobUrl
 */
export const openJobDetails = async (page, jobUrl) => {
  try {
    await page.goto(jobUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 6000
    });
  } catch (error) {
    await logError('jobViaReferralSource.openJobDetails', error.message);
    throw error;
  }
};

/**
 * Main Orchestrator: Discovers and extracts normalized job listings from JobViaReferral
 * Pre-filters existing/skipped URLs in DB before opening detail pages to avoid re-scraping and unnecessary API usage.
 * @param {import('playwright').Page} page - Active Playwright page instance
 * @param {object} searchConfig - Scraper options (categoryUrl, maxJobs, etc.)
 * @returns {Promise<Array<object>>} List of normalized job objects
 */
export const discoverJobs = async (page, searchConfig = {}) => {
  try {
    const baseCategoryUrl = searchConfig.categoryUrl || JOB_VIA_REFERRAL_CATEGORIES.FRESHER_REFERRAL;
    const maxJobs = searchConfig.maxJobs || SCRAPER_DEFAULTS.MAX_JOBS_PER_RUN;

    const newTargetUrls = [];
    let pageNum = 1;
    const MAX_PAGES_TO_SCAN = 10;

    // Scan listing pages until we find unscraped target URLs
    while (newTargetUrls.length < maxJobs && pageNum <= MAX_PAGES_TO_SCAN) {
      const currentCategoryUrl = pageNum === 1
        ? baseCategoryUrl
        : `${baseCategoryUrl.replace(/\/$/, '')}/page/${pageNum}/`;

      await logJobEvent('discoverJobs', 'PROGRESS', `Scanning category listing page ${pageNum}: ${currentCategoryUrl}`);
      await openJobViaReferral(page, currentCategoryUrl);

      const listingUrls = await getJobListingUrls(page, { maxJobs: 20 });
      if (listingUrls.length === 0) break;

      // Query DB for existing jobs or skipped jobs
      const existingUrlsSet = await getExistingSourceUrls(listingUrls);
      const unscrapedUrls = listingUrls.filter((url) => !existingUrlsSet.has(url));

      const skippedInBatch = listingUrls.length - unscrapedUrls.length;
      if (skippedInBatch > 0) {
        await logJobEvent(
          'discoverJobs',
          'PROGRESS',
          `Skipped ${skippedInBatch} previously processed/skipped URLs on page ${pageNum}`
        );
      }

      for (const url of unscrapedUrls) {
        if (!newTargetUrls.includes(url) && newTargetUrls.length < maxJobs) {
          newTargetUrls.push(url);
        }
      }

      pageNum++;
    }

    await logJobEvent(
      'discoverJobs',
      'PROGRESS',
      `Identified ${newTargetUrls.length} new unscraped job posting URLs`
    );

    if (newTargetUrls.length === 0) {
      await logJobEvent('discoverJobs', 'SUCCESS', 'No new unscraped jobs found on current category pages.');
      return [];
    }

    const context = page.context();
    const discoveredJobs = [];

    // Scrape job detail pages with a 1-2 second delay in between jobs (not at the start)
    for (let i = 0; i < newTargetUrls.length; i++) {
      const jobUrl = newTargetUrls[i];
      let detailPage = null;
      try {
        detailPage = await context.newPage();
        await detailPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const jobData = await parseJobDetails(detailPage, jobUrl);
        if (jobData && jobData.title) {
          discoveredJobs.push(jobData);
          await logJobEvent(
            'discoverJobs',
            'PROGRESS',
            `[${discoveredJobs.length}/${newTargetUrls.length}] Scraped new job: ${jobData.title} @ ${jobData.company}`
          );
        }
      } catch (itemError) {
        await logError('jobViaReferralSource.discoverJobs.item', itemError.message);
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }

      // 1 to 2 sec delay in between jobs (never at start or after last item)
      if (i < newTargetUrls.length - 1) {
        const delayMs = Math.floor(Math.random() * 1000) + 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
