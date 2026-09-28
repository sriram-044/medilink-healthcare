// patient.js — Patient Portal Logic

let currentUser = null;
let trendChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('patient');
  if (!user) return;
  currentUser = user;
  initSidebar();

  // Clock
  setInterval(() => {
    document.getElementById('currentDateTime').textContent =
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);

  loadOverviewData();
  loadTrendChart();
  loadAlerts();
  loadDoctor();
});

function showSection(section, navEl) {
  document.querySelectorAll('section[id^="section-"]').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${section}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  const titles = {
    overview: ['Overview', 'Welcome back! Here\'s your health summary.'],
    vitals: ['My Vitals', 'Submit readings & view AI analysis'],
    medication: ['Medication', 'Track your daily medications'],
    appointments: ['Appointments', 'Your upcoming doctor visits'],
    reports: ['Lab Reports', 'Upload and view your medical reports'],
    diet: ['Diet Plan', 'Your personalised nutrition plan'],
    history: ['Medical History & Profile', 'Complete record of hospital visits, allergies, and pre-existing conditions'],
    emergency: ['Emergency SOS Assistance', 'Manage contacts, activate SOS, and track live emergency response']
  };
  document.getElementById('pageTitle').textContent = titles[section][0];
  document.getElementById('pageSubtitle').textContent = titles[section][1];

  if (section === 'vitals') loadVitalsHistory();
  if (section === 'medication') loadMedications();
  if (section === 'reports') loadReports();
  if (section === 'diet') loadDietPlan();
  if (section === 'history') loadLifetimeMedicalHistory();
  if (section === 'emergency') loadPatientEmergencySection();
}

// ═══════════════════════
// OVERVIEW
// ═══════════════════════
async function loadOverviewData() {
  const res = await apiRequest(`/vitals/${currentUser.id}/latest`);
  if (!res || !res.data) return;
  const v = res.data;

  document.getElementById('overviewHR').textContent = v.heartRate || '—';
  document.getElementById('overviewSpO2').textContent = v.spo2 ? `${v.spo2}%` : '—';
  document.getElementById('overviewTemp').textContent = v.temperature ? `${v.temperature}°` : '—';
  document.getElementById('overviewScore').textContent = v.aiScore ?? '—';

  // Update live vitals side
  document.getElementById('liveHR').textContent = v.heartRate || '—';
  document.getElementById('liveSpO2').textContent = v.spo2 || '—';
  document.getElementById('liveTemp').textContent = v.temperature || '—';
  document.getElementById('liveBP').textContent = v.systolicBP ? `${v.systolicBP}/${v.diastolicBP}` : '—';

  // AI Ring
  updateAIRing(v.aiScore, v.aiStatus, v.aiReasons, v.aiRecommendation, v.recordedAt);

  // Health goals
  const steps = v.stepCount || 0;
  const stepPct = Math.min(100, (steps / 10000) * 100);
  document.getElementById('stepsGoal').textContent = `${steps.toLocaleString()} / 10,000`;
  document.getElementById('stepsBar').style.width = stepPct + '%';
}

function updateAIRing(score, status, reasons, recommendation, time) {
  const circle = document.getElementById('aiScoreCircle');
  const scoreVal = document.getElementById('aiScoreVal');
  const statusBadge = document.getElementById('aiStatusBadge');
  const aiScoreTime = document.getElementById('aiScoreTime');
  const aiReasons = document.getElementById('aiReasons');
  const aiRec = document.getElementById('aiRecommendation');

  const colors = { Normal: 'var(--status-normal)', Risk: 'var(--status-risk)', Critical: 'var(--status-critical)' };
  const color = colors[status] || 'var(--primary)';
  const circumference = 364;
  const offset = circumference - ((score / 100) * circumference);

  circle.style.strokeDashoffset = offset;
  circle.style.stroke = color;
  scoreVal.textContent = score ?? '—';
  scoreVal.style.color = color;
  statusBadge.innerHTML = getStatusBadge(status);
  aiScoreTime.textContent = time ? `Last updated: ${formatDateTime(time)}` : '';

  if (reasons?.length) {
    aiReasons.innerHTML = reasons.map(r =>
      `<div style="font-size:12px;color:var(--text-secondary);display:flex;gap:8px;align-items:flex-start">
        <span style="color:${color};margin-top:2px">▸</span><span>${r}</span>
      </div>`
    ).join('');
  }

  if (recommendation) {
    aiRec.innerHTML = `<span style="color:${color}">💡 </span>${recommendation}`;
  }

  // Sync to overview
  document.getElementById('overviewScore').textContent = score ?? '—';
}

// ═══════════════════════
// SMARTWATCH WEARABLE TELEMETRY SIMULATION
// ═══════════════════════
async function simulateWearable(mode) {
  const badge = document.getElementById('wearableStatusBadge');
  if (badge) badge.textContent = '⏳ Streaming...';

  let payload = {};
  if (mode === 'critical') {
    payload = {
      heartRate: 145,
      spo2: 88,
      temperature: 101.2,
      stepCount: 120,
      fallDetected: true,
      roomLocation: currentUser.roomLocation || 'Room 104, Sunrise Senior Home'
    };
  } else {
    payload = {
      heartRate: 72,
      spo2: 98,
      temperature: 98.6,
      stepCount: 4500,
      fallDetected: false,
      roomLocation: currentUser.roomLocation || 'Home / Apartment'
    };
  }

  const res = await apiRequest('/vitals/wearable-sync', { method: 'POST', body: payload });
  if (badge) badge.textContent = '📡 Device Synced';

  if (!res || !res.ok) {
    showToast('Failed to sync smartwatch telemetry', 'error');
    return;
  }

  const { vitals, ai, emergencyAlert } = res.data;
  showToast(`Wearable Synced! AI Score: ${ai.score}/100 — ${ai.status}`,
    ai.status === 'Critical' ? 'error' : 'success');

  // Update Overview & Live Displays
  document.getElementById('overviewHR').textContent = vitals.heartRate;
  document.getElementById('overviewSpO2').textContent = `${vitals.spo2}%`;
  document.getElementById('overviewTemp').textContent = `${vitals.temperature}°`;
  document.getElementById('overviewScore').textContent = vitals.aiScore;

  document.getElementById('liveHR').textContent = vitals.heartRate;
  document.getElementById('liveSpO2').textContent = vitals.spo2;
  document.getElementById('liveTemp').textContent = vitals.temperature;

  updateAIRing(ai.score, ai.status, ai.reasons, ai.recommendation, new Date());

  // Render Emergency Banner if escalation triggered
  const banner = document.getElementById('emergencyStatusBanner');
  if (banner) {
    if (ai.status === 'Critical' || vitals.fallDetected) {
      banner.style.display = 'block';
      document.getElementById('emergencyBannerDetails').innerHTML = `
        Location: <strong>${vitals.location}</strong> | Event: <strong>${vitals.fallDetected ? 'Hard Fall Impact Detected' : 'Abnormal Telemetry'}</strong><br/>
        AI Score: <strong style="color:#ff4d4d">${ai.score}/100</strong> — ${ai.reasons.join(' • ')}
      `;
      document.getElementById('caregiverPhoneDisp').textContent = currentUser.caregiverPhone || '+91 98765 88888 (Caregiver)';
      document.getElementById('familyPhoneDisp').textContent = currentUser.emergencyContact || '+91 98765 99999 (Family)';
    } else {
      banner.style.display = 'none';
    }
  }

  loadAlerts();
  loadTrendChart();
}

// ═══════════════════════
// TREND CHART
// ═══════════════════════
async function loadTrendChart() {
  const res = await apiRequest(`/ai/history/${currentUser.id}`);
  if (!res || !res.data) return;
  const { history, trend } = res.data;

  const trendBadge = document.getElementById('trendBadge');
  const trendColors = { Worsening: 'badge-critical', Improving: 'badge-normal', Stable: 'badge-risk' };
  if (trendBadge) {
    trendBadge.className = `badge ${trendColors[trend] || 'badge-normal'}`;
    trendBadge.textContent = trend || '—';
  }

  const ctx = document.getElementById('trendChart')?.getContext('2d');
  if (!ctx) return;

  if (trendChartInstance) trendChartInstance.destroy();

  const labels = history.map(h => formatDate(h.date));
  const scores = history.map(h => h.score);

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'AI Risk Score',
        data: scores,
        borderColor: '#00d4aa',
        backgroundColor: 'rgba(0,212,170,0.1)',
        pointBackgroundColor: scores.map(s =>
          s >= 70 ? '#ff4757' : s >= 40 ? '#fdcb6e' : '#00d4aa'
        ),
        pointBorderColor: 'transparent',
        pointRadius: 6,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17,28,45,0.95)',
          titleColor: '#8899bb',
          bodyColor: '#f0f4ff',
          borderColor: 'rgba(0,212,170,0.2)',
          borderWidth: 1,
          callbacks: {
            label: ctx => `Score: ${ctx.raw} — ${ctx.raw >= 70 ? '🔴 Critical' : ctx.raw >= 40 ? '🟡 Risk' : '🟢 Normal'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#4a5878', font: { size: 11 } }
        },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#4a5878', font: { size: 11 } }
        }
      }
    }
  });
}

// ═══════════════════════
// ALERTS
// ═══════════════════════
async function loadAlerts() {
  const res = await apiRequest(`/alerts/patient/${currentUser.id}`);
  if (!res || !res.ok) return;
  const alerts = res.data.filter(a => !a.resolved).slice(0, 5);

  const container = document.getElementById('patientAlerts');
  const countBadge = document.getElementById('alertCount');

  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No active alerts</div></div>';
    return;
  }

  countBadge.style.display = 'inline-flex';
  countBadge.textContent = alerts.length + ' active';

  container.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.type.toLowerCase()}">
      <div class="alert-dot"></div>
      <div class="alert-content">
        <div class="alert-message">${a.message}</div>
        <div class="alert-meta">${timeAgo(a.createdAt)} • ${a.type}</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════
// DOCTOR INFO
// ═══════════════════════
async function loadDoctor() {
  const res = await apiRequest(`/patients/${currentUser.id}`);
  if (!res || !res.ok || !res.data?.assignedDoctor) return;
  const doc = res.data.assignedDoctor;

  document.getElementById('doctorInfo').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--secondary),var(--primary));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;flex-shrink:0">
        ${doc.name.charAt(0)}
      </div>
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${doc.name}</div>
        <div style="font-size:13px;color:var(--text-muted)">${doc.specialization || 'General Physician'}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">📧 ${doc.email}</div>
        ${doc.phone ? `<div style="font-size:13px;color:var(--text-secondary)">📞 ${doc.phone}</div>` : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════
// VITALS SUBMIT
// ═══════════════════════
async function submitVitals(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  const payload = {
    heartRate: +document.getElementById('vHR').value,
    spo2: +document.getElementById('vSpO2').value,
    temperature: +document.getElementById('vTemp').value,
    systolicBP: +document.getElementById('vBPSys').value || undefined,
    diastolicBP: +document.getElementById('vBPDia').value || undefined,
    stepCount: +document.getElementById('vSteps').value || 0,
    weight: +document.getElementById('vWeight').value || undefined,
    glucoseLevel: +document.getElementById('vGlucose').value || undefined,
  };

  const res = await apiRequest('/vitals', { method: 'POST', body: payload });
  btn.disabled = false;
  btn.textContent = 'Submit Vitals & Run AI Analysis';

  if (!res || !res.ok) {
    showToast('Failed to submit vitals', 'error');
    return;
  }

  const { vitals, ai } = res.data;
  showToast(`Vitals submitted! AI Score: ${ai.score}/100 — ${ai.status}`,
    ai.status === 'Critical' ? 'error' : ai.status === 'Risk' ? 'warning' : 'success');

  // Update live readings
  document.getElementById('liveHR').textContent = vitals.heartRate;
  document.getElementById('liveSpO2').textContent = vitals.spo2;
  document.getElementById('liveTemp').textContent = vitals.temperature;
  document.getElementById('liveBP').textContent = vitals.systolicBP ? `${vitals.systolicBP}/${vitals.diastolicBP}` : '—';

  // Show AI result
  const colors = { Normal: 'var(--status-normal)', Risk: 'var(--status-risk)', Critical: 'var(--status-critical)' };
  const color = colors[ai.status];
  document.getElementById('vitalsAiResult').style.display = 'block';
  document.getElementById('vitalsAiContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      ${getStatusBadge(ai.status)}
      <span style="font-size:22px;font-weight:800;color:${color}">${ai.score}<span style="font-size:14px;color:var(--text-muted)">/100</span></span>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">${ai.recommendation}</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${ai.reasons.map(r => `<div style="font-size:12px;color:var(--text-muted)">▸ ${r}</div>`).join('')}
    </div>
  `;

  updateAIRing(ai.score, ai.status, ai.reasons, ai.recommendation, new Date());
  loadVitalsHistory();
  loadTrendChart();
  e.target.reset();
}

// ═══════════════════════
// VITALS HISTORY
// ═══════════════════════
async function loadVitalsHistory() {
  const res = await apiRequest(`/vitals/${currentUser.id}?limit=10`);
  if (!res || !res.ok) return;

  const tbody = document.getElementById('vitalsTable');
  if (!res.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No vitals recorded yet</td></tr>';
    return;
  }

  tbody.innerHTML = res.data.map(v => `
    <tr>
      <td>${formatDateTime(v.recordedAt)}</td>
      <td>${v.heartRate} bpm</td>
      <td>${v.spo2}%</td>
      <td>${v.temperature}°F</td>
      <td>${v.systolicBP ? `${v.systolicBP}/${v.diastolicBP}` : '—'}</td>
      <td style="font-weight:700;color:${v.aiScore >= 70 ? 'var(--status-critical)' : v.aiScore >= 40 ? 'var(--status-risk)' : 'var(--status-normal)'}">${v.aiScore}</td>
      <td>${getStatusBadge(v.aiStatus)}</td>
    </tr>
  `).join('');
}

// ═══════════════════════
// MEDICATIONS
// ═══════════════════════
async function loadMedications() {
  const res = await apiRequest(`/medication/${currentUser.id}`);
  const list = document.getElementById('medicationList');
  const progress = document.getElementById('medProgress');

  if (!res || !res.ok || !res.data.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">💊</div><div class="empty-text">No medications prescribed yet</div></div>';
    return;
  }

  const meds = res.data;
  const taken = meds.filter(m => m.takenToday).length;
  progress.textContent = `${taken} / ${meds.length} taken`;
  progress.className = `badge ${taken === meds.length ? 'badge-normal' : 'badge-pending'}`;

  list.innerHTML = meds.map(m => `
    <div class="med-item ${m.takenToday ? 'taken' : ''}" id="med-${m._id}">
      <div class="med-check" onclick="markMedTaken('${m._id}')">
        ${m.takenToday ? '✓' : ''}
      </div>
      <div class="med-info">
        <div class="med-name">${m.name}</div>
        <div class="med-dosage">${m.dosage} • ${m.frequency}</div>
        ${m.instructions ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${m.instructions}</div>` : ''}
      </div>
      <div style="font-size:12px;color:var(--text-muted)">Dr. ${m.doctorId?.name || '—'}</div>
    </div>
  `).join('');
}

async function markMedTaken(id) {
  const res = await apiRequest(`/medication/${id}/taken`, { method: 'PUT' });
  if (res?.ok) {
    showToast('Medication marked as taken ✅', 'success');
    loadMedications();
  }
}

// ═══════════════════════
// REPORTS & EHR ARCHIVE
// ═══════════════════════
async function loadReports() {
  const list = document.getElementById('reportsList');
  let reports = [];

  // Fetch enhanced medical reports
  const res = await apiRequest('/medical-reports');
  if (res?.ok && res.data?.length > 0) {
    reports = res.data;
  } else {
    // Fallback to legacy reports endpoint
    const legacyRes = await apiRequest(`/reports/${currentUser.id}`);
    if (legacyRes?.ok) reports = legacyRes.data;
  }

  if (!reports.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No diagnostic or laboratory reports available yet</div></div>';
    return;
  }

  list.innerHTML = reports.map(r => `
    <div class="report-card" style="border:1px solid ${r.criticalStatus === 'Critical' ? 'rgba(255,71,87,0.4)' : 'var(--border)'}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="report-type-icon">${getReportEmoji(r.reportType || r.category)}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary)">
              ${r.reportType || 'Medical Report'}
            </div>
            <div style="font-size:12px;color:var(--text-muted)">
              ${r.category ? `<span class="badge-category" style="margin-right:6px">${r.category}</span>` : ''}
              ${r.labName || 'CareLink Laboratory'} • ${formatDate(r.testDate)} • <span class="badge-format">${r.fileFormat || 'PDF'}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${r.criticalStatus ? `<span class="badge ${r.criticalStatus === 'Critical' ? 'badge-critical' : (r.criticalStatus === 'Normal' ? 'badge-normal' : 'badge-risk')}">${r.criticalStatus}</span>` : ''}
          ${getStatusBadge(r.reportStatus || r.status)}
        </div>
      </div>

      <!-- Structured test results preview if present -->
      ${(r.structuredResults && r.structuredResults.length > 0) ? `
        <div style="margin-top:10px;background:var(--bg-card2);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:6px">📊 Quantitative Laboratory Metrics:</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
            ${r.structuredResults.map(p => `
              <div style="font-size:11px;background:rgba(255,255,255,0.03);padding:6px 8px;border-radius:4px">
                <div style="color:var(--text-muted)">${p.parameter}</div>
                <div style="font-weight:700;color:${p.status === 'Critical' ? 'var(--danger)' : (p.status === 'Normal' ? 'var(--primary)' : 'var(--warning)')}">
                  ${p.value} ${p.unit || ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- AI Clinical Analysis Preview -->
      ${r.aiAnalysis?.summary ? `
        <div style="background:rgba(0,212,170,0.06);border:1px solid rgba(0,212,170,0.18);border-radius:var(--radius-sm);padding:10px 12px;margin-top:10px">
          <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:2px">🤖 AI Non-Diagnostic Summary:</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${r.aiAnalysis.summary}</div>
        </div>
      ` : ''}

      ${r.patientNote ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px">📝 Your Note: "${r.patientNote}"</div>` : ''}
      ${r.doctorComment ? `
        <div style="background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-sm);padding:10px;font-size:12px;margin-top:8px">
          <div style="color:var(--secondary);font-weight:700;margin-bottom:2px">🩺 Doctor's Review:</div>
          <div style="color:var(--text-primary)">${r.doctorComment}</div>
        </div>` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04)">
        <div style="font-size:11px;color:var(--text-muted)">Uploaded: ${timeAgo(r.createdAt || r.uploadDate)}</div>
        <div style="display:flex;gap:8px">
          ${r.fileName ? `<a href="${API_BASE}/medical-reports/${r._id}/download" class="btn btn-ghost btn-sm" download>📥 Download File</a>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function uploadReport(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('reportType', document.getElementById('rType').value);
  formData.append('labName', document.getElementById('rLab').value);
  formData.append('testDate', document.getElementById('rDate').value);
  formData.append('patientNote', document.getElementById('rNote').value);
  const file = document.getElementById('rFile').files[0];
  if (file) formData.append('file', file);

  const res = await apiRequest('/reports/upload', {
    method: 'POST',
    body: formData
  });

  btn.disabled = false;
  btn.textContent = 'Upload Report';

  if (res?.ok) {
    showToast('Report uploaded successfully! Doctor will review soon.', 'success');
    e.target.reset();
    loadReports();
  } else {
    showToast(res?.data?.message || 'Upload failed', 'error');
  }
}

// ═══════════════════════
// DIET PLAN
// ═══════════════════════
async function loadDietPlan() {
  const res = await apiRequest(`/medication/diet/${currentUser.id}`);
  const container = document.getElementById('dietPlanContent');

  if (!res || !res.ok || !res.data) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🥗</div><div class="empty-text">No diet plan assigned yet.</div></div>';
    return;
  }

  const diet = res.data;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      ${diet.calories ? `<div class="stat-card" style="--card-text:var(--primary)"><div class="stat-icon">🔥</div><div class="stat-value">${diet.calories}</div><div class="stat-label">Daily Calories</div></div>` : ''}
      <div style="white-space:pre-line;font-size:14px;line-height:1.8;color:var(--text-secondary)">${diet.plan}</div>
      ${diet.notes ? `<div style="background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-md);padding:14px;font-size:13px;color:var(--text-secondary)"><strong style="color:var(--secondary)">📌 Doctor's Notes:</strong><br/>${diet.notes}</div>` : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOS EMERGENCY SYSTEM (MANUAL SOS, 3s HOLD / 5s COUNTDOWN, CONTACTS, TIMELINE)
// ═══════════════════════════════════════════════════════════════════════════════

let sosCountdownTimer = null;
let sosCountdownValue = 5;
let sosHoldStartTime = null;
let sosHoldAnimId = null;
const SOS_HOLD_DURATION = 3000; // 3 seconds
let activeEmergencyCaseId = null;
let healthWarningTimer = null;
let healthWarningCountdown = 15;
let pendingHealthWarningType = 'POSSIBLE_HEALTH_EMERGENCY';

let sosCooldownTimerId = null;
let isSosInCooldown = false;

/**
 * Opens the SOS Confirmation Modal with 3s hold & 5s auto-countdown
 */
function openSOSModal() {
  if (isSosInCooldown) {
    showToast('SOS alert was recently triggered. Please wait a moment before sending another.', 'warning');
    return;
  }
  
  const modal = document.getElementById('sosConfirmModal');
  if (!modal) return;

  modal.classList.remove('hidden');
  resetSOSHoldProgress();

  // Start 5-second auto countdown
  sosCountdownValue = 5;
  const numDisplay = document.getElementById('sosCountdownNumber');
  if (numDisplay) numDisplay.textContent = sosCountdownValue;

  if (sosCountdownTimer) clearInterval(sosCountdownTimer);
  sosCountdownTimer = setInterval(() => {
    sosCountdownValue--;
    if (numDisplay) numDisplay.textContent = Math.max(0, sosCountdownValue);
    if (sosCountdownValue <= 0) {
      clearInterval(sosCountdownTimer);
      sosCountdownTimer = null;
      executeSOSDispatch('MANUAL_SOS');
    }
  }, 1000);
}

function cancelSOSModal() {
  if (sosCountdownTimer) {
    clearInterval(sosCountdownTimer);
    sosCountdownTimer = null;
  }
  stopSOSHold();
  const modal = document.getElementById('sosConfirmModal');
  if (modal) modal.classList.add('hidden');
  showToast('Emergency SOS cancelled. No case created.', 'info');
}

/**
 * Interactive 3-second hold button logic with SVG progress circle
 */
function startSOSHold(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('sosHoldBtn');
  const hint = document.getElementById('sosHoldHint');
  if (btn) btn.classList.add('holding');
  if (hint) {
    hint.textContent = 'Keep holding...';
    hint.style.color = '#ff4d4d';
  }

  // Stop countdown if user is actively holding
  if (sosCountdownTimer) {
    clearInterval(sosCountdownTimer);
    sosCountdownTimer = null;
  }

  sosHoldStartTime = performance.now();
  const circle = document.getElementById('sosHoldProgressCircle');

  const step = (now) => {
    const elapsed = now - sosHoldStartTime;
    const progress = Math.min(1, elapsed / SOS_HOLD_DURATION);

    if (circle) {
      const offset = 440 - (440 * progress);
      circle.style.strokeDashoffset = offset;
    }

    if (progress >= 1) {
      // Completed 3-second hold
      stopSOSHold();
      executeSOSDispatch('MANUAL_SOS');
    } else {
      sosHoldAnimId = requestAnimationFrame(step);
    }
  };

  sosHoldAnimId = requestAnimationFrame(step);
}

function stopSOSHold(e) {
  if (sosHoldAnimId) {
    cancelAnimationFrame(sosHoldAnimId);
    sosHoldAnimId = null;
  }
  const btn = document.getElementById('sosHoldBtn');
  const hint = document.getElementById('sosHoldHint');
  if (btn) btn.classList.remove('holding');
  if (hint) {
    hint.textContent = 'Press and hold for 3 seconds to confirm';
    hint.style.color = 'var(--text-muted)';
  }
  resetSOSHoldProgress();
}

function resetSOSHoldProgress() {
  const circle = document.getElementById('sosHoldProgressCircle');
  if (circle) circle.style.strokeDashoffset = 440;
}

/**
 * Captures Geolocation with a 4-second timeout and graceful fallback
 */
async function capturePatientLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve({ isAvailable: false, latitude: null, longitude: null, address: 'Geolocation unsupported' });
    }

    const timer = setTimeout(() => {
      resolve({ isAvailable: false, latitude: null, longitude: null, address: 'Location request timed out' });
    }, 4000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          isAvailable: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
          timestamp: new Date(pos.timestamp || Date.now()),
          address: `GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
        });
      },
      (err) => {
        clearTimeout(timer);
        console.warn('[GEOLOCATION UNAVAILABLE]', err.message);
        resolve({ isAvailable: false, latitude: null, longitude: null, address: 'Location permission denied or unavailable' });
      },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 10000 }
    );
  });
}

/**
 * Dispatches SOS emergency request to backend
 */
async function executeSOSDispatch(emergencyType = 'MANUAL_SOS', customLocation = null) {
  if (sosCountdownTimer) {
    clearInterval(sosCountdownTimer);
    sosCountdownTimer = null;
  }
  const modal = document.getElementById('sosConfirmModal');
  if (modal) modal.classList.add('hidden');

  showToast('📡 Capturing location & dispatching emergency alert...', 'info');

  const locationData = customLocation || await capturePatientLocation();

  const payload = {
    emergencyType,
    location: locationData,
    recentHealthData: {
      source: 'Patient App SOS Button'
    }
  };

  try {
    isSosInCooldown = true;
    if (sosCooldownTimerId) clearTimeout(sosCooldownTimerId);
    sosCooldownTimerId = setTimeout(() => { isSosInCooldown = false; }, 30000);

    const res = await apiRequest('/emergency/sos', { method: 'POST', body: payload });
    if (res && res.ok) {
      const emg = res.data?.emergencyCase || res.data;
      activeEmergencyCaseId = emg._id;

      if (res.data?.isDuplicate) {
        showToast('ℹ️ You already have an active emergency case in progress.', 'warning');
        showSection('emergency', document.getElementById('navEmergency'));
        loadPatientEmergencySection();
        return;
      }

      // Display SOS Success Modal
      document.getElementById('sosSuccessId').textContent = emg.emergencyId || 'EMG-ACTIVE';
      document.getElementById('sosSuccessStatus').textContent = emg.status || 'ACTIVE';
      document.getElementById('sosSuccessLocation').textContent = emg.location?.isAvailable
        ? `📍 GPS Shared (${emg.location.latitude?.toFixed(4)}, ${emg.location.longitude?.toFixed(4)})`
        : '📍 Location Unavailable at Trigger Time';

      const successModal = document.getElementById('sosSuccessModal');
      if (successModal) successModal.classList.remove('hidden');

      showToast('🚨 SOS ALERT SENT! Emergency contacts, doctor, and hospital notified.', 'error');

      // Refresh emergency views
      loadPatientEmergencySection();
    } else {
      showToast(res?.message || 'Failed to dispatch SOS alert. Please call emergency services.', 'error');
    }
  } catch (err) {
    showToast(`Failed to dispatch SOS: ${err.message}`, 'error');
  }
}

function closeSOSSuccessModal() {
  const modal = document.getElementById('sosSuccessModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Load complete Patient Emergency section
 */
async function loadPatientEmergencySection() {
  await Promise.all([
    loadPatientActiveEmergency(),
    loadPatientEmergencyContacts(),
    loadEmergencyMedicalSummary(),
    loadPatientEmergencyHistory()
  ]);
}

/**
 * Loads currently active emergency case for this patient
 */
async function loadPatientActiveEmergency() {
  const res = await apiRequest('/emergency/active');
  const card = document.getElementById('patientActiveEmergencyCard');
  const body = document.getElementById('activeEmergencyBody');
  const topbarBtn = document.getElementById('sosBtn');

  if (!res || !res.ok || !res.data || !res.data.length) {
    if (card) card.classList.add('hidden');
    if (topbarBtn) {
      topbarBtn.textContent = '🚨 SOS';
      topbarBtn.style.animation = 'sos-pulse 2s infinite';
    }
    return;
  }

  const activeCase = res.data[0];
  activeEmergencyCaseId = activeCase._id;

  if (topbarBtn) {
    topbarBtn.textContent = `🚨 SOS (${activeCase.status})`;
    topbarBtn.style.animation = 'sos-pulse 0.8s infinite';
  }

  if (card && body) {
    card.classList.remove('hidden');
    document.getElementById('activeEmergencySub').textContent = `Emergency ID: ${activeCase.emergencyId} • Triggered ${formatDateTime(activeCase.triggeredAt)}`;
    
    const badge = document.getElementById('activeEmergencyStatusBadge');
    if (badge) {
      badge.className = `badge-status-${activeCase.status.toLowerCase().replace(/_/g, '-')}`;
      badge.textContent = activeCase.status;
    }

    const isLocationShared = activeCase.location?.isAvailable;
    const locationStr = isLocationShared
      ? (activeCase.location.address || `GPS: ${activeCase.location.latitude?.toFixed(4)}, ${activeCase.location.longitude?.toFixed(4)}`)
      : 'Current location is unavailable';

    body.innerHTML = `
      <div class="grid-2" style="gap:16px; margin-top:14px;">
        <div>
          <div style="font-size:12px; color:var(--text-muted);">Emergency Type / Priority</div>
          <div style="font-size:15px; font-weight:700; color:#ff4d4d; margin-top:2px;">
            ${activeCase.emergencyType} • <span class="priority-indicator-critical">${activeCase.priority}</span>
          </div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted);">Location Status</div>
          <div style="font-size:14px; font-weight:600; color:var(--primary); margin-top:2px;">
            📍 ${locationStr}
          </div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted);">Assigned Response Team</div>
          <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-top:2px;">
            ${activeCase.assignedEmergencyTeam?.teamName ? `🚑 ${activeCase.assignedEmergencyTeam.teamName} (${activeCase.assignedEmergencyTeam.vehicleType || 'Ambulance'})` : '⏳ Dispatching Emergency Team...'}
          </div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted);">Assigned Doctor</div>
          <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-top:2px;">
            🩺 ${activeCase.assignedDoctor?.name || 'On-Call ER Physician'}
          </div>
        </div>
      </div>

      <!-- Live Stepper Timeline -->
      <div style="margin-top:18px;">
        <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">
          ⏱️ Incident Timeline:
        </div>
        <div class="emergency-timeline">
          ${activeCase.timeline?.map(t => `
            <div class="timeline-event-item">
              <div class="timeline-event-dot ${t.event.includes('CANCEL') ? 'warning' : t.event.includes('RESOLVED') ? 'success' : 'danger'}">
                ${t.event.includes('CANCEL') ? '✕' : t.event.includes('RESOLVED') ? '✓' : '🚨'}
              </div>
              <div class="timeline-event-title">${t.event.replace(/_/g, ' ')}</div>
              <div class="timeline-event-msg">${t.message}</div>
              <div class="timeline-event-meta">${formatDateTime(t.timestamp)} • by ${t.performedByName || 'System'}</div>
            </div>
          `).join('') || '<div style="font-size:12px; color:var(--text-muted);">No timeline entries</div>'}
        </div>
      </div>
    `;
  }
}

/**
 * Loads emergency contacts list
 */
async function loadPatientEmergencyContacts() {
  const container = document.getElementById('patientEmergencyContactsList');
  if (!container) return;

  const res = await apiRequest('/emergency/contacts');
  if (!res || !res.ok || !res.data || !res.data.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <div class="empty-icon">👨‍👩‍👧</div>
        <div class="empty-text">No emergency contacts configured yet.</div>
        <button class="btn btn-primary btn-sm" onclick="openAddContactModal()" style="margin-top:10px;">+ Add Primary Contact</button>
      </div>
    `;
    return;
  }

  container.innerHTML = res.data.map(c => `
    <div class="emergency-contact-card ${c.isPrimary ? 'is-primary' : ''}">
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:15px; color:var(--text-primary);">${c.name}</strong>
          <span class="badge" style="background:rgba(255,255,255,0.06); font-size:11px;">${c.relationship}</span>
          ${c.isPrimary ? '<span class="badge badge-normal" style="font-weight:700;">★ PRIMARY</span>' : ''}
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
          📞 <strong>${c.phone}</strong> ${c.email ? `• ✉️ ${c.email}` : ''}
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        ${!c.isPrimary ? `<button class="btn btn-ghost btn-sm" onclick="setPrimaryEmergencyContact('${c._id}')" title="Set as Primary">★ Set Primary</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openEditContactModal('${c._id}', '${escapeHtml(c.name)}', '${escapeHtml(c.relationship)}', '${escapeHtml(c.phone)}', '${escapeHtml(c.email || '')}', '${c.priority || 'Secondary'}', ${Boolean(c.isPrimary)})">✏️ Edit</button>
        <button class="btn btn-ghost btn-sm" style="color:#ff6b6b;" onclick="deleteEmergencyContact('${c._id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function openAddContactModal() {
  document.getElementById('emergencyContactModalTitle').textContent = '👨‍👩‍👧 Add Emergency Contact';
  document.getElementById('contactEditId').value = '';
  document.getElementById('contactName').value = '';
  document.getElementById('contactRelationship').value = 'Family (Daughter / Son)';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactPriority').value = 'Secondary';
  document.getElementById('contactIsPrimary').checked = false;
  document.getElementById('emergencyContactModal').classList.remove('hidden');
}

function openEditContactModal(id, name, relationship, phone, email, priority, isPrimary) {
  document.getElementById('emergencyContactModalTitle').textContent = '✏️ Edit Emergency Contact';
  document.getElementById('contactEditId').value = id;
  document.getElementById('contactName').value = name;
  document.getElementById('contactRelationship').value = relationship || 'Family (Daughter / Son)';
  document.getElementById('contactPhone').value = phone;
  document.getElementById('contactEmail').value = email || '';
  document.getElementById('contactPriority').value = priority || 'Secondary';
  document.getElementById('contactIsPrimary').checked = Boolean(isPrimary);
  document.getElementById('emergencyContactModal').classList.remove('hidden');
}

function closeEmergencyContactModal() {
  document.getElementById('emergencyContactModal').classList.add('hidden');
}

async function handleSaveEmergencyContact(e) {
  e.preventDefault();
  const id = document.getElementById('contactEditId').value;
  const payload = {
    name: document.getElementById('contactName').value,
    relationship: document.getElementById('contactRelationship').value,
    phone: document.getElementById('contactPhone').value,
    email: document.getElementById('contactEmail').value,
    priority: document.getElementById('contactPriority').value,
    isPrimary: document.getElementById('contactIsPrimary').checked
  };

  const url = id ? `/emergency/contacts/${id}` : '/emergency/contacts';
  const method = id ? 'PUT' : 'POST';

  const res = await apiRequest(url, { method, body: payload });
  if (res && res.ok) {
    showToast(id ? 'Contact updated successfully' : 'Emergency contact added', 'success');
    closeEmergencyContactModal();
    loadPatientEmergencyContacts();
  } else {
    showToast(res?.message || 'Failed to save emergency contact', 'error');
  }
}

async function deleteEmergencyContact(id) {
  if (!confirm('Remove this emergency contact?')) return;
  const res = await apiRequest(`/emergency/contacts/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Contact removed', 'info');
    loadPatientEmergencyContacts();
  } else {
    showToast('Failed to remove contact', 'error');
  }
}

async function setPrimaryEmergencyContact(id) {
  const res = await apiRequest(`/emergency/contacts/${id}/primary`, { method: 'PUT' });
  if (res && res.ok) {
    showToast('Primary emergency contact updated ★', 'success');
    loadPatientEmergencyContacts();
  } else {
    showToast('Failed to set primary contact', 'error');
  }
}

/**
 * Loads emergency medical summary card
 */
async function loadEmergencyMedicalSummary() {
  const container = document.getElementById('emergencyMedicalInfoContainer');
  if (!container) return;

  const res = await apiRequest(`/patients/${currentUser.id}/lifetime-history`);
  if (!res || !res.ok) {
    container.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Failed to load profile.</div>';
    return;
  }

  const { patient, allergiesDetail, medicalConditionsDetail } = res.data;
  const blood = patient?.bloodGroup || 'O+';
  const location = patient?.roomLocation || 'Home';

  container.innerHTML = `
    <div class="grid-2" style="gap:14px; margin-bottom:14px;">
      <div style="background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border);">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Blood Group</div>
        <div style="font-size:18px; font-weight:800; color:#ff4d4d; margin-top:2px;">🩸 ${blood}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border);">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Default Location</div>
        <div style="font-size:14px; font-weight:700; color:var(--primary); margin-top:2px;">📍 ${location}</div>
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Known Allergies (High Caution):</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${allergiesDetail?.map(a => `
          <span class="badge" style="background:rgba(255,71,87,0.15); color:#ff6b6b; border:1px solid rgba(255,71,87,0.3);">
            ⚠️ ${a.name} (${a.severity})
          </span>
        `).join('') || '<span style="font-size:12px; color:var(--text-muted);">No critical drug allergies recorded</span>'}
      </div>
    </div>

    <div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Active Medical Conditions:</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${medicalConditionsDetail?.map(c => `
          <span class="badge" style="background:rgba(108,99,255,0.15); color:#a29bfe; border:1px solid rgba(108,99,255,0.3);">
            🩺 ${c.condition}
          </span>
        `).join('') || '<span style="font-size:12px; color:var(--text-muted);">None listed</span>'}
      </div>
    </div>
  `;
}

/**
 * Loads emergency case history
 */
async function loadPatientEmergencyHistory() {
  const container = document.getElementById('patientEmergencyHistoryList');
  if (!container) return;

  const res = await apiRequest('/emergency/history');
  if (!res || !res.ok || !res.data || !res.data.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-icon">✅</div><div class="empty-text">No past emergency incidents recorded.</div></div>';
    return;
  }

  container.innerHTML = res.data.map(h => `
    <div class="card" style="border-left: 3px solid ${h.status === 'CANCELLED' ? 'var(--text-muted)' : 'var(--status-normal)'}; padding:14px 18px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="font-size:14px; color:var(--text-primary);">${h.emergencyId}</strong>
            <span class="badge" style="background:rgba(255,255,255,0.06);">${h.emergencyType}</span>
            <span class="badge-status-${h.status.toLowerCase().replace(/_/g, '-')}">${h.status}</span>
          </div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
            Triggered: ${formatDateTime(h.triggeredAt)} ${h.resolvedAt ? `• Resolved: ${formatDateTime(h.resolvedAt)}` : ''}
          </div>
          ${h.cancellationReason ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Reason: ${h.cancellationReason}</div>` : ''}
        </div>
        <div style="font-size:12px; color:var(--text-muted);">
          📍 ${h.location?.address || (h.location?.isAvailable ? 'GPS Logged' : 'Unavailable')}
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Cancel SOS modal handlers
 */
function openCancelSOSModal() {
  const modal = document.getElementById('cancelSOSModal');
  if (modal) modal.classList.remove('hidden');
}

function closeCancelSOSModal() {
  const modal = document.getElementById('cancelSOSModal');
  if (modal) modal.classList.add('hidden');
}

async function submitCancelSOS(e) {
  e.preventDefault();
  if (!activeEmergencyCaseId) {
    showToast('No active emergency ID found', 'error');
    return;
  }

  const reason = document.getElementById('cancelReasonSelect').value;
  const notes = document.getElementById('cancelReasonNotes').value;
  const combinedReason = notes ? `${reason} — ${notes}` : reason;

  const res = await apiRequest(`/emergency/${activeEmergencyCaseId}/cancel`, {
    method: 'POST',
    body: { reason: combinedReason }
  });

  if (res && res.ok) {
    showToast('Emergency SOS cancelled. Notified parties updated.', 'info');
    closeCancelSOSModal();
    activeEmergencyCaseId = null;
    loadPatientEmergencySection();
  } else {
    showToast(res?.message || 'Failed to cancel SOS', 'error');
  }
}

/**
 * Health Warning & Fall Alert Modal Handlers (Non-Diagnostic Safety Compliance)
 */
function showHealthWarningModal({ type = 'POSSIBLE_HEALTH_EMERGENCY', title, message, details = '' }) {
  const modal = document.getElementById('healthWarningModal');
  if (!modal) return;

  pendingHealthWarningType = type;
  document.getElementById('hwModalIcon').textContent = type === 'FALL_ALERT' ? '🚨' : '⚠️';
  document.getElementById('hwModalTitle').textContent = title || (type === 'FALL_ALERT' ? 'Possible Fall Detected' : 'Possible Health Emergency Detected');
  document.getElementById('hwModalMessage').textContent = message || (type === 'FALL_ALERT' ? 'A hard fall event was detected. Are you okay?' : 'Unusual health readings detected. Please check how you are feeling.');
  document.getElementById('hwModalDetails').innerHTML = details ? `<div>${details}</div>` : '';

  modal.classList.remove('hidden');

  healthWarningCountdown = 15;
  const timerDisp = document.getElementById('hwCountdownSec');
  if (timerDisp) timerDisp.textContent = healthWarningCountdown;

  if (healthWarningTimer) clearInterval(healthWarningTimer);
  healthWarningTimer = setInterval(() => {
    healthWarningCountdown--;
    if (timerDisp) timerDisp.textContent = Math.max(0, healthWarningCountdown);
    if (healthWarningCountdown <= 0) {
      clearInterval(healthWarningTimer);
      healthWarningTimer = null;
      confirmHealthWarningSOS();
    }
  }, 1000);
}

function dismissHealthWarning() {
  if (healthWarningTimer) {
    clearInterval(healthWarningTimer);
    healthWarningTimer = null;
  }
  const modal = document.getElementById('healthWarningModal');
  if (modal) modal.classList.add('hidden');
  showToast('Health alert dismissed. Normal monitoring continuing.', 'success');
}

function confirmHealthWarningSOS() {
  if (healthWarningTimer) {
    clearInterval(healthWarningTimer);
    healthWarningTimer = null;
  }
  const modal = document.getElementById('healthWarningModal');
  if (modal) modal.classList.add('hidden');
  executeSOSDispatch(pendingHealthWarningType);
}

// Backwards compatibility
const triggerSOS = openSOSModal;


function getReportEmoji(type) {
  const map = { blood_test: '🩸', ecg: '💓', xray: '🦴', mri: '🧠', urine: '🧪', ct_scan: '🔬', other: '📄' };
  return map[type] || '📄';
}

// ═══════════════════════
// LIFETIME MEDICAL HISTORY & PROFILE
// ═══════════════════════
function toggleAddForm(cardId) {
  const card = document.getElementById(cardId);
  if (card) card.classList.toggle('hidden');
}

async function loadLifetimeMedicalHistory() {
  const res = await apiRequest(`/patients/${currentUser.id}/lifetime-history`);
  if (!res || !res.ok) {
    showToast('Failed to load medical history', 'error');
    return;
  }

  const { hospitalVisits, allergiesDetail, medicalConditionsDetail, patient } = res.data;

  // 1. Render Hospital Visits Timeline
  const visitsContainer = document.getElementById('hospitalVisitsTimeline');
  if (!hospitalVisits || !hospitalVisits.length) {
    visitsContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">🏥</div><div class="empty-text">No hospital admissions or visits recorded yet</div></div>';
  } else {
    visitsContainer.innerHTML = hospitalVisits.map(v => `
      <div class="card" style="border-left: 4px solid var(--primary); background: rgba(17,28,45,0.6);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${v.hospitalName}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              ${v.visitType} • ${formatDate(v.visitDate)} ${v.doctorName ? `• Attending: ${v.doctorName}` : ''}
            </div>
          </div>
          <span class="badge ${v.status === 'Discharged' ? 'badge-normal' : v.status === 'Admitted' ? 'badge-critical' : 'badge-reviewed'}">${v.status}</span>
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-top:10px;">
          <strong>Reason for Visit:</strong> ${v.reason}
        </div>
        ${v.diagnosis ? `<div style="font-size:13px; color:var(--primary); margin-top:4px;"><strong>Diagnosis:</strong> ${v.diagnosis}</div>` : ''}
        ${v.dischargeSummary ? `
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:var(--radius-sm); padding:10px; margin-top:8px; font-size:12px; color:var(--text-secondary);">
            <strong>Discharge Summary:</strong> ${v.dischargeSummary}
          </div>` : ''}
      </div>
    `).join('');
  }

  // 2. Render Allergies List
  const allergiesContainer = document.getElementById('allergiesListContainer');
  const allergies = allergiesDetail && allergiesDetail.length ? allergiesDetail : (patient?.allergies || []).map(a => ({ name: a, severity: 'Moderate', reaction: 'Reported allergy' }));

  if (!allergies.length) {
    allergiesContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No known drug/food allergies reported</div></div>';
  } else {
    const sevColors = { Mild: 'var(--status-normal)', Moderate: 'var(--status-risk)', Severe: '#ff4d4d', Critical: '#ff0055' };
    allergiesContainer.innerHTML = allergies.map(a => `
      <div style="background:rgba(255,77,77,0.08); border:1px solid rgba(255,77,77,0.2); border-radius:var(--radius-md); padding:12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:14px; font-weight:700; color:#ff6b6b">⚠️ ${a.name}</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Reaction: ${a.reaction || 'Hypersensitivity reaction'}</div>
        </div>
        <span class="badge" style="background:${sevColors[a.severity] || '#ff4d4d'}; color:#fff; font-weight:700;">${a.severity}</span>
      </div>
    `).join('');
  }

  // 3. Render Medical Conditions
  const conditionsContainer = document.getElementById('conditionsListContainer');
  const conditions = medicalConditionsDetail && medicalConditionsDetail.length ? medicalConditionsDetail : (patient?.medicalHistory || []).map(c => ({ condition: c, status: 'Active', diagnosedYear: '—' }));

  if (!conditions.length) {
    conditionsContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">🩺</div><div class="empty-text">No pre-existing conditions recorded</div></div>';
  } else {
    conditionsContainer.innerHTML = conditions.map(c => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:var(--radius-md); padding:12px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:14px; font-weight:700; color:var(--text-primary);">🩺 ${c.condition}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Diagnosed Year: ${c.diagnosedYear || '—'}</div>
        </div>
        <span class="badge ${c.status === 'Active' ? 'badge-critical' : c.status === 'Managed' ? 'badge-normal' : 'badge-risk'}">${c.status}</span>
      </div>
    `).join('');
  }
}

async function submitHospitalVisit(e) {
  e.preventDefault();
  const payload = {
    hospitalName: document.getElementById('hvHospital').value,
    visitType: document.getElementById('hvType').value,
    visitDate: document.getElementById('hvDate').value,
    doctorName: document.getElementById('hvDoctor').value,
    reason: document.getElementById('hvReason').value,
    diagnosis: document.getElementById('hvDiagnosis').value,
    dischargeSummary: document.getElementById('hvSummary').value
  };

  const res = await apiRequest(`/patients/${currentUser.id}/hospital-visit`, { method: 'POST', body: payload });
  if (res?.ok) {
    showToast('Hospital visit saved to lifetime record! 🏥', 'success');
    e.target.reset();
    toggleAddForm('visitFormCard');
    loadLifetimeMedicalHistory();
  } else {
    showToast('Failed to save hospital visit', 'error');
  }
}

async function submitAllergy(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('algName').value,
    severity: document.getElementById('algSeverity').value,
    reaction: document.getElementById('algReaction').value
  };

  const res = await apiRequest(`/patients/${currentUser.id}/allergies`, { method: 'POST', body: payload });
  if (res?.ok) {
    showToast('Allergy added to medical record! ⚠️', 'warning');
    e.target.reset();
    toggleAddForm('allergyFormCard');
    loadLifetimeMedicalHistory();
  } else {
    showToast('Failed to save allergy', 'error');
  }
}

async function submitCondition(e) {
  e.preventDefault();
  const payload = {
    condition: document.getElementById('condName').value,
    diagnosedYear: document.getElementById('condYear').value,
    status: document.getElementById('condStatus').value
  };

  const res = await apiRequest(`/patients/${currentUser.id}/medical-conditions`, { method: 'POST', body: payload });
  if (res?.ok) {
    showToast('Medical condition added to profile! 🩺', 'success');
    e.target.reset();
    toggleAddForm('conditionFormCard');
    loadLifetimeMedicalHistory();
  } else {
    showToast('Failed to save condition', 'error');
  }
}
