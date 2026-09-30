import { logJobEvent, logError } from '../utils/logger.js';

/**
 * Handles complex browser contexts, including multiple tabs, iframes, modal focus shifts,
 * and stale element reference invalidation.
 */
export class BrowserContextManager {
  /**
   * Tracks active tab/page roles and IDs within a browser context.
   *
   * @param {import('playwright').BrowserContext} context
   * @param {import('playwright').Page} currentPage
   * @returns {Promise<{ activePage: import('playwright').Page, tabCount: number }>}
   */
  static async resolveActiveTab(context, currentPage) {
    try {
      const pages = context.pages();
      if (pages.length <= 1) {
        return { activePage: currentPage, tabCount: pages.length };
      }

      // Identify the target page (exclude about:blank, focus on the newest non-blank tab)
      const targetPage = pages.find((p) => {
        const url = p.url().toLowerCase();
        return !url.includes('about:blank') && p !== currentPage;
      }) || currentPage;

      if (targetPage !== currentPage) {
        await logJobEvent(
          'browserContextManager',
          'TAB_DETECTED',
          `New tab detected: "${targetPage.url()}". Shifting active context.`
        );
      }

      return { activePage: targetPage, tabCount: pages.length };
    } catch (error) {
      await logError('browserContextManager.resolveActiveTab', error.message);
      return { activePage: currentPage, tabCount: 1 };
    }
  }

  /**
   * Scans and returns the correct frame (main page or active iframe) containing form fields.
   * Prevents missing form fields rendered within cross-origin or local iframes.
   *
   * @param {import('playwright').Page} page
   * @returns {Promise<import('playwright').Frame | import('playwright').Page>}
   */
  static async resolveFormFrame(page) {
    try {
      const frames = page.frames();
      for (const frame of frames) {
        // If an iframe contains form-like input indicators
        const hasInputs = await frame.$('input, select, textarea').catch(() => null);
        if (hasInputs && frame !== page) {
          await logJobEvent(
            'browserContextManager',
            'IFRAME_DETECTED',
            `Form elements detected within iframe [ID: ${frame.name() || 'unnamed'}]. Targeting iframe.`
          );
          return frame;
        }
      }
      return page;
    } catch (error) {
      await logError('browserContextManager.resolveFormFrame', error.message);
      return page;
    }
  }

  /**
   * Determines if a modal overlay is open, shifting the interaction root context
   * into the modal container to prevent click blocking from overlay elements.
   *
   * @param {import('playwright').Page | import('playwright').Frame} container
   * @returns {Promise<{ root: import('playwright').Page | import('playwright').Frame | import('playwright').ElementHandle, isModal: boolean }>}
   */
  static async resolveModalContext(container) {
    try {
      // Common modal class name or role patterns
      const modalSelectors = [
        '[role="dialog"]',
        '.modal',
        '.modal-content',
        '.overlay',
        '.popup-container',
        '[class*="modal" i]',
        '[id*="modal" i]'
      ];

      for (const selector of modalSelectors) {
        const modalElement = await container.$(selector).catch(() => null);
        if (modalElement) {
          const isVisible = await modalElement.isVisible().catch(() => false);
          if (isVisible) {
            await logJobEvent(
              'browserContextManager',
              'MODAL_FOCUS_SHIFT',
              `Active modal overlay detected. Shifting focus context to modal wrapper.`
            );
            return { root: modalElement, isModal: true };
          }
        }
      }
    } catch (error) {
      await logError('browserContextManager.resolveModalContext', error.message);
    }
    return { root: container, isModal: false };
  }

  /**
   * Safely selects an element, invalidating stale references by re-evaluating the selector.
   *
   * @param {string} selector
   * @param {import('playwright').Page | import('playwright').Frame} context
   * @returns {Promise<import('playwright').ElementHandle | null>}
   */
  static async getFreshElement(selector, context) {
    try {
      // Re-selecting dynamically guarantees reference validity under dynamic Vue/React/Angular re-renders.
      const element = await context.$(selector);
      if (!element) return null;

      const isAttached = await element.evaluate((node) => node.isConnected).catch(() => false);
      if (!isAttached) {
        await logJobEvent(
          'browserContextManager',
          'STALE_REFERENCE_PREVENTED',
          `Stale element reference detected for "${selector}". Re-observing DOM.`
        );
        return await context.$(selector);
      }
      return element;
    } catch (error) {
      await logError('browserContextManager.getFreshElement', error.message);
      return null;
    }
  }
}

export default BrowserContextManager;
