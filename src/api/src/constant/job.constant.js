/**
 * General Job Constants & Data Structures
 */

export const JOB_SOURCES = Object.freeze({
  JOB_VIA_REFERRAL: 'jobViaReferral'
});

export const SCRAPER_DEFAULTS = Object.freeze({
  MAX_PAGES: 2,
  MAX_JOBS_PER_RUN: 15,
  NAVIGATION_TIMEOUT_MS: 30000,
  WAIT_AFTER_PAGE_LOAD_MS: 2000
});

export const DEFAULT_JOB_STRUCTURE = Object.freeze({
  title: '',
  company: '',
  location: '',
  workMode: 'unspecified',
  employmentType: 'fullTime',
  experienceRequired: '',
  description: '',
  requirements: [],
  responsibilities: [],
  skills: [],
  resumeTips: [],
  howToApply: '',
  applicationUrl: '',
  hrEmail: '',
  contactNumber: '',
  emailSubject: '',
  applicationMethod: 'NOT_SPECIFIED',
  sourceUrl: '',
  source: JOB_SOURCES.JOB_VIA_REFERRAL,
  postedDate: ''
});
