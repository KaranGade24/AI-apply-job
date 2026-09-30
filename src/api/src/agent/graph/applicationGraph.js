import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { BrowserManager } from "../../browser/browserManager.js";
import { extractPageContent } from "../../application/pageAnalysis/pageContentExtractor.js";
import { normalizePage } from "../../application/pageAnalysis/pageNormalizer.js";
import { classifyPageStateLlm, PAGE_STATES } from "../../application/pageAnalysis/pageClassifierLlm.js";
import { decideNextAction } from "../../application/unknown/agentDecision.js";
import { executeSingleBrowserAction } from "../../browser/browserActionExecutor.js";
import { verifyActionResult } from "../../browser/actionVerifier.js";
import { orchestrateRecovery, RECOVERY_ACTIONS } from "../../browser/recovery/recoveryManager.js";
import { inspectForm } from "../../application/form/formInspector.js";
import { resolveAllFormAnswers } from "../../application/answer/answerResolver.js";
import { fillFormFields } from "../../application/form/formFiller.js";
import { verifyFilledFields } from "../../application/form/formVerifier.js";
import { logJobEvent, logError } from "../../utils/logger.js";
import { APPLICATION_STATUS } from "../../constant/application.constant.js";
import { updateApplicationStatus } from "../../repositories/application.repository.js";

/**
 * Node 1: Initialize the browser state, page, and agentState context
 */
const initializeNode = async (state) => {
  await logJobEvent("applicationGraph", "INITIALIZE", "Initializing browser execution context...");
  return {
    status: APPLICATION_STATUS.AI_RUNNING,
    stepCount: 1,
    actionHistory: []
  };
};

/**
 * Node 2: Observe DOM, extract layout structures and page elements
 */
const observeNode = async (state) => {
  await logJobEvent("applicationGraph", "OBSERVE", "Observing current page layout...");
  const raw = await extractPageContent(state.page);
  const normalized = normalizePage(raw);
  return {
    rawPageContent: raw,
    normalizedState: normalized
  };
};

/**
 * Node 3: Classify semantic page state using Stage 1 Classifier
 */
const classifyNode = async (state) => {
  await logJobEvent("applicationGraph", "CLASSIFY", "Classifying page semantic state...");
  const classification = await classifyPageStateLlm(state.normalizedState, state.userId);
  return {
    pageState: classification.state,
    pageClassification: classification
  };
};

/**
 * Node 4: Determine next automation Goal
 */
const determineGoalNode = async (state) => {
  await logJobEvent("applicationGraph", "DETERMINE_GOAL", `Current State: ${state.pageState}`);
  let mode = "normal";

  if (state.pageState === PAGE_STATES.APPLICATION_FORM || state.pageState === PAGE_STATES.FORM_STEP) {
    mode = "form_flow";
  } else if (state.pageState === PAGE_STATES.REVIEW) {
    mode = "final_flow";
  }

  return { executionMode: mode };
};

/**
 * Node 5: Plan next logical action using Stage 2 Decision Engine
 */
const planNode = async (state) => {
  await logJobEvent("applicationGraph", "PLAN", "Planning next browser action...");
  const decision = await decideNextAction(
    state.normalizedState,
    state.agentState || {},
    state.job || {},
    state.pageClassification || {},
    state.userId
  );
  return { plannedDecision: decision };
};

/**
 * Node 6: Validate parameters and URL safety checks before execution
 */
const validateNode = async (state) => {
  await logJobEvent("applicationGraph", "VALIDATE", "Validating action parameters...");
  const decision = state.plannedDecision;
  const isInvalid = !decision || !decision.decision;
  return { actionValidated: !isInvalid };
};

/**
 * Node 7: Execute single deterministic browser interaction via Playwright
 */
const executeNode = async (state) => {
  await logJobEvent("applicationGraph", "EXECUTE", `Executing action: ${state.plannedDecision.decision}`);
  const result = await executeSingleBrowserAction(state.page, state.plannedDecision, {
    resumePdfPath: state.resumePdfPath,
    context: state.browserContext
  });
  return { lastExecutionResult: result };
};

/**
 * Node 8: Verify outcome of action using post-action verification modules
 */
const verifyNode = async (state) => {
  await logJobEvent("applicationGraph", "VERIFY", "Verifying execution outcome...");
  const postRaw = await extractPageContent(state.page);
  const postNormalized = normalizePage(postRaw);
  const verification = verifyActionResult(state.normalizedState, postNormalized);
  return {
    actionVerified: verification.successDetected,
    normalizedState: postNormalized
  };
};

/**
 * Node 9: Formulate recovery strategy in case of failure
 */
const recoverNode = async (state) => {
  await logJobEvent("applicationGraph", "RECOVER", "Executing recovery orchestration...");
  const recovery = await orchestrateRecovery(state.lastExecutionResult?.error || "Action verification failed", {
    page: state.page,
    agentState: state.agentState,
    previousAction: state.plannedDecision,
    currentUrl: state.page?.url()
  });

  return {
    recoveryStrategy: recovery.strategy,
    status: recovery.strategy === RECOVERY_ACTIONS.ASK_HUMAN ? APPLICATION_STATUS.HUMAN_REQUIRED : state.status
  };
};

/**
 * Form Flow Node 1: Inspect form for input fields
 */
const inspectFormNode = async (state) => {
  await logJobEvent("applicationGraph", "INSPECT_FORM", "Inspecting form inputs...");
  const inspection = await inspectForm(state.page);
  return {
    formFields: inspection.fields || [],
    stepperState: inspection.stepperState || {}
  };
};

/**
 * Form Flow Node 2: Resolve answers from profile & resume facts
 */
const resolveAnswersNode = async (state) => {
  await logJobEvent("applicationGraph", "RESOLVE_ANSWERS", "Resolving answer matches...");
  const context = {
    userProfile: state.candidateInfo?.personalInfo || {},
    user: { email: state.candidateInfo?.personalInfo?.email },
    userSetting: {},
    resumeData: state.candidateInfo || {},
    job: state.job || {}
  };
  const resolution = await resolveAllFormAnswers(state.formFields, context);
  return {
    resolvedAnswers: resolution.resolvedAnswers || [],
    missingQuestions: resolution.missingQuestions || []
  };
};

/**
 * Form Flow Node 3: Filter for active human questions
 */
const humanQuestionsIfNeededNode = async (state) => {
  if (state.missingQuestions?.length > 0) {
    await logJobEvent("applicationGraph", "HUMAN_QUESTIONS", `${state.missingQuestions.length} questions require user input.`);
    return { status: APPLICATION_STATUS.WAITING_FOR_USER };
  }
  return { status: state.status };
};

/**
 * Form Flow Node 4: Fill form fields via Playwright
 */
const fillNode = async (state) => {
  await logJobEvent("applicationGraph", "FILL", `Filling ${state.resolvedAnswers?.length} resolved answers...`);
  await fillFormFields(state.page, state.resolvedAnswers);
  return {};
};

/**
 * Form Flow Node 5: Verify filled values stick
 */
const verifyFieldsNode = async (state) => {
  await logJobEvent("applicationGraph", "VERIFY_FIELDS", "Verifying field values...");
  const verification = await verifyFilledFields(state.page, state.resolvedAnswers);
  return { fieldsVerified: verification.allStuck };
};

/**
 * Form Flow Node 6: Validate step layout elements
 */
const validateStepNode = async (state) => {
  await logJobEvent("applicationGraph", "VALIDATE_STEP", "Validating current form step...");
  return { stepValidated: true };
};

/**
 * Final Flow Node 1: Review full page before submission
 */
const reviewNode = async (state) => {
  await logJobEvent("applicationGraph", "REVIEW", "Reviewing drafted application fields...");
  return {};
};

/**
 * Final Flow Node 2: Confirmation verification check
 */
const confirmationNode = async (state) => {
  await logJobEvent("applicationGraph", "CONFIRMATION", "Awaiting user final confirmation...");
  return { status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW };
};

/**
 * Final Flow Node 3: Check submission guard rules
 */
const submissionGuardNode = async (state) => {
  await logJobEvent("applicationGraph", "SUBMISSION_GUARD", "Executing submission guard safety check...");
  const allRequiredFilled = (state.missingQuestions || []).length === 0;
  return { submissionAllowed: allRequiredFilled };
};

/**
 * Final Flow Node 4: Submit the application
 */
const submitNode = async (state) => {
  await logJobEvent("applicationGraph", "SUBMIT", "Submitting application...");
  const submitBtn = await state.page.$('button[type="submit"], [id*="submit" i], [class*="submit" i]');
  if (submitBtn) {
    await submitBtn.click();
    await state.page.waitForTimeout(3000);
  }
  return {};
};

/**
 * Final Flow Node 5: Post-submission state verification
 */
const verifySubmissionNode = async (state) => {
  await logJobEvent("applicationGraph", "VERIFY_SUBMISSION", "Verifying submission success...");
  const bodyText = await state.page.innerText('body');
  const hasSuccess = /(thank\s*you|submitted|success|confirmation)/i.test(bodyText);
  return {
    submittedSuccessfully: hasSuccess,
    status: hasSuccess ? APPLICATION_STATUS.APPLIED : APPLICATION_STATUS.FAILED
  };
};

/**
 * Conditional Routers
 */
const routeFromClassify = (state) => {
  if (state.pageState === PAGE_STATES.CAPTCHA_REQUIRED || state.pageState === PAGE_STATES.MFA_REQUIRED || state.pageState === PAGE_STATES.OTP_REQUIRED) {
    return "recoverNode";
  }
  return "determineGoalNode";
};

const routeAfterGoal = (state) => {
  if (state.executionMode === "form_flow") return "inspectFormNode";
  if (state.executionMode === "final_flow") return "reviewNode";
  return "planNode";
};

const routeAfterValidate = (state) => {
  if (state.actionValidated) return "executeNode";
  return "recoverNode";
};

const routeAfterVerify = (state) => {
  if (state.actionVerified) return END;
  return "recoverNode";
};

const routeAfterRecovery = (state) => {
  if (state.status === APPLICATION_STATUS.HUMAN_REQUIRED) return END;
  return "observeNode";
};

const routeAfterHumanQuestions = (state) => {
  if (state.status === APPLICATION_STATUS.WAITING_FOR_USER) return END;
  return "fillNode";
};

const routeAfterFieldsVerify = (state) => {
  if (state.fieldsVerified) return "validateStepNode";
  return "inspectFormNode";
};

const routeAfterSubmissionGuard = (state) => {
  if (state.submissionAllowed) return "submitNode";
  return END;
};

// Build Low-Level Browser Application Graph
const graphWorkflow = new StateGraph({
  channels: {
    userId: { value: (x, y) => y ?? x, default: () => "" },
    applicationId: { value: (x, y) => y ?? x, default: () => "" },
    page: { value: (x, y) => y ?? x, default: () => null },
    browserContext: { value: (x, y) => y ?? x, default: () => null },
    job: { value: (x, y) => y ?? x, default: () => null },
    candidateInfo: { value: (x, y) => y ?? x, default: () => null },
    resumePdfPath: { value: (x, y) => y ?? x, default: () => "" },
    status: { value: (x, y) => y ?? x, default: () => APPLICATION_STATUS.PENDING },

    // Intermediate state channels
    rawPageContent: { value: (x, y) => y ?? x, default: () => null },
    normalizedState: { value: (x, y) => y ?? x, default: () => null },
    pageState: { value: (x, y) => y ?? x, default: () => PAGE_STATES.UNKNOWN },
    pageClassification: { value: (x, y) => y ?? x, default: () => null },
    executionMode: { value: (x, y) => y ?? x, default: () => "normal" },
    plannedDecision: { value: (x, y) => y ?? x, default: () => null },
    actionValidated: { value: (x, y) => y ?? x, default: () => false },
    lastExecutionResult: { value: (x, y) => y ?? x, default: () => null },
    actionVerified: { value: (x, y) => y ?? x, default: () => false },
    recoveryStrategy: { value: (x, y) => y ?? x, default: () => null },

    // Form flow channels
    formFields: { value: (x, y) => y ?? x, default: () => [] },
    resolvedAnswers: { value: (x, y) => y ?? x, default: () => [] },
    missingQuestions: { value: (x, y) => y ?? x, default: () => [] },
    fieldsVerified: { value: (x, y) => y ?? x, default: () => false },
    stepValidated: { value: (x, y) => y ?? x, default: () => false },

    // Final submission channels
    submissionAllowed: { value: (x, y) => y ?? x, default: () => false },
    submittedSuccessfully: { value: (x, y) => y ?? x, default: () => false }
  }
});

// Register Core Nodes
graphWorkflow.addNode("initializeNode", initializeNode);
graphWorkflow.addNode("observeNode", observeNode);
graphWorkflow.addNode("classifyNode", classifyNode);
graphWorkflow.addNode("determineGoalNode", determineGoalNode);
graphWorkflow.addNode("planNode", planNode);
graphWorkflow.addNode("validateNode", validateNode);
graphWorkflow.addNode("executeNode", executeNode);
graphWorkflow.addNode("verifyNode", verifyNode);
graphWorkflow.addNode("recoverNode", recoverNode);

// Register Form Flow Nodes
graphWorkflow.addNode("inspectFormNode", inspectFormNode);
graphWorkflow.addNode("resolveAnswersNode", resolveAnswersNode);
graphWorkflow.addNode("humanQuestionsIfNeededNode", humanQuestionsIfNeededNode);
graphWorkflow.addNode("fillNode", fillNode);
graphWorkflow.addNode("verifyFieldsNode", verifyFieldsNode);
graphWorkflow.addNode("validateStepNode", validateStepNode);

// Register Final Submission Nodes
graphWorkflow.addNode("reviewNode", reviewNode);
graphWorkflow.addNode("confirmationNode", confirmationNode);
graphWorkflow.addNode("submissionGuardNode", submissionGuardNode);
graphWorkflow.addNode("submitNode", submitNode);
graphWorkflow.addNode("verifySubmissionNode", verifySubmissionNode);

// Define Edges & Flow Structure
graphWorkflow.addEdge(START, "initializeNode");
graphWorkflow.addEdge("initializeNode", "observeNode");
graphWorkflow.addEdge("observeNode", "classifyNode");

graphWorkflow.addConditionalEdges("classifyNode", routeFromClassify, {
  recoverNode: "recoverNode",
  determineGoalNode: "determineGoalNode"
});

graphWorkflow.addConditionalEdges("determineGoalNode", routeAfterGoal, {
  inspectFormNode: "inspectFormNode",
  reviewNode: "reviewNode",
  planNode: "planNode"
});

graphWorkflow.addEdge("planNode", "validateNode");

graphWorkflow.addConditionalEdges("validateNode", routeAfterValidate, {
  executeNode: "executeNode",
  recoverNode: "recoverNode"
});

graphWorkflow.addEdge("executeNode", "verifyNode");

graphWorkflow.addConditionalEdges("verifyNode", routeAfterVerify, {
  recoverNode: "recoverNode",
  [END]: END
});

graphWorkflow.addConditionalEdges("recoverNode", routeAfterRecovery, {
  [END]: END,
  observeNode: "observeNode"
});

// Form Flow Edges
graphWorkflow.addEdge("inspectFormNode", "resolveAnswersNode");
graphWorkflow.addEdge("resolveAnswersNode", "humanQuestionsIfNeededNode");

graphWorkflow.addConditionalEdges("humanQuestionsIfNeededNode", routeAfterHumanQuestions, {
  [END]: END,
  fillNode: "fillNode"
});

graphWorkflow.addEdge("fillNode", "verifyFieldsNode");

graphWorkflow.addConditionalEdges("verifyFieldsNode", routeAfterFieldsVerify, {
  validateStepNode: "validateStepNode",
  inspectFormNode: "inspectFormNode"
});

graphWorkflow.addEdge("validateStepNode", END);

// Final Submission Edges
graphWorkflow.addEdge("reviewNode", "confirmationNode");
graphWorkflow.addEdge("confirmationNode", "submissionGuardNode");

graphWorkflow.addConditionalEdges("submissionGuardNode", routeAfterSubmissionGuard, {
  submitNode: "submitNode",
  [END]: END
});

graphWorkflow.addEdge("submitNode", "verifySubmissionNode");
graphWorkflow.addEdge("verifySubmissionNode", END);

export const memorySaver = new MemorySaver();
export const applicationGraph = graphWorkflow.compile({
  checkpointer: memorySaver,
});

export default applicationGraph;
