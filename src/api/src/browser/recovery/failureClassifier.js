import { logJobEvent } from '../../utils/logger.js';

export const FAILURE_TYPES = {
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  TARGET_AMBIGUOUS: 'TARGET_AMBIGUOUS',
  STALE_ELEMENT: 'STALE_ELEMENT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAGE_NOT_READY: 'PAGE_NOT_READY',
  NAVIGATION_ERROR: 'NAVIGATION_ERROR',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  WRONG_PAGE: 'WRONG_PAGE',
  LOOP_DETECTED: 'LOOP_DETECTED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Classifies a browser execution failure or page state mismatch.
 *
 * @param {Error|string} error - Triggering error or mismatch reason
 * @param {object} context - Execution context details
 * @returns {string} Canonical failure type from FAILURE_TYPES
 */
export const classifyFailure = (error, context = {}) => {
  const errMsg = String(error?.message || error || '').toLowerCase();

  if (errMsg.includes('navigation') || errMsg.includes('net::err') || errMsg.includes('loadState') || errMsg.includes('did not navigate')) {
    return FAILURE_TYPES.NAVIGATION_ERROR;
  }
  if (errMsg.includes('captcha') || errMsg.includes('mfa') || errMsg.includes('otp') || errMsg.includes('recaptcha') || errMsg.includes('human verification')) {
    return FAILURE_TYPES.HUMAN_REQUIRED;
  }
  if (errMsg.includes('timeout') || errMsg.includes('waiting for selector') || errMsg.includes('not found') || errMsg.includes('unable to find') || errMsg.includes('cannot find') || errMsg.includes('frame')) {
    return FAILURE_TYPES.TARGET_NOT_FOUND;
  }
  if (errMsg.includes('ambiguous') || errMsg.includes('strict mode violation') || errMsg.includes('matches multiple elements')) {
    return FAILURE_TYPES.TARGET_AMBIGUOUS;
  }
  if (errMsg.includes('stale element') || errMsg.includes('detached from document') || errMsg.includes('context was destroyed')) {
    return FAILURE_TYPES.STALE_ELEMENT;
  }
  if (errMsg.includes('validation') || errMsg.includes('required field') || errMsg.includes('invalid pattern') || errMsg.includes('please fill')) {
    return FAILURE_TYPES.VALIDATION_ERROR;
  }
  if (errMsg.includes('navigation') || errMsg.includes('net::err') || errMsg.includes('loadState') || errMsg.includes('did not navigate')) {
    return FAILURE_TYPES.NAVIGATION_ERROR;
  }
  if (errMsg.includes('upload') || errMsg.includes('file path') || errMsg.includes('mime type')) {
    return FAILURE_TYPES.UPLOAD_FAILED;
  }
  if (errMsg.includes('captcha') || errMsg.includes('mfa') || errMsg.includes('otp') || errMsg.includes('recaptcha') || errMsg.includes('human verification')) {
    return FAILURE_TYPES.HUMAN_REQUIRED;
  }
  if (errMsg.includes('loop') || errMsg.includes('oscillation') || errMsg.includes('stuck')) {
    return FAILURE_TYPES.LOOP_DETECTED;
  }
  if (context.expectedPage && context.currentPage && context.expectedPage !== context.currentPage) {
    return FAILURE_TYPES.WRONG_PAGE;
  }

  return FAILURE_TYPES.UNKNOWN_ERROR;
};
