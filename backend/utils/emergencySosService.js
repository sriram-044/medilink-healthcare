/**
 * ==============================================================================
 * CARELINK HEALTHCARE PLATFORM — EMERGENCY SOS SERVICE
 * ==============================================================================
 * Architecture:
 * 
 *                     CARELINK
 *                        │
 *         ┌──────────────┴──────────────┐
 *         │                             │
 *    👤 USER DATA                  🚨 EMERGENCY SOS
 *      MODULE                         MODULE
 *         │                             │
 *         │                     ┌───────┴────────┐
 *         │                     │                │
 *    Patient Profile       Manual SOS       Automatic SOS
 *    Medical Info          Button            Detection
 *    Emergency Contacts        │                │
 *    Location                  └───────┬────────┘
 *                                      ↓
 *                               Emergency Engine
 *                                      ↓
 *                     ┌────────────────┼────────────────┐
 *                     ↓                ↓                ↓
 *                  Doctor           Family          Hospital
 *                  Alert            Alert            Alert
 *                     │                │                │
 *                     └────────────────┼────────────────┘
 *                                      ↓
 *                               Emergency Case
 *                                 + Incident Log
 * ==============================================================================
 */

'use strict';

const mongoose = require('mongoose');
const EmergencyCase = require('../models/EmergencyCase');
const Alert = require('../models/Alert');
const User = require('../models/User');
const { Medication } = require('../models/Medication');
const VitalSigns = require('../models/VitalSigns');
const Notification = require('../models/Notification');
const notificationService = require('./notificationService');
const emergencyCommunicationService = require('./emergencyCommunicationService');
const { sendToUser, broadcastToRole } = require('./socket');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 👤 USER DATA MODULE
// ═══════════════════════════════════════════════════════════════════════════════

class UserDataModule {
  /**
   * Helper to safely resolve a User instance from document, object, or ID
   */
  async resolveUser(patientIdOrUser) {
    if (!patientIdOrUser) return null;
    if (typeof patientIdOrUser === 'object' && patientIdOrUser.name) {
      return patientIdOrUser;
    }
    const id = patientIdOrUser._id || patientIdOrUser;
    return User.findById(id);
  }

  /**
   * Fetch and format basic Patient Profile for emergency responders
   */
  async getPatientProfile(patientIdOrUser) {
    const user = await this.resolveUser(patientIdOrUser);
    if (!user) return null;

    return {
      id: user._id,
      name: user.name,
      age: user.age || null,
      gender: user.gender || null,
      bloodGroup: user.bloodGroup || 'Unknown',
      phone: user.phone || 'Unavailable',
      address: user.address || user.roomLocation || 'Home',
      roomLocation: user.roomLocation || 'Home',
      caregiverPhone: user.caregiverPhone || null,
      assignedDoctor: user.assignedDoctor || null,
      assignedHospital: 'MediLink Central Trauma & Emergency Center'
    };
  }

  /**
   * Fetch clinical medical information: allergies, pre-existing conditions,
   * medical history, and active medications (critical to prevent contraindicated meds)
   */
  async getMedicalInfo(patientIdOrUser) {
    const user = await this.resolveUser(patientIdOrUser);

    if (!user) {
      return {
        bloodGroup: 'Unknown',
        allergies: [],
        allergiesDetail: [],
        medicalConditions: [],
        medicalConditionsDetail: [],
        medicalHistory: [],
        currentMedications: []
      };
    }

    // Retrieve active medications if available
    let currentMedications = [];
    try {
      const activeMeds = await Medication.find({ patientId: user._id, isActive: true }).select('name dosage frequency');
      currentMedications = activeMeds.map(m => `${m.name} (${m.dosage}, ${m.frequency})`);
    } catch {
      currentMedications = [];
    }

    const allergiesDetail = Array.isArray(user.allergiesDetail) ? user.allergiesDetail.map(a => ({
      name: a.name,
      severity: a.severity || 'Moderate',
      reaction: a.reaction || 'Unspecified'
    })) : [];

    const medicalConditionsDetail = Array.isArray(user.medicalConditionsDetail) ? user.medicalConditionsDetail.map(c => ({
      condition: c.condition,
      diagnosedYear: c.diagnosedYear || '',
      status: c.status || 'Active'
    })) : [];

    return {
      bloodGroup: user.bloodGroup || 'Unknown',
      allergies: user.allergies || allergiesDetail.map(a => a.name),
      allergiesDetail,
      medicalConditions: medicalConditionsDetail.map(c => c.condition),
      medicalConditionsDetail,
      medicalHistory: user.medicalHistory || [],
      currentMedications
    };
  }

  /**
   * Fetch patient emergency contacts, ensuring proper ordering & fallback
   */
  async getEmergencyContacts(patientIdOrUser) {
    const user = await this.resolveUser(patientIdOrUser);
    if (!user) return [];

    const contactsList = [];

    // 1. Structured emergency contacts list
    if (Array.isArray(user.emergencyContacts) && user.emergencyContacts.length > 0) {
      user.emergencyContacts.forEach(c => {
        contactsList.push({
          name: c.name,
          relationship: c.relationship || 'Family',
          phone: c.phone,
          email: c.email || '',
          priority: c.isPrimary ? 'Primary' : (c.priority || 'Secondary'),
          isPrimary: Boolean(c.isPrimary || c.priority === 'Primary'),
          notified: false
        });
      });
    } else if (user.emergencyContact) {
      // Legacy string contact
      contactsList.push({
        name: 'Family Contact',
        relationship: 'Family',
        phone: user.emergencyContact,
        priority: 'Primary',
        isPrimary: true,
        notified: false
      });
    }

    // 2. Add Caregiver if present and not already duplicated
    if (user.caregiverPhone && !contactsList.some(c => c.phone === user.caregiverPhone)) {
      contactsList.push({
        name: 'Designated Caregiver',
        relationship: 'Caregiver',
        phone: user.caregiverPhone,
        priority: 'Primary',
        isPrimary: false,
        notified: false
      });
    }

    return contactsList;
  }

  /**
   * Resolve GPS / static patient location with graceful fallback
   */
  resolveLocation(patientIdOrUser, rawLocation = null) {
    let locationObj = {
      latitude: null,
      longitude: null,
      accuracy: null,
      timestamp: new Date(),
      address: null,
      mapsUrl: null,
      isAvailable: false
    };

    if (rawLocation && typeof rawLocation === 'object') {
      const lat = rawLocation.latitude ? Number(rawLocation.latitude) : null;
      const lng = rawLocation.longitude ? Number(rawLocation.longitude) : null;
      const isGps = Boolean(lat && lng);

      locationObj = {
        latitude: lat,
        longitude: lng,
        accuracy: rawLocation.accuracy || null,
        timestamp: rawLocation.timestamp ? new Date(rawLocation.timestamp) : new Date(),
        address: rawLocation.address || (isGps ? `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : null),
        mapsUrl: isGps ? `https://maps.google.com/?q=${lat},${lng}` : null,
        isAvailable: isGps || Boolean(rawLocation.address)
      };
    } else if (typeof rawLocation === 'string' && rawLocation.trim()) {
      locationObj.address = rawLocation.trim();
      locationObj.isAvailable = true;
    }

    // If still no address, fall back to patient roomLocation / address
    if (!locationObj.address && patientIdOrUser) {
      const room = patientIdOrUser.roomLocation || patientIdOrUser.address;
      if (room) {
        locationObj.address = room;
        locationObj.isAvailable = true;
      }
    }

    return locationObj;
  }

  /**
   * Aggregate all 4 User Data components into an emergency dispatch payload
   */
  async aggregateUserData(patientIdOrUser, rawLocation = null) {
    const user = await this.resolveUser(patientIdOrUser);
    if (!user) throw new Error('Patient profile not found in User Data Module');

    const [patientProfile, medicalInfo, emergencyContacts] = await Promise.all([
      this.getPatientProfile(user),
      this.getMedicalInfo(user),
      this.getEmergencyContacts(user)
    ]);

    const location = this.resolveLocation(user, rawLocation);

    return {
      user,
      patientProfile,
      medicalInfo,
      emergencyContacts,
      location
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 🚨 EMERGENCY SOS MODULE (Dual Triggers: Manual Button & Automatic Detection)
// ═══════════════════════════════════════════════════════════════════════════════

class EmergencySosModule {
  constructor(userDataModule, emergencyEngine) {
    this.userDataModule = userDataModule;
    this.emergencyEngine = emergencyEngine;
  }

  /**
   * MANUAL SOS BUTTON: Explicitly initiated by the patient
   */
  async triggerManualSOS({
    patientId,
    doctorId = null,
    location = null,
    reason = 'Patient pressed SOS button',
    vitals = {},
    performedBy = null
  }) {
    return this.emergencyEngine.processEmergency({
      triggerSource: 'MANUAL_BUTTON',
      emergencyType: 'MANUAL_SOS',
      patientId,
      doctorId,
      location,
      vitals,
      reasons: [reason],
      fallDetected: false,
      score: 100,
      priority: 'Critical',
      performedBy: performedBy || patientId,
      detectionDetails: {
        source: 'manual_button',
        reasons: [reason],
        confidenceScore: 100
      }
    });
  }

  /**
   * AUTOMATIC SOS DETECTION: Triggered automatically by sensors, wearables,
   * vital telemetry, critical lab results, or AI analysis algorithms
   */
  async triggerAutomaticSOS({
    patientId,
    doctorId = null,
    detectionSource = 'wearable', // 'wearable', 'vital_monitor', 'fall_sensor', 'lab_critical', 'ai_triage'
    vitals = {},
    fallDetected = false,
    score = 80,
    reasons = [],
    location = null,
    sensorData = null
  }) {
    // 1. Determine emergency classification
    let emergencyType = 'AUTOMATIC_DETECTION';
    if (fallDetected) {
      emergencyType = 'FALL_ALERT';
      if (!reasons.includes('Wearable impact sensor trigger (Fall detected)')) {
        reasons.unshift('Wearable impact sensor trigger (Fall detected)');
      }
    } else if (detectionSource === 'lab_critical') {
      emergencyType = 'LAB_ANOMALY';
    } else if (score >= 80) {
      emergencyType = 'CRITICAL_VITALS';
    } else if (score >= 60) {
      emergencyType = 'HEALTH_WARNING';
    } else {
      emergencyType = 'POSSIBLE_HEALTH_EMERGENCY';
    }

    // 2. Determine clinical priority
    let priority = 'Critical';
    if (emergencyType === 'HEALTH_WARNING') priority = 'Warning';
    else if (score < 80 && !fallDetected) priority = 'High Priority';

    return this.emergencyEngine.processEmergency({
      triggerSource: 'AUTOMATIC_DETECTION',
      emergencyType,
      patientId,
      doctorId,
      location,
      vitals,
      reasons,
      fallDetected: Boolean(fallDetected),
      score,
      priority,
      performedBy: null, // automated system
      detectionDetails: {
        source: detectionSource,
        reasons,
        confidenceScore: score,
        sensorData
      }
    });
  }

  /**
   * Evaluates vital sign telemetry against physiological danger thresholds
   */
  evaluateVitalsAnomaly(vitals = {}, sensorData = {}) {
    const reasons = [];
    let priority = 'Normal';
    let score = 0;
    let isAnomaly = false;

    const hr = vitals.heartRate;
    const spo2 = vitals.spo2;
    const sys = vitals.systolicBP;
    const dia = vitals.diastolicBP;
    const glucose = vitals.glucoseLevel;
    const fall = Boolean(vitals.fallDetected || sensorData.fallDetected);

    if (fall) {
      reasons.push('High-G impact pattern detected (Possible fall event)');
      priority = 'Critical';
      score = Math.max(score, 95);
      isAnomaly = true;
    }

    if (hr !== undefined && hr !== null) {
      if (hr < 40) {
        reasons.push(`Severe Bradycardia: Heart rate ${hr} bpm (< 40 bpm)`);
        priority = 'Critical';
        score = Math.max(score, 90);
        isAnomaly = true;
      } else if (hr > 140) {
        reasons.push(`Severe Tachycardia: Heart rate ${hr} bpm (> 140 bpm)`);
        priority = 'Critical';
        score = Math.max(score, 88);
        isAnomaly = true;
      } else if (hr > 115 || hr < 50) {
        reasons.push(`Abnormal pulse: ${hr} bpm`);
        score = Math.max(score, 65);
        if (priority !== 'Critical') priority = 'Warning';
        isAnomaly = true;
      }
    }

    if (spo2 !== undefined && spo2 !== null) {
      if (spo2 < 88) {
        reasons.push(`Critical Hypoxemia: SpO2 ${spo2}% (< 88%)`);
        priority = 'Critical';
        score = Math.max(score, 95);
        isAnomaly = true;
      } else if (spo2 < 92) {
        reasons.push(`Low blood oxygen saturation: ${spo2}% (< 92%)`);
        score = Math.max(score, 75);
        if (priority !== 'Critical') priority = 'High Priority';
        isAnomaly = true;
      }
    }

    if (sys !== undefined && sys !== null) {
      if (sys > 180 || (dia && dia > 120)) {
        reasons.push(`Hypertensive crisis: Blood Pressure ${sys}/${dia || '—'} mmHg`);
        priority = 'Critical';
        score = Math.max(score, 90);
        isAnomaly = true;
      } else if (sys < 80) {
        reasons.push(`Hypotension/Shock risk: Systolic BP ${sys} mmHg (< 80 mmHg)`);
        priority = 'Critical';
        score = Math.max(score, 92);
        isAnomaly = true;
      }
    }

    if (glucose !== undefined && glucose !== null) {
      if (glucose < 50) {
        reasons.push(`Severe Hypoglycemia: Glucose ${glucose} mg/dL (< 50 mg/dL)`);
        priority = 'Critical';
        score = Math.max(score, 90);
        isAnomaly = true;
      } else if (glucose > 350) {
        reasons.push(`Severe Hyperglycemia: Glucose ${glucose} mg/dL (> 350 mg/dL)`);
        priority = 'Critical';
        score = Math.max(score, 85);
        isAnomaly = true;
      }
    }

    return {
      isAnomaly,
      priority,
      score,
      reasons
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ⚙️ EMERGENCY ENGINE (Central Coordinator & 3-Way Alerts)
// ═══════════════════════════════════════════════════════════════════════════════

class EmergencyEngine {
  constructor(userDataModule) {
    this.userDataModule = userDataModule;
  }

  /**
   * DOCTOR ALERT: Dispatches clinical notification & real-time telemetry to assigned physician
   */
  async dispatchDoctorAlert(emergencyCase, userData) {
    try {
      const doctorId = emergencyCase.assignedDoctor;
      if (!doctorId) return null;

      const locationStr = emergencyCase.location?.address || 'Location unavailable';

      const docNotification = new Notification({
        recipientId: doctorId,
        role: 'doctor',
        type: 'emergency_sos',
        title: `🚨 EMERGENCY ALERT: Patient ${emergencyCase.patientName}`,
        message: `Emergency SOS (${emergencyCase.emergencyType}) active for ${emergencyCase.patientName}. ID: ${emergencyCase.emergencyId}. Location: ${locationStr}. Priority: ${emergencyCase.priority}.`,
        link: `/doctor.html#alerts`,
        emergencyCaseId: emergencyCase._id,
        severity: 'Critical'
      });
      await docNotification.save();

      // Real-time WebSocket delivery
      sendToUser(doctorId, 'notification', docNotification.toObject());
      sendToUser(doctorId, 'emergency_alert', {
        caseId: emergencyCase._id,
        emergencyId: emergencyCase.emergencyId,
        patientName: emergencyCase.patientName,
        priority: emergencyCase.priority,
        emergencyType: emergencyCase.emergencyType,
        vitals: emergencyCase.recentHealthData,
        location: emergencyCase.location,
        medicalInfo: emergencyCase.medicalInfo
      });

      console.log(`[DOCTOR ALERT DISPATCHED] ➔ Doctor: ${doctorId} for Case: ${emergencyCase.emergencyId}`);

      return {
        recipientType: 'Doctor',
        recipientName: 'Assigned Doctor',
        recipientContact: doctorId.toString(),
        channel: 'IN_APP',
        status: 'DELIVERED',
        sentAt: new Date()
      };
    } catch (err) {
      console.error('[DOCTOR ALERT ERROR]', err.message);
      return {
        recipientType: 'Doctor',
        recipientName: 'Assigned Doctor',
        recipientContact: emergencyCase.assignedDoctor?.toString() || 'Unknown',
        channel: 'IN_APP',
        status: 'FAILED',
        sentAt: new Date()
      };
    }
  }

  /**
   * FAMILY ALERT: Dispatches multi-channel alerts (SMS preview / Push) to family & caregiver contacts
   */
  async dispatchFamilyAlert(emergencyCase, emergencyContacts) {
    const alertsSent = [];

    if (!emergencyContacts || emergencyContacts.length === 0) {
      return alertsSent;
    }

    for (const contact of emergencyContacts) {
      try {
        const res = await notificationService.sendEmergencyContactNotification(emergencyCase, contact);
        if (res) {
          alertsSent.push(res);
          contact.notified = true;
          contact.notifiedAt = new Date();
        }
      } catch (err) {
        console.error(`[FAMILY ALERT ERROR - ${contact.name}]`, err.message);
      }
    }

    // Call communication service (voice/SMS gateway) for primary contact
    try {
      await emergencyCommunicationService.dispatchSOS(
        { name: emergencyCase.patientName },
        emergencyCase,
        emergencyContacts
      );
    } catch (err) {
      console.warn('[FAMILY COMM GATEWAY WARNING]', err.message);
    }

    return alertsSent;
  }

  /**
   * HOSPITAL ALERT: Dispatches alert to Emergency Command Center & trauma desk
   */
  async dispatchHospitalAlert(emergencyCase, userData) {
    try {
      const hospRes = await notificationService.sendHospitalNotification(emergencyCase);

      // Broadcast CAD incident to all emergency officers and hospital personnel
      broadcastToRole('emergency', 'emergency_case_created', {
        caseId: emergencyCase._id,
        emergencyId: emergencyCase.emergencyId,
        patientName: emergencyCase.patientName,
        priority: emergencyCase.priority,
        emergencyType: emergencyCase.emergencyType,
        location: emergencyCase.location,
        recentHealthData: emergencyCase.recentHealthData
      });

      broadcastToRole('hospital', 'emergency_case_created', {
        caseId: emergencyCase._id,
        emergencyId: emergencyCase.emergencyId,
        patientName: emergencyCase.patientName,
        priority: emergencyCase.priority
      });

      return hospRes;
    } catch (err) {
      console.error('[HOSPITAL ALERT ERROR]', err.message);
      return null;
    }
  }

  /**
   * MAIN ORCHESTRATION PIPELINE: Ingests trigger + User Data, dispatches 3-way alerts,
   * creates/updates Emergency Case and writes initial Incident Log.
   */
  async processEmergency({
    triggerSource = 'MANUAL_BUTTON',
    emergencyType = 'MANUAL_SOS',
    patientId,
    doctorId = null,
    location = null,
    vitals = {},
    reasons = [],
    fallDetected = false,
    score = 80,
    priority = 'Critical',
    performedBy = null,
    detectionDetails = null
  }) {
    try {
      // 1. Ingest full User Data context
      const userData = await this.userDataModule.aggregateUserData(patientId, location);
      const { user, patientProfile, medicalInfo, emergencyContacts, location: resolvedLocation } = userData;

      // 2. Prevent spam duplicates if an active case is already in progress
      let existingCase = await EmergencyCase.findOne({
        patientId: user._id,
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] }
      });

      if (existingCase) {
        existingCase.timeline.push({
          event: 'SOS_TRIGGERED',
          message: `Repeated SOS signal received: ${triggerSource === 'MANUAL_BUTTON' ? 'Patient activated manual SOS alert.' : 'Unusual health readings detected requiring escalation.'}`,
          timestamp: new Date(),
          performedBy: performedBy || user._id,
          performedByName: user.name,
          performedByRole: triggerSource === 'MANUAL_BUTTON' ? 'patient' : 'system',
          metadata: { triggerSource, vitals }
        });
        await existingCase.save();

        console.log(`[EMERGENCY ENGINE] Appended repeat signal to active case ${existingCase.emergencyId}`);
        return {
          emergencyCase: existingCase,
          alert: await Alert.findOne({ emergencyCaseId: existingCase._id }) || {},
          isDuplicate: true,
          message: 'An active emergency case is already in progress.'
        };
      }

      // 3. Formulate safety-compliant alert messages (non-diagnostic)
      let alertMessage = '';
      let initialIncidentMessage = '';

      if (triggerSource === 'MANUAL_BUTTON' || emergencyType === 'MANUAL_SOS') {
        alertMessage = `🚨 EMERGENCY SOS triggered by ${user.name}. Location: ${resolvedLocation.address || (resolvedLocation.isAvailable ? 'GPS Shared' : 'Unavailable')}`;
        initialIncidentMessage = `Patient activated manual SOS alert.`;
      } else if (fallDetected || emergencyType === 'FALL_ALERT') {
        alertMessage = `🚨 Possible Fall & Critical Vitals detected for ${user.name}. Health Index: ${score}/100`;
        initialIncidentMessage = `Possible fall event detected by wearable sensor.`;
      } else {
        alertMessage = `🚨 Possible health emergency detected for ${user.name}. Health Index: ${score}/100`;
        initialIncidentMessage = `Unusual health readings detected requiring escalation.`;
      }

      // 4. Create new Emergency Case document
      const emergencyCase = new EmergencyCase({
        patientId: user._id,
        patientName: user.name,
        emergencyType,
        triggerSource,
        status: 'ACTIVE',
        priority,
        triggeredAt: new Date(),
        location: resolvedLocation,
        patientProfile,
        medicalInfo,
        emergencyContacts,
        assignedDoctor: doctorId || user.assignedDoctor,
        assignedHospital: patientProfile.assignedHospital,
        detectionDetails: detectionDetails || {
          source: triggerSource.toLowerCase(),
          reasons,
          confidenceScore: score
        },
        recentHealthData: {
          heartRate: vitals.heartRate || null,
          spo2: vitals.spo2 || null,
          temperature: vitals.temperature || null,
          systolicBP: vitals.systolicBP || null,
          diastolicBP: vitals.diastolicBP || null,
          glucoseLevel: vitals.glucoseLevel || null,
          aiScore: score,
          source: vitals.source || (triggerSource === 'MANUAL_BUTTON' ? 'manual' : 'wearable')
        },
        timeline: [{
          event: 'SOS_TRIGGERED',
          message: initialIncidentMessage,
          timestamp: new Date(),
          performedBy: performedBy || user._id,
          performedByName: triggerSource === 'MANUAL_BUTTON' ? user.name : 'Automated Detector',
          performedByRole: triggerSource === 'MANUAL_BUTTON' ? 'patient' : 'system',
          metadata: { triggerSource, reasons, score }
        }]
      });

      // 5. CONCURRENT 3-WAY DISPATCH (Doctor, Family, Hospital)
      const [doctorAlertResult, familyAlertResults, hospitalAlertResult] = await Promise.all([
        this.dispatchDoctorAlert(emergencyCase, userData),
        this.dispatchFamilyAlert(emergencyCase, emergencyContacts),
        this.dispatchHospitalAlert(emergencyCase, userData)
      ]);

      // 6. Record alert dispatches in Incident Log (Timeline)
      const allAlertsSent = [];

      if (familyAlertResults && familyAlertResults.length > 0) {
        allAlertsSent.push(...familyAlertResults);
        emergencyCase.timeline.push({
          event: 'CONTACT_NOTIFIED',
          message: `Emergency contacts notified: ${emergencyContacts.map(c => c.name).join(', ')}`,
          timestamp: new Date(),
          performedByName: 'Emergency Engine',
          performedByRole: 'system'
        });
      }

      if (doctorAlertResult) {
        allAlertsSent.push(doctorAlertResult);
        emergencyCase.timeline.push({
          event: 'DOCTOR_NOTIFIED',
          message: `Assigned doctor notified for emergency case ${emergencyCase.emergencyId}`,
          timestamp: new Date(),
          performedByName: 'Emergency Engine',
          performedByRole: 'system'
        });
      }

      if (hospitalAlertResult) {
        allAlertsSent.push(hospitalAlertResult);
        emergencyCase.timeline.push({
          event: 'HOSPITAL_NOTIFIED',
          message: `Hospital Emergency Command Center notified for case ${emergencyCase.emergencyId}`,
          timestamp: new Date(),
          performedByName: 'Emergency Engine',
          performedByRole: 'system'
        });
      }

      emergencyCase.alertsSent = allAlertsSent;
      await emergencyCase.save();

      // 7. Synchronize backwards-compatible Alert document
      const notifiedEntities = ['Caregiver', 'Doctor', 'Hospital'];
      if (emergencyContacts.length > 0) notifiedEntities.push('Family');

      const alertDoc = new Alert({
        patientId: user._id,
        doctorId: doctorId || user.assignedDoctor,
        type: emergencyType === 'MANUAL_SOS' ? 'SOS' : (priority === 'Warning' ? 'Risk' : 'Critical'),
        message: alertMessage,
        score,
        vitals,
        fallDetected: Boolean(fallDetected),
        location: resolvedLocation.address || 'Home',
        notifiedEntities,
        emergencyStatus: 'Pending',
        reasons,
        emergencyCaseId: emergencyCase._id
      });
      await alertDoc.save();

      console.log(`
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      🚨 [CARELINK EMERGENCY ENGINE DISPATCH COMPLETED]
      Incident ID    : ${emergencyCase.emergencyId}
      Patient        : ${user.name} (${patientProfile.bloodGroup}, Age: ${patientProfile.age || '—'})
      Trigger Source : ${triggerSource} (${emergencyType})
      Priority       : ${priority}
      Location       : ${resolvedLocation.address || 'Unavailable'}
      Doctor Alert   : ${doctorAlertResult ? '✅ Dispatched' : '— No Doctor Assigned'}
      Family Alert   : ✅ Dispatched to ${emergencyContacts.length} contacts
      Hospital Alert : ✅ Dispatched to ER Command Desk
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return {
        emergencyCase,
        alert: alertDoc,
        alertsSent: allAlertsSent,
        isDuplicate: false
      };
    } catch (err) {
      console.error('[EMERGENCY ENGINE FATAL ERROR]', err.message);
      throw err;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 📋 EMERGENCY CASE & INCIDENT LOG SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class EmergencyCaseService {
  /**
   * Append an audited timeline event to the incident log
   */
  async logIncidentEvent(caseId, { event, message, performer, metadata = null }) {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase) throw new Error('Emergency case not found');

    const entry = {
      event,
      message,
      timestamp: new Date(),
      performedBy: performer?._id || null,
      performedByName: performer?.name || 'System',
      performedByRole: performer?.role || 'system',
      metadata
    };

    emergencyCase.timeline.push(entry);
    await emergencyCase.save();

    // Broadcast timeline update via WebSocket
    broadcastToRole('emergency', 'case_timeline_update', {
      caseId: emergencyCase._id,
      emergencyId: emergencyCase.emergencyId,
      entry
    });

    return emergencyCase;
  }

  /**
   * Retrieve the complete audit incident log for a case
   */
  async getIncidentLog(caseId) {
    const emergencyCase = await EmergencyCase.findById(caseId).select('emergencyId patientName status triggeredAt timeline');
    if (!emergencyCase) throw new Error('Emergency case not found');
    return emergencyCase.timeline;
  }

  /**
   * Advance case status through the clinical response stepper:
   * ACTIVE -> ACKNOWLEDGED -> TEAM_ASSIGNED -> EN_ROUTE -> ARRIVED -> UNDER_CARE -> RESOLVED
   */
  async updateStatus(caseId, newStatus, performer, notes = null) {
    const validStatuses = ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE', 'RESOLVED', 'CANCELLED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase) throw new Error('Emergency case not found');

    const previousStatus = emergencyCase.status;
    emergencyCase.status = newStatus;

    let eventType = 'NOTE_ADDED';
    if (newStatus === 'ACKNOWLEDGED') eventType = 'CASE_ACKNOWLEDGED';
    else if (newStatus === 'TEAM_ASSIGNED') eventType = 'TEAM_ASSIGNED';
    else if (newStatus === 'EN_ROUTE') eventType = 'TEAM_EN_ROUTE';
    else if (newStatus === 'ARRIVED') eventType = 'TEAM_ARRIVED';
    else if (newStatus === 'UNDER_CARE') eventType = 'UNDER_CARE';
    else if (newStatus === 'RESOLVED') {
      eventType = 'CASE_RESOLVED';
      emergencyCase.resolvedAt = new Date();
      emergencyCase.resolvedBy = performer?._id || null;
    }

    emergencyCase.timeline.push({
      event: eventType,
      message: notes || `Case status advanced from ${previousStatus} to ${newStatus} by ${performer?.name || performer?.role || 'Responder'}.`,
      timestamp: new Date(),
      performedBy: performer?._id || null,
      performedByName: performer?.name || 'Staff Responder',
      performedByRole: performer?.role || 'emergency'
    });

    if (notes) {
      emergencyCase.notes.push({
        text: notes,
        author: performer?.name || 'Emergency Responder',
        authorRole: performer?.role || 'emergency'
      });
    }

    await emergencyCase.save();

    // Synchronize Alert document
    if (newStatus === 'RESOLVED') {
      await Alert.updateMany(
        { emergencyCaseId: emergencyCase._id },
        { emergencyStatus: 'Resolved', resolved: true, resolvedAt: new Date(), resolvedBy: performer?._id }
      );
    } else {
      await Alert.updateMany(
        { emergencyCaseId: emergencyCase._id },
        { emergencyStatus: newStatus === 'EN_ROUTE' ? 'Dispatched' : (newStatus === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Pending') }
      );
    }

    return emergencyCase;
  }

  /**
   * Acknowledge case
   */
  async acknowledgeCase(caseId, performer) {
    return this.updateStatus(caseId, 'ACKNOWLEDGED', performer, `Emergency case acknowledged by ${performer?.role}: ${performer?.name || 'Staff'}. Reviewing vital signs and GPS.`);
  }

  /**
   * Assign Emergency Response Team (Ambulance / Paramedic unit)
   */
  async assignEmergencyTeam(caseId, teamData, performer) {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase) throw new Error('Emergency case not found');

    const team = {
      teamId: teamData.teamId || 'TEAM-ALPHA',
      teamName: teamData.teamName || 'Rapid Response Unit 01 (Trauma)',
      leadResponder: teamData.leadResponder || 'Paramedic Unit',
      contactPhone: teamData.contactPhone || '+91 98765 30000',
      vehicleType: teamData.vehicleType || 'Advanced Life Support (ALS) Ambulance',
      assignedAt: new Date()
    };

    emergencyCase.assignedEmergencyTeam = team;
    emergencyCase.status = 'TEAM_ASSIGNED';

    emergencyCase.timeline.push({
      event: 'TEAM_ASSIGNED',
      message: `Emergency response unit assigned: ${team.teamName} (${team.vehicleType}). Lead: ${team.leadResponder}. Radio: ${team.contactPhone}.`,
      timestamp: new Date(),
      performedBy: performer?._id || null,
      performedByName: performer?.name || 'Dispatch Coordinator',
      performedByRole: performer?.role || 'emergency'
    });

    await notificationService.sendEmergencyTeamNotification(emergencyCase, team);
    await emergencyCase.save();
    return emergencyCase;
  }

  /**
   * Cancel SOS Alert (allowed before advanced care if confirmed false alarm)
   */
  async cancelCase(caseId, reason = 'False alarm confirmed', performer) {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase) throw new Error('Emergency case not found');

    if (['UNDER_CARE', 'RESOLVED'].includes(emergencyCase.status)) {
      throw new Error(`Cannot cancel case that is already ${emergencyCase.status}. Must be closed via resolution protocol.`);
    }

    emergencyCase.status = 'CANCELLED';
    emergencyCase.cancellationReason = reason;
    emergencyCase.resolvedAt = new Date();
    emergencyCase.resolvedBy = performer?._id || null;

    emergencyCase.timeline.push({
      event: 'SOS_CANCELLED',
      message: `Emergency alert was cancelled by ${performer?.name || performer?.role || 'User'}: "${reason}".`,
      timestamp: new Date(),
      performedBy: performer?._id || null,
      performedByName: performer?.name || 'User',
      performedByRole: performer?.role || 'patient'
    });

    await emergencyCase.save();

    await Alert.updateMany(
      { emergencyCaseId: emergencyCase._id },
      { emergencyStatus: 'Resolved', resolved: true, resolvedAt: new Date(), resolvedBy: performer?._id }
    );

    await notificationService.broadcastCancellationNotification(emergencyCase, performer);
    return emergencyCase;
  }

  /**
   * Update live location coordinates en route
   */
  async updateLocation(caseId, locationData, performer) {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase) throw new Error('Emergency case not found');

    const lat = locationData.latitude ? Number(locationData.latitude) : emergencyCase.location.latitude;
    const lng = locationData.longitude ? Number(locationData.longitude) : emergencyCase.location.longitude;

    emergencyCase.location = {
      latitude: lat,
      longitude: lng,
      accuracy: locationData.accuracy || emergencyCase.location.accuracy,
      timestamp: new Date(),
      address: locationData.address || emergencyCase.location.address || (lat ? `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Live telemetry'),
      isAvailable: Boolean(lat && lng)
    };

    emergencyCase.timeline.push({
      event: 'LOCATION_UPDATED',
      message: `Live GPS fix updated: ${emergencyCase.location.address}`,
      timestamp: new Date(),
      performedBy: performer?._id || null,
      performedByName: performer?.name || 'GPS Telemetry Tracker',
      performedByRole: performer?.role || 'system'
    });

    await emergencyCase.save();

    // Broadcast location update
    broadcastToRole('emergency', 'case_location_update', {
      caseId: emergencyCase._id,
      emergencyId: emergencyCase.emergencyId,
      location: emergencyCase.location
    });

    return emergencyCase;
  }

  /**
   * Retrieve active cases with population
   */
  async getActiveCases(roleFilter = {}) {
    return EmergencyCase.find({
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] },
      ...roleFilter
    })
      .populate('patientId', 'name age gender bloodGroup phone roomLocation allergies allergiesDetail medicalConditionsDetail caregiverPhone emergencyContact')
      .populate('assignedDoctor', 'name specialization phone')
      .sort({ triggeredAt: -1 });
  }

  /**
   * Get single case with role-based masking
   */
  async getCaseById(caseId, requestingUser = null) {
    const emergencyCase = await EmergencyCase.findById(caseId)
      .populate('patientId', 'name age gender bloodGroup phone roomLocation allergies allergiesDetail medicalConditionsDetail medicalHistory caregiverPhone emergencyContact emergencyContacts')
      .populate('assignedDoctor', 'name specialization phone email')
      .populate('resolvedBy', 'name role');

    if (!emergencyCase) return null;

    if (requestingUser) {
      const isOwner = emergencyCase.patientId?._id?.toString() === requestingUser._id.toString();
      const isAssignedDoctor = emergencyCase.assignedDoctor?._id?.toString() === requestingUser._id.toString();
      const isStaff = ['emergency', 'admin', 'hospital', 'doctor'].includes(requestingUser.role);

      if (!isOwner && !isAssignedDoctor && !isStaff) {
        const err = new Error('Unauthorized to view this emergency incident');
        err.statusCode = 403;
        throw err;
      }
    }

    return emergencyCase;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SINGLETON SERVICE COMPOSITION & EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

const userDataModuleInstance = new UserDataModule();
const emergencyEngineInstance = new EmergencyEngine(userDataModuleInstance);
const emergencySosModuleInstance = new EmergencySosModule(userDataModuleInstance, emergencyEngineInstance);
const emergencyCaseServiceInstance = new EmergencyCaseService();

module.exports = {
  UserDataModule: userDataModuleInstance,
  EmergencySosModule: emergencySosModuleInstance,
  EmergencyEngine: emergencyEngineInstance,
  EmergencyCaseService: emergencyCaseServiceInstance,

  // Direct convenience references matching the architecture tree
  userData: userDataModuleInstance,
  sosModule: emergencySosModuleInstance,
  engine: emergencyEngineInstance,
  cases: emergencyCaseServiceInstance,

  // Top-level workflow triggers
  triggerManualSOS: emergencySosModuleInstance.triggerManualSOS.bind(emergencySosModuleInstance),
  triggerAutomaticSOS: emergencySosModuleInstance.triggerAutomaticSOS.bind(emergencySosModuleInstance),
  processEmergency: emergencyEngineInstance.processEmergency.bind(emergencyEngineInstance)
};
