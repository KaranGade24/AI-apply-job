import { BrowserManager } from '../browser/browserManager.js';
import {
  findNaukriAccountByUserId,
  upsertNaukriAccount,
  updateNaukriAccountStatus,
  deleteNaukriAccountByUserId
} from '../repositories/naukriAccount.repository.js';
import { encryptValue, decryptValue } from '../utils/encryption.js';
import { detectNaukriAuthState } from '../integrations/jobSources/naukri/naukriAuthDetector.js';
import { NAUKRI_AUTH_STATUS, NAUKRI_URLS } from '../constant/naukri.constant.js';
import { appError } from '../utils/errors.js';
import { logJobEvent, logError } from '../utils/logger.js';

/**
 * Connects or verifies a user's Naukri browser session:
 * 1. Checks MongoDB for existing encryptedStorageState
 * 2. If exists, decrypts it and launches Playwright with the restored session
 * 3. Opens https://www.naukri.com and verifies authentication state
 * 4. If valid -> marks 'connected' & updates lastValidatedAt
 * 5. If expired or non-existent -> marks 'authenticationRequired'
 * @param {string} userId - Current authenticated user ID
 * @returns {Promise<object>} Status result
 */
export const connectNaukriService = async (userId) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!userId) {
      throw new appError('User ID is required to connect Naukri account', 400);
    }

    await logJobEvent('connectNaukriService', 'START', `Starting Naukri connection verification for User: ${userId}`);

    // 1. Check database for existing session
    const existingAccount = await findNaukriAccountByUserId(userId);
    let sessionState = null;

    if (
      existingAccount &&
      existingAccount.encryptedStorageState &&
      existingAccount.encryptedStorageState.cipherText
    ) {
      try {
        await logJobEvent('connectNaukriService', 'DECRYPT', 'Decrypting stored AES-256-GCM session...');
        const decryptedJson = decryptValue(existingAccount.encryptedStorageState);
        sessionState = JSON.parse(decryptedJson);
      } catch (decryptErr) {
        await logError('connectNaukriService.decrypt', `Failed to decrypt session: ${decryptErr.message}`);
        sessionState = null;
      }
    }

    // 2. Launch Playwright browser
    browser = await BrowserManager.launch();

    // 3. Create context applying restored sessionState if available
    context = await BrowserManager.createContext(browser, {
      storageState: sessionState || undefined
    });

    page = await context.newPage();

    // 4. Open Naukri website
    await logJobEvent('connectNaukriService', 'NAVIGATE', `Opening ${NAUKRI_URLS.HOME}`);
    await page.goto(NAUKRI_URLS.HOME, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    // Short wait for any client redirection or cookie auth sync
    await page.waitForTimeout(2000);

    // 5. Inspect authentication state
    const authState = await detectNaukriAuthState(page);

    if (authState.authenticated) {
      // Session is valid! Update MongoDB with 'connected' and lastValidatedAt
      const updatedStorageState = await BrowserManager.captureStorageState(context);
      const encryptedState = encryptValue(JSON.stringify(updatedStorageState));

      await upsertNaukriAccount(userId, {
        encryptedStorageState: encryptedState,
        status: NAUKRI_AUTH_STATUS.CONNECTED,
        userName: authState.userDetails?.name || existingAccount?.userName || '',
        userEmail: authState.userDetails?.email || existingAccount?.userEmail || '',
        lastValidatedAt: new Date()
      });

      await logJobEvent(
        'connectNaukriService',
        'CONNECTED',
        `Naukri session valid. Account connected for ${authState.userDetails?.name || 'User'}`
      );

      return {
        success: true,
        status: NAUKRI_AUTH_STATUS.CONNECTED,
        authenticated: true,
        message: 'Naukri account is connected and session is valid.',
        userDetails: authState.userDetails,
        lastValidatedAt: new Date()
      };
    }

    // Session is invalid / expired or not connected yet
    const nextStatus = existingAccount?.encryptedStorageState?.cipherText
      ? NAUKRI_AUTH_STATUS.AUTHENTICATION_REQUIRED
      : NAUKRI_AUTH_STATUS.DISCONNECTED;

    await updateNaukriAccountStatus(userId, nextStatus, new Date());

    await logJobEvent(
      'connectNaukriService',
      'EXPIRED',
      `Naukri session is ${nextStatus}. Manual login required.`
    );

    return {
      success: false,
      status: nextStatus,
      authenticated: false,
      message:
        nextStatus === NAUKRI_AUTH_STATUS.AUTHENTICATION_REQUIRED
          ? 'Your Naukri session has expired. Please log in to Naukri again to reconnect your account.'
          : 'No active Naukri session found. Please log in to Naukri to connect your account.',
      loginUrl: NAUKRI_URLS.LOGIN
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('naukriSessionService.connectNaukriService', error.message);
    throw new appError(`Naukri connection failed: ${error.message}`, 500);
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Handles capturing and encrypting a manual login session
 * Validates the session with Playwright on naukri.com, captures storageState,
 * encrypts with AES-256-GCM, and stores in MongoDB.
 * Never stores raw credentials!
 * @param {string} userId
 * @param {object} sessionPayload
 * @param {object} [sessionPayload.storageState] - Browser storageState JSON
 * @param {Array<object>} [sessionPayload.cookies] - Raw browser cookies
 * @param {object} [sessionPayload.oneTimeLogin] - Optional { username, password } for 1-time browser login (never saved to DB)
 * @returns {Promise<object>}
 */
export const saveManualLoginService = async (userId, sessionPayload = {}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    await logJobEvent('saveManualLoginService', 'START', `Processing manual login verification for User: ${userId}`);

    browser = await BrowserManager.launch();

    let storageStateToLoad = sessionPayload.storageState || null;

    if (!storageStateToLoad && Array.isArray(sessionPayload.cookies) && sessionPayload.cookies.length > 0) {
      storageStateToLoad = {
        cookies: sessionPayload.cookies,
        origins: []
      };
    }

    // Scenario A: User submitted cookies or storageState (e.g. from Google SSO or browser session)
    if (storageStateToLoad) {
      context = await BrowserManager.createContext(browser, {
        storageState: storageStateToLoad
      });
      page = await context.newPage();
      await page.goto(NAUKRI_URLS.HOME, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
        await page.evaluate(() => window.stop()).catch(() => {});
      });
      await page.waitForTimeout(2000);
    }
    // Scenario B: User provided 1-time credentials for browser automation login
    else if (sessionPayload.oneTimeLogin?.username && sessionPayload.oneTimeLogin?.password) {
      context = await BrowserManager.createContext(browser);
      page = await context.newPage();

      await page.goto(NAUKRI_URLS.LOGIN, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);

      // Fill in credentials interactively
      await page.fill('input#usernameField, input[placeholder*="Email"], input[name="email"]', sessionPayload.oneTimeLogin.username);
      await page.fill('input[type="password"]', sessionPayload.oneTimeLogin.password);

      // Click submit
      await Promise.all([
        page.click('button[type="submit"], button.btn-primary, .loginButton').catch(() => {}),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      ]);

      await page.waitForTimeout(3000);
    } else {
      throw new appError('Please provide either browser session state/cookies or one-time login credentials.', 400);
    }

    // Step 10: Detect authentication state
    const authState = await detectNaukriAuthState(page);

    if (!authState.authenticated) {
      await logJobEvent('saveManualLoginService', 'FAILED', 'Manual login verification failed: user not authenticated.');
      throw new appError('Authentication failed. Please verify your credentials or session cookies and try again.', 401);
    }

    // Step 11: Capture the new Playwright session
    const freshStorageState = await BrowserManager.captureStorageState(context);

    // Step 12: Encrypt with AES-256-GCM
    const encryptedState = encryptValue(JSON.stringify(freshStorageState));

    // Step 13: Replace existing session / save in MongoDB
    const updatedAccount = await upsertNaukriAccount(userId, {
      encryptedStorageState: encryptedState,
      status: NAUKRI_AUTH_STATUS.CONNECTED,
      userName: authState.userDetails?.name || '',
      userEmail: authState.userDetails?.email || '',
      lastValidatedAt: new Date()
    });

    await logJobEvent(
      'saveManualLoginService',
      'SUCCESS',
      `Manual login captured and encrypted successfully for User: ${userId}`
    );

    return {
      success: true,
      status: NAUKRI_AUTH_STATUS.CONNECTED,
      authenticated: true,
      message: 'Naukri account successfully connected and session saved securely.',
      userDetails: authState.userDetails,
      lastValidatedAt: updatedAccount.lastValidatedAt
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('naukriSessionService.saveManualLoginService', error.message);
    throw new appError(`Manual login failed: ${error.message}`, 500);
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Retrieves the current Naukri account integration status for a user
 * @param {string} userId
 */
export const getNaukriSessionStatusService = async (userId) => {
  try {
    const account = await findNaukriAccountByUserId(userId);
    if (!account) {
      return {
        connected: false,
        status: NAUKRI_AUTH_STATUS.DISCONNECTED,
        userName: '',
        userEmail: '',
        lastValidatedAt: null
      };
    }

    const hasEncryptedState = Boolean(account.encryptedStorageState?.cipherText);

    return {
      connected: account.status === NAUKRI_AUTH_STATUS.CONNECTED && hasEncryptedState,
      status: account.status,
      userName: account.userName || '',
      userEmail: account.userEmail || '',
      lastValidatedAt: account.lastValidatedAt
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('naukriSessionService.getNaukriSessionStatusService', error.message);
    throw new appError(`Failed to get Naukri status: ${error.message}`, 500);
  }
};

/**
 * Disconnects the user's Naukri account and removes the encrypted session
 * @param {string} userId
 */
export const disconnectNaukriService = async (userId) => {
  try {
    await deleteNaukriAccountByUserId(userId);
    await logJobEvent('disconnectNaukriService', 'DISCONNECTED', `Disconnected Naukri account for User: ${userId}`);
    return {
      success: true,
      status: NAUKRI_AUTH_STATUS.DISCONNECTED,
      message: 'Naukri session disconnected and removed.'
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('naukriSessionService.disconnectNaukriService', error.message);
    throw new appError(`Failed to disconnect Naukri: ${error.message}`, 500);
  }
};

/**
 * Helper to fetch and decrypt stored session for Playwright BrowserContext
 * Used by Job Discovery Node to initialize authenticated Naukri session.
 * @param {string} userId
 * @returns {Promise<object|null>} Decrypted storageState object or null
 */
export const getDecryptedSessionForUser = async (userId) => {
  try {
    const account = await findNaukriAccountByUserId(userId);
    if (!account || !account.encryptedStorageState?.cipherText) {
      return null;
    }
    const decryptedJson = decryptValue(account.encryptedStorageState);
    return JSON.parse(decryptedJson);
  } catch (error) {
    await logError('naukriSessionService.getDecryptedSessionForUser', error.message);
    return null;
  }
};

export default {
  connectNaukriService,
  saveManualLoginService,
  getNaukriSessionStatusService,
  disconnectNaukriService,
  getDecryptedSessionForUser
};
