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
 * Generates primary and fallback candidate search URLs
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

  const keywords = rawKeywords.length > 0 ? rawKeywords : ['Software Engineer'];

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

  // Primary keyword and location slugs
  const primaryKeyword = keywords[0] || 'Software Engineer';
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

  // Candidate 1: Direct Clean Naukri Slug URL (Most reliable on modern Naukri)
  // e.g. https://www.naukri.com/mern-developer-jobs-in-pune?experience=0
  candidateUrls.push(
    `https://www.naukri.com/${primaryKeywordSlug}-jobs-in-${primaryLocationSlug}?experience=${minExp}`
  );

  // Candidate 2: Clean Naukri Slug without query params
  // e.g. https://www.naukri.com/mern-developer-jobs-in-pune
  candidateUrls.push(
    `https://www.naukri.com/${primaryKeywordSlug}-jobs-in-${primaryLocationSlug}`
  );

  // Candidate 3: Secondary keyword if available (e.g. Node js Developer)
  if (keywords.length > 1) {
    const secondaryKeyword = keywords[1];
    const secondarySlug = secondaryKeyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    candidateUrls.push(
      `https://www.naukri.com/${secondarySlug}-jobs-in-${primaryLocationSlug}?experience=${minExp}`
    );
    candidateUrls.push(
      `https://www.naukri.com/${secondarySlug}-jobs-in-${primaryLocationSlug}`
    );
  }

  // Candidate 4: Query parameter search
  // e.g. https://www.naukri.com/jobs-in-pune?k=MERN+Developer&experience=0
  candidateUrls.push(
    `https://www.naukri.com/jobs-in-${primaryLocationSlug}?k=${encodeURIComponent(primaryKeyword)}&experience=${minExp}`
  );

  // Candidate 5: Generic keyword search
  // e.g. https://www.naukri.com/${primaryKeywordSlug}-jobs
  candidateUrls.push(`https://www.naukri.com/${primaryKeywordSlug}-jobs`);

  // Remove duplicates
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
