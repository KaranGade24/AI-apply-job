import crypto from 'crypto';
import { logJobEvent, logError } from '../../utils/logger.js';
import { AGENT_LOOP_LIMITS } from '../../constant/application.constant.js';
import { JobApplication } from '../../model/JobApplication.js';
import { encryptValue } from '../../utils/encryption.js';
import { BrowserSessionRepository } from '../../repositories/browserSession.repository.js';

/**
 * Computes a deterministic fingerprint for a normalized page state.
 * Used for loop detection — comparing fingerprints rather than URLs alone
 * catches cases where URL stays the same but DOM changes (modal, step, etc).
 *
 * @param {object} normalizedState - Output from pageNormalizer
 * @returns {string} SHA-256 fingerprint hash
 */
export const computePageFingerprint = (normalizedState = {}) => {
  const components = {
    url: normalizedState.url || '',
    title: normalizedState.title || '',
    pageType: normalizedState.pageType || '',
    buttonsHash: (normalizedState.buttons || []).map((b) => b.text).sort().join('|'),
    formFieldsCount: normalizedState.formFieldsCount || 0,
    modalOpen: normalizedState.modals?.isOpen || false,
    modalTitle: normalizedState.modals?.title || '',
    step: normalizedState.stepper?.currentStep || 0,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(components))
    .digest('hex')
    .slice(0, 16);
};

/**
 * Creates a fresh agent state for a new UNKNOWN application workflow.
 *
 * @param {string} applicationId
 * @param {string} url - Starting URL
 * @param {object} job - Job document
 * @returns {object} Initial agent state
 */
export const createAgentState = (applicationId, url, job = {}) => {
  return {
    applicationId,
    startUrl: url,
    jobTitle: job.title || '',
    jobCompany: job.company || '',

    visitedPages: [],

    actions: [],

    currentPage: {
      url: url || '',
      title: '',
      pageType: '',
      fingerprint: '',
    },

    discoveredMethod: null,

    formState: {
      currentStep: 1,
      totalSteps: 1,
      answeredQuestions: [],
      unresolvedQuestions: [],
    },

    counters: {
      totalActions: 0,
      totalDecisions: 0,
      retriesForCurrentAction: 0,
      samePageVisits: 0,
    },

    activeRunStartedAt: Date.now(),

    pendingHumanAction: null,
  };
};

/**
 * Records a browser action and its result into the agent state.
 *
 * @param {object} state - Current agent state
 * @param {object} action - The action that was executed { type, target, value }
 * @param {object} result - Execution result { success, error }
 * @param {object} verification - Verification result { pageChanged, urlChanged, errorDetected }
 * @returns {object} Updated agent state
 */
export const recordAction = (state, action, result, verification = {}) => {
  const entry = {
    type: action.type,
    target: action.target || null,
    value: action.value ? String(action.value).slice(0, 100) : null,
    success: result.success,
    pageChanged: verification.pageChanged || false,
    timestamp: new Date(),
  };

  state.actions.push(entry);
  state.counters.totalActions += 1;

  if (result.success) {
    state.counters.retriesForCurrentAction = 0;
  } else {
    state.counters.retriesForCurrentAction += 1;
  }

  return state;
};

/**
 * Records a page visit with fingerprinting into the agent state.
 * Also updates the samePageVisits counter for loop detection.
 *
 * @param {object} state - Current agent state
 * @param {object} normalizedPage - Normalized page state from pageNormalizer
 * @returns {object} Updated agent state
 */
export const recordPageVisit = (state, normalizedPage) => {
  const fingerprint = computePageFingerprint(normalizedPage);

  const entry = {
    url: normalizedPage.url || '',
    title: normalizedPage.title || '',
    pageType: normalizedPage.pageType || '',
    fingerprint,
    visitedAt: new Date(),
  };

  // Check if the same fingerprint was already visited
  const previousVisit = state.visitedPages.find((v) => v.fingerprint === fingerprint);
  if (previousVisit) {
    state.counters.samePageVisits += 1;
  } else {
    state.counters.samePageVisits = 0;
  }

  state.visitedPages.push(entry);

  state.currentPage = {
    url: normalizedPage.url || '',
    title: normalizedPage.title || '',
    pageType: normalizedPage.pageType || '',
    fingerprint,
  };

  return state;
};

/**
 * Detects if the agent is stuck in a loop by comparing page fingerprints.
 * Returns true if the same page state has been visited more than MAX_SAME_PAGE_VISITS times.
 *
 * @param {object} state - Current agent state
 * @returns {{ loopDetected: boolean, reason: string }}
 */
export const detectLoop = (state) => {
  if (state.counters.samePageVisits >= AGENT_LOOP_LIMITS.MAX_SAME_PAGE_VISITS) {
    return {
      loopDetected: true,
      reason: `Same page state visited ${state.counters.samePageVisits} times (fingerprint: ${state.currentPage.fingerprint})`,
    };
  }

  if (state.counters.totalActions >= AGENT_LOOP_LIMITS.MAX_ACTIONS) {
    return {
      loopDetected: true,
      reason: `Maximum actions reached: ${state.counters.totalActions}`,
    };
  }

  if (state.counters.totalDecisions >= AGENT_LOOP_LIMITS.MAX_AI_DECISIONS) {
    return {
      loopDetected: true,
      reason: `Maximum AI decisions reached: ${state.counters.totalDecisions}`,
    };
  }

  // Detect oscillation: A → B → A → B pattern in the last 6 visits
  if (state.visitedPages.length >= 6) {
    const last6 = state.visitedPages.slice(-6).map((v) => v.fingerprint);
    if (
      last6[0] === last6[2] && last6[2] === last6[4] &&
      last6[1] === last6[3] && last6[3] === last6[5] &&
      last6[0] !== last6[1]
    ) {
      return {
        loopDetected: true,
        reason: `Oscillation detected between two page states over last 6 visits`,
      };
    }
  }

  return { loopDetected: false, reason: '' };
};

/**
 * Resets the active run timer. Called when resuming after a human wait,
 * so human wait time does not count against the active run timeout.
 *
 * @param {object} state
 * @returns {object} Updated state
 */
export const resetActiveRunTimer = (state) => {
  state.activeRunStartedAt = Date.now();
  return state;
};

/**
 * Checks if the active browser run has exceeded the timeout.
 * Only counts time the agent is actively executing browser actions.
 *
 * @param {object} state
 * @returns {boolean}
 */
export const isActiveRunTimedOut = (state) => {
  if (!state.activeRunStartedAt) return false;
  const elapsed = Date.now() - state.activeRunStartedAt;
  return elapsed >= AGENT_LOOP_LIMITS.ACTIVE_RUN_TIMEOUT_MS;
};

/**
 * Persists the agent state to the JobApplication document in MongoDB.
 *
 * @param {string} applicationId
 * @param {object} state - Current agent state
 */
export const persistState = async (applicationId, state) => {
  try {
    if (!applicationId) return;

    let pendingHumanAction = state.pendingHumanAction ? { ...state.pendingHumanAction } : null;
    if (pendingHumanAction && pendingHumanAction.savedStorageState) {
      const raw = pendingHumanAction.savedStorageState;
      const isEncrypted = typeof raw === 'object' && raw !== null && raw.cipherText && raw.iv && raw.authTag;
      if (!isEncrypted) {
        const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
        pendingHumanAction.savedStorageState = encryptValue(serialized);
      }
    }

    await JobApplication.findByIdAndUpdate(applicationId, {
      'workflow.agentState': {
        visitedPages: state.visitedPages.slice(-20), // Keep last 20 for DB size
        actions: state.actions.slice(-30), // Keep last 30 actions
        currentPage: state.currentPage,
        discoveredMethod: state.discoveredMethod,
        counters: state.counters,
        pendingHumanAction,
      },
      'workflow.currentStage': state.discoveredMethod
        ? 'handoff'
        : state.pendingHumanAction
          ? 'paused'
          : 'analyzing',
    });
  } catch (error) {
    await logError('agentState.persistState', error.message);
  }
};

/**
 * Loads a previously persisted agent state from the JobApplication document.
 *
 * @param {string} applicationId
 * @returns {Promise<object|null>} Restored agent state or null
 */
export const loadState = async (applicationId) => {
  try {
    if (!applicationId) return null;

    const application = await JobApplication.findById(applicationId).lean();
    if (!application?.workflow?.agentState) return null;

    const saved = application.workflow.agentState;
    let pendingHumanAction = saved.pendingHumanAction || null;
    if (pendingHumanAction && pendingHumanAction.savedStorageState) {
      pendingHumanAction = {
        ...pendingHumanAction,
        savedStorageState: BrowserSessionRepository.decryptStorageState(pendingHumanAction.savedStorageState),
      };
    }

    return {
      applicationId,
      startUrl: saved.currentPage?.url || '',
      jobTitle: '',
      jobCompany: '',
      visitedPages: saved.visitedPages || [],
      actions: saved.actions || [],
      currentPage: saved.currentPage || { url: '', title: '', pageType: '', fingerprint: '' },
      discoveredMethod: saved.discoveredMethod || null,
      formState: {
        currentStep: 1,
        totalSteps: 1,
        answeredQuestions: [],
        unresolvedQuestions: [],
      },
      counters: saved.counters || {
        totalActions: 0,
        totalDecisions: 0,
        retriesForCurrentAction: 0,
        samePageVisits: 0,
      },
      activeRunStartedAt: Date.now(),
      pendingHumanAction,
    };
  } catch (error) {
    await logError('agentState.loadState', error.message);
    return null;
  }
};

/**
 * Adds a workflow log entry to the JobApplication document.
 *
 * @param {string} applicationId
 * @param {string} event
 * @param {string} message
 */
export const addWorkflowLog = async (applicationId, event, message) => {
  try {
    if (!applicationId) return;

    await JobApplication.findByIdAndUpdate(applicationId, {
      $push: {
        'workflow.logs': {
          timestamp: new Date(),
          event,
          message: String(message).slice(0, 500),
        },
      },
    });
  } catch (error) {
    await logError('agentState.addWorkflowLog', error.message);
  }
};
