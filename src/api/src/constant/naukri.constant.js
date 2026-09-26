/**
 * Centralized Naukri Integration Constants
 */

export const NAUKRI_URLS = Object.freeze({
  HOME: 'https://www.naukri.com',
  LOGIN: 'https://www.naukri.com/nlogin/login',
  BASE_SEARCH: 'https://www.naukri.com'
});

export const NAUKRI_AUTH_STATUS = Object.freeze({
  CONNECTED: 'connected',
  AUTHENTICATION_REQUIRED: 'authenticationRequired',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting'
});

export const NAUKRI_APPLICATION_METHOD = Object.freeze({
  NAUKRI_DIRECT: 'naukri',
  COMPANY_SITE: 'company_site',
  EXTERNAL: 'external'
});

export const NAUKRI_SELECTORS = Object.freeze({
  // Elements visible when user is logged in
  LOGGED_IN_INDICATORS: [
    '.nI-gNb-drawer__user-details',
    '.user-name',
    '.view-profile-wrapper',
    '.nI-gNb-header__wrapper a[href*="myprofile"]',
    '.nI-gNb-user-name',
    '.nI-gNb-drawer__icon',
    'a[title="View profile"]',
    '.user-profile'
  ],

  // Elements visible on login page or when logged out
  LOGGED_OUT_INDICATORS: [
    '#login_Layer',
    '.nI-gNb-btn--login',
    'a[href*="/nlogin/login"]',
    'input#usernameField',
    'input[type="password"]',
    '.login-layer',
    'form[name="login-form"]'
  ],

  // Job Listing Card Selectors
  JOB_CONTAINER: '.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple',
  JOB_TITLE: 'a.title, .jobTitle, h2.heading',
  COMPANY_NAME: 'a.comp-name, .companyInfo a.subTitle, .comp-name, .subTitle',
  EXPERIENCE: '.exp-wrap .exp, .experience, span[class*="exp"]',
  LOCATION: '.loc-wrap .loc, .location, span[class*="loc"]',
  SALARY: '.sal-wrap .sal, .salary, span[class*="sal"]',
  TAGS: '.tags-gt li, .tag-li, .dot-gt li, .styles_chip__',
  POSTED_DATE: '.job-post-day, span[class*="posted-day"], span[class*="day-ago"]',

  // Application Button Selectors
  APPLY_BUTTON: '#apply-button, button:has-text("Apply"), .apply-button, a:has-text("Apply")',
  COMPANY_SITE_BUTTON: 'button:has-text("Apply on company site"), a:has-text("Apply on company site"), a.company-site-button',
  EXTERNAL_APPLY_BUTTON: 'button:has-text("Apply on external site"), a:has-text("Apply on external site")'
});

export const NAUKRI_DEFAULTS = Object.freeze({
  PAGE_TIMEOUT_MS: 20000,
  AUTH_CHECK_TIMEOUT_MS: 8000,
  WAIT_AFTER_NAV_MS: 2000
});
