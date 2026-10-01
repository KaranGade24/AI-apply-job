<<<<<<< HEAD
/**
 * @deprecated Use src/api/src/browser/browserActionExecutor.js instead.
 * Re-export wrapper for backward compatibility.
=======
import { FORM_ACTIONS } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';
import { REGISTRY_INIT_SCRIPT } from '../../browser/dom/elementRegistry.js';
import { executeAction } from '../../browser/actions/actionsRegistry.js';

/**
 * Executes a sequence of structured browser actions on a Playwright page.
 * Refactored to delegate directly to the new safe ACTIONS registry.
 * Keeps public API identical for existing callers.
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} actions - List of { fieldId, action, value }
 * @param {object} [options]
 * @param {string} [options.resumePdfPath] - Local path to PDF resume file for upload
 * @returns {Promise<{ success: boolean, executedCount: number, errors: Array<string> }>}
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
 */
import * as canonical from '../../browser/browserActionExecutor.js';

<<<<<<< HEAD
export const executeSingleBrowserAction = canonical.executeSingleBrowserAction;
export const executeBrowserActions = canonical.executeBrowserActions;
export default canonical.executeSingleBrowserAction;
=======
  // Initialize in-page element registry if not present
  await page.evaluate(REGISTRY_INIT_SCRIPT).catch(() => {});

  for (const item of actions) {
    const { fieldId, action, value } = item;

    try {
      // Find and register element to get the monotonic registry ID
      const index = await page.evaluate((sel) => {
        if (!window.__aijRegistry) return null;
        try {
          const el = document.querySelector(sel);
          return el ? window.__aijRegistry.getOrRegister(el).id : null;
        } catch {
          return null;
        }
      }, fieldId).catch(() => null);

      if (!index && action !== FORM_ACTIONS.WAIT) {
        throw new Error(`Element with selector "${fieldId}" could not be located or registered`);
      }

      // Map legacy FORM_ACTIONS to formal unified Actions
      let formalAction = null;
      switch (action) {
        case FORM_ACTIONS.FILL:
          formalAction = { type: 'input', index, text: String(value ?? '') };
          break;
        case FORM_ACTIONS.SELECT:
          formalAction = { type: 'selectOption', index, option: String(value ?? '') };
          break;
        case FORM_ACTIONS.CHECK:
          formalAction = { type: 'check', index };
          break;
        case FORM_ACTIONS.UNCHECK:
          formalAction = { type: 'uncheck', index };
          break;
        case FORM_ACTIONS.UPLOAD:
          formalAction = { type: 'uploadFile', index, fileRef: value || options.resumePdfPath };
          break;
        case FORM_ACTIONS.CLICK:
          formalAction = { type: 'click', index };
          break;
        case FORM_ACTIONS.WAIT:
          formalAction = { type: 'wait', seconds: Math.max(1, Math.min(10, Math.floor((typeof value === 'number' ? value : 1000) / 1000))) };
          break;
        default:
          throw new Error(`Unsupported legacy action: ${action}`);
      }

      await logJobEvent(
        'browserActionExecutor',
        'EXECUTE_DELEGATED',
        `Delegating legacy action "${action}" on "${fieldId}" to index ${index}`
      );

      // Execute formally via the actions registry
      const execResult = await executeAction(formalAction, page, { tabs: [], dialogs: [] });
      if (execResult.success) {
        executedCount++;
      } else {
        throw new Error(execResult.error || 'Action execution failed');
      }

    } catch (err) {
      const errMsg = `Failed to execute ${action} on ${fieldId}: ${err.message}`;
      await logError('browserActionExecutor.item', errMsg);
      errors.push(errMsg);
    }
  }

  return {
    success: errors.length === 0,
    executedCount,
    errors
  };
};

export default {
  executeBrowserActions
};
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
