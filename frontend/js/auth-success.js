/**
 * SECURITY: This page NEVER reads a token from the URL.
 * The httpOnly auth cookie was already set by the backend before redirecting here.
 * We simply call /api/auth/me — the browser sends the cookie automatically.
 */
(async function () {
  const IS_PROD = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const BACKEND_URL = IS_PROD ? 'https://carelink-api-3vzd.onrender.com' : '';

  // Safety check: if someone lands here with ?error= param from OAuth failure
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) {
    const statusEl = document.getElementById('authStatus');
    if (statusEl) statusEl.textContent = '❌ Google sign-in failed. Redirecting...';
    setTimeout(() => window.location.href = '/?error=1', 2000);
    return;
  }

  try {
    // Fetch the current user using the httpOnly cookie set by the backend
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',  // Sends the httpOnly cookie automatically
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const statusEl = document.getElementById('authStatus');
      if (statusEl) statusEl.textContent = '❌ Authentication failed. Redirecting...';
      setTimeout(() => window.location.href = '/', 2000);
      return;
    }

    const data = await res.json();
    if (!data.authenticated || !data.user) {
      const statusEl = document.getElementById('authStatus');
      if (statusEl) statusEl.textContent = '❌ Session invalid. Redirecting...';
      setTimeout(() => window.location.href = '/', 2000);
      return;
    }

    const user = data.user;
    const statusEl = document.getElementById('authStatus');
    if (statusEl) statusEl.textContent = `✅ Welcome, ${user.name}! Redirecting...`;

    // Redirect to the correct portal based on server-authoritative role
    setTimeout(() => {
      const portals = {
        patient:   'patient.html',
        doctor:    'doctor.html',
        admin:     'admin.html',
        lab:       'lab.html',
        pharmacy:  'pharmacy.html',
        insurance: 'insurance.html',
        emergency: 'emergency.html',
        hospital:  'admin.html'
      };
      window.location.href = portals[user.role] || 'index.html';
    }, 800);

  } catch (e) {
    const statusEl = document.getElementById('authStatus');
    if (statusEl) statusEl.textContent = '❌ Something went wrong. Redirecting...';
    setTimeout(() => window.location.href = '/', 2000);
  }
})();
