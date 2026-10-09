'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// We test the documentIntelligence module directly
const { 
  extractTextFromFile, 
  classifyDocument, 
  extractMedicalData, 
  sanitizeExtractedText,
  processDocument
} = require('./utils/documentIntelligence');

const { RAG_LIMITS } = require('./utils/ai/rag/ragConfig');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  A. Document Intelligence Unit Tests');
  console.log('════════════════════════════════════════════════════════════');

  // Classification
  assert(classifyDocument('Complete Blood Count results') === 'CBC', 'Classifies CBC correctly');
  assert(classifyDocument('Patient discharge summary note') === 'Discharge Summary', 'Classifies Discharge Summary correctly');
  assert(classifyDocument('Some random text', 'CBC') === 'CBC', 'Uses fallback originalType if present');
  assert(classifyDocument('Some random text', 'Invalid') === 'Unknown', 'Returns Unknown for invalid fallback');

  // Extraction
  const sampleText = 'Patient name: John\nHemoglobin: 10.5 g/dL (Normal: 12-16)\nPlatelets: 200';
  const extracted = extractMedicalData(sampleText);
  assert(extracted !== null && extracted.length === 1, 'Extracts structured data from text');
  assert(extracted[0].parameter === 'Hemoglobin' && extracted[0].value === '10.5' && extracted[0].status === 'Low', 'Correctly parses abnormal hemoglobin');

  const emptyExtracted = extractMedicalData('Nothing useful here');
  assert(emptyExtracted === null, 'Returns null when no structured data found (no inventing)');

  // Sanitization
  const dirtyText = 'Here is my password: secret123! And my bearer token is Bearer eyJhbGciOiJIUzI1. Also db is mongodb://admin:pass@host/db and path is /var/www/html/secret.txt';
  const cleanText = sanitizeExtractedText(dirtyText);
  assert(!cleanText.includes('secret123!'), 'Sanitizes passwords');
  assert(!cleanText.includes('eyJhbGciOiJIUzI1'), 'Sanitizes bearer tokens');
  assert(!cleanText.includes('mongodb://'), 'Sanitizes MongoDB URIs');
  assert(!cleanText.includes('/var/www/html/secret.txt'), 'Sanitizes filesystem paths');

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
