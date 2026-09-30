import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Hard Security Gate for Form Submissions.
 * Enforces 17 mandatory conditions before any final submission can occur.
 * LLMs cannot override or bypass this guard.
 */
export class SubmissionGuard {
  /**
   * Evaluates all 17 mandatory security conditions for submission.
   *
   * @param {object} context - Full security evaluation context
   * @returns {{ allowed: boolean, failedConditions: Array<string> }}
   */
  static evaluateSubmissionGate(context = {}) {
    const failedConditions = [];

    // Condition 1: current application state is PRE_SUBMISSION_REVIEW
    if (context.applicationState !== 'PRE_SUBMISSION_REVIEW' && context.applicationState !== 'WAITING_FOR_FINAL_REVIEW') {
      failedConditions.push('Application state is not PRE_SUBMISSION_REVIEW');
    }

    // Condition 2: final form validation passed
    if (context.formValidationPassed !== true) {
      failedConditions.push('Final form validation has not passed');
    }

    // Condition 3: all required fields are verified
    if (context.allRequiredFieldsVerified !== true) {
      failedConditions.push('Not all required fields are verified');
    }

    // Condition 4: unresolved questions = 0
    if ((context.unresolvedQuestionsCount || 0) > 0) {
      failedConditions.push(`Unresolved questionnaire questions exist (${context.unresolvedQuestionsCount})`);
    }

    // Condition 5: critical/sensitive questions are resolved
    if (context.criticalQuestionsResolved !== true) {
      failedConditions.push('Critical or sensitive questions remain unresolved');
    }

    // Condition 6: user explicitly confirmed
    if (context.userExplicitlyConfirmed !== true) {
      failedConditions.push('User explicit confirmation is missing');
    }

    // Condition 7: review snapshot matches current browser state
    if (context.reviewSnapshotMatchesBrowser !== true) {
      failedConditions.push('Review snapshot does not match current browser state (form drift detected)');
    }

    // Condition 8: submit target is uniquely resolved
    if (context.submitTargetUniquelyResolved !== true) {
      failedConditions.push('Submit target element is not uniquely resolved');
    }

    // Condition 9: submit target matches reviewed target
    if (context.submitTargetMatchesReviewed !== true) {
      failedConditions.push('Submit target does not match the originally reviewed target');
    }

    // Condition 10: no CAPTCHA blocker
    if (context.noCaptchaBlocker !== true) {
      failedConditions.push('CAPTCHA blocker detected');
    }

    // Condition 11: no OTP blocker
    if (context.noOtpBlocker !== true) {
      failedConditions.push('OTP verification blocker detected');
    }

    // Condition 12: no MFA blocker
    if (context.noMfaBlocker !== true) {
      failedConditions.push('MFA verification blocker detected');
    }

    // Condition 13: no unexpected navigation
    if (context.noUnexpectedNavigation !== true) {
      failedConditions.push('Unexpected page navigation detected post-review');
    }

    // Condition 14: no active validation errors
    if (context.noActiveValidationErrors !== true) {
      failedConditions.push('Active form validation error alerts present on page');
    }

    // Condition 15: no unresolved recovery state
    if (context.noUnresolvedRecoveryState !== true) {
      failedConditions.push('Unresolved failure recovery state active');
    }

    // Condition 16: browser observation is current
    if (context.browserObservationCurrent !== true) {
      failedConditions.push('Browser observation is stale or unverified');
    }

    // Condition 17: application has not already been submitted
    if (context.alreadySubmitted === true) {
      failedConditions.push('Application has already been submitted');
    }

    const allowed = failedConditions.length === 0;

    if (!allowed) {
      logJobEvent(
        'SubmissionGuard',
        'SUBMISSION_REJECTED',
        `SECURITY GATE LOCKED: Submission blocked due to ${failedConditions.length} failed condition(s): ${failedConditions.join('; ')}`
      ).catch(() => {});
    } else {
      logJobEvent(
        'SubmissionGuard',
        'SUBMISSION_APPROVED',
        'SECURITY GATE PASSED: All 17 mandatory submission conditions verified successfully.'
      ).catch(() => {});
    }

    return {
      allowed,
      failedConditions
    };
  }
}

export default SubmissionGuard;
