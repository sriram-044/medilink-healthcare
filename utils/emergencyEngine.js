/**
 * MediLink AI — Emergency Decision Engine
 * Coordinates real-time alerts across Caregiver, Family, Doctor, Hospital, and Emergency Teams.
 * Adheres to prototype non-diagnostic safety guidelines.
 */

const Alert = require('../models/Alert');
const EmergencyCase = require('../models/EmergencyCase');
const notificationService = require('./notificationService');
const emergencyCommunicationService = require('./emergencyCommunicationService');


/**
 * Triggers emergency workflow when AI score >= 70 or fall detected or SOS triggered
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
  try {
    // Standardize emergency type mapping
    let standardType = type;
    if (type === 'SOS') standardType = 'MANUAL_SOS';
    if (type === 'Critical') {
      standardType = fallDetected ? 'FALL_ALERT' : 'POSSIBLE_HEALTH_EMERGENCY';
    }

    // Standardize location object
    let locationObj = {
      latitude: null,
      longitude: null,
      accuracy: null,
      timestamp: new Date(),
      address: null,
      isAvailable: false
    };

    if (location && typeof location === 'object') {
      locationObj = {
        latitude: location.latitude || null,
        longitude: location.longitude || null,
        accuracy: location.accuracy || null,
        timestamp: location.timestamp || new Date(),
        address: location.address || (location.latitude ? `GPS: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : null),
        isAvailable: Boolean(location.latitude && location.longitude)
      };
    } else if (typeof location === 'string') {
      locationObj.address = location;
      locationObj.isAvailable = true;
    } else if (patient.roomLocation) {
      locationObj.address = patient.roomLocation;
      locationObj.isAvailable = true;
    }

    // Determine priority
    let priority = 'Critical';
    if (standardType === 'HEALTH_WARNING') priority = 'Warning';
    if (standardType === 'FAMILY_ASSISTANCE_REQUEST') priority = 'High Priority';

    // Formulate non-diagnostic safety messages
    let alertMessage = '';
    let timelineInitialMessage = '';
    if (standardType === 'MANUAL_SOS') {
      alertMessage = `🚨 EMERGENCY SOS triggered by ${patient.name}. Location: ${locationObj.address || (locationObj.isAvailable ? 'GPS Shared' : 'Unavailable')}`;
      timelineInitialMessage = `Patient activated manual SOS alert.`;
    } else if (standardType === 'FALL_ALERT' || fallDetected) {
      alertMessage = `🚨 Possible Fall & Critical Vitals detected for ${patient.name}. Health Index: ${score}/100`;
      timelineInitialMessage = `Possible fall event detected by wearable sensor.`;
      if (!reasons.includes('Wearable impact sensor trigger')) {
        reasons.unshift('Wearable impact sensor trigger');
      }
    } else {
      alertMessage = `🚨 Possible health emergency detected for ${patient.name}. Health Index: ${score}/100`;
      timelineInitialMessage = `Unusual health readings detected requiring escalation.`;
    }

    // Populate emergency contacts from patient model
    let contactsList = [];
    if (patient.emergencyContacts && patient.emergencyContacts.length > 0) {
      contactsList = patient.emergencyContacts.map(c => ({
        name: c.name,
        relationship: c.relationship || 'Family',
        phone: c.phone,
        email: c.email || '',
        priority: c.priority || (c.isPrimary ? 'Primary' : 'Secondary'),
        notified: false
      }));
    } else if (patient.emergencyContact) {
      contactsList.push({
        name: 'Family Contact',
        relationship: 'Family',
        phone: patient.emergencyContact,
        priority: 'Primary',
        notified: false
      });
    }

    if (patient.caregiverPhone) {
      contactsList.push({
        name: 'Assigned Caregiver',
        relationship: 'Caregiver',
        phone: patient.caregiverPhone,
        priority: 'Primary',
        notified: false
      });
    }

    // 1. Check for existing ACTIVE emergency case to prevent spam duplicates
    let emergencyCase = await EmergencyCase.findOne({
      patientId: patient._id,
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] }
    });

    if (!emergencyCase) {
      // Create new EmergencyCase
      emergencyCase = new EmergencyCase({
        patientId: patient._id,
        patientName: patient.name,
        emergencyType: standardType,
        status: 'ACTIVE',
        priority,
        triggeredAt: new Date(),
        location: locationObj,
        emergencyContacts: contactsList,
        assignedDoctor: doctorId || patient.assignedDoctor,
        assignedHospital: 'MediLink Central Trauma & Emergency Center',
        recentHealthData: {
          heartRate: vitals.heartRate || null,
          spo2: vitals.spo2 || null,
          temperature: vitals.temperature || null,
          systolicBP: vitals.systolicBP || null,
          diastolicBP: vitals.diastolicBP || null,
          glucoseLevel: vitals.glucoseLevel || null,
          aiScore: score,
          source: vitals.source || 'wearable'
        },
        timeline: [{
          event: 'SOS_TRIGGERED',
          message: timelineInitialMessage,
          timestamp: new Date(),
          performedBy: performedBy || patient._id,
          performedByName: patient.name,
          performedByRole: 'patient'
        }]
      });

      // Broadcast multi-party notifications and record in timeline
      await notificationService.broadcastEmergencyAlert(emergencyCase);
      await emergencyCase.save();
      
      const commResult = await emergencyCommunicationService.dispatchSOS(patient, emergencyCase, contactsList);
      emergencyCase.timeline.push({
        event: 'COMMUNICATION_DISPATCH',
        message: `External SOS communication ${commResult.success ? 'initiated' : 'failed'} to ${commResult.targetPhone || 'None'}. [Mocked: ${commResult.mocked}]`,
        timestamp: new Date(),
        performedBy: patient._id,
        performedByName: 'System Bot',
        performedByRole: 'system'
      });
      await emergencyCase.save();
    } else {
      // Append update event to existing case
      emergencyCase.timeline.push({
        event: 'SOS_TRIGGERED',
        message: `Repeated SOS signal received: ${timelineInitialMessage}`,
        timestamp: new Date(),
        performedBy: performedBy || patient._id,
        performedByName: patient.name,
        performedByRole: 'patient'
      });
      await emergencyCase.save();
    }

    // 2. Create or link backwards-compatible Alert document
    const notifiedEntities = ['Caregiver', 'Doctor', 'Hospital'];
    if (contactsList.length > 0) notifiedEntities.push('Family');

    const alertDoc = new Alert({
      patientId: patient._id,
      doctorId: doctorId || patient.assignedDoctor,
      type: standardType === 'MANUAL_SOS' ? 'SOS' : 'Critical',
      message: alertMessage,
      score,
      vitals,
      fallDetected: Boolean(fallDetected),
      location: locationObj.address || (locationObj.isAvailable ? `Lat: ${locationObj.latitude}, Lng: ${locationObj.longitude}` : 'Home'),
      notifiedEntities,
      emergencyStatus: 'Pending',
      reasons,
      emergencyCaseId: emergencyCase._id
    });
    await alertDoc.save();

    console.log(`
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    🚨 [MEDILINK AI EMERGENCY SYSTEM DISPATCH]
    Emergency ID   : ${emergencyCase.emergencyId}
    Patient        : ${patient.name} (Age: ${patient.age || 'N/A'})
    Type           : ${standardType}
    Priority       : ${priority}
    Location       : ${locationObj.address || (locationObj.isAvailable ? 'GPS Shared' : 'Unavailable')}
    Notified List  : ${notifiedEntities.join(' ➔ ')}
    Hospital Status: 🏥 Central Trauma Emergency Incident Logged
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

    return {
      alert: alertDoc,
      emergencyCase
    };
  } catch (err) {
    console.error('[EMERGENCY DECISION ENGINE ERROR]', err.message);
    throw err;
  }
};

module.exports = { triggerEmergencyWorkflow };
