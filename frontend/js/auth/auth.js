/**
 * auth.js — CareLink Shared Authentication Utilities (v2 — Cookie-Based)
 *
 * SECURITY MODEL:
 * - JWT is stored in an httpOnly cookie, set by the backend.
 * - JavaScript NEVER has access to the JWT.
 * - All API requests use credentials: 'include' so the browser automatically
 *   sends the httpOnly cookie with every request.
 * - User profile is cached in memory (currentUserCache) per page load.
 *   It is NOT persisted to localStorage or sessionStorage.
 * - Role is always authoritative from the backend (/api/auth/me).
 */

const IS_PROD = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const BACKEND_URL = IS_PROD ? 'https://carelink-api-3vzd.onrender.com' : '';
const API_BASE = `${BACKEND_URL}/api`;

// In-memory user cache for current page session only (not persisted to storage)
let _currentUserCache = null;

/**
 * Fetch the current authenticated user from the backend.
 * Returns the user object or null if not authenticated.
 * Result is cached for the duration of the page session.
 */
async function fetchCurrentUser() {
  if (_currentUserCache) return _currentUserCache;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include',  // Sends the httpOnly cookie automatically
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.authenticated && data.user) {
      _currentUserCache = data.user;
      return _currentUserCache;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Synchronous getter for cached user. Returns null if not yet fetched.
 * Use fetchCurrentUser() to load, then getUser() after.
 */
function getUser() {
  return _currentUserCache;
}

/**
 * Require authentication and optionally enforce a specific role (or roles).
 * This is an ASYNC guard — must be awaited.
 * Redirects to login if not authenticated or wrong role.
 *
 * @param {...string} allowedRoles  Zero or more role strings. Empty = any authenticated user.
 * @returns {Object|false}          User object on success, false on redirect.
 */
async function requireAuth(...allowedRoles) {
  const user = await fetchCurrentUser();
  if (!user) {
    window.location.href = IS_PROD ? 'https://carelink-health.netlify.app/index.html' : '/index.html';
    return false;
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // User is authenticated but wrong role — redirect to their correct portal
    redirectToPortal(user.role);
    return false;
  }
  
  // Initialize Real-Time WebSockets automatically for authorized users
  initRealtime();
  
  return user;
}

/**
 * Redirect user to their appropriate portal based on role.
 */
function redirectToPortal(role) {
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
  const base = IS_PROD ? 'https://carelink-health.netlify.app/' : '/';
  window.location.href = `${base}${portals[role] || 'index.html'}`;
}

/**
 * Logout: calls the backend to clear the httpOnly cookie server-side,
 * then clears the in-memory cache and redirects to login.
 */
async function logout() {
  _currentUserCache = null;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch {
    // Even if the request fails, clear local state and redirect
  }
  window.location.href = IS_PROD ? 'https://carelink-health.netlify.app/index.html' : '/index.html';
}

/**
 * Central API request helper.
 * Always uses credentials: 'include' so the httpOnly cookie is sent automatically.
 * No manual Authorization header needed — the cookie handles auth.
 */
async function apiRequest(endpoint, options = {}) {
  const defaultOptions = {
    credentials: 'include',  // Send httpOnly cookie automatically
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
  }

  if (options.body instanceof FormData) {
    delete defaultOptions.headers['Content-Type'];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...(options.headers || {}) }
  });

  if (response.status === 401) {
    _currentUserCache = null;
    logout();
    return null;
  }

  const json = await response.json();
  const isPaginated = json && typeof json === 'object' && Array.isArray(json.data) && json.pagination;
  const data = isPaginated ? json.data : json;
  return {
    ok: response.ok,
    status: response.status,
    data,
    pagination: isPaginated ? json.pagination : null,
    raw: json
  };
}

// ─── UI Utilities ─────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span style="font-size:18px">${icons[type] || 'ℹ️'}</span><span style="flex:1">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function getStatusBadge(status) {
  const map = {
    'Critical': 'badge-critical',
    'Risk': 'badge-risk',
    'Normal': 'badge-normal',
    'Pending': 'badge-pending',
    'Flagged': 'badge-flagged',
    'Reviewed': 'badge-reviewed',
    'SOS': 'badge-critical'
  };
  const icons = {
    'Critical': '🔴', 'Risk': '🟡', 'Normal': '🟢',
    'Pending': '⏳', 'Flagged': '🚩', 'Reviewed': '✅', 'SOS': '🚨'
  };
  return `<span class="badge ${map[status] || 'badge-normal'}">${icons[status] || ''} ${status}</span>`;
}

function getReportTypeLabel(type) {
  const map = {
    blood_test: '🩸 Blood Test',
    ecg: '💓 ECG',
    xray: '🦴 X-Ray',
    mri: '🧠 MRI',
    urine: '🧪 Urine Test',
    ct_scan: '🔬 CT Scan',
    other: '📄 Report'
  };
  return map[type] || '📄 Report';
}

function initSidebar(activeId) {
  const user = getUser();
  if (!user) return;

  const avatarEl = document.getElementById('sidebarAvatar');
  const nameEl = document.getElementById('sidebarName');
  const roleEl = document.getElementById('sidebarRole');

  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;

  if (activeId) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    const active = document.getElementById(activeId);
    if (active) active.classList.add('active');
  }
}

let socket = null;

function initRealtime() {
  if (socket) return; // already initialized
  
  const script = document.createElement('script');
  script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
  script.onload = () => {
    socket = io(BACKEND_URL, {
      withCredentials: true
    });
    
    socket.on('connect', () => {
      console.log('Real-time notifications connected.');
    });
    
    socket.on('notification', (payload) => {
      const type = payload.severity === 'Critical' ? 'error' : (payload.severity === 'Warning' ? 'warning' : 'info');
      showToast(`<strong>${payload.title}</strong><br/>${payload.message}`, type);
      
      // Optionally trigger a custom event that pages can listen to for UI updates (like fetching new reports)
      window.dispatchEvent(new CustomEvent('carelink:notification', { detail: payload }));
    });
    
    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });
  };
  document.head.appendChild(script);
}
