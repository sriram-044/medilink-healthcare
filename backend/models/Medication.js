const mongoose = require('mongoose');

const MedicationSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  instructions: { type: String },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  takenToday: { type: Boolean, default: false },
  takenDates: [{ type: Date }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const DietPlanSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  plan: { type: String, required: true },
  calories: { type: Number },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Step 7: Database indexes for medication and diet plans
MedicationSchema.index({ patientId: 1, isActive: 1, createdAt: -1 });
MedicationSchema.index({ doctorId: 1, createdAt: -1 });

DietPlanSchema.index({ patientId: 1, createdAt: -1 });

const Medication = mongoose.model('Medication', MedicationSchema);
const DietPlan = mongoose.model('DietPlan', DietPlanSchema);

module.exports = { Medication, DietPlan };
