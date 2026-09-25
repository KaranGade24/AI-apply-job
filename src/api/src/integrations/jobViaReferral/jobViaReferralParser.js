import { JOB_VIA_REFERRAL_SELECTORS } from './jobViaReferralSelectors.js';
import { DEFAULT_JOB_STRUCTURE, JOB_SOURCES } from '../../constant/job.constant.js';
import { logError } from '../../utils/logger.js';

/**
 * Extracts the job title from the job detail page
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} Cleaned job title
 */
export const parseTitle = async (page) => {
  try {
    const titleElement = page.locator(JOB_VIA_REFERRAL_SELECTORS.detailTitle).first();
    const titleText = await titleElement.textContent({ timeout: 3000 }).catch(() => '');
    return titleText?.trim() || 'Untitled Position';
  } catch (error) {
    await logError('jobViaReferralParser.parseTitle', error.message);
    return 'Untitled Position';
  }
};

/**
 * Helper to truncate raw parsed strings at adjacent field keywords
 * @param {string} val
 * @returns {string} Clean field value
 */
const cleanFieldValue = (val = '') => {
  if (!val || typeof val !== 'string') return '';
  const cleaned = val
    .split(/(?:Work\s*Mode|Experience|Qualification|Employment|Eligibility|Skills|Position|Job\s*ID|Joining|Salary|Post\s*Views|---|\n|\r)/i)[0]
    .replace(/^[:|\-\s,]+|[:|\-\s,]+$/g, '')
    .trim();
  return cleaned;
};

/**
 * Extracts company name from job text content or heading
 * @param {import('playwright').Page} page
 * @param {string} contentText - Raw text of job post body
 * @returns {Promise<string>} Company name
 */
export const parseCompany = async (page, contentText = '') => {
  try {
    const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.company);
    if (match && match[1]?.trim()) {
      const cleanComp = cleanFieldValue(match[1]);
      if (cleanComp) return cleanComp;
    }

    // Fallback: Check title for "Company Name Hiring / Off Campus Drive" pattern
    const title = await parseTitle(page);
    const titleMatch = title.match(/^([A-Za-z0-9\s.]+?)\s+(?:Hiring|Off\s*Campus|Recruitment|Referral|Walk-in)/i);
    if (titleMatch && titleMatch[1]?.trim()) {
      return titleMatch[1].trim();
    }

    return '';
  } catch (error) {
    await logError('jobViaReferralParser.parseCompany', error.message);
    return '';
  }
};

/**
 * Extracts job location from post content
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} Job location
 */
export const parseLocation = async (page, contentText = '') => {
  try {
    const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.location);
    if (match && match[1]?.trim()) {
      const cleanLoc = cleanFieldValue(match[1]);
      if (cleanLoc) return cleanLoc;
    }

    // Check title for location hints (e.g. "... | Pune", "... | Nagpur", "... | Remote")
    const title = await parseTitle(page);
    const locInTitleMatch = title.match(/\|\s*([^|]+)$/);
    if (locInTitleMatch && locInTitleMatch[1]?.trim()) {
      const cleanLoc = cleanFieldValue(locInTitleMatch[1]);
      if (cleanLoc) return cleanLoc;
    }

    return 'India';
  } catch (error) {
    await logError('jobViaReferralParser.parseLocation', error.message);
    return 'India';
  }
};

/**
 * Cleans experience string to filter out work mode or invalid non-experience terms
 * and format experience integers/ranges.
 * @param {string} expStr
 * @returns {string} Clean experience string
 */
export const cleanExperienceString = (expStr = '') => {
  if (!expStr || typeof expStr !== 'string') return '0 - 2 Years';

  let cleaned = expStr
    .replace(/\b(?:Work\s*From\s*Home|WFH|Work\s*From\s*Office|WFO|On-site|Onsite|Hybrid|Remote|Work\s*Mode:?.*|\(.*?\))\b/gi, '')
    .replace(/^[:|\-\s,]+|[:|\-\s,]+$/g, '')
    .trim();

  const digitMatch = cleaned.match(/\d+/g);
  if (digitMatch && digitMatch.length > 0) {
    const minYears = parseInt(digitMatch[0], 10);
    const maxYears = digitMatch[1] ? parseInt(digitMatch[1], 10) : minYears;
    if (minYears === maxYears) return `${minYears} Years`;
    return `${minYears} - ${maxYears} Years`;
  }

  if (/fresher/i.test(cleaned)) {
    return '0 Years';
  }

  if (!cleaned || /^(?:wfh|wfo|remote|onsite|hybrid|n\/a|not\s*mentioned|not\s*specified)$/i.test(cleaned)) {
    return '0 - 2 Years';
  }

  return cleaned;
};

/**
 * Extracts experience requirements from post content
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} Experience required
 */
export const parseExperience = async (page, contentText = '') => {
  try {
    const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.experience);
    if (match && match[1]?.trim()) {
      const cleanExp = cleanFieldValue(match[1]);
      const validExp = cleanExperienceString(cleanExp);
      if (validExp) return validExp;
    }
    return '0 - 2 Years';
  } catch (error) {
    await logError('jobViaReferralParser.parseExperience', error.message);
    return '0 - 2 Years';
  }
};

/**
 * Extracts main job description text
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} Cleaned job description
 */
export const parseDescription = async (page) => {
  try {
    const contentElement = page.locator(JOB_VIA_REFERRAL_SELECTORS.detailContent).first();
    const descriptionText = await contentElement.textContent({ timeout: 5000 }).catch(() => '');
    return descriptionText?.replace(/\s+/g, ' ').trim() || '';
  } catch (error) {
    await logError('jobViaReferralParser.parseDescription', error.message);
    return '';
  }
};

/**
 * Extracts technical and soft skills mentioned in the job description
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string[]>} List of extracted skills
 */
export const parseSkills = async (page, contentText = '') => {
  try {
    const extractedSkills = new Set();

    // 1. Extract from explicit Skills line (e.g. "Skills: Java, Spring Boot, SQL")
    const skillsMatch = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.skills);
    if (skillsMatch && skillsMatch[1]?.trim()) {
      const explicitSkills = skillsMatch[1]
        .split(/[,/;|•\n\r]/)
        .map(skill => skill.trim())
        .filter(skill => skill.length > 1 && !/^and$/i.test(skill));

      explicitSkills.forEach(skill => extractedSkills.add(skill));
    }

    // 2. Scan text against an expanded dictionary of technologies and frameworks
    const skillDictionary = [
      'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'React.js', 'React Native',
      'Node.js', 'Express', 'Express.js', 'Next.js', 'Angular', 'Vue.js', 'Vue',
      'HTML', 'HTML5', 'CSS', 'CSS3', 'Tailwind', 'Tailwind CSS', 'Bootstrap', 'Sass',
      'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQLite',
      'AWS', 'Amazon Web Services', 'Azure', 'GCP', 'Google Cloud', 'Cloud Computing',
      'Docker', 'Kubernetes', 'Git', 'GitHub', 'GitLab', 'CI/CD', 'DevOps',
      'C', 'C++', 'C#', '.NET', 'Go', 'Golang', 'Rust', 'Ruby', 'Ruby on Rails', 'PHP', 'Laravel',
      'Swift', 'Kotlin', 'Flutter', 'Android', 'iOS', 'Mobile App Development',
      'Spring', 'Spring Boot', 'REST API', 'RESTful APIs', 'GraphQL', 'Microservices', 'System Design',
      'Data Structures', 'Algorithms', 'OOP', 'Object Oriented Programming',
      'Machine Learning', 'Deep Learning', 'Artificial Intelligence', 'AI', 'Data Science',
      'Pandas', 'NumPy', 'Scikit-learn', 'TensorFlow', 'PyTorch',
      'Manual Testing', 'Automation Testing', 'Selenium', 'Playwright', 'Jest', 'Cypress',
      'Communication', 'Problem Solving', 'Teamwork', 'Critical Thinking', 'Agile', 'Scrum', 'Jira', 'Figma'
    ];

    for (const skill of skillDictionary) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(contentText)) {
        extractedSkills.add(skill);
      }
    }

    return Array.from(extractedSkills);
  } catch (error) {
    await logError('jobViaReferralParser.parseSkills', error.message);
    return [];
  }
};

/**
 * Extracts external apply/referral link from the post body
 * @param {import('playwright').Page} page
 * @param {string} sourceUrl
 * @returns {Promise<string>} External apply URL
 */
export const parseApplicationUrl = async (page, sourceUrl = '') => {
  try {
    const linksLocator = page.locator(JOB_VIA_REFERRAL_SELECTORS.applicationLinks);
    const count = await linksLocator.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
      const linkHandle = linksLocator.nth(i);
      const href = await linkHandle.getAttribute('href').catch(() => null);
      if (
        href &&
        /^https?:\/\//i.test(href) &&
        !href.includes('jobviareferral.com') &&
        !href.startsWith('mailto:')
      ) {
        return href.trim();
      }
    }

    return '';
  } catch (error) {
    await logError('jobViaReferralParser.parseApplicationUrl', error.message);
    return '';
  }
};

/**
 * Extracts HR / Recruiter email address from job description or mailto links
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} HR Email
 */
export const parseHrEmail = async (page, contentText = '') => {
  try {
    // 1. Check for mailto: links in page content
    const mailtoLocator = page.locator(JOB_VIA_REFERRAL_SELECTORS.mailtoLinks);
    const mailtoCount = await mailtoLocator.count().catch(() => 0);
    for (let i = 0; i < mailtoCount; i++) {
      const href = await mailtoLocator.nth(i).getAttribute('href').catch(() => null);
      if (href && href.startsWith('mailto:')) {
        const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (email && !email.includes('jobviareferral.com')) {
          return email;
        }
      }
    }

    // 2. Check explicitly labeled HR email patterns in text
    const hrMatch = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.hrEmail);
    if (hrMatch && hrMatch[1]?.trim()) {
      const email = hrMatch[1].trim();
      if (!email.includes('jobviareferral.com')) return email;
    }

    // 3. Fallback: Search for generic emails in body text
    const genericMatches = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.genericEmail) || [];
    for (const email of genericMatches) {
      const cleanEmail = email.trim();
      if (!cleanEmail.includes('jobviareferral.com') && !cleanEmail.includes('wordpress')) {
        return cleanEmail;
      }
    }

    return '';
  } catch (error) {
    await logError('jobViaReferralParser.parseHrEmail', error.message);
    return '';
  }
};

/**
 * Extracts HR / recruiter contact number or WhatsApp link
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} Contact or WhatsApp number
 */
export const parseContactNumber = async (page, contentText = '') => {
  try {
    // 1. Check for tel: or wa.me links
    const phoneLocator = page.locator(JOB_VIA_REFERRAL_SELECTORS.phoneLinks);
    const phoneCount = await phoneLocator.count().catch(() => 0);
    for (let i = 0; i < phoneCount; i++) {
      const href = await phoneLocator.nth(i).getAttribute('href').catch(() => null);
      if (href) {
        if (href.startsWith('tel:')) {
          return href.replace(/^tel:/i, '').trim();
        }
        if (href.includes('wa.me') || href.includes('whatsapp.com')) {
          const match = href.match(/(?:phone=|wa\.me\/)(\+?\d+)/i);
          if (match && match[1]) return match[1].trim();
        }
      }
    }

    // 2. Check for explicit phone text patterns
    const phoneMatch = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.contactNumber);
    if (phoneMatch && phoneMatch[1]?.trim()) {
      return phoneMatch[1].trim();
    }

    return '';
  } catch (error) {
    await logError('jobViaReferralParser.parseContactNumber', error.message);
    return '';
  }
};

/**
 * Extracts or generates suggested email subject line for HR referral applications
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @param {string} title
 * @param {string} company
 * @returns {Promise<string>} Email subject
 */
export const parseEmailSubject = async (page, contentText = '', title = '', company = '') => {
  try {
    const subjectMatch = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.emailSubject);
    if (subjectMatch && subjectMatch[1]?.trim()) {
      return subjectMatch[1].trim();
    }

    if (title && company) {
      return `Application for ${title} at ${company} - Job Referral`;
    }

    return title ? `Application for ${title} - Job Referral` : 'Job Application / Referral Request';
  } catch (error) {
    await logError('jobViaReferralParser.parseEmailSubject', error.message);
    return 'Job Application / Referral Request';
  }
};

/**
 * Determines primary application method based on parsed fields
 * @param {string} applicationUrl
 * @param {string} hrEmail
 * @param {string} contactNumber
 * @returns {string} Method enum
 */
export const parseApplicationMethod = (applicationUrl = '', hrEmail = '', contactNumber = '') => {
  const hasUrl = Boolean(applicationUrl);
  const hasEmail = Boolean(hrEmail);
  const hasPhone = Boolean(contactNumber);

  if ((hasUrl && hasEmail) || (hasUrl && hasPhone) || (hasEmail && hasPhone)) {
    return 'MIXED';
  }
  if (hasEmail) return 'EMAIL';
  if (hasUrl) return 'DIRECT_LINK';
  if (hasPhone) return 'PHONE_WHATSAPP';

  return 'NOT_SPECIFIED';
};

/**
 * Extracts resume preparation tips from "Resume Tips" section
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string[]>} List of tip strings
 */
export const parseResumeTips = async (page, contentText = '') => {
  try {
    const tips = [];

    // 1. DOM locator based extraction
    const heading = page.locator(JOB_VIA_REFERRAL_SELECTORS.resumeTipsHeadings).first();
    const isHeadingVisible = await heading.count().then(c => c > 0).catch(() => false);

    if (isHeadingVisible) {
      const nextElem = heading.locator('xpath=following-sibling::p[1] | following-sibling::ul[1]');
      const text = await nextElem.textContent().catch(() => '');
      if (text) {
        const lines = text
          .split(/\n|✔|•|-/)
          .map(l => l.replace(/^[\s✔•\-\d.]+/, '').trim())
          .filter(l => l.length > 5);
        lines.forEach(tip => tips.push(tip));
      }
    }

    // 2. Regex fallback if DOM locator yielded empty
    if (tips.length === 0) {
      const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.resumeTipsSection);
      if (match && match[1]?.trim()) {
        const lines = match[1]
          .split(/\n|✔|•|-/)
          .map(line => line.replace(/^[\s✔•\-\d.]+/, '').trim())
          .filter(line => line.length > 5);
        lines.forEach(tip => tips.push(tip));
      }
    }

    return Array.from(new Set(tips));
  } catch (error) {
    await logError('jobViaReferralParser.parseResumeTips', error.message);
    return [];
  }
};

/**
 * Extracts step-by-step instructions from "How to Apply" section
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} Instructions string
 */
export const parseHowToApply = async (page, contentText = '') => {
  try {
    // 1. DOM locator based extraction
    const heading = page.locator(JOB_VIA_REFERRAL_SELECTORS.howToApplyHeadings).first();
    const isHeadingVisible = await heading.count().then(c => c > 0).catch(() => false);

    if (isHeadingVisible) {
      const nextElem = heading.locator('xpath=following-sibling::p[1] | following-sibling::ol[1] | following-sibling::ul[1]');
      const text = await nextElem.textContent().catch(() => '');
      if (text?.trim()) {
        return text.trim();
      }
    }

    // 2. Regex fallback
    const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.howToApplySection);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }

    return '';
  } catch (error) {
    await logError('jobViaReferralParser.parseHowToApply', error.message);
    return '';
  }
};

/**
 * Extracts post author name
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} Author name
 */
export const parsePostedBy = async (page, contentText = '') => {
  try {
    const authorElem = page.locator(JOB_VIA_REFERRAL_SELECTORS.authorLink).first();
    const authorText = await authorElem.textContent({ timeout: 2000 }).catch(() => '');
    if (authorText?.trim()) {
      return authorText.trim();
    }

    const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.postedBy);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }

    return 'JobViaReferral Admin';
  } catch (error) {
    await logError('jobViaReferralParser.parsePostedBy', error.message);
    return 'JobViaReferral Admin';
  }
};

/**
 * Extracts post date (e.g. "On: September 19, 2026")
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {Promise<string>} ISO Date string
 */
export const parsePostedDate = async (page, contentText = '') => {
  try {
    const dateElem = page.locator(JOB_VIA_REFERRAL_SELECTORS.postedOnDateText).first();
    const dateText = await dateElem.textContent({ timeout: 2000 }).catch(() => '');

    if (dateText) {
      const cleaned = dateText.replace(/On\s*:/i, '').trim();
      const parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    const match = contentText.match(JOB_VIA_REFERRAL_SELECTORS.textPatterns.postedDate);
    if (match && match[1]?.trim()) {
      const parsed = new Date(match[1].trim());
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return new Date().toISOString();
  } catch (error) {
    await logError('jobViaReferralParser.parsePostedDate', error.message);
    return new Date().toISOString();
  }
};

/**
 * Extracts title and link from a job card on the listing page
 * @param {import('playwright').Locator} cardLocator
 * @returns {Promise<{ title: string, url: string } | null>}
 */
export const parseJobCard = async (cardLocator) => {
  try {
    const titleLink = cardLocator.locator(JOB_VIA_REFERRAL_SELECTORS.jobCardTitleLink).first();
    const title = await titleLink.textContent({ timeout: 2000 }).catch(() => null);
    const url = await titleLink.getAttribute('href').catch(() => null);

    if (!title || !url) return null;

    return {
      title: title.trim(),
      url: url.trim()
    };
  } catch (error) {
    await logError('jobViaReferralParser.parseJobCard', error.message);
    return null;
  }
};

/**
 * Cleans location string to separate city/region from work mode details
 * @param {string} locStr
 * @returns {string} Clean location (e.g. "Pune", "Nagpur", "Remote")
 */
export const cleanLocationString = (locStr = '') => {
  if (!locStr || typeof locStr !== 'string') return 'India';
  if (/^remote$/i.test(locStr.trim())) return 'Remote';

  let cleaned = locStr
    .replace(/\|\s*(?:Work\s*From\s*Office|WFO|On-site|Onsite|Hybrid|Remote|Work\s*From\s*Home|WFH|Work\s*Mode.*|\(.*?\))/gi, '')
    .replace(/\b(?:Work\s*From\s*Office|WFO|On-site|Onsite|Work\s*Mode:?.*)\b/gi, '')
    .replace(/^[:|\-\s,]+|[:|\-\s,]+$/g, '')
    .trim();

  return cleaned || locStr.trim() || 'India';
};

/**
 * Extracts work mode enum ('remote', 'hybrid', 'office')
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @param {string} rawLocationStr
 * @returns {string} WorkMode enum ('remote', 'hybrid', 'office')
 */
export const parseWorkMode = (page, contentText = '', rawLocationStr = '') => {
  try {
    const match = contentText.match(/(?:Work\s*Mode|Mode\s*of\s*Work|Work\s*Type)\s*[:|-]\s*([^\n\r]+)/i);
    if (match && match[1]) {
      const modeVal = match[1].toLowerCase();
      if (/remote|work\s*from\s*home|wfh/i.test(modeVal)) return 'remote';
      if (/hybrid/i.test(modeVal)) return 'hybrid';
      if (/office|wfo|on-site|onsite|in-office/i.test(modeVal)) return 'office';
    }

    const combinedText = `${rawLocationStr} ${contentText}`.toLowerCase();

    if (/\bhybrid\b/i.test(combinedText)) {
      return 'hybrid';
    }
    if (/\bremote\b|work\s*from\s*home|\bwfh\b/i.test(combinedText)) {
      return 'remote';
    }
    if (/work\s*from\s*office|\bwfo\b|on-site|onsite|in-office/i.test(combinedText)) {
      return 'office';
    }

    return 'office';
  } catch (error) {
    return 'office';
  }
};

/**
 * Extracts employment type ('fullTime', 'partTime', 'internship', 'contract')
 * @param {import('playwright').Page} page
 * @param {string} contentText
 * @returns {string} EmploymentType enum
 */
export const parseEmploymentType = (page, contentText = '') => {
  try {
    const match = contentText.match(/(?:Employment\s*Type|Role\s*Type|Job\s*Type)\s*[:|-]\s*([^\n\r]+)/i);
    const textToScan = `${match ? match[1] : ''} ${contentText}`.toLowerCase();

    if (/internship|intern\b/i.test(textToScan)) {
      return 'internship';
    }
    if (/part\s*-?\s*time/i.test(textToScan)) {
      return 'partTime';
    }
    if (/contract|freelance/i.test(textToScan)) {
      return 'contract';
    }
    return 'fullTime';
  } catch (error) {
    return 'fullTime';
  }
};

/**
 * Parses full job details page into normalized Job object
 * @param {import('playwright').Page} page
 * @param {string} jobUrl
 * @returns {Promise<typeof DEFAULT_JOB_STRUCTURE>} Structured Job object
 */
export const parseJobDetails = async (page, jobUrl) => {
  try {
    const title = await parseTitle(page);
    const cleanTitleLower = (title || '').toLowerCase();

    // Reject non-job pages (search results, archives, 404s)
    if (
      !title ||
      cleanTitleLower === 'untitled position' ||
      cleanTitleLower.includes('search results') ||
      cleanTitleLower.includes('nothing found') ||
      cleanTitleLower.includes('page not found') ||
      cleanTitleLower.includes('404')
    ) {
      return null;
    }

    const description = await parseDescription(page);

    const company = await parseCompany(page, description);
    const rawLocation = await parseLocation(page, description);
    const location = cleanLocationString(rawLocation);
    const workMode = parseWorkMode(page, description, rawLocation);
    const employmentType = parseEmploymentType(page, description);
    const experienceRequired = await parseExperience(page, description);
    const skills = await parseSkills(page, description);
    const resumeTips = await parseResumeTips(page, description);
    const howToApply = await parseHowToApply(page, description);
    const applicationUrl = await parseApplicationUrl(page, jobUrl);
    const hrEmail = await parseHrEmail(page, description);
    const contactNumber = await parseContactNumber(page, description);
    const emailSubject = await parseEmailSubject(page, description, title, company);
    const applicationMethod = parseApplicationMethod(applicationUrl, hrEmail, contactNumber);

    const postedBy = await parsePostedBy(page, description);
    const postedDate = await parsePostedDate(page, description);

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
      resumeTips,
      howToApply,
      applicationUrl,
      hrEmail,
      contactNumber,
      emailSubject,
      applicationMethod,
      postedBy,
      postedDate,
      sourceUrl: jobUrl,
      source: JOB_SOURCES.JOB_VIA_REFERRAL
    };
  } catch (error) {
    await logError('jobViaReferralParser.parseJobDetails', error.message);
    return null;
  }
};

export default {
  parseTitle,
  parseCompany,
  parseLocation,
  cleanLocationString,
  parseWorkMode,
  parseEmploymentType,
  parseExperience,
  parseDescription,
  parseSkills,
  parseResumeTips,
  parseHowToApply,
  parseApplicationUrl,
  parseHrEmail,
  parseContactNumber,
  parseEmailSubject,
  parseApplicationMethod,
  parsePostedBy,
  parsePostedDate,
  parseJobCard,
  parseJobDetails
};
