import { logJobEvent, logError } from '../../utils/logger.js';
import {
  BROWSER_ACTIONS,
  CONTROL_DECISIONS,
  HANDOFF_METHODS,
  PAGE_TYPES,
  APPLICATION_STATUS,
  AGENT_LOOP_LIMITS,
} from '../../constant/application.constant.js';
import { BrowserManager } from '../../browser/browserManager.js';
import { extractPageContent } from '../pageAnalysis/pageContentExtractor.js';
import { normalizePage } from '../pageAnalysis/pageNormalizer.js';
import { classifyPageWithLlm } from '../pageAnalysis/pageClassifierLlm.js';
import { detectStateChange } from '../pageAnalysis/pageStateDetector.js';
import { decideNextAction } from './agentDecision.js';
import { executeSingleBrowserAction } from '../browser/browserActionExecutor.js';
import { verifyActionResult } from '../browser/actionVerifier.js';
import { isUrlSafe } from '../browser/urlValidator.js';
import { inspectForm } from '../form/formInspector.js';
import { resolveAllFormAnswers } from '../answer/answerResolver.js';
import { fillFormFields } from '../form/formFiller.js';
import { validateFormFields } from '../form/formValidator.js';
import { verifyFilledFields } from '../form/formVerifier.js';
import { isGoogleFormUrl } from '../googleForm/googleFormFiller.js';
import {
  createAgentState,
  loadState,
  recordAction,
  recordPageVisit,
  detectLoop,
  resetActiveRunTimer,
  isActiveRunTimedOut,
  persistState,
  addWorkflowLog,
} from './agentState.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import {
  getDecryptedGoogleSession,
  injectGoogleSessionIntoContext,
} from '../../services/googleSession.service.js';
import { JobApplication } from '../../model/JobApplication.js';

/**
 * Checks whether the current page classification should trigger a method handoff.
 *
 * @param {object} pageClassification - Stage 1 classification result
 * @param {string} currentUrl - Current browser URL
 * @returns {{ shouldHandoff: boolean, method: string|null }}
 */
const checkForMethodHandoff = (pageClassification, currentUrl) => {
  // Google Form detection by URL
  if (isGoogleFormUrl(currentUrl)) {
    return { shouldHandoff: true, method: HANDOFF_METHODS.GOOGLE_FORM };
  }

  // Google Form detection by page type
  if (pageClassification?.pageType === PAGE_TYPES.GOOGLE_FORM) {
    return { shouldHandoff: true, method: HANDOFF_METHODS.GOOGLE_FORM };
  }

  // Email instructions detection
  if (
    pageClassification?.pageType === PAGE_TYPES.EMAIL_INSTRUCTIONS &&
    pageClassification?.emailContact?.email
  ) {
    return { shouldHandoff: true, method: HANDOFF_METHODS.EMAIL };
  }

  return { shouldHandoff: false, method: null };
};

/**
 * Determines if the page is a form page that should enter form mode.
 *
 * @param {object} pageClassification - Stage 1 classification
 * @param {object} normalizedState - Normalized page state
 * @returns {boolean}
 */
const isFormPage = (pageClassification, normalizedState) => {
  const formTypes = [
    PAGE_TYPES.APPLICATION_FORM,
    PAGE_TYPES.MULTI_STEP_FORM,
    PAGE_TYPES.MODAL_FORM,
  ];

  if (formTypes.includes(pageClassification?.pageType)) return true;
  if ((normalizedState.formFieldsCount || 0) >= 3) return true;

  return false;
};

/**
 * Attempts recovery when a browser action fails.
 * Strategy: retry → re-observe → AI replan → scroll → human escalation
 *
 * @param {import('playwright').Page} page
 * @param {object} state - Agent state
 * @param {object} failedDecision - The decision that failed
 * @param {object} normalizedState - Current normalized page state
 * @param {object} job - Job details
 * @param {string} userId
 * @returns {Promise<{ recovered: boolean, newDecision?: object }>}
 */
const attemptRecovery = async (page, state, failedDecision, normalizedState, job, userId) => {
  const retries = state.counters.retriesForCurrentAction;

  // Step 1: Already retried maximum times
  if (retries >= AGENT_LOOP_LIMITS.MAX_RETRIES_PER_ACTION) {
    await logJobEvent('agentLoop', 'RECOVERY_EXHAUSTED', `Max retries (${retries}) reached for action: ${failedDecision.type}`);
    return { recovered: false };
  }

  // Step 2: Scroll and wait for dynamic content
  if (retries === 1) {
    await logJobEvent('agentLoop', 'RECOVERY_SCROLL', 'Scrolling page to reveal dynamic content');
    await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // Step 3: Re-observe and ask AI for a new target
  await logJobEvent('agentLoop', 'RECOVERY_REPLAN', 'Re-observing page for alternative action');
  const freshRaw = await extractPageContent(page);
  const freshNormalized = normalizePage(freshRaw);
  const freshClassification = await classifyPageWithLlm(freshRaw, job, userId);
  const newDecision = await decideNextAction(freshNormalized, state, job, freshClassification, userId);

  state.counters.totalDecisions += 1;

  return { recovered: true, newDecision };
};

/**
 * Executes the COMPLETE form mode sub-workflow with an internal stepper loop.
 *
 * Optimized flow per step:
 * 1. inspectForm() — extract ALL fields on the current page (ONE DOM read)
 * 2. resolveAllFormAnswers() — profile/resume match (no LLM), batch AI only for subjective
 * 3. If any unresolved → pause for human input (WAITING_FOR_USER)
 * 4. fillFormFields() — batch fill ALL resolved fields at once via Playwright
 * 5. verifyFilledFields() — DOM check that values stuck (NO LLM)
 * 6. Re-fill any empty fields that failed verification
 * 7. Click Next/Continue → wait → loop to step 1 for next page
 * 8. On final review step → pause for candidate confirmation (WAITING_FOR_FINAL_REVIEW)
 *
 * This NEVER re-enters the main agent loop between steps — no redundant
 * extractPageContent() or classifyPageWithLlm() calls.
 *
 * @param {import('playwright').Page} page
 * @param {object} state - Agent state
 * @param {object} job - Job details
 * @param {object} candidateInfo - Candidate resume/profile data
 * @param {string} userId
 * @param {string} applicationId
 * @param {string|null} resumePdfPath
 * @returns {Promise<{ completed: boolean, hasUnresolved: boolean, formFields: Array }>}
 */
const executeFormMode = async (page, state, job, candidateInfo, userId, applicationId, resumePdfPath) => {
  await logJobEvent('agentLoop', 'FORM_MODE_ENTER', `Entering form mode at ${page.url()}`);

  const MAX_STEP_ITERATIONS = 15; // Safety: prevent infinite stepper loops
  let stepIteration = 0;

  // Shared answer resolution context — built once, reused across steps
  const resolverContext = {
    userProfile: candidateInfo?.personalInfo || {},
    user: { username: candidateInfo?.personalInfo?.fullName, email: candidateInfo?.personalInfo?.email },
    userSetting: {},
    resumeData: candidateInfo || {},
    job,
    userAnswers: state.formState.answeredQuestions || [],
  };

  // ─── INTERNAL STEPPER LOOP ───────────────────────────────────────────
  while (stepIteration < MAX_STEP_ITERATIONS) {
    stepIteration++;

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.INSPECTING_FORM, {
        logMessage: `Inspecting form fields (step iteration ${stepIteration}).`,
      });
    }

    // ── STEP 1: Inspect form ONCE for this page ────────────────────────
    const formInspection = await inspectForm(page);
    const formFields = formInspection.fields || [];

    if (formFields.length === 0) {
      await logJobEvent('agentLoop', 'FORM_MODE_EMPTY', `No form fields detected at step iteration ${stepIteration}`);
      // No fields found — could be a non-form page between steps, break to main loop
      return { completed: false, hasUnresolved: false, formFields: [] };
    }

    state.formState.currentStep = formInspection.stepperState?.currentStep || state.formState.currentStep;
    state.formState.totalSteps = formInspection.stepperState?.totalSteps || state.formState.totalSteps;

    await logJobEvent(
      'agentLoop',
      'FORM_MODE_FIELDS',
      `Step ${state.formState.currentStep}/${state.formState.totalSteps}: Found ${formFields.length} fields`,
    );

    // ── STEP 2: Resolve ALL answers in batch ───────────────────────────
    // Profile/resume matching: NO LLM. AI only for subjective questions (one batch call).
    resolverContext.userAnswers = state.formState.answeredQuestions || [];

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.RESOLVING_ANSWERS, {
        logMessage: `Resolving answers for ${formFields.length} fields.`,
      });
    }

    const { resolvedAnswers, missingQuestions } = await resolveAllFormAnswers(formFields, resolverContext);

    // ── STEP 3: If any unresolved required → pause for human ──────────
    const validation = validateFormFields(formFields, resolvedAnswers);
    if (!validation.isValid && missingQuestions.length > 0) {
      await logJobEvent(
        'agentLoop',
        'FORM_MODE_HUMAN',
        `${missingQuestions.length} unresolved questions require human input at step ${state.formState.currentStep}`,
      );

      // Track resolved answers so far
      state.formState.answeredQuestions = [
        ...state.formState.answeredQuestions,
        ...resolvedAnswers.map((a) => ({
          questionId: a.questionId,
          fieldId: a.fieldId,
          question: a.question,
          answer: a.answer,
          source: a.source,
        })),
      ];
      state.formState.unresolvedQuestions = missingQuestions;

      // Persist to DB
      if (applicationId) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.fields': formFields,
          'form.answers': resolvedAnswers,
          'form.missingQuestions': missingQuestions,
          'form.currentStep': state.formState.currentStep,
          'form.totalSteps': state.formState.totalSteps,
        });
      }

      return { completed: false, hasUnresolved: true, formFields };
    }

    // ── STEP 4: Batch fill ALL resolved fields via Playwright ──────────
    if (resolvedAnswers.length > 0) {
      if (applicationId) {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.FILLING_FORM, {
          logMessage: `Batch filling ${resolvedAnswers.length} fields.`,
        });
      }

      await fillFormFields(page, formFields, resolvedAnswers, { resumePdfPath });
    }

    // ── STEP 5: Verify ALL fields filled via DOM check (NO LLM) ────────
    const verification = await verifyFilledFields(page, resolvedAnswers);

    if (!verification.allFilled && verification.emptyFields.length > 0) {
      await logJobEvent(
        'agentLoop',
        'FORM_VERIFY_RETRY',
        `${verification.emptyFields.length} fields still empty after fill. Retrying...`,
      );

      // Build retry answers for empty fields only
      const retryAnswers = resolvedAnswers.filter((a) =>
        verification.emptyFields.some((e) => e.fieldId === a.fieldId || e.questionId === a.questionId),
      );

      if (retryAnswers.length > 0) {
        await page.waitForTimeout(1000);
        await fillFormFields(page, formFields, retryAnswers, { resumePdfPath });

        // Second verification — if still empty, log and proceed (don't loop forever)
        const retryVerification = await verifyFilledFields(page, retryAnswers);
        if (!retryVerification.allFilled) {
          await logJobEvent(
            'agentLoop',
            'FORM_VERIFY_WARN',
            `${retryVerification.emptyFields.length} fields still empty after retry. Proceeding anyway.`,
          );
        }
      }
    }

    // ── STEP 6: Track answered questions in state ──────────────────────
    state.formState.answeredQuestions = [
      ...state.formState.answeredQuestions,
      ...resolvedAnswers.map((a) => ({
        questionId: a.questionId,
        fieldId: a.fieldId,
        question: a.question,
        answer: a.answer,
        source: a.source,
      })),
    ];
    state.formState.unresolvedQuestions = [];

    // Persist form state to DB
    if (applicationId) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        'form.fields': formFields,
        'form.answers': resolvedAnswers,
        'form.missingQuestions': [],
        'form.currentStep': state.formState.currentStep,
        'form.totalSteps': state.formState.totalSteps,
      });
    }

    // ── STEP 7: Check for progression button ───────────────────────────
    const buttons = formInspection.buttons || [];
    const nextBtn = buttons.find((b) => b.type === 'create_account' || b.type === 'next');
    const submitBtn = buttons.find((b) => b.type === 'submit');

    const isFinalReviewStep =
      (formInspection.stepperState?.hasStepper &&
        formInspection.stepperState?.currentStep >= formInspection.stepperState?.totalSteps) ||
      /review/i.test(formInspection.stepperState?.activeStepName || '') ||
      (!nextBtn && Boolean(submitBtn));

    if (isFinalReviewStep) {
      // ── STEP 8: Final Review — pause for candidate confirmation ──────
      const reviewFields = (state.formState.answeredQuestions || []).map((a) => ({
        questionId: a.questionId,
        fieldId: a.fieldId,
        question: a.question,
        type: 'text',
        answer: a.answer,
        source: a.source || 'ai',
      }));

      if (applicationId) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.reviewFields': reviewFields,
          'form.answers': state.formState.answeredQuestions,
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
        });
      }

      await logJobEvent('agentLoop', 'FORM_MODE_COMPLETE', `Form filled across ${stepIteration} steps. Ready for final candidate review.`);
      return { completed: true, isFinalReviewReady: true, formFields, reviewFields };
    }

    if (!nextBtn) {
      // No next button and not final review — break to main loop
      await logJobEvent('agentLoop', 'FORM_NO_NEXT', 'No next/submit button found. Returning to main loop.');
      return { completed: false, hasUnresolved: false, formFields };
    }

    // ── Click Next and advance to the next step ────────────────────────
    await logJobEvent('agentLoop', 'STEP_PROGRESSION', `Advancing step: clicking "${nextBtn.text}"`);
    const btnLocator = page.locator(nextBtn.selector || `button:has-text("${nextBtn.text}")`).first();
    await btnLocator.click({ timeout: 5000 }).catch(async () => {
      await btnLocator.click({ force: true, timeout: 3000 });
    });

    await page.waitForTimeout(3000);
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // Check for error banner on page (e.g. password mismatch or weak password)
    const errorEl = page.locator('.error, .alert-danger, [role="alert"], [class*="error" i], .field-validation-error').first();
    const hasError = await errorEl.isVisible().catch(() => false);
    if (hasError) {
      const errorMsg = await errorEl.innerText().catch(() => 'Validation error displayed');
      await logJobEvent('agentLoop', 'STEP_ERROR', `Error advancing at step ${state.formState.currentStep}: ${errorMsg}`);

      // Persist unresolved state so user sees the error
      state.formState.unresolvedQuestions = [{
        questionId: 'step_error',
        fieldId: 'step_error',
        question: `Step ${state.formState.currentStep} Error: ${errorMsg}`,
        type: 'text',
        required: true,
      }];

      if (applicationId) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.missingQuestions': state.formState.unresolvedQuestions,
        });
      }

      return {
        completed: false,
        hasUnresolved: true,
        errorMessage: errorMsg,
        formFields,
      };
    }

    await logJobEvent(
      'agentLoop',
      'STEP_ADVANCED',
      `Successfully advanced past step ${state.formState.currentStep}. Looping for next step...`,
    );

    await persistState(applicationId, state);

    // Continue the while loop → inspectForm for the next page/step
  }

  // Safety: max step iterations reached
  await logJobEvent('agentLoop', 'FORM_MAX_STEPS', `Reached max step iterations (${MAX_STEP_ITERATIONS}). Breaking.`);
  return { completed: false, hasUnresolved: false, formFields: [] };
};

/**
 * The core Observe → Analyze → Decide → Act → Verify agent loop.
 *
 * This is the main engine for the UNKNOWN application method.
 * It continues until one of: SUCCESS, HUMAN_REQUIRED, FAILED, BLOCKED, CLOSED.
 *
 * @param {object} params
 * @param {string} params.url - Starting URL
 * @param {object} params.job - Job document
 * @param {string} params.userId - Candidate user ID
 * @param {string} [params.applicationId]
 * @param {string} [params.resumePdfPath]
 * @param {object} [params.candidateInfo]
 * @param {object} [params.sessionState]
 * @returns {Promise<object>} Agent execution result
 */
export const executeAgentLoop = async ({
  url,
  job = {},
  userId = null,
  applicationId = null,
  resumePdfPath = null,
  candidateInfo = null,
  sessionState = null,
}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!url) {
      throw new Error('No URL provided for agent loop');
    }

    // 1. Load or create agent state
    let state = await loadState(applicationId);
    if (!state) {
      state = createAgentState(applicationId, url, job);
    }
    resetActiveRunTimer(state);

    await addWorkflowLog(applicationId, 'AGENT_START', `Starting agent loop for: ${url}`);

    // 2. Initialize browser
    const effectiveStorageState =
      sessionState ||
      (state.pendingHumanAction?.savedStorageState) ||
      (userId ? await getDecryptedGoogleSession(userId).catch(() => null) : null);

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(
      browser,
      effectiveStorageState ? { storageState: effectiveStorageState } : {},
    );
    if (userId) {
      await injectGoogleSessionIntoContext(context, userId).catch(() => {});
    }
    page = await context.newPage();

    // 3. Open URL
    const startUrl = state.pendingHumanAction?.savedUrl || url;
    state.pendingHumanAction = null; // Clear pending human action on resume

    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2500);

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.AI_RUNNING, {
        logMessage: `Agent navigating: ${startUrl}`,
      });
    }

    let previousNormalized = null;

    // 4. MAIN AGENT LOOP
    while (true) {
      // Safety: active run timeout
      if (isActiveRunTimedOut(state)) {
        await logJobEvent('agentLoop', 'TIMEOUT', 'Active run timeout reached');
        await addWorkflowLog(applicationId, 'TIMEOUT', 'Active browser execution time exceeded limit');
        break;
      }

      // Handle popup / new tabs
      if (context) {
        const allPages = context.pages();
        if (allPages.length > 1) {
          const extPage = allPages.find((p) => {
            const u = (p.url() || '').toLowerCase();
            return !u.includes('about:blank') && u !== (page.url() || '').toLowerCase();
          });
          if (extPage) {
            page = extPage;
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            await page.waitForTimeout(1500);
          }
        }
      }

      // === OBSERVE ===
      const rawPageContent = await extractPageContent(page);
      const normalizedState = normalizePage(rawPageContent);

      // === LOOP DETECTION ===
      recordPageVisit(state, normalizedState);
      const loopCheck = detectLoop(state);
      if (loopCheck.loopDetected) {
        await logJobEvent('agentLoop', 'LOOP_DETECTED', loopCheck.reason);
        await addWorkflowLog(applicationId, 'LOOP_DETECTED', loopCheck.reason);
        state.pendingHumanAction = {
          reason: `Loop detected: ${loopCheck.reason}`,
          savedUrl: page.url(),
        };
        break;
      }

      // === CLASSIFY PAGE (Stage 1) ===
      const pageClassification = await classifyPageWithLlm(rawPageContent, job, userId);

      // === CHECK FOR METHOD HANDOFF ===
      const handoff = checkForMethodHandoff(pageClassification, page.url());
      if (handoff.shouldHandoff) {
        state.discoveredMethod = handoff.method;
        await logJobEvent('agentLoop', 'HANDOFF', `Method discovered: ${handoff.method} at ${page.url()}`);
        await addWorkflowLog(applicationId, 'HANDOFF', `Discovered method: ${handoff.method}`);
        await persistState(applicationId, state);

        // Return handoff result — the caller routes to the specialized engine
        return {
          status: APPLICATION_STATUS.AI_RUNNING,
          terminalState: null,
          handoff: {
            method: handoff.method,
            url: page.url(),
            pageClassification,
          },
          agentState: state,
          pageUrl: page.url(),
          message: `Application method discovered: ${handoff.method}`,
        };
      }

      // === CHECK FOR FORM MODE (system transition) ===
      if (isFormPage(pageClassification, normalizedState)) {
        const formResult = await executeFormMode(
          page, state, job, candidateInfo, userId, applicationId, resumePdfPath,
        );

        if (formResult.hasUnresolved) {
          // Pause for human answers
          const storageState = await BrowserManager.captureStorageState(context).catch(() => null);
          state.pendingHumanAction = {
            reason: formResult.errorMessage || CONTROL_DECISIONS.HUMAN_REQUIRED,
            savedUrl: page.url(),
            savedStorageState: storageState,
          };
          await persistState(applicationId, state);

          if (applicationId) {
            await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_USER, {
              logMessage: formResult.errorMessage
                ? `Form validation error: ${formResult.errorMessage}. Please update inputs.`
                : `${state.formState.unresolvedQuestions.length} questions require candidate input.`,
            });
          }

          return {
            status: APPLICATION_STATUS.WAITING_FOR_USER,
            terminalState: 'human_required',
            formFields: formResult.formFields,
            missingQuestions: state.formState.unresolvedQuestions,
            agentState: state,
            pageUrl: page.url(),
            message: formResult.errorMessage || `Form requires candidate input for ${state.formState.unresolvedQuestions.length} questions.`,
          };
        }



        if (formResult.completed) {
          // Form filled across all steps → pause at WAITING_FOR_FINAL_REVIEW
          const storageState = await BrowserManager.captureStorageState(context).catch(() => null);
          state.pendingHumanAction = {
            reason: 'Review filled application before submission',
            savedUrl: page.url(),
            savedStorageState: storageState,
          };
          await persistState(applicationId, state);

          if (applicationId) {
            await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW, {
              logMessage: 'All application steps filled. Awaiting candidate final review before submission.',
            });
          }

          return {
            status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
            terminalState: null,
            formFields: formResult.formFields,
            reviewFields: formResult.reviewFields,
            answeredQuestions: state.formState.answeredQuestions,
            agentState: state,
            pageUrl: page.url(),
            message: 'All application steps filled. Awaiting candidate review and confirmation before submission.',
          };
        }

        // Form mode found no fields — continue with the normal loop
      }

      // === DECIDE NEXT ACTION (Stage 2) ===
      const decision = await decideNextAction(normalizedState, state, job, pageClassification, userId);
      state.counters.totalDecisions += 1;

      // === HANDLE CONTROL DECISIONS ===
      if (decision.decision.type === CONTROL_DECISIONS.HUMAN_REQUIRED) {
        const storageState = await BrowserManager.captureStorageState(context).catch(() => null);
        state.pendingHumanAction = {
          reason: decision.decision.reason || 'Human action required',
          savedUrl: page.url(),
          savedStorageState: storageState,
        };
        await persistState(applicationId, state);
        await addWorkflowLog(applicationId, 'HUMAN_REQUIRED', decision.decision.reason || 'Human action required');

        if (applicationId) {
          await updateApplicationStatus(applicationId, APPLICATION_STATUS.HUMAN_REQUIRED, {
            logMessage: decision.decision.reason || 'Human intervention required.',
          });
        }

        return {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          terminalState: 'human_required',
          agentState: state,
          pageUrl: page.url(),
          pageClassification,
          message: decision.decision.reason || 'Human action required.',
        };
      }

      if (decision.decision.type === CONTROL_DECISIONS.FINISH) {
        await logJobEvent('agentLoop', 'FINISH', 'Agent detected application submission success');
        await addWorkflowLog(applicationId, 'FINISH', 'Application submitted successfully');
        await persistState(applicationId, state);

        return {
          status: APPLICATION_STATUS.APPLIED,
          terminalState: 'success',
          agentState: state,
          pageUrl: page.url(),
          message: 'Application submitted successfully.',
        };
      }

      if (decision.decision.type === CONTROL_DECISIONS.HANDOFF) {
        state.discoveredMethod = decision.decision.method;
        await persistState(applicationId, state);

        return {
          status: APPLICATION_STATUS.AI_RUNNING,
          terminalState: null,
          handoff: {
            method: decision.decision.method,
            url: page.url(),
            pageClassification,
          },
          agentState: state,
          pageUrl: page.url(),
          message: `Handoff to ${decision.decision.method} engine.`,
        };
      }

      // === VALIDATE BROWSER ACTION ===
      if (!Object.values(BROWSER_ACTIONS).includes(decision.decision.type)) {
        await logJobEvent('agentLoop', 'INVALID_ACTION', `Non-browser action in execution path: ${decision.decision.type}`);
        continue;
      }

      // === URL VALIDATION (for navigate actions) ===
      if (decision.decision.type === BROWSER_ACTIONS.NAVIGATE) {
        const targetUrl = decision.decision.target?.url || '';
        const urlCheck = isUrlSafe(targetUrl, state, normalizedState);
        if (!urlCheck.safe) {
          await logJobEvent('agentLoop', 'URL_REJECTED', `Unsafe URL rejected: ${targetUrl} — ${urlCheck.reason}`);
          await addWorkflowLog(applicationId, 'URL_REJECTED', `${targetUrl}: ${urlCheck.reason}`);
          continue;
        }
      }

      // === EXECUTE BROWSER ACTION ===
      previousNormalized = normalizedState;

      const actionResult = await executeSingleBrowserAction(page, decision.decision, {
        resumePdfPath,
        context,
      });

      // === VERIFY ACTION (automatic — not AI-requested) ===
      await page.waitForTimeout(2000);
      const postRaw = await extractPageContent(page);
      const postNormalized = normalizePage(postRaw);
      const verification = verifyActionResult(previousNormalized, postNormalized);

      // === RECORD ===
      recordAction(state, decision.decision, actionResult, verification);
      await persistState(applicationId, state);

      await logJobEvent(
        'agentLoop',
        'ACTION_COMPLETE',
        `${decision.decision.type} → success=${actionResult.success} | pageChanged=${verification.pageChanged} | url=${page.url()}`,
      );

      // === RECOVERY on failure ===
      if (!actionResult.success) {
        const recovery = await attemptRecovery(page, state, decision.decision, postNormalized, job, userId);
        if (!recovery.recovered) {
          state.pendingHumanAction = {
            reason: `Action "${decision.decision.type}" failed after ${AGENT_LOOP_LIMITS.MAX_RETRIES_PER_ACTION} retries`,
            savedUrl: page.url(),
          };
          await persistState(applicationId, state);
          break;
        }
        // Recovery produced a new decision — it will be handled in the next loop iteration
      }

      // === SUCCESS CHECK ===
      if (verification.successDetected) {
        await logJobEvent('agentLoop', 'SUCCESS_DETECTED', 'Submission success detected on page');
        await addWorkflowLog(applicationId, 'SUCCESS_DETECTED', 'Application submission confirmed');
        await persistState(applicationId, state);

        return {
          status: APPLICATION_STATUS.APPLIED,
          terminalState: 'success',
          agentState: state,
          pageUrl: page.url(),
          message: 'Application submitted successfully.',
        };
      }
    }

    // Loop exited without a terminal state — default to waiting for review
    await persistState(applicationId, state);

    if (applicationId && state.pendingHumanAction) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.HUMAN_REQUIRED, {
        logMessage: state.pendingHumanAction.reason || 'Agent paused. Human action required.',
      });
    }

    return {
      status: state.pendingHumanAction
        ? APPLICATION_STATUS.HUMAN_REQUIRED
        : APPLICATION_STATUS.WAITING_FOR_REVIEW,
      terminalState: state.pendingHumanAction ? 'human_required' : null,
      agentState: state,
      pageUrl: page?.url?.() || url,
      message: state.pendingHumanAction?.reason || 'Agent loop completed. Ready for review.',
    };
  } catch (error) {
    await logError('agentLoop.executeAgentLoop', error.message);
    await addWorkflowLog(applicationId, 'ERROR', error.message);

    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      terminalState: 'failed',
      pageUrl: page?.url?.() || url,
      message: `Agent error: ${error.message}`,
      error: error.message,
    };
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};
