const User = require('../models/User');

const authController = {
  getCurrentUser: async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select('-passwordHash');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      res.json({ success: true, user });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = authController;
