import { logJobEvent, logError } from '../../utils/logger.js';
import { BrowserManager } from '../../browser/browserManager.js';
import { extractPageContent } from '../pageAnalysis/pageContentExtractor.js';
import { classifyPageWithLlm } from '../pageAnalysis/pageClassifierLlm.js';
import { inspectForm } from '../form/formInspector.js';
import { isGoogleFormUrl } from '../googleForm/googleFormFiller.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import {
  getDecryptedGoogleSession,
  injectGoogleSessionIntoContext,
} from '../../services/googleSession.service.js';

/**
 * UnknownPageHandler — Full browser-based AI agent for unknown application URLs.
 *
 * Strategy:
 * 1. Open the URL in a headless browser.
 * 2. Extract all DOM content (text, buttons, emails, forms, openings, reference IDs).
 * 3. Send to LLM for semantic page classification.
 * 4. Based on LLM decision, determine best application action:
 *    - email          → extract email, return for email workflow
 *    - phone          → extract phone, return for phone workflow
 *    - google_form    → redirect to Google Form handler
 *    - custom_form    → extract & fill custom form fields
 *    - fill_form      → inspect & fill visible form
 *    - unknown        → return human_review
 *
 * @param {object} params
 * @param {string} params.url - The unknown URL to analyze
 * @param {object} params.job - Job document
 * @param {string} params.userId - User ID
 * @param {object} [params.sessionState] - Optional saved browser session state
 * @returns {Promise<object>} Analysis result with detected method and extracted data
 */
export const analyzeUnknownPage = async ({ url, job, userId, sessionState = null }) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!url) {
      throw new Error('No URL provided for unknown page analysis');
    }

    await logJobEvent(
      'unknownPageHandler',
      'ANALYZE_START',
      `Analyzing unknown page: ${url}`
    );

    const effectiveStorageState =
      sessionState || (userId ? await getDecryptedGoogleSession(userId) : null);

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(
      browser,
      effectiveStorageState ? { storageState: effectiveStorageState } : {}
    );
    if (userId) {
      await injectGoogleSessionIntoContext(context, userId);
    }
    page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2500);

    // Handle possible redirects to new tabs (career portals often open in _blank)
    let activePage = page;
    const newPagePromise = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
    const popup = await newPagePromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      activePage = popup;
      await activePage.waitForTimeout(2000);
    }

    const currentUrl = activePage.url();

    // Quick check: if redirected to a Google Form, signal for Google Form handler
    if (isGoogleFormUrl(currentUrl)) {
      await logJobEvent(
        'unknownPageHandler',
        'GOOGLE_FORM_DETECTED',
        `Redirected to Google Form: ${currentUrl}`
      );
      return {
        detectedMethod: 'google_form',
        googleFormUrl: currentUrl,
        pageUrl: currentUrl,
        emails: [],
        phoneNumbers: [],
        formFields: [],
        analysis: null,
        message: 'Page redirected to a Google Form',
      };
    }

    // Extract rich DOM content
    const extracted = await extractPageContent(activePage);

    // LLM semantic classification
    const analysis = await classifyPageWithLlm(extracted, job || {}, userId);

    // Extract phone numbers from page text
    const pageText = extracted.textSnippet || '';
    const phoneMatches = pageText.match(
      /(?:\+91[-\s]?)?(?:\+1[-\s]?)?(?:\(?\d{3,4}\)?[-\s]?)?\d{3,4}[-\s]?\d{4,6}/g
    ) || [];
    const phoneNumbers = Array.from(new Set(phoneMatches.filter((p) => p.replace(/\D/g, '').length >= 8)));

    // Inspect active form fields
    const formInspection = await inspectForm(activePage);

    // Detect any Google Form iframes or links
    const embeddedGoogleFormUrl = await activePage.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe[src]'));
      for (const iframe of iframes) {
        const src = iframe.getAttribute('src') || '';
        if (src.includes('docs.google.com/forms') || src.includes('forms.gle')) return src;
      }
      const links = Array.from(document.querySelectorAll('a[href]'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('docs.google.com/forms') || href.includes('forms.gle')) return href;
      }
      return null;
    }).catch(() => null);

    // If Google Form found embedded or linked on this page
    if (embeddedGoogleFormUrl) {
      await logJobEvent(
        'unknownPageHandler',
        'GOOGLE_FORM_LINK_FOUND',
        `Found Google Form link on page: ${embeddedGoogleFormUrl}`
      );
      return {
        detectedMethod: 'google_form',
        googleFormUrl: embeddedGoogleFormUrl,
        pageUrl: currentUrl,
        emails: extracted.emails || [],
        phoneNumbers,
        formFields: formInspection.fields || [],
        analysis,
        message: 'Google Form link detected on the page',
      };
    }

    // Determine the actual detected method based on LLM analysis + heuristics
    let detectedMethod = 'unknown';
    const nextAction = analysis?.nextRecommendedAction || 'unknown';

    if (nextAction === 'send_email' || nextAction === 'form_closed_fallback_email') {
      detectedMethod = 'email';
    } else if (
      nextAction === 'fill_form' ||
      analysis?.pageType === 'application_form' ||
      formInspection.fields.length >= 2
    ) {
      detectedMethod = 'custom_form';
    } else if (extracted.emails && extracted.emails.length > 0) {
      detectedMethod = 'email';
    } else if (phoneNumbers.length > 0) {
      detectedMethod = 'phone';
    } else if (analysis?.pageType === 'job_listings_accordion' || analysis?.pageType === 'job_description_page') {
      detectedMethod = 'career_portal';
    } else {
      detectedMethod = 'human_review';
    }

    await logJobEvent(
      'unknownPageHandler',
      'ANALYZE_COMPLETE',
      `Page analyzed: type=${analysis?.pageType}, method=${detectedMethod}, forms=${formInspection.fields.length}, emails=${extracted.emails?.length || 0}`
    );

    return {
      detectedMethod,
      pageUrl: currentUrl,
      emails: extracted.emails || [],
      phoneNumbers,
      formFields: formInspection.fields || [],
      formButtons: formInspection.buttons || [],
      analysis,
      openingsList: extracted.openingsList || [],
      referenceIds: extracted.referenceIds || [],
      emailInstructions: extracted.emailInstructions || null,
      isFormClosed: extracted.isFormClosed || false,
      closedFormMessage: extracted.closedFormMessage || '',
      googleFormUrl: null,
      message: `Detected method: ${detectedMethod}. Page type: ${analysis?.pageType}. ${analysis?.summary || ''}`,
    };
  } catch (error) {
    await logError('unknownPageHandler.analyzeUnknownPage', error.message);
    return {
      detectedMethod: 'human_review',
      pageUrl: url,
      emails: [],
      phoneNumbers: [],
      formFields: [],
      formButtons: [],
      analysis: null,
      openingsList: [],
      referenceIds: [],
      emailInstructions: null,
      isFormClosed: false,
      closedFormMessage: '',
      googleFormUrl: null,
      message: `Error analyzing page: ${error.message}`,
    };
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Fills a custom application form on an employer's career site.
 * Uses Playwright to identify, fill, and submit form fields.
 *
 * @param {object} params
 * @param {string} params.url - URL of the career page with a custom form
 * @param {Array<object>} params.formFields - Pre-inspected form fields
 * @param {Array<object>} params.answers - LLM-resolved answers
 * @param {string} [params.resumePdfPath] - Path to resume PDF for file upload fields
 * @param {object} [params.sessionState] - Optional browser session state
 * @returns {Promise<{ submitted: boolean, filledCount: number, message: string }>}
 */
export const fillCustomFormOnPage = async ({
  url,
  formFields = [],
  answers = [],
  resumePdfPath = null,
  sessionState = null,
  userId = null,
}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(
      browser,
      sessionState ? { storageState: sessionState } : {}
    );
    if (userId) {
      await injectGoogleSessionIntoContext(context, userId);
    }
    page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2000);

    let filledCount = 0;
    const errors = [];

    for (const field of formFields) {
      const answerObj = answers.find((a) => a.fieldIndex === field.fieldIndex);
      const answer = answerObj?.answer || '';
      if (!answer) continue;

      try {
        if (field.type === 'file' && resumePdfPath) {
          const fileInput = page.locator('input[type="file"]').first();
          const hasFile = await fileInput.count().then((c) => c > 0).catch(() => false);
          if (hasFile) {
            await fileInput.setInputFiles(resumePdfPath).catch(() => {});
            filledCount++;
          }
          continue;
        }

        // Use the field's selector
        const el = page.locator(field.fieldId || `input[name="${field.name}"]`).first();
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          if (field.type === 'select') {
            await el.selectOption({ label: answer }).catch(() => {});
          } else if (field.type === 'radio' || field.type === 'checkbox') {
            // Find option by text
            const optEl = page.locator(`label:has-text("${answer}"), [aria-label="${answer}"]`).first();
            await optEl.click().catch(() => {});
          } else {
            await el.fill(String(answer)).catch(() => {});
          }
          filledCount++;
        }
      } catch (err) {
        errors.push(`Field "${field.question}": ${err.message}`);
      }

      await page.waitForTimeout(200).catch(() => {});
    }

    // Attempt form submission
    let submitted = false;
    const submitLocators = [
      page.locator('button[type="submit"], input[type="submit"]').first(),
      page.locator('button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send")').first(),
    ];
    for (const loc of submitLocators) {
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        await loc.click().catch(() => {});
        await page.waitForTimeout(3000);
        submitted = true;
        break;
      }
    }

    await logJobEvent(
      'unknownPageHandler',
      submitted ? 'FORM_SUBMITTED' : 'FORM_FILLED_AWAITING',
      `Filled ${filledCount} fields. Submitted: ${submitted}`
    );

    return {
      submitted,
      filledCount,
      message: submitted ? `Form submitted with ${filledCount} fields filled` : `Form filled (${filledCount} fields) but submit pending`,
    };
  } catch (error) {
    await logError('unknownPageHandler.fillCustomFormOnPage', error.message);
    return { submitted: false, filledCount: 0, message: error.message };
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};
