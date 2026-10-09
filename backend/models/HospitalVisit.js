const mongoose = require('mongoose');

const HospitalVisitSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalName: { type: String, required: true, trim: true },
  visitDate: { type: Date, required: true, default: Date.now },
  visitType: {
    type: String,
    enum: ['Emergency Admission', 'Outpatient Consult', 'Surgery', 'Routine Checkup'],
    default: 'Outpatient Consult'
  },
  doctorName: { type: String, trim: true },
  reason: { type: String, required: true },
  diagnosis: { type: String },
  dischargeSummary: { type: String },
  status: {
    type: String,
    enum: ['Discharged', 'Admitted', 'Completed'],
    default: 'Completed'
  },
  createdAt: { type: Date, default: Date.now }
});

// Step 7: Database index for patient hospital visit history
HospitalVisitSchema.index({ patientId: 1, visitDate: -1 });

module.exports = mongoose.model('HospitalVisit', HospitalVisitSchema);
