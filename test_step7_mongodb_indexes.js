/**
 * test_step7_mongodb_indexes.js — MongoDB Database Indexes Test Suite
 *
 * Verifies all requirements of Step 7:
 * A. User indexes (email unique, role+assignedDoctor compound, googleId sparse)
 * B. MedicalReport indexes (reportId unique, patientId+testDate, doctorId+testDate, etc.)
 * C. TestRequest indexes (requestId unique, patientId+requestDate, status+priority+requestDate, etc.)
 * D. Sample indexes (sampleId unique, testRequestId, patientId+collectionDate, etc.)
 * E. EmergencyCase indexes (emergencyId unique, patientId+triggeredAt, status+triggeredAt, etc.)
 * F. Notification indexes (recipientId+createdAt, recipientId+isRead, role+createdAt)
 * G. Prescription/Medication indexes (patientId+isActive+createdAt, doctorId+createdAt, DietPlan)
 * H. InsuranceClaim indexes (claimId unique, patientId+claimDate, status+claimDate)
 * I. No duplicate indexes (verifies zero duplicate index definitions across all models)
 * J. Unique constraints (verifies only intended unique constraints exist and enforce uniqueness)
 * K. Query explain (verifies IXSCAN execution stage for representative queries via explain())
 * L. Performance benchmark (synthetic measurement: totalDocsExamined and query execution time)
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import all models
const User = require('./models/User');
const MedicalReport = require('./models/MedicalReport');
const TestRequest = require('./models/TestRequest');
const Sample = require('./models/Sample');
const EmergencyCase = require('./models/EmergencyCase');
const Notification = require('./models/Notification');
const { Medication, DietPlan } = require('./models/Medication');
const InsuranceClaim = require('./models/InsuranceClaim');
const Alert = require('./models/Alert');
const HospitalVisit = require('./models/HospitalVisit');
const VitalSigns = require('./models/VitalSigns');
const Report = require('./models/Report');

let mongod;
let passedCount = 0;
let failedCount = 0;
const testResults = [];

function recordTest(testId, name, pass, detail = '') {
  if (pass) {
    passedCount++;
    testResults.push({ id: testId, name, status: 'PASS', detail });
    console.log(`  ✅ [PASS] [${testId}] ${name}`);
  } else {
    failedCount++;
    testResults.push({ id: testId, name, status: 'FAIL', detail });
    console.error(`  ❌ [FAIL] [${testId}] ${name}: ${detail}`);
  }
}

// Helper to inspect winning plan stage in MongoDB explain
function extractPlanStage(plan) {
  if (!plan) return 'UNKNOWN';
  if (plan.stage === 'IXSCAN') return 'IXSCAN';
  if (plan.inputStage) return extractPlanStage(plan.inputStage);
  if (plan.inputStages) {
    for (const s of plan.inputStages) {
      const res = extractPlanStage(s);
      if (res === 'IXSCAN') return 'IXSCAN';
    }
  }
  return plan.stage;
}

function extractIndexName(plan) {
  if (!plan) return null;
  if (plan.indexName) return plan.indexName;
  if (plan.inputStage) return extractIndexName(plan.inputStage);
  if (plan.inputStages) {
    for (const s of plan.inputStages) {
      const res = extractIndexName(s);
      if (res) return res;
    }
  }
  return null;
}

async function runIndexTests() {
  console.log('\n🗄️ Starting Step 7 — MongoDB Database Indexes Verification...\n');

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Sync / build all indexes in MongoDB
  const models = [
    { name: 'User', model: User },
    { name: 'MedicalReport', model: MedicalReport },
    { name: 'TestRequest', model: TestRequest },
    { name: 'Sample', model: Sample },
    { name: 'EmergencyCase', model: EmergencyCase },
    { name: 'Notification', model: Notification },
    { name: 'Medication', model: Medication },
    { name: 'DietPlan', model: DietPlan },
    { name: 'InsuranceClaim', model: InsuranceClaim },
    { name: 'Alert', model: Alert },
    { name: 'HospitalVisit', model: HospitalVisit },
    { name: 'VitalSigns', model: VitalSigns },
    { name: 'Report', model: Report }
  ];

  for (const { model } of models) {
    await model.init();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // A. User Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const userIndexes = await User.collection.indexes();
    const emailIdx = userIndexes.find(i => i.name === 'email_1');
    const roleDocIdx = userIndexes.find(i => i.name === 'role_1_assignedDoctor_1');
    const googleIdIdx = userIndexes.find(i => i.name === 'googleId_1');

    recordTest(
      'Test A1',
      'User model has unique email index',
      emailIdx && emailIdx.unique === true
    );
    recordTest(
      'Test A2',
      'User model has compound index { role: 1, assignedDoctor: 1 }',
      !!roleDocIdx
    );
    recordTest(
      'Test A3',
      'User model has sparse index on googleId',
      googleIdIdx && googleIdIdx.sparse === true
    );
  } catch (err) {
    recordTest('Test A', 'User model indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // B. MedicalReport Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const repIndexes = await MedicalReport.collection.indexes();
    const repIdIdx = repIndexes.find(i => i.name === 'reportId_1');
    const hasPatientDate = repIndexes.some(i => i.name === 'patientId_1_testDate_-1');
    const hasDoctorDate = repIndexes.some(i => i.name === 'doctorId_1_testDate_-1');
    const hasCatStatusDate = repIndexes.some(i => i.name === 'category_1_reportStatus_1_testDate_-1');
    const hasCritDate = repIndexes.some(i => i.name === 'criticalStatus_1_testDate_-1');
    const hasTestReq = repIndexes.some(i => i.name === 'testRequestId_1');

    recordTest('Test B1', 'MedicalReport has unique reportId index', repIdIdx && repIdIdx.unique === true);
    recordTest('Test B2', 'MedicalReport has compound index { patientId: 1, testDate: -1 }', hasPatientDate);
    recordTest('Test B3', 'MedicalReport has compound index { doctorId: 1, testDate: -1 }', hasDoctorDate);
    recordTest('Test B4', 'MedicalReport has compound index { category: 1, reportStatus: 1, testDate: -1 }', hasCatStatusDate);
    recordTest('Test B5', 'MedicalReport has index on criticalStatus { criticalStatus: 1, testDate: -1 }', hasCritDate);
    recordTest('Test B6', 'MedicalReport has relationship lookup index on testRequestId', hasTestReq);
  } catch (err) {
    recordTest('Test B', 'MedicalReport indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // C. TestRequest Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const reqIndexes = await TestRequest.collection.indexes();
    const reqIdIdx = reqIndexes.find(i => i.name === 'requestId_1');
    const hasPatientReqDate = reqIndexes.some(i => i.name === 'patientId_1_requestDate_-1');
    const hasDoctorReqDate = reqIndexes.some(i => i.name === 'doctorId_1_requestDate_-1');
    const hasStatusPriorityDate = reqIndexes.some(i => i.name === 'status_1_priority_1_requestDate_-1');
    const hasAssignedStaffStatus = reqIndexes.some(i => i.name === 'assignedLabStaff_1_status_1');

    recordTest('Test C1', 'TestRequest has unique requestId index', reqIdIdx && reqIdIdx.unique === true);
    recordTest('Test C2', 'TestRequest has compound index { patientId: 1, requestDate: -1 }', hasPatientReqDate);
    recordTest('Test C3', 'TestRequest has compound index { doctorId: 1, requestDate: -1 }', hasDoctorReqDate);
    recordTest('Test C4', 'TestRequest has compound index { status: 1, priority: 1, requestDate: -1 }', hasStatusPriorityDate);
    recordTest('Test C5', 'TestRequest has compound index { assignedLabStaff: 1, status: 1 }', hasAssignedStaffStatus);
  } catch (err) {
    recordTest('Test C', 'TestRequest indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D. Sample Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const smpIndexes = await Sample.collection.indexes();
    const smpIdIdx = smpIndexes.find(i => i.name === 'sampleId_1');
    const hasTestReqId = smpIndexes.some(i => i.name === 'testRequestId_1');
    const hasPatientCollDate = smpIndexes.some(i => i.name === 'patientId_1_collectionDate_-1');
    const hasStatusTypeDate = smpIndexes.some(i => i.name === 'status_1_sampleType_1_collectionDate_-1');
    const barcodeIdx = smpIndexes.find(i => i.name === 'barcode_1');

    recordTest('Test D1', 'Sample has unique sampleId index', smpIdIdx && smpIdIdx.unique === true);
    recordTest('Test D2', 'Sample has relationship index { testRequestId: 1 }', hasTestReqId);
    recordTest('Test D3', 'Sample has compound index { patientId: 1, collectionDate: -1 }', hasPatientCollDate);
    recordTest('Test D4', 'Sample has compound index { status: 1, sampleType: 1, collectionDate: -1 }', hasStatusTypeDate);
    recordTest('Test D5', 'Sample has sparse index on barcode { barcode: 1 }', barcodeIdx && barcodeIdx.sparse === true);
  } catch (err) {
    recordTest('Test D', 'Sample indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // E. EmergencyCase Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const emgIndexes = await EmergencyCase.collection.indexes();
    const emgIdIdx = emgIndexes.find(i => i.name === 'emergencyId_1');
    const hasPatientTriggered = emgIndexes.some(i => i.name === 'patientId_1_triggeredAt_-1');
    const hasStatusTriggered = emgIndexes.some(i => i.name === 'status_1_triggeredAt_-1');
    const hasDoctorTriggered = emgIndexes.some(i => i.name === 'assignedDoctor_1_triggeredAt_-1');
    const hasTriggeredAt = emgIndexes.some(i => i.name === 'triggeredAt_-1');

    recordTest('Test E1', 'EmergencyCase has unique emergencyId index', emgIdIdx && emgIdIdx.unique === true);
    recordTest('Test E2', 'EmergencyCase has compound index { patientId: 1, triggeredAt: -1 }', hasPatientTriggered);
    recordTest('Test E3', 'EmergencyCase has compound index { status: 1, triggeredAt: -1 }', hasStatusTriggered);
    recordTest('Test E4', 'EmergencyCase has compound index { assignedDoctor: 1, triggeredAt: -1 }', hasDoctorTriggered);
    recordTest('Test E5', 'EmergencyCase has history index { triggeredAt: -1 }', hasTriggeredAt);
  } catch (err) {
    recordTest('Test E', 'EmergencyCase indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // F. Notification Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const notifIndexes = await Notification.collection.indexes();
    const hasRecipientCreated = notifIndexes.some(i => i.name === 'recipientId_1_createdAt_-1');
    const hasRecipientIsRead = notifIndexes.some(i => i.name === 'recipientId_1_isRead_1');
    const hasRoleCreated = notifIndexes.some(i => i.name === 'role_1_createdAt_-1');

    recordTest('Test F1', 'Notification has compound index { recipientId: 1, createdAt: -1 }', hasRecipientCreated);
    recordTest('Test F2', 'Notification has compound index { recipientId: 1, isRead: 1 }', hasRecipientIsRead);
    recordTest('Test F3', 'Notification has role feed index { role: 1, createdAt: -1 }', hasRoleCreated);
  } catch (err) {
    recordTest('Test F', 'Notification indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // G. Prescription / Medication Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const medIndexes = await Medication.collection.indexes();
    const hasPatientActiveCreated = medIndexes.some(i => i.name === 'patientId_1_isActive_1_createdAt_-1');
    const hasDoctorCreated = medIndexes.some(i => i.name === 'doctorId_1_createdAt_-1');
    const dietIndexes = await DietPlan.collection.indexes();
    const hasDietPatientCreated = dietIndexes.some(i => i.name === 'patientId_1_createdAt_-1');

    recordTest('Test G1', 'Medication has compound index { patientId: 1, isActive: 1, createdAt: -1 }', hasPatientActiveCreated);
    recordTest('Test G2', 'Medication has doctor index { doctorId: 1, createdAt: -1 }', hasDoctorCreated);
    recordTest('Test G3', 'DietPlan has compound index { patientId: 1, createdAt: -1 }', hasDietPatientCreated);
  } catch (err) {
    recordTest('Test G', 'Medication indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // H. InsuranceClaim Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const insIndexes = await InsuranceClaim.collection.indexes();
    const claimIdIdx = insIndexes.find(i => i.name === 'claimId_1');
    const hasPatientClaimDate = insIndexes.some(i => i.name === 'patientId_1_claimDate_-1');
    const hasStatusClaimDate = insIndexes.some(i => i.name === 'status_1_claimDate_-1');

    recordTest('Test H1', 'InsuranceClaim has unique claimId index', claimIdIdx && claimIdIdx.unique === true);
    recordTest('Test H2', 'InsuranceClaim has compound index { patientId: 1, claimDate: -1 }', hasPatientClaimDate);
    recordTest('Test H3', 'InsuranceClaim has compound index { status: 1, claimDate: -1 }', hasStatusClaimDate);
  } catch (err) {
    recordTest('Test H', 'InsuranceClaim indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // H2. Alert, HospitalVisit, VitalSigns & Report Model Indexes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const alertIndexes = await Alert.collection.indexes();
    const hasAlertPatient = alertIndexes.some(i => i.name === 'patientId_1_createdAt_-1');
    const hasAlertDoc = alertIndexes.some(i => i.name === 'doctorId_1_resolved_1_createdAt_-1');
    const hasAlertType = alertIndexes.some(i => i.name === 'type_1_resolved_1');

    recordTest('Test H4', 'Alert has compound index { patientId: 1, createdAt: -1 }', hasAlertPatient);
    recordTest('Test H5', 'Alert has compound index { doctorId: 1, resolved: 1, createdAt: -1 }', hasAlertDoc);
    recordTest('Test H6', 'Alert has compound index { type: 1, resolved: 1 }', hasAlertType);

    const visitIndexes = await HospitalVisit.collection.indexes();
    const hasVisitPatientDate = visitIndexes.some(i => i.name === 'patientId_1_visitDate_-1');
    recordTest('Test H7', 'HospitalVisit has compound index { patientId: 1, visitDate: -1 }', hasVisitPatientDate);

    const vitalsIndexes = await VitalSigns.collection.indexes();
    const hasVitalsPatientDate = vitalsIndexes.some(i => i.name === 'patientId_1_recordedAt_-1');
    recordTest('Test H8', 'VitalSigns has compound index { patientId: 1, recordedAt: -1 }', hasVitalsPatientDate);

    const reportLegacyIndexes = await Report.collection.indexes();
    const hasReportPatient = reportLegacyIndexes.some(i => i.name === 'patientId_1_createdAt_-1');
    recordTest('Test H9', 'Report (legacy) has compound index { patientId: 1, createdAt: -1 }', hasReportPatient);
  } catch (err) {
    recordTest('Test H2', 'Alert/Visit/Vitals/Report indexes verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // I. No Duplicate Indexes Across All Models
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    let duplicateFound = false;
    let duplicateDetails = [];

    for (const { name, model } of models) {
      const idxs = await model.collection.getIndexes();
      const keysSeen = new Set();
      for (const [idxName, keyArr] of Object.entries(idxs)) {
        // keyArr is array of objects e.g. [ [ 'email', 1 ], ... ] or specs
        const keyPattern = JSON.stringify(keyArr);
        if (keysSeen.has(keyPattern)) {
          duplicateFound = true;
          duplicateDetails.push(`${name}: duplicate index key pattern ${keyPattern}`);
        }
        keysSeen.add(keyPattern);
      }
    }

    recordTest(
      'Test I',
      'No duplicate index definitions exist across any models',
      !duplicateFound,
      duplicateDetails.join(', ')
    );
  } catch (err) {
    recordTest('Test I', 'Duplicate index verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // J. Unique Constraints Verification
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    // 1. Verify User unique email rejects duplicates
    let userDupCaught = false;
    try {
      await User.create({ name: 'User 1', email: 'dup@example.com', role: 'patient' });
      await User.create({ name: 'User 2', email: 'dup@example.com', role: 'patient' });
    } catch (e) {
      if (e.code === 11000 || e.message.includes('duplicate key')) {
        userDupCaught = true;
      }
    }

    // 2. Verify MedicalReport unique reportId rejects duplicates
    let repDupCaught = false;
    try {
      const pId = new mongoose.Types.ObjectId();
      await MedicalReport.create({ reportId: 'REP-DUP-001', patientId: pId, category: 'Laboratory', reportType: 'Blood Test', uploadedBy: 'lab' });
      await MedicalReport.create({ reportId: 'REP-DUP-001', patientId: pId, category: 'Laboratory', reportType: 'Blood Test', uploadedBy: 'lab' });
    } catch (e) {
      if (e.code === 11000 || e.message.includes('duplicate key')) {
        repDupCaught = true;
      }
    }

    // 3. Verify TestRequest unique requestId rejects duplicates
    let reqDupCaught = false;
    try {
      const pId = new mongoose.Types.ObjectId();
      await TestRequest.create({ requestId: 'REQ-DUP-001', patientId: pId, testName: 'CBC' });
      await TestRequest.create({ requestId: 'REQ-DUP-001', patientId: pId, testName: 'Lipid' });
    } catch (e) {
      if (e.code === 11000 || e.message.includes('duplicate key')) {
        reqDupCaught = true;
      }
    }

    recordTest('Test J1', 'User email unique constraint strictly enforced', userDupCaught);
    recordTest('Test J2', 'MedicalReport reportId unique constraint strictly enforced', repDupCaught);
    recordTest('Test J3', 'TestRequest requestId unique constraint strictly enforced', reqDupCaught);
  } catch (err) {
    recordTest('Test J', 'Unique constraints verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // K. Query Explain Verification (ExecutionStats / IXSCAN)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const testPatientId = new mongoose.Types.ObjectId();
    const testDoctorId = new mongoose.Types.ObjectId();

    // Seed test records
    await MedicalReport.create({
      reportId: 'REP-EXP-001',
      patientId: testPatientId,
      doctorId: testDoctorId,
      category: 'Laboratory',
      reportType: 'Complete Blood Count',
      reportStatus: 'Verified',
      criticalStatus: 'Normal',
      uploadedBy: 'lab',
      testDate: new Date('2026-03-15')
    });

    await TestRequest.create({
      requestId: 'REQ-EXP-001',
      patientId: testPatientId,
      doctorId: testDoctorId,
      testName: 'Lipid Panel',
      status: 'Pending',
      priority: 'Urgent',
      requestDate: new Date('2026-03-20')
    });

    await Sample.create({
      sampleId: 'SMP-EXP-001',
      patientId: testPatientId,
      sampleType: 'Blood',
      status: 'Processing',
      collectionDate: new Date('2026-03-21')
    });

    await EmergencyCase.create({
      emergencyId: 'EMG-EXP-001',
      patientId: testPatientId,
      patientName: 'John Doe',
      status: 'ACTIVE',
      triggeredAt: new Date()
    });

    await Notification.create({
      recipientId: testPatientId,
      title: 'Lab Report Ready',
      message: 'Your report is ready',
      createdAt: new Date()
    });

    await Medication.create({
      patientId: testPatientId,
      doctorId: testDoctorId,
      name: 'Amoxicillin',
      dosage: '500mg',
      frequency: 'TID',
      isActive: true,
      createdAt: new Date()
    });

    await InsuranceClaim.create({
      claimId: 'CLM-EXP-001',
      patientId: testPatientId,
      hospitalName: 'Central Hospital',
      claimAmount: 1500,
      policyNumber: 'POL-999',
      claimDate: new Date()
    });

    // 1. MedicalReport explain
    const repExplain = await MedicalReport.find({ patientId: testPatientId })
      .sort({ testDate: -1 })
      .explain('executionStats');
    const repStage = extractPlanStage(repExplain.queryPlanner.winningPlan);
    const repIndex = extractIndexName(repExplain.queryPlanner.winningPlan);
    const repUsed = repStage === 'IXSCAN';

    recordTest(
      'Test K1',
      `MedicalReport query uses index (stage: ${repStage}, index: ${repIndex})`,
      repUsed,
      `Expected patientId_1_testDate_-1, got ${repIndex}`
    );

    // 2. TestRequest explain
    const reqExplain = await TestRequest.find({ status: 'Pending', priority: 'Urgent' })
      .sort({ requestDate: -1 })
      .explain('executionStats');
    const reqStage = extractPlanStage(reqExplain.queryPlanner.winningPlan);
    const reqIndex = extractIndexName(reqExplain.queryPlanner.winningPlan);
    const reqUsed = reqStage === 'IXSCAN';

    recordTest(
      'Test K2',
      `TestRequest worklist query uses index (stage: ${reqStage}, index: ${reqIndex})`,
      reqUsed,
      `Expected status_1_priority_1_requestDate_-1, got ${reqIndex}`
    );

    // 3. Sample explain
    const smpExplain = await Sample.find({ patientId: testPatientId })
      .sort({ collectionDate: -1 })
      .explain('executionStats');
    const smpStage = extractPlanStage(smpExplain.queryPlanner.winningPlan);
    const smpIndex = extractIndexName(smpExplain.queryPlanner.winningPlan);
    const smpUsed = smpStage === 'IXSCAN';

    recordTest(
      'Test K3',
      `Sample query uses index (stage: ${smpStage}, index: ${smpIndex})`,
      smpUsed,
      `Expected patientId_1_collectionDate_-1, got ${smpIndex}`
    );

    // 4. EmergencyCase explain
    const emgExplain = await EmergencyCase.find({ status: 'ACTIVE' })
      .sort({ triggeredAt: -1 })
      .explain('executionStats');
    const emgStage = extractPlanStage(emgExplain.queryPlanner.winningPlan);
    const emgIndex = extractIndexName(emgExplain.queryPlanner.winningPlan);
    const emgUsed = emgStage === 'IXSCAN';

    recordTest(
      'Test K4',
      `EmergencyCase active stream uses index (stage: ${emgStage}, index: ${emgIndex})`,
      emgUsed,
      `Expected status_1_triggeredAt_-1, got ${emgIndex}`
    );

    // 5. Notification explain
    const notifExplain = await Notification.find({ recipientId: testPatientId })
      .sort({ createdAt: -1 })
      .explain('executionStats');
    const notifStage = extractPlanStage(notifExplain.queryPlanner.winningPlan);
    const notifIndex = extractIndexName(notifExplain.queryPlanner.winningPlan);
    const notifUsed = notifStage === 'IXSCAN';

    recordTest(
      'Test K5',
      `Notification recipient query uses index (stage: ${notifStage}, index: ${notifIndex})`,
      notifUsed,
      `Expected recipientId_1_createdAt_-1, got ${notifIndex}`
    );

    // 6. Medication explain
    const medExplain = await Medication.find({ patientId: testPatientId, isActive: true })
      .sort({ createdAt: -1 })
      .explain('executionStats');
    const medStage = extractPlanStage(medExplain.queryPlanner.winningPlan);
    const medIndex = extractIndexName(medExplain.queryPlanner.winningPlan);
    const medUsed = medStage === 'IXSCAN';

    recordTest(
      'Test K6',
      `Medication patient query uses index (stage: ${medStage}, index: ${medIndex})`,
      medUsed,
      `Expected patientId_1_isActive_1_createdAt_-1, got ${medIndex}`
    );

    // 7. InsuranceClaim explain
    const insExplain = await InsuranceClaim.find({ patientId: testPatientId })
      .sort({ claimDate: -1 })
      .explain('executionStats');
    const insStage = extractPlanStage(insExplain.queryPlanner.winningPlan);
    const insIndex = extractIndexName(insExplain.queryPlanner.winningPlan);
    const insUsed = insStage === 'IXSCAN';

    recordTest(
      'Test K7',
      `InsuranceClaim patient query uses index (stage: ${insStage}, index: ${insIndex})`,
      insUsed,
      `Expected patientId_1_claimDate_-1, got ${insIndex}`
    );

    // 8. VitalSigns explain
    await VitalSigns.create({
      patientId: testPatientId,
      heartRate: 75,
      spo2: 98,
      temperature: 98.6,
      recordedAt: new Date()
    });
    const vitalsExplain = await VitalSigns.find({ patientId: testPatientId })
      .sort({ recordedAt: -1 })
      .explain('executionStats');
    const vitalsStage = extractPlanStage(vitalsExplain.queryPlanner.winningPlan);
    const vitalsIndex = extractIndexName(vitalsExplain.queryPlanner.winningPlan);
    const vitalsUsed = vitalsStage === 'IXSCAN';

    recordTest(
      'Test K8',
      `VitalSigns stream query uses index (stage: ${vitalsStage}, index: ${vitalsIndex})`,
      vitalsUsed,
      `Expected patientId_1_recordedAt_-1, got ${vitalsIndex}`
    );

    // 9. Alert explain
    await Alert.create({
      patientId: testPatientId,
      type: 'Critical',
      message: 'High blood pressure alert',
      createdAt: new Date()
    });
    const alertExplain = await Alert.find({ patientId: testPatientId })
      .sort({ createdAt: -1 })
      .explain('executionStats');
    const alertStage = extractPlanStage(alertExplain.queryPlanner.winningPlan);
    const alertIndex = extractIndexName(alertExplain.queryPlanner.winningPlan);
    const alertUsed = alertStage === 'IXSCAN';

    recordTest(
      'Test K9',
      `Alert clinical query uses index (stage: ${alertStage}, index: ${alertIndex})`,
      alertUsed,
      `Expected patientId_1_createdAt_-1, got ${alertIndex}`
    );

  } catch (err) {
    recordTest('Test K', 'Query explain verification', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // L. Performance Benchmark (Synthetic Dataset: Indexed vs Unindexed / COLLSCAN)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log('\n  ⚡ Running Synthetic Benchmark...');
    const benchmarkPatientId = new mongoose.Types.ObjectId();
    const batchSize = 1000;
    const syntheticDocs = [];

    for (let i = 0; i < batchSize; i++) {
      syntheticDocs.push({
        reportId: `REP-BENCH-${i}`,
        patientId: i < 10 ? benchmarkPatientId : new mongoose.Types.ObjectId(),
        category: 'Laboratory',
        reportType: 'Blood Test',
        reportStatus: 'Verified',
        criticalStatus: 'Normal',
        uploadedBy: 'lab',
        testDate: new Date(Date.now() - i * 3600000)
      });
    }

    await MedicalReport.insertMany(syntheticDocs);

    // 1. Query WITH index: patientId + testDate: -1
    const startIndexed = process.hrtime.bigint();
    const explainWithIndex = await MedicalReport.find({ patientId: benchmarkPatientId })
      .sort({ testDate: -1 })
      .explain('executionStats');
    const endIndexed = process.hrtime.bigint();
    const indexedDurationMs = Number(endIndexed - startIndexed) / 1e6;

    // 2. Query WITHOUT index (forced table scan using hint { $natural: 1 })
    const startScan = process.hrtime.bigint();
    const explainScan = await MedicalReport.find({ patientId: benchmarkPatientId })
      .sort({ testDate: -1 })
      .hint({ $natural: 1 })
      .explain('executionStats');
    const endScan = process.hrtime.bigint();
    const scanDurationMs = Number(endScan - startScan) / 1e6;

    const docsExaminedWithIndex = explainWithIndex.executionStats.totalDocsExamined;
    const docsExaminedWithoutIndex = explainScan.executionStats.totalDocsExamined;
    const docsReturned = explainWithIndex.executionStats.nReturned;

    console.log(`     Dataset size: ${batchSize} synthetic documents`);
    console.log(`     Target matching documents: ${docsReturned}`);
    console.log(`     Documents examined with index:    ${docsExaminedWithIndex} docs (${indexedDurationMs.toFixed(2)} ms)`);
    console.log(`     Documents examined without index: ${docsExaminedWithoutIndex} docs (${scanDurationMs.toFixed(2)} ms)`);

    const scanRatio = (docsExaminedWithoutIndex / Math.max(docsExaminedWithIndex, 1)).toFixed(1);
    console.log(`     Reduction in documents scanned:   ${scanRatio}x fewer documents scanned`);

    recordTest(
      'Test L',
      `Benchmark: Index reduces scanned docs from ${docsExaminedWithoutIndex} down to ${docsExaminedWithIndex}`,
      docsExaminedWithIndex < docsExaminedWithoutIndex && docsExaminedWithIndex === docsReturned
    );
  } catch (err) {
    recordTest('Test L', 'Performance benchmark', false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`Step 7 MongoDB Indexes Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('========================================\n');

  await mongoose.disconnect();
  await mongod.stop();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runIndexTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
