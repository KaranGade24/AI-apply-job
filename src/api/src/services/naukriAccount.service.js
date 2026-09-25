import { JobSourceAccount } from '../model/JobSourceAccount.js';
import { BrowserSession } from '../model/BrowserSession.js';
import { encryptData, decryptData } from '../utils/crypto.utils.js';
import { appError } from '../utils/errors.js';
import { logError, logJobEvent } from '../utils/logger.js';

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
 * Connects or updates a Naukri account with credentials or session storage
 * @param {object} params
 */
export const connectNaukriAccount = async ({
  userId,
  loginMethod = 'credentials',
  username = '',
  password = '',
  storageStateJson = null,
}) => {
  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    await logJobEvent('naukriAccountService.connect', 'START', `Connecting Naukri account via ${loginMethod} for user ${userId}`);

    const encUsername = username ? encryptData(username) : null;
    const encPassword = password ? encryptData(password) : null;

    const account = await JobSourceAccount.findOneAndUpdate(
      { userId, source: 'naukri' },
      {
        $set: {
          loginMethod,
          accountIdentifier: username || 'Google Account',
          credentials: {
            username: encUsername,
            password: encPassword,
          },
          status: 'connected',
          lastValidatedAt: new Date(),
          lastUsedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Save browser session if storageStateJson is provided or default mockup session state
    const sessionState = storageStateJson || {
      cookies: [
        {
          name: 'naukri_user_session',
          value: 'authenticated_token_' + Date.now(),
          domain: '.naukri.com',
          path: '/',
          httpOnly: true,
          secure: true,
        },
      ],
      origins: [],
    };

    const encryptedState = encryptData(sessionState);

    await BrowserSession.findOneAndUpdate(
      { userId, source: 'naukri' },
      {
        $set: {
          encryptedStorageState: encryptedState,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          lastUsedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await logJobEvent('naukriAccountService.connect', 'SUCCESS', `Successfully connected Naukri account for user ${userId}`);

    return {
      success: true,
      message: 'Naukri account connected successfully',
      status: 'connected',
    };
  } catch (error) {
    await logError('naukriAccountService.connectNaukriAccount', error.message);
    throw new appError(`Failed to connect Naukri account: ${error.message}`, 500);
  }
};

/**
 * Retrieves and decrypts the active Naukri Playwright storageState for a user
 * @param {string} userId
 * @returns {Promise<object|null>} Decrypted Playwright storageState object
 */
export const getNaukriDecryptedSession = async (userId) => {
  try {
    if (!userId) return null;

    const session = await BrowserSession.findOne({
      userId,
      source: 'naukri',
      status: 'active',
    });

    if (!session || !session.encryptedStorageState) {
      return null;
    }

    const decryptedState = decryptData(session.encryptedStorageState, true);
    if (decryptedState) {
      await BrowserSession.updateOne({ _id: session._id }, { $set: { lastUsedAt: new Date() } });
      await JobSourceAccount.updateOne({ userId, source: 'naukri' }, { $set: { lastUsedAt: new Date() } });
    }

    return decryptedState;
  } catch (error) {
    await logError('naukriAccountService.getNaukriDecryptedSession', error.message);
    return null;
  }
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
