import { logError } from './logger.js';

export class appError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.status = `${this.statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Marks this as a predicted, application-level error

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Cleans up raw AI LLM / Gemini API error messages (e.g. 429 rate limit, 503, raw Google RPC JSON)
 * into short, clean, human-readable user messages.
 *
 * @param {string} msg
 * @returns {string} Sanitized human-readable error message
 */
export const sanitizeAiErrorMessage = (msg) => {
  if (!msg) return 'An unexpected error occurred.';
  const str = String(msg);

  // Gemini Rate limit / Quota exceeded (429)
  if (
    str.includes('429') ||
    str.includes('quota') ||
    str.includes('Quota exceeded') ||
    str.includes('Rate limit') ||
    str.includes('generativelanguage') ||
    str.includes('GoogleGenerativeAI') ||
    str.includes('ResourceHasBeenExhausted')
  ) {
    const retryMatch = str.match(/retry in ([\d\.]+s|[\d\.]+ seconds)/i);
    const retryText = retryMatch ? ` Please retry in ${retryMatch[1]}.` : ' Please try again in a few seconds.';
    return `AI Rate Limit Reached: The AI service is temporarily busy.${retryText}`;
  }

  // Model overloaded / Service unavailable (503)
  if (str.includes('503') || str.includes('Service Unavailable') || str.includes('overloaded')) {
    return 'AI Service Busy: The AI model is temporarily overloaded. Please retry in a few moments.';
  }

  // If message contains technical Google RPC / JSON stack trace or URL dumps
  if (
    str.includes('[GoogleGenerativeAI Error]') ||
    str.includes('Error fetching from') ||
    str.includes('@type') ||
    str.includes('googleapis.com')
  ) {
    return 'AI Processing Notice: The AI service encountered a transient issue. Please retry in a moment.';
  }

  // Truncate non-JSON long strings if needed
  let cleaned = str
    .replace(/^Classification Exception:\s*/gi, '')
    .replace(/^Agent Decision Engine Exception:\s*/gi, '')
    .replace(/\[GoogleGenerativeAI Error\]:\s*/gi, '')
    .replace(/Error fetching from https?:\/\/[^\s]+/gi, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .trim();

  if (cleaned.length > 180) {
    cleaned = cleaned.substring(0, 180) + '...';
  }

  return cleaned || 'AI service temporarily unavailable. Please retry.';
};

export const handleError = (err, res) => {
  const statusCode = err.statusCode || 500;
  const rawMsg = err.message || 'An unexpected error occurred';
  const cleanMsg = sanitizeAiErrorMessage(rawMsg);

  // If it is a predicted error that we threw manually, send that specific message
  if (err.isOperational) {
    return res.status(statusCode).json({
      success: false,
      status: err.status || 'fail',
      message: cleanMsg,
      error: cleanMsg
    });
  }

  // Log unhandled operational or programming errors
  logError('unhandledError', err.message || String(err), err.stack).catch(() => {});

  return res.status(statusCode).json({
    success: false,
    status: 'error',
    message: cleanMsg || 'An internal server error occurred',
    error: cleanMsg || 'Something went wrong!'
  });
};

/**
 * Express Global Error Handling Middleware
 */
export const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  return handleError(err, res);
};
