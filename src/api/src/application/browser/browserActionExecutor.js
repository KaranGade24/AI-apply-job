import { BROWSER_ACTIONS, FORM_ACTIONS } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Resolves a locator from a target specification ({ selector, text, id }).
 *
 * @param {import('playwright').Page} page
 * @param {object|string} target
 * @returns {import('playwright').Locator}
 */
const resolveTargetLocator = (page, target) => {
  if (typeof target === 'string') {
    return page.locator(target).first();
  }

  if (target?.selector) {
    return page.locator(target.selector).first();
  }

  if (target?.id) {
    return page.locator(`#${target.id}`).first();
  }

  if (target?.text) {
    return page.getByText(target.text, { exact: false }).first();
  }

  throw new Error('No valid selector, id, or text target provided');
};

/**
 * Executes a single browser action strictly conforming to the 12 BROWSER_ACTIONS.
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {object} action - Action descriptor: { type, target: { selector, text, url }, value }
 * @param {object} [options]
 * @param {string} [options.resumePdfPath] - Local path for PDF resume upload
 * @param {import('playwright').BrowserContext} [options.context]
 * @returns {Promise<{ success: boolean, error: string|null, timestamp: Date }>}
 */
export const executeSingleBrowserAction = async (page, action, options = {}) => {
  const timestamp = new Date();
  const type = action?.type;
  const target = action?.target || {};
  const value = action?.value;

  try {
    await logJobEvent(
      'browserActionExecutor',
      'EXECUTE_SINGLE',
      `Type: ${type} | Target: ${JSON.stringify(target)} | Value: "${String(value || '').slice(0, 30)}"`
    );

    switch (type) {
      case BROWSER_ACTIONS.NAVIGATE: {
        const targetUrl = target.url || target.href || (typeof target === 'string' ? target : value);
        if (!targetUrl) throw new Error('NAVIGATE action missing target URL');
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.CLICK: {
        const locator = resolveTargetLocator(page, target);
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 5000 }).catch(async () => {
          // Fallback force click if intercepted by overlay
          await locator.click({ force: true, timeout: 3000 });
        });
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.FILL: {
        const locator = resolveTargetLocator(page, target);
        const strVal = String(value ?? '');
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.fill(strVal);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.TYPE: {
        const locator = resolveTargetLocator(page, target);
        const strVal = String(value ?? '');
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.focus().catch(() => {});
        await locator.pressSequentially(strVal, { delay: 30 });
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.SELECT: {
        const locator = resolveTargetLocator(page, target);
        const strVal = String(value ?? '');
        await locator.waitFor({ state: 'attached', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.selectOption({ label: strVal }).catch(async () => {
          await locator.selectOption({ value: strVal }).catch(async () => {
            await locator.selectOption(strVal);
          });
        });
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.CHECK: {
        const locator = resolveTargetLocator(page, target);
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.check().catch(async () => {
          await locator.click();
        });
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.UNCHECK: {
        const locator = resolveTargetLocator(page, target);
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.uncheck().catch(async () => {
          await locator.click();
        });
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.UPLOAD: {
        const filePath = value || options.resumePdfPath;
        if (!filePath) throw new Error('UPLOAD action missing file path');
        const locator = resolveTargetLocator(page, target);
        await locator.setInputFiles(filePath);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.SCROLL: {
        const deltaY = typeof value === 'number' ? value : 500;
        await page.evaluate((y) => window.scrollBy(0, y), deltaY);
        await page.waitForTimeout(500);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.WAIT: {
        const ms = typeof value === 'number' ? value : 1000;
        await page.waitForTimeout(ms);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.GO_BACK: {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.CLOSE_MODAL: {
        // Try clicking common modal close buttons or escape key
        const closeSelectors = [
          'button[aria-label*="close" i]',
          'button[aria-label*="dismiss" i]',
          '.modal-close',
          '[data-dismiss="modal"]',
          '.close-btn',
          'button:has-text("✕")',
          'button:has-text("×")',
        ];

        let closed = false;
        for (const sel of closeSelectors) {
          const btn = page.locator(sel).first();
          const visible = await btn.isVisible().catch(() => false);
          if (visible) {
            await btn.click().catch(() => {});
            closed = true;
            break;
          }
        }

        if (!closed) {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(500);
        return { success: true, error: null, timestamp };
      }

      default:
        throw new Error(`Unrecognized browser action type: "${type}"`);
    }
  } catch (err) {
    const errorMsg = `Action "${type}" failed: ${err.message}`;
    await logError('browserActionExecutor.executeSingleBrowserAction', errorMsg);
    return { success: false, error: errorMsg, timestamp };
  }
};

/**
 * Legacy batch executor kept for backward compatibility with form filling callers.
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} actions - List of { fieldId, action, value }
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, executedCount: number, errors: Array<string> }>}
 */
export const executeBrowserActions = async (page, actions = [], options = {}) => {
  const errors = [];
  let executedCount = 0;

  for (const item of actions) {
    const { fieldId, action, value } = item;

    // Map legacy action names if needed
    let actionType = action;
    if (action === FORM_ACTIONS.FILL) actionType = BROWSER_ACTIONS.FILL;
    else if (action === FORM_ACTIONS.SELECT) actionType = BROWSER_ACTIONS.SELECT;
    else if (action === FORM_ACTIONS.CHECK) actionType = BROWSER_ACTIONS.CHECK;
    else if (action === FORM_ACTIONS.UNCHECK) actionType = BROWSER_ACTIONS.UNCHECK;
    else if (action === FORM_ACTIONS.UPLOAD) actionType = BROWSER_ACTIONS.UPLOAD;
    else if (action === FORM_ACTIONS.CLICK) actionType = BROWSER_ACTIONS.CLICK;
    else if (action === FORM_ACTIONS.WAIT) actionType = BROWSER_ACTIONS.WAIT;

    const result = await executeSingleBrowserAction(
      page,
      {
        type: actionType,
        target: { selector: fieldId },
        value,
      },
      options
    );

    if (result.success) {
      executedCount++;
    } else {
      errors.push(result.error);
    }
  }

  return {
    success: errors.length === 0,
    executedCount,
    errors,
  };
};
