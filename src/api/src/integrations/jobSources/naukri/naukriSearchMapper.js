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

  return 7; // Default to last 7 days
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
 * @param {object} searchConfig
 * @returns {{ targetUrl: string, searchParams: URLSearchParams, keywords: string[], locations: string[], minExp: number, maxExp: number }}
 */
export const mapUniversalFiltersToNaukri = (searchConfig = {}) => {
  const keywords = Array.isArray(searchConfig.keywords)
    ? searchConfig.keywords
    : searchConfig.keywords
    ? [searchConfig.keywords]
    : [];

  const locations = Array.isArray(searchConfig.locations)
    ? searchConfig.locations
    : searchConfig.locations
    ? [searchConfig.locations]
    : [];

  const minExp = typeof searchConfig.experience?.min === 'number' ? searchConfig.experience.min : 0;
  const maxExp = typeof searchConfig.experience?.max === 'number' ? searchConfig.experience.max : 2;

  // Construct URL parameters
  const params = new URLSearchParams();

  if (keywords.length > 0) {
    params.set('k', keywords.join(' '));
  } else {
    params.set('k', 'Software Engineer');
  }

  if (locations.length > 0) {
    // Filter out "Remote" from geographic locations to avoid Naukri city mismatch
    const geoLocations = locations.filter((l) => l.toLowerCase() !== 'remote');
    if (geoLocations.length > 0) {
      params.set('l', geoLocations.join(', '));
    }
  }

  if (minExp !== undefined && minExp !== null) {
    params.set('experience', String(minExp));
  }

  const freshness = mapFreshnessDays(searchConfig.postedWithin);
  if (freshness) {
    params.set('freshness', String(freshness));
  }

  const workModes = mapWorkModes(searchConfig.workMode);
  if (workModes.includes('wfh') && !workModes.includes('office')) {
    params.set('wfhType', '0'); // Naukri Remote/WFH
  }

  // Construct clean base search URL
  let keywordSlug = (keywords[0] || 'jobs')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let locationSlug = '';
  if (locations.length > 0 && locations[0].toLowerCase() !== 'remote') {
    locationSlug = locations[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  let basePath = `${keywordSlug}-jobs`;
  if (locationSlug) {
    basePath += `-in-${locationSlug}`;
  }

  const targetUrl = `${NAUKRI_URLS.BASE_SEARCH}/${basePath}?${params.toString()}`;

  return {
    targetUrl,
    searchParams: params,
    keywords,
    locations,
    minExp,
    maxExp,
    workModes,
    freshness
  };
};

export default {
  mapUniversalFiltersToNaukri,
  mapFreshnessDays,
  mapWorkModes
};
