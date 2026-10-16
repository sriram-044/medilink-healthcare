// Frontend configuration for MediLink AI
window.CareLinkFrontendConfig = {
  apiBaseUrl: '/api',
  authBaseUrl: '/auth',
  wsEndpoint: window.location.origin,
  roles: ['patient', 'doctor', 'hospital', 'admin', 'lab', 'pharmacy', 'insurance'],
  defaultRoute: '/index.html',
  version: '2.0.0'
};
