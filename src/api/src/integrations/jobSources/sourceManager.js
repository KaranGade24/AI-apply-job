import { discoverJobs, openJobDetails, getJobListingUrls } from '../jobViaReferral/jobViaReferralSource.js';
import { parseJobCard, parseJobDetails } from '../jobViaReferral/jobViaReferralParser.js';
import { discoverJobs as discoverNaukriJobs, openJobDetails as openNaukriJobDetails } from './naukri/naukriSource.js';
import { parseNaukriJobCard, parseNaukriJobDetails } from './naukri/naukriParser.js';
import { logError } from '../../utils/logger.js';

/**
 * JobViaReferral Source Configuration Adapter
 */
export const jobViaReferralConfig = Object.freeze({
  name: 'jobViaReferral',

  capabilities: Object.freeze({
    keywords: true,
    locations: true,
    experience: true,
    workMode: true,
    employmentType: false,
    postedWithin: true,
    salary: false
  }),

  searchJobs: discoverJobs,
  getJobDetails: openJobDetails,
  getJobListingUrls,
  parseJobCard,
  parseJobDetails
});

/**
 * Naukri Source Configuration Adapter
 */
export const naukriConfig = Object.freeze({
  name: 'naukri',

  capabilities: Object.freeze({
    keywords: true,
    locations: true,
    experience: true,
    workMode: true,
    employmentType: true,
    postedWithin: true,
    salary: true
  }),

  searchJobs: discoverNaukriJobs,
  getJobDetails: openNaukriJobDetails,
  parseJobCard: parseNaukriJobCard,
  parseJobDetails: parseNaukriJobDetails
});

/**
 * Registry of available job sources
 */
const jobSources = {
  jobViaReferral: jobViaReferralConfig,
  naukri: naukriConfig
};

/**
 * Retrieves a job source configuration adapter by name
 * @param {string} sourceName
 * @returns {object} Source adapter object
 */
export const getJobSource = (sourceName = 'jobViaReferral') => {
  const source = jobSources[sourceName];
  if (!source) {
    throw new Error(`Job source '${sourceName}' is not registered in sourceManager.`);
  }
  return source;
};


/**
 * Lists all registered job sources and their capability flags
 * @returns {Array<object>}
 */
export const listAvailableSources = () => {
  return Object.keys(jobSources).map(key => ({
    name: jobSources[key].name,
    capabilities: jobSources[key].capabilities
  }));
};

export default {
  getJobSource,
  listAvailableSources,
  jobSources
};
