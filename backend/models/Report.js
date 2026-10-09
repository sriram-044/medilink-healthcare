const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedBy: { type: String, enum: ['patient', 'admin', 'lab'], required: true },
  uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportType: {
    type: String,
    enum: ['blood_test', 'ecg', 'xray', 'mri', 'urine', 'ct_scan', 'other'],
    default: 'other'
  },
  labName: { type: String },
  testDate: { type: Date },
  patientNote: { type: String },
  fileName: { type: String },
  fileId: { type: mongoose.Schema.Types.ObjectId },
  fileUrl: { type: String },
  mimeType: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'Reviewed', 'Flagged'],
    default: 'Pending'
  },
  doctorComment: { type: String },
  severity: { type: String, default: null },
  reviewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Step 7: Database index for legacy patient report queries
ReportSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);
