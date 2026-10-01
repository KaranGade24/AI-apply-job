import { NAUKRI_APPLICATION_SELECTORS } from './naukriApplicationSelectors.js';

/**
 * Detects the available Apply action on the current Naukri job page
 * @param {import('playwright').Page} page
 * @returns {Promise<{ hasApply: boolean, isCompanySite: boolean, isAlreadyApplied: boolean, selector: string }>}
 */
export const detectApplyAction = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { hasApply: false, isCompanySite: false, isAlreadyApplied: false, selector: '' };
    }

    // 0. Dismiss any blocking popups, drawers, or notification prompts
    await page.evaluate(() => {
      const dismissSelectors = [
        '.crossIcon', '.cross-icon', '[class*="close-icon"]', '[class*="closeIcon"]',
        'button[class*="close"]', '.naukri-drawer-close', '#close-icon',
        '[class*="cross"]', '.chatbot_drawer .cross', '[aria-label="Close"]',
        '.drawerWrapper .crossIcon'
      ];
      for (const sel of dismissSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          el.click();
        }
      }
    }).catch(() => {});

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

    // 1. Try company site button selector
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

    // 2. Try direct apply button selector
    const applyBtn = page.locator(NAUKRI_APPLICATION_SELECTORS.APPLY_BUTTON).first();
    const isDirectApply = await applyBtn.isVisible().catch(() => false);

    if (isDirectApply) {
      const btnText = (await applyBtn.textContent().catch(() => '')).toLowerCase();
      const isExternal = btnText.includes('company') || btnText.includes('external') || btnText.includes('site') || btnText.includes('employer') || btnText.includes('website');

      return {
        hasApply: true,
        isCompanySite: isExternal,
        isAlreadyApplied: false,
        selector: NAUKRI_APPLICATION_SELECTORS.APPLY_BUTTON,
      };
    }

    // 3. Fallback: Full DOM search for modern Naukri buttons
    const fallbackInfo = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], div[class*="apply-button"], span[class*="apply"]'));
      for (const el of candidates) {
        const text = (el.textContent || el.innerText || el.getAttribute('aria-label') || '').trim().toLowerCase();
        if (/already applied|applied/i.test(text) && !text.includes('apply on')) {
          return { isAlreadyApplied: true };
        }
        if (/apply\s*on\s*company|apply\s*on\s*website|apply\s*on\s*site|apply\s*on\s*employer|company\s*site/i.test(text)) {
          return { hasApply: true, isCompanySite: true, text };
        }
        if (/^apply$|^apply\s*now$/i.test(text) || (text.startsWith('apply') && !text.includes('filter') && !text.includes('similar') && !text.includes('alert'))) {
          return { hasApply: true, isCompanySite: false, text };
        }
      }
      return null;
    }).catch(() => null);

    if (fallbackInfo?.isAlreadyApplied) {
      return {
        hasApply: false,
        isCompanySite: false,
        isAlreadyApplied: true,
        selector: '',
      };
    }

    if (fallbackInfo?.hasApply) {
      const targetSelector = fallbackInfo.isCompanySite
        ? 'button:has-text("company site"), a:has-text("company site"), button:has-text("Apply on"), a:has-text("Apply on"), [class*="company-site" i]'
        : 'button:has-text("Apply"), a:has-text("Apply"), [class*="apply" i]';
      return {
        hasApply: true,
        isCompanySite: fallbackInfo.isCompanySite,
        isAlreadyApplied: false,
        selector: targetSelector,
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
    const pageText = (await page.evaluate(() => document.body.innerText || '').catch(() => '')).toLowerCase();

    const successKeywords = [
      'applied successfully',
      'you have successfully applied',
      'application submitted',
      'applied on',
      'your application has been sent',
      'application sent',
      'thank you for applying',
      'we have received your application',
      'responses recorded',
      'response has been recorded',
      'already applied',
      'application received',
      'successfully applied',
      'applied to this job',
      'application in review',
    ];

    for (const kw of successKeywords) {
      if (pageText.includes(kw)) {
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
