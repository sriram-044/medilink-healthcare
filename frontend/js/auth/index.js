// Demonstration credentials for interactive testing & demo access
const DEMO_CREDENTIALS = {
  patient:  { email: 'ravi@demo.com',     password: 'demo123' },
  doctor:   { email: 'doctor@demo.com',   password: 'demo123' },
  hospital: { email: 'hospital@demo.com', password: 'demo123' },
  admin:    { email: 'admin@demo.com',    password: 'demo123' }
};

let selectedRole = 'patient';

function googleLogin() {
  const BACKEND = IS_PROD ? 'https://carelink-api-3vzd.onrender.com' : '';
  window.location.href = `${BACKEND}/auth/google`;
}

function selectRole(role, btn) {
  selectedRole = role;

  // Visual highlight: update active portal button styling
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
  const targetBtn = btn || document.querySelector(`.role-btn[data-role="${role}"]`);
  if (targetBtn) targetBtn.classList.add('selected');

  // Autofill demo credentials for the selected portal
  const creds = DEMO_CREDENTIALS[role];
  if (creds) {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    if (emailInput) emailInput.value = creds.email;
    if (passwordInput) passwordInput.value = creds.password;
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  if (btnText) btnText.textContent = 'Signing in...';
  if (btn) btn.disabled = true;

  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',  // Receive the httpOnly cookie from the backend
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Login failed', 'error');
      if (btnText) btnText.textContent = 'Sign In to Portal';
      if (btn) btn.disabled = false;
      return;
    }

    // JWT is now in an httpOnly cookie — we never store it in JavaScript.
    const user = data.user;
    const actualRole = user.role;

    if (selectedRole && actualRole !== selectedRole) {
      showToast(`⚠️ Your account is a "${actualRole}" — redirecting to the correct portal.`, 'warning');
    } else {
      showToast('Welcome back, ' + user.name + '!', 'success');
    }

    setTimeout(() => redirectToPortal(actualRole), 1200);
  } catch (err) {
    showToast('Connection error. Is the server running?', 'error');
    if (btnText) btnText.textContent = 'Sign In to Portal';
    if (btn) btn.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Expose on window for attribute compatibility
window.googleLogin = googleLogin;
window.selectRole = selectRole;
window.handleLogin = handleLogin;
window.showToast = showToast;

// Modern DOM event listener binding
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  const googleBtn = document.getElementById('googleSignInBtn');
  if (googleBtn) {
    googleBtn.addEventListener('click', googleLogin);
  }
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const role = this.getAttribute('data-role');
      if (role) selectRole(role, this);
    });
  });

  // Autofill initial portal (Patient) demo credentials on page load
  const initialBtn = document.querySelector('.role-btn.selected') || document.querySelector('.role-btn[data-role="patient"]');
  selectRole('patient', initialBtn);
});

// If already authenticated (cookie present), redirect to appropriate portal
(async () => {
  const user = await fetchCurrentUser();
  if (user) {
    redirectToPortal(user.role);
  }
})();
