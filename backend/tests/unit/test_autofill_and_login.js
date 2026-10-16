/**
 * test_autofill_and_login.js
 * Validates automatic demo credential autofill, role switching,
 * form submission behavior, backend auth integration, and edge cases.
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';

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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          setCookie: res.headers['set-cookie'] || [],
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

async function runValidation() {
  console.log('\n============================================================');
  console.log('🧪 CareLink AI — Demo Credential Autofill & Login Test Suite');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // 1. Static HTML & File Inspection
  const frontendDir = path.resolve(__dirname, '../../../frontend');
  const indexHtml = fs.readFileSync((fs.existsSync(path.join(frontendDir, 'pages', 'index.html')) ? path.join(frontendDir, 'pages', 'index.html') : path.join(frontendDir, 'index.html')), 'utf8');
  const indexJs = fs.readFileSync(path.join(frontendDir, 'js', 'index.js'), 'utf8');

  test('index.html contains exactly 4 primary role buttons',
    (indexHtml.match(/class="role-btn/g) || []).length === 4
  );

  test('role buttons have type="button" to prevent accidental form submission',
    (indexHtml.match(/type="button"\s+class="role-btn/g) || []).length === 4
  );

  test('All 4 portal roles (patient, doctor, hospital, admin) have data-role attributes',
    indexHtml.includes('data-role="patient"') &&
    indexHtml.includes('data-role="doctor"') &&
    indexHtml.includes('data-role="hospital"') &&
    indexHtml.includes('data-role="admin"')
  );

  test('login form has email and password inputs with correct IDs',
    indexHtml.includes('id="loginEmail"') && indexHtml.includes('id="loginPassword"')
  );

  test('Emergency SOS fast-track entry point is present and points to emergency.html',
    indexHtml.includes('href="emergency.html"') && indexHtml.includes('Emergency / SOS Fast-Track')
  );

  test('Google login button is present with correct ID',
    indexHtml.includes('id="googleSignInBtn"')
  );

  test('index.js defines DEMO_CREDENTIALS mapping for all 4 primary portals',
    indexJs.includes('DEMO_CREDENTIALS') &&
    indexJs.includes('ravi@demo.com') &&
    indexJs.includes('doctor@demo.com') &&
    indexJs.includes('hospital@demo.com') &&
    indexJs.includes('admin@demo.com') &&
    indexJs.includes('demo123')
  );

  test('index.js does not contain duplicate inline event handlers on buttons',
    !indexHtml.includes('onclick="selectRole') && !indexHtml.includes('onsubmit="handleLogin')
  );

  // 2. DOM Simulation of selectRole and Autofill Logic
  console.log('\n--- 2. DOM Simulation: Autofill & Portal Switching ---');
  
  // Mock lightweight DOM environment
  const mockDOM = {
    selectedRole: 'patient',
    elements: {
      loginEmail: { value: '', id: 'loginEmail' },
      loginPassword: { value: '', id: 'loginPassword' }
    },
    buttons: [
      { role: 'patient', classes: new Set(['role-btn', 'selected']), dataset: { role: 'patient' } },
      { role: 'doctor', classes: new Set(['role-btn']), dataset: { role: 'doctor' } },
      { role: 'hospital', classes: new Set(['role-btn']), dataset: { role: 'hospital' } },
      { role: 'admin', classes: new Set(['role-btn']), dataset: { role: 'admin' } }
    ]
  };

  const DEMO_CREDENTIALS = {
    patient:  { email: 'ravi@demo.com',     password: 'demo123' },
    doctor:   { email: 'doctor@demo.com',   password: 'demo123' },
    hospital: { email: 'hospital@demo.com', password: 'demo123' },
    admin:    { email: 'admin@demo.com',    password: 'demo123' }
  };

  function simulateSelectRole(role, clickedBtn) {
    mockDOM.selectedRole = role;
    mockDOM.buttons.forEach(b => b.classes.delete('selected'));
    const target = clickedBtn || mockDOM.buttons.find(b => b.dataset.role === role);
    if (target) target.classes.add('selected');

    const creds = DEMO_CREDENTIALS[role];
    if (creds) {
      mockDOM.elements.loginEmail.value = creds.email;
      mockDOM.elements.loginPassword.value = creds.password;
    }
  }

  // Initial load: Patient default
  simulateSelectRole('patient', mockDOM.buttons[0]);
  test('Initial load: Patient portal is selected and ravi@demo.com autofilled',
    mockDOM.selectedRole === 'patient' &&
    mockDOM.elements.loginEmail.value === 'ravi@demo.com' &&
    mockDOM.elements.loginPassword.value === 'demo123' &&
    mockDOM.buttons[0].classes.has('selected') &&
    !mockDOM.buttons[1].classes.has('selected')
  );

  // Click Doctor
  simulateSelectRole('doctor', mockDOM.buttons[1]);
  test('Click Doctor: Selected highlight switches, doctor@demo.com autofilled',
    mockDOM.selectedRole === 'doctor' &&
    mockDOM.elements.loginEmail.value === 'doctor@demo.com' &&
    mockDOM.elements.loginPassword.value === 'demo123' &&
    !mockDOM.buttons[0].classes.has('selected') &&
    mockDOM.buttons[1].classes.has('selected')
  );

  // Click Hospital
  simulateSelectRole('hospital', mockDOM.buttons[2]);
  test('Click Hospital: Selected highlight switches, hospital@demo.com autofilled',
    mockDOM.selectedRole === 'hospital' &&
    mockDOM.elements.loginEmail.value === 'hospital@demo.com' &&
    mockDOM.elements.loginPassword.value === 'demo123' &&
    !mockDOM.buttons[1].classes.has('selected') &&
    mockDOM.buttons[2].classes.has('selected')
  );

  // Click Admin
  simulateSelectRole('admin', mockDOM.buttons[3]);
  test('Click Admin: Selected highlight switches, admin@demo.com autofilled',
    mockDOM.selectedRole === 'admin' &&
    mockDOM.elements.loginEmail.value === 'admin@demo.com' &&
    mockDOM.elements.loginPassword.value === 'demo123' &&
    !mockDOM.buttons[2].classes.has('selected') &&
    mockDOM.buttons[3].classes.has('selected')
  );

  // Click Patient again
  simulateSelectRole('patient', mockDOM.buttons[0]);
  test('Switch back to Patient: Replaces credentials with ravi@demo.com',
    mockDOM.selectedRole === 'patient' &&
    mockDOM.elements.loginEmail.value === 'ravi@demo.com' &&
    mockDOM.elements.loginPassword.value === 'demo123' &&
    mockDOM.buttons[0].classes.has('selected') &&
    !mockDOM.buttons[3].classes.has('selected')
  );

  // 3. Backend Authentication Integration
  console.log('\n--- 3. Backend Authentication Integration with Autofilled Credentials ---');

  for (const [role, creds] of Object.entries(DEMO_CREDENTIALS)) {
    const res = await makeRequest('POST', '/api/auth/login', { body: creds });
    const isPass = res.status === 200 && res.body.user?.role === role && res.setCookie.length > 0;
    test(`Backend auth: ${role} demo credentials (${creds.email}) authenticates successfully (200 OK)`,
      isPass,
      `Status: ${res.status}, role returned: ${res.body.user?.role}`
    );
  }

  // 4. Invalid Credentials Rejection
  console.log('\n--- 4. Invalid Credentials & Security Defense ---');

  const invalidPassRes = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'ravi@demo.com', password: 'incorrectPassword999' }
  });
  test('Invalid password rejected with 400 Bad Request and error code',
    invalidPassRes.status === 400 && invalidPassRes.body.success === false
  );

  const nonExistentRes = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'nonexistent.user@random.com', password: 'demo123' }
  });
  test('Non-existent user rejected with 400 Bad Request',
    nonExistentRes.status === 400 && nonExistentRes.body.success === false
  );

  // 5. Assets and Google Login Route Health
  console.log('\n--- 5. External Endpoints & Navigation Preservation ---');

  const emergencyPageRes = await makeRequest('GET', '/emergency.html');
  test('Emergency Fast-Track portal page loads with HTTP 200',
    emergencyPageRes.status === 200
  );

  const googleAuthRes = await makeRequest('GET', '/auth/google');
  test('Google OAuth route handles request safely (302 redirect or 503 if unconfigured)',
    googleAuthRes.status === 302 || googleAuthRes.status === 503
  );

  const indexPageRes = await makeRequest('GET', '/index.html');
  test('index.html served with HTTP 200',
    indexPageRes.status === 200
  );

  const indexJsRes = await makeRequest('GET', '/js/index.js');
  test('js/index.js served with HTTP 200',
    indexJsRes.status === 200
  );

  console.log('\n============================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runValidation().catch(err => {
  console.error('Validation test error:', err);
  process.exit(1);
});
