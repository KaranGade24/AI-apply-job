import { extractElementsFromFrame } from './extractElements.js';
import { MAX_ELEMENTS_IN_PROMPT } from '../../../constant/agent.constant.js';
import { logError } from '../../../utils/logger.js';

/**
 * Observes the full page, captures scroll info, frames, text summary, and extracts interactive elements.
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {string} [options.snapshotId]
 * @param {number} [options.maxElements]
 * @returns {Promise<object>} Page observation object
 */
export const observePage = async (page, options = {}) => {
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) {
    return {
      snapshotId: options.snapshotId || `snap_${Date.now()}`,
      url: '',
      title: '',
      elements: [],
      visibleTextTrimmed: '',
      scrollInfo: { scrollX: 0, scrollY: 0, scrollHeight: 0, scrollWidth: 0 },
      frames: [],
      timestamp: new Date().toISOString(),
    };
  }

  const snapshotId = options.snapshotId || `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const maxElements = options.maxElements || MAX_ELEMENTS_IN_PROMPT || 60;

  try {
    const url = page.url();
    const title = await page.title().catch(() => '');

    // Extract scroll info and visible text summary
    const pageMeta = await page
      .evaluate(() => {
        const doc = document.documentElement || document.body;
        return {
          scrollX: window.scrollX || window.pageXOffset || 0,
          scrollY: window.scrollY || window.pageYOffset || 0,
          scrollHeight: doc.scrollHeight || 0,
          scrollWidth: doc.scrollWidth || 0,
          viewportHeight: window.innerHeight || 0,
          viewportWidth: window.innerWidth || 0,
          visibleText: (document.body?.innerText || '').slice(0, 1500).replace(/\s+/g, ' ').trim(),
        };
      })
      .catch(() => ({
        scrollX: 0,
        scrollY: 0,
        scrollHeight: 0,
        scrollWidth: 0,
        viewportHeight: 0,
        viewportWidth: 0,
        visibleText: '',
      }));

    // Extract interactive elements from main frame
    const mainElements = await extractElementsFromFrame(page, {
      snapshotId,
      frameUrl: url,
      startIndex: 0,
      maxElements,
    });

    const framesInfo = [{ frameId: 'main', url, isMainFrame: true }];

    // If remaining budget, extract from accessible child frames
    let allElements = [...mainElements];
    if (allElements.length < maxElements && typeof page.frames === 'function') {
      const childFrames = page.frames().filter((f) => f !== page.mainFrame());
      for (const frame of childFrames) {
        if (allElements.length >= maxElements) break;
        const frameUrl = frame.url();
        framesInfo.push({ frameId: frame.name() || frameUrl, url: frameUrl, isMainFrame: false });
        const childElements = await extractElementsFromFrame(frame, {
          snapshotId,
          frameUrl,
          startIndex: allElements.length,
          maxElements: maxElements - allElements.length,
        });
        allElements.push(...childElements);
      }
    }

    return {
      snapshotId,
      url,
      title,
      scrollInfo: {
        scrollX: pageMeta.scrollX,
        scrollY: pageMeta.scrollY,
        scrollHeight: pageMeta.scrollHeight,
        scrollWidth: pageMeta.scrollWidth,
        viewportHeight: pageMeta.viewportHeight,
        viewportWidth: pageMeta.viewportWidth,
      },
      frames: framesInfo,
      elements: allElements,
      visibleTextTrimmed: pageMeta.visibleText,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    await logError('observePage', error.message);
    return {
      snapshotId,
      url: page.url(),
      title: '',
      elements: [],
      visibleTextTrimmed: '',
      scrollInfo: { scrollX: 0, scrollY: 0, scrollHeight: 0, scrollWidth: 0 },
      frames: [],
      timestamp: new Date().toISOString(),
    };
  }
};

export default observePage;
