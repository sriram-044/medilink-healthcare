/**
 * paginationHelper.js — Production-Safe Centralized Pagination Utility
 *
 * Provides standardized parameter parsing, strict numeric validation, safe defaults,
 * and consistent response formatting across all CareLink collection endpoints.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and strictly validate pagination parameters from req.query.
 *
 * @param {Object} req - Express request object
 * @param {Object} options - Optional overrides { defaultLimit, maxLimit }
 * @returns {Object} { isValid: boolean, page: number, limit: number, skip: number, error?: string }
 */
function parsePagination(req, options = {}) {
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
  const maxLimit = options.maxLimit || MAX_LIMIT;

  let rawPage = req.query?.page;
  let rawLimit = req.query?.limit;

  let page = DEFAULT_PAGE;
  let limit = defaultLimit;

  // Validate page
  if (rawPage !== undefined && rawPage !== null && String(rawPage).trim() !== '') {
    const numPage = Number(rawPage);
    // Must be integer >= 1
    if (!Number.isInteger(numPage) || numPage < 1) {
      return {
        isValid: false,
        error: 'Invalid pagination parameter: page must be an integer >= 1'
      };
    }
    page = numPage;
  }

  // Validate limit
  if (rawLimit !== undefined && rawLimit !== null && String(rawLimit).trim() !== '') {
    const numLimit = Number(rawLimit);
    // Must be integer >= 1
    if (!Number.isInteger(numLimit) || numLimit < 1) {
      return {
        isValid: false,
        error: 'Invalid pagination parameter: limit must be an integer >= 1'
      };
    }
    // Cannot exceed maximum limit
    if (numLimit > maxLimit) {
      return {
        isValid: false,
        error: `Invalid pagination parameter: limit cannot exceed maximum of ${maxLimit}`
      };
    }
    limit = numLimit;
  }

  const skip = (page - 1) * limit;

  return {
    isValid: true,
    page,
    limit,
    skip
  };
}

/**
 * Format standard paginated response envelope.
 *
 * @param {Array} data - Array of documents for current page
 * @param {number} total - Total matching documents across all pages
 * @param {number} page - Current page number
 * @param {number} limit - Items per page limit
 * @returns {Object} { data: Array, pagination: Object }
 */
function formatPaginatedResponse(data, total, page, limit) {
  const safeTotal = typeof total === 'number' && total >= 0 ? total : 0;
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / limit) : 0;

  return {
    data: Array.isArray(data) ? data : [],
    pagination: {
      page,
      limit,
      total: safeTotal,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && (totalPages === 0 || page <= totalPages + 1)
    }
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  formatPaginatedResponse
};
