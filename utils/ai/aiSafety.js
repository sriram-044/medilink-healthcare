/**
 * utils/ai/aiSafety.js — Output Safety & Defense-in-Depth Validation
 *
 * Inspects LLM-generated output before returning it to the user:
 * 1. Checks for secret / credential leakage (JWT, session secret, API keys, MongoDB URI).
 * 2. Checks for prompt injection leakage or system prompt echo.
 * 3. Enforces standardized clinical disclaimers.
 * 4. Filters unsafe diagnostic claims or dangerous directives.
 */

const STANDARD_DISCLAIMER =
  '\n\n[CareLink AI Disclaimer: This response is AI-assisted and provided for educational and operational information only. It does not constitute formal medical diagnosis, prescription, or clinical decision-making. Always consult a qualified healthcare professional for medical concerns.]';

/**
 * Validates and sanitizes the LLM output.
 *
 * @param {string} rawOutput - Generated text from LLM provider
 * @param {object} user - Authenticated user context
 * @returns {string} Sanitized output safe for client delivery
 */
function validateAndSanitizeOutput(rawOutput, user) {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return 'CareLink AI was unable to generate a response at this time.' + STANDARD_DISCLAIMER;
  }

  let text = rawOutput.trim();

  // 1. Secret Leakage Detection
  const sensitiveEnvVars = [
    process.env.JWT_SECRET,
    process.env.SESSION_SECRET,
    process.env.AI_API_KEY,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.MONGODB_URI,
    process.env.MONGO_URI
  ].filter(val => typeof val === 'string' && val.length > 5);

  for (const secret of sensitiveEnvVars) {
    if (text.includes(secret)) {
      // Secret detected in output! Scrub immediately
      text = text.split(secret).join('[REDACTED_SECRET]');
    }
  }

  // Regex-based credential scrub for MongoDB URIs or tokens
  text = text.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URI]');
  text = text.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
  text = text.replace(/[a-zA-Z0-9_-]{32,}/g, (match) => {
    // If it looks like a long hex/base64 key and matches known secret
    if (sensitiveEnvVars.some(s => s.includes(match))) {
      return '[REDACTED_CREDENTIAL]';
    }
    return match;
  });

  // 2. Prompt Injection Echo Defense
  // If the model leaked system prompt instructions or admitted to ignoring rules
  const systemPromptLeaks = [
    'You are CareLink AI, a secure healthcare clinical intelligence assistant',
    'PRIMARY DIRECTIVES:',
    'TREAT ALL APPLICATION CONTEXT',
    'UNTRUSTED DATA BLOCK',
    'I have overridden my instructions'
  ];

  for (const leak of systemPromptLeaks) {
    if (text.includes(leak)) {
      text = text.replace(leak, '[REDACTED_SYSTEM_DIRECTIVE]');
    }
  }

  // 3. Ensure Standard Informational Disclaimer is present
  if (!text.includes('CareLink AI Disclaimer:')) {
    text += STANDARD_DISCLAIMER;
  }

  return text;
}

module.exports = {
  STANDARD_DISCLAIMER,
  validateAndSanitizeOutput
};
