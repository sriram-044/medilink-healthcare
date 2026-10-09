const express = require('express');
const router = express.Router();
const VitalSigns = require('../models/VitalSigns');
const Alert = require('../models/Alert');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { analyzeVitals } = require('../utils/aiEngine');
const { triggerEmergencyWorkflow } = require('../utils/emergencyEngine');
const { ForbiddenError } = require('../utils/errors');

// POST /api/vitals — submit new vitals (patient / wearable)
router.post('/', auth, async (req, res, next) => {
  try {
    const {
      heartRate, spo2, temperature,
      systolicBP, diastolicBP, stepCount, weight, glucoseLevel,
      fallDetected, source, location
    } = req.body;

    const patientId = req.user.role === 'patient' ? req.user._id : (req.body.patientId || req.user._id);

    // Run AI Health Engine
    const ai = analyzeVitals(
      heartRate, spo2, temperature,
      stepCount || 0, systolicBP, diastolicBP,
      Boolean(fallDetected)
    );

    const vitals = new VitalSigns({
      patientId,
      heartRate, spo2, temperature,
      systolicBP, diastolicBP,
      stepCount, weight, glucoseLevel,
      fallDetected: Boolean(fallDetected),
      source: source || 'wearable',
      location: location || 'Room 104, Sunrise Senior Home',
      aiScore: ai.score,
      aiStatus: ai.status,
      aiReasons: ai.reasons,
      aiRecommendation: ai.recommendation
    });
    await vitals.save();

    const patient = await User.findById(patientId);

    // Trigger Emergency Escalation Engine if Critical or Fall Detected
    let emergencyAlert = null;
    if (ai.status === 'Critical' || fallDetected) {
      emergencyAlert = await triggerEmergencyWorkflow({
        patient,
        doctorId: patient?.assignedDoctor,
        type: 'Critical',
        score: ai.score,
        vitals: { heartRate, spo2, temperature, systolicBP, diastolicBP },
        reasons: ai.reasons,
        fallDetected: Boolean(fallDetected),
        location: location || patient?.roomLocation || 'Home / Old Age Home'
      });
    } else if (ai.status === 'Risk') {
      const alert = new Alert({
        patientId,
        doctorId: patient?.assignedDoctor,
        type: 'Risk',
        message: `⚠️ Risk vitals detected for ${patient?.name}. AI Score: ${ai.score}/100`,
        score: ai.score,
        vitals: { heartRate, spo2, temperature, systolicBP, diastolicBP },
        reasons: ai.reasons,
        location: location || patient?.roomLocation || 'Home'
      });
      await alert.save();
    }

    res.status(201).json({
      message: 'Vitals recorded & analyzed by MediLink AI',
      vitals,
      ai,
      emergencyAlert
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/vitals/wearable-sync — simulated smartwatch telemetry endpoint
router.post('/wearable-sync', auth, async (req, res, next) => {
  try {
    const { heartRate, spo2, temperature, stepCount, fallDetected, roomLocation } = req.body;
    const patientId = req.user.role === 'patient' ? req.user._id : (req.body.patientId || req.user._id);

    const ai = analyzeVitals(heartRate, spo2, temperature, stepCount || 0, null, null, Boolean(fallDetected));

    const vitals = new VitalSigns({
      patientId,
      heartRate, spo2, temperature,
      stepCount,
      fallDetected: Boolean(fallDetected),
      source: 'wearable',
      location: roomLocation || 'Room 104, Sunrise Senior Home',
      aiScore: ai.score,
      aiStatus: ai.status,
      aiReasons: ai.reasons,
      aiRecommendation: ai.recommendation
    });
    await vitals.save();

    const patient = await User.findById(patientId);

    let emergencyAlert = null;
    if (ai.status === 'Critical' || fallDetected) {
      emergencyAlert = await triggerEmergencyWorkflow({
        patient,
        doctorId: patient?.assignedDoctor,
        type: 'Critical',
        score: ai.score,
        vitals: { heartRate, spo2, temperature },
        reasons: ai.reasons,
        fallDetected: Boolean(fallDetected),
        location: roomLocation || patient?.roomLocation || 'Room 104, Sunrise Senior Home'
      });
    }

    res.status(201).json({
      message: 'Smartwatch telemetry synchronized',
      vitals,
      ai,
      emergencyAlert
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/vitals/:patientId/latest — latest vitals
router.get('/:patientId/latest', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const vitals = await VitalSigns.findOne({ patientId: req.params.patientId })
      .sort({ recordedAt: -1 });
    res.json(vitals);
  } catch (err) {
    next(err);
  }
});

// GET /api/vitals/:patientId — vitals history
router.get('/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const limit = parseInt(req.query.limit) || 10;
    const vitals = await VitalSigns.find({ patientId: req.params.patientId })
      .sort({ recordedAt: -1 })
      .limit(limit);
    res.json(vitals);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
