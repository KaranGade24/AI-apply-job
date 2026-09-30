import { createFormSnapshot, verifySubmissionSafety } from '../browser/safety/submissionSafetyManager.js';
import assert from 'assert';

// Robust mock page creator
const createMockPage = (url, fields = [], title = 'Form') => {
  return {
    url: () => url,
    isClosed: () => false,
    waitForLoadState: async () => {},
    frames: () => [],
    _mockFields: fields,
    evaluate: async (fn, arg) => {
      const fnStr = fn.toString();
      
      // Determine what structure to return based on the query pattern inside the function
      if (fnStr.includes('extraIframeText') || fnStr.includes('headings') || fnStr.includes('successEvidence')) {
        return {
          url,
          title,
          formFieldsCount: fields.length,
          headings: [],
          buttons: [],
          forms: [],
          fileInputsCount: 0,
          accessibilityInfo: {},
          modalState: { isOpen: false },
          stepperState: { hasStepper: false },
          validationErrors: [],
          loadingState: { isLoading: false },
          successEvidence: { level: 0, confirmationId: null },
          isFormClosed: false,
          textSnippet: 'Mock Page Text'
        };
      }
      
      // Return inspected Form details
      return {
        isQuestionnairePresent: fields.length > 0,
        fields,
        buttons: [],
        stepperState: { hasStepper: false },
        submitButtonSelector: '[type="submit"]'
      };
    }
  };
};

async function runSubmissionSafetyTests() {
  console.log('--- STARTING PRE-SUBMISSION FORM-DRIFT SAFETY TESTS ---');

  try {
    // Test 1: Stable snapshots
    console.log('Test 1: Generates identical hashes for identical form states...');
    const page1 = createMockPage('https://portal.com/apply', [
      { fieldId: 'first_name', type: 'text', required: true },
      { fieldId: 'email', type: 'text', required: true }
    ]);

    const context = { answers: [{ questionId: 'first_name', answer: 'Jane' }] };
    const snap1 = await createFormSnapshot(page1, context);
    const snap2 = await createFormSnapshot(page1, context);

    assert.strictEqual(snap1.hash, snap2.hash);
    console.log('✅ Test 1 Passed.');

    // Test 2: Blocks submission on layout drift (e.g., hidden required field appeared)
    console.log('Test 2: Watchdog blocks submission if layout drifts (hidden field appears)...');
    const page2 = createMockPage('https://portal.com/apply', [
      { fieldId: 'first_name', type: 'text', required: true },
      { fieldId: 'email', type: 'text', required: true },
      { fieldId: 'new_required_field', type: 'text', required: true } // Newly appeared required field!
    ]);

    const audit = await verifySubmissionSafety(snap1.hash, page2, {
      ...context,
      previousUrl: 'https://portal.com/apply'
    });

    assert.strictEqual(audit.safe, false);
    assert.ok(audit.reason.includes('DOM structural change detected'));
    console.log('✅ Test 2 Passed.');

    // Test 3: Blocks submission on navigation drift
    console.log('Test 3: Blocks submission if page navigated away post-review...');
    const page3 = createMockPage('https://portal.com/wrong-destination', [
      { fieldId: 'first_name', type: 'text', required: true },
      { fieldId: 'email', type: 'text', required: true }
    ]);

    const auditNav = await verifySubmissionSafety(snap1.hash, page3, {
      ...context,
      previousUrl: 'https://portal.com/apply'
    });

    assert.strictEqual(auditNav.safe, false);
    assert.ok(auditNav.reason.includes('URL changed'));
    console.log('✅ Test 3 Passed.');

    console.log('🎉 ALL PRE-SUBMISSION SAFETY WATCHDOG TESTS PASSED.');
  } catch (error) {
    console.error('❌ Pre-submission Safety Tests Failed:', error);
    process.exit(1);
  }
}

runSubmissionSafetyTests();
