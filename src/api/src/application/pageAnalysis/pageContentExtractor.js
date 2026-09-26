import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Extracts rich, semantic DOM information from the rendered browser page.
 * Captures openings, accordions, buttons, reference IDs, and instructions
 * for LLM analysis.
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
        buttons: [],
        textSnippet: '',
        formFieldsCount: 0,
        emails: [],
        referenceIds: [],
      };
    }

    const snapshot = await page.evaluate(() => {
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

      // 2. Detect job openings / accordion cards (like "Node JS Developer", "AI ML Developer", etc.)
      const openingKeywords = [
        'developer', 'engineer', 'specialist', 'intern', 'analyst',
        'designer', 'manager', 'lead', 'architect', 'consultant',
        'qa', 'tester', 'full stack', 'frontend', 'backend', 'devops'
      ];

      const openings = [];
      const seenOpenings = new Set();

      // Look in cards, accordions, list items, buttons
      const candidateElements = document.querySelectorAll(
        '.accordion, .card, [class*="job" i], [class*="opening" i], [class*="position" i], [class*="career" i], button, a, h2, h3, h4, div'
      );

      candidateElements.forEach((el) => {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const isShort = text.length > 3 && text.length < 80;
        const matchesKeyword = openingKeywords.some((kw) => text.toLowerCase().includes(kw));

        if (isShort && matchesKeyword && !seenOpenings.has(text.toLowerCase())) {
          seenOpenings.add(text.toLowerCase());

          // Check if it has a reference ID or details inside or nearby
          const parent = el.closest('.accordion-item, .card, [class*="item" i], div') || el.parentElement;
          const parentText = parent ? (parent.textContent || '').slice(0, 300).trim() : '';

          openings.push({
            title: text,
            tag: el.tagName.toLowerCase(),
            className: el.className || '',
            id: el.id || '',
            parentPreview: parentText !== text ? parentText : '',
          });
        }
      });

      // 3. Collect interactive action buttons (especially "Apply Now", "Apply", "Submit")
      const buttonEls = document.querySelectorAll('button, a.btn, a[class*="button" i], [role="button"], input[type="submit"]');
      const buttons = [];
      buttonEls.forEach((btn, idx) => {
        const btnText = (btn.textContent || btn.value || '').trim().replace(/\s+/g, ' ');
        if (btnText && btnText.length < 60) {
          const isApplyRelated = /apply|submit|register|send|open/i.test(btnText);
          const selector = btn.id
            ? `#${btn.id}`
            : btn.getAttribute('data-id')
            ? `[data-id="${btn.getAttribute('data-id')}"]`
            : `${btn.tagName.toLowerCase()}:has-text("${btnText.slice(0, 30)}")`;

          // Find nearby job title or context
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

      // 4. Extract visible body text (clean and truncated)
      const rawBodyText = (document.body.innerText || '').replace(/\t/g, ' ').replace(/\n\s*\n/g, '\n');
      const textSnippet = rawBodyText.slice(0, 4500);

      // 5. Detect emails in page
      const emailMatches = rawBodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const emails = Array.from(new Set(emailMatches));

      // 6. Detect Reference Ids (e.g. "Reference Id : IN-NJ-01", "Job Code: 1234", "Req ID: ...")
      const refMatches = rawBodyText.match(/(?:reference\s*id|ref\s*id|job\s*code|req\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]+)/gi) || [];
      const referenceIds = Array.from(new Set(refMatches.map((m) => m.trim())));

      // 7. Count form inputs
      const formInputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      const formFieldsCount = formInputs.length;

      return {
        url,
        title,
        headings: headings.slice(0, 15),
        openings: openings.slice(0, 25),
        buttons: buttons.slice(0, 25),
        textSnippet,
        formFieldsCount,
        emails,
        referenceIds,
      };
    });

    await logJobEvent(
      'pageContentExtractor',
      'EXTRACTED',
      `URL: ${snapshot.url} | Title: "${snapshot.title}" | Openings detected: ${snapshot.openings.length} | Form fields: ${snapshot.formFieldsCount}`
    );

    return snapshot;
  } catch (error) {
    await logError('pageContentExtractor.extractPageContent', error.message);
    return {
      url: page?.url?.() || '',
      title: '',
      headings: [],
      openings: [],
      buttons: [],
      textSnippet: '',
      formFieldsCount: 0,
      emails: [],
      referenceIds: [],
    };
  }
};
