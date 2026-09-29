import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Extracts rich, semantic DOM information from the rendered browser page.
 * Universally handles SPAs (Workday, Greenhouse, Lever, Taleo), static pages,
 * Google Forms, accordions, buttons, file dropzones, and email instructions.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
export const extractPageContent = async (page) => {
  try {
    if (!page || page.isClosed()) {
      return {
        url: '',
        title: '',
        headings: [],
        openings: [],
        openingsList: [],
        buttons: [],
        links: [],
        textSnippet: '',
        formFieldsCount: 0,
        emails: [],
        referenceIds: [],
        isFormClosed: false,
        closedFormTitle: '',
        closedFormMessage: '',
        emailInstructions: null,
      };
    }

    // Wait briefly for dynamic SPAs (Workday, Greenhouse, React) to render content
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1500);

    // Check if any iframes contain content or forms
    let iframeContent = '';
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame !== page.mainFrame()) {
          const frameText = await frame.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
          if (frameText && frameText.length > 20) {
            iframeContent += `\n[IFRAME: ${frame.url()}]:\n${frameText.slice(0, 2000)}`;
          }
        }
      }
    } catch {
      // Ignore frame errors
    }

    const snapshot = await page.evaluate((extraIframeText) => {
      const url = window.location.href;
      const title = (document.title || '').trim();

      // 1. Collect all headings
      const headingEls = document.querySelectorAll('h1, h2, h3, h4, h5, [class*="title" i], [class*="heading" i], [data-automation-id*="title" i]');
      const headings = [];
      headingEls.forEach((h) => {
        const txt = (h.textContent || '').trim().replace(/\s+/g, ' ');
        if (txt && txt.length > 2 && txt.length < 150 && !headings.includes(txt)) {
          headings.push(txt);
        }
      });

      // 2. Extract visible body text + iframe text
      const rawBodyText = ((document.body ? document.body.innerText : '') + '\n' + extraIframeText)
        .replace(/\t/g, ' ')
        .replace(/\n\s*\n/g, '\n');
      const textSnippet = rawBodyText.slice(0, 7000);

      // 3. Detect Closed Forms / Expired Listings
      let isFormClosed = false;
      let closedFormTitle = '';
      let closedFormMessage = '';

      const closedFormRegex = /(?:the\s+form\s+([A-Za-z0-9_ -]+)\s+is\s+no\s+longer\s+accepting\s+responses|no\s+longer\s+accepting\s+responses|responses\s+are\s+closed|form\s+closed|applications\s+closed|position\s+closed|job\s+expired|job\s+is\s+no\s+longer\s+available)/i;
      const closedMatch = rawBodyText.match(closedFormRegex);

      if (closedMatch) {
        isFormClosed = true;
        if (closedMatch[1]) {
          closedFormTitle = closedMatch[1].trim();
        }
        const matchIdx = rawBodyText.indexOf(closedMatch[0]);
        const snippetStart = Math.max(0, matchIdx - 20);
        const snippetEnd = Math.min(rawBodyText.length, matchIdx + 200);
        closedFormMessage = rawBodyText.substring(snippetStart, snippetEnd).replace(/\n/g, ' ').trim();
      }

      // 4. Detect emails in page
      const emailMatches = rawBodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const emails = Array.from(new Set(emailMatches));

      // 5. Detect Reference Ids / Req IDs (e.g. JR100355, Ref: IN-NJ-01, Req ID: 12345)
      const refMatches = rawBodyText.match(/(?:reference\s*id|ref\s*id|job\s*code|req\s*id|job\s*requisition\s*id|posting\s*id|job\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]+)/gi) || [];
      const reqIdPattern = rawBodyText.match(/\b(JR[0-9]{4,}|REQ[-_]?[0-9]{4,}|JOB[-_]?[0-9]{4,})\b/gi) || [];
      const combinedRefs = [...refMatches.map((m) => m.trim()), ...reqIdPattern.map((m) => m.trim())];
      const referenceIds = Array.from(new Set(combinedRefs));

      // 6. Detect rich job openings / accordion cards / role titles
      const openingKeywords = [
        'developer', 'engineer', 'specialist', 'intern', 'analyst',
        'designer', 'manager', 'lead', 'architect', 'consultant',
        'qa', 'tester', 'full stack', 'frontend', 'backend', 'devops',
        'executive', 'associate', 'administrator', 'programmer'
      ];

      const openings = [];
      const openingsList = [];
      const seenOpenings = new Set();

      const candidateElements = document.querySelectorAll(
        '.accordion, .accordion-item, .card, [class*="job" i], [class*="opening" i], [class*="position" i], [class*="career" i], [data-automation-id*="job" i], [data-automation-id*="title" i], h1, h2, h3, h4, div'
      );

      candidateElements.forEach((el, index) => {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const isShort = text.length > 3 && text.length < 90;
        const matchesKeyword = openingKeywords.some((kw) => text.toLowerCase().includes(kw));

        if (isShort && matchesKeyword && !seenOpenings.has(text.toLowerCase())) {
          seenOpenings.add(text.toLowerCase());

          const parent = el.closest('.accordion-item, .accordion, .card, [class*="item" i], div') || el.parentElement;
          const parentText = parent ? (parent.textContent || '').slice(0, 600).trim().replace(/\s+/g, ' ') : '';

          const roleRefMatch = parentText.match(/(?:reference\s*id|ref\s*id|job\s*code|req\s*id|posting\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]+)/i);
          const roleRef = roleRefMatch ? roleRefMatch[1] : (referenceIds[0] || '');

          const roleExpMatch = parentText.match(/(?:experience|exp)\s*[:#-]?\s*([0-9]+(?:\s*-\s*[0-9]+|\+)?\s*(?:years|yrs|year|yr))/i);
          const roleExp = roleExpMatch ? roleExpMatch[1] : '';

          const roleLocMatch = parentText.match(/(?:location|loc)\s*[:#-]?\s*([A-Za-z]+(?:\s*,\s*[A-Za-z]+)?)/i);
          const roleLoc = roleLocMatch ? roleLocMatch[1] : '';

          const applyBtn = parent ? parent.querySelector('button, a[class*="btn" i], [role="button"], [data-automation-id*="apply" i]') : null;
          const hasApplyBtn = !!applyBtn;
          const buttonText = applyBtn ? (applyBtn.textContent || applyBtn.value || 'Apply').trim() : 'Apply';

          const openingObj = {
            id: `role-${index}`,
            title: text,
            referenceId: roleRef,
            experience: roleExp,
            location: roleLoc,
            descriptionSnippet: parentText !== text ? parentText.slice(0, 250) : '',
            email: emails[0] || '',
            hasApplyBtn,
            buttonText,
          };

          openingsList.push(openingObj);
          openings.push({
            title: text,
            tag: el.tagName.toLowerCase(),
            className: el.className || '',
            id: el.id || '',
          });
        }
      });

      // 7. Extract Direct Email Application Instructions if present
      let emailInstructions = null;
      if (emails.length > 0) {
        const emailIndex = rawBodyText.indexOf(emails[0]);
        const emailSnippet = rawBodyText.substring(Math.max(0, emailIndex - 50), Math.min(rawBodyText.length, emailIndex + 120)).trim();
        emailInstructions = {
          email: emails[0],
          referenceId: referenceIds[0] || '',
          instructionText: emailSnippet,
          subjectSuggestion: referenceIds[0] 
            ? `Application for Job Position - Ref ID: ${referenceIds[0]}`
            : `Application for Job Position`,
        };
      }

      // 8. Extract Modal / Drawer Overlay State
      let modalState = { isOpen: false, title: '', inputCount: 0, buttonCount: 0, selector: '' };
      const modalEls = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal.show, .modal.in, .drawer, .apply-modal, .chatbot_drawer, [class*="apply-container" i], [class*="applyModal" i]');
      for (const m of modalEls) {
        const isVisible = m.offsetParent !== null || m.offsetHeight > 100 || window.getComputedStyle(m).display !== 'none';
        if (isVisible) {
          const mTitle = (m.querySelector('h1, h2, h3, h4, [class*="title" i], [class*="header" i]')?.textContent || '').trim().replace(/\s+/g, ' ');
          const mInputs = m.querySelectorAll('input:not([type="hidden"]), textarea, select').length;
          const mButtons = m.querySelectorAll('button, a.btn, [role="button"]').length;
          modalState = {
            isOpen: true,
            title: mTitle || 'Application Modal / Drawer',
            inputCount: mInputs,
            buttonCount: mButtons,
            selector: m.id ? `#${m.id}` : m.className ? `.${m.className.trim().split(/\s+/)[0]}` : '[role="dialog"]',
          };
          break;
        }
      }

      // 9. Extract Multi-Step Wizard & Stepper Indicators
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
            const isActive = st.getAttribute('aria-selected') === 'true' || /active|current|selected/i.test(st.className || '');
            if (stText && stText.length < 50) {
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

      if (!stepperState.hasStepper) {
        const stepTextMatch = rawBodyText.match(/step\s*([0-9]+)\s*(?:of|\/)\s*([0-9]+)(?:\s*[:#-]?\s*([A-Za-z0-9_ -]+))?/i);
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

      // 10. Extract Structured Form Sections & Questions
      const formSections = [];
      const sectionContainers = document.querySelectorAll('fieldset, [class*="form-section" i], [class*="formSection" i], [data-automation-id*="section" i], form, [class*="questionnaire" i]');
      sectionContainers.forEach((sec, sIdx) => {
        const legend = (sec.querySelector('legend, h2, h3, h4, [class*="title" i]')?.textContent || '').trim().replace(/\s+/g, ' ');
        const secInputs = sec.querySelectorAll('input:not([type="hidden"]), textarea, select');
        if (secInputs.length > 0) {
          const fieldsSummary = [];
          secInputs.forEach((inp) => {
            const lbl = inp.id ? document.querySelector(`label[for="${inp.id}"]`)?.textContent : inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || inp.name;
            const isReq = inp.hasAttribute('required') || inp.getAttribute('aria-required') === 'true' || (lbl && lbl.includes('*'));
            fieldsSummary.push({
              name: inp.name || inp.id || 'field',
              label: (lbl || '').trim().replace(/\s+/g, ' ').slice(0, 60),
              type: inp.tagName.toLowerCase() === 'select' ? 'select' : inp.tagName.toLowerCase() === 'textarea' ? 'textarea' : inp.type || 'text',
              required: Boolean(isReq),
            });
          });
          formSections.push({
            sectionIndex: sIdx + 1,
            title: legend || `Section ${sIdx + 1}`,
            fieldsCount: secInputs.length,
            fields: fieldsSummary.slice(0, 10),
          });
        }
      });

      // 11. Extract Candidate Account / Auth Gateway States
      const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const hasApplyButton = Boolean(
        document.querySelector('[data-automation-id="apply-button"], a[data-automation-id="apply-button"]') ||
        allButtons.some((b) => /^(?:apply|apply now)$/i.test((b.textContent || '').trim()))
      );
      const hasAutofillWithResume = Boolean(
        document.querySelector('[data-automation-id="autofill-with-resume"]') ||
        allButtons.some((b) => /autofill with resume/i.test(b.textContent || ''))
      );
      const hasApplyManually = Boolean(
        document.querySelector('[data-automation-id="apply-manually"]') ||
        allButtons.some((b) => /apply manually/i.test(b.textContent || ''))
      );
      const hasSocialApply = Boolean(
        document.querySelector('[data-automation-id*="linkedin" i], [data-automation-id*="indeed" i], [class*="linkedin" i]')
      );
      const isAuthRequired = !hasApplyButton && !hasAutofillWithResume && !hasApplyManually && Boolean(
        document.querySelector('input[type="password"]') ||
        ((url.includes('/login') || url.includes('/signin')) && !url.includes('/job/'))
      );

      const authGateway = {
        hasApplyButton,
        isAuthRequired,
        hasSocialApply,
        hasAutofillWithResume,
        hasApplyManually,
      };

      // 12. Collect ALL interactive action buttons and links
      const buttonEls = document.querySelectorAll(
        'button, a.btn, a[class*="button" i], [role="button"], input[type="submit"], [data-automation-id*="button" i], [data-automation-id*="apply" i], [data-qa*="apply" i]'
      );
      const buttons = [];
      buttonEls.forEach((btn) => {
        const btnText = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (btnText && btnText.length < 80) {
          const isApplyRelated = /apply|submit|register|autofill|continue|next|proceed|start|send|upload/i.test(btnText);
          const autoId = btn.getAttribute('data-automation-id');
          const selector = autoId
            ? `[data-automation-id="${autoId}"]`
            : btn.id
            ? `#${btn.id}`
            : `${btn.tagName.toLowerCase()}:has-text("${btnText.slice(0, 30)}")`;

          buttons.push({
            text: btnText,
            isApplyRelated,
            selector,
            automationId: autoId || '',
            id: btn.id || '',
            href: btn.getAttribute('href') || '',
            role: btn.getAttribute('role') || btn.tagName.toLowerCase(),
          });
        }
      });

      // 13. Count visible form inputs and file upload dropzones
      const formInputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      const formFieldsCount = formInputs.length;
      const fileInputsCount = document.querySelectorAll('input[type="file"], [class*="upload" i], [class*="dropzone" i]').length;

      return {
        url,
        title,
        headings: headings.slice(0, 20),
        openings: openings.slice(0, 30),
        openingsList: openingsList.slice(0, 30),
        buttons: buttons.slice(0, 35),
        modalState,
        stepperState,
        formSections: formSections.slice(0, 6),
        authGateway,
        textSnippet,
        formFieldsCount,
        fileInputsCount,
        emails,
        referenceIds,
        isFormClosed,
        closedFormTitle,
        closedFormMessage,
        emailInstructions,
      };
    }, iframeContent);

    await logJobEvent(
      'pageContentExtractor',
      'EXTRACTED',
      `URL: ${snapshot.url} | Title: "${snapshot.title}" | Openings: ${snapshot.openingsList.length} | Form fields: ${snapshot.formFieldsCount} | Buttons: ${snapshot.buttons.length}`
    );

    return snapshot;
  } catch (error) {
    await logError('pageContentExtractor.extractPageContent', error.message);
    return {
      url: page?.url?.() || '',
      title: '',
      headings: [],
      openings: [],
      openingsList: [],
      buttons: [],
      textSnippet: '',
      formFieldsCount: 0,
      emails: [],
      referenceIds: [],
      isFormClosed: false,
      closedFormTitle: '',
      closedFormMessage: '',
      emailInstructions: null,
    };
  }
};
