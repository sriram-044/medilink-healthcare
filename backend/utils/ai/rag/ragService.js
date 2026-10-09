/**
 * utils/ai/rag/ragService.js — RAG Pipeline Orchestrator
 *
 * Integrates with aiService.js as a drop-in context enrichment layer.
 * Called AFTER authentication, RBAC, and aiAuthorization have passed.
 *
 * Pipeline:
 *   1.  Build RAG authorization context (from server-side user identity)
 *   2.  Resolve temporal filter from user message
 *   3.  Identify collection types for the capability
 *   4.  Execute authorized structured retrieval
 *   5.  Build ranked, sanitized, chunked context
 *   6.  Return { ragChunks, ragSources, ragEmpty } for prompt assembly
 *
 * The public interface is a clean:
 *   retrieve(query, authorizationContext)
 * that can support structured, semantic, or hybrid retrieval without
 * changing the aiService API.
 */

'use strict';

const { buildRagAuthContext }   = require('./ragAuthorization');
const { retrieve: execRetrieval } = require('./ragRetriever');
const { buildRagContext }       = require('./ragContext');
const { CAPABILITY_COLLECTIONS, resolveTemporalFilter } = require('./ragConfig');

/**
 * Primary RAG interface called by aiService.
 *
 * @param {object} params
 * @param {string} params.message              - User question
 * @param {string} params.capability           - RBAC-validated capability
 * @param {object} params.user                 - Authenticated user (req.user)
 * @param {string|null} params.authorizedPatientId - Already-verified patient ID
 * @returns {Promise<RagResult>}
 *
 * @typedef {object} RagResult
 * @property {Array<{text: string, source: object}>} chunks  - RAG context chunks for prompt
 * @property {object[]}                              sources - Safe source references for response
 * @property {boolean}                              isEmpty  - True when no records retrieved
 * @property {number}                               latencyMs - Retrieval latency
 */
async function retrieve({ message, capability, user, authorizedPatientId }) {
  const t0 = Date.now();

  try {
    // 1. Build RAG authorization context (server-side identity only)
    const authCtx = await buildRagAuthContext(user, capability, authorizedPatientId);

    // 2. Resolve temporal filter from user message
    const dateFilter = resolveTemporalFilter(message);

    // 3. Identify which collections to query for this capability
    const collectionTypes = CAPABILITY_COLLECTIONS[capability] || [];

    // 4. Execute authorized retrieval
    const rawRecords = await execRetrieval(collectionTypes, authCtx, dateFilter);

    // 5. Rank, sanitize, chunk, source
    const { chunks, sources, isEmpty } = buildRagContext(rawRecords, message);

    return {
      chunks,
      sources,
      isEmpty,
      latencyMs: Date.now() - t0
    };
  } catch (err) {
    // RAG failures are non-fatal — aiService will fall back to capability context
    return {
      chunks:    [],
      sources:   [],
      isEmpty:   true,
      latencyMs: Date.now() - t0,
      error:     err.message
    };
  }
}

module.exports = { retrieve };
