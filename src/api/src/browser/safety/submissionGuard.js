import { APPLICATION_STATES } from "../../constant/application.constant.js";

/**
 * Enforces the strict Submission Safety Gate.
 * Submit is a protected action requiring explicit user confirmation, clean validation,
 * and zero unresolved questions.
 *
 * @param {object} params
 * @param {string} params.currentState - Current application state
 * @param {boolean} params.submissionConfirmed - User confirmation status
 * @param {Array} params.validationErrors - Any active page validation errors
 * @param {Array} params.unresolvedQuestions - Any remaining unanswered required fields
 * @param {object} params.blockers - Captcha, OTP, Login flags
 * @returns {{ allowed: boolean, blockers: string[] }}
 */
export const evaluateSubmissionSafety = ({
  currentState,
  submissionConfirmed = false,
  validationErrors = [],
  unresolvedQuestions = [],
  blockers = {},
}) => {
  const safetyBlockers = [];

  // 1. Application State must be PRE_SUBMISSION_REVIEW or AWAITING_USER_CONFIRMATION
  if (
    currentState !== APPLICATION_STATES.PRE_SUBMISSION_REVIEW &&
    currentState !== APPLICATION_STATES.AWAITING_USER_CONFIRMATION
  ) {
    safetyBlockers.push(
      `Invalid application state for submission: "${currentState}". Application must reach PRE_SUBMISSION_REVIEW.`
    );
  }

  // 2. User confirmation must be explicitly true
  if (!submissionConfirmed) {
    safetyBlockers.push("Submission requires explicit human confirmation via pre-submission review.");
  }

  // 3. Validation errors must be clean
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    safetyBlockers.push(`Form validation errors are currently present: ${validationErrors.join("; ")}`);
  }

  // 4. No unresolved required questions
  if (Array.isArray(unresolvedQuestions) && unresolvedQuestions.length > 0) {
    safetyBlockers.push(
      `There are ${unresolvedQuestions.length} unresolved questions requiring clarification before submission.`
    );
  }

  // 5. No security blockers active
  if (blockers.captcha) {
    safetyBlockers.push("CAPTCHA challenge is active on the page.");
  }
  if (blockers.otp) {
    safetyBlockers.push("One-time password / MFA prompt is active.");
  }
  if (blockers.login) {
    safetyBlockers.push("Login / authentication is required.");
  }

  return {
    allowed: safetyBlockers.length === 0,
    blockers: safetyBlockers,
  };
};
