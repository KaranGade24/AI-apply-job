import { BrowserSession } from '../../../model/BrowserSession.js';
import { JobSourceAccount } from '../../../model/JobSourceAccount.js';
import { encryptData, decryptData } from '../../../utils/crypto.utils.js';
import { naukriSelectors } from './naukriSelectors.js';
import { logError, logJobEvent } from '../../../utils/logger.js';

/**
 * Verifies if the current page in Playwright is truly authenticated as a logged-in Naukri user.
 * Strictly checks for authenticated user DOM indicators and verifies absence of login buttons / Google login.
 * @param {import('playwright').Page} page
 * @returns {Promise<{isAuthenticated: boolean, isChallenge: boolean, statusReason: string}>}
 */
export const verifyPageIsAuthenticated = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { isAuthenticated: false, isChallenge: false, statusReason: 'PAGE_CLOSED' };
    }

    const currentUrl = page.url();

    // Check for security challenges / OTP / CAPTCHA
    const hasChallenge = await page.evaluate((challengeSels) => {
      return challengeSels.some((sel) => Boolean(document.querySelector(sel)));
    }, naukriSelectors.auth.challengeIndicators).catch(() => false);

    if (hasChallenge) {
      return { isAuthenticated: false, isChallenge: true, statusReason: 'VERIFICATION_REQUIRED' };
    }

    // Check for explicit unauthenticated / login elements (e.g. "Continue with Google" button or username field)
    const hasUnauthenticatedIndicator = await page.evaluate((unauthSels) => {
      for (const sel of unauthSels) {
        if (sel.includes('text=')) {
          const text = sel.replace('text=', '').replace(/"/g, '');
          if (document.body && document.body.innerText.includes(text)) return true;
        } else {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) return true; // Visible element
        }
      }
      return false;
    }, naukriSelectors.auth.unauthenticatedIndicators).catch(() => false);

    if (hasUnauthenticatedIndicator) {
      return { isAuthenticated: false, isChallenge: false, statusReason: 'UNAUTHENTICATED' };
    }

    // Check for explicit authenticated indicators (e.g. Profile drawer, My Naukri header, profile link)
    const hasAuthenticatedIndicator = await page.evaluate((authSels) => {
      for (const sel of authSels) {
        const el = document.querySelector(sel);
        if (el) return true;
      }
      return false;
    }, naukriSelectors.auth.authenticatedIndicators).catch(() => false);

    // Also check if URL contains user homepage/profile path
    const isAuthUrl = currentUrl.includes('/mnjuser/homepage') || currentUrl.includes('/mnjuser/profile');

    if (hasAuthenticatedIndicator || isAuthUrl) {
      return { isAuthenticated: true, isChallenge: false, statusReason: 'AUTHENTICATED' };
    }

    return { isAuthenticated: false, isChallenge: false, statusReason: 'UNKNOWN_STATE' };
  } catch (error) {
    await logError('naukriSessionService.verifyPageIsAuthenticated', error.message);
    return { isAuthenticated: false, isChallenge: false, statusReason: 'ERROR' };
  }
};

/**
 * Saves and encrypts a verified Playwright storageState into MongoDB
 * @param {string} userId
 * @param {import('playwright').BrowserContext} context
 */
export const saveEncryptedSessionState = async (userId, context) => {
  try {
    if (!userId || !context) throw new Error('User ID and BrowserContext are required');

    const storageState = await context.storageState();
    const encryptedState = encryptData(storageState);

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

    await JobSourceAccount.findOneAndUpdate(
      { userId, source: 'naukri' },
      {
        $set: {
          status: 'connected',
          lastValidatedAt: new Date(),
          lastUsedAt: new Date(),
        },
      },
      { upsert: true }
    );

    await logJobEvent('naukriSessionService.saveSession', 'SUCCESS', `Saved encrypted Naukri session for user ${userId}`);
    return true;
  } catch (error) {
    await logError('naukriSessionService.saveEncryptedSessionState', error.message);
    throw error;
  }
};

/**
 * Loads and decrypts saved session storageState for user
 * @param {string} userId
 */
export const getEncryptedSessionState = async (userId) => {
  try {
    const session = await BrowserSession.findOne({ userId, source: 'naukri', status: 'active' });
    if (!session || !session.encryptedStorageState) return null;

    return decryptData(session.encryptedStorageState, true);
  } catch (error) {
    await logError('naukriSessionService.getEncryptedSessionState', error.message);
    return null;
  }
};

/**
 * Loads saved Naukri session into a Playwright browser context and strictly verifies authentication before usage.
 * @param {import('playwright').Browser} browser
 * @param {string} userId
 * @returns {Promise<{context: import('playwright').BrowserContext, page: import('playwright').Page}>}
 */
export const loadAndVerifySessionContext = async (browser, userId) => {
  const sessionData = await getEncryptedSessionState(userId);

  if (!sessionData) {
    await JobSourceAccount.updateOne({ userId, source: 'naukri' }, { $set: { status: 'authenticationRequired' } });
    throw new Error('AUTHENTICATION_REQUIRED: No saved Naukri session found. Please connect your Naukri account.');
  }

  const context = await browser.newContext({
    storageState: sessionData,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Navigate to Naukri user homepage to verify authenticated state
  await page.goto(naukriSelectors.auth.homePageUrl, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(async () => {
    await page.evaluate(() => window.stop()).catch(() => {});
  });

  const verification = await verifyPageIsAuthenticated(page);

  if (!verification.isAuthenticated) {
    await context.close().catch(() => {});

    let newStatus = 'sessionExpired';
    if (verification.isChallenge) {
      newStatus = 'verificationRequired';
    }

    await JobSourceAccount.updateOne({ userId, source: 'naukri' }, { $set: { status: newStatus } });
    await BrowserSession.updateOne({ userId, source: 'naukri' }, { $set: { status: 'expired' } });

    throw new Error(`SESSION_INVALID: Naukri session is ${verification.statusReason}. Please reconnect your account.`);
  }

  return { context, page };
};

export default {
  verifyPageIsAuthenticated,
  saveEncryptedSessionState,
  getEncryptedSessionState,
  loadAndVerifySessionContext,
};
