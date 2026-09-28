/**
 * routes/medicalReports.js — Medical Report Management System API Routes
 * Handles upload, file validation, storage, multi-format retrieval, structured test results, and EHR publishing.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const MedicalReport = require('../models/MedicalReport');
const Report = require('../models/Report'); // Legacy model for backward compatibility
const TestRequest = require('../models/TestRequest');
const Sample = require('../models/Sample');
const User = require('../models/User');
const Notification = require('../models/Notification');

const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');

const {
  validateMedicalReportFile,
  generateSafeFileName,
  getReportCategoriesConfig,
  MAX_FILE_SIZE_BYTES
} = require('../utils/fileValidator');

const storageService = require('../utils/storageService');
const { escapeRegex, buildDateQuery, isValidObjectId } = require('../utils/queryHelper');
const { parsePagination, formatPaginatedResponse } = require('../utils/paginationHelper');
const { evaluateStructuredResults, triggerCriticalResultAlert, getReferenceRangesCatalog } = require('../utils/criticalDetection');
const { generateReportAiAnalysis } = require('../utils/reportAiEngine');
const { processDocument } = require('../utils/documentIntelligence');
const { sendToUser } = require('../utils/socket');

// Temporary disk storage for Multer before validation & final storage
const tempUploadDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(tempUploadDir)) fs.mkdirSync(tempUploadDir, { recursive: true });

const upload = multer({
  dest: tempUploadDir,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

// ─── GET /api/medical-reports/config/categories ──────────────────────────────
// Returns categories, types, allowed formats, and reference range catalog
router.get('/config/categories', auth, (req, res) => {
  try {
    const categories = getReportCategoriesConfig();
    const referenceRanges = getReferenceRangesCatalog();
    res.json({
      categories,
      referenceRanges,
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
      storageDriver: storageService.getDriverName()
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/medical-reports/upload ─────────────────────────────────────────
// Multipart file upload with strict validation, storage abstraction, and critical detection
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  let tempFilePath = null;
  try {
    const {
      patientId,
      doctorId,
      testRequestId,
      sampleId,
      hospitalName,
      labName,
      category,
      reportType,
      testDate,
      reportDate,
      patientNote,
      structuredResults: rawStructuredResults,
      publishImmediately
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: 'Patient selection is required.' });
    }
    if (!reportType) {
      return res.status(400).json({ message: 'Report type is required.' });
    }

    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Selected patient not found.' });
    }

    // Determine target doctor
    const targetDoctorId = doctorId || patient.assignedDoctor || null;

    let safeFileName = null;
    let fileFormat = 'MANUAL';
    let fileSize = 0;
    let fileUrl = null;
    let mimeType = null;
    let originalFileName = null;
    let extractedText = null;
    let documentClassification = 'Unknown';

    // 1. Validate File if provided
    if (req.file) {
      tempFilePath = req.file.path;
      originalFileName = req.file.originalname;

      const validation = validateMedicalReportFile(req.file, reportType);
      if (!validation.isValid) {
        // Clean up temp file
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return next(new BadRequestError(validation.error));
      }

      fileFormat = validation.format || path.extname(originalFileName).replace('.', '').toUpperCase();
      safeFileName = generateSafeFileName(originalFileName, category || 'report');
      fileSize = req.file.size;
      mimeType = req.file.mimetype;

      // 2. Save via Storage Service
      await storageService.uploadFile(tempFilePath, safeFileName);
      fileUrl = storageService.getFileUrl(safeFileName, req);

      // 2.5 Document Intelligence (Text Extraction & Classification)
      const docData = await processDocument(tempFilePath, mimeType, reportType);
      extractedText = docData.text;
      documentClassification = docData.classification;
      if (docData.structuredData && (!rawStructuredResults || rawStructuredResults.length === 0)) {
        rawStructuredResults = docData.structuredData;
      }

      // Remove temp file
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }

    // 3. Process Structured Test Results
    let structuredResults = [];
    if (rawStructuredResults) {
      try {
        structuredResults = typeof rawStructuredResults === 'string'
          ? JSON.parse(rawStructuredResults)
          : rawStructuredResults;
      } catch (parseErr) {
        console.warn('Could not parse structured results:', parseErr.message);
      }
    }

    // 4. Critical Result & Range Evaluation
    const evaluation = evaluateStructuredResults(structuredResults);
    const criticalStatus = evaluation.overallStatus;

    // 5. Generate AI Non-Diagnostic Summary
    const aiAnalysis = generateReportAiAnalysis(
      evaluation.evaluatedResults,
      reportType,
      category || 'Laboratory'
    );

    const isPublished = publishImmediately === 'true' || publishImmediately === true;

    // 6. Create Medical Report Record
    const medicalReport = new MedicalReport({
      patientId,
      doctorId: targetDoctorId,
      hospitalName: hospitalName || 'CareLink Central Hospital',
      laboratoryId: req.user.role === 'lab' ? req.user._id : null,
      labName: labName || (req.user.role === 'lab' ? req.user.name : 'CareLink Diagnostic Laboratory'),
      testRequestId: testRequestId || null,
      sampleId: sampleId || null,
      category: category || 'Laboratory',
      reportType,
      fileName: safeFileName,
      originalFileName,
      fileFormat,
      fileSize,
      fileUrl,
      mimeType,
      testDate: testDate ? new Date(testDate) : new Date(),
      reportDate: reportDate ? new Date(reportDate) : new Date(),
      uploadDate: new Date(),
      uploadedBy: req.user.role || 'lab',
      uploaderId: req.user._id,
      reportStatus: isPublished ? 'Published' : 'Uploaded',
      criticalStatus,
      structuredResults: evaluation.evaluatedResults,
      aiAnalysis,
      patientNote: patientNote || '',
      extractedText,
      documentClassification
    });

    await medicalReport.save();

    // 7. Sync with Legacy Report model for complete backwards-compatibility
    try {
      await new Report({
        patientId,
        doctorId: targetDoctorId,
        uploadedBy: req.user.role === 'lab' ? 'lab' : (req.user.role === 'patient' ? 'patient' : 'admin'),
        uploaderId: req.user._id,
        reportType: reportType.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 15) || 'other',
        labName: medicalReport.labName,
        testDate: medicalReport.testDate,
        patientNote,
        fileName: originalFileName || safeFileName,
        fileUrl,
        mimeType,
        status: isPublished ? 'Reviewed' : 'Pending',
        severity: criticalStatus === 'Critical' ? 'Critical' : (criticalStatus === 'Abnormal' ? 'Risk' : 'Normal')
      }).save();
    } catch (legacyErr) {
      console.warn('Legacy Report model sync note:', legacyErr.message);
    }

    // 8. Update Test Request status if linked
    if (testRequestId) {
      await TestRequest.findByIdAndUpdate(testRequestId, {
        reportId: medicalReport._id,
        status: 'Completed',
        completedAt: new Date()
      });
    }

    // 9. Handle Critical Alerts
    if (criticalStatus === 'Critical') {
      await triggerCriticalResultAlert({
        report: medicalReport,
        patient,
        doctorId: targetDoctorId,
        hospitalName: medicalReport.hospitalName
      });
    } else if (isPublished) {
      // Standard publication notification
      const patNotification = new Notification({
        recipientId: patientId,
        role: 'patient',
        type: 'report_published',
        title: `📄 New ${reportType} Report Available`,
        message: `Your ${reportType} report has been published to your Lifetime EHR record.`,
        reportId: medicalReport._id,
        severity: 'Normal'
      });
      await patNotification.save();
      sendToUser(patNotification.recipientId, 'notification', patNotification.toObject());
    }

    res.status(201).json({
      message: 'Medical report uploaded and processed successfully!',
      report: medicalReport,
      isCritical: criticalStatus === 'Critical'
    });
  } catch (err) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
    next(err);
  }
});

// ─── GET /api/medical-reports ─────────────────────────────────────────────────
// List reports with role-based access and multi-field filters
router.get('/', auth, async (req, res, next) => {
  try {
    const {
      category,
      reportType,
      patientId,
      doctorId,
      criticalStatus,
      reportStatus,
      status,
      uploadedBy,
      labName,
      startDate,
      endDate,
      search
    } = req.query;

    const query = {};

    // ─── 1. Role-Based Access Control (RBAC) ──────────────────────────────
    if (req.user.role === 'patient') {
      // Patients are strictly confined to their own reports
      query.patientId = req.user._id;
      // Patient sees verified, published, or uploaded reports
      query.reportStatus = { $in: ['Verified', 'Published', 'Uploaded'] };
    } else if (req.user.role === 'doctor') {
      // Doctor can see their assigned patients' reports or reports assigned to them
      if (patientId && isValidObjectId(patientId)) {
        query.patientId = patientId;
        query.$or = [{ doctorId: req.user._id }, { patientId: { $in: req.user.assignedPatients || [] } }];
      } else {
        query.$or = [{ doctorId: req.user._id }, { patientId: { $in: req.user.assignedPatients || [] } }];
      }
    } else {
      // Lab, Hospital, Admin can view all or filter by patientId / doctorId
      if (patientId && isValidObjectId(patientId)) {
        query.patientId = patientId;
      }
      if (doctorId && isValidObjectId(doctorId)) {
        query.doctorId = doctorId;
      }
    }

    // ─── 2. Discrete Field Filters (Database-level) ───────────────────────
    if (category) query.category = category;
    if (reportType) query.reportType = reportType;
    if (criticalStatus) query.criticalStatus = criticalStatus;
    if (reportStatus || status) {
      const targetStatus = reportStatus || status;
      if (req.user.role !== 'patient') {
        query.reportStatus = targetStatus;
      } else if (['Verified', 'Published', 'Uploaded'].includes(targetStatus)) {
        query.reportStatus = targetStatus;
      }
    }
    if (uploadedBy) query.uploadedBy = uploadedBy;
    if (labName && labName.trim()) {
      query.labName = { $regex: escapeRegex(labName.trim()), $options: 'i' };
    }

    // ─── 3. Date Range Filtering (Database-level) ─────────────────────────
    const dateQuery = buildDateQuery(startDate, endDate, 'testDate');
    if (dateQuery) {
      Object.assign(query, dateQuery);
    }

    // ─── 4. Search Filter (Database-level) ─────────────────────────────────
    if (search && search.trim()) {
      const safe = escapeRegex(search.trim());

      const searchConditions = [
        { reportId: { $regex: safe, $options: 'i' } },
        { reportType: { $regex: safe, $options: 'i' } },
        { category: { $regex: safe, $options: 'i' } },
        { labName: { $regex: safe, $options: 'i' } }
      ];

      // If user is not patient, match patient/doctor names in DB
      const matchingUsers = await User.find({
        name: { $regex: safe, $options: 'i' }
      }).select('_id');
      const userIds = matchingUsers.map(u => u._id);

      if (userIds.length > 0) {
        if (req.user.role !== 'patient') {
          searchConditions.push({ patientId: { $in: userIds } });
        }
        searchConditions.push({ doctorId: { $in: userIds } });
      }

      // Safely combine with existing query (preserving doctor RBAC $or if present)
      if (query.$or) {
        const existingOr = query.$or;
        delete query.$or;
        query.$and = [{ $or: existingOr }, { $or: searchConditions }];
      } else {
        query.$or = searchConditions;
      }
    }

    const pagination = parsePagination(req);
    if (!pagination.isValid) {
      return next(new BadRequestError(pagination.error));
    }

    const [total, reports] = await Promise.all([
      MedicalReport.countDocuments(query),
      MedicalReport.find(query)
        .populate('patientId', 'name email age gender phone roomLocation bloodGroup')
        .populate('doctorId', 'name specialization phone email')
        .populate('testRequestId', 'requestId priority testName')
        .populate('sampleId', 'sampleId sampleType status')
        .sort({ testDate: -1, createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
    ]);

    res.json(formatPaginatedResponse(reports, total, pagination.page, pagination.limit));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/medical-reports/:id ─────────────────────────────────────────────
router.get('/:id', auth, async (req, res, next) => {
  try {
    const report = await MedicalReport.findById(req.params.id)
      .populate('patientId', 'name email age gender phone roomLocation bloodGroup caregiverPhone emergencyContact medicalHistory allergies')
      .populate('doctorId', 'name specialization phone email')
      .populate('testRequestId')
      .populate('sampleId');

    if (!report) return next(new NotFoundError('Medical report not found.'));

    // Authorization check
    if (req.user.role === 'patient' && report.patientId._id.toString() !== req.user._id.toString()) {
      return next(new ForbiddenError('Access denied to this report.'));
    }

    res.json(report);
  } catch (err) {
    next(err);
  }
});

// ─── SHARED: Report File Authorization Helper ────────────────────────────────
/**
 * Checks whether req.user is authorized to access the file of `report`.
 * Returns null if authorized, or a { status, message } object if denied.
 *
 * Authorization rules:
 *   patient  → must own the report (report.patientId === user._id)
 *   doctor   → must be the named doctor OR have the patient in assignedPatients
 *   lab      → must have uploaded the report OR be the named lab
 *   hospital → must be the named hospital (report.hospitalId) or full access if hospitalId absent
 *   admin    → full access
 *   others   → deny
 */
async function authorizeReportFileAccess(report, user) {
  const userId = user._id.toString();
  const role = user.role;

  if (role === 'admin') {
    return null; // Admins have full access
  }

  if (role === 'patient') {
    // Patient must own the report
    const ownerId = report.patientId?._id
      ? report.patientId._id.toString()
      : report.patientId.toString();
    if (ownerId !== userId) {
      return { status: 403, message: 'Access denied. You can only access your own medical reports.' };
    }
    return null;
  }

  if (role === 'doctor') {
    // Doctor must be the named doctor on the report OR have the patient in their assignedPatients
    const namedDoctorId = report.doctorId
      ? (report.doctorId._id ? report.doctorId._id.toString() : report.doctorId.toString())
      : null;
    if (namedDoctorId === userId) return null; // Named doctor on this report

    // Check assignedPatients on the doctor record
    const patientId = report.patientId?._id
      ? report.patientId._id.toString()
      : report.patientId.toString();
    const assignedPatients = (user.assignedPatients || []).map(id => id.toString());
    if (assignedPatients.includes(patientId)) return null;

    return { status: 403, message: 'Access denied. You are not authorized to access this patient\'s reports.' };
  }

  if (role === 'lab') {
    // Lab must be the uploader OR the named laboratory
    const namedLabId = report.laboratoryId
      ? (report.laboratoryId._id ? report.laboratoryId._id.toString() : report.laboratoryId.toString())
      : null;
    if (namedLabId === userId) return null;

    const uploaderId = report.uploaderId
      ? (report.uploaderId._id ? report.uploaderId._id.toString() : report.uploaderId.toString())
      : null;
    if (uploaderId === userId) return null;

    return { status: 403, message: 'Access denied. This report is not associated with your laboratory.' };
  }

  if (role === 'hospital') {
    // Hospital must match the named hospitalId, or if none recorded, allow (legacy data)
    if (!report.hospitalId) return null; // No hospital restriction recorded — allow
    const namedHospitalId = report.hospitalId._id
      ? report.hospitalId._id.toString()
      : report.hospitalId.toString();
    if (namedHospitalId === userId) return null;
    return { status: 403, message: 'Access denied. This report is not associated with your hospital.' };
  }

  // All other roles (pharmacy, insurance, emergency, etc.) → deny
  return { status: 403, message: 'Access denied. Your role cannot access medical report files.' };
}

// ─── Shared file streaming helper ─────────────────────────────────────────────
/**
 * Resolve trusted filename from DB, verify auth, stream file.
 * Never constructs filesystem path from URL input.
 */
async function streamReportFile(req, res, next, disposition) {
  try {
    const report = await MedicalReport.findById(req.params.id)
      .populate('patientId', 'name _id')
      .populate('doctorId', 'name _id')
      .populate('laboratoryId', 'name _id');

    if (!report) {
      return next(new NotFoundError('Medical report not found.'));
    }

    // Authorize BEFORE touching any file
    const denied = await authorizeReportFileAccess(report, req.user);
    if (denied) {
      return next(new ForbiddenError(denied.message));
    }

    if (!report.fileName) {
      return next(new NotFoundError('No file is attached to this report (structured data only).'));
    }

    // ─── Secure file resolution ────────────────────────────────────────────
    // The filename comes ONLY from the database, never from the request URL.
    // storageService.getFile() resolves it within its own upload directory —
    // path traversal sequences in a DB-sourced filename would only arrive here
    // if the DB itself was compromised, not from a URL-injection attack.
    let fileData;
    try {
      fileData = await storageService.getFile(report.fileName);
    } catch (storageErr) {
      return next(new NotFoundError('Report file not found in storage. It may have been deleted.'));
    }

    // Use MIME type from DB (trusted server-side metadata, not from client)
    const contentType = report.mimeType || 'application/octet-stream';
    const safeDisplayName = (report.originalFileName || report.fileName)
      .replace(/["\\]/g, '_'); // Sanitize for Content-Disposition header

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeDisplayName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store'); // Medical data must not be cached

    if (fileData.stat?.size) {
      res.setHeader('Content-Length', fileData.stat.size);
    }

    fileData.stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/medical-reports/:id/file ────────────────────────────────────────
// Canonical secure file access endpoint.
// Requires authentication (Step 1 httpOnly cookie) + role-based authorization.
// Defaults to inline preview for supported formats, attachment for others.
router.get('/:id/file', auth, async (req, res, next) => {
  const report = await MedicalReport.findById(req.params.id).select('mimeType fileFormat fileName');
  const format = (report?.fileFormat || '').toUpperCase();
  // Inline preview for PDF and images; attachment download for all others
  const disposition = ['PDF', 'PNG', 'JPG', 'JPEG', 'TIFF'].includes(format) ? 'inline' : 'attachment';
  return streamReportFile(req, res, next, disposition);
});

// ─── GET /api/medical-reports/:id/view ────────────────────────────────────────
// Secure inline preview stream (preserved for existing frontend compatibility).
router.get('/:id/view', auth, async (req, res, next) => {
  return streamReportFile(req, res, next, 'inline');
});

// ─── GET /api/medical-reports/:id/download ────────────────────────────────────
// Secure download attachment (preserved for existing frontend compatibility).
router.get('/:id/download', auth, async (req, res, next) => {
  return streamReportFile(req, res, next, 'attachment');
});

// ─── PUT /api/medical-reports/:id/publish ──────────────────────────────────────
// Publish report to Patient's Lifetime EHR & notify patient and doctor
router.put('/:id/publish', auth, role('lab', 'doctor', 'admin', 'hospital'), async (req, res) => {
  try {
    const report = await MedicalReport.findByIdAndUpdate(
      req.params.id,
      { reportStatus: 'Published' },
      { new: true }
    ).populate('patientId', 'name email').populate('doctorId', 'name email');

    if (!report) return res.status(404).json({ message: 'Medical report not found' });

    // Send notification to Patient
    const patNotification = new Notification({
      recipientId: report.patientId._id,
      role: 'patient',
      type: 'report_published',
      title: `📄 ${report.reportType} Published to EHR`,
      message: `Your ${report.reportType} report is now available in your Lifetime Electronic Health Record.`,
      reportId: report._id,
      severity: report.criticalStatus === 'Critical' ? 'Critical' : 'Normal'
    });
    await patNotification.save();
    sendToUser(patNotification.recipientId, 'notification', patNotification.toObject());

    // Send notification to Doctor if assigned
    if (report.doctorId) {
      const docNotification = new Notification({
        recipientId: report.doctorId._id,
        role: 'doctor',
        type: 'report_published',
        title: `📋 Report Published: ${report.patientId?.name}`,
        message: `${report.reportType} has been published and is ready for clinical evaluation.`,
        reportId: report._id,
        severity: report.criticalStatus === 'Critical' ? 'Critical' : 'Normal'
      });
      await docNotification.save();
      sendToUser(docNotification.recipientId, 'notification', docNotification.toObject());
    }

    res.json({ message: 'Report published to Patient Lifetime EHR successfully!', report });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/medical-reports/:id/archive ──────────────────────────────────────
router.put('/:id/archive', auth, role('lab', 'admin', 'doctor'), async (req, res) => {
  try {
    const report = await MedicalReport.findByIdAndUpdate(
      req.params.id,
      { reportStatus: 'Archived' },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Medical report not found' });
    res.json({ message: 'Report archived successfully', report });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/medical-reports/:id/review ───────────────────────────────────────
// Doctor clinical review
router.put('/:id/review', auth, role('doctor', 'admin'), async (req, res) => {
  try {
    const { doctorComment, severity } = req.body;
    const report = await MedicalReport.findByIdAndUpdate(
      req.params.id,
      {
        doctorComment,
        reviewedAt: new Date(),
        reportStatus: 'Verified'
      },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Medical report not found' });
    res.json({ message: 'Clinical review saved', report });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/medical-reports/:id/results ────────────────────────────────────
// Enter or update structured test results
router.post('/:id/results', auth, role('lab', 'doctor', 'admin'), async (req, res) => {
  try {
    const { structuredResults } = req.body;
    if (!Array.isArray(structuredResults)) {
      return res.status(400).json({ message: 'structuredResults must be an array of test parameters.' });
    }

    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Medical report not found' });

    const evaluation = evaluateStructuredResults(structuredResults);
    report.structuredResults = evaluation.evaluatedResults;
    report.criticalStatus = evaluation.overallStatus;
    report.aiAnalysis = generateReportAiAnalysis(evaluation.evaluatedResults, report.reportType, report.category);

    await report.save();

    if (report.criticalStatus === 'Critical') {
      const patient = await User.findById(report.patientId);
      await triggerCriticalResultAlert({
        report,
        patient,
        doctorId: report.doctorId,
        hospitalName: report.hospitalName
      });
    }

    res.json({ message: 'Structured test results updated successfully', report });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/medical-reports/:id ──────────────────────────────────────────
// Delete report with authorization check
router.delete('/:id', auth, role('lab', 'admin'), async (req, res) => {
  try {
    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Medical report not found' });

    // Delete underlying physical file
    if (report.fileName) {
      await storageService.deleteFile(report.fileName);
    }

    await MedicalReport.findByIdAndDelete(req.params.id);
    res.json({ message: 'Medical report deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
