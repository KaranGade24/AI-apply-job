import { NAUKRI_URLS } from '../../../constant/naukri.constant.js';

/**
 * Maps duration string to Naukri freshness days filter value
 * @param {string} postedWithin - e.g. '24h', '1d', '3d', '7d', '30d'
 * @returns {number|null}
 */
export const mapFreshnessDays = (postedWithin) => {
  if (!postedWithin || typeof postedWithin !== 'string') return null;
  const lower = postedWithin.toLowerCase().trim();

  if (lower.includes('24h') || lower.includes('1d') || lower === '1') return 1;
  if (lower.includes('3d') || lower === '3') return 3;
  if (lower.includes('7d') || lower === '7') return 7;
  if (lower.includes('15d') || lower === '15') return 15;
  if (lower.includes('30d') || lower.includes('1m') || lower === '30') return 30;

  return 7;
};

/**
 * Maps work mode array to Naukri work mode filter codes
 * @param {Array<string>} workModes
 * @returns {string[]}
 */
export const mapWorkModes = (workModes = []) => {
  const modes = [];
  const normalized = (workModes || []).map((m) => m.toLowerCase());

  if (normalized.includes('remote') || normalized.includes('wfh')) {
    modes.push('wfh');
  }
  if (normalized.includes('hybrid')) {
    modes.push('hybrid');
  }
  if (normalized.includes('workfromoffice') || normalized.includes('office') || normalized.includes('onsite')) {
    modes.push('office');
  }

  return modes;
};

/**
 * Maps universal search configuration to Naukri search URLs and filters
 * Generates primary and fallback candidate search URLs matching standard Naukri desk GNB navigation patterns
 * e.g. https://www.naukri.com/mern-stack-jobs-in-india?k=mern%20stack&l=india&nignbevent_src=jobsearchDeskGNB
 * @param {object} searchConfig
 * @returns {{ targetUrl: string, candidateUrls: string[], keywords: string[], locations: string[], minExp: number, maxExp: number }}
 */
export const mapUniversalFiltersToNaukri = (searchConfig = {}) => {
  let rawKeywords = searchConfig.keywords || [];
  if (typeof rawKeywords === 'string') {
    rawKeywords = rawKeywords.split(',').map((k) => k.trim()).filter(Boolean);
  } else if (Array.isArray(rawKeywords)) {
    rawKeywords = rawKeywords.flatMap((k) =>
      typeof k === 'string' ? k.split(',').map((x) => x.trim()).filter(Boolean) : []
    );
  }

  const keywords = rawKeywords.length > 0 ? rawKeywords : ['MERN Developer'];

  let rawLocations = searchConfig.locations || [];
  if (typeof rawLocations === 'string') {
    rawLocations = rawLocations.split(',').map((l) => l.trim()).filter(Boolean);
  } else if (Array.isArray(rawLocations)) {
    rawLocations = rawLocations.flatMap((l) =>
      typeof l === 'string' ? l.split(',').map((x) => x.trim()).filter(Boolean) : []
    );
  }

  const locations = rawLocations.length > 0 ? rawLocations : ['Pune'];

  const minExp = typeof searchConfig.experience?.min === 'number' ? searchConfig.experience.min : 0;
  const maxExp = typeof searchConfig.experience?.max === 'number' ? searchConfig.experience.max : 2;

  const primaryKeyword = keywords[0] || 'MERN Developer';
  const primaryKeywordSlug = primaryKeyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const geoLocations = locations.filter((l) => l.toLowerCase() !== 'remote');
  const primaryLocation = geoLocations[0] || 'Pune';
  const primaryLocationSlug = primaryLocation
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const candidateUrls = [];

  // 1. Standard Naukri Desk GNB Query URL
  // e.g. https://www.naukri.com/mern-developer-jobs-in-pune?k=MERN%20Developer&l=Pune&nignbevent_src=jobsearchDeskGNB
  candidateUrls.push(
    `https://www.naukri.com/${primaryKeywordSlug}-jobs-in-${primaryLocationSlug}?k=${encodeURIComponent(primaryKeyword)}&l=${encodeURIComponent(primaryLocation)}&nignbevent_src=jobsearchDeskGNB`
  );

  // 2. India Nationwide GNB Query URL
  // e.g. https://www.naukri.com/mern-developer-jobs-in-india?k=MERN%20Developer&l=india&nignbevent_src=jobsearchDeskGNB
  candidateUrls.push(
    `https://www.naukri.com/${primaryKeywordSlug}-jobs-in-india?k=${encodeURIComponent(primaryKeyword)}&l=india&nignbevent_src=jobsearchDeskGNB`
  );

  // 3. Desk GNB with Experience Parameter
  // e.g. https://www.naukri.com/${primaryKeywordSlug}-jobs-in-${primaryLocationSlug}?k=${encodeURIComponent(primaryKeyword)}&l=${encodeURIComponent(primaryLocation)}&experience=${minExp}&nignbevent_src=jobsearchDeskGNB
  candidateUrls.push(
    `https://www.naukri.com/${primaryKeywordSlug}-jobs-in-${primaryLocationSlug}?k=${encodeURIComponent(primaryKeyword)}&l=${encodeURIComponent(primaryLocation)}&experience=${minExp}&nignbevent_src=jobsearchDeskGNB`
  );

  // 4. Secondary Keyword Desk GNB URL if provided (e.g. Node js Developer)
  if (keywords.length > 1) {
    const secondaryKeyword = keywords[1];
    const secondarySlug = secondaryKeyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    candidateUrls.push(
      `https://www.naukri.com/${secondarySlug}-jobs-in-${primaryLocationSlug}?k=${encodeURIComponent(secondaryKeyword)}&l=${encodeURIComponent(primaryLocation)}&nignbevent_src=jobsearchDeskGNB`
    );
    candidateUrls.push(
      `https://www.naukri.com/${secondarySlug}-jobs-in-india?k=${encodeURIComponent(secondaryKeyword)}&l=india&nignbevent_src=jobsearchDeskGNB`
    );
  }

  // 5. Clean Slug Path
  candidateUrls.push(`https://www.naukri.com/${primaryKeywordSlug}-jobs-in-${primaryLocationSlug}`);
  candidateUrls.push(`https://www.naukri.com/${primaryKeywordSlug}-jobs`);

  const uniqueCandidateUrls = Array.from(new Set(candidateUrls));

  return {
    targetUrl: uniqueCandidateUrls[0],
    candidateUrls: uniqueCandidateUrls,
    keywords,
    locations,
    minExp,
    maxExp
  };
};

export default {
  mapUniversalFiltersToNaukri,
  mapFreshnessDays,
  mapWorkModes
};
