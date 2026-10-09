const mongoose = require('mongoose');

const EmergencyTimelineEventSchema = new mongoose.Schema({
  event: {
    type: String,
    enum: [
      'SOS_TRIGGERED',
      'SOS_CANCELLED',
      'LOCATION_UPDATED',
      'CONTACT_NOTIFIED',
      'DOCTOR_NOTIFIED',
      'HOSPITAL_NOTIFIED',
      'CASE_ACKNOWLEDGED',
      'TEAM_ASSIGNED',
      'TEAM_EN_ROUTE',
      'TEAM_ARRIVED',
      'UNDER_CARE',
      'CASE_RESOLVED',
      'NOTE_ADDED',
      'COMMUNICATION_DISPATCH'
    ],
    required: true
  },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: 'System' },
  performedByRole: { type: String, default: 'system' },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { _id: true });

const AlertSentSchema = new mongoose.Schema({
  recipientType: {
    type: String,
    enum: ['Emergency Contact', 'Doctor', 'Hospital', 'Emergency Team'],
    required: true
  },
  recipientName: { type: String },
  recipientContact: { type: String },
  channel: {
    type: String,
    enum: ['IN_APP', 'SMS_PREVIEW', 'SYSTEM_DISPATCH', 'EMAIL'],
    default: 'IN_APP'
  },
  status: {
    type: String,
    enum: ['SENT', 'DELIVERED', 'FAILED'],
    default: 'SENT'
  },
  sentAt: { type: Date, default: Date.now }
}, { _id: false });

const EmergencyCaseSchema = new mongoose.Schema({
  emergencyId: {
    type: String,
    required: true,
    unique: true,
    default: () => `EMG-${Math.floor(1000 + Math.random() * 9000)}`
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientName: {
    type: String,
    required: true
  },
  emergencyType: {
    type: String,
    enum: [
      'MANUAL_SOS',
      'HEALTH_WARNING',
      'POSSIBLE_HEALTH_EMERGENCY',
      'FALL_ALERT',
      'FAMILY_ASSISTANCE_REQUEST',
      'CRITICAL_VITALS',
      'AUTOMATIC_DETECTION',
      'LAB_ANOMALY'
    ],
    default: 'MANUAL_SOS',
    required: true
  },
  triggerSource: {
    type: String,
    enum: ['MANUAL_BUTTON', 'AUTOMATIC_DETECTION'],
    default: 'MANUAL_BUTTON'
  },
  patientProfile: {
    age: { type: Number, default: null },
    gender: { type: String, default: null },
    bloodGroup: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
    caregiverPhone: { type: String, default: null }
  },
  medicalInfo: {
    bloodGroup: { type: String, default: null },
    allergies: [{ type: String }],
    allergiesDetail: [{
      name: { type: String },
      severity: { type: String },
      reaction: { type: String }
    }],
    medicalConditions: [{ type: String }],
    medicalConditionsDetail: [{
      condition: { type: String },
      diagnosedYear: { type: String },
      status: { type: String }
    }],
    medicalHistory: [{ type: String }],
    currentMedications: [{ type: String }]
  },
  detectionDetails: {
    source: { type: String, default: null },
    reasons: [{ type: String }],
    confidenceScore: { type: Number, default: null },
    sensorData: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  status: {
    type: String,
    enum: [
      'ACTIVE',
      'ACKNOWLEDGED',
      'TEAM_ASSIGNED',
      'EN_ROUTE',
      'ARRIVED',
      'UNDER_CARE',
      'RESOLVED',
      'CANCELLED'
    ],
    default: 'ACTIVE'
  },
  priority: {
    type: String,
    enum: ['Normal', 'Warning', 'High Priority', 'Critical'],
    default: 'Critical'
  },
  triggeredAt: {
    type: Date,
    default: Date.now
  },
  location: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    timestamp: { type: Date, default: null },
    address: { type: String, default: null },
    isAvailable: { type: Boolean, default: false }
  },
  emergencyContacts: [{
    name: { type: String, required: true },
    relationship: { type: String, default: 'Family' },
    phone: { type: String, required: true },
    email: { type: String },
    priority: { type: String, enum: ['Primary', 'Secondary', 'Other'], default: 'Secondary' },
    notified: { type: Boolean, default: false },
    notifiedAt: { type: Date }
  }],
  assignedDoctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedHospital: {
    type: String,
    default: 'MediLink Central Trauma & Emergency Center'
  },
  assignedEmergencyTeam: {
    teamId: { type: String, default: null },
    teamName: { type: String, default: null },
    leadResponder: { type: String, default: null },
    contactPhone: { type: String, default: null },
    vehicleType: { type: String, default: null },
    assignedAt: { type: Date, default: null }
  },
  recentHealthData: {
    heartRate: Number,
    spo2: Number,
    temperature: Number,
    systolicBP: Number,
    diastolicBP: Number,
    glucoseLevel: Number,
    aiScore: Number,
    source: { type: String, default: 'wearable' }
  },
  timeline: [EmergencyTimelineEventSchema],
  alertsSent: [AlertSentSchema],
  notes: [{
    text: { type: String, required: true },
    author: { type: String, required: true },
    authorRole: { type: String, default: 'emergency' },
    createdAt: { type: Date, default: Date.now }
  }],
  cancellationReason: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Generate human-readable emergency ID if not provided (e.g. EMG-8492)
EmergencyCaseSchema.pre('validate', function (next) {
  if (!this.emergencyId) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    this.emergencyId = `EMG-${randomNum}`;
  }
  next();
});

// Step 7: Database indexes for frequently queried emergency workflows
EmergencyCaseSchema.index({ patientId: 1, triggeredAt: -1 });
EmergencyCaseSchema.index({ status: 1, triggeredAt: -1 });
EmergencyCaseSchema.index({ assignedDoctor: 1, triggeredAt: -1 });
EmergencyCaseSchema.index({ triggeredAt: -1 });

module.exports = mongoose.model('EmergencyCase', EmergencyCaseSchema);
