document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth('insurance');
  if (!user) return;
  initSidebar();
  loadInsuranceClaims();
});

async function loadInsuranceClaims() {
  const res = await apiRequest('/insurance/claims');
  const container = document.getElementById('claimsList');
  if (!res || !res.ok || !res.data.length) {
    if (container) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛡️</div><div class="empty-text">No active insurance claims submitted</div></div>';
    }
    return;
  }

  const claims = res.data;
  const pending = claims.filter(c => c.status === 'Pending').length;
  const approved = claims.filter(c => c.status === 'Approved').length;
  const rejected = claims.filter(c => c.status === 'Rejected').length;

  const totalEl = document.getElementById('statTotalClaims');
  const pendEl = document.getElementById('statPendingClaims');
  const appEl = document.getElementById('statApprovedClaims');
  const rejEl = document.getElementById('statRejectedClaims');

  if (totalEl) totalEl.textContent = claims.length;
  if (pendEl) pendEl.textContent = pending;
  if (appEl) appEl.textContent = approved;
  if (rejEl) rejEl.textContent = rejected;

  if (container) {
    container.innerHTML = claims.map(c => `
      <div class="card" style="background:rgba(17,28,45,0.6); border-left:4px solid ${c.status === 'Approved' ? 'var(--status-normal)' : c.status === 'Rejected' ? 'var(--danger)' : 'var(--warning)'}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:16px; font-weight:700; color:var(--text-primary);">
              Claim #${c.claimId} — <span style="color:var(--primary)">₹${c.claimAmount?.toLocaleString('en-IN')}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              Policy #: <strong>${c.policyNumber}</strong> • Hospital: <strong>${c.hospitalName}</strong>
            </div>
            <div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
              Patient: <strong>${c.patientId?.name || 'Unknown'}</strong> (Age ${c.patientId?.age || '—'})
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
              Treatment: "${c.treatmentDescription || 'Hospital admission & medical workup'}"
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
            <span class="badge ${c.status === 'Approved' ? 'badge-normal' : c.status === 'Rejected' ? 'badge-critical' : 'badge-pending'}">${c.status}</span>
            ${c.status === 'Pending' ? `
              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm" onclick="reviewClaim('${c._id}','Approved')">✅ Approve Claim</button>
                <button class="btn btn-danger btn-sm" onclick="reviewClaim('${c._id}','Rejected')">❌ Reject Claim</button>
              </div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }
}

async function reviewClaim(id, status) {
  let reason = '';
  if (status === 'Rejected') {
    reason = prompt('Enter rejection reason for policy holder:') || 'Incomplete documentation';
  }
  const res = await apiRequest(`/insurance/claims/${id}/review`, {
    method: 'PUT',
    body: { status, rejectionReason: reason }
  });
  if (res?.ok) {
    showToast(`Insurance claim ${status} successfully! 🛡️`, status === 'Approved' ? 'success' : 'warning');
    loadInsuranceClaims();
  } else {
    showToast('Failed to update claim status', 'error');
  }
}

window.loadInsuranceClaims = loadInsuranceClaims;
window.reviewClaim = reviewClaim;
