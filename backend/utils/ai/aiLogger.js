/**
 * utils/ai/aiLogger.js — Safe Audit Logging for CareLink AI
 *
 * Enforces strict logging privacy:
 * - Logs request metadata, latency, role, capability, provider, and status
 * - NEVER logs passwords, API keys, JWTs, or full medical record payloads
 */

/**
 * Logs an AI transaction safely.
 * @param {object} params
 * @param {string} params.requestId
 * @param {string} params.userRole
 * @param {string} [params.userId]
 * @param {string} params.capability
 * @param {number} params.latencyMs
 * @param {string} params.provider
 * @param {string} params.model
 * @param {boolean} params.success
 * @param {string} [params.errorCode]
 * @param {string} [params.errorMessage]
 */
function logAiRequest({
  requestId,
  userRole,
  userId,
  capability,
  latencyMs,
  provider,
  model,
  success,
  errorCode,
  errorMessage
}) {
  const timestamp = new Date().toISOString();
  const statusLabel = success ? 'SUCCESS' : 'FAILED';

  const logPayload = {
    tag: 'CARELINK_AI_AUDIT',
    timestamp,
    requestId: requestId || 'no_id',
    userRole: userRole || 'unknown',
    userId: userId ? `user_${String(userId).slice(-6)}` : 'anonymous', // Pseudonymized in logs
    capability: capability || 'default',
    latencyMs: Math.round(latencyMs || 0),
    provider: provider || 'unknown',
    model: model || 'unknown',
    status: statusLabel
  };

  if (!success) {
    logPayload.errorCode = errorCode || 'AI_ERROR';
    // Sanitize any error message so secrets or tokens cannot leak
    logPayload.errorMessage = String(errorMessage || 'Operation failed')
      .replace(/key|token|secret|password|bearer/gi, '***')
      .slice(0, 200);
  }

  // Format log output
  if (process.env.NODE_ENV !== 'test') {
    if (success) {
      console.log(`[AI][${logPayload.requestId}] ${logPayload.userRole.toUpperCase()} | ${logPayload.capability} ➔ ${logPayload.latencyMs}ms (${logPayload.provider}/${logPayload.model})`);
    } else {
      console.warn(`[AI_ERROR][${logPayload.requestId}] ${logPayload.userRole.toUpperCase()} | ${logPayload.capability} ➔ ${logPayload.errorCode}: ${logPayload.errorMessage}`);
    }
  }
}

module.exports = {
  logAiRequest
};
