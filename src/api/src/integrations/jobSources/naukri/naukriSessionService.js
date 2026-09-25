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

    // 1. Check for login / registration URL
    if (currentUrl.includes('/nlogin/') || currentUrl.includes('/registration/')) {
      return { isAuthenticated: false, isChallenge: false, statusReason: 'LOGIN_PAGE_REDIRECT' };
    }

    // 2. Check for security challenges / OTP / CAPTCHA using Playwright locators
    const challengeCount = await page.locator('iframe[src*="captcha"], .captcha-container, #otp-container').count().catch(() => 0);
    if (challengeCount > 0) {
      return { isAuthenticated: false, isChallenge: true, statusReason: 'VERIFICATION_REQUIRED' };
    }

    // 3. Check for unauthenticated indicators (Google login, Login button, username field)
    const unauthCheck = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';

      // Check for "Continue with Google" or Login buttons in DOM
      const hasGoogleLoginBtn = bodyText.includes('Continue with Google') || Boolean(document.querySelector('button[value="google"], .google-login-btn'));
      const hasLoginHeaderBtn = Boolean(
        document.querySelector('a[href*="/nlogin/login"], .nI-gnd-header__login-btn, #login_Layer, #usernameField')
      );

      return hasGoogleLoginBtn || hasLoginHeaderBtn;
    }).catch(() => false);

    if (unauthCheck) {
      return { isAuthenticated: false, isChallenge: false, statusReason: 'UNAUTHENTICATED_LOGIN_BUTTONS_PRESENT' };
    }

    // 4. Check for positive authenticated indicators
    const authCheck = await page.evaluate((authSels) => {
      for (const sel of authSels) {
        if (document.querySelector(sel)) return true;
      }
      return false;
    }, naukriSelectors.auth.authenticatedIndicators).catch(() => false);

    const isAuthUrl = currentUrl.includes('/mnjuser/homepage') || currentUrl.includes('/mnjuser/profile');

    if (authCheck || isAuthUrl) {
      return { isAuthenticated: true, isChallenge: false, statusReason: 'AUTHENTICATED' };
    }

    return { isAuthenticated: false, isChallenge: false, statusReason: 'NO_AUTHENTICATION_INDICATOR_FOUND' };
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
 * Ensures page is authenticated. If unauthenticated ("Login" or "Continue with Google" buttons visible),
 * automatically attempts login using stored decrypted user credentials, updates session, and re-verifies.
 * @param {import('playwright').Page} page
 * @param {string} userId
 * @returns {Promise<{isAuthenticated: boolean, statusReason: string}>}
 */
export const ensureAuthenticatedSession = async (page, userId) => {
  try {
    if (!page || page.isClosed()) {
      return { isAuthenticated: false, statusReason: 'PAGE_CLOSED' };
    }

    // Initial check
    let verification = await verifyPageIsAuthenticated(page);
    if (verification.isAuthenticated) {
      return { isAuthenticated: true, statusReason: 'AUTHENTICATED' };
    }

    // Unauthenticated state detected (Login / Google login button visible)
    if (userId) {
      const account = await JobSourceAccount.findOne({ userId, source: 'naukri' });
      const rawUsername = account?.credentials?.username ? decryptData(account.credentials.username) : null;
      const rawPassword = account?.credentials?.password ? decryptData(account.credentials.password) : null;

      if (rawUsername && rawPassword) {
        await logJobEvent(
          'naukriSessionService.ensureAuth',
          'PROGRESS',
          `Unauthenticated page detected. Attempting automated login for user ${userId}...`
        );

        // Navigate to login page
        await page.goto(naukriSelectors.auth.loginPageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async () => {
          await page.evaluate(() => window.stop()).catch(() => {});
        });

        // Fill credentials and click login
        await page.fill(naukriSelectors.auth.usernameInput, rawUsername).catch(() => {});
        await page.fill(naukriSelectors.auth.passwordInput, rawPassword).catch(() => {});
        await page.click(naukriSelectors.auth.submitButton).catch(() => {});

        // Wait for login completion
        await page.waitForTimeout(4000);

        // Re-verify authentication state
        const reCheck = await verifyPageIsAuthenticated(page);
        if (reCheck.isAuthenticated) {
          await saveEncryptedSessionState(userId, page.context());
          await logJobEvent('naukriSessionService.ensureAuth', 'SUCCESS', `Automated login successful. Session updated for user ${userId}`);
          return { isAuthenticated: true, statusReason: 'RE_AUTHENTICATED' };
        }
      }
    }

    return { isAuthenticated: false, statusReason: verification.statusReason };
  } catch (error) {
    await logError('naukriSessionService.ensureAuthenticatedSession', error.message);
    return { isAuthenticated: false, statusReason: 'ERROR' };
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

  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  };

  if (sessionData && sessionData.cookies) {
    contextOptions.storageState = sessionData;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Navigate to Naukri user homepage to verify authenticated state
  await page.goto(naukriSelectors.auth.homePageUrl, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(async () => {
    await page.evaluate(() => window.stop()).catch(() => {});
  });

  const ensureAuth = await ensureAuthenticatedSession(page, userId);

  if (!ensureAuth.isAuthenticated) {
    await context.close().catch(() => {});

    await JobSourceAccount.updateOne({ userId, source: 'naukri' }, { $set: { status: 'authenticationRequired' } });
    await BrowserSession.updateOne({ userId, source: 'naukri' }, { $set: { status: 'expired' } });

    throw new Error(`AUTHENTICATION_REQUIRED: Naukri session is ${ensureAuth.statusReason}. Please connect your Naukri account.`);
  }

  return { context, page };
};

export default {
  verifyPageIsAuthenticated,
  saveEncryptedSessionState,
  getEncryptedSessionState,
  ensureAuthenticatedSession,
  loadAndVerifySessionContext,
};
