/**
 * utils/ai/rag/ragSources.js — Source Reference Builder & Sanitizer
 *
 * Produces the safe, client-facing `sources` array from RAG chunks.
 * NEVER exposes internal MongoDB IDs, file paths, database URIs,
 * or any forbidden metadata in the sources list.
 */

'use strict';

// Fields allowed in the public source reference object
const SAFE_SOURCE_FIELDS = new Set(['type', 'label', 'date']);

// Internal source types mapped to friendly human-readable type labels
const SOURCE_TYPE_LABELS = {
  vital:             'Vital Signs',
  medical_report:    'Medical Report',
  medication:        'Medication',
  test_request:      'Lab Test Request',
  sample:            'Laboratory Sample',
  alert:             'Clinical Alert',
  emergency_case:    'Emergency Case',
  insurance_claim:   'Insurance Claim',
  operational_stats: 'Hospital Statistics'
};

/**
 * Sanitizes a single source reference object.
 * Returns only the safe fields (type, label, date).
 *
 * @param {object} raw - Raw source metadata from a ragChunker chunk
 * @returns {object} Clean source reference
 */
function sanitizeSource(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const clean = {};
  for (const field of SAFE_SOURCE_FIELDS) {
    if (raw[field] !== undefined && raw[field] !== null) {
      clean[field] = raw[field];
    }
  }

  // Normalise the type label
  if (clean.type && SOURCE_TYPE_LABELS[clean.type]) {
    clean.type = SOURCE_TYPE_LABELS[clean.type];
  }

  return clean;
}

/**
 * Deduplicates and sanitizes the sources array from RAG chunks.
 * Removes duplicate labels and applies strict field whitelisting.
 *
 * @param {Array<{ text: string, source: object }>} chunks
 * @returns {object[]} Safe, deduplicated source references
 */
function buildSources(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    if (!chunk || !chunk.source) continue;
    const clean = sanitizeSource(chunk.source);
    if (!clean || !clean.label) continue;
    if (seen.has(clean.label)) continue;

    seen.add(clean.label);
    sources.push(clean);
  }

  return sources;
}

module.exports = { sanitizeSource, buildSources };
