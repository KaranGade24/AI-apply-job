/**
 * Naukri DOM Selectors Specification
 * Modularized for easy maintenance if Naukri updates its frontend class names.
 */
export const naukriSelectors = Object.freeze({
  auth: {
    loginPageUrl: 'https://www.naukri.com/nlogin/login',
    homePageUrl: 'https://www.naukri.com/mnjuser/homepage',
    usernameInput: '#usernameField, input[placeholder*="Username"], input[placeholder*="Email"]',
    passwordInput: '#passwordField, input[placeholder*="Password"]',
    submitButton: 'button[type="submit"].btn-primary, button.loginButton',
    googleLoginBtn: 'button[value="google"], button:has-text("Continue with Google"), .google-login-btn',
    
    // Authenticated state indicators
    authenticatedIndicators: [
      '.nI-gnd-drawer',
      '.nI-gnd-header__icon',
      'a[href*="/mnjuser/profile"]',
      '.my-naukri',
      'a[href*="logout"]',
      '.nI-gnd-profile',
      'a[href*="/mnjuser/homepage"]',
      '.profile-summary'
    ],
    
    // Unauthenticated / Login state indicators
    unauthenticatedIndicators: [
      'a[href*="/nlogin/login"]',
      '.nI-gnd-header__login-btn',
      '#login_Layer',
      'button:has-text("Continue with Google")',
      '.login-btn',
      '#usernameField'
    ],

    // Security challenge indicators
    challengeIndicators: [
      'iframe[src*="captcha"]',
      '.captcha-container',
      '#otp-container',
      'text="Enter OTP"',
      'text="Security Verification"',
      'text="Verification Code"'
    ]
  },

  search: {
    keywordInput: 'input.sugInp, input[placeholder*="Search"], .keywordSugg input',
    locationInput: 'input[placeholder*="location"], input[placeholder*="Location"]',
    experienceDropdown: '#experienceDD, .expSugg input',
    searchButton: 'button.qsbSubmit, .search-btn, button[type="submit"]',
  },

  jobList: {
    jobCard: 'article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple, div[data-job-id]',
    jobTitle: 'a.title, a.job-title, .title.fw500, h2.title a',
    companyName: 'a.comp-name, .comp-name, a.subTitle, .companyName',
    location: '.loc-wrap .loc, .location, span.locWraper, .locWraper',
    experience: '.exp-wrap .exp, .experience, span.expWraper, .expWraper',
    salary: '.salary-wrap .salary, .salary, span.salWraper, .salWraper',
    postedDate: '.job-post-day, .posted-date, .stat',
    tags: '.tags-gt .tag-li, .dot-gt, .tags-container .tag',
  },

  jobDetails: {
    title: 'h1.jd-header-title, h1.title, .styles_jd-header-title__4S2cW, h1',
    companyName: 'a.jd-header-comp-name, .jd-header-comp-name, .styles_jd-header-comp-name__M12Jb, .company-name',
    experience: '.exp span, .styles_j2-exp__3xK31, .experience span',
    salary: '.salary span, .styles_j2-salary__... span, .salary',
    location: '.loc span, .styles_j2-loc__... span, .location span',
    workMode: '.work-mode, .workMode, .styles_j2-workmode__...',
    employmentType: '.employment-type, .styles_j2-emp-type__...',
    description: 'section.job-desc, .styles_job-desc-container__2S-y-, .job-desc, article.job-description',
    skills: 'a.chip, .key-skill span, .styles_key-skill-chip__..., .skills span',
    postedDate: '.stat span, .styles_stat__... span',
    postedBy: '.recruiter-name, .posted-by, .styles_recruiter-name__...',
    applyButton: 'button.apply-button, #apply-button, .apply-button-container button',
  },
});

export default naukriSelectors;
