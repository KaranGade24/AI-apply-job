import { logError, logJobEvent } from '../../../utils/logger.js';

/**
 * Captures a downscaled viewport screenshot as base64 only when needed.
 * Never persists raw screenshot buffers with sensitive data to disk or database.
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {boolean} [options.fullPage=false]
 * @param {number} [options.quality=80]
 * @returns {Promise<{ base64: string, mimeType: string }|null>}
 */
export const captureScreenshot = async (page, options = {}) => {
  if (!page || typeof page.screenshot !== 'function') {
    return null;
  }

  try {
    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: options.quality || 80,
      fullPage: Boolean(options.fullPage),
    });

    const base64 = screenshotBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    await logJobEvent(
      'captureScreenshot',
      'SCREENSHOT_CAPTURED',
      `Viewport screenshot captured (${Math.round(base64.length / 1024)} KB base64, quality: ${options.quality || 80})`
    );

    return {
      base64,
      mimeType,
    };
  } catch (error) {
    await logError('captureScreenshot', error.message);
    return null;
  }
};

export default captureScreenshot;
