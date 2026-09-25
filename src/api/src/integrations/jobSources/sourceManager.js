import { naukriConfig } from './naukri/naukriConfig.js';
import { NaukriSource } from './naukri/naukriSource.js';
import { jobViaReferralConfig } from './jobViaReferral/jobViaReferralConfig.js';
import { discoverJobs as jobViaReferralDiscover, openJobDetails as jobViaReferralGetDetails, getJobListingUrls as jobViaReferralGetListingUrls } from '../jobViaReferral/jobViaReferralSource.js';
import { logError } from '../../utils/logger.js';

/**
 * Registry of available job source integrations
 */
const sourceRegistry = {
  naukri: {
    config: naukriConfig,
    Source: NaukriSource,
    searchJobs: (page, searchConfig) => new NaukriSource({ page }).discoverJobs(searchConfig),
  },

  jobViaReferral: {
    config: jobViaReferralConfig,
    searchJobs: (page, searchConfig) => jobViaReferralDiscover(page, searchConfig),
  },
};

/**
 * Retrieves a registered job source adapter by name
 * @param {string} sourceName
 * @param {object} dependencies - Optional dependencies like { page }
 * @returns {object} Source adapter object with config, instance, and searchJobs
 */
export const getJobSource = (sourceName = 'jobViaReferral', dependencies = {}) => {
  const source = sourceRegistry[sourceName];

  if (!source) {
    throw new Error(`Unsupported job source: '${sourceName}'`);
  }

  return {
    config: source.config,
    instance: source.Source ? new source.Source(dependencies) : null,
    searchJobs: (page, searchConfig) => source.searchJobs(page, searchConfig),
  };
};

/**
 * Lists all registered job sources and their capability flags
 * @returns {Array<object>}
 */
export const listJobSources = () => {
  return Object.keys(sourceRegistry).map((key) => ({
    name: key,
    config: sourceRegistry[key].config,
  }));
};

export default {
  getJobSource,
  listJobSources,
};
