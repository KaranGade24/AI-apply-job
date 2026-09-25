/**
 * Naukri Integration Configuration
 */
export const naukriConfig = Object.freeze({
  name: "naukri",
  baseUrl: "https://www.naukri.com",

  capabilities: Object.freeze({
    keywords: true,
    locations: true,
    experience: true,
    workMode: true,
    employmentType: true,
    postedWithin: true,
    salary: true,
    skills: true,
  }),

  pagination: Object.freeze({
    enabled: true,
    maxPages: 10,
    jobsPerPage: 20,
  }),

  rateLimit: Object.freeze({
    minDelayMs: 1500,
    maxDelayMs: 3500,
    maxConcurrentSearches: 1,
  }),

  safetyLimits: Object.freeze({
    maxJobsPerRun: 20,
    maxRetriesPerJob: 2,
  }),
});

export default naukriConfig;
