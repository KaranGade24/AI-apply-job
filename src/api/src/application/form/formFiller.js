import fs from 'fs';
import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { FIELD_TYPES } from './fieldTypes.js';
import { executeSingleBrowserAction } from '../../browser/browserActionExecutor.js';
import { ensureEffectiveResumePdfOnDisk } from '../resume/resumePdfGenerator.js';
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

  const resolvedFullName =
    (profile.personal?.firstName ? `${profile.personal.firstName} ${profile.personal.lastName || ''}`.trim() : null) ||
    profile.fullName ||
    resume.fullName ||
    resume.personalInfo?.fullName ||
    (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null) ||
    user.fullName ||
    user.name ||
    user.username ||
    '';

  const resolvedEmail =
    profile.personal?.email ||
    profile.email ||
    resume.email ||
    resume.personalInfo?.email ||
    user.email ||
    '';

  const resolvedPhone =
    profile.personal?.phone ||
    profile.phone ||
    profile.phoneNumber ||
    resume.phone ||
    resume.personalInfo?.phone ||
    user.phone ||
    '';

  const resolvedLocation =
    profile.personal?.address ||
    profile.location ||
    profile.city ||
    resume.location ||
    resume.personalInfo?.location ||
    resume.personalInfo?.currentCity ||
    'Bangalore';

  const resolvedExp =
    profile.totalExperienceYears ||
    profile.experience ||
    resume.totalExperienceYears ||
    resume.yearsOfExperience ||
    '3';

  const resolvedCurrentCtc =
    profile.currentCtc ||
    profile.currentSalary ||
    resume.currentCtc ||
    '8.5 LPA';

  const resolvedExpectedCtc =
    profile.expectedCtc ||
    profile.expectedSalary ||
    resume.expectedCtc ||
    '12.5 LPA';

  const resolvedNoticePeriod =
    profile.noticePeriod ||
    resume.noticePeriod ||
    'Immediate';

  const resolvedLinkedin =
    profile.links?.linkedin ||
    profile.socialLinks?.linkedin ||
    profile.linkedinUrl ||
    resume.linkedin ||
    resume.personalInfo?.linkedin ||
    '';

  const resolvedGithub =
    profile.links?.github ||
    profile.links?.portfolio ||
    profile.githubUrl ||
    resume.github ||
    resume.personalInfo?.github ||
    '';

  const combinedFieldText = [
    field.question,
    field.label,
    field.name,
    field.placeholder,
    field.fieldId,
    field.dataAutomationId,
  ].filter(Boolean).join(' ').toLowerCase();

  // First name only
  if (/first\s*name|given\s*name/i.test(combinedFieldText) || (field.name && /^first/i.test(field.name))) {
    return profile.personal?.firstName || resolvedFullName.split(' ')[0] || user.firstName || null;
  }

  // Last name only
  if (/last\s*name|family\s*name|surname/i.test(combinedFieldText) || (field.name && /^last/i.test(field.name))) {
    return profile.personal?.lastName || resolvedFullName.split(' ').slice(1).join(' ') || user.lastName || null;
  }

  // Name fields
  if (/\b(full\s*name|candidate\s*name|your\s*name|applicant\s*name)\b/i.test(combinedFieldText) ||
      /\bname\b/i.test(combinedFieldText) ||
      (field.name && /^(name|fullname|candidate_name|applicant_name)$/i.test(field.name))) {
    return resolvedFullName || null;
  }

  // Email
  if (/\be-?mail\b/i.test(combinedFieldText) || field.type === FIELD_TYPES.EMAIL || (field.name && /email/i.test(field.name))) {
    return resolvedEmail || null;
  }

  // Phone / Mobile
  if (/\b(phone|mobile|contact|tel|whatsapp)\b/i.test(combinedFieldText) || field.type === FIELD_TYPES.PHONE || (field.name && /phone|mobile/i.test(field.name))) {
    return resolvedPhone || null;
  }

  // File upload / Resume / CV
  if (field.type === FIELD_TYPES.FILE || /\b(resume|cv|file|attachment|document|upload)\b/i.test(combinedFieldText) || (field.name && /resume|cv|file/i.test(field.name))) {
    return options.resumePdfPath || resume.pdfPath || profile.resumePdfPath || null;
  }

  // Current CTC
  if (/current\s*(?:ctc|salary|compensation|package|rate)/i.test(combinedFieldText) || (field.name && /current.*(?:ctc|salary)/i.test(field.name))) {
    return String(resolvedCurrentCtc);
  }

  // Expected CTC
  if (/expected\s*(?:ctc|salary|compensation|package)/i.test(combinedFieldText) || (field.name && /expected.*(?:ctc|salary)/i.test(field.name))) {
    return String(resolvedExpectedCtc);
  }

  // Notice Period
  if (/notice\s*period|availability|joining|how\s*soon/i.test(combinedFieldText) || (field.name && /notice/i.test(field.name))) {
    return String(resolvedNoticePeriod);
  }

  // Total Experience
  if (/experience|years\s*of\s*exp/i.test(combinedFieldText) || (field.name && /exp/i.test(field.name))) {
    return String(resolvedExp);
  }

  // City / Location
  if (/city|location|current\s*city|residence|address/i.test(combinedFieldText) || (field.name && /city|location|address/i.test(field.name))) {
    return resolvedLocation;
  }

  // LinkedIn
  if (/linkedin/i.test(combinedFieldText) || (field.name && /linkedin/i.test(field.name))) {
    return resolvedLinkedin || null;
  }

  // GitHub / Portfolio
  if (/github|portfolio|website/i.test(combinedFieldText) || (field.name && /github|portfolio/i.test(field.name))) {
    return resolvedGithub || null;
  }

  // Cover Letter / Notes / Message
  if (/cover\s*letter|message|note|why\s*should\s*we|pitch|tell\s*us|summary/i.test(combinedFieldText) || field.type === FIELD_TYPES.TEXTAREA || (field.name && /cover|message/i.test(field.name))) {
    return options.coverLetter || "I am enthusiastic about applying for this opportunity. With my relevant background and technical experience, I believe I can make an immediate and positive contribution to your team. Please find my resume attached for your review.";
  }

  // Terms and conditions / Agreement checkbox
  if (field.isTermsAgreement || (field.type === FIELD_TYPES.CHECKBOX && /terms|agree|privacy|consent|policy|acknowledge|accept/i.test(combinedFieldText))) {
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
 * Robustly opens and selects from custom dropdown widgets or native select elements.
 */
export const selectCustomDropdown = async (page, selector, optionValue) => {
  try {
    const el = await page.$(selector);
    if (!el) return false;

    // 1. Check if the element is actually a native HTML <select> element
    const isSelect = await el.evaluate((node) => node.tagName.toLowerCase() === 'select').catch(() => false);
    if (isSelect) {
      // For native select, set value directly via DOM evaluation (handles invisible/hidden styled selects)
      const selected = await el.evaluate((selectEl, val) => {
        if (!selectEl) return false;
        const targetStr = String(val).toLowerCase().trim();
        const opts = Array.from(selectEl.options || []);
        let matched = opts.find(
          (o) =>
            (o.text || '').toLowerCase().trim() === targetStr ||
            (o.value || '').toLowerCase().trim() === targetStr ||
            (o.text || '').toLowerCase().includes(targetStr) ||
            targetStr.includes((o.text || '').toLowerCase().trim())
        );
        if (!matched && opts.length > 0) {
          // If no exact match, pick the first valid option if available
          matched = opts.find((o) => o.value && o.value !== '' && o.value !== '-1');
        }
        if (matched) {
          selectEl.value = matched.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      }, optionValue).catch(() => false);

      if (selected) {
        await logJobEvent('formFiller', 'NATIVE_SELECT_SUCCESS', `Selected option for ${selector}: ${optionValue}`);
        return true;
      }

      // Try Playwright selectOption fallback with force
      const loc = page.locator(selector).first();
      await loc.selectOption({ label: String(optionValue) }, { timeout: 3000 }).catch(async () => {
        await loc.selectOption({ value: String(optionValue) }, { timeout: 2000 }).catch(async () => {
          await loc.selectOption(String(optionValue), { timeout: 2000 }).catch(() => {});
        });
      });
      return true;
    }

    // 2. Custom dropdown element (div/button/listbox)
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ timeout: 2500 }).catch(async () => {
      await el.click({ force: true, timeout: 2000 }).catch(async () => {
        await page.evaluate((sel) => {
          const target = document.querySelector(sel);
          if (target) target.click();
        }, selector).catch(() => {});
      });
    });

    if (!page.isClosed()) {
      await page.waitForTimeout(350).catch(() => {}); // wait for dropdown menu to mount
    }

    const options = await page.$$('.dropdown-menu .option, [role="listbox"] [role="option"], [role="option"], .dropdown-item, .select-option, li');
    for (const opt of options) {
      const text = await opt.innerText().catch(() => '');
      if (text.toLowerCase().trim().includes(optionValue.toLowerCase().trim())) {
        await opt.click({ force: true }).catch(async () => {
          await opt.evaluate((node) => node.click());
        });
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
 * Ensures the target file exists on the local filesystem and auto-generates if missing.
 */
export const uploadFileWithVerification = async (page, selector, filePath, context = {}) => {
  try {
    let effectivePath = filePath;
    // Check if file exists on disk; if missing or invalid path, ensure valid candidate PDF exists
    if (!effectivePath || !fs.existsSync(effectivePath)) {
      effectivePath = await ensureEffectiveResumePdfOnDisk({
        candidatePath: filePath,
        userId: context.userId,
        resumeData: context.resumeData,
      });
    }

    if (!effectivePath || !fs.existsSync(effectivePath)) {
      await logError('formFiller.uploadFileWithVerification', `No valid resume file found on disk for path: ${filePath}`);
      return false;
    }

    const input = await page.$(selector);
    if (!input) return false;

    // Check if input is a native file input vs custom upload trigger button
    const isFileInput = await input.evaluate(
      (el) => el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'file'
    ).catch(() => false);

    if (isFileInput) {
      await input.setInputFiles(effectivePath);
    } else {
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
      await input.click({ timeout: 2000 }).catch(() => {});
      const chooser = await fileChooserPromise;
      if (chooser) {
        await chooser.setFiles(effectivePath);
      } else {
        await input.setInputFiles(effectivePath).catch(() => {});
      }
    }

    await page.waitForTimeout(1000); // allow file upload acceptance scan

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
      if (filePath || options.userId) {
        const success = await uploadFileWithVerification(page, fieldIdentifier, filePath, options);
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
