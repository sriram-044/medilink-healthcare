/**
 * utils/ai/aiConfig.js — Configuration & Secrets for CareLink AI Architecture
 *
 * Centralizes all AI configuration options with secure environment fallbacks.
 * Production keys are sourced solely from environment variables.
 */

const SUPPORTED_PROVIDERS = ['mock', 'real', 'http', 'openai', 'gemini'];

const aiConfig = {
  // Provider: 'mock' (default deterministic test provider), 'real', 'http', 'gemini', 'openai'
  get provider() {
    return (process.env.AI_PROVIDER || 'mock').trim().toLowerCase();
  },
  set provider(val) {
    process.env.AI_PROVIDER = String(val);
  },

  // Model identifier
  get model() {
    return (process.env.AI_MODEL || 'carelink-clinical-assistant-v1').trim();
  },
  set model(val) {
    process.env.AI_MODEL = String(val);
  },

  // API Key (never logged or exposed)
  get apiKey() {
    return (process.env.AI_API_KEY || '').trim();
  },
  set apiKey(val) {
    process.env.AI_API_KEY = String(val);
  },

  // Custom Base URL (if using external gateway or local inference)
  get baseUrl() {
    return (process.env.AI_BASE_URL || '').trim();
  },
  set baseUrl(val) {
    process.env.AI_BASE_URL = String(val);
  },

  // Request timeout in milliseconds (default 30 seconds)
  get timeoutMs() {
    return parseInt(process.env.AI_TIMEOUT_MS, 10) || 30000;
  },
  set timeoutMs(val) {
    process.env.AI_TIMEOUT_MS = String(val);
  },

  // Maximum output tokens
  get maxTokens() {
    return parseInt(process.env.AI_MAX_TOKENS, 10) || 1000;
  },
  set maxTokens(val) {
    process.env.AI_MAX_TOKENS = String(val);
  },

  // Temperature (lower is more deterministic and factual for clinical contexts)
  get temperature() {
    return parseFloat(process.env.AI_TEMPERATURE) || 0.2;
  },
  set temperature(val) {
    process.env.AI_TEMPERATURE = String(val);
  },

  // Global kill-switch for AI features
  get enabled() {
    return process.env.AI_ENABLED !== 'false' && process.env.AI_ENABLED !== false;
  },
  set enabled(val) {
    process.env.AI_ENABLED = String(val);
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    get maxRequestsPerUser() {
      return parseInt(process.env.AI_RATE_LIMIT_MAX, 10) || 30;
    }
  },

  // Input length constraints
  inputConstraints: {
    minMessageLength: 2,
    maxMessageLength: 1000
  }
};

/**
 * Checks if the AI system is enabled.
 * @returns {boolean}
 */
function isAiEnabled() {
  return aiConfig.enabled;
}

/**
 * Validates AI configuration against specified or ambient environment.
 * @param {object} [env=process.env]
 * @returns {{ isValid: boolean, error?: string, provider?: string }}
 */
function validateAiConfig(env = process.env) {
  const enabled = env.AI_ENABLED !== 'false' && env.AI_ENABLED !== false;
  if (!enabled) {
    return { isValid: true, enabled: false };
  }

  const provider = (env.AI_PROVIDER || 'mock').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return {
      isValid: false,
      error: `Unsupported AI provider '${provider}'. Allowed providers: ${SUPPORTED_PROVIDERS.join(', ')}`
    };
  }

  if (provider !== 'mock') {
    const apiKey = env.AI_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey.includes('your_ai_api_key_here')) {
      return {
        isValid: false,
        error: 'AI_API_KEY is required when a real AI provider is selected.'
      };
    }
    const model = env.AI_MODEL;
    if (!model || !model.trim()) {
      return {
        isValid: false,
        error: 'AI_MODEL is required when a real AI provider is selected.'
      };
    }

    if (env.AI_BASE_URL && env.AI_BASE_URL.trim()) {
      try {
        const u = new URL(env.AI_BASE_URL.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { isValid: false, error: 'AI_BASE_URL must use http or https protocol.' };
        }
      } catch {
        return { isValid: false, error: 'AI_BASE_URL must be a valid URL.' };
      }
    }

    if (env.AI_TIMEOUT_MS !== undefined && env.AI_TIMEOUT_MS !== '') {
      const timeout = parseInt(env.AI_TIMEOUT_MS, 10);
      if (isNaN(timeout) || timeout <= 0) {
        return { isValid: false, error: 'AI_TIMEOUT_MS must be a positive integer.' };
      }
    }

    if (env.AI_MAX_TOKENS !== undefined && env.AI_MAX_TOKENS !== '') {
      const maxTokens = parseInt(env.AI_MAX_TOKENS, 10);
      if (isNaN(maxTokens) || maxTokens <= 0) {
        return { isValid: false, error: 'AI_MAX_TOKENS must be a positive integer.' };
      }
    }

    if (env.AI_TEMPERATURE !== undefined && env.AI_TEMPERATURE !== '') {
      const temp = parseFloat(env.AI_TEMPERATURE);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        return { isValid: false, error: 'AI_TEMPERATURE must be a number between 0.0 and 2.0.' };
      }
    }
  }

  return { isValid: true, enabled: true, provider };
}

/**
 * Returns safe metadata about the AI configuration (strictly excluding credentials).
 * @returns {object}
 */
function getSafeConfigSummary() {
  return {
    provider: aiConfig.provider,
    model: aiConfig.model,
    enabled: aiConfig.enabled,
    timeoutMs: aiConfig.timeoutMs,
    maxTokens: aiConfig.maxTokens,
    temperature: aiConfig.temperature
  };
}

module.exports = {
  aiConfig,
  SUPPORTED_PROVIDERS,
  isAiEnabled,
  validateAiConfig,
  getSafeConfigSummary
};
