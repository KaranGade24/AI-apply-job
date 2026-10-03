import { SessionRegistry } from "../browser/session/sessionRegistry.js";
import {
  dispatchBrowserAction,
  getLatestBrowserFrame,
  checkHumanChallengeResolved,
  broadcastToApp,
} from "../browser/session/browserStreamService.js";
import { ApplicationSessionRepository } from "../repositories/applicationSession.repository.js";
import { JobApplication } from "../model/JobApplication.js";
import {
  CONTROL_MODES,
  AGENT_STATUS,
  REALTIME_EVENTS,
} from "../constant/agent.constant.js";
import { appError } from "../utils/errors.js";
import { logJobEvent, logError } from "../utils/logger.js";
import { Command } from "@langchain/langgraph";
import { browserAgentGraph } from "../agent/graph/browserAgentGraph.js";

/**
 * Asserts user ownership of application.
 */
const assertOwnership = async (applicationId, userId) => {
  if (!userId) {
    throw new appError("Unauthorized", 401);
  }
  try {
    const jobApp = await JobApplication.findById(applicationId).lean();
    if (!jobApp) {
      return { _id: applicationId, userId };
    }
    if (String(jobApp.userId) !== String(userId)) {
      throw new appError("Access denied", 403);
    }
    return jobApp;
  } catch (err) {
    if (err.isOperational) throw err;
    return { _id: applicationId, userId };
  }
};

const getThreadConfig = (applicationId) => ({
  configurable: {
    thread_id: `app_thread_${applicationId}`,
    checkpoint_ns: "browser_agent",
  },
});

/**
 * Switches browser control mode to HUMAN (user manually takes control of the embedded browser).
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const takeControlService = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  const session = SessionRegistry.getSession(appIdStr);
  if (!session) {
    throw new appError("No active browser session found for this application", 404);
  }

  session.controlMode = CONTROL_MODES.HUMAN;

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    controlMode: CONTROL_MODES.HUMAN,
    status: AGENT_STATUS.WAITING_FOR_HUMAN,
  }).catch(() => {});

  await ApplicationSessionRepository.appendHistory(appIdStr, userId, {
    action: "Took browser control",
    pageUrl: session.getActivePage()?.url() || "",
    details: { source: "USER", controlMode: "HUMAN" },
  }).catch(() => {});

  broadcastToApp(appIdStr, {
    type: REALTIME_EVENTS.HUMAN_CONTROL_STARTED,
    controlMode: CONTROL_MODES.HUMAN,
    status: AGENT_STATUS.WAITING_FOR_HUMAN,
    timestamp: Date.now(),
  });

  await logJobEvent(
    "browserControlService",
    "TAKE_CONTROL",
    `[application:${appIdStr}] User took manual control of browser session`,
  );

  return {
    success: true,
    controlMode: CONTROL_MODES.HUMAN,
    status: AGENT_STATUS.WAITING_FOR_HUMAN,
    message: "Human control active. AI is paused. Interact directly inside the browser.",
  };
};

/**
 * Returns browser control mode from HUMAN back to AI.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const returnControlService = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  const session = SessionRegistry.getSession(appIdStr);
  if (!session) {
    throw new appError("No active browser session found for this application", 404);
  }

  session.controlMode = CONTROL_MODES.AI;
  session.humanReason = null;
  session.humanMessage = null;

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    controlMode: CONTROL_MODES.AI,
    humanReason: "",
    humanMessage: "",
    status: AGENT_STATUS.FILLING,
  }).catch(() => {});

  await ApplicationSessionRepository.appendHistory(appIdStr, userId, {
    action: "Returned control to AI",
    pageUrl: session.getActivePage()?.url() || "",
    details: { source: "USER", controlMode: "AI" },
  }).catch(() => {});

  broadcastToApp(appIdStr, {
    type: REALTIME_EVENTS.HUMAN_CONTROL_ENDED,
    controlMode: CONTROL_MODES.AI,
    status: AGENT_STATUS.FILLING,
    timestamp: Date.now(),
  });

  await logJobEvent(
    "browserControlService",
    "RETURN_CONTROL",
    `[application:${appIdStr}] Control returned to AI agent`,
  );

  // Resume the AI workflow on the existing thread
  const threadConfig = getThreadConfig(appIdStr);
  const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);

  if (stateSnapshot && stateSnapshot.next && stateSnapshot.next.length > 0) {
    (async () => {
      try {
        await browserAgentGraph.invoke(
          new Command({
            resume: [{ questionId: "human_control_resumed", answer: "resumed", userConfirmed: true }],
          }),
          threadConfig,
        );
      } catch (err) {
        logError("browserControlService.resumeGraph", err.message);
      }
    })();
  }

  return {
    success: true,
    controlMode: CONTROL_MODES.AI,
    status: AGENT_STATUS.FILLING,
    message: "Control returned to AI. Automation resumed on current browser session.",
  };
};

/**
 * "I'm Done — Resume AI": Inspects the browser state, verifies the challenge is completed, and resumes AI.
 * If challenge is still present, rejects with explicit guidance rather than blindly resuming.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const resumeAfterVerificationService = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  const session = SessionRegistry.getSession(appIdStr);
  if (!session || !session.getActivePage()) {
    throw new appError("No active browser session found for verification.", 404);
  }

  // 1. Inspect live page state to verify challenge is cleared
  const verification = await checkHumanChallengeResolved(appIdStr);

  if (!verification.resolved) {
    await logJobEvent(
      "browserControlService",
      "VERIFICATION_INCOMPLETE",
      `[application:${appIdStr}] Verification check failed: ${verification.reason}`,
    );
    throw new appError(
      verification.reason || "Verification is still incomplete. Please finish the required action in the browser above.",
      400,
    );
  }

  // 2. Mark verified, transition control to AI, record timeline event
  session.controlMode = CONTROL_MODES.AI;
  session.humanReason = null;
  session.humanMessage = null;

  await ApplicationSessionRepository.updateSession(appIdStr, userId, {
    controlMode: CONTROL_MODES.AI,
    humanReason: "",
    humanMessage: "",
    status: AGENT_STATUS.FILLING,
    pendingQuestions: [],
  }).catch(() => {});

  await ApplicationSessionRepository.appendHistory(appIdStr, userId, {
    action: "Human verification completed",
    pageUrl: verification.currentUrl || "",
    pageType: verification.pageType || "",
    details: { source: "SYSTEM", verified: true },
  }).catch(() => {});

  broadcastToApp(appIdStr, {
    type: REALTIME_EVENTS.VERIFICATION_COMPLETED,
    controlMode: CONTROL_MODES.AI,
    status: AGENT_STATUS.FILLING,
    currentUrl: verification.currentUrl,
    timestamp: Date.now(),
  });

  await logJobEvent(
    "browserControlService",
    "VERIFIED_AND_RESUMED",
    `[application:${appIdStr}] Challenge verified completed. Resuming AI automation workflow.`,
  );

  // 3. Resume LangGraph workflow on the same thread without restarting
  const threadConfig = getThreadConfig(appIdStr);
  const stateSnapshot = await browserAgentGraph.getState(threadConfig).catch(() => null);

  if (stateSnapshot && stateSnapshot.next && stateSnapshot.next.length > 0) {
    (async () => {
      try {
        await browserAgentGraph.invoke(
          new Command({
            resume: [{ questionId: "captcha_resolution", answer: "solved", userConfirmed: true }],
          }),
          threadConfig,
        );
      } catch (err) {
        logError("browserControlService.resumeAfterVerification.invoke", err.message);
      }
    })();
  }

  return {
    success: true,
    verified: true,
    controlMode: CONTROL_MODES.AI,
    status: AGENT_STATUS.FILLING,
    currentUrl: verification.currentUrl,
    message: "Verification verified successfully! AI automation resumed.",
  };
};

/**
 * Dispatches remote user input action directly into the live browser session.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} action
 * @returns {Promise<object>}
 */
export const dispatchUserActionService = async (applicationId, userId, action) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);

  const res = await dispatchBrowserAction(appIdStr, action);
  if (!res.success) {
    throw new appError(res.message || "Failed to dispatch action to browser page", 400);
  }
  return res;
};

/**
 * Retrieves the latest screencast frame and status for an application.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getBrowserFrameService = async (applicationId, userId) => {
  const appIdStr = String(applicationId);
  await assertOwnership(appIdStr, userId);
  return getLatestBrowserFrame(appIdStr);
};

export default {
  takeControlService,
  returnControlService,
  resumeAfterVerificationService,
  dispatchUserActionService,
  getBrowserFrameService,
};
