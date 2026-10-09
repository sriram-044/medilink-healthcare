/**
 * utils/ai/aiService.js — Central AI Service Pipeline & Orchestrator
 *
 * Implements the mandatory security pipeline:
 * User
 *   ↓
 * Existing Authentication (req.user)
 *   ↓
 * Existing RBAC (req.user.role)
 *   ↓
 * AI Authorization Layer (capability & resource verification)
 *   ↓
 * AI Request Validation (message constraints)
 *   ↓
 * RAG Retrieval (authorized structured retrieval via ragService)
 *   ↓
 * Context Builder (Data minimization & secret scrubbing)
 *   ↓
 * Prompt Assembly (system instructions + RAG context + user question)
 *   ↓
 * LLM Provider Abstraction
 *   ↓
 * Output Safety Validation (secret checks & standardized disclaimers)
 *   ↓
 * Response Envelope (answer + sources)
 */

const { aiConfig, isAiEnabled } = require('./aiConfig');
const { getAiProvider } = require('./aiProvider');
const {
  isCapabilityAllowed,
  getDefaultCapability,
  authorizeResourceAccess
} = require('./aiAuthorization');
const { buildAuthorizedContext } = require('./aiContext');
const { buildAiPrompt } = require('./aiPrompts');
const { validateAndSanitizeOutput } = require('./aiSafety');
const { logAiRequest } = require('./aiLogger');
const { retrieve: ragRetrieve } = require('./rag/ragService');
const { BadRequestError, ServiceUnavailableError } = require('../errors');

/**
 * Processes an incoming AI chat request through the full security pipeline.
 *
 * @param {object} params
 * @param {object} params.user - Authenticated user object from req.user
 * @param {string} params.message - User prompt text
 * @param {string} [params.contextType] - Requested clinical/operational capability
 * @param {string} [params.targetPatientId] - Target patient identifier (if applicable)
 * @param {string} [params.resourceId] - Target resource identifier (if applicable)
 * @param {string} [params.requestId] - Correlation ID from req.id
 * @param {object} [params.options] - Provider execution options (e.g. simulateError)
 * @returns {Promise<{ answer: string, role: string, contextType: string, sources: object[] }>}
 */
async function processAiChat({
  user,
  message,
  contextType,
  targetPatientId,
  resourceId,
  requestId,
  options = {}
}) {
  const startTime = Date.now();

  // 1. Verify Global AI Availability
  if (!isAiEnabled()) {
    throw new ServiceUnavailableError('CareLink AI service is currently disabled by administrator.', 'AI_DISABLED');
  }

  // 2. Request Validation
  if (!message || typeof message !== 'string') {
    throw new BadRequestError('A valid text message is required.');
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length < aiConfig.inputConstraints.minMessageLength) {
    throw new BadRequestError(
      `Message must be at least ${aiConfig.inputConstraints.minMessageLength} characters long.`
    );
  }
  if (trimmedMessage.length > aiConfig.inputConstraints.maxMessageLength) {
    throw new BadRequestError(
      `Message exceeds maximum permitted length of ${aiConfig.inputConstraints.maxMessageLength} characters.`
    );
  }

  // 3. Capability Resolution & Authorization
  const role = (user?.role || '').toLowerCase();
  const selectedCapability = contextType ? contextType.trim().toLowerCase() : getDefaultCapability(role);

  // Authorize Capability & Access to Target Resource (Enforces IDOR checks)
  const { authorizedPatientId, authorizedResourceId } = await authorizeResourceAccess(
    user,
    selectedCapability,
    targetPatientId,
    resourceId
  );

  let rawOutput = '';
  let providerInstance;
  let ragSources = [];

  try {
    // 4a. RAG: Authorized structured retrieval
    //     retrieve() returns { chunks, sources, isEmpty, latencyMs }
    //     RAG failures are non-fatal — pipeline continues with base context.
    const ragResult = await ragRetrieve({
      message:             trimmedMessage,
      capability:          selectedCapability,
      user,
      authorizedPatientId
    });

    ragSources = ragResult.sources || [];

    // 4b. Build base authorized context (legacy capability context for non-RAG paths
    //     and for roles/capabilities with no structured records returned)
    const baseContext = await buildAuthorizedContext(
      user,
      selectedCapability,
      authorizedPatientId,
      authorizedResourceId
    );

    // 5. Prompt Construction (Strict Separation of Instructions & Untrusted Data)
    //    RAG chunks are passed as the primary context when available.
    const { systemPrompt, userPrompt } = buildAiPrompt({
      role,
      capability:  selectedCapability,
      contextData: baseContext,
      ragChunks:   ragResult.chunks,
      userMessage: trimmedMessage
    });

    // 6. Invoke LLM Provider Abstraction
    providerInstance = getAiProvider(aiConfig);
    rawOutput = await providerInstance.generateResponse({
      systemPrompt,
      userPrompt,
      contextData: baseContext,
      options: {
        ...options,
        role,
        capability: selectedCapability
      }
    });

    // 7. Output Safety Inspection & Sanitization
    const safeAnswer = validateAndSanitizeOutput(rawOutput, user);

    const latencyMs = Date.now() - startTime;

    // 8. Safe Transaction Audit Logging
    logAiRequest({
      requestId,
      userRole:   role,
      userId:     user._id,
      capability: selectedCapability,
      latencyMs,
      provider:   providerInstance.name,
      model:      providerInstance.model,
      success:    true,
      ragSources: ragSources.length
    });

    // 9. Standardized Output (backward-compatible; sources is additive)
    return {
      answer:      safeAnswer,
      role,
      contextType: selectedCapability,
      sources:     ragSources
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    logAiRequest({
      requestId,
      userRole:   role,
      userId:     user._id,
      capability: selectedCapability,
      latencyMs,
      provider:   providerInstance?.name || aiConfig.provider,
      model:      providerInstance?.model || aiConfig.model,
      success:    false,
      errorCode:  err.code || 'AI_ERROR',
      errorMessage: err.message
    });

    // Re-throw operational AppErrors, or wrap unexpected errors safely
    if (err.isOperational) {
      throw err;
    }
    throw new ServiceUnavailableError('AI service is temporarily unavailable.', 'AI_UNAVAILABLE');
  }
}

module.exports = {
  processAiChat
};
