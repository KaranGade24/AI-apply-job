import { NAUKRI_SELECTORS } from '../../../constant/naukri.constant.js';
import { logError } from '../../../utils/logger.js';

/**
 * Parses individual job card from search results page
 * @param {import('playwright').ElementHandle} cardEl
 * @returns {Promise<object|null>}
 */
export const parseNaukriJobCard = async (cardEl) => {
  try {
    return await cardEl.evaluate((el) => {
      const titleEl = el.querySelector('a.title, .jobTitle, h2.heading');
      const companyEl = el.querySelector('a.comp-name, .companyInfo a.subTitle, .comp-name, .subTitle');
      const expEl = el.querySelector('.exp-wrap .exp, .experience, span[class*="exp"]');
      const locEl = el.querySelector('.loc-wrap .loc, .location, span[class*="loc"]');
      const salEl = el.querySelector('.sal-wrap .sal, .salary, span[class*="sal"]');
      const tagEls = el.querySelectorAll('.tags-gt li, .tag-li, .dot-gt li, .styles_chip__');

      const skills = Array.from(tagEls).map((t) => (t.textContent || '').trim()).filter(Boolean);
      const sourceUrl = titleEl ? titleEl.href : '';
      const title = titleEl ? (titleEl.textContent || '').trim() : '';
      const company = companyEl ? (companyEl.textContent || '').trim() : '';
      const location = locEl ? (locEl.textContent || '').trim() : '';
      const experienceRequired = expEl ? (expEl.textContent || '').trim() : '';
      const salary = salEl ? (salEl.textContent || '').trim() : '';

      return {
        title,
        company,
        location,
        experienceRequired,
        salary,
        skills,
        sourceUrl
      };
    });
  } catch (error) {
    await logError('naukriParser.parseNaukriJobCard', error.message);
    return null;
  }
};

/**
 * Parses full job details page and detects application method & apply URL
 * @param {import('playwright').Page} page - Active page loaded with job detail
 * @param {string} sourceUrl - Original job posting URL
 * @returns {Promise<object|null>}
 */
export const parseNaukriJobDetails = async (page, sourceUrl) => {
  try {
    if (!page || page.isClosed()) return null;

    const details = await page.evaluate((url) => {
      // 1. Title and Company
      const title = (
        document.querySelector('h1.styles_jd-header-title__rZwM1, h1.jd-header-title, h1')
          ?.textContent || ''
      ).trim();

      const company = (
        document.querySelector('.styles_jd-header-comp-name__MvqAI a, .jd-header-comp-name a, a.comp-name, .company-info a')
          ?.textContent || ''
      ).trim();

      // 2. Experience, Salary, Location
      const exp = (
        document.querySelector('.styles_jhc__exp__k_giM, .exp, span[class*="experience"]')
          ?.textContent || ''
      ).trim();

      const loc = (
        document.querySelector('.styles_jhc__loc___Oq4e, .loc, span[class*="location"]')
          ?.textContent || ''
      ).trim();

      const sal = (
        document.querySelector('.styles_jhc__salary__jdfEC, .salary, span[class*="salary"]')
          ?.textContent || ''
      ).trim();

      // 3. Job Description
      const descEl = document.querySelector('.styles_JDC__dang-inner-html__h0K4t, .dang-inner-html, section.job-desc, .job-description');
      const description = descEl ? (descEl.textContent || '').trim() : '';

      // 4. Skills extraction
      const skillChips = document.querySelectorAll('.styles_key-skill__GIPn_ a, .key-skill a, .styles_chip__VJ6wW, .tag-li');
      const skills = Array.from(skillChips).map((s) => (s.textContent || '').trim()).filter(Boolean);

      // 5. Work Mode detection
      const fullText = `${title} ${description} ${loc}`.toLowerCase();
      let workMode = 'unspecified';
      if (/remote|work\s*from\s*home|wfh/i.test(fullText)) {
        workMode = 'remote';
      } else if (/hybrid/i.test(fullText)) {
        workMode = 'hybrid';
      } else if (/office|on-site|onsite|wfo/i.test(fullText)) {
        workMode = 'workFromOffice';
      }

      // 6. Application Method and Apply URL Detection (Steps 24 & 25)
      let applicationMethod = 'naukri';
      let applicationUrl = url;

      // Check for Company Site apply button
      const companySiteBtn = document.querySelector(
        'button:has-text("Apply on company site"), a:has-text("Apply on company site"), a.company-site-button, button.company-site-button, [class*="company-site"]'
      );
      const externalLink = document.querySelector('a[href*="redirect"], a[href*="apply"], a.external-apply');

      if (companySiteBtn) {
        applicationMethod = 'company_site';
        if (companySiteBtn.tagName.toLowerCase() === 'a' && companySiteBtn.href) {
          applicationUrl = companySiteBtn.href;
        }
      } else if (externalLink && externalLink.href && !externalLink.href.includes('naukri.com')) {
        applicationMethod = 'external';
        applicationUrl = externalLink.href;
      } else {
        // Standard Naukri 1-click apply button
        const applyBtn = document.querySelector('#apply-button, button:has-text("Apply"), .apply-button');
        if (applyBtn) {
          applicationMethod = 'naukri';
          applicationUrl = url;
        }
      }

      return {
        title: title || 'Position at ' + (company || 'Naukri'),
        company: company || 'Company via Naukri',
        location: loc || 'India',
        experienceRequired: exp || 'Not Specified',
        workMode,
        employmentType: 'fullTime',
        description: description || 'No detailed job description provided.',
        responsibilities: [],
        requirements: [],
        skills,
        salary: sal || 'Not Disclosed',
        source: 'naukri',
        sourceUrl: url,
        applicationUrl: applicationUrl || url,
        applicationMethod,
        discoveredAt: new Date().toISOString()
      };
    }, sourceUrl);

    return details;
  } catch (error) {
    await logError('naukriParser.parseNaukriJobDetails', error.message);
    return null;
  }
};

export default {
  parseNaukriJobCard,
  parseNaukriJobDetails
};
