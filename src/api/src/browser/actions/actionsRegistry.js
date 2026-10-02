import fs from 'fs';
import { resolveElementHandle } from '../dom/elementRegistry.js';
import { isSafeUrl, waitForSettled, getActivePage, switchTab, closeTab } from '../session/sessionRegistry.js';
import { ensureEffectiveResumePdfOnDisk } from '../../application/resume/resumePdfGenerator.js';
import { logJobEvent, logError } from '../../utils/logger.js';

export const CHANGES_PAGE_ACTIONS = ['navigate', 'goBack', 'switchTab', 'click'];

/**
 * Validates an action against the current browser state snapshot.
 */
export const validateAction = (action, state) => {
  if (action.type === 'navigate') {
    if (!isSafeUrl(action.url)) {
      return { valid: false, reason: 'BLOCKED', message: 'Unsafe URL blocked' };
    }
    return { valid: true };
  }

  // Element-based validation
  if (['click', 'input', 'selectOption', 'getDropdownOptions', 'check', 'uncheck', 'uploadFile'].includes(action.type)) {
    const elements = state.elements || [];
    const el = elements.find(item => item.id === action.index);

    if (!el) {
      return { valid: false, reason: 'ELEMENT_GONE', message: `Element at index ${action.index} was not found` };
    }

    if (el.disabled) {
      return { valid: false, reason: 'DISABLED', message: `Element at index ${action.index} is disabled` };
    }

    // Input specific guards
    if (action.type === 'input') {
      const tag = (el.tag || '').toLowerCase();
      const type = (el.type || '').toLowerCase();
      const name = (el.name || '').toLowerCase();
      
      if (type === 'password' || /otp|passcode|secret/i.test(name)) {
        return { valid: false, reason: 'BLOCKED', message: 'Action blocked: Fill never goes into password/OTP fields.' };
      }
    }

    // Checkbox consent protection: allow terms/privacy agreement, block marketing/promotions
    if (['check', 'uncheck'].includes(action.type)) {
      const name = (el.accessibleName || '').toLowerCase();
      if (/newsletter|marketing|promotional|updates/i.test(name)) {
        if (action.type === 'check') {
          return { valid: false, reason: 'BLOCKED', message: 'Action blocked: Marketing or newsletter subscription checkboxes should not be checked.' };
        }
      }
    }

    // Submit-like click protection: allow "Apply Now" to open forms, protect final submission
    if (action.type === 'click') {
      const text = (el.accessibleName || '').toLowerCase();
      const isInitialApplyButton = /apply\s*now|apply\s*for|start\s*application|^apply$/i.test(text);
      if (!isInitialApplyButton && /submit\s*application|confirm\s*application|send\s*application/i.test(text)) {
        if (!action.approved && !state.autoApplyEnabled) {
          return { valid: false, reason: 'NEEDS_APPROVAL', message: 'Action blocked: Final submit button requires candidate review approval.' };
        }
      }
    }

    // Upload safe validation: Allow server-side generated candidate resume PDF
    if (action.type === 'uploadFile') {
      if (!action.fileRef && !action.filePath) {
        return { valid: false, reason: 'BLOCKED', message: 'Action blocked: Missing candidate resume file path.' };
      }
    }
  }

  return { valid: true };
};

/**
 * Executes a single parsed action on the Playwright page.
 */
export const executeAction = async (action, page, session) => {
  const result = {
    success: false,
    error: null,
    extractedContent: null,
    pageChanged: false,
    newTab: null,
    newElementsCount: 0
  };

  try {
    const frameId = action.frameId || 'main';
    const targetFrame = page.frames().find(f => {
      if (frameId === 'main') return f === page.mainFrame();
      return f.name() === frameId || f.url().includes(frameId);
    }) || page.mainFrame();

    // Resolve handle for index-based elements
    let handle = null;
    if (action.index) {
      handle = await resolveElementHandle(targetFrame, action.index);
      if (!handle) {
        result.error = 'ELEMENT_GONE';
        return result;
      }
      
      const isAlive = await handle.evaluate((el) => !!(el && el.isConnected)).catch(() => false);
      if (!isAlive) {
        result.error = 'STALE';
        return result;
      }

      await handle.scrollIntoViewIfNeeded().catch(() => {});
    }

    const currentUrl = page.url();

    switch (action.type) {
      case 'navigate': {
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await waitForSettled(page);
        result.success = true;
        break;
      }

      case 'goBack': {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await waitForSettled(page);
        result.success = true;
        break;
      }

      case 'click': {
        // Fallback execution chain: normal click -> force click -> coordinate click -> dispatch
        let clicked = false;
        
        await handle.click({ timeout: 3000 }).then(() => { clicked = true; }).catch(async () => {
          await logJobEvent('clickFallback', 'FORCE', `Trying force click on index ${action.index}`);
          await handle.click({ force: true, timeout: 3000 }).then(() => { clicked = true; }).catch(async () => {
            await logJobEvent('clickFallback', 'COORDS', `Trying coordinate click on index ${action.index}`);
            const rect = await handle.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }).catch(() => null);
            
            if (rect) {
              await page.mouse.click(rect.x, rect.y).then(() => { clicked = true; }).catch(async () => {
                await logJobEvent('clickFallback', 'DISPATCH', `Trying dispatch click on index ${action.index}`);
                await handle.dispatchEvent('click').then(() => { clicked = true; }).catch(() => {});
              });
            }
          });
        });

        if (clicked) {
          await page.waitForTimeout(1000).catch(() => {});
          await waitForSettled(page);
          result.success = true;
        } else {
          result.error = 'NOT_VISIBLE';
        }
        break;
      }

      case 'input': {
        // Clear then fill and verify
        await handle.fill('').catch(() => {});
        await handle.fill(action.text);
        
        // Read back verification
        const readValue = await handle.evaluate(el => el.value || el.innerText || '').catch(() => '');
        if (readValue !== action.text) {
          // Fallback type keys
          await handle.click().catch(() => {});
          await page.keyboard.press('Control+A').catch(() => {});
          await page.keyboard.press('Backspace').catch(() => {});
          await page.keyboard.type(action.text);
        }

        // Check if combobox/autocomplete to report visible options
        const isCombo = await handle.evaluate(el => el.getAttribute('role') === 'combobox' || el.getAttribute('autocomplete') === 'on').catch(() => false);
        if (isCombo) {
          await page.waitForTimeout(1000).catch(() => {});
          // Simple grab of list options nearby
          const options = await page.evaluate(() => {
            const list = document.querySelector('[role="listbox"], [class*="dropdown" i], [class*="menu" i]');
            if (list) {
              return Array.from(list.querySelectorAll('[role="option"], li, div')).map(el => el.innerText || el.textContent || '').filter(Boolean);
            }
            return [];
          }).catch(() => []);
          result.extractedContent = options;
        }

        result.success = true;
        break;
      }

      case 'selectOption': {
        const isNativeSelect = await handle.evaluate(el => el.tagName.toLowerCase() === 'select').catch(() => false);
        if (isNativeSelect) {
          await handle.selectOption({ value: action.option }).catch(async () => {
            await handle.selectOption({ label: action.option });
          });
          result.success = true;
        } else {
          // ARIA listbox search & click option
          await handle.click().catch(() => {});
          await page.waitForTimeout(500).catch(() => {});
          const optHandle = await page.locator(`[role="option"]:has-text("${action.option}"), li:has-text("${action.option}")`).first();
          if (await optHandle.count() > 0) {
            await optHandle.click();
            result.success = true;
          } else {
            result.error = 'ELEMENT_GONE';
          }
        }
        break;
      }

      case 'getDropdownOptions': {
        const options = await handle.evaluate(el => {
          if (el.tagName.toLowerCase() === 'select') {
            return Array.from(el.options).map(opt => ({ value: opt.value, label: opt.text }));
          }
          return [];
        }).catch(() => []);
        result.extractedContent = options;
        result.success = true;
        break;
      }

      case 'check': {
        await handle.check().catch(async () => {
          await handle.click();
        });
        result.success = true;
        break;
      }

      case 'uncheck': {
        await handle.uncheck().catch(async () => {
          await handle.click();
        });
        result.success = true;
        break;
      }

      case 'uploadFile': {
        let fileTarget = action.fileRef || action.filePath;
        if (!fileTarget || !fs.existsSync(fileTarget)) {
          fileTarget = await ensureEffectiveResumePdfOnDisk({ candidatePath: fileTarget });
        }
        if (!fileTarget || !fs.existsSync(fileTarget)) {
          result.success = false;
          result.error = `File not found on disk: ${action.fileRef || action.filePath}`;
          break;
        }
        // Handle native input file vs custom trigger button
        const isFileInput = await handle.evaluate(el => el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'file').catch(() => false);
        if (isFileInput) {
          await handle.setInputFiles(fileTarget);
          result.success = true;
        } else {
          // Listen to file chooser event
          const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
          await handle.click().catch(() => {});
          const chooser = await fileChooserPromise;
          if (chooser) {
            await chooser.setFiles(fileTarget);
            result.success = true;
          } else {
            await handle.setInputFiles(fileTarget).catch(() => {});
            result.success = true;
          }
        }
        break;
      }

      case 'scroll': {
        const dir = action.direction;
        if (action.index) {
          await handle.evaluate((el, d) => {
            const amount = d === 'down' ? 400 : (d === 'up' ? -400 : 0);
            el.scrollBy(0, amount);
          }, dir).catch(() => {});
        } else {
          await page.evaluate((d) => {
            const amount = d === 'down' ? window.innerHeight : (d === 'up' ? -window.innerHeight : 0);
            window.scrollBy(0, amount);
          }, dir).catch(() => {});
        }
        result.success = true;
        break;
      }

      case 'sendKeys': {
        await page.keyboard.press(action.keys);
        result.success = true;
        break;
      }

      case 'findText': {
        const found = await page.evaluate((txt) => {
          return window.find(txt, false, false, true, false, true, false);
        }, action.text).catch(() => false);
        result.extractedContent = found;
        result.success = true;
        break;
      }

      case 'searchPage': {
        const text = await page.innerText('body').catch(() => '');
        const regex = new RegExp(action.pattern, 'gi');
        const matches = text.match(regex) || [];
        result.extractedContent = matches;
        result.success = true;
        break;
      }

      case 'findElements': {
        const elementsCount = await page.locator(action.selector).count().catch(() => 0);
        result.extractedContent = { selector: action.selector, count: elementsCount };
        result.success = true;
        break;
      }

      case 'extract': {
        const text = await page.innerText('body').catch(() => '');
        result.extractedContent = text.substring(0, 1000); // capped query extract
        result.success = true;
        break;
      }

      case 'switchTab': {
        const pageSwitched = switchTab(session, action.tabId);
        if (pageSwitched) {
          result.success = true;
        } else {
          result.error = 'ELEMENT_GONE';
        }
        break;
      }

      case 'closeTab': {
        await closeTab(session, action.tabId);
        result.success = true;
        break;
      }

      case 'wait': {
        await page.waitForTimeout(action.seconds * 1000);
        result.success = true;
        break;
      }

      case 'screenshot': {
        result.success = true;
        break;
      }

      case 'askHuman':
      case 'requestReview':
      case 'finish': {
        result.success = true;
        break;
      }

      default: {
        result.error = 'DISABLED';
      }
    }

    // Detect page changed status
    if (page.url() !== currentUrl) {
      result.pageChanged = true;
    }

  } catch (err) {
    await logError('actionsRegistry.executeAction', err.message);
    result.error = 'TIMEOUT';
  }

  return result;
};

export default {
  CHANGES_PAGE_ACTIONS,
  validateAction,
  executeAction
};
