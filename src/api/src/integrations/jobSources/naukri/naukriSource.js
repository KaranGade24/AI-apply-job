import { detectNaukriAuthState } from './naukriAuthDetector.js';
import { mapUniversalFiltersToNaukri } from './naukriSearchMapper.js';
import { NAUKRI_URLS } from '../../../constant/naukri.constant.js';
import { logJobEvent, logError } from '../../../utils/logger.js';
import { getExistingSourceUrls } from '../../../repositories/job.repository.js';

/**
 * Searches and scrapes real, live jobs from Naukri using an authenticated Playwright session
 * Detects both Naukri 1-Click Apply (#apply-button) and Company Site Apply (#company-site-button)
 * @param {import('playwright').Page} page - Authenticated Playwright page instance
 * @param {object} searchConfig
 * @returns {Promise<Array<object>>} List of normalized real job objects
 */
export const discoverJobs = async (page, searchConfig = {}) => {
  let responseListener = null;

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

    // 2. Setup real-time API response interceptor for Naukri's background job search gateway
    const capturedApiJobs = [];
    const seenUrls = new Set();

    responseListener = async (response) => {
      try {
        const url = response.url();
        if (url.includes('/jobapi/v3/search') || url.includes('/jobapi/v4/search') || (url.includes('/jobapi/') && url.includes('search'))) {
          const json = await response.json().catch(() => null);
          const list = json?.jobDetails || json?.jobs || [];
          if (Array.isArray(list) && list.length > 0) {
            for (const item of list) {
              const title = item.title || item.jobTitle;
              const jdUrl = item.jdURL
                ? item.jdURL.startsWith('http')
                  ? item.jdURL
                  : `https://www.naukri.com${item.jdURL}`
                : (item.staticUrl ? (item.staticUrl.startsWith('http') ? item.staticUrl : `https://www.naukri.com${item.staticUrl}`) : null);

              if (title && jdUrl && !seenUrls.has(jdUrl)) {
                seenUrls.add(jdUrl);
                const company = item.companyName || item.hiringOrganization || 'Naukri Employer';
                const loc = item.placeholders?.find((p) => p.type === 'location')?.label || item.location || 'India';
                const expReq = item.placeholders?.find((p) => p.type === 'experience')?.label || '0-2 Yrs';
                const sal = item.placeholders?.find((p) => p.type === 'salary')?.label || 'Not Disclosed';
                const tags = item.tagsAndSkills ? item.tagsAndSkills.split(',').map((s) => s.trim()) : (item.keySkills || []);

                // Detect whether job is Company Site Apply or Naukri 1-Click Direct Apply
                const isCompanySite = Boolean(
                  item.isApplyOnCompanySite === true ||
                  item.applyType === 'OFFSITE' ||
                  item.applyType === 'EXTERNAL' ||
                  item.staticUrl?.includes('company-site') ||
                  item.companySiteUrl
                );

                const applicationMethod = isCompanySite ? 'company_site' : 'naukri_direct';
                const applyButtonSelector = isCompanySite ? '#company-site-button' : '#apply-button';

                capturedApiJobs.push({
                  title,
                  company,
                  location: loc,
                  experienceRequired: expReq,
                  salary: sal,
                  skills: tags.length > 0 ? tags : ['JavaScript', 'Node.js', 'React'],
                  workMode: /remote|wfh/i.test(`${title} ${loc}`) ? 'remote' : /hybrid/i.test(loc) ? 'hybrid' : 'workFromOffice',
                  employmentType: 'fullTime',
                  description: item.jobDescription || item.snippet || `${title} at ${company} in ${loc}. Experience required: ${expReq}.`,
                  sourceUrl: jdUrl,
                  applicationUrl: item.companySiteUrl || jdUrl,
                  applicationMethod,
                  applyButtonSelector,
                  source: 'naukri',
                  discoveredAt: new Date().toISOString()
                });
              }
            }
          }
        }
      } catch {
        // Ignore response parse errors
      }
    };

    page.on('response', responseListener);

    // 3. Map universal search filters to candidate search URLs
    const { candidateUrls, keywords, locations } = mapUniversalFiltersToNaukri(searchConfig);
    let extractedJobs = [];

    // 4. Try candidate search URLs sequentially
    for (const searchUrl of candidateUrls) {
      if (searchConfig.abortSignal?.aborted) {
        await logJobEvent('naukriSource.discoverJobs', 'ABORTED', 'Search aborted by user.');
        break;
      }

      await logJobEvent('naukriSource.discoverJobs', 'NAVIGATE', `Navigating to Naukri search: ${searchUrl}`);

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
          await page.evaluate(() => window.stop()).catch(() => {});
        });

        // Wait for job cards or titles to appear in the DOM
        await page.waitForSelector(
          '.srp-jobtuple-wrapper, article.jobTuple, div[data-job-id], a.title, [class*="jobTuple"], [class*="styles_job-tuple"], a[href*="job-listings"]',
          { timeout: 8000 }
        ).catch(() => {});

        // Scroll page down to trigger hydration and card loading
        await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
        await page.waitForTimeout(2000);

        // Check if background API interceptor captured jobs
        if (capturedApiJobs.length > 0) {
          extractedJobs = [...capturedApiJobs];
          await logJobEvent(
            'naukriSource.discoverJobs',
            'API_INTERCEPTED',
            `Captured ${extractedJobs.length} live jobs from Naukri search gateway on: ${searchUrl}`
          );
          break;
        }

        // Direct DOM Extraction of live job cards with 1-click apply vs company-site detection
        const domJobs = await page.evaluate(() => {
          const items = [];
          const localSeen = new Set();

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

            if (title && href && href.includes('naukri.com') && !localSeen.has(href)) {
              localSeen.add(href);
              const skills = Array.from(tagEls).map((t) => (t.textContent || '').trim()).filter(Boolean);
              const locText = (locEl?.textContent || '').trim() || 'India';
              const expText = (expEl?.textContent || '').trim() || '0-2 Yrs';
              const salText = (salEl?.textContent || '').trim() || 'Not Disclosed';

              const cardText = (card.textContent || '').toLowerCase();
              const isCompanySite = Boolean(
                card.querySelector('#company-site-button, button#company-site-button, .company-site-button, [class*="company-site"]') ||
                cardText.includes('company site') ||
                cardText.includes('apply on company') ||
                href.includes('company-site')
              );

              const applicationMethod = isCompanySite ? 'company_site' : 'naukri_direct';
              const applyButtonSelector = isCompanySite ? '#company-site-button' : '#apply-button';

              items.push({
                title,
                company: company || 'Naukri Verified Employer',
                location: locText,
                experienceRequired: expText,
                workMode: /remote|wfh/i.test(`${title} ${locText}`) ? 'remote' : /hybrid/i.test(locText) ? 'hybrid' : 'workFromOffice',
                employmentType: 'fullTime',
                description: `${title} position at ${company || 'top hiring partner'} in ${locText}. Experience: ${expText}.`,
                skills: skills.length > 0 ? skills : ['JavaScript', 'Node.js', 'React'],
                salary: salText,
                source: 'naukri',
                sourceUrl: href,
                applicationUrl: href,
                applicationMethod,
                applyButtonSelector,
                discoveredAt: new Date().toISOString()
              });
            }
          }

          // Fallback: Extract from any live job anchor tags
          if (items.length === 0) {
            const anchors = document.querySelectorAll('a[href*="/job-listings-"], a[href*="naukri.com/job-listings"]');
            for (const a of anchors) {
              const href = a.href;
              const title = (a.textContent || a.getAttribute('title') || '').trim();
              if (
                title &&
                title.length > 4 &&
                href &&
                !href.includes('/job-listings-search') &&
                !localSeen.has(href)
              ) {
                localSeen.add(href);
                const isCompanySite = href.includes('company-site');
                items.push({
                  title,
                  company: 'Naukri Verified Employer',
                  location: 'Pune, India',
                  experienceRequired: '0-2 Yrs',
                  workMode: 'workFromOffice',
                  employmentType: 'fullTime',
                  description: `${title} position discovered directly via Naukri search.`,
                  skills: ['MERN', 'Node.js', 'React'],
                  salary: 'Not Disclosed',
                  source: 'naukri',
                  sourceUrl: href,
                  applicationUrl: href,
                  applicationMethod: isCompanySite ? 'company_site' : 'naukri_direct',
                  applyButtonSelector: isCompanySite ? '#company-site-button' : '#apply-button',
                  discoveredAt: new Date().toISOString()
                });
              }
            }
          }

          return items;
        });

        if (domJobs && domJobs.length > 0) {
          extractedJobs = domJobs;
          await logJobEvent(
            'naukriSource.discoverJobs',
            'FOUND_LINKS',
            `Found ${extractedJobs.length} live matching jobs via DOM on: ${searchUrl}`
          );
          break;
        }
      } catch (navErr) {
        await logError('naukriSource.discoverJobs.nav', `Error checking URL ${searchUrl}: ${navErr.message}`);
      }
    }

    // 5. Clean up response listener
    if (responseListener) {
      page.off('response', responseListener);
      responseListener = null;
    }

    if (extractedJobs.length === 0) {
      await logJobEvent('naukriSource.discoverJobs', 'NO_JOBS', 'No live job listings found for current search parameters.');
      return [];
    }

    // 6. Filter out already stored URLs to avoid duplicate entries in DB
    const urls = extractedJobs.map((j) => j.sourceUrl).filter(Boolean);
    const existingUrlsSet = await getExistingSourceUrls(urls);
    const newJobs = extractedJobs.filter((j) => !existingUrlsSet.has(j.sourceUrl));

    const targetJobs = (newJobs.length > 0 ? newJobs : extractedJobs).slice(0, maxJobs);

    await logJobEvent(
      'naukriSource.discoverJobs',
      'COMPLETE',
      `Successfully scraped and parsed ${targetJobs.length} live jobs from Naukri.`
    );

    return targetJobs;
  } catch (error) {
    if (responseListener && page && !page.isClosed()) {
      page.off('response', responseListener);
    }
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
