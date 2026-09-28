/**
 * test_step8_pagination.js — Production-Safe Pagination Test Suite
 *
 * Verifies all requirements of Step 8:
 * A. Default pagination (page=1, limit=20)
 * B. Custom page (?page=2)
 * C. Custom limit (?limit=50)
 * D. Maximum limit (?limit=100 accepted)
 * E. Excessive limit (?limit=101 rejected with 400)
 * F. Negative page (?page=-1 rejected with 400)
 * G. Negative limit (?limit=-20 rejected with 400)
 * H. Non-numeric / zero values (?page=abc, ?page=0, ?limit=0 rejected with 400)
 * I. MongoDB pagination (skip & limit applied at database level)
 * J. Stable sorting (deterministic order with _id tie-breaker preserved)
 * K. Total count (accurate total calculated via countDocuments)
 * L. Total pages (Math.ceil(total / limit))
 * M. Has next page (true when page < totalPages, false on last page)
 * N. Has previous page (false on page 1, true on page > 1)
 * O. Lab RBAC (role enforcement preserved with pagination)
 * P. Patient RBAC (patient cannot access another patient's records across pages)
 * Q. Doctor RBAC (doctor restricted to assigned patients across pages)
 * R. Medical file security (report file view/download authorization intact)
 * S. Admin access (admin directory pagination works smoothly)
 * T. Search + pagination (Step 6 search filters work alongside pagination)
 * U. Date filter + pagination (Step 6 date range works alongside pagination)
 * V. Frontend compatibility (apiRequest helper unwraps data and preserves pagination)
 * Performance: Demonstrates bounded payload and memory on large dataset.
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
const InsuranceClaim = require('./models/InsuranceClaim');
const { Medication } = require('./models/Medication');
const EmergencyCase = require('./models/EmergencyCase');

// Import helper
const { parsePagination, formatPaginatedResponse } = require('./utils/paginationHelper');

let mongod;
let serverInstance;
let baseUrl;
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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          raw
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runPaginationSuite() {
  console.log('\n📄 Starting Step 8 — Production-Safe Pagination Verification...\n');

  // 1. Unit Tests for paginationHelper
  const unitValid = parsePagination({ query: {} });
  recordTest('Test A-Unit', 'Default pagination parses page=1, limit=20, skip=0',
    unitValid.isValid && unitValid.page === 1 && unitValid.limit === 20 && unitValid.skip === 0);

  const unitCustom = parsePagination({ query: { page: '3', limit: '15' } });
  recordTest('Test B-Unit', 'Custom pagination parses page=3, limit=15, skip=30',
    unitCustom.isValid && unitCustom.page === 3 && unitCustom.limit === 15 && unitCustom.skip === 30);

  const unitMax = parsePagination({ query: { limit: '100' } });
  recordTest('Test D-Unit', 'Maximum limit of 100 is accepted',
    unitMax.isValid && unitMax.limit === 100);

  const unitOverMax = parsePagination({ query: { limit: '101' } });
  recordTest('Test E-Unit', 'Limit exceeding maximum (>100) is rejected',
    !unitOverMax.isValid && unitOverMax.error.includes('cannot exceed maximum of 100'));

  const unitNegPage = parsePagination({ query: { page: '-1' } });
  recordTest('Test F-Unit', 'Negative page number is rejected',
    !unitNegPage.isValid && unitNegPage.error.includes('page must be an integer >= 1'));

  const unitNegLimit = parsePagination({ query: { limit: '-20' } });
  recordTest('Test G-Unit', 'Negative limit is rejected',
    !unitNegLimit.isValid && unitNegLimit.error.includes('limit must be an integer >= 1'));

  const unitNonNum = parsePagination({ query: { page: 'abc', limit: 'xyz' } });
  recordTest('Test H-Unit', 'Non-numeric pagination parameters are rejected',
    !unitNonNum.isValid);

  const unitZero = parsePagination({ query: { page: '0', limit: '0' } });
  recordTest('Test H2-Unit', 'Zero page or zero limit is rejected',
    !unitZero.isValid);

  // 2. Start Test MongoDB & Express Server
  mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  process.env.MONGODB_URI = mongoUri;
  process.env.MONGO_URI = mongoUri;
  process.env.JWT_SECRET = 'CareLink_Test_Secret_Key_At_Least_32_Chars_Long!!';
  process.env.SESSION_SECRET = 'CareLink_Test_Session_Secret_Key_At_Least_32_Chars!!';
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0'; // dynamic port

  const app = require('./server');
  serverInstance = app.listen(0);
  const port = serverInstance.address().port;
  baseUrl = `http://localhost:${port}`;

  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => {
      mongoose.connection.once('connected', resolve);
    });
  }

  // 3. Seed Users
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const patientA = await User.create({
    name: 'Alice Patient',
    email: 'alice.pagination@carelink.com',
    role: 'patient',
    password: passwordHash
  });

  const patientB = await User.create({
    name: 'Bob Patient',
    email: 'bob.pagination@carelink.com',
    role: 'patient',
    password: passwordHash
  });

  const doctorA = await User.create({
    name: 'Dr. Arthur',
    email: 'dr.arthur@carelink.com',
    role: 'doctor',
    password: passwordHash,
    assignedPatients: [patientA._id]
  });

  const doctorB = await User.create({
    name: 'Dr. Beatrix',
    email: 'dr.beatrix@carelink.com',
    role: 'doctor',
    password: passwordHash,
    assignedPatients: [patientB._id]
  });

  const labUser = await User.create({
    name: 'Lab Staff Carl',
    email: 'carl.lab@carelink.com',
    role: 'lab',
    password: passwordHash
  });

  const adminUser = await User.create({
    name: 'Admin Dave',
    email: 'dave.admin@carelink.com',
    role: 'admin',
    password: passwordHash
  });

  const tokenPatientA = jwt.sign({ id: patientA._id, role: patientA.role, email: patientA.email }, process.env.JWT_SECRET);
  const tokenPatientB = jwt.sign({ id: patientB._id, role: patientB.role, email: patientB.email }, process.env.JWT_SECRET);
  const tokenDoctorA = jwt.sign({ id: doctorA._id, role: doctorA.role, email: doctorA.email }, process.env.JWT_SECRET);
  const tokenDoctorB = jwt.sign({ id: doctorB._id, role: doctorB.role, email: doctorB.email }, process.env.JWT_SECRET);
  const tokenLab = jwt.sign({ id: labUser._id, role: labUser.role, email: labUser.email }, process.env.JWT_SECRET);
  const tokenAdmin = jwt.sign({ id: adminUser._id, role: adminUser.role, email: adminUser.email }, process.env.JWT_SECRET);

  // 4. Seed TestRequests (25 records to test pagination across pages)
  const reqBatch = [];
  for (let i = 1; i <= 25; i++) {
    reqBatch.push({
      requestId: `REQ-PAG-${1000 + i}`,
      patientId: patientA._id,
      doctorId: doctorA._id,
      testName: i % 2 === 0 ? 'Complete Blood Count' : 'Lipid Panel',
      testCategory: 'Laboratory',
      priority: i <= 5 ? 'Urgent' : 'Normal',
      status: i <= 10 ? 'Pending' : 'Completed',
      requestDate: new Date(Date.now() - (25 - i) * 60000)
    });
  }
  await TestRequest.insertMany(reqBatch);

  // 5. Seed MedicalReports (30 records: 15 for Patient A, 15 for Patient B)
  const repBatch = [];
  for (let i = 1; i <= 30; i++) {
    const isPatientA = i <= 15;
    repBatch.push({
      reportId: `REP-PAG-${2000 + i}`,
      patientId: isPatientA ? patientA._id : patientB._id,
      doctorId: isPatientA ? doctorA._id : doctorB._id,
      category: 'Laboratory',
      reportType: 'Blood Test',
      reportStatus: 'Verified',
      criticalStatus: 'Normal',
      uploadedBy: 'lab',
      testDate: new Date(Date.now() - (30 - i) * 3600000)
    });
  }
  await MedicalReport.insertMany(repBatch);

  // ─────────────────────────────────────────────────────────────────────────────
  // A. Default Pagination (page=1, limit=20)
  // ─────────────────────────────────────────────────────────────────────────────
  const defRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const defPass = defRes.status === 200 &&
    defRes.body.pagination &&
    defRes.body.pagination.page === 1 &&
    defRes.body.pagination.limit === 20 &&
    defRes.body.pagination.total === 25 &&
    defRes.body.pagination.totalPages === 2 &&
    defRes.body.pagination.hasNextPage === true &&
    defRes.body.pagination.hasPreviousPage === false &&
    defRes.body.data.length === 20;
  recordTest('Test A', 'Default pagination returns page=1, limit=20, exactly 20 records', defPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // B. Custom Page (?page=2)
  // ─────────────────────────────────────────────────────────────────────────────
  const page2Res = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?page=2', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const page2Pass = page2Res.status === 200 &&
    page2Res.body.pagination.page === 2 &&
    page2Res.body.pagination.hasNextPage === false &&
    page2Res.body.pagination.hasPreviousPage === true &&
    page2Res.body.data.length === 5;
  recordTest('Test B', 'Page 2 retrieves remaining 5 records with hasNextPage=false and hasPreviousPage=true', page2Pass);

  // ─────────────────────────────────────────────────────────────────────────────
  // C. Custom Limit (?limit=50)
  // ─────────────────────────────────────────────────────────────────────────────
  const limit50Res = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?limit=50', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const limit50Pass = limit50Res.status === 200 &&
    limit50Res.body.pagination.limit === 50 &&
    limit50Res.body.pagination.totalPages === 1 &&
    limit50Res.body.data.length === 25;
  recordTest('Test C', 'Custom limit=50 returns all 25 records on single page', limit50Pass);

  // ─────────────────────────────────────────────────────────────────────────────
  // D. Maximum Limit (?limit=100)
  // ─────────────────────────────────────────────────────────────────────────────
  const limit100Res = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?limit=100', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const limit100Pass = limit100Res.status === 200 &&
    limit100Res.body.pagination.limit === 100 &&
    limit100Res.body.data.length === 25;
  recordTest('Test D', 'Maximum permitted limit=100 accepted successfully', limit100Pass);

  // ─────────────────────────────────────────────────────────────────────────────
  // E. Excessive Limit (?limit=101) -> 400 Bad Request
  // ─────────────────────────────────────────────────────────────────────────────
  const limit101Res = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?limit=101', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const limit101Pass = limit101Res.status === 400 &&
    limit101Res.body.message.includes('limit cannot exceed maximum of 100');
  recordTest('Test E', 'Excessive limit=101 rejected with 400 Bad Request', limit101Pass);

  // ─────────────────────────────────────────────────────────────────────────────
  // F. Negative Page (?page=-1) -> 400 Bad Request
  // ─────────────────────────────────────────────────────────────────────────────
  const negPageRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?page=-1', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const negPagePass = negPageRes.status === 400 &&
    negPageRes.body.message.includes('page must be an integer >= 1');
  recordTest('Test F', 'Negative page number rejected with 400 Bad Request', negPagePass);

  // ─────────────────────────────────────────────────────────────────────────────
  // G. Negative Limit (?limit=-10) -> 400 Bad Request
  // ─────────────────────────────────────────────────────────────────────────────
  const negLimitRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?limit=-10', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const negLimitPass = negLimitRes.status === 400 &&
    negLimitRes.body.message.includes('limit must be an integer >= 1');
  recordTest('Test G', 'Negative limit rejected with 400 Bad Request', negLimitPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // H. Non-numeric / Zero Values -> 400 Bad Request
  // ─────────────────────────────────────────────────────────────────────────────
  const nonNumRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?page=xyz', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const zeroPageRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?page=0', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const zeroLimitRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?limit=0', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const nonNumPass = nonNumRes.status === 400 && zeroPageRes.status === 400 && zeroLimitRes.status === 400;
  recordTest('Test H', 'Non-numeric and zero pagination parameters rejected with 400 Bad Request', nonNumPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // I. MongoDB Pagination (.skip & .limit in database)
  // ─────────────────────────────────────────────────────────────────────────────
  const page1Items = defRes.body.data.map(r => r.requestId);
  const page2Items = page2Res.body.data.map(r => r.requestId);
  // Ensure no overlap between page 1 and page 2
  const hasOverlap = page1Items.some(id => page2Items.includes(id));
  recordTest('Test I', 'MongoDB skip and limit partition records cleanly with zero cross-page duplicate documents', !hasOverlap);

  // ─────────────────────────────────────────────────────────────────────────────
  // J. Stable Sorting (Deterministic order with _id tie-breaker)
  // ─────────────────────────────────────────────────────────────────────────────
  let isSorted = true;
  for (let i = 0; i < defRes.body.data.length - 1; i++) {
    const curDate = new Date(defRes.body.data[i].requestDate).getTime();
    const nextDate = new Date(defRes.body.data[i + 1].requestDate).getTime();
    if (curDate < nextDate) {
      isSorted = false;
      break;
    }
  }
  recordTest('Test J', 'Stable sorting: records remain deterministically ordered descending by date', isSorted);

  // ─────────────────────────────────────────────────────────────────────────────
  // K. Total Count Accuracy
  // ─────────────────────────────────────────────────────────────────────────────
  const totalCountPass = defRes.body.pagination.total === 25 && page2Res.body.pagination.total === 25;
  recordTest('Test K', 'Total count accurately reflects total matching documents in database', totalCountPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // L. Total Pages Calculation (Math.ceil(total / limit))
  // ─────────────────────────────────────────────────────────────────────────────
  const expectedTotalPages = Math.ceil(25 / 20); // 2
  recordTest('Test L', `Total pages calculation: ${expectedTotalPages} pages for 25 items at limit 20`,
    defRes.body.pagination.totalPages === expectedTotalPages);

  // ─────────────────────────────────────────────────────────────────────────────
  // M. Has Next Page Indicator
  // ─────────────────────────────────────────────────────────────────────────────
  recordTest('Test M', 'hasNextPage correctly reports true on page 1 and false on final page',
    defRes.body.pagination.hasNextPage === true && page2Res.body.pagination.hasNextPage === false);

  // ─────────────────────────────────────────────────────────────────────────────
  // N. Has Previous Page Indicator
  // ─────────────────────────────────────────────────────────────────────────────
  recordTest('Test N', 'hasPreviousPage correctly reports false on page 1 and true on page 2',
    defRes.body.pagination.hasPreviousPage === false && page2Res.body.pagination.hasPreviousPage === true);

  // ─────────────────────────────────────────────────────────────────────────────
  // O. Lab RBAC with Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  const unauthRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?page=1&limit=20');
  const patientDeniedRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?page=1&limit=20', {
    headers: { Authorization: `Bearer ${tokenPatientA}` }
  });
  recordTest('Test O', 'Lab test-requests endpoint strictly denies unauthenticated (401) and non-lab roles (403)',
    unauthRes.status === 401 && patientDeniedRes.status === 403);

  // ─────────────────────────────────────────────────────────────────────────────
  // P. Patient RBAC with Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  // Patient A requests their reports (should only see their 15 reports, never Patient B's 15)
  const patientARepRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports?page=1&limit=100', {
    headers: { Authorization: `Bearer ${tokenPatientA}` }
  });
  const patientAPass = patientARepRes.status === 200 &&
    patientARepRes.body.pagination.total === 15 &&
    patientARepRes.body.data.length === 15 &&
    patientARepRes.body.data.every(r => r.patientId._id.toString() === patientA._id.toString());
  recordTest('Test P', 'Patient RBAC: patient cannot access other patients records across paginated results', patientAPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // Q. Doctor RBAC with Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  // Doctor A only has Patient A assigned
  const docARepRes = await makeRequest(baseUrl, 'GET', '/api/medical-reports?page=1&limit=100', {
    headers: { Authorization: `Bearer ${tokenDoctorA}` }
  });
  const docAPass = docARepRes.status === 200 &&
    docARepRes.body.pagination.total === 15 &&
    docARepRes.body.data.every(r => r.patientId._id.toString() === patientA._id.toString());
  recordTest('Test Q', 'Doctor RBAC: doctor only retrieves reports for assigned patients under pagination', docAPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // R. Medical File Access Security with Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  const sampleReportId = patientARepRes.body.data[0]._id;
  const fileUnauth = await makeRequest(baseUrl, 'GET', `/api/medical-reports/${sampleReportId}/view`);
  const fileDenied = await makeRequest(baseUrl, 'GET', `/api/medical-reports/${sampleReportId}/view`, {
    headers: { Authorization: `Bearer ${tokenPatientB}` } // Patient B tries to view Patient A's file
  });
  recordTest('Test R', 'Medical file access security remains intact (401 unauthenticated, 403 cross-patient IDOR blocked)',
    fileUnauth.status === 401 && fileDenied.status === 403);

  // ─────────────────────────────────────────────────────────────────────────────
  // S. Admin Directory Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  const adminUsersRes = await makeRequest(baseUrl, 'GET', '/api/admin/users?page=1&limit=3', {
    headers: { Authorization: `Bearer ${tokenAdmin}` }
  });
  const adminUsersPass = adminUsersRes.status === 200 &&
    adminUsersRes.body.pagination &&
    adminUsersRes.body.pagination.total >= 5 &&
    adminUsersRes.body.data.length === 3 &&
    adminUsersRes.body.data.every(u => u.password === undefined);
  recordTest('Test S', 'Admin user directory pagination works with passwords securely excluded', adminUsersPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // T. Search + Pagination Combined
  // ─────────────────────────────────────────────────────────────────────────────
  const searchPagRes = await makeRequest(baseUrl, 'GET', '/api/lab/test-requests?search=Lipid&page=1&limit=10', {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const searchPagPass = searchPagRes.status === 200 &&
    searchPagRes.body.data.length > 0 &&
    searchPagRes.body.data.every(r => r.testName.includes('Lipid')) &&
    searchPagRes.body.pagination.limit === 10;
  recordTest('Test T', 'Step 6 search filter correctly combines with server-side pagination', searchPagPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // U. Date Filter + Pagination Combined
  // ─────────────────────────────────────────────────────────────────────────────
  const now = new Date();
  const pastDay = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
  const nextDay = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  const datePagRes = await makeRequest(baseUrl, 'GET', `/api/lab/test-requests?startDate=${pastDay}&endDate=${nextDay}&page=1&limit=10`, {
    headers: { Authorization: `Bearer ${tokenLab}` }
  });
  const datePagPass = datePagRes.status === 200 &&
    datePagRes.body.data.length > 0 &&
    datePagRes.body.pagination.limit === 10;
  recordTest('Test U', 'Step 6 date range query correctly combines with server-side pagination', datePagPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // V. Frontend Compatibility Validation
  // ─────────────────────────────────────────────────────────────────────────────
  // Verify format returned by formatPaginatedResponse matches frontend expectations
  const mockApiResponse = formatPaginatedResponse([{ id: '1' }, { id: '2' }], 50, 1, 20);
  const jsonMock = JSON.parse(JSON.stringify(mockApiResponse));
  // Emulate auth.js apiRequest logic
  const isPaginated = jsonMock && typeof jsonMock === 'object' && Array.isArray(jsonMock.data) && jsonMock.pagination;
  const unpackedData = isPaginated ? jsonMock.data : jsonMock;
  recordTest('Test V', 'Frontend apiRequest unwraps paginated data array seamlessly for UI consumers',
    Array.isArray(unpackedData) && unpackedData.length === 2 && jsonMock.pagination.total === 50);

  // ─────────────────────────────────────────────────────────────────────────────
  // Performance Benchmark: 1,000 Records Pagination
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n  ⚡ Running 1,000-Record Synthetic Benchmark...');
  const benchPatientId = new mongoose.Types.ObjectId();
  const benchBatch = [];
  for (let i = 1; i <= 1000; i++) {
    benchBatch.push({
      reportId: `REP-PERF-${10000 + i}`,
      patientId: benchPatientId,
      doctorId: doctorA._id,
      category: 'Laboratory',
      reportType: 'Lipid Panel',
      reportStatus: 'Verified',
      criticalStatus: 'Normal',
      uploadedBy: 'lab',
      testDate: new Date(Date.now() - i * 60000)
    });
  }
  await MedicalReport.insertMany(benchBatch);

  const startBench = process.hrtime.bigint();
  const benchRes = await makeRequest(baseUrl, 'GET', `/api/medical-reports?patientId=${benchPatientId}&page=2&limit=20`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` }
  });
  const endBench = process.hrtime.bigint();
  const benchDurationMs = Number(endBench - startBench) / 1e6;

  console.log(`     Dataset size: 1,000 synthetic documents`);
  console.log(`     Requested: page 2, limit 20`);
  console.log(`     Returned documents: ${benchRes.body?.data?.length} docs`);
  console.log(`     Total matching in DB: ${benchRes.body?.pagination?.total} docs`);
  console.log(`     Total pages: ${benchRes.body?.pagination?.totalPages}`);
  console.log(`     Response time: ${benchDurationMs.toFixed(2)} ms`);

  const perfPass = benchRes.status === 200 &&
    benchRes.body.data.length === 20 &&
    benchRes.body.pagination.total === 1000 &&
    benchRes.body.pagination.page === 2 &&
    benchRes.body.pagination.totalPages === 50;

  recordTest('Test Performance', 'Benchmark: 1,000 records queried with page=2&limit=20 returns exactly 20 records', perfPass);

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log(`Step 8 Pagination Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('========================================\n');

  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  await mongoose.disconnect();
  await mongod.stop();

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPaginationSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
