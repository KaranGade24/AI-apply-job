import { naukriSelectors } from './naukriSelectors.js';
import { verifyPageIsAuthenticated, saveEncryptedSessionState } from './naukriSessionService.js';
import { JobSourceAccount } from '../../../model/JobSourceAccount.js';
import { encryptData } from '../../../utils/crypto.utils.js';
import { logError, logJobEvent } from '../../../utils/logger.js';
import { delay } from './naukriRateLimiter.js';

/**
 * Automates or manages Playwright authentication for Naukri
 * Handles credentials login & interactive Google login flow
 */
export const performNaukriLogin = async ({
  userId,
  loginMethod = 'credentials',
  username = '',
  password = '',
  page,
}) => {
  try {
    if (!page || page.isClosed()) throw new Error('Valid Playwright page is required for authentication');

    await logJobEvent('naukriAuthService.login', 'START', `Initiating Naukri ${loginMethod} login for user ${userId}`);

    // Update account state to 'connecting'
    await JobSourceAccount.findOneAndUpdate(
      { userId, source: 'naukri' },
      {
        $set: {
          status: 'connecting',
          loginMethod,
          accountIdentifier: username || (loginMethod === 'google' ? 'Google Account' : ''),
          credentials: {
            username: username ? encryptData(username) : null,
            password: password ? encryptData(password) : null,
          },
        },
      },
      { upsert: true }
    );

    // 1. Navigate to Naukri Login Page
    await page.goto(naukriSelectors.auth.loginPageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    await delay(1500);

    // 2. Perform Login Action based on Method
    if (loginMethod === 'credentials') {
      if (!username || !password) {
        throw new Error('Username and password are required for credentials login');
      }

      await page.fill(naukriSelectors.auth.usernameInput, username).catch(() => {});
      await page.fill(naukriSelectors.auth.passwordInput, password).catch(() => {});
      await delay(500);

      // Click submit
      await page.click(naukriSelectors.auth.submitButton).catch(() => {});
      await delay(3000);
    } else if (loginMethod === 'google') {
      // Trigger Google Login popup / button
      const googleBtn = page.locator(naukriSelectors.auth.googleLoginBtn).first();

      if (await googleBtn.isVisible().catch(() => false)) {
        await googleBtn.click().catch(() => {});
        await delay(3000);
      }
    }

    // 3. Wait for redirect or check authentication state
    let attempts = 0;
    let authResult = { isAuthenticated: false, isChallenge: false, statusReason: 'PENDING' };

    while (attempts < 10) {
      authResult = await verifyPageIsAuthenticated(page);
      if (authResult.isAuthenticated || authResult.isChallenge) {
        break;
      }
      await delay(2000);
      attempts++;
    }

    // 4. Handle Security Challenges (OTP / CAPTCHA / 2FA)
    if (authResult.isChallenge) {
      await JobSourceAccount.updateOne(
        { userId, source: 'naukri' },
        { $set: { status: 'verificationRequired' } }
      );
      await logJobEvent('naukriAuthService.login', 'WARNING', `Naukri authentication required OTP/CAPTCHA verification for user ${userId}`);
      return {
        success: false,
        status: 'verificationRequired',
        message: 'Security verification or OTP code is required. Please complete verification on Naukri.',
      };
    }

    // 5. Check if authenticated
    if (!authResult.isAuthenticated) {
      await JobSourceAccount.updateOne(
        { userId, source: 'naukri' },
        { $set: { status: 'error' } }
      );
      await logJobEvent('naukriAuthService.login', 'FAILURE', `Failed to authenticate Naukri account for user ${userId}: ${authResult.statusReason}`);
      return {
        success: false,
        status: 'error',
        message: `Naukri authentication failed (${authResult.statusReason}). Please check credentials or try again.`,
      };
    }

    // 6. Save Encrypted Session State
    await saveEncryptedSessionState(userId, page.context());

    await logJobEvent('naukriAuthService.login', 'SUCCESS', `Successfully authenticated & saved Naukri session for user ${userId}`);

    return {
      success: true,
      status: 'connected',
      message: 'Naukri account connected and session saved successfully.',
    };
  } catch (error) {
    await logError('naukriAuthService.performNaukriLogin', error.message);
    await JobSourceAccount.updateOne(
      { userId, source: 'naukri' },
      { $set: { status: 'error' } }
    ).catch(() => {});

    return {
      success: false,
      status: 'error',
      message: `Authentication error: ${error.message}`,
    };
  }
};

export default {
  performNaukriLogin,
};
