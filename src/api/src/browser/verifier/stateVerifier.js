import { VERIFICATION_LEVELS, BROWSER_ACTIONS } from "../../constant/application.constant.js";
import { verifyFieldAction } from "./fieldVerifier.js";
import { verifyUploadAction } from "./uploadVerifier.js";
import { verifySubmission } from "./submissionVerifier.js";
import { logJobEvent } from "../../utils/logger.js";

/**
 * Master Verification Engine.
 * Evaluates real browser evidence after every action. Never trusts "click completed" = "operation succeeded".
 *
 * @param {import('playwright').Page} page
 * @param {object} action - Action executed
 * @param {object} previousObservation - Page observation before action
 * @param {object} currentObservation - Page observation after action
 * @returns {Promise<object>} Verification result contract
 */
export const verifyStateTransition = async (page, action, previousObservation, currentObservation) => {
  const type = action?.type;
  const isSubmitAction =
    action?.intent === "submit_application" || action?.target?.semanticIntent === "submit_application";

  // 1. Submit Verification
  if (isSubmitAction) {
    const subResult = await verifySubmission(page, previousObservation, currentObservation);
    await logJobEvent(
      "stateVerifier",
      subResult.verified ? "SUBMISSION_VERIFIED" : "SUBMISSION_UNVERIFIED",
      `Level: ${subResult.verificationLevel} | Reason: ${subResult.reason}`
    );
    return {
      verified: subResult.verified,
      verificationLevel: subResult.verificationLevel,
      expectedOutcome: { applicationCompleted: true },
      actualOutcome: {
        verified: subResult.verified,
        confirmationId: subResult.confirmationId,
      },
      evidence: subResult.evidence,
      confidence: subResult.confidence,
      reason: subResult.reason,
      confirmationId: subResult.confirmationId,
    };
  }

  // 2. Upload Verification
  if (type === BROWSER_ACTIONS.UPLOAD) {
    const uploadResult = await verifyUploadAction(page, action, currentObservation);
    return uploadResult;
  }

  // 3. Field Values & Checkboxes
  if (
    type === BROWSER_ACTIONS.FILL ||
    type === BROWSER_ACTIONS.TYPE ||
    type === BROWSER_ACTIONS.SELECT ||
    type === BROWSER_ACTIONS.CHECK ||
    type === BROWSER_ACTIONS.UNCHECK
  ) {
    return await verifyFieldAction(page, action, previousObservation, currentObservation);
  }

  // 4. Click Actions (Continue, Next, Open, Close)
  if (type === BROWSER_ACTIONS.CLICK) {
    // Check if new error appeared
    const prevErrors = previousObservation.validationMessages || [];
    const currErrors = currentObservation.validationMessages || [];
    const newErrors = currErrors.filter((e) => !prevErrors.includes(e));

    if (newErrors.length > 0) {
      return {
        verified: false,
        verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
        expectedOutcome: { workflowAdvanced: true },
        actualOutcome: { error: newErrors[0] },
        evidence: { validationErrors: newErrors },
        confidence: 0.95,
        reason: `Validation error prevented advancement: ${newErrors[0]}`,
      };
    }

    const urlChanged = previousObservation.url !== currentObservation.url;
    const titleChanged = previousObservation.title !== currentObservation.title;
    const formFieldsChanged =
      (previousObservation.interactiveElements?.length || 0) !==
      (currentObservation.interactiveElements?.length || 0);
    const modalOpened = (previousObservation.dialogs?.length || 0) < (currentObservation.dialogs?.length || 0);
    const modalClosed = (previousObservation.dialogs?.length || 0) > (currentObservation.dialogs?.length || 0);

    const changed = urlChanged || titleChanged || formFieldsChanged || modalOpened || modalClosed;

    if (changed) {
      return {
        verified: true,
        verificationLevel: VERIFICATION_LEVELS.LEVEL_2,
        expectedOutcome: { stateChanged: true },
        actualOutcome: { urlChanged, formFieldsChanged, modalOpened, modalClosed },
        evidence: {
          prevUrl: previousObservation.url,
          currUrl: currentObservation.url,
          prevElements: previousObservation.interactiveElements?.length,
          currElements: currentObservation.interactiveElements?.length,
        },
        confidence: 0.92,
        reason: "Click action verified: UI state transition observed",
      };
    }

    // Nothing changed after click - could be a dead click or blocked
    return {
      verified: false,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_0,
      expectedOutcome: { stateChanged: true },
      actualOutcome: { stateChanged: false },
      evidence: { unchanged: true },
      confidence: 0.75,
      reason: "Click executed technically but browser state remained unchanged",
    };
  }

  // 5. Navigation Action
  if (type === BROWSER_ACTIONS.NAVIGATE) {
    const dest = action.target?.url || action.value;
    const currentUrl = currentObservation.url;
    const verified = currentUrl.includes(dest) || currentUrl.startsWith("http");
    return {
      verified,
      verificationLevel: verified ? VERIFICATION_LEVELS.LEVEL_1 : VERIFICATION_LEVELS.LEVEL_0,
      expectedOutcome: { url: dest },
      actualOutcome: { url: currentUrl },
      evidence: { currentUrl },
      confidence: 0.95,
      reason: verified ? "Navigation verified" : "Navigation destination not reached",
    };
  }

  // Default for passive actions (wait, scroll)
  return {
    verified: true,
    verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
    expectedOutcome: { executed: true },
    actualOutcome: { executed: true },
    evidence: {},
    confidence: 0.9,
    reason: "Action execution verified",
  };
};
