import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { FIELD_TYPES } from './fieldTypes.js';
import { executeSingleBrowserAction } from '../../browser/browserActionExecutor.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Normalizes question / label text for matching
 */
const normalizeText = (text = '') => {
  return String(text)
    .toLowerCase()
    .replace(/[?*:]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Robustly matches and extracts an answer value for a given form field
 * from resolved answers, confirmed answers, candidate profile, and resume facts.
 *
 * @param {object} field - Field metadata from form inspection
 * @param {Array<object>} resolvedAnswers - List of candidate answers
 * @param {object} options - Execution context with profile, resume, user, etc.
 * @returns {string|null} Resolved value or null if none found
 */
export const resolveFieldValue = (field = {}, resolvedAnswers = [], options = {}) => {
  // 1. Direct answer matching across resolvedAnswers
  if (Array.isArray(resolvedAnswers)) {
    for (const ans of resolvedAnswers) {
      if (!ans) continue;
      const ansVal = ans.answer !== undefined ? ans.answer : ans.value;
      if (ansVal === undefined || ansVal === null || ansVal === '') continue;

      // Exact fieldId or questionId match
      if (ans.fieldId && (ans.fieldId === field.fieldId || ans.fieldId === field.name || ans.fieldId === field.selector)) {
        return String(ansVal);
      }
      if (ans.questionId && (ans.questionId === field.questionId || ans.questionId === field.name || ans.questionId === field.fieldId)) {
        return String(ansVal);
      }
      if (ans.name && (ans.name === field.name || ans.name === field.fieldId)) {
        return String(ansVal);
      }

      // Attribute unwrapping: [name="fullName"] -> "fullName", #email -> "email"
      if (field.fieldId) {
        const nameAttr = field.fieldId.match(/\[name=["']?([^"']+)["']?\]/i);
        if (nameAttr && (ans.fieldId === nameAttr[1] || ans.name === nameAttr[1] || ans.questionId === nameAttr[1])) {
          return String(ansVal);
        }

        const idAttr = field.fieldId.match(/^#([a-zA-Z0-9_-]+)$/);
        if (idAttr && (ans.fieldId === idAttr[1] || ans.name === idAttr[1] || ans.questionId === idAttr[1])) {
          return String(ansVal);
        }
      }

      // Normalized question / label text matching
      const targetText = normalizeText(field.question || field.label || field.name || field.placeholder || '');
      const ansText = normalizeText(ans.question || ans.label || ans.name || '');
      if (targetText && ansText && (targetText === ansText || targetText.includes(ansText) || ansText.includes(targetText))) {
        return String(ansVal);
      }
    }
  }

  // 2. Candidate profile / resume fallback
  const profile = options.userProfile || options.profile || {};
  const resume = options.resumeData || options.candidateInfo || {};
  const user = options.user || {};

  const combinedFieldText = [
    field.question,
    field.label,
    field.name,
    field.placeholder,
    field.fieldId
  ].filter(Boolean).join(' ').toLowerCase();

  // Name fields
  if (/full\s*name|candidate\s*name|your\s*name/i.test(combinedFieldText) || (field.name && /^(name|fullname)$/i.test(field.name))) {
    return profile.fullName || resume.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || null;
  }
  if (/first\s*name|given\s*name/i.test(combinedFieldText) || (field.name && /first/i.test(field.name))) {
    return user.firstName || (profile.fullName || resume.fullName || '').split(' ')[0] || null;
  }
  if (/last\s*name|family\s*name|surname/i.test(combinedFieldText) || (field.name && /last/i.test(field.name))) {
    return user.lastName || (profile.fullName || resume.fullName || '').split(' ').slice(1).join(' ') || null;
  }

  // Email
  if (/e-?mail/i.test(combinedFieldText) || field.type === FIELD_TYPES.EMAIL || (field.name && /email/i.test(field.name))) {
    return profile.email || resume.email || user.email || null;
  }

  // Phone / Mobile
  if (/phone|mobile|contact\s*no|tel/i.test(combinedFieldText) || field.type === FIELD_TYPES.PHONE || (field.name && /phone|mobile/i.test(field.name))) {
    return profile.phone || profile.phoneNumber || resume.phone || user.phone || null;
  }

  // File upload / Resume / CV
  if (field.type === FIELD_TYPES.FILE || /resume|cv|file|attachment|document/i.test(combinedFieldText) || (field.name && /resume|cv|file/i.test(field.name))) {
    return options.resumePdfPath || resume.pdfPath || profile.resumePdfPath || null;
  }

  // Total Experience
  if (/experience|years\s*of\s*exp/i.test(combinedFieldText) || (field.name && /exp/i.test(field.name))) {
    return String(profile.totalExperienceYears || profile.experience || resume.totalExperienceYears || '3');
  }

  // Current CTC
  if (/current\s*(?:ctc|salary|compensation|package|rate)/i.test(combinedFieldText)) {
    return String(profile.currentCtc || profile.currentSalary || '10 LPA');
  }

  // Expected CTC
  if (/expected\s*(?:ctc|salary|compensation|package)/i.test(combinedFieldText)) {
    return String(profile.expectedCtc || profile.expectedSalary || '15 LPA');
  }

  // Notice Period
  if (/notice\s*period|availability|joining|how\s*soon/i.test(combinedFieldText)) {
    return String(profile.noticePeriod || 'Immediate / 15 days');
  }

  // City / Location
  if (/city|location|current\s*city|residence|address/i.test(combinedFieldText) || (field.name && /city|location/i.test(field.name))) {
    return profile.location || profile.city || resume.location || 'Bangalore';
  }

  // LinkedIn
  if (/linkedin/i.test(combinedFieldText)) {
    return profile.linkedinUrl || resume.linkedin || profile.socialLinks?.linkedin || null;
  }

  // GitHub / Portfolio
  if (/github|portfolio|website/i.test(combinedFieldText)) {
    return profile.githubUrl || profile.portfolioUrl || resume.github || null;
  }

  // Cover Letter / Notes / Message
  if (/cover\s*letter|message|note|why\s*should\s*we|pitch|tell\s*us|summary/i.test(combinedFieldText) || field.type === FIELD_TYPES.TEXTAREA) {
    return options.coverLetter || "I am enthusiastic about applying for this opportunity. With my relevant background and technical experience, I believe I can make an immediate and positive contribution to your team. Please find my resume attached for your review.";
  }

  // Terms and conditions / Agreement checkbox
  if (field.isTermsAgreement || (field.type === FIELD_TYPES.CHECKBOX && /terms|agree|privacy|consent|policy/i.test(combinedFieldText))) {
    return 'true';
  }

  return null;
};

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

  for (const field of formFields) {
    const fieldIdentifier = field.fieldId || field.selector || field.questionId;
    if (!fieldIdentifier) {
      skippedCount++;
      continue;
    }

    // Resolve value using multi-strategy resolver
    const value = resolveFieldValue(field, resolvedAnswers, options);

    // If it's a file upload field, use custom upload check
    if (field.type === FIELD_TYPES.FILE || /resume|cv|file/i.test(field.label || field.name || field.question || '')) {
      const filePath = value || options.resumePdfPath;
      if (filePath) {
        const success = await uploadFileWithVerification(page, fieldIdentifier, filePath);
        if (success) {
          filledCount++;
          await logJobEvent('formFiller', 'FILE_UPLOADED', `Resume uploaded for field: ${field.label || field.name || fieldIdentifier}`);
        } else {
          failedCount++;
          errors.push(`File upload rejected for field ${field.label || field.name || fieldIdentifier}`);
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
      if (!completed) {
        // Fallback to native select
        try {
          const loc = page.locator(fieldIdentifier).first();
          if ((await loc.count().catch(() => 0)) > 0) {
            await loc.selectOption({ label: String(value) }).catch(async () => {
              await loc.selectOption({ value: String(value) }).catch(async () => {
                await loc.selectOption(String(value));
              });
            });
            completed = true;
          }
        } catch {
          completed = false;
        }
      }
    } else if (field.isAutocomplete || /autocomplete|combobox/i.test(field.type || '')) {
      completed = await fillAutocompleteField(page, fieldIdentifier, String(value));
    } else if (field.type === 'date' || /date|picker/i.test(field.label || field.name || '')) {
      completed = await fillDatePicker(page, fieldIdentifier, String(value));
    } else if (field.contentEditable || /contenteditable/i.test(field.type || '')) {
      completed = await fillContentEditable(page, fieldIdentifier, String(value));
    } else if (field.type === FIELD_TYPES.CHECKBOX || field.type === FIELD_TYPES.RADIO || field.isTermsAgreement) {
      try {
        const loc = page.locator(fieldIdentifier).first();
        if ((await loc.count().catch(() => 0)) > 0) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await loc.check({ force: true }).catch(async () => {
            await loc.click({ force: true });
          });
          completed = true;
        }
      } catch {
        completed = false;
      }
    }

    if (completed) {
      filledCount++;
      continue;
    }

    // Direct Playwright Fill with synthetic events
    try {
      let loc = page.locator(fieldIdentifier).first();
      let hasLoc = (await loc.count().catch(() => 0)) > 0;

      // If selector did not match directly, try fallback selectors by name or id
      if (!hasLoc && field.name) {
        loc = page.locator(`[name="${field.name}"], #${field.name}`).first();
        hasLoc = (await loc.count().catch(() => 0)) > 0;
      }
      if (!hasLoc && field.placeholder) {
        loc = page.locator(`[placeholder="${field.placeholder}"]`).first();
        hasLoc = (await loc.count().catch(() => 0)) > 0;
      }

      if (hasLoc) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ timeout: 2000 }).catch(() => {});
        await loc.fill(String(value));

        // Dispatch synthetic events so React, Angular, Vue, and jQuery register the value
        await loc.evaluate((node, val) => {
          node.value = val;
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
          node.dispatchEvent(new Event('blur', { bubbles: true }));
        }, String(value)).catch(() => {});

        filledCount++;
        continue;
      }
    } catch {
      // Fall through to executeSingleBrowserAction
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
        target: { selector: fieldIdentifier, text: field.label || field.question },
        value: String(value),
      },
      options
    );

    if (actionResult.success) {
      filledCount++;
    } else {
      failedCount++;
      errors.push(actionResult.error || `Failed filling ${field.label || field.name || fieldIdentifier}`);
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

export default {
  fillFormFields,
  resolveFieldValue,
  fillAutocompleteField,
  selectCustomDropdown,
  uploadFileWithVerification,
  fillDatePicker,
  fillContentEditable,
};
