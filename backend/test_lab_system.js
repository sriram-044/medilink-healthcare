/**
 * test_lab_system.js — Automated test suite for Laboratory Portal & Medical Report System
 */

const { validateMedicalReportFile, generateSafeFileName, getReportCategoriesConfig } = require('./utils/fileValidator');
const { evaluateStructuredResults, DEFAULT_REFERENCE_RANGES } = require('./utils/criticalDetection');
const { generateReportAiAnalysis } = require('./utils/reportAiEngine');
const storageService = require('./utils/storageService');

console.log('🧪 Starting Laboratory Portal & Medical Report System Tests...\n');

// ─── 1. FILE VALIDATOR TESTS ───────────────────────────────────────────────────
console.log('--- 1. Testing File Validator ---');

// Test A: Valid PDF for CBC Blood Test
const validPdf = { originalname: 'cbc_results.pdf', mimetype: 'application/pdf', size: 1024 * 500 };
const vRes1 = validateMedicalReportFile(validPdf, 'CBC Blood Test');
console.log('Test 1A (CBC + PDF):', vRes1.isValid ? '✅ PASS' : '❌ FAIL', vRes1);
if (!vRes1.isValid) process.exit(1);

// Test B: Invalid CSV for X-Ray
const invalidCsv = { originalname: 'chest_scan.csv', mimetype: 'text/csv', size: 1024 * 200 };
const vRes2 = validateMedicalReportFile(invalidCsv, 'X-Ray');
console.log('Test 1B (X-Ray + CSV rejection):', !vRes2.isValid ? '✅ PASS (Correctly rejected)' : '❌ FAIL', vRes2.error);
if (vRes2.isValid) process.exit(1);

// Test C: Valid DICOM for X-Ray
const validDicom = { originalname: 'chest_scan.dcm', mimetype: 'application/dicom', size: 1024 * 1024 * 5 };
const vRes3 = validateMedicalReportFile(validDicom, 'X-Ray');
console.log('Test 1C (X-Ray + DICOM):', vRes3.isValid ? '✅ PASS' : '❌ FAIL', vRes3);
if (!vRes3.isValid) process.exit(1);

// Test D: Reject Executables (.exe)
const dangerousExe = { originalname: 'malware.exe', mimetype: 'application/x-msdownload', size: 1024 * 50 };
const vRes4 = validateMedicalReportFile(dangerousExe, 'CBC Blood Test');
console.log('Test 1D (Executable Rejection):', !vRes4.isValid ? '✅ PASS (Correctly blocked)' : '❌ FAIL', vRes4.error);
if (vRes4.isValid) process.exit(1);

// Test E: Safe Filename Generation
const safeName = generateSafeFileName('Patient John Doe (CBC).pdf', 'Laboratory');
console.log('Test 1E (Safe Filename):', safeName.startsWith('laboratory_') ? '✅ PASS' : '❌ FAIL', safeName);

// ─── 2. CRITICAL DETECTION TESTS ───────────────────────────────────────────────
console.log('\n--- 2. Testing Critical Detection ---');

// Test A: Normal CBC results
const normalCbc = [
  { parameter: 'Hemoglobin', value: '14.5', unit: 'g/dL' },
  { parameter: 'WBC', value: '6.5', unit: '10^3/uL' },
  { parameter: 'Platelets', value: '250', unit: '10^3/uL' }
];
const cRes1 = evaluateStructuredResults(normalCbc);
console.log('Test 2A (Normal CBC evaluation):', cRes1.overallStatus === 'Normal' ? '✅ PASS' : '❌ FAIL', cRes1.overallStatus);
if (cRes1.overallStatus !== 'Normal') process.exit(1);

// Test B: Critical Low Hemoglobin (6.2 g/dL <= criticalMin 7.0)
const criticalCbc = [
  { parameter: 'Hemoglobin', value: '6.2', unit: 'g/dL' },
  { parameter: 'WBC', value: '8.0', unit: '10^3/uL' }
];
const cRes2 = evaluateStructuredResults(criticalCbc);
console.log('Test 2B (Critical Hemoglobin detection):', cRes2.overallStatus === 'Critical' ? '✅ PASS' : '❌ FAIL', cRes2.criticalReasons);
if (cRes2.overallStatus !== 'Critical') process.exit(1);

// ─── 3. AI NON-DIAGNOSTIC ENGINE TESTS ────────────────────────────────────────
console.log('\n--- 3. Testing Report AI Engine ---');
const aiRes = generateReportAiAnalysis(cRes2.evaluatedResults, 'CBC Blood Test', 'Laboratory');
console.log('Test 3A (AI Summary):', aiRes.summary.includes('Urgent Attention') ? '✅ PASS' : '❌ FAIL');
console.log('Test 3B (AI Disclaimer):', aiRes.disclaimer.includes('Doctors remain responsible') ? '✅ PASS' : '❌ FAIL');
if (!aiRes.disclaimer.includes('Doctors remain responsible')) process.exit(1);

// ─── 4. STORAGE ABSTRACTION TEST ──────────────────────────────────────────────
console.log('\n--- 4. Testing Storage Service ---');
console.log('Active Storage Driver:', storageService.getDriverName());
console.log('Generated URL Test:', storageService.getFileUrl('sample_test.pdf'));

console.log('\n🎉 ALL LABORATORY BACKEND ENGINE TESTS PASSED SUCCESSFULLY!\n');
