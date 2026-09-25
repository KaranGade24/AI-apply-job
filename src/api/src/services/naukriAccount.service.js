import { JobSourceAccount } from '../model/JobSourceAccount.js';
import { BrowserSession } from '../model/BrowserSession.js';
import { encryptData, decryptData } from '../utils/crypto.utils.js';
import { appError } from '../utils/errors.js';
import { logError, logJobEvent } from '../utils/logger.js';
import { performNaukriLogin } from '../integrations/jobSources/naukri/naukriAuthService.js';
import { getEncryptedSessionState } from '../integrations/jobSources/naukri/naukriSessionService.js';
import { createBrowser } from '../browser/browserConfig.js';

/**
 * Retrieves the status of a user's connected Naukri account
 * @param {string} userId
 */
export const getNaukriAccountStatus = async (userId) => {
  try {
    const [account, session] = await Promise.all([
      JobSourceAccount.findOne({ userId, source: 'naukri' }),
      BrowserSession.findOne({ userId, source: 'naukri', status: 'active' }),
    ]);

    if (!account) {
      return {
        isConnected: false,
        status: 'disconnected',
        loginMethod: null,
        accountIdentifier: null,
      };
    }

    const isConnected = account.status === 'connected' && Boolean(session);

    return {
      isConnected,
      status: isConnected ? 'connected' : account.status,
      loginMethod: account.loginMethod,
      accountIdentifier: account.accountIdentifier || (account.credentials?.username ? decryptData(account.credentials.username) : 'Google User'),
      lastValidatedAt: account.lastValidatedAt,
      lastUsedAt: account.lastUsedAt,
    };
  } catch (error) {
    await logError('naukriAccountService.getNaukriAccountStatus', error.message);
    throw new appError(`Failed to fetch Naukri account status: ${error.message}`, 500);
  }
};

/**
 * Performs Playwright Naukri login, verifies authenticated indicators, and saves encrypted session
 * @param {object} params
 */
export const connectNaukriAccount = async ({
  userId,
  loginMethod = 'credentials',
  username = '',
  password = '',
  storageStateJson = null,
}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    await logJobEvent('naukriAccountService.connect', 'START', `Connecting Naukri account via ${loginMethod} for user ${userId}`);

    // If direct storageStateJson is provided from browser extension / manual flow
    if (storageStateJson && storageStateJson.cookies) {
      const encryptedState = encryptData(storageStateJson);

      await JobSourceAccount.findOneAndUpdate(
        { userId, source: 'naukri' },
        {
          $set: {
            loginMethod,
            accountIdentifier: username || (loginMethod === 'google' ? 'Google Account' : 'Naukri User'),
            status: 'connected',
            lastValidatedAt: new Date(),
            lastUsedAt: new Date(),
          },
        },
        { upsert: true }
      );

      await BrowserSession.findOneAndUpdate(
        { userId, source: 'naukri' },
        {
          $set: {
            encryptedStorageState: encryptedState,
            status: 'active',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            lastUsedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return {
        success: true,
        message: 'Naukri account connected and session saved successfully',
        status: 'connected',
      };
    }

    // Launch Playwright to perform actual automated/interactive login & verification
    browser = await createBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    page = await context.newPage();

    const authResult = await performNaukriLogin({
      userId,
      loginMethod,
      username,
      password,
      page,
    });

    if (!authResult.success) {
      return {
        success: false,
        status: authResult.status,
        message: authResult.message,
      };
    }

    await logJobEvent('naukriAccountService.connect', 'SUCCESS', `Successfully connected Naukri account for user ${userId}`);

    return {
      success: true,
      message: 'Naukri account connected and verified successfully',
      status: 'connected',
    };
  } catch (error) {
    await logError('naukriAccountService.connectNaukriAccount', error.message);
    throw new appError(`Failed to connect Naukri account: ${error.message}`, 500);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

/**
 * Retrieves and decrypts active Naukri session for user
 */
export const getNaukriDecryptedSession = async (userId) => {
  return await getEncryptedSessionState(userId);
};

/**
 * Disconnects user's Naukri account and revokes active session
 * @param {string} userId
 */
export const disconnectNaukriAccount = async (userId) => {
  try {
    await Promise.all([
      JobSourceAccount.findOneAndUpdate(
        { userId, source: 'naukri' },
        { $set: { status: 'disconnected', credentials: { username: null, password: null } } }
      ),
      BrowserSession.findOneAndUpdate(
        { userId, source: 'naukri' },
        { $set: { status: 'invalid' } }
      ),
    ]);

    await logJobEvent('naukriAccountService.disconnect', 'SUCCESS', `Disconnected Naukri account for user ${userId}`);

    return {
      success: true,
      message: 'Naukri account disconnected successfully',
    };
  } catch (error) {
    await logError('naukriAccountService.disconnectNaukriAccount', error.message);
    throw new appError(`Failed to disconnect Naukri account: ${error.message}`, 500);
  }
};
