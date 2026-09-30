import { classifyFailure, FAILURE_TYPES } from '../browser/recovery/failureClassifier.js';
import { orchestrateRecovery, RECOVERY_ACTIONS } from '../browser/recovery/recoveryManager.js';
import { detectExecutionLoop } from '../browser/recovery/loopDetector.js';
import assert from 'assert';

async function runFailureRecoveryInjectionTests() {
  console.log('--- STARTING CONTROLLED FAILURE RECOVERY INJECTION TESTS ---');

  try {
    const injectionScenarios = [
      { name: 'Target to disappear', err: 'Timeout 5000ms exceeded waiting for selector #submit-btn', expectedType: FAILURE_TYPES.TARGET_NOT_FOUND },
      { name: 'Target to move / detached', err: 'element is detached from document (stale element reference)', expectedType: FAILURE_TYPES.STALE_ELEMENT },
      { name: 'Target disabled', err: 'Required field missing or invalid format', expectedType: FAILURE_TYPES.VALIDATION_ERROR },
      { name: 'DOM re-render', err: 'stale element reference because of DOM re-render', expectedType: FAILURE_TYPES.STALE_ELEMENT },
      { name: 'Duplicate candidates', err: 'strict mode violation: selector resolved to 3 elements', expectedType: FAILURE_TYPES.TARGET_AMBIGUOUS },
      { name: 'Iframe replacement', err: 'Cannot find selector inside frame', expectedType: FAILURE_TYPES.TARGET_NOT_FOUND },
      { name: 'Unexpected modal / CAPTCHA', err: 'CAPTCHA challenge detected on screen', expectedType: FAILURE_TYPES.HUMAN_REQUIRED },
      { name: 'Navigation timeout', err: 'Navigation timeout of 30000ms exceeded (net::ERR_CONNECTION_RESET)', expectedType: FAILURE_TYPES.NAVIGATION_ERROR },
      { name: 'Validation errors', err: 'Form validation failed: please enter valid email', expectedType: FAILURE_TYPES.VALIDATION_ERROR },
      { name: 'Upload failure', err: 'File upload failed: unsupported mime type', expectedType: FAILURE_TYPES.UPLOAD_FAILED },
      { name: 'Form state change', err: 'Stale element reference: element is not attached to the page document', expectedType: FAILURE_TYPES.STALE_ELEMENT },
      { name: 'Wrong-tab activation', context: { expectedPage: 'apply', currentPage: 'dashboard' }, expectedType: FAILURE_TYPES.WRONG_PAGE },
      { name: 'Repeated page state (Loop)', err: 'Execution loop detected: action repeated 3 times', expectedType: FAILURE_TYPES.LOOP_DETECTED },
      { name: 'Submit failure', err: 'Timeout waiting for success confirmation after submit', expectedType: FAILURE_TYPES.TARGET_NOT_FOUND }
    ];

    for (const sc of injectionScenarios) {
      console.log(`Injecting failure: "${sc.name}"...`);
      const classifiedType = classifyFailure(sc.err || '', sc.context || {});
      assert.strictEqual(
        classifiedType,
        sc.expectedType,
        `Scenario "${sc.name}" classified as ${classifiedType}, expected ${sc.expectedType}`
      );

      const recoveryPlan = await orchestrateRecovery(sc.err || 'Failure', sc.context || {});
      assert.ok(recoveryPlan.strategy, `Recovery plan missing strategy for "${sc.name}"`);
      console.log(`✅ Injected failure "${sc.name}" correctly classified as [${classifiedType}] with recovery strategy [${recoveryPlan.strategy}].`);
    }

    // Verify Loop Detector prevents endless retries
    console.log('Verifying Loop Detector prevents endless retries...');
    const actionHistory = ['hash1', 'hash1', 'hash1'];
    const loopResult = detectExecutionLoop(actionHistory, 3);
    assert.strictEqual(loopResult.loopDetected, true);
    console.log('✅ Loop detector correctly identified oscillation and prevented endless retries.');

    console.log('🎉 ALL FAILURE RECOVERY INJECTION TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Failure Recovery Injection Tests Failed:', error);
    process.exit(1);
  }
}

runFailureRecoveryInjectionTests();
