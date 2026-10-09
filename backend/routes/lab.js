/**
 * routes/lab.js — Laboratory Portal API Endpoints
 * Provides dashboard metrics, test request management, sample tracking, patient search, and notifications.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const TestRequest = require('../models/TestRequest');
const Sample = require('../models/Sample');
const MedicalReport = require('../models/MedicalReport');
const User = require('../models/User');
const Alert = require('../models/Alert');
const Notification = require('../models/Notification');
const notificationService = require('../utils/notificationService');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { escapeRegex, buildDateQuery, isValidObjectId } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError, NotFoundError } = require('../utils/errors');

// ─── GET /api/lab/dashboard ───────────────────────────────────────────────────
// Real-time KPI summary counts and recent activities from database
router.get('/dashboard', auth, role('lab', 'admin', 'doctor', 'hospital'), async (req, res, next) => {
  try {
    const [
      pendingTestsCount,
      samplesProcessingCount,
      reportsReadyCount,
      criticalResultsCount,
      recentRequests,
      recentReports,
      criticalAlerts,
      sampleStats
    ] = await Promise.all([
      TestRequest.countDocuments({ status: { $in: ['Pending', 'Sample Collected', 'Processing'] } }),
      Sample.countDocuments({ status: { $in: ['Processing', 'Received'] } }),
      MedicalReport.countDocuments({ reportStatus: { $in: ['Verified', 'Published'] } }),
      MedicalReport.countDocuments({ criticalStatus: 'Critical' }),
      TestRequest.find()
        .populate('patientId', 'name email age gender phone roomLocation')
        .populate('doctorId', 'name specialization')
        .sort({ createdAt: -1 })
        .limit(6),
      MedicalReport.find()
        .populate('patientId', 'name email age gender')
        .populate('doctorId', 'name specialization')
        .sort({ uploadDate: -1 })
        .limit(6),
      Alert.find({ type: 'Critical', resolved: false })
        .populate('patientId', 'name email age roomLocation')
        .sort({ createdAt: -1 })
        .limit(5),
      Sample.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      summary: {
        pendingTests: pendingTestsCount,
        samplesProcessing: samplesProcessingCount,
        reportsReady: reportsReadyCount,
        criticalResults: criticalResultsCount
      },
      recentRequests,
      recentReports,
      criticalAlerts,
      sampleStats: sampleStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/lab/test-requests ───────────────────────────────────────────────
// List test requests with query filters
router.get('/test-requests', auth, role('lab', 'doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { status, priority, category, patientId, doctorId, startDate, endDate, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.testCategory = category;
    if (patientId && isValidObjectId(patientId)) query.patientId = patientId;
    if (doctorId && isValidObjectId(doctorId)) query.doctorId = doctorId;

    // Database-level date range filtering
    const dateQuery = buildDateQuery(startDate, endDate, 'requestDate');
    if (dateQuery) {
      Object.assign(query, dateQuery);
    }

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      // Match test requests by requestId or testName, or by matching patient/doctor names
      const matchingUsers = await User.find({
        name: { $regex: safe, $options: 'i' }
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      const searchOr = [
        { requestId: { $regex: safe, $options: 'i' } },
        { testName: { $regex: safe, $options: 'i' } }
      ];

      if (userIds.length > 0) {
        searchOr.push({ patientId: { $in: userIds } });
        searchOr.push({ doctorId: { $in: userIds } });
      }

      query.$or = searchOr;
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, requests] = await Promise.all([
      TestRequest.countDocuments(query),
      TestRequest.find(query)
        .populate('patientId', 'name email age gender phone roomLocation bloodGroup')
        .populate('doctorId', 'name specialization phone')
        .populate('sampleId')
        .populate('reportId')
        .sort({ requestDate: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(requests, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/lab/test-requests/:id ───────────────────────────────────────────
router.get('/test-requests/:id', auth, async (req, res, next) => {
  try {
    const request = await TestRequest.findById(req.params.id)
      .populate('patientId', 'name email age gender phone roomLocation bloodGroup allergies medicalHistory')
      .populate('doctorId', 'name specialization phone email')
      .populate('sampleId')
      .populate('reportId');

    if (!request) return next(new NotFoundError('Test request not found'));
    res.json(request);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/lab/test-requests ──────────────────────────────────────────────
// Create new test request (Doctor, Lab, or Admin)
router.post('/test-requests', auth, role('doctor', 'lab', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { patientId, testName, testCategory, priority, clinicalNotes, hospitalName, doctorId, assignedLabStaff } = req.body;

    if (!patientId || !testName) {
      return next(new BadRequestError('Patient ID and Test Name are required.'));
    }

    const testRequest = new TestRequest({
      patientId,
      doctorId: req.user.role === 'doctor' ? req.user._id : (doctorId || null),
      assignedLabStaff: assignedLabStaff || null,
      hospitalName: hospitalName || 'CareLink Central Hospital',
      testName,
      testCategory: testCategory || 'Laboratory',
      priority: priority || 'Normal',
      clinicalNotes: clinicalNotes || '',
      status: 'Pending'
    });

    await testRequest.save();

    // Auto-create a linked Sample record if it is a laboratory test
    if (testCategory === 'Laboratory' || !testCategory) {
      const sample = new Sample({
        patientId,
        testRequestId: testRequest._id,
        sampleType: testName.toLowerCase().includes('urine') ? 'Urine' : 'Blood',
        status: 'Requested',
        notes: `Sample auto-requested for Test: ${testName}`
      });
      await sample.save();
      testRequest.sampleId = sample._id;
      await testRequest.save();
    }

    // Dispatch notification to Lab Staff via notificationService
    await notificationService.notifyLabTestRequest(testRequest, req.user);

    res.status(201).json({ message: 'Test request created successfully', testRequest });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/lab/test-requests/:id/status ─────────────────────────────────────
// Update test request status ('Pending', 'Sample Collected', 'Processing', 'Completed', 'Cancelled')
router.put('/test-requests/:id/status', auth, role('lab', 'doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { status, clinicalNotes } = req.body;
    const updateData = { status };
    if (clinicalNotes) updateData.clinicalNotes = clinicalNotes;
    if (status === 'Completed') updateData.completedAt = new Date();

    const request = await TestRequest.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate('patientId', 'name email')
      .populate('doctorId', 'name email');

    if (!request) return res.status(404).json({ message: 'Test request not found' });

    // Sync linked sample if status changed
    if (request.sampleId) {
      let sampleStatus = null;
      if (status === 'Sample Collected') sampleStatus = 'Collected';
      else if (status === 'Processing') sampleStatus = 'Processing';
      else if (status === 'Completed') sampleStatus = 'Completed';

      if (sampleStatus) {
        await Sample.findByIdAndUpdate(request.sampleId, { status: sampleStatus });
      }
    }

    res.json({ message: `Test request updated to ${status}`, request });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/lab/samples ─────────────────────────────────────────────────────
// List samples with query filters
router.get('/samples', auth, role('lab', 'doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { status, sampleType, patientId, testRequestId, startDate, endDate, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (sampleType) query.sampleType = sampleType;
    if (patientId && isValidObjectId(patientId)) query.patientId = patientId;
    if (testRequestId && isValidObjectId(testRequestId)) query.testRequestId = testRequestId;

    // Database-level date range filtering
    const dateQuery = buildDateQuery(startDate, endDate, 'collectionDate');
    if (dateQuery) {
      Object.assign(query, dateQuery);
    }

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      const matchingUsers = await User.find({
        name: { $regex: safe, $options: 'i' }
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      const searchOr = [
        { sampleId: { $regex: safe, $options: 'i' } },
        { barcode: { $regex: safe, $options: 'i' } },
        { sampleType: { $regex: safe, $options: 'i' } }
      ];

      if (userIds.length > 0) {
        searchOr.push({ patientId: { $in: userIds } });
      }

      query.$or = searchOr;
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, samples] = await Promise.all([
      Sample.countDocuments(query),
      Sample.find(query)
        .populate('patientId', 'name email age gender phone roomLocation')
        .populate('testRequestId', 'requestId testName testCategory priority')
        .sort({ collectionDate: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(samples, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/lab/samples ────────────────────────────────────────────────────
// Register new sample
router.post('/samples', auth, role('lab', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { patientId, testRequestId, sampleType, collectedBy, notes, storageLocation } = req.body;

    if (!patientId || !sampleType) {
      return next(new BadRequestError('Patient ID and Sample Type are required.'));
    }

    const sample = new Sample({
      patientId,
      testRequestId: testRequestId || null,
      sampleType,
      collectedBy: collectedBy || req.user.name || 'Lab Technician',
      status: 'Collected',
      notes: notes || '',
      storageLocation: storageLocation || 'Rack A-1, Lab Refrigerator 4°C'
    });

    await sample.save();

    if (testRequestId) {
      await TestRequest.findByIdAndUpdate(testRequestId, {
        sampleId: sample._id,
        status: 'Sample Collected'
      });
    }

    res.status(201).json({ message: 'Sample registered successfully', sample });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/lab/samples/:id ─────────────────────────────────────────────────
// Update sample status and metadata
router.put('/samples/:id', auth, role('lab', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { status, collectedBy, notes, rejectionReason, storageLocation, barcode } = req.body;
    const updateData = {};
    if (status) updateData.status = status;
    if (collectedBy) updateData.collectedBy = collectedBy;
    if (notes !== undefined) updateData.notes = notes;
    if (rejectionReason !== undefined) updateData.rejectionReason = rejectionReason;
    if (storageLocation) updateData.storageLocation = storageLocation;
    if (barcode) updateData.barcode = barcode;

    const sample = await Sample.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate('patientId', 'name email age gender')
      .populate('testRequestId', 'requestId testName priority');

    if (!sample) return next(new NotFoundError('Sample not found'));

    // Sync linked test request
    if (sample.testRequestId) {
      if (status === 'Processing') {
        await TestRequest.findByIdAndUpdate(sample.testRequestId._id, { status: 'Processing' });
      }
    }

    res.json({ message: `Sample status updated to ${status || 'updated'}`, sample });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/lab/patients/search ─────────────────────────────────────────────
// Multi-field patient search with previous reports history
router.get('/patients/search', auth, role('lab', 'doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const { q } = req.query;
    let query = { role: 'patient' };

    if (q && q.trim()) {
      const term = q.trim();
      const isObjectId = mongoose.Types.ObjectId.isValid(term);

      if (isObjectId) {
        query = { role: 'patient', _id: term };
      } else {
        const safeTerm = escapeRegex(term);
        query = {
          role: 'patient',
          $or: [
            { name: { $regex: safeTerm, $options: 'i' } },
            { email: { $regex: safeTerm, $options: 'i' } },
            { phone: { $regex: safeTerm, $options: 'i' } },
            { bloodGroup: { $regex: safeTerm, $options: 'i' } }
          ]
        };
      }
    }

    const patients = await User.find(query)
      .select('-password')
      .populate('assignedDoctor', 'name specialization email phone')
      .limit(20);

    // Fetch previous reports count & list for each found patient
    const results = await Promise.all(patients.map(async p => {
      const [reports, testRequests, totalReportsCount] = await Promise.all([
        MedicalReport.find({ patientId: p._id })
          .select('reportId category reportType fileFormat reportStatus criticalStatus testDate reportDate fileName fileUrl')
          .sort({ testDate: -1 })
          .limit(5),
        TestRequest.find({ patientId: p._id })
          .select('requestId testName priority status requestDate')
          .sort({ requestDate: -1 })
          .limit(5),
        MedicalReport.countDocuments({ patientId: p._id })
      ]);

      return {
        ...p.toObject(),
        previousReports: reports,
        recentRequests: testRequests,
        totalReportsCount
      };
    }));

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/lab/critical-results ────────────────────────────────────────────
// Dedicated high-urgency queue for critical findings
router.get('/critical-results', auth, role('lab', 'doctor', 'admin', 'hospital'), async (req, res, next) => {
  try {
    const criticalReports = await MedicalReport.find({ criticalStatus: 'Critical' })
      .populate('patientId', 'name email age gender phone roomLocation caregiverPhone emergencyContact')
      .populate('doctorId', 'name specialization phone email')
      .sort({ reportDate: -1 });

    const criticalRequests = await TestRequest.find({ priority: 'Critical', status: { $ne: 'Completed' } })
      .populate('patientId', 'name email age gender phone roomLocation')
      .populate('doctorId', 'name specialization phone')
      .sort({ requestDate: -1 });

    res.json({
      criticalReports,
      criticalRequests,
      totalCritical: criticalReports.length + criticalRequests.length
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/lab/notifications ───────────────────────────────────────────────
router.get('/notifications', auth, role('lab', 'admin'), async (req, res, next) => {
  try {
    const query = req.user.role === 'admin'
      ? { $or: [{ role: 'lab' }, { recipientId: req.user._id }] }
      : { recipientId: req.user._id };

    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(30);

    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
