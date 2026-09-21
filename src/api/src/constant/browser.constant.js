import { BROWSER_HEADLESS as ENV_HEADLESS, BROWSER_SLOW_MO as ENV_SLOW_MO, BROWSER_TIMEOUT as ENV_TIMEOUT } from '../config/env.js';

/**
 * Centralized Browser Automation Constants
 */
export const BROWSER_HEADLESS = ENV_HEADLESS;
export const BROWSER_SLOW_MO = ENV_SLOW_MO;
export const BROWSER_DEFAULT_TIMEOUT = ENV_TIMEOUT;

export const BROWSER_VIEWPORT = Object.freeze({
  width: 1280,
  height: 800,
});

export const BROWSER_LAUNCH_ARGS = Object.freeze([
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
]);

