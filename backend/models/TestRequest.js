const mongoose = require('mongoose');

const TestRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    required: true,
    default: () => 'REQ-' + Math.floor(100000 + Math.random() * 900000)
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
  assignedLabStaff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  testName: {
    type: String,
    required: true,
    trim: true
  },
  testCategory: {
    type: String,
    enum: ['Laboratory', 'Radiology', 'Cardiology', 'Neurology', 'Pathology', 'Diagnostic', 'Clinical'],
    default: 'Laboratory'
  },
  requestDate: {
    type: Date,
    default: Date.now
  },
  priority: {
    type: String,
    enum: ['Normal', 'Urgent', 'Critical'],
    default: 'Normal'
  },
  status: {
    type: String,
    enum: ['Pending', 'Sample Collected', 'Processing', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  clinicalNotes: {
    type: String,
    trim: true
  },
  sampleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sample'
  },
  reportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalReport'
  },
  completedAt: {
    type: Date
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

TestRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Step 7: Database indexes for frequently queried lab test workflows
TestRequestSchema.index({ patientId: 1, requestDate: -1 });
TestRequestSchema.index({ doctorId: 1, requestDate: -1 });
TestRequestSchema.index({ status: 1, priority: 1, requestDate: -1 });
TestRequestSchema.index({ assignedLabStaff: 1, status: 1 });

module.exports = mongoose.model('TestRequest', TestRequestSchema);
