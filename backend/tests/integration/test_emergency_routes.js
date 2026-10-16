/**
 * test_emergency_routes.js — End-to-End HTTP API Route Test Suite for SOS Emergency System
 */

const assert = require('assert');

const baseUrl = 'http://localhost:5000';
let patientToken;
let doctorToken;
let erOfficerToken;
let patientUser;
let doctorUser;
let erOfficerUser;
let createdEmergencyCaseId;
let testContactId;

async function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : undefined;

  const res = await fetch(url, { method, headers, body });
  const data = await res.json().catch(() => null);
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/carelink_auth=([^;]+)/);
  const token = match ? match[1] : undefined;
  return { status: res.status, ok: res.ok, data, token };
}

async function runRouteTests() {
  console.log('🚀 Starting Express API Route Test Suite for SOS Emergency System...\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Authentication for test roles
  await test('Authenticate Patient, Doctor, and Emergency Officer', async () => {
    const patientLogin = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'ravi@demo.com', password: 'demo123' }
    });
    assert.strictEqual(patientLogin.status, 200, 'Patient login failed');
    patientToken = patientLogin.data?.token || patientLogin.token;
    patientUser = patientLogin.data?.user;

    const doctorLogin = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'doctor@demo.com', password: 'demo123' }
    });
    assert.strictEqual(doctorLogin.status, 200, 'Doctor login failed');
    doctorToken = doctorLogin.data?.token || doctorLogin.token;
    doctorUser = doctorLogin.data?.user;

    const erLogin = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'emergency@demo.com', password: 'demo123' }
    });
    assert.strictEqual(erLogin.status, 200, 'Emergency officer login failed');
    erOfficerToken = erLogin.data?.token || erLogin.token;
    erOfficerUser = erLogin.data?.user;

    assert.ok(patientToken, 'Patient token generated');
    assert.ok(doctorToken, 'Doctor token generated');
    assert.ok(erOfficerToken, 'Emergency token generated');
  });

  // 2. GET /api/emergency/dashboard-stats
  await test('GET /api/emergency/dashboard-stats returns database aggregated metrics', async () => {
    const res = await makeRequest('/api/emergency/dashboard-stats', {
      headers: { Authorization: `Bearer ${erOfficerToken}` }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.activeEmergencies === 'number');
    assert.ok(typeof res.data.resolvedToday === 'number');
    assert.ok(typeof res.data.teamsAssigned === 'number');
    assert.ok(res.data.priorityCounts);
  });

  // 3. GET /api/emergency/active
  await test('GET /api/emergency/active returns active emergency queue', async () => {
    const res = await makeRequest('/api/emergency/active', {
      headers: { Authorization: `Bearer ${erOfficerToken}` }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 4. GET /api/emergency/teams
  await test('GET /api/emergency/teams returns response team roster', async () => {
    const res = await makeRequest('/api/emergency/teams', {
      headers: { Authorization: `Bearer ${erOfficerToken}` }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length >= 4);
    assert.ok(res.data.some(t => t.teamId === 'TEAM-ALPHA'));
  });

  // 5. POST /api/emergency/sos (New SOS trigger)
  await test('POST /api/emergency/sos triggers emergency alert with GPS location and creates EmergencyCase', async () => {
    const res = await makeRequest('/api/emergency/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: {
        emergencyType: 'MANUAL_SOS',
        location: { latitude: 28.6139, longitude: 77.2090, accuracy: 10, address: 'Connaught Place, New Delhi' }
      }
    });

    assert.ok(res.status === 201 || res.status === 200);
    assert.ok(res.data.emergencyCase);
    assert.strictEqual(res.data.emergencyCase.patientName, patientUser.name);
    createdEmergencyCaseId = res.data.emergencyCase._id;
  });

  // 6. Duplicate SOS Check
  await test('POST /api/emergency/sos returns duplicate notification if emergency already active', async () => {
    const res = await makeRequest('/api/emergency/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: { emergencyType: 'MANUAL_SOS' }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.isDuplicate, true);
    assert.ok(res.data.message.includes('already have an active emergency'));
  });

  // 7. POST /api/emergency/cases/:id/acknowledge
  await test('POST /api/emergency/cases/:id/acknowledge updates case status to ACKNOWLEDGED', async () => {
    const res = await makeRequest(`/api/emergency/cases/${createdEmergencyCaseId}/acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.emergencyCase.status, 'ACKNOWLEDGED');
  });

  // 8. POST /api/emergency/cases/:id/assign-team
  await test('POST /api/emergency/cases/:id/assign-team assigns response team and updates status to TEAM_ASSIGNED', async () => {
    const res = await makeRequest(`/api/emergency/cases/${createdEmergencyCaseId}/assign-team`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${erOfficerToken}` },
      body: {
        teamId: 'TEAM-ALPHA',
        teamName: 'Rapid Response Unit 01 (Trauma)',
        leadResponder: 'Capt. Rajesh Varma (Paramedic)',
        contactPhone: '+91 98765 30001',
        vehicleType: 'ALS Ambulance'
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.emergencyCase.status, 'TEAM_ASSIGNED');
    assert.strictEqual(res.data.emergencyCase.assignedEmergencyTeam.teamId, 'TEAM-ALPHA');
  });

  // 9. POST /api/emergency/cases/:id/notes
  await test('POST /api/emergency/cases/:id/notes appends clinical note to timeline', async () => {
    const res = await makeRequest(`/api/emergency/cases/${createdEmergencyCaseId}/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${doctorToken}` },
      body: { note: 'Patient family contacted. Oxygen cylinder prepared.' }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.data.emergencyCase.notes.length >= 1);
    assert.ok(res.data.emergencyCase.timeline.some(t => t.event === 'NOTE_ADDED'));
  });

  // 10. PUT /api/emergency/cases/:id/status (Full lifecycle progression)
  await test('PUT /api/emergency/cases/:id/status progresses status through EN_ROUTE -> ARRIVED -> UNDER_CARE -> RESOLVED', async () => {
    const statuses = ['EN_ROUTE', 'ARRIVED', 'UNDER_CARE', 'RESOLVED'];

    for (const st of statuses) {
      const res = await makeRequest(`/api/emergency/cases/${createdEmergencyCaseId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${erOfficerToken}` },
        body: { status: st, notes: `Automated test transition to ${st}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.emergencyCase.status, st);
    }
  });

  // 11. Emergency Contacts Management CRUD
  await test('Emergency Contacts CRUD: Add, Edit, Set Primary, Delete', async () => {
    // Add Contact
    const addRes = await makeRequest('/api/emergency/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: {
        name: 'Anita Kumar Test',
        relationship: 'Family (Sister)',
        phone: '+91 98765 55555',
        email: 'anita.k@example.com',
        priority: 'Secondary'
      }
    });
    assert.strictEqual(addRes.status, 201);
    const added = addRes.data.emergencyContacts.find(c => c.name === 'Anita Kumar Test');
    assert.ok(added, 'Contact should be added');
    testContactId = added._id;

    // Edit Contact
    const editRes = await makeRequest(`/api/emergency/contacts/${testContactId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: { phone: '+91 98765 55556' }
    });
    assert.strictEqual(editRes.status, 200);
    const edited = editRes.data.emergencyContacts.find(c => c._id === testContactId);
    assert.strictEqual(edited.phone, '+91 98765 55556');

    // Set Primary
    const primRes = await makeRequest(`/api/emergency/contacts/${testContactId}/primary`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert.strictEqual(primRes.status, 200);
    const primary = primRes.data.emergencyContacts.find(c => c._id === testContactId);
    assert.strictEqual(primary.isPrimary, true);

    // Delete Contact
    const delRes = await makeRequest(`/api/emergency/contacts/${testContactId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert.strictEqual(delRes.status, 200);
    const afterDel = delRes.data.emergencyContacts.find(c => c._id === testContactId);
    assert.strictEqual(afterDel, undefined);
  });

  // 12. POST /api/emergency/:id/cancel
  await test('POST /api/emergency/:id/cancel cancels newly triggered SOS case with audit log', async () => {
    const newCaseRes = await makeRequest('/api/emergency/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: { emergencyType: 'MANUAL_SOS' }
    });
    assert.strictEqual(newCaseRes.status, 201);
    const cancelCaseId = newCaseRes.data.emergencyCase._id;

    const cancelRes = await makeRequest(`/api/emergency/${cancelCaseId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: { reason: 'Accidental trigger during test' }
    });

    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.emergencyCase.status, 'CANCELLED');
    assert.ok(cancelRes.data.emergencyCase.cancellationReason.includes('Accidental trigger'));
  });

  console.log(`\n========================================`);
  console.log(`Route Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runRouteTests().catch(err => {
  console.error('Fatal Route Test Error:', err);
  process.exit(1);
});
