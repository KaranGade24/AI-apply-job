import { BROWSER_ACTIONS, APPLICATION_STATES } from "../../constant/application.constant.js";
import { logJobEvent } from "../../utils/logger.js";

/**
 * Validates an action proposed by the planner before browser execution.
 * Checks target existence, visibility, enabled state, current application state compatibility,
 * and high-risk safety requirements.
 *
 * @param {object} action - Proposed action
 * @param {object} context - Validation context
 * @param {object} context.observation - Current PageObservation
 * @param {string} context.currentState - Current application state
 * @param {boolean} [context.submissionConfirmed=false] - User approval for final submit
 * @param {Array} [context.recentActions=[]] - Recent actions for loop check
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export const validateProposedAction = (action, context = {}) => {
  const reasons = [];

  if (!action || typeof action !== "object") {
    return { valid: false, reasons: ["Action must be a valid object"] };
  }

  const validActionTypes = Object.values(BROWSER_ACTIONS);
  if (!validActionTypes.includes(action.type)) {
    reasons.push(`Unknown action type: "${action.type}". Must be one of: ${validActionTypes.join(", ")}`);
  }

  const observation = context.observation || {};
  const currentState = context.currentState || APPLICATION_STATES.INIT;
  const recentActions = context.recentActions || [];

  // 1. Navigation / Global actions
  if (action.type === BROWSER_ACTIONS.NAVIGATE) {
    const url = action.target?.url || action.value;
    if (!url || typeof url !== "string") {
      reasons.push("NAVIGATE action requires target.url or value string");
    }
    return { valid: reasons.length === 0, reasons };
  }

  if (action.type === BROWSER_ACTIONS.WAIT || action.type === BROWSER_ACTIONS.REQUEST_HUMAN || action.type === BROWSER_ACTIONS.FINISH) {
    return { valid: reasons.length === 0, reasons };
  }

  // 2. Target existence in current observation
  const target = action.target || {};
  if (!target || (!target.elementId && !target.selector && !target.id && !target.text && !target.role)) {
    reasons.push(`Action "${action.type}" requires a target locator specification`);
  }

  // If elementId is specified, check against current observation elements
  if (target.elementId && Array.isArray(observation.interactiveElements)) {
    const matchingEl = observation.interactiveElements.find((e) => e.elementId === target.elementId);
    if (!matchingEl) {
      reasons.push(`Target element (${target.elementId}) is not present in the current DOM observation`);
    } else {
      if (!matchingEl.visible) {
        reasons.push(`Target element (${target.elementId}) is not currently visible in viewport`);
      }
      if (!matchingEl.enabled && action.type !== BROWSER_ACTIONS.SCROLL) {
        reasons.push(`Target element (${target.elementId}) is disabled or readonly`);
      }
    }
  }

  // 3. Field semantic compatibility
  if (action.type === BROWSER_ACTIONS.FILL || action.type === BROWSER_ACTIONS.TYPE) {
    if (action.value === undefined || action.value === null) {
      reasons.push(`Action "${action.type}" requires a defined value to enter`);
    }
  }

  if (action.type === BROWSER_ACTIONS.UPLOAD) {
    if (!action.value && !action.filePath) {
      reasons.push("UPLOAD action requires a local file path");
    }
  }

  // 4. Critical submission safety gate
  if (action.intent === "submit_application" || action.target?.semanticIntent === "submit_application") {
    if (currentState !== APPLICATION_STATES.PRE_SUBMISSION_REVIEW) {
      reasons.push(
        `Cannot execute submit when application state is "${currentState}". Must be in PRE_SUBMISSION_REVIEW.`
      );
    }
    if (!context.submissionConfirmed) {
      reasons.push("Final submission requires explicit user confirmation");
    }
    if (observation.validationMessages && observation.validationMessages.length > 0) {
      reasons.push(`Cannot submit while validation errors are active: ${observation.validationMessages.join("; ")}`);
    }
  }

  // 5. Duplicate action loop check
  if (recentActions.length >= 3) {
    const last3 = recentActions.slice(-3);
    const isRepeated = last3.every(
      (a) => a.type === action.type && (a.target?.elementId === target.elementId || a.target?.text === target.text)
    );
    if (isRepeated) {
      reasons.push(`Action (${action.type}) has already failed 3 times consecutively on the same target`);
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
};
