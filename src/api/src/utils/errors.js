export class appError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Marks this as a predicted, application-level error

    Error.captureStackTrace(this, this.constructor);
  }
}

export const handleError = (err, res) => {
  // If it is a predicted error that we threw manually, send that specific message
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err.message
    });
  }

  // Otherwise, it's an unhandled programming error/bug - send a generic error so we don't leak details
  console.error('ERROR 💥:', err);
  
  return res.status(500).json({
    status: 'error',
    error: 'Something went very wrong!'
  });
};
