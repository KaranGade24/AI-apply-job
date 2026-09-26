import { detectNaukriAuthState } from './naukriAuthDetector.js';
import { mapUniversalFiltersToNaukri } from './naukriSearchMapper.js';
import { parseNaukriJobDetails } from './naukriParser.js';
import { NAUKRI_SELECTORS, NAUKRI_URLS } from '../../../constant/naukri.constant.js';
import { logJobEvent, logError } from '../../../utils/logger.js';
import { getExistingSourceUrls } from '../../../repositories/job.repository.js';
import { logSkippedJobService } from '../../../services/skippedApplication.service.js';

/**
 * Searches and scrapes jobs from Naukri using an authenticated Playwright page
 * @param {import('playwright').Page} page - Authenticated Playwright page instance
 * @param {object} searchConfig
 * @returns {Promise<Array<object>>} List of normalized job objects
 */
export const discoverJobs = async (page, searchConfig = {}) => {
  try {
    if (!page || page.isClosed()) {
      throw new Error('Playwright page is closed or invalid.');
    }

    const maxJobs = searchConfig.maxJobs || 15;

    // 1. Critical Step 16: Verify authentication state before proceeding to discovery
    await logJobEvent('naukriSource.discoverJobs', 'START', 'Verifying Naukri authentication state prior to search...');
    const authState = await detectNaukriAuthState(page);

    if (!authState.authenticated) {
      await logJobEvent(
        'naukriSource.discoverJobs',
        'AUTH_ERROR',
        'Naukri session is not authenticated. Aborting job discovery.'
      );
      throw new Error(
        'NAUKRI_AUTHENTICATION_REQUIRED: Valid authenticated Naukri session is required to search jobs. Please connect or reconnect your Naukri account.'
      );
    }

    await logJobEvent(
      'naukriSource.discoverJobs',
      'AUTH_OK',
      `Authenticated session verified. User: ${authState.userDetails?.name || 'Active'}`
    );

    // 2. Map universal search filters to Naukri query URL
    const { targetUrl } = mapUniversalFiltersToNaukri(searchConfig);
    await logJobEvent('naukriSource.discoverJobs', 'NAVIGATE', `Navigating to Naukri search: ${targetUrl}`);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    // Wait for search result job containers
    await page.waitForSelector(NAUKRI_SELECTORS.JOB_CONTAINER, { timeout: 8000 }).catch(() => {});

    // 3. Extract Job Listing URLs from the search results
    const listingUrls = await page.evaluate((selector) => {
      const links = new Set();
      const jobCards = document.querySelectorAll(selector);

      for (const card of jobCards) {
        const linkEl = card.querySelector('a.title, a[class*="title"], h2 a');
        if (linkEl && linkEl.href && linkEl.href.includes('naukri.com/job-listings')) {
          links.add(linkEl.href);
        }
      }

      return Array.from(links);
    }, NAUKRI_SELECTORS.JOB_CONTAINER);

    await logJobEvent(
      'naukriSource.discoverJobs',
      'FOUND_LINKS',
      `Found ${listingUrls.length} job posting links on search page.`
    );

    if (listingUrls.length === 0) {
      return [];
    }

    // 4. Filter out already stored or previously skipped URLs to prevent duplicate scraping
    const existingUrlsSet = await getExistingSourceUrls(listingUrls);
    const unscrapedUrls = listingUrls.filter((url) => !existingUrlsSet.has(url));

    await logJobEvent(
      'naukriSource.discoverJobs',
      'FILTERED_LINKS',
      `${unscrapedUrls.length} new unscraped job URLs found (${listingUrls.length - unscrapedUrls.length} already in DB).`
    );

    const targetUrls = unscrapedUrls.slice(0, maxJobs);
    const discoveredJobs = [];
    const context = page.context();

    // 5. Scrape details and application method for each job
    for (let i = 0; i < targetUrls.length; i++) {
      if (searchConfig.abortSignal?.aborted) {
        await logJobEvent('naukriSource.discoverJobs', 'ABORTED', 'Job scraping aborted by user.');
        break;
      }

      const jobUrl = targetUrls[i];
      let detailPage = null;

      try {
        detailPage = await context.newPage();
        await detailPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async () => {
          await detailPage.evaluate(() => window.stop()).catch(() => {});
        });

        // Small wait for JS render
        await detailPage.waitForTimeout(1000);

        const jobData = await parseNaukriJobDetails(detailPage, jobUrl);
        if (jobData && jobData.title) {
          discoveredJobs.push(jobData);
          await logJobEvent(
            'naukriSource.discoverJobs',
            'JOB_SCRAPED',
            `[${discoveredJobs.length}/${targetUrls.length}] Scraped: ${jobData.title} @ ${jobData.company} (${jobData.applicationMethod})`
          );
        }
      } catch (err) {
        await logError('naukriSource.discoverJobs.item', err.message);
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }

      // Small delay between job detail requests to maintain good rate
      if (i < targetUrls.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    return discoveredJobs;
  } catch (error) {
    await logError('naukriSource.discoverJobs', error.message);
    throw error;
  }
};

/**
 * Opens a specific Naukri job detail page
 * @param {import('playwright').Page} page
 * @param {string} jobUrl
 */
export const openJobDetails = async (page, jobUrl) => {
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (error) {
    await logError('naukriSource.openJobDetails', error.message);
  }
};

export default {
  discoverJobs,
  openJobDetails
};
