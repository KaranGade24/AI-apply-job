import { logError } from '../../utils/logger.js';

/**
 * Parses duration window like "24h", "48h", "7d", "30d" into milliseconds
 * @param {string} windowStr
 * @returns {number|null} Duration in ms
 */
export const parsePostedWithinMs = (windowStr) => {
  if (!windowStr || typeof windowStr !== 'string') return null;

  const match = windowStr.trim().match(/^(\d+)\s*([hdmy])/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'm': return value * 30 * 24 * 60 * 60 * 1000;
    case 'y': return value * 365 * 24 * 60 * 60 * 1000;
    default: return null;
  }
};

/**
 * Checks if a job was posted within the required timeframe
 * @param {string|Date} postedDate
 * @param {string} postedWithinStr
 * @returns {boolean}
 */
export const checkPostedWithin = (postedDate, postedWithinStr) => {
  if (!postedWithinStr) return true; // No time filter applied

  const maxAgeMs = parsePostedWithinMs(postedWithinStr);
  if (!maxAgeMs) return true; // Unrecognized format, skip filtering

  if (!postedDate) return true; // If date missing on website, don't discard

  const jobTime = new Date(postedDate).getTime();
  if (isNaN(jobTime)) return true;

  const now = Date.now();
  return (now - jobTime) <= maxAgeMs;
};

/**
 * Common deterministic job matcher used by all job portal integrations
 * @param {object} job - Normalized job object
 * @param {object} searchConfig - User search criteria
 * @returns {{ isMatch: boolean, score: number, matchReasons: string[], failReasons: string[] }}
 */
export const compareJobWithConfig = (job = {}, searchConfig = {}) => {
  try {
    const matchReasons = [];
    const failReasons = [];
    let score = 100;

    const fullText = `${job.title || ''} ${job.description || ''} ${(job.skills || []).join(' ')} ${job.location || ''}`.toLowerCase();

    // 1. Keyword Matching
    if (Array.isArray(searchConfig.keywords) && searchConfig.keywords.length > 0) {
      const matchedKeywords = searchConfig.keywords.filter(keyword =>
        fullText.includes(keyword.toLowerCase().trim())
      );

      if (matchedKeywords.length > 0) {
        matchReasons.push(`Matched keywords: ${matchedKeywords.join(', ')}`);
      } else {
        score -= 40;
        failReasons.push(`No matching keywords found from [${searchConfig.keywords.join(', ')}]`);
      }
    }

    // 2. Location Matching
    if (Array.isArray(searchConfig.locations) && searchConfig.locations.length > 0) {
      const jobLoc = (job.location || '').toLowerCase();
      const matchedLocs = searchConfig.locations.filter(loc => {
        const target = loc.toLowerCase().trim();
        return jobLoc.includes(target) || fullText.includes(target) || (target === 'remote' && jobLoc.includes('remote'));
      });

      if (matchedLocs.length > 0) {
        matchReasons.push(`Matched locations: ${matchedLocs.join(', ')}`);
      } else {
        score -= 20;
        failReasons.push(`Location '${job.location}' did not match preferred locations [${searchConfig.locations.join(', ')}]`);
      }
    }

    // 3. Work Mode Matching
    if (Array.isArray(searchConfig.workMode) && searchConfig.workMode.length > 0) {
      const isRemote = /remote|work\s*from\s*home|wfh/i.test(fullText);
      const isHybrid = /hybrid/i.test(fullText);
      const isOffice = /office|onsite/i.test(fullText);

      const requestedModes = searchConfig.workMode.map(m => m.toLowerCase());
      const modeMatches = requestedModes.some(mode => {
        if (mode === 'remote' && isRemote) return true;
        if (mode === 'hybrid' && isHybrid) return true;
        if ((mode === 'workfromoffice' || mode === 'onsite') && isOffice) return true;
        return false;
      });

      if (modeMatches) {
        matchReasons.push('Matched requested work mode');
      } else if (!isRemote && requestedModes.includes('remote')) {
        score -= 15;
        failReasons.push('Position is not remote');
      }
    }

    // 4. Posted Within Window
    if (searchConfig.postedWithin) {
      const isWithinTime = checkPostedWithin(job.postedDate, searchConfig.postedWithin);
      if (isWithinTime) {
        matchReasons.push(`Posted within window (${searchConfig.postedWithin})`);
      } else {
        score -= 30;
        failReasons.push(`Posted date (${job.postedDate}) older than required window (${searchConfig.postedWithin})`);
      }
    }

    const isMatch = score >= 50;

    return {
      isMatch,
      score: Math.max(0, score),
      matchReasons,
      failReasons
    };
  } catch (error) {
    logError('compareJobs.compareJobWithConfig', error.message);
    return {
      isMatch: true,
      score: 50,
      matchReasons: ['Default match due to evaluation error'],
      failReasons: []
    };
  }
};

export default {
  parsePostedWithinMs,
  checkPostedWithin,
  compareJobWithConfig
};
