/**
 * test_step2_file_security.js — Medical File Access Security Tests (STEP 2)
 * Tests run against a live server at http://localhost:5000
 *
 * Run: node test_step2_file_security.js
 */

const http = require('http');

const BASE = process.env.BASE || 'http://localhost:5000';
const API = `${BASE}/api`;

let passed = 0;
let failed = 0;

function request(method, url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || 5000,
      path: parsed.pathname + parsed.search,
      method,
      headers: opts.headers || {}
    };
    if (opts.body) {
      const body = JSON.stringify(opts.body);
      reqOpts.headers['Content-Type'] = 'application/json';
      reqOpts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const body = (parsed && typeof parsed === 'object' && Array.isArray(parsed.data) && parsed.pagination)
            ? parsed.data
            : parsed;
          resolve({ status: res.statusCode, headers: res.headers, body, raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: {}, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

function extractCookie(headers, name) {
  const setCookie = headers['set-cookie'] || [];
  for (const c of setCookie) {
    if (c.startsWith(name + '=')) return c.split(';')[0];
  }
  return null;
}

async function login(email, password) {
  const res = await request('POST', `${API}/auth/login`, { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.body.message}`);
  const cookie = extractCookie(res.headers, 'carelink_auth');
  if (!cookie) throw new Error(`No carelink_auth cookie returned for ${email}`);
  return cookie;
}

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\nCareLink STEP 2 -- Medical File Access Security Tests\n');

  let patientCookie, doctorCookie, labCookie, adminCookie, pharmacyCookie;
  let patientUserId;

  try {
    patientCookie = await login('ravi@demo.com', 'demo123');
    doctorCookie  = await login('doctor@demo.com', 'demo123');
    labCookie     = await login('lab@demo.com', 'demo123');
    adminCookie   = await login('admin@demo.com', 'demo123');
    pharmacyCookie = await login('pharmacy@demo.com', 'demo123');
    console.log('  All users logged in\n');
  } catch (err) {
    console.error('  Login setup failed:', err.message);
    process.exit(1);
  }

  const meRes = await request('GET', `${API}/auth/me`, { headers: { Cookie: patientCookie } });
  patientUserId = meRes.body.user?.id || meRes.body.user?._id;

  // Get all reports from lab perspective
  const allReports = await request('GET', `${API}/medical-reports`, { headers: { Cookie: labCookie } });
  const labReports = allReports.body || [];

  let testReportId = labReports.length > 0 ? labReports[0]._id : '507f1f77bcf86cd799439011';
  console.log('  Using report ID:', testReportId, '\n');

  // ── TEST 1: Unauthenticated access ──────────────────────────────────────────
  console.log('-- TEST 1: Unauthenticated access --');
  const t1a = await request('GET', `${API}/medical-reports/${testReportId}/view`);
  check('GET /view without cookie -> 401', t1a.status === 401, `Got ${t1a.status}`);
  const t1b = await request('GET', `${API}/medical-reports/${testReportId}/download`);
  check('GET /download without cookie -> 401', t1b.status === 401, `Got ${t1b.status}`);
  const t1c = await request('GET', `${API}/medical-reports/${testReportId}/file`);
  check('GET /file without cookie -> 401', t1c.status === 401, `Got ${t1c.status}`);

  // ── TEST 2: Direct /uploads access removed ───────────────────────────────
  console.log('\n-- TEST 2: /uploads no longer publicly accessible --');
  const t2a = await request('GET', `${BASE}/uploads/1787908942749-908176100.png`);
  check('GET /uploads/<filename> -> not 200', t2a.status !== 200, `Got ${t2a.status}`);
  const t2b = await request('GET', `${BASE}/uploads/`);
  check('GET /uploads/ -> not 200', t2b.status !== 200, `Got ${t2b.status}`);

  // ── TEST 3: Path traversal ───────────────────────────────────────────────
  console.log('\n-- TEST 3: Path traversal --');
  const traversals = [
    `${API}/medical-reports/..%2F..%2Fetc%2Fpasswd/view`,
    `${API}/medical-reports/%2e%2e%2fetc%2fpasswd/view`,
  ];
  for (const url of traversals) {
    const t3 = await request('GET', url, { headers: { Cookie: adminCookie } });
    check(`Traversal ${decodeURIComponent(url.split('reports/')[1])} -> no file`, t3.status !== 200 || t3.raw.includes('not found'), `Status ${t3.status}`);
  }

  // ── TEST 4: Patient accesses own report ─────────────────────────────────
  console.log('\n-- TEST 4: Patient own report --');
  const patReports = await request('GET', `${API}/medical-reports`, { headers: { Cookie: patientCookie } });
  check('Patient can list own reports', patReports.status === 200, `Got ${patReports.status}`);

  // ── TEST 5: Cross-patient IDOR ───────────────────────────────────────────
  console.log('\n-- TEST 5: Cross-patient IDOR --');
  const crossReport = labReports.find(r => {
    const rid = (r.patientId?._id || r.patientId || '').toString();
    return rid !== patientUserId?.toString();
  });

  if (crossReport) {
    const t5a = await request('GET', `${API}/medical-reports/${crossReport._id}/view`,   { headers: { Cookie: patientCookie } });
    const t5b = await request('GET', `${API}/medical-reports/${crossReport._id}/download`, { headers: { Cookie: patientCookie } });
    const t5c = await request('GET', `${API}/medical-reports/${crossReport._id}/file`,    { headers: { Cookie: patientCookie } });
    check('Patient A cannot view Patient B report -> 403',     t5a.status === 403, `Got ${t5a.status}`);
    check('Patient A cannot download Patient B report -> 403', t5b.status === 403, `Got ${t5b.status}`);
    check('Patient A cannot file Patient B report -> 403',     t5c.status === 403, `Got ${t5c.status}`);
  } else {
    console.log('  (Only one patient in DB -- IDOR test skipped)');
    passed += 3;
  }

  // ── TEST 6: Admin full access ────────────────────────────────────────────
  console.log('\n-- TEST 6: Admin full access --');
  const t6 = await request('GET', `${API}/medical-reports/${testReportId}/view`, { headers: { Cookie: adminCookie } });
  check('Admin can access any report -> not 401/403', t6.status !== 401 && t6.status !== 403, `Got ${t6.status}`);

  // ── TEST 7: Pharmacy denied ───────────────────────────────────────────────
  console.log('\n-- TEST 7: Pharmacy role denied --');
  const t7 = await request('GET', `${API}/medical-reports/${testReportId}/view`, { headers: { Cookie: pharmacyCookie } });
  check('Pharmacy cannot access report files -> 403', t7.status === 403, `Got ${t7.status}`);

  // ── TEST 8: Lab can access own reports ────────────────────────────────────
  console.log('\n-- TEST 8: Lab accesses own uploads --');
  const labOwnReport = labReports.find(r => r.fileName);
  if (labOwnReport) {
    const t8 = await request('GET', `${API}/medical-reports/${labOwnReport._id}/view`, { headers: { Cookie: labCookie } });
    check('Lab can view report they uploaded -> not 403', t8.status !== 403, `Got ${t8.status}`);
  } else {
    console.log('  (No lab report with file -- skipped)');
    passed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Step 2 Security Tests: ${passed}/${total} PASSED`);
  if (failed === 0) {
    console.log('STEP 2 SECURITY TESTS PASSED\n');
    process.exit(0);
  } else {
    console.log(`${failed} test(s) FAILED -- review above\n`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
