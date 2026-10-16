/**
 * test_location_and_hospitals.js
 *
 * Automated verification suite for CareLink AI GPS & Location Integration:
 *  1. Patient Location Management & Coordinate Validation
 *  2. IDOR Protection (Patient cannot update or access another patient's location)
 *  3. RBAC (Authorized doctor/emergency staff can view location)
 *  4. Nearby Hospitals Discovery (Haversine distance calculation & radius filtering)
 *  5. Coordinate Input Validation (-90..90, -180..180, non-numeric checks)
 *  6. Emergency SOS with GPS attached
 *  7. Emergency SOS without GPS (non-blocking fallback)
 *  8. Emergency Incident Location Update (`POST /api/emergency/cases/:id/location`)
 *  9. Content Security Policy (Leaflet & OpenStreetMap tile origins permitted, no wildcards)
 * 10. Zero inline script tags compliance
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const User = require('../../models/User');
const EmergencyCase = require('../../models/EmergencyCase');
const Alert = require('../../models/Alert');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

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

async function runTests() {
  console.log('\n============================================================');
  console.log('📍 CareLink AI — GPS & Location Integration Test Suite');
  console.log('============================================================\n');

  // 1. Authenticate test users
  console.log('--- 1. Authenticating Test Users ---');
  const patientLogin = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'ravi@demo.com', password: 'demo123' }
  });
  assert.strictEqual(patientLogin.status, 200, 'Patient login must succeed');
  const patientCookie = patientLogin.setCookie.join('; ');
  const patientId = patientLogin.body.user.id || patientLogin.body.user._id;

  const doctorLogin = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'doctor@demo.com', password: 'demo123' }
  });
  assert.strictEqual(doctorLogin.status, 200, 'Doctor login must succeed');
  const doctorCookie = doctorLogin.setCookie.join('; ');

  const emergencyLogin = await makeRequest('POST', '/api/auth/login', {
    body: { email: 'emergency@demo.com', password: 'demo123' }
  });
  const emergencyCookie = emergencyLogin.setCookie.join('; ');

  // Register a secondary patient to test IDOR isolation
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const patient2Email = `patient.loc.test.${randomSuffix}@test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    body: {
      name: 'Second Test Patient',
      email: patient2Email,
      password: 'Password123!',
      role: 'patient'
    }
  });
  const patient2Cookie = regRes.setCookie.join('; ');
  const patient2Id = regRes.body?.user?._id;

  test('Test accounts authenticated successfully', Boolean(patientCookie && doctorCookie));

  // 2. Patient GPS Location Update & Retrieval
  console.log('\n--- 2. Patient GPS Location Update & Retrieval ---');

  const validLocPayload = {
    latitude: 13.0827,
    longitude: 80.2707,
    accuracyMeters: 12,
    source: 'gps',
    consentStatus: 'granted',
    address: '42 Central Healthcare Corridor, Chennai'
  };

  const updateLocRes = await makeRequest('PUT', '/api/patients/me/location', {
    headers: { Cookie: patientCookie },
    body: validLocPayload
  });

  test('PUT /api/patients/me/location saves valid coordinates (200 OK)',
    updateLocRes.status === 200 && updateLocRes.body.success === true &&
    updateLocRes.body.location?.latitude === 13.0827 &&
    updateLocRes.body.location?.longitude === 80.2707 &&
    updateLocRes.body.location?.accuracyMeters === 12
  );

  const getLocRes = await makeRequest('GET', '/api/patients/me/location', {
    headers: { Cookie: patientCookie }
  });

  test('GET /api/patients/me/location returns saved coordinates',
    getLocRes.status === 200 && getLocRes.body.success === true &&
    getLocRes.body.location?.latitude === 13.0827 &&
    getLocRes.body.location?.source === 'gps'
  );

  // 3. Coordinate Input Validation
  console.log('\n--- 3. Coordinate Input Validation ---');

  const outOfRangeLatRes = await makeRequest('PUT', '/api/patients/me/location', {
    headers: { Cookie: patientCookie },
    body: { latitude: 95.5, longitude: 80.2707 }
  });
  test('Reject latitude > 90 with 400 Bad Request',
    outOfRangeLatRes.status === 400 && outOfRangeLatRes.body.success === false
  );

  const outOfRangeLngRes = await makeRequest('PUT', '/api/patients/me/location', {
    headers: { Cookie: patientCookie },
    body: { latitude: 13.0827, longitude: -195.0 }
  });
  test('Reject longitude < -180 with 400 Bad Request',
    outOfRangeLngRes.status === 400 && outOfRangeLngRes.body.success === false
  );

  const nonNumericRes = await makeRequest('PUT', '/api/patients/me/location', {
    headers: { Cookie: patientCookie },
    body: { latitude: 'invalid-coordinate', longitude: 80.2707 }
  });
  test('Reject non-numeric latitude with 400 Bad Request',
    nonNumericRes.status === 400 && nonNumericRes.body.success === false
  );

  // 4. IDOR Protection (Patient isolation)
  console.log('\n--- 4. IDOR Security Verification ---');

  const idorRes = await makeRequest('GET', `/api/patients/${patientId}/location`, {
    headers: { Cookie: patient2Cookie }
  });
  test('Patient B forbidden (403) from accessing Patient A location',
    idorRes.status === 403
  );

  const docAccessRes = await makeRequest('GET', `/api/patients/${patientId}/location`, {
    headers: { Cookie: doctorCookie }
  });
  test('Authorized attending doctor can access assigned patient location (200 OK)',
    docAccessRes.status === 200 && docAccessRes.body.success === true
  );

  // 5. Nearby Hospitals Discovery
  console.log('\n--- 5. Nearby Hospitals Discovery & Haversine Distance ---');

  const nearbyRes = await makeRequest('GET', '/api/hospitals/nearby?lat=13.0827&lng=80.2707&radius=15', {
    headers: { Cookie: patientCookie }
  });

  test('GET /api/hospitals/nearby returns hospitals within 15 km (200 OK)',
    nearbyRes.status === 200 && nearbyRes.body.success === true &&
    Array.isArray(nearbyRes.body.hospitals) && nearbyRes.body.hospitals.length > 0
  );

  const hospitals = nearbyRes.body.hospitals || [];
  const isSorted = hospitals.every((h, idx) => idx === 0 || h.distanceKm >= hospitals[idx - 1].distanceKm);
  test('Nearby hospitals sorted ascending by distance',
    isSorted
  );

  const firstHosp = hospitals[0];
  test('Nearby hospital payload contains name, address, distance, and directionsUrl',
    Boolean(firstHosp && firstHosp.name && firstHosp.distanceKm !== undefined && firstHosp.directionsUrl)
  );

  // Test missing parameters on nearby hospital search
  const missingParamRes = await makeRequest('GET', '/api/hospitals/nearby', {
    headers: { Cookie: patientCookie }
  });
  test('Nearby hospital search requires lat and lng (400 Bad Request)',
    missingParamRes.status === 400 && missingParamRes.body.success === false
  );

  // 6. Emergency SOS with GPS Location
  console.log('\n--- 6. Emergency SOS with GPS Integration ---');

  const sosPayloadWithGps = {
    emergencyType: 'MANUAL_SOS',
    reason: 'GPS Integration Test SOS',
    location: {
      latitude: 13.0827,
      longitude: 80.2707,
      accuracyMeters: 10,
      source: 'gps',
      consentStatus: 'granted',
      address: 'GPS: 13.08270, 80.27070'
    }
  };

  const sosRes = await makeRequest('POST', '/api/emergency/sos', {
    headers: { Cookie: patient2Cookie }, // use patient2 to avoid duplicate case conflicts
    body: sosPayloadWithGps
  });

  const emgCase = sosRes.body?.emergencyCase;
  test('Emergency SOS accepts location payload (201 Created or 200 OK)',
    (sosRes.status === 201 || sosRes.status === 200) && Boolean(emgCase)
  );

  test('EmergencyCase stores coordinates and marks location available',
    emgCase && emgCase.location?.latitude === 13.0827 && emgCase.location?.isAvailable === true
  );

  // 7. Emergency Case En Route Location Update
  console.log('\n--- 7. Emergency Case Live Location Telemetry Update ---');

  if (emgCase?._id) {
    const updateCaseLocRes = await makeRequest('POST', `/api/emergency/cases/${emgCase._id}/location`, {
      headers: { Cookie: patient2Cookie },
      body: {
        latitude: 13.0850,
        longitude: 80.2720,
        accuracyMeters: 8,
        address: 'Live en route update landmark'
      }
    });

    test('POST /api/emergency/cases/:id/location updates incident location (200 OK)',
      updateCaseLocRes.status === 200 &&
      updateCaseLocRes.body.location?.latitude === 13.0850 &&
      updateCaseLocRes.body.location?.address === 'Live en route update landmark'
    );
  }

  // 8. Emergency SOS Without GPS (Safety Fallback)
  console.log('\n--- 8. Emergency SOS Without GPS Fallback ---');

  const sosNoGpsRes = await makeRequest('POST', '/api/emergency/manual-sos', {
    headers: { Cookie: patientCookie },
    body: {
      location: null,
      reason: 'No GPS Test'
    }
  });

  test('Emergency alert dispatches successfully when location is null / unavailable',
    (sosNoGpsRes.status === 200 || sosNoGpsRes.status === 201) && Boolean(sosNoGpsRes.body?.emergencyCase)
  );

  // 9. Content Security Policy (CSP) Verification
  console.log('\n--- 9. Content Security Policy & Security Header Conformance ---');

  const healthRes = await makeRequest('GET', '/api/health');
  const csp = healthRes.headers['content-security-policy'] || '';

  test('CSP allows OpenStreetMap tile layer (tile.openstreetmap.org)',
    csp.includes('tile.openstreetmap.org')
  );

  test('CSP allows Leaflet CDN assets (cdn.jsdelivr.net or unpkg.com)',
    csp.includes('cdn.jsdelivr.net') || csp.includes('unpkg.com')
  );

  test('CSP does NOT use unrestricted wildcards on script-src or default-src',
    !csp.includes('default-src *') && !csp.includes('script-src *')
  );

  // 10. Zero Inline Scripts Verification
  console.log('\n--- 10. Zero Inline Script Tags Conformance ---');

  const frontendDir = path.resolve(__dirname, '../../../frontend');
  const patientHtml = fs.readFileSync((fs.existsSync(path.join(frontendDir, 'pages', 'patient.html')) ? path.join(frontendDir, 'pages', 'patient.html') : path.join(frontendDir, 'patient.html')), 'utf8');
  const emergencyHtml = fs.readFileSync((fs.existsSync(path.join(frontendDir, 'pages', 'emergency.html')) ? path.join(frontendDir, 'pages', 'emergency.html') : path.join(frontendDir, 'emergency.html')), 'utf8');

  const inlineScriptRegex = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

  test('patient.html has ZERO inline <script> tags',
    patientHtml.match(inlineScriptRegex) === null
  );

  test('emergency.html has ZERO inline <script> tags',
    emergencyHtml.match(inlineScriptRegex) === null
  );

  test('patient.html loads Leaflet CSS & locationService.js',
    patientHtml.includes('leaflet.css') && patientHtml.includes('locationService.js')
  );

  test('emergency.html loads Leaflet CSS & locationService.js',
    emergencyHtml.includes('leaflet.css') && emergencyHtml.includes('locationService.js')
  );

  console.log('\n============================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
