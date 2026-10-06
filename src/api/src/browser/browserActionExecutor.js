import fs from 'fs';
import { BROWSER_ACTIONS, FORM_ACTIONS } from '../constant/application.constant.js';
import { ensureEffectiveResumePdfOnDisk } from '../application/resume/resumePdfGenerator.js';
import { logJobEvent, logError } from '../utils/logger.js';
import { resolveElement } from './observer/elementResolver.js';

const autoDismissCookieBanners = async (page) => {
  if (!page || page.isClosed()) return;
  try {
    const cookieSelectors = [
      'button:has-text("I agree")',
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      'button:has-text("Allow all")',
      '#accept-cookies',
      '.cookie-banner button',
      '.cc-btn.cc-dismiss',
    ];
    for (const sel of cookieSelectors) {
      const btn = page.locator(sel).first();
      if ((await btn.count().catch(() => 0)) > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        break;
      }
    }
  } catch {}
};

/**
 * Visually highlights the active element on the live browser stream with a glowing ring
 */
const highlightElement = async (locator, color = '#3b82f6') => {
  try {
    await locator.evaluate((el, c) => {
      if (!el) return;
      const oldOutline = el.style.outline;
      const oldBoxShadow = el.style.boxShadow;
      const oldTransition = el.style.transition;
      el.style.transition = 'all 0.15s ease-in-out';
      el.style.outline = `3px solid ${c}`;
      el.style.boxShadow = `0 0 14px ${c}`;
      setTimeout(() => {
        try {
          el.style.outline = oldOutline || '';
          el.style.boxShadow = oldBoxShadow || '';
          el.style.transition = oldTransition || '';
        } catch {}
      }, 700);
    }, color).catch(() => {});
  } catch {}
};

/**
 * Resolves a locator safely using our ambiguity-safe resolution system.
 *
 * @param {import('playwright').Page} page
 * @param {object|string} target
 * @returns {Promise<import('playwright').Locator>}
 */
const resolveTargetLocator = async (page, target) => {
  // 1. Direct CSS Selector resolution if available
  const selector = typeof target === 'string' ? target : target?.selector;
  if (selector && typeof selector === 'string') {
    try {
      const loc = page.locator(selector).first();
      const count = await loc.count().catch(() => 0);
      if (count > 0) return loc;
    } catch {
      // Fall through to semantic resolver if invalid CSS selector
    }
  }

  // 2. Direct text query if provided
  if (target?.text || target?.label) {
    try {
      const textQuery = String(target.text || target.label).trim();
      if (textQuery) {
        const textLoc = page.getByText(textQuery, { exact: false }).first();
        if ((await textLoc.count().catch(() => 0)) > 0) return textLoc;
      }
    } catch {
      // Fall through
    }
  }

  // 3. Fallback to ambiguity-safe element descriptor resolution
  let elementDescriptor = target;
  if (typeof target === 'string') {
    elementDescriptor = { ancestryPath: target };
  }

  const resolvedLoc = await resolveElement(page, elementDescriptor);
  if (!resolvedLoc || resolvedLoc.resolved === false) {
    const reason = resolvedLoc?.reason || 'TARGET_NOT_FOUND';
    throw new Error(`Element resolution failed: ${reason}`);
  }

  return resolvedLoc;
};

/**
 * Executes a single browser action strictly conforming to the 12 BROWSER_ACTIONS.
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {object} action - Action descriptor: { type, target, value }
 * @param {object} [options]
 * @param {string} [options.resumePdfPath] - Local path for PDF resume upload
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
        await autoDismissCookieBanners(page);
        await page.waitForTimeout(1000);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.CLICK: {
        await autoDismissCookieBanners(page);
        const locator = await resolveTargetLocator(page, target);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(locator, '#f59e0b');
        await page.waitForTimeout(150);
        try {
          await locator.click({ timeout: 4000 });
        } catch {
          // Fallback force click or direct DOM click if intercepted by overlay
          try {
            await locator.click({ force: true, timeout: 2500 });
          } catch {
            await locator.evaluate((el) => el.click()).catch(() => {});
          }
        }
        await page.waitForTimeout(300);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.FILL: {
        await autoDismissCookieBanners(page);
        const locator = await resolveTargetLocator(page, target);
        const strVal = String(value ?? '');
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(locator, '#3b82f6');
        await page.waitForTimeout(150);

        let filled = false;
        try {
          await locator.fill(strVal, { timeout: 3000 });
          filled = true;
        } catch {
          filled = false;
        }

        // Direct DOM assignment fallback with event dispatch if locator.fill timed out (e.g. element inside accordion or not standard visible)
        if (!filled) {
          try {
            await locator.evaluate((el, val) => {
              if (!el) return false;
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
              return true;
            }, strVal);
            filled = true;
          } catch {
            await locator.focus().catch(() => {});
            await locator.fill(strVal, { force: true, timeout: 2000 }).catch(() => {});
          }
        }
        await page.waitForTimeout(250);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.TYPE: {
        const locator = await resolveTargetLocator(page, target);
        const strVal = String(value ?? '');
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(locator, '#3b82f6');
        await locator.focus().catch(() => {});
        await locator.pressSequentially(strVal, { delay: 35 });
        await page.waitForTimeout(250);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.SELECT: {
        const locator = await resolveTargetLocator(page, target);
        const strVal = String(value ?? '');
        await locator.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(locator, '#10b981');
        await page.waitForTimeout(150);

        // 1. Direct DOM select option with event dispatch (works for both visible and hidden/styled selects)
        let handled = false;
        try {
          handled = await locator.evaluate((selectEl, val) => {
            if (!selectEl) return false;
            const targetStr = String(val).toLowerCase().trim();
            const opts = Array.from(selectEl.options || []);
            let matched = opts.find(
              (o) =>
                (o.text || '').toLowerCase().trim() === targetStr ||
                (o.value || '').toLowerCase().trim() === targetStr ||
                (o.text || '').toLowerCase().includes(targetStr) ||
                targetStr.includes((o.text || '').toLowerCase().trim())
            );
            if (!matched && opts.length > 0) {
              matched = opts.find((o) => o.value && o.value !== '' && o.value !== '-1');
            }
            if (matched) {
              selectEl.value = matched.value;
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
              selectEl.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          }, strVal).catch(() => false);
        } catch {
          handled = false;
        }

        // 2. Playwright selectOption fallback with safe bounded timeout
        if (!handled) {
          await locator.selectOption({ label: strVal }, { timeout: 3000 }).catch(async () => {
            await locator.selectOption({ value: strVal }, { timeout: 2000 }).catch(async () => {
              await locator.selectOption(strVal, { timeout: 2000 }).catch(() => {});
            });
          });
        }
        await page.waitForTimeout(250);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.CHECK: {
        const locator = await resolveTargetLocator(page, target);
        await locator.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(locator, '#10b981');
        await page.waitForTimeout(150);
        
        let checkedInDom = false;
        try {
          checkedInDom = await locator.evaluate((el) => {
            if (!el) return false;
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          }).catch(() => false);
        } catch {
          checkedInDom = false;
        }

        if (!checkedInDom) {
          await locator.check({ force: true, timeout: 3000 }).catch(async () => {
            await locator.click({ force: true, timeout: 2000 }).catch(async () => {
              const parent = locator.locator('..');
              await parent.click({ force: true, timeout: 2000 }).catch(() => {});
            });
          });
        }
        await page.waitForTimeout(200);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.UNCHECK: {
        const locator = await resolveTargetLocator(page, target);
        await locator.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await highlightElement(locator, '#64748b');
        await page.waitForTimeout(150);
        await locator.uncheck().catch(async () => {
          await locator.click();
        });
        await page.waitForTimeout(200);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.UPLOAD: {
        let filePath = value || options.resumePdfPath;
        if (!filePath || !fs.existsSync(filePath)) {
          filePath = await ensureEffectiveResumePdfOnDisk({
            candidatePath: filePath,
            userId: options.userId,
            resumeData: options.resumeData,
          });
        }
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error(`UPLOAD action file not found on disk: ${value || options.resumePdfPath}`);
        }
        const locator = await resolveTargetLocator(page, target);
        await highlightElement(locator, '#8b5cf6');
        await page.waitForTimeout(200);
        await locator.setInputFiles(filePath).catch(async () => {
          // If custom button, click with filechooser
          const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
          await locator.click({ force: true }).catch(() => {});
          const chooser = await fileChooserPromise;
          if (chooser) {
            await chooser.setFiles(filePath);
          }
        });
        await page.waitForTimeout(300);
        return { success: true, error: null, timestamp };
      }

      case BROWSER_ACTIONS.SCROLL: {
        const deltaY = typeof value === 'number' ? value : 500;
        await page.evaluate((y) => {
          window.scrollBy({ top: y, left: 0, behavior: 'smooth' });
        }, deltaY).catch(() => {});
        await page.waitForTimeout(600);
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
export default executeSingleBrowserAction;
