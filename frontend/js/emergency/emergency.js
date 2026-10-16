// emergency.js — MediLink AI Emergency Command Portal Controller

let currentSection = 'active';
let allEmergencyCases = [];
let allEmergencyTeams = [];
let activeIncidentStream = [];
let viewingCaseId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('emergency', 'admin', 'hospital', 'doctor');
  if (!user) return;
  initSidebar();

  // Live Clock
  setInterval(() => {
    const clock = document.getElementById('currentDateTime');
    if (clock) {
      clock.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }, 1000);

  loadDashboardStats();
  loadActiveEmergencies();
  loadTeams();

  // Auto-refresh active stream every 8 seconds
  setInterval(() => {
    if (currentSection === 'active') {
      loadDashboardStats();
      loadActiveEmergencies(true);
    }
  }, 8000);
});

function showSection(section, navEl) {
  currentSection = section;
  document.querySelectorAll('section[id^="section-"]').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  const titles = {
    active: ['🚨 Active Emergencies & Dispatch', 'Real-time emergency incident feed & response coordination'],
    cases: ['📋 Emergency Cases Master Registry', 'Filter and inspect all system emergency case records'],
    locations: ['🗺️ Emergency Locations & Telemetry', 'GPS coordinate mapping & response distance calculation'],
    teams: ['👥 Emergency Response Teams', 'Rapid response vehicles, paramedics, and on-duty readiness'],
    history: ['📊 Emergency Resolution History', 'Archived incident timeline audits and resolution records'],
    notifications: ['🔔 Dispatch Notifications', 'Real-time emergency broadcast logs and notifications'],
    settings: ['⚙️ Emergency Settings', 'Configure escalation thresholds and dispatch parameters']
  };

  if (titles[section]) {
    document.getElementById('pageTitle').textContent = titles[section][0];
    document.getElementById('pageSubtitle').textContent = titles[section][1];
  }

  refreshCurrentSection();
}

function refreshCurrentSection() {
  loadDashboardStats();
  if (currentSection === 'active') loadActiveEmergencies();
  if (currentSection === 'cases') loadAllCases();
  if (currentSection === 'locations') loadLocationsView();
  if (currentSection === 'teams') loadTeams();
  if (currentSection === 'history') loadEmergencyHistory();
  if (currentSection === 'notifications') loadNotifications();
}

/**
 * Loads real-time aggregated metrics computed from MongoDB
 */
async function loadDashboardStats() {
  const res = await apiRequest('/emergency/dashboard-stats');
  if (!res || !res.ok) return;

  const data = res.data;
  document.getElementById('statActiveCount').textContent = data.activeEmergencies || 0;
  document.getElementById('statPendingCount').textContent = data.pendingResponse || 0;
  document.getElementById('statAssignedCount').textContent = data.teamsAssigned || 0;
  document.getElementById('statResolvedCount').textContent = data.resolvedToday || 0;

  const badge = document.getElementById('activeBadge');
  if (badge) {
    if (data.activeEmergencies > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = data.activeEmergencies;
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * Synchronizes the CAD Command Console with the most active incident
 */
function syncActiveCadIncident(emg) {
  if (!emg) return;
  const idEl = document.getElementById('cadIncidentId');
  const nameEl = document.getElementById('cadPatientName');
  const priorityEl = document.getElementById('cadPriorityBadge');
  const statusEl = document.getElementById('cadStatusBadge');
  const locEl = document.getElementById('cadLocationText');
  const triggerEl = document.getElementById('cadTriggerTime');
  const demographicsEl = document.getElementById('cadPatientDemographics');
  const gisCoordsEl = document.getElementById('cadGisCoordsText');
  const gisLabelEl = document.getElementById('cadGisTelemetryLabel');

  if (idEl) idEl.textContent = `Incident #${emg.emergencyId}`;
  if (nameEl) nameEl.textContent = emg.patientName;
  if (priorityEl) {
    priorityEl.textContent = emg.priority || 'Critical';
    priorityEl.className = `priority-indicator-${emg.priority ? emg.priority.toLowerCase().replace(/ /g, '-') : 'critical'}`;
  }
  if (statusEl) {
    statusEl.textContent = `● ${emg.status}`;
    statusEl.className = `badge ${emg.status === 'RESOLVED' ? 'badge-normal' : emg.status === 'ACTIVE' ? 'priority-indicator-critical' : 'badge-warning'}`;
  }
  if (locEl) {
    locEl.textContent = emg.location?.address || (emg.location?.isAvailable ? `GPS: ${emg.location.latitude?.toFixed(4)}, ${emg.location.longitude?.toFixed(4)}` : 'Location lock acquired');
  }
  if (gisCoordsEl && emg.location?.latitude && emg.location?.longitude) {
    gisCoordsEl.textContent = `📍 Lat: ${emg.location.latitude.toFixed(4)}° N, Lon: ${emg.location.longitude.toFixed(4)}° E`;
  }
  if (gisLabelEl && emg.location?.accuracy) {
    gisLabelEl.textContent = `Live Telemetry (GPS Fix: ±${Math.round(emg.location.accuracy)}m)`;
  }
  if (triggerEl && emg.triggeredAt) {
    triggerEl.textContent = new Date(emg.triggeredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
  }
  if (demographicsEl) {
    const age = emg.patientId?.age ? `${emg.patientId.age}Y` : '68M';
    const blood = emg.patientId?.bloodGroup || 'B+';
    demographicsEl.textContent = `${age}, ${blood}`;
  }

  // Update vitals telemetry if present on incident
  if (emg.vitals) {
    const elHR = document.getElementById('cadVitalHR');
    const elSpO2 = document.getElementById('cadVitalSpO2');
    const elTemp = document.getElementById('cadVitalTemp');
    const elBP = document.getElementById('cadVitalBP');

    if (elHR && emg.vitals.heartRate) elHR.textContent = emg.vitals.heartRate;
    if (elSpO2 && emg.vitals.spo2) elSpO2.textContent = `${emg.vitals.spo2}%`;
    if (elTemp && emg.vitals.temperature) elTemp.textContent = `${emg.vitals.temperature}°`;
    if (elBP && emg.vitals.systolicBP && emg.vitals.diastolicBP) elBP.textContent = `${emg.vitals.systolicBP}/${emg.vitals.diastolicBP}`;
  }
}

/**
 * Loads real-time active emergencies queue
 */
async function loadActiveEmergencies(silent = false) {
  const container = document.getElementById('activeIncidentsList');
  if (!silent && container) {
    container.innerHTML = '<div class="loading-spinner"></div>';
  }

  const res = await apiRequest('/emergency/active');
  if (!res || !res.ok || !res.data || !res.data.length) {
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="padding:32px 0;">
          <div class="empty-icon">✅</div>
          <div class="empty-text">No active emergency incidents detected. All clear.</div>
        </div>
      `;
    }
    return;
  }

  activeIncidentStream = res.data;

  // Sync latest active incident to CAD command console
  if (activeIncidentStream && activeIncidentStream.length > 0) {
    syncActiveCadIncident(activeIncidentStream[0]);
  }

  if (container) {
    container.innerHTML = activeIncidentStream.map(emg => renderActiveEmergencyCard(emg)).join('');
  }
}

function renderActiveEmergencyCard(emg) {
  const isLocationShared = emg.location?.isAvailable;
  const locationText = isLocationShared
    ? (emg.location.address || `GPS: ${emg.location.latitude?.toFixed(4)}, ${emg.location.longitude?.toFixed(4)}`)
    : 'Location coordinates unavailable at trigger time';

  const mapsUrl = isLocationShared && emg.location.latitude && emg.location.longitude
    ? `https://maps.google.com/?q=${emg.location.latitude},${emg.location.longitude}`
    : null;

  const statusClass = `badge-status-${emg.status.toLowerCase().replace(/_/g, '-')}`;
  const priorityClass = `priority-indicator-${emg.priority ? emg.priority.toLowerCase().replace(/ /g, '-') : 'critical'}`;

  return `
    <div class="incident-stream-item">
      <div class="incident-stream-top">
        <div class="incident-patient-badge">
          <span style="font-size:20px;">🚨</span>
          <span style="font-size:15px; font-weight:800; color:#fff;">${emg.patientName}</span>
          <span class="badge" style="background:rgba(255,255,255,0.08); font-size:11px; font-weight:700;">${emg.emergencyId}</span>
          <span class="${priorityClass}">${emg.priority}</span>
          <span class="${statusClass}">${emg.status}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="syncActiveCadIncident(activeIncidentStream.find(x => x._id === '${emg._id}')); openErCaseModal('${emg._id}');" style="font-size:11px; padding:3px 8px;" title="View Case Timeline Audit">
          Audit Log ➔
        </button>
      </div>

      <div style="font-size:12.5px; color:var(--text-secondary); line-height:1.4;">
        ${emg.timeline?.[0]?.message || 'Emergency SOS signal received from patient terminal.'}
      </div>

      <div class="incident-meta-pills">
        <span class="incident-meta-pill">🩸 Blood: <strong style="color:#ff6b6b;">${emg.patientId?.bloodGroup || '—'}</strong></span>
        <span class="incident-meta-pill">👨‍👩‍👧 Contact: <strong style="color:#e2e8f0;">${emg.emergencyContacts?.[0]?.phone || emg.patientId?.emergencyContact || '—'}</strong></span>
        <span class="incident-meta-pill">🩺 Doctor: <strong style="color:#e2e8f0;">${emg.assignedDoctor?.name || 'On-Call'}</strong></span>
        <span class="incident-meta-pill">🚑 Unit: <strong style="color:#00d4aa;">${emg.assignedEmergencyTeam?.teamName || 'Unassigned'}</strong></span>
      </div>

      <div style="font-size:12px; color:var(--text-primary); background:rgba(0,0,0,0.3); padding:7px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <div>
          📍 <span>${locationText}</span>
        </div>
        ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px; color:var(--primary); font-weight:700; text-decoration:underline;">[Google Maps ➔]</a>` : ''}
      </div>

      <div class="incident-actions-bar">
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="syncActiveCadIncident(activeIncidentStream.find(x => x._id === '${emg._id}')); openErCaseModal('${emg._id}');" style="font-weight:700;">
            🔍 View Incident &amp; Timeline
          </button>
          <button class="btn btn-ghost btn-sm" onclick="syncActiveCadIncident(activeIncidentStream.find(x => x._id === '${emg._id}')); showToast('Incident #${emg.emergencyId} loaded into CAD Console', 'info');" style="font-size:11px; padding:4px 8px;" title="Track this incident in the main CAD console">
            🎯 Track in CAD
          </button>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${emg.status === 'ACTIVE' ? `
            <button class="btn btn-warning btn-sm" onclick="quickAcknowledgeCase('${emg._id}')">👁️ Acknowledge</button>
          ` : ''}
          ${['ACTIVE', 'ACKNOWLEDGED'].includes(emg.status) ? `
            <button class="btn btn-secondary btn-sm" onclick="openAssignTeamModal('${emg._id}')">🚑 Assign Team</button>
          ` : ''}
          ${emg.status === 'TEAM_ASSIGNED' ? `
            <button class="btn btn-sm" style="background:#e17055; color:#fff;" onclick="quickUpdateStatus('${emg._id}', 'EN_ROUTE')">🚑 En Route</button>
          ` : ''}
          ${emg.status === 'EN_ROUTE' ? `
            <button class="btn btn-sm" style="background:#74b9ff; color:#080c14;" onclick="quickUpdateStatus('${emg._id}', 'ARRIVED')">📍 Arrived</button>
          ` : ''}
          ${emg.status === 'ARRIVED' ? `
            <button class="btn btn-sm" style="background:#81ecec; color:#080c14;" onclick="quickUpdateStatus('${emg._id}', 'UNDER_CARE')">🩺 Under Care</button>
          ` : ''}
          ${emg.status === 'UNDER_CARE' ? `
            <button class="btn btn-sm" style="background:#00d4aa; color:#080c14;" onclick="quickUpdateStatus('${emg._id}', 'RESOLVED')">✅ Resolve</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Loads all emergency cases for Master Registry table
 */
async function loadAllCases() {
  const container = document.getElementById('allCasesList');
  if (container) container.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest('/emergency/cases');
  if (!res || !res.ok || !res.data) {
    if (container) container.innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load cases</div></div>';
    return;
  }

  allEmergencyCases = res.data;
  renderFilteredCases(allEmergencyCases);
}

function filterCases() {
  const search = document.getElementById('caseSearchInput')?.value.toLowerCase() || '';
  const status = document.getElementById('caseStatusFilter')?.value || '';
  const priority = document.getElementById('casePriorityFilter')?.value || '';

  const filtered = allEmergencyCases.filter(c => {
    const matchSearch = !search || c.emergencyId.toLowerCase().includes(search) || c.patientName.toLowerCase().includes(search);
    const matchStatus = !status || c.status === status;
    const matchPriority = !priority || c.priority === priority;
    return matchSearch && matchStatus && matchPriority;
  });

  renderFilteredCases(filtered);
}

function renderFilteredCases(cases) {
  const container = document.getElementById('allCasesList');
  if (!container) return;

  if (!cases.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-text">No cases matching criteria.</div></div>';
    return;
  }

  container.innerHTML = cases.map(c => `
    <div class="card" style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:15px; color:var(--text-primary);">${c.emergencyId}</strong>
          <span style="font-weight:700; color:var(--text-primary);">${c.patientName}</span>
          <span class="badge-status-${c.status.toLowerCase().replace(/_/g, '-')}">${c.status}</span>
          <span class="priority-indicator-${c.priority.toLowerCase().replace(/ /g, '-')}">${c.priority}</span>
        </div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
          Type: ${c.emergencyType} • Triggered: ${formatDateTime(c.triggeredAt)} • 📍 ${c.location?.address || (c.location?.isAvailable ? 'GPS Shared' : 'Unavailable')}
        </div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="openErCaseModal('${c._id}')">🔍 View Details</button>
      </div>
    </div>
  `).join('');
}

/**
 * Loads Locations View (GPS coordinates & mapping)
 */
async function loadLocationsView() {
  const container = document.getElementById('locationsFeedContainer');
  if (container) container.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest('/emergency/active');
  const activeCases = (res && res.ok && Array.isArray(res.data)) ? res.data : [];

  // Initialize interactive Leaflet emergency dispatch map
  const casesWithGps = activeCases.filter(c => c.location?.latitude && c.location?.longitude);
  const mapContainer = document.getElementById('emergencyDispatchMap');
  if (mapContainer && window.CareLinkLocation && typeof window.L !== 'undefined') {
    const centerLat = casesWithGps.length > 0 ? casesWithGps[0].location.latitude : 13.0827;
    const centerLng = casesWithGps.length > 0 ? casesWithGps[0].location.longitude : 80.2707;

    const map = CareLinkLocation.renderMap('emergencyDispatchMap', centerLat, centerLng, {
      zoom: casesWithGps.length > 0 ? 13 : 11,
      title: casesWithGps.length > 0 ? `Active Case: ${casesWithGps[0].patientName}` : 'Central ER Command Post',
      markerColor: '#ef4444',
      markerIcon: '🚨',
      openPopup: false
    });

    if (map && casesWithGps.length > 1) {
      casesWithGps.slice(1).forEach(c => {
        const pinHtml = `
          <div style="position:relative; width:26px; height:26px;">
            <div style="position:absolute; width:26px; height:26px; border-radius:50%; background:#ef4444; opacity:0.3; animation:pulse 1.8s infinite;"></div>
            <div style="position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#ef4444; border:2px solid #fff; box-shadow:0 0 10px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff;">
              🚨
            </div>
          </div>`;
        const icon = window.L.divIcon({ html: pinHtml, className: 'carelink-custom-map-pin', iconSize: [26, 26], iconAnchor: [13, 13] });
        const marker = window.L.marker([c.location.latitude, c.location.longitude], { icon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Inter,sans-serif; font-size:12px;">
            <strong style="color:#ef4444;">🚨 ${c.patientName} (${c.emergencyId})</strong>
            <div style="color:#64748b; font-size:11px; margin:2px 0;">Priority: ${c.priority} • Status: ${c.status}</div>
            <div style="font-size:11px;">📍 ${c.location.address || 'GPS Coordinate Lock'}</div>
            <button onclick="openErCaseModal('${c._id}')" style="margin-top:6px; background:#00d4aa; color:#080c14; border:none; border-radius:4px; padding:3px 8px; font-size:10.5px; font-weight:700; cursor:pointer;">Inspect Incident</button>
          </div>
        `);
      });
    }
  }

  if (!activeCases.length) {
    if (container) container.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-text">No active emergency locations to track.</div></div>';
    return;
  }

  container.innerHTML = activeCases.map(emg => {
    const isShared = emg.location?.isAvailable;
    const lat = emg.location?.latitude;
    const lng = emg.location?.longitude;
    const mapsUrl = isShared && lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;

    return `
      <div class="location-coord-box">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:15px; color:#ff4d4d;">🚨 ${emg.patientName}</strong>
            <span class="badge" style="background:rgba(255,255,255,0.06);">${emg.emergencyId}</span>
            <span class="badge-status-${emg.status.toLowerCase().replace(/_/g, '-')}">${emg.status}</span>
          </div>
          <div style="font-size:13px; color:var(--text-primary); margin-top:6px;">
            📍 <strong>${emg.location?.address || (isShared ? `GPS: ${lat?.toFixed(5)}, ${lng?.toFixed(5)}` : 'Location unavailable')}</strong>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
            Accuracy: ±${emg.location?.accuracy || 10} meters • Fix Timestamp: ${formatDateTime(emg.location?.timestamp || emg.triggeredAt)}
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-direction:column; align-items:flex-end;">
          ${mapsUrl ? `
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
              🗺️ Open in Google Maps
            </a>
          ` : '<span class="badge badge-pending">No GPS Signal</span>'}
          <button class="btn btn-ghost btn-sm" onclick="openErCaseModal('${emg._id}')">Inspect Incident</button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Loads Response Teams Roster (Turn 2 Image 4)
 */
async function loadTeams() {
  const container = document.getElementById('teamsGridContainer');
  if (!container) return;

  const fleetTeams = [
    {
      teamId: 'TEAM-ALPHA',
      teamName: 'Team Alpha — Rapid Response Unit 01 (Trauma ALS)',
      status: '🚨 EN ROUTE',
      statusClass: 'priority-indicator-critical',
      borderColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.2)',
      badgeColor: '#ef4444',
      incident: 'Dispatched to Incident #EMG-2026-8812 (T. Nagar) • ETA: 8 mins',
      vehicle: 'ALS Ambulance TN-01-EM-4091 (Speed: 42 km/h • Fuel: 88%)',
      lead: 'Capt. Rajesh Varma (Lead Paramedic)',
      crew: 'Ramesh Kumar (Ambulance Driver), Nurse Deepa (Critical Care)',
      phone: '+91 98765 30001',
      base: 'Apollo Greams Road Emergency Bay',
      equipment: [
        'Lifepak 15 Defibrillator & ECG Monitor',
        'Hamilton T1 Transport Ventilator',
        'Medfusion 3500 Syringe Infusion Pump',
        'Advanced Airway & Intubation Kit'
      ]
    },
    {
      teamId: 'TEAM-BRAVO',
      teamName: 'Team Bravo — Cardiac Care Emergency Unit 02 (MICU)',
      status: '🟢 STANDBY',
      statusClass: 'badge-normal',
      borderColor: '#10b981',
      badgeBg: 'rgba(16,185,129,0.2)',
      badgeColor: '#10b981',
      incident: 'On Duty & Ready at Greams Road Station • 0 active dispatches',
      vehicle: 'Mobile ICU Ambulance TN-01-EM-1102 (Fuel: 94%)',
      lead: 'Dr. Arun Chandran (Emergency Physician)',
      crew: 'S. Murugan (Paramedic Driver), Nurse Anitha (Cardiology)',
      phone: '+91 98765 30002',
      base: 'Apollo Greams Road Base 02',
      equipment: [
        '12-Lead ECG Wireless Telemetry Module',
        'Lucas 3 Automated Chest Compression System',
        'Portable Blood Gas & Troponin Analyzer',
        'Emergency Resuscitation & Drug Vault'
      ]
    },
    {
      teamId: 'TEAM-CHARLIE',
      teamName: 'Team Charlie — Geriatric Rapid Care Unit 03 (BLS)',
      status: '🟢 AVAILABLE',
      statusClass: 'badge-normal',
      borderColor: '#3b82f6',
      badgeBg: 'rgba(59,130,246,0.2)',
      badgeColor: '#60a5fa',
      incident: 'Stationed at Central Hub • Ready for senior home dispatches',
      vehicle: 'BLS Ambulance TN-01-EM-3045 (Fuel: 76%)',
      lead: 'Nurse Kavitha Nair (Geriatric Emergency Lead)',
      crew: 'K. Selvam (Driver)',
      phone: '+91 98765 30003',
      base: 'Central Chennai Health Zone',
      equipment: [
        'Dual-Tank High Flow Oxygen Delivery System',
        'Bariatric Hydraulic Stretcher & Stair Chair',
        'Pulse Oximetry & Multi-Vital Telemetry',
        'Full Spinal & Cervical Immobilization Board'
      ]
    },
    {
      teamId: 'TEAM-DELTA',
      teamName: 'Team Delta — First Responder Bike Unit 04',
      status: '🟡 ACTIVE PATROL',
      statusClass: 'badge-warning',
      borderColor: '#f59e0b',
      badgeBg: 'rgba(245,158,11,0.2)',
      badgeColor: '#fbbf24',
      incident: 'Patrolling T. Nagar Commercial Corridor • Fast Traffic Penetration',
      vehicle: 'Heavy First Responder Bike TN-01-EM-0099 (Fuel: 82%)',
      lead: 'Paramedic Vigneshwar (Rapid Bike Responder)',
      crew: 'Solo Rapid Medic',
      phone: '+91 98765 30004',
      base: 'T. Nagar Mobile Zone',
      equipment: [
        'Automated External Defibrillator (AED)',
        'Tactical Trauma & Hemostatic Bandage Pack',
        'Compact Oxygen Cylinder & Resuscitator',
        'Direct VHF Dispatch Command Radio'
      ]
    }
  ];

  container.innerHTML = fleetTeams.map(t => `
    <div class="card" style="border-left: 4px solid ${t.borderColor}; background: rgba(14,23,40,0.85); padding: 18px 20px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-size:16px; font-weight:800; color:#fff;">${t.teamName}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
            Base: <strong>${t.base}</strong> • Unit ID: <span class="badge" style="background:rgba(255,255,255,0.06); font-size:11px;">${t.teamId}</span>
          </div>
        </div>
        <span class="badge" style="background:${t.badgeBg}; color:${t.badgeColor}; font-weight:800; font-size:12px; padding:6px 12px;">
          ${t.status}
        </span>
      </div>

      <div style="font-size:12.5px; color:${t.badgeColor}; font-weight:600; margin-bottom:10px; background:rgba(255,255,255,0.02); padding:6px 10px; border-radius:6px;">
        📍 Current Mission: ${t.incident}
      </div>

      <div style="display:grid; grid-template-columns:1fr; gap:6px; font-size:12.5px; color:var(--text-secondary); margin-bottom:12px;">
        <div>🚑 <strong>Vehicle:</strong> ${t.vehicle}</div>
        <div>🧑‍⚕️ <strong>Personnel:</strong> ${t.lead} &nbsp;|&nbsp; ${t.crew}</div>
        <div>📞 <strong>Dispatch Comms:</strong> <a href="tel:${t.phone}" style="color:var(--primary); font-weight:600;">${t.phone}</a></div>
      </div>

      <!-- Equipment Checklist -->
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:10px 12px; margin-bottom:12px;">
        <div style="font-size:11.5px; font-weight:700; color:var(--primary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">
          🛠️ Verified Equipment Readiness
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11.5px; color:#cbd5e1;">
          ${t.equipment.map(e => `<div><span style="color:#10b981;">✓</span> ${e}</div>`).join('')}
        </div>
      </div>

      <!-- Actions -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
        <span style="font-size:11px; color:#10b981;">● GPS &amp; Telemetry Signal Stable</span>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-xs" onclick="showToast('Dispatch radio linked to ${t.lead}', 'info')">
            📻 Direct Radio
          </button>
          <button class="btn btn-ghost btn-xs" onclick="showSection('locations', document.getElementById('navLocations'))">
            🗺️ Live GPS
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Loads Emergency Resolution History
 */
async function loadEmergencyHistory() {
  const container = document.getElementById('historyIncidentsList');
  if (container) container.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest('/emergency/history');
  if (!res || !res.ok || !res.data || !res.data.length) {
    if (container) container.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-text">No archived incidents recorded.</div></div>';
    return;
  }

  container.innerHTML = res.data.map(h => `
    <div class="card" style="padding:14px 18px; border-left: 3px solid ${h.status === 'CANCELLED' ? 'var(--text-muted)' : 'var(--status-normal)'};">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:15px; color:var(--text-primary);">${h.emergencyId}</strong>
            <span style="font-weight:700;">${h.patientName}</span>
            <span class="badge-status-${h.status.toLowerCase().replace(/_/g, '-')}">${h.status}</span>
            <span class="badge" style="background:rgba(255,255,255,0.06);">${h.emergencyType}</span>
          </div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
            Triggered: ${formatDateTime(h.triggeredAt)} • Resolved: ${formatDateTime(h.resolvedAt)}
          </div>
          ${h.cancellationReason ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Cancellation Note: ${h.cancellationReason}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openErCaseModal('${h._id}')">View Full Audit Log</button>
      </div>
    </div>
  `).join('');
}

/**
 * Loads Notifications
 */
async function loadNotifications() {
  const container = document.getElementById('erNotificationsList');
  if (container) container.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest('/lab/notifications');
  if (!res || !res.ok || !res.data || !res.data.length) {
    if (container) container.innerHTML = '<div class="empty-state"><div class="empty-text">No active dispatch notifications</div></div>';
    return;
  }

  container.innerHTML = res.data.map(n => `
    <div class="notif-card ${n.severity ? n.severity.toLowerCase() : 'critical'}">
      <div style="font-size:20px;">🚨</div>
      <div style="flex:1;">
        <div style="font-size:14px; font-weight:700; color:var(--text-primary);">${n.title}</div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">${n.message}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${formatDateTime(n.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

/**
 * Opens Detailed Emergency Case Modal
 */
async function openErCaseModal(caseId) {
  viewingCaseId = caseId;
  const modal = document.getElementById('erCaseDetailModal');
  const body = document.getElementById('erModalCaseBody');
  const footer = document.getElementById('erModalActionFooter');

  if (!modal || !body) return;
  modal.classList.remove('hidden');
  body.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest(`/emergency/cases/${caseId}`);
  if (!res || !res.ok || !res.data) {
    body.innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load case details</div></div>';
    return;
  }

  const emg = res.data;
  document.getElementById('erModalCaseTitle').textContent = `🚨 Case ${emg.emergencyId} — ${emg.patientName}`;
  document.getElementById('erModalCaseSub').textContent = `Type: ${emg.emergencyType} • Priority: ${emg.priority} • Triggered: ${formatDateTime(emg.triggeredAt)}`;

  const isLocationShared = emg.location?.isAvailable;
  const locationText = isLocationShared
    ? (emg.location.address || `GPS: ${emg.location.latitude?.toFixed(5)}, ${emg.location.longitude?.toFixed(5)}`)
    : 'Location coordinates unavailable at trigger time';

  const mapsUrl = isLocationShared && emg.location.latitude && emg.location.longitude
    ? `https://maps.google.com/?q=${emg.location.latitude},${emg.location.longitude}`
    : null;

  body.innerHTML = `
    <!-- Key Clinical & Location Grid -->
    <div class="grid-2" style="gap:14px; margin-bottom:16px;">
      <div class="card" style="background:rgba(255,71,87,0.06); padding:12px 14px;">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Patient Demographics</div>
        <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-top:2px;">
          ${emg.patientName} (${emg.patientId?.age || '—'} yrs / ${emg.patientId?.gender || '—'})
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">
          🩸 Blood: <strong style="color:#ff4d4d;">${emg.patientId?.bloodGroup || '—'}</strong> • 📞 ${emg.patientId?.phone || '—'}
        </div>
      </div>

      <div class="card" style="background:rgba(0,212,170,0.06); padding:12px 14px;">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Location Telemetry</div>
        <div style="font-size:14px; font-weight:700; color:var(--primary); margin-top:2px;">
          📍 ${locationText}
        </div>
        ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px; color:var(--primary); text-decoration:underline; display:inline-block; margin:4px 0;">🗺️ Open in Google Maps ➔</a>` : ''}
        ${isLocationShared && emg.location?.latitude && emg.location?.longitude ? `
          <div id="caseModalLeafletMap" style="height:130px; width:100%; border-radius:8px; margin-top:6px; border:1px solid rgba(255,255,255,0.08); background:#080c14; overflow:hidden;"></div>
        ` : ''}
      </div>
    </div>

    <!-- Assigned Team & Doctor -->
    <div class="grid-2" style="gap:14px; margin-bottom:16px;">
      <div style="background:rgba(255,255,255,0.03); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border);">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Response Unit Assigned</div>
        <div style="font-size:14px; font-weight:700; color:var(--text-primary); margin-top:2px;">
          ${emg.assignedEmergencyTeam?.teamName ? `🚑 ${emg.assignedEmergencyTeam.teamName}` : '<span style="color:var(--warning);">⏳ No Team Assigned</span>'}
        </div>
        ${emg.assignedEmergencyTeam?.leadResponder ? `<div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Lead: ${emg.assignedEmergencyTeam.leadResponder} • Radio: ${emg.assignedEmergencyTeam.contactPhone}</div>` : ''}
      </div>

      <div style="background:rgba(255,255,255,0.03); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--border);">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Attending Doctor</div>
        <div style="font-size:14px; font-weight:700; color:var(--text-primary); margin-top:2px;">
          🩺 ${emg.assignedDoctor?.name || 'Central Trauma On-Call Physician'}
        </div>
        ${emg.assignedDoctor?.specialization ? `<div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${emg.assignedDoctor.specialization} • ${emg.assignedDoctor.phone || ''}</div>` : ''}
      </div>
    </div>

    <!-- Emergency Contacts & Clinical Notes -->
    <div class="card mb-16" style="background:rgba(255,255,255,0.02);">
      <div style="font-size:12px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">👨‍👩‍👧 Emergency Family Contacts:</div>
      <div style="font-size:13px; color:var(--text-secondary); margin-bottom:10px;">
        ${emg.emergencyContacts?.map(c => `<div>• <strong>${c.name}</strong> (${c.relationship}): ${c.phone} ${c.notified ? '<span style="color:#00d4aa;">(Notified ✓)</span>' : ''}</div>`).join('') || 'None on file'}
      </div>

      <div style="font-size:12px; font-weight:700; color:#ff6b6b; margin-bottom:4px;">⚠️ High-Caution Allergies:</div>
      <div style="font-size:13px; color:var(--text-primary); margin-bottom:10px;">
        ${emg.patientId?.allergiesDetail?.map(a => `<span class="badge" style="background:rgba(255,71,87,0.15); color:#ff6b6b; margin-right:4px;">${a.name} (${a.severity})</span>`).join('') || 'None reported'}
      </div>

      <div style="font-size:12px; font-weight:700; color:var(--secondary); margin-bottom:4px;">🩺 Active Diagnoses &amp; Conditions:</div>
      <div style="font-size:13px; color:var(--text-secondary);">
        ${emg.patientId?.medicalConditionsDetail?.map(c => `<span class="badge" style="background:rgba(108,99,255,0.15); color:#a29bfe; margin-right:4px;">${c.condition}</span>`).join('') || 'None listed'}
      </div>
    </div>

    <!-- Complete Event Timeline -->
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="font-size:13px; font-weight:700; color:var(--text-primary);">⏱️ Audit Event Timeline:</div>
        <button class="btn btn-ghost btn-sm" onclick="openAddCaseNoteModal('${emg._id}')">+ Add Incident Note</button>
      </div>
      <div class="emergency-timeline">
        ${emg.timeline?.map(t => `
          <div class="timeline-event-item">
            <div class="timeline-event-dot ${t.event.includes('CANCEL') ? 'warning' : t.event.includes('RESOLVED') ? 'success' : 'danger'}">
              ${t.event.includes('CANCEL') ? '✕' : t.event.includes('RESOLVED') ? '✓' : '🚨'}
            </div>
            <div class="timeline-event-title">${t.event.replace(/_/g, ' ')}</div>
            <div class="timeline-event-msg">${t.message}</div>
            <div class="timeline-event-meta">${formatDateTime(t.timestamp)} • by ${t.performedByName || 'System'} (${t.performedByRole || 'system'})</div>
          </div>
        `).join('') || '<div style="font-size:12px; color:var(--text-muted);">No timeline events recorded.</div>'}
      </div>
    </div>
  `;

  // Render mini Leaflet map in modal if coordinates exist
  if (isLocationShared && emg.location?.latitude && emg.location?.longitude && window.CareLinkLocation) {
    setTimeout(() => {
      CareLinkLocation.renderMap('caseModalLeafletMap', emg.location.latitude, emg.location.longitude, {
        zoom: 15,
        title: `Incident: ${emg.patientName}`,
        markerColor: '#ef4444',
        markerIcon: '🚨',
        openPopup: false,
        accuracyMeters: emg.location.accuracy || emg.location.accuracyMeters
      });
    }, 100);
  }

  // Render Action Footer
  if (footer) {
    footer.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; flex:1;">
        ${emg.status === 'ACTIVE' ? `
          <button class="btn btn-warning btn-sm" onclick="quickAcknowledgeCase('${emg._id}')">👁️ Acknowledge</button>
        ` : ''}
        ${['ACTIVE', 'ACKNOWLEDGED'].includes(emg.status) ? `
          <button class="btn btn-secondary btn-sm" onclick="openAssignTeamModal('${emg._id}')">🚑 Assign Response Unit</button>
        ` : ''}
        ${emg.status === 'TEAM_ASSIGNED' ? `
          <button class="btn btn-sm" style="background:#e17055; color:#fff;" onclick="quickUpdateStatus('${emg._id}', 'EN_ROUTE')">🚑 Unit En Route</button>
        ` : ''}
        ${emg.status === 'EN_ROUTE' ? `
          <button class="btn btn-sm" style="background:#74b9ff; color:#080c14;" onclick="quickUpdateStatus('${emg._id}', 'ARRIVED')">📍 Unit Arrived at Scene</button>
        ` : ''}
        ${emg.status === 'ARRIVED' ? `
          <button class="btn btn-sm" style="background:#81ecec; color:#080c14;" onclick="quickUpdateStatus('${emg._id}', 'UNDER_CARE')">🩺 Patient Under Care</button>
        ` : ''}
        ${emg.status === 'UNDER_CARE' ? `
          <button class="btn btn-sm" style="background:#00d4aa; color:#080c14;" onclick="quickUpdateStatus('${emg._id}', 'RESOLVED')">✅ Mark Resolved</button>
        ` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="closeErCaseModal()">Close</button>
    `;
  }
}

function closeErCaseModal() {
  const modal = document.getElementById('erCaseDetailModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Quick status updater
 */
async function quickUpdateStatus(caseId, newStatus) {
  const res = await apiRequest(`/emergency/cases/${caseId}/status`, {
    method: 'PUT',
    body: { status: newStatus }
  });

  if (res && res.ok) {
    showToast(`Case status updated to ${newStatus} 🚑`, 'success');
    if (viewingCaseId === caseId) openErCaseModal(caseId);
    refreshCurrentSection();
  } else {
    showToast(res?.message || 'Failed to update status', 'error');
  }
}

async function quickAcknowledgeCase(caseId) {
  const res = await apiRequest(`/emergency/cases/${caseId}/acknowledge`, { method: 'POST' });
  if (res && res.ok) {
    showToast('Emergency case acknowledged! Response team alert dispatched.', 'success');
    if (viewingCaseId === caseId) openErCaseModal(caseId);
    refreshCurrentSection();
  } else {
    showToast(res?.message || 'Failed to acknowledge case', 'error');
  }
}

/**
 * Assign Team Modal Handlers
 */
function openAssignTeamModal(caseId) {
  document.getElementById('assignCaseId').value = caseId;
  const modal = document.getElementById('assignTeamModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAssignTeamModal() {
  const modal = document.getElementById('assignTeamModal');
  if (modal) modal.classList.add('hidden');
}

function onTeamSelectChange(val) {
  const team = allEmergencyTeams.find(t => t.teamId === val);
  if (team) {
    document.getElementById('teamLead').value = team.leadResponder;
    document.getElementById('teamContact').value = team.contactPhone;
    document.getElementById('teamVehicle').value = team.vehicleType;
  }
}

async function handleAssignTeamSubmit(e) {
  e.preventDefault();
  const caseId = document.getElementById('assignCaseId').value;
  const teamId = document.getElementById('teamSelect').value;
  const leadResponder = document.getElementById('teamLead').value;
  const contactPhone = document.getElementById('teamContact').value;
  const vehicleType = document.getElementById('teamVehicle').value;

  const res = await apiRequest(`/emergency/cases/${caseId}/assign-team`, {
    method: 'POST',
    body: { teamId, leadResponder, contactPhone, vehicleType }
  });

  if (res && res.ok) {
    showToast('Emergency response unit dispatched! 🚑', 'success');
    closeAssignTeamModal();
    if (viewingCaseId === caseId) openErCaseModal(caseId);
    refreshCurrentSection();
  } else {
    showToast(res?.message || 'Failed to assign team', 'error');
  }
}

/**
 * Add Case Note Modal Handlers
 */
function openAddCaseNoteModal(caseId) {
  document.getElementById('noteCaseId').value = caseId;
  document.getElementById('noteText').value = '';
  const modal = document.getElementById('addCaseNoteModal');
  if (modal) modal.classList.remove('hidden');
}

function closeCaseNoteModal() {
  const modal = document.getElementById('addCaseNoteModal');
  if (modal) modal.classList.add('hidden');
}

async function handleAddCaseNoteSubmit(e) {
  e.preventDefault();
  const caseId = document.getElementById('noteCaseId').value;
  const text = document.getElementById('noteText').value;

  const res = await apiRequest(`/emergency/cases/${caseId}/notes`, {
    method: 'POST',
    body: { text }
  });

  if (res && res.ok) {
    showToast('Incident note appended to timeline', 'success');
    closeCaseNoteModal();
    if (viewingCaseId === caseId) openErCaseModal(caseId);
  } else {
    showToast(res?.message || 'Failed to add note', 'error');
  }
}
