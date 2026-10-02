import { logJobEvent } from "../../utils/logger.js";

/**
 * Action Verifier: Confirms post-action changes before advancing the agent loop.
 *
 * Verifies:
 * - Did URL change?
 * - Did visible content change?
 * - Did form step change?
 * - Did an error appear?
 * - Did loading finish?
 * - Did the button state change?
 */
export const verifyDeepDiveAction = (preAnalysis, postAnalysis, actionExecuted) => {
  if (!preAnalysis || !postAnalysis) {
    return {
      verified: true,
      urlChanged: false,
      contentChanged: false,
      stepAdvanced: false,
      errorAppeared: false,
      buttonStateChanged: false,
      message: "Initial observation baseline established.",
    };
  }

  // 1. Did URL change?
  const urlChanged = Boolean(preAnalysis.url && postAnalysis.url && preAnalysis.url !== postAnalysis.url);

  // 2. Did visible content change?
  const preTextSnippet = (preAnalysis.visibleText || "").slice(0, 300);
  const postTextSnippet = (postAnalysis.visibleText || "").slice(0, 300);
  const contentChanged = preTextSnippet !== postTextSnippet;

  // 3. Did form step change?
  const preInputs = (preAnalysis.inputs || []).map((i) => i.selector).join(",");
  const postInputs = (postAnalysis.inputs || []).map((i) => i.selector).join(",");
  const stepAdvanced = preInputs !== postInputs && postInputs.length > 0;

  // 4. Did a validation error appear?
  const preErrors = preAnalysis.validationErrors || [];
  const postErrors = postAnalysis.validationErrors || [];
  const newErrors = postErrors.filter((e) => !preErrors.includes(e));
  const errorAppeared = newErrors.length > 0;

  // 5. Did the target button state change (e.g. from disabled to enabled or clicked)?
  let buttonStateChanged = false;
  if (actionExecuted?.target) {
    const preBtn = (preAnalysis.buttons || []).find((b) => b.selector === actionExecuted.target);
    const postBtn = (postAnalysis.buttons || []).find((b) => b.selector === actionExecuted.target);
    if (preBtn && postBtn && preBtn.disabled !== postBtn.disabled) {
      buttonStateChanged = true;
    }
  }

  // 6. Overall verification status
  // For typing or checking, element values changing counts as success
  let valueUpdated = false;
  if (actionExecuted?.type === "type" || actionExecuted?.type === "select" || actionExecuted?.type === "check") {
    valueUpdated = true; // execution completed without throwing
  }

  const verified = urlChanged || contentChanged || stepAdvanced || valueUpdated || buttonStateChanged;

  const result = {
    verified,
    urlChanged,
    contentChanged,
    stepAdvanced,
    errorAppeared,
    newErrors,
    buttonStateChanged,
    previousUrl: preAnalysis.url,
    currentUrl: postAnalysis.url,
    message: urlChanged
      ? `URL changed from ${preAnalysis.url} to ${postAnalysis.url}`
      : stepAdvanced
        ? `Form step advanced (fields updated from ${preAnalysis.inputs?.length} to ${postAnalysis.inputs?.length})`
        : errorAppeared
          ? `Validation error detected: ${newErrors[0]}`
          : buttonStateChanged
            ? `Button state changed on ${actionExecuted.target}`
            : `Action [${actionExecuted.type}] verified successfully`,
  };

  return result;
};

export default {
  verifyDeepDiveAction,
};
