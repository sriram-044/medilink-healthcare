const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Auth Middleware — Dual-source JWT verification.
 * Priority 1: httpOnly cookie `carelink_auth` (new secure flow)
 * Priority 2: Authorization: Bearer header (backward compatibility for existing API clients)
 *
 * Role is ALWAYS loaded from the database — never trusted from the token payload alone.
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. Try httpOnly cookie first (new secure flow)
    let token = req.cookies?.carelink_auth;

    // 2. Fall back to Bearer token (backward compatibility)
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new UnauthorizedError('Authentication is required.'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Always load user from DB so role cannot be manipulated client-side
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(new UnauthorizedError('Authentication is required.'));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new UnauthorizedError('Authentication is required.'));
  }
};

module.exports = authMiddleware;
