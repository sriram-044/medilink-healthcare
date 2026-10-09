const mongoose = require('mongoose');

const SampleSchema = new mongoose.Schema({
  sampleId: {
    type: String,
    unique: true,
    required: true,
    default: () => 'SMP-' + Math.floor(100000 + Math.random() * 900000)
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  testRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestRequest'
  },
  sampleType: {
    type: String,
    enum: ['Blood', 'Urine', 'Saliva', 'Tissue', 'Other'],
    required: true,
    default: 'Blood'
  },
  collectionDate: {
    type: Date,
    default: Date.now
  },
  collectedBy: {
    type: String,
    default: 'Lab Technician'
  },
  status: {
    type: String,
    enum: ['Requested', 'Collected', 'Received', 'Processing', 'Completed', 'Rejected'],
    default: 'Requested'
  },
  barcode: {
    type: String
  },
  rejectionReason: {
    type: String
  },
  notes: {
    type: String
  },
  storageLocation: {
    type: String,
    default: 'Rack A-1, Lab Refrigerator 4°C'
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

SampleSchema.pre('save', function(next) {
  if (!this.barcode) {
    this.barcode = `BAR-${this.sampleId || Math.floor(100000 + Math.random() * 900000)}`;
  }
  this.updatedAt = new Date();
  next();
});

// Step 7: Database indexes for frequently queried sample workflows
SampleSchema.index({ testRequestId: 1 });
SampleSchema.index({ patientId: 1, collectionDate: -1 });
SampleSchema.index({ status: 1, sampleType: 1, collectionDate: -1 });
SampleSchema.index({ barcode: 1 }, { sparse: true });

module.exports = mongoose.model('Sample', SampleSchema);
