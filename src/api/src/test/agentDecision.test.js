import { decideNextAction, HIGH_LEVEL_DECISIONS } from '../application/unknown/agentDecision.js';
import assert from 'assert';

async function runDecisionTests() {
  console.log('--- STARTING UPGRADED AGENT DECISION ENGINE TESTS ---');

  try {
    // ----------------------------------------------------
    // Test Scenario 1: Standard ACT Action Proposal
    // ----------------------------------------------------
    console.log('Test 1: Proposes ACT action on a valid observed input element...');
    
    const mockModelACT = {
      invoke: async (prompts) => {
        // Assert security prompt rules are injected
        const system = prompts.find(p => p.role === 'system')?.content || '';
        assert.ok(system.includes('UNTRUSTED PAGE CONTENT'));
        assert.ok(system.includes('DO NOT INVENT SELECTORS'));
        assert.ok(system.includes('NO CAPTCHA/MFA BYPASS'));

        return {
          content: JSON.stringify({
            decision: 'ACT',
            targetElementId: 'el_input_email',
            targetFingerprint: 'finger_email_123',
            intent: 'fill_email',
            expectedOutcome: 'field_value_matches',
            confidence: 0.95,
            riskLevel: 'LOW',
            reason: 'Filling required email address field'
          })
        };
      }
    };

    const normalizedState = {
      url: 'https://company.com/apply',
      title: 'Job Portal',
      interactiveElements: [
        {
          elementId: 'el_input_email',
          elementFingerprint: 'finger_email_123',
          tagName: 'input',
          labelText: 'Email Address',
          visible: true,
          enabled: true
        }
      ],
      textSnippet: 'Please submit your details here.'
    };

    const agentState = { actions: [], visitedPages: [], counters: {} };
    const job = { title: 'Engineer', company: 'Tech Inc' };
    const pageClassification = { pageType: 'form' };

    // Pass mockModelACT as the 6th parameter (modelOverride)
    const res1 = await decideNextAction(normalizedState, agentState, job, pageClassification, null, mockModelACT);
    assert.strictEqual(res1.decision, HIGH_LEVEL_DECISIONS.ACT);
    assert.strictEqual(res1.targetElementId, 'el_input_email');
    assert.strictEqual(res1.targetFingerprint, 'finger_email_123');
    assert.strictEqual(res1.intent, 'fill_email');
    assert.strictEqual(res1.riskLevel, 'LOW');
    console.log('✅ Test 1 Passed.');

    // ----------------------------------------------------
    // Test Scenario 2: CAPTCHA / Security Block -> ASK_HUMAN
    // ----------------------------------------------------
    console.log('Test 2: Proposes ASK_HUMAN when MFA or Captchas are present...');
    
    const mockModelCAPTCHA = {
      invoke: async () => ({
        content: JSON.stringify({
          decision: 'ASK_HUMAN',
          targetElementId: null,
          targetFingerprint: null,
          intent: 'solve_captcha',
          expectedOutcome: 'bypass_gate',
          confidence: 1.0,
          riskLevel: 'CRITICAL',
          reason: 'MFA CAPTCHA block encountered. Bypassing requires human.'
        })
      })
    };

    const res2 = await decideNextAction(normalizedState, agentState, job, pageClassification, null, mockModelCAPTCHA);
    assert.strictEqual(res2.decision, HIGH_LEVEL_DECISIONS.ASK_HUMAN);
    assert.strictEqual(res2.riskLevel, 'CRITICAL');
    assert.strictEqual(res2.targetElementId, null);
    console.log('✅ Test 2 Passed.');

    // ----------------------------------------------------
    // Test Scenario 3: Broken/Malformed Response Fallback
    // ----------------------------------------------------
    console.log('Test 3: Gracefully handles malformed/empty JSON and falls back to ASK_HUMAN...');
    
    const mockModelBroken = {
      invoke: async () => ({
        content: 'I decided to click the button because it looks good.' // Invalid JSON
      })
    };

    const res3 = await decideNextAction(normalizedState, agentState, job, pageClassification, null, mockModelBroken);
    assert.strictEqual(res3.decision, HIGH_LEVEL_DECISIONS.ASK_HUMAN);
    assert.ok(res3.reason.includes('Agent Decision Engine Exception'));
    console.log('✅ Test 3 Passed.');

    console.log('🎉 ALL AGENT DECISION ENGINE TESTS PASSED.');
  } catch (error) {
    console.error('❌ Tests Failed:', error);
    process.exit(1);
  }
}

runDecisionTests();
