import { getSuccessEvidence, isSuccessPage } from '../application/pageAnalysis/pageStateDetector.js';
import assert from 'assert';

function runDetectorTests() {
  console.log('--- STARTING EVIDENCE LEVEL STATE DETECTOR TESTS ---');

  // Test 1: Level 0 Verification (Generic URLs and no keywords)
  console.log('Test 1: Evaluates generic non-confirming state at level 0...');
  const res1 = getSuccessEvidence('https://company.com/jobs/apply', 'Job Application', 'Please fill out the form');
  assert.strictEqual(res1.level, 0);
  assert.strictEqual(res1.isSuccess, false);

  // Test 2: Level 1 Verification (URL alone contains "success" but body text doesn't confirm)
  console.log('Test 2: Rejects weak confirmation checks based on URL keywords alone...');
  const res2 = getSuccessEvidence('https://company.com/apply/success', 'Apply', 'Fill in your username');
  assert.strictEqual(res2.level, 1);
  assert.strictEqual(res2.isSuccess, false); // URL alone must never produce APPLICATION_COMPLETED / success
  assert.strictEqual(isSuccessPage('https://company.com/apply/success', 'Apply', 'Fill in your username'), false);

  // Test 3: Level 2 Verification (Explicit success message detected)
  console.log('Test 3: Confirms success at Level 2 with explicit body texts...');
  const res3 = getSuccessEvidence('https://company.com/jobs', 'Job Application', 'Thank you for applying to this position!');
  assert.strictEqual(res3.level, 2);
  assert.strictEqual(res3.isSuccess, true);
  assert.strictEqual(isSuccessPage('https://company.com/jobs', 'Job Application', 'Thank you for applying to this position!'), true);

  // Test 4: Level 3 Verification (Strong semantic confirmation)
  console.log('Test 4: Confirms success at Level 3 with strong semantic strings...');
  const res4 = getSuccessEvidence('https://company.com/portal', 'Job Portal', 'Your application has been successfully submitted to our team.');
  assert.strictEqual(res4.level, 3);
  assert.strictEqual(res4.isSuccess, true);

  // Test 5: Level 4 Verification (Confirmation ID / receipt code located)
  console.log('Test 5: Confirms success at Level 4 with dynamic confirmation code...');
  const res5 = getSuccessEvidence('https://company.com/success-portal', 'Done', 'Thank you! Confirmation Code: CONF-9018274');
  assert.strictEqual(res5.level, 4);
  assert.strictEqual(res5.isSuccess, true);

  // Test 6: False Positive Guard - Applications Closed
  console.log('Test 6: Correctly rejects "Applications are not currently being accepted" message...');
  const res6 = getSuccessEvidence('https://company.com/jobs/confirmation', 'Apply', 'Applications are not currently being accepted for this role.');
  assert.strictEqual(res6.isSuccess, false);
  assert.strictEqual(res6.level, 0);
  assert.ok(res6.details.includes('False positive phrase detected'));

  // Test 7: False Positive Guard - Old Application Reference
  console.log('Test 7: Correctly rejects "Your previous application was successfully submitted" message...');
  const res7 = getSuccessEvidence('https://company.com/jobs', 'Portal', 'Note: your previous application was successfully submitted last month.');
  assert.strictEqual(res7.isSuccess, false);
  assert.strictEqual(res7.level, 0);
  assert.ok(res7.details.includes('False positive phrase detected'));

  console.log('🎉 ALL EVIDENCE LEVEL STATE DETECTOR TESTS PASSED.');
}

runDetectorTests();
