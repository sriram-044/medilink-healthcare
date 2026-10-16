const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const testSuites = {
  unit: [
    'unit/test_autofill_and_login.js',
    'unit/test_wearable_simulator_simplification.js',
    'unit/test_step15_document_intelligence.js'
  ],
  integration: [
    'integration/test_emergency_routes.js',
    'integration/test_location_and_hospitals.js',
    'integration/test_lab_system.js',
    'integration/test_server_routes.js',
    'integration/test_step12_real_llm.js',
    'integration/test_step13_live_llm.js',
    'integration/test_step14_rag.js',
    'integration/test_step16_realtime.js'
  ],
  security: [
    'security/test_step2_file_security.js',
    'security/test_step3_lab_notification.js',
    'security/test_step4_csp_security.js',
    'security/test_step5_secrets_security.js',
    'security/test_step6_mongodb_queries.js',
    'security/test_step7_mongodb_indexes.js',
    'security/test_step8_pagination.js',
    'security/test_step9_error_handling.js',
    'security/test_step11_ai_security.js'
  ],
  regression: [
    'regression/test_step10_full_system.js',
    'regression/test_emergency_system.js',
    'regression/test_emergency_sos_architecture.js',
    'regression/test_emergency_dashboard_redesign.js',
    'regression/test_patient_emergency_ui_verification.js'
  ]
};

async function resetRateLimit() {
  return new Promise((resolve) => {
    const req = http.request('http://localhost:5000/api/__test/reset-rate-limit', { method: 'POST' }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', resolve);
    req.end();
  });
}

async function run() {
  console.log('========================================================');
  console.log('MediLink AI — Categorized Test Suite Runner');
  console.log('========================================================');

  for (const [category, files] of Object.entries(testSuites)) {
    console.log(`\n>>> Running Category: [${category.toUpperCase()}] (${files.length} suites) <<<`);
    for (const file of files) {
      await resetRateLimit();
      try {
        console.log(`Running: ${file}...`);
        const out = execSync(`node ${path.basename(file)}`, {
          cwd: path.join(__dirname, path.dirname(file)),
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        console.log(`  -> Passed ✅`);
      } catch (err) {
        console.error(`  -> Failed ❌: ${err.message}`);
      }
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, testSuites };
