/**
 * Recovery and replanning utilities for the agent loop.
 */

/**
 * Returns a replan nudge message based on consecutive failures.
 * @param {number} consecutiveFailures
 * @returns {string|null} Replan nudge or null
 */
export const getRecoveryNudge = (consecutiveFailures) => {
  if (consecutiveFailures === 3) {
    return 'Replan Nudge: Your last 3 consecutive actions failed. Please take a different approach, re-read the page options, and update your goal.';
  }
  if (consecutiveFailures === 5) {
    return 'Final Recovery: Maximum consecutive failure threshold reached. Initiating final state transition.';
  }
  return null;
};

export default {
  getRecoveryNudge
};
