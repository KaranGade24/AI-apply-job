import { Command } from '@langchain/langgraph';
import { browserAgentGraph, computeAnswersHash } from '../agent/graph/browserAgentGraph.js';
import { computeReviewHash, applyUserEditsToReview } from '../agent/browser/review/reviewBuilder.js';
import { SessionRegistry } from '../agent/browser/session/sessionRegistry.js';
import { ApplicationSessionRepository } from '../repositories/applicationSession.repository.js';
import { ApplicationRepository } from '../repositories/application.repository.js';
import { JobApplication } from '../model/JobApplication.js';
import { AGENT_STATUS } from '../constant/agent.constant.js';
import { appError } from '../utils/errors.js';
import { logJobEvent, logError } from '../utils/logger.js';

// In-memory set of applicationIds currently undergoing active execution (concurrency lock)
const activeRunners = new Set();

/**
 * Builds the standard LangGraph execution thread configuration.
 *
 * @param {string} applicationId
 * @returns {object}
 */
const getThreadConfig = (applicationId) => ({
  configurable: {
    thread_id: `app_thread_${applicationId}`,
    checkpoint_ns: 'browser_agent',
  },
});

/**
 * Starts or advances the browser automation graph for an application.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} [options]
 * @returns {Promise<object>} Current workflow status
 */
export const startApplicationWorkflow = async (applicationId, userId, options = {}) => {
  const appIdStr = String(applicationId);

  // 1. Concurrency lock
  if (activeRunners.has(appIdStr)) {
    throw new appError(`Application ${appIdStr} is already running an active workflow step.`, 409);
  }

  // 2. Ownership verification
  const sessionDoc = await ApplicationSessionRepository.findSessionByApplicationId(appIdStr, userId);
  let jobApp = null;
  if (!sessionDoc) {
    jobApp = await JobApplication.findById(appIdStr).lean();
    if (!jobApp || String(jobApp.userId) !== String(userId)) {
      throw new appError(`Application ${appIdStr} not found or access denied.`, 404);
    }
  }

  const applyUrl = sessionDoc?.currentUrl || jobApp?.applyUrl || options.applyUrl || '';

  // 3. Ensure SessionRegistry context is initialized
  await SessionRegistry.createOrGetSession(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);

  activeRunners.add(appIdStr);

  // Run graph asynchronously in background
  (async () => {
    try {
      await logJobEvent('agentRunner', 'WORKFLOW_INVOKED', `[application:${appIdStr}] Starting graph run`);

      const initialState = {
        applicationId: appIdStr,
        userId: String(userId),
        threadId: threadConfig.configurable.thread_id,
        currentUrl: applyUrl,
        stepCount: 0,
        pendingQuestions: [],
        answers: sessionDoc?.answers || [],
        status: AGENT_STATUS.STARTING,
      };

      await browserAgentGraph.invoke(initialState, threadConfig);
    } catch (err) {
      // If error is an interrupt (human pause), it is expected
      if (!err.message?.includes('interrupt') && !err.name?.includes('Interrupt')) {
        await logError(`agentRunner.startWorkflow`, err.message);
      }
    } finally {
      activeRunners.delete(appIdStr);
    }
  })();

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.STARTING,
    message: 'Application automation workflow started.',
  };
};

/**
 * Retrieves the current execution state and questions for an application.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getWorkflowStatus = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  const threadConfig = getThreadConfig(appIdStr);

  const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);
  const sessionDoc = await ApplicationSessionRepository.findSessionByApplicationId(appIdStr, userId);

  const values = stateSnapshot?.values || {};
  const status = values.status || sessionDoc?.status || AGENT_STATUS.IDLE;
  const isInterrupted = stateSnapshot?.next?.length > 0;

  return {
    applicationId: appIdStr,
    status,
    currentUrl: values.currentUrl || sessionDoc?.currentUrl || '',
    pageType: values.pageType || 'UNKNOWN',
    stepCount: values.stepCount || 0,
    isWaitingForHuman: status === AGENT_STATUS.WAITING_FOR_USER,
    isWaitingForReview: status === AGENT_STATUS.WAITING_FOR_CONFIRMATION,
    pendingQuestionsCount: (values.pendingQuestions || sessionDoc?.pendingQuestions || []).length,
    finalReview: values.finalReview || { approved: false },
    submission: values.submission || { submitted: false },
    errors: values.errors || [],
    isInterrupted,
    isRunning: activeRunners.has(appIdStr),
  };
};

/**
 * Retrieves pending human questions for an application.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getWorkflowQuestions = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  const threadConfig = getThreadConfig(appIdStr);

  const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);
  const sessionDoc = await ApplicationSessionRepository.findSessionByApplicationId(appIdStr, userId);

  const questions = stateSnapshot?.values?.pendingQuestions || sessionDoc?.pendingQuestions || [];

  return {
    applicationId: appIdStr,
    pendingQuestions: questions,
    isWaitingForHuman: questions.length > 0,
  };
};

/**
 * Submits answers to pending questions and resumes the paused LangGraph workflow.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {Array<{ questionId: string, answer: any, userConfirmed?: boolean }>} answers
 * @returns {Promise<object>}
 */
export const submitWorkflowAnswers = async (applicationId, userId, answers = []) => {
  const appIdStr = String(applicationId);
  const threadConfig = getThreadConfig(appIdStr);

  // 1. Concurrency lock
  if (activeRunners.has(appIdStr)) {
    throw new appError(`Application ${appIdStr} is currently processing an action.`, 409);
  }

  // 2. Check if graph is currently interrupted / waiting for answers
  const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);
  if (!stateSnapshot || !stateSnapshot.next || stateSnapshot.next.length === 0) {
    throw new appError(`Workflow is not currently paused waiting for human input.`, 400);
  }

  activeRunners.add(appIdStr);

  // Resume graph asynchronously in background
  (async () => {
    try {
      await logJobEvent(
        'agentRunner',
        'RESUME_WITH_ANSWERS',
        `[application:${appIdStr}] Resuming workflow with ${answers.length} answers`
      );

      // Recreate session if server restarted while paused
      await SessionRegistry.createOrGetSession(appIdStr, userId);

      await browserAgentGraph.invoke(
        new Command({
          resume: answers,
        }),
        threadConfig
      );
    } catch (err) {
      if (!err.message?.includes('interrupt')) {
        await logError('agentRunner.resumeAnswers', err.message);
      }
    } finally {
      activeRunners.delete(appIdStr);
    }
  })();

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.FILLING,
    message: 'Answers received. Workflow resumed.',
  };
};

/**
 * Retrieves the final pre-submission review payload and answers hash for user confirmation.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getWorkflowReview = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  const threadConfig = getThreadConfig(appIdStr);

  const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);
  const sessionDoc = await ApplicationSessionRepository.findSessionByApplicationId(appIdStr, userId);

  const finalReview = stateSnapshot?.values?.finalReview || sessionDoc?.finalReview || null;
  const answers = stateSnapshot?.values?.answers || sessionDoc?.answers || [];
  const hash = finalReview?.reviewHash || finalReview?.hash || computeAnswersHash(answers);

  return {
    applicationId: appIdStr,
    finalReview,
    answers,
    answersHash: hash,
    reviewHash: hash,
    isApproved: Boolean(stateSnapshot?.values?.finalReview?.approved),
  };
};

/**
 * Confirms pre-submission review approval and resumes the graph to execute final submission.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {{ approved: boolean, hash: string, edits?: Array<object> }} confirmation
 * @returns {Promise<object>}
 */
export const confirmWorkflowReview = async (applicationId, userId, { approved, hash, edits } = {}) => {
  const appIdStr = String(applicationId);
  const threadConfig = getThreadConfig(appIdStr);

  if (!approved) {
    throw new appError('Confirmation approval must be explicitly true.', 400);
  }

  const reviewData = await getWorkflowReview(appIdStr, userId);
  let expectedHash = reviewData.reviewHash || reviewData.answersHash;

  // If user passed edits with confirmation, compute updated hash
  if (Array.isArray(edits) && edits.length > 0 && reviewData.finalReview) {
    const editRes = applyUserEditsToReview({ currentReview: reviewData.finalReview, edits });
    expectedHash = editRes.updatedReview.reviewHash;
  }

  if (expectedHash !== hash) {
    throw new appError('Answers were modified since review was loaded. Please review again.', 400);
  }

  const approvedAt = new Date().toISOString();

  // Record approvedAt + reviewHash in ApplicationSession
  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    reviewHash: hash,
    approvedAt,
    status: AGENT_STATUS.SUBMITTING,
  }).catch(() => {});

  if (activeRunners.has(appIdStr)) {
    throw new appError(`Application ${appIdStr} is currently processing an action.`, 409);
  }

  activeRunners.add(appIdStr);

  (async () => {
    try {
      await logJobEvent(
        'agentRunner',
        'RESUME_REVIEW_CONFIRMED',
        `[application:${appIdStr}] User approved final submission with hash ${hash} at ${approvedAt}`
      );

      await SessionRegistry.createOrGetSession(appIdStr, userId);

      await browserAgentGraph.invoke(
        new Command({
          resume: { approved: true, hash, approvedAt, edits },
        }),
        threadConfig
      );
    } catch (err) {
      if (!err.message?.includes('interrupt')) {
        await logError('agentRunner.confirmReview', err.message);
      }
    } finally {
      activeRunners.delete(appIdStr);
    }
  })();

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.SUBMITTING,
    approvedAt,
    reviewHash: hash,
    message: 'Final review confirmed. Submitting application.',
  };
};

/**
 * Cancels active application workflow, cleans up browser session, and marks as failed/cancelled.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const cancelWorkflow = async (applicationId, userId) => {
  const appIdStr = String(applicationId);

  await SessionRegistry.closeSession(appIdStr).catch(() => {});
  activeRunners.delete(appIdStr);

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    status: AGENT_STATUS.FAILED,
    notes: 'Workflow cancelled by user.',
  }).catch(() => {});

  await logJobEvent('agentRunner', 'WORKFLOW_CANCELLED', `[application:${appIdStr}] Workflow cancelled by user.`);

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.FAILED,
    message: 'Application workflow cancelled.',
  };
};

export default {
  startApplicationWorkflow,
  getWorkflowStatus,
  getWorkflowQuestions,
  submitWorkflowAnswers,
  getWorkflowReview,
  confirmWorkflowReview,
  cancelWorkflow,
};
