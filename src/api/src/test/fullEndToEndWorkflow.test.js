import assert from 'assert';
import applicationGraph from '../agent/graph/applicationGraph.js';
import { SubmissionGuard } from '../browser/safety/submissionGuard.js';
import { verifySubmission, VERIFICATION_STATUS } from '../browser/verifier/submissionVerifier.js';
import { classifyFailure, FAILURE_TYPES } from '../browser/recovery/failureClassifier.js';
import { orchestrateRecovery, RECOVERY_ACTIONS } from '../browser/recovery/recoveryManager.js';

async function runFullEndToEndWorkflowTest() {
  console.log('--- STARTING FULL END-TO-END WORKFLOW INTEGRATION TEST ---');

  try {
    // 1. Verify LangGraph Application Graph compiles and initializes correctly
    console.log('Verifying LangGraph Application Graph setup...');
    assert.ok(applicationGraph, 'applicationGraph should be defined');
    console.log('✅ Application Graph is loaded.');

    // 2. Verify Submission Guard 17 conditions check
    console.log('Verifying Submission Guard 17-condition gate...');
    const invalidGate = SubmissionGuard.evaluateSubmissionGate({ applicationState: 'WRONG_STATE' });
    assert.strictEqual(invalidGate.allowed, false);
    console.log('✅ Submission Guard successfully blocks invalid state.');

    // 3. Verify Failure Classification & Recovery
    console.log('Verifying Failure Classification & Recovery pipeline...');
    const failureType = classifyFailure('Timeout waiting for selector #apply-btn');
    assert.strictEqual(failureType, FAILURE_TYPES.TARGET_NOT_FOUND);
    const recovery = await orchestrateRecovery('Timeout waiting for selector #apply-btn');
    assert.strictEqual(recovery.strategy, RECOVERY_ACTIONS.RE_OBSERVE);
    console.log('✅ Failure classification and recovery orchestrator verified.');

    // 4. Verify Submission Verifier
    console.log('Verifying Submission Verifier status mappings...');
    const mockPageForVerifier = {
      url: () => 'https://company.com/success',
      title: () => 'Application Submitted',
      evaluate: async () => 'Thank you for applying. Confirmation ID: CONF-12345.'
    };
    const verification = await verifySubmission(mockPageForVerifier, { url: 'https://company.com/apply' });
    assert.ok(verification.status);
    console.log(`✅ Submission verifier returned status: ${verification.status}`);

    console.log('🎉 FULL END-TO-END WORKFLOW INTEGRATION TEST PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Full End-to-End Workflow Test Failed:', error);
    process.exit(1);
  }
}

runFullEndToEndWorkflowTest();
