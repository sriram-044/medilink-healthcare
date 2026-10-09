/**
 * middleware/requestId.js — Request / Correlation ID Middleware
 *
 * Attaches a unique, validated request ID to every incoming request.
 * Sets the X-Request-ID response header for distributed tracing and error correlation.
 */

const crypto = require('crypto');

const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

function requestIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  let requestId;

  // Only trust client-supplied ID if it matches strict alphanumeric formatting
  if (typeof incoming === 'string' && VALID_REQUEST_ID_REGEX.test(incoming.trim())) {
    requestId = incoming.trim();
  } else {
    // Generate secure unique server-side request ID
    requestId = `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

module.exports = requestIdMiddleware;
