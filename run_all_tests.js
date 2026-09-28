const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const testFiles = [
  'test_step10_full_system.js',
  'test_step11_ai_security.js',
  'test_step12_real_llm.js',
  'test_step13_live_llm.js',
  'test_step14_rag.js',
  'test_step15_document_intelligence.js',
  'test_step16_realtime.js',
  'test_lab_system.js',
  'test_emergency_system.js',
  'test_emergency_routes.js'
];

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
  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of testFiles) {
    console.log(`\n========================================`);
    console.log(`Running ${file}...`);
    await resetRateLimit();

    try {
      const output = execSync(`node ${file}`, { cwd: 'd:/code/carelink', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      
      let passed = 0;
      let failed = 0;

      const passMatches = output.match(/Passed:\s*(\d+)/gi) || output.match(/PASSED:\s*(\d+)/gi);
      const failMatches = output.match(/Failed:\s*(\d+)/gi) || output.match(/FAILED:\s*(\d+)/gi);

      if (passMatches) {
        passed = parseInt(passMatches[passMatches.length - 1].split(':')[1].trim());
      } else {
        const altP = output.match(/(\d+) Passed/);
        if (altP) passed = parseInt(altP[1]);
        const altP2 = output.match(/passed:\s*(\d+)/);
        if (altP2) passed = parseInt(altP2[1]);
        const altP3 = output.match(/Total.*?(\d+).*?passed/i);
        if (altP3) passed = parseInt(altP3[1]);
        const altP4 = output.match(/TOTAL:\s*(\d+)\s*passed/);
        if (altP4) passed = parseInt(altP4[1]);
      }

      if (failMatches) {
        failed = parseInt(failMatches[failMatches.length - 1].split(':')[1].trim());
      } else {
        const altF = output.match(/(\d+) Failed/);
        if (altF) failed = parseInt(altF[1]);
        const altF2 = output.match(/failed:\s*(\d+)/);
        if (altF2) failed = parseInt(altF2[1]);
        const altF3 = output.match(/TOTAL:\s*\d+\s*passed,\s*(\d+)\s*failed/);
        if (altF3) failed = parseInt(altF3[1]);
      }

      console.log(`-> ${passed} Passed, ${failed} Failed`);
      totalPassed += passed;
      totalFailed += failed;
    } catch (err) {
      console.log(`Error running ${file}`);
      console.log(err.stdout || err.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`FINAL TALLY: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log(`========================================\n`);
}

run();
