/**
 * config/env.js — Environment Configuration & Secrets Hardening
 *
 * Enforces production security requirements:
 * 1. Required secrets (JWT_SECRET, SESSION_SECRET, MONGODB_URI/MONGO_URI) must exist in production.
 * 2. Secrets must meet minimum strength requirements (>= 32 characters) in production.
 * 3. Insecure hardcoded fallbacks and common weak patterns are strictly rejected in production.
 * 4. Google OAuth credentials are validated when Google OAuth is enabled.
 * 5. Provides secret-safe sanitization utilities to prevent credential leaks in logs and error traces.
 * 6. Keeps development and test environments developer-friendly without breaking local workflows.
 */

// List of known insecure fallbacks, placeholders, and weak default patterns
const WEAK_SECRETS_BLACKLIST = new Set([
  'secret',
  'password',
  '123456',
  '12345678',
  'admin',
  'carelink',
  'carelink_session_secret',
  'carelink_google_session_2024',
  'carelink_super_secret_jwt_key_2024_healthcare_ai',
  'your_super_secret_jwt_key_change_in_production',
  'your_super_secret_session_key_change_in_production',
  'replace_with_a_secure_random_secret',
  'replace_with_a_secure_random_secret_at_least_32_chars_long',
  'your_google_client_id_here',
  'your_google_client_secret_here',
  'your_mongodb_connection_string'
]);

const MIN_SECRET_LENGTH = 32;

/**
 * Checks if a secret value is weak or matches a known fallback/placeholder.
 * @param {string} secret
 * @returns {boolean}
 */
function isWeakSecret(secret) {
  if (!secret || typeof secret !== 'string') return true;
  const trimmed = secret.trim();
  if (trimmed.length < MIN_SECRET_LENGTH) return true;
  const lower = trimmed.toLowerCase();
  if (WEAK_SECRETS_BLACKLIST.has(lower)) return true;
  // Reject single repeated character strings (e.g. 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  if (/^(.)\1+$/.test(trimmed)) return true;
  return false;
}

/**
 * Sanitizes strings, URLs, and errors to prevent leaking credentials in logs.
 * Masks credentials in MongoDB URIs and removes potential secret patterns.
 * @param {string} text
 * @returns {string}
 */
function sanitizeSecrets(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    // Mask username:password in database URIs (e.g. mongodb://user:pass@host -> mongodb://***:***@host)
    .replace(/\/\/[^@\s]+@/g, '//***:***@')
    // Mask query params or headers that look like tokens or secrets
    .replace(/((?:jwt|session|client|secret|password|access_token)=)[^\s&]+/gi, '$1***');
}

/**
 * Validates environment variables according to the current NODE_ENV.
 * Throws a clean generic diagnostic Error if production configuration is invalid.
 * Never prints or displays secret values.
 *
 * @param {object} [env=process.env]
 * @returns {object} validated config summary
 */
function validateEnv(env = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const errors = [];

  // ─── 1. MongoDB Configuration Validation ──────────────────────────────────
  const mongoUri = env.MONGODB_URI || env.MONGO_URI;
  if (isProduction) {
    if (!mongoUri || !mongoUri.trim()) {
      errors.push('MONGODB_URI (or MONGO_URI) is required in production.');
    } else {
      const trimmedUri = mongoUri.trim();
      if (!trimmedUri.startsWith('mongodb://') && !trimmedUri.startsWith('mongodb+srv://')) {
        errors.push('MONGODB_URI must be a valid MongoDB connection string (mongodb:// or mongodb+srv://).');
      }
    }
  }

  // ─── 2. JWT Secret Validation ─────────────────────────────────────────────
  const jwtSecret = env.JWT_SECRET;
  if (isProduction) {
    if (!jwtSecret || !jwtSecret.trim()) {
      errors.push('JWT_SECRET is required in production.');
    } else if (WEAK_SECRETS_BLACKLIST.has(jwtSecret.trim().toLowerCase())) {
      errors.push('JWT_SECRET uses an insecure default fallback or known weak secret.');
    } else if (jwtSecret.trim().length < MIN_SECRET_LENGTH) {
      errors.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long in production.`);
    } else if (isWeakSecret(jwtSecret)) {
      errors.push('JWT_SECRET is too weak or uses an insecure pattern.');
    }
  } else if (!jwtSecret) {
    if (isTest) {
      env.JWT_SECRET = 'carelink_deterministic_test_jwt_secret_32_characters_minimum!';
    } else {
      console.warn('⚠️ [DEV CONFIG] JWT_SECRET is not set. Using temporary local development key.');
      env.JWT_SECRET = 'carelink_local_dev_jwt_secret_32_characters_minimum!';
    }
  }

  // ─── 3. Session Secret Validation ─────────────────────────────────────────
  const sessionSecret = env.SESSION_SECRET;
  if (isProduction) {
    if (!sessionSecret || !sessionSecret.trim()) {
      errors.push('SESSION_SECRET is required in production.');
    } else if (WEAK_SECRETS_BLACKLIST.has(sessionSecret.trim().toLowerCase())) {
      errors.push('SESSION_SECRET uses an insecure default fallback or known weak secret.');
    } else if (sessionSecret.trim().length < MIN_SECRET_LENGTH) {
      errors.push(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters long in production.`);
    } else if (isWeakSecret(sessionSecret)) {
      errors.push('SESSION_SECRET is too weak or uses an insecure pattern.');
    }
  } else if (!sessionSecret) {
    if (isTest) {
      env.SESSION_SECRET = 'carelink_deterministic_test_session_secret_32_chars_min!';
    } else {
      console.warn('⚠️ [DEV CONFIG] SESSION_SECRET is not set. Using temporary local development key.');
      env.SESSION_SECRET = 'carelink_local_dev_session_secret_32_chars_min!';
    }
  }

  // ─── 4. Google OAuth Configuration Validation ─────────────────────────────
  const googleClientId = env.GOOGLE_CLIENT_ID;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET;
  const googleAuthEnabled = env.ENABLE_GOOGLE_AUTH === 'true' || Boolean(googleClientId || googleClientSecret);

  if (isProduction && googleAuthEnabled) {
    if (!googleClientId || !googleClientId.trim()) {
      errors.push('GOOGLE_CLIENT_ID is required when Google OAuth is enabled.');
    } else if (googleClientId.includes('your_google_client_id')) {
      errors.push('GOOGLE_CLIENT_ID must not be a placeholder value.');
    }

    if (!googleClientSecret || !googleClientSecret.trim()) {
      errors.push('GOOGLE_CLIENT_SECRET is required when Google OAuth is enabled.');
    } else if (googleClientSecret.includes('your_google_client_secret')) {
      errors.push('GOOGLE_CLIENT_SECRET must not be a placeholder value.');
    }
  }

  // ─── 5. Client URL Validation (if configured) ─────────────────────────────
  if (env.CLIENT_URL && env.CLIENT_URL.trim()) {
    try {
      new URL(env.CLIENT_URL.trim());
    } catch {
      if (isProduction) {
        errors.push('CLIENT_URL must be a valid URL.');
      }
    }
  }

  // ─── 6. Evaluation ────────────────────────────────────────────────────────
  if (errors.length > 0) {
    const errorList = errors.map(e => `  - ${e}`).join('\n');
    throw new Error(`Production configuration error:\n${errorList}`);
  }

  return {
    nodeEnv,
    isProduction,
    isTest,
    hasMongoUri: Boolean(mongoUri),
    hasJwtSecret: Boolean(env.JWT_SECRET),
    hasSessionSecret: Boolean(env.SESSION_SECRET),
    googleAuthConfigured: Boolean(googleClientId && googleClientSecret && !googleClientId.includes('your_google_client_id'))
  };
}

module.exports = {
  validateEnv,
  isWeakSecret,
  sanitizeSecrets,
  MIN_SECRET_LENGTH,
  WEAK_SECRETS_BLACKLIST
};
