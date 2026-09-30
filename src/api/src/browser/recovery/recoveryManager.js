import { FAILURE_TYPES, classifyFailure } from './failureClassifier.js';
import { logJobEvent } from '../../utils/logger.js';

export const RECOVERY_ACTIONS = {
  RE_OBSERVE: 'RE_OBSERVE',
  RE_PLAN: 'RE_PLAN',
  BACKTRACK: 'BACKTRACK',
  ASK_HUMAN: 'ASK_HUMAN',
  FAIL_IMMEDIATELY: 'FAIL_IMMEDIATELY'
};

/**
 * Handles browser failures, classifies the error, and formulates a precise, safe recovery strategy.
 *
 * @param {Error|string} error - Triggering error or mismatch
 * @param {object} context - Execution context (page, agentState, previousAction, currentUrl, etc.)
 * @returns {Promise<{ failureType: string, strategy: string, recommendation: string }>}
 */
export const orchestrateRecovery = async (error, context = {}) => {
  const failureType = classifyFailure(error, context);

  await logJobEvent(
    'recoveryManager',
    'CLASSIFIED',
    `Failure encountered: ${failureType} | Error: ${error?.message || error}`
  );

  let strategy = RECOVERY_ACTIONS.RE_OBSERVE;
  let recommendation = 'Re-observe page and locate alternate selectors.';

  switch (failureType) {
    case FAILURE_TYPES.TARGET_NOT_FOUND:
    case FAILURE_TYPES.STALE_ELEMENT:
      // Try refreshing page state representation
      strategy = RECOVERY_ACTIONS.RE_OBSERVE;
      recommendation = 'Page layout updated or target detached. Initiating page re-observation.';
      break;

    case FAILURE_TYPES.TARGET_AMBIGUOUS:
      strategy = RECOVERY_ACTIONS.ASK_HUMAN;
      recommendation = 'Multiple matching elements found. Halting to avoid incorrect clicks.';
      break;

    case FAILURE_TYPES.VALIDATION_ERROR:
      strategy = RECOVERY_ACTIONS.ASK_HUMAN;
      recommendation = 'Form submission validation failed. Halting for user validation correction.';
      break;

    case FAILURE_TYPES.NAVIGATION_ERROR:
      strategy = RECOVERY_ACTIONS.BACKTRACK;
      recommendation = 'Navigation failed or timed out. Attempting to backtrack or refresh.';
      break;

    case FAILURE_TYPES.LOOP_DETECTED:
      strategy = RECOVERY_ACTIONS.ASK_HUMAN;
      recommendation = 'Execution loop or state oscillation detected. Halting for safety.';
      break;

    case FAILURE_TYPES.HUMAN_REQUIRED:
      strategy = RECOVERY_ACTIONS.ASK_HUMAN;
      recommendation = 'CAPTCHA, MFA, or Security Verification encountered. Human intervention required.';
      break;

    case FAILURE_TYPES.WRONG_PAGE:
      strategy = RECOVERY_ACTIONS.BACKTRACK;
      recommendation = 'Browser navigated off the expected application route. Backtracking.';
      break;

    default:
      strategy = RECOVERY_ACTIONS.FAIL_IMMEDIATELY;
      recommendation = 'Unknown fatal error encountered. Aborting application run.';
      break;
  }

  await logJobEvent(
    'recoveryManager',
    'RECOVERY_STRATEGY',
    `Formulated Strategy: ${strategy} | Recommendation: ${recommendation}`
  );

  return {
    failureType,
    strategy,
    recommendation
  };
};
