import { getDomSnapshotScript } from './domScript.js';

/**
 * Checks if a Playwright JSHandle/ElementHandle points to an element still alive and connected to the DOM.
 * @param {import('playwright').JSHandle} handle
 * @returns {Promise<boolean>}
 */
export const isElementAlive = async (handle) => {
  try {
    if (!handle) return false;
    return await handle.evaluate((el) => {
      return !!(el && el.isConnected);
    }).catch(() => false);
  } catch {
    return false;
  }
};

/**
 * Captures an enhanced interactive DOM snapshot from all page frames.
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {boolean} [options.enableCDP=false] - Optional CDP accessibility tree enrichment
 * @returns {Promise<object>} Consolidated interactive DOM snapshot
 */
export const getDomSnapshot = async (page, options = {}) => {
  try {
    if (!page || page.isClosed()) {
      throw new Error('Cannot get DOM snapshot from a closed page');
    }

    const mainUrl = page.url();
    const mainTitle = await page.title().catch(() => '') || 'Untitled';

    // 1. Walk and capture scroll coordinates from the main frame
    const scrollDetails = await page.evaluate(() => {
      const x = window.scrollX || window.pageXOffset || 0;
      const y = window.scrollY || window.pageYOffset || 0;
      const height = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
      const viewportHeight = window.innerHeight;
      const pixelsAbove = y;
      const pixelsBelow = Math.max(0, height - y - viewportHeight);
      return { x, y, pixelsAbove, pixelsBelow, height };
    }).catch(() => ({ x: 0, y: 0, pixelsAbove: 0, pixelsBelow: 0, height: 0 }));

    const snapshot = {
      snapshotId: 'snap_' + Math.random().toString(36).substring(2, 11),
      url: mainUrl,
      title: mainTitle,
      elements: [],
      frames: [],
      scroll: scrollDetails,
      timestamp: Date.now()
    };

    // 2. Walk over all active frames
    const allFrames = page.frames();
    const script = getDomSnapshotScript();

    for (let i = 0; i < allFrames.length; i++) {
      const frame = allFrames[i];
      if (frame.isDetached()) continue;

      const frameId = frame === page.mainFrame() ? 'main' : `frame_${i}`;
      const frameUrl = frame.url();

      snapshot.frames.push({
        frameId,
        url: frameUrl,
        isMain: frame === page.mainFrame()
      });

      try {
        // Execute walkDOM inside the frame context
        const frameElements = await frame.evaluate(script);
        if (Array.isArray(frameElements)) {
          for (const el of frameElements) {
            el.frameId = frameId;
            el.framePath = frameUrl;
            snapshot.elements.push(el);
          }
        }
      } catch (err) {
        // Safe fallback for detached or cross-origin inaccessible frames during transition
      }
    }

    // 3. Optional CDP Accessibility tree enrichment
    if (options.enableCDP) {
      try {
        const client = await page.context().newCDPSession(page);
        await client.send('Accessibility.enable').catch(() => {});
        const axTree = await client.send('Accessibility.getFullAXTree').catch(() => null);
        if (axTree) {
          snapshot.axTree = axTree;
        }
      } catch (err) {
        // ignore
      }
    }

    // Capping results size
    if (snapshot.elements.length > 1000) {
      snapshot.elements = snapshot.elements.slice(0, 1000);
    }

    return snapshot;
  } catch (error) {
    return {
      snapshotId: 'error_snap',
      url: page ? page.url() : '',
      title: 'Error Snapshot',
      elements: [],
      frames: [],
      scroll: { x: 0, y: 0, pixelsAbove: 0, pixelsBelow: 0, height: 0 },
      timestamp: Date.now(),
      error: error.message
    };
  }
};

export default {
  getDomSnapshot,
  isElementAlive
};
