const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const User = require('../models/User');
const Alert = require('../models/Alert');
const VitalSigns = require('../models/VitalSigns');

/**
 * GET /api/doctors/dashboard
 * Summarizes patients, active alerts, and recent vitals for the authenticated doctor.
 */
router.get('/dashboard', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const assignedPatients = await User.find({
      role: 'patient',
      assignedDoctor: doctorId
    }).select('-passwordHash').lean();

    const patientIds = assignedPatients.map(p => p._id);
    const activeAlerts = await Alert.find({
      patientId: { $in: patientIds },
      status: 'active'
    }).sort({ createdAt: -1 }).limit(20).lean();

    res.json({
      success: true,
      data: {
        totalPatients: assignedPatients.length,
        activeAlertsCount: activeAlerts.length,
        patients: assignedPatients,
        alerts: activeAlerts
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/doctors/patients
 * List all patients assigned to this doctor.
 */
router.get('/patients', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    const doctorId = req.user._id;
    const query = req.user.role === 'admin' ? { role: 'patient' } : { role: 'patient', assignedDoctor: doctorId };
    const patients = await User.find(query).select('-passwordHash').lean();

    res.json({
      success: true,
      data: patients
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
