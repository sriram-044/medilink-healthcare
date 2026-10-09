const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Report = require('../models/Report');
const User = require('../models/User');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { escapeRegex, buildDateQuery, isValidObjectId } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpeg|jpg|png/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only PDF, JPG and PNG files allowed'));
  }
});

// POST /api/reports/upload — patient or lab uploads report
router.post('/upload', auth, upload.single('file'), async (req, res, next) => {
  try {
    const { patientId, reportType, labName, testDate, patientNote, doctorId } = req.body;

    const targetPatientId = req.user.role === 'patient' ? req.user._id : patientId;

    const report = new Report({
      patientId: targetPatientId,
      doctorId: doctorId || null,
      uploadedBy: req.user.role,
      uploaderId: req.user._id,
      reportType: reportType || 'other',
      labName,
      testDate: testDate ? new Date(testDate) : null,
      patientNote,
      fileName: req.file?.filename, // server-generated filename only
      fileUrl: null,                // no public URL — file accessed via protected API
      mimeType: req.file?.mimetype,
      status: 'Pending'
    });

    await report.save();
    res.status(201).json({ message: 'Report uploaded successfully', report });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/admin-add — admin adds report manually
router.post('/admin-add', auth, role('admin'), upload.single('file'), async (req, res, next) => {
  try {
    const { patientId, doctorId, reportType, labName, testDate } = req.body;
    const report = new Report({
      patientId,
      doctorId,
      uploadedBy: 'admin',
      uploaderId: req.user._id,
      reportType: reportType || 'other',
      labName,
      testDate: testDate ? new Date(testDate) : null,
      fileName: req.file?.filename, // server-generated filename
      fileUrl: null,                // no public URL
      mimeType: req.file?.mimetype,
      status: 'Pending'
    });
    await report.save();
    res.status(201).json({ message: 'Report added successfully', report });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports — all reports (admin/doctor/lab)
router.get('/', auth, role('doctor', 'admin', 'lab'), async (req, res, next) => {
  try {
    const { reportType, status, patientId, search, startDate, endDate } = req.query;
    let query = {};

    if (req.user.role === 'doctor') {
      query.doctorId = req.user._id;
    }

    if (patientId && isValidObjectId(patientId)) {
      query.patientId = patientId;
    }
    if (reportType) query.reportType = reportType;
    if (status) query.status = status;

    const dateQuery = buildDateQuery(startDate, endDate, 'testDate');
    if (dateQuery) Object.assign(query, dateQuery);

    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { reportType: { $regex: safe, $options: 'i' } },
        { summary: { $regex: safe, $options: 'i' } },
        { fileName: { $regex: safe, $options: 'i' } }
      ];
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    // lab sees all reports (their archive)
    const [total, reports] = await Promise.all([
      Report.countDocuments(query),
      Report.find(query)
        .populate('patientId', 'name email age')
        .populate('doctorId', 'name')
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(reports, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:patientId — get patient reports
router.get('/:patientId', auth, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.patientId) {
      return next(new ForbiddenError('Access denied'));
    }
    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const patientQuery = { patientId: req.params.patientId };
    const [total, reports] = await Promise.all([
      Report.countDocuments(patientQuery),
      Report.find(patientQuery)
        .populate('doctorId', 'name specialization')
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(reports, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id/file — Secure file access for legacy Report records
// Restricted to admin, doctor, lab (same as the list endpoint)
router.get('/:id/file', auth, role('admin', 'doctor', 'lab'), async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return next(new NotFoundError('Report not found.'));

    // Doctors can only access reports assigned to them
    if (req.user.role === 'doctor' && report.doctorId?.toString() !== req.user._id.toString()) {
      return next(new ForbiddenError('Access denied.'));
    }

    // Lab can only access reports they uploaded
    if (req.user.role === 'lab' && report.uploaderId?.toString() !== req.user._id.toString()) {
      return next(new ForbiddenError('Access denied.'));
    }

    if (!report.fileName) {
      return next(new NotFoundError('No file attached to this report.'));
    }

    // Resolve file path entirely from DB — never from request input
    const filePath = path.join(uploadDir, report.fileName);
    if (!fs.existsSync(filePath)) {
      return next(new NotFoundError('File not found in storage.'));
    }

    const contentType = report.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${report.fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// PUT /api/reports/:id/review — doctor reviews report
router.put('/:id/review', auth, role('doctor'), async (req, res, next) => {
  try {
    const { doctorComment, severity, status } = req.body;
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        doctorComment,
        severity,
        status: status || (severity === 'Critical' ? 'Flagged' : 'Reviewed'),
        reviewedAt: new Date()
      },
      { new: true }
    );
    res.json({ message: 'Report reviewed', report });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
