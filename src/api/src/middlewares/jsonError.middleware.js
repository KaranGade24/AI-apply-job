import { logError } from '../utils/logger.js';

/**
 * Global Express Error Handling Middleware for JSON Syntax Errors
 */
export const jsonSyntaxErrorHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logError('jsonSyntaxErrorHandler', `Malformed JSON payload received: ${err.message}`);
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON Format',
      message: 'The request body contains invalid JSON syntax (e.g. trailing comma in array or object). Please remove trailing commas and re-send.'
    });
  }
  next(err);
};

export default jsonSyntaxErrorHandler;
