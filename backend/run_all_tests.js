/**
 * CareLink Backend — Test Suite Runner Entrypoint
 * Forwards execution to the categorized test runner in tests/run_all_tests.js
 */
'use strict';

const { run, testSuites } = require('./tests/run_all_tests');

if (require.main === module) {
  run();
}

module.exports = { run, testSuites };
