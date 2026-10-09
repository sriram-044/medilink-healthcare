// admin.js — Admin Portal Logic

let currentUser = null;
let allUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('admin');
  if (!user) return;
  currentUser = user;
  initSidebar();

  setInterval(() => {
    document.getElementById('currentDateTime').textContent =
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);

  loadDashboard();
  loadAllUsers();
});

function showSection(section, navEl) {
  document.querySelectorAll('section[id^="section-"]').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: ['Admin Dashboard', 'System-wide overview'],
    analytics: ['Analytics', 'System statistics and charts'],
    patients: ['Patient Management', 'All registered patients'],
    doctors: ['Doctor Management', 'All registered doctors'],
    assign: ['Assign Doctor', 'Connect patients with the right doctors'],
    'doctor-details': ['Doctor Details', 'Doctors > Dr. Priya Sharma'],
    'patient-details': ['Patient Details', 'Patients > Mr. Ravi'],
    reports: ['Lab Reports', 'System-wide report management'],
    alerts: ['All Alerts', 'System-wide alert feed'],
    settings: ['System Settings', 'Configure AI thresholds and hospital info']
  };
  document.getElementById('pageTitle').textContent = titles[section]?.[0] || section;
  document.getElementById('pageSubtitle').textContent = titles[section]?.[1] || '';

  if (section === 'patients') loadPatients();
  if (section === 'doctors') loadDoctors();
  if (section === 'assign') populateAssignDropdowns();
  if (section === 'reports') loadAdminReports();
  if (section === 'alerts') loadAdminAlerts();
  if (section === 'analytics') loadAnalytics();
}

function viewDoctorDetails(doctorId) {
  showSection('doctor-details');
}

function viewPatientDetails(patientId) {
  showSection('patient-details');
}

// ═══════════════════════════
// DASHBOARD
// ═══════════════════════════
async function loadDashboard() {
  const [analyticsRes, alertsRes, usersRes] = await Promise.all([
    apiRequest('/admin/analytics'),
    apiRequest('/alerts'),
    apiRequest('/admin/users')
  ]);

  if (analyticsRes?.ok) {
    const a = analyticsRes.data;
    document.getElementById('statPatients').textContent = a.totalPatients;
    document.getElementById('statDoctors').textContent = a.totalDoctors;
    document.getElementById('statAlerts').textContent = a.unresolvedAlerts;
    document.getElementById('statFlagged').textContent = a.flaggedReports;
  }

  if (alertsRes?.ok) {
    const alerts = alertsRes.data.filter(a => !a.resolved);
    const badge = document.getElementById('alertNavBadge');
    if (alerts.length > 0) { badge.style.display = 'inline-flex'; badge.textContent = alerts.length; }

    const feed = document.getElementById('adminDashAlerts');
    feed.innerHTML = alerts.slice(0, 5).map(a => `
      <div class="alert-item ${a.type.toLowerCase()}">
        <div class="alert-dot"></div>
        <div class="alert-content">
          <div class="alert-message">${a.message}</div>
          <div class="alert-meta">${a.patientId?.name || 'Unknown'} • ${timeAgo(a.createdAt)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="resolveAlert('${a._id}')">Resolve</button>
      </div>
    `).join('') || '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No active alerts</div></div>';
  }

  if (usersRes?.ok) {
    allUsers = usersRes.data;
    const container = document.getElementById('recentUsers');
    const recent = [...usersRes.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
    container.innerHTML = recent.map(u => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${u.name.charAt(0)}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${u.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${u.email}</div>
        </div>
        <span class="badge badge-normal" style="font-size:10px">${u.role}</span>
        <div style="font-size:11px;color:var(--text-muted)">${formatDate(u.createdAt)}</div>
      </div>
    `).join('');
  }
}

// ═══════════════════════════
// ANALYTICS
// ═══════════════════════════
async function loadAnalytics() {
  const res = await apiRequest('/admin/analytics');
  if (!res?.ok) return;
  const a = res.data;

  document.getElementById('analyticsStats').innerHTML = `
    <div class="stat-card" style="--card-text:var(--primary)"><div class="stat-icon">🧑‍🦽</div><div class="stat-value">${a.totalPatients}</div><div class="stat-label">Patients</div></div>
    <div class="stat-card" style="--card-text:var(--secondary)"><div class="stat-icon">🩺</div><div class="stat-value" style="color:var(--secondary)">${a.totalDoctors}</div><div class="stat-label">Doctors</div></div>
    <div class="stat-card" style="--card-text:var(--danger)"><div class="stat-icon">🚨</div><div class="stat-value" style="color:var(--danger)">${a.criticalAlerts}</div><div class="stat-label">Critical Alerts</div></div>
    <div class="stat-card" style="--card-text:var(--warning)"><div class="stat-icon">📋</div><div class="stat-value" style="color:var(--warning)">${a.totalReports}</div><div class="stat-label">Total Reports</div></div>
  `;

  // Vitals distribution doughnut
  const vitalBreakdown = a.vitalStatusBreakdown || [];
  const vCtx = document.getElementById('vitalsDistChart')?.getContext('2d');
  if (vCtx) {
    new Chart(vCtx, {
      type: 'doughnut',
      data: {
        labels: vitalBreakdown.map(v => v._id || 'Unknown'),
        datasets: [{ data: vitalBreakdown.map(v => v.count), backgroundColor: ['#ff4757', '#fdcb6e', '#00d4aa'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8899bb', font: { size: 12 } } }
        }
      }
    });
  }

  // Reports distribution
  const rCtx = document.getElementById('reportDistChart')?.getContext('2d');
  if (rCtx) {
    new Chart(rCtx, {
      type: 'doughnut',
      data: {
        labels: ['Pending', 'Reviewed', 'Flagged'],
        datasets: [{ data: [a.totalReports - a.flaggedReports, Math.max(0, a.totalReports - a.flaggedReports - (a.totalAlerts || 0)), a.flaggedReports], backgroundColor: ['#74b9ff', '#00d4aa', '#ff4757'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#8899bb', font: { size: 12 } } } }
      }
    });
  }
}

// ═══════════════════════════
// PATIENTS
// ═══════════════════════════
async function loadPatients() {
  const res = await apiRequest('/admin/users?role=patient');
  if (!res?.ok) return;
  const tbody = document.getElementById('patientsTable');
  if (!res.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No patients found</td></tr>';
    return;
  }
  tbody.innerHTML = res.data.map(p => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="viewPatientDetails('${p._id}')" title="Click to view 360 profile">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${p.name.charAt(0)}</div>
        <span style="font-weight:600;color:#fff;">${p.name}</span>
      </div></td>
      <td>${p.email}</td>
      <td>${p.age || '—'}</td>
      <td>${p.bloodGroup || '—'}</td>
      <td>${p.assignedDoctor?.name || '<span style="color:var(--text-muted)">Unassigned</span>'}</td>
      <td>${formatDate(p.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-xs" onclick="viewPatientDetails('${p._id}')">👁️ View 360</button>
          <button class="btn btn-danger btn-xs" onclick="deleteUser('${p._id}', loadPatients)">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ═══════════════════════════
// DOCTORS
// ═══════════════════════════
async function loadDoctors() {
  const res = await apiRequest('/admin/users?role=doctor');
  if (!res?.ok) return;
  const tbody = document.getElementById('doctorsTable');
  if (!res.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No doctors found</td></tr>';
    return;
  }
  tbody.innerHTML = res.data.map(d => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="viewDoctorDetails('${d._id}')" title="Click to view 360 profile">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--secondary),#a29bfe);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${d.name.charAt(0)}</div>
        <span style="font-weight:600;color:#fff;">${d.name}</span>
      </div></td>
      <td>${d.email}</td>
      <td>${d.specialization || '—'}</td>
      <td>${d.department || '—'}</td>
      <td>${d.phone || '—'}</td>
      <td>${d.assignedPatients?.length || 0}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-xs" onclick="viewDoctorDetails('${d._id}')">👁️ View 360</button>
          <button class="btn btn-danger btn-xs" onclick="deleteUser('${d._id}', loadDoctors)">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ═══════════════════════════
// ASSIGN DOCTOR — AI ENGINE
// ═══════════════════════════
let assignPatients = [];
let assignDoctors  = [];
let selectedPatientData = null;
let selectedDoctorId    = null;
let selectedDoctorName  = '';

async function populateAssignDropdowns() {
  const [pRes, dRes] = await Promise.all([
    apiRequest('/admin/users?role=patient'),
    apiRequest('/admin/users?role=doctor')
  ]);

  if (pRes?.ok) {
    assignPatients = pRes.data;
    const sel = document.getElementById('assignPatient');
    sel.innerHTML = '<option value="">-- Select patient --</option>' +
      pRes.data.map(p => `<option value="${p._id}">${p.name}${p.assignedDoctor ? '' : ' ⚠️ Unassigned'}</option>`).join('');
  }

  if (dRes?.ok) {
    assignDoctors = dRes.data;
  }

  // Update stats strip
  const patients = pRes?.data || [];
  const doctors  = dRes?.data || [];
  const unassigned = patients.filter(p => !p.assignedDoctor).length;
  document.getElementById('statUnassigned').textContent  = unassigned;
  document.getElementById('aiStatPatients').textContent  = patients.length;
  document.getElementById('aiStatDoctors').textContent   = doctors.length;
  const avg = doctors.length ? (patients.length / doctors.length).toFixed(1) : '—';
  document.getElementById('aiStatAvg').textContent = avg;
}

function onPatientSelect(patientId) {
  if (!patientId) {
    document.getElementById('patientInfoCard').classList.remove('visible');
    document.getElementById('analyzeBtn').disabled = true;
    document.getElementById('step1Num').classList.remove('done');
    document.getElementById('step2Num').classList.add('inactive');
    document.getElementById('aiResultsPanel').innerHTML = `
      <div class="assign-empty">
        <div class="assign-empty-icon">🤖</div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px">AI Analysis Ready</div>
        <div>Select a patient on the left, then click<br/><strong>Analyse &amp; Recommend Doctors</strong></div>
      </div>`;
    return;
  }

  const p = assignPatients.find(x => x._id === patientId);
  if (!p) return;
  selectedPatientData = p;
  selectedDoctorId    = null;

  // Fill patient info card
  document.getElementById('piAvatar').textContent  = p.name.charAt(0).toUpperCase();
  document.getElementById('piName').textContent    = p.name;
  document.getElementById('piEmail').textContent   = p.email;
  document.getElementById('piAge').textContent     = `${p.age || '—'} / ${p.gender || '—'}`;
  document.getElementById('piBlood').textContent   = p.bloodGroup || '—';
  document.getElementById('piPhone').textContent   = p.phone || '—';
  document.getElementById('piDoctor').textContent  = assignDoctors.find(d => d._id === p.assignedDoctor?._id || d._id === p.assignedDoctor)?.name || 'None assigned';
  document.getElementById('piRisk').textContent    = '⏳ Load AI analysis';

  document.getElementById('patientInfoCard').classList.add('visible');
  document.getElementById('analyzeBtn').disabled = false;
  document.getElementById('step1Num').className = 'assign-step-num done';
  document.getElementById('step2Num').className = 'assign-step-num';
}

async function runAiAnalysis() {
  if (!selectedPatientData) return;

  const btn = document.getElementById('analyzeBtn');
  btn.textContent = '⏳ Analysing...';
  btn.disabled = true;

  // Fetch latest vitals for the patient to determine risk context
  let riskContext = 'General';
  let riskLabel   = '—';
  try {
    const vRes = await apiRequest(`/vitals/${selectedPatientData._id}/latest`);
    if (vRes?.ok && vRes.data) {
      riskLabel   = vRes.data.aiStatus || '—';
      const score = vRes.data.aiScore || 0;
      if (score >= 70 || vRes.data.aiStatus === 'Critical') riskContext = 'Cardiology';
      else if (score >= 40) riskContext = 'Internal Medicine';
    }
    document.getElementById('piRisk').innerHTML =
      `<span style="color:${riskLabel === 'Critical' ? 'var(--status-critical)' : riskLabel === 'Risk' ? 'var(--status-risk)' : 'var(--status-normal)'}">${riskLabel}</span>`;
  } catch {}

  // ── AI SCORING ENGINE ──────────────────────────────────────────
  // Criteria:
  //  1. Workload balance  (40 pts) — fewer current patients = better
  //  2. Specialization match (35 pts) — dept/spec matches risk context
  //  3. Availability bonus (25 pts) — not already assigned to this patient
  const maxLoad = Math.max(...assignDoctors.map(d => d.assignedPatients?.length || 0), 1);

  const scored = assignDoctors.map(d => {
    const load    = d.assignedPatients?.length || 0;
    const loadPts = Math.round((1 - load / (maxLoad + 1)) * 40);

    const spec = (d.specialization || d.department || '').toLowerCase();
    const ctx  = riskContext.toLowerCase();
    let specPts = 10; // base
    if (spec.includes(ctx) || ctx.includes(spec.split(' ')[0])) specPts = 35;
    else if (spec.includes('general') || spec.includes('internal')) specPts = 22;
    else if (spec.includes('cardio') && riskContext !== 'General') specPts = 28;

    const alreadyAssigned = selectedPatientData.assignedDoctor === d._id;
    const availPts = alreadyAssigned ? 5 : 25;

    const total = Math.min(loadPts + specPts + availPts, 100);
    return { ...d, score: total, loadPts, specPts, availPts, load };
  }).sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  // ── END SCORING ────────────────────────────────────────────────

  document.getElementById('step2Num').className = 'assign-step-num done';
  document.getElementById('step3Num').className = 'assign-step-num';

  // Build matching factors display
  const factorColor = (pts, max) => pts >= max * 0.75 ? '#00d4aa' : pts >= max * 0.4 ? '#fdcb6e' : '#ff4757';

  document.getElementById('aiResultsPanel').innerHTML = `
    <div class="ai-analysis-panel">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
        <span style="font-size:18px">🤖</span>
        <div style="font-size:14px;font-weight:700">AI Analysis Complete</div>
        <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(108,99,255,0.2);color:#a29bfe;font-weight:600;margin-left:auto">
          ${top3[0]?.score || 0}% Best Match
        </span>
      </div>
      <div style="font-size:12px;color:var(--text-muted)">
        Patient: <strong style="color:var(--text-primary)">${selectedPatientData.name}</strong> &nbsp;·&nbsp;
        Risk context: <strong style="color:var(--text-primary)">${riskContext}</strong> &nbsp;·&nbsp;
        ${assignDoctors.length} doctors evaluated
      </div>
      <div class="ai-factors">
        <div class="ai-factor"><div class="ai-factor-dot" style="background:#00d4aa"></div>Workload balance (40 pts)</div>
        <div class="ai-factor"><div class="ai-factor-dot" style="background:#6c63ff"></div>Specialization match (35 pts)</div>
        <div class="ai-factor"><div class="ai-factor-dot" style="background:#fdcb6e"></div>Patient availability (25 pts)</div>
        <div class="ai-factor"><div class="ai-factor-dot" style="background:#ff4757"></div>Current assignment penalty</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">
      Top Recommendations
    </div>

    <div class="doctor-cards">
      ${top3.map((d, i) => `
        <div class="doctor-card${i === 0 ? ' rank-1' : ''}" id="dcard_${d._id}" onclick="selectDoctorCard('${d._id}','${d.name.replace(/'/g, "\\'")}')">
          ${i === 0 ? '<div class="rank-crown">🏆 AI TOP PICK</div>' : ''}
          <div class="doctor-avatar-lg">${d.name.charAt(0)}</div>
          <div class="doctor-card-info">
            <div class="doctor-card-name">${d.name}</div>
            <div class="doctor-card-spec">${d.specialization || d.department || 'General Practitioner'}</div>
            <div class="doctor-card-badges">
              <span class="badge-load">👥 ${d.load} patients</span>
              ${d.department ? `<span class="badge-dept">${d.department}</span>` : ''}
              <span style="font-size:11px;padding:3px 8px;border-radius:20px;background:rgba(${d.loadPts >= 30 ? '0,212,170' : d.loadPts >= 15 ? '253,203,110' : '255,71,87'},0.15);color:${d.loadPts >= 30 ? 'var(--primary)' : d.loadPts >= 15 ? '#fdcb6e' : 'var(--danger)'};font-weight:600">
                ${d.loadPts >= 30 ? '🟢 Low load' : d.loadPts >= 15 ? '🟡 Moderate' : '🔴 High load'}
              </span>
            </div>
            <div class="match-bar-wrap" style="margin-top:10px">
              <div class="match-bar-fill" style="width:${d.score}%;background:${i === 0 ? 'var(--primary)' : i === 1 ? 'var(--secondary)' : '#fdcb6e'}"></div>
            </div>
          </div>
          <div class="match-score">
            <div class="match-pct" style="color:${i === 0 ? 'var(--primary)' : i === 1 ? 'var(--secondary)' : '#fdcb6e'}">${d.score}%</div>
            <div class="match-label">Match</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="confirm-bar hidden" id="confirmBar">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">✅ Confirm Assignment</div>
      <div class="confirm-summary">
        <div class="confirm-tag"><strong>Patient</strong><span id="confirmPatientName">${selectedPatientData.name}</span></div>
        <div style="color:var(--text-muted)">→</div>
        <div class="confirm-tag"><strong>Doctor</strong><span id="confirmDoctorName">—</span></div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:1" onclick="confirmAssignment()">✅ Confirm Assignment</button>
        <button class="btn btn-ghost" onclick="clearSelection()">Cancel</button>
      </div>
    </div>
  `;

  btn.textContent = '🤖 Analyse & Recommend Doctors';
  btn.disabled = false;
}

function selectDoctorCard(doctorId, doctorName) {
  document.querySelectorAll('.doctor-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`dcard_${doctorId}`);
  if (card) card.classList.add('selected');

  selectedDoctorId   = doctorId;
  selectedDoctorName = doctorName;

  document.getElementById('confirmDoctorName').textContent = doctorName;
  document.getElementById('confirmBar').classList.remove('hidden');
  document.getElementById('step3Num').className = 'assign-step-num';

  // Smooth scroll to confirm bar
  document.getElementById('confirmBar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearSelection() {
  selectedDoctorId = null;
  document.querySelectorAll('.doctor-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('confirmBar').classList.add('hidden');
}

async function confirmAssignment() {
  if (!selectedPatientData || !selectedDoctorId) return;

  const btn = document.querySelector('#confirmBar .btn-primary');
  const orig = btn.textContent;
  btn.textContent = 'Assigning...';
  btn.disabled = true;

  const res = await apiRequest('/admin/assign', {
    method: 'PUT',
    body: { patientId: selectedPatientData._id, doctorId: selectedDoctorId }
  });

  if (res?.ok) {
    showToast(`✅ ${selectedPatientData.name} assigned to ${selectedDoctorName}`, 'success');
    // Reset
    document.getElementById('assignPatient').value = '';
    onPatientSelect('');
    populateAssignDropdowns();
    document.getElementById('step1Num').className = 'assign-step-num';
    document.getElementById('step2Num').className = 'assign-step-num inactive';
    document.getElementById('step3Num').className = 'assign-step-num inactive';
  } else {
    showToast(res?.data?.message || 'Assignment failed', 'error');
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function populateReportModalDropdowns() {
  const [pRes, dRes] = await Promise.all([
    apiRequest('/admin/users?role=patient'),
    apiRequest('/admin/users?role=doctor')
  ]);
  if (pRes?.ok) {
    document.getElementById('arPatient').innerHTML = '<option value="">-- Select patient --</option>' +
      pRes.data.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
  }
  if (dRes?.ok) {
    document.getElementById('arDoctor').innerHTML = '<option value="">-- Select doctor --</option>' +
      dRes.data.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
  }
}

function openAddReportModal() {
  populateReportModalDropdowns();
  document.getElementById('addReportModal').classList.remove('hidden');
}
function closeAddReportModal() { document.getElementById('addReportModal').classList.add('hidden'); }

async function assignDoctor(e) {
  e.preventDefault();
  const patientId = document.getElementById('assignPatient').value;
  const doctorId = document.getElementById('assignDoctor').value;
  const res = await apiRequest('/admin/assign', { method: 'PUT', body: { patientId, doctorId } });
  if (res?.ok) { showToast('Doctor assigned successfully!', 'success'); e.target.reset(); }
  else showToast('Assignment failed', 'error');
}

// ═══════════════════════════
// REPORTS
// ═══════════════════════════
async function loadAdminReports() {
  const statusFilter = document.getElementById('adminReportFilter')?.value;
  const res = await apiRequest('/reports');
  if (!res?.ok) return;
  let reports = res.data;
  if (statusFilter) reports = reports.filter(r => r.status === statusFilter);

  const tbody = document.getElementById('adminReportsTable');
  if (!reports.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No reports</td></tr>';
    return;
  }
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${r.patientId?.name || '—'}</td>
      <td>${getReportTypeLabel(r.reportType)}</td>
      <td>${r.labName || '—'}</td>
      <td style="text-transform:capitalize">${r.uploadedBy}</td>
      <td>${formatDate(r.createdAt)}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td>${r.fileName ? `<a href="${BACKEND_URL}/api/reports/${r._id}/file" target="_blank" class="btn btn-ghost btn-sm">📥 View</a>` : '—'}</td>
    </tr>
  `).join('');
}

async function adminAddReport(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('patientId', document.getElementById('arPatient').value);
  formData.append('doctorId', document.getElementById('arDoctor').value);
  formData.append('reportType', document.getElementById('arType').value);
  formData.append('labName', document.getElementById('arLab').value);
  formData.append('testDate', document.getElementById('arDate').value);
  const file = document.getElementById('arFile').files[0];
  if (file) formData.append('file', file);

  const res = await apiRequest('/reports/admin-add', { method: 'POST', body: formData });
  if (res?.ok) {
    showToast('Report added successfully', 'success');
    closeAddReportModal();
    loadAdminReports();
  } else {
    showToast(res?.data?.message || 'Failed to add report', 'error');
  }
}

// ═══════════════════════════
// ALERTS
// ═══════════════════════════
async function loadAdminAlerts() {
  const res = await apiRequest('/alerts');
  if (!res?.ok) return;
  const container = document.getElementById('adminAlertsList');
  const unresolved = res.data.filter(a => !a.resolved).length;
  const badge = document.getElementById('alertNavBadge');
  badge.style.display = unresolved ? 'inline-flex' : 'none';
  badge.textContent = unresolved;

  if (!res.data.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No alerts</div></div>';
    return;
  }

  container.innerHTML = res.data.map(a => `
    <div class="card" style="border-left:3px solid ${a.type === 'Critical' || a.type === 'SOS' ? 'var(--status-critical)' : 'var(--status-risk)'}">
      <div style="display:flex;align-items:flex-start;gap:14px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
            ${getStatusBadge(a.type)}
            <span style="font-size:13px;font-weight:600">${a.patientId?.name || 'Unknown'}</span>
            ${a.resolved ? '<span class="badge badge-reviewed">✅ Resolved</span>' : ''}
          </div>
          <div style="font-size:14px;color:var(--text-primary);margin-bottom:4px">${a.message}</div>
          <div style="font-size:11px;color:var(--text-muted)">${formatDateTime(a.createdAt)}</div>
        </div>
        ${!a.resolved ? `<button class="btn btn-ghost btn-sm" onclick="resolveAlert('${a._id}')">Resolve</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function resolveAlert(id) {
  const res = await apiRequest(`/alerts/${id}/resolve`, { method: 'PUT' });
  if (res?.ok) { showToast('Alert resolved', 'success'); loadDashboard(); loadAdminAlerts(); }
}

// ═══════════════════════════
// USER MANAGEMENT
// ═══════════════════════════
function openCreateUserModal(role) {
  document.getElementById('createUserModal').classList.remove('hidden');
  if (role) document.getElementById('cuRole').value = role;
}
function closeCreateUserModal() { document.getElementById('createUserModal').classList.add('hidden'); }

async function createUser(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('cuName').value,
    email: document.getElementById('cuEmail').value,
    password: document.getElementById('cuPassword').value,
    role: document.getElementById('cuRole').value,
    phone: document.getElementById('cuPhone').value,
    age: +document.getElementById('cuAge').value || undefined,
    gender: document.getElementById('cuGender').value || undefined,
    bloodGroup: document.getElementById('cuBlood').value || undefined,
    specialization: document.getElementById('cuSpec').value || undefined
  };
  const res = await apiRequest('/admin/users', { method: 'POST', body: payload });
  if (res?.ok) {
    showToast('User created successfully!', 'success');
    closeCreateUserModal();
    e.target.reset();
    loadDashboard();
  } else {
    showToast(res?.data?.message || 'Failed to create user', 'error');
  }
}

async function deleteUser(id, reloadFn) {
  if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
  const res = await apiRequest(`/admin/users/${id}`, { method: 'DELETE' });
  if (res?.ok) { showToast('User deleted', 'success'); if (reloadFn) reloadFn(); }
  else showToast('Delete failed', 'error');
}

async function loadAllUsers() {
  const res = await apiRequest('/admin/users');
  if (res?.ok) allUsers = res.data;
}

function filterTable(tableId, query) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  Array.from(tbody.rows).forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
  });
}

// ══════════════════════════════════════════════════════════════════════════
// 6-STEP GUIDED "ASSIGN DOCTOR" WIZARD (IMAGE 3)
// ══════════════════════════════════════════════════════════════════════════
let currentAssignPatient = 'ravi';
let currentAssignDoctor = 'priya';

function switchAssignTab(tab) {
  document.querySelectorAll('.wizard-tab').forEach(t => t.classList.remove('active'));
  if (event?.target) event.target.classList.add('active');
  const tbody = document.getElementById('assignPatientsTableBody');
  if (!tbody) return;
  if (tab === 'unassigned') {
    tbody.innerHTML = `
      <tr style="background:rgba(239,68,68,0.06);border-left:3px solid #ef4444;">
        <td><input type="checkbox" checked /></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#f87171);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;">M</div>
            <div>
              <div style="font-weight:700;font-size:14px;color:#fff;">Mr. Ravi</div>
              <div style="font-size:11px;color:var(--text-muted);">P-002</div>
            </div>
          </div>
        </td>
        <td>68 / Male</td>
        <td><span style="color:#ef4444;font-weight:600;">Cardiac Risk</span></td>
        <td><span style="color:#ef4444;font-weight:700;">BP 165/105</span><br><span style="font-size:11px;color:#ef4444;">HR 145</span></td>
        <td><span class="badge badge-danger" style="background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid rgba(239,68,68,0.4);font-weight:700;">Critical</span></td>
        <td style="text-align:right;">
          <button class="btn btn-primary btn-sm" onclick="startAssignWizard('ravi')">🔗 Assign</button>
        </td>
      </tr>
    `;
    document.getElementById('unassignedCountBadge').textContent = '1';
  } else {
    document.getElementById('unassignedCountBadge').textContent = '3';
    tbody.innerHTML = `
      <tr>
        <td><input type="checkbox" /></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#60a5fa);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;">M</div>
            <div><div style="font-weight:700;font-size:14px;color:#fff;">Meena Pillai</div><div style="font-size:11px;color:var(--text-muted);">P-001</div></div>
          </div>
        </td>
        <td>38 / Female</td>
        <td>Diabetes, Hypertension</td>
        <td>BP 140/90 • HR 78</td>
        <td><span class="badge badge-warning" style="background:rgba(245,158,11,0.15);color:#f59e0b;">Needs Doctor</span></td>
        <td style="text-align:right;"><button class="btn btn-primary btn-sm" onclick="startAssignWizard('meena')">🔗 Assign</button></td>
      </tr>
      <tr style="background:rgba(239,68,68,0.06);border-left:3px solid #ef4444;">
        <td><input type="checkbox" checked /></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#f87171);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;">M</div>
            <div><div style="font-weight:700;font-size:14px;color:#fff;">Mr. Ravi</div><div style="font-size:11px;color:var(--text-muted);">P-002</div></div>
          </div>
        </td>
        <td>68 / Male</td>
        <td><span style="color:#ef4444;font-weight:600;">Cardiac Risk</span></td>
        <td><span style="color:#ef4444;font-weight:700;">BP 165/105 • HR 145</span></td>
        <td><span class="badge badge-danger" style="background:rgba(239,68,68,0.2);color:#ef4444;">Critical</span></td>
        <td style="text-align:right;"><button class="btn btn-primary btn-sm" onclick="startAssignWizard('ravi')">🔗 Assign</button></td>
      </tr>
      <tr>
        <td><input type="checkbox" /></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#10b981,#34d399);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;">R</div>
            <div><div style="font-weight:700;font-size:14px;color:#fff;">Rajan Kumar</div><div style="font-size:11px;color:var(--text-muted);">P-003</div></div>
          </div>
        </td>
        <td>45 / Male</td>
        <td>Fever, Respiratory</td>
        <td>Temp 101°F • SpO2 96%</td>
        <td><span class="badge badge-warning" style="background:rgba(245,158,11,0.15);color:#f59e0b;">Needs Doctor</span></td>
        <td style="text-align:right;"><button class="btn btn-primary btn-sm" onclick="startAssignWizard('rajan')">🔗 Assign</button></td>
      </tr>
    `;
  }
}

function filterAssignTable(query) {
  filterTable('assignPatientsTableBody', query);
}

function closeAssignWizard() {
  const modal = document.getElementById('assignWizardModal');
  if (modal) modal.classList.add('hidden');
}

// STEP 2: Select a Patient
function startAssignWizard(patientKey) {
  currentAssignPatient = patientKey;
  const modal = document.getElementById('assignWizardModal');
  const container = document.getElementById('assignWizardModalContent');
  modal.classList.remove('hidden');

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#000;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px;">2</div>
        <div style="font-size:16px;font-weight:800;color:#fff;">Select a Patient</div>
      </div>
      <button class="modal-close" onclick="closeAssignWizard()">✕</button>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">
      Doctor chooses the patient and clicks Assign to evaluate specialty match.
    </div>

    <!-- Patient Highlight Card -->
    <div style="background:rgba(14,24,40,0.9);border:1px solid rgba(239,68,68,0.4);border-radius:14px;padding:20px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #ef4444;" alt="Patient" />
          <div>
            <div style="font-size:17px;font-weight:800;color:#fff;">Mr. Ravi</div>
            <div style="font-size:12px;color:var(--text-muted);">Patient ID: P-002 &nbsp;|&nbsp; Age: 68 &nbsp;|&nbsp; Male</div>
          </div>
        </div>
        <span class="badge badge-danger" style="background:rgba(239,68,68,0.2);color:#ef4444;font-weight:700;">❤️ Critical</span>
      </div>

      <!-- Vitals Strip -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;">
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;">
          <div style="color:#ef4444;font-size:18px;font-weight:800;">145 bpm</div>
          <div style="font-size:11px;color:var(--text-muted);">Heart Rate</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;">
          <div style="color:#38bdf8;font-size:18px;font-weight:800;">88%</div>
          <div style="font-size:11px;color:var(--text-muted);">SpO2</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;">
          <div style="color:#c084fc;font-size:18px;font-weight:800;">165/105</div>
          <div style="font-size:11px;color:var(--text-muted);">Blood Pressure</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center;">
          <div style="color:#fbbf24;font-size:18px;font-weight:800;">101.2°F</div>
          <div style="font-size:11px;color:var(--text-muted);">Temperature</div>
        </div>
      </div>

      <!-- Conditions & Notes -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:12.5px;">
        <div>
          <div style="font-weight:700;color:#fff;margin-bottom:6px;">Known Conditions</div>
          <div style="color:var(--text-secondary);display:flex;flex-direction:column;gap:4px;">
            <span>🔴 Hypertension</span>
            <span>🔴 Cardiac risk</span>
          </div>
        </div>
        <div>
          <div style="font-weight:700;color:#fff;margin-bottom:6px;">Recent Notes</div>
          <div style="color:var(--text-secondary);display:flex;flex-direction:column;gap:4px;">
            <span>• Emergency alert triggered 1 hour ago</span>
            <span>• Location permission unavailable</span>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;">
      <button class="btn btn-ghost" onclick="closeAssignWizard()">Cancel</button>
      <button class="btn btn-primary" style="padding:10px 24px;font-weight:700;" onclick="wizardStep3('ravi')">
        Assign Doctor →
      </button>
    </div>
  `;
}

// STEP 3: Choose a Doctor
function wizardStep3(patientKey) {
  const container = document.getElementById('assignWizardModalContent');
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#000;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px;">3</div>
        <div style="font-size:16px;font-weight:800;color:#fff;">Choose a Doctor</div>
      </div>
      <button class="modal-close" onclick="closeAssignWizard()">✕</button>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:18px;">
      Select the most suitable doctor based on department, availability, and workload.
    </div>

    <div class="doctor-match-layout">
      <!-- Left Filters -->
      <div style="background:rgba(10,16,26,0.6);border:1px solid var(--border);border-radius:12px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:12px;">Filters</div>
        <div class="form-group mb-16">
          <label class="form-label" style="font-size:11.5px;">Specialization</label>
          <select class="form-select" style="font-size:12px;">
            <option value="Cardiology">Cardiology</option>
            <option value="General">General Physician</option>
            <option value="Neurology">Neurology</option>
          </select>
        </div>
        <div class="form-group mb-16">
          <label class="form-label" style="font-size:11.5px;">Availability</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);cursor:pointer;margin-bottom:6px;">
            <input type="checkbox" checked /> Available Now
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);cursor:pointer;">
            <input type="checkbox" /> On Duty
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" style="font-size:11.5px;">Sort By</label>
          <select class="form-select" style="font-size:12px;">
            <option value="best">Best Match</option>
            <option value="experience">Experience</option>
            <option value="rating">Rating</option>
          </select>
        </div>
      </div>

      <!-- Right Doctor Cards -->
      <div style="display:flex;flex-direction:column;gap:10px;">
        <!-- Doctor 1: Dr. Priya Sharma (Selected) -->
        <div class="doctor-match-card selected" id="docCardPriya" onclick="selectDoctorMatchCard('priya')">
          <input type="radio" name="selectedDoc" checked style="accent-color:var(--primary);" />
          <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=100&auto=format&fit=crop&q=80" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);" alt="Doctor" />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-weight:700;font-size:14px;color:#fff;">Dr. Priya Sharma</span>
              <span class="badge badge-normal" style="background:rgba(16,185,129,0.2);color:#10b981;font-size:11px;">Available</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin:2px 0;">Cardiologist • 5 years experience</div>
            <div style="display:flex;gap:12px;font-size:11px;color:var(--text-secondary);">
              <span>⭐ 4.8 (120 reviews)</span>
              <span>👥 12 patients</span>
              <span style="color:#10b981;">🟢 Low workload</span>
            </div>
          </div>
        </div>

        <!-- Doctor 2: Dr. Arjun Mehta -->
        <div class="doctor-match-card" id="docCardArjun" onclick="selectDoctorMatchCard('arjun')">
          <input type="radio" name="selectedDoc" style="accent-color:var(--primary);" />
          <img src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=100&auto=format&fit=crop&q=80" style="width:44px;height:44px;border-radius:50%;object-fit:cover;" alt="Doctor" />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-weight:700;font-size:14px;color:#fff;">Dr. Arjun Mehta</span>
              <span class="badge badge-normal" style="background:rgba(16,185,129,0.2);color:#10b981;font-size:11px;">Available</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin:2px 0;">Cardiologist • 8 years experience</div>
            <div style="display:flex;gap:12px;font-size:11px;color:var(--text-secondary);">
              <span>⭐ 4.6 (98 reviews)</span>
              <span>👥 18 patients</span>
              <span style="color:#fdcb6e;">🟡 Medium workload</span>
            </div>
          </div>
        </div>

        <!-- Doctor 3: Dr. Kavya Nair -->
        <div class="doctor-match-card" id="docCardKavya" onclick="selectDoctorMatchCard('kavya')">
          <input type="radio" name="selectedDoc" style="accent-color:var(--primary);" />
          <img src="https://images.unsplash.com/photo-1594824813583-b1d550e583c2?w=100&auto=format&fit=crop&q=80" style="width:44px;height:44px;border-radius:50%;object-fit:cover;" alt="Doctor" />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-weight:700;font-size:14px;color:#fff;">Dr. Kavya Nair</span>
              <span class="badge badge-normal" style="background:rgba(16,185,129,0.2);color:#10b981;font-size:11px;">Available</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin:2px 0;">General Physician • 3 years experience</div>
            <div style="display:flex;gap:12px;font-size:11px;color:var(--text-secondary);">
              <span>⭐ 4.5 (80 reviews)</span>
              <span>👥 15 patients</span>
              <span style="color:#10b981;">🟢 Low workload</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:20px;">
      <button class="btn btn-ghost" onclick="startAssignWizard('ravi')">← Back</button>
      <button class="btn btn-primary" onclick="wizardStep4('priya')">Review &amp; Confirm →</button>
    </div>
  `;
}

function selectDoctorMatchCard(docKey) {
  currentAssignDoctor = docKey;
  document.querySelectorAll('.doctor-match-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`docCard${docKey.charAt(0).toUpperCase() + docKey.slice(1)}`);
  if (card) {
    card.classList.add('selected');
    const radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
  }
}

// STEP 4: Confirm Assignment
function wizardStep4(docKey) {
  const container = document.getElementById('assignWizardModalContent');
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#000;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px;">4</div>
        <div style="font-size:16px;font-weight:800;color:#fff;">Confirm Assignment</div>
      </div>
      <button class="modal-close" onclick="closeAssignWizard()">✕</button>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:18px;">
      Review the details and confirm the doctor assignment.
    </div>

    <!-- Connector Flow -->
    <div style="background:rgba(10,16,26,0.6);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:18px;">
      <!-- Patient -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" alt="Patient" />
          <div>
            <div style="font-weight:700;font-size:14px;color:#fff;">Mr. Ravi</div>
            <div style="font-size:11px;color:var(--text-muted);">Age: 68 | Male | ID: P-002</div>
          </div>
        </div>
        <span class="badge badge-danger" style="background:rgba(239,68,68,0.2);color:#ef4444;">Critical</span>
      </div>

      <!-- Arrow -->
      <div style="text-align:center;padding:10px 0;color:var(--primary);font-size:18px;">↓</div>

      <!-- Doctor -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=100&auto=format&fit=crop&q=80" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);" alt="Doctor" />
          <div>
            <div style="font-weight:700;font-size:14px;color:#fff;">Dr. Priya Sharma</div>
            <div style="font-size:11px;color:var(--text-muted);">Cardiologist</div>
          </div>
        </div>
        <span class="badge badge-normal" style="background:rgba(16,185,129,0.2);color:#10b981;">Available now</span>
      </div>
    </div>

    <!-- What will happen checklist -->
    <div class="confirm-checklist-box">
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;">What will happen?</div>
      <div class="checklist-item">
        <span style="color:#10b981;">✓</span>
        <span>Dr. Priya Sharma will be assigned as the primary doctor</span>
      </div>
      <div class="checklist-item">
        <span style="color:#10b981;">✓</span>
        <span>Doctor will receive a notification</span>
      </div>
      <div class="checklist-item">
        <span style="color:#10b981;">✓</span>
        <span>Patient will be notified (if enabled)</span>
      </div>
      <div class="checklist-item">
        <span style="color:#10b981;">✓</span>
        <span>Assignment will appear in patient and doctor dashboards</span>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;">
      <button class="btn btn-ghost" onclick="wizardStep3('ravi')">Cancel</button>
      <button class="btn btn-primary" style="padding:10px 24px;font-weight:700;" onclick="wizardStep5()">Confirm Assignment</button>
    </div>
  `;
}

// STEP 5: Success Output
function wizardStep5() {
  const container = document.getElementById('assignWizardModalContent');
  container.innerHTML = `
    <div style="text-align:center;padding:30px 10px;">
      <div class="success-checkmark-wrapper">✓</div>
      <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:8px;">Doctor Assigned Successfully!</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:28px;">
        Dr. Priya Sharma has been assigned to Mr. Ravi.
      </div>
      <div style="display:flex;justify-content:center;gap:14px;">
        <button class="btn btn-ghost" onclick="closeAssignWizard();viewPatientDetails('ravi')">
          View Patient Profile
        </button>
        <button class="btn btn-primary" onclick="closeAssignWizard()">
          Back to Assign Doctor
        </button>
      </div>
    </div>
  `;
}
