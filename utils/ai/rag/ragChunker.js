/**
 * utils/ai/rag/ragChunker.js — Safe Text Chunking & Metadata Preservation
 *
 * Converts retrieved records into bounded, LLM-safe text chunks.
 * Each chunk preserves safe source metadata (type, label, date)
 * and strips all forbidden fields (passwords, tokens, paths, etc.).
 *
 * SECURITY: Chunker is purely data-in / text-out with no I/O.
 *           It receives already-authorized, already-sanitized records
 *           from ragContext.js.
 */

'use strict';

const { RAG_LIMITS } = require('./ragConfig');

// Fields that must never appear in any chunk, even if somehow present.
const FORBIDDEN_CHUNK_FIELDS = new Set([
  'password', 'passwordHash', 'token', 'secret',
  'accessToken', 'refreshToken', 'filePath',
  'tempFilePath', 'fileUrl', 'googleId',
  '__v', 'stack', '_id', '_patientId'
]);

// Source-metadata fields stored separately — never sent as LLM data content
const SOURCE_META_FIELDS = new Set([
  '_sourceType', '_sourceId', '_date', '_label'
]);

/**
 * Serializes a single record into a bounded text chunk.
 * Strips forbidden fields, limits to RAG_LIMITS.maxChunkCharacters.
 *
 * @param {object} record - A source-tagged record from ragRetriever
 * @returns {{ text: string, source: RagSource }|null}
 *
 * @typedef {object} RagSource
 * @property {string} type  - Human-safe record type (e.g. 'vital')
 * @property {string} label - Human-readable label (e.g. 'Vital Signs — 24 Sep 2026')
 * @property {string} [date] - ISO date string
 */
function chunkRecord(record) {
  if (!record || typeof record !== 'object') return null;

  // Extract source metadata
  const source = {
    type:  record._sourceType || 'record',
    label: record._label      || 'Clinical Record',
    date:  record._date ? new Date(record._date).toISOString() : undefined
  };

  // Build the data payload (exclude source-meta and forbidden fields)
  const payload = {};
  for (const [key, value] of Object.entries(record)) {
    if (SOURCE_META_FIELDS.has(key)) continue;
    if (FORBIDDEN_CHUNK_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    payload[key] = value;
  }

  if (Object.keys(payload).length === 0) return null;

  // Serialize to compact JSON text
  let text = JSON.stringify(payload);

  // Enforce character limit
  if (text.length > RAG_LIMITS.maxChunkCharacters) {
    text = text.slice(0, RAG_LIMITS.maxChunkCharacters) + '... [truncated]';
  }

  return { text, source };
}

/**
 * Converts an array of retrieved records into an array of safe text chunks.
 * Enforces total chunk count limit.
 *
 * @param {object[]} records - Raw records from ragRetriever
 * @returns {Array<{ text: string, source: RagSource }>}
 */
function chunkRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const chunks = [];
  for (const record of records) {
    if (chunks.length >= RAG_LIMITS.maxTotalChunks) break;
    const chunk = chunkRecord(record);
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

module.exports = { chunkRecord, chunkRecords };
