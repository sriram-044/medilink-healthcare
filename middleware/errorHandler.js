/**
 * middleware/errorHandler.js — Centralized Production-Safe API Error Handling
 *
 * Implements standard, secure error handling for all CareLink endpoints.
 * Never exposes stack traces, database URIs, filesystem paths, or credentials to clients.
 */

const { sanitizeSecrets } = require('../config/env');
const { AppError, NotFoundError } = require('../utils/errors');

/**
 * Strips secrets, tokens, passwords, and sensitive cookies from logged error text.
 */
function sanitizeForLog(text) {
  if (!text) return '';
  const str = typeof text === 'string' ? text : (text.stack || text.message || String(text));
  return sanitizeSecrets(str)
    .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1***')
    .replace(/(carelink_auth=)[^;\s]+/gi, '$1***')
    .replace(/(["']?password["']?\s*:\s*["'])[^"']+["']/gi, '$1***"');
}

/**
 * Log error internally with correlation ID, without exposing secrets.
 */
function logInternalError(err, req, statusCode, code) {
  const reqId = req.id || 'no-req-id';
  const method = req.method || 'UNKNOWN';
  const url = req.originalUrl || req.url || 'unknown-url';

  // For 5xx errors or unexpected failures, log sanitized diagnostic
  if (statusCode >= 500) {
    console.error(`[ERROR][${reqId}] ${method} ${url} ➔ ${statusCode} (${code}):`, sanitizeForLog(err));
  } else if (process.env.NODE_ENV !== 'test') {
    // In non-test environments, optionally log 4xx warnings at debug level
    console.warn(`[WARN][${reqId}] ${method} ${url} ➔ ${statusCode} (${code}):`, sanitizeForLog(err.message));
  }
}

/**
 * Central Express Error Handling Middleware.
 * Must have exactly 4 arguments: (err, req, res, next).
 */
function errorHandler(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const requestId = req.id || 'req_unknown';

  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let safeMessage = 'An unexpected error occurred.';
  let details = null;

  // 1. AppError subclasses (Explicit operational errors)
  if (err instanceof AppError || err.isOperational) {
    statusCode = err.statusCode || 500;
    errorCode = err.code || 'OPERATIONAL_ERROR';
    safeMessage = err.message || 'An operational error occurred.';
    details = err.details || null;
  }
  // 2. Malformed JSON Body Parsing Error (express.json SyntaxError)
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'BAD_REQUEST';
    safeMessage = 'The request could not be processed.';
  }
  // 3. Mongoose Invalid ObjectId / CastError
  else if (err.name === 'CastError' || (err.kind === 'ObjectId' && err.valueType)) {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    safeMessage = 'The provided resource identifier is invalid.';
  }
  // 4. Mongoose Validation Error
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    safeMessage = 'Validation failed for one or more fields.';
    if (err.errors) {
      details = Object.keys(err.errors).map(field => ({
        field,
        message: err.errors[field].message
      }));
    }
  }
  // 5. MongoDB Duplicate Key Error (code 11000)
  else if (err.code === 11000 || (err.name === 'MongoServerError' && err.code === 11000)) {
    statusCode = 409;
    errorCode = 'DUPLICATE_RESOURCE';
    safeMessage = 'A resource with the provided value already exists.';
  }
  // 6. Multer File Upload Errors
  else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      errorCode = 'FILE_TOO_LARGE';
      safeMessage = 'The uploaded file exceeds the allowed size.';
    } else {
      errorCode = 'FILE_UPLOAD_ERROR';
      safeMessage = 'File upload failed. Please verify file format and size.';
    }
  }
  // 7. Filesystem Errors (ENOENT / EACCES)
  else if (err.code === 'ENOENT') {
    statusCode = 404;
    errorCode = 'RESOURCE_NOT_FOUND';
    safeMessage = 'The requested resource was not found.';
  } else if (err.code === 'EACCES' || err.code === 'EPERM') {
    statusCode = 500;
    errorCode = 'INTERNAL_SERVER_ERROR';
    safeMessage = 'An unexpected storage access error occurred.';
  }
  // 8. MongoDB Connection / Infrastructure Errors
  else if (
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoTimeoutError' ||
    (err.code === 'ECONNREFUSED' && err.syscall === 'connect')
  ) {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    safeMessage = 'The service is temporarily unavailable. Please try again later.';
  }
  // 9. Existing status on error (e.g. rate limit, standard http error)
  else if (err.status || err.statusCode) {
    statusCode = err.status || err.statusCode;
    if (statusCode === 400) errorCode = 'BAD_REQUEST';
    else if (statusCode === 401) errorCode = 'UNAUTHORIZED';
    else if (statusCode === 403) errorCode = 'FORBIDDEN';
    else if (statusCode === 404) errorCode = 'RESOURCE_NOT_FOUND';
    else if (statusCode === 409) errorCode = 'DUPLICATE_RESOURCE';
    else if (statusCode === 422) errorCode = 'UNPROCESSABLE_ENTITY';
    else if (statusCode === 429) errorCode = 'TOO_MANY_REQUESTS';
    else if (statusCode === 503) errorCode = 'SERVICE_UNAVAILABLE';

    // Never leak unvetted raw 500 error messages to client in any environment
    if (statusCode >= 500) {
      safeMessage = statusCode === 503
        ? 'The service is temporarily unavailable. Please try again later.'
        : 'An unexpected error occurred.';
    } else {
      safeMessage = sanitizeSecrets(err.message || 'An error occurred.');
    }
  }

  // Log internal diagnostic safely (never exposes secrets)
  logInternalError(err, req, statusCode, errorCode);

  // Secure standardized response: NEVER includes stack trace or credentials
  const responsePayload = {
    success: false,
    error: {
      code: errorCode,
      message: safeMessage,
      requestId
    },
    message: safeMessage
  };

  if (details) {
    responsePayload.error.details = details;
  }

  return res.status(statusCode).json(responsePayload);
}

/**
 * 404 Handler for unknown API routes (/api/*).
 * Must be registered BEFORE the global error handler.
 */
function apiNotFoundHandler(req, res, next) {
  next(new NotFoundError('The requested API endpoint was not found.', 'API_NOT_FOUND'));
}

/**
 * Async Route Wrapper to safely forward unhandled Promise rejections to Express next(err).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  apiNotFoundHandler,
  asyncHandler,
  sanitizeForLog
};
