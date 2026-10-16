const criticalDetection = require('../../utils/criticalDetection');

module.exports = {
  criticalDetection,
  generateSimulatedReading: (base = {}) => ({
    heartRate: base.heartRate || 75,
    bloodPressure: base.bloodPressure || '120/80',
    spo2: base.spo2 || 98,
    temperature: base.temperature || 98.6,
    recordedAt: new Date()
  })
};
