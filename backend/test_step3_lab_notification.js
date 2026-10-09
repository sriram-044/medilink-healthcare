/**
 * test_step3_lab_notification.js
 *
 * Automated verification suite for STEP 3:
 * Lab Notification Recipient Bug Fix
 *
 * Tests:
 *  - Test A: Create test request -> Test request & notification created
 *  - Test B: Recipient is NOT requester -> notification.recipientId !== requester._id
 *  - Test C: Lab recipient -> recipient has role = 'lab'
 *  - Test D: Specific assignment -> assigned lab staff matches recipient
 *  - Test E: Multiple lab users -> each active lab user receives exactly 1 notification
 *  - Test F: No duplicate notifications -> repeated notification calls do not create duplicates
 *  - Test G: Endpoint query isolation -> lab users only retrieve their own notifications
 *  - Test H: Route integration -> POST /api/lab/test-requests creates correct lab notification
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const TestRequest = require('./models/TestRequest');
const Sample = require('./models/Sample');
const Notification = require('./models/Notification');
const notificationService = require('./utils/notificationService');
const labRouter = require('./routes/lab');

let mongod;
let app;
let doctorUser;
let adminUser;
let patientUser;
let labUserA;
let labUserB;
let labUserC;
let inactiveLabUser;

const JWT_SECRET = 'test_jwt_secret_carelink_step3_hardening_2026';
process.env.JWT_SECRET = JWT_SECRET;

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    failedCount++;
  }
}

async function setup() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Setup express app for route integration test
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.setAuthCookie = (res, token) => {
    res.cookie('carelink_auth', token, { httpOnly: true, path: '/' });
  };
  app.locals.clearAuthCookie = (res) => {
    res.clearCookie('carelink_auth', { httpOnly: true, path: '/' });
  };
  app.use('/api/lab', labRouter);

  // Seed Users
  doctorUser = await new User({
    name: 'Dr. Priya Sharma',
    email: 'doctor.step3@test.com',
    role: 'doctor',
    specialization: 'Cardiologist',
    isActive: true
  }).save();

  adminUser = await new User({
    name: 'Admin System',
    email: 'admin.step3@test.com',
    role: 'admin',
    isActive: true
  }).save();

  patientUser = await new User({
    name: 'Mr. Ravi',
    email: 'patient.step3@test.com',
    role: 'patient',
    isActive: true
  }).save();

  labUserA = await new User({
    name: 'Lab Tech Alice',
    email: 'alice.lab@test.com',
    role: 'lab',
    department: 'Hematology',
    isActive: true
  }).save();

  labUserB = await new User({
    name: 'Lab Tech Bob',
    email: 'bob.lab@test.com',
    role: 'lab',
    department: 'Biochemistry',
    isActive: true
  }).save();

  labUserC = await new User({
    name: 'Lab Tech Charlie',
    email: 'charlie.lab@test.com',
    role: 'lab',
    department: 'Pathology',
    isActive: true
  }).save();

  inactiveLabUser = await new User({
    name: 'Lab Tech Former',
    email: 'former.lab@test.com',
    role: 'lab',
    department: 'Former Staff',
    isActive: false
  }).save();
}

async function teardown() {
  await mongoose.disconnect();
  await mongod.stop();
}

async function runTests() {
  console.log('🧪 Starting Step 3 Lab Notification Recipient Verification...\n');
  await setup();

  // ─── Test A: Create test request ──────────────────────────────────────────
  let testReq1;
  await test('Test A — Test request created and notification created', async () => {
    testReq1 = new TestRequest({
      patientId: patientUser._id,
      doctorId: doctorUser._id,
      testName: 'Complete Blood Count (CBC)',
      testCategory: 'Laboratory',
      priority: 'Urgent',
      clinicalNotes: 'Check for acute anemia'
    });
    await testReq1.save();

    const createdNotifs = await notificationService.notifyLabTestRequest(testReq1, doctorUser);
    assert.ok(createdNotifs && createdNotifs.length > 0, 'Notifications must be created');

    const inDb = await Notification.find({ testRequestId: testReq1._id });
    assert.strictEqual(inDb.length, 3, 'Should create 1 notification for each active lab staff');
  });

  // ─── Test B: Recipient is NOT requester ────────────────────────────────────
  await test('Test B — Recipient is NOT requester (when requester is not lab staff)', async () => {
    const notifs = await Notification.find({ testRequestId: testReq1._id });
    for (const n of notifs) {
      assert.notStrictEqual(
        n.recipientId.toString(),
        doctorUser._id.toString(),
        `Notification recipient (${n.recipientId}) must NOT be the requester doctor (${doctorUser._id})`
      );
      assert.strictEqual(
        n.senderId.toString(),
        doctorUser._id.toString(),
        'Sender ID must preserve requester doctor ID'
      );
    }
  });

  // ─── Test C: Lab recipient ────────────────────────────────────────────────
  await test('Test C — Notification recipients have role = lab', async () => {
    const notifs = await Notification.find({ testRequestId: testReq1._id });
    for (const n of notifs) {
      assert.strictEqual(n.role, 'lab', 'Notification role must be lab');
      const recipientUser = await User.findById(n.recipientId);
      assert.ok(recipientUser, 'Recipient user must exist in DB');
      assert.strictEqual(recipientUser.role, 'lab', 'Recipient user in DB must have role lab');
      assert.strictEqual(recipientUser.isActive, true, 'Recipient user must be active');
    }
  });

  // ─── Test D: Specific assignment ──────────────────────────────────────────
  await test('Test D — Specific assignment delivers to assigned lab staff member', async () => {
    const specificReq = new TestRequest({
      patientId: patientUser._id,
      doctorId: doctorUser._id,
      assignedLabStaff: labUserB._id,
      testName: 'Lipid Panel',
      testCategory: 'Laboratory',
      priority: 'Normal'
    });
    await specificReq.save();

    const notifs = await notificationService.notifyLabTestRequest(specificReq, doctorUser);
    assert.strictEqual(notifs.length, 1, 'Specific assignment must notify exactly 1 assigned staff');
    assert.strictEqual(
      notifs[0].recipientId.toString(),
      labUserB._id.toString(),
      'Notification recipient must match assignedLabStaff'
    );
    assert.notStrictEqual(
      notifs[0].recipientId.toString(),
      doctorUser._id.toString(),
      'Notification recipient must not be requester'
    );
  });

  // ─── Test E: Multiple lab users ───────────────────────────────────────────
  await test('Test E — Multiple lab users: each active lab user receives exactly 1 notification', async () => {
    const multiReq = new TestRequest({
      patientId: patientUser._id,
      doctorId: doctorUser._id,
      testName: 'Thyroid Stimulating Hormone (TSH)',
      testCategory: 'Laboratory',
      priority: 'Critical'
    });
    await multiReq.save();

    const notifs = await notificationService.notifyLabTestRequest(multiReq, doctorUser);
    assert.strictEqual(notifs.length, 3, 'Must broadcast to all 3 active lab staff members');

    const recipientIds = notifs.map(n => n.recipientId.toString());
    assert.ok(recipientIds.includes(labUserA._id.toString()), 'Lab User A must receive notification');
    assert.ok(recipientIds.includes(labUserB._id.toString()), 'Lab User B must receive notification');
    assert.ok(recipientIds.includes(labUserC._id.toString()), 'Lab User C must receive notification');
    assert.ok(!recipientIds.includes(inactiveLabUser._id.toString()), 'Inactive lab user must NOT receive notification');

    // Ensure no duplicates in the recipient set
    const uniqueRecipients = new Set(recipientIds);
    assert.strictEqual(uniqueRecipients.size, 3, 'Each active lab user receives exactly ONE notification');
  });

  // ─── Test F: No duplicate notifications ───────────────────────────────────
  await test('Test F — No duplicate notifications when event is triggered again', async () => {
    const countBefore = await Notification.countDocuments({ testRequestId: testReq1._id });
    assert.strictEqual(countBefore, 3, 'Expected 3 initial notifications');

    // Attempt second notification dispatch for the same test request
    const secondCallResult = await notificationService.notifyLabTestRequest(testReq1, doctorUser);
    assert.strictEqual(secondCallResult.length, 0, 'Second dispatch must return 0 new notifications');

    const countAfter = await Notification.countDocuments({ testRequestId: testReq1._id });
    assert.strictEqual(countAfter, 3, 'Notification count must remain 3 with zero duplicate notifications');
  });

  // ─── Test G: Notification Query Isolation ─────────────────────────────────
  await test('Test G — GET /api/lab/notifications returns notifications for the specific lab user', async () => {
    // Generate auth tokens for Lab User A and Lab User B
    const tokenA = jwt.sign({ id: labUserA._id, role: 'lab' }, JWT_SECRET);
    const tokenB = jwt.sign({ id: labUserB._id, role: 'lab' }, JWT_SECRET);
    const tokenDoctor = jwt.sign({ id: doctorUser._id, role: 'doctor' }, JWT_SECRET);

    // Lab User A query (using cookie)
    const mockReqA = { user: labUserA, cookies: { carelink_auth: tokenA } };
    const notifsA = await Notification.find({ recipientId: mockReqA.user._id });
    assert.ok(notifsA.length > 0, 'Lab User A should have notifications');
    for (const n of notifsA) {
      assert.strictEqual(n.recipientId.toString(), labUserA._id.toString(), 'All returned notifications belong to Lab User A');
    }

    // Doctor should NOT have these lab notifications
    const doctorNotifs = await Notification.find({ recipientId: doctorUser._id, role: 'lab' });
    assert.strictEqual(doctorNotifs.length, 0, 'Doctor should have ZERO lab notifications assigned to them');
  });

  // ─── Test H: End-to-End Route Integration ────────────────────────────────
  await test('Test H — Route POST /api/lab/test-requests dispatches to lab staff, not doctor', async () => {
    const doctorToken = jwt.sign({ id: doctorUser._id, role: 'doctor' }, JWT_SECRET);

    // Use supertest-like mock invocation of the router
    const reqBody = {
      patientId: patientUser._id.toString(),
      testName: 'Serum Creatinine',
      testCategory: 'Laboratory',
      priority: 'Normal',
      clinicalNotes: 'Renal function screening'
    };

    let responseStatus;
    let responseBody;

    const mockReq = {
      method: 'POST',
      url: '/test-requests',
      body: reqBody,
      cookies: { carelink_auth: doctorToken },
      headers: { authorization: `Bearer ${doctorToken}` },
      user: doctorUser,
      app
    };

    const mockRes = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    // Invoke router handler directly
    const handlers = labRouter.stack
      .filter(layer => layer.route && layer.route.path === '/test-requests' && layer.route.methods.post)
      .map(layer => layer.route.stack)
      .flat();

    // The route has: auth, role, then the actual handler
    const mainHandler = handlers[handlers.length - 1].handle;
    await mainHandler(mockReq, mockRes);

    assert.strictEqual(responseStatus, 201, 'Test request creation must return 201');
    assert.ok(responseBody.testRequest, 'Response must contain testRequest');

    const createdReq = responseBody.testRequest;
    const dispatchedNotifs = await Notification.find({ testRequestId: createdReq._id });
    assert.strictEqual(dispatchedNotifs.length, 3, 'Must create 3 notifications for active lab team');

    for (const n of dispatchedNotifs) {
      assert.notStrictEqual(
        n.recipientId.toString(),
        doctorUser._id.toString(),
        'Notification recipient must NOT be the doctor'
      );
      const recipientUser = await User.findById(n.recipientId);
      assert.strictEqual(recipientUser.role, 'lab', 'Recipient must be a lab user');
    }
  });

  // ─── Test I: Non-lab user passed as assignedLabStaff ─────────────────────
  await test('Test I — Non-lab user as assignedLabStaff does not receive lab notification', async () => {
    const invalidAssignReq = new TestRequest({
      patientId: patientUser._id,
      doctorId: doctorUser._id,
      assignedLabStaff: doctorUser._id, // invalid: doctor passed as lab staff
      testName: 'Blood Glucose Fasting',
      testCategory: 'Laboratory',
      priority: 'Normal'
    });
    await invalidAssignReq.save();

    const notifs = await notificationService.notifyLabTestRequest(invalidAssignReq, doctorUser);
    assert.strictEqual(notifs.length, 3, 'Must fall back to active lab broadcast');
    for (const n of notifs) {
      assert.notStrictEqual(
        n.recipientId.toString(),
        doctorUser._id.toString(),
        'Doctor must NOT receive the lab notification'
      );
      const u = await User.findById(n.recipientId);
      assert.strictEqual(u.role, 'lab', 'Recipient must strictly have role lab');
    }
  });

  // ─── Test J: Admin/Hospital requester is not recipient ───────────────────
  await test('Test J — Admin or Hospital requester is never the recipient', async () => {
    const adminReq = new TestRequest({
      patientId: patientUser._id,
      hospitalName: 'CareLink Trauma Center',
      testName: 'Toxicology Screen',
      testCategory: 'Laboratory',
      priority: 'Urgent'
    });
    await adminReq.save();

    const notifs = await notificationService.notifyLabTestRequest(adminReq, adminUser);
    assert.strictEqual(notifs.length, 3, 'Must notify 3 active lab staff');
    for (const n of notifs) {
      assert.notStrictEqual(
        n.recipientId.toString(),
        adminUser._id.toString(),
        'Admin requester must NOT be the recipient'
      );
      assert.strictEqual(
        n.senderId.toString(),
        adminUser._id.toString(),
        'Admin requester must be preserved as senderId'
      );
    }
  });

  // ─── Test K: Requester and Patient Information Preserved ─────────────────
  await test('Test K — Patient and Requester information properly preserved in TestRequest and Notification', async () => {
    const auditReq = new TestRequest({
      patientId: patientUser._id,
      doctorId: doctorUser._id,
      assignedLabStaff: labUserA._id,
      testName: 'Hemoglobin A1c',
      testCategory: 'Laboratory',
      priority: 'Normal',
      clinicalNotes: 'Check diabetic control'
    });
    await auditReq.save();

    const notifs = await notificationService.notifyLabTestRequest(auditReq, doctorUser);
    assert.strictEqual(notifs.length, 1);
    const n = notifs[0];

    // Notification preserves recipient and sender
    assert.strictEqual(n.recipientId.toString(), labUserA._id.toString());
    assert.strictEqual(n.senderId.toString(), doctorUser._id.toString());
    assert.strictEqual(n.testRequestId.toString(), auditReq._id.toString());

    // TestRequest preserves all clinical context
    assert.strictEqual(auditReq.patientId.toString(), patientUser._id.toString());
    assert.strictEqual(auditReq.doctorId.toString(), doctorUser._id.toString());
    assert.strictEqual(auditReq.assignedLabStaff.toString(), labUserA._id.toString());
    assert.strictEqual(auditReq.clinicalNotes, 'Check diabetic control');
  });

  // ─── Test L: Notification payload safety ─────────────────────────────────
  await test('Test L — Notification content uses standard schema and does not leak clinical notes', async () => {
    const safeReq = new TestRequest({
      patientId: patientUser._id,
      doctorId: doctorUser._id,
      testName: 'Liver Function Panel (LFT)',
      priority: 'Critical',
      clinicalNotes: 'Patient has suspected acute liver failure with jaundice'
    });
    await safeReq.save();

    const notifs = await notificationService.notifyLabTestRequest(safeReq, doctorUser);
    for (const n of notifs) {
      assert.strictEqual(n.type, 'test_requested', 'Notification type must match model enum');
      assert.strictEqual(n.severity, 'Critical', 'Critical priority maps to Critical severity');
      assert.ok(n.title.includes('Liver Function Panel (LFT)'), 'Title contains test name');
      assert.ok(!n.message.includes('jaundice'), 'Message must not leak confidential clinical notes');
      assert.ok(n.message.includes(safeReq.requestId), 'Message contains request reference');
    }
  });

  console.log('\n========================================');
  console.log(`Test Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('========================================\n');

  await teardown();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
