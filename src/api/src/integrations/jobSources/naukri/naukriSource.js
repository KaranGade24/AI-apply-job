import { parseNaukriJobCard, parseNaukriJobDetails } from './naukriParser.js';
import { naukriSelectors } from './naukriSelectors.js';
import { naukriConfig } from './naukriConfig.js';
import { verifyPageIsAuthenticated, ensureAuthenticatedSession } from './naukriSessionService.js';
import { logError, logJobEvent } from '../../../utils/logger.js';
import { getExistingSourceUrls, getExistingContentFingerprints } from '../../../repositories/job.repository.js';
import { logSkippedJobService } from '../../../services/skippedApplication.service.js';

/**
 * Builds array of valid Naukri target search URLs for all keywords and locations
 * Example: https://www.naukri.com/mern-developer-jobs-in-pune?k=MERN%20Developer&l=pune&experience=0
 * @param {object} searchConfig
 * @returns {Array<{label: string, url: string}>}
 */
export const buildSearchUrls = (searchConfig = {}) => {
  const keywords = (searchConfig.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  const locations = (searchConfig.locations || []).map((l) => String(l).trim()).filter(Boolean);
  const minExp = Number(searchConfig.experience?.min ?? searchConfig.minExp ?? 0);

  const targets = [];
  const effectiveKeywords = keywords.length > 0 ? keywords : ['Software Developer'];
  const effectiveLocations = locations.length > 0 ? locations : ['India'];

  for (const kw of effectiveKeywords) {
    const kwSlug = kw.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    for (const loc of effectiveLocations) {
      const locSlug = loc.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let baseUrl = `${naukriConfig.baseUrl}/${kwSlug}-jobs-in-${locSlug}`;

      const queryParams = new URLSearchParams();
      queryParams.set('k', kw);
      if (loc && loc.toLowerCase() !== 'india') {
        queryParams.set('l', loc);
      }
      if (minExp >= 0) {
        queryParams.set('experience', String(minExp));
      }

      targets.push({
        label: `${kw} in ${loc}`,
        baseUrl,
        queryParams,
      });
    }
  }

  return targets;
};

/**
 * Builds paginated URL for a target search object
 * @param {object} targetObj
 * @param {number} pageNum
 * @returns {string}
 */
export const formatPaginatedUrl = (targetObj, pageNum = 1) => {
  let url = targetObj.baseUrl;
  if (pageNum > 1) {
    url = `${url}-${pageNum}`;
  }
  const qStr = targetObj.queryParams.toString();
  return qStr ? `${url}?${qStr}` : url;
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
    await page.waitForSelector('a.title, a[href*="/job-listings-"], .srp-jobtuple-wrapper, article.jobTuple', { timeout: 4000 }).catch(() => {});
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

    const urls = await page.evaluate(({ maxLimit }) => {
      const links = new Set();
      const selectors = [
        'a.title',
        'a.job-title',
        'a[href*="/job-listings-"]',
        '.title.fw500',
        'h2.title a',
        'a[href*="naukri.com/job-listings"]',
      ];

      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
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
      }
      return Array.from(links);
    }, { maxLimit: limit }).catch(() => []);

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

    const searchTargets = buildSearchUrls(searchConfig);
    const maxPages = naukriConfig.pagination.maxPages;

    await logJobEvent(
      'naukriSource.discoverJobs',
      'START',
      `Initiating Naukri discovery across ${searchTargets.length} query targets (scrape limit: ${maxJobs})`
    );

    // Ensure authenticated session before running search (auto-logins if unauthenticated)
    const authCheck = await ensureAuthenticatedSession(page, searchConfig.userId);
    if (!authCheck.isAuthenticated) {
      await logJobEvent('naukriSource.discoverJobs', 'WARNING', `Naukri session is unauthenticated or expired (${authCheck.statusReason})`);
      throw new Error(`AUTHENTICATION_REQUIRED: Naukri session is ${authCheck.statusReason}. Please connect your Naukri account.`);
    }

    // 1. Scan SRP pages across query targets sequentially to gather unscraped target URLs
    for (let tIndex = 0; tIndex < searchTargets.length; tIndex++) {
      if (newTargetUrls.length >= maxJobs) break;

      const targetObj = searchTargets[tIndex];
      let pageNum = 1;

      while (newTargetUrls.length < maxJobs && pageNum <= maxPages) {
        if (searchConfig.abortSignal?.aborted) {
          await logJobEvent('naukriSource.discoverJobs', 'CANCELLED', 'Naukri discovery cancelled by user');
          throw new Error('JOB_DISCOVERY_ABORTED');
        }

        const srpUrl = formatPaginatedUrl(targetObj, pageNum);
        await logJobEvent('naukriSource.discoverJobs', 'PROGRESS', `[Query ${tIndex + 1}/${searchTargets.length}] Scanning Naukri page ${pageNum}: ${srpUrl}`);

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
