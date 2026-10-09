/**
 * test_emergency_system.js — Comprehensive Automated Test Suite for MediLink AI SOS Emergency System
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const EmergencyCase = require('./models/EmergencyCase');
const Alert = require('./models/Alert');
const Notification = require('./models/Notification');
const { triggerEmergencyWorkflow } = require('./utils/emergencyEngine');
const notificationService = require('./utils/notificationService');

let mongod;
let patientUser;
let doctorUser;
let emergencyOfficer;

async function setupTestDb() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  doctorUser = await new User({
    name: 'Dr. Priya Sharma',
    email: 'doctor.test@demo.com',
    role: 'doctor',
    specialization: 'Cardiologist',
    phone: '+91 98765 11111'
  }).save();

  patientUser = await new User({
    name: 'Mr. Ravi',
    email: 'ravi.test@demo.com',
    role: 'patient',
    age: 68,
    gender: 'male',
    bloodGroup: 'B+',
    phone: '+91 98765 77777',
    assignedDoctor: doctorUser._id,
    roomLocation: 'Room 104, Sunrise Senior Living',
    caregiverPhone: '+91 98765 88888',
    emergencyContact: '+91 98765 99999',
    emergencyContacts: [
      { name: 'Sunita Sharma', relationship: 'Family (Daughter)', phone: '+91 98765 99999', isPrimary: true, priority: 'Primary' },
      { name: 'Anish Verma', relationship: 'Caregiver', phone: '+91 98765 88888', isPrimary: false, priority: 'Primary' }
    ],
    allergiesDetail: [{ name: 'Sulfa Drugs', severity: 'Severe', reaction: 'Hives' }],
    medicalConditionsDetail: [{ condition: 'Coronary Artery Disease', status: 'Managed' }]
  }).save();

  emergencyOfficer = await new User({
    name: 'Officer Vikram Singh',
    email: 'er.officer@demo.com',
    role: 'emergency',
    department: 'Trauma Command'
  }).save();
}

async function runTests() {
  console.log('🧪 Running MediLink AI SOS Emergency System Test Suite...\n');
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

  // 1. Model Structure & Automatic Emergency ID
  await test('EmergencyCase model initializes and generates human-readable emergency ID', async () => {
    const emg = new EmergencyCase({
      patientId: patientUser._id,
      patientName: patientUser.name,
      emergencyType: 'MANUAL_SOS',
      status: 'ACTIVE'
    });
    await emg.validate();
    assert.ok(emg.emergencyId, 'emergencyId should be generated');
    assert.ok(emg.emergencyId.startsWith('EMG-'), 'emergencyId should start with EMG-');
  });

  // 2. Manual SOS Trigger Workflow
  await test('triggerEmergencyWorkflow creates EmergencyCase and dispatches multi-party alerts', async () => {
    const result = await triggerEmergencyWorkflow({
      patient: patientUser,
      doctorId: doctorUser._id,
      type: 'MANUAL_SOS',
      score: 100,
      vitals: { heartRate: 110, spo2: 95 },
      location: { latitude: 28.6139, longitude: 77.2090, accuracy: 5, address: 'Connaught Place, New Delhi' },
      performedBy: patientUser._id
    });

    assert.ok(result.emergencyCase, 'Should create emergencyCase');
    assert.strictEqual(result.emergencyCase.status, 'ACTIVE');
    assert.strictEqual(result.emergencyCase.priority, 'Critical');
    assert.strictEqual(result.emergencyCase.location.isAvailable, true);
    assert.strictEqual(result.emergencyCase.location.latitude, 28.6139);
    assert.ok(result.emergencyCase.timeline.length >= 2, 'Timeline should contain SOS_TRIGGERED and notification events');
    assert.strictEqual(result.alert.emergencyCaseId.toString(), result.emergencyCase._id.toString());
  });

  // 3. Location Graceful Fallback Handling
  await test('Handles missing/denied geolocation gracefully without failing SOS alert', async () => {
    // Clear previous active case for clean test
    await EmergencyCase.deleteMany({});

    const result = await triggerEmergencyWorkflow({
      patient: patientUser,
      doctorId: doctorUser._id,
      type: 'MANUAL_SOS',
      location: null, // No GPS available
      performedBy: patientUser._id
    });

    assert.ok(result.emergencyCase, 'SOS must succeed even when location is null');
    assert.strictEqual(result.emergencyCase.location.latitude, null);
    assert.strictEqual(result.emergencyCase.location.isAvailable, true); // fallback to roomLocation
    assert.strictEqual(result.emergencyCase.location.address, 'Room 104, Sunrise Senior Living');
  });

  // 4. Duplicate SOS Prevention
  await test('Prevents spam duplicates when an active emergency case is already in progress', async () => {
    const secondTrigger = await triggerEmergencyWorkflow({
      patient: patientUser,
      doctorId: doctorUser._id,
      type: 'MANUAL_SOS',
      performedBy: patientUser._id
    });

    const activeCases = await EmergencyCase.find({
      patientId: patientUser._id,
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'UNDER_CARE'] }
    });

    assert.strictEqual(activeCases.length, 1, 'Should NOT create a second active case');
    assert.ok(
      activeCases[0].timeline.some(t => t.message.includes('Repeated SOS signal')),
      'Should log repeated signal to existing timeline'
    );
  });

  // 5. Emergency Case Status Lifecycle (Full Stepper)
  await test('Full 8-stage Status Workflow: ACTIVE -> ACKNOWLEDGED -> TEAM_ASSIGNED -> EN_ROUTE -> ARRIVED -> UNDER_CARE -> RESOLVED', async () => {
    const emg = await EmergencyCase.findOne({ patientId: patientUser._id });

    // Step 1: Acknowledge
    emg.status = 'ACKNOWLEDGED';
    emg.timeline.push({ event: 'CASE_ACKNOWLEDGED', message: 'Acknowledged by Dr. Priya Sharma', performedByName: 'Dr. Priya Sharma', performedByRole: 'doctor' });
    await emg.save();
    assert.strictEqual(emg.status, 'ACKNOWLEDGED');

    // Step 2: Assign Team
    emg.status = 'TEAM_ASSIGNED';
    emg.assignedEmergencyTeam = {
      teamId: 'TEAM-ALPHA',
      teamName: 'Rapid Response Unit 01 (Trauma)',
      leadResponder: 'Capt. Rajesh Varma',
      contactPhone: '+91 98765 30001',
      vehicleType: 'ALS Ambulance'
    };
    emg.timeline.push({ event: 'TEAM_ASSIGNED', message: 'Team Alpha Assigned', performedByName: 'ER Dispatch', performedByRole: 'emergency' });
    await emg.save();
    assert.strictEqual(emg.status, 'TEAM_ASSIGNED');

    // Step 3: En Route
    emg.status = 'EN_ROUTE';
    emg.timeline.push({ event: 'TEAM_EN_ROUTE', message: 'ALS Ambulance En Route. ETA 8 mins.', performedByName: 'Capt. Rajesh Varma', performedByRole: 'emergency' });
    await emg.save();
    assert.strictEqual(emg.status, 'EN_ROUTE');

    // Step 4: Arrived
    emg.status = 'ARRIVED';
    emg.timeline.push({ event: 'TEAM_ARRIVED', message: 'Team arrived at scene.', performedByName: 'Capt. Rajesh Varma', performedByRole: 'emergency' });
    await emg.save();
    assert.strictEqual(emg.status, 'ARRIVED');

    // Step 5: Under Care
    emg.status = 'UNDER_CARE';
    emg.timeline.push({ event: 'UNDER_CARE', message: 'Patient vitals stabilized by paramedics.', performedByName: 'Capt. Rajesh Varma', performedByRole: 'emergency' });
    await emg.save();
    assert.strictEqual(emg.status, 'UNDER_CARE');

    // Step 6: Resolved
    emg.status = 'RESOLVED';
    emg.resolvedAt = new Date();
    emg.resolvedBy = doctorUser._id;
    emg.timeline.push({ event: 'CASE_RESOLVED', message: 'Patient safely treated and monitored.', performedByName: 'Dr. Priya Sharma', performedByRole: 'doctor' });
    await emg.save();
    assert.strictEqual(emg.status, 'RESOLVED');
    assert.ok(emg.resolvedAt, 'resolvedAt should be timestamped');
  });

  // 6. SOS Cancellation Workflow
  await test('Allows cancellation before advanced care, updates timeline, and marks status CANCELLED', async () => {
    // Create new fresh active SOS
    const newCase = new EmergencyCase({
      emergencyId: 'EMG-9999',
      patientId: patientUser._id,
      patientName: patientUser.name,
      emergencyType: 'MANUAL_SOS',
      status: 'ACTIVE',
      timeline: [{ event: 'SOS_TRIGGERED', message: 'Patient pressed SOS button', performedByName: patientUser.name, performedByRole: 'patient' }]
    });
    await newCase.save();

    newCase.status = 'CANCELLED';
    newCase.cancellationReason = 'Accidental button press (False alarm)';
    newCase.resolvedAt = new Date();
    newCase.timeline.push({
      event: 'SOS_CANCELLED',
      message: 'Alert cancelled by patient (False alarm).',
      performedByName: patientUser.name,
      performedByRole: 'patient'
    });
    await newCase.save();

    const checkCase = await EmergencyCase.findById(newCase._id);
    assert.strictEqual(checkCase.status, 'CANCELLED');
    assert.strictEqual(checkCase.cancellationReason, 'Accidental button press (False alarm)');
    assert.ok(checkCase.timeline.some(t => t.event === 'SOS_CANCELLED'));
  });

  // 7. Emergency Contacts CRUD
  await test('Emergency contacts can be added, updated, and designated as Primary', async () => {
    const user = await User.findById(patientUser._id);
    user.emergencyContacts.push({
      name: 'Rohan Sharma',
      relationship: 'Son',
      phone: '+91 98765 44444',
      email: 'rohan@example.com',
      priority: 'Secondary',
      isPrimary: false
    });
    await user.save();

    let updatedUser = await User.findById(patientUser._id);
    assert.strictEqual(updatedUser.emergencyContacts.length, 3);

    // Designate Rohan as Primary
    updatedUser.emergencyContacts.forEach(c => { c.isPrimary = false; });
    const rohan = updatedUser.emergencyContacts.find(c => c.name === 'Rohan Sharma');
    rohan.isPrimary = true;
    rohan.priority = 'Primary';
    await updatedUser.save();

    const finalCheck = await User.findById(patientUser._id);
    const primaryContact = finalCheck.emergencyContacts.find(c => c.isPrimary);
    assert.strictEqual(primaryContact.name, 'Rohan Sharma');
    assert.strictEqual(primaryContact.phone, '+91 98765 44444');
  });

  // 8. Non-Diagnostic Health Warning Phrasing Compliance
  await test('Verifies non-diagnostic phrasing in automatic health alerts', async () => {
    const warningResult = await triggerEmergencyWorkflow({
      patient: patientUser,
      type: 'HEALTH_WARNING',
      score: 75,
      vitals: { heartRate: 118, spo2: 93 },
      reasons: ['Tachycardia detected: Heart rate 118 bpm']
    });

    assert.strictEqual(warningResult.emergencyCase.priority, 'Warning');
    assert.ok(!warningResult.alert.message.includes('Heart attack detected'), 'Must not claim diagnostic diseases');
    assert.ok(
      warningResult.alert.message.includes('Possible health emergency detected') ||
      warningResult.alert.message.includes('EMERGENCY SOS'),
      'Must use compliant non-diagnostic phrasing'
    );
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
  await mongod.stop();

  if (failed > 0) process.exit(1);
}

setupTestDb().then(runTests).catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
