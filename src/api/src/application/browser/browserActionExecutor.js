import { FORM_ACTIONS } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Executes a sequence of structured browser actions deterministically on a Playwright page
 * @param {import('playwright').Page} page
 * @param {Array<object>} actions - List of { fieldId, action, value }
 * @param {object} [options]
 * @param {string} [options.resumePdfPath] - Local path to PDF resume file for upload
 * @returns {Promise<{ success: boolean, executedCount: number, errors: Array<string> }>}
 */
export const executeBrowserActions = async (page, actions = [], options = {}) => {
  const errors = [];
  let executedCount = 0;

  for (const item of actions) {
    const { fieldId, action, value } = item;

    try {
      await logJobEvent(
        'browserActionExecutor',
        'EXECUTE',
        `Executing action: ${action} on ${fieldId} with value: "${String(value || '').slice(0, 30)}"`
      );

      const locator = page.locator(fieldId).first();

      switch (action) {
        case FORM_ACTIONS.FILL: {
          const strVal = String(value ?? '');
          await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await locator.fill(strVal);
          executedCount++;
          break;
        }

        case FORM_ACTIONS.SELECT: {
          const strVal = String(value ?? '');
          await locator.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
          await locator.selectOption({ label: strVal }).catch(async () => {
            await locator.selectOption({ value: strVal }).catch(async () => {
              await locator.selectOption(strVal);
            });
          });
          executedCount++;
          break;
        }

        case FORM_ACTIONS.CHECK: {
          await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await locator.check().catch(async () => {
            await locator.click();
          });
          executedCount++;
          break;
        }

        case FORM_ACTIONS.UNCHECK: {
          await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await locator.uncheck().catch(() => {});
          executedCount++;
          break;
        }

        case FORM_ACTIONS.UPLOAD: {
          const filePath = value || options.resumePdfPath;
          if (filePath) {
            await locator.setInputFiles(filePath);
            executedCount++;
          }
          break;
        }

        case FORM_ACTIONS.CLICK: {
          await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await locator.click();
          executedCount++;
          break;
        }

        case FORM_ACTIONS.WAIT: {
          const ms = typeof value === 'number' ? value : 1000;
          await page.waitForTimeout(ms);
          executedCount++;
          break;
        }

        default:
          await logError('browserActionExecutor', `Unknown action: ${action}`);
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
    errors,
  };
};
