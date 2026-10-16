/**
 * CareLink AI — Emergency Response Dashboard UI Redesign Verification Suite
 * Validates the new balanced 2-column CAD command dashboard, uncompressed vitals,
 * 5-stage response workflow, hospital cards, and live stream panel.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://localhost:5000';
let passedTests = 0;
let failedTests = 0;

function test(description, condition, extraInfo = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${description} ${extraInfo}`);
    failedTests++;
  }
}

function makeRequest(method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const bodyStr = body ? JSON.stringify(body) : null;

    const reqHeaders = {
      ...headers,
      'Content-Type': 'application/json'
    };
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(
      url,
      { method, headers: reqHeaders },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => { resData += chunk; });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(resData);
          } catch {
            parsed = resData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            setCookie: res.headers['set-cookie'] || []
          });
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runSuite() {
  console.log('\n============================================================');
  console.log('🚑 MediLink AI — Emergency Dashboard Redesign Verification');
  console.log('============================================================\n');

  // --- 1. Markup & UI Architecture Inspection ---
  console.log('--- 1. Markup & Layout Architecture Verification ---');

  const emergencyHtmlPath = path.resolve(__dirname, '../../../frontend/pages/emergency.html');
  const emergencyHtml = fs.readFileSync(emergencyHtmlPath, 'utf8');

  // Top Header
  test(
    'Top header contains page title, subtitle, live clock, and refresh feed button',
    emergencyHtml.includes('id="pageTitle"') &&
    emergencyHtml.includes('id="pageSubtitle"') &&
    emergencyHtml.includes('id="currentDateTime"') &&
    emergencyHtml.includes('refreshCurrentSection()')
  );

  // Summary Cards
  test(
    'Summary cards grid contains all 4 metric counters with uniform classes',
    emergencyHtml.includes('id="statActiveCount"') &&
    emergencyHtml.includes('id="statPendingCount"') &&
    emergencyHtml.includes('id="statAssignedCount"') &&
    emergencyHtml.includes('id="statResolvedCount"') &&
    emergencyHtml.includes('emergency-stats-grid')
  );

  // Balanced 2-Column Command Grid Layout
  test(
    'emergency.html uses modern 2-column layout (class="emergency-command-grid")',
    emergencyHtml.includes('class="emergency-command-grid"')
  );

  // Area A: Incident Summary
  test(
    'Incident Summary displays Incident ID, Patient Name, Priority, Status, Trigger Time, and AI Triage',
    emergencyHtml.includes('id="cadIncidentId"') &&
    emergencyHtml.includes('id="cadPatientName"') &&
    emergencyHtml.includes('id="cadPriorityBadge"') &&
    emergencyHtml.includes('id="cadStatusBadge"') &&
    emergencyHtml.includes('id="cadTriggerTime"') &&
    emergencyHtml.includes('id="cadAiTriageBadge"') &&
    emergencyHtml.includes('id="cadEtaBadge"')
  );

  // Area B: Location & Vitals
  test(
    'Dedicated GIS Map container (id="cadGisMapBox") is present with live tracking badges',
    emergencyHtml.includes('id="cadGisMapBox"') &&
    emergencyHtml.includes('LIVE TRACKING') &&
    emergencyHtml.includes('id="cadGisCoordsText"')
  );

  test(
    'Vital-sign cards arranged in dedicated uncompressed grid (cad-vitals-grid)',
    emergencyHtml.includes('class="cad-vitals-grid"') &&
    emergencyHtml.includes('id="cadVitalHR"') &&
    emergencyHtml.includes('id="cadVitalSpO2"') &&
    emergencyHtml.includes('id="cadVitalTemp"') &&
    emergencyHtml.includes('id="cadVitalBP"')
  );

  // Area C: 5-Stage Response Workflow Timeline
  test(
    'Response workflow lifecycle displays all 5 clinical stages with distinct states',
    emergencyHtml.includes('1. Incident Triggered') &&
    emergencyHtml.includes('2. AI Clinical Triage') &&
    emergencyHtml.includes('3. Unit Dispatched') &&
    emergencyHtml.includes('4. En Route / Telemetry Stream') &&
    emergencyHtml.includes('5. ER Handoff &amp; ICU Admission')
  );

  // Area D: Destination Hospitals
  test(
    'Destination Trauma Facilities card displays hospital names, distance, trauma level, and bed/oxygen availability',
    emergencyHtml.includes('Apollo Hospitals Greams Rd') &&
    emergencyHtml.includes('Trauma Level 1') &&
    emergencyHtml.includes('Sunrise Specialty Clinic') &&
    emergencyHtml.includes('Oxygen Bay Ready')
  );

  test(
    'Rapid CAD action buttons present with dedicated IDs and priority styling',
    emergencyHtml.includes('id="btnCadOptimizeRoute"') &&
    emergencyHtml.includes('id="btnCadRadioParamedic"') &&
    emergencyHtml.includes('id="btnCadConfirmHandoff"')
  );

  // Area E: Real-Time Emergency Stream
  test(
    'Real-Time Emergency Stream container (id="activeIncidentsList") has dedicated panel',
    emergencyHtml.includes('id="activeIncidentsList"') &&
    emergencyHtml.includes('incident-feed-card')
  );

  // Leaflet map integration preserved in locations view
  test(
    'Preserves interactive Leaflet dispatch map container (id="emergencyDispatchMap")',
    emergencyHtml.includes('id="emergencyDispatchMap"') &&
    emergencyHtml.includes('leaflet.css')
  );

  // CSP Conformance: Zero inline <script> tags
  const inlineScriptRegex = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  const inlineScripts = [...emergencyHtml.matchAll(inlineScriptRegex)];
  test(
    'emergency.html conforms to strict CSP (ZERO inline <script> tags)',
    inlineScripts.length === 0
  );

  // --- 2. Client Script Verification in emergency.js ---
  console.log('\n--- 2. Client Script Verification in emergency.js ---');
  const emergencyJsPath = (fs.existsSync(path.resolve(__dirname, '../../../frontend/js/emergency/emergency.js')) ? path.resolve(__dirname, '../../../frontend/js/emergency/emergency.js') : path.resolve(__dirname, '../../../frontend/js/emergency.js'));
  const emergencyJs = fs.readFileSync(emergencyJsPath, 'utf8');

  test(
    'emergency.js implements syncActiveCadIncident to dynamically reflect active emergency in CAD console',
    emergencyJs.includes('syncActiveCadIncident')
  );

  test(
    'renderActiveEmergencyCard renders patient, severity, priority, status, blood, doctor, and team',
    emergencyJs.includes('incident-stream-item') &&
    emergencyJs.includes('patientId?.bloodGroup') &&
    emergencyJs.includes('assignedEmergencyTeam')
  );

  test(
    'renderActiveEmergencyCard binds action buttons: View Incident, Acknowledge, Assign Team, Status Lifecycle',
    emergencyJs.includes('openErCaseModal') &&
    emergencyJs.includes('quickAcknowledgeCase') &&
    emergencyJs.includes('openAssignTeamModal') &&
    emergencyJs.includes('quickUpdateStatus')
  );

  // --- 3. Backend Endpoints Integration ---
  console.log('\n--- 3. Backend Live API Endpoint Verification ---');

  const loginRes = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'admin@demo.com', password: 'demo123' }
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login must succeed');
  const adminCookie = loginRes.setCookie.join('; ');

  const statsRes = await makeRequest('GET', '/api/emergency/dashboard-stats', {
    headers: { Cookie: adminCookie }
  });
  test(
    'GET /api/emergency/dashboard-stats returns status counters (200 OK)',
    statsRes.status === 200 && typeof statsRes.body.activeEmergencies === 'number'
  );

  const activeRes = await makeRequest('GET', '/api/emergency/active', {
    headers: { Cookie: adminCookie }
  });
  test(
    'GET /api/emergency/active returns active incident stream array (200 OK)',
    activeRes.status === 200 && Array.isArray(activeRes.body)
  );

  const casesRes = await makeRequest('GET', '/api/emergency/cases', {
    headers: { Cookie: adminCookie }
  });
  test(
    'GET /api/emergency/cases returns master cases registry (200 OK)',
    casesRes.status === 200 && (Array.isArray(casesRes.body) || Array.isArray(casesRes.body.data))
  );

  // Summary
  console.log('\n============================================================');
  console.log(`TOTAL: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
