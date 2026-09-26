import { NAUKRI_SELECTORS } from '../../../constant/naukri.constant.js';
import { logJobEvent, logError } from '../../../utils/logger.js';

/**
 * Detects whether the current Playwright page session on Naukri is authenticated
 * Uses URL analysis, DOM elements (profile drawer, username, login buttons), and session cookies.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ authenticated: boolean, state: 'authenticated' | 'loginRequired', userDetails?: { name?: string, email?: string } }>}
 */
export const detectNaukriAuthState = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { authenticated: false, state: 'loginRequired' };
    }

    const currentUrl = page.url() || '';

    // 1. Direct URL check for login / signup pages
    if (
      currentUrl.includes('/nlogin/login') ||
      currentUrl.includes('/nlogin/register') ||
      currentUrl.includes('naukri.com/login')
    ) {
      await logJobEvent('detectNaukriAuthState', 'CHECK', 'Redirected to login URL: loginRequired');
      return { authenticated: false, state: 'loginRequired' };
    }

    // 2. Fast DOM detection with timeout
    const detectionResult = await page.evaluate((selectors) => {
      // Check for logged-in indicators
      let isLoggedIn = false;
      let userName = '';
      let userEmail = '';

      for (const sel of selectors.LOGGED_IN_INDICATORS) {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el.textContent || '').trim();
          if (text && !text.toLowerCase().includes('login') && !text.toLowerCase().includes('sign in')) {
            isLoggedIn = true;
            if (!userName && text.length < 50) {
              userName = text.split('\n')[0].trim();
            }
          } else if (!text && el.clientHeight > 0) {
            isLoggedIn = true;
          }
        }
      }

      // Check for prominent logged-out indicators
      let isLoggedOut = false;
      for (const sel of selectors.LOGGED_OUT_INDICATORS) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { // Element is visible
          isLoggedOut = true;
          break;
        }
      }

      // If user profile drawer is found, extract user info
      const drawer = document.querySelector('.nI-gNb-drawer__user-details, .view-profile-wrapper');
      if (drawer) {
        isLoggedIn = true;
        const nameEl = drawer.querySelector('.name, .user-name, h3, div[class*="name"]');
        if (nameEl) userName = (nameEl.textContent || '').trim();
        const emailEl = drawer.querySelector('.email, div[class*="email"]');
        if (emailEl) userEmail = (emailEl.textContent || '').trim();
      }

      return {
        isLoggedIn,
        isLoggedOut,
        userName,
        userEmail
      };
    }, NAUKRI_SELECTORS).catch(() => ({ isLoggedIn: false, isLoggedOut: true, userName: '', userEmail: '' }));

    // 3. Cookie state verification
    let hasAuthCookies = false;
    try {
      const cookies = await page.context().cookies('https://www.naukri.com');
      const authCookieNames = ['cId', 'nlogin', 'naukri_user', 'ab_exp', 'is_login', 'App_Session'];
      hasAuthCookies = cookies.some((c) => authCookieNames.includes(c.name) && Boolean(c.value));
    } catch {
      // ignore
    }

    if (detectionResult.isLoggedIn || (hasAuthCookies && !detectionResult.isLoggedOut)) {
      await logJobEvent(
        'detectNaukriAuthState',
        'AUTH_VERIFIED',
        `User is authenticated on Naukri. Profile: ${detectionResult.userName || 'Verified'}`
      );
      return {
        authenticated: true,
        state: 'authenticated',
        userDetails: {
          name: detectionResult.userName,
          email: detectionResult.userEmail
        }
      };
    }

    await logJobEvent('detectNaukriAuthState', 'AUTH_REQUIRED', 'No valid Naukri auth session detected.');
    return {
      authenticated: false,
      state: 'loginRequired'
    };
  } catch (error) {
    await logError('naukriAuthDetector.detectNaukriAuthState', error.message);
    return {
      authenticated: false,
      state: 'loginRequired'
    };
  }
};

export default {
  detectNaukriAuthState
};
