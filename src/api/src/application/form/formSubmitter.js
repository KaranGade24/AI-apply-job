import { logJobEvent, logError } from '../../utils/logger.js';
import { isSuccessPage } from '../pageAnalysis/pageStateDetector.js';

const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Submit Application")',
  'button:has-text("Submit application")',
  'button:has-text("SUBMIT APPLICATION")',
  'button:has-text("Submit")',
  'button:has-text("SUBMIT")',
  'button:has-text("Apply Now")',
  'button:has-text("APPLY NOW")',
  'button:has-text("Apply for this Job")',
  'button:has-text("Apply")',
  'button:has-text("Send Application")',
  'button:has-text("Send Message")',
  'button:has-text("Send")',
  'button:has-text("Save & Apply")',
  'button:has-text("Confirm & Submit")',
  'button:has-text("Finish Application")',
  'input[value="Submit" i]',
  'input[value="Apply Now" i]',
  'input[value="Apply" i]',
  'input[value="Send Application" i]',
  'a.btn:has-text("Submit")',
  'a.btn:has-text("Apply Now")',
  'a.btn:has-text("Apply")',
  '[data-automation-id="submit-button"]',
  '[data-automation-id="bottom-navigation-submit-button"]',
  '[data-automation-id="submitButton"]',
  '[role="button"]:has-text("Submit")',
  '[role="button"]:has-text("Apply Now")',
  '[role="button"]:has-text("Apply")',
];

const NEXT_BUTTON_SELECTORS = [
  'button:has-text("Next")',
  'button:has-text("NEXT")',
  'button:has-text("Next Step")',
  'button:has-text("Save & Continue")',
  'button:has-text("Save and Continue")',
  'button:has-text("Continue")',
  'button:has-text("Proceed")',
  '[data-automation-id="next-button"]',
  '[data-automation-id="bottom-navigation-next-button"]',
  '[data-automation-id="createAccountSubmitButton"]',
  'button:has-text("Create Account")',
];

/**
 * Finds the best submit or next button locator on the current page.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ locator: import('playwright').Locator|null, isFinalSubmit: boolean, text: string }>}
 */
export const findSubmitOrNextButton = async (page) => {
  // Check submit selectors first, ignoring newsletter or subscription buttons
  for (const sel of SUBMIT_BUTTON_SELECTORS) {
    const loc = page.locator(sel).first();
    const visible = await loc.isVisible().catch(() => false);
    if (visible) {
      const text = (await loc.innerText().catch(() => 'Submit')).trim();
      if (/subscribe|sign up for updates|newsletter/i.test(text)) {
        continue;
      }
      return { locator: loc, isFinalSubmit: true, text };
    }
  }

  // Check next/step selectors
  for (const sel of NEXT_BUTTON_SELECTORS) {
    const loc = page.locator(sel).first();
    const visible = await loc.isVisible().catch(() => false);
    if (visible) {
      const text = (await loc.innerText().catch(() => 'Next')).trim();
      if (/subscribe|sign up for updates|newsletter/i.test(text)) {
        continue;
      }
      return { locator: loc, isFinalSubmit: false, text };
    }
  }

  return { locator: null, isFinalSubmit: false, text: '' };
};

/**
 * Executes form submission after human approval or step progression.
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {boolean} [options.requireConfirmation=true]
 * @returns {Promise<{ submitted: boolean, successDetected: boolean, errorMessage: string|null }>}
 */
export const submitForm = async (page, options = {}) => {
  try {
    const { locator, isFinalSubmit, text } = await findSubmitOrNextButton(page);

    if (!locator) {
      return {
        submitted: false,
        successDetected: false,
        errorMessage: 'No visible submit or next button found on the page.',
      };
    }

    await logJobEvent('formSubmitter', 'SUBMIT_CLICK', `Clicking ${isFinalSubmit ? 'submit' : 'next'} button: "${text}"`);
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: 5000 }).catch(async () => {
      await locator.click({ force: true, timeout: 3000 });
    });

    await page.waitForTimeout(3000);
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // Check for success indicators
    const currentUrl = page.url();
    const title = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

    const successDetected = isSuccessPage(currentUrl, title, bodyText);

    // Check for validation / error alerts on page
    const errorAlertLocator = page.locator('.error, .alert-danger, [role="alert"], .field-validation-error').first();
    const errorVisible = await errorAlertLocator.isVisible().catch(() => false);
    let errorMessage = null;
    if (errorVisible) {
      errorMessage = await errorAlertLocator.innerText().catch(() => 'Validation error displayed on page');
    }

    return {
      submitted: true,
      successDetected,
      isFinalSubmit,
      errorMessage,
    };
  } catch (err) {
    await logError('formSubmitter.submitForm', err.message);
    return {
      submitted: false,
      successDetected: false,
      errorMessage: err.message,
    };
  }
};
