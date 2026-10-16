/**
 * lab.js — Laboratory Portal & Medical Report System Client-Side Logic
 */

let categoriesConfig = {};
let referenceRangesConfig = {};
let allPatients = [];
let allDoctors = [];
let allTestRequests = [];
let allSamples = [];
let allMedicalReports = [];
let activeCategoryFilter = '';
let selectedUploadFile = null;

// Standard templates for Structured Test Result Entry
const TEST_TEMPLATES = {
  'CBC': [
    { parameter: 'Hemoglobin', unit: 'g/dL', referenceRange: '12.0 - 17.5', value: '14.2' },
    { parameter: 'WBC', unit: '10^3/uL', referenceRange: '4.5 - 11.0', value: '7.8' },
    { parameter: 'RBC', unit: '10^6/uL', referenceRange: '4.0 - 5.9', value: '4.8' },
    { parameter: 'Platelets', unit: '10^3/uL', referenceRange: '150 - 450', value: '260' },
    { parameter: 'Hematocrit', unit: '%', referenceRange: '36 - 50', value: '42' }
  ],
  'Blood Sugar': [
    { parameter: 'Fasting Blood Glucose', unit: 'mg/dL', referenceRange: '70 - 99', value: '92' },
    { parameter: 'Postprandial Blood Glucose', unit: 'mg/dL', referenceRange: '90 - 140', value: '125' },
    { parameter: 'HbA1c', unit: '%', referenceRange: '4.0 - 5.6', value: '5.4' }
  ],
  'Lipid': [
    { parameter: 'Total Cholesterol', unit: 'mg/dL', referenceRange: '125 - 200', value: '175' },
    { parameter: 'HDL Cholesterol', unit: 'mg/dL', referenceRange: '40 - 60', value: '52' },
    { parameter: 'LDL Cholesterol', unit: 'mg/dL', referenceRange: '50 - 100', value: '94' },
    { parameter: 'Triglycerides', unit: 'mg/dL', referenceRange: '50 - 150', value: '120' }
  ],
  'LFT': [
    { parameter: 'ALT (SGPT)', unit: 'U/L', referenceRange: '7 - 56', value: '28' },
    { parameter: 'AST (SGOT)', unit: 'U/L', referenceRange: '10 - 40', value: '24' },
    { parameter: 'Total Bilirubin', unit: 'mg/dL', referenceRange: '0.2 - 1.2', value: '0.8' },
    { parameter: 'Serum Albumin', unit: 'g/dL', referenceRange: '3.5 - 5.0', value: '4.2' }
  ],
  'KFT': [
    { parameter: 'Serum Creatinine', unit: 'mg/dL', referenceRange: '0.6 - 1.2', value: '0.9' },
    { parameter: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', referenceRange: '7 - 20', value: '14' },
    { parameter: 'eGFR', unit: 'mL/min/1.73m²', referenceRange: '90 - 120', value: '105' },
    { parameter: 'Serum Potassium', unit: 'mEq/L', referenceRange: '3.5 - 5.0', value: '4.2' },
    { parameter: 'Serum Sodium', unit: 'mEq/L', referenceRange: '135 - 145', value: '140' }
  ],
  'Thyroid': [
    { parameter: 'TSH', unit: 'uIU/mL', referenceRange: '0.4 - 4.0', value: '2.1' },
    { parameter: 'Free T4', unit: 'ng/dL', referenceRange: '0.8 - 1.8', value: '1.2' },
    { parameter: 'Free T3', unit: 'pg/mL', referenceRange: '2.3 - 4.2', value: '3.1' }
  ]
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('lab');
  if (!user) return;
  initSidebar();

  setInterval(() => {
    const el = document.getElementById('currentDateTime');
    if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);

  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  if (document.getElementById('uploadTestDate')) document.getElementById('uploadTestDate').value = today;
  if (document.getElementById('uploadReportDate')) document.getElementById('uploadReportDate').value = today;
  if (document.getElementById('resultTestDate')) document.getElementById('resultTestDate').value = today;

  setupDragAndDrop();
  await loadCategoriesConfig();
  await loadPatientsAndDoctors();
  await loadDashboardData();
  await loadTestRequests();
  await loadSamples();
  await loadMedicalReports();
  await loadCriticalResults();
  await loadNotifications();

  // Initialize first structured result template
  loadTestPanelTemplate('CBC');
});

// ─── SECTION NAVIGATION ───────────────────────────────────────────────────────
function showSection(section, navEl) {
  document.querySelectorAll('section[id^="section-"]').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: ['🧪 Laboratory Dashboard', 'Real-time laboratory testing and medical report management system'],
    requests: ['📋 Test Request Management', 'Manage and process physician orders and diagnostic tests'],
    patients: ['🧑 Patient Search & EHR Directory', 'Patient medical histories and diagnostic archive'],
    samples: ['🧫 Sample Tracking & Management', 'Biospecimen collection, barcodes, and status pipelines'],
    results: ['📊 Structured Test Result Entry', 'Quantitative laboratory values with automated reference ranges'],
    upload: ['📤 Upload Medical Report', 'Multi-category report uploads with strict format validation'],
    reports: ['📄 Medical Report Management', 'Master archive of laboratory and diagnostic reports'],
    critical: ['⚠️ High-Urgency Critical Results Queue', 'Urgent physiological values requiring immediate review'],
    notifications: ['🔔 Laboratory Notifications', 'Recent alerts, physician orders, and escalations'],
    profile: ['👤 Staff Profile', 'Laboratory personnel credentials and facility details'],
    settings: ['⚙️ System Settings', 'Storage provider status and testing configuration']
  };

  if (document.getElementById('pageTitle') && titles[section]) {
    document.getElementById('pageTitle').textContent = titles[section][0];
    document.getElementById('pageSubtitle').textContent = titles[section][1];
  }

  // Section specific refresh
  if (section === 'dashboard') loadDashboardData();
  if (section === 'requests') loadTestRequests();
  if (section === 'samples') loadSamples();
  if (section === 'reports') loadMedicalReports();
  if (section === 'critical') loadCriticalResults();
  if (section === 'notifications') loadNotifications();
}

// ─── CONFIG & METADATA LOADER ────────────────────────────────────────────────
async function loadCategoriesConfig() {
  const res = await apiRequest('/medical-reports/config/categories');
  if (res?.ok) {
    categoriesConfig = res.data.categories || {};
    referenceRangesConfig = res.data.referenceRanges || {};
    if (document.getElementById('settingStorageDriver')) {
      document.getElementById('settingStorageDriver').value = `Active Driver: ${res.data.storageDriver.toUpperCase()} (/uploads)`;
    }
    populateCategoryDropdown();
  }
}

function populateCategoryDropdown() {
  const catSelect = document.getElementById('uploadCategory');
  if (!catSelect) return;
  onCategorySelect(catSelect.value || 'Laboratory');
}

function onCategorySelect(category) {
  const typeSelect = document.getElementById('uploadReportType');
  if (!typeSelect) return;

  const typeList = categoriesConfig[category] || [];
  if (typeList.length === 0) {
    typeSelect.innerHTML = '<option value="">-- No types available --</option>';
    return;
  }

  typeSelect.innerHTML = typeList.map(t => `<option value="${t.reportType}">${t.reportType}</option>`).join('');
  onReportTypeSelect(typeList[0].reportType);
}

function onReportTypeSelect(reportType) {
  const hintName = document.getElementById('hintReportTypeName');
  const hintPills = document.getElementById('hintAllowedPills');
  if (!hintName || !hintPills) return;

  hintName.textContent = reportType;

  // Find allowed formats for this type
  let formats = ['PDF', 'JPG', 'PNG'];
  for (const cat in categoriesConfig) {
    const item = categoriesConfig[cat].find(t => t.reportType === reportType);
    if (item && item.allowedFormats) {
      formats = item.allowedFormats;
      break;
    }
  }

  hintPills.innerHTML = formats.map(f => `<span class="badge-format">${f}</span>`).join(' ');

  // If a file is already selected, re-validate
  if (selectedUploadFile) {
    validateSelectedFile(selectedUploadFile, reportType);
  }
}

// ─── PATIENTS & DOCTORS LOADER ────────────────────────────────────────────────
async function loadPatientsAndDoctors() {
  const [pRes, dRes] = await Promise.all([
    apiRequest('/admin/users?role=patient'),
    apiRequest('/admin/users?role=doctor')
  ]);

  if (pRes?.ok) {
    allPatients = pRes.data;
    const patientOpts = '<option value="">-- Select Patient --</option>' +
      allPatients.map(p => `<option value="${p._id}">${p.name} (Age: ${p.age || '—'}, ${p.bloodGroup || 'N/A'})</option>`).join('');

    if (document.getElementById('uploadPatient')) document.getElementById('uploadPatient').innerHTML = patientOpts;
    if (document.getElementById('resultPatientSelect')) document.getElementById('resultPatientSelect').innerHTML = patientOpts;
    if (document.getElementById('reqPatientSelect')) document.getElementById('reqPatientSelect').innerHTML = patientOpts;
  }

  if (dRes?.ok) {
    allDoctors = dRes.data;
    const doctorOpts = '<option value="">-- Auto-assign (Patient\'s Doctor) --</option>' +
      allDoctors.map(d => `<option value="${d._id}">${d.name} (${d.specialization || 'General'})</option>`).join('');

    if (document.getElementById('uploadDoctor')) document.getElementById('uploadDoctor').innerHTML = doctorOpts;
  }
}

// ─── 1. DASHBOARD DATA ────────────────────────────────────────────────────────
async function loadDashboardData() {
  const res = await apiRequest('/lab/dashboard');
  if (!res?.ok) return;

  const data = res.data;
  const summary = data.summary || {};

  document.getElementById('statPendingTests').textContent = summary.pendingTests || 0;
  document.getElementById('statSamplesProcessing').textContent = summary.samplesProcessing || 0;
  document.getElementById('statReportsReady').textContent = summary.reportsReady || 0;
  document.getElementById('statCriticalResults').textContent = summary.criticalResults || 0;

  // Update badges in sidebar
  if (summary.pendingTests > 0) {
    const b = document.getElementById('requestsNavBadge');
    if (b) { b.textContent = summary.pendingTests; b.style.display = 'inline-flex'; }
  }
  if (summary.criticalResults > 0) {
    const cb = document.getElementById('criticalNavBadge');
    if (cb) { cb.textContent = summary.criticalResults; cb.style.display = 'inline-flex'; }
  }

  // Critical Alerts Banner
  const alertBanner = document.getElementById('dashCriticalAlertsBanner');
  if (data.criticalAlerts && data.criticalAlerts.length > 0) {
    alertBanner.style.display = 'block';
    alertBanner.innerHTML = `
      <div class="card" style="background:rgba(255,71,87,0.1);border:1.5px solid var(--danger);padding:14px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">🚨</span>
            <div>
              <div style="font-size:14px;font-weight:800;color:var(--danger)">High-Priority Critical Lab Alerts Active (${data.criticalAlerts.length})</div>
              <div style="font-size:12px;color:var(--text-secondary)">Immediate clinical review required for ${data.criticalAlerts.map(a => a.patientId?.name || 'Patient').join(', ')}</div>
            </div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="showSection('critical', document.getElementById('navCritical'))">
            Inspect Critical Queue →
          </button>
        </div>
      </div>
    `;
  } else {
    alertBanner.style.display = 'none';
  }

  // Sample Pipeline Counts
  const sampleStats = data.sampleStats || {};
  ['Requested', 'Collected', 'Received', 'Processing', 'Completed'].forEach(st => {
    const count = sampleStats[st] || 0;
    const el = document.getElementById(`ps-${st}`);
    if (el) el.textContent = count;
    const node = document.getElementById(`pnode-${st}`);
    if (node) {
      if (count > 0) node.classList.add('active');
      else node.classList.remove('active');
    }
  });

  // Recent Requests Table / Cards
  const reqContainer = document.getElementById('dashRecentRequests');
  if (!data.recentRequests || data.recentRequests.length === 0) {
    reqContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No recent test requests</div></div>';
  } else {
    reqContainer.innerHTML = data.recentRequests.map(r => `
      <div style="padding:10px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700">${r.testName} • ${r.patientId?.name || 'Patient'}</div>
          <div style="font-size:11px;color:var(--text-muted)">Dr. ${r.doctorId?.name || 'Attending'} • ${timeAgo(r.requestDate)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${getPriorityBadge(r.priority)}
          ${getStatusBadge(r.status)}
        </div>
      </div>
    `).join('');
  }

  // Recent Reports Table / Cards
  const repContainer = document.getElementById('dashRecentReports');
  if (!data.recentReports || data.recentReports.length === 0) {
    repContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-text">No recent reports uploaded</div></div>';
  } else {
    repContainer.innerHTML = data.recentReports.map(r => `
      <div style="padding:10px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:700">${getCategoryIcon(r.category)} ${r.reportType} • ${r.patientId?.name || 'Patient'}</div>
          <div style="font-size:11px;color:var(--text-muted)">${formatDate(r.testDate)} • <span class="badge-format">${r.fileFormat || 'MANUAL'}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${getCriticalBadge(r.criticalStatus)}
          <button class="btn btn-ghost btn-sm" onclick="openMedicalReportViewer('${r._id}')">👁️ View</button>
        </div>
      </div>
    `).join('');
  }
}

// ─── 2. TEST REQUESTS ─────────────────────────────────────────────────────────
async function loadTestRequests() {
  const res = await apiRequest('/lab/test-requests');
  if (!res?.ok) return;

  allTestRequests = res.data;
  renderTestRequests(allTestRequests);
}

function renderTestRequests(requests) {
  const tbody = document.getElementById('testRequestsTbody');
  if (!tbody) return;

  if (requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">No test requests found matching filters.</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(r => `
    <tr>
      <td><strong style="font-family:monospace;color:var(--primary)">${r.requestId}</strong></td>
      <td>
        <div style="font-weight:700">${r.patientId?.name || 'Patient'}</div>
        <div style="font-size:11px;color:var(--text-muted)">ID: ${r.patientId?._id?.substring(18) || '—'} • ${r.patientId?.gender || ''} ${r.patientId?.age ? `(${r.patientId.age}y)` : ''}</div>
      </td>
      <td>
        <div>Dr. ${r.doctorId?.name || 'Unassigned'}</div>
        <div style="font-size:11px;color:var(--text-muted)">${r.hospitalName || 'CareLink Hospital'}</div>
      </td>
      <td>
        <div>${getCategoryIcon(r.testCategory)} <strong>${r.testName}</strong></div>
        <span class="badge-category">${r.testCategory}</span>
      </td>
      <td style="font-size:12px">${formatDate(r.requestDate)}</td>
      <td>${getPriorityBadge(r.priority)}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td style="text-align:right">
        <div style="display:inline-flex;gap:4px">
          ${r.status === 'Pending' ? `
            <button class="btn btn-primary btn-sm" onclick="updateTestRequestStatus('${r._id}', 'Sample Collected')">🩸 Collect Sample</button>
          ` : ''}
          ${r.status === 'Sample Collected' ? `
            <button class="btn btn-warning btn-sm" onclick="updateTestRequestStatus('${r._id}', 'Processing')">⚙️ Process</button>
          ` : ''}
          ${r.status === 'Processing' ? `
            <button class="btn btn-primary btn-sm" onclick="openStructuredResultsForRequest('${r._id}')">📊 Enter Results</button>
          ` : ''}
          ${r.status !== 'Completed' && r.status !== 'Cancelled' ? `
            <button class="btn btn-ghost btn-sm" onclick="updateTestRequestStatus('${r._id}', 'Completed')">✅ Complete</button>
          ` : ''}
          ${r.reportId ? `
            <button class="btn btn-ghost btn-sm" onclick="openMedicalReportViewer('${r.reportId._id || r.reportId}')">📄 Report</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function filterTestRequests() {
  const search = (document.getElementById('requestSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('requestStatusFilter')?.value || '';
  const priority = document.getElementById('requestPriorityFilter')?.value || '';
  const category = document.getElementById('requestCategoryFilter')?.value || '';

  const filtered = allTestRequests.filter(r => {
    const matchSearch = !search ||
      (r.requestId && r.requestId.toLowerCase().includes(search)) ||
      (r.testName && r.testName.toLowerCase().includes(search)) ||
      (r.patientId?.name && r.patientId.name.toLowerCase().includes(search)) ||
      (r.doctorId?.name && r.doctorId.name.toLowerCase().includes(search));

    const matchStatus = !status || r.status === status;
    const matchPriority = !priority || r.priority === priority;
    const matchCategory = !category || r.testCategory === category;

    return matchSearch && matchStatus && matchPriority && matchCategory;
  });

  renderTestRequests(filtered);
}

async function updateTestRequestStatus(requestId, newStatus) {
  const res = await apiRequest(`/lab/test-requests/${requestId}/status`, {
    method: 'PUT',
    body: { status: newStatus }
  });

  if (res?.ok) {
    showToast(`Test request status updated to: ${newStatus}`, 'success');
    loadTestRequests();
    loadDashboardData();
  } else {
    showToast(res?.data?.message || 'Failed to update test request', 'error');
  }
}

function openNewTestRequestModal() {
  document.getElementById('newRequestModal').classList.remove('hidden');
}

function closeNewTestRequestModal() {
  document.getElementById('newRequestModal').classList.add('hidden');
}

async function handleCreateTestRequest(e) {
  e.preventDefault();
  const patientId = document.getElementById('reqPatientSelect').value;
  const testCategory = document.getElementById('reqCategorySelect').value;
  const priority = document.getElementById('reqPrioritySelect').value;
  const testName = document.getElementById('reqTestNameInput').value;
  const clinicalNotes = document.getElementById('reqNotesInput').value;

  const res = await apiRequest('/lab/test-requests', {
    method: 'POST',
    body: { patientId, testCategory, priority, testName, clinicalNotes }
  });

  if (res?.ok) {
    showToast('Test request created successfully!', 'success');
    closeNewTestRequestModal();
    e.target.reset();
    loadTestRequests();
    loadDashboardData();
  } else {
    showToast(res?.data?.message || 'Failed to create test request', 'error');
  }
}

function onReqCategoryChange(cat) {
  const nameInput = document.getElementById('reqTestNameInput');
  const defaults = {
    Laboratory: 'CBC Blood Test',
    Radiology: 'Chest X-Ray (PA View)',
    Cardiology: '12-Lead ECG / EKG',
    Neurology: 'EEG Brainwave Scan',
    Pathology: 'Histopathology Biopsy',
    Diagnostic: 'Pulmonary Function Test (PFT)',
    Clinical: 'Routine Physician Prescription'
  };
  if (nameInput) nameInput.value = defaults[cat] || '';
}

// ─── 3. PATIENT SEARCH ────────────────────────────────────────────────────────
async function searchPatients() {
  const q = document.getElementById('patientSearchQuery').value.trim();
  const container = document.getElementById('patientSearchResults');

  container.innerHTML = '<div class="loading-spinner"></div>';

  const res = await apiRequest(`/lab/patients/search?q=${encodeURIComponent(q)}`);
  if (!res?.ok) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-text">Failed to search patients</div></div>';
    return;
  }

  const results = res.data;
  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">No patients found matching your search.</div></div>';
    return;
  }

  container.innerHTML = results.map(p => `
    <div class="card" style="border:1px solid rgba(0,212,170,0.25)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:14px">
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--text-primary)">
            👤 ${p.name} <span style="font-size:13px;color:var(--text-secondary);font-weight:400">(ID: ${p._id})</span>
          </div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px">
            Age: <strong>${p.age || '—'}</strong> • Gender: <strong>${p.gender || '—'}</strong> • Blood Group: <strong>${p.bloodGroup || 'N/A'}</strong> • Phone: <strong>${p.phone || '—'}</strong>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
            👨‍⚕️ Assigned Doctor: <strong>Dr. ${p.assignedDoctor?.name || 'Unassigned'}</strong> (${p.assignedDoctor?.specialization || 'General'}) • Location: ${p.roomLocation || 'Home'}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="quickSelectPatientForUpload('${p._id}')">📤 Upload Report</button>
          <button class="btn btn-secondary btn-sm" onclick="quickSelectPatientForRequest('${p._id}')">+ Order Test</button>
        </div>
      </div>

      <!-- Previous Reports & Requests -->
      <div class="grid-2" style="gap:14px;background:var(--bg-card2);padding:12px;border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:6px">📋 Previous Reports (${p.previousReports?.length || 0})</div>
          ${(p.previousReports && p.previousReports.length > 0) ? p.previousReports.map(r => `
            <div style="font-size:11px;display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
              <span>${getCategoryIcon(r.category)} ${r.reportType}</span>
              <a href="#" onclick="openMedicalReportViewer('${r._id}'); return false;" style="color:var(--primary)">View</a>
            </div>
          `).join('') : '<div style="font-size:11px;color:var(--text-muted)">No previous reports recorded.</div>'}
        </div>

        <div>
          <div style="font-size:12px;font-weight:700;color:var(--secondary);margin-bottom:6px">🧪 Recent Test Requests (${p.recentRequests?.length || 0})</div>
          ${(p.recentRequests && p.recentRequests.length > 0) ? p.recentRequests.map(tr => `
            <div style="font-size:11px;display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
              <span>${tr.testName}</span>
              <span>${getStatusBadge(tr.status)}</span>
            </div>
          `).join('') : '<div style="font-size:11px;color:var(--text-muted)">No recent requests.</div>'}
        </div>
      </div>
    </div>
  `).join('');
}

function quickSelectPatientForUpload(patientId) {
  showSection('upload', document.getElementById('navUpload'));
  const sel = document.getElementById('uploadPatient');
  if (sel) {
    sel.value = patientId;
    onUploadPatientChange();
  }
}

function quickSelectPatientForRequest(patientId) {
  openNewTestRequestModal();
  const sel = document.getElementById('reqPatientSelect');
  if (sel) sel.value = patientId;
}

// ─── 4. SAMPLE MANAGEMENT ─────────────────────────────────────────────────────
async function loadSamples() {
  const res = await apiRequest('/lab/samples');
  if (!res?.ok) return;

  allSamples = res.data;
  renderSamples(allSamples);
}

function renderSamples(samples) {
  const tbody = document.getElementById('samplesTbody');
  if (!tbody) return;

  if (samples.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">No biospecimen samples found.</td></tr>';
    return;
  }

  tbody.innerHTML = samples.map(s => `
    <tr>
      <td>
        <strong style="font-family:monospace;color:var(--primary)">${s.sampleId}</strong>
        <div style="font-size:10px;font-family:monospace;color:var(--text-muted)">${s.barcode || '—'}</div>
      </td>
      <td>
        <div style="font-weight:700">${s.patientId?.name || 'Patient'}</div>
        <div style="font-size:11px;color:var(--text-muted)">ID: ${s.patientId?._id?.substring(18) || '—'}</div>
      </td>
      <td>
        ${s.testRequestId ? `
          <div style="font-size:12px;font-weight:600">${s.testRequestId.testName}</div>
          <div style="font-size:10px;color:var(--text-muted)">${s.testRequestId.requestId}</div>
        ` : '<span style="font-size:11px;color:var(--text-muted)">Direct Specimen</span>'}
      </td>
      <td><span class="badge badge-normal">${getSampleEmoji(s.sampleType)} ${s.sampleType}</span></td>
      <td style="font-size:12px">${formatDate(s.collectionDate)}</td>
      <td style="font-size:12px">${s.collectedBy || 'Lab Tech'}</td>
      <td>${getStatusBadge(s.status)}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="openSampleStatusModal('${s._id}')">⚙️ Update Status</button>
      </td>
    </tr>
  `).join('');
}

function filterSamples() {
  const search = (document.getElementById('sampleSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('sampleStatusFilter')?.value || '';
  const type = document.getElementById('sampleTypeFilter')?.value || '';

  const filtered = allSamples.filter(s => {
    const matchSearch = !search ||
      (s.sampleId && s.sampleId.toLowerCase().includes(search)) ||
      (s.barcode && s.barcode.toLowerCase().includes(search)) ||
      (s.patientId?.name && s.patientId.name.toLowerCase().includes(search));

    const matchStatus = !status || s.status === status;
    const matchType = !type || s.sampleType === type;

    return matchSearch && matchStatus && matchType;
  });

  renderSamples(filtered);
}

function openSampleStatusModal(sampleId) {
  const sample = allSamples.find(s => s._id === sampleId);
  if (!sample) return;

  document.getElementById('editSampleId').value = sample._id;
  document.getElementById('editSampleStatus').value = sample.status || 'Requested';
  document.getElementById('editSampleLocation').value = sample.storageLocation || '';
  document.getElementById('editSampleNotes').value = sample.notes || '';
  document.getElementById('sampleModalInfo').textContent = `Sample ID: ${sample.sampleId} (${sample.sampleType}) — Patient: ${sample.patientId?.name || 'Patient'}`;

  document.getElementById('sampleStatusModal').classList.remove('hidden');
}

function closeSampleModal() {
  document.getElementById('sampleStatusModal').classList.add('hidden');
}

async function handleUpdateSampleStatus(e) {
  e.preventDefault();
  const sampleId = document.getElementById('editSampleId').value;
  const status = document.getElementById('editSampleStatus').value;
  const storageLocation = document.getElementById('editSampleLocation').value;
  const notes = document.getElementById('editSampleNotes').value;

  const res = await apiRequest(`/lab/samples/${sampleId}`, {
    method: 'PUT',
    body: { status, storageLocation, notes }
  });

  if (res?.ok) {
    showToast('Sample status updated successfully!', 'success');
    closeSampleModal();
    loadSamples();
    loadDashboardData();
  } else {
    showToast(res?.data?.message || 'Failed to update sample', 'error');
  }
}

function openNewSampleModal() {
  const patientId = prompt('Enter Patient ID or choose from patient list:');
  if (!patientId) return;
  const sampleType = prompt('Enter Sample Type (Blood, Urine, Saliva, Tissue, Other):', 'Blood');
  if (!sampleType) return;

  apiRequest('/lab/samples', {
    method: 'POST',
    body: { patientId, sampleType }
  }).then(res => {
    if (res?.ok) {
      showToast('Sample registered successfully!', 'success');
      loadSamples();
    } else {
      showToast(res?.data?.message || 'Registration failed', 'error');
    }
  });
}

// ─── 5. STRUCTURED TEST RESULTS ──────────────────────────────────────────────
function loadTestPanelTemplate(templateKey) {
  const tbody = document.getElementById('parameterRowsTbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const rows = TEST_TEMPLATES[templateKey] || [
    { parameter: 'Parameter 1', unit: 'mg/dL', referenceRange: '10 - 50', value: '25' }
  ];

  rows.forEach(r => {
    addParameterRow(r.parameter, r.value, r.unit, r.referenceRange);
  });

  recalculateStructuredStatus();
}

function addParameterRow(param = '', val = '', unit = '', range = '') {
  const tbody = document.getElementById('parameterRowsTbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="form-input param-name" value="${param}" placeholder="e.g. Hemoglobin" required /></td>
    <td><input type="text" class="form-input param-val" value="${val}" placeholder="Value" oninput="recalculateStructuredStatus()" required /></td>
    <td><input type="text" class="form-input param-unit" value="${unit}" placeholder="Unit" /></td>
    <td><input type="text" class="form-input param-range" value="${range}" placeholder="Min - Max" /></td>
    <td><span class="param-status-badge badge badge-normal">Normal</span></td>
    <td><button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('tr').remove(); recalculateStructuredStatus();">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function recalculateStructuredStatus() {
  const rows = document.querySelectorAll('#parameterRowsTbody tr');
  let hasCritical = false;
  let hasAbnormal = false;
  const structured = [];

  rows.forEach(row => {
    const pName = row.querySelector('.param-name')?.value || '';
    const pValStr = row.querySelector('.param-val')?.value || '';
    const pVal = parseFloat(pValStr);
    const pUnit = row.querySelector('.param-unit')?.value || '';
    const pRange = row.querySelector('.param-range')?.value || '';
    const badge = row.querySelector('.param-status-badge');

    const config = referenceRangesConfig[pName];
    let status = 'Normal';

    if (!isNaN(pVal) && config) {
      if (config.criticalMin !== undefined && pVal <= config.criticalMin) {
        status = 'Critical';
      } else if (config.criticalMax !== undefined && pVal >= config.criticalMax) {
        status = 'Critical';
      } else if (pVal < config.normalMin) {
        status = 'Low';
      } else if (pVal > config.normalMax) {
        status = 'High';
      }
    }

    if (status === 'Critical') hasCritical = true;
    else if (status === 'Low' || status === 'High') hasAbnormal = true;

    if (badge) {
      badge.textContent = status;
      badge.className = `param-status-badge badge ${status === 'Critical' ? 'badge-critical' : (status === 'Normal' ? 'badge-normal' : 'badge-risk')}`;
    }

    structured.push({ parameter: pName, value: pValStr, unit: pUnit, referenceRange: pRange, status });
  });

  // AI Summary Preview Box
  const aiBox = document.getElementById('aiSummaryBox');
  const aiText = document.getElementById('aiSummaryText');
  if (aiBox && aiText) {
    aiBox.style.display = 'block';
    if (hasCritical) {
      aiText.innerHTML = `⚠️ <strong>Critical Threshold Flagged:</strong> One or more parameters exceed life-safety ranges. Immediate physician notification and critical alert dispatch will trigger upon submission.`;
    } else if (hasAbnormal) {
      aiText.innerHTML = `🟡 <strong>Out of Range:</strong> Values deviate from typical reference intervals. Clinical correlation recommended.`;
    } else {
      aiText.innerHTML = `🟢 <strong>Baseline Normal:</strong> All entered parameters fall within established standard ranges.`;
    }
  }

  return structured;
}

function onResultPatientChange() {
  const patientId = document.getElementById('resultPatientSelect').value;
  const reqSelect = document.getElementById('resultRequestSelect');
  if (!reqSelect) return;

  const pRequests = allTestRequests.filter(r => r.patientId?._id === patientId && r.status !== 'Completed');
  reqSelect.innerHTML = '<option value="">-- Direct Result Entry (New Report) --</option>' +
    pRequests.map(r => `<option value="${r._id}">${r.testName} (${r.requestId})</option>`).join('');
}

function onResultRequestChange() {
  const reqId = document.getElementById('resultRequestSelect').value;
  const request = allTestRequests.find(r => r._id === reqId);
  if (request) {
    const name = request.testName.toLowerCase();
    if (name.includes('cbc') || name.includes('blood count')) loadTestPanelTemplate('CBC');
    else if (name.includes('sugar') || name.includes('glucose') || name.includes('hba1c')) loadTestPanelTemplate('Blood Sugar');
    else if (name.includes('lipid') || name.includes('cholesterol')) loadTestPanelTemplate('Lipid');
    else if (name.includes('liver') || name.includes('lft')) loadTestPanelTemplate('LFT');
    else if (name.includes('kidney') || name.includes('kft') || name.includes('renal')) loadTestPanelTemplate('KFT');
    else if (name.includes('thyroid')) loadTestPanelTemplate('Thyroid');
  }
}

function openStructuredResultsForRequest(requestId) {
  showSection('results', document.getElementById('navResults'));
  const req = allTestRequests.find(r => r._id === requestId);
  if (req) {
    const pSelect = document.getElementById('resultPatientSelect');
    if (pSelect) {
      pSelect.value = req.patientId?._id || '';
      onResultPatientChange();
    }
    const rSelect = document.getElementById('resultRequestSelect');
    if (rSelect) rSelect.value = req._id;
    onResultRequestChange();
  }
}

async function handleSaveStructuredResults(e) {
  e.preventDefault();
  const patientId = document.getElementById('resultPatientSelect').value;
  const testRequestId = document.getElementById('resultRequestSelect').value;
  const templateType = document.getElementById('resultTemplateSelect').value;
  const testDate = document.getElementById('resultTestDate').value;
  const structuredResults = recalculateStructuredStatus();

  if (!patientId) {
    showToast('Please select a patient.', 'warning');
    return;
  }

  const reportType = templateType === 'Custom' ? 'Structured Test Panel' : `${templateType} Test Panel`;

  const btn = document.getElementById('btnSaveResults');
  btn.disabled = true;
  btn.textContent = 'Saving Results...';

  const formData = new FormData();
  formData.append('patientId', patientId);
  if (testRequestId) formData.append('testRequestId', testRequestId);
  formData.append('category', 'Laboratory');
  formData.append('reportType', reportType);
  formData.append('testDate', testDate);
  formData.append('structuredResults', JSON.stringify(structuredResults));
  formData.append('publishImmediately', 'true');

  const res = await apiRequest('/medical-reports/upload', {
    method: 'POST',
    body: formData
  });

  btn.disabled = false;
  btn.textContent = '💾 Save Structured Results & Update EHR';

  if (res?.ok) {
    showToast('Structured results saved and published to Lifetime EHR!', 'success');
    loadDashboardData();
    loadTestRequests();
    loadMedicalReports();
    loadCriticalResults();
    showSection('reports', document.getElementById('navReports'));
  } else {
    showToast(res?.data?.message || 'Failed to save results', 'error');
  }
}

// ─── 6. REPORT UPLOAD ────────────────────────────────────────────────────────
function setupDragAndDrop() {
  const dropzone = document.getElementById('uploadDropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) handleFileSelect(file);
  });
}

function handleFileSelect(file) {
  if (!file) return;
  selectedUploadFile = file;

  const reportType = document.getElementById('uploadReportType')?.value || '';
  validateSelectedFile(file, reportType);
}

function validateSelectedFile(file, reportType) {
  const card = document.getElementById('selectedFilePreview');
  const nameEl = document.getElementById('selFileName');
  const metaEl = document.getElementById('selFileMeta');
  const badgeEl = document.getElementById('selFileValidationBadge');

  if (!card) return;
  card.style.display = 'block';

  nameEl.textContent = file.name;
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  const ext = file.name.split('.').pop().toUpperCase();
  metaEl.textContent = `${ext} • ${sizeMb} MB`;

  // Find allowed formats
  let formats = [];
  for (const cat in categoriesConfig) {
    const item = categoriesConfig[cat].find(t => t.reportType === reportType);
    if (item && item.allowedFormats) {
      formats = item.allowedFormats;
      break;
    }
  }

  const isValidFormat = formats.length === 0 || formats.includes(ext) || (ext === 'JPEG' && formats.includes('JPG'));
  const isValidSize = file.size <= 50 * 1024 * 1024;

  if (!isValidFormat) {
    badgeEl.innerHTML = `<span class="badge badge-critical">❌ Invalid Format (${ext}). Requires: ${formats.join(', ')}</span>`;
  } else if (!isValidSize) {
    badgeEl.innerHTML = `<span class="badge badge-critical">❌ Exceeds 50MB Limit</span>`;
  } else {
    badgeEl.innerHTML = `<span class="badge badge-normal">✅ Valid Medical File</span>`;
  }
}

function onUploadPatientChange() {
  const patientId = document.getElementById('uploadPatient').value;
  const patient = allPatients.find(p => p._id === patientId);
  if (patient && patient.assignedDoctor) {
    const docSelect = document.getElementById('uploadDoctor');
    if (docSelect) docSelect.value = patient.assignedDoctor._id || patient.assignedDoctor;
  }
}

async function handleUploadReport(e) {
  e.preventDefault();
  const patientId = document.getElementById('uploadPatient').value;
  const doctorId = document.getElementById('uploadDoctor').value;
  const category = document.getElementById('uploadCategory').value;
  const reportType = document.getElementById('uploadReportType').value;
  const labName = document.getElementById('uploadLabName').value;
  const testDate = document.getElementById('uploadTestDate').value;
  const reportDate = document.getElementById('uploadReportDate').value;
  const patientNote = document.getElementById('uploadNotes').value;
  const publishImmediately = document.getElementById('uploadPublishImmediate').checked;
  const file = selectedUploadFile || document.getElementById('uploadFileInput')?.files[0];

  if (!file) {
    showToast('Please select a medical report file to upload.', 'warning');
    return;
  }

  const btn = document.getElementById('btnUploadSubmit');
  const progressContainer = document.getElementById('uploadProgressContainer');
  const progressBar = document.getElementById('uploadProgressBar');

  btn.disabled = true;
  btn.textContent = 'Validating & Uploading...';
  progressContainer.style.display = 'block';

  let p = 0;
  const progressTimer = setInterval(() => {
    p = Math.min(90, p + 15);
    progressBar.style.width = `${p}%`;
  }, 150);

  const formData = new FormData();
  formData.append('patientId', patientId);
  if (doctorId) formData.append('doctorId', doctorId);
  formData.append('category', category);
  formData.append('reportType', reportType);
  formData.append('labName', labName);
  formData.append('testDate', testDate);
  formData.append('reportDate', reportDate);
  formData.append('patientNote', patientNote);
  formData.append('publishImmediately', publishImmediately);
  formData.append('file', file);

  const res = await apiRequest('/medical-reports/upload', {
    method: 'POST',
    body: formData
  });

  clearInterval(progressTimer);
  progressBar.style.width = '100%';
  btn.disabled = false;
  btn.textContent = '📤 UPLOAD REPORT';

  setTimeout(() => {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
  }, 800);

  if (res?.ok) {
    showToast('Report uploaded & integrated into Patient Lifetime EHR!', 'success');
    e.target.reset();
    selectedUploadFile = null;
    document.getElementById('selectedFilePreview').style.display = 'none';
    loadDashboardData();
    loadMedicalReports();
    loadCriticalResults();
    showSection('reports', document.getElementById('navReports'));
  } else {
    showToast(res?.data?.message || 'Upload failed validation', 'error');
  }
}

// ─── 7. MEDICAL REPORTS MANAGEMENT ────────────────────────────────────────────
async function loadMedicalReports() {
  const res = await apiRequest('/medical-reports');
  if (!res?.ok) return;

  allMedicalReports = res.data;
  renderMedicalReports(allMedicalReports);
}

function renderMedicalReports(reports) {
  const tbody = document.getElementById('medicalReportsTbody');
  if (!tbody) return;

  if (reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">No medical reports in archive.</td></tr>';
    return;
  }

  tbody.innerHTML = reports.map(r => `
    <tr>
      <td><strong style="font-family:monospace;color:var(--primary)">${r.reportId}</strong></td>
      <td>
        <div style="font-weight:700">${r.patientId?.name || 'Patient'}</div>
        <div style="font-size:11px;color:var(--text-muted)">Dr. ${r.doctorId?.name || 'Assigned'}</div>
      </td>
      <td>
        <div>${getCategoryIcon(r.category)} <strong>${r.reportType}</strong></div>
        <span class="badge-category">${r.category}</span>
      </td>
      <td style="font-size:12px">${formatDate(r.testDate)}</td>
      <td><span class="badge-format">${r.fileFormat || 'PDF'}</span></td>
      <td>${getStatusBadge(r.reportStatus)}</td>
      <td>${getCriticalBadge(r.criticalStatus)}</td>
      <td style="text-align:right">
        <div style="display:inline-flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="openMedicalReportViewer('${r._id}')">👁️ View</button>
          ${r.fileName ? `<a href="${API_BASE}/medical-reports/${r._id}/download" class="btn btn-ghost btn-sm" download>📥</a>` : ''}
          ${r.reportStatus !== 'Published' ? `
            <button class="btn btn-primary btn-sm" onclick="publishReportToEhr('${r._id}')">🚀 Publish</button>
          ` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteReportConfirm('${r._id}', '${r.reportId}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterReportsByCategory(category) {
  activeCategoryFilter = category;
  document.querySelectorAll('#reportCategoryTabs .filter-pill').forEach(btn => {
    if (btn.textContent.includes(category) || (!category && btn.textContent === 'All Categories')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  filterMedicalReports();
}

function filterMedicalReports() {
  const search = (document.getElementById('reportSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('reportStatusSelect')?.value || '';
  const critical = document.getElementById('reportCriticalSelect')?.value || '';

  const filtered = allMedicalReports.filter(r => {
    const matchCat = !activeCategoryFilter || r.category === activeCategoryFilter;
    const matchSearch = !search ||
      (r.reportId && r.reportId.toLowerCase().includes(search)) ||
      (r.reportType && r.reportType.toLowerCase().includes(search)) ||
      (r.patientId?.name && r.patientId.name.toLowerCase().includes(search));

    const matchStatus = !status || r.reportStatus === status;
    const matchCritical = !critical || r.criticalStatus === critical;

    return matchCat && matchSearch && matchStatus && matchCritical;
  });

  renderMedicalReports(filtered);
}

async function publishReportToEhr(reportId) {
  const res = await apiRequest(`/medical-reports/${reportId}/publish`, { method: 'PUT' });
  if (res?.ok) {
    showToast('Report published to Patient Lifetime EHR & notifications dispatched!', 'success');
    loadMedicalReports();
    loadDashboardData();
  } else {
    showToast(res?.data?.message || 'Publish failed', 'error');
  }
}

async function deleteReportConfirm(reportId, code) {
  if (!confirm(`Are you sure you want to permanently delete Medical Report ${code}?`)) return;

  const res = await apiRequest(`/medical-reports/${reportId}`, { method: 'DELETE' });
  if (res?.ok) {
    showToast('Medical report removed.', 'info');
    loadMedicalReports();
    loadDashboardData();
  } else {
    showToast(res?.data?.message || 'Delete failed', 'error');
  }
}

// ─── 8. CRITICAL RESULTS QUEUE ────────────────────────────────────────────────
async function loadCriticalResults() {
  const res = await apiRequest('/lab/critical-results');
  if (!res?.ok) return;

  const data = res.data;
  const container = document.getElementById('criticalResultsList');

  if (!data.criticalReports || data.criticalReports.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No critical lab results pending clinical action. All clear.</div></div>';
    return;
  }

  container.innerHTML = data.criticalReports.map(r => `
    <div class="card" style="border:1.5px solid var(--danger);background:rgba(255,71,87,0.04)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:12px">
        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">🔴</span>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--danger)">${r.reportType} • ${r.patientId?.name || 'Patient'}</div>
              <div style="font-size:12px;color:var(--text-muted)">Report ID: ${r.reportId} • Date: ${formatDate(r.testDate)}</div>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="openMedicalReportViewer('${r._id}')">👁️ Inspect Full Report</button>
        </div>
      </div>

      <!-- Critical findings breakdown -->
      <div style="background:var(--bg-card2);padding:12px;border-radius:var(--radius-sm);border:1px solid rgba(255,71,87,0.3);margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;color:var(--danger);margin-bottom:4px">⚠️ Triggering Critical Metrics:</div>
        <div style="font-size:12px;color:var(--text-secondary)">
          ${(r.aiAnalysis?.abnormalFindings && r.aiAnalysis.abnormalFindings.length > 0)
            ? r.aiAnalysis.abnormalFindings.map(f => `<div>• ${f}</div>`).join('')
            : 'Critical thresholds exceeded in quantitative results.'}
        </div>
      </div>

      <div style="font-size:12px;color:var(--text-secondary);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span>👨‍⚕️ Attending: <strong>Dr. ${r.doctorId?.name || 'Physician'}</strong> (${r.doctorId?.phone || 'Emergency Contact'})</span>
        <span>🏥 Hospital Status: <strong>Emergency Ticket Logged</strong></span>
      </div>
    </div>
  `).join('');
}

// ─── 9. NOTIFICATIONS ─────────────────────────────────────────────────────────
async function loadNotifications() {
  const res = await apiRequest('/lab/notifications');
  if (!res?.ok) return;

  const container = document.getElementById('notificationsList');
  if (res.data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-text">No active notifications</div></div>';
    return;
  }

  container.innerHTML = res.data.map(n => `
    <div class="notif-card ${n.severity?.toLowerCase() || 'normal'}">
      <div style="font-size:20px">${n.severity === 'Critical' ? '🚨' : (n.severity === 'Warning' ? '⚠️' : '📋')}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${n.title}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${n.message}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${timeAgo(n.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

// ─── 10. MULTI-FORMAT REPORT VIEWER ───────────────────────────────────────────
async function openMedicalReportViewer(reportId) {
  const modal = document.getElementById('viewerModal');
  const box = document.getElementById('viewerContentBox');
  const structBox = document.getElementById('viewerStructuredResultsBox');
  const structTbody = document.getElementById('viewerStructuredTbody');
  const aiBox = document.getElementById('viewerAiAnalysisBox');
  const downloadBtn = document.getElementById('viewerDownloadBtn');

  box.innerHTML = '<div class="loading-spinner"></div>';
  structBox.style.display = 'none';
  aiBox.style.display = 'none';
  modal.classList.remove('hidden');

  const res = await apiRequest(`/medical-reports/${reportId}`);
  if (!res?.ok) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-text">Failed to load report</div></div>';
    return;
  }

  const r = res.data;
  document.getElementById('viewerTitle').textContent = `${r.reportType} (${r.reportId})`;
  document.getElementById('viewerSubtitle').textContent = `${r.patientId?.name || 'Patient'} • ${r.category} • ${formatDate(r.testDate)}`;
  document.getElementById('viewerIcon').textContent = getCategoryIcon(r.category);

  if (r.fileName) {
    downloadBtn.style.display = 'inline-flex';
    downloadBtn.href = `${API_BASE}/medical-reports/${r._id}/download`;
  } else {
    downloadBtn.style.display = 'none';
  }

  const format = (r.fileFormat || '').toUpperCase();
  const fileViewUrl = `${API_BASE}/medical-reports/${r._id}/view`;

  // 1. Render Multi-Format Content Box
  if (format === 'PDF') {
    box.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#000;height:480px">
        <iframe src="${fileViewUrl}" style="width:100%;height:100%;border:none;border-radius:8px"></iframe>
      </div>
    `;
  } else if (['PNG', 'JPG', 'JPEG', 'TIFF', 'TIF'].includes(format)) {
    box.innerHTML = `
      <div class="viewer-canvas-box">
        <img src="${fileViewUrl}" alt="Medical Diagnostic Image" style="max-height:420px;max-width:100%;object-fit:contain;border-radius:4px" />
      </div>
    `;
  } else if (format === 'DICOM') {
    box.innerHTML = `
      <div class="dicom-viewport">
        <div class="dicom-hud">
          <span>MODALITY: CT / MR / DX</span>
          <span>STUDY UID: ${r.reportId}-DICOM-001</span>
          <span>MATRIX: 512 x 512 x 16 bit</span>
        </div>
        <div class="viewer-canvas-box" style="background:#02050b;border-color:#1a2744">
          <div style="text-align:center">
            <div style="font-size:42px;margin-bottom:8px">🩻</div>
            <div style="font-size:14px;font-weight:700;color:var(--primary)">Integration-Ready DICOM Imaging Viewport</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Lossless Grayscale Window: L: 40, W: 400 (Soft Tissue Preset)</div>
          </div>
        </div>
        <div class="dicom-controls">
          <button class="dicom-btn">◀ Prev Slice</button>
          <button class="dicom-btn">Next Slice ▶</button>
          <button class="dicom-btn">Bone Window</button>
          <button class="dicom-btn">Lung Window</button>
          <button class="dicom-btn">Zoom + / -</button>
        </div>
      </div>
    `;
  } else if (format === 'EDF' || format === 'XML' || format === 'CSV') {
    box.innerHTML = `
      <div class="dicom-viewport">
        <div class="dicom-hud">
          <span>SIGNAL STREAM: 16 CHANNELS</span>
          <span>SAMPLING RATE: 256 Hz</span>
          <span>DURATION: 300s Continuous</span>
        </div>
        <canvas class="waveform-canvas" id="modalWaveformCanvas"></canvas>
      </div>
    `;
    setTimeout(() => drawWaveformPreview('modalWaveformCanvas'), 100);
  } else if (format === 'NIFTI') {
    box.innerHTML = `
      <div class="dicom-viewport">
        <div class="dicom-hud"><span>NIfTI-1 3D VOLUMETRIC SCAN</span><span>AFFINE MATRIX (4x4)</span></div>
        <div class="viewer-canvas-box" style="background:#02050b">
          <div style="text-align:center">
            <div style="font-size:40px;margin-bottom:6px">🧠</div>
            <div style="font-size:13px;color:var(--primary)">NIfTI 3D Multi-Planar Neuroimaging Visualizer Placeholder</div>
          </div>
        </div>
      </div>
    `;
  } else {
    box.innerHTML = `
      <div class="viewer-canvas-box">
        <div style="text-align:center">
          <div style="font-size:40px;margin-bottom:6px">📄</div>
          <div style="font-size:14px;font-weight:700">${r.originalFileName || r.reportType}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Format: ${format} • Size: ${(r.fileSize/1024).toFixed(1)} KB</div>
          ${r.fileName ? `<a href="${fileViewUrl}" target="_blank" class="btn btn-primary btn-sm" style="margin-top:12px">View Raw File</a>` : ''}
        </div>
      </div>
    `;
  }

  // 2. Render Structured Results Table
  if (r.structuredResults && r.structuredResults.length > 0) {
    structBox.style.display = 'block';
    structTbody.innerHTML = r.structuredResults.map(p => `
      <tr>
        <td><strong>${p.parameter}</strong></td>
        <td style="font-weight:700;color:${p.status === 'Critical' ? 'var(--danger)' : (p.status === 'Normal' ? 'var(--primary)' : 'var(--warning)')}">
          ${p.value}
        </td>
        <td>${p.unit || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted)">${p.referenceRange || '—'}</td>
        <td>${getCriticalBadge(p.status)}</td>
      </tr>
    `).join('');
  }

  // 3. Render AI Clinical Summary
  if (r.aiAnalysis && r.aiAnalysis.summary) {
    aiBox.style.display = 'block';
    document.getElementById('viewerAiSummary').textContent = r.aiAnalysis.summary;
    const bulletsEl = document.getElementById('viewerAbnormalBullets');
    if (r.aiAnalysis.abnormalFindings && r.aiAnalysis.abnormalFindings.length > 0) {
      bulletsEl.innerHTML = r.aiAnalysis.abnormalFindings.map(f => `<div>• ${f}</div>`).join('');
    } else {
      bulletsEl.innerHTML = '';
    }
  }
}

function closeViewerModal() {
  document.getElementById('viewerModal').classList.add('hidden');
}

function drawWaveformPreview(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  const width = canvas.width;
  const height = canvas.height;
  const mid = height / 2;

  for (let x = 0; x < width; x++) {
    const y = mid + Math.sin(x * 0.05) * 25 + Math.sin(x * 0.12) * 15;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ─── HELPERS & BADGES ─────────────────────────────────────────────────────────
function getCategoryIcon(cat) {
  const map = {
    Laboratory: '🩸',
    Radiology: '🩻',
    Cardiology: '❤️',
    Neurology: '🧠',
    Pathology: '🔬',
    Diagnostic: '🫁',
    Clinical: '🩺'
  };
  return map[cat] || '📄';
}

function getSampleEmoji(type) {
  const map = { Blood: '🩸', Urine: '🧪', Saliva: '💧', Tissue: '🔬', Other: '📄' };
  return map[type] || '🧫';
}

function getPriorityBadge(priority) {
  if (priority === 'Critical') return '<span class="badge-priority-critical">🔴 Critical</span>';
  if (priority === 'Urgent') return '<span class="badge-priority-urgent">🟡 Urgent</span>';
  return '<span class="badge-priority-normal">🟢 Normal</span>';
}

function getCriticalBadge(status) {
  if (status === 'Critical') return '<span class="badge badge-critical">🔴 Critical</span>';
  if (status === 'Abnormal' || status === 'Low' || status === 'High') return '<span class="badge badge-risk">🟡 Abnormal</span>';
  return '<span class="badge badge-normal">🟢 Normal</span>';
}
