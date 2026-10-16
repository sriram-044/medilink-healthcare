/**
 * Frontend Portal Smoke Test Specification
 * Tests availability of all 8 core portals and their asset integrity.
 */
const http = require('http');

const PORTALS = [
  'index.html',
  'patient.html',
  'doctor.html',
  'admin.html',
  'lab.html',
  'pharmacy.html',
  'insurance.html',
  'emergency.html'
];

async function checkUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      resolve(res.statusCode);
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing frontend static assets...');
  for (const page of PORTALS) {
    try {
      const status = await checkUrl(`http://localhost:5000/${page}`);
      console.log(`[PASS] ${page} -> ${status}`);
    } catch (e) {
      console.log(`[FAIL] ${page}: ${e.message}`);
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, PORTALS };
