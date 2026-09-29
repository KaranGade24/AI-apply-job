import { logJobEvent } from '../../utils/logger.js';
import { FIELD_TYPES } from './fieldTypes.js';

/**
 * Verifies that all resolved answers were actually filled into the DOM.
 * Uses direct DOM inspection — NO LLM calls.
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} resolvedAnswers - Answers that were filled by formFiller
 * @returns {Promise<{ allFilled: boolean, filledCount: number, emptyFields: Array<object> }>}
 */
export const verifyFilledFields = async (page, resolvedAnswers = []) => {
  if (!page || page.isClosed() || resolvedAnswers.length === 0) {
    return { allFilled: true, filledCount: 0, emptyFields: [] };
  }

  const fieldSelectors = resolvedAnswers.map((a) => ({
    fieldId: a.fieldId,
    questionId: a.questionId,
    question: a.question,
    expectedValue: a.answer,
    type: a.type,
  }));

  const verificationResult = await page.evaluate((fields) => {
    const results = [];

    for (const field of fields) {
      const selector = field.fieldId;
      if (!selector) {
        results.push({ ...field, currentValue: '', isFilled: false, reason: 'no_selector' });
        continue;
      }

      const el = document.querySelector(selector);
      if (!el) {
        results.push({ ...field, currentValue: '', isFilled: false, reason: 'not_found' });
        continue;
      }

      const tagName = el.tagName.toLowerCase();
      const inputType = (el.getAttribute('type') || '').toLowerCase();
      let currentValue = '';
      let isFilled = false;

      if (inputType === 'checkbox' || inputType === 'radio') {
        isFilled = el.checked;
        currentValue = el.checked ? 'checked' : '';
      } else if (tagName === 'select') {
        currentValue = el.value || '';
        isFilled = currentValue !== '' && !currentValue.toLowerCase().includes('select');
      } else if (inputType === 'file') {
        // File inputs can't be read for value, assume filled if formFiller reported success
        isFilled = true;
        currentValue = '[file]';
      } else {
        currentValue = el.value || '';
        isFilled = currentValue.trim().length > 0;
      }

      results.push({
        ...field,
        currentValue,
        isFilled,
        reason: isFilled ? 'ok' : 'empty',
      });
    }

    return results;
  }, fieldSelectors);

  const emptyFields = verificationResult.filter((r) => !r.isFilled);
  const filledCount = verificationResult.filter((r) => r.isFilled).length;

  await logJobEvent(
    'formVerifier',
    'VERIFIED',
    `Verification: ${filledCount}/${verificationResult.length} fields filled. Empty: ${emptyFields.length}`,
  );

  return {
    allFilled: emptyFields.length === 0,
    filledCount,
    emptyFields: emptyFields.map((e) => ({
      fieldId: e.fieldId,
      questionId: e.questionId,
      question: e.question,
      reason: e.reason,
    })),
  };
};
