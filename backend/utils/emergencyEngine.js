/**
 * MediLink AI / CareLink — Emergency Decision Engine
 * Coordinates real-time alerts across Caregiver, Family, Doctor, Hospital, and Emergency Teams.
 * Powered by unified EmergencySosService.
 */

'use strict';

const emergencySosService = require('./emergencySosService');

/**
 * Triggers emergency workflow when AI score >= 70 or fall detected or SOS triggered.
 * Maintains 100% backward-compatible signature.
 */
const triggerEmergencyWorkflow = async ({
  patient,
  doctorId = null,
  type = 'MANUAL_SOS', // 'MANUAL_SOS', 'HEALTH_WARNING', 'POSSIBLE_HEALTH_EMERGENCY', 'FALL_ALERT', 'FAMILY_ASSISTANCE_REQUEST' or legacy 'Critical' / 'SOS'
  score = 80,
  vitals = {},
  reasons = [],
  fallDetected = false,
  location = null, // object { latitude, longitude, accuracy, timestamp, address } or string
  performedBy = null
}) => {
  // Standardize emergency type mapping
  let standardType = type;
  if (type === 'SOS') standardType = 'MANUAL_SOS';
  if (type === 'Critical') {
    standardType = fallDetected ? 'FALL_ALERT' : 'POSSIBLE_HEALTH_EMERGENCY';
  }

  const triggerSource = standardType === 'MANUAL_SOS' ? 'MANUAL_BUTTON' : 'AUTOMATIC_DETECTION';

  // Determine priority
  let priority = 'Critical';
  if (standardType === 'HEALTH_WARNING') priority = 'Warning';
  else if (standardType === 'FAMILY_ASSISTANCE_REQUEST') priority = 'High Priority';

  return emergencySosService.processEmergency({
    triggerSource,
    emergencyType: standardType,
    patientId: patient,
    doctorId: doctorId || patient?.assignedDoctor || null,
    location,
    vitals,
    reasons: reasons && reasons.length ? reasons : [standardType === 'MANUAL_SOS' ? 'Patient activated manual SOS' : 'Automated health telemetry alert'],
    fallDetected: Boolean(fallDetected),
    score,
    priority,
    performedBy: performedBy || patient?._id || null,
    detectionDetails: {
      source: triggerSource === 'MANUAL_BUTTON' ? 'manual_button' : 'wearable',
      reasons: reasons || [],
      confidenceScore: score
    }
  });
};

module.exports = {
  triggerEmergencyWorkflow,
  emergencySosService
};
