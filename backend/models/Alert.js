const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['Critical', 'Risk', 'SOS'], required: true },
  message: { type: String, required: true },
  score: { type: Number },
  vitals: {
    heartRate: Number,
    spo2: Number,
    temperature: Number,
    systolicBP: Number,
    diastolicBP: Number
  },
  fallDetected: { type: Boolean, default: false },
  location: { type: String, default: 'Home' },
  notifiedEntities: [{ type: String }], // e.g. ['Caregiver', 'Family', 'Doctor', 'Hospital']
  emergencyStatus: { type: String, enum: ['Pending', 'Acknowledged', 'Dispatched', 'Resolved'], default: 'Pending' },
  reasons: [{ type: String }],
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  emergencyCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyCase' },
  createdAt: { type: Date, default: Date.now }
});

// Step 7: Database indexes for clinical and emergency alert monitoring
AlertSchema.index({ patientId: 1, createdAt: -1 });
AlertSchema.index({ doctorId: 1, resolved: 1, createdAt: -1 });
AlertSchema.index({ type: 1, resolved: 1 });

module.exports = mongoose.model('Alert', AlertSchema);
