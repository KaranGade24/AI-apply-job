import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { FIELD_TYPES } from './fieldTypes.js';
import { executeSingleBrowserAction } from '../browser/browserActionExecutor.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Fills form fields on a page using resolved answers and deterministic browser actions.
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} formFields - Fields extracted by formInspector
 * @param {Array<object>} resolvedAnswers - Answers resolved by answerResolver
 * @param {object} [options]
 * @param {string} [options.resumePdfPath] - Local path to tailored resume PDF
 * @returns {Promise<{ filledCount: number, skippedCount: number, failedCount: number, errors: Array<string> }>}
 */
export const fillFormFields = async (page, formFields = [], resolvedAnswers = [], options = {}) => {
  let filledCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors = [];

  const answerMap = new Map();
  for (const ans of resolvedAnswers) {
    if (ans.fieldId) answerMap.set(ans.fieldId, ans.answer);
    if (ans.questionId) answerMap.set(ans.questionId, ans.answer);
  }

  for (const field of formFields) {
    const fieldIdentifier = field.fieldId || field.selector || field.questionId;
    if (!fieldIdentifier) {
      skippedCount++;
      continue;
    }

    const value = answerMap.get(field.fieldId) ?? answerMap.get(field.questionId);

    // If it's a file upload field, we can use resumePdfPath even if not in answerMap
    if (field.type === FIELD_TYPES.FILE || /resume|cv|file/i.test(field.label || '')) {
      const filePath = value || options.resumePdfPath;
      if (filePath) {
        const actionResult = await executeSingleBrowserAction(
          page,
          {
            type: BROWSER_ACTIONS.UPLOAD,
            target: { selector: fieldIdentifier },
            value: filePath,
          },
          options
        );

        if (actionResult.success) {
          filledCount++;
          await logJobEvent('formFiller', 'UPLOAD_SUCCESS', `Uploaded resume to ${fieldIdentifier}`);
        } else {
          failedCount++;
          errors.push(actionResult.error);
        }
        continue;
      }
    }

    // If no answer available, skip
    if (value === undefined || value === null || value === '') {
      skippedCount++;
      continue;
    }

    let actionType = BROWSER_ACTIONS.FILL;
    if (field.type === FIELD_TYPES.SELECT) {
      actionType = BROWSER_ACTIONS.SELECT;
    } else if (field.type === FIELD_TYPES.RADIO || field.type === FIELD_TYPES.CHECKBOX) {
      actionType = BROWSER_ACTIONS.CHECK;
    }

    const actionResult = await executeSingleBrowserAction(
      page,
      {
        type: actionType,
        target: { selector: fieldIdentifier, text: field.label },
        value: String(value),
      },
      options
    );

    if (actionResult.success) {
      filledCount++;
    } else {
      failedCount++;
      errors.push(actionResult.error);
      await logError('formFiller.field', `Failed to fill ${field.label || fieldIdentifier}: ${actionResult.error}`);
    }
  }

  await logJobEvent(
    'formFiller',
    'FILL_SUMMARY',
    `Filled: ${filledCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`
  );

  return {
    filledCount,
    skippedCount,
    failedCount,
    errors,
  };
};
