import { chromium } from 'playwright';
import { BrowserManager } from '../browser/browserManager.js';
import { BROWSER_LAUNCH_ARGS } from '../constant/browser.constant.js';
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

    try {
      const decryptedJson = decryptValue(account.encryptedStorageState);
      return JSON.parse(decryptedJson);
    } catch {
      // In case encryption secret changed or key cannot authenticate legacy ciphertext
      return null;
    }
  } catch (error) {
    return null;
  }
};

/**
 * Injects decrypted Google session cookies directly into an active Playwright BrowserContext
 * This ensures any tab, popup, or redirect to Google Forms or Google Accounts is authenticated.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} userId
 * @returns {Promise<boolean>} True if Google session was found and injected
 */
export const injectGoogleSessionIntoContext = async (context, userId) => {
  try {
    if (!context || !userId) return false;
    const session = await getDecryptedGoogleSession(userId);
    if (!session?.cookies || !Array.isArray(session.cookies) || session.cookies.length === 0) {
      await logJobEvent(
        'googleSessionService',
        'NO_GOOGLE_SESSION_TO_INJECT',
        `No stored Google session found for User: ${userId}`
      );
      return false;
    }

    // Sanitize cookies strictly conforming to Chromium CDP Storage.setCookies and RFC 6265bis
    const validCookies = session.cookies
      .filter((c) => c && c.name && c.value)
      .map((c) => {
        const isHostCookie = c.name.startsWith('__Host-');
        const isSecureCookie = c.name.startsWith('__Secure-');
        const isNoneSameSite = c.sameSite === 'None';

        // Base cookie object
        const cookie = {
          name: c.name,
          value: c.value,
          path: c.path || '/',
        };

        // RFC 6265bis: __Host- cookies MUST NOT have domain set, and must have path: '/' and secure: true
        if (isHostCookie) {
          const host = (c.domain || 'accounts.google.com').replace(/^\./, '');
          cookie.url = `https://${host}${cookie.path}`;
          cookie.secure = true;
        } else {
          if (c.domain) {
            cookie.domain = c.domain;
          } else {
            cookie.domain = '.google.com';
          }
          cookie.secure = isSecureCookie || isNoneSameSite || c.secure !== false;
        }

        // Chromium CDP: sameSite must be strictly 'Strict', 'Lax', or 'None'
        if (c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None') {
          cookie.sameSite = c.sameSite;
          if (cookie.sameSite === 'None') {
            cookie.secure = true;
          }
        }

        if (c.httpOnly !== undefined) {
          cookie.httpOnly = Boolean(c.httpOnly);
        }

        // Chromium CDP: expires must be a positive integer timestamp (seconds) or omitted for session cookies
        if (typeof c.expires === 'number' && c.expires > 0 && Number.isFinite(c.expires)) {
          cookie.expires = Math.round(c.expires);
        }

        return cookie;
      });

    if (validCookies.length === 0) return false;

    // First attempt bulk addition
    let successfullyAdded = 0;
    try {
      await context.addCookies(validCookies);
      successfullyAdded = validCookies.length;
    } catch {
      // If CDP throws 'Invalid cookie fields' on batch, add cookies individually with fallback
      for (const cookie of validCookies) {
        try {
          await context.addCookies([cookie]);
          successfullyAdded++;
        } catch {
          // If still fails with domain, try adding with url fallback
          try {
            const host = (cookie.domain || 'google.com').replace(/^\./, '');
            const urlCookie = {
              name: cookie.name,
              value: cookie.value,
              url: `https://${host}${cookie.path || '/'}`,
              secure: true,
              ...(cookie.httpOnly ? { httpOnly: true } : {}),
            };
            await context.addCookies([urlCookie]);
            successfullyAdded++;
          } catch {
            // Non-critical cookie failed CDP validation; proceed with other cookies
          }
        }
      }
    }

    if (successfullyAdded > 0) {
      await logJobEvent(
        'googleSessionService',
        'GOOGLE_SESSION_INJECTED',
        `Successfully injected ${successfullyAdded}/${validCookies.length} Google session cookies into browser context for User: ${userId}`
      );
      return true;
    }

    return false;
  } catch (error) {
    // Non-blocking log - never interrupt the main workflow
    await logError('googleSessionService.injectGoogleSessionIntoContext', error.message);
    return false;
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

    // Normalize cookies to ensure valid structure for Playwright
    if (storageStateToLoad.cookies && Array.isArray(storageStateToLoad.cookies)) {
      storageStateToLoad.cookies = storageStateToLoad.cookies.map((c) => {
        let domain = c.domain || '.google.com';
        if (!domain.startsWith('.') && !domain.includes('localhost')) {
          domain = `.${domain}`;
        }
        return {
          name: c.name,
          value: c.value,
          domain,
          path: c.path || '/',
          sameSite: c.sameSite === 'Strict' || c.sameSite === 'None' ? c.sameSite : 'Lax',
          secure: c.secure !== false,
          httpOnly: c.httpOnly || false,
        };
      });
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

    // Verify session on Google Forms directly
    await page.goto(GOOGLE_URLS.FORMS_BASE, {
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
        'The provided Google session is expired or not logged in. Please verify your session and try again, or sign in directly with your email & password.',
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

/**
 * Automates 1-time Google account login via Playwright to capture and save session cookies
 * into MongoDB with AES-256-GCM encryption. Zero permanent password storage.
 *
 * @param {string} userId - User ID
 * @param {object} credentials - { email, password, otpCode }
 * @returns {Promise<object>} Status result
 */
export const loginWithGoogleCredentialsService = async (
  userId,
  { email, password, otpCode } = {}
) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }
    if (!email || !password) {
      throw new appError('Please provide both your Google email and password.', 400);
    }

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    await logJobEvent(
      'googleSessionService',
      'LOGIN_START',
      `Starting automated Google sign-in for User: ${userId} (${cleanEmail})`
    );

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(browser, {
      blockHeavyResources: false,
    });
    page = await context.newPage();

    // 1. Navigate to Google Sign-in with destination set to Google Forms
    await page.goto(GOOGLE_URLS.FORMS_LOGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(1500);

    // 2. Fill in Email
    const emailInput = page.locator('#identifierId, input[type="email"], input[name="identifier"]').first();
    const isEmailVisible = await emailInput.isVisible().catch(() => false);
    if (!isEmailVisible) {
      throw new appError('Google sign-in page did not load correctly. Please try again.', 500);
    }

    await emailInput.click();
    await emailInput.fill(cleanEmail);
    await page.waitForTimeout(500);

    // Click Next on Email
    const emailNext = page.locator('#identifierNext, button:has-text("Next"), div[role="button"]:has-text("Next")').first();
    await emailNext.click();
    await page.waitForTimeout(2500);

    // Check for email error
    const pageTextAfterEmail = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (
      pageTextAfterEmail.includes("Couldn't find your Google Account") ||
      pageTextAfterEmail.includes("Enter a valid email")
    ) {
      throw new appError("Couldn't find your Google Account. Please check your email address.", 400);
    }

    // 3. Fill in Password
    const passwordInput = page.locator('input[type="password"], input[name="Passwd"], input[name="password"]').first();
    const isPasswordVisible = await passwordInput.waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);

    if (!isPasswordVisible) {
      if (pageTextAfterEmail.includes('verify') || pageTextAfterEmail.includes('captcha')) {
        throw new appError('Google requested a security verification or captcha. Please check credentials or try again.', 400);
      }
      throw new appError('Password field did not appear. Please verify your email and try again.', 400);
    }

    await passwordInput.click();
    await passwordInput.fill(cleanPassword);
    await page.waitForTimeout(500);

    // Click Next on Password
    const passwordNext = page.locator('#passwordNext, button:has-text("Next"), div[role="button"]:has-text("Next")').first();
    await passwordNext.click();
    await page.waitForTimeout(3000);

    // Check for wrong password
    const pageTextAfterPassword = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (
      pageTextAfterPassword.includes('Wrong password') ||
      pageTextAfterPassword.includes('Wrong password. Try again')
    ) {
      throw new appError('Wrong password. Try again or check your Google Account credentials.', 401);
    }

    // 4. Check for 2-Step Verification / Phone prompt
    const is2faPrompt =
      pageTextAfterPassword.includes('Check your phone') ||
      pageTextAfterPassword.includes('Google sent a notification') ||
      pageTextAfterPassword.includes('Tap Yes') ||
      pageTextAfterPassword.includes('2-Step Verification') ||
      pageTextAfterPassword.includes('two-step');

    if (is2faPrompt) {
      await logJobEvent(
        'googleSessionService',
        '2FA_DETECTED',
        '2-Step Verification prompt detected. Waiting up to 45 seconds for user approval on phone...'
      );

      // Extract 2-digit number if shown
      const numberMatch = pageTextAfterPassword.match(/\b([0-9]{2})\b/);
      const promptNumber = numberMatch ? numberMatch[1] : '';

      // Wait up to 45 seconds for user to tap Yes on their phone
      const approvalSucceeded = await page.waitForURL(
        (url) => !url.href.includes('signin') && !url.href.includes('challenge'),
        { timeout: 45000 }
      ).then(() => true).catch(() => false);

      if (!approvalSucceeded) {
        throw new appError(
          `Google 2-Step Verification prompt was sent to your phone${promptNumber ? ` (Select number: ${promptNumber})` : ''}. Please tap Yes on your phone to complete sign-in.`,
          401
        );
      }
    }

    // Wait for redirect to docs.google.com or accounts dashboard
    await page.waitForTimeout(2500);

    // 5. Verify authentication state
    const authState = await detectGoogleAuthState(page);

    if (authState.isSignInRequired) {
      throw new appError('Google sign-in could not be completed. Please check your credentials.', 401);
    }

    // 6. Capture full authenticated storageState
    const freshStorageState = await BrowserManager.captureStorageState(context);

    // 7. Encrypt with AES-256-GCM and store in MongoDB
    const encryptedState = encryptValue(JSON.stringify(freshStorageState));

    const updated = await upsertGoogleAccount(userId, {
      encryptedStorageState: encryptedState,
      status: GOOGLE_AUTH_STATUS.CONNECTED,
      userEmail: cleanEmail,
      lastValidatedAt: new Date(),
    });

    await logJobEvent(
      'googleSessionService',
      'LOGIN_SUCCESS',
      `Google account successfully authenticated & session stored for ${cleanEmail}`
    );

    return {
      success: true,
      connected: true,
      status: GOOGLE_AUTH_STATUS.CONNECTED,
      userEmail: cleanEmail,
      lastValidatedAt: updated.lastValidatedAt,
      message: `Google Account (${cleanEmail}) connected successfully! Session saved in DB and ready for auto-filling Google Forms.`,
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('googleSessionService.loginWithGoogleCredentialsService', error.message);
    throw new appError(error.message || 'Google login failed.', error.statusCode || 500);
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Opens a Playwright browser window navigated to Google Login.
 * The user manually logs into their Google Account in that window.
 * The service polls in the background, automatically detects successful login,
 * captures all authenticated cookies / storageState into MongoDB,
 * and automatically closes the browser window.
 *
 * @param {string} userId - Current user ID
 * @returns {Promise<object>} Status result
 */
export const launchGoogleInteractiveLoginService = async (userId) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!userId) {
      throw new appError('User ID is required', 400);
    }

    await logJobEvent(
      'googleSessionService',
      'INTERACTIVE_LOGIN_START',
      `Launching Playwright browser window for manual Google login for User: ${userId}`
    );

    // On desktop environments (macOS, Windows, or Linux with DISPLAY), launch with visible window
    const isHeadless = process.platform === 'linux' && !process.env.DISPLAY;

    browser = await chromium.launch({
      headless: isHeadless,
      args: [...BROWSER_LAUNCH_ARGS],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    page = await context.newPage();

    // Navigate to Google Sign-in with destination set to Google Forms
    await page.goto(GOOGLE_URLS.FORMS_LOGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    // Poll for user to complete manual login (timeout: 180 seconds / 3 minutes)
    const startTime = Date.now();
    const timeoutMs = 180000;
    let authenticated = false;
    let detectedEmail = '';

    while (Date.now() - startTime < timeoutMs) {
      if (page.isClosed() || !browser.isConnected()) {
        break;
      }

      await page.waitForTimeout(1500).catch(() => {});

      if (page.isClosed() || !browser.isConnected()) break;

      const currentUrl = page.url() || '';
      const lowerUrl = currentUrl.toLowerCase();

      // Check cookies for Google authentication
      const cookies = await context.cookies().catch(() => []);
      const hasSid = cookies.some(
        (c) => (c.name === 'SID' || c.name === '__Secure-1PSID') && c.domain?.includes('google')
      );
      const hasSapisid = cookies.some(
        (c) =>
          (c.name === 'SAPISID' || c.name === '__Secure-1PAPISID' || c.name === '__Secure-3PAPISID') &&
          c.domain?.includes('google')
      );

      const isFormsOrAccount =
        lowerUrl.includes('docs.google.com/forms') ||
        lowerUrl.includes('myaccount.google.com');

      const isStillOnSignin =
        lowerUrl.includes('accounts.google.com/signin') ||
        lowerUrl.includes('accounts.google.com/servicelogin') ||
        lowerUrl.includes('accounts.google.com/v3/signin') ||
        lowerUrl.includes('accounts.google.com/challenge');

      if ((hasSid && hasSapisid) || (isFormsOrAccount && !isStillOnSignin)) {
        authenticated = true;
        // Attempt to extract logged in email
        detectedEmail = await page.evaluate(() => {
          const emailEl =
            document.querySelector('[data-email]') ||
            document.querySelector('.gb_d') ||
            document.querySelector('.gb_E');
          return emailEl?.getAttribute('data-email') || emailEl?.textContent?.trim() || '';
        }).catch(() => '');

        if (!detectedEmail) {
          const match = (await page.evaluate(() => document.body?.innerText || '').catch(() => ''))
            .match(/[a-zA-Z0-9._%+-]+@gmail\.com/i);
          if (match) detectedEmail = match[0];
        }
        break;
      }
    }

    if (!authenticated) {
      throw new appError(
        'Google login timed out or window was closed before completing login. Please try again.',
        400
      );
    }

    // Capture storageState (cookies & localStorage)
    const freshStorageState = await context.storageState();

    // Encrypt with AES-256-GCM
    const encryptedState = encryptValue(JSON.stringify(freshStorageState));

    // Save in MongoDB
    const updated = await upsertGoogleAccount(userId, {
      encryptedStorageState: encryptedState,
      status: GOOGLE_AUTH_STATUS.CONNECTED,
      userEmail: detectedEmail || '',
      lastValidatedAt: new Date(),
    });

    await logJobEvent(
      'googleSessionService',
      'INTERACTIVE_LOGIN_SUCCESS',
      `Manual Google sign-in detected! Session cookies captured, encrypted, and saved to MongoDB for User: ${userId}`
    );

    return {
      success: true,
      connected: true,
      status: GOOGLE_AUTH_STATUS.CONNECTED,
      userEmail: updated.userEmail || detectedEmail || 'Google Account',
      lastValidatedAt: updated.lastValidatedAt,
      message: 'Google Account successfully logged in! Session cookies saved in database and window closed.',
    };
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('googleSessionService.launchGoogleInteractiveLoginService', error.message);
    throw new appError(error.message || 'Interactive Google login failed.', error.statusCode || 500);
  } finally {
    // Automatically close the browser window proper!
    await BrowserManager.closeSafely({ page, context, browser });
  }
};


