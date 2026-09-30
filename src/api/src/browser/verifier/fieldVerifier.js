import { VERIFICATION_LEVELS } from "../../constant/application.constant.js";

/**
 * Verifies that a field action (fill, type, select, check) had the intended effect on the DOM
 *
 * @param {import('playwright').Page} page
 * @param {object} action
 * @param {object} previousObservation
 * @param {object} currentObservation
 * @returns {Promise<object>}
 */
export const verifyFieldAction = async (page, action, previousObservation, currentObservation) => {
  const target = action.target || {};
  const expectedValue = action.value;

  try {
    // 1. Check for newly introduced validation errors on the page
    const prevErrors = previousObservation.validationMessages || [];
    const currErrors = currentObservation.validationMessages || [];
    const newErrors = currErrors.filter((e) => !prevErrors.includes(e));

    if (newErrors.length > 0) {
      return {
        verified: false,
        verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
        expectedOutcome: { value: expectedValue },
        actualOutcome: { validationError: newErrors[0] },
        evidence: { newErrors },
        confidence: 0.95,
        reason: `Validation error appeared after action: ${newErrors[0]}`,
      };
    }

    // 2. Check value verification if input/textarea/select
    if (action.type === "fill" || action.type === "type" || action.type === "select") {
      let actualValue = null;

      // Match element in current observation
      const matchedEl = (currentObservation.interactiveElements || []).find(
        (e) => (target.elementId && e.elementId === target.elementId) || (target.id && e.id === target.id) || (target.name && e.name === target.name)
      );

      if (matchedEl && matchedEl.value !== null && matchedEl.value !== undefined) {
        actualValue = matchedEl.value;
      }

      const expectedStr = String(expectedValue ?? "").trim().toLowerCase();
      const actualStr = String(actualValue ?? "").trim().toLowerCase();

      const matches = actualStr.includes(expectedStr) || expectedStr.includes(actualStr);

      if (matches || (action.type === "select" && actualValue !== null)) {
        return {
          verified: true,
          verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
          expectedOutcome: { value: expectedValue },
          actualOutcome: { value: actualValue },
          evidence: { elementMatched: true, valueMatches: matches },
          confidence: 0.98,
          reason: `Field value verified (${actualValue})`,
        };
      }

      return {
        verified: false,
        verificationLevel: VERIFICATION_LEVELS.LEVEL_0,
        expectedOutcome: { value: expectedValue },
        actualOutcome: { value: actualValue },
        evidence: { elementMatched: !!matchedEl, actualValue },
        confidence: 0.8,
        reason: `Field value mismatch: expected "${expectedValue}" but found "${actualValue}"`,
      };
    }

    // 3. Checkbox / Radio toggle verification
    if (action.type === "check" || action.type === "uncheck") {
      const expectedChecked = action.type === "check";
      const matchedEl = (currentObservation.interactiveElements || []).find(
        (e) => (target.elementId && e.elementId === target.elementId) || (target.id && e.id === target.id)
      );

      const actualChecked = matchedEl ? matchedEl.checked : null;
      if (actualChecked === expectedChecked) {
        return {
          verified: true,
          verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
          expectedOutcome: { checked: expectedChecked },
          actualOutcome: { checked: actualChecked },
          evidence: { elementMatched: true, checked: actualChecked },
          confidence: 0.99,
          reason: `Checkbox state verified (${actualChecked})`,
        };
      }
    }

    return {
      verified: true,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
      expectedOutcome: { actionExecuted: true },
      actualOutcome: { actionExecuted: true },
      evidence: {},
      confidence: 0.85,
      reason: "Action executed without error",
    };
  } catch (error) {
    return {
      verified: false,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_0,
      expectedOutcome: { value: expectedValue },
      actualOutcome: { error: error.message },
      evidence: {},
      confidence: 0.5,
      reason: `Verification check failed: ${error.message}`,
    };
  }
};
