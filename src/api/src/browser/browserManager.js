import { createBrowser } from './browserConfig.js';
import { BROWSER_VIEWPORT } from '../constant/browser.constant.js';
import { logError } from '../utils/logger.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * BrowserManager provides high-level browser and context lifecycle management
 * with storageState injection and capture support for session persistence.
 */
export class BrowserManager {
  /**
   * Launches a Playwright browser instance
   * @param {object} [options]
   * @returns {Promise<import('playwright').Browser>}
   */
  static async launch(options = {}) {
    try {
      return await createBrowser();
    } catch (error) {
      await logError('browserManager.launch', error.message);
      throw error;
    }
  }

  /**
   * Convenience helper to launch browser, create context (with optional storageState), and create page
   * @param {object} [options]
   * @param {object} [options.storageState]
   * @param {boolean} [options.headless]
   * @returns {Promise<{browser: import('playwright').Browser, context: import('playwright').BrowserContext, page: import('playwright').Page}>}
   */
  static async launchWithSession(options = {}) {
    try {
      const browser = await this.launch(options);
      const context = await this.createContext(browser, options);
      const page = await context.newPage();
      return { browser, context, page };
    } catch (error) {
      await logError('browserManager.launchWithSession', error.message);
      throw error;
    }
  }

  /**
   * Creates an isolated browser context, optionally restoring from authenticated storageState
   * @param {import('playwright').Browser} browser
   * @param {object} [options]
   * @param {object} [options.storageState] - Decrypted Playwright storageState JSON object
   * @param {boolean} [options.blockHeavyResources=true]
   * @returns {Promise<import('playwright').BrowserContext>}
   */
  static async createContext(browser, options = {}) {
    try {
      const contextOptions = {
        userAgent: options.userAgent || DEFAULT_USER_AGENT,
        viewport: options.viewport || BROWSER_VIEWPORT,
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
        }
      };

      if (options.storageState) {
        contextOptions.storageState = options.storageState;
      }

      const context = await browser.newContext(contextOptions);

      // Apply stealth injections
      await context.addInitScript(() => {
        try {
          // 1. WebDriver nullification
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

          // 2. Plugins array spoofing
          Object.defineProperty(navigator, 'plugins', {
            get: () => [
              { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbgodfjcgffgknndgihonbclbhfeb', description: 'Google Chrome PDF' }
            ]
          });

          // 3. Language consistency
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

          // 4. Chrome object spoofing
          window.chrome = {
            runtime: {},
            app: {},
            csi: () => {},
            loadTimes: () => {},
          };

          // 5. WebGL vendor/renderer spoofing to mock high-end desktop GPU
          const getParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
              return 'Google Inc. (NVIDIA)';
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
              return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            }
            return getParameter.apply(this, arguments);
          };
        } catch {}
      });

      context.setDefaultTimeout(options.timeout || 15000);
      context.setDefaultNavigationTimeout(options.navigationTimeout || 20000);

      // Block heavy media and known ad domains to improve performance
      if (options.blockHeavyResources !== false) {
        await context.route('**/*', (route) => {
          const type = route.request().resourceType();
          const url = route.request().url();
          if (
            type === 'media' ||
            (type !== 'document' && /(?:googleads|adsbygoogle|doubleclick|googletagservices|googlesyndication|ezoic|adnxs|amazon-adsystem|facebook\.net|taboola|outbrain|criteo|pubmatic)/i.test(url))
          ) {
            return route.abort().catch(() => {});
          }
          return route.continue().catch(() => {});
        });
      }

      return context;
    } catch (error) {
      await logError('browserManager.createContext', error.message);
      throw error;
    }
  }

  /**
   * Captures storageState (cookies & localStorage) from an active context
   * @param {import('playwright').BrowserContext} context
   * @returns {Promise<object>} Playwright storageState object
   */
  static async captureStorageState(context) {
    try {
      if (!context) return null;
      return await context.storageState();
    } catch (error) {
      await logError('browserManager.captureStorageState', error.message);
      throw error;
    }
  }

  /**
   * Safely closes page, context, and browser without throwing
   */
  static async closeSafely({ page = null, context = null, browser = null } = {}) {
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export default BrowserManager;
