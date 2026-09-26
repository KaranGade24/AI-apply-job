import { NAUKRI_APPLICATION_SELECTORS } from './naukriApplicationSelectors.js';

/**
 * Detects the available Apply action on the current Naukri job page
 * @param {import('playwright').Page} page
 * @returns {Promise<{ hasApply: boolean, isCompanySite: boolean, isAlreadyApplied: boolean, selector: string }>}
 */
export const detectApplyAction = async (page) => {
  try {
    const isAlreadyApplied = await page
      .locator(NAUKRI_APPLICATION_SELECTORS.SUCCESS_BANNER)
      .first()
      .isVisible()
      .catch(() => false);

    if (isAlreadyApplied) {
      return {
        hasApply: false,
        isCompanySite: false,
        isAlreadyApplied: true,
        selector: '',
      };
    }

    const companySiteBtn = page.locator(NAUKRI_APPLICATION_SELECTORS.COMPANY_SITE_BUTTON).first();
    const isCompanySite = await companySiteBtn.isVisible().catch(() => false);

    if (isCompanySite) {
      return {
        hasApply: true,
        isCompanySite: true,
        isAlreadyApplied: false,
        selector: NAUKRI_APPLICATION_SELECTORS.COMPANY_SITE_BUTTON,
      };
    }

    const applyBtn = page.locator(NAUKRI_APPLICATION_SELECTORS.APPLY_BUTTON).first();
    const isDirectApply = await applyBtn.isVisible().catch(() => false);

    if (isDirectApply) {
      return {
        hasApply: true,
        isCompanySite: false,
        isAlreadyApplied: false,
        selector: NAUKRI_APPLICATION_SELECTORS.APPLY_BUTTON,
      };
    }

    return {
      hasApply: false,
      isCompanySite: false,
      isAlreadyApplied: false,
      selector: '',
    };
  } catch (error) {
    return {
      hasApply: false,
      isCompanySite: false,
      isAlreadyApplied: false,
      selector: '',
    };
  }
};

/**
 * Detects if a security challenge (CAPTCHA, OTP, 2FA) is present
 * @param {import('playwright').Page} page
 * @returns {Promise<{ detected: boolean, reason: string|null }>}
 */
export const detectSecurityPrompt = async (page) => {
  try {
    const captchaVisible = await page
      .locator(NAUKRI_APPLICATION_SELECTORS.CAPTCHA_CONTAINER)
      .first()
      .isVisible()
      .catch(() => false);

    if (captchaVisible) {
      return { detected: true, reason: 'captcha' };
    }

    const otpVisible = await page
      .locator(NAUKRI_APPLICATION_SELECTORS.OTP_INPUT)
      .first()
      .isVisible()
      .catch(() => false);

    if (otpVisible) {
      return { detected: true, reason: 'otp' };
    }

    const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
    if (pageText.includes('Two-Factor Authentication') || pageText.includes('verification code')) {
      return { detected: true, reason: '2fa' };
    }

    return { detected: false, reason: null };
  } catch {
    return { detected: false, reason: null };
  }
};

/**
 * Detects whether the application has been submitted successfully
 * @param {import('playwright').Page} page
 * @returns {Promise<{ isSubmitted: boolean, confirmationText: string }>}
 */
export const detectSubmissionSuccess = async (page) => {
  try {
    const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');

    const successKeywords = [
      'applied successfully',
      'you have successfully applied',
      'application submitted',
      'applied on',
      'your application has been sent',
    ];

    for (const kw of successKeywords) {
      if (pageText.toLowerCase().includes(kw)) {
        return { isSubmitted: true, confirmationText: kw };
      }
    }

    const bannerVisible = await page
      .locator(NAUKRI_APPLICATION_SELECTORS.SUCCESS_BANNER)
      .first()
      .isVisible()
      .catch(() => false);

    if (bannerVisible) {
      return { isSubmitted: true, confirmationText: 'Success banner visible' };
    }

    return { isSubmitted: false, confirmationText: '' };
  } catch {
    return { isSubmitted: false, confirmationText: '' };
  }
};
