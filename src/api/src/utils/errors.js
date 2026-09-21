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

export const handleError = (err, res) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred';

  // If it is a predicted error that we threw manually, send that specific message
  if (err.isOperational) {
    return res.status(statusCode).json({
      success: false,
      status: err.status || 'fail',
      message: message,
      error: message
    });
  }

  // Log unhandled operational or programming errors
  logError('unhandledError', err.message || String(err), err.stack).catch(() => {});

  return res.status(500).json({
    success: false,
    status: 'error',
    message: message || 'An internal server error occurred',
    error: 'Something went wrong!'
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
