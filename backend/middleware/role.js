const { ForbiddenError } = require('../utils/errors');

const roleMiddleware = (...roles) => {
  const allowedRoles = roles.flat();
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource.'));
    }
    next();
  };
};

roleMiddleware.requireRole = roleMiddleware;

module.exports = roleMiddleware;
