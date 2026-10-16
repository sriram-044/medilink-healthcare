/**
 * CareLink AI — Patient Portal Emergency UI Verification Test
 * Verifies that the large red emergency escalation panel is completely removed from patient overview
 * and that emergency events are properly displayed in Recent Alerts and AI Health Analysis.
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

async function run() {
  console.log('\n============================================================');
  console.log('🩺 CareLink AI — Emergency Alert Box Removal Verification');
  console.log('============================================================\n');

  // --- 1. Markup Verification in patient.html ---
  console.log('--- 1. Markup Verification in patient.html ---');
  const patientHtmlPath = path.resolve(__dirname, '../../../frontend/pages/patient.html');
  const patientHtml = fs.readFileSync(patientHtmlPath, 'utf8');

  test(
    'Red emergency escalation panel (id="emergencyStatusBanner") is removed from patient.html',
    !patientHtml.includes('id="emergencyStatusBanner"')
  );
  test(
    'Text "CRITICAL EMERGENCY ESCALATION ACTIVE" is removed from patient.html',
    !patientHtml.includes('CRITICAL EMERGENCY ESCALATION ACTIVE')
  );
  test(
    'Red banner child IDs (emergencyBannerDetails, caregiverPhoneDisp, familyPhoneDisp, hospitalDispatchDisp) removed',
    !patientHtml.includes('id="emergencyBannerDetails"') &&
    !patientHtml.includes('id="caregiverPhoneDisp"') &&
    !patientHtml.includes('id="familyPhoneDisp"') &&
    !patientHtml.includes('id="hospitalDispatchDisp"')
  );
  test(
    'Top navigation red SOS button (id="sosBtn") is preserved and intact',
    patientHtml.includes('id="sosBtn"') && patientHtml.includes('openSOSModal()')
  );
  test(
    'Recent Alerts container (id="patientAlerts") is preserved for alert display',
    patientHtml.includes('id="patientAlerts"')
  );
  test(
    'AI Health Analysis card elements (aiScoreCircle, aiStatusBadge, aiReasons) are preserved',
    patientHtml.includes('id="aiScoreCircle"') &&
    patientHtml.includes('id="aiStatusBadge"') &&
    patientHtml.includes('id="aiReasons"')
  );
  test(
    'Overview vital-sign cards (overviewHR, overviewSpO2, overviewTemp, overviewScore) are preserved',
    patientHtml.includes('id="overviewHR"') &&
    patientHtml.includes('id="overviewSpO2"') &&
    patientHtml.includes('id="overviewTemp"') &&
    patientHtml.includes('id="overviewScore"')
  );
  test(
    'Wearable simulator status badge (id="wearableStatusBadge") is preserved',
    patientHtml.includes('id="wearableStatusBadge"')
  );

  // --- 2. Client Script Verification in patient.js ---
  console.log('\n--- 2. Client Script Verification in patient.js ---');
  const patientJsPath = (fs.existsSync(path.resolve(__dirname, '../../../frontend/js/patient/patient.js')) ? path.resolve(__dirname, '../../../frontend/js/patient/patient.js') : path.resolve(__dirname, '../../../frontend/js/patient.js'));
  const patientJs = fs.readFileSync(patientJsPath, 'utf8');

  test(
    'simulateEmergencyEvent does NOT attempt to render into removed emergencyStatusBanner',
    !patientJs.includes("document.getElementById('emergencyStatusBanner').style.display = 'block'")
  );
  test(
    'simulateEmergencyEvent updates wearableStatusBadge to SIMULATED EMERGENCY',
    patientJs.includes('🚨 SIMULATED EMERGENCY')
  );
  test(
    'simulateEmergencyEvent updates vital signs DOM (applyVitalsToDOM)',
    patientJs.includes('applyVitalsToDOM(payload)')
  );
  test(
    'simulateEmergencyEvent updates AI analysis (updateAIRing)',
    patientJs.includes('updateAIRing(ai.score, ai.status, ai.reasons')
  );
  test(
    'simulateEmergencyEvent updates Recent Alerts (loadAlerts)',
    patientJs.includes('loadAlerts()')
  );

  // --- 3. End-to-End Emergency Simulation Telemetry & Alert Verification ---
  console.log('\n--- 3. End-to-End Emergency Workflow & Persistence Verification ---');
  const loginRes = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'ravi@demo.com', password: 'demo123' }
  });
  assert.strictEqual(loginRes.status, 200, 'Patient login must succeed');
  const cookie = loginRes.setCookie.join('; ');
  const patientId = loginRes.body.user.id || loginRes.body.user._id;

  const simPayload = {
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
      address: 'Sunrise Senior Care, Chennai',
      source: 'gps'
    }
  };

  const simRes = await makeRequest('POST', '/api/vitals/wearable-sync', {
    headers: { Cookie: cookie },
    body: simPayload
  });

  test(
    'POST /api/vitals/wearable-sync processes emergency simulation (201 Created)',
    simRes.status === 201 && simRes.body.vitals
  );
  test(
    'Vitals stored with abnormal metrics (HR 145 bpm, SpO2 86%, Temp 101.2, fallDetected: true)',
    simRes.body.vitals.heartRate === 145 &&
    simRes.body.vitals.spo2 === 86 &&
    simRes.body.vitals.temperature === 101.2 &&
    simRes.body.vitals.fallDetected === true
  );
  test(
    'AI Health Analysis calculates Critical status and high risk score (>= 90)',
    simRes.body.ai.status === 'Critical' && simRes.body.ai.score >= 90
  );

  const emgAlert = simRes.body.emergencyAlert;
  test(
    'Emergency workflow triggered: EmergencyCase created with valid ID',
    Boolean(emgAlert && (emgAlert.emergencyId || emgAlert.emergencyCase?.emergencyId))
  );

  // Check Recent Alerts endpoint for the patient
  const alertsRes = await makeRequest('GET', `/api/alerts/patient/${patientId}`, {
    headers: { Cookie: cookie }
  });
  test(
    'GET /api/alerts/patient/:id returns alerts for the Recent Alerts section',
    alertsRes.status === 200 && Array.isArray(alertsRes.body) && alertsRes.body.length > 0
  );
  const criticalAlert = alertsRes.body.find(a => a.type === 'Critical' || a.message?.includes('Fall') || a.message?.includes('Critical'));
  test(
    'Recent Alerts contains the generated Critical/Fall emergency alert',
    Boolean(criticalAlert)
  );

  console.log('\n============================================================');
  console.log(`TOTAL: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
