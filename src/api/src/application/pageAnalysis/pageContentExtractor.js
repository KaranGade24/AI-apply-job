import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * High-fidelity, deterministic page content extractor.
 * Extracts structured semantic details, accessibility attributes, forms, stepper states,
 * validation errors, and loading/success states without raw HTML noise.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object>} Clean, structured page snapshot
 */
export const extractPageContent = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return {
        url: '',
        title: '',
        headings: [],
        buttons: [],
        forms: [],
        formFieldsCount: 0,
        fileInputsCount: 0,
        accessibilityInfo: {},
        modalState: { isOpen: false },
        stepperState: { hasStepper: false },
        validationErrors: [],
        loadingState: { isLoading: false },
        successEvidence: { level: 0, confirmationId: null },
        isFormClosed: false,
        textSnippet: ''
      };
    }

    // Wait briefly for SPAs/dynamic state to settle
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const currentUrl = (page.url() || '').toLowerCase();
    if (currentUrl.includes('workday') || currentUrl.includes('apply') || currentUrl.includes('job')) {
      await page.waitForSelector('main, [data-automation-id], form, input, button, [role="main"], [role="dialog"]', { timeout: 3500 }).catch(() => {});
    }

    // Collect iframe text safely
    let iframeContent = '';
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame !== page.mainFrame()) {
          const frameText = await frame.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
          if (frameText && frameText.length > 20) {
            iframeContent += `\n[IFRAME: ${frame.url()}]:\n${frameText.slice(0, 1000)}`;
          }
        }
      }
    } catch {
      // Ignore frame errors
    }

    // Evaluate comprehensive page extraction inside browser context
    const snapshot = await page.evaluate((extraIframeText) => {
      const url = window.location.href;
      const title = (document.title || '').trim();

      // 1. Relevant Headings extraction
      const headings = [];
      const headingEls = document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"]');
      headingEls.forEach(h => {
        const txt = (h.textContent || '').trim().replace(/\s+/g, ' ');
        if (txt && txt.length > 2 && txt.length < 120 && !headings.includes(txt)) {
          headings.push(txt);
        }
      });

      // 2. Active Form Sections & Controls extraction
      const forms = [];
      const formContainers = document.querySelectorAll('form, fieldset, [class*="form-section" i], [class*="formSection" i]');
      formContainers.forEach((sec, sIdx) => {
        const legend = (sec.querySelector('legend, h2, h3, [class*="title" i]')?.textContent || '').trim();
        const inputs = sec.querySelectorAll('input:not([type="hidden"]), textarea, select');
        
        if (inputs.length > 0) {
          const fields = [];
          inputs.forEach(inp => {
            const lbl = inp.id ? document.querySelector(`label[for="${inp.id}"]`)?.textContent : null;
            const fallbackLbl = inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || inp.name || '';
            const isReq = inp.hasAttribute('required') || inp.getAttribute('aria-required') === 'true' || (lbl && lbl.includes('*'));
            
            fields.push({
              id: inp.id || '',
              name: inp.name || '',
              label: (lbl || fallbackLbl || 'input_field').trim().replace(/\s+/g, ' ').slice(0, 50),
              type: inp.tagName.toLowerCase() === 'select' ? 'select' : inp.type || 'text',
              required: Boolean(isReq)
            });
          });

          forms.push({
            sectionIndex: sIdx + 1,
            title: legend || `Form Section ${sIdx + 1}`,
            fieldsCount: inputs.length,
            fields: fields.slice(0, 12)
          });
        }
      });

      // 3. Interactive Buttons & Accessible Links
      const buttons = [];
      const buttonEls = document.querySelectorAll('button, a.btn, [role="button"], input[type="submit"]');
      buttonEls.forEach((btn, idx) => {
        const btnText = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (btnText && btnText.length < 80) {
          const autoId = btn.getAttribute('data-automation-id') || btn.getAttribute('data-testid') || '';
          const role = btn.getAttribute('role') || btn.tagName.toLowerCase();
          const isApplyRelated = /apply|submit|continue|next|agree|autofill|proceed/i.test(btnText);
          
          buttons.push({
            elementId: btn.id || `btn-${idx}`,
            elementFingerprint: `finger-btn-${idx}-${btnText.slice(0, 10).replace(/[^a-zA-Z]/g, '')}`,
            role,
            accessibleName: btn.getAttribute('aria-label') || btnText,
            label: btnText,
            text: btnText,
            type: btn.tagName.toLowerCase(),
            state: {
              visible: btn.offsetParent !== null,
              enabled: !btn.disabled
            },
            isApplyRelated,
            selector: autoId ? `[data-automation-id="${autoId}"]` : (btn.id ? `#${btn.id}` : `${btn.tagName.toLowerCase()}:has-text("${btnText.slice(0, 20)}")`)
          });
        }
      });

      // 4. Modal and Drawer context detection
      let modalState = { isOpen: false, title: '', inputCount: 0, selector: '' };
      const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal.show, .apply-modal');
      for (const m of modals) {
        const isVisible = m.offsetParent !== null || m.offsetHeight > 100;
        if (isVisible) {
          const mTitle = (m.querySelector('h1, h2, h3, [class*="title" i]')?.textContent || '').trim();
          const mInputs = m.querySelectorAll('input:not([type="hidden"]), textarea, select').length;
          modalState = {
            isOpen: true,
            title: mTitle || 'Interactive Overlaid Modal',
            inputCount: mInputs,
            selector: m.id ? `#${m.id}` : '[role="dialog"]'
          };
          break;
        }
      }

      // 5. Multi-Step Stepper context
      let stepperState = { hasStepper: false, currentStep: 1, totalSteps: 1, activeStepName: '' };
      const stepIndicators = document.querySelectorAll('.stepper, .step-indicator, [class*="progressBar" i], ol[class*="step" i]');
      for (const sc of stepIndicators) {
        const steps = sc.querySelectorAll('li, [class*="step-item" i]');
        if (steps.length >= 2) {
          let activeIdx = 1;
          steps.forEach((st, idx) => {
            if (st.getAttribute('aria-selected') === 'true' || /active|current/i.test(st.className)) {
              activeIdx = idx + 1;
            }
          });
          stepperState = {
            hasStepper: true,
            currentStep: activeIdx,
            totalSteps: steps.length,
            activeStepName: steps[activeIdx - 1]?.textContent?.trim() || ''
          };
          break;
        }
      }

      // 6. Active Loading indicators / Spinnners
      const isSpinnerVisible = Array.from(document.querySelectorAll('.spinner, .loader, .loading, [aria-busy="true"], [class*="loading" i]'))
        .some(el => el.offsetParent !== null || el.offsetHeight > 0);
      const loadingState = { isLoading: isSpinnerVisible };

      // 7. Active Validation / Form error alerts
      const validationErrors = [];
      const errorEls = document.querySelectorAll('.error, .invalid, .alert-danger, [role="alert"], .field-validation-error, [class*="errorMessage" i]');
      errorEls.forEach(err => {
        const txt = (err.textContent || '').trim().replace(/\s+/g, ' ');
        if (txt && txt.length > 3 && txt.length < 200 && !validationErrors.includes(txt)) {
          validationErrors.push(txt);
        }
      });

      // 8. Structured Success / Receipt confirmation code search
      let successEvidence = { level: 0, confirmationId: null };
      const receiptMatch = ((document.body ? document.body.innerText : '')).match(/(?:confirmation|reference|receipt|submission)\s*(?:code|id|number|#|no)?\s*(?::|=|\s)\s*([a-zA-Z0-9-]{4,15})/i);
      if (receiptMatch) {
        successEvidence = { level: 4, confirmationId: receiptMatch[1] };
      } else if (/(thank\s+you\s+for\s+applying|application\s+received)/i.test((document.body ? document.body.innerText : ''))) {
        successEvidence = { level: 2, confirmationId: null };
      }

      // 9. Closed Form Detection
      const isFormClosed = /(applications\s+closed|no\s+longer\s+accepting|job\s+expired|form\s+closed)/i.test((document.body ? document.body.innerText : ''));

      // Raw text snippet extraction
      const bodyText = (document.body ? document.body.innerText : '') + '\n' + extraIframeText;
      const textSnippet = bodyText.replace(/\s+/g, ' ').slice(0, 4000);

      // Accessibility general information
      const accessibilityInfo = {
        hasAriaModal: document.querySelectorAll('[aria-modal="true"]').length > 0,
        mainRole: document.querySelector('main')?.getAttribute('role') || 'none',
        roleAlertsCount: document.querySelectorAll('[role="alert"]').length
      };

      const formFieldsCount = document.querySelectorAll(
        'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [data-automation-id*="input" i], [data-automation-id*="select" i]'
      ).length;
      const fileInputsCount = document.querySelectorAll(
        'input[type="file"], [data-automation-id*="drop-zone" i], [data-automation-id*="dropzone" i], [data-automation-id*="file" i], .drop-zone, .file-upload-dropzone'
      ).length;

      return {
        url,
        title,
        headings: headings.slice(0, 15),
        buttons,
        forms,
        formFieldsCount,
        fileInputsCount,
        accessibilityInfo,
        modalState,
        stepperState,
        validationErrors,
        loadingState,
        successEvidence,
        isFormClosed,
        textSnippet
      };
    }, iframeContent);

    await logJobEvent(
      'pageContentExtractor',
      'EXTRACTED_DETAILED',
      `URL: ${snapshot.url} | Title: "${snapshot.title}" | Form fields: ${snapshot.formFieldsCount} | Load state: ${snapshot.loadingState.isLoading} | Errors: ${snapshot.validationErrors.length}`
    );

    return snapshot;
  } catch (error) {
    await logError('pageContentExtractor.extractPageContent', error.message);
    return {
      url: page?.url?.() || '',
      title: '',
      headings: [],
      buttons: [],
      forms: [],
      formFieldsCount: 0,
      fileInputsCount: 0,
      accessibilityInfo: {},
      modalState: { isOpen: false },
      stepperState: { hasStepper: false },
      validationErrors: [],
      loadingState: { isLoading: false },
      successEvidence: { level: 0, confirmationId: null },
      isFormClosed: false,
      textSnippet: ''
    };
  }
};
