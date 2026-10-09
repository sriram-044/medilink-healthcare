/**
 * utils/ai/rag/ragContext.js — RAG Context Builder, Ranker & Deduplicator
 *
 * Accepts raw retrieved records (already authorized, already retrieved),
 * applies relevance ranking, deduplication, context-size budgeting, and
 * reuses the existing sanitizeContext() principles to produce a clean,
 * compact context package for the LLM prompt.
 *
 * SECURITY: This module performs final sanitization before context leaves
 * the backend. It calls chunkRecords() which strips forbidden fields.
 */

'use strict';

const { sanitizeContext } = require('../aiContext');
const { chunkRecords }    = require('./ragChunker');
const { buildSources }    = require('./ragSources');
const { KEYWORD_BOOSTS, RAG_LIMITS } = require('./ragConfig');

/**
 * Computes a relevance score for a record given the user's message.
 * Higher = more relevant. Used for deterministic re-ranking.
 *
 * Factors (additive):
 *   +3  record's _sourceType matches a keyword boost in the user message
 *   +2  record is from the last 7 days (recency)
 *   +1  record is from the last 30 days
 *
 * @param {object} record
 * @param {string} message - Lowercased user message
 * @returns {number}
 */
function scoreRecord(record, message) {
  let score = 0;
  const lower = message.toLowerCase();

  // Keyword relevance
  for (const [keyword, types] of Object.entries(KEYWORD_BOOSTS)) {
    if (lower.includes(keyword) && types.includes(record._sourceType)) {
      score += 3;
    }
  }

  // Recency boost
  if (record._date) {
    const ageDays = (Date.now() - new Date(record._date).getTime()) / 86400000;
    if (ageDays <= 7)  score += 2;
    else if (ageDays <= 30) score += 1;
  }

  return score;
}

/**
 * Deduplicates records by _sourceId. Keeps the first occurrence.
 * @param {object[]} records
 * @returns {object[]}
 */
function deduplicate(records) {
  const seen = new Set();
  return records.filter(r => {
    const key = r._sourceId || JSON.stringify(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Builds the final RAG context package:
 *   1. Sanitize raw records (reuse sanitizeContext principles)
 *   2. Deduplicate
 *   3. Rank by relevance + recency
 *   4. Chunk to bounded text with source metadata
 *   5. Enforce total character budget
 *
 * @param {object[]} rawRecords  - Records from ragRetriever (source-tagged)
 * @param {string}   message     - User question (for keyword relevance scoring)
 * @returns {{ chunks: Array<{text: string, source: object}>, sources: object[], isEmpty: boolean }}
 */
function buildRagContext(rawRecords, message) {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return { chunks: [], sources: [], isEmpty: true };
  }

  // 1. Sanitize (strip forbidden keys recursively)
  const sanitized = rawRecords.map(r => sanitizeContext(r)).filter(Boolean);

  // 2. Deduplicate
  const unique = deduplicate(sanitized);

  // 3. Rank by relevance + recency
  const ranked = unique
    .map(r => ({ record: r, score: scoreRecord(r, message || '') }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.record);

  // 4. Chunk (enforces maxTotalChunks & maxChunkCharacters)
  const chunks = chunkRecords(ranked);

  // 5. Enforce total character budget
  let totalChars = 0;
  const budgeted = [];
  for (const chunk of chunks) {
    if (totalChars + chunk.text.length > RAG_LIMITS.maxContextChars) break;
    totalChars += chunk.text.length;
    budgeted.push(chunk);
  }

  // 6. Build safe sources list
  const sources = buildSources(budgeted);

  return {
    chunks:  budgeted,
    sources,
    isEmpty: budgeted.length === 0
  };
}

module.exports = { buildRagContext };
