import { browserActionPlanSchema } from '../../agent/schema/browserActionSchema.js';
import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { logError } from '../../utils/logger.js';

/**
 * Validates a single browser action against the BROWSER_ACTIONS vocabulary and field requirements.
 *
 * @param {object} action - { type, target, value }
 * @returns {{ valid: boolean, error?: string, sanitizedAction?: object }}
 */
export const validateSingleBrowserAction = (action) => {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'Action must be an object' };
  }

  const validTypes = Object.values(BROWSER_ACTIONS);
  if (!validTypes.includes(action.type)) {
    return {
      valid: false,
      error: `Invalid action type: "${action.type}". Must be one of: ${validTypes.join(', ')}`,
    };
  }

  // Type-specific field validations
  switch (action.type) {
    case BROWSER_ACTIONS.NAVIGATE: {
      const url = action.target?.url || action.target?.href || action.value;
      if (!url || typeof url !== 'string') {
        return { valid: false, error: 'NAVIGATE action requires target.url or value string.' };
      }
      break;
    }

    case BROWSER_ACTIONS.CLICK:
    case BROWSER_ACTIONS.FILL:
    case BROWSER_ACTIONS.TYPE:
    case BROWSER_ACTIONS.SELECT:
    case BROWSER_ACTIONS.CHECK:
    case BROWSER_ACTIONS.UNCHECK:
    case BROWSER_ACTIONS.UPLOAD: {
      const hasSelector = action.target?.selector || action.target?.id || action.target?.text;
      if (!hasSelector) {
        return {
          valid: false,
          error: `Action "${action.type}" requires a target selector, id, or text label.`,
        };
      }
      break;
    }

    default:
      break;
  }

  return { valid: true, sanitizedAction: action };
};

/**
 * Validates a legacy browser action plan before execution
 * @param {object} actionPlan
 * @returns {{ valid: boolean, error?: string, sanitizedPlan?: object }}
 */
export const validateBrowserActionPlan = (actionPlan) => {
  try {
    const parsed = browserActionPlanSchema.parse(actionPlan);
    return { valid: true, sanitizedPlan: parsed };
  } catch (error) {
    logError('browserActionValidator.validateBrowserActionPlan', error.message);
    return { valid: false, error: error.message };
  }
};
