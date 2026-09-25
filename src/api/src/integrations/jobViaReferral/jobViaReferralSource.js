import { parseJobCard, parseJobDetails } from './jobViaReferralParser.js';
import { JOB_VIA_REFERRAL_SELECTORS } from './jobViaReferralSelectors.js';
import { SCRAPER_DEFAULTS } from '../../constant/job.constant.js';
import { JOB_VIA_REFERRAL_CATEGORIES } from '../../constant/jobViaReferral.constant.js';
import { logError, logJobEvent } from '../../utils/logger.js';
import { getExistingSourceUrls } from '../../repositories/job.repository.js';
import { resolveJobSearchUrlsWithAI } from '../../agent/tools/jobUrlResolver.tool.js';

/**
 * Constructs clean, paginated WordPress URLs for category and search query endpoints
 * @param {string} targetUrl - Target URL (e.g. https://jobviareferral.com/?s=QA+Tester or https://jobviareferral.com/category/qa-referral-jobs/)
 * @param {number} pageNum - 1-based page number
 */
export const formatListingPageUrl = (targetUrl, pageNum) => {
  if (pageNum === 1) return targetUrl;

  if (targetUrl.includes('?')) {
    const [base, query] = targetUrl.split('?');
    const cleanBase = base.replace(/\/$/, '');
    return `${cleanBase}/page/${pageNum}/?${query}`;
  }

  const cleanBase = targetUrl.replace(/\/$/, '');
  return `${cleanBase}/page/${pageNum}/`;
};

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
 * Uses AI URL Resolver to prioritize search & category URLs. Executes queries sequentially
 * and stops as soon as target unscraped job limit is met.
 * @param {import('playwright').Page} page - Active Playwright page instance
 * @param {object} searchConfig - Scraper options (keywords, locations, experience, maxJobs, etc.)
 * @returns {Promise<Array<object>>} List of normalized job objects
 */
export const discoverJobs = async (page, searchConfig = {}) => {
  try {
    const maxJobs = searchConfig.maxJobs || SCRAPER_DEFAULTS.MAX_JOBS_PER_RUN;

    // 1. Resolve prioritized search & category URLs via AI decision engine
    let targetStrategy = null;
    if (searchConfig.categoryUrl) {
      targetStrategy = {
        resolvedUrls: [{ url: searchConfig.categoryUrl, label: 'Custom Selected Category', priority: 1 }],
        reasoning: 'User explicitly specified target category URL.'
      };
    } else {
      targetStrategy = await resolveJobSearchUrlsWithAI(searchConfig);
    }

    const resolvedUrls = targetStrategy.resolvedUrls || [];
    await logJobEvent(
      'discoverJobs',
      'START',
      `Executing search strategy with ${resolvedUrls.length} prioritized URL target(s). Reason: ${targetStrategy.reasoning}`
    );

    const newTargetUrls = [];

    // 2. Process query/category URLs sequentially one by one
    for (let qIndex = 0; qIndex < resolvedUrls.length; qIndex++) {
      const targetObj = resolvedUrls[qIndex];
      const baseUrl = targetObj.url;

      await logJobEvent(
        'discoverJobs',
        'PROGRESS',
        `[Query ${qIndex + 1}/${resolvedUrls.length}] Processing: ${targetObj.label} -> ${baseUrl}`
      );

      let pageNum = 1;
      const MAX_PAGES_PER_URL = 5;

      while (newTargetUrls.length < maxJobs && pageNum <= MAX_PAGES_PER_URL) {
        const currentListingUrl = formatListingPageUrl(baseUrl, pageNum);

        await logJobEvent(
          'discoverJobs',
          'PROGRESS',
          `Scanning page ${pageNum}: ${currentListingUrl}`
        );
        await openJobViaReferral(page, currentListingUrl);

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

      // Early Termination Rule: If query 1 (or current query) successfully found target unscraped jobs, STOP and do not execute next query!
      if (newTargetUrls.length >= maxJobs) {
        await logJobEvent(
          'discoverJobs',
          'PROGRESS',
          `Target limit reached (${newTargetUrls.length}/${maxJobs}). Stopping search sequence early after Query ${qIndex + 1}.`
        );
        break;
      }
    }

    await logJobEvent(
      'discoverJobs',
      'PROGRESS',
      `Identified ${newTargetUrls.length} new unscraped job posting URLs`
    );

    if (newTargetUrls.length === 0) {
      await logJobEvent('discoverJobs', 'SUCCESS', 'No new unscraped jobs found on target search URLs.');
      return [];
    }

    const context = page.context();
    const discoveredJobs = [];

    // 3. Scrape detail pages for the identified unscraped URLs
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

      // 1 to 2 sec delay in between jobs
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
