import { chromium } from 'playwright';
import {
  BROWSER_HEADLESS,
  BROWSER_SLOW_MO,
  BROWSER_LAUNCH_ARGS
} from '../constant/browser.constant.js';

/**
 * Launches and configures a Chromium browser instance using Playwright
 * @returns {Promise<import('playwright').Browser>} Chromium browser instance
 */
export const createBrowser = async () => {
  const isHeadless = typeof BROWSER_HEADLESS === 'string'
    ? BROWSER_HEADLESS.toLowerCase() === 'true'
    : Boolean(BROWSER_HEADLESS);

  return chromium.launch({
    headless: isHeadless,
    slowMo: BROWSER_SLOW_MO,
    args: [...BROWSER_LAUNCH_ARGS]
  });
};

export default createBrowser;
