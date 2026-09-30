import { validateAction } from '../browser/executor/actionValidator.js';
import { BROWSER_ACTIONS } from '../constant/application.constant.js';
import assert from 'assert';

function runValidatorTests() {
  console.log('--- STARTING ACTION VALIDATOR GATING TESTS ---');

  // Helper mock page observation
  const mockPageObservation = {
    pageRevision: 'rev_hash_999',
    interactiveElements: [
      {
        elementId: 'el_email',
        id: 'email-input',
        name: 'email',
        tagName: 'input',
        type: 'email',
        role: 'textbox',
        labelText: 'Work Email Address',
        visible: true,
        enabled: true,
        elementFingerprint: 'finger_email_123'
      },
      {
        elementId: 'el_btn_continue',
        id: 'btn-continue',
        tagName: 'button',
        visible: true,
        enabled: true,
        elementFingerprint: 'finger_btn_123'
      },
      {
        elementId: 'el_btn_submit',
        id: 'btn-submit',
        tagName: 'button',
        normalizedText: 'Submit Application',
        visible: true,
        enabled: true,
        elementFingerprint: 'finger_btn_submit_123'
      },
      {
        elementId: 'el_hidden',
        id: 'hidden-input',
        tagName: 'input',
        visible: false,
        enabled: true,
        elementFingerprint: 'finger_hidden'
      },
      {
        elementId: 'el_disabled',
        id: 'disabled-input',
        tagName: 'input',
        visible: true,
        enabled: false,
        elementFingerprint: 'finger_disabled'
      },
      // Create duplicate elements to trigger ambiguity
      {
        elementId: 'el_dup_1',
        id: 'duplicate-item-1',
        tagName: 'button',
        ancestryPath: 'button.dup-btn',
        visible: true,
        enabled: true,
        elementFingerprint: 'finger_duplicate'
      },
      {
        elementId: 'el_dup_2',
        id: 'duplicate-item-2',
        tagName: 'button',
        ancestryPath: 'button.dup-btn',
        visible: true,
        enabled: true,
        elementFingerprint: 'finger_duplicate'
      }
    ]
  };

  // Test 1: Invalid Action Schema
  console.log('Test 1: Rejects invalid schemas...');
  const res1 = validateAction({ type: 'NOT_VALID_ACTION_TYPE' }, mockPageObservation);
  assert.strictEqual(res1.valid, false);
  assert.ok(res1.reasons[0].includes('Schema validation failed'));

  // Test 2: Mismatched/Stale Observation Revision
  console.log('Test 2: Rejects stale actions (revision mismatch)...');
  const res2 = validateAction({
    actionId: 'act_002',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'continue',
    target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' },
    expectedOutcome: 'next_page',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_stale_old' // older observation revision
  }, mockPageObservation);
  assert.strictEqual(res2.valid, false);
  assert.ok(res2.reasons[0].includes('Action is stale'));

  // Test 3: Missing Required Expected Outcome
  console.log('Test 3: Rejects actions without expected outcomes...');
  const res3 = validateAction({
    actionId: 'act_003',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'continue',
    target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' },
    expectedOutcome: '', // empty!
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res3.valid, false);
  assert.ok(res3.reasons[0].includes('expectedOutcome is mandatory') || res3.reasons[0].includes('must specify an expectedOutcome'));

  // Test 4: Element Target Non-Existence
  console.log('Test 4: Rejects when element target is missing...');
  const res4 = validateAction({
    actionId: 'act_004',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'click_missing',
    target: { elementId: 'non_existent_id' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res4.valid, false);
  assert.ok(res4.reasons[0].includes('Target element not found'));

  // Test 5: Ambiguity (Duplicate targets match)
  console.log('Test 5: Rejects ambiguous elements with multiple candidates...');
  const res5 = validateAction({
    actionId: 'act_005',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'click_duplicate',
    target: { selector: 'button.dup-btn' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res5.valid, false);
  assert.ok(res5.reasons[0].includes('Target is ambiguous'));

  // Test 6: Hidden/Invisible Target
  console.log('Test 6: Rejects interaction with hidden targets...');
  const res6 = validateAction({
    actionId: 'act_006',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'click_hidden',
    target: { elementId: 'el_hidden', elementFingerprint: 'finger_hidden' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res6.valid, false);
  assert.ok(res6.reasons[0].includes('present but currently hidden'));

  // Test 7: Disabled Target
  console.log('Test 7: Rejects interaction with disabled elements...');
  const res7 = validateAction({
    actionId: 'act_007',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'click_disabled',
    target: { elementId: 'el_disabled', elementFingerprint: 'finger_disabled' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res7.valid, false);
  assert.ok(res7.reasons[0].includes('disabled and cannot be interacted with'));

  // Test 8: Value required for Fill/Type
  console.log('Test 8: Rejects FILL/TYPE with missing input values...');
  const res8 = validateAction({
    actionId: 'act_008',
    type: BROWSER_ACTIONS.FILL,
    intent: 'fill_email',
    target: { elementId: 'el_email', elementFingerprint: 'finger_email_123' },
    value: '', // empty value
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res8.valid, false);
  assert.ok(res8.reasons[0].includes('requires a non-empty value'));

  // Test 9: Semantic Field Safety Check (Email Match)
  console.log('Test 9: Rejects non-email target filled with email intent...');
  const res9 = validateAction({
    actionId: 'act_009',
    type: BROWSER_ACTIONS.FILL,
    intent: 'fill_email',
    target: { elementId: 'el_btn_continue', text: 'email' }, // pointing to btn but matching "email" text context
    value: 'test@example.com',
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res9.valid, false);
  assert.ok(res9.reasons[0].includes('not confidently an email field'));

  // Test 10: Pre-submit Gating
  console.log('Test 10: Rejects SUBMIT application intent if readyToSubmit is false...');
  const res10 = validateAction({
    actionId: 'act_010',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'submit_application',
    target: { elementId: 'el_btn_submit', elementFingerprint: 'finger_btn_submit_123' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'HIGH',
    requiresHumanConfirmation: true,
    observationRevision: 'rev_hash_999'
  }, mockPageObservation, {
    applicationState: { readyToSubmit: false }, // Not ready to submit!
    humanConfirmed: true
  });
  assert.strictEqual(res10.valid, false);
  assert.ok(res10.reasons[0].includes('SUBMIT intent blocked: Application is not explicitly'));

  // Test 11: Retry Budget Check
  console.log('Test 11: Rejects if retry budget is exceeded for the same action...');
  const actionToRetry = {
    actionId: 'act_011',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'continue',
    target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  };
  const res11 = validateAction(actionToRetry, mockPageObservation, {
    history: [
      { type: BROWSER_ACTIONS.CLICK, target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' } },
      { type: BROWSER_ACTIONS.CLICK, target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' } },
      { type: BROWSER_ACTIONS.CLICK, target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' } }
    ],
    retryBudget: 3
  });
  assert.strictEqual(res11.valid, false);
  assert.ok(res11.reasons[0].includes('Action retry budget exceeded'));

  // Test 12: Loop Risk Cycles
  console.log('Test 12: Rejects repeating dual-action cycle (loop protection)...');
  const actionToLoop = {
    actionId: 'act_012',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'continue',
    target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  };
  const res12 = validateAction(actionToLoop, mockPageObservation, {
    history: [
      { type: BROWSER_ACTIONS.CLICK, target: { elementId: 'el_btn_continue' } },
      { type: BROWSER_ACTIONS.WAIT, target: null },
      { type: BROWSER_ACTIONS.CLICK, target: { elementId: 'el_btn_continue' } },
      { type: BROWSER_ACTIONS.WAIT, target: null }
    ]
  });
  assert.strictEqual(res12.valid, false);
  assert.ok(res12.reasons[0].includes('Loop detected'));

  // Test 13: High Risk Human Confirmation Gate
  console.log('Test 13: Rejects HIGH/CRITICAL actions without human confirmation...');
  const res13 = validateAction({
    actionId: 'act_013',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'submit_application',
    target: { elementId: 'el_btn_submit', elementFingerprint: 'finger_btn_submit_123' },
    expectedOutcome: 'outcome_ok',
    riskLevel: 'CRITICAL',
    requiresHumanConfirmation: true,
    observationRevision: 'rev_hash_999'
  }, mockPageObservation, {
    applicationState: { readyToSubmit: true },
    humanConfirmed: false // No confirmation!
  });
  assert.strictEqual(res13.valid, false);
  assert.ok(res13.reasons[0].includes('requires explicit human confirmation'));

  // Test 14: Clean Validation Success (Valid click action)
  console.log('Test 14: Successfully validates clean actions...');
  const res14 = validateAction({
    actionId: 'act_014',
    type: BROWSER_ACTIONS.CLICK,
    intent: 'continue',
    target: { elementId: 'el_btn_continue', elementFingerprint: 'finger_btn_123' },
    expectedOutcome: 'next_page',
    riskLevel: 'LOW',
    observationRevision: 'rev_hash_999'
  }, mockPageObservation);
  assert.strictEqual(res14.valid, true);
  assert.strictEqual(res14.reasons.length, 0);

  console.log('🎉 ALL ACTION VALIDATOR REJECTION TESTS PASSED.');
}

runValidatorTests();
