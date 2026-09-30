import { resolveAllFormAnswers } from '../application/answer/answerResolver.js';
import { resolveFromProfile } from '../application/answer/profileAnswerResolver.js';
import assert from 'assert';

async function runResolverTests() {
  console.log('--- STARTING COMPLIANT ANSWER RESOLVER TESTS ---');

  // 1. Full name precedence test (with no userProfile)
  console.log('Test 1: Safe precedence execution with missing user profile details...');
  const fieldName = { question: 'Full Name', questionId: 'q_name', fieldId: 'f_name', type: 'text' };
  
  // Test safe precedence: setting works first, profile next, user fallback
  const resProfile1 = resolveFromProfile(fieldName, null, { name: 'Fallback User' }, { fullName: 'Setting Name' });
  assert.strictEqual(resProfile1.resolved, true);
  assert.strictEqual(resProfile1.value, 'Setting Name');
  assert.strictEqual(resProfile1.sourcePath, 'userSetting.fullName');

  // If userSetting lacks name, but userProfile is available
  const resProfile2 = resolveFromProfile(fieldName, { personal: { firstName: 'Jane', lastName: 'Doe' } }, { name: 'Fallback User' }, {});
  assert.strictEqual(resProfile2.resolved, true);
  assert.strictEqual(resProfile2.value, 'Jane Doe');
  assert.strictEqual(resProfile2.sourcePath, 'userProfile.personal.firstName');

  // If both are empty, use user fallback
  const resProfile3 = resolveFromProfile(fieldName, {}, { name: 'User fallback' }, {});
  assert.strictEqual(resProfile3.resolved, true);
  assert.strictEqual(resProfile3.value, 'User fallback');
  console.log('✅ Test 1 Passed.');

  // 2. Sensitive and Legal Question Shielding
  console.log('Test 2: Shields sensitive/legal questionnaire fields from automation...');
  const fields = [
    { question: 'What is your gender?', questionId: 'q_gender', fieldId: 'f_gender', type: 'select', options: ['Male', 'Female', 'Decline'] },
    { question: 'Do you require visa sponsorship?', questionId: 'q_visa', fieldId: 'f_visa', type: 'radio', options: ['Yes', 'No'] },
    { question: 'First Name', questionId: 'q_first', fieldId: 'f_first', type: 'text' }
  ];

  const context = {
    userSetting: { fullName: 'Alex Mercer' },
    user: { email: 'alex@mercer.com' },
    userProfile: { personal: { firstName: 'Alex', lastName: 'Mercer' } },
    resumeData: {}
  };

  const { resolvedAnswers, missingQuestions } = await resolveAllFormAnswers(fields, context);

  // Assert sensitive questions are mapped to missingQuestions
  const genderMissing = missingQuestions.find(m => m.questionId === 'q_gender');
  const visaMissing = missingQuestions.find(m => m.questionId === 'q_visa');
  assert.ok(genderMissing);
  assert.ok(visaMissing);
  assert.strictEqual(genderMissing.isSensitive, true);
  assert.strictEqual(visaMissing.isSensitive, true);

  // Normal questions are successfully resolved
  const nameResolved = resolvedAnswers.find(r => r.questionId === 'q_first');
  assert.ok(nameResolved);
  assert.strictEqual(nameResolved.answer, 'Alex Mercer');
  assert.strictEqual(nameResolved.source, 'profile');
  assert.strictEqual(nameResolved.sourcePath, 'userSetting.fullName');
  assert.strictEqual(nameResolved.confidence, 1.0);
  assert.strictEqual(nameResolved.userConfirmed, false);
  console.log('✅ Test 2 Passed.');

  // 3. Removal of Pune / Option 0 Default Fallbacks
  console.log('Test 3: Confirms missing location or unmatched options fails safely without Pune or index-0 defaults...');
  const locationField = { question: 'Current Location', questionId: 'q_loc', fieldId: 'f_loc', type: 'text' };
  
  // Empty setting and empty profile must NOT fallback to "Pune" or "Pune, India"
  const locationRes = resolveFromProfile(locationField, {}, {}, {});
  assert.strictEqual(locationRes.resolved, false);
  assert.strictEqual(locationRes.value, undefined);
  console.log('✅ Test 3 Passed.');

  console.log('🎉 ALL COMPLIANT ANSWER RESOLVER TESTS PASSED SUCCESSFULLY.');
}

runResolverTests();
