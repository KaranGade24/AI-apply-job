import { discoverJobs, openJobDetails, getJobListingUrls } from '../../jobViaReferral/jobViaReferralSource.js';
import { parseJobCard, parseJobDetails } from '../../jobViaReferral/jobViaReferralParser.js';

export const jobViaReferralConfig = Object.freeze({
  name: 'jobViaReferral',
  baseUrl: 'https://jobviareferral.com',

  capabilities: Object.freeze({
    keywords: true,
    locations: true,
    experience: true,
    workMode: true,
    employmentType: false,
    postedWithin: true,
    salary: false,
    skills: true
  }),

  pagination: Object.freeze({
    enabled: true,
    maxPages: 5
  }),

  rateLimit: Object.freeze({
    minDelayMs: 1000,
    maxDelayMs: 2000
  }),

  searchJobs: discoverJobs,
  getJobDetails: openJobDetails,
  getJobListingUrls,
  parseJobCard,
  parseJobDetails
});

export default jobViaReferralConfig;
