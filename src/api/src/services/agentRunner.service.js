import { Command } from "@langchain/langgraph";
import {
  browserAgentGraph,
  computeAnswersHash,
} from "../agent/graph/browserAgentGraph.js";
import {
  computeReviewHash,
  applyUserEditsToReview,
} from "../agent/browser/review/reviewBuilder.js";
import { SessionRegistry } from "../browser/session/sessionRegistry.js";
import { ApplicationSessionRepository } from "../repositories/applicationSession.repository.js";
import { ApplicationRepository } from "../repositories/application.repository.js";
import { JobApplication } from "../model/JobApplication.js";
import { AGENT_STATUS, MAX_AGENT_STEPS } from "../constant/agent.constant.js";
import { appError } from "../utils/errors.js";
import { logJobEvent, logError } from "../utils/logger.js";
import {
  normalizeWorkflowStatus,
  toAgentStatus,
} from "../agent/statusMapping.js";

// In-memory set of applicationIds currently undergoing active execution (concurrency lock)
const activeRunners = new Set();

/**
 * Asserts that the authenticated user owns the job application.
 * Denies with 401 if unauthorized, 404 if not found, 403 if access denied.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>} JobApplication document
 */
const assertOwnership = async (applicationId, userId) => {
  if (!userId) {
    throw new appError("Unauthorized", 401);
  }
  const jobApp = await JobApplication.findById(applicationId)
    .lean()
    .catch((err) => {
      logError("agentRunner.assertOwnership.findById", err.message);
      throw new appError("Application not found", 404);
    });
  if (!jobApp) {
    throw new appError("Application not found", 404);
  }
  if (String(jobApp.userId) !== String(userId)) {
    throw new appError("Access denied", 403);
  }
  return jobApp;
};

/**
 * Builds the standard LangGraph execution thread configuration.
 *
 * @param {string} applicationId
 * @returns {object}
 */
const getThreadConfig = (applicationId) => ({
  configurable: {
    thread_id: `app_thread_${applicationId}`,
    checkpoint_ns: "browser_agent",
  },
});

const ensureApplicationSession = async (
  applicationId,
  userId,
  threadId,
  currentUrl = "",
) => {
  const existing =
    await ApplicationSessionRepository.findSessionByApplicationId(
      applicationId,
      userId,
    );
  if (existing) return existing;
  return ApplicationSessionRepository.createSession({
    applicationId,
    userId,
    threadId,
    currentUrl,
    status: AGENT_STATUS.STARTING.toLowerCase(),
  });
};

/**
 * Starts or advances the browser automation graph for an application.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} [options]
 * @returns {Promise<object>} Current workflow status
 */
export const startApplicationWorkflow = async (
  applicationId,
  userId,
  options = {},
) => {
  const appIdStr = String(applicationId);
  const jobApp = await assertOwnership(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);
  await ensureApplicationSession(
    appIdStr,
    userId,
    threadConfig.configurable.thread_id,
    jobApp.applyUrl || options.applyUrl || "",
  );

  // Check if thread is already interrupted or running
  const stateSnapshot = await browserAgentGraph
    .getState(threadConfig)
    .catch((err) => {
      logError("agentRunner.getState", err.message);
      return null;
    });

  const isRunning = activeRunners.has(appIdStr);
  const isInterrupted = stateSnapshot?.next?.length > 0;

  if (isRunning || isInterrupted) {
    return await getWorkflowStatus(appIdStr, userId);
  }

  // Concurrency lock
  if (activeRunners.has(appIdStr)) {
    throw new appError(
      `Application ${appIdStr} is already running an active workflow step.`,
      409,
    );
  }

  const applyUrl = jobApp.applyUrl || options.applyUrl || "";

  // Ensure SessionRegistry context is initialized and navigate session page to applyUrl before first observation
  const session = await SessionRegistry.createOrGetSession(
    appIdStr,
    userId,
  ).catch((err) => {
    logError("agentRunner.createOrGetSession", err.message);
    throw err;
  });

  if (session && session.activePage && applyUrl) {
    await session.activePage
      .goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
      .catch((err) => {
        logError("agentRunner.pageGoto", err.message);
      });
  }

  activeRunners.add(appIdStr);
  SessionRegistry.clearHumanResponseTimer(appIdStr);

  // Run graph asynchronously in background
  (async () => {
    try {
      await logJobEvent(
        "agentRunner",
        "WORKFLOW_INVOKED",
        `[application:${appIdStr}] Starting graph run`,
      );

      const initialState = {
        applicationId: appIdStr,
        userId: String(userId),
        threadId: threadConfig.configurable.thread_id,
        currentUrl: applyUrl,
        stepCount: 0,
        pendingQuestions: [],
        answers: [],
        status: AGENT_STATUS.STARTING,
      };

      await browserAgentGraph.invoke(initialState, {
        ...threadConfig,
        recursionLimit: MAX_AGENT_STEPS * 8 + 10,
      });

      // Post-invocation check: did it pause waiting for human?
      const statusResult = await getWorkflowStatus(appIdStr, userId).catch(() => null);
      if (
        statusResult &&
        (statusResult.status === AGENT_STATUS.WAITING_FOR_USER ||
         statusResult.status === AGENT_STATUS.WAITING_FOR_CONFIRMATION)
      ) {
        SessionRegistry.startHumanResponseTimer(appIdStr, userId);
      }
    } catch (err) {
      await logError("agentRunner.startWorkflow.invoke", err.message);
      const isRecursion =
        err.message?.includes("recursion") ||
        err.name?.includes("GraphRecursionError");
      const reason = isRecursion
        ? "Graph execution exceeded max recursion steps limit (GraphRecursionError)"
        : err.message;

      await ApplicationSessionRepository.updateSession(appIdStr, userId, {
        status: AGENT_STATUS.FAILED,
        notes: reason,
      }).catch((updateErr) =>
        logError("agentRunner.updateSession.fail", updateErr.message),
      );

      await ApplicationRepository.updateApplicationStatus(appIdStr, "failed", {
        logMessage: `Agent execution failed: ${reason}`,
      }).catch((updateErr) =>
        logError("agentRunner.updateApp.fail", updateErr.message),
      );

      await SessionRegistry.closeSession(appIdStr).catch((closeErr) =>
        logError("agentRunner.closeSession.fail", closeErr.message),
      );
    } finally {
      activeRunners.delete(appIdStr);
    }
  })();

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.STARTING,
    message: "Application automation workflow started.",
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
  const jobApp = await assertOwnership(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);

  const stateSnapshot = await browserAgentGraph
    .getState(threadConfig)
    .catch((err) => {
      logError("agentRunner.getWorkflowStatus.getState", err.message);
      return null;
    });
  const sessionDoc =
    await ApplicationSessionRepository.findSessionByApplicationId(
      appIdStr,
      userId,
    ).catch((err) => {
      logError("agentRunner.getWorkflowStatus.findSession", err.message);
      return null;
    });

  const values = stateSnapshot?.values || {};
  const status =
    values.status || toAgentStatus(sessionDoc?.status) || AGENT_STATUS.IDLE;
  const mappedStatus = normalizeWorkflowStatus({
    agentStatus: status,
    applicationStatus: jobApp?.status,
  });
  const isInterrupted = stateSnapshot?.next?.length > 0;

  return {
    applicationId: appIdStr,
    status,
    agentStatus: mappedStatus.agentStatus,
    applicationStatus: mappedStatus.applicationStatus,
    sessionStatus: mappedStatus.sessionStatus,
    currentUrl: values.currentUrl || sessionDoc?.currentUrl || "",
    pageType: values.pageType || "UNKNOWN",
    stepCount: values.stepCount || 0,
    isWaitingForHuman: status === AGENT_STATUS.WAITING_FOR_USER,
    isWaitingForReview: status === AGENT_STATUS.WAITING_FOR_CONFIRMATION,
    pendingQuestionsCount: (
      values.pendingQuestions ||
      sessionDoc?.pendingQuestions ||
      []
    ).length,
    finalReview: values.finalReview ||
      sessionDoc?.finalReview || { approved: false },
    submission: values.submission ||
      sessionDoc?.submissionResult || { submitted: false },
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
  await assertOwnership(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);

  const stateSnapshot = await browserAgentGraph
    .getState(threadConfig)
    .catch((err) => {
      logError("agentRunner.getWorkflowQuestions.getState", err.message);
      return null;
    });
  const sessionDoc =
    await ApplicationSessionRepository.findSessionByApplicationId(
      appIdStr,
      userId,
    ).catch((err) => {
      logError("agentRunner.getWorkflowQuestions.findSession", err.message);
      return null;
    });

  const questions =
    stateSnapshot?.values?.pendingQuestions ||
    sessionDoc?.pendingQuestions ||
    [];

  return {
    applicationId: appIdStr,
    pendingQuestions: questions,
    isWaitingForHuman: questions.length > 0,
  };
};

export const getWorkflowEvents = async (applicationId, userId, limit = 50) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);
  const events = await ApplicationSessionRepository.getHistory(
    appIdStr,
    userId,
    limit,
  );
  return {
    applicationId: appIdStr,
    events,
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
export const submitWorkflowAnswers = async (
  applicationId,
  userId,
  answers = [],
) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);

  // 1. Check if graph is currently interrupted / waiting for answers
  const stateSnapshot = await browserAgentGraph
    .getState(threadConfig)
    .catch((err) => {
      logError("agentRunner.submitAnswers.getState", err.message);
      return null;
    });

  if (
    !stateSnapshot ||
    !stateSnapshot.next ||
    stateSnapshot.next.length === 0
  ) {
    throw new appError(
      `Workflow is not currently paused waiting for human input.`,
      400,
    );
  }

  // 2. Concurrency lock
  if (activeRunners.has(appIdStr)) {
    throw new appError(
      `Application ${appIdStr} is currently processing an action.`,
      409,
    );
  }

  activeRunners.add(appIdStr);
  SessionRegistry.clearHumanResponseTimer(appIdStr);

  // Resume graph asynchronously in background
  (async () => {
    try {
      await logJobEvent(
        "agentRunner",
        "RESUME_WITH_ANSWERS",
        `[application:${appIdStr}] Resuming workflow with ${answers.length} answers`,
      );

      // Recreate session if server restarted while paused
      await SessionRegistry.createOrGetSession(appIdStr, userId).catch(
        (err) => {
          logError("agentRunner.resumeAnswers.session", err.message);
        },
      );

      await browserAgentGraph.invoke(
        new Command({
          resume: answers,
        }),
        {
          ...threadConfig,
          recursionLimit: MAX_AGENT_STEPS * 8 + 10,
        },
      );

      // Post-invocation check: did it pause waiting for human again?
      const statusResult = await getWorkflowStatus(appIdStr, userId).catch(() => null);
      if (
        statusResult &&
        (statusResult.status === AGENT_STATUS.WAITING_FOR_USER ||
         statusResult.status === AGENT_STATUS.WAITING_FOR_CONFIRMATION)
      ) {
        SessionRegistry.startHumanResponseTimer(appIdStr, userId);
      }
    } catch (err) {
      await logError("agentRunner.resumeAnswers.invoke", err.message);
      const isRecursion =
        err.message?.includes("recursion") ||
        err.name?.includes("GraphRecursionError");
      const reason = isRecursion
        ? "Graph execution exceeded max recursion steps limit (GraphRecursionError)"
        : err.message;

      await ApplicationSessionRepository.updateSession(appIdStr, userId, {
        status: AGENT_STATUS.FAILED,
        notes: reason,
      }).catch((updateErr) =>
        logError("agentRunner.updateSession.fail", updateErr.message),
      );

      await ApplicationRepository.updateApplicationStatus(appIdStr, "failed", {
        logMessage: `Agent execution failed during answers resume: ${reason}`,
      }).catch((updateErr) =>
        logError("agentRunner.updateApp.fail", updateErr.message),
      );

      await SessionRegistry.closeSession(appIdStr).catch((closeErr) =>
        logError("agentRunner.closeSession.fail", closeErr.message),
      );
    } finally {
      activeRunners.delete(appIdStr);
    }
  })();

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.FILLING,
    message: "Answers received. Workflow resumed.",
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
  await assertOwnership(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);

  const stateSnapshot = await browserAgentGraph
    .getState(threadConfig)
    .catch((err) => {
      logError("agentRunner.getWorkflowReview.getState", err.message);
      return null;
    });
  const sessionDoc =
    await ApplicationSessionRepository.findSessionByApplicationId(
      appIdStr,
      userId,
    ).catch((err) => {
      logError("agentRunner.getWorkflowReview.findSession", err.message);
      return null;
    });

  const finalReview =
    stateSnapshot?.values?.finalReview || sessionDoc?.finalReview || null;
  const answers = stateSnapshot?.values?.answers || sessionDoc?.answers || [];
  const hash =
    finalReview?.reviewHash || finalReview?.hash || computeAnswersHash(answers);

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
 * Applies edits to pre-submission review and returns the new reviewHash.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {Array<object>} edits
 * @returns {Promise<object>}
 */
export const updateWorkflowReviewEdits = async (
  applicationId,
  userId,
  edits = [],
) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  const threadConfig = getThreadConfig(appIdStr);
  const stateSnapshot = await browserAgentGraph
    .getState(threadConfig)
    .catch((err) => {
      logError("agentRunner.updateReviewEdits.getState", err.message);
      return null;
    });
  const sessionDoc =
    await ApplicationSessionRepository.findSessionByApplicationId(
      appIdStr,
      userId,
    ).catch((err) => {
      logError("agentRunner.updateReviewEdits.findSession", err.message);
      return null;
    });

  const currentReview =
    stateSnapshot?.values?.finalReview || sessionDoc?.finalReview;
  if (!currentReview) {
    throw new appError(
      "No active final review found for this application.",
      404,
    );
  }

  const { updatedReview, changedFields, diffActions } = applyUserEditsToReview({
    currentReview,
    edits,
  });

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    finalReview: updatedReview,
  }).catch((err) => {
    logError("agentRunner.updateReviewEdits.session", err.message);
  });

  return {
    applicationId: appIdStr,
    reviewHash: updatedReview.reviewHash,
    finalReview: updatedReview,
    changedFields,
    diffActions,
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
export const confirmWorkflowReview = async (
  applicationId,
  userId,
  { approved, hash, edits } = {},
) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  if (!approved) {
    throw new appError("Confirmation approval must be explicitly true.", 400);
  }
  if (edits !== undefined && edits !== null) {
    throw new appError(
      "Edits are not accepted in confirm. Use PATCH /api/applications/:id/agent/review to update review edits before confirming.",
      400,
    );
  }

  const reviewData = await getWorkflowReview(appIdStr, userId);
  const expectedHash = reviewData.reviewHash || reviewData.answersHash;

  if (expectedHash !== hash) {
    throw new appError(
      "Answers were modified since review was loaded. Please review again.",
      400,
    );
  }

  const approvedAt = new Date().toISOString();

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    reviewHash: hash,
    approvedAt,
    status: AGENT_STATUS.SUBMITTING,
  }).catch((err) => {
    logError("agentRunner.confirmReview.session", err.message);
  });

  if (activeRunners.has(appIdStr)) {
    throw new appError(
      `Application ${appIdStr} is currently processing an action.`,
      409,
    );
  }

  activeRunners.add(appIdStr);
  SessionRegistry.clearHumanResponseTimer(appIdStr);

  (async () => {
    try {
      await logJobEvent(
        "agentRunner",
        "RESUME_REVIEW_CONFIRMED",
        `[application:${appIdStr}] User approved final submission with hash ${hash} at ${approvedAt}`,
      );

      await SessionRegistry.createOrGetSession(appIdStr, userId).catch(
        (err) => {
          logError("agentRunner.confirmReview.sessionCreate", err.message);
        },
      );

      await browserAgentGraph.invoke(
        new Command({
          resume: { approved: true, hash, approvedAt },
        }),
        {
          ...threadConfig,
          recursionLimit: MAX_AGENT_STEPS * 8 + 10,
        },
      );

      // Post-invocation check: did it pause waiting for human again?
      const statusResult = await getWorkflowStatus(appIdStr, userId).catch(() => null);
      if (
        statusResult &&
        (statusResult.status === AGENT_STATUS.WAITING_FOR_USER ||
         statusResult.status === AGENT_STATUS.WAITING_FOR_CONFIRMATION)
      ) {
        SessionRegistry.startHumanResponseTimer(appIdStr, userId);
      }
    } catch (err) {
      await logError("agentRunner.confirmReview.invoke", err.message);
      const isRecursion =
        err.message?.includes("recursion") ||
        err.name?.includes("GraphRecursionError");
      const reason = isRecursion
        ? "Graph execution exceeded max recursion steps limit (GraphRecursionError)"
        : err.message;

      await ApplicationSessionRepository.updateSession(appIdStr, userId, {
        status: AGENT_STATUS.FAILED,
        notes: reason,
      }).catch((updateErr) =>
        logError("agentRunner.updateSession.fail", updateErr.message),
      );

      await ApplicationRepository.updateApplicationStatus(appIdStr, "failed", {
        logMessage: `Agent execution failed during confirmation: ${reason}`,
      }).catch((updateErr) =>
        logError("agentRunner.updateApp.fail", updateErr.message),
      );

      await SessionRegistry.closeSession(appIdStr).catch((closeErr) =>
        logError("agentRunner.closeSession.fail", closeErr.message),
      );
    } finally {
      activeRunners.delete(appIdStr);
    }
  })();

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.SUBMITTING,
    approvedAt,
    reviewHash: hash,
    message: "Final review confirmed. Submitting application.",
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
  await assertOwnership(appIdStr, userId);

  SessionRegistry.clearHumanResponseTimer(appIdStr);

  await SessionRegistry.closeSession(appIdStr).catch((err) => {
    logError("agentRunner.cancelWorkflow.closeSession", err.message);
  });
  activeRunners.delete(appIdStr);

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    status: AGENT_STATUS.FAILED,
    notes: "Workflow cancelled by user.",
  }).catch((err) => {
    logError("agentRunner.cancelWorkflow.updateSession", err.message);
  });

  await logJobEvent(
    "agentRunner",
    "WORKFLOW_CANCELLED",
    `[application:${appIdStr}] Workflow cancelled by user.`,
  );

  return {
    applicationId: appIdStr,
    status: AGENT_STATUS.FAILED,
    message: "Application workflow cancelled.",
  };
};

export default {
  startApplicationWorkflow,
  getWorkflowStatus,
  getWorkflowQuestions,
  getWorkflowEvents,
  submitWorkflowAnswers,
  getWorkflowReview,
  updateWorkflowReviewEdits,
  confirmWorkflowReview,
  cancelWorkflow,
};
