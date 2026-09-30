import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { FIELD_TYPES } from './fieldTypes.js';
import { executeSingleBrowserAction } from '../../browser/browserActionExecutor.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Robustly fills autocomplete suggestion inputs.
 */
export const fillAutocompleteField = async (page, selector, value) => {
  try {
    const el = await page.$(selector);
    if (!el) return false;

    await el.click();
    await el.fill('');
    await el.type(value, { delay: 50 });
    await page.waitForTimeout(1000); // allow dynamic suggestions to load

    const suggestions = await page.$$('.autocomplete-suggestion, .option, [role="option"], .suggestion-item');
    let matched = null;

    for (const sug of suggestions) {
      const text = await sug.innerText().catch(() => '');
      if (text.toLowerCase().trim() === value.toLowerCase().trim()) {
        matched = sug;
        break;
      }
    }

    if (matched) {
      await matched.click();
      await logJobEvent('formFiller', 'AUTOCOMPLETE_SUCCESS', `Selected match: ${value}`);
      return true;
    }

    if (suggestions.length > 0) {
      await suggestions[0].click();
      return true;
    }

    return false;
  } catch (error) {
    await logError('formFiller.fillAutocompleteField', error.message);
    return false;
  }
};

/**
 * Robustly opens and selects from custom dropdown widgets.
 */
export const selectCustomDropdown = async (page, selector, optionValue) => {
  try {
    const el = await page.$(selector);
    if (!el) return false;

    await el.click();
    await page.waitForTimeout(500); // wait for dropdown menu to mount

    const options = await page.$$('.dropdown-menu .option, [role="listbox"] [role="option"], li');
    for (const opt of options) {
      const text = await opt.innerText().catch(() => '');
      if (text.toLowerCase().trim().includes(optionValue.toLowerCase().trim())) {
        await opt.click();
        await logJobEvent('formFiller', 'CUSTOM_SELECT_SUCCESS', `Selected: ${text.trim()}`);
        return true;
      }
    }

    return false;
  } catch (error) {
    await logError('formFiller.selectCustomDropdown', error.message);
    return false;
  }
};

/**
 * Files upload fields and verifies acceptance / uploads errors.
 */
export const uploadFileWithVerification = async (page, selector, filePath) => {
  try {
    const input = await page.$(selector);
    if (!input) return false;

    await input.setInputFiles(filePath);
    await page.waitForTimeout(1500); // allow file upload acceptance scan

    const bodyText = await page.innerText('body').catch(() => '');
    const hasError = /invalid format|file too large|error uploading/i.test(bodyText);

    return !hasError;
  } catch (error) {
    await logError('formFiller.uploadFileWithVerification', error.message);
    return false;
  }
};

/**
 * Robustly interact with picker fields.
 */
export const fillDatePicker = async (page, selector, dateValue) => {
  try {
    const input = await page.$(selector);
    if (!input) return false;

    await input.click();
    await input.fill('');
    await input.type(dateValue, { delay: 50 });
    await input.press('Enter');

    const val = await input.inputValue().catch(() => '');
    return val !== '';
  } catch (error) {
    await logError('formFiller.fillDatePicker', error.message);
    return false;
  }
};

/**
 * Supports filling contenteditable and rich-text area fields.
 */
export const fillContentEditable = async (page, selector, text) => {
  try {
    const el = await page.$(selector);
    if (!el) return false;

    await el.click();
    await el.focus();
    await el.evaluate((node, val) => {
      node.innerText = val;
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);

    return true;
  } catch (error) {
    await logError('formFiller.fillContentEditable', error.message);
    return false;
  }
};

/**
 * Fills form fields on a page using resolved answers and deterministic browser actions.
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

    // If it's a file upload field, use custom upload check
    if (field.type === FIELD_TYPES.FILE || /resume|cv|file/i.test(field.label || '')) {
      const filePath = value || options.resumePdfPath;
      if (filePath) {
        const success = await uploadFileWithVerification(page, fieldIdentifier, filePath);
        if (success) {
          filledCount++;
        } else {
          failedCount++;
          errors.push(`File upload rejected for field ${field.label}`);
        }
        continue;
      }
    }

    // Skip if no value provided
    if (value === undefined || value === null || value === '') {
      skippedCount++;
      continue;
    }

    let completed = false;

    // Route dynamically based on control markers
    if (field.type === FIELD_TYPES.SELECT) {
      completed = await selectCustomDropdown(page, fieldIdentifier, String(value));
    } else if (field.isAutocomplete || /autocomplete|combobox/i.test(field.type || '')) {
      completed = await fillAutocompleteField(page, fieldIdentifier, String(value));
    } else if (field.type === 'date' || /date|picker/i.test(field.label || '')) {
      completed = await fillDatePicker(page, fieldIdentifier, String(value));
    } else if (field.contentEditable || /contenteditable/i.test(field.type || '')) {
      completed = await fillContentEditable(page, fieldIdentifier, String(value));
    }

    if (completed) {
      filledCount++;
      continue;
    }

    // Default to classic browser action executor
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
