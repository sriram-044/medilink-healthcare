const { ForbiddenError } = require('../utils/errors');

const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource.'));
    }
    next();
  };
};

module.exports = roleMiddleware;
