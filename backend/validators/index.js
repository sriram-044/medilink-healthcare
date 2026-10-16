const authValidator = {
  validateLogin: (req, res, next) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Email and password are required' }
      });
    }
    next();
  }
};

const vitalsValidator = {
  validateReading: (req, res, next) => {
    next();
  }
};

const emergencyValidator = {
  validateSos: (req, res, next) => {
    next();
  }
};

module.exports = {
  authValidator,
  vitalsValidator,
  emergencyValidator
};
