<<<<<<< HEAD
import { logJobEvent, logError } from "../../utils/logger.js";
import { executeAgentLoop } from "./agentLoop.js";
import { dispatchMethodHandoff } from "./handoffRouter.js";
import { APPLICATION_STATUS } from "../../constant/application.constant.js";
import { browserAgentGraph } from "../../agent/graph/browserAgentGraph.js";
import { SessionRegistry } from "../../browser/session/sessionRegistry.js";
import { MAX_AGENT_STEPS } from "../../constant/agent.constant.js";

const executeFlaggedGraphWorkflow = async ({ url, userId, applicationId }) => {
  const appId = String(applicationId || `unknown_${Date.now()}`);
  const threadId = `app_thread_${appId}`;
  const session = await SessionRegistry.createOrGetSession(appId, userId);
  if (url) await session.goto(url, { waitUntil: "domcontentloaded" });
=======
import { logJobEvent, logError } from '../../utils/logger.js';
import { extractPageContent } from '../pageAnalysis/pageContentExtractor.js';
import { classifyPageWithLlm } from '../pageAnalysis/pageClassifierLlm.js';
import { inspectForm } from '../form/formInspector.js';
import { isGoogleFormUrl } from '../googleForm/googleFormFiller.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { maskValue } from '../../utils/redact.js';
import {
  getSession,
  createSession,
  closeSession,
  getActivePage,
  isSafeUrl,
  waitForSettled
} from '../../browser/session/sessionRegistry.js';

/**
 * UnknownPageHandler — Full browser-based AI agent for unknown application URLs.
 * Refactored to leverage the persistent session registry layer.
 *
 * @param {object} params
 * @param {string} params.url - The unknown URL to analyze
 * @param {object} params.job - Job document
 * @param {string} params.userId - User ID
 * @param {object} [params.sessionState] - Optional saved browser session state
 * @param {string} [params.applicationId] - Application ID
 * @returns {Promise<object>} Analysis result with detected method and extracted data
 */
export const analyzeUnknownPage = async ({ url, job, userId, sessionState = null, applicationId = null }) => {
  const appId = applicationId || 'temp_' + Math.random().toString(36).substring(2, 11);
  const isTemp = !applicationId;
  let session = null;
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b

  await browserAgentGraph.invoke(
    {
      applicationId: appId,
      userId: String(userId || ""),
      threadId,
      currentUrl: url || "",
      stepCount: 0,
      pendingQuestions: [],
      answers: [],
      status: "STARTING",
    },
    {
      configurable: { thread_id: threadId, checkpoint_ns: "browser_agent" },
      recursionLimit: MAX_AGENT_STEPS * 8 + 10,
    },
  );

<<<<<<< HEAD
  return {
    status: APPLICATION_STATUS.AI_RUNNING,
    terminalState: null,
    pageUrl: session.currentUrl || url,
    message: "Feature-flagged LangGraph browser workflow started.",
  };
};

/**
 * Autonomous Browser Agent for Unknown / Generic Application URLs.
 *
 * Fully replaces the legacy step-based loop with a persistent
 * Observe → Analyze → Decide → Act → Verify agent loop with:
 * - State and memory persistence (agentState.js)
 * - Page fingerprinting and loop detection
 * - Automatic post-action verification
 * - Dynamic method handoff (Google Form, direct Email, Phone)
 * - Human-in-the-loop escalation (CAPTCHA, OTP, login, ambiguous questions)
 * - Waiting-for-final-review submission checkpoint
 *
 * @param {object} params
 * @param {string} params.url - URL to navigate to
 * @param {object} params.job - Job document
 * @param {string} params.userId - Candidate user ID
 * @param {string} [params.applicationId] - Application document ID
 * @param {string} [params.resumePdfPath] - Local tailored resume PDF path
 * @param {object} [params.candidateInfo] - Parsed candidate resume details
 * @param {object} [params.sessionState] - Optional saved browser session state
 * @returns {Promise<object>} Execution result with status, detectedMethod, and state
=======
    if (!isSafeUrl(url)) {
      throw new Error(`Unsafe URL blocked: ${url}`);
    }

    await logJobEvent(
      'unknownPageHandler',
      'ANALYZE_START',
      `Analyzing unknown page: ${url}`
    );

    session = getSession(appId);
    if (!session) {
      session = await createSession(appId, userId, { storageState: sessionState });
    }

    let page = getActivePage(session);
    if (!page) {
      page = await session.context.newPage();
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    
    await waitForSettled(page);

    // Get active page (handles blank target popups through registry trackers)
    const activePage = getActivePage(session) || page;
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
    if (isTemp) {
      await closeSession(appId).catch(() => {});
    }
  }
};

/**
 * Fills a custom application form on an employer's career site.
 * Reuses the existing active session if available.
 *
 * @param {object} params
 * @param {string} params.url - URL of the career page with a custom form
 * @param {Array<object>} params.formFields - Pre-inspected form fields
 * @param {Array<object>} params.answers - LLM-resolved answers
 * @param {string} [params.resumePdfPath] - Path to resume PDF for file upload fields
 * @param {object} [params.sessionState] - Optional browser session state
 * @param {string} [params.applicationId] - Application ID
 * @param {string} [params.userId] - User ID
 * @returns {Promise<{ filled: boolean, needsReview: boolean, filledCount: number, message: string }>}
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
 */
export const executeAutonomousUnknownApplication = async ({
  url,
  job = {},
  userId = null,
  applicationId = null,
  resumePdfPath = null,
  candidateInfo = null,
  sessionState = null,
  applicationId = null,
  userId = null,
}) => {
<<<<<<< HEAD
  try {
    if (!url) {
      throw new Error("No URL provided for autonomous browser agent execution");
    }

    await logJobEvent(
      "unknownPageHandler",
      "AGENT_START",
      `Launching Observe-Analyze-Decide-Act-Verify agent for: ${url} (Job: "${job.title || "Position"}")`,
=======
  const appId = applicationId || 'temp_' + Math.random().toString(36).substring(2, 11);
  const isTemp = !applicationId;
  let session = null;

  try {
    if (!isSafeUrl(url)) {
      throw new Error(`Unsafe URL blocked: ${url}`);
    }

    session = getSession(appId);
    if (!session) {
      session = await createSession(appId, userId, { storageState: sessionState });
    }

    let page = getActivePage(session);
    if (!page) {
      page = await session.context.newPage();
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    
    await waitForSettled(page);

    let filledCount = 0;
    const errors = [];

    for (const field of formFields) {
      const answerObj = answers.find((a) => a.fieldIndex === field.fieldIndex);
      const answer = answerObj?.answer || '';
      if (!answer) continue;

      const isSensitiveField = 
        field.type === 'password' || 
        /password|passcode|otp|one-time|verification.*code|two-factor|mfa|2fa|cookie|token/i.test(field.name || '') ||
        /password|passcode|otp|one-time|verification.*code|two-factor|mfa|2fa|cookie|token/i.test(field.fieldId || '') ||
        /password|passcode|otp|one-time|verification.*code|two-factor|mfa|2fa|cookie|token/i.test(field.question || '');

      if (isSensitiveField) {
        await logJobEvent(
          'unknownPageHandler',
          'SENSITIVE_FIELD_SKIPPED',
          `Skipping sensitive field: ${field.question || field.name || field.fieldId}`
        );
        errors.push(`Field "${field.question || field.name}": skipped because it is sensitive and cannot be automatically filled.`);
        continue;
      }

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

    await logJobEvent(
      'unknownPageHandler',
      'FORM_FILLED_AWAITING',
      `Filled ${filledCount} fields. Pending human review.`
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
    );

    if (process.env.GENERIC_AGENT_USE_LANGGRAPH === "true") {
      return await executeFlaggedGraphWorkflow({ url, userId, applicationId });
    }

    // 1. Run the core Observe-Analyze-Decide-Act-Verify agent loop
    const agentResult = await executeAgentLoop({
      url,
      job,
      userId,
      applicationId,
      resumePdfPath,
      candidateInfo,
      sessionState,
    });

    // 2. Check if a dynamic method handoff was triggered
    if (agentResult.handoff) {
      await logJobEvent(
        "unknownPageHandler",
        "DISPATCH_HANDOFF",
        `Discovered specialized application method: ${agentResult.handoff.method}`,
      );

      const handoffResult = await dispatchMethodHandoff({
        method: agentResult.handoff.method,
        context: {
          url: agentResult.handoff.url,
          applicationId,
          userId,
          job,
          candidateInfo,
          pageClassification: agentResult.handoff.pageClassification,
          agentState: agentResult.agentState,
        },
      });

      return {
        ...agentResult,
        handoffExecuted: true,
        handoffResult,
        detectedMethod: agentResult.handoff.method,
      };
    }

    return {
<<<<<<< HEAD
      ...agentResult,
      detectedMethod: agentResult.agentState?.discoveredMethod || "unknown",
    };
  } catch (error) {
    await logError(
      "unknownPageHandler.executeAutonomousUnknownApplication",
      error.message,
    );
    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      terminalState: "failed",
      pageUrl: url,
      message: `Agent execution failed: ${error.message}`,
      error: error.message,
    };
=======
      filled: true,
      needsReview: true,
      filledCount,
      message: `Form filled (${filledCount} fields) and is awaiting human review`,
    };
  } catch (error) {
    await logError('unknownPageHandler.fillCustomFormOnPage', error.message);
    return { filled: false, needsReview: true, filledCount: 0, message: error.message };
  } finally {
    if (isTemp) {
      await closeSession(appId).catch(() => {});
    }
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
  }
};
