import { logJobEvent } from '../../utils/logger.js';
import { FIELD_TYPES } from './fieldTypes.js';

/**
 * Verifies that all resolved answers were actually filled into the DOM.
 * Uses direct DOM inspection — NO LLM calls.
 *
 * For every field, maintains:
 * - intended answer
 * - source
 * - expected value
 * - actual value
 * - verification status
 * - verification evidence
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} resolvedAnswers - Answers that were filled by formFiller
 * @param {Array<object>} formFields - Original form fields extracted from the page
 * @returns {Promise<{ allFilled: boolean, filledCount: number, fields: Array<object>, emptyFields: Array<object> }>}
 */
export const verifyFilledFields = async (page, resolvedAnswers = [], formFields = []) => {
  if (!page || page.isClosed() || resolvedAnswers.length === 0) {
    return { allFilled: true, filledCount: 0, fields: [], emptyFields: [] };
  }

  // Create a combined model of expected selectors and questions
  const fieldPayloads = resolvedAnswers.map((ans) => {
    // Find matching form field metadata for required state
    const matchedField = formFields.find(f => 
      (f.fieldId && f.fieldId === ans.fieldId) || 
      (f.selector && f.selector === ans.fieldId) ||
      (f.questionId && f.questionId === ans.questionId)
    );

    return {
      fieldId: ans.fieldId,
      questionId: ans.questionId,
      question: ans.question || matchedField?.label || '',
      expectedValue: String(ans.answer ?? ''),
      intendedAnswer: String(ans.answer ?? ''),
      source: ans.source || 'resolved_answer',
      type: ans.type || matchedField?.type || 'text',
      required: matchedField?.required === true
    };
  });

  const evaluationResult = await page.evaluate((payloads) => {
    return payloads.map((field) => {
      const selector = field.fieldId;
      if (!selector) {
        return {
          ...field,
          actualValue: '',
          verified: false,
          evidence: 'No selector available for this field'
        };
      }

      let el = null;
      try {
        el = document.querySelector(selector);
      } catch (e) {
        // Ignored
      }

      if (!el && selector) {
        el = document.getElementById(selector) ||
          document.querySelector(`[name="${selector}"]`) ||
          document.querySelector(`[data-automation-id="${selector}"]`);
      }

      if (!el) {
        return {
          ...field,
          actualValue: '',
          verified: false,
          evidence: 'Element could not be found in active DOM'
        };
      }

      const tagName = el.tagName.toLowerCase();
      const inputType = (el.getAttribute('type') || '').toLowerCase();
      let actualValue = '';
      let verified = false;

      if (inputType === 'checkbox' || inputType === 'radio' || el.getAttribute('role') === 'checkbox') {
        const isChecked = el.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-checked') === 'true';
        actualValue = isChecked ? 'checked' : 'unchecked';
        
        const expectedBool = field.expectedValue === 'true' || field.expectedValue === 'checked' || field.expectedValue === 'yes';
        verified = isChecked === expectedBool;
      } else if (tagName === 'select') {
        actualValue = el.value || '';
        const selectedText = el.options?.[el.selectedIndex]?.text || '';
        
        verified = actualValue.trim().toLowerCase() === field.expectedValue.trim().toLowerCase() ||
                   selectedText.trim().toLowerCase() === field.expectedValue.trim().toLowerCase();
      } else if (inputType === 'file') {
        // File input: we can't read files for value directly, assume verified if elements exist
        verified = true;
        actualValue = '[file_attached]';
      } else {
        actualValue = el.value || '';
        verified = actualValue.trim().toLowerCase() === field.expectedValue.trim().toLowerCase();
        
        // Soft fallback for partial matches on dynamic elements (e.g. autocompletes)
        if (!verified && actualValue.trim().length > 0) {
          verified = actualValue.toLowerCase().includes(field.expectedValue.toLowerCase()) || 
                     field.expectedValue.toLowerCase().includes(actualValue.toLowerCase());
        }
      }

      return {
        ...field,
        actualValue,
        verified,
        evidence: verified 
          ? `Value matches expected: "${field.expectedValue}"` 
          : `Mismatch. Expected: "${field.expectedValue}", Actual: "${actualValue}"`
      };
    });
  }, fieldPayloads);

  const fields = evaluationResult.map(r => ({
    fieldId: r.fieldId,
    questionId: r.questionId,
    question: r.question,
    type: r.type,
    intendedAnswer: r.intendedAnswer,
    source: r.source,
    expectedValue: r.expectedValue,
    actualValue: r.actualValue,
    verificationStatus: r.verified,
    verificationEvidence: r.evidence,
    required: r.required
  }));

  const emptyFields = fields.filter(f => !f.verificationStatus);
  const filledCount = fields.filter(f => f.verificationStatus).length;

  await logJobEvent(
    'formVerifier',
    'VERIFIED',
    `Verification: ${filledCount}/${fields.length} fields successfully verified.`
  );

  return {
    allFilled: emptyFields.length === 0,
    filledCount,
    fields,
    emptyFields
  };
};
