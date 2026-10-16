/**
 * CareLink AI — Wearable Telemetry Simulator Simplification Test Suite
 * Validates the unified 2-action wearable monitoring engine and UI consolidation.
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
      {
        method,
        headers: reqHeaders
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => {
          resData += chunk;
        });
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
  console.log('⌚ CareLink AI — Wearable Simulator Simplification Test Suite');
  console.log('============================================================\n');

  // --- 1. Inspect Markup for Unified Two-Button Architecture ---
  console.log('--- 1. Markup & UI Architecture Verification ---');

  const patientHtmlPath = path.resolve(__dirname, '../../../frontend/pages/patient.html');
  const patientHtml = fs.readFileSync(patientHtmlPath, 'utf8');

  // Button 1: Start Live Monitoring toggle
  test(
    'patient.html contains Button 1: id="btnLiveMonitoringToggle"',
    patientHtml.includes('id="btnLiveMonitoringToggle"')
  );
  test(
    'Button 1 initially displays "Start Live Monitoring"',
    patientHtml.includes('Start Live Monitoring')
  );

  // Button 2: Simulate Emergency Event
  test(
    'patient.html contains Button 2: id="btnSimulateEmergencyEvent"',
    patientHtml.includes('id="btnSimulateEmergencyEvent"')
  );
  test(
    'Button 2 displays "Simulate Emergency Event"',
    patientHtml.includes('Simulate Emergency Event')
  );

  // Redundant controls removed
  test(
    'Redundant "Stream Normal Vitals" button removed from overview simulator banner',
    !patientHtml.includes('Stream Normal Vitals')
  );
  test(
    'Redundant "Simulate Hard Fall Event (Case Study)" button replaced by unified action',
    !patientHtml.includes('Simulate Hard Fall Event (Case Study)')
  );

  // Separate device connection status indicator
  test(
    'Device connection status is rendered separately as an indicator badge',
    patientHtml.includes('id="deviceConnectionStatusBadge"') &&
    patientHtml.includes('id="topbarDeviceStatus"')
  );

  // Top-level SOS button preserved
  test(
    'Top-level Emergency SOS button (id="sosBtn") remains preserved and intact',
    patientHtml.includes('id="sosBtn"') && patientHtml.includes('openSOSModal()')
  );

  // Data label and monitoring status
  test(
    'Contains monitoring status badge (id="wearableStatusBadge")',
    patientHtml.includes('id="wearableStatusBadge"')
  );
  test(
    'Contains telemetry data label (id="telemetryDataLabel" with SIMULATED DATA)',
    patientHtml.includes('id="telemetryDataLabel"') && patientHtml.includes('SIMULATED DATA')
  );

  // Emergency escalation panel removed from overview UI; alerts rendered in Recent Alerts & AI cards
  test(
    'Large red emergency escalation panel (id="emergencyStatusBanner") removed from overview UI',
    !patientHtml.includes('id="emergencyStatusBanner"') && !patientHtml.includes('CRITICAL EMERGENCY ESCALATION ACTIVE')
  );
  test(
    'Recent Alerts container (id="patientAlerts") is present for emergency alert display',
    patientHtml.includes('id="patientAlerts"')
  );
  test(
    'AI Health Analysis card (id="aiScoreCircle") is present for risk score display',
    patientHtml.includes('id="aiScoreCircle"')
  );

  // CSP check: Zero inline <script> tags
  const inlineScriptRegex = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  const inlineScripts = [...patientHtml.matchAll(inlineScriptRegex)];
  test(
    'patient.html conforms to strict CSP (ZERO inline <script> tags)',
    inlineScripts.length === 0
  );

  // --- 2. Authenticate Patient ---
  console.log('\n--- 2. Patient Authentication ---');
  const loginRes = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'ravi@demo.com', password: 'demo123' }
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const patientCookie = loginRes.setCookie.join('; ');
  const patientId = loginRes.body.user.id || loginRes.body.user._id;

  test('Patient demo account (ravi@demo.com) authenticated successfully', Boolean(patientCookie));

  // --- 3. Backend Ingestion: Live Monitoring (Normal Fluctuating Vitals) ---
  console.log('\n--- 3. Button 1: Live Monitoring Telemetry Ingestion ---');

  const normalPayload = {
    heartRate: 76,
    spo2: 98,
    temperature: 98.6,
    systolicBP: 120,
    diastolicBP: 80,
    glucoseLevel: 104,
    stepCount: 4720,
    fallDetected: false,
    source: 'simulated_wearable',
    isSimulated: true,
    roomLocation: 'Room 104, Sunrise Senior Home'
  };

  const normalRes = await makeRequest('POST', '/api/vitals/wearable-sync', {
    headers: { Cookie: patientCookie },
    body: normalPayload
  });

  test(
    'POST /api/vitals/wearable-sync ingests live monitoring telemetry (201 Created)',
    normalRes.status === 201 && normalRes.body.vitals
  );
  test(
    'Telemetry stored with source="simulated_wearable" and isSimulated=true',
    normalRes.body.vitals?.source === 'simulated_wearable' &&
    normalRes.body.vitals?.isSimulated === true
  );
  test(
    'Normal telemetry evaluated by AI with status="Normal" and low risk score',
    normalRes.body.ai?.status === 'Normal' &&
    normalRes.body.ai?.score < 40 &&
    normalRes.body.emergencyAlert === null
  );

  // Second tick with slight physiological drift
  const driftedPayload = {
    ...normalPayload,
    heartRate: 79,
    spo2: 97,
    temperature: 98.7,
    systolicBP: 122,
    diastolicBP: 81,
    glucoseLevel: 106,
    stepCount: 4725
  };
  const driftRes = await makeRequest('POST', '/api/vitals/wearable-sync', {
    headers: { Cookie: patientCookie },
    body: driftedPayload
  });
  test(
    'Subsequent drifted reading successfully ingested without error (201 Created)',
    driftRes.status === 201 && driftRes.body.vitals?.heartRate === 79
  );

  // Verify retrieval via latest vitals endpoint
  const latestRes = await makeRequest('GET', `/api/vitals/${patientId}/latest`, {
    headers: { Cookie: patientCookie }
  });
  test(
    'GET /api/vitals/:patientId/latest reflects most recent live telemetry stream',
    latestRes.status === 200 && latestRes.body.heartRate === 79 && latestRes.body.stepCount === 4725
  );

  // --- 4. Button 2: Simulate Emergency Event Ingestion ---
  console.log('\n--- 4. Button 2: Emergency Event Demonstration Ingestion ---');

  const emergencyPayload = {
    heartRate: 145,
    spo2: 86,
    temperature: 101.2,
    systolicBP: 154,
    diastolicBP: 98,
    glucoseLevel: 140,
    stepCount: 120,
    fallDetected: true,
    source: 'simulated_wearable',
    isSimulated: true,
    roomLocation: 'Room 104, Sunrise Senior Home',
    location: {
      latitude: 13.0827,
      longitude: 80.2707,
      accuracyMeters: 14,
      address: 'Simulated Senior Living Care Center, Chennai',
      source: 'gps',
      consentStatus: 'granted'
    }
  };

  const emergencyRes = await makeRequest('POST', '/api/vitals/wearable-sync', {
    headers: { Cookie: patientCookie },
    body: emergencyPayload
  });

  test(
    'POST /api/vitals/wearable-sync accepts simulated emergency event (201 Created)',
    emergencyRes.status === 201 && emergencyRes.body.vitals
  );
  test(
    'AI Risk Assessment evaluates emergency as status="Critical" with score >= 90',
    emergencyRes.body.ai?.status === 'Critical' && emergencyRes.body.ai?.score >= 90
  );
  const emgCase = emergencyRes.body.emergencyAlert?.emergencyCase || emergencyRes.body.emergencyAlert;
  test(
    'Emergency decision engine dispatches EmergencyCase alert with valid emergencyId',
    Boolean(emgCase && emgCase.emergencyId)
  );
  test(
    'Emergency alert associates incident location with GPS coordinates',
    emgCase?.location?.latitude === 13.0827 &&
    emgCase?.location?.longitude === 80.2707
  );

  // --- 5. Client Script Architecture Inspection ---
  console.log('\n--- 5. Client Script Architecture Inspection ---');

  const patientJsPath = (fs.existsSync(path.resolve(__dirname, '../../../frontend/js/patient/patient.js')) ? path.resolve(__dirname, '../../../frontend/js/patient/patient.js') : path.resolve(__dirname, '../../../frontend/js/patient.js'));
  const patientJs = fs.readFileSync(patientJsPath, 'utf8');

  test(
    'patient.js implements toggleLiveMonitoring() with timer start & stop',
    patientJs.includes('toggleLiveMonitoring') &&
    patientJs.includes('startLiveMonitoring') &&
    patientJs.includes('stopLiveMonitoring')
  );
  test(
    'patient.js implements simulateEmergencyEvent() with case-study telemetry injection',
    patientJs.includes('simulateEmergencyEvent') &&
    patientJs.includes('heartRate: 145') &&
    patientJs.includes('spo2: 86')
  );
  test(
    'patient.js binds beforeunload listener to stop simulation timers on exit',
    patientJs.includes("window.addEventListener('beforeunload'")
  );
  test(
    'patient.js provides backward-compatible window.simulateWearable wrapper',
    patientJs.includes('window.simulateWearable =')
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

runSuite().catch((err) => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
