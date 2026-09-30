import { FAILURE_TYPES } from "../../constant/application.constant.js";

/**
 * Classifies an action failure or verification failure into a structured failure category.
 *
 * @param {object} actionResult - Result from browser executor
 * @param {object} verificationResult - Result from state verifier
 * @param {object} observation - Current PageObservation
 * @returns {object} Structured failure classification
 */
export const classifyFailure = (actionResult, verificationResult, observation = {}) => {
  const errMsg = (actionResult?.error || verificationResult?.reason || "").toLowerCase();
  const blockers = observation.blockers || {};

  // 1. Human challenges take highest priority
  if (blockers.captcha || errMsg.includes("captcha") || errMsg.includes("turnstile")) {
    return {
      type: FAILURE_TYPES.CAPTCHA_REQUIRED,
      message: "CAPTCHA challenge detected on website",
      retryable: false,
      requiresHuman: true,
      strategy: "pause_for_human",
    };
  }

  if (blockers.otp || errMsg.includes("otp") || errMsg.includes("one-time password")) {
    return {
      type: FAILURE_TYPES.OTP_REQUIRED,
      message: "One-Time Password / SMS verification detected",
      retryable: false,
      requiresHuman: true,
      strategy: "pause_for_human",
    };
  }

  if (blockers.login || errMsg.includes("login") || errMsg.includes("sign in")) {
    return {
      type: FAILURE_TYPES.LOGIN_REQUIRED,
      message: "Authentication / Login gateway encountered",
      retryable: false,
      requiresHuman: true,
      strategy: "pause_for_human",
    };
  }

  // 2. Field validation errors
  if (
    observation.validationMessages?.length > 0 ||
    errMsg.includes("validation error") ||
    errMsg.includes("invalid") ||
    errMsg.includes("required")
  ) {
    return {
      type: FAILURE_TYPES.VALIDATION_ERROR,
      message: observation.validationMessages?.[0] || "Form field validation error detected",
      retryable: true,
      requiresHuman: false,
      strategy: "correct_field_value",
    };
  }

  // 3. Stale DOM / Detached element
  if (errMsg.includes("stale") || errMsg.includes("detached") || errMsg.includes("not attached")) {
    return {
      type: FAILURE_TYPES.STALE_ELEMENT,
      message: "Target element became stale after dynamic DOM update",
      retryable: true,
      requiresHuman: false,
      strategy: "re_observe_and_re_resolve",
    };
  }

  // 4. Target element visibility / presence
  if (errMsg.includes("not visible") || errMsg.includes("hidden")) {
    return {
      type: FAILURE_TYPES.TARGET_NOT_VISIBLE,
      message: "Target element is hidden or outside viewport",
      retryable: true,
      requiresHuman: false,
      strategy: "scroll_and_retry",
    };
  }

  if (errMsg.includes("not found") || errMsg.includes("unable to resolve")) {
    return {
      type: FAILURE_TYPES.TARGET_NOT_FOUND,
      message: "Target element could not be located in active DOM",
      retryable: true,
      requiresHuman: false,
      strategy: "search_semantic_alternatives",
    };
  }

  // 5. Network or navigation timeouts
  if (errMsg.includes("timeout") || errMsg.includes("timed out")) {
    return {
      type: FAILURE_TYPES.NETWORK_TIMEOUT,
      message: "Operation timed out waiting for DOM or network response",
      retryable: true,
      requiresHuman: false,
      strategy: "wait_for_readiness",
    };
  }

  // 6. Generic unverified transition
  return {
    type: FAILURE_TYPES.UNKNOWN_STATE,
    message: verificationResult?.reason || "State transition could not be verified",
    retryable: true,
    requiresHuman: false,
    strategy: "re_observe_and_replan",
  };
};
