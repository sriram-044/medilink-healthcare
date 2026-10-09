/**
 * test_emergency_sos_architecture.js
 * Comprehensive Architectural Test Suite for CareLink Emergency SOS Service.
 * Validates every node and branch in the CareLink Emergency SOS structure.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('./models/User');
const EmergencyCase = require('./models/EmergencyCase');
const Alert = require('./models/Alert');
const Notification = require('./models/Notification');
const { Medication } = require('./models/Medication');
const VitalSigns = require('./models/VitalSigns');
const emergencySosService = require('./utils/emergencySosService');
const { triggerEmergencyWorkflow } = require('./utils/emergencyEngine');

let mongod;
let patientUser;
let doctorUser;
let emergencyOfficer;

async function setupTestDb() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // 1. Create Doctor
  doctorUser = await new User({
    name: 'Dr. Priya Sharma',
    email: 'priya.sharma@demo.com',
    role: 'doctor',
    specialization: 'Cardiologist',
    phone: '+91 98765 11111'
  }).save();

  // 2. Create Patient with Profile, Medical Info, Contacts & Location
  patientUser = await new User({
    name: 'Mr. Ravi',
    email: 'ravi.test@demo.com',
    role: 'patient',
    age: 68,
    gender: 'male',
    bloodGroup: 'B+',
    phone: '+91 98765 77777',
    assignedDoctor: doctorUser._id,
    address: 'Flat 402, Lotus Towers, T. Nagar, Chennai',
    roomLocation: 'Room 104, Sunrise Senior Living',
    caregiverPhone: '+91 98765 88888',
    emergencyContact: '+91 98765 99999',
    emergencyContacts: [
      { name: 'Sunita Sharma', relationship: 'Daughter', phone: '+91 98765 99999', isPrimary: true, priority: 'Primary' },
      { name: 'Anish Verma', relationship: 'Caregiver', phone: '+91 98765 88888', isPrimary: false, priority: 'Secondary' }
    ],
    allergies: ['Sulfa Drugs', 'Penicillin'],
    allergiesDetail: [
      { name: 'Sulfa Drugs', severity: 'Severe', reaction: 'Hives and anaphylactic rash' },
      { name: 'Penicillin', severity: 'Critical', reaction: 'Bronchospasm' }
    ],
    medicalConditionsDetail: [
      { condition: 'Coronary Artery Disease', diagnosedYear: '2020', status: 'Managed' },
      { condition: 'Type 2 Diabetes', diagnosedYear: '2018', status: 'Active' }
    ],
    medicalHistory: ['Angioplasty with stent placement (2021)']
  }).save();

  // 3. Create Active Medication for the Patient
  await new Medication({
    patientId: patientUser._id,
    doctorId: doctorUser._id,
    name: 'Atorvastatin',
    dosage: '20mg',
    frequency: 'Once Daily',
    isActive: true
  }).save();

  await new Medication({
    patientId: patientUser._id,
    doctorId: doctorUser._id,
    name: 'Metformin',
    dosage: '500mg',
    frequency: 'Twice Daily',
    isActive: true
  }).save();

  // 4. Create Emergency Command Officer
  emergencyOfficer = await new User({
    name: 'Capt. Vikram Singh',
    email: 'vikram.singh@demo.com',
    role: 'emergency',
    department: 'Trauma Command Center'
  }).save();
}

async function runTests() {
  console.log('🚀 Running CareLink Emergency SOS Architecture Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BRANCH 1: 👤 USER DATA MODULE
  // ═══════════════════════════════════════════════════════════════════════════════

  await test('UserDataModule: Extracts Patient Profile with demographics and hospital assignment', async () => {
    const profile = await emergencySosService.userData.getPatientProfile(patientUser._id);
    assert.strictEqual(profile.name, 'Mr. Ravi');
    assert.strictEqual(profile.age, 68);
    assert.strictEqual(profile.gender, 'male');
    assert.strictEqual(profile.bloodGroup, 'B+');
    assert.strictEqual(profile.phone, '+91 98765 77777');
    assert.ok(profile.assignedDoctor);
    assert.strictEqual(profile.assignedHospital, 'MediLink Central Trauma & Emergency Center');
  });

  await test('UserDataModule: Extracts Medical Info (allergies, conditions, history, active meds)', async () => {
    const medInfo = await emergencySosService.userData.getMedicalInfo(patientUser._id);
    assert.strictEqual(medInfo.bloodGroup, 'B+');
    assert.ok(medInfo.allergies.includes('Sulfa Drugs'));
    assert.ok(medInfo.allergiesDetail.some(a => a.severity === 'Critical'));
    assert.ok(medInfo.medicalConditions.includes('Coronary Artery Disease'));
    assert.ok(medInfo.currentMedications.some(m => m.includes('Atorvastatin')));
  });

  await test('UserDataModule: Extracts Emergency Contacts with Primary/Secondary priority', async () => {
    const contacts = await emergencySosService.userData.getEmergencyContacts(patientUser._id);
    assert.strictEqual(contacts.length, 2);
    const primary = contacts.find(c => c.isPrimary);
    assert.ok(primary);
    assert.strictEqual(primary.name, 'Sunita Sharma');
    assert.strictEqual(primary.phone, '+91 98765 99999');
  });

  await test('UserDataModule: Resolves live GPS location and falls back to room location', async () => {
    // With live GPS
    const gpsLocation = emergencySosService.userData.resolveLocation(patientUser, {
      latitude: 13.0418,
      longitude: 80.2341,
      accuracy: 4,
      address: 'T. Nagar, Chennai'
    });
    assert.strictEqual(gpsLocation.isAvailable, true);
    assert.strictEqual(gpsLocation.latitude, 13.0418);
    assert.ok(gpsLocation.mapsUrl.includes('13.0418'));

    // Without live GPS (null fallback)
    const fallbackLocation = emergencySosService.userData.resolveLocation(patientUser, null);
    assert.strictEqual(fallbackLocation.isAvailable, true);
    assert.strictEqual(fallbackLocation.address, 'Room 104, Sunrise Senior Living');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // BRANCH 2: 🚨 EMERGENCY SOS MODULE (Manual SOS & Automatic Detection)
  // ═══════════════════════════════════════════════════════════════════════════════

  await test('EmergencySosModule: Manual SOS Button trigger creates case with MANUAL_BUTTON source', async () => {
    await EmergencyCase.deleteMany({});

    const result = await emergencySosService.triggerManualSOS({
      patientId: patientUser._id,
      location: { latitude: 13.0418, longitude: 80.2341, address: 'T. Nagar, Chennai' },
      reason: 'Chest discomfort reported by patient'
    });

    assert.ok(result.emergencyCase);
    assert.strictEqual(result.emergencyCase.triggerSource, 'MANUAL_BUTTON');
    assert.strictEqual(result.emergencyCase.emergencyType, 'MANUAL_SOS');
    assert.strictEqual(result.emergencyCase.priority, 'Critical');
    assert.strictEqual(result.emergencyCase.patientName, 'Mr. Ravi');
    assert.ok(result.emergencyCase.patientProfile.bloodGroup, 'B+');
    assert.ok(result.emergencyCase.medicalInfo.allergies.length >= 2);
  });

  await test('EmergencySosModule: Automated Vitals Anomaly Evaluator detects critical thresholds', async () => {
    // 1. Tachycardia & Hypoxemia
    const anomaly1 = emergencySosService.sosModule.evaluateVitalsAnomaly({
      heartRate: 155,
      spo2: 85
    });
    assert.strictEqual(anomaly1.isAnomaly, true);
    assert.strictEqual(anomaly1.priority, 'Critical');
    assert.ok(anomaly1.reasons.some(r => r.includes('Severe Tachycardia')));
    assert.ok(anomaly1.reasons.some(r => r.includes('Critical Hypoxemia')));

    // 2. Normal vitals
    const normal = emergencySosService.sosModule.evaluateVitalsAnomaly({
      heartRate: 72,
      spo2: 98,
      systolicBP: 120,
      diastolicBP: 80
    });
    assert.strictEqual(normal.isAnomaly, false);
    assert.strictEqual(normal.priority, 'Normal');
  });

  await test('EmergencySosModule: Automatic SOS Detection triggers with sensor data and wearable source', async () => {
    await EmergencyCase.deleteMany({});

    const autoResult = await emergencySosService.triggerAutomaticSOS({
      patientId: patientUser._id,
      detectionSource: 'wearable',
      vitals: { heartRate: 148, spo2: 87 },
      fallDetected: true,
      score: 95,
      reasons: ['Wearable impact sensor trigger', 'Heart rate exceeded 145 bpm']
    });

    assert.ok(autoResult.emergencyCase);
    assert.strictEqual(autoResult.emergencyCase.triggerSource, 'AUTOMATIC_DETECTION');
    assert.strictEqual(autoResult.emergencyCase.emergencyType, 'FALL_ALERT');
    assert.strictEqual(autoResult.emergencyCase.priority, 'Critical');
    assert.strictEqual(autoResult.emergencyCase.recentHealthData.heartRate, 148);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // BRANCH 3: ⚙️ EMERGENCY ENGINE (Doctor, Family, Hospital 3-Way Alerts)
  // ═══════════════════════════════════════════════════════════════════════════════

  await test('EmergencyEngine: Dispatches coordinated Doctor Alert, Family Alert, and Hospital Alert', async () => {
    await EmergencyCase.deleteMany({});
    await Notification.deleteMany({});

    const result = await emergencySosService.triggerManualSOS({
      patientId: patientUser._id,
      reason: 'Urgent assistance needed'
    });

    // Check alertsSent array
    const sent = result.emergencyCase.alertsSent;
    assert.ok(sent.some(a => a.recipientType === 'Doctor'), 'Doctor alert must be recorded in alertsSent');
    assert.ok(sent.some(a => a.recipientType === 'Emergency Contact'), 'Family alert must be recorded in alertsSent');
    assert.ok(sent.some(a => a.recipientType === 'Hospital'), 'Hospital alert must be recorded in alertsSent');

    // Check Doctor Notification created in DB
    const docNotif = await Notification.findOne({ recipientId: doctorUser._id, type: 'emergency_sos' });
    assert.ok(docNotif, 'Doctor in-app notification document must exist');
    assert.ok(docNotif.message.includes('Mr. Ravi'));

    // Check Hospital Notifications created in DB
    const hospNotifs = await Notification.find({ role: 'emergency', type: 'emergency_sos' });
    assert.ok(hospNotifs.length >= 1, 'Hospital emergency command notifications must exist');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // BRANCH 4: 📋 EMERGENCY CASE + INCIDENT LOG (Timeline Audit & Lifecycle)
  // ═══════════════════════════════════════════════════════════════════════════════

  await test('EmergencyCase + Incident Log: Records chronological timeline events for all actions', async () => {
    await EmergencyCase.deleteMany({});

    const result = await emergencySosService.triggerManualSOS({
      patientId: patientUser._id,
      reason: 'Testing audit incident log'
    });

    const caseId = result.emergencyCase._id;
    const initialLog = await emergencySosService.cases.getIncidentLog(caseId);

    // Initial events: SOS_TRIGGERED, CONTACT_NOTIFIED, DOCTOR_NOTIFIED, HOSPITAL_NOTIFIED
    assert.ok(initialLog.some(e => e.event === 'SOS_TRIGGERED'), 'Must log SOS_TRIGGERED');
    assert.ok(initialLog.some(e => e.event === 'CONTACT_NOTIFIED'), 'Must log CONTACT_NOTIFIED (Family Alert)');
    assert.ok(initialLog.some(e => e.event === 'DOCTOR_NOTIFIED'), 'Must log DOCTOR_NOTIFIED (Doctor Alert)');
    assert.ok(initialLog.some(e => e.event === 'HOSPITAL_NOTIFIED'), 'Must log HOSPITAL_NOTIFIED (Hospital Alert)');

    // Advance Status: Acknowledge
    await emergencySosService.cases.acknowledgeCase(caseId, doctorUser);
    let log = await emergencySosService.cases.getIncidentLog(caseId);
    assert.ok(log.some(e => e.event === 'CASE_ACKNOWLEDGED'));

    // Advance Status: Assign Team
    await emergencySosService.cases.assignEmergencyTeam(caseId, {
      teamId: 'TEAM-ALPHA',
      teamName: 'Rapid Response Unit 01 (Trauma)',
      leadResponder: 'Capt. Rajesh Varma',
      vehicleType: 'ALS Ambulance'
    }, emergencyOfficer);
    log = await emergencySosService.cases.getIncidentLog(caseId);
    assert.ok(log.some(e => e.event === 'TEAM_ASSIGNED'));

    // Advance Status: En Route -> Arrived -> Under Care -> Resolved
    await emergencySosService.cases.updateStatus(caseId, 'EN_ROUTE', emergencyOfficer);
    await emergencySosService.cases.updateStatus(caseId, 'ARRIVED', emergencyOfficer);
    await emergencySosService.cases.updateStatus(caseId, 'UNDER_CARE', emergencyOfficer);
    await emergencySosService.cases.updateStatus(caseId, 'RESOLVED', doctorUser, 'Patient vitals stable');

    const finalCase = await EmergencyCase.findById(caseId);
    assert.strictEqual(finalCase.status, 'RESOLVED');
    assert.ok(finalCase.resolvedAt);
    assert.strictEqual(finalCase.resolvedBy.toString(), doctorUser._id.toString());
  });

  await test('EmergencyCase + Incident Log: Appends repeat signal to existing case without duplicate spam', async () => {
    await EmergencyCase.deleteMany({});

    const first = await emergencySosService.triggerManualSOS({ patientId: patientUser._id });
    assert.strictEqual(first.isDuplicate, false);

    const second = await emergencySosService.triggerManualSOS({ patientId: patientUser._id });
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.emergencyCase.emergencyId, first.emergencyCase.emergencyId);

    const activeCases = await EmergencyCase.find({ patientId: patientUser._id, status: 'ACTIVE' });
    assert.strictEqual(activeCases.length, 1);
  });

  await test('EmergencyCase + Incident Log: Allows cancellation with audit entry before advanced care', async () => {
    await EmergencyCase.deleteMany({});

    const trigger = await emergencySosService.triggerManualSOS({ patientId: patientUser._id });
    const cancelled = await emergencySosService.cases.cancelCase(
      trigger.emergencyCase._id,
      'False alarm: Button triggered accidentally while sitting',
      patientUser
    );

    assert.strictEqual(cancelled.status, 'CANCELLED');
    assert.strictEqual(cancelled.cancellationReason, 'False alarm: Button triggered accidentally while sitting');
    assert.ok(cancelled.timeline.some(e => e.event === 'SOS_CANCELLED'));
  });

  console.log(`\n========================================`);
  console.log(`Architecture Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
  await mongod.stop();

  if (failed > 0) process.exit(1);
}

setupTestDb().then(runTests).catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
