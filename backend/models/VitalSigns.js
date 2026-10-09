const mongoose = require('mongoose');

const VitalSignsSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  heartRate: { type: Number, required: true },
  spo2: { type: Number, required: true },
  temperature: { type: Number, required: true },
  systolicBP: { type: Number },
  diastolicBP: { type: Number },
  stepCount: { type: Number, default: 0 },
  weight: { type: Number },
  glucoseLevel: { type: Number },
  fallDetected: { type: Boolean, default: false },
  source: { type: String, enum: ['wearable', 'manual', 'iot_device'], default: 'wearable' },
  location: { type: String, default: 'Home' },
  aiScore: { type: Number, default: 0 },
  aiStatus: { type: String, enum: ['Normal', 'Risk', 'Critical'], default: 'Normal' },
  aiReasons: [{ type: String }],
  aiRecommendation: { type: String },
  recordedAt: { type: Date, default: Date.now }
});

// Step 7: Database index for latest vitals and chronological stream queries
VitalSignsSchema.index({ patientId: 1, recordedAt: -1 });

module.exports = mongoose.model('VitalSigns', VitalSignsSchema);
