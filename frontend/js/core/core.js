// Core Shared Frontend Utilities for MediLink AI
window.MediLinkCore = window.MediLinkCore || {
  version: '1.0.0',
  formatDate: function(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  },
  showToast: function(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      console.log(`[${type || 'info'}] ${message}`);
    }
  }
};
