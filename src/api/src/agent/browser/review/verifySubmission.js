import { ApplicationRepository } from '../../../repositories/application.repository.js';
import { ApplicationSessionRepository } from '../../../repositories/applicationSession.repository.js';
import { logJobEvent, logError, sanitizeSecrets } from '../../../utils/logger.js';

// Regex patterns for extracting confirmation/receipt numbers from text
const CONFIRMATION_PATTERNS = [
  /confirmation\s*(?:number|#|code|id|ref)?\s*[:#-]?\s*([A-Za-z0-9-_]{4,32})/i,
  /application\s*(?:number|#|code|id|reference|ref)?\s*[:#-]?\s*([A-Za-z0-9-_]{4,32})/i,
  /reference\s*(?:number|#|code|id)?\s*[:#-]?\s*([A-Za-z0-9-_]{4,32})/i,
  /tracking\s*(?:number|#|id)?\s*[:#-]?\s*([A-Za-z0-9-_]{4,32})/i,
  /receipt\s*(?:number|#|id)?\s*[:#-]?\s*([A-Za-z0-9-_]{4,32})/i,
];

// Success indicators in visible text
const SUCCESS_TEXT_KEYWORDS = [
  'thank you for applying',
  'thanks for applying',
  'application submitted',
  'application has been submitted',
  'application was successfully submitted',
  'we have received your application',
  'we received your application',
  'your application has been received',
  'an email has been sent',
  'check your email for confirmation',
  'application received',
  'application complete',
];

// Validation error indicators
const VALIDATION_ERROR_KEYWORDS = [
  'please fix the following errors',
  'please correct the errors',
  'required field is missing',
  'this field is required',
  'invalid input',
  'please enter a valid',
  'an error occurred while submitting',
  'submission failed',
  'there was a problem with your submission',
];

/**
 * Inspects the page observation post-submission to determine if the application was submitted,
 * failed due to validation/server errors, or remains unverified.
 *
 * @param {object} observation - Page observation post-submit
 * @returns {object} Verification outcome
 */
export const verifySubmissionState = (observation = {}) => {
  if (!observation) {
    return {
      status: 'UNVERIFIED',
      outcome: 'UNVERIFIED',
      message: 'No observation data available to verify submission.',
      errors: [],
      confirmationNumber: null,
      receiptTimestamp: new Date().toISOString(),
    };
  }

  const url = (observation.url || '').toLowerCase();
  const title = (observation.title || '').toLowerCase();
  const text = (observation.visibleTextTrimmed || '').toLowerCase();
  const elements = observation.elements || [];

  // 1. Check for Validation Errors First (High Priority)
  const validationErrors = [];
  for (const keyword of VALIDATION_ERROR_KEYWORDS) {
    if (text.includes(keyword)) {
      validationErrors.push(`Page displayed error: "${keyword}"`);
    }
  }

  const errorElements = elements.filter((e) => {
    const elText = (e.text || e.label || '').toLowerCase();
    const role = (e.role || '').toLowerCase();
    const isAlert = role === 'alert' || role === 'status';
    const hasErrorClass = (e.className || '').toLowerCase().includes('error');
    const matchesErrorText = VALIDATION_ERROR_KEYWORDS.some((kw) => elText.includes(kw));
    return isAlert || hasErrorClass || matchesErrorText;
  });

  if (errorElements.length > 0) {
    for (const el of errorElements) {
      if (el.text && !validationErrors.includes(el.text)) {
        validationErrors.push(el.text.slice(0, 100));
      }
    }
  }

  if (validationErrors.length > 0) {
    logJobEvent('verifySubmission', 'VALIDATION_ERRORS_FOUND', `Found ${validationErrors.length} submission errors.`);
    return {
      status: 'FAILED',
      outcome: 'FAILED',
      confirmationNumber: null,
      message: `Application submission rejected with validation errors.`,
      errors: validationErrors,
      receiptTimestamp: new Date().toISOString(),
    };
  }

  // 2. Check for Confirmed Success
  let hasSuccessSignal = false;
  let successReason = '';

  // URL signal
  if (
    url.includes('thank-you') ||
    url.includes('submitted') ||
    url.includes('application-received') ||
    url.includes('confirmation') ||
    url.includes('success')
  ) {
    hasSuccessSignal = true;
    successReason = `Success URL pattern: ${url}`;
  }

  // Text signal
  for (const keyword of SUCCESS_TEXT_KEYWORDS) {
    if (text.includes(keyword)) {
      hasSuccessSignal = true;
      successReason = `Success confirmation message: "${keyword}"`;
      break;
    }
  }

  // Confirmation / Receipt number extraction
  let confirmationNumber = null;
  for (const pattern of CONFIRMATION_PATTERNS) {
    const match = observation.visibleTextTrimmed?.match(pattern);
    if (match && match[1]) {
      confirmationNumber = match[1].trim();
      hasSuccessSignal = true;
      successReason = `Found confirmation reference ID: ${confirmationNumber}`;
      break;
    }
  }

  if (hasSuccessSignal) {
    logJobEvent('verifySubmission', 'SUBMISSION_VERIFIED', successReason);
    return {
      status: 'SUBMITTED',
      outcome: 'SUBMITTED',
      confirmationNumber: confirmationNumber || `REC_${Date.now()}`,
      message: successReason || 'Application submitted and verified successfully.',
      errors: [],
      receiptTimestamp: new Date().toISOString(),
    };
  }

  // 3. Ambiguous / Unverified State
  logJobEvent('verifySubmission', 'UNVERIFIED_STATE', 'Could not locate explicit confirmation or error indicator.');
  return {
    status: 'UNVERIFIED',
    outcome: 'UNVERIFIED',
    confirmationNumber: null,
    message: 'Submission outcome ambiguous. Requires user/human verification.',
    errors: [],
    receiptTimestamp: new Date().toISOString(),
  };
};

/**
 * Builds a clean, sanitized, redacted summary of submitted application fields.
 *
 * @param {object} finalReview
 * @returns {string}
 */
export const buildRedactedSubmissionSummary = (finalReview = {}) => {
  if (!finalReview || !Array.isArray(finalReview.fields)) return 'No summary available.';

  const lines = ['--- APPLICATION SUBMISSION SUMMARY ---'];
  for (const f of finalReview.fields) {
    let valStr = String(f.answer ?? '');
    // Redact sensitive values
    if (
      f.name?.toLowerCase().includes('ssn') ||
      f.name?.toLowerCase().includes('password') ||
      f.question?.toLowerCase().includes('ssn') ||
      f.question?.toLowerCase().includes('password')
    ) {
      valStr = '[REDACTED]';
    }
    lines.push(`• ${f.question || f.name}: ${valStr}`);
  }

  if (finalReview.attachments && finalReview.attachments.length > 0) {
    lines.push('ATTACHMENTS:');
    for (const att of finalReview.attachments) {
      lines.push(`  - ${att.name} (${att.size || 'uploaded'})`);
    }
  }

  return sanitizeSecrets(lines.join('\n'));
};

/**
 * Saves and persists the verified submission outcome to database records.
 *
 * @param {string} applicationId
 * @param {string} userId
 * @param {object} verificationResult
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export const persistSubmissionOutcome = async (
  applicationId,
  userId,
  verificationResult,
  { finalReview } = {}
) => {
  const appIdStr = String(applicationId);
  const { status, confirmationNumber, message, errors, receiptTimestamp } = verificationResult;

  const redactedSummary = buildRedactedSubmissionSummary(finalReview);

  const resultPayload = {
    submitted: status === 'SUBMITTED',
    status,
    confirmationNumber,
    message,
    errors,
    receiptTimestamp,
    redactedSummary,
  };

  try {
    // 1. Update JobApplication status in DB
    const dbStatus = status === 'SUBMITTED' ? 'Applied' : status === 'FAILED' ? 'failed' : 'waiting_for_review';
    await ApplicationRepository.updateApplicationStatus(appIdStr, dbStatus, {
      result: resultPayload,
      logMessage: `Automation completed with outcome: ${status}. ${message}`,
    });

    // 2. Update ApplicationSession
    await ApplicationSessionRepository.updateSession(appIdStr, userId, {
      status,
      completedAt: new Date(),
      submissionResult: resultPayload,
    });

    logJobEvent('verifySubmission', 'PERSISTED_OUTCOME', `[application:${appIdStr}] Saved outcome: ${status}`);
  } catch (err) {
    await logError('verifySubmission.persistOutcome', err.message);
  }

  return resultPayload;
};

export default {
  verifySubmissionState,
  buildRedactedSubmissionSummary,
  persistSubmissionOutcome,
};
