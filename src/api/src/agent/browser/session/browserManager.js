import { chromium } from 'playwright';
import { config } from '../../../config/env.js';
import {
  BROWSER_VIEWPORT,
  BROWSER_LAUNCH_ARGS,
} from '../../../constant/browser.constant.js';
import { DEFAULT_PAGE_TIMEOUT_MS } from '../../../constant/agent.constant.js';
import { BrowserSessionRepository } from '../../../repositories/browserSession.repository.js';
import { logError, logJobEvent } from '../../../utils/logger.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

let sharedBrowserInstance = null;
let browserLaunchPromise = null;

/**
 * BrowserManager provides singleton shared Playwright browser instance management
 * and isolated per-application browser contexts.
 */
export class BrowserManager {
  /**
   * Retrieves or lazily launches the shared Playwright Chromium browser instance.
   *
   * @param {object} [customLaunchOptions]
   * @returns {Promise<import('playwright').Browser>}
   */
  static async getSharedBrowser(customLaunchOptions = {}) {
    if (sharedBrowserInstance && typeof sharedBrowserInstance.isConnected === 'function' && sharedBrowserInstance.isConnected()) {
      return sharedBrowserInstance;
    }

    if (browserLaunchPromise) {
      return browserLaunchPromise;
    }

    browserLaunchPromise = (async () => {
      try {
        const headless = customLaunchOptions.headless !== undefined
          ? customLaunchOptions.headless
          : config.browser.headless;
        const slowMo = customLaunchOptions.slowMo !== undefined
          ? customLaunchOptions.slowMo
          : config.browser.slowMo;

        await logJobEvent(
          'browserManager',
          'BROWSER_LAUNCHING',
          `Launching shared Chromium instance (headless: ${headless}, slowMo: ${slowMo})`
        );

        const browser = await chromium.launch({
          headless,
          slowMo,
          args: [...BROWSER_LAUNCH_ARGS],
          ignoreDefaultArgs: ['--enable-automation'],
          ...customLaunchOptions,
        });

        if (typeof browser.on === 'function') {
          browser.on('disconnected', () => {
            logJobEvent('browserManager', 'BROWSER_DISCONNECTED', 'Shared Chromium browser disconnected');
            sharedBrowserInstance = null;
            browserLaunchPromise = null;
          });
        }

        sharedBrowserInstance = browser;
        return browser;
      } catch (error) {
        await logError('BrowserManager.getSharedBrowser', error.message, error.stack);
        sharedBrowserInstance = null;
        browserLaunchPromise = null;
        throw error;
      } finally {
        browserLaunchPromise = null;
      }
    })();

    return browserLaunchPromise;
  }

  /**
   * Creates an isolated BrowserContext for an application, restoring decrypted storageState if available.
   * Note: NEVER logs cookies or storageState.
   *
   * @param {string} applicationId
   * @param {object} [options]
   * @param {object} [options.storageState]
   * @param {boolean} [options.blockHeavyResources=true]
   * @returns {Promise<import('playwright').BrowserContext>}
   */
  static async createApplicationContext(applicationId, options = {}) {
    try {
      const browser = await this.getSharedBrowser(options);

      // Load storage state if not explicitly passed (loaded storage state is decrypted in repository)
      let storageState = options.storageState;
      if (!storageState && applicationId) {
        storageState = await BrowserSessionRepository.loadStorageState(applicationId);
      }

      const contextOptions = {
        userAgent: options.userAgent || DEFAULT_USER_AGENT,
        viewport: options.viewport || BROWSER_VIEWPORT,
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
        },
      };

      if (storageState) {
        contextOptions.storageState = storageState;
      }

      const context = await browser.newContext(contextOptions);

      // Stealth evasion script
      if (typeof context.addInitScript === 'function') {
        await context.addInitScript(() => {
          try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = {
              runtime: {},
              app: {},
              csi: () => {},
              loadTimes: () => {},
            };
          } catch {}
        });
      }

      const timeout = options.timeout || config.browser.timeout || DEFAULT_PAGE_TIMEOUT_MS;
      if (typeof context.setDefaultTimeout === 'function') {
        context.setDefaultTimeout(timeout);
      }
      if (typeof context.setDefaultNavigationTimeout === 'function') {
        context.setDefaultNavigationTimeout(timeout);
      }

      // Block heavy resources if enabled
      if (options.blockHeavyResources !== false && typeof context.route === 'function') {
        await context.route('**/*', (route) => {
          const type = route.request().resourceType();
          const url = route.request().url();
          if (
            type === 'media' ||
            type === 'font' ||
            /(?:googleads|adsbygoogle|doubleclick|googletagservices|googlesyndication|ezoic|adnxs|amazon-adsystem|analytics|tracker|facebook\.net|taboola|outbrain|criteo|pubmatic)/i.test(url)
          ) {
            return route.abort().catch(() => {});
          }
          return route.continue().catch(() => {});
        });
      }

      return context;
    } catch (error) {
      await logError('BrowserManager.createApplicationContext', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Safely closes the shared browser instance and resets the singleton.
   */
  static async closeSharedBrowser() {
    try {
      if (sharedBrowserInstance) {
        const browser = sharedBrowserInstance;
        sharedBrowserInstance = null;
        browserLaunchPromise = null;
        if (typeof browser.close === 'function') {
          await browser.close().catch(() => {});
        }
        await logJobEvent('browserManager', 'BROWSER_CLOSED', 'Shared Chromium browser successfully closed');
      }
    } catch (error) {
      await logError('BrowserManager.closeSharedBrowser', error.message);
    }
  }
}

export default BrowserManager;
