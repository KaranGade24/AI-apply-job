import { detectStateChange } from "../../application/pageAnalysis/pageStateDetector.js";

export const evaluateActionResult = ({
  beforeObservation = {},
  afterObservation = {},
  executionResult = {},
} = {}) => {
  if (!executionResult.ok) {
    return {
      success: false,
      pageChanged: false,
      error: executionResult.error || "Action failed.",
    };
  }

  const stateChange = detectStateChange(beforeObservation, afterObservation);
  return {
    success: true,
    pageChanged: stateChange.pageChanged,
    urlChanged: stateChange.urlChanged,
    modalOpened: stateChange.modalOpened,
    modalClosed: stateChange.modalClosed,
    validationError: stateChange.errorAppeared,
    successDetected: stateChange.successDetected,
    message: stateChange.pageChanged
      ? "Browser state changed."
      : "Action completed without a detected state change.",
  };
};

export default evaluateActionResult;
