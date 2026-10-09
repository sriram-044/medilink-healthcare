/**
 * test_step5_secrets_security.js — Production Secrets & Configuration Hardening Test Suite
 *
 * Verifies all requirements of Step 5:
 * A. Production JWT secret required
 * B. Production session secret required
 * C. No insecure production fallback
 * D. Weak secret rejection
 * E. .env ignored
 * F. .env.example safe
 * G. MongoDB configuration
 * H. Google OAuth configuration
 * I. Secret logging protection
 * J. Existing authentication (login)
 * K. Cookie authentication (/api/auth/me)
 * L. Logout clears authentication
 * M. Google OAuth flow compatibility (Step 1 flow intact)
 * N. CSP security headers active (Step 4 intact)
 *
 * Usage: node test_step5_secrets_security.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import configuration utilities under test
const {
  validateEnv,
  isWeakSecret,
  sanitizeSecrets,
  MIN_SECRET_LENGTH,
  WEAK_SECRETS_BLACKLIST
} = require('./config/env');

let passedCount = 0;
let failedCount = 0;
const testResults = [];

function recordTest(testId, name, pass, detail = '') {
  if (pass) {
    passedCount++;
    testResults.push({ id: testId, name, status: 'PASS', detail });
    console.log(`  ✅ [PASS] [${testId}] ${name}`);
  } else {
    failedCount++;
    testResults.push({ id: testId, name, status: 'FAIL', detail });
    console.error(`  ❌ [FAIL] [${testId}] ${name}: ${detail}`);
  }
}

// Synthetic, unguessable test secrets (synthetic ONLY — never real production secrets)
const VALID_SYNTHETIC_JWT_SECRET = 'synthetic_test_jwt_secret_valid_and_secure_for_testing_purposes_only_64b!';
const VALID_SYNTHETIC_SESSION_SECRET = 'synthetic_test_session_secret_valid_and_secure_for_testing_only_64bits!';
const VALID_SYNTHETIC_MONGO_URI = 'mongodb://127.0.0.1:27017/carelink_test_synthetic';

// HTTP helper
function makeRequest(baseUrl, method, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const headers = options.headers || {};
    let bodyData = null;

    if (options.body) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          raw
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function extractCookie(headers, cookieName) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookieList = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookieList) {
    if (c.startsWith(`${cookieName}=`)) {
      return c.split(';')[0];
    }
  }
  return null;
}

async function runAllTests() {
  console.log('\n🔒 Starting Step 5 — Production Secrets & Configuration Hardening Verification...\n');

  // ============================================================================
  // Test A: Production JWT Secret Required
  // ============================================================================
  try {
    let threw = false;
    let errorMsg = '';
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
        // JWT_SECRET is intentionally missing
      });
    } catch (err) {
      threw = true;
      errorMsg = err.message;
    }
    const passes = threw && errorMsg.includes('JWT_SECRET is required');
    recordTest('Test A', 'Production JWT secret is strictly required (missing secret causes failure)', passes, errorMsg);
  } catch (err) {
    recordTest('Test A', 'Production JWT secret required', false, err.message);
  }

  // ============================================================================
  // Test B: Production Session Secret Required
  // ============================================================================
  try {
    let threw = false;
    let errorMsg = '';
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: VALID_SYNTHETIC_JWT_SECRET
        // SESSION_SECRET is intentionally missing
      });
    } catch (err) {
      threw = true;
      errorMsg = err.message;
    }
    const passes = threw && errorMsg.includes('SESSION_SECRET is required');
    recordTest('Test B', 'Production SESSION_SECRET is strictly required when session middleware is used', passes, errorMsg);
  } catch (err) {
    recordTest('Test B', 'Production session secret required', false, err.message);
  }

  // ============================================================================
  // Test C: No Insecure Production Fallback
  // ============================================================================
  try {
    // 1. Verify server.js does not contain hardcoded fallback 'carelink_session_secret'
    const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const hasOldSessionFallback = serverSource.includes("'carelink_session_secret'") || serverSource.includes('"carelink_session_secret"');

    // 2. Verify validation rejects passing the old fallback string as an env variable in production
    let rejectedOldSessionFallback = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: VALID_SYNTHETIC_JWT_SECRET,
        SESSION_SECRET: 'carelink_session_secret' // The old insecure fallback
      });
    } catch (err) {
      rejectedOldSessionFallback = err.message.includes('SESSION_SECRET is too weak') || err.message.includes('insecure default');
    }

    let rejectedOldJwtFallback = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: 'carelink_super_secret_jwt_key_2024_healthcare_ai', // Old Docker fallback
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
      });
    } catch (err) {
      rejectedOldJwtFallback = err.message.includes('JWT_SECRET is too weak') || err.message.includes('insecure default');
    }

    const passes = !hasOldSessionFallback && rejectedOldSessionFallback && rejectedOldJwtFallback;
    recordTest('Test C', 'Old hardcoded fallbacks are completely removed and strictly rejected in production', passes);
  } catch (err) {
    recordTest('Test C', 'No insecure production fallback', false, err.message);
  }

  // ============================================================================
  // Test D: Weak Secret Rejection
  // ============================================================================
  try {
    const weakCandidates = ['secret', 'password', '123456', 'short', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
    let allRejected = true;

    for (const weak of weakCandidates) {
      try {
        validateEnv({
          NODE_ENV: 'production',
          MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
          JWT_SECRET: weak,
          SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
        });
        allRejected = false;
        break;
      } catch (err) {
        // Expected to fail validation
      }
    }

    // Also verify length requirement
    const under32 = 'secret_that_is_only_31_char_lon';
    assert.strictEqual(under32.length, 31);
    let lengthRejected = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: under32,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
      });
    } catch (err) {
      lengthRejected = err.message.includes('at least 32 characters');
    }

    const passes = allRejected && lengthRejected;
    recordTest('Test D', 'Obviously weak secrets and secrets shorter than 32 characters are rejected in production', passes);
  } catch (err) {
    recordTest('Test D', 'Weak secret rejection', false, err.message);
  }

  // ============================================================================
  // Test E: .env Ignored by .gitignore
  // ============================================================================
  try {
    const gitignoreContent = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
    const hasDotEnv = /^\.env$/m.test(gitignoreContent);
    const hasDotEnvWildcard = /^\.env\.\*$/m.test(gitignoreContent);
    const hasDotEnvExampleNegation = /^!\.env\.example$/m.test(gitignoreContent);

    const passes = hasDotEnv && hasDotEnvWildcard && hasDotEnvExampleNegation;
    recordTest('Test E', '.gitignore protects .env and .env.* while preserving .env.example', passes,
      `hasDotEnv: ${hasDotEnv}, hasWildcard: ${hasDotEnvWildcard}, hasExampleExclusion: ${hasDotEnvExampleNegation}`);
  } catch (err) {
    recordTest('Test E', '.env ignored by git', false, err.message);
  }

  // ============================================================================
  // Test F: .env.example Safe & Contains Placeholders Only
  // ============================================================================
  try {
    const exampleContent = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');

    // Must define standard configuration variables
    const hasPort = exampleContent.includes('PORT=');
    const hasNodeEnv = exampleContent.includes('NODE_ENV=');
    const hasMongo = exampleContent.includes('MONGODB_URI=') || exampleContent.includes('MONGO_URI=');
    const hasJwt = exampleContent.includes('JWT_SECRET=');
    const hasSession = exampleContent.includes('SESSION_SECRET=');

    // Must NOT contain real sensitive patterns or leaked passwords
    const noRealMongoPass = !exampleContent.includes('mongodb+srv://') || exampleContent.includes('your_mongodb_connection_string');
    const hasPlaceholders = exampleContent.includes('replace_with_') || exampleContent.includes('your_');

    const passes = hasPort && hasNodeEnv && hasMongo && hasJwt && hasSession && noRealMongoPass && hasPlaceholders;
    recordTest('Test F', '.env.example contains configuration template placeholders and no real credentials', passes);
  } catch (err) {
    recordTest('Test F', '.env.example safe', false, err.message);
  }

  // ============================================================================
  // Test G: MongoDB Configuration Enforced in Production
  // ============================================================================
  try {
    // 1. Missing MongoDB URI in production fails
    let missingMongoFailed = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_SYNTHETIC_JWT_SECRET,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
        // MONGODB_URI missing
      });
    } catch (err) {
      missingMongoFailed = err.message.includes('MONGODB_URI (or MONGO_URI) is required');
    }

    // 2. Invalid URI format fails
    let invalidFormatFailed = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'http://not-a-mongo-uri.com',
        JWT_SECRET: VALID_SYNTHETIC_JWT_SECRET,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
      });
    } catch (err) {
      invalidFormatFailed = err.message.includes('valid MongoDB connection string');
    }

    const passes = missingMongoFailed && invalidFormatFailed;
    recordTest('Test G', 'Production requires valid MongoDB URI and prevents silent unconfigured database connection', passes);
  } catch (err) {
    recordTest('Test G', 'MongoDB configuration in production', false, err.message);
  }

  // ============================================================================
  // Test H: Google OAuth Configuration Hardening
  // ============================================================================
  try {
    // 1. If Google OAuth is enabled in production, missing credentials fail
    let missingGoogleFailed = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: VALID_SYNTHETIC_JWT_SECRET,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET,
        ENABLE_GOOGLE_AUTH: 'true'
        // GOOGLE_CLIENT_ID missing
      });
    } catch (err) {
      missingGoogleFailed = err.message.includes('GOOGLE_CLIENT_ID is required');
    }

    // 2. Placeholder credentials fail
    let placeholderFailed = false;
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: VALID_SYNTHETIC_JWT_SECRET,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET,
        GOOGLE_CLIENT_ID: 'your_google_client_id_here',
        GOOGLE_CLIENT_SECRET: 'your_google_client_secret_here'
      });
    } catch (err) {
      placeholderFailed = err.message.includes('must not be a placeholder value');
    }

    const passes = missingGoogleFailed && placeholderFailed;
    recordTest('Test H', 'Google OAuth configuration requires real credentials when enabled in production', passes);
  } catch (err) {
    recordTest('Test H', 'Google OAuth configuration', false, err.message);
  }

  // ============================================================================
  // Test I: Secret Logging Protection & Error Sanitization
  // ============================================================================
  try {
    const rawError = 'Failed to connect to mongodb://dbuser:super_secret_password_123@cluster0.abc.mongodb.net/carelink';
    const sanitized = sanitizeSecrets(rawError);

    const doesNotContainPassword = !sanitized.includes('super_secret_password_123');
    const masksCredentials = sanitized.includes('//***:***@');

    // Check that validateEnv error messages never print secret values
    let secretLeakInError = false;
    const testSecret = 'leaked_secret_val_1234567890123456';
    try {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: VALID_SYNTHETIC_MONGO_URI,
        JWT_SECRET: testSecret,
        SESSION_SECRET: VALID_SYNTHETIC_SESSION_SECRET
      });
    } catch (err) {
      if (err.message.includes(testSecret)) {
        secretLeakInError = true;
      }
    }

    const passes = doesNotContainPassword && masksCredentials && !secretLeakInError;
    recordTest('Test I', 'Database URIs and sensitive configuration errors are sanitized without leaking secrets', passes);
  } catch (err) {
    recordTest('Test I', 'Secret logging protection', false, err.message);
  }

  // ============================================================================
  // Tests J, K, L, M, N: Live Integration & Flow Verification
  // ============================================================================
  let mongod = null;
  let serverInstance = null;
  let app = null;
  let liveBaseUrl = '';
  let authCookie = null;

  try {
    // Spin up MongoMemoryServer for safe, isolated test environment
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    process.env.MONGODB_URI = mongoUri;
    process.env.MONGO_URI = mongoUri;
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.JWT_SECRET = VALID_SYNTHETIC_JWT_SECRET;
    process.env.SESSION_SECRET = VALID_SYNTHETIC_SESSION_SECRET;

    // Load server with validated environment
    app = require('./server');
    serverInstance = app.listen(0);
    const dynamicPort = serverInstance.address().port;
    liveBaseUrl = `http://localhost:${dynamicPort}`;

    // Seed a test user
    const User = require('./models/User');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('demo123', salt);

    await User.deleteMany({});
    const testUser = await new User({
      name: 'Rajan Kumar',
      email: 'patient.step5@test.com',
      password: passwordHash,
      role: 'patient',
      isActive: true
    }).save();

    // ─── Test J: Existing Authentication (Login) ──────────────────────────────
    const loginRes = await makeRequest(liveBaseUrl, 'POST', '/api/auth/login', {
      body: { email: 'patient.step5@test.com', password: 'demo123' }
    });

    authCookie = extractCookie(loginRes.headers, 'carelink_auth');
    const loginPass = loginRes.status === 200 &&
      authCookie !== null &&
      loginRes.body.user &&
      loginRes.body.user.email === 'patient.step5@test.com' &&
      !loginRes.body.token && // No token in JSON body
      loginRes.headers['set-cookie'].some(c => c.includes('HttpOnly'));

    recordTest('Test J', 'Normal authentication succeeds and issues secure httpOnly cookie (no token in body)', loginPass);

    // ─── Test K: Cookie Authentication (/api/auth/me) ─────────────────────────
    const meRes = await makeRequest(liveBaseUrl, 'GET', '/api/auth/me', {
      headers: { Cookie: authCookie }
    });

    const mePass = meRes.status === 200 &&
      meRes.body.authenticated === true &&
      meRes.body.user &&
      meRes.body.user.email === 'patient.step5@test.com' &&
      !meRes.body.token;

    recordTest('Test K', '/api/auth/me authenticates via httpOnly cookie without returning JWT token', mePass);

    // ─── Test L: Logout Clears Authentication ─────────────────────────────────
    const logoutRes = await makeRequest(liveBaseUrl, 'POST', '/api/auth/logout', {
      headers: { Cookie: authCookie }
    });

    const logoutCookie = extractCookie(logoutRes.headers, 'carelink_auth');
    const cookieCleared = logoutRes.status === 200 &&
      (logoutCookie === null || logoutCookie.includes('carelink_auth=;') || logoutRes.headers['set-cookie'].some(c => c.includes('Expires=') || c.includes('Max-Age=0')));

    // Verify subsequent request without valid cookie is rejected with 401
    const meAfterLogout = await makeRequest(liveBaseUrl, 'GET', '/api/auth/me');
    const unauthorizedAfterLogout = meAfterLogout.status === 401;

    const logoutPass = cookieCleared && unauthorizedAfterLogout;
    recordTest('Test L', 'Logout successfully clears authentication cookie and denies subsequent access', logoutPass);

    // ─── Test M: Google OAuth Flow Compatibility (Step 1 Flow Intact) ─────────
    // Check that /auth/google and /auth/google/callback routes are active
    const googleRes = await makeRequest(liveBaseUrl, 'GET', '/auth/google');
    // If not configured with Google Cloud credentials, returns 503 safe response
    // If configured, redirects (302) to Google
    const googlePass = (googleRes.status === 503 || googleRes.status === 302);
    recordTest('Test M', 'Google OAuth routes are mounted and handle unconfigured credentials safely', googlePass);

    // ─── Test N: CSP Security Headers Active (Step 4 Intact) ──────────────────
    const cspCheckRes = await makeRequest(liveBaseUrl, 'GET', '/api/health');
    const cspHeader = cspCheckRes.headers['content-security-policy'];
    const hasCsp = Boolean(cspHeader) &&
      cspHeader.includes("default-src 'self'") &&
      cspHeader.includes('script-src') &&
      cspHeader.includes('connect-src');

    // Test CSP violation reporting endpoint from Step 4
    const cspReportRes = await makeRequest(liveBaseUrl, 'POST', '/api/csp-report', {
      body: { 'csp-report': { 'blocked-uri': 'http://malicious-tracker.com/evil.js', 'violated-directive': 'script-src' } }
    });
    const cspReportPass = cspReportRes.status === 204;

    const cspPass = hasCsp && cspReportPass;
    recordTest('Test N', 'Step 4 CSP headers and violation reporting endpoint remain fully functional', cspPass);

  } catch (err) {
    recordTest('Tests J-N', 'Live integration tests execution', false, err.message);
  } finally {
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }

  // ============================================================================
  // Test Summary Report
  // ============================================================================
  console.log('\n========================================');
  console.log(`Step 5 Secrets Security Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
