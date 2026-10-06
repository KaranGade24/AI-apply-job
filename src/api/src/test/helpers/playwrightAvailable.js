import { chromium } from 'playwright';

let isChromiumAvailable = null;

export const checkPlaywrightAvailable = async () => {
  if (isChromiumAvailable !== null) return isChromiumAvailable;
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    isChromiumAvailable = true;
  } catch (err) {
    isChromiumAvailable = false;
  }
  return isChromiumAvailable;
};

export default checkPlaywrightAvailable;
