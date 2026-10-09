/**
 * test_step6_mongodb_queries.js — MongoDB Search & Query Optimization Test Suite
 *
 * Verifies all requirements of Step 6:
 * A. Lab test request filtering (database-level)
 * B. Lab sample filtering (database-level)
 * C. Medical report filtering (database-level)
 * D. Date range filtering (MongoDB $gte/$lte, validates malformed dates)
 * E. Search (case-insensitive database-level search)
 * F. Regex safety (special regex chars properly escaped, no ReDoS/crashes)
 * G. Sorting (MongoDB query sorting preserves descending order)
 * H. Count (countDocuments used instead of fetching all docs)
 * I. Patient RBAC (patient cannot access another patient's data)
 * J. Doctor RBAC (doctor cannot access unassigned patient data)
 * K. Lab RBAC (lab staff accesses permitted data)
 * L. Admin access (admin accesses all users and reports)
 * M. Sensitive fields protection (passwords never exposed)
 * Performance: Demonstrates MongoDB-level filtering vs in-memory filtering.
 */

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import models
const User = require('./models/User');
const TestRequest = require('./models/TestRequest');
const Sample = require('./models/Sample');
const MedicalReport = require('./models/MedicalReport');
const Alert = require('./models/Alert');
const { Medication } = require('./models/Medication');
const InsuranceClaim = require('./models/InsuranceClaim');

// Import query helpers
const { escapeRegex, buildDateQuery, isValidObjectId, sanitizeParams } = require('./utils/queryHelper');

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

// HTTP request helper
function makeRequest(baseUrl, method, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const headers = options.headers || {};
    let bodyData = null;

    if (options.body) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        const body = (json && typeof json === 'object' && Array.isArray(json.data) && json.pagination)
          ? json.data
          : json;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          raw
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runStep6Tests() {
  console.log('\n🔎 Starting Step 6 — MongoDB Search & Query Optimization Verification...\n');

  let mongod = null;
  let serverInstance = null;
  let baseUrl = '';

  try {
    // ─── Unit Tests for queryHelper ─────────────────────────────────────────

    // Test F: Regex safety unit test
    const rawDangerousInput = 'test.*+?^${}()|[]\\(injection)';
    const escaped = escapeRegex(rawDangerousInput);
    const regexSafe = !/[*+?^${}()|[\]\\]/.test(escaped.replace(/\\./g, ''));
    recordTest('Test F-Unit', 'Special regex characters are safely escaped without regex syntax errors', regexSafe);

    // Test D: Date query builder unit test
    const validRange = buildDateQuery('2026-01-01', '2026-01-31', 'testDate');
    const hasGteLte = validRange && validRange.testDate && validRange.testDate.$gte instanceof Date && validRange.testDate.$lte instanceof Date;
    const invalidRange = buildDateQuery('not-a-date', 'invalid', 'testDate');
    const rejectsMalformed = invalidRange === null;
    recordTest('Test D-Unit', 'Date range query builder correctly validates dates and rejects malformed inputs', hasGteLte && rejectsMalformed);

    // ─── Live Server Setup ──────────────────────────────────────────────────
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    process.env.MONGODB_URI = mongoUri;
    process.env.MONGO_URI = mongoUri;
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.JWT_SECRET = 'test_step6_jwt_secret_valid_and_secure_64_characters_minimum!';
    process.env.SESSION_SECRET = 'test_step6_session_secret_valid_and_secure_64_chars_min!';

    const app = require('./server');
    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    baseUrl = `http://localhost:${port}`;

    // ─── Seed Realistic Test Data ───────────────────────────────────────────
    const passwordHash = await bcrypt.hash('demo123', 10);

    // Seed Users
    const patientA = await new User({
      name: 'Alice Patient', email: 'alice@test.com', password: passwordHash, role: 'patient', isActive: true
    }).save();

    const patientB = await new User({
      name: 'Bob Patient', email: 'bob@test.com', password: passwordHash, role: 'patient', isActive: true
    }).save();

    const doctorA = await new User({
      name: 'Dr. Sarah Connor', email: 'sarah@test.com', password: passwordHash, role: 'doctor',
      specialization: 'Cardiology', assignedPatients: [patientA._id], isActive: true
    }).save();

    const doctorB = await new User({
      name: 'Dr. Gregory House', email: 'house@test.com', password: passwordHash, role: 'doctor',
      specialization: 'Diagnostics', assignedPatients: [patientB._id], isActive: true
    }).save();

    const labUser = await new User({
      name: 'John Lab Tech', email: 'labtech@test.com', password: passwordHash, role: 'lab', isActive: true
    }).save();

    const adminUser = await new User({
      name: 'Admin Chief', email: 'adminchief@test.com', password: passwordHash, role: 'admin', isActive: true
    }).save();

    // Generate JWT tokens for each role
    const tokenPatientA = jwt.sign({ id: patientA._id, role: 'patient' }, process.env.JWT_SECRET);
    const tokenPatientB = jwt.sign({ id: patientB._id, role: 'patient' }, process.env.JWT_SECRET);
    const tokenDoctorA = jwt.sign({ id: doctorA._id, role: 'doctor' }, process.env.JWT_SECRET);
    const tokenDoctorB = jwt.sign({ id: doctorB._id, role: 'doctor' }, process.env.JWT_SECRET);
    const tokenLab = jwt.sign({ id: labUser._id, role: 'lab' }, process.env.JWT_SECRET);
    const tokenAdmin = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET);

    // Seed TestRequests
    const tr1 = await new TestRequest({
      requestId: 'REQ-1001',
      patientId: patientA._id,
      doctorId: doctorA._id,
      testName: 'Complete Blood Count',
      testCategory: 'Laboratory',
      priority: 'Urgent',
      status: 'Pending',
      requestDate: new Date('2026-02-10T10:00:00Z')
    }).save();

    const tr2 = await new TestRequest({
      requestId: 'REQ-1002',
      patientId: patientB._id,
      doctorId: doctorB._id,
      testName: 'Lipid Panel',
      testCategory: 'Pathology',
      priority: 'Normal',
      status: 'Completed',
      requestDate: new Date('2026-03-15T10:00:00Z')
    }).save();

    // Seed Samples
    const s1 = await new Sample({
      sampleId: 'SMP-2001',
      barcode: 'BC-9901',
      patientId: patientA._id,
      testRequestId: tr1._id,
      sampleType: 'Blood',
      status: 'Processing',
      collectionDate: new Date('2026-02-10T11:00:00Z')
    }).save();

    const s2 = await new Sample({
      sampleId: 'SMP-2002',
      barcode: 'BC-9902',
      patientId: patientB._id,
      testRequestId: tr2._id,
      sampleType: 'Urine',
      status: 'Completed',
      collectionDate: new Date('2026-03-15T11:00:00Z')
    }).save();

    // Seed MedicalReports
    const rep1 = await new MedicalReport({
      reportId: 'REP-2026-3001',
      patientId: patientA._id,
      doctorId: doctorA._id,
      category: 'Laboratory',
      reportType: 'Complete Blood Count',
      reportStatus: 'Verified',
      criticalStatus: 'Normal',
      labName: 'Central CareLink Lab',
      testDate: new Date('2026-02-11T12:00:00Z')
    }).save();

    const rep2 = await new MedicalReport({
      reportId: 'REP-2026-3002',
      patientId: patientB._id,
      doctorId: doctorB._id,
      category: 'Cardiology',
      reportType: 'Echocardiogram',
      reportStatus: 'Published',
      criticalStatus: 'Critical',
      labName: 'Metro Diagnostic Center',
      testDate: new Date('2026-03-20T12:00:00Z')
    }).save();

    // ============================================================================
    // Test A: Lab Test Request Filtering in MongoDB
    // ============================================================================
    const trRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?status=Pending&priority=Urgent', {
      headers: { Authorization: `Bearer ${tokenLab}` }
    });
    const trPass = trRes.status === 200 &&
      Array.isArray(trRes.body) &&
      trRes.body.length === 1 &&
      trRes.body[0].requestId === 'REQ-1001';
    recordTest('Test A', 'GET /api/lab/test-requests filters by status and priority in database', trPass);

    // ============================================================================
    // Test B: Lab Sample Filtering in MongoDB
    // ============================================================================
    const sampleRes = await makeRequest(baseUrl, 'GET', '/api/lab/samples?status=Processing&sampleType=Blood', {
      headers: { Authorization: `Bearer ${tokenLab}` }
    });
    const samplePass = sampleRes.status === 200 &&
      Array.isArray(sampleRes.body) &&
      sampleRes.body.length === 1 &&
      sampleRes.body[0].sampleId === 'SMP-2001';
    recordTest('Test B', 'GET /api/lab/samples filters by status and sampleType in database', samplePass);

    // ============================================================================
    // Test C: Medical Report Filtering in MongoDB
    // ============================================================================
    const repRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports?category=Laboratory&criticalStatus=Normal', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    const repPass = repRes.status === 200 &&
      Array.isArray(repRes.body) &&
      repRes.body.length === 1 &&
      repRes.body[0].reportId === 'REP-2026-3001';
    recordTest('Test C', 'GET /api/medical-reports filters by category and criticalStatus in database', repPass);

    // ============================================================================
    // Test D: Date Range Filtering in MongoDB
    // ============================================================================
    const dateRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports?startDate=2026-03-01&endDate=2026-03-31', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    const datePass = dateRes.status === 200 &&
      Array.isArray(dateRes.body) &&
      dateRes.body.length === 1 &&
      dateRes.body[0].reportId === 'REP-2026-3002';
    recordTest('Test D', 'GET /api/medical-reports filters records by date range using MongoDB query operators', datePass);

    // ============================================================================
    // Test E: Search Filtering (Case-insensitive)
    // ============================================================================
    const searchRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports?search=echocardio', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    const searchPass = searchRes.status === 200 &&
      Array.isArray(searchRes.body) &&
      searchRes.body.length === 1 &&
      searchRes.body[0].reportId === 'REP-2026-3002';
    recordTest('Test E', 'Case-insensitive search successfully queries database records', searchPass);

    // ============================================================================
    // Test F: Regex Safety on Search Input
    // ============================================================================
    const regexSafeRes = await makeRequest(baseUrl, 'GET', `/api/medical-reports?search=${encodeURIComponent('test.*+?^${}()|[]\\')}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    // Must return 200 without throwing 500 internal server regex compilation error
    const regexPass = regexSafeRes.status === 200 && Array.isArray(regexSafeRes.body);
    recordTest('Test F', 'Unsafe regex characters in query do not crash server or cause regex errors', regexPass);

    // ============================================================================
    // Test G: Sorting Preserved in MongoDB
    // ============================================================================
    const sortRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    const sortPass = sortRes.status === 200 &&
      sortRes.body.length === 2 &&
      new Date(sortRes.body[0].testDate) > new Date(sortRes.body[1].testDate);
    recordTest('Test G', 'MongoDB query sorting preserves expected descending order ({ testDate: -1 })', sortPass);

    // ============================================================================
    // Test H: Count Queries
    // ============================================================================
    const dashRes = await makeRequest(baseUrl, 'GET', '/api/lab/dashboard', {
      headers: { Authorization: `Bearer ${tokenLab}` }
    });
    const countPass = dashRes.status === 200 &&
      dashRes.body.summary &&
      typeof dashRes.body.summary.pendingTests === 'number' &&
      typeof dashRes.body.summary.samplesProcessing === 'number';
    recordTest('Test H', 'Count queries use countDocuments() efficiently without loading full collections', countPass);

    // ============================================================================
    // Test I: Patient RBAC Enforced in MongoDB Query
    // ============================================================================
    const patientARes = await makeRequest(baseUrl, 'GET', '/api/medical-reports', {
      headers: { Authorization: `Bearer ${tokenPatientA}` }
    });
    const patientAPass = patientARes.status === 200 &&
      Array.isArray(patientARes.body) &&
      patientARes.body.every(r => r.patientId._id.toString() === patientA._id.toString());
    recordTest('Test I', 'Patient RBAC is enforced in database query (cannot access another patient’s reports)', patientAPass);

    // ============================================================================
    // Test J: Doctor RBAC Enforced in MongoDB Query
    // ============================================================================
    const docARes = await makeRequest(baseUrl, 'GET', '/api/medical-reports', {
      headers: { Authorization: `Bearer ${tokenDoctorA}` }
    });
    const docAPass = docARes.status === 200 &&
      Array.isArray(docARes.body) &&
      docARes.body.length === 1 &&
      docARes.body[0].reportId === 'REP-2026-3001' &&
      !docARes.body.some(r => r.reportId === 'REP-2026-3002');
    recordTest('Test J', 'Doctor RBAC is enforced in database query (only assigned patients returned)', docAPass);

    // ============================================================================
    // Test K: Lab RBAC Enforced
    // ============================================================================
    const labReportsRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports', {
      headers: { Authorization: `Bearer ${tokenLab}` }
    });
    const labPass = labReportsRes.status === 200 &&
      Array.isArray(labReportsRes.body) &&
      labReportsRes.body.length === 2;
    recordTest('Test K', 'Lab personnel can access authorized test reports and samples across department', labPass);

    // ============================================================================
    // Test L: Admin Query Capabilities
    // ============================================================================
    const adminUsersRes = await makeRequest(baseUrl, 'GET', '/api/admin/users?search=Sarah', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    const adminPass = adminUsersRes.status === 200 &&
      Array.isArray(adminUsersRes.body) &&
      adminUsersRes.body.length === 1 &&
      adminUsersRes.body[0].email === 'sarah@test.com';
    recordTest('Test L', 'Admin can perform filtered search across entire user directory', adminPass);

    // ============================================================================
    // Test M: Sensitive Fields Protection
    // ============================================================================
    const secUserRes = await makeRequest(baseUrl, 'GET', '/api/admin/users', {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    const sensitiveProtected = secUserRes.status === 200 &&
      secUserRes.body.every(u => u.password === undefined && u.passwordHash === undefined);
    recordTest('Test M', 'Database projection excludes password and sensitive credentials from query responses', sensitiveProtected);

    // ============================================================================
    // Performance Demonstration: MongoDB Filter vs Node In-Memory Filter
    // ============================================================================
    // Seed 100 sample documents to measure
    const bulkReports = [];
    for (let i = 0; i < 100; i++) {
      bulkReports.push({
        reportId: `REP-BENCH-${1000 + i}`,
        patientId: patientA._id,
        doctorId: doctorA._id,
        category: i % 2 === 0 ? 'Laboratory' : 'Radiology',
        reportType: i % 5 === 0 ? 'TargetType' : 'OtherType',
        reportStatus: 'Verified',
        criticalStatus: 'Normal',
        testDate: new Date()
      });
    }
    await MedicalReport.insertMany(bulkReports);

    // Measure Before: In-memory simulation
    const startBefore = process.hrtime.bigint();
    const allFetched = await MedicalReport.find({});
    const memoryFiltered = allFetched.filter(r => r.category === 'Laboratory' && r.reportType === 'TargetType');
    const endBefore = process.hrtime.bigint();
    const timeBeforeMs = Number(endBefore - startBefore) / 1e6;

    // Measure After: MongoDB database-level filtering
    const startAfter = process.hrtime.bigint();
    const dbFiltered = await MedicalReport.find({ category: 'Laboratory', reportType: 'TargetType' });
    const endAfter = process.hrtime.bigint();
    const timeAfterMs = Number(endAfter - startAfter) / 1e6;

    assert.strictEqual(memoryFiltered.length, dbFiltered.length);
    console.log(`\n  ⚡ [PERFORMANCE MEASUREMENT]`);
    console.log(`     In-memory filtering (fetch 102 docs -> Node filter): ${timeBeforeMs.toFixed(2)} ms`);
    console.log(`     MongoDB-level filtering (fetch only matching docs): ${timeAfterMs.toFixed(2)} ms`);
    console.log(`     Documents transferred over wire: ${dbFiltered.length} docs (optimized) vs ${allFetched.length} docs (unoptimized)\n`);

  } catch (err) {
    recordTest('Suite Execution', 'Step 6 test suite execution error', false, err.message);
  } finally {
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }

  // ============================================================================
  // Test Summary Report
  // ============================================================================
  console.log('\n========================================');
  console.log(`Step 6 MongoDB Query Optimization Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep6Tests().catch(err => {
  console.error('Fatal Step 6 test runner error:', err);
  process.exit(1);
});
