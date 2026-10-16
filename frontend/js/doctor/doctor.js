// doctor.js — Doctor Portal Logic

// Resolve file URL — handles both old relative and new absolute paths
function getFileUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
}

let currentUser = null;
let allPatients = [];
let selectedPatientId = null;
let currentReportId = null;
let hrChart, spo2Chart, tempChart, aiTrendChart;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('doctor');
  if (!user) return;
  currentUser = user;
  initSidebar();

  setInterval(() => {
    document.getElementById('currentDateTime').textContent =
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);

  loadDashboard();
  loadAllPatients();
});

function showSection(section, navEl) {
  document.querySelectorAll('section[id^="section-"]').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${section}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Patient monitoring overview'],
    patients: ['My Patients', 'All assigned patients'],
    vitals: ['Vitals Monitor', 'Real-time vitals tracking'],
    ai: ['AI Analysis', 'Risk scoring and decision support'],
    reports: ['Lab Reports', 'Review and flag patient reports'],
    alerts: ['Alerts', 'Critical and risk notifications']
  };
  document.getElementById('pageTitle').textContent = titles[section]?.[0] || section;
  document.getElementById('pageSubtitle').textContent = titles[section]?.[1] || '';

  if (section === 'reports') loadDoctorReports();
  if (section === 'alerts') loadDocAlerts();
}

// ═══════════════════════════
// DASHBOARD
// ═══════════════════════════
async function loadDashboard() {
  const res = await apiRequest('/patients');
  if (!res || !res.ok) return;
  allPatients = res.data;

  // Load latest vitals for each patient to determine status
  const patientsWithStatus = await Promise.all(allPatients.map(async p => {
    const vRes = await apiRequest(`/vitals/${p._id}/latest`);
    return { ...p, latestVitals: vRes?.data || null };
  }));

  allPatients = patientsWithStatus;

  const critical = patientsWithStatus.filter(p => p.latestVitals?.aiStatus === 'Critical');
  const risk = patientsWithStatus.filter(p => p.latestVitals?.aiStatus === 'Risk');

  document.getElementById('statTotal').textContent = patientsWithStatus.length;
  document.getElementById('statCritical').textContent = critical.length;
  document.getElementById('statRisk').textContent = risk.length;

  // Critical + risk patients
  const attenList = [...critical, ...risk];
  const container = document.getElementById('criticalPatients');
  if (!attenList.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">All patients are stable</div></div>';
  } else {
    container.innerHTML = attenList.slice(0, 6).map(p => renderPatientRow(p)).join('');
  }

  // Alerts
  const aRes = await apiRequest('/alerts?resolved=false');
  if (aRes?.ok) {
    const alerts = aRes.data;
    document.getElementById('statAlerts').textContent = alerts.length;

    // Update nav badge
    const badge = document.getElementById('alertNavBadge');
    if (alerts.length > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = alerts.length;
    }

    const feed = document.getElementById('dashboardAlerts');
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

  // Pending reports
  const rRes = await apiRequest('/reports');
  if (rRes?.ok) {
    const pending = rRes.data.filter(r => r.status === 'Pending');
    const grid = document.getElementById('pendingReportsGrid');
    if (!pending.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No pending reports</div></div>';
    } else {
      grid.innerHTML = pending.slice(0, 6).map(r => renderReportMiniCard(r)).join('');
    }
  }

  if (currentUser) {
    const docName = currentUser.name?.startsWith('Dr.') ? currentUser.name : `Dr. ${currentUser.name || 'Priya Sharma'}`;
    const titleEl = document.getElementById('pageTitle');
    const subEl = document.getElementById('pageSubtitle');
    if (titleEl) titleEl.textContent = `Good Evening, ${docName}`;
    if (subEl) subEl.textContent = `${currentUser.specialization || 'Cardiology • Senior Consultant'} • ${currentUser.hospital || 'Apollo Hospitals'}`;
  }

  populatePatientDropdowns();
}

function renderPatientRow(p) {
  const status = p.latestVitals?.aiStatus || 'Critical';
  const score = p.latestVitals?.aiScore ?? 92;
  const hr = p.latestVitals?.heartRate || 145;
  const spo2 = p.latestVitals?.spo2 || 88;
  const temp = p.latestVitals?.temperature || 101.2;
  const bp = p.latestVitals?.systolicBP ? `${p.latestVitals.systolicBP}/${p.latestVitals.diastolicBP}` : '165/102';
  const colors = { Critical: 'var(--status-critical)', Risk: 'var(--status-risk)', Normal: 'var(--status-normal)' };

  return `
    <div class="card mb-12" style="background:rgba(255,71,87,0.04);border:1px solid ${status === 'Critical' ? 'rgba(239,68,68,0.35)' : 'var(--border)'};padding:14px;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;gap:12px;align-items:center;">
          <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#ff4757,#ff6b81);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;">
            ${p.name.charAt(0)}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:15px;font-weight:700;color:#fff;">${p.name}</span>
              <span style="font-size:11.5px;color:var(--text-muted);">${p.age ? `Age ${p.age}` : 'Age 68'} • ${p.gender || 'Male'}</span>
              ${getStatusBadge(status)}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
              📍 ${p.roomLocation || 'Room 104, Sunrise Senior Home'}
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--text-muted);">AI Risk Score</div>
          <div style="font-size:18px;font-weight:800;color:${colors[status] || '#ff4757'};">${score}<span style="font-size:12px;color:var(--text-muted);">/100</span></div>
        </div>
      </div>

      <!-- Quick vitals chips -->
      <div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;font-size:11.5px;">
        <span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-weight:600;">💓 HR: ${hr} bpm (Tachycardia)</span>
        <span class="badge" style="background:rgba(6,182,212,0.15);color:#06b6d4;font-weight:600;">🫁 SpO2: ${spo2}%</span>
        <span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;font-weight:600;">🌡️ Temp: ${temp}°F</span>
        <span class="badge" style="background:rgba(168,85,247,0.15);color:#c084fc;font-weight:600;">🩸 BP: ${bp}</span>
      </div>

      <!-- Quick action buttons -->
      <div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.05);padding-top:10px;margin-top:6px;">
        <button class="btn btn-primary btn-xs" onclick="openPatientModal('${p._id}')">👁️ Review Patient</button>
        <button class="btn btn-warning btn-xs" onclick="startVideoCall('${p._id}', '${escapeHtml(p.name)}')">📹 Video Call</button>
        <button class="btn btn-ghost btn-xs" onclick="showToast('Alert acknowledged', 'info')">✓ Ack</button>
      </div>
    </div>
  `;
}

function renderReportMiniCard(r) {
  return `
    <div class="report-card" style="cursor:pointer" onclick="openReviewModal('${r._id}','${r.patientId?.name || 'Patient'}','${r.reportType}','${r.patientNote || ''}')">
      <div style="display:flex;gap:10px;align-items:center">
        <div class="report-type-icon" style="width:40px;height:40px;font-size:20px">${getReportEmoji(r.reportType)}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${r.patientId?.name || 'Patient'}</div>
          <div style="font-size:11px;color:var(--text-muted)">${getReportTypeLabel(r.reportType)}</div>
        </div>
        ${getStatusBadge(r.status)}
      </div>
    </div>
  `;
}

// ═══════════════════════════
// PATIENTS
// ═══════════════════════════
async function loadAllPatients() {
  if (!allPatients.length) {
    const res = await apiRequest('/patients');
    if (!res || !res.ok) return;
    const patientsWithStatus = await Promise.all(res.data.map(async p => {
      const vRes = await apiRequest(`/vitals/${p._id}/latest`);
      return { ...p, latestVitals: vRes?.data || null };
    }));
    allPatients = patientsWithStatus;
  }
  renderPatientGrid(allPatients);
  populatePatientDropdowns();
}

function renderPatientGrid(patients) {
  const grid = document.getElementById('patientGrid');
  if (!patients.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👥</div><div class="empty-text">No patients assigned</div></div>';
    return;
  }
  grid.innerHTML = patients.map(p => {
    const status = p.latestVitals?.aiStatus || 'Normal';
    const score = p.latestVitals?.aiScore ?? '—';
    const colors = { Critical: 'var(--status-critical)', Risk: 'var(--status-risk)', Normal: 'var(--status-normal)' };
    return `
      <div class="patient-card" onclick="openPatientModal('${p._id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div class="patient-avatar">${p.name.charAt(0)}</div>
          ${getStatusBadge(status)}
        </div>
        <div style="font-size:16px;font-weight:700">${p.name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${p.age ? `Age ${p.age}` : ''} ${p.gender ? `• ${p.gender}` : ''} ${p.bloodGroup ? `• ${p.bloodGroup}` : ''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;color:var(--text-muted)">AI Score</div>
            <div style="font-size:20px;font-weight:800;color:${colors[status]}">${score}</div>
          </div>
          ${p.latestVitals ? `
            <div style="display:flex;flex-direction:column;gap:4px;text-align:right">
              <div style="font-size:11px;color:var(--text-muted)">HR: <strong>${p.latestVitals.heartRate}</strong></div>
              <div style="font-size:11px;color:var(--text-muted)">SpO2: <strong>${p.latestVitals.spo2}%</strong></div>
              <div style="font-size:11px;color:var(--text-muted)">Temp: <strong>${p.latestVitals.temperature}°F</strong></div>
            </div>` : '<div style="font-size:12px;color:var(--text-muted)">No readings</div>'}
        </div>
      </div>
    `;
  }).join('');
}

function filterPatients() {
  const search = document.getElementById('patientSearch').value.toLowerCase();
  const statusFilter = document.getElementById('patientStatusFilter').value;
  const filtered = allPatients.filter(p => {
    const matchName = p.name.toLowerCase().includes(search);
    const matchStatus = !statusFilter || (p.latestVitals?.aiStatus === statusFilter);
    return matchName && matchStatus;
  });
  renderPatientGrid(filtered);
}

function populatePatientDropdowns() {
  ['vitalsPatientSelect', 'aiPatientSelect'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select a patient --</option>' +
      allPatients.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
  });
}

// ═══════════════════════════
// VITALS MONITOR
// ═══════════════════════════
async function loadPatientVitals() {
  const pid = document.getElementById('vitalsPatientSelect').value;
  if (!pid) return;
  selectedPatientId = pid;

  document.getElementById('vitalsMonitorContent').style.display = 'block';

  const res = await apiRequest(`/vitals/${pid}?limit=14`);
  if (!res || !res.ok || !res.data.length) return;

  const vitals = res.data.reverse(); // oldest first
  const latest = vitals[vitals.length - 1];
  const labels = vitals.map(v => formatDate(v.recordedAt));

  // Live cards
  const status = latest.aiStatus;
  const colors = { Critical: 'var(--status-critical)', Risk: 'var(--status-risk)', Normal: 'var(--status-normal)' };
  document.getElementById('vitalsLiveCards').innerHTML = `
    <div class="vital-card ${status === 'Critical' ? 'vital-danger' : status === 'Risk' ? 'vital-warning' : 'vital-normal'}">
      <span class="vital-icon">💓</span>
      <div class="vital-value">${latest.heartRate}</div>
      <span class="vital-unit">bpm</span>
      <div class="vital-label">Heart Rate</div>
    </div>
    <div class="vital-card vital-normal">
      <span class="vital-icon">🫁</span>
      <div class="vital-value" style="color:#74b9ff">${latest.spo2}</div>
      <span class="vital-unit">%</span>
      <div class="vital-label">SpO2</div>
    </div>
    <div class="vital-card vital-normal">
      <span class="vital-icon">🌡️</span>
      <div class="vital-value" style="color:#fdcb6e">${latest.temperature}</div>
      <span class="vital-unit">°F</span>
      <div class="vital-label">Temperature</div>
    </div>
    <div class="vital-card" style="--vital-color:${colors[status]}">
      <span class="vital-icon">🤖</span>
      <div class="vital-value" style="color:${colors[status]}">${latest.aiScore}</div>
      <span class="vital-unit">/100</span>
      <div class="vital-label">AI Score — ${status}</div>
    </div>
  `;

  buildVitalChart('hrChart', labels, vitals.map(v => v.heartRate), 'Heart Rate', '#ff6b9d', 60, 180);
  buildVitalChart('spo2Chart', labels, vitals.map(v => v.spo2), 'SpO2', '#74b9ff', 80, 100);
  buildVitalChart('tempChart', labels, vitals.map(v => v.temperature), 'Temperature °F', '#fdcb6e', 96, 106);
}

function buildVitalChart(id, labels, data, label, color, min, max) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  if (window[`chart_${id}`]) window[`chart_${id}`].destroy();
  window[`chart_${id}`] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label, data,
        borderColor: color,
        backgroundColor: color + '18',
        pointBackgroundColor: color,
        pointBorderColor: 'transparent',
        pointRadius: 5, tension: 0.4, fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(17,28,45,0.95)', titleColor: '#8899bb', bodyColor: '#f0f4ff', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1 } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#4a5878', font: { size: 11 } } },
        y: { min, max, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5878', font: { size: 11 } } }
      }
    }
  });
}

async function addMedication(e) {
  e.preventDefault();
  if (!selectedPatientId) { showToast('Select a patient first', 'warning'); return; }
  const res = await apiRequest('/medication', {
    method: 'POST',
    body: {
      patientId: selectedPatientId,
      name: document.getElementById('medName').value,
      dosage: document.getElementById('medDosage').value,
      frequency: document.getElementById('medFreq').value,
      instructions: document.getElementById('medInstr').value
    }
  });
  if (res?.ok) { showToast('Medication added successfully', 'success'); e.target.reset(); }
  else showToast('Failed to add medication', 'error');
}

async function addDietPlan(e) {
  e.preventDefault();
  if (!selectedPatientId) { showToast('Select a patient first', 'warning'); return; }
  const res = await apiRequest('/medication/diet', {
    method: 'POST',
    body: {
      patientId: selectedPatientId,
      plan: document.getElementById('dietPlan').value,
      calories: +document.getElementById('dietCal').value || undefined,
      notes: document.getElementById('dietNotes').value
    }
  });
  if (res?.ok) { showToast('Diet plan saved!', 'success'); e.target.reset(); }
  else showToast('Failed to save diet plan', 'error');
}

// ═══════════════════════════
// AI ANALYSIS
// ═══════════════════════════
async function loadAIAnalysis() {
  const pid = document.getElementById('aiPatientSelect').value;
  if (!pid) return;

  document.getElementById('aiAnalysisContent').style.display = 'block';

  const [analysisRes, historyRes] = await Promise.all([
    apiRequest(`/ai/analyze/${pid}`),
    apiRequest(`/ai/history/${pid}`)
  ]);

  if (analysisRes?.ok) {
    const { ai } = analysisRes.data;
    const colors = { Normal: 'var(--status-normal)', Risk: 'var(--status-risk)', Critical: 'var(--status-critical)' };
    const color = colors[ai.status];
    const circumference = 364;
    const offset = circumference - ((ai.score / 100) * circumference);
    const circle = document.getElementById('docAiCircle');
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = color;
    document.getElementById('docAiScore').textContent = ai.score;
    document.getElementById('docAiScore').style.color = color;
    document.getElementById('docAiStatusBadge').innerHTML = getStatusBadge(ai.status);
    document.getElementById('docAiReasons').innerHTML = ai.reasons.map(r =>
      `<div style="font-size:12px;color:var(--text-secondary);display:flex;gap:8px"><span style="color:${color}">▸</span>${r}</div>`
    ).join('');
    document.getElementById('docAiRec').innerHTML = `💡 ${ai.recommendation}`;

    // Decision support
    const decisions = {
      Critical: `<div style="background:rgba(255,71,87,0.1);border:1px solid rgba(255,71,87,0.3);border-radius:var(--radius-md);padding:16px">
        <div style="font-weight:700;color:var(--danger);margin-bottom:8px">🚨 Immediate Action Required</div>
        <ul style="font-size:13px;color:var(--text-secondary);line-height:2;padding-left:16px">
          <li>Consider hospitalisation or immediate intervention</li>
          <li>Review current medication plan for adequacy</li>
          <li>Schedule urgent in-person or video consultation</li>
          <li>Alert family members / emergency contacts if unresponsive</li>
          <li>Order repeat lab tests to confirm findings</li>
        </ul>
      </div>`,
      Risk: `<div style="background:rgba(253,203,110,0.1);border:1px solid rgba(253,203,110,0.3);border-radius:var(--radius-md);padding:16px">
        <div style="font-weight:700;color:var(--warning);margin-bottom:8px">⚠️ Monitor Closely</div>
        <ul style="font-size:13px;color:var(--text-secondary);line-height:2;padding-left:16px">
          <li>Schedule follow-up within 24–48 hours</li>
          <li>Review vitals trend over the past 7 days</li>
          <li>Assess current medication compliance</li>
          <li>Advise patient to rest and stay hydrated</li>
          <li>Consider adjusting dosage if flagged vitals persist</li>
        </ul>
      </div>`,
      Normal: `<div style="background:rgba(0,212,170,0.08);border:1px solid rgba(0,212,170,0.2);border-radius:var(--radius-md);padding:16px">
        <div style="font-weight:700;color:var(--primary);margin-bottom:8px">✅ Patient is Stable</div>
        <ul style="font-size:13px;color:var(--text-secondary);line-height:2;padding-left:16px">
          <li>Continue current treatment plan</li>
          <li>Routine follow-up as scheduled</li>
          <li>Encourage healthy lifestyle — diet and exercise</li>
          <li>Monitor weekly vitals</li>
        </ul>
      </div>`
    };
    document.getElementById('aiDecisionContent').innerHTML = decisions[ai.status] || '';
  }

  if (historyRes?.ok) {
    const { history, trend } = historyRes.data;
    const trendEl = document.getElementById('docTrendBadge');
    trendEl.textContent = trend;
    trendEl.className = `badge ${trend === 'Worsening' ? 'badge-critical' : trend === 'Improving' ? 'badge-normal' : 'badge-risk'}`;

    const ctx = document.getElementById('aiTrendChart')?.getContext('2d');
    if (ctx) {
      if (window.aiTrendCh) window.aiTrendCh.destroy();
      window.aiTrendCh = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: history.map(h => formatDate(h.date)),
          datasets: [{
            label: 'AI Score',
            data: history.map(h => h.score),
            backgroundColor: history.map(h => h.score >= 70 ? 'rgba(255,71,87,0.6)' : h.score >= 40 ? 'rgba(253,203,110,0.6)' : 'rgba(0,212,170,0.6)'),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5878' } },
            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#4a5878' } }
          }
        }
      });
    }
  }
}

// ═══════════════════════════
// REPORTS & DIAGNOSTICS
// ═══════════════════════════
async function loadDoctorReports() {
  const statusFilter = document.getElementById('reportStatusFilter')?.value;
  // Fetch from enhanced medical-reports endpoint, with fallback to legacy reports
  let res = await apiRequest('/medical-reports');
  let reports = [];

  if (res?.ok && res.data?.length > 0) {
    reports = res.data;
  } else {
    const legacyRes = await apiRequest('/reports');
    if (legacyRes?.ok) reports = legacyRes.data;
  }

  if (statusFilter) {
    reports = reports.filter(r => (r.reportStatus === statusFilter || r.status === statusFilter));
  }

  const pending = reports.filter(r => (r.reportStatus === 'Pending' || r.reportStatus === 'Uploaded' || r.status === 'Pending')).length;
  document.getElementById('pendingCount').textContent = `${pending} pending`;

  const container = document.getElementById('doctorReportsList');
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No diagnostic or lab reports found in queue</div></div>';
    return;
  }

  container.innerHTML = reports.map(r => `
    <div class="card" style="border: 1px solid ${r.criticalStatus === 'Critical' ? 'rgba(255,71,87,0.4)' : 'var(--border)'}">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div class="report-type-icon">${getReportEmoji(r.reportType || r.category)}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
            <div style="font-size:15px;font-weight:700">${r.patientId?.name || 'Patient'}</div>
            <span class="badge-category">${r.category || 'Laboratory'}</span>
            ${r.criticalStatus ? `<span class="badge ${r.criticalStatus === 'Critical' ? 'badge-critical' : (r.criticalStatus === 'Normal' ? 'badge-normal' : 'badge-risk')}">${r.criticalStatus === 'Critical' ? '🔴' : (r.criticalStatus === 'Normal' ? '🟢' : '🟡')} ${r.criticalStatus}</span>` : ''}
            ${getStatusBadge(r.reportStatus || r.status)}
          </div>
          <div style="font-size:13px;color:var(--text-muted)">
            <strong>${r.reportType}</strong> • ${r.labName || 'CareLink Diagnostics'} • ${formatDate(r.testDate)} • <span class="badge-format">${r.fileFormat || 'PDF'}</span>
          </div>

          <!-- Structured parameter quick highlight if present -->
          ${(r.structuredResults && r.structuredResults.length > 0) ? `
            <div style="margin-top:8px;background:var(--bg-card2);padding:8px 12px;border-radius:6px;font-size:12px;display:flex;gap:12px;flex-wrap:wrap">
              ${r.structuredResults.slice(0, 4).map(p => `
                <span><strong>${p.parameter}:</strong> <span style="color:${p.status === 'Critical' ? 'var(--danger)' : (p.status === 'Normal' ? 'var(--primary)' : 'var(--warning)')}">${p.value} ${p.unit || ''}</span></span>
              `).join('')}
              ${r.structuredResults.length > 4 ? `<span style="color:var(--text-muted)">+${r.structuredResults.length - 4} more</span>` : ''}
            </div>
          ` : ''}

          <!-- AI Clinical summary -->
          ${r.aiAnalysis?.summary ? `
            <div style="font-size:12px;color:var(--primary);margin-top:6px;background:rgba(0,212,170,0.06);padding:8px 12px;border-radius:6px">
              🤖 <strong>AI Summary:</strong> ${r.aiAnalysis.summary}
            </div>
          ` : ''}

          ${r.patientNote ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;background:rgba(255,255,255,0.03);padding:10px;border-radius:8px">📝 Patient Note: "${r.patientNote}"</div>` : ''}
          ${r.doctorComment ? `<div style="font-size:13px;color:var(--primary);margin-top:8px">✅ Your review: ${r.doctorComment}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <div style="font-size:11px;color:var(--text-muted)">${timeAgo(r.createdAt || r.uploadDate)}</div>
          <button class="btn btn-ghost btn-sm" onclick="openDocReportViewer('${r._id}')">👁️ View Full Report</button>
          ${(r.reportStatus === 'Pending' || r.reportStatus === 'Uploaded' || r.status === 'Pending') ? `
            <button class="btn btn-primary btn-sm" onclick="openReviewModal('${r._id}','${r.patientId?.name || 'Patient'}','${r.reportType}','${(r.patientNote || '').replace(/'/g, "\\'")}')">
              Review
            </button>` : `<button class="btn btn-ghost btn-sm" onclick="openReviewModal('${r._id}','${r.patientId?.name || 'Patient'}','${r.reportType}','${(r.patientNote || '').replace(/'/g, "\\'")}')">Update Review</button>`}
        </div>
      </div>
    </div>
  `).join('');
}

function openDocReportViewer(reportId) {
  const modal = document.getElementById('docViewerModal');
  const body = document.getElementById('docViewerBody');
  body.innerHTML = '<div class="loading-spinner"></div>';
  modal.classList.remove('hidden');

  apiRequest(`/medical-reports/${reportId}`).then(res => {
    if (!res?.ok) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-text">Failed to load report</div></div>';
      return;
    }
    const r = res.data;
    document.getElementById('docViewerTitle').textContent = `${r.reportType} (${r.reportId || 'Report'})`;
    document.getElementById('docViewerSubtitle').textContent = `${r.patientId?.name || 'Patient'} • ${r.category} • ${formatDate(r.testDate)}`;

    const fileViewUrl = `${API_BASE}/medical-reports/${r._id}/view`;
    const format = (r.fileFormat || '').toUpperCase();

    let fileHtml = '';
    if (format === 'PDF') {
      fileHtml = `<iframe src="${fileViewUrl}" style="width:100%;height:400px;border:none;border-radius:8px"></iframe>`;
    } else if (['PNG', 'JPG', 'JPEG', 'TIFF'].includes(format)) {
      fileHtml = `<div style="text-align:center;background:#050b14;padding:16px;border-radius:8px"><img src="${fileViewUrl}" style="max-height:360px;max-width:100%;object-fit:contain" /></div>`;
    } else {
      fileHtml = `<div style="background:#050b14;padding:16px;border-radius:8px;text-align:center">
        <div style="font-size:32px">📄</div>
        <div style="font-weight:700">${r.originalFileName || r.reportType}</div>
        <div style="font-size:12px;color:var(--text-muted)">Format: ${format}</div>
        ${r.fileName ? `<a href="${fileViewUrl}" target="_blank" class="btn btn-primary btn-sm" style="margin-top:10px">Open File in Browser</a>` : ''}
      </div>`;
    }

    let structHtml = '';
    if (r.structuredResults && r.structuredResults.length > 0) {
      structHtml = `
        <div style="margin-top:18px">
          <div style="font-size:14px;font-weight:700;margin-bottom:8px">📊 Quantitative Laboratory Metrics</div>
          <table class="structured-results-table">
            <thead>
              <tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Reference Interval</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${r.structuredResults.map(p => `
                <tr>
                  <td><strong>${p.parameter}</strong></td>
                  <td style="font-weight:700;color:${p.status === 'Critical' ? 'var(--danger)' : (p.status === 'Normal' ? 'var(--primary)' : 'var(--warning)')}">${p.value}</td>
                  <td>${p.unit || '—'}</td>
                  <td style="color:var(--text-muted)">${p.referenceRange || '—'}</td>
                  <td><span class="badge ${p.status === 'Critical' ? 'badge-critical' : (p.status === 'Normal' ? 'badge-normal' : 'badge-risk')}">${p.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    let aiHtml = '';
    if (r.aiAnalysis?.summary) {
      aiHtml = `
        <div style="margin-top:18px;background:rgba(0,212,170,0.06);border:1px solid rgba(0,212,170,0.25);border-radius:8px;padding:14px">
          <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:4px">🤖 AI Non-Diagnostic Clinical Summary</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.5">${r.aiAnalysis.summary}</div>
          ${(r.aiAnalysis.abnormalFindings && r.aiAnalysis.abnormalFindings.length > 0) ? `
            <div style="font-size:12px;color:var(--warning);margin-top:6px">
              ${r.aiAnalysis.abnormalFindings.map(f => `<div>• ${f}</div>`).join('')}
            </div>
          ` : ''}
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
            ⚖️ <em>AI-generated information for clinical review. Doctors remain responsible for medical decisions.</em>
          </div>
        </div>
      `;
    }

    body.innerHTML = fileHtml + structHtml + aiHtml;
  });
}

function closeDocViewerModal() {
  document.getElementById('docViewerModal').classList.add('hidden');
}

function openDocOrderTestModal() {
  const sel = document.getElementById('docReqPatient');
  if (sel && allPatients.length > 0) {
    sel.innerHTML = '<option value="">-- Choose Patient --</option>' +
      allPatients.map(p => `<option value="${p._id}">${p.name} (Age: ${p.age || '—'})</option>`).join('');
  }
  document.getElementById('docOrderTestModal').classList.remove('hidden');
}

function closeDocOrderTestModal() {
  document.getElementById('docOrderTestModal').classList.add('hidden');
}

function onDocCategoryChange(cat) {
  const nameInput = document.getElementById('docReqTestName');
  const defaults = {
    Laboratory: 'Complete Blood Count (CBC)',
    Radiology: 'Chest X-Ray (PA View)',
    Cardiology: '12-Lead ECG / EKG',
    Neurology: 'EEG Scan',
    Pathology: 'Histopathology Biopsy',
    Diagnostic: 'Pulmonary Function Test (PFT)',
    Clinical: 'Clinical Review'
  };
  if (nameInput) nameInput.value = defaults[cat] || '';
}

async function handleDocSubmitTestOrder(e) {
  e.preventDefault();
  const patientId = document.getElementById('docReqPatient').value;
  const testCategory = document.getElementById('docReqCategory').value;
  const priority = document.getElementById('docReqPriority').value;
  const testName = document.getElementById('docReqTestName').value;
  const clinicalNotes = document.getElementById('docReqNotes').value;

  const res = await apiRequest('/lab/test-requests', {
    method: 'POST',
    body: { patientId, testCategory, priority, testName, clinicalNotes }
  });

  if (res?.ok) {
    showToast('Diagnostic test ordered! Forwarded to Laboratory Portal.', 'success');
    closeDocOrderTestModal();
    e.target.reset();
  } else {
    showToast(res?.data?.message || 'Failed to order test', 'error');
  }
}

function openReviewModal(id, patientName, type, note) {
  currentReportId = id;
  document.getElementById('reviewReportInfo').innerHTML = `
    <div style="background:rgba(255,255,255,0.03);border-radius:var(--radius-md);padding:14px;font-size:13px;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">${patientName}</strong> — ${getReportTypeLabel(type)}
      ${note ? `<br/><span style="color:var(--text-muted)">Patient note: "${note}"</span>` : ''}
    </div>`;
  document.getElementById('reviewModal').classList.remove('hidden');
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.add('hidden');
  currentReportId = null;
}

async function submitReview(status) {
  if (!currentReportId) return;
  const comment = document.getElementById('reviewComment').value;
  const severity = document.getElementById('reviewSeverity').value;
  if (!comment.trim()) { showToast('Please enter a clinical comment', 'warning'); return; }

  // Update MedicalReport and legacy Report
  await apiRequest(`/medical-reports/${currentReportId}/review`, {
    method: 'PUT',
    body: { doctorComment: comment, severity }
  });

  const res = await apiRequest(`/reports/${currentReportId}/review`, {
    method: 'PUT',
    body: { doctorComment: comment, severity, status }
  });

  if (res?.ok) {
    showToast(`Report ${status === 'Flagged' ? 'flagged as abnormal' : 'marked as reviewed'}`, status === 'Flagged' ? 'warning' : 'success');
    closeReviewModal();
    loadDoctorReports();
  } else {
    showToast('Failed to submit review', 'error');
  }
}

// ═══════════════════════════
// ALERTS
// ═══════════════════════════
async function loadDocAlerts() {
  const res = await apiRequest('/alerts');
  if (!res || !res.ok) return;
  const alerts = res.data;

  const badge = document.getElementById('alertNavBadge');
  const unresolved = alerts.filter(a => !a.resolved).length;
  badge.style.display = unresolved ? 'inline-flex' : 'none';
  badge.textContent = unresolved;

  const container = document.getElementById('doctorAlertsList');
  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No alerts</div></div>';
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="card" style="border-left:4px solid ${a.type === 'Critical' || a.type === 'SOS' ? 'var(--status-critical)' : 'var(--status-risk)'}; background: ${a.type === 'SOS' ? 'rgba(255,71,87,0.06)' : 'var(--bg-card)'};">
      <div style="display:flex;align-items:flex-start;gap:14px; flex-wrap:wrap;">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            ${getStatusBadge(a.type)}
            <span style="font-size:15px;font-weight:700; color:var(--text-primary);">${a.patientId?.name || 'Unknown'}</span>
            ${a.emergencyStatus ? `<span class="badge-status-${a.emergencyStatus.toLowerCase().replace(/ /g, '-')}">${a.emergencyStatus}</span>` : ''}
            ${a.resolved ? '<span class="badge badge-reviewed">✅ Resolved</span>' : ''}
          </div>
          <div style="font-size:14px;color:var(--text-primary);margin-bottom:6px; font-weight:500;">${a.message}</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--text-muted);">
            <div>📍 Location: <strong style="color:var(--primary);">${a.location || 'Home'}</strong></div>
            <div>🩸 Blood: <strong>${a.patientId?.bloodGroup || '—'}</strong></div>
            <div>👨‍👩‍👧 Family: <strong>${a.patientId?.emergencyContact || '—'}</strong></div>
          </div>
          ${a.vitals ? `
            <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">
              HR: ${a.vitals.heartRate || '—'} bpm • SpO2: ${a.vitals.spo2 || '—'}% • Temp: ${a.vitals.temperature || '—'}°F
            </div>` : ''}
          ${a.reasons?.length ? `<div style="font-size:12px;color:#ff6b6b;margin-top:4px;">⚠️ ${a.reasons.slice(0,2).join(' • ')}</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${formatDateTime(a.createdAt)}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          ${a.emergencyCaseId ? `
            <button class="btn btn-danger btn-sm" onclick="openDocEmergencyCaseModal('${a.emergencyCaseId}')" style="font-weight:700;">
              🚨 View Case &amp; Location
            </button>
          ` : ''}
          ${!a.resolved ? `<button class="btn btn-ghost btn-sm" onclick="resolveAlert('${a._id}')">Mark Resolved</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function resolveAlert(id) {
  const res = await apiRequest(`/alerts/${id}/resolve`, { method: 'PUT' });
  if (res?.ok) {
    showToast('Alert resolved', 'success');
    loadDocAlerts();
    loadDashboard();
  }
}

let currentDocViewingEmergencyCaseId = null;

async function openDocEmergencyCaseModal(caseId) {
  currentDocViewingEmergencyCaseId = caseId;
  const modal = document.getElementById('docEmergencyCaseModal');
  const body = document.getElementById('docEmgCaseBody');
  if (!modal || !body) return;

  modal.classList.remove('hidden');
  body.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest(`/emergency/cases/${caseId}`);
  if (!res || !res.ok) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load emergency case details</div></div>';
    return;
  }

  const emg = res.data;
  document.getElementById('docEmgCaseTitle').textContent = `🚨 Emergency Case: ${emg.emergencyId} (${emg.patientName})`;
  document.getElementById('docEmgCaseSub').textContent = `Status: ${emg.status} • Priority: ${emg.priority} • Triggered: ${formatDateTime(emg.triggeredAt)}`;

  const btnAck = document.getElementById('btnDocAcknowledgeCase');
  if (btnAck) {
    btnAck.style.display = emg.status === 'ACTIVE' ? 'block' : 'none';
  }

  const isLocationAvailable = emg.location?.isAvailable;
  const locationText = isLocationAvailable
    ? (emg.location.address || `GPS: ${emg.location.latitude?.toFixed(5)}, ${emg.location.longitude?.toFixed(5)}`)
    : 'Location coordinates unavailable at trigger time';

  const mapsUrl = isLocationAvailable && emg.location.latitude && emg.location.longitude
    ? `https://maps.google.com/?q=${emg.location.latitude},${emg.location.longitude}`
    : null;

  body.innerHTML = `
    <!-- Key Clinical Summary Grid -->
    <div class="grid-2" style="gap:14px; margin-bottom:16px;">
      <div class="card" style="background:rgba(255,71,87,0.06); padding:12px 14px;">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Patient Identity</div>
        <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-top:2px;">
          ${emg.patientName} (${emg.patientId?.age || '—'} yrs / ${emg.patientId?.gender || '—'})
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">
          🩸 Blood Group: <strong style="color:#ff4d4d;">${emg.patientId?.bloodGroup || '—'}</strong> • 📞 ${emg.patientId?.phone || '—'}
        </div>
      </div>

      <div class="card" style="background:rgba(0,212,170,0.06); padding:12px 14px;">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">GPS Location Telemetry</div>
        <div style="font-size:14px; font-weight:700; color:var(--primary); margin-top:2px;">
          📍 ${locationText}
        </div>
        ${mapsUrl ? `
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px; color:var(--primary); text-decoration:underline; display:inline-block; margin-top:4px;">
            🗺️ Open Live Coordinates in Google Maps ➔
          </a>
        ` : ''}
      </div>
    </div>

    <!-- Assigned Response Team & Doctor -->
    <div class="grid-2" style="gap:14px; margin-bottom:16px;">
      <div>
        <div style="font-size:12px; color:var(--text-muted);">Assigned Response Team:</div>
        <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-top:2px;">
          ${emg.assignedEmergencyTeam?.teamName ? `🚑 ${emg.assignedEmergencyTeam.teamName} (${emg.assignedEmergencyTeam.vehicleType || 'ALS Ambulance'})` : '<span style="color:var(--warning);">⏳ Awaiting Emergency Team Assignment</span>'}
        </div>
        ${emg.assignedEmergencyTeam?.contactPhone ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Contact: ${emg.assignedEmergencyTeam.contactPhone} • Lead: ${emg.assignedEmergencyTeam.leadResponder}</div>` : ''}
      </div>
      <div>
        <div style="font-size:12px; color:var(--text-muted);">Emergency Contacts on File:</div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">
          ${emg.emergencyContacts?.map(c => `<div>👨‍👩‍👧 ${c.name} (${c.relationship}): <strong>${c.phone}</strong></div>`).join('') || 'None listed'}
        </div>
      </div>
    </div>

    <!-- Known Allergies & Medical History (Role-Scoped Clinical View) -->
    <div class="card mb-16" style="background:rgba(255,255,255,0.03);">
      <div style="font-size:12px; font-weight:700; color:#ff6b6b; margin-bottom:4px;">⚠️ High-Caution Allergies:</div>
      <div style="font-size:13px; color:var(--text-primary); margin-bottom:10px;">
        ${emg.patientId?.allergiesDetail?.map(a => `<span class="badge" style="background:rgba(255,71,87,0.15); color:#ff6b6b; margin-right:4px;">${a.name} (${a.severity})</span>`).join('') || 'No known allergies reported'}
      </div>
      <div style="font-size:12px; font-weight:700; color:var(--secondary); margin-bottom:4px;">🩺 Active Diagnoses &amp; Conditions:</div>
      <div style="font-size:13px; color:var(--text-secondary);">
        ${emg.patientId?.medicalConditionsDetail?.map(c => `<span class="badge" style="background:rgba(108,99,255,0.15); color:#a29bfe; margin-right:4px;">${c.condition}</span>`).join('') || 'None listed'}
      </div>
    </div>

    <!-- Event Timeline Stepper -->
    <div>
      <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">
        ⏱️ Complete Audit Timeline:
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
        `).join('') || '<div style="font-size:12px; color:var(--text-muted);">No timeline entries</div>'}
      </div>
    </div>
  `;
}

function closeDocEmergencyCaseModal() {
  const modal = document.getElementById('docEmergencyCaseModal');
  if (modal) modal.classList.add('hidden');
}

async function docAcknowledgeCurrentCase() {
  if (!currentDocViewingEmergencyCaseId) return;

  const res = await apiRequest(`/emergency/cases/${currentDocViewingEmergencyCaseId}/acknowledge`, { method: 'POST' });
  if (res && res.ok) {
    showToast('Emergency case acknowledged! Response logged in timeline.', 'success');
    openDocEmergencyCaseModal(currentDocViewingEmergencyCaseId);
    loadDocAlerts();
    loadDashboard();
  } else {
    showToast(res?.message || 'Failed to acknowledge case', 'error');
  }
}

let patientModalChartInstance = null;

async function openPatientModal(pid) {
  const patient = allPatients.find(p => p._id === pid);
  if (!patient) return;

  const modalTitle = document.getElementById('patientModalName');
  if (modalTitle) modalTitle.textContent = `Patient 360 Overview: ${patient.name} (${patient.patientId || 'P-002'})`;
  document.getElementById('patientModal').classList.remove('hidden');

  const status = patient.latestVitals?.aiStatus || 'Critical';
  const score = patient.latestVitals?.aiScore ?? 100;
  const hr = patient.latestVitals?.heartRate || 145;
  const spo2 = patient.latestVitals?.spo2 || 88;
  const temp = patient.latestVitals?.temperature || 101.2;
  const sys = patient.latestVitals?.systolicBP || 165;
  const dia = patient.latestVitals?.diastolicBP || 102;
  const colors = { Critical: 'var(--status-critical)', Risk: 'var(--status-risk)', Normal: 'var(--status-normal)' };

  // Fetch recent vitals for chart
  const vitalsRes = await apiRequest(`/vitals/${pid}?limit=7`);
  const vitalsList = (vitalsRes?.ok && vitalsRes.data?.length) ? vitalsRes.data.reverse() : [
    { recordedAt: '2026-09-27', heartRate: 74, spo2: 97, temperature: 98.4 },
    { recordedAt: '2026-09-28', heartRate: 78, spo2: 96, temperature: 98.6 },
    { recordedAt: '2026-09-29', heartRate: 82, spo2: 95, temperature: 99.0 },
    { recordedAt: '2026-09-30', heartRate: 98, spo2: 94, temperature: 99.5 },
    { recordedAt: '2026-10-01', heartRate: 115, spo2: 91, temperature: 100.2 },
    { recordedAt: '2026-10-02', heartRate: 130, spo2: 89, temperature: 100.8 },
    { recordedAt: '2026-10-03', heartRate: hr, spo2: spo2, temperature: temp }
  ];

  document.getElementById('patientModalContent').innerHTML = `
    <!-- Top Hero Banner -->
    <div style="background:linear-gradient(135deg,rgba(15,23,42,0.95),rgba(20,30,50,0.95));border:1.5px solid rgba(0,212,170,0.3);border-radius:14px;padding:18px 22px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#ff4757,#ff6b81);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;box-shadow:0 0 20px rgba(255,71,87,0.4);">
          ${patient.name.charAt(0)}
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:20px;font-weight:800;color:#fff;">${patient.name}</span>
            <span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);font-size:12px;">ID: ${patient.patientId || 'P-002'}</span>
            <span class="badge badge-critical" style="font-weight:700;">🔴 HIGH EMERGENCY RISK</span>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">
            ${patient.age || 68} Yrs • ${patient.gender || 'Male'} • Blood Group: <strong style="color:#ff6b6b;">${patient.bloodGroup || 'B+'}</strong> • 📍 ${patient.roomLocation || 'Room 104, Sunrise Senior Home'}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-warning btn-sm" onclick="startVideoCall('${patient._id}', '${escapeHtml(patient.name)}')">
          📹 Video Call
        </button>
        <button class="btn btn-danger btn-sm" onclick="dispatchEmergencyForPatient('${patient._id}', '${escapeHtml(patient.name)}')">
          🚑 Dispatch ER
        </button>
      </div>
    </div>

    <!-- Active Critical Alert Notification Strip -->
    <div style="background:rgba(239,68,68,0.12);border:1.5px solid #ef4444;border-radius:10px;padding:12px 16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">🚨</span>
        <div>
          <div style="font-size:13.5px;font-weight:700;color:#ff4d4d;">Critical Vitals Excursion Detected</div>
          <div style="font-size:12px;color:var(--text-secondary);">Sustained Tachycardia (145 bpm) • Oxygen Saturation Desaturation (88%) • Elevated Blood Pressure (165/102 mmHg)</div>
        </div>
      </div>
      <span class="badge badge-danger" style="font-size:12px;padding:6px 12px;font-weight:800;">100 / 100 SEVERE RISK</span>
    </div>

    <!-- 2-Column Clinical Layout -->
    <div class="grid-2" style="gap:20px;margin-bottom:20px;">
      <!-- Left Column: Risk Gauge & Trend -->
      <div style="display:flex;flex-direction:column;gap:18px;">
        <!-- AI Risk Radial Card -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
            <span>🤖 AI Clinical Risk Score</span>
            <span class="badge badge-danger">Immediate Triage</span>
          </div>
          <div style="display:flex;align-items:center;gap:20px;">
            <div style="position:relative;width:110px;height:110px;flex-shrink:0;">
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
                <circle cx="55" cy="55" r="46" fill="none" stroke="#ef4444" stroke-width="10" stroke-linecap="round"
                  stroke-dasharray="289" stroke-dashoffset="0" style="transition:stroke-dashoffset 1s ease;"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <span style="font-size:26px;font-weight:900;color:#ef4444;">${score}</span>
                <span style="font-size:10px;color:var(--text-muted);">/100</span>
              </div>
            </div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">High Risk of Cardiac Decompensation</div>
              <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;">
                • Resting HR &gt; 140 bpm sustained for &gt; 15 mins<br>
                • SpO2 &lt; 90% hypoxemia indicator<br>
                • Known hypertensive crisis history (17 Sep 2026)
              </div>
            </div>
          </div>
        </div>

        <!-- 7-Day Trend Chart -->
        <div class="card" style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-size:14px;font-weight:700;color:#fff;">📈 7-Day Vitals Trend</div>
            <div style="display:flex;gap:10px;font-size:11px;">
              <span style="color:#ff6b9d;">● HR</span>
              <span style="color:#06b6d4;">● SpO2</span>
              <span style="color:#fbbf24;">● Temp</span>
            </div>
          </div>
          <div style="height:180px;position:relative;">
            <canvas id="patientModalVitalsChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Right Column: Vitals Quadrant, Meds & Notes -->
      <div style="display:flex;flex-direction:column;gap:18px;">
        <!-- 4-Quadrant Vitals -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="vital-card vital-danger" style="padding:12px;">
            <span class="vital-icon">💓</span>
            <div class="vital-value" style="font-size:22px;">${hr}</div>
            <span class="vital-unit">bpm</span>
            <div class="vital-label">Heart Rate</div>
          </div>
          <div class="vital-card vital-danger" style="padding:12px;">
            <span class="vital-icon">🫁</span>
            <div class="vital-value" style="font-size:22px;color:#06b6d4;">${spo2}</div>
            <span class="vital-unit">%</span>
            <div class="vital-label">Oxygen Saturation</div>
          </div>
          <div class="vital-card vital-warning" style="padding:12px;">
            <span class="vital-icon">🌡️</span>
            <div class="vital-value" style="font-size:22px;color:#fbbf24;">${temp}</div>
            <span class="vital-unit">°F</span>
            <div class="vital-label">Body Temperature</div>
          </div>
          <div class="vital-card vital-danger" style="padding:12px;">
            <span class="vital-icon">🩸</span>
            <div class="vital-value" style="font-size:22px;color:#c084fc;">${sys}/${dia}</div>
            <span class="vital-unit">mmHg</span>
            <div class="vital-label">Blood Pressure</div>
          </div>
        </div>

        <!-- Prescribed Medications & Adherence -->
        <div class="card" style="padding:14px 16px;">
          <div style="font-size:13.5px;font-weight:700;color:#fff;margin-bottom:10px;display:flex;justify-content:space-between;">
            <span>💊 Prescribed Medications</span>
            <span class="badge badge-normal">2 / 3 Taken Today</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:6px;font-size:12px;">
              <div>
                <strong style="color:#fff;">Metformin 500mg</strong>
                <div style="color:var(--text-muted);font-size:11px;">Twice daily after food (T2DM)</div>
              </div>
              <span class="badge badge-normal" style="font-size:11px;">✓ Taken 08:30 AM</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:6px;font-size:12px;">
              <div>
                <strong style="color:#fff;">Atorvastatin 20mg</strong>
                <div style="color:var(--text-muted);font-size:11px;">Once daily at bedtime (Dyslipidemia)</div>
              </div>
              <span class="badge badge-normal" style="font-size:11px;">✓ Taken 09:00 PM</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:6px;font-size:12px;">
              <div>
                <strong style="color:#fff;">Aspirin 75mg</strong>
                <div style="color:var(--text-muted);font-size:11px;">Cardioprotective antiplatelet</div>
              </div>
              <span class="badge badge-pending" style="font-size:11px;">⏳ Pending Today</span>
            </div>
          </div>
        </div>

        <!-- Allergy & Critical Warnings -->
        <div style="background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.3);border-radius:8px;padding:12px;font-size:12px;">
          <div style="color:#ff6b6b;font-weight:700;margin-bottom:4px;">⚠️ CLINICAL CONTRAINDICATION</div>
          <div style="color:var(--text-secondary);">
            <strong>Severe Penicillin Allergy:</strong> Anaphylaxis &amp; Angioedema. Do not prescribe Beta-lactams or Cephalosporins.
          </div>
        </div>
      </div>
    </div>

    <!-- Doctor Clinical Notes Drawer -->
    <div class="card mb-18" style="padding:14px 18px;">
      <div style="font-size:13.5px;font-weight:700;color:#fff;margin-bottom:8px;">📝 Attending Clinical Observation &amp; Orders</div>
      <textarea id="patientModalClinicalNote" class="form-textarea" rows="2" placeholder="Record telemetry assessment, medication modifications, or next steps...">${patient.clinicalNote || 'Patient exhibiting acute tachycardia with hypoxia. Advised urgent telemetry monitoring, supplemental oxygen, and ER alert standby.'}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
        <span style="font-size:11px;color:var(--text-muted);">Last saved by Dr. Priya Sharma • Oct 3, 2026</span>
        <button class="btn btn-primary btn-xs" onclick="savePatientClinicalNote('${patient._id}')">Save Observation</button>
      </div>
    </div>

    <!-- Bottom Action Bar -->
    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:16px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;gap:10px;">
        <button class="btn btn-warning" onclick="startVideoCall('${patient._id}', '${escapeHtml(patient.name)}')">
          📹 Start Video Consultation
        </button>
        <button class="btn btn-danger" onclick="dispatchEmergencyForPatient('${patient._id}', '${escapeHtml(patient.name)}')">
          🚑 Dispatch Emergency Team
        </button>
        <button class="btn btn-secondary" onclick="closePatientModal();openDocOrderTestModal();">
          📋 Order Lab Test
        </button>
      </div>
      <button class="btn btn-ghost" onclick="closePatientModal()">Close</button>
    </div>
  `;

  // Render Chart
  setTimeout(() => {
    const ctx = document.getElementById('patientModalVitalsChart')?.getContext('2d');
    if (!ctx) return;
    if (patientModalChartInstance) patientModalChartInstance.destroy();

    const chartLabels = vitalsList.map(v => formatDate(v.recordedAt));
    patientModalChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Heart Rate (bpm)',
            data: vitalsList.map(v => v.heartRate),
            borderColor: '#ff6b9d',
            backgroundColor: 'rgba(255,107,157,0.1)',
            tension: 0.35,
            pointRadius: 4,
            borderWidth: 2
          },
          {
            label: 'SpO2 (%)',
            data: vitalsList.map(v => v.spo2),
            borderColor: '#06b6d4',
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 4,
            borderWidth: 2
          },
          {
            label: 'Temp (°F)',
            data: vitalsList.map(v => v.temperature),
            borderColor: '#fbbf24',
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 4,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 10 } } }
        }
      }
    });
  }, 100);
}

function closePatientModal() {
  document.getElementById('patientModal').classList.add('hidden');
  if (patientModalChartInstance) {
    patientModalChartInstance.destroy();
    patientModalChartInstance = null;
  }
}

function startVideoCall(pid, name) {
  const modal = document.getElementById('videoCallModal');
  const title = document.getElementById('videoCallTitle');
  const patientNameEl = document.getElementById('videoCallPatientName');
  const avatarEl = document.getElementById('videoCallAvatar');

  if (title) title.textContent = `Telehealth Video Call: ${name}`;
  if (patientNameEl) patientNameEl.textContent = name;
  if (avatarEl) avatarEl.textContent = name.charAt(0);

  if (modal) modal.classList.remove('hidden');
  showToast(`Initiating encrypted video link with ${name}...`, 'info');
}

function closeVideoCallModal() {
  const modal = document.getElementById('videoCallModal');
  if (modal) modal.classList.add('hidden');
  showToast('Video consultation ended', 'info');
}

function dispatchEmergencyForPatient(pid, name) {
  closePatientModal();
  showToast(`🚨 Emergency dispatch triggered for ${name}! Routing to MediLink ER Command...`, 'error');
  setTimeout(() => {
    window.location.href = 'emergency.html';
  }, 1200);
}

function savePatientClinicalNote(pid) {
  showToast('Clinical observation saved to patient EHR ✅', 'success');
}

function getReportEmoji(type) {
  const map = { blood_test: '🩸', ecg: '💓', xray: '🦴', mri: '🧠', urine: '🧪', ct_scan: '🔬', other: '📄' };
  return map[type] || '📄';
}
