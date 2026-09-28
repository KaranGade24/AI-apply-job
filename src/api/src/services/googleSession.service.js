import { BrowserManager } from '../browser/browserManager.js';
import {
  findGoogleAccountByUserId,
  upsertGoogleAccount,
  updateGoogleAccountStatus,
  deleteGoogleAccountByUserId,
} from '../repositories/googleAccount.repository.js';
import { encryptValue, decryptValue } from '../utils/encryption.js';
import { GOOGLE_AUTH_STATUS, GOOGLE_URLS, GOOGLE_SELECTORS } from '../constant/google.constant.js';
import { appError } from '../utils/errors.js';
import { logJobEvent, logError } from '../utils/logger.js';

/**
 * Detects whether a Playwright page is at a Google Sign-in screen
 * or if the user is authenticated.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ isSignInRequired: boolean, authenticated: boolean, currentUrl: string, userDetails?: object }>}
 */
export const detectGoogleAuthState = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { isSignInRequired: false, authenticated: false, currentUrl: '' };
    }

    const currentUrl = page.url() || '';
    const lowerUrl = currentUrl.toLowerCase();

    // Check URL patterns for Google Sign-in
    const isSignInUrl =
      lowerUrl.includes('accounts.google.com/signin') ||
      lowerUrl.includes('accounts.google.com/v3/signin') ||
      lowerUrl.includes('accounts.google.com/servicelogin') ||
      lowerUrl.includes('accounts.google.com/interactive/signin');

    // Check DOM and text snippets
    const pageText = await page.evaluate(() => {
      return (document.body?.innerText || '').toLowerCase();
    }).catch(() => '');

    const hasSignInText = GOOGLE_SELECTORS.LOGIN_TEXT_PATTERNS.some((pattern) =>
      pageText.includes(pattern)
    );

    const hasLoginSelector = await page.evaluate((selectors) => {
      return selectors.some((sel) => !!document.querySelector(sel));
    }, GOOGLE_SELECTORS.LOGIN_INDICATORS).catch(() => false);

    if (isSignInUrl || hasSignInText || (hasLoginSelector && lowerUrl.includes('google.com'))) {
      return {
        isSignInRequired: true,
        authenticated: false,
        currentUrl,
      };
    }

    // Check for logged-in indicators
    const hasLoggedInIndicator = await page.evaluate((selectors) => {
      return selectors.some((sel) => !!document.querySelector(sel));
    }, GOOGLE_SELECTORS.LOGGED_IN_INDICATORS).catch(() => false);

    // If on docs.google.com/forms and no sign-in was required, it's authenticated or public form
    const isFormsPage = lowerUrl.includes('docs.google.com/forms');

    // Attempt to extract logged in email if present
    const extractedEmail = await page.evaluate(() => {
      const emailEl =
        document.querySelector('[data-email]') ||
        document.querySelector('.gb_d') ||
        document.querySelector('.gb_E');
      return emailEl?.getAttribute('data-email') || emailEl?.textContent?.trim() || '';
    }).catch(() => '');

    return {
      isSignInRequired: false,
      authenticated: hasLoggedInIndicator || isFormsPage,
      currentUrl,
      userDetails: extractedEmail ? { email: extractedEmail } : null,
    };
  } catch (error) {
    await logError('googleSessionService.detectGoogleAuthState', error.message);
    return { isSignInRequired: false, authenticated: false, currentUrl: '' };
  }
};

/**
 * Resolves decrypted Playwright storageState from user's saved GoogleAccount record
 * @param {string} userId
 * @returns {Promise<object|null>} storageState object or null
 */
export const getDecryptedGoogleSession = async (userId) => {
  try {
    if (!userId) return null;
    const account = await findGoogleAccountByUserId(userId);
    if (!account?.encryptedStorageState?.cipherText) {
      return null;
    }

    const decryptedJson = decryptValue(account.encryptedStorageState);
    return JSON.parse(decryptedJson);
  } catch (error) {
    await logError('googleSessionService.getDecryptedGoogleSession', error.message);
    return null;
  }
};

/**
 * Verifies if user's saved Google session is currently valid
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const checkGoogleSessionStatusService = async (userId) => {
  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    const account = await findGoogleAccountByUserId(userId);
    if (!account || !account.encryptedStorageState?.cipherText) {
      return {
        connected: false,
        status: GOOGLE_AUTH_STATUS.DISCONNECTED,
        message: 'No Google session connected. Forms requiring sign-in will prompt for login.',
      };
    }

    return {
      connected: account.status === GOOGLE_AUTH_STATUS.CONNECTED,
      status: account.status,
      userEmail: account.userEmail || '',
      userName: account.userName || '',
      lastValidatedAt: account.lastValidatedAt,
      message:
        account.status === GOOGLE_AUTH_STATUS.CONNECTED
          ? 'Google session is connected and active.'
          : 'Google session requires re-authentication.',
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('googleSessionService.checkGoogleSessionStatusService', error.message);
    throw new appError(`Failed to check Google session: ${error.message}`, 500);
  }
};

/**
 * Saves and validates a user's Google session cookies / storageState
 * Supports:
 *   - storageState object { cookies: [...], origins: [...] }
 *   - raw cookies array
 *   - JSON string pasted by user
 *
 * @param {string} userId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export const saveGoogleSessionService = async (userId, payload = {}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    let storageStateToLoad = null;

    // Handle stringified JSON
    if (typeof payload === 'string' || typeof payload.sessionJson === 'string') {
      try {
        const rawJson = typeof payload === 'string' ? payload : payload.sessionJson;
        storageStateToLoad = JSON.parse(rawJson);
      } catch {
        throw new appError('Invalid JSON format for Google session.', 400);
      }
    } else if (payload.storageState) {
      storageStateToLoad = payload.storageState;
    } else if (Array.isArray(payload.cookies) && payload.cookies.length > 0) {
      storageStateToLoad = {
        cookies: payload.cookies,
        origins: [],
      };
    } else if (payload.cookies && typeof payload.cookies === 'string') {
      // Netscape or JSON cookie string
      try {
        const parsed = JSON.parse(payload.cookies);
        storageStateToLoad = Array.isArray(parsed)
          ? { cookies: parsed, origins: [] }
          : parsed;
      } catch {
        throw new appError('Invalid cookie format. Please provide a JSON array or storageState.', 400);
      }
    }

    if (!storageStateToLoad) {
      throw new appError(
        'Please provide Google session cookies or browser storageState JSON.',
        400
      );
    }

    await logJobEvent(
      'googleSessionService',
      'VALIDATE_SESSION',
      `Validating Google session for User: ${userId}`
    );

    // Launch Playwright to test the session
    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(browser, {
      storageState: storageStateToLoad,
    });
    page = await context.newPage();

    // Verify session on Google My Account / Google Forms
    await page.goto(GOOGLE_URLS.MY_ACCOUNT, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2000);

    const authState = await detectGoogleAuthState(page);

    if (authState.isSignInRequired) {
      await logJobEvent(
        'googleSessionService',
        'LOGIN_REQUIRED',
        'Google session test was redirected to sign-in screen.'
      );
      throw new appError(
        'The provided Google session is expired or not logged in. Please log in to Google in your browser, copy fresh cookies, and try again.',
        401
      );
    }

    // Capture the active storageState
    const freshStorageState = await BrowserManager.captureStorageState(context);

    // Extract user email if visible
    let detectedEmail = authState.userDetails?.email || payload.userEmail || '';
    if (!detectedEmail) {
      detectedEmail = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        const match = text.match(/[a-zA-Z0-9._%+-]+@gmail\.com/i) || text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        return match ? match[0] : '';
      }).catch(() => '');
    }

    // Encrypt with AES-256-GCM
    const encryptedState = encryptValue(JSON.stringify(freshStorageState));

    const updated = await upsertGoogleAccount(userId, {
      encryptedStorageState: encryptedState,
      status: GOOGLE_AUTH_STATUS.CONNECTED,
      userEmail: detectedEmail,
      userName: payload.userName || '',
      lastValidatedAt: new Date(),
    });

    await logJobEvent(
      'googleSessionService',
      'CONNECTED',
      `Google session successfully saved & encrypted for User: ${userId} (${detectedEmail || 'Account'})`
    );

    return {
      success: true,
      connected: true,
      status: GOOGLE_AUTH_STATUS.CONNECTED,
      userEmail: updated.userEmail,
      lastValidatedAt: updated.lastValidatedAt,
      message: 'Google session successfully saved and verified! You can now auto-fill protected Google Forms.',
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('googleSessionService.saveGoogleSessionService', error.message);
    throw new appError(`Failed to save Google session: ${error.message}`, 500);
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Disconnects and deletes Google session for user
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const disconnectGoogleSessionService = async (userId) => {
  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    await deleteGoogleAccountByUserId(userId);

    await logJobEvent(
      'googleSessionService',
      'DISCONNECTED',
      `Google session removed for User: ${userId}`
    );

    return {
      success: true,
      connected: false,
      status: GOOGLE_AUTH_STATUS.DISCONNECTED,
      message: 'Google session disconnected successfully.',
    };
  } catch (error) {
    await logError('googleSessionService.disconnectGoogleSessionService', error.message);
    throw error;
  }
};
