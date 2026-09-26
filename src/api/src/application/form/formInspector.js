import { FIELD_TYPES } from './fieldTypes.js';
import { generateQuestionId } from './formNormalizer.js';
import { logJobEvent } from '../../utils/logger.js';

/**
 * Inspects the current page DOM to extract questionnaire fields and modal state
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
export const inspectForm = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { isQuestionnairePresent: false, fields: [], buttons: [] };
    }

    const formSnapshot = await page.evaluate((fieldTypes) => {
      // 1. Detect if any modal, drawer, or questionnaire container exists
      const modalContainers = document.querySelectorAll(
        '.apply-modal, .chatbot_drawer, .drawer, [class*="apply-container"], [class*="applyModal"], [class*="application-form"], [class*="apply_form"], form, [role="dialog"]'
      );

      // Prefer modal container if present, else fallback to main document body
      let root = document.body;
      for (const m of modalContainers) {
        if (m.offsetParent !== null || m.offsetHeight > 100) {
          root = m;
          break;
        }
      }

      // Check if page already shows "Applied" confirmation
      const pageText = document.body.innerText || '';
      const isAlreadyApplied =
        pageText.includes('Applied successfully') ||
        pageText.includes('You have successfully applied') ||
        pageText.includes('Application submitted') ||
        Boolean(document.querySelector('.already-applied, [class*="applied-banner"]'));

      // Check for security prompts (CAPTCHA / OTP / 2FA)
      const hasCaptcha = Boolean(
        document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"], [class*="captcha"], #captcha')
      );
      const hasOtp = Boolean(
        document.querySelector('input[placeholder*="OTP" i], input[name*="otp" i], [class*="otp-input"]')
      );
      const has2fa = Boolean(
        pageText.includes('Two-Factor Authentication') || pageText.includes('verification code')
      );

      // Extract all form input fields within root
      const fields = [];
      const seenNames = new Set();

      // Find all questions / inputs
      const elements = root.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="radiogroup"], [role="group"]'
      );

      let counter = 0;
      elements.forEach((el) => {
        // Skip invisible elements
        if (el.offsetParent === null && el.type !== 'file') return;

        const tagName = el.tagName.toLowerCase();
        const inputType = (el.getAttribute('type') || '').toLowerCase();
        let detectedType = fieldTypes.TEXT;

        if (tagName === 'textarea') {
          detectedType = fieldTypes.TEXTAREA;
        } else if (tagName === 'select') {
          detectedType = fieldTypes.SELECT;
        } else if (inputType === 'radio' || el.getAttribute('role') === 'radiogroup') {
          detectedType = fieldTypes.RADIO;
        } else if (inputType === 'checkbox') {
          detectedType = fieldTypes.CHECKBOX;
        } else if (inputType === 'file') {
          detectedType = fieldTypes.FILE;
        } else if (inputType === 'number') {
          detectedType = fieldTypes.NUMBER;
        } else if (inputType === 'email') {
          detectedType = fieldTypes.EMAIL;
        } else if (inputType === 'tel' || inputType === 'phone') {
          detectedType = fieldTypes.PHONE;
        }

        // Find label or associated question text
        let questionText = '';
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) questionText = lbl.textContent.trim();
        }

        if (!questionText) {
          const parentLabel = el.closest('label');
          if (parentLabel) questionText = parentLabel.textContent.trim();
        }

        if (!questionText) {
          const parentContainer = el.closest('.form-group, .question-wrap, .field-wrap, [class*="question"], [class*="field"], div');
          if (parentContainer) {
            const titleEl = parentContainer.querySelector('h1, h2, h3, h4, h5, p, span.title, label, .label');
            if (titleEl && titleEl !== el) {
              questionText = titleEl.textContent.trim();
            }
          }
        }

        if (!questionText) {
          questionText =
            el.getAttribute('placeholder') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('name') ||
            el.getAttribute('id') ||
            `Question ${counter + 1}`;
        }

        // Clean question text (remove asterisk, duplicate spaces)
        questionText = questionText.replace(/\s+/g, ' ').replace(/^\*|\*$/g, '').trim();

        // Extract options if select or radio group
        const options = [];
        if (detectedType === fieldTypes.SELECT) {
          const optEls = el.querySelectorAll('option');
          optEls.forEach((o) => {
            const val = (o.textContent || o.value || '').trim();
            if (val && !val.toLowerCase().includes('select')) {
              options.push(val);
            }
          });
        } else if (detectedType === fieldTypes.RADIO) {
          const radioGroup = el.name ? document.querySelectorAll(`input[name="${el.name}"]`) : [el];
          radioGroup.forEach((r) => {
            const rLbl = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
            const optText = rLbl ? rLbl.textContent.trim() : r.value;
            if (optText && !options.includes(optText)) options.push(optText);
          });
        }

        const fieldKey = el.name || el.id || `field_${counter}`;
        if (!seenNames.has(fieldKey)) {
          seenNames.add(fieldKey);
          fields.push({
            fieldId: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : `input_${counter}`,
            name: el.name || el.id || '',
            type: detectedType,
            question: questionText,
            placeholder: el.getAttribute('placeholder') || '',
            required: el.required || el.getAttribute('aria-required') === 'true' || questionText.includes('*'),
            options,
            currentValue: el.value || '',
          });
          counter++;
        }
      });

      // Find actionable buttons (Next / Continue / Save & Apply / Submit)
      const buttons = [];
      const btnEls = root.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]');
      btnEls.forEach((b) => {
        const txt = (b.textContent || b.value || '').trim().toLowerCase();
        if (/submit|save & apply|apply now|confirm/i.test(txt)) {
          buttons.push({ type: 'submit', text: b.textContent.trim(), selector: b.id ? `#${b.id}` : `button:has-text("${b.textContent.trim()}")` });
        } else if (/next|continue|proceed/i.test(txt)) {
          buttons.push({ type: 'next', text: b.textContent.trim(), selector: b.id ? `#${b.id}` : `button:has-text("${b.textContent.trim()}")` });
        }
      });

      return {
        isAlreadyApplied,
        hasCaptcha,
        hasOtp,
        has2fa,
        fields,
        buttons,
        isQuestionnairePresent: fields.length > 0,
      };
    }, FIELD_TYPES);

    // Attach stable question IDs for tracking
    const normalizedFields = (formSnapshot.fields || []).map((f, idx) => ({
      ...f,
      questionId: generateQuestionId(f.question, idx),
    }));

    await logJobEvent(
      'inspectForm',
      'INSPECTED',
      `Found ${normalizedFields.length} fields on current form. Already applied: ${formSnapshot.isAlreadyApplied}`
    );

    return {
      ...formSnapshot,
      fields: normalizedFields,
    };
  } catch (error) {
    await logJobEvent('inspectForm', 'ERROR', error.message);
    return {
      isQuestionnairePresent: false,
      isAlreadyApplied: false,
      hasCaptcha: false,
      hasOtp: false,
      has2fa: false,
      fields: [],
      buttons: [],
    };
  }
};
