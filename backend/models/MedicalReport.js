const mongoose = require('mongoose');

const StructuredResultSchema = new mongoose.Schema({
  parameter: { type: String, required: true },
  value: { type: String, required: true },
  unit: { type: String, default: '' },
  referenceRange: { type: String, default: '' },
  status: {
    type: String,
    enum: ['Normal', 'Low', 'High', 'Critical'],
    default: 'Normal'
  }
}, { _id: false });

const MedicalReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    unique: true,
    required: true,
    default: () => 'REP-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000)
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hospitalName: {
    type: String,
    default: 'CareLink Central Hospital'
  },
  laboratoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  labName: {
    type: String,
    default: 'CareLink Diagnostic Laboratory'
  },
  testRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestRequest'
  },
  sampleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sample'
  },
  category: {
    type: String,
    enum: ['Laboratory', 'Radiology', 'Cardiology', 'Neurology', 'Pathology', 'Diagnostic', 'Clinical'],
    required: true,
    default: 'Laboratory'
  },
  reportType: {
    type: String,
    required: true,
    trim: true
  },
  fileName: {
    type: String
  },
  originalFileName: {
    type: String
  },
  fileFormat: {
    type: String,
    uppercase: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  fileUrl: {
    type: String
  },
  mimeType: {
    type: String
  },
  testDate: {
    type: Date,
    default: Date.now
  },
  reportDate: {
    type: Date,
    default: Date.now
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: String,
    enum: ['lab', 'patient', 'admin', 'doctor'],
    required: true,
    default: 'lab'
  },
  uploaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportStatus: {
    type: String,
    enum: ['Pending', 'Uploaded', 'Verified', 'Published', 'Archived'],
    default: 'Uploaded'
  },
  criticalStatus: {
    type: String,
    enum: ['Normal', 'Abnormal', 'Critical'],
    default: 'Normal'
  },
  structuredResults: [StructuredResultSchema],
  aiAnalysis: {
    summary: { type: String },
    abnormalFindings: [{ type: String }],
    trendNotes: { type: String },
    disclaimer: {
      type: String,
      default: 'AI-generated information for clinical review. Doctors remain responsible for medical decisions.'
    },
    generatedAt: { type: Date }
  },
  patientNote: {
    type: String
  },
  doctorComment: {
    type: String
  },
  reviewedAt: {
    type: Date
  },
  extractedText: {
    type: String,
    select: false // Avoid sending raw text to frontend by default
  },
  documentClassification: {
    type: String,
    enum: ['CBC', 'Blood Test', 'Prescription', 'Discharge Summary', 'Diagnostic Report', 'Insurance Document', 'Unknown'],
    default: 'Unknown'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

MedicalReportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Step 7: Database indexes for frequently queried report workflows
MedicalReportSchema.index({ patientId: 1, testDate: -1 });
MedicalReportSchema.index({ doctorId: 1, testDate: -1 });
MedicalReportSchema.index({ category: 1, reportStatus: 1, testDate: -1 });
MedicalReportSchema.index({ criticalStatus: 1, testDate: -1 });
MedicalReportSchema.index({ testRequestId: 1 });

module.exports = mongoose.model('MedicalReport', MedicalReportSchema);
