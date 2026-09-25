import { naukriSelectors } from './naukriSelectors.js';
import { DEFAULT_JOB_STRUCTURE, JOB_SOURCES } from '../../../constant/job.constant.js';
import { logError } from '../../../utils/logger.js';

/**
 * Extracts and cleans text from locator or evaluate result
 */
const cleanText = (str = '') => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/\s+/g, ' ').trim();
};

/**
 * Derives work mode from description, title, or location text
 */
export const parseWorkMode = (text = '') => {
  const lower = (text || '').toLowerCase();
  if (lower.includes('remote') || lower.includes('work from home') || lower.includes('wfh')) {
    return 'remote';
  }
  if (lower.includes('hybrid')) {
    return 'hybrid';
  }
  return 'workFromOffice';
};

/**
 * Derives employment type
 */
export const parseEmploymentType = (text = '') => {
  const lower = (text || '').toLowerCase();
  if (lower.includes('part time') || lower.includes('part-time')) {
    return 'partTime';
  }
  if (lower.includes('contract') || lower.includes('freelance') || lower.includes('temporary')) {
    return 'contract';
  }
  if (lower.includes('intern') || lower.includes('internship')) {
    return 'internship';
  }
  return 'fullTime';
};

/**
 * Parses a single Naukri job card from search results
 * @param {import('playwright').ElementHandle} card
 * @returns {Promise<object>}
 */
export const parseNaukriJobCard = async (card) => {
  try {
    const titleEl = await card.$(naukriSelectors.jobList.jobTitle);
    const title = cleanText(await titleEl?.textContent() || '');
    const sourceUrl = await titleEl?.getAttribute('href') || '';

    const companyEl = await card.$(naukriSelectors.jobList.companyName);
    const company = cleanText(await companyEl?.textContent() || '');

    const locationEl = await card.$(naukriSelectors.jobList.location);
    const location = cleanText(await locationEl?.textContent() || 'India');

    const expEl = await card.$(naukriSelectors.jobList.experience);
    const experienceRequired = cleanText(await expEl?.textContent() || '0 - 2 Yrs');

    const salEl = await card.$(naukriSelectors.jobList.salary);
    const salary = cleanText(await salEl?.textContent() || 'Not disclosed');

    return {
      title,
      company,
      location,
      experienceRequired,
      salary,
      sourceUrl,
      workMode: parseWorkMode(`${title} ${location}`),
      source: JOB_SOURCES.NAUKRI,
    };
  } catch (error) {
    await logError('naukriParser.parseNaukriJobCard', error.message);
    return null;
  }
};

/**
 * Parses full job details from an opened Naukri detail page
 * @param {import('playwright').Page} page
 * @param {string} jobUrl
 * @returns {Promise<object|null>} Normalized job object
 */
export const parseNaukriJobDetails = async (page, jobUrl) => {
  try {
    // 1. Extract Title
    const titleEl = page.locator(naukriSelectors.jobDetails.title).first();
    const titleRaw = await titleEl.textContent({ timeout: 4000 }).catch(() => '');
    const title = cleanText(titleRaw);

    if (!title || title.toLowerCase().includes('404') || title.toLowerCase().includes('page not found')) {
      return null;
    }

    // 2. Extract Company
    const compEl = page.locator(naukriSelectors.jobDetails.companyName).first();
    const companyRaw = await compEl.textContent({ timeout: 2000 }).catch(() => '');
    const company = cleanText(companyRaw);

    // 3. Extract Description
    const descEl = page.locator(naukriSelectors.jobDetails.description).first();
    const descriptionRaw = await descEl.innerText({ timeout: 3000 }).catch(() => '');
    const description = cleanText(descriptionRaw);

    // 4. Extract Location
    const locEl = page.locator(naukriSelectors.jobDetails.location).first();
    const locationRaw = await locEl.textContent({ timeout: 2000 }).catch(() => '');
    const location = cleanText(locationRaw) || 'India';

    // 5. Extract Experience
    const expEl = page.locator(naukriSelectors.jobDetails.experience).first();
    const experienceRaw = await expEl.textContent({ timeout: 2000 }).catch(() => '');
    const experienceRequired = cleanText(experienceRaw) || '0 - 2 Yrs';

    // 6. Extract Skills
    const skillEls = await page.locator(naukriSelectors.jobDetails.skills).allTextContents().catch(() => []);
    const skills = skillEls.map((s) => cleanText(s)).filter(Boolean);

    // 7. Extract Salary
    const salEl = page.locator(naukriSelectors.jobDetails.salary).first();
    const salaryRaw = await salEl.textContent({ timeout: 2000 }).catch(() => '');
    const salary = cleanText(salaryRaw);

    // 8. Work Mode & Employment Type
    const combinedText = `${title} ${description} ${location}`;
    const workMode = parseWorkMode(combinedText);
    const employmentType = parseEmploymentType(combinedText);

    return {
      ...DEFAULT_JOB_STRUCTURE,
      title,
      company,
      location,
      workMode,
      employmentType,
      experienceRequired,
      description,
      skills,
      salary,
      sourceUrl: jobUrl,
      applicationUrl: jobUrl,
      source: JOB_SOURCES.NAUKRI,
      postedDate: new Date().toISOString(),
    };
  } catch (error) {
    await logError('naukriParser.parseNaukriJobDetails', error.message);
    return null;
  }
};

export default {
  parseNaukriJobCard,
  parseNaukriJobDetails,
  parseWorkMode,
  parseEmploymentType,
};
