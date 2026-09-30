import { browserActionPlanSchema, browserActionItemSchema } from '../agent/schema/browserActionSchema.js';
import { BROWSER_ACTIONS } from '../constant/application.constant.js';
import { logError } from '../utils/logger.js';

/**
 * Validates a single browser action against the BROWSER_ACTIONS vocabulary and field requirements.
 *
 * @param {object} action - { type, target, value, expectedOutcome, riskLevel }
 * @returns {{ valid: boolean, error?: string, sanitizedAction?: object }}
 */
export const validateSingleBrowserAction = (action) => {
  try {
    const parsed = browserActionItemSchema.parse(action);
    return { valid: true, sanitizedAction: parsed };
  } catch (error) {
    return { valid: false, error: error.message };
  }
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
