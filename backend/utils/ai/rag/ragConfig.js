/**
 * utils/ai/rag/ragConfig.js — RAG Retrieval Configuration
 *
 * Centralizes all RAG-specific limits, routing tables, keyword maps,
 * and temporal aliases. No authorization logic lives here.
 */

'use strict';

// ─── Retrieval Volume Limits ───────────────────────────────────────────────
const RAG_LIMITS = {
  maxRecordsPerType:  5,   // max documents fetched per collection per request
  maxTotalChunks:     12,  // hard cap on total context chunks sent to LLM
  maxChunkCharacters: 800, // max characters per individual chunk
  maxContextChars:    6000 // total context window budget (characters)
};

// ─── Temporal Keyword → Date-range resolver ────────────────────────────────
// Maps natural-language time references to { daysBack } offsets.
const TEMPORAL_KEYWORDS = {
  'today':        1,
  'yesterday':    2,
  'recent':       7,
  'latest':       7,
  'last week':    7,
  'this week':    7,
  'last month':   30,
  'this month':   30,
  'last 30 days': 30,
  'last year':    365,
  'past year':    365
};

/**
 * Resolves a user message to a date-range filter.
 * Returns { $gte: Date } or null when no temporal keyword is detected.
 * @param {string} message
 * @returns {{ $gte: Date }|null}
 */
function resolveTemporalFilter(message) {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();

  let bestDays = null;
  for (const [keyword, days] of Object.entries(TEMPORAL_KEYWORDS)) {
    if (lower.includes(keyword)) {
      // Pick the most restrictive (smallest) window to minimise data exposure
      if (bestDays === null || days < bestDays) {
        bestDays = days;
      }
    }
  }

  if (bestDays === null) return null;
  const since = new Date();
  since.setDate(since.getDate() - bestDays);
  return { $gte: since };
}

// ─── Capability → collection routing table ─────────────────────────────────
// Maps each AI capability to which record types may be retrieved.
// NEVER include a type not relevant to the capability.
const CAPABILITY_COLLECTIONS = {
  // Patient-facing capabilities
  medical_report:         ['medicalReports'],
  vital_trends:           ['vitalSigns'],
  medications:            ['medications'],
  general_health:         ['vitalSigns', 'medications'],
  test_results:           ['testRequests', 'medicalReports'],

  // Doctor capabilities
  patient_summary:        ['vitalSigns', 'medications', 'medicalReports'],
  clinical_documentation: ['medicalReports', 'medications'],
  lab_analysis:           ['medicalReports', 'testRequests'],

  // Lab capabilities
  abnormal_values:        ['medicalReports', 'testRequests'],
  report_drafting:        ['testRequests', 'samples'],
  workload_summary:       ['testRequests', 'samples'],

  // Admin capabilities
  operational_summary:    ['stats'],
  workload_analysis:      ['stats', 'testRequests'],
  inventory_summary:      ['stats'],
  hospital_trends:        ['stats', 'medicalReports'],

  // Pharmacy capabilities
  prescription_summary:   ['medications'],
  medication_info:        ['medications'],

  // Insurance capabilities
  claim_summary:          ['insuranceClaims'],
  document_extraction:    ['insuranceClaims'],
  policy_explanation:     ['insuranceClaims'],

  // Emergency capabilities
  emergency_case_summary: ['emergencyCases'],
  critical_vitals:        ['vitalSigns', 'alerts'],
  patient_history:        ['medicalReports', 'medications', 'vitalSigns'],
  dispatch_coordination:  ['emergencyCases']
};

// ─── Keyword → record-type relevance scoring boosts ────────────────────────
// Used by ragRetriever for simple keyword-based relevance ranking.
const KEYWORD_BOOSTS = {
  blood:       ['medicalReports', 'vitalSigns'],
  hemoglobin:  ['medicalReports'],
  cbc:         ['medicalReports', 'testRequests'],
  vital:       ['vitalSigns'],
  vitals:      ['vitalSigns'],
  heart:       ['vitalSigns'],
  pressure:    ['vitalSigns'],
  medication:  ['medications'],
  prescription:['medications'],
  drug:        ['medications'],
  test:        ['testRequests', 'medicalReports'],
  lab:         ['testRequests', 'medicalReports', 'samples'],
  report:      ['medicalReports'],
  claim:       ['insuranceClaims'],
  insurance:   ['insuranceClaims'],
  emergency:   ['emergencyCases'],
  sample:      ['samples']
};

module.exports = {
  RAG_LIMITS,
  TEMPORAL_KEYWORDS,
  CAPABILITY_COLLECTIONS,
  KEYWORD_BOOSTS,
  resolveTemporalFilter
};
