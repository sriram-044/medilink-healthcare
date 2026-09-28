const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const User = require('../models/User');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { triggerEmergencyWorkflow } = require('../utils/emergencyEngine');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

// GET /api/alerts — active alerts (doctor/admin)
router.get('/', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    let query = req.user.role === 'doctor' ? { doctorId: req.user._id } : {};
    if (req.query.resolved === 'false') query.resolved = false;
    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, alerts] = await Promise.all([
      Alert.countDocuments(query),
      Alert.find(query)
        .populate('patientId', 'name email age bloodGroup phone roomLocation caregiverPhone emergencyContact')
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(alerts, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts/patient/:patientId — alerts for a specific patient
router.get('/patient/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const alerts = await Alert.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/sos — patient SOS button (triggers full emergency workflow)
router.post('/sos', auth, role('patient'), async (req, res, next) => {
  try {
    const patient = await User.findById(req.user._id);
    if (!patient) return next(new NotFoundError('Patient not found'));
    const { location } = req.body;

    const alert = await triggerEmergencyWorkflow({
      patient,
      doctorId: patient?.assignedDoctor,
      type: 'SOS',
      score: 100,
      vitals: {},
      reasons: ['Patient pressed manual SOS Panic Button'],
      fallDetected: false,
      location: location || patient.roomLocation || 'Room 104, Sunrise Senior Home'
    });

    res.status(201).json({
      message: '🚨 Emergency SOS broadcasted to Caregiver, Family, Doctor, and Hospital.',
      alert
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/alerts/:id/status — update emergency status ('Acknowledged', 'Dispatched', 'Resolved')
router.put('/:id/status', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const isResolved = status === 'Resolved';
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        emergencyStatus: status,
        resolved: isResolved,
        resolvedAt: isResolved ? new Date() : null,
        resolvedBy: isResolved ? req.user._id : null
      },
      { new: true }
    );
    if (!alert) return next(new NotFoundError('Alert not found'));
    res.json({ message: `Alert status updated to ${status}`, alert });
  } catch (err) {
    next(err);
  }
});

// PUT /api/alerts/:id/resolve — resolve alert
router.put('/:id/resolve', auth, role('doctor', 'admin'), async (req, res, next) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { resolved: true, emergencyStatus: 'Resolved', resolvedAt: new Date(), resolvedBy: req.user._id },
      { new: true }
    );
    if (!alert) return next(new NotFoundError('Alert not found'));
    res.json({ message: 'Alert resolved', alert });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
