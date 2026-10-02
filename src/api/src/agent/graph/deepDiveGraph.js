import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { DeepDiveAgentStateAnnotation } from "../schema/deepDiveStateSchema.js";
import { SessionRegistry } from "../../browser/session/sessionRegistry.js";
import { analyzePage } from "../browser/analyze/pageAnalyzer.js";
import { decideNextDeepDiveAction } from "../decision/decisionEngine.js";
import { executeDeepDiveAction } from "../../browser/executor/actionExecutor.js";
import { verifyDeepDiveAction } from "../../browser/verifier/actionVerifier.js";
import {
  checkHumanInterventionNeeded,
  pauseForHumanIntervention,
} from "../../browser/safety/humanInterventionManager.js";
import { JobApplication } from "../../model/JobApplication.js";
import { APPLICATION_STATUS } from "../../constant/application.constant.js";
import {
  DEEP_DIVE_ACTIONS,
  PERCEPTION_PAGE_TYPES,
  AGENT_STATUS,
} from "../../constant/agent.constant.js";
import { logJobEvent, logError } from "../../utils/logger.js";

/**
 * Node 1: Observe & Analyze
 */
const observeAndAnalyzeNode = async (state) => {
  const { applicationData } = state;
  const appId = applicationData?.applicationId;

  await logJobEvent("deepDiveGraph", "OBSERVE_START", `Analyzing page DOM for app ${appId}`);

  const session = await SessionRegistry.getOrCreateSession(appId);
  const activePage = session.getActivePage();

  if (!activePage || activePage.isClosed()) {
    return {
      status: AGENT_STATUS.FAILED,
      errors: ["Active browser page is closed or unavailable"],
    };
  }

  const analysis = await analyzePage(activePage);

  return {
    browserState: {
      currentUrl: analysis.url,
      title: analysis.title,
      isLoaded: true,
    },
    pageState: {
      pageType: analysis.pageType,
      title: analysis.title,
      elementsCount: analysis.inputs.length + analysis.buttons.length,
      validationErrors: analysis.validationErrors,
      disabledReason: analysis.disabledButtonReasoning?.reason || null,
      summary: analysis.summary || "",
      rawAnalysis: analysis,
    },
    stepCount: (state.stepCount || 0) + 1,
  };
};

/**
 * Node 2: Decide Next Action
 */
const decideNode = async (state) => {
  const { pageState, jobContext, userProfile, resumeData, actionHistory } = state;

  const decision = await decideNextDeepDiveAction({
    pageAnalysis: pageState.rawAnalysis,
    jobContext,
    userProfile,
    resumeData,
    actionHistory,
  });

  return {
    nextAction: decision.nextAction,
  };
};

/**
 * Node 3: Act (Execute Playwright Action)
 */
const actNode = async (state) => {
  const { applicationData, nextAction, resumeData } = state;
  const appId = applicationData?.applicationId;

  const session = await SessionRegistry.getOrCreateSession(appId);
  const activePage = session.getActivePage();

  const executionResult = await executeDeepDiveAction(activePage, nextAction, {
    resumePdfPath: resumeData?.pdfPath,
  });

  return {
    lastAction: nextAction,
    actionResult: executionResult,
  };
};

/**
 * Node 4: Verify Action Outcome
 */
const verifyNode = async (state) => {
  const { applicationData, pageState, lastAction } = state;
  const appId = applicationData?.applicationId;

  const session = await SessionRegistry.getOrCreateSession(appId);
  const activePage = session.getActivePage();
  const postAnalysis = await analyzePage(activePage);

  const verification = verifyDeepDiveAction(pageState?.rawAnalysis, postAnalysis, lastAction);

  await logJobEvent("deepDiveGraph", "VERIFIED", verification.message);

  const isSuccess = postAnalysis.pageType === PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS;

  return {
    pageState: {
      ...pageState,
      rawAnalysis: postAnalysis,
      pageType: postAnalysis.pageType,
    },
    status: isSuccess ? AGENT_STATUS.COMPLETED : AGENT_STATUS.FILLING,
    actionHistory: [
      {
        action: lastAction?.type,
        target: lastAction?.target,
        verified: verification.verified,
        result: verification.message,
      },
    ],
  };
};

/**
 * Route condition
 */
const routeNextStep = (state) => {
  if (state.status === AGENT_STATUS.COMPLETED) return END;
  if (state.status === AGENT_STATUS.FAILED) return END;

  if (state.nextAction?.type === DEEP_DIVE_ACTIONS.FINISH) return END;
  if (state.nextAction?.type === DEEP_DIVE_ACTIONS.HUMAN_INTERVENTION) return END;

  if ((state.stepCount || 0) >= 25) return END;

  return "actNode";
};

/**
 * Route after verification
 */
const routeAfterVerify = (state) => {
  if (state.status === AGENT_STATUS.COMPLETED) return END;
  if ((state.stepCount || 0) >= 25) return END;
  return "observeAndAnalyzeNode";
};

// Assemble LangGraph StateGraph
const workflow = new StateGraph(DeepDiveAgentStateAnnotation)
  .addNode("observeAndAnalyzeNode", observeAndAnalyzeNode)
  .addNode("decideNode", decideNode)
  .addNode("actNode", actNode)
  .addNode("verifyNode", verifyNode)
  .addEdge(START, "observeAndAnalyzeNode")
  .addEdge("observeAndAnalyzeNode", "decideNode")
  .addConditionalEdges("decideNode", routeNextStep, {
    actNode: "actNode",
    [END]: END,
  })
  .addEdge("actNode", "verifyNode")
  .addConditionalEdges("verifyNode", routeAfterVerify, {
    observeAndAnalyzeNode: "observeAndAnalyzeNode",
    [END]: END,
  });

export const deepDiveGraph = workflow.compile();

export default deepDiveGraph;
