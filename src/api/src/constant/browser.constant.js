/**
 * Centralized Browser Automation Constants
 */
export const BROWSER_HEADLESS = "false";
export const BROWSER_SLOW_MO = Number(process.env.BROWSER_SLOW_MO || 0);
export const BROWSER_DEFAULT_TIMEOUT = Number(
  process.env.BROWSER_TIMEOUT || 30000,
); // 30 seconds

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
