/**
 * Centralized selectors for Naukri Job Applications
 */
export const NAUKRI_APPLICATION_SELECTORS = Object.freeze({
  // Direct Apply button on job details page
  APPLY_BUTTON: [
    '#apply-button',
    'button#apply-button',
    'button:has-text("Apply")',
    'button.apply-button',
    'a.apply-button',
    '[data-label="Apply"]',
  ].join(', '),

  // Company site redirect apply button
  COMPANY_SITE_BUTTON: [
    '#company-site-button',
    'button#company-site-button',
    'button:has-text("Apply on company site")',
    'a.company-site-button',
    'a:has-text("Apply on company site")',
    '[class*="company-site"]',
  ].join(', '),

  // Questionnaire / Application drawer / modal
  APPLICATION_MODAL: [
    '.apply-modal',
    '.chatbot_drawer',
    '[class*="apply-container"]',
    '[class*="applyModal"]',
    '[class*="drawer"]',
    '[role="dialog"]',
    '.apply-message',
  ].join(', '),

  // Next / Continue buttons on questionnaire
  NEXT_BUTTON: [
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Proceed")',
    'button.next-btn',
    '.nextBtn',
  ].join(', '),

  // Submit / Final Apply buttons on questionnaire
  SUBMIT_BUTTON: [
    'button:has-text("Submit")',
    'button:has-text("Save & Apply")',
    'button:has-text("Apply Now")',
    'button:has-text("Submit Application")',
    'button[type="submit"]',
  ].join(', '),

  // Success confirmation messages / banners
  SUCCESS_BANNER: [
    'text="Applied successfully"',
    'text="You have successfully applied"',
    'text="Application submitted"',
    'text="Applied on"',
    '.already-applied',
    '[class*="applied-banner"]',
  ].join(', '),

  // Captcha / OTP / Security prompts
  CAPTCHA_CONTAINER: [
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',
    '[class*="captcha"]',
    '#captcha',
  ].join(', '),

  OTP_INPUT: [
    'input[placeholder*="OTP" i]',
    'input[name*="otp" i]',
    '[class*="otp-input"]',
  ].join(', '),
});
