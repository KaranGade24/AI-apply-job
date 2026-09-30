import { detectStateChange } from '../application/pageAnalysis/pageStateDetector.js';

/**
 * Automatic post-action verification.
 * Runs after every browser action — this is a system guarantee, not AI-requested.
 *
 * Compares pre-action and post-action normalized page states to determine
 * whether the action had the desired effect.
 *
 * @param {object} previousNormalized - Normalized state before the action
 * @param {object} currentNormalized - Normalized state after the action
 * @returns {object} Verification result
 */
export const verifyActionResult = (previousNormalized, currentNormalized) => {
  const stateChange = detectStateChange(previousNormalized, currentNormalized);

  return {
    success: stateChange.pageChanged || stateChange.successDetected,
    pageChanged: stateChange.pageChanged,
    urlChanged: stateChange.urlChanged,
    modalOpened: stateChange.modalOpened,
    modalClosed: stateChange.modalClosed,
    formAppeared: stateChange.formAppeared,
    errorDetected: stateChange.errorAppeared,
    errorMessage: stateChange.errorMessage,
    successDetected: stateChange.successDetected,
    stepAdvanced: stateChange.stepAdvanced,
    newUrl: stateChange.newUrl,
  };
};
