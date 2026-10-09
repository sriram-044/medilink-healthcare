/**
 * test_step4_csp_security.js
 *
 * Automated verification suite for STEP 4:
 * Content Security Policy (CSP) Security Hardening
 *
 * Verifies:
 *  - Test 1: CSP Header is present and correctly formatted on HTTP responses
 *  - Test 2: Unrestricted wildcards (*) are forbidden on all directives
 *  - Test 3: object-src is strictly 'none'
 *  - Test 4: base-uri is strictly 'self'
 *  - Test 5: 'unsafe-eval' is NOT permitted in script-src
 *  - Test 6: frame-ancestors is restricted to 'self' (clickjacking defense)
 *  - Test 7: form-action is restricted to 'self' and Google accounts
 *  - Test 8: CSP violation report endpoint (POST /api/csp-report) functions correctly
 *  - Test 9: All frontend HTML files have zero inline <script> tags
 *  - Test 10: All external JavaScript and CSS assets load with correct MIME types
 *  - Test 11: Authentication & /api/auth/me endpoints work with httpOnly cookies (Step 1 preserved)
 *  - Test 12: Medical file access security and RBAC are preserved (Step 2 preserved)
 *  - Test 13: Lab notification routing to lab staff is preserved (Step 3 preserved)
 *  - Test 14: Google OAuth initiation route redirects to accounts.google.com
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const MedicalReport = require('./models/MedicalReport');
const TestRequest = require('./models/TestRequest');
const Notification = require('./models/Notification');
const storageService = require('./utils/storageService');

let mongod;
let server;
let app;
let port;
let baseUrl;

let patientUser;
let doctorUser;
let labUser;
let adminUser;

let patientToken;
let doctorToken;
let labToken;
let adminToken;
let pharmacyToken;

let testReport;

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

function request(method, urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlPath, baseUrl);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: opts.headers || {}
    };

    if (opts.cookie) {
      reqOpts.headers['Cookie'] = opts.cookie;
    }

    let postBody = null;
    if (opts.body) {
      postBody = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      reqOpts.headers['Content-Type'] = opts.contentType || 'application/json';
      reqOpts.headers['Content-Length'] = Buffer.byteLength(postBody);
    }

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          raw: data
        });
      });
    });

    req.on('error', reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

function parseCsp(cspHeader) {
  if (!cspHeader) return {};
  const directives = {};
  cspHeader.split(';').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const [name, ...values] = trimmed.split(/\s+/);
    directives[name] = values;
  });
  return directives;
}

async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.PORT = 0; // Random available port
  process.env.JWT_SECRET = 'test_jwt_secret_step4_csp_carelink_2026';

  // Import app after setting env vars
  app = require('./server');

  // Start HTTP server on dynamic port
  server = app.listen(0);
  port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  // Seed test users
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('demo123', salt);

  patientUser = await new User({
    name: 'Ravi Kumar',
    email: 'ravi.csp@test.com',
    password: passwordHash,
    role: 'patient',
    isActive: true
  }).save();

  doctorUser = await new User({
    name: 'Dr. Priya Sharma',
    email: 'doctor.csp@test.com',
    password: passwordHash,
    role: 'doctor',
    specialization: 'Cardiology',
    isActive: true
  }).save();

  labUser = await new User({
    name: 'Lab Tech Alice',
    email: 'alice.csp@test.com',
    password: passwordHash,
    role: 'lab',
    isActive: true
  }).save();

  adminUser = await new User({
    name: 'Admin System',
    email: 'admin.csp@test.com',
    password: passwordHash,
    role: 'admin',
    isActive: true
  }).save();

  const pharmacyUser = await new User({
    name: 'Pharmacist Bob',
    email: 'pharmacy.csp@test.com',
    password: passwordHash,
    role: 'pharmacy',
    isActive: true
  }).save();

  patientToken = jwt.sign({ id: patientUser._id, role: 'patient' }, process.env.JWT_SECRET);
  doctorToken = jwt.sign({ id: doctorUser._id, role: 'doctor' }, process.env.JWT_SECRET);
  labToken = jwt.sign({ id: labUser._id, role: 'lab' }, process.env.JWT_SECRET);
  adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET);
  pharmacyToken = jwt.sign({ id: pharmacyUser._id, role: 'pharmacy' }, process.env.JWT_SECRET);

  // Seed sample file in storage for medical report tests
  const samplePdfContent = Buffer.from('%PDF-1.4 test pdf medical content for CSP verification');
  const uploadRes = await storageService.uploadFile(samplePdfContent, 'test_cbc_csp.pdf');
  const storedFileName = uploadRes.fileName;

  testReport = await new MedicalReport({
    patientId: patientUser._id,
    doctorId: doctorUser._id,
    uploaderId: labUser._id,
    reportType: 'CBC Blood Test',
    category: 'Laboratory',
    fileName: storedFileName,
    originalFileName: 'cbc_report.pdf',
    fileSize: samplePdfContent.length,
    mimeType: 'application/pdf',
    fileFormat: 'PDF',
    overallStatus: 'Normal'
  }).save();
}

async function teardown() {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function runTests() {
  console.log('🛡️ Starting Step 4 Content Security Policy (CSP) Verification...\n');
  await setup();

  let cspHeader;
  let parsedDirectives;

  // ─── Test 1: CSP Header Presence ──────────────────────────────────────────
  await test('Test 1 — CSP Header exists and is delivered on HTTP responses', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);

    cspHeader = res.headers['content-security-policy'];
    assert.ok(cspHeader, 'Response must include Content-Security-Policy header');
    parsedDirectives = parseCsp(cspHeader);

    // Also verify static frontend requests receive the CSP header
    const frontendRes = await request('GET', '/index.html');
    assert.strictEqual(frontendRes.status, 200);
    assert.ok(
      frontendRes.headers['content-security-policy'],
      'Frontend HTML responses must include Content-Security-Policy header'
    );
  });

  // ─── Test 2: No Wildcard Abuse ───────────────────────────────────────────
  await test('Test 2 — CSP does not contain unrestricted wildcard (*) directives', async () => {
    assert.ok(parsedDirectives['default-src'], 'default-src directive must exist');
    assert.ok(!parsedDirectives['default-src'].includes('*'), 'default-src must not be wildcard *');

    assert.ok(parsedDirectives['script-src'], 'script-src directive must exist');
    assert.ok(!parsedDirectives['script-src'].includes('*'), 'script-src must not be wildcard *');

    assert.ok(parsedDirectives['connect-src'], 'connect-src directive must exist');
    assert.ok(!parsedDirectives['connect-src'].includes('*'), 'connect-src must not be wildcard *');

    assert.ok(parsedDirectives['frame-src'], 'frame-src directive must exist');
    assert.ok(!parsedDirectives['frame-src'].includes('*'), 'frame-src must not be wildcard *');

    assert.ok(parsedDirectives['img-src'], 'img-src directive must exist');
    assert.ok(!parsedDirectives['img-src'].includes('*'), 'img-src must not be unrestricted wildcard *');
  });

  // ─── Test 3: object-src is 'none' ─────────────────────────────────────────
  await test('Test 3 — object-src is strictly restricted to \'none\'', async () => {
    assert.ok(parsedDirectives['object-src'], 'object-src directive must exist');
    assert.deepStrictEqual(parsedDirectives['object-src'], ["'none'"], "object-src must be ['none']");
  });

  // ─── Test 4: base-uri is 'self' ───────────────────────────────────────────
  await test('Test 4 — base-uri is strictly restricted to \'self\'', async () => {
    assert.ok(parsedDirectives['base-uri'], 'base-uri directive must exist');
    assert.deepStrictEqual(parsedDirectives['base-uri'], ["'self'"], "base-uri must be ['self']");
  });

  // ─── Test 5: 'unsafe-eval' is forbidden ──────────────────────────────────
  await test('Test 5 — \'unsafe-eval\' is NOT permitted in script-src', async () => {
    const scriptSrc = parsedDirectives['script-src'] || [];
    assert.ok(
      !scriptSrc.includes("'unsafe-eval'"),
      "script-src must NOT include 'unsafe-eval'"
    );
  });

  // ─── Test 6: Frame Ancestors (Clickjacking defense) ──────────────────────
  await test('Test 6 — frame-ancestors is restricted to \'self\' (clickjacking protection)', async () => {
    assert.ok(parsedDirectives['frame-ancestors'], 'frame-ancestors directive must exist');
    assert.deepStrictEqual(
      parsedDirectives['frame-ancestors'],
      ["'self'"],
      "frame-ancestors must be ['self']"
    );
  });

  // ─── Test 7: Form Action ──────────────────────────────────────────────────
  await test('Test 7 — form-action restricts submission destinations to \'self\' and Google', async () => {
    assert.ok(parsedDirectives['form-action'], 'form-action directive must exist');
    assert.ok(parsedDirectives['form-action'].includes("'self'"), "form-action must permit 'self'");
    assert.ok(
      parsedDirectives['form-action'].includes('https://accounts.google.com'),
      'form-action must permit Google OAuth'
    );
  });

  // ─── Test 8: CSP Violation Report Endpoint ────────────────────────────────
  await test('Test 8 — CSP report endpoint (POST /api/csp-report) receives and logs violation data', async () => {
    const mockReport = {
      'csp-report': {
        'document-uri': 'http://localhost:5000/patient.html',
        'violated-directive': 'script-src',
        'effective-directive': 'script-src',
        'blocked-uri': 'http://malicious-cdn.com/evil.js',
        'status-code': 200
      }
    };

    const res = await request('POST', '/api/csp-report', {
      body: mockReport,
      contentType: 'application/csp-report'
    });
    assert.strictEqual(res.status, 204, 'CSP report endpoint must respond with 204 No Content');
  });

  // ─── Test 9: Zero Inline <script> Tags in Frontend HTML ───────────────────
  await test('Test 9 — All frontend HTML files have ZERO inline <script> tags', async () => {
    const frontendDir = fs.existsSync(path.join(__dirname, 'frontend'))
      ? path.join(__dirname, 'frontend')
      : path.join(__dirname, '..', 'frontend');
    const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
      const filePath = path.join(frontendDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for <script> tags that do not have a src attribute
      const inlineScriptRegex = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
      const matches = content.match(inlineScriptRegex);
      assert.strictEqual(
        matches,
        null,
        `File ${file} must have zero inline <script> tags. Found: ${matches?.length}`
      );
    }
  });

  // ─── Test 10: Static Assets Load with Proper MIME Types ───────────────────
  await test('Test 10 — External scripts and styles load successfully with correct MIME types', async () => {
    const assets = [
      { path: '/js/auth.js', mime: 'javascript' },
      { path: '/js/index.js', mime: 'javascript' },
      { path: '/js/pharmacy.js', mime: 'javascript' },
      { path: '/js/insurance.js', mime: 'javascript' },
      { path: '/js/auth-success.js', mime: 'javascript' },
      { path: '/js/lab.js', mime: 'javascript' },
      { path: '/js/doctor.js', mime: 'javascript' },
      { path: '/js/emergency.js', mime: 'javascript' },
      { path: '/js/patient.js', mime: 'javascript' },
      { path: '/css/style.css', mime: 'css' }
    ];

    for (const a of assets) {
      const res = await request('GET', a.path);
      assert.strictEqual(res.status, 200, `Asset ${a.path} must return 200`);
      const ct = res.headers['content-type'] || '';
      assert.ok(
        ct.includes(a.mime),
        `Asset ${a.path} content-type (${ct}) must contain ${a.mime}`
      );
    }
  });

  // ─── Test 11: Authentication & /api/auth/me (Step 1 Preserved) ───────────
  await test('Test 11 — Authentication & /api/auth/me operate securely under CSP', async () => {
    // 1. Login via API
    const loginRes = await request('POST', '/api/auth/login', {
      body: { email: 'ravi.csp@test.com', password: 'demo123' }
    });
    assert.strictEqual(loginRes.status, 200, 'Login must succeed');
    assert.ok(loginRes.body.user, 'Login response must contain user');

    const setCookie = loginRes.headers['set-cookie'];
    assert.ok(setCookie, 'Login must set auth cookie');
    const authCookie = setCookie.find(c => c.startsWith('carelink_auth='));
    assert.ok(authCookie, 'carelink_auth cookie must be set');
    assert.ok(authCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');

    const cookieHeader = authCookie.split(';')[0];

    // 2. Query /api/auth/me with the httpOnly cookie
    const meRes = await request('GET', '/api/auth/me', { cookie: cookieHeader });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.authenticated, true);
    assert.strictEqual(meRes.body.user.email, 'ravi.csp@test.com');
  });

  // ─── Test 12: Medical File Security & RBAC (Step 2 Preserved) ────────────
  await test('Test 12 — Medical file access authorization and RBAC operate under CSP', async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await request('GET', `/api/medical-reports/${testReport._id}/view`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated file view must return 401');

    // 2. Patient who owns the report -> 200 with nosniff and no-store
    const patientRes = await request('GET', `/api/medical-reports/${testReport._id}/view`, {
      cookie: `carelink_auth=${patientToken}`
    });
    assert.strictEqual(patientRes.status, 200, 'Patient owner must be allowed to view file');
    assert.strictEqual(patientRes.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(patientRes.headers['cache-control'], 'no-store');
    assert.ok(patientRes.headers['content-security-policy'], 'File response must include CSP');

    // 3. Unauthorized role (pharmacy user) -> 403
    const deniedRes = await request('GET', `/api/medical-reports/${testReport._id}/view`, {
      cookie: `carelink_auth=${pharmacyToken}`
    });
    assert.strictEqual(deniedRes.status, 403, 'Pharmacy role must be denied access to medical reports');
  });

  // ─── Test 13: Lab Notification Routing (Step 3 Preserved) ────────────────
  await test('Test 13 — Lab notification recipient routing operates under CSP', async () => {
    // Create test request as doctor
    const testReqRes = await request('POST', '/api/lab/test-requests', {
      cookie: `carelink_auth=${doctorToken}`,
      body: {
        patientId: patientUser._id.toString(),
        testName: 'Lipid Profile',
        priority: 'Normal'
      }
    });
    assert.strictEqual(testReqRes.status, 201, 'Doctor must be able to create test request');

    const createdReq = testReqRes.body.testRequest;
    assert.ok(createdReq, 'Response must contain testRequest');

    // Verify notification was sent to lab user, NOT doctor
    const notifs = await Notification.find({ testRequestId: createdReq._id });
    assert.ok(notifs.length > 0, 'Notification must be created');
    for (const n of notifs) {
      assert.notStrictEqual(
        n.recipientId.toString(),
        doctorUser._id.toString(),
        'Notification recipient must NOT be the doctor'
      );
      assert.strictEqual(n.role, 'lab', 'Notification role must be lab');
    }

    // Verify lab user retrieves notifications via GET /api/lab/notifications
    const labNotifRes = await request('GET', '/api/lab/notifications', {
      cookie: `carelink_auth=${labToken}`
    });
    assert.strictEqual(labNotifRes.status, 200);
    assert.ok(Array.isArray(labNotifRes.body), 'Must return array of notifications');
    assert.ok(labNotifRes.body.length > 0, 'Lab user must receive notifications');
  });

  // ─── Test 14: Google OAuth Initiation ────────────────────────────────────
  await test('Test 14 — Google OAuth initiation route redirects to accounts.google.com', async () => {
    const oauthRes = await request('GET', '/auth/google');
    // Passport redirect to Google OAuth is 302
    assert.strictEqual(oauthRes.status, 302, 'OAuth route must redirect');
    const location = oauthRes.headers['location'] || '';
    assert.ok(
      location.startsWith('https://accounts.google.com/'),
      `Redirect target (${location}) must start with https://accounts.google.com/`
    );
  });

  console.log('\n========================================');
  console.log(`CSP Test Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('========================================\n');

  await teardown();
  process.exit(failedCount > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('CSP test suite execution error:', err);
  process.exit(1);
});
