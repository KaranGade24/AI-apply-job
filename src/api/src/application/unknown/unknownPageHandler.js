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

  return {
    status: APPLICATION_STATUS.AI_RUNNING,
    terminalState: null,
    pageUrl: session.currentUrl || url,
    message: "Feature-flagged LangGraph browser workflow started.",
  };
};

/** Compatibility entry point retained for callers that analyze an unknown page. */
export const analyzeUnknownPage = async (params = {}) =>
  executeAutonomousUnknownApplication(params);

/** Runs the generic unknown-site browser workflow. */
export const executeAutonomousUnknownApplication = async ({
  url,
  job = {},
  userId = null,
  applicationId = null,
  resumePdfPath = null,
  candidateInfo = null,
  sessionState = null,
}) => {
  try {
    if (!url)
      throw new Error("No URL provided for autonomous browser agent execution");

    await logJobEvent(
      "unknownPageHandler",
      "AGENT_START",
      `Launching Observe-Analyze-Decide-Act-Verify agent for: ${url} (Job: "${job.title || "Position"}")`,
    );

    if (process.env.GENERIC_AGENT_USE_LANGGRAPH === "true") {
      return await executeFlaggedGraphWorkflow({ url, userId, applicationId });
    }

    const agentResult = await executeAgentLoop({
      url,
      job,
      userId,
      applicationId,
      resumePdfPath,
      candidateInfo,
      sessionState,
    });

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
  }
};

export default {
  analyzeUnknownPage,
  executeAutonomousUnknownApplication,
};
