const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  role: {
    type: String, // 'patient', 'doctor', 'lab', 'hospital', 'admin'
  },
  type: {
    type: String,
    enum: [
      'report_published', 'critical_alert', 'test_requested', 'sample_collected', 'sample_status', 'general',
      'emergency_sos', 'emergency_alert', 'emergency_update', 'emergency_cancel', 'emergency_assigned'
    ],
    default: 'general'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  link: {
    type: String
  },
  reportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalReport'
  },
  testRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestRequest'
  },
  emergencyCaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmergencyCase'
  },
  severity: {
    type: String,
    enum: ['Normal', 'Warning', 'Critical'],
    default: 'Normal'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Step 7: Database indexes for notification delivery and recipient isolation
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });
NotificationSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
