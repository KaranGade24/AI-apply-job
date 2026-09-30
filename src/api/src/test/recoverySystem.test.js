import { classifyFailure, FAILURE_TYPES } from '../browser/recovery/failureClassifier.js';
import { orchestrateRecovery, RECOVERY_ACTIONS } from '../browser/recovery/recoveryManager.js';
import { computeCompositeActionHash, detectExecutionLoop } from '../browser/recovery/loopDetector.js';
import assert from 'assert';

async function runRecoveryTests() {
  console.log('--- STARTING HIGH-RELIABILITY RECOVERY SYSTEM TESTS ---');

  try {
    // 1. Failure Classification tests
    console.log('Test 1: Classifying raw browser errors into clean canonical formats...');
    
    const err1 = new Error('Timeout error waiting for selector "#submit-btn" to appear');
    const type1 = classifyFailure(err1);
    assert.strictEqual(type1, FAILURE_TYPES.TARGET_NOT_FOUND);

    const err2 = new Error('strict mode violation: selector "button" matches 4 elements');
    const type2 = classifyFailure(err2);
    assert.strictEqual(type2, FAILURE_TYPES.TARGET_AMBIGUOUS);

    const err3 = new Error('CAPTCHA challenge verification wall detected');
    const type3 = classifyFailure(err3);
    assert.strictEqual(type3, FAILURE_TYPES.HUMAN_REQUIRED);

    console.log('✅ Test 1 Passed.');

    // 2. Recovery Orchestration Strategy mapping
    console.log('Test 2: Formulating clean, safe recovery paths...');
    
    const rec1 = await orchestrateRecovery('CAPTCHA wall detected', {});
    assert.strictEqual(rec1.strategy, RECOVERY_ACTIONS.ASK_HUMAN);

    const rec2 = await orchestrateRecovery('Timeout waiting for selector', {});
    assert.strictEqual(rec2.strategy, RECOVERY_ACTIONS.RE_OBSERVE);

    console.log('✅ Test 2 Passed.');

    // 3. Execution oscillation loop detection
    console.log('Test 3: Detecting oscillations and identical repetitions...');
    
    // Identical sequence repetitions (A, A, A)
    const history1 = ['hashA', 'hashA', 'hashA'];
    const loop1 = detectExecutionLoop(history1, 3);
    assert.strictEqual(loop1.loopDetected, true);
    assert.ok(loop1.reason.includes('Action repetition loop'));

    // Oscillation loop patterns (A, B, A, B, A, B)
    const history2 = ['hashA', 'hashB', 'hashA', 'hashB', 'hashA', 'hashB'];
    const loop2 = detectExecutionLoop(history2);
    assert.strictEqual(loop2.loopDetected, true);
    assert.ok(loop2.reason.includes('Oscillation loop detected'));

    // Non loop sequence
    const history3 = ['hashA', 'hashB', 'hashC', 'hashA', 'hashD'];
    const loop3 = detectExecutionLoop(history3);
    assert.strictEqual(loop3.loopDetected, false);

    console.log('✅ Test 3 Passed.');

    console.log('🎉 ALL RECOVERY SYSTEM TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Recovery System Tests Failed:', error);
    process.exit(1);
  }
}

runRecoveryTests();
