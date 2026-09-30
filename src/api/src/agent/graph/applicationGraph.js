import { StateGraph, START, END, Annotation, MemorySaver } from "@langchain/langgraph";
import {
  APPLICATION_STATES,
  APPLICATION_STATUS,
  VERIFICATION_LEVELS,
} from "../../constant/application.constant.js";
import { observeBrowser } from "../../browser/observer/browserObserver.js";
import { validateProposedAction } from "../../browser/executor/actionValidator.js";
import { executeBrowserAction } from "../../browser/executor/browserExecutor.js";
import { verifyStateTransition } from "../../browser/verifier/stateVerifier.js";
import { classifyFailure } from "../../browser/recovery/failureClassifier.js";
import { executeRecoveryStrategy } from "../../browser/recovery/recoveryManager.js";
import { evaluateSubmissionSafety } from "../../browser/safety/submissionGuard.js";
import { recordApplicationEvent } from "../../repositories/applicationEvent.repository.js";
import { upsertApplicationQuestion } from "../../repositories/applicationQuestion.repository.js";
import { JobApplication } from "../../model/JobApplication.js";
import { logJobEvent, logError } from "../../utils/logger.js";

/**
 * Strongly typed State Annotation for Verification-First Browser Application Graph
 */
export const ApplicationStateAnnotation = Annotation.Root({
  applicationId: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  userId: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  jobId: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  jobUrl: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  currentUrl: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  previousUrl: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  pageTitle: Annotation({ reducer: (x, y) => y ?? x ?? "", default: () => "" }),
  currentPageType: Annotation({ reducer: (x, y) => y ?? x ?? "UNKNOWN", default: () => "UNKNOWN" }),
  currentApplicationState: Annotation({
    reducer: (x, y) => y ?? x ?? APPLICATION_STATES.INIT,
    default: () => APPLICATION_STATES.INIT,
  }),
  browserSessionId: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  pageObservation: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  formFields: Annotation({ reducer: (x, y) => y ?? x ?? [], default: () => [] }),
  resolvedAnswers: Annotation({ reducer: (x, y) => y ?? x ?? [], default: () => [] }),
  unresolvedQuestions: Annotation({ reducer: (x, y) => y ?? x ?? [], default: () => [] }),
  proposedAction: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  actionResult: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  verificationResult: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  actionAttempts: Annotation({ reducer: (x, y) => (typeof y === "number" ? y : x || 0), default: () => 0 }),
  recoveryAttempts: Annotation({ reducer: (x, y) => (typeof y === "number" ? y : x || 0), default: () => 0 }),
  submissionAllowed: Annotation({ reducer: (x, y) => y ?? x ?? false, default: () => false }),
  submissionConfirmed: Annotation({ reducer: (x, y) => y ?? x ?? false, default: () => false }),
  submissionVerified: Annotation({ reducer: (x, y) => y ?? x ?? false, default: () => false }),
  confirmationId: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  status: Annotation({ reducer: (x, y) => y ?? x ?? APPLICATION_STATUS.PENDING, default: () => APPLICATION_STATUS.PENDING }),
  error: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
  pageInstance: Annotation({ reducer: (x, y) => y ?? x ?? null, default: () => null }),
});

/**
 * 1. Initialize Application Node
 */
export const initializeApplicationNode = async (state) => {
  try {
    await logJobEvent("applicationGraph", "INIT", `Initializing application state for ID: ${state.applicationId}`);
    return {
      currentApplicationState: APPLICATION_STATES.JOB_PAGE_OPEN,
      status: APPLICATION_STATUS.PROCESSING,
    };
  } catch (error) {
    return { error: error.message, status: APPLICATION_STATUS.FAILED };
  }
};

/**
 * 2. Observe Page Node
 */
export const observePageNode = async (state) => {
  try {
    const page = state.pageInstance;
    if (!page) {
      throw new Error("No active browser page instance provided to observePageNode");
    }

    const observation = await observeBrowser(page);

    return {
      pageObservation: observation,
      currentUrl: observation.url,
      pageTitle: observation.title,
    };
  } catch (error) {
    await logError("applicationGraph.observePageNode", error.message);
    return { error: error.message };
  }
};

/**
 * 3. Classify Page & Detect Blockers
 */
export const classifyPageNode = async (state) => {
  try {
    const obs = state.pageObservation || {};
    const blockers = obs.blockers || {};

    if (blockers.captcha || blockers.login || blockers.otp) {
      return {
        currentApplicationState: APPLICATION_STATES.APPLICATION_REQUIRES_HUMAN,
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
      };
    }

    const pageType = obs.hasForm ? "APPLICATION_FORM" : "JOB_DETAIL";
    return {
      currentPageType: pageType,
      currentApplicationState: obs.hasForm ? APPLICATION_STATES.FORM_ANALYZING : APPLICATION_STATES.JOB_ANALYZED,
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 4. Analyze Form Fields & Resolve Answers
 */
export const analyzeFormNode = async (state) => {
  try {
    const obs = state.pageObservation || {};
    const fields = [
      ...obs.inputs.map((i) => ({ fieldId: i.id || i.name, question: i.label || i.placeholder || i.name, type: i.type, required: i.required })),
      ...obs.selects.map((s) => ({ fieldId: s.id || s.name, question: s.label || s.name, type: "select", required: s.required })),
      ...obs.textareas.map((t) => ({ fieldId: t.id || t.name, question: t.label || t.name, type: "textarea", required: t.required })),
    ];

    return {
      formFields: fields,
      currentApplicationState: APPLICATION_STATES.FORM_FILLING,
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 5. Pre-Submission Review Node
 */
export const preSubmissionReviewNode = async (state) => {
  try {
    const obs = state.pageObservation || {};
    const safety = evaluateSubmissionSafety({
      currentState: APPLICATION_STATES.PRE_SUBMISSION_REVIEW,
      submissionConfirmed: state.submissionConfirmed,
      validationErrors: obs.validationMessages || [],
      unresolvedQuestions: state.unresolvedQuestions || [],
      blockers: obs.blockers || {},
    });

    if (state.applicationId) {
      await JobApplication.findByIdAndUpdate(state.applicationId, {
        currentState: APPLICATION_STATES.PRE_SUBMISSION_REVIEW,
        'preSubmissionReview.readyForReview': true,
        'preSubmissionReview.userConfirmed': state.submissionConfirmed,
      });
    }

    return {
      currentApplicationState: APPLICATION_STATES.PRE_SUBMISSION_REVIEW,
      submissionAllowed: safety.allowed,
      status: state.submissionConfirmed ? APPLICATION_STATUS.PROCESSING : APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 6. Submit Application Node
 */
export const submitApplicationNode = async (state) => {
  try {
    const page = state.pageInstance;
    const submitBtn = (state.pageObservation?.buttons || []).find((b) =>
      /submit|apply/i.test(b.text || b.ariaLabel || "")
    );

    if (!submitBtn) {
      throw new Error("Submit button could not be resolved on pre-submission review page");
    }

    const action = {
      actionId: `sub_${Date.now()}`,
      type: "click",
      intent: "submit_application",
      target: { elementId: submitBtn.elementId, id: submitBtn.id, text: submitBtn.text, role: "button" },
      riskLevel: "CRITICAL",
    };

    const actionResult = await executeBrowserAction(page, action);

    return {
      proposedAction: action,
      actionResult,
      currentApplicationState: APPLICATION_STATES.SUBMISSION_VERIFYING,
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 7. Verify Submission Node
 */
export const verifySubmissionNode = async (state) => {
  try {
    const page = state.pageInstance;
    const postObs = await observeBrowser(page);

    const verification = await verifyStateTransition(
      page,
      state.proposedAction,
      state.pageObservation,
      postObs
    );

    if (state.applicationId) {
      await recordApplicationEvent({
        applicationId: state.applicationId,
        type: verification.verified ? "SUBMISSION_VERIFIED" : "SUBMISSION_UNVERIFIED",
        state: APPLICATION_STATES.SUBMISSION_VERIFYING,
        url: postObs.url,
        actionId: state.proposedAction?.actionId,
        payload: state.proposedAction,
        evidence: verification.evidence,
        verificationLevel: verification.verificationLevel,
        error: !verification.verified ? verification.reason : null,
      }).catch(() => {});
    }

    if (
      verification.verified &&
      (verification.verificationLevel === VERIFICATION_LEVELS.LEVEL_3 ||
        verification.verificationLevel === VERIFICATION_LEVELS.LEVEL_4)
    ) {
      return {
        submissionVerified: true,
        confirmationId: verification.confirmationId,
        currentApplicationState: APPLICATION_STATES.APPLICATION_COMPLETED,
        status: APPLICATION_STATUS.APPLICATION_COMPLETED,
      };
    }

    return {
      submissionVerified: false,
      currentApplicationState: APPLICATION_STATES.APPLICATION_REQUIRES_HUMAN,
      status: APPLICATION_STATUS.HUMAN_REQUIRED,
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * 8. Pause for Human Node
 */
export const pauseForHumanNode = async (state) => {
  try {
    await logJobEvent("applicationGraph", "PAUSED", "Application paused for human input / confirmation");
    return {
      status: APPLICATION_STATUS.HUMAN_REQUIRED,
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Build and compile the LangGraph StateGraph
 */
const workflow = new StateGraph(ApplicationStateAnnotation)
  .addNode("initializeApplication", initializeApplicationNode)
  .addNode("observePage", observePageNode)
  .addNode("classifyPage", classifyPageNode)
  .addNode("analyzeForm", analyzeFormNode)
  .addNode("preSubmissionReview", preSubmissionReviewNode)
  .addNode("submitApplication", submitApplicationNode)
  .addNode("verifySubmission", verifySubmissionNode)
  .addNode("pauseForHuman", pauseForHumanNode)
  .addEdge(START, "initializeApplication")
  .addEdge("initializeApplication", "observePage")
  .addEdge("observePage", "classifyPage")
  .addConditionalEdges("classifyPage", (state) => {
    if (state.currentApplicationState === APPLICATION_STATES.APPLICATION_REQUIRES_HUMAN) {
      return "pauseForHuman";
    }
    if (state.currentApplicationState === APPLICATION_STATES.FORM_ANALYZING) {
      return "analyzeForm";
    }
    return "observePage";
  })
  .addEdge("analyzeForm", "preSubmissionReview")
  .addConditionalEdges("preSubmissionReview", (state) => {
    if (state.submissionConfirmed && state.submissionAllowed) {
      return "submitApplication";
    }
    return "pauseForHuman";
  })
  .addEdge("submitApplication", "verifySubmission")
  .addConditionalEdges("verifySubmission", (state) => {
    if (state.submissionVerified) {
      return END;
    }
    return "pauseForHuman";
  })
  .addEdge("pauseForHuman", END);

export const applicationGraph = workflow.compile({
  checkpointer: new MemorySaver(),
});

export default applicationGraph;
