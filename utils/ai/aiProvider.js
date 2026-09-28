/**
 * utils/ai/aiProvider.js — LLM Provider Abstraction Layer & Production HTTP Adapter
 *
 * Implements provider abstraction decoupling CareLink from any specific LLM vendor:
 * - BaseAiProvider: Contract interface for all providers
 * - MockAiProvider: Deterministic clinical intelligence simulation for offline test/dev
 * - RealHttpAiProvider: Resilient, bounded-retry HTTP client for real LLM backends (OpenAI/Gemini/Ollama)
 * - Factory method getAiProvider(): Enforces configuration validation, provider selection, and prevents silent fallbacks
 */

const { aiConfig, SUPPORTED_PROVIDERS } = require('./aiConfig');
const { ServiceUnavailableError } = require('../errors');

/**
 * Base abstract class defining the LLM provider contract.
 */
class BaseAiProvider {
  /**
   * Generates a conversational or contextual response.
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {string} params.userPrompt
   * @param {object} [params.contextData]
   * @param {object} [params.options]
   * @returns {Promise<string>}
   */
  async generateResponse(params) {
    throw new Error('generateResponse must be implemented by subclass.');
  }

  /**
   * Summarizes clinical or operational text.
   * @param {object} params
   * @param {string} params.text
   * @param {object} [params.options]
   * @returns {Promise<string>}
   */
  async summarize(params) {
    throw new Error('summarize must be implemented by subclass.');
  }

  /**
   * Analyzes structured data.
   * @param {object} params
   * @param {object} params.data
   * @param {string} params.prompt
   * @param {object} [params.options]
   * @returns {Promise<string>}
   */
  async analyze(params) {
    throw new Error('analyze must be implemented by subclass.');
  }
}

/**
 * Mock / Deterministic Provider for Offline Testing & Clinical Simulation
 */
class MockAiProvider extends BaseAiProvider {
  constructor(config = aiConfig) {
    super();
    this.name = 'mock';
    this.model = config.model || 'carelink-mock-clinical-v1';
  }

  async generateResponse({ systemPrompt, userPrompt, contextData, options = {} }) {
    // 1. Simulate failure if requested by test
    if (options.simulateError) {
      throw new ServiceUnavailableError('AI service is temporarily unavailable.', 'AI_UNAVAILABLE');
    }
    if (options.simulateTimeout) {
      throw new ServiceUnavailableError('AI service request timed out.', 'AI_TIMEOUT');
    }

    const lowerQuery = (userPrompt || '').toLowerCase();

    // 2. Prompt Injection Defense Simulations
    if (
      lowerQuery.includes('ignore previous instructions') ||
      lowerQuery.includes('ignore all previous') ||
      lowerQuery.includes('reveal all patient') ||
      lowerQuery.includes('show system prompt') ||
      lowerQuery.includes('system prompt') ||
      lowerQuery.includes('what is the api key') ||
      lowerQuery.includes('developer mode')
    ) {
      return 'I cannot fulfill requests that attempt to override clinical safety guidelines, disclose system prompts, or bypass patient privacy boundaries. How can I assist you with your authorized clinical data?';
    }

    // 3. Clinical Data Extraction for Context-Aware Answers
    const role = options.role || 'patient';
    const capability = options.capability || 'general_health';

    let answer = '';

    if (role === 'patient') {
      if (contextData?.medicalReports?.length > 0) {
        const rep = contextData.medicalReports[0];
        answer = `Based on your most recent ${rep.reportType || 'medical'} report dated ${rep.testDate || 'recently'}: ${rep.summary || 'Results are recorded.'} Your status is marked as ${rep.criticalStatus || 'Normal'}. Please discuss these findings with your physician during your next scheduled appointment.`;
      } else if (contextData?.vitalSigns?.length > 0) {
        const vit = contextData.vitalSigns[0];
        answer = `Your latest recorded vital signs indicate a heart rate of ${vit.heartRate || 72} bpm, oxygen saturation of ${vit.spo2 || 98}%, and body temperature of ${vit.temperature || 98.6}°F. Overall vital status is ${vit.aiStatus || 'Stable'}.`;
      } else if (contextData?.medications?.length > 0) {
        const medList = contextData.medications.map(m => `${m.name} (${m.dosage})`).join(', ');
        answer = `Your current active medications include: ${medList}. Please ensure you take them according to prescribed instructions.`;
      } else {
        answer = `Hello! I am your CareLink Patient Assistant. I can help explain your lab results, vital signs, and medications. What specific question do you have today?`;
      }
    } else if (role === 'doctor') {
      if (contextData?.patientProfile) {
        answer = `Clinical Summary for ${contextData.patientProfile.name || 'Patient'} (Age: ${contextData.patientProfile.age || 'N/A'}, Blood Group: ${contextData.patientProfile.bloodGroup || 'N/A'}): Latest vitals reflect HR ${contextData.latestVitals?.heartRate || 'Normal'}, SpO2 ${contextData.latestVitals?.spo2 || 'Normal'}%. Allergies recorded: ${contextData.patientProfile.allergies?.join(', ') || 'None reported'}.`;
      } else {
        answer = `Clinical Assistant ready. You may review patient vital telemetry, summarize longitudinal report histories, or analyze abnormal lab panels for assigned patients.`;
      }
    } else if (role === 'lab') {
      answer = `Laboratory Worklist Analysis: Current active queue contains ${contextData?.labWorkload?.recentRequests?.length || 0} recent pending or processing requests. Specimen collection integrity checks are nominal.`;
    } else if (role === 'pharmacy') {
      answer = `Pharmacy Care Assistant: Medication inventory and prescription review ready. Ensure verification of patient allergy profiles prior to dispensing.`;
    } else if (role === 'insurance') {
      answer = `Insurance Review Assistant: Found ${contextData?.insuranceClaims?.length || 0} active claim files. Documentation verification parameters are indexed for adjudication review.`;
    } else if (role === 'emergency') {
      answer = `Emergency Dispatch Assistant: Active critical incidents indexed: ${contextData?.activeEmergencies?.length || 0}. Triage queues and paramedic response teams are synchronized.`;
    } else if (role === 'admin' || role === 'hospital') {
      answer = `Hospital Operations Summary: Tracking ${contextData?.hospitalOperations?.activePatientsCount || 0} registered patients, ${contextData?.hospitalOperations?.activeEmergenciesCount || 0} active trauma incidents, and ${contextData?.hospitalOperations?.totalReportsProcessed || 0} total diagnostic reports.`;
    } else {
      answer = `CareLink AI assistant initialized. How can I help with your authorized clinical workflow?`;
    }

    return answer;
  }

  async summarize({ text, options = {} }) {
    if (!text) return 'No content provided to summarize.';
    return `Summary: ${text.slice(0, 200)}...`;
  }

  async analyze({ data, prompt, options = {} }) {
    return `Clinical Analysis complete for requested parameters.`;
  }
}

/**
 * Production-Ready Real HTTP LLM Provider
 *
 * Connects to external OpenAI-compatible or REST endpoints with:
 * - Configurable Base URL & Timeout
 * - Bounded retry policy on transient 5xx / socket errors
 * - Zero retry on 400, 401, 403, 404, or 429
 * - Safe error mapping to CareLink Step 9 standard operational errors
 * - Response schema validation (rejection of empty/malformed completions)
 */
class RealHttpAiProvider extends BaseAiProvider {
  constructor(config = aiConfig) {
    super();
    this.name = config.provider || 'real';
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs || 30000;
    this.maxTokens = config.maxTokens || 1000;
    this.temperature = config.temperature || 0.2;
    this.maxRetries = 2; // Bounded retry policy
  }

  /**
   * Dispatches completion request to the external LLM endpoint with retries and timeout.
   */
  async generateResponse({ systemPrompt, userPrompt, contextData, options = {} }) {
    // 1. Strict Credential Verification
    if (!this.apiKey || !this.apiKey.trim() || this.apiKey.includes('your_ai_api_key_here')) {
      throw new ServiceUnavailableError(
        'AI provider configuration error: API key is not configured.',
        'AI_CONFIG_ERROR'
      );
    }
    if (!this.model || !this.model.trim()) {
      throw new ServiceUnavailableError(
        'AI provider configuration error: AI model is not configured.',
        'AI_CONFIG_ERROR'
      );
    }

    // 2. Resolve Endpoint
    const endpoint = this.baseUrl
      ? (this.baseUrl.endsWith('/chat/completions') ? this.baseUrl : `${this.baseUrl}/chat/completions`)
      : 'https://api.openai.com/v1/chat/completions';

    // 3. Assemble Payload
    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature
    };

    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timer);

        // 4. Handle HTTP Status Codes Safely
        if (!response.ok) {
          const status = response.status;

          // Non-transient errors: DO NOT RETRY
          if (status === 401 || status === 403) {
            throw new ServiceUnavailableError(
              'AI provider authentication failed. Please verify server configuration.',
              'AI_AUTH_FAILED'
            );
          }
          if (status === 429) {
            throw new ServiceUnavailableError(
              'Upstream AI service is currently rate-limited. Please try again shortly.',
              'AI_RATE_LIMITED'
            );
          }
          if (status === 400) {
            throw new ServiceUnavailableError(
              'Upstream AI service rejected the prompt payload.',
              'AI_BAD_REQUEST'
            );
          }
          if (status === 404) {
            throw new ServiceUnavailableError(
              'Configured AI model or endpoint not found on upstream provider.',
              'AI_MODEL_NOT_FOUND'
            );
          }

          // Transient 5xx errors: Retry if within budget
          if (status >= 500 && attempt <= this.maxRetries) {
            await this._delay(attempt * 300);
            continue;
          }

          throw new ServiceUnavailableError(
            'Upstream AI service is temporarily unavailable.',
            'AI_UNAVAILABLE'
          );
        }

        // 5. Response Schema Validation
        let json;
        try {
          json = await response.json();
        } catch {
          throw new ServiceUnavailableError(
            'Received malformed JSON response from AI provider.',
            'AI_MALFORMED_RESPONSE'
          );
        }

        const completionText =
          json?.choices?.[0]?.message?.content ||
          json?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!completionText || typeof completionText !== 'string' || !completionText.trim()) {
          throw new ServiceUnavailableError(
            'Received empty or malformed completion from AI provider.',
            'AI_MALFORMED_RESPONSE'
          );
        }

        return completionText.trim();
      } catch (err) {
        clearTimeout(timer);

        // If it's already an operational AppError with a specific code, rethrow immediately
        if (err.isOperational) {
          throw err;
        }

        if (err.name === 'AbortError') {
          throw new ServiceUnavailableError('AI service request timed out.', 'AI_TIMEOUT');
        }

        // Network / Socket errors: transient retry
        if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(err.code) && attempt <= this.maxRetries) {
          await this._delay(attempt * 300);
          continue;
        }

        lastError = err;
        break;
      }
    }

    // Final fallback error wrapping
    throw new ServiceUnavailableError(
      'Unable to connect to upstream AI provider.',
      'AI_UNAVAILABLE'
    );
  }

  async summarize({ text, options = {} }) {
    if (!text) return 'No content provided to summarize.';
    return this.generateResponse({
      systemPrompt: 'You are a healthcare clinical summarizer. Provide concise, factual summaries without fabricating data.',
      userPrompt: `Summarize the following clinical document:\n\n${text}`,
      options
    });
  }

  async analyze({ data, prompt, options = {} }) {
    return this.generateResponse({
      systemPrompt: 'You are a clinical analysis engine. Analyze provided structured parameters factually.',
      userPrompt: `${prompt}\n\nClinical Data:\n${JSON.stringify(data, null, 2)}`,
      options
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to retrieve the active provider.
 * Enforces provider validation and guarantees that real provider errors
 * are never silently swallowed or defaulted back to mock.
 *
 * @param {object} [config=aiConfig]
 * @returns {BaseAiProvider}
 */
function getAiProvider(config = aiConfig) {
  const providerName = (config.provider || 'mock').trim().toLowerCase();

  // 1. Mock Provider
  if (providerName === 'mock') {
    return new MockAiProvider(config);
  }

  // 2. Real HTTP Provider
  if (['real', 'http', 'openai', 'gemini'].includes(providerName)) {
    if (!config.apiKey || !config.apiKey.trim() || config.apiKey.includes('your_ai_api_key_here')) {
      throw new ServiceUnavailableError(
        'AI provider configuration error: API key is not configured.',
        'AI_CONFIG_ERROR'
      );
    }
    if (!config.model || !config.model.trim()) {
      throw new ServiceUnavailableError(
        'AI provider configuration error: AI model is not configured.',
        'AI_CONFIG_ERROR'
      );
    }
    return new RealHttpAiProvider(config);
  }

  // 3. Unsupported Provider Name
  throw new ServiceUnavailableError(
    `Unsupported AI provider: '${providerName}'. Allowed providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
    'AI_CONFIG_ERROR'
  );
}

module.exports = {
  BaseAiProvider,
  MockAiProvider,
  RealHttpAiProvider,
  HttpAiProvider: RealHttpAiProvider, // Backward compatible alias
  getAiProvider
};
