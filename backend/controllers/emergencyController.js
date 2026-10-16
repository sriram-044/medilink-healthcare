const EmergencyCase = require('../models/EmergencyCase');

const emergencyController = {
  getActiveCases: async (req, res, next) => {
    try {
      const activeCases = await EmergencyCase.find({
        status: { $in: ['TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] }
      }).populate('patientId', 'name phone bloodGroup').sort({ triggerTime: -1 });
      res.json(activeCases);
    } catch (err) {
      next(err);
    }
  },

  getStats: async (req, res, next) => {
    try {
      const activeCount = await EmergencyCase.countDocuments({
        status: { $in: ['TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] }
      });
      const pendingCount = await EmergencyCase.countDocuments({ status: 'TRIGGERED' });
      const assignedCount = await EmergencyCase.countDocuments({ status: { $in: ['TEAM_ASSIGNED', 'EN_ROUTE'] } });
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const resolvedToday = await EmergencyCase.countDocuments({
        status: 'RESOLVED',
        resolvedAt: { $gte: startOfDay }
      });

      res.json({
        active: activeCount,
        pending: pendingCount,
        teamsAssigned: assignedCount,
        resolvedToday
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = emergencyController;
