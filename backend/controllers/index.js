const authController = require('./authController');
const patientController = require('./patientController');
const emergencyController = require('./emergencyController');

module.exports = {
  authController,
  patientController,
  emergencyController,
  vitalsController: {
    ingestTelemetry: async (req, res, next) => {
      try {
        res.status(201).json({ success: true, message: 'Telemetry processed' });
      } catch (e) { next(e); }
    }
  },
  hospitalController: {
    getNearby: async (req, res, next) => {
      try {
        res.json({ success: true, hospitals: [] });
      } catch (e) { next(e); }
    }
  },
  labController: {
    getDashboard: async (req, res, next) => {
      try {
        res.json({ success: true, testRequests: [], samples: [] });
      } catch (e) { next(e); }
    }
  },
  pharmacyController: {
    getOrders: async (req, res, next) => {
      try {
        res.json({ success: true, orders: [] });
      } catch (e) { next(e); }
    }
  },
  insuranceController: {
    getClaims: async (req, res, next) => {
      try {
        res.json({ success: true, claims: [] });
      } catch (e) { next(e); }
    }
  },
  aiController: {
    chat: async (req, res, next) => {
      try {
        res.json({ success: true, reply: 'MediLink Clinical AI response' });
      } catch (e) { next(e); }
    }
  },
  adminController: {
    getStats: async (req, res, next) => {
      try {
        res.json({ success: true, metrics: {} });
      } catch (e) { next(e); }
    }
  }
};
