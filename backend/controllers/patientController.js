const User = require('../models/User');
const VitalSigns = require('../models/VitalSigns');

const patientController = {
  getProfile: async (req, res, next) => {
    try {
      const patient = await User.findById(req.user._id).select('-passwordHash');
      res.json({ success: true, data: patient });
    } catch (err) {
      next(err);
    }
  },

  getLatestVitals: async (req, res, next) => {
    try {
      const patientId = req.params.patientId || req.user._id;
      const vitals = await VitalSigns.findOne({ patientId }).sort({ recordedAt: -1 });
      res.json({ success: true, data: vitals });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = patientController;
