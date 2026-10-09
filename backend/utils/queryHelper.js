/**
 * utils/queryHelper.js — MongoDB Search & Query Optimization Utilities
 *
 * Provides:
 * 1. Safe regex escaping to prevent ReDoS and regex injection.
 * 2. Safe date range query building with strict validation.
 * 3. Safe ObjectId validation.
 * 4. Safe query sanitizer against unauthorized MongoDB operator injection.
 */

const mongoose = require('mongoose');

/**
 * Escapes characters that have special meaning in regular expressions.
 * Prevents regex syntax errors and ReDoS attacks from user input.
 *
 * @param {string} input - User search string
 * @returns {string} Escaped string safe for new RegExp or $regex
 */
function escapeRegex(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates whether a value is a valid MongoDB ObjectId.
 * @param {any} id
 * @returns {boolean}
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Parses and validates start and end dates into a MongoDB date range query.
 * Rejects malformed dates and prevents string-based date comparison.
 *
 * @param {string|Date} startDate - ISO string or Date
 * @param {string|Date} endDate - ISO string or Date
 * @param {string} [dateField='createdAt'] - Field name to query
 * @returns {object|null} MongoDB date query fragment or null if no valid dates
 */
function buildDateQuery(startDate, endDate, dateField = 'createdAt') {
  const dateFilter = {};

  if (startDate) {
    const parsedStart = new Date(startDate);
    if (!isNaN(parsedStart.getTime())) {
      dateFilter.$gte = parsedStart;
    }
  }

  if (endDate) {
    const parsedEnd = new Date(endDate);
    if (!isNaN(parsedEnd.getTime())) {
      // If time is midnight (00:00:00), expand to end of the day (23:59:59.999)
      if (typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
        parsedEnd.setHours(23, 59, 59, 999);
      }
      dateFilter.$lte = parsedEnd;
    }
  }

  if (Object.keys(dateFilter).length > 0) {
    return { [dateField]: dateFilter };
  }

  return null;
}

/**
 * Sanitizes an object to ensure no top-level MongoDB operators ($where, $gt, etc.)
 * are injected through untrusted query parameters.
 *
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized plain object
 */
function sanitizeParams(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Drop keys starting with '$' or containing '.' (MongoDB operators / prototype pollution)
    if (!key.startsWith('$') && !key.includes('.') && key !== '__proto__' && key !== 'constructor') {
      clean[key] = value;
    }
  }
  return clean;
}

module.exports = {
  escapeRegex,
  isValidObjectId,
  buildDateQuery,
  sanitizeParams
};
