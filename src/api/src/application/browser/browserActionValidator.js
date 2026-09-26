import { browserActionPlanSchema } from '../../agent/schema/browserActionSchema.js';
import { logError } from '../../utils/logger.js';

/**
 * Validates a browser action plan before execution
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
