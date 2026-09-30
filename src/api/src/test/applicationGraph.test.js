import { applicationGraph } from '../agent/graph/applicationGraph.js';
import assert from 'assert';

async function runGraphTests() {
  console.log('--- STARTING LOW-LEVEL BROWSER STATEGRAPH TESTS ---');

  try {
    // 1. Verify all expected nodes are registered
    console.log('Test 1: Verify all canonical browser flow nodes are registered...');
    
    // Assert graph object exists
    assert.ok(applicationGraph);
    assert.ok(applicationGraph.nodes);
    
    // Verify canonical stages are registered as nodes in the graph
    const registeredNodes = Object.keys(applicationGraph.nodes);
    assert.ok(registeredNodes.includes('initializeNode'));
    assert.ok(registeredNodes.includes('observeNode'));
    assert.ok(registeredNodes.includes('classifyNode'));
    assert.ok(registeredNodes.includes('determineGoalNode'));
    assert.ok(registeredNodes.includes('planNode'));
    assert.ok(registeredNodes.includes('validateNode'));
    assert.ok(registeredNodes.includes('executeNode'));
    assert.ok(registeredNodes.includes('verifyNode'));
    assert.ok(registeredNodes.includes('recoverNode'));

    // Form flow nodes
    assert.ok(registeredNodes.includes('inspectFormNode'));
    assert.ok(registeredNodes.includes('resolveAnswersNode'));
    assert.ok(registeredNodes.includes('humanQuestionsIfNeededNode'));
    assert.ok(registeredNodes.includes('fillNode'));
    assert.ok(registeredNodes.includes('verifyFieldsNode'));
    assert.ok(registeredNodes.includes('validateStepNode'));

    // Final flow nodes
    assert.ok(registeredNodes.includes('reviewNode'));
    assert.ok(registeredNodes.includes('confirmationNode'));
    assert.ok(registeredNodes.includes('submissionGuardNode'));
    assert.ok(registeredNodes.includes('submitNode'));
    assert.ok(registeredNodes.includes('verifySubmissionNode'));

    console.log('✅ Test 1 Passed.');

    console.log('🎉 ALL BROWSER STATEGRAPH TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Browser StateGraph Tests Failed:', error);
    process.exit(1);
  }
}

runGraphTests();
