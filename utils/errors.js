/**
 * utils/errors.js — Operational Error Classes for CareLink API
 *
 * Defines standard operational errors with HTTP status codes and safe error codes.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'The request could not be processed.', code = 'BAD_REQUEST', details = null) {
    super(message, 400, code, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to access this resource.', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', code = 'RESOURCE_NOT_FOUND') {
    super(message, 404, code);
  }
}

class ConflictError extends AppError {
  constructor(message = 'A resource with the provided value already exists.', code = 'DUPLICATE_RESOURCE') {
    super(message, 409, code);
  }
}

class UnprocessableEntityError extends AppError {
  constructor(message = 'The request payload cannot be processed.', code = 'UNPROCESSABLE_ENTITY', details = null) {
    super(message, 422, code, details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'The service is temporarily unavailable. Please try again later.', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

class InternalServerError extends AppError {
  constructor(message = 'An unexpected error occurred.', code = 'INTERNAL_SERVER_ERROR') {
    super(message, 500, code);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  ServiceUnavailableError,
  InternalServerError
};
