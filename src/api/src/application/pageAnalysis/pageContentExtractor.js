import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Extracts rich, semantic DOM information from the rendered browser page.
 * Captures openings, accordions, buttons, reference IDs, closed form alerts,
 * and direct email instructions for AI LLM analysis.
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

    // Check if any iframes contain Google Forms or closed form notices
    let iframeContent = '';
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame !== page.mainFrame()) {
          const frameText = await frame.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
          if (frameText) {
            iframeContent += `\n[IFRAME: ${frame.url()}]:\n${frameText.slice(0, 1500)}`;
          }
        }
      }
    } catch {
      // Ignore frame errors
    }

    const snapshot = await page.evaluate((extraIframeText) => {
      const url = window.location.href;
      const title = document.title || '';

      // 1. Collect all headings
      const headingEls = document.querySelectorAll('h1, h2, h3, h4, h5, [class*="title" i], [class*="heading" i]');
      const headings = [];
      headingEls.forEach((h) => {
        const txt = (h.textContent || '').trim().replace(/\s+/g, ' ');
        if (txt && txt.length < 120 && !headings.includes(txt)) {
          headings.push(txt);
        }
      });

      // 2. Extract visible body text + iframe text
      const rawBodyText = ((document.body ? document.body.innerText : '') + '\n' + extraIframeText)
        .replace(/\t/g, ' ')
        .replace(/\n\s*\n/g, '\n');
      const textSnippet = rawBodyText.slice(0, 5000);

      // 3. Detect Closed Forms / Dead Google Forms
      // e.g. "The form RajYug_2025_Recruitment is no longer accepting responses. Try contacting the owner of the form if you think this is a mistake."
      let isFormClosed = false;
      let closedFormTitle = '';
      let closedFormMessage = '';

      const closedFormRegex = /(?:the\s+form\s+([A-Za-z0-9_ -]+)\s+is\s+no\s+longer\s+accepting\s+responses|no\s+longer\s+accepting\s+responses|responses\s+are\s+closed|form\s+closed|applications\s+closed|position\s+closed|job\s+expired)/i;
      const closedMatch = rawBodyText.match(closedFormRegex);

      if (closedMatch) {
        isFormClosed = true;
        if (closedMatch[1]) {
          closedFormTitle = closedMatch[1].trim();
        }
        // Extract the surrounding 1-2 sentences for clear display
        const matchIdx = rawBodyText.indexOf(closedMatch[0]);
        const snippetStart = Math.max(0, matchIdx - 20);
        const snippetEnd = Math.min(rawBodyText.length, matchIdx + 200);
        closedFormMessage = rawBodyText.substring(snippetStart, snippetEnd).replace(/\n/g, ' ').trim();
      }

      // 4. Detect emails in page
      const emailMatches = rawBodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const emails = Array.from(new Set(emailMatches));

      // 5. Detect Reference Ids (e.g. "Reference Id : IN-NJ-01", "Job Code: 1234", "Req ID: ...")
      const refMatches = rawBodyText.match(/(?:reference\s*id|ref\s*id|job\s*code|req\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]+)/gi) || [];
      const referenceIds = Array.from(new Set(refMatches.map((m) => m.trim())));

      // 6. Detect rich job openings / accordion cards (like "Node JS Developer", "AI ML Developer", etc.)
      const openingKeywords = [
        'developer', 'engineer', 'specialist', 'intern', 'analyst',
        'designer', 'manager', 'lead', 'architect', 'consultant',
        'qa', 'tester', 'full stack', 'frontend', 'backend', 'devops',
        'executive', 'specialist', 'recruitment', 'associate'
      ];

      const openings = [];
      const openingsList = [];
      const seenOpenings = new Set();

      const candidateElements = document.querySelectorAll(
        '.accordion, .accordion-item, .card, [class*="job" i], [class*="opening" i], [class*="position" i], [class*="career" i], button, a, h2, h3, h4, div'
      );

      candidateElements.forEach((el, index) => {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const isShort = text.length > 3 && text.length < 80;
        const matchesKeyword = openingKeywords.some((kw) => text.toLowerCase().includes(kw));

        if (isShort && matchesKeyword && !seenOpenings.has(text.toLowerCase())) {
          seenOpenings.add(text.toLowerCase());

          // Search parent container for rich context (Ref ID, Experience, Location, Inner Description)
          const parent = el.closest('.accordion-item, .accordion, .card, [class*="item" i], div') || el.parentElement;
          const parentText = parent ? (parent.textContent || '').slice(0, 500).trim().replace(/\s+/g, ' ') : '';

          // Find specific reference ID inside parent
          const roleRefMatch = parentText.match(/(?:reference\s*id|ref\s*id|job\s*code|req\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]+)/i);
          const roleRef = roleRefMatch ? roleRefMatch[1] : '';

          // Find specific experience
          const roleExpMatch = parentText.match(/(?:experience|exp)\s*[:#-]?\s*([0-9]+(?:\s*-\s*[0-9]+|\+)?\s*(?:years|yrs|year|yr))/i);
          const roleExp = roleExpMatch ? roleExpMatch[1] : '';

          // Find location
          const roleLocMatch = parentText.match(/(?:location|loc)\s*[:#-]?\s*([A-Za-z]+(?:\s*,\s*[A-Za-z]+)?)/i);
          const roleLoc = roleLocMatch ? roleLocMatch[1] : '';

          // Check if parent has an Apply button
          const applyBtn = parent ? parent.querySelector('button, a[class*="btn" i], [role="button"]') : null;
          const hasApplyBtn = !!applyBtn;
          const buttonText = applyBtn ? (applyBtn.textContent || applyBtn.value || 'Apply Now').trim() : 'Apply Now';

          const openingObj = {
            id: `role-${index}`,
            title: text,
            referenceId: roleRef || (referenceIds[0] || ''),
            experience: roleExp || '',
            location: roleLoc || '',
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
            parentPreview: parentText !== text ? parentText : '',
          });
        }
      });

      // 7. Extract Direct Email Application Instructions if present
      // e.g. "Send resume to: Recruitment@Rajyugsolutions.com with Ref ID: Reference Id : IN-AI-02"
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

      // 8. Collect interactive action buttons
      const buttonEls = document.querySelectorAll('button, a.btn, a[class*="button" i], [role="button"], input[type="submit"]');
      const buttons = [];
      buttonEls.forEach((btn) => {
        const btnText = (btn.textContent || btn.value || '').trim().replace(/\s+/g, ' ');
        if (btnText && btnText.length < 60) {
          const isApplyRelated = /apply|submit|register|send|open/i.test(btnText);
          const selector = btn.id
            ? `#${btn.id}`
            : btn.getAttribute('data-id')
            ? `[data-id="${btn.getAttribute('data-id')}"]`
            : `${btn.tagName.toLowerCase()}:has-text("${btnText.slice(0, 30)}")`;

          const container = btn.closest('.accordion, .card, [class*="job" i], [class*="item" i], li, div');
          const contextTitle = container ? (container.querySelector('h1, h2, h3, h4, [class*="title" i]')?.textContent || '').trim() : '';

          buttons.push({
            text: btnText,
            isApplyRelated,
            selector,
            contextTitle,
            id: btn.id || '',
            href: btn.getAttribute('href') || '',
          });
        }
      });

      // 9. Count visible form inputs
      const formInputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      const formFieldsCount = formInputs.length;

      return {
        url,
        title,
        headings: headings.slice(0, 15),
        openings: openings.slice(0, 30),
        openingsList: openingsList.slice(0, 30),
        buttons: buttons.slice(0, 25),
        textSnippet,
        formFieldsCount,
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
      `URL: ${snapshot.url} | Title: "${snapshot.title}" | Openings detected: ${snapshot.openingsList.length} | Form fields: ${snapshot.formFieldsCount} | Form Closed: ${snapshot.isFormClosed ? 'YES (' + snapshot.closedFormTitle + ')' : 'NO'}`
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
