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
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-domain-reliability",
  "--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process",
  "--disable-hang-monitor",
  "--disable-ipc-flooding-protection",
  "--disable-notifications",
  "--disable-popup-blocking",
  "--disable-renderer-backgrounding",
  "--disable-sync",
  "--no-default-browser-check",
  "--no-pings",
  "--mute-audio"
]);

