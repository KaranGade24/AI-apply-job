import { SubmissionGuard } from '../browser/safety/submissionGuard.js';
import assert from 'assert';

// Returns a valid context where all 17 conditions are met
const getValidContext = () => ({
  applicationState: 'PRE_SUBMISSION_REVIEW',
  formValidationPassed: true,
  allRequiredFieldsVerified: true,
  unresolvedQuestionsCount: 0,
  criticalQuestionsResolved: true,
  userExplicitlyConfirmed: true,
  reviewSnapshotMatchesBrowser: true,
  submitTargetUniquelyResolved: true,
  submitTargetMatchesReviewed: true,
  noCaptchaBlocker: true,
  noOtpBlocker: true,
  noMfaBlocker: true,
  noUnexpectedNavigation: true,
  noActiveValidationErrors: true,
  noUnresolvedRecoveryState: true,
  browserObservationCurrent: true,
  alreadySubmitted: false
});

async function runSubmissionGuardTests() {
  console.log('--- STARTING 17-CONDITION SUBMISSION GUARD SECURITY TESTS ---');

  try {
    // 1. All conditions pass -> Submission Allowed
    console.log('Test 1: Valid context passes all 17 conditions...');
    const validResult = SubmissionGuard.evaluateSubmissionGate(getValidContext());
    assert.strictEqual(validResult.allowed, true);
    assert.strictEqual(validResult.failedConditions.length, 0);
    console.log('✅ Test 1 Passed.');

    // 2. Test independent blocking for each of the 17 conditions
    const conditionsToTest = [
      { key: 'applicationState', invalidVal: 'IN_PROGRESS', label: '1. Application State' },
      { key: 'formValidationPassed', invalidVal: false, label: '2. Form Validation' },
      { key: 'allRequiredFieldsVerified', invalidVal: false, label: '3. Required Fields Verified' },
      { key: 'unresolvedQuestionsCount', invalidVal: 1, label: '4. Unresolved Questions' },
      { key: 'criticalQuestionsResolved', invalidVal: false, label: '5. Critical Questions Resolved' },
      { key: 'userExplicitlyConfirmed', invalidVal: false, label: '6. User Explicit Confirmation' },
      { key: 'reviewSnapshotMatchesBrowser', invalidVal: false, label: '7. Review Snapshot Match' },
      { key: 'submitTargetUniquelyResolved', invalidVal: false, label: '8. Submit Target Uniquely Resolved' },
      { key: 'submitTargetMatchesReviewed', invalidVal: false, label: '9. Submit Target Match' },
      { key: 'noCaptchaBlocker', invalidVal: false, label: '10. CAPTCHA Blocker' },
      { key: 'noOtpBlocker', invalidVal: false, label: '11. OTP Blocker' },
      { key: 'noMfaBlocker', invalidVal: false, label: '12. MFA Blocker' },
      { key: 'noUnexpectedNavigation', invalidVal: false, label: '13. Unexpected Navigation' },
      { key: 'noActiveValidationErrors', invalidVal: false, label: '14. Active Validation Errors' },
      { key: 'noUnresolvedRecoveryState', invalidVal: false, label: '15. Unresolved Recovery State' },
      { key: 'browserObservationCurrent', invalidVal: false, label: '16. Browser Observation Current' },
      { key: 'alreadySubmitted', invalidVal: true, label: '17. Already Submitted' }
    ];

    for (const cond of conditionsToTest) {
      console.log(`Test: Verifying condition "${cond.label}" independently blocks submission when invalid...`);
      const ctx = getValidContext();
      ctx[cond.key] = cond.invalidVal;

      const result = SubmissionGuard.evaluateSubmissionGate(ctx);
      assert.strictEqual(result.allowed, false, `Condition ${cond.label} failed to block submission!`);
      assert.ok(result.failedConditions.length > 0);
      console.log(`✅ Condition "${cond.label}" successfully blocked submission.`);
    }

    console.log('🎉 ALL 17 SUBMISSION GUARD SECURITY TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Submission Guard Tests Failed:', error);
    process.exit(1);
  }
}

runSubmissionGuardTests();
