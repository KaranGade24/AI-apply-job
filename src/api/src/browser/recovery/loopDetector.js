import crypto from 'crypto';
import { logJobEvent } from '../../utils/logger.js';

/**
 * Computes a high-fidelity composite state hash for loop detection.
 * Considers page fingerprint, action details, result, and application state.
 *
 * @param {object} params
 * @param {string} params.pageFingerprint
 * @param {object} params.action - e.g. { type, target, value }
 * @param {object} params.result - e.g. { success, error }
 * @param {object} params.applicationState - e.g. { currentStep, totalSteps }
 * @returns {string} SHA-256 state-action fingerprint
 */
export const computeCompositeActionHash = ({ pageFingerprint, action = {}, result = {}, applicationState = {} }) => {
  const payload = {
    fingerprint: pageFingerprint || '',
    actionType: action.type || '',
    actionTarget: action.target ? JSON.stringify(action.target) : '',
    actionValue: action.value ? String(action.value) : '',
    resultSuccess: result.success === true,
    step: applicationState.currentStep || 1
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
};

/**
 * Checks if the agent is stuck in an execution loop or oscillation.
 *
 * @param {Array<object>} actionHistory - History of computed composite hashes
 * @param {number} [maxRepetitions=3] - Max identical actions allowed
 * @returns {{ loopDetected: boolean, reason: string }}
 */
export const detectExecutionLoop = (actionHistory = [], maxRepetitions = 3) => {
  if (actionHistory.length < 2) {
    return { loopDetected: false, reason: '' };
  }

  // Count repetitions of the very last action
  const lastHash = actionHistory[actionHistory.length - 1];
  let repetitions = 0;
  for (let i = actionHistory.length - 1; i >= 0; i--) {
    if (actionHistory[i] === lastHash) {
      repetitions++;
    } else {
      break;
    }
  }

  if (repetitions >= maxRepetitions) {
    return {
      loopDetected: true,
      reason: `Action repetition loop: Composite action hash [${lastHash}] repeated ${repetitions} times.`
    };
  }

  // Detect Oscillation Pattern (e.g., A -> B -> A -> B -> A -> B)
  if (actionHistory.length >= 6) {
    const last6 = actionHistory.slice(-6);
    if (
      last6[0] === last6[2] && last6[2] === last6[4] &&
      last6[1] === last6[3] && last6[3] === last6[5] &&
      last6[0] !== last6[1]
    ) {
      return {
        loopDetected: true,
        reason: `Oscillation loop detected between composite action hashes [${last6[0]}] and [${last6[1]}].`
      };
    }
  }

  return { loopDetected: false, reason: '' };
};
