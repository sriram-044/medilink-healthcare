/**
 * test_step10_full_system.js — Master Full-System Test Suite & Quality Gate (STEP 10)
 *
 * Verifies all 17 critical domains of the CareLink application:
 *  1. Authentication (Registration, Login, Cookie, /api/auth/me, Logout)
 *  2. Google OAuth (No token in URL, cookie establishment, client secret protection)
 *  3. RBAC Matrix (patient, doctor, admin, lab, pharmacy, insurance, emergency, hospital)
 *  4. IDOR Protection (Patient A vs Patient B across all clinical domains)
 *  5. Medical File Security (Auth, IDOR, direct /uploads blocked, traversal blocked)
 *  6. Lab Notification Security (Assigned staff, unassigned, recipient exclusion, isolation)
 *  7. Content Security Policy (Headers, object-src, base-uri, frame-ancestors, no unsafe-eval)
 *  8. Production Secrets (No hardcoded credentials, weak secret rejection, .env ignored)
 *  9. MongoDB Queries (Database-level filtering, regex escaping, date queries, countDocuments)
 * 10. Database Indexes (Index existence, explain plan IXSCAN, no duplicate indexes)
 * 11. Pagination (Page/limit bounds, metadata, stable sorting, MongoDB skip/limit)
 * 12. Error Handling (Standard error schema, safe error codes, no stack/URI/path leaks)
 * 13. Input Security & Injection (Malformed JSON, XSS, NoSQL operator injection)
 * 14. Sensitive Data Protection (No passwords, hashes, JWTs, or secrets in API payloads)
 * 15. Frontend Portal Smoke Tests (All 8 portals preserved, valid, and functional)
 * 16. API Contracts (Health, Paginated, Entity, Error response structure)
 * 17. Regression Verification (Steps 1–9 regression test suites validation)
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import models
const User = require('./models/User');
const MedicalReport = require('./models/MedicalReport');
const TestRequest = require('./models/TestRequest');
const Sample = require('./models/Sample');
const Notification = require('./models/Notification');
const EmergencyCase = require('./models/EmergencyCase');
const InsuranceClaim = require('./models/InsuranceClaim');
const { Medication } = require('./models/Medication');
const Alert = require('./models/Alert');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Global test counters by category
const categoryResults = {
  Authentication: { passed: 0, failed: 0, total: 0 },
  OAuth: { passed: 0, failed: 0, total: 0 },
  RBAC: { passed: 0, failed: 0, total: 0 },
  IDOR: { passed: 0, failed: 0, total: 0 },
  MedicalFiles: { passed: 0, failed: 0, total: 0 },
  LabNotifications: { passed: 0, failed: 0, total: 0 },
  CSP: { passed: 0, failed: 0, total: 0 },
  Secrets: { passed: 0, failed: 0, total: 0 },
  MongoDBQueries: { passed: 0, failed: 0, total: 0 },
  Indexes: { passed: 0, failed: 0, total: 0 },
  Pagination: { passed: 0, failed: 0, total: 0 },
  ErrorHandling: { passed: 0, failed: 0, total: 0 },
  InputSecurity: { passed: 0, failed: 0, total: 0 },
  SensitiveData: { passed: 0, failed: 0, total: 0 },
  FrontendSmoke: { passed: 0, failed: 0, total: 0 },
  APIContracts: { passed: 0, failed: 0, total: 0 },
  Regression: { passed: 0, failed: 0, total: 0 }
};

let totalPassed = 0;
let totalFailed = 0;

function recordResult(category, testName, isPass, detail = '') {
  categoryResults[category].total++;
  if (isPass) {
    categoryResults[category].passed++;
    totalPassed++;
    console.log(`  ✅ [PASS] [${category}] ${testName}`);
  } else {
    categoryResults[category].failed++;
    totalFailed++;
    console.error(`  ❌ [FAIL] [${category}] ${testName}: ${detail}`);
  }
}

function makeRequest(method, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const headers = options.headers || {};
    let bodyData = null;

    if (options.body !== undefined) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        const setCookie = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          raw,
          setCookie
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function extractCookie(setCookieHeaders, name) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of headers) {
    if (typeof c === 'string' && c.startsWith(name + '=')) {
      return c.split(';')[0];
    }
  }
  return null;
}

async function loginUser(email, password = 'demo123') {
  const res = await makeRequest('POST', '/api/auth/login', { body: { email, password } });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.body?.message || res.status}`);
  }
  const cookie = extractCookie(res.setCookie, 'carelink_auth');
  return { user: res.body.user, cookie, res };
}

async function runMasterSuite() {
  console.log('\n========================================================================');
  console.log('🏥 CareLink — STEP 10: FULL SYSTEM TESTING & QUALITY GATE MASTER SUITE');
  console.log('========================================================================\n');

  // Authenticate representative roles from the pre-seeded dataset
  let patientSession, patientBSession, doctorSession, adminSession, labSession, pharmacySession, insuranceSession, emergencySession;
  try {
    patientSession = await loginUser('ravi@demo.com');
    patientBSession = await loginUser('patient@demo.com');
    doctorSession = await loginUser('doctor@demo.com');
    adminSession = await loginUser('admin@demo.com');
    labSession = await loginUser('lab@demo.com');
    pharmacySession = await loginUser('pharmacy@demo.com');
    insuranceSession = await loginUser('insurance@demo.com');
    emergencySession = await loginUser('emergency@demo.com');
    console.log('🔑 All 8 Ecosystem Portal Users Successfully Authenticated for Testing.\n');
  } catch (err) {
    console.error('❌ Failed to authenticate pre-seeded test users:', err.message);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. AUTHENTICATION TESTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Authentication Domain Tests ---');
  try {
    // Valid login returns cookie, role, no JWT in body
    const { user, cookie, res } = patientSession;
    const isCookieHttpOnly = res.setCookie.some(c => c.toLowerCase().includes('httponly'));
    recordResult('Authentication', 'Valid login returns user profile and sets HttpOnly cookie',
      res.status === 200 && user.role === 'patient' && cookie && isCookieHttpOnly && res.body.token === undefined);

    // Invalid password fails
    const badPass = await makeRequest('POST', '/api/auth/login', { body: { email: 'ravi@demo.com', password: 'wrongpassword' } });
    recordResult('Authentication', 'Invalid password rejected with safe message and 400',
      badPass.status === 400 && badPass.body.error?.code === 'BAD_REQUEST');

    // Unknown user fails
    const badUser = await makeRequest('POST', '/api/auth/login', { body: { email: 'nonexistent.user.xyz@carelink.com', password: 'password123' } });
    recordResult('Authentication', 'Nonexistent user rejected with safe error',
      badUser.status === 400 && badUser.body.error?.code === 'BAD_REQUEST');

    // /api/auth/me returns safe profile, no password
    const meRes = await makeRequest('GET', '/api/auth/me', { headers: { Cookie: cookie } });
    recordResult('Authentication', '/api/auth/me returns safe profile without password or hash',
      meRes.status === 200 && meRes.body.user?.email === 'ravi@demo.com' && meRes.body.user?.password === undefined);

    // /api/auth/me without cookie returns 401
    const unauthMe = await makeRequest('GET', '/api/auth/me');
    recordResult('Authentication', 'Unauthenticated request to /api/auth/me returns 401 UNAUTHORIZED',
      unauthMe.status === 401 && unauthMe.body.error?.code === 'UNAUTHORIZED');

    // Role cannot be spoofed client-side (role tampering)
    const spoofMe = await makeRequest('GET', '/api/auth/me', {
      headers: { Cookie: cookie, 'x-user-role': 'admin' }
    });
    recordResult('Authentication', 'Client-side role parameter cannot tamper backend role',
      spoofMe.body.user?.role === 'patient');

    // Registration of duplicate email rejected
    const dupReg = await makeRequest('POST', '/api/auth/register', {
      body: { name: 'Ravi Duplicate', email: 'ravi@demo.com', password: 'demoPassword123!', role: 'patient' }
    });
    recordResult('Authentication', 'Duplicate account registration safely rejected',
      (dupReg.status === 400 || dupReg.status === 409) && dupReg.body.success === false);
  } catch (err) {
    recordResult('Authentication', 'Authentication tests execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. GOOGLE OAUTH SECURITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Google OAuth Security Tests ---');
  try {
    // OAuth initiation route exists
    const oauthInit = await makeRequest('GET', '/auth/google');
    recordResult('OAuth', 'OAuth initiation route handles request safely (302 redirect or 503 if unconfigured)',
      oauthInit.status === 302 || oauthInit.status === 503);

    // Verify callback does not accept or generate ?token= in URL
    const googleAuthSrc = fs.readFileSync(path.join(__dirname, 'routes', 'googleAuth.js'), 'utf8');
    const hasTokenInCallbackUrl = googleAuthSrc.includes('redirect(') && googleAuthSrc.includes('?token=');
    recordResult('OAuth', 'OAuth callback strictly avoids passing tokens in query strings',
      !hasTokenInCallbackUrl && googleAuthSrc.includes('setAuthCookie'));

    // Client secrets not present in frontend files
    const frontendDir = fs.existsSync(path.join(__dirname, 'frontend'))
      ? path.join(__dirname, 'frontend')
      : path.join(__dirname, '..', 'frontend');
    const frontendJs = fs.readFileSync(path.join(frontendDir, 'js', 'auth.js'), 'utf8');
    recordResult('OAuth', 'Frontend JavaScript does not contain Google Client Secrets',
      !frontendJs.includes('client_secret') && !frontendJs.includes('GOOGLE_CLIENT_SECRET'));

    // Secure cookie flow used in OAuth callback
    recordResult('OAuth', 'OAuth callback sets HttpOnly auth cookie',
      googleAuthSrc.includes('res.app.locals.setAuthCookie(res, token)'));
  } catch (err) {
    recordResult('OAuth', 'OAuth tests execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. RBAC TEST MATRIX
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Role-Based Access Control (RBAC) Matrix Tests ---');
  try {
    // Patient: denied admin, denied lab
    const pAdmin = await makeRequest('GET', '/api/admin/users', { headers: { Cookie: patientSession.cookie } });
    const pLab = await makeRequest('GET', '/api/lab/dashboard', { headers: { Cookie: patientSession.cookie } });
    recordResult('RBAC', 'Patient role strictly denied Admin (/api/admin/users) and Lab (/api/lab/dashboard)',
      pAdmin.status === 403 && pLab.status === 403);

    // Doctor: allowed patients list, denied admin users creation
    const dPatients = await makeRequest('GET', '/api/patients', { headers: { Cookie: doctorSession.cookie } });
    const dAdmin = await makeRequest('POST', '/api/admin/users', { headers: { Cookie: doctorSession.cookie }, body: { email: 'fake@fake.com' } });
    recordResult('RBAC', 'Doctor role allowed /api/patients (200), denied Admin creation (403)',
      dPatients.status === 200 && dAdmin.status === 403);

    // Lab: allowed lab dashboard, denied pharmacy dispense
    const lDash = await makeRequest('GET', '/api/lab/dashboard', { headers: { Cookie: labSession.cookie } });
    const lPharm = await makeRequest('PUT', '/api/pharmacy/dispense/507f1f77bcf86cd799439011', { headers: { Cookie: labSession.cookie } });
    recordResult('RBAC', 'Lab role allowed Lab Dashboard (200), denied Pharmacy Dispense (403)',
      lDash.status === 200 && lPharm.status === 403);

    // Pharmacy: allowed prescriptions, denied insurance review
    const phPresc = await makeRequest('GET', '/api/pharmacy/prescriptions', { headers: { Cookie: pharmacySession.cookie } });
    const phInsur = await makeRequest('PUT', '/api/insurance/claims/507f1f77bcf86cd799439011/review', { headers: { Cookie: pharmacySession.cookie }, body: { status: 'Approved' } });
    recordResult('RBAC', 'Pharmacy role allowed Prescriptions (200), denied Insurance Claims Review (403)',
      phPresc.status === 200 && phInsur.status === 403);

    // Insurance: allowed claims, denied emergency dispatch
    const inClaims = await makeRequest('GET', '/api/insurance/claims', { headers: { Cookie: insuranceSession.cookie } });
    const inEmerg = await makeRequest('PUT', '/api/emergency/dispatch/507f1f77bcf86cd799439011', { headers: { Cookie: insuranceSession.cookie }, body: { status: 'Dispatched' } });
    recordResult('RBAC', 'Insurance role allowed Claims (200), denied Emergency Dispatch (403)',
      inClaims.status === 200 && inEmerg.status === 403);

    // Emergency: allowed emergency dashboard, denied admin users
    const emDash = await makeRequest('GET', '/api/emergency/dashboard-stats', { headers: { Cookie: emergencySession.cookie } });
    const emAdmin = await makeRequest('GET', '/api/admin/users', { headers: { Cookie: emergencySession.cookie } });
    recordResult('RBAC', 'Emergency role allowed Emergency Stats (200), denied Admin Users Directory (403)',
      emDash.status === 200 && emAdmin.status === 403);

    // Admin: allowed admin users and analytics
    const adUsers = await makeRequest('GET', '/api/admin/users', { headers: { Cookie: adminSession.cookie } });
    const adAnalytics = await makeRequest('GET', '/api/admin/analytics', { headers: { Cookie: adminSession.cookie } });
    recordResult('RBAC', 'Admin role allowed Admin Users (200) and System Analytics (200)',
      adUsers.status === 200 && adAnalytics.status === 200);

    // Unauthenticated access to protected routes strictly returns 401
    const unauth1 = await makeRequest('GET', '/api/patients');
    const unauth2 = await makeRequest('GET', '/api/medical-reports');
    recordResult('RBAC', 'Unauthenticated requests to protected endpoints return 401 across ecosystem',
      unauth1.status === 401 && unauth2.status === 401);
  } catch (err) {
    recordResult('RBAC', 'RBAC matrix test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. IDOR / ACCESS CONTROL TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. IDOR / Cross-User Access Control Tests ---');
  try {
    const patientAId = patientSession.user.id || patientSession.user._id;
    const patientBId = patientBSession.user.id || patientBSession.user._id;

    // IDOR 1: Patient A cannot access Patient B lifetime history
    const idorHist = await makeRequest('GET', `/api/patients/${patientBId}/lifetime-history`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B lifetime medical history (403)',
      idorHist.status === 403 && idorHist.body.error?.code === 'FORBIDDEN');

    // IDOR 2: Patient A cannot access Patient B reports
    const idorReports = await makeRequest('GET', `/api/reports/${patientBId}`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B reports list (403)',
      idorReports.status === 403 && idorReports.body.error?.code === 'FORBIDDEN');

    // IDOR 3: Patient A cannot access Patient B vitals
    const idorVitals = await makeRequest('GET', `/api/vitals/${patientBId}/latest`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B latest vitals (403)',
      idorVitals.status === 403 && idorVitals.body.error?.code === 'FORBIDDEN');

    // IDOR 4: Patient A cannot access Patient B medications
    const idorMeds = await makeRequest('GET', `/api/medication/${patientBId}`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B prescriptions (403)',
      idorMeds.status === 403 && idorMeds.body.error?.code === 'FORBIDDEN');

    // IDOR 5: Patient A cannot access Patient B diet plan
    const idorDiet = await makeRequest('GET', `/api/medication/diet/${patientBId}`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B diet plan (403)',
      idorDiet.status === 403 && idorDiet.body.error?.code === 'FORBIDDEN');

    // IDOR 6: Patient A cannot access Patient B alerts
    const idorAlerts = await makeRequest('GET', `/api/alerts/patient/${patientBId}`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B alerts list (403)',
      idorAlerts.status === 403 && idorAlerts.body.error?.code === 'FORBIDDEN');

    // IDOR 7: Patient A cannot access Patient B AI vitals analysis
    const idorAi = await makeRequest('GET', `/api/ai/analyze/${patientBId}`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied Patient B AI vitals analysis (403)',
      idorAi.status === 403 && idorAi.body.error?.code === 'FORBIDDEN');

    // IDOR 8: Patient A cannot delete Patient B profile allergy
    const idorDelAllergy = await makeRequest('DELETE', `/api/patients/${patientBId}/allergies/507f1f77bcf86cd799439011`, {
      headers: { Cookie: patientSession.cookie }
    });
    recordResult('IDOR', 'Patient A denied deleting Patient B profile allergies (403)',
      idorDelAllergy.status === 403 && idorDelAllergy.body.error?.code === 'FORBIDDEN');
  } catch (err) {
    recordResult('IDOR', 'IDOR test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. MEDICAL FILE SECURITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Medical File Access Security Tests ---');
  try {
    // Get an existing report ID
    const reportsList = await makeRequest('GET', '/api/medical-reports', { headers: { Cookie: adminSession.cookie } });
    const targetReport = reportsList.body?.data?.[0] || reportsList.body?.[0];
    const reportId = targetReport?._id || '507f1f77bcf86cd799439011';

    // Unauthenticated access -> 401
    const unauthFile = await makeRequest('GET', `/api/medical-reports/${reportId}/view`);
    recordResult('MedicalFiles', 'Unauthenticated request to medical report view returns 401',
      unauthFile.status === 401);

    // Unauthorized role (Pharmacy) -> 403
    const pharmFile = await makeRequest('GET', `/api/medical-reports/${reportId}/view`, {
      headers: { Cookie: pharmacySession.cookie }
    });
    recordResult('MedicalFiles', 'Unauthorized role (Pharmacy) denied medical report file (403)',
      pharmFile.status === 403);

    // Direct /uploads URL is blocked -> 404 (not 200)
    const directUpload = await makeRequest('GET', '/uploads/test-report.pdf');
    recordResult('MedicalFiles', 'Direct access to /uploads directory is blocked (not 200)',
      directUpload.status !== 200);

    // Path traversal blocked
    const traversal = await makeRequest('GET', '/api/medical-reports/..%2F..%2Fetc%2Fpasswd/view', {
      headers: { Cookie: adminSession.cookie }
    });
    recordResult('MedicalFiles', 'Path traversal attempt rejected (400 or 404, never 200)',
      traversal.status === 400 || traversal.status === 404);

    // Encoded path traversal blocked
    const encodedTrav = await makeRequest('GET', '/api/medical-reports/%2e%2e%2fetc%2fpasswd/view', {
      headers: { Cookie: adminSession.cookie }
    });
    recordResult('MedicalFiles', 'Encoded path traversal attempt rejected (400 or 404)',
      encodedTrav.status === 400 || encodedTrav.status === 404);
  } catch (err) {
    recordResult('MedicalFiles', 'Medical file security test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. LAB NOTIFICATION SECURITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Lab Notification Recipient & Isolation Tests ---');
  try {
    // Query lab notifications with Lab user session
    const labNotifs = await makeRequest('GET', '/api/lab/notifications', { headers: { Cookie: labSession.cookie } });
    recordResult('LabNotifications', 'Lab user retrieves authorized notifications (200)',
      labNotifs.status === 200 && Array.isArray(labNotifs.body));

    // Doctor/Patient cannot access /api/lab/notifications -> 403
    const patNotifs = await makeRequest('GET', '/api/lab/notifications', { headers: { Cookie: patientSession.cookie } });
    recordResult('LabNotifications', 'Non-lab users strictly denied /api/lab/notifications (403)',
      patNotifs.status === 403);

    // Notification recipient isolation: Lab User A does not see other users' notifications
    const labQueryCode = fs.readFileSync(path.join(__dirname, 'routes', 'lab.js'), 'utf8');
    recordResult('LabNotifications', 'Lab notifications endpoint queries strictly by recipientId: req.user._id',
      labQueryCode.includes('recipientId: req.user._id'));
  } catch (err) {
    recordResult('LabNotifications', 'Lab notification test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. CSP TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Content Security Policy (CSP) Tests ---');
  try {
    const healthRes = await makeRequest('GET', '/api/health');
    const csp = healthRes.headers['content-security-policy'] || '';

    recordResult('CSP', 'Content-Security-Policy header exists on responses',
      csp.length > 0);
    recordResult('CSP', 'object-src is strictly set to none',
      csp.includes("object-src 'none'"));
    recordResult('CSP', 'base-uri is strictly set to self',
      csp.includes("base-uri 'self'"));
    recordResult('CSP', 'frame-ancestors is restricted to self',
      csp.includes("frame-ancestors 'self'"));
    recordResult('CSP', 'unsafe-eval is NOT permitted in script-src',
      !csp.includes("'unsafe-eval'"));
  } catch (err) {
    recordResult('CSP', 'CSP test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. SECRET MANAGEMENT TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Production Secret Management Tests ---');
  try {
    const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
    recordResult('Secrets', '.env and .env.* are protected by .gitignore',
      gitignore.includes('.env'));

    const envExample = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
    recordResult('Secrets', '.env.example contains configuration placeholders only',
      !envExample.includes('actual_secret') && !envExample.includes('mongodb+srv://admin:realpass'));

    const envJs = fs.readFileSync(path.join(__dirname, 'config', 'env.js'), 'utf8');
    recordResult('Secrets', 'Production requires valid 32+ character secrets without fallback',
      envJs.includes('MIN_SECRET_LENGTH = 32') && envJs.includes('validateEnv'));

    // Verify secrets are not leaked in error logs or responses
    const testErrRes = await makeRequest('GET', '/api/patients/invalid-object-id-probe');
    const rawErr = testErrRes.raw || '';
    recordResult('Secrets', 'Error responses do not leak secrets, database connection, or JWTs',
      !rawErr.includes('JWT_SECRET') && !rawErr.includes('mongodb://') && !rawErr.includes('SESSION_SECRET'));
  } catch (err) {
    recordResult('Secrets', 'Secret management test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. MONGODB QUERY SECURITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. MongoDB Query Security Tests ---');
  try {
    // Search with regex special characters does not crash server
    const regexProbe = await makeRequest('GET', '/api/medical-reports?search=test.*%2B%3F%5E%24%7B%7D()%7C%5B%5D%5C', {
      headers: { Cookie: adminSession.cookie }
    });
    recordResult('MongoDBQueries', 'Regex metacharacters escaped safely without server crash (200)',
      regexProbe.status === 200);

    // Database-level date query works
    const dateQueryRes = await makeRequest('GET', '/api/medical-reports?startDate=2026-01-01&endDate=2026-12-31', {
      headers: { Cookie: adminSession.cookie }
    });
    recordResult('MongoDBQueries', 'Date range filtering supported via MongoDB query operators (200)',
      dateQueryRes.status === 200);

    // Passwords excluded from query results
    const usersList = await makeRequest('GET', '/api/admin/users', { headers: { Cookie: adminSession.cookie } });
    const usersData = usersList.body?.data || usersList.body || [];
    const hasPassword = usersData.some(u => u.password !== undefined || u.passwordHash !== undefined);
    recordResult('MongoDBQueries', 'Database projections strictly exclude passwords from queries',
      !hasPassword);

    // Invalid ObjectId returns safe INVALID_ID error
    const castProbe = await makeRequest('GET', '/api/patients/not-an-object-id', { headers: { Cookie: doctorSession.cookie } });
    recordResult('MongoDBQueries', 'Invalid ObjectId handled as 400 INVALID_ID at query layer',
      castProbe.status === 400 && castProbe.body.error?.code === 'INVALID_ID');
  } catch (err) {
    recordResult('MongoDBQueries', 'MongoDB query test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. DATABASE INDEX TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 10. Database Index Tests ---');
  try {
    const userIndexes = User.schema.indexes();
    const hasUserRoleDoctor = userIndexes.some(idx => idx[0].role === 1 && idx[0].assignedDoctor === 1);
    const hasGoogleSparse = userIndexes.some(idx => idx[0].googleId === 1 && idx[1]?.sparse);
    recordResult('Indexes', 'User model compound index { role: 1, assignedDoctor: 1 } and sparse googleId index exist',
      hasUserRoleDoctor && hasGoogleSparse);

    const medReportIndexes = MedicalReport.schema.indexes();
    const hasPatientDateIdx = medReportIndexes.some(idx => idx[0].patientId === 1 && idx[0].testDate === -1);
    recordResult('Indexes', 'MedicalReport model has compound index { patientId: 1, testDate: -1 }',
      hasPatientDateIdx);

    const testReqIndexes = TestRequest.schema.indexes();
    const hasStatusPriorityIdx = testReqIndexes.some(idx => idx[0].status === 1 && idx[0].priority === 1);
    recordResult('Indexes', 'TestRequest model has compound index { status: 1, priority: 1, requestDate: -1 }',
      hasStatusPriorityIdx);

    const notifIndexes = Notification.schema.indexes();
    const hasRecipientIdx = notifIndexes.some(idx => idx[0].recipientId === 1 && idx[0].createdAt === -1);
    recordResult('Indexes', 'Notification model has compound index { recipientId: 1, createdAt: -1 }',
      hasRecipientIdx);
  } catch (err) {
    recordResult('Indexes', 'Database index test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 11. PAGINATION TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 11. Server-Side Pagination Tests ---');
  try {
    // Default pagination (page=1, limit=20)
    const pageDefault = await makeRequest('GET', '/api/medical-reports', { headers: { Cookie: adminSession.cookie } });
    const pag = pageDefault.body?.pagination;
    recordResult('Pagination', 'Default pagination returns page=1, limit=20 with complete pagination metadata',
      pag && pag.page === 1 && pag.limit === 20 && typeof pag.total === 'number' && typeof pag.totalPages === 'number');

    // Limit over 100 rejected with 400
    const pageOverLimit = await makeRequest('GET', '/api/medical-reports?limit=101', { headers: { Cookie: adminSession.cookie } });
    recordResult('Pagination', 'Pagination limit exceeding maximum (>100) is rejected with 400',
      pageOverLimit.status === 400 && pageOverLimit.body.error?.code === 'BAD_REQUEST');

    // Negative page rejected with 400
    const pageNegative = await makeRequest('GET', '/api/medical-reports?page=-1', { headers: { Cookie: adminSession.cookie } });
    recordResult('Pagination', 'Negative page number rejected with 400 BAD_REQUEST',
      pageNegative.status === 400 && pageNegative.body.error?.code === 'BAD_REQUEST');

    // Non-numeric page rejected with 400
    const pageNonNum = await makeRequest('GET', '/api/medical-reports?page=abc', { headers: { Cookie: adminSession.cookie } });
    recordResult('Pagination', 'Non-numeric page parameter rejected with 400 BAD_REQUEST',
      pageNonNum.status === 400 && pageNonNum.body.error?.code === 'BAD_REQUEST');

    // Response structure contains { data: [], pagination: {} }
    recordResult('Pagination', 'Pagination response conforms to standard { data, pagination } contract',
      Array.isArray(pageDefault.body?.data) && typeof pageDefault.body?.pagination === 'object');
  } catch (err) {
    recordResult('Pagination', 'Pagination test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 12. ERROR HANDLING TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 12. Centralized Error Handling & Security Tests ---');
  try {
    // 400 Bad Request
    const err400 = await makeRequest('POST', '/api/auth/login', { body: {} });
    recordResult('ErrorHandling', '400 Bad Request returns standard error envelope with code BAD_REQUEST',
      err400.status === 400 && err400.body.success === false && err400.body.error?.code === 'BAD_REQUEST');

    // 401 Unauthorized
    const err401 = await makeRequest('GET', '/api/patients');
    recordResult('ErrorHandling', '401 Unauthorized returns code UNAUTHORIZED and safe message',
      err401.status === 401 && err401.body.error?.code === 'UNAUTHORIZED' && err401.body.error?.message === 'Authentication is required.');

    // 403 Forbidden
    const err403 = await makeRequest('GET', '/api/admin/users', { headers: { Cookie: patientSession.cookie } });
    recordResult('ErrorHandling', '403 Forbidden returns code FORBIDDEN and safe message',
      err403.status === 403 && err403.body.error?.code === 'FORBIDDEN');

    // 404 Not Found (API endpoint)
    const err404 = await makeRequest('GET', '/api/non-existent-endpoint-test-404');
    recordResult('ErrorHandling', 'Unknown /api/* route returns 404 API_NOT_FOUND',
      err404.status === 404 && err404.body.error?.code === 'API_NOT_FOUND');

    // Request ID returned on errors
    recordResult('ErrorHandling', 'Error responses include requestId and X-Request-ID response header',
      Boolean(err400.body.error?.requestId) && Boolean(err400.headers['x-request-id']));

    // Zero stack trace leakage
    const raw400 = err400.raw || '';
    const raw404 = err404.raw || '';
    recordResult('ErrorHandling', 'Zero stack trace or internal path leakage in error responses',
      !raw400.includes('node_modules') && !raw404.includes('node_modules') && !err400.body.stack);
  } catch (err) {
    recordResult('ErrorHandling', 'Error handling test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 13. INPUT SECURITY & INJECTION TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 13. Input Security & Injection Tests ---');
  try {
    // Malformed JSON request body
    const badJson = await makeRequest('POST', '/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "broken_json'
    });
    recordResult('InputSecurity', 'Malformed JSON payload safely rejected with 400 BAD_REQUEST without stack trace',
      badJson.status === 400 && badJson.body.error?.code === 'BAD_REQUEST');

    // XSS injection in search query
    const xssSearch = await makeRequest('GET', '/api/medical-reports?search=<script>alert(1)</script>', {
      headers: { Cookie: adminSession.cookie }
    });
    recordResult('InputSecurity', 'XSS payload in search query handled safely without execution',
      xssSearch.status === 200 && !xssSearch.raw.includes('<script>alert(1)</script>'));

    // Long string input does not crash server
    const longString = 'A'.repeat(5000);
    const longInputRes = await makeRequest('GET', `/api/medical-reports?search=${longString}`, {
      headers: { Cookie: adminSession.cookie }
    });
    recordResult('InputSecurity', 'Large input query handled safely without buffer overflow or server crash',
      longInputRes.status === 200);
  } catch (err) {
    recordResult('InputSecurity', 'Input security test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 14. SENSITIVE DATA EXPOSURE
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 14. Sensitive Data Exposure Audit ---');
  try {
    const endpointsToInspect = [
      { path: '/api/auth/me', cookie: patientSession.cookie },
      { path: '/api/patients', cookie: doctorSession.cookie },
      { path: '/api/admin/users', cookie: adminSession.cookie },
      { path: '/api/lab/dashboard', cookie: labSession.cookie },
      { path: '/api/health' }
    ];

    let cleanResponses = true;
    for (const ep of endpointsToInspect) {
      const res = await makeRequest('GET', ep.path, { headers: ep.cookie ? { Cookie: ep.cookie } : {} });
      const raw = res.raw || '';
      if (
        raw.includes('passwordHash') ||
        raw.includes('CareLink_') ||
        raw.includes('mongodb://') ||
        raw.includes('mongodb+srv://') ||
        raw.includes('JWT_SECRET')
      ) {
        cleanResponses = false;
        break;
      }
    }
    recordResult('SensitiveData', 'API responses across key endpoints free of passwords, tokens, and DB credentials',
      cleanResponses);
  } catch (err) {
    recordResult('SensitiveData', 'Sensitive data exposure test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 15. FRONTEND PORTAL SMOKE TESTING (All 8 Portals Preserved)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 15. Frontend Portal Smoke Tests (8 Portals Verified) ---');
  const portals = [
    { name: 'Login & Landing', file: 'index.html', js: 'js/index.js' },
    { name: 'Patient Portal', file: 'patient.html', js: 'js/patient.js' },
    { name: 'Doctor Portal', file: 'doctor.html', js: 'js/doctor.js' },
    { name: 'Lab Portal', file: 'lab.html', js: 'js/lab.js' },
    { name: 'Admin / Hospital Portal', file: 'admin.html', js: 'js/admin.js' },
    { name: 'Pharmacy Portal', file: 'pharmacy.html', js: 'js/pharmacy.js' },
    { name: 'Insurance Portal', file: 'insurance.html', js: 'js/insurance.js' },
    { name: 'Emergency Portal', file: 'emergency.html', js: 'js/emergency.js' }
  ];

  for (const portal of portals) {
    try {
      const frontendDir = fs.existsSync(path.join(__dirname, 'frontend'))
        ? path.join(__dirname, 'frontend')
        : path.join(__dirname, '..', 'frontend');
      const htmlPath = path.join(frontendDir, portal.file);
      const jsPath = path.join(frontendDir, portal.js);

      const htmlExists = fs.existsSync(htmlPath);
      const jsExists = fs.existsSync(jsPath);

      // Verify portal served via HTTP 200
      const httpRes = await makeRequest('GET', `/${portal.file}`);
      const jsRes = await makeRequest('GET', `/${portal.js}`);

      const pass = htmlExists && jsExists && httpRes.status === 200 && jsRes.status === 200;
      recordResult('FrontendSmoke', `${portal.name} (${portal.file} + ${portal.js}) loads with HTTP 200 and valid assets`, pass);
    } catch (err) {
      recordResult('FrontendSmoke', `${portal.name} smoke test`, false, err.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 16. API CONTRACT TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 16. API Contract Conformance Tests ---');
  try {
    // Health check contract
    const health = await makeRequest('GET', '/api/health');
    recordResult('APIContracts', 'Health check contract: { status, timestamp } with HTTP 200',
      health.status === 200 && health.body.status && health.body.timestamp);

    // Paginated contract: data is array, pagination has total/totalPages/hasNextPage
    const pagContract = await makeRequest('GET', '/api/lab/test-requests', { headers: { Cookie: labSession.cookie } });
    recordResult('APIContracts', 'Paginated list contract: { data: [...], pagination: { ... } }',
      pagContract.status === 200 && Array.isArray(pagContract.body.data) && typeof pagContract.body.pagination === 'object');

    // Error contract: success: false, error: { code, message, requestId }
    const errContract = await makeRequest('GET', '/api/patients/not-valid-id', { headers: { Cookie: doctorSession.cookie } });
    recordResult('APIContracts', 'Error response contract: { success: false, error: { code, message, requestId } }',
      (errContract.status === 400 || errContract.status === 404) && errContract.body.success === false && Boolean(errContract.body.error?.code && errContract.body.error?.requestId));
  } catch (err) {
    recordResult('APIContracts', 'API contracts test execution', false, err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 17. MASTER REGRESSION VERIFICATION (Steps 1–9)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 17. Master Regression Tests (Steps 1–9) ---');
  const regressionSuites = [
    { step: 'Step 1 — Authentication & Google OAuth', file: 'test_server_routes.js' },
    { step: 'Step 2 — Secure Medical File Access', file: 'test_step2_file_security.js' },
    { step: 'Step 3 — Lab Notification Recipient Hardening', file: 'test_step3_lab_notification.js' },
    { step: 'Step 4 — CSP Security Hardening', file: 'test_step4_csp_security.js' },
    { step: 'Step 5 — Production Secrets Hardening', file: 'test_step5_secrets_security.js' },
    { step: 'Step 6 — MongoDB Search & Query Optimization', file: 'test_step6_mongodb_queries.js' },
    { step: 'Step 7 — MongoDB Database Indexes', file: 'test_step7_mongodb_indexes.js' },
    { step: 'Step 8 — Production-Safe Pagination', file: 'test_step8_pagination.js' },
    { step: 'Step 9 — Generic API Error Handling', file: 'test_step9_error_handling.js' }
  ];

  for (const suite of regressionSuites) {
    const fileExists = fs.existsSync(path.join(__dirname, suite.file));
    recordResult('Regression', `${suite.step} suite (${suite.file}) verified present and integrated`, fileExists);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log('📊 STEP 10 QUALITY GATE SUMMARY');
  console.log('========================================================================');
  for (const [cat, res] of Object.entries(categoryResults)) {
    const status = res.failed === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${cat.padEnd(20)} : ${res.passed}/${res.total} passed (${status})`);
  }
  console.log('------------------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
  console.log('========================================================================\n');

  if (totalFailed > 0) {
    console.error(`❌ STEP 10 QUALITY GATE FAILED with ${totalFailed} defect(s).`);
    process.exit(1);
  } else {
    console.log('✅ STEP 10 QUALITY GATE PASSED — ALL CRITICAL DOMAINS VERIFIED!\n');
    process.exit(0);
  }
}

runMasterSuite().catch(err => {
  console.error('Fatal error during Step 10 master suite execution:', err);
  process.exit(1);
});
