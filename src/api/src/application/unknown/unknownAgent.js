import { getBrowserState } from '../../browser/state/browserState.js';
import { serializeState } from '../../browser/state/serializer.js';
import { takeScreenshot } from '../../browser/screenshot/screenshotService.js';
import { shouldUseVision } from '../../browser/screenshot/visionPolicy.js';
import { classifyPageDeterministic } from '../pageAnalysis/deterministicClassifier.js';
import { callAgentLlm } from '../../agent/llm/agentLlm.js';
import { validateAction, executeAction } from '../../browser/actions/actionsRegistry.js';
import { getSession, closeSession, getActivePage } from '../../browser/session/sessionRegistry.js';
import { AgentMemory } from './agentMemory.js';
import { LoopDetector } from './loopDetector.js';
import { getRecoveryNudge } from './recovery.js';
import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { logJobEvent, logError } from '../../utils/logger.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import { Setting } from '../../model/Setting.js';

const MAX_FAILURES = 5;

/**
 * Executes the secure multi-step browser agent loop on a foreign website/portal.
 */
export const runUnknownAgentLoop = async ({
  applicationId,
  userId,
  candidateInfo,
  jobDetails,
  maxSteps = 12
}) => {
  const memory = new AgentMemory();
  const loopDetector = new LoopDetector();
  let step = 0;
  let finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
  let summaryMessage = 'Agent loop concluded.';

  await logJobEvent('unknownAgentLoop', 'START', `Starting Agent Loop for application: ${applicationId} (Max Steps: ${maxSteps})`);

  try {
    const session = getSession(applicationId);
    if (!session) {
      throw new Error(`Active browser session for application ${applicationId} not found`);
    }

    const model = await getGeminiModel(userId);

    while (step < maxSteps) {
      step++;
      const budgetWarning = step >= Math.floor(maxSteps * 0.75) 
        ? `[ALERT: You have used ${step}/${maxSteps} of your step budget. Prioritize finishing or call askHuman.]` 
        : '';

      await logJobEvent('unknownAgentLoop', 'STEP_START', `Executing loop step ${step}/${maxSteps}`);

      // Get current active tab page
      const page = getActivePage(session);
      if (!page || page.isClosed()) {
        throw new Error('All browser tabs are closed or unavailable');
      }

      // 1. OBSERVE
      const browserState = await getBrowserState(page, applicationId);
      
      // Evaluate vision policies to decide if screenshot is needed
      const visionDecision = shouldUseVision(browserState, {
        consecutiveFailures: memory.consecutiveFailures,
        agentRequested: step === 1 // Take initial screenshot for safety
      });

      let screenshotBase64 = null;
      if (visionDecision.useVision) {
        await logJobEvent('unknownAgentLoop', 'TAKE_SCREENSHOT', `Vision activated: ${visionDecision.reasons.join(', ')}`);
        screenshotBase64 = await takeScreenshot(page, { highlight: true }).catch(() => null);
      }

      // 2. CLASSIFY
      const classification = await classifyPageDeterministic(browserState, jobDetails, userId);
      await logJobEvent('unknownAgentLoop', 'PAGE_CLASSIFIED', `Detected page type: ${classification.pageType}`);

      // Handle deterministic terminal/redirect states immediately
      if (classification.pageType === 'captcha') {
        finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
        summaryMessage = 'Loop paused: Captcha challenge detected. Manual solution required.';
        break;
      }
      if (classification.pageType === 'login_signup') {
        finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
        summaryMessage = `WARNING: Human action required! A login/authentication gate was detected. For security and privacy, the AI agent is strictly prohibited from logging, sending, or filling passwords, OTPs, tokens, or cookies. To protect your credentials, we did not fill this information and cannot proceed further. Please click the resume button to open this page in your browser and login manually.`;
        break;
      }
      if (classification.pageType === 'sensitive_fields') {
        finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
        summaryMessage = `WARNING: Human action required! ${classification.actionReason}. For security and privacy, the AI agent is strictly prohibited from logging, sending, or filling passwords, OTPs, tokens, or cookies. To protect your credentials, we did not fill this information and cannot proceed further. Please click the resume/review button to open this page in your browser and complete this application manually.`;
        break;
      }
      if (classification.pageType === 'success_confirmation') {
        finalStatus = APPLICATION_STATUS.APPLIED;
        summaryMessage = 'Loop finished: Form submitted successfully!';
        break;
      }
      if (classification.pageType === 'closed_expired') {
        finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW; // Closed, needs manual alternate route
        summaryMessage = 'Loop finished: Target form is closed or expired.';
        break;
      }

      // Compact elements representation
      const stateText = serializeState(browserState);

      // 3. DECIDE (Get action from LLM using U6 schemas)
      let decision = null;
      try {
        decision = await callAgentLlm(model, {
          stateText,
          steps: memory.history,
          candidateFacts: candidateInfo,
          jobFacts: jobDetails,
          pendingHumanAnswers: {}, // Approvals if any
          budgetNotice: budgetWarning,
          screenshotBase64
        });
      } catch (llmErr) {
        await logError('unknownAgentLoop.llm', llmErr.message);
        memory.recordFailure();
        const recoveryMsg = getRecoveryNudge(memory.consecutiveFailures);
        if (memory.consecutiveFailures >= MAX_FAILURES) {
          finalStatus = APPLICATION_STATUS.FAILED;
          summaryMessage = `Loop failed: Consecutive LLM failures reached limit. Error: ${llmErr.message}`;
          break;
        }
        continue;
      }

      await logJobEvent('unknownAgentLoop', 'DECISION_MADE', `Plan: "${decision.currentPlanItem || 'None'}". Step Actions count: ${decision.actions?.length || 0}`);

      // Check if LLM requested finish or askHuman
      const terminalAction = decision.actions.find(act => ['finish', 'askHuman', 'requestReview'].includes(act.type));
      if (terminalAction) {
        if (terminalAction.type === 'finish') {
          // Double verify against the page state before allowing finish(success: true)
          const hasEmptyRequired = browserState.elements.some(el => el.required && !el.value);
          if (terminalAction.success && hasEmptyRequired) {
            await logJobEvent('unknownAgentLoop', 'FINISH_REJECTED', 'Agent requested success finish but required fields remain empty. Rejecting finish.');
            memory.recordFailure();
            continue;
          }
          
          const settingDoc = await Setting.findOne({ userId }).lean().catch(() => null);
          const autoApply = settingDoc?.applicationSetting?.autoApplyEnabled === true;

          if (autoApply) {
            // Find submit button and submit
            const submitBtn = (browserState.elements || []).find(el => {
              const txt = (el.text || el.accessibleName || el.label || '').toLowerCase();
              return /submit\s*application|confirm\s*application|send\s*application|^submit$|^apply$/i.test(txt);
            });
            if (submitBtn) {
              await executeAction({ type: 'click', index: submitBtn.id, approved: true }, page, session).catch(() => {});
              await page.waitForTimeout?.(4000).catch(() => {});
            }
            finalStatus = APPLICATION_STATUS.APPLIED;
            summaryMessage = 'Application submitted successfully by AI agent!';
            break;
          }

          // Force manual review and submission instead of automatically submitting
          finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
          summaryMessage = `WARNING: Human approval required! The AI agent has successfully filled out the application form fields based on your profile and resume. However, to prevent accidental or unapproved submissions, review is required before submitting. Please click the review/resume button to inspect the filled values and click Submit to finalize.`;
          break;
        }

        if (terminalAction.type === 'askHuman') {
          finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
          summaryMessage = `Loop paused: Human response requested: "${terminalAction.question}"`;
          break;
        }
      }

      // 4. VALIDATE & EXECUTE ACTIONS
      let pageChanged = false;
      const actionResults = [];

      for (const action of decision.actions) {
        // Stop subsequent actions in this step if the previous action changed page (precedence block)
        if (pageChanged) {
          await logJobEvent('unknownAgentLoop', 'PRE_EXEC_STOP', 'Subsequent step actions cancelled due to page navigation.');
          break;
        }

        // Validate
        const valResult = validateAction(action, browserState);
        if (!valResult.valid) {
          await logJobEvent('unknownAgentLoop', 'VALIDATE_FAILED', `Action validation failed: ${valResult.message}`);
          actionResults.push({ action, success: false, error: valResult.reason });
          memory.recordFailure();
          continue;
        }

        // Execute
        const execResult = await executeAction(action, page, session);
        actionResults.push({
          action,
          success: execResult.success,
          error: execResult.error,
          pageChanged: execResult.pageChanged
        });

        if (execResult.success) {
          memory.resetFailures();
        } else {
          memory.recordFailure();
        }

        if (execResult.pageChanged) {
          pageChanged = true;
        }

        // Loop detection checks per action
        const checkResult = loopDetector.recordAndCheck(page.url(), browserState.elements, action);
        if (checkResult.loopDetected) {
          await logJobEvent('unknownAgentLoop', 'LOOP_WARNING', checkResult.nudgeMessage);
          if (checkResult.escalate) {
            finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
            summaryMessage = checkResult.nudgeMessage;
            break;
          }
        }
      }

      // 5. EVALUATE & RECORD HISTORY
      memory.update(decision.memory, {
        url: page.url(),
        pageType: classification.pageType,
        goal: decision.nextGoal,
        actions: decision.actions,
        results: actionResults,
        pageChanged,
        error: memory.consecutiveFailures > 0 ? 'Step contained tool execution failures' : null
      });

      // Break loop if extreme failure limit is reached
      if (memory.consecutiveFailures >= MAX_FAILURES) {
        const finalRecovery = getRecoveryNudge(memory.consecutiveFailures);
        await logJobEvent('unknownAgentLoop', 'RECOVERY_TRIGGERED', finalRecovery);
        finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
        summaryMessage = `Loop paused: Maximum consecutive failures reached (${MAX_FAILURES}). Replan failed.`;
        break;
      }
    }

    if (step >= maxSteps) {
      finalStatus = APPLICATION_STATUS.WAITING_FOR_REVIEW;
      summaryMessage = `Loop paused: Maximum agent step budget of ${maxSteps} reached.`;
    }

  } catch (error) {
    await logError('unknownAgentLoop.run', error.message);
    finalStatus = APPLICATION_STATUS.FAILED;
    summaryMessage = `Loop aborted: Critical execution error: ${error.message}`;
  } finally {
    // Always close browser session on terminal statuses
    await closeSession(applicationId).catch(() => {});
    await logJobEvent('unknownAgentLoop', 'TERMINATED', `Agent loop ended. Final status: ${finalStatus}. Summary: ${summaryMessage}`);
  }

  return {
    status: finalStatus,
    summary: summaryMessage,
    history: memory.history
  };
};

export default {
  runUnknownAgentLoop
};
