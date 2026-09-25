import { parseNaukriJobCard, parseNaukriJobDetails } from './naukriParser.js';
import { naukriSelectors } from './naukriSelectors.js';
import { naukriConfig } from './naukriConfig.js';
import { logError, logJobEvent } from '../../../utils/logger.js';
import { getExistingSourceUrls, getExistingContentFingerprints } from '../../../repositories/job.repository.js';
import { logSkippedJobService } from '../../../services/skippedApplication.service.js';

/**
 * Builds valid Naukri search URLs dynamically from search configuration
 * Example: https://www.naukri.com/mern-developer-jobs-in-pune?experience=1
 * @param {object} searchConfig
 * @param {number} pageNum
 * @returns {string} Target Naukri SRP URL
 */
export const buildSearchUrl = (searchConfig = {}, pageNum = 1) => {
  const keywords = (searchConfig.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  const locations = (searchConfig.locations || []).map((l) => String(l).trim()).filter(Boolean);
  const minExp = Number(searchConfig.experience?.min ?? searchConfig.minExp ?? 0);

  const primaryKw = keywords[0] || 'software-developer';
  const kwSlug = primaryKw.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let url = `${naukriConfig.baseUrl}/${kwSlug}-jobs`;

  if (locations.length > 0) {
    const locSlug = locations[0].toLowerCase().replace(/[^a-z0-9]+/g, '-');
    url = `${naukriConfig.baseUrl}/${kwSlug}-jobs-in-${locSlug}`;
  }

  if (pageNum > 1) {
    url = `${url}-${pageNum}`;
  }

  const queryParams = new URLSearchParams();
  if (minExp >= 0) {
    queryParams.set('experience', String(minExp));
  }

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
};

/**
 * Navigates safely to a Naukri listing or search page
 * @param {import('playwright').Page} page
 * @param {string} targetUrl
 */
export const open = async (page, targetUrl) => {
  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 12000,
    }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForSelector(naukriSelectors.jobList.jobCard, { timeout: 4000 }).catch(() => {});
  } catch (error) {
    await logError('naukriSource.open', error.message);
  }
};

/**
 * Extracts job listing URLs from Naukri search results
 * @param {import('playwright').Page} page
 * @param {object} searchConfig
 * @returns {Promise<string[]>}
 */
export const getJobListingUrls = async (page, searchConfig = {}) => {
  try {
    if (page.isClosed()) return [];
    const limit = searchConfig.maxJobs || naukriConfig.safetyLimits.maxJobsPerRun;

    const urls = await page.evaluate(({ selectors, maxLimit }) => {
      const links = new Set();
      const elements = document.querySelectorAll(selectors.jobList.jobTitle);

      for (const el of elements) {
        const href = el.href || el.getAttribute('href');
        if (!href) continue;
        const normalized = href.trim();

        if (
          normalized.startsWith('http') &&
          normalized.includes('naukri.com') &&
          !normalized.includes('/login') &&
          !normalized.includes('/register') &&
          !normalized.includes('/faq')
        ) {
          links.add(normalized);
          if (links.size >= maxLimit) break;
        }
      }
      return Array.from(links);
    }, { selectors: naukriSelectors, maxLimit: limit }).catch(() => []);

    return urls;
  } catch (error) {
    await logError('naukriSource.getJobListingUrls', error.message);
    return [];
  }
};

/**
 * Opens and parses an individual Naukri job detail page
 * @param {import('playwright').Page} page
 * @param {string} jobUrl
 * @returns {Promise<object|null>}
 */
export const openJobDetails = async (page, jobUrl) => {
  try {
    await page.goto(jobUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    return await parseNaukriJobDetails(page, jobUrl);
  } catch (error) {
    await logError('naukriSource.openJobDetails', error.message);
    return null;
  }
};

/**
 * Main Orchestrator: Discovers and extracts normalized jobs from Naukri
 * @param {import('playwright').Page} page
 * @param {object} searchConfig
 * @returns {Promise<Array<object>>}
 */
export const discoverJobs = async (page, searchConfig = {}) => {
  try {
    const maxJobs = searchConfig.maxJobs || naukriConfig.safetyLimits.maxJobsPerRun;
    const newTargetUrls = [];

    let pageNum = 1;
    const maxPages = naukriConfig.pagination.maxPages;

    await logJobEvent('naukriSource.discoverJobs', 'START', `Initiating Naukri job discovery (limit: ${maxJobs})`);

    // 1. Scan SRP pages to gather unscraped target URLs
    while (newTargetUrls.length < maxJobs && pageNum <= maxPages) {
      if (searchConfig.abortSignal?.aborted) {
        await logJobEvent('naukriSource.discoverJobs', 'CANCELLED', 'Naukri discovery cancelled by user');
        throw new Error('JOB_DISCOVERY_ABORTED');
      }

      const srpUrl = buildSearchUrl(searchConfig, pageNum);
      await logJobEvent('naukriSource.discoverJobs', 'PROGRESS', `Scanning Naukri page ${pageNum}: ${srpUrl}`);

      await open(page, srpUrl);

      const listingUrls = await getJobListingUrls(page, { maxJobs: 20 });
      if (listingUrls.length === 0) break;

      const existingUrlsSet = await getExistingSourceUrls(listingUrls);
      const unscrapedUrls = listingUrls.filter((url) => {
        const norm = url.trim().toLowerCase().replace(/\/$/, '');
        return !existingUrlsSet.has(url) && !existingUrlsSet.has(norm);
      });

      const skippedInBatch = listingUrls.length - unscrapedUrls.length;
      if (skippedInBatch > 0) {
        await logJobEvent(
          'naukriSource.discoverJobs',
          'PROGRESS',
          `Skipped ${skippedInBatch} previously processed Naukri URLs on page ${pageNum}`
        );
      }

      for (const url of unscrapedUrls) {
        const norm = url.trim().toLowerCase().replace(/\/$/, '');
        const exists = newTargetUrls.some((u) => u.trim().toLowerCase().replace(/\/$/, '') === norm);
        if (!exists && newTargetUrls.length < maxJobs) {
          newTargetUrls.push(url);
        }
      }

      pageNum++;
    }

    await logJobEvent(
      'naukriSource.discoverJobs',
      'PROGRESS',
      `Identified ${newTargetUrls.length} new unscraped Naukri job URLs`
    );

    if (newTargetUrls.length === 0) {
      return [];
    }

    const context = page.context();
    const discoveredJobs = [];
    const existingFingerprints = await getExistingContentFingerprints();

    // 2. Scrape individual detail pages with rate-limiting delays
    for (let i = 0; i < newTargetUrls.length; i++) {
      if (searchConfig.abortSignal?.aborted) {
        await logJobEvent('naukriSource.discoverJobs', 'CANCELLED', 'Scraping aborted by user');
        throw new Error('JOB_DISCOVERY_ABORTED');
      }

      const jobUrl = newTargetUrls[i];
      let detailPage = null;

      try {
        detailPage = await context.newPage();
        const jobData = await openJobDetails(detailPage, jobUrl);

        if (jobData && jobData.title) {
          const cleanTitle = jobData.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanCompany = (jobData.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const fp = `${cleanTitle}::${cleanCompany}`;

          if (existingFingerprints.has(fp)) {
            await logJobEvent(
              'naukriSource.discoverJobs',
              'PROGRESS',
              `Skipped duplicate content posting on Naukri: "${jobData.title}" @ "${jobData.company}"`
            );
            if (searchConfig.userId) {
              await logSkippedJobService({
                userId: searchConfig.userId,
                job: jobData,
                skipReason: 'ALREADY_EXISTS',
                skipDetails: `Duplicate Naukri content already exists: ${jobData.title} @ ${jobData.company}`
              }).catch(() => {});
            }
          } else {
            existingFingerprints.add(fp);
            discoveredJobs.push(jobData);
            await logJobEvent(
              'naukriSource.discoverJobs',
              'PROGRESS',
              `[${discoveredJobs.length}/${newTargetUrls.length}] Scraped Naukri job: ${jobData.title} @ ${jobData.company}`
            );
          }
        }
      } catch (itemError) {
        await logError('naukriSource.discoverJobs.item', itemError.message);
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }

      // Conservative rate limiting delay between jobs (1.5s to 3.5s)
      if (i < newTargetUrls.length - 1) {
        const delayMs = Math.floor(Math.random() * (naukriConfig.rateLimit.maxDelayMs - naukriConfig.rateLimit.minDelayMs)) + naukriConfig.rateLimit.minDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return discoveredJobs;
  } catch (error) {
    await logError('naukriSource.discoverJobs', error.message);
    return [];
  }
};

export class NaukriSource {
  constructor({ page } = {}) {
    this.page = page;
  }

  async open(url) {
    return await open(this.page, url);
  }

  async getJobListingUrls(searchConfig) {
    return await getJobListingUrls(this.page, searchConfig);
  }

  async openJobDetails(jobUrl) {
    return await openJobDetails(this.page, jobUrl);
  }

  async discoverJobs(searchConfig) {
    return await discoverJobs(this.page, searchConfig);
  }
}

export default NaukriSource;
