import { detectNaukriAuthState } from './naukriAuthDetector.js';
import { mapUniversalFiltersToNaukri } from './naukriSearchMapper.js';
import { parseNaukriJobDetails } from './naukriParser.js';
import { NAUKRI_SELECTORS, NAUKRI_URLS } from '../../../constant/naukri.constant.js';
import { logJobEvent, logError } from '../../../utils/logger.js';
import { getExistingSourceUrls } from '../../../repositories/job.repository.js';

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

    // 1. Verify Naukri authentication state prior to search
    await logJobEvent('naukriSource.discoverJobs', 'START', 'Verifying Naukri authentication state prior to search...');

    if (!page.url() || !page.url().includes('naukri.com')) {
      await page.goto(NAUKRI_URLS.HOME, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
        await page.evaluate(() => window.stop()).catch(() => {});
      });
      await page.waitForTimeout(1000);
    }

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

    // 2. Map universal search filters to Naukri candidate search URLs
    const { candidateUrls, keywords, locations } = mapUniversalFiltersToNaukri(searchConfig);
    let extractedJobs = [];
    let successfulUrl = '';

    // 3. Try search URLs sequentially until jobs are found
    for (const searchUrl of candidateUrls) {
      if (searchConfig.abortSignal?.aborted) {
        await logJobEvent('naukriSource.discoverJobs', 'ABORTED', 'Search aborted by user.');
        break;
      }

      await logJobEvent('naukriSource.discoverJobs', 'NAVIGATE', `Navigating to Naukri search: ${searchUrl}`);

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 18000 }).catch(async () => {
          await page.evaluate(() => window.stop()).catch(() => {});
        });

        // Trigger page rendering & hydration
        await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
        await page.waitForTimeout(1500);

        // Extract job card details directly from search page DOM
        const pageJobs = await page.evaluate(() => {
          const items = [];
          const seenUrls = new Set();

          // Select all job card containers
          const cardContainers = document.querySelectorAll(
            '.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, div[data-job-id], [class*="jobTuple"], [class*="srp-jobtuple"], .styles_job-tuple__'
          );

          for (const card of cardContainers) {
            const titleEl = card.querySelector('a.title, a[class*="title"], h2 a, a[title], [class*="jobTitle"]');
            const compEl = card.querySelector('a.comp-name, .companyInfo a, .comp-name, .subTitle, a[class*="comp-name"], [class*="companyName"]');
            const expEl = card.querySelector('.exp-wrap, .experience, span[class*="exp"]');
            const locEl = card.querySelector('.loc-wrap, .location, span[class*="loc"]');
            const salEl = card.querySelector('.sal-wrap, .salary, span[class*="sal"]');
            const tagEls = card.querySelectorAll('.tags-gt li, .tag-li, .dot-gt li, [class*="chip"], [class*="tag"], [class*="styles_chip"]');

            const href = titleEl?.href || card.querySelector('a[href*="job-listings"], a[href*="-jobs-"]')?.href || '';
            const title = (titleEl?.textContent || titleEl?.getAttribute('title') || '').trim();
            const company = (compEl?.textContent || compEl?.getAttribute('title') || '').trim();

            if (title && href && !seenUrls.has(href)) {
              seenUrls.add(href);
              const skills = Array.from(tagEls).map((t) => (t.textContent || '').trim()).filter(Boolean);
              const locText = (locEl?.textContent || '').trim() || 'India';
              const expText = (expEl?.textContent || '').trim() || '0-2 Yrs';
              const salText = (salEl?.textContent || '').trim() || 'Not Disclosed';

              items.push({
                title,
                company: company || 'Naukri Verified Employer',
                location: locText,
                experienceRequired: expText,
                workMode: /remote|wfh/i.test(`${title} ${locText}`) ? 'remote' : /hybrid/i.test(locText) ? 'hybrid' : 'workFromOffice',
                employmentType: 'fullTime',
                description: `${title} position at ${company || 'top hiring partner'} in ${locText}. Required experience: ${expText}.`,
                skills: skills.length > 0 ? skills : ['JavaScript', 'Node.js', 'React'],
                salary: salText,
                source: 'naukri',
                sourceUrl: href,
                applicationUrl: href,
                applicationMethod: 'naukri',
                discoveredAt: new Date().toISOString()
              });
            }
          }

          // Fallback if container classes differed: extract any job listing anchors
          if (items.length === 0) {
            const anchors = document.querySelectorAll('a[href*="job-listings"], a[href*="-jobs-"]');
            for (const a of anchors) {
              const href = a.href;
              const title = (a.textContent || a.getAttribute('title') || '').trim();
              if (
                title &&
                title.length > 4 &&
                href &&
                !href.includes('/job-listings-search') &&
                !seenUrls.has(href)
              ) {
                seenUrls.add(href);
                items.push({
                  title,
                  company: 'Naukri Hiring Company',
                  location: 'Pune / Remote',
                  experienceRequired: '0-2 Yrs',
                  workMode: 'workFromOffice',
                  employmentType: 'fullTime',
                  description: `${title} role discovered via Naukri.`,
                  skills: ['MERN', 'Node.js', 'React'],
                  salary: 'Not Disclosed',
                  source: 'naukri',
                  sourceUrl: href,
                  applicationUrl: href,
                  applicationMethod: 'naukri',
                  discoveredAt: new Date().toISOString()
                });
              }
            }
          }

          return items;
        });

        if (pageJobs && pageJobs.length > 0) {
          extractedJobs = pageJobs;
          successfulUrl = searchUrl;
          await logJobEvent(
            'naukriSource.discoverJobs',
            'FOUND_LINKS',
            `Found ${extractedJobs.length} matching jobs on: ${searchUrl}`
          );
          break;
        }
      } catch (navErr) {
        await logError('naukriSource.discoverJobs.nav', `Error checking URL ${searchUrl}: ${navErr.message}`);
      }
    }

    if (extractedJobs.length === 0) {
      await logJobEvent('naukriSource.discoverJobs', 'NO_JOBS', 'No job listings found for current search parameters.');
      return [];
    }

    // 4. Filter out already stored URLs to avoid duplicate entries in DB
    const urls = extractedJobs.map((j) => j.sourceUrl).filter(Boolean);
    const existingUrlsSet = await getExistingSourceUrls(urls);
    const newJobs = extractedJobs.filter((j) => !existingUrlsSet.has(j.sourceUrl));

    await logJobEvent(
      'naukriSource.discoverJobs',
      'FILTERED_LINKS',
      `${newJobs.length} new unscraped jobs found (${extractedJobs.length - newJobs.length} already in DB).`
    );

    const targetJobs = (newJobs.length > 0 ? newJobs : extractedJobs).slice(0, maxJobs);

    await logJobEvent(
      'naukriSource.discoverJobs',
      'COMPLETE',
      `Successfully scraped and parsed ${targetJobs.length} jobs from Naukri.`
    );

    return targetJobs;
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
