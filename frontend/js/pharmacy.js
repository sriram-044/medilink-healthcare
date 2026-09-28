document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('pharmacy');
  if (!user) return;
  initSidebar();
  loadPharmacyPrescriptions();
});

async function loadPharmacyPrescriptions() {
  const res = await apiRequest('/pharmacy/prescriptions');
  const container = document.getElementById('prescriptionsList');
  if (!res || !res.ok || !res.data.length) {
    if (container) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">💊</div><div class="empty-text">No active prescriptions in queue</div></div>';
    }
    return;
  }

  const meds = res.data;
  const dispensed = meds.filter(m => m.takenToday).length;
  const pending = meds.length - dispensed;

  const totalEl = document.getElementById('statTotalMeds');
  const dispEl = document.getElementById('statDispensed');
  const pendEl = document.getElementById('statPending');

  if (totalEl) totalEl.textContent = meds.length;
  if (dispEl) dispEl.textContent = dispensed;
  if (pendEl) pendEl.textContent = pending;

  if (container) {
    container.innerHTML = meds.map(m => `
      <div class="card" style="background:rgba(17,28,45,0.6); border-left:4px solid ${m.takenToday ? 'var(--status-normal)' : 'var(--warning)'}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${m.name} <span style="font-size:13px; color:var(--primary)">(${m.dosage})</span></div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              Patient: <strong>${m.patientId?.name || 'Unknown'}</strong> (Room/Location: ${m.patientId?.roomLocation || 'Home'})
            </div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
              Frequency: <strong>${m.frequency}</strong> ${m.instructions ? `• Instructions: "${m.instructions}"` : ''}
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
              Prescribed by: 🩺 Dr. ${m.doctorId?.name || 'Attending Physician'}
            </div>
          </div>
          <div>
            ${m.takenToday ? 
              '<span class="badge badge-normal">✅ Dispensed & Sync\'d</span>' : 
              `<button class="btn btn-primary btn-sm" onclick="dispenseMed('${m._id}')">💊 Dispense Medicine</button>`}
          </div>
        </div>
      </div>
    `).join('');
  }
}

async function dispenseMed(id) {
  const res = await apiRequest(`/pharmacy/dispense/${id}`, { method: 'PUT' });
  if (res?.ok) {
    showToast('Medication dispensed & logged to patient app! 💊', 'success');
    loadPharmacyPrescriptions();
  } else {
    showToast('Failed to dispense medication', 'error');
  }
}

window.loadPharmacyPrescriptions = loadPharmacyPrescriptions;
window.dispenseMed = dispenseMed;
