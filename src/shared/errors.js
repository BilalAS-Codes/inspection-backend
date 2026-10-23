/**
 * Custom application error class that encapsulates HTTP status codes,
 * standard error codes, and structured metadata details.
 */
export class AppError extends Error {
  /**
   * @param {string} code - Standard error code (UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION_FAILED, CONFLICT, UNPROCESSABLE, RATE_LIMITED, INTERNAL)
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {Record<string, any>} [details={}] - Additional structured details/field errors
   */
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Global Express error handling middleware.
 * Guarantees every non-2xx response strictly adheres to the standard error envelope:
 * { "error": { "code": "STRING_CODE", "message": "human readable", "details": {} } }
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Handle known AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || {}
      }
    });
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    return res.status(422).json({
      error: {
        code: 'UNPROCESSABLE',
        message: err.message,
        details: { field: err.field }
      }
    });
  }

  // Handle PostgreSQL unique constraint violations (code 23505)
  if (err.code === '23505') {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A resource with these unique properties already exists.',
        details: { constraint: err.constraint, detail: err.detail }
      }
    });
  }

  // Fallback to internal error
  console.error('[Unhandled Server Error]', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'An internal server error occurred.',
      details: process.env.NODE_ENV === 'development' ? { stack: err.stack, raw: err.message } : {}
    }
  });
}
