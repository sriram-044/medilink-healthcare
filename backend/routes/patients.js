const express = require('express');
const router = express.Router();
const User = require('../models/User');
const HospitalVisit = require('../models/HospitalVisit');
const { Medication } = require('../models/Medication');
const Report = require('../models/Report');
const MedicalReport = require('../models/MedicalReport');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { escapeRegex } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

// GET /api/patients — all patients (doctor/admin/hospital)
router.get('/', auth, role('doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = { role: 'patient' };

    if (req.user.role === 'doctor') {
      query.assignedDoctor = req.user._id;
    }

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { phone: { $regex: safe, $options: 'i' } },
        { roomLocation: { $regex: safe, $options: 'i' } }
      ];
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    let patientsQuery = User.find(query)
      .select('-password')
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit);

    if (req.user.role === 'admin' || req.user.role === 'hospital') {
      patientsQuery = patientsQuery.populate('assignedDoctor', 'name email specialization');
    }

    const [total, patients] = await Promise.all([
      User.countDocuments(query),
      patientsQuery
    ]);

    res.json(formatPaginatedResponse(patients, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// ─── Patient GPS & Location Endpoints ──────────────────────────────────────────

// PUT /api/patients/me/location — Patient updates their own GPS or manual location
const handlePatientLocationUpdate = async (req, res, next) => {
  try {
    const { latitude, longitude, accuracyMeters, address, source = 'gps', consentStatus = 'granted' } = req.body;

    let lat = null;
    let lng = null;

    if (latitude !== undefined && latitude !== null) {
      lat = Number(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return next(new BadRequestError('Invalid latitude. Value must be a number between -90 and 90.'));
      }
    }

    if (longitude !== undefined && longitude !== null) {
      lng = Number(longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        return next(new BadRequestError('Invalid longitude. Value must be a number between -180 and 180.'));
      }
    }

    if (source && !['gps', 'manual', 'network'].includes(source)) {
      return next(new BadRequestError("Invalid source. Allowed values: 'gps', 'manual', 'network'."));
    }

    if (consentStatus && !['granted', 'denied', 'manual'].includes(consentStatus)) {
      return next(new BadRequestError("Invalid consentStatus. Allowed values: 'granted', 'denied', 'manual'."));
    }

    // Always use authenticated user's ID to prevent IDOR attacks
    const patient = await User.findById(req.user._id);
    if (!patient) return next(new NotFoundError('Patient account not found'));

    patient.location = {
      latitude: lat,
      longitude: lng,
      accuracyMeters: accuracyMeters !== undefined && accuracyMeters !== null ? Math.round(Number(accuracyMeters)) : null,
      address: address ? String(address).trim() : (lat && lng ? `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : patient.roomLocation || null),
      capturedAt: new Date(),
      source,
      consentStatus
    };

    await patient.save();

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: patient.location
    });
  } catch (err) {
    next(err);
  }
};

router.put('/me/location', auth, handlePatientLocationUpdate);
router.post('/me/location', auth, handlePatientLocationUpdate);

// GET /api/patients/me/location — Retrieve current authenticated patient's location
router.get('/me/location', auth, async (req, res, next) => {
  try {
    const patient = await User.findById(req.user._id).select('location name role roomLocation');
    if (!patient) return next(new NotFoundError('Patient account not found'));

    res.json({
      success: true,
      location: patient.location || {
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        address: patient.roomLocation || null,
        source: null,
        consentStatus: null
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:id/location — Authorized access to patient location
router.get('/:id/location', auth, async (req, res, next) => {
  try {
    const targetPatientId = req.params.id;

    // RBAC: Patient can only view their own location
    if (req.user.role === 'patient' && req.user._id.toString() !== targetPatientId) {
      return next(new ForbiddenError('Access denied. You cannot view another patient\'s private location.'));
    }

    const patient = await User.findById(targetPatientId).select('name location assignedDoctor roomLocation');
    if (!patient) return next(new NotFoundError('Patient not found'));

    // If doctor, must be assigned
    if (req.user.role === 'doctor') {
      const isAssigned = patient.assignedDoctor && patient.assignedDoctor.toString() === req.user._id.toString();
      if (!isAssigned) {
        return next(new ForbiddenError('Access denied. You are not assigned to this patient.'));
      }
    }

    res.json({
      success: true,
      patientId: patient._id,
      patientName: patient.name,
      location: patient.location || {
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        address: patient.roomLocation || null,
        source: null,
        consentStatus: null
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:id — single patient
router.get('/:id', auth, async (req, res, next) => {
  try {
    const patient = await User.findById(req.params.id).select('-password').populate('assignedDoctor', 'name email specialization phone');
    if (!patient) return next(new NotFoundError('Patient not found'));

    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:id/lifetime-history — full lifetime medical record
router.get('/:id/lifetime-history', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }

    const patient = await User.findById(req.params.id).select('-password').populate('assignedDoctor', 'name email specialization phone');
    if (!patient) return next(new NotFoundError('Patient not found'));

    const hospitalVisits = await HospitalVisit.find({ patientId: req.params.id }).sort({ visitDate: -1 });
    const medications = await Medication.find({ patientId: req.params.id }).populate('doctorId', 'name').sort({ createdAt: -1 });
    const reports = await Report.find({ patientId: req.params.id }).sort({ testDate: -1 });
    const medicalReports = await MedicalReport.find({ patientId: req.params.id })
      .populate('doctorId', 'name specialization')
      .populate('testRequestId', 'requestId priority testName')
      .populate('sampleId', 'sampleId sampleType status')
      .sort({ testDate: -1, createdAt: -1 });

    res.json({
      patient,
      hospitalVisits,
      medications,
      reports,
      medicalReports,
      allergiesDetail: patient.allergiesDetail || [],
      medicalConditionsDetail: patient.medicalConditionsDetail || []
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/patients/:id/hospital-visit — add hospital visit
router.post('/:id/hospital-visit', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }

    const { hospitalName, visitDate, visitType, doctorName, reason, diagnosis, dischargeSummary, status } = req.body;

    const visit = new HospitalVisit({
      patientId: req.params.id,
      hospitalName,
      visitDate: visitDate || new Date(),
      visitType: visitType || 'Outpatient Consult',
      doctorName,
      reason,
      diagnosis,
      dischargeSummary,
      status: status || 'Completed'
    });

    await visit.save();
    res.status(201).json({ message: 'Hospital visit recorded', visit });
  } catch (err) {
    next(err);
  }
});

// POST /api/patients/:id/allergies — add allergy
router.post('/:id/allergies', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }

    const { name, severity, reaction } = req.body;
    if (!name) return next(new BadRequestError('Allergy name is required'));

    const patient = await User.findById(req.params.id);
    if (!patient) return next(new NotFoundError('Patient not found'));
    patient.allergiesDetail.push({ name, severity: severity || 'Moderate', reaction });
    if (!patient.allergies.includes(name)) {
      patient.allergies.push(name);
    }
    await patient.save();

    res.status(201).json({ message: 'Allergy added to profile', allergiesDetail: patient.allergiesDetail });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/patients/:id/allergies/:allergyId — delete allergy
router.delete('/:id/allergies/:allergyId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }
    const patient = await User.findById(req.params.id);
    if (!patient) return next(new NotFoundError('Patient not found'));
    patient.allergiesDetail = patient.allergiesDetail.filter(a => a._id.toString() !== req.params.allergyId);
    await patient.save();
    res.json({ message: 'Allergy removed', allergiesDetail: patient.allergiesDetail });
  } catch (err) {
    next(err);
  }
});

// POST /api/patients/:id/medical-conditions — add medical condition
router.post('/:id/medical-conditions', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }

    const { condition, diagnosedYear, status } = req.body;
    if (!condition) return next(new BadRequestError('Condition name is required'));

    const patient = await User.findById(req.params.id);
    if (!patient) return next(new NotFoundError('Patient not found'));
    patient.medicalConditionsDetail.push({ condition, diagnosedYear, status: status || 'Active' });
    if (!patient.medicalHistory.includes(condition)) {
      patient.medicalHistory.push(condition);
    }
    await patient.save();

    res.status(201).json({ message: 'Medical condition added', medicalConditionsDetail: patient.medicalConditionsDetail });
  } catch (err) {
    next(err);
  }
});

// PUT /api/patients/:id — update basic profile
router.put('/:id', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return next(new ForbiddenError('Access denied'));
    }
    const { name, phone, age, gender, bloodGroup, address, caregiverPhone, emergencyContact, roomLocation } = req.body;
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { name, phone, age, gender, bloodGroup, address, caregiverPhone, emergencyContact, roomLocation },
      { new: true }
    ).select('-password');
    if (!updated) return next(new NotFoundError('Patient not found'));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
