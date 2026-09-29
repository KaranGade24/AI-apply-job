import { FIELD_TYPES } from './fieldTypes.js';
import { generateQuestionId } from './formNormalizer.js';
import { logJobEvent } from '../../utils/logger.js';

/**
 * Inspects the current page DOM to extract questionnaire fields, steppers, password requirements, and modal state
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
export const inspectForm = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return { isQuestionnairePresent: false, fields: [], buttons: [], stepperState: { hasStepper: false } };
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

      // 2. Stepper / Multi-Stage Detection
      let stepperState = { hasStepper: false, currentStep: 1, totalSteps: 1, steps: [], activeStepName: '' };
      const stepperContainers = document.querySelectorAll(
        '[role="tablist"], .stepper, .step-indicator, [class*="wizard" i], [class*="stepper" i], [class*="progressBar" i], [data-automation-id*="step" i], ol[class*="step" i], ul[class*="step" i]'
      );

      for (const sc of stepperContainers) {
        const stepItems = sc.querySelectorAll('[role="tab"], li, [class*="step-item" i], [class*="stepItem" i], [class*="step" i]');
        if (stepItems.length >= 2) {
          const stepNames = [];
          let activeIndex = 1;
          stepItems.forEach((st, idx) => {
            const stText = (st.textContent || '').trim().replace(/\s+/g, ' ');
            const isActive =
              st.getAttribute('aria-selected') === 'true' ||
              st.getAttribute('aria-current') === 'step' ||
              /active|current|selected/i.test(st.className || '');
            if (stText && stText.length < 60) {
              stepNames.push(stText);
              if (isActive) activeIndex = idx + 1;
            }
          });

          if (stepNames.length >= 2) {
            stepperState = {
              hasStepper: true,
              currentStep: activeIndex,
              totalSteps: stepNames.length,
              steps: stepNames,
              activeStepName: stepNames[activeIndex - 1] || '',
            };
            break;
          }
        }
      }

      const pageText = document.body.innerText || '';

      // Fallback text-based stepper detection (e.g. "Step 1 of 5")
      if (!stepperState.hasStepper) {
        const stepTextMatch = pageText.match(/step\s*([0-9]+)\s*(?:of|\/)\s*([0-9]+)(?:\s*[:#-]?\s*([A-Za-z0-9_ -]+))?/i);
        if (stepTextMatch) {
          stepperState = {
            hasStepper: true,
            currentStep: parseInt(stepTextMatch[1], 10) || 1,
            totalSteps: parseInt(stepTextMatch[2], 10) || 1,
            steps: [stepTextMatch[3] ? stepTextMatch[3].trim() : `Step ${stepTextMatch[1]}`],
            activeStepName: stepTextMatch[3] ? stepTextMatch[3].trim() : `Step ${stepTextMatch[1]}`,
          };
        }
      }

      // 3. Extract Password Requirements if visible on page
      const passwordReqList = [];
      const reqHeaders = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, p, span, div, strong')).filter(
        (el) => /password requirements/i.test(el.textContent || '')
      );

      if (reqHeaders.length > 0) {
        const parentContainer = reqHeaders[0].closest('div, section, form') || reqHeaders[0].parentElement;
        if (parentContainer) {
          const listItems = parentContainer.querySelectorAll('li, p');
          listItems.forEach((li) => {
            const txt = (li.textContent || '').trim();
            if (txt && !/password requirements/i.test(txt) && txt.length < 80) {
              passwordReqList.push(txt);
            }
          });
        }
      }

      // Check if page already shows "Applied" confirmation
      const isAlreadyApplied =
        pageText.includes('Applied successfully') ||
        pageText.includes('You have successfully applied') ||
        pageText.includes('Application submitted') ||
        pageText.includes('Thank you for applying') ||
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
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="radiogroup"], [role="group"], [role="checkbox"]'
      );

      let hasPasswordField = false;
      let counter = 0;

      elements.forEach((el) => {
        // Skip invisible elements
        if (el.offsetParent === null && el.type !== 'file') return;

        const tagName = el.tagName.toLowerCase();
        const inputType = (el.getAttribute('type') || '').toLowerCase();
        const autoId = el.getAttribute('data-automation-id') || '';
        let detectedType = fieldTypes.TEXT;

        if (tagName === 'textarea') {
          detectedType = fieldTypes.TEXTAREA;
        } else if (tagName === 'select') {
          detectedType = fieldTypes.SELECT;
        } else if (inputType === 'radio' || el.getAttribute('role') === 'radiogroup') {
          detectedType = fieldTypes.RADIO;
        } else if (inputType === 'checkbox' || el.getAttribute('role') === 'checkbox' || /checkbox/i.test(autoId)) {
          detectedType = fieldTypes.CHECKBOX;
        } else if (inputType === 'file') {
          detectedType = fieldTypes.FILE;
        } else if (inputType === 'number') {
          detectedType = fieldTypes.NUMBER;
        } else if (inputType === 'email') {
          detectedType = fieldTypes.EMAIL;
        } else if (inputType === 'tel' || inputType === 'phone') {
          detectedType = fieldTypes.PHONE;
        } else if (
          inputType === 'password' ||
          el.getAttribute('type') === 'password' ||
          /password/i.test(autoId) ||
          /password/i.test(el.name || '') ||
          /password/i.test(el.id || '') ||
          /password/i.test(el.getAttribute('autocomplete') || '')
        ) {
          detectedType = fieldTypes.PASSWORD;
          hasPasswordField = true;
        }

        // Find label or associated question text
        let questionText = '';
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) questionText = lbl.textContent.trim();
        }

        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        if (!questionText && ariaLabelledBy) {
          const lblEl = document.getElementById(ariaLabelledBy);
          if (lblEl) questionText = lblEl.textContent.trim();
        }

        if (!questionText) {
          const parentLabel = el.closest('label');
          if (parentLabel) questionText = parentLabel.textContent.trim();
        }

        if (!questionText) {
          const parentContainer = el.closest(
            '.form-group, .question-wrap, .field-wrap, [class*="question"], [class*="field"], [data-automation-id*="formField"], div'
          );
          if (parentContainer) {
            const titleEl = parentContainer.querySelector(
              'h1, h2, h3, h4, h5, p, span.title, label, .label, [data-automation-id*="Label"], [data-automation-id*="label"]'
            );
            if (titleEl && titleEl !== el) {
              questionText = titleEl.textContent.trim();
            }
          }
        }

        if (!questionText) {
          questionText =
            el.getAttribute('placeholder') ||
            el.getAttribute('aria-label') ||
            autoId ||
            el.getAttribute('name') ||
            el.getAttribute('id') ||
            `Question ${counter + 1}`;
        }

        // Clean question text (remove asterisk, duplicate spaces)
        questionText = questionText.replace(/\s+/g, ' ').replace(/^\*|\*$/g, '').trim();

        // Check if question text indicates password
        if (detectedType === fieldTypes.TEXT && /password/i.test(questionText)) {
          detectedType = fieldTypes.PASSWORD;
          hasPasswordField = true;
        }

        // Detect terms of use agreement checkbox
        const isTermsAgreement =
          detectedType === fieldTypes.CHECKBOX &&
          (/terms|privacy|policy|consent|acknowledge|agree|accept|conditions|statement/i.test(questionText) ||
            /terms|privacy|policy|consent|agree|accept/i.test(el.getAttribute('aria-label') || '') ||
            /terms|privacy|policy|consent|agree|accept/i.test(el.name || '') ||
            /terms|privacy|policy|consent|agree|accept/i.test(autoId) ||
            /terms|privacy|policy|consent|agree|accept/i.test(el.closest('label, .form-group, div')?.textContent || ''));

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

        const fieldKey = el.name || el.id || autoId || `field_${counter}`;
        if (!seenNames.has(fieldKey)) {
          seenNames.add(fieldKey);
          fields.push({
            fieldId: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : autoId ? `[data-automation-id="${autoId}"]` : `input_${counter}`,
            name: el.name || el.id || autoId || '',
            dataAutomationId: autoId,
            type: detectedType,
            question: questionText,
            placeholder: el.getAttribute('placeholder') || '',
            required: el.required || el.getAttribute('aria-required') === 'true' || questionText.includes('*'),
            options,
            currentValue: el.value || '',
            requirements: detectedType === fieldTypes.PASSWORD ? passwordReqList : [],
            isTermsAgreement,
          });
          counter++;
        }
      });

      // Find actionable buttons (Create Account / Next / Continue / Save & Apply / Submit)
      const buttons = [];
      const btnEls = root.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]');
      btnEls.forEach((b) => {
        const txt = (b.textContent || b.value || '').trim().toLowerCase();
        if (/create account|sign up|register/i.test(txt)) {
          buttons.push({ type: 'create_account', text: b.textContent.trim(), selector: b.id ? `#${b.id}` : `button:has-text("${b.textContent.trim()}")` });
        } else if (/sign in|log in/i.test(txt)) {
          buttons.push({ type: 'sign_in', text: b.textContent.trim(), selector: b.id ? `#${b.id}` : `button:has-text("${b.textContent.trim()}")` });
        } else if (/submit|save & apply|apply now|confirm/i.test(txt)) {
          buttons.push({ type: 'submit', text: b.textContent.trim(), selector: b.id ? `#${b.id}` : `button:has-text("${b.textContent.trim()}")` });
        } else if (/next|continue|proceed|save & continue|save and continue/i.test(txt)) {
          buttons.push({ type: 'next', text: b.textContent.trim(), selector: b.id ? `#${b.id}` : `button:has-text("${b.textContent.trim()}")` });
        }
      });

      const isAccountCreation = hasPasswordField && (
        /create account/i.test(pageText) ||
        buttons.some((b) => b.type === 'create_account') ||
        fields.some((f) => /verify|confirm/i.test(f.question))
      );

      return {
        isAlreadyApplied,
        hasCaptcha,
        hasOtp,
        has2fa,
        hasPasswordField,
        isAccountCreation,
        stepperState,
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
      `Found ${normalizedFields.length} fields on current form. AccountCreation: ${formSnapshot.isAccountCreation}, Stepper: ${formSnapshot.stepperState?.hasStepper ? `Step ${formSnapshot.stepperState.currentStep}/${formSnapshot.stepperState.totalSteps}` : 'none'}`
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
      hasPasswordField: false,
      isAccountCreation: false,
      stepperState: { hasStepper: false, currentStep: 1, totalSteps: 1, steps: [] },
      fields: [],
      buttons: [],
    };
  }
};
