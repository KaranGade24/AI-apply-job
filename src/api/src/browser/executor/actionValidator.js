import { browserActionItemSchema } from '../../agent/schema/browserActionSchema.js';
import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { computeElementFingerprint } from '../observer/domObserver.js';

/**
 * Deterministically validates an action against the current page observation and execution context
 * without interacting with the live browser context.
 *
 * @param {object} action - The proposed action to validate
 * @param {object} pageObservation - The current page observation (from browserObserver)
 * @param {object} [executionContext] - Context containing executionHistory, retryBudget, humanConfirmed state, etc.
 * @returns {object} { valid: boolean, reasons: Array<string>, warnings: Array<string>, riskLevel: string, normalizedAction: object|null }
 */
export function validateAction(action, pageObservation, executionContext = {}) {
  const reasons = [];
  const warnings = [];
  let valid = true;
  let normalizedAction = null;

  const history = executionContext.history || [];
  const retryBudget = executionContext.retryBudget ?? 3;
  const humanConfirmed = executionContext.humanConfirmed ?? false;

  // 1. Validate Action Schema & Type
  try {
    normalizedAction = browserActionItemSchema.parse(action);
  } catch (error) {
    return {
      valid: false,
      reasons: [`Schema validation failed: ${error.message}`],
      warnings: [],
      riskLevel: action?.riskLevel || 'LOW',
      normalizedAction: null
    };
  }

  const { type, target, value, expectedOutcome, riskLevel, requiresHumanConfirmation, observationRevision } = normalizedAction;

  // 2. Validate Expected Outcome Requirement
  const isPassive = [BROWSER_ACTIONS.WAIT, BROWSER_ACTIONS.SCROLL].includes(type);
  if (!isPassive && (!expectedOutcome || expectedOutcome.trim() === '')) {
    valid = false;
    reasons.push('Active actions must specify an expectedOutcome');
  }

  // 3. Check Observation Revision Stability
  if (observationRevision && pageObservation && pageObservation.pageRevision) {
    if (observationRevision !== pageObservation.pageRevision) {
      valid = false;
      reasons.push(`Action is stale. Action observation revision (${observationRevision}) does not match current page revision (${pageObservation.pageRevision})`);
    }
  }

  // Find matches in the current page observation
  let matchedElements = [];
  if (pageObservation && pageObservation.interactiveElements) {
    matchedElements = pageObservation.interactiveElements.filter((el) => {
      // Fingerprint match is strongest
      if (target?.elementFingerprint && el.elementFingerprint === target.elementFingerprint) {
        return true;
      }
      // ID match
      if (target?.elementId && el.elementId === target.elementId) {
        return true;
      }
      if (target?.id && el.id === target.id) {
        return true;
      }
      // Structural or selector fallbacks
      if (target?.selector && el.ancestryPath && el.ancestryPath === target.selector) {
        return true;
      }
      return false;
    });
  }

  const isNavigation = type === BROWSER_ACTIONS.NAVIGATE;
  const isGoBack = type === BROWSER_ACTIONS.GO_BACK;
  const requiresTarget = !isNavigation && !isGoBack && ![BROWSER_ACTIONS.WAIT, BROWSER_ACTIONS.SCROLL].includes(type);

  let targetElement = null;

  if (requiresTarget) {
    // 4. Target Existence & Uniqueness
    if (matchedElements.length === 0) {
      valid = false;
      reasons.push('Target element not found in current page observation');
    } else if (matchedElements.length > 1) {
      valid = false;
      reasons.push(`Target is ambiguous. Found ${matchedElements.length} matching elements`);
    } else {
      targetElement = matchedElements[0];

      // 5. Target Visibility
      if (targetElement.visible === false) {
        valid = false;
        reasons.push('Target element is present but currently hidden/invisible');
      }

      // 6. Target Enabled State
      if (targetElement.enabled === false) {
        valid = false;
        reasons.push('Target element is disabled and cannot be interacted with');
      }

      // 7. Frame Context
      if (target?.frameId && targetElement.frameId !== target.frameId) {
        valid = false;
        reasons.push(`Target element frame context mismatch. Expected: "${target.frameId}", Actual: "${targetElement.frameId}"`);
      }

      // 8. Semantic Compatibility
      if (type === BROWSER_ACTIONS.FILL || type === BROWSER_ACTIONS.TYPE) {
        const fillableTags = ['input', 'textarea', 'select'];
        const isRoleInput = targetElement.role === 'textbox' || targetElement.role === 'searchbox';
        if (!fillableTags.includes(targetElement.tagName) && !isRoleInput) {
          warnings.push(`Target element tag "${targetElement.tagName}" is unusual for a ${type} action`);
        }

        // Semantic field safety check for emails
        const isEmailAction = (target?.text && target.text.toLowerCase().includes('email')) || 
                              (target?.id && target.id.toLowerCase().includes('email')) || 
                              (target?.name && target.name.toLowerCase().includes('email'));
        const isEmailElement = (targetElement.id && targetElement.id.toLowerCase().includes('email')) || 
                               (targetElement.name && targetElement.name.toLowerCase().includes('email')) || 
                               (targetElement.labelText && targetElement.labelText.toLowerCase().includes('email'));
        if (isEmailAction && !isEmailElement) {
          valid = false;
          reasons.push('Target element is not confidently an email field');
        }
      }

      if (type === BROWSER_ACTIONS.SELECT && targetElement.tagName !== 'select') {
        valid = false;
        reasons.push(`SELECT action is incompatible with element tag "${targetElement.tagName}"`);
      }
    }
  }

  // 9. Required Values for specific types
  if ([BROWSER_ACTIONS.FILL, BROWSER_ACTIONS.TYPE, BROWSER_ACTIONS.SELECT].includes(type)) {
    if (value === undefined || value === null || String(value).trim() === '') {
      valid = false;
      reasons.push(`Action type ${type} requires a non-empty value`);
    }
  }

  // 10. Application State Constraints & Pre-Submit Gates
  if (type === BROWSER_ACTIONS.CLICK && targetElement) {
    const isSubmitIntent = normalizedAction.intent === 'submit_application' || 
                           targetElement.type === 'submit' || 
                           (targetElement.id && targetElement.id.toLowerCase().includes('submit')) || 
                           (targetElement.normalizedText && targetElement.normalizedText.toLowerCase().includes('submit application'));
    if (isSubmitIntent) {
      const appReady = executionContext.applicationState?.readyToSubmit === true;
      if (!appReady) {
        valid = false;
        reasons.push('SUBMIT intent blocked: Application is not explicitly in the correct pre-submit validated state');
      }
    }
  }

  // 11. Loop Risk & Retry Budget
  const actionTargetKey = target ? JSON.stringify(target) : 'no_target';
  const recentAttempts = history.filter(h => h.type === type && JSON.stringify(h.target) === actionTargetKey);
  if (recentAttempts.length >= retryBudget) {
    valid = false;
    reasons.push(`Action retry budget exceeded. Attempted this action ${recentAttempts.length} times recently without state transition`);
  }

  // Look for repeating cycles in history (Loop Risk)
  if (history.length >= 4) {
    const lastFour = history.slice(-4);
    const loopDetected = lastFour[0].type === lastFour[2].type && 
                         lastFour[1].type === lastFour[3].type && 
                         JSON.stringify(lastFour[0].target) === JSON.stringify(lastFour[2].target) &&
                         JSON.stringify(lastFour[1].target) === JSON.stringify(lastFour[3].target);
    if (loopDetected) {
      valid = false;
      reasons.push('Loop detected: Repeating dual-action cycle in recent history');
    }
  }

  // 12. Human Confirmation Requirement
  const isHighRisk = ['HIGH', 'CRITICAL'].includes(riskLevel) || requiresHumanConfirmation;
  if (isHighRisk && !humanConfirmed) {
    valid = false;
    reasons.push(`Action of risk level ${riskLevel} requires explicit human confirmation`);
  }

  return {
    valid,
    reasons,
    warnings,
    riskLevel,
    normalizedAction
  };
}
