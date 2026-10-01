import { ACTION_FAILURE_TYPES, PERCEPTION_PAGE_TYPES } from '../../../constant/agent.constant.js';

/**
 * Computes a hash or fingerprint of the elements list to detect DOM mutations.
 *
 * @param {Array<object>} elements
 * @returns {string}
 */
const computeElementFingerprint = (elements = []) => {
  return elements.map((e) => `${e.tag}:${e.type || ''}:${e.name || ''}:${e.label || ''}:${e.value || ''}`).join('|');
};

/**
 * Evaluates the outcome of an executed action by comparing before and after page observations.
 *
 * @param {object} params
 * @param {object} params.beforeObservation - Observation captured immediately prior to action
 * @param {object} params.afterObservation - Observation captured after action execution and settle
 * @param {object} params.executedAction - The action that was performed
 * @param {object} params.executionResult - Result returned by executeAction
 * @returns {{
 *   success: boolean,
 *   pageChanged: boolean,
 *   urlChanged: boolean,
 *   newTab: boolean,
 *   domChanged: boolean,
 *   errorType?: string,
 *   message: string
 * }}
 */
export const evaluateActionResult = ({
  beforeObservation = {},
  afterObservation = {},
  executedAction = {},
  executionResult = { success: true },
}) => {
  if (!executionResult.success) {
    return {
      success: false,
      pageChanged: false,
      urlChanged: false,
      newTab: false,
      domChanged: false,
      errorType: executionResult.errorType || ACTION_FAILURE_TYPES.UNKNOWN,
      message: executionResult.message || 'Action execution failed.',
    };
  }

  const beforeUrl = beforeObservation.url || '';
  const afterUrl = afterObservation.url || '';
  const urlChanged = Boolean(beforeUrl && afterUrl && beforeUrl !== afterUrl);

  const beforeTab = beforeObservation.activeTabId || '';
  const afterTab = afterObservation.activeTabId || '';
  const newTab = Boolean(beforeTab && afterTab && beforeTab !== afterTab);

  const beforeText = (beforeObservation.visibleTextTrimmed || '').trim();
  const afterText = (afterObservation.visibleTextTrimmed || '').trim();
  const textChanged = beforeText !== afterText;

  const beforeFingerprint = computeElementFingerprint(beforeObservation.elements || []);
  const afterFingerprint = computeElementFingerprint(afterObservation.elements || []);
  const domChanged = textChanged || beforeFingerprint !== afterFingerprint;

  const pageChanged = urlChanged || newTab || domChanged;

  // Check if target page transitioned into an error or captcha state
  const afterPageType = afterObservation.pageType || PERCEPTION_PAGE_TYPES.UNKNOWN;
  if (afterPageType === PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED) {
    return {
      success: false,
      pageChanged: true,
      urlChanged,
      newTab,
      domChanged,
      errorType: ACTION_FAILURE_TYPES.BLOCKED,
      message: 'Action completed but page triggered CAPTCHA / bot challenge.',
    };
  }

  if (afterPageType === PERCEPTION_PAGE_TYPES.ERROR) {
    return {
      success: false,
      pageChanged: true,
      urlChanged,
      newTab,
      domChanged,
      errorType: ACTION_FAILURE_TYPES.NAVIGATION_FAILED,
      message: 'Action resulted in an error page or closed job posting.',
    };
  }

  // Construct readable outcome summary
  let outcomeSummary = `Action "${executedAction.type}" succeeded.`;
  if (urlChanged) {
    outcomeSummary += ` Page navigated to ${afterUrl}.`;
  } else if (newTab) {
    outcomeSummary += ` Opened new browser tab.`;
  } else if (domChanged) {
    outcomeSummary += ` Page DOM updated.`;
  } else {
    outcomeSummary += ` Page state unchanged.`;
  }

  return {
    success: true,
    pageChanged,
    urlChanged,
    newTab,
    domChanged,
    message: outcomeSummary,
  };
};

export default evaluateActionResult;
