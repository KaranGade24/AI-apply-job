import { tool } from '@langchain/core/tools';
import { geminiModel } from '../config/modelConfig.js';
import { jobUrlResolverResultSchema } from '../schema/jobUrlResolverSchema.js';
import { JOB_VIA_REFERRAL_CATEGORIES } from '../../constant/jobviareferral.constant.js';
import { logError, logJobEvent } from '../../utils/logger.js';

/**
 * Deterministic fallback function in case LLM service is unavailable or rate-limited
 */
export const fallbackUrlResolver = (searchConfig = {}) => {
  const keywords = (searchConfig.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  const locations = (searchConfig.locations || []).map((l) => String(l).trim().toLowerCase());
  const minExp = Number(searchConfig.experience?.min ?? searchConfig.minExp ?? 0);
  const maxExp = Number(searchConfig.experience?.max ?? searchConfig.maxExp ?? 10);
  const workModes = (searchConfig.workMode || []).map((w) => String(w).trim().toLowerCase());

  const urls = [];

  // 1. Keyword search query URLs
  keywords.forEach((kw) => {
    const encoded = encodeURIComponent(kw);
    urls.push({
      url: `https://jobviareferral.com/?s=${encoded}`,
      label: `Keyword Search: ${kw}`,
      priority: urls.length + 1,
    });
  });

  // 2. Specific category URLs based on rules
  const kwJoined = keywords.join(' ').toLowerCase();

  if (kwJoined.includes('qa') || kwJoined.includes('test') || kwJoined.includes('quality') || kwJoined.includes('automation')) {
    urls.push({
      url: JOB_VIA_REFERRAL_CATEGORIES.QA_REFERRAL,
      label: 'QA & Testing Jobs',
      priority: urls.length + 1,
    });
  }

  if (locations.some((l) => ['abroad', 'overseas', 'international', 'dubai', 'us', 'uk', 'canada', 'germany'].includes(l))) {
    urls.push({
      url: JOB_VIA_REFERRAL_CATEGORIES.ABROAD_JOBS,
      label: 'Abroad & Overseas Jobs',
      priority: urls.length + 1,
    });
  }

  if (locations.some((l) => l.includes('remote')) || workModes.some((w) => w.includes('remote')) || kwJoined.includes('remote')) {
    urls.push({
      url: JOB_VIA_REFERRAL_CATEGORIES.WORK_FROM_HOME,
      label: 'Work From Home / Remote Jobs',
      priority: urls.length + 1,
    });
  }

  if (minExp >= 2 || (minExp > 0 && maxExp > 2)) {
    urls.push({
      url: JOB_VIA_REFERRAL_CATEGORIES.EXPERIENCED_REFERRAL,
      label: 'Experienced Referral Jobs',
      priority: urls.length + 1,
    });
  } else {
    urls.push({
      url: JOB_VIA_REFERRAL_CATEGORIES.FRESHER_REFERRAL,
      label: 'Fresher Referral Jobs',
      priority: urls.length + 1,
    });
  }

  if (urls.length === 0) {
    urls.push({
      url: JOB_VIA_REFERRAL_CATEGORIES.HOME,
      label: 'All Referral Jobs',
      priority: 1,
    });
  }

  return {
    resolvedUrls: urls,
    reasoning: 'Fallback deterministic URL resolution based on keywords, experience, location, and role categories.',
  };
};

/**
 * AI Service function that uses Gemini model to dynamically determine best search URLs on jobviareferral.com
 */
export const resolveJobSearchUrlsWithAI = async (searchConfig = {}) => {
  try {
    const prompt = `You are an expert Job Search Query Strategy AI for jobviareferral.com.
Given candidate search criteria, decide the best prioritized list of search and category URLs to query on jobviareferral.com.

Available Categories:
- Experienced Jobs: "${JOB_VIA_REFERRAL_CATEGORIES.EXPERIENCED_REFERRAL}"
- QA / Testing Jobs: "${JOB_VIA_REFERRAL_CATEGORIES.QA_REFERRAL}"
- Abroad / Overseas Jobs: "${JOB_VIA_REFERRAL_CATEGORIES.ABROAD_JOBS}"
- Fresher Jobs: "${JOB_VIA_REFERRAL_CATEGORIES.FRESHER_REFERRAL}"
- Remote / Work From Home: "${JOB_VIA_REFERRAL_CATEGORIES.WORK_FROM_HOME}"
- Home / All Jobs: "${JOB_VIA_REFERRAL_CATEGORIES.HOME}"

Available Search Query Format:
- "https://jobviareferral.com/?s=YOUR_URL_ENCODED_KEYWORD"

Candidate Search Criteria:
- Keywords: ${JSON.stringify(searchConfig.keywords || [])}
- Locations: ${JSON.stringify(searchConfig.locations || [])}
- Experience Range: Min ${searchConfig.experience?.min ?? searchConfig.minExp ?? 0} yrs, Max ${searchConfig.experience?.max ?? searchConfig.maxExp ?? 10} yrs
- Work Modes: ${JSON.stringify(searchConfig.workMode || [])}

Rules:
1. If keywords are provided, create dedicated search query URLs for each keyword (e.g. https://jobviareferral.com/?s=MERN+Developer).
2. Include relevant category URLs matching QA/Testing, Abroad/Location, Experience, or Remote/Work From Home.
3. Prioritize specific keyword queries first, followed by relevant specialized category URLs.
4. Provide a priority number starting from 1 for each URL.

Respond using structured output matching the schema.`;

    const structuredLlm = geminiModel.withStructuredOutput(jobUrlResolverResultSchema);
    const response = await structuredLlm.invoke(prompt);

    if (response && response.resolvedUrls && response.resolvedUrls.length > 0) {
      await logJobEvent(
        'jobUrlResolverWithAI',
        'SUCCESS',
        `AI resolved ${response.resolvedUrls.length} target URLs: ${response.resolvedUrls.map((u) => u.label).join(', ')}`
      );
      return response;
    }

    return fallbackUrlResolver(searchConfig);
  } catch (error) {
    await logError('jobUrlResolverWithAI.error', error.message);
    return fallbackUrlResolver(searchConfig);
  }
};

/**
 * LangChain Tool wrapper for Job URL Resolver
 */
export const jobUrlResolverTool = tool(
  async (inputConfig) => {
    const result = await resolveJobSearchUrlsWithAI(inputConfig);
    return JSON.stringify(result, null, 2);
  },
  {
    name: 'jobUrlResolverTool',
    description: 'Uses AI to dynamically decide and prioritize target job search URLs on jobviareferral.com based on user criteria.',
  }
);

export default jobUrlResolverTool;
