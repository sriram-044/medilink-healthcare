require('dotenv').config();
const { validateEnv, sanitizeSecrets } = require('./config/env');
const { validateAiConfig } = require('./utils/ai/aiConfig');

// Enforce production secrets & configuration hardening
validateEnv();

// Enforce AI configuration validation at startup
const aiValidation = validateAiConfig();
if (!aiValidation.isValid) {
  throw new Error(`AI configuration error: ${aiValidation.error}`);
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('mongo-sanitize');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const requestIdMiddleware = require('./middleware/requestId');
const { errorHandler, apiNotFoundHandler } = require('./middleware/errorHandler');

const app = express();

// ─── Auth Cookie Helper (shared with routes via app.locals) ──────────────────
// Routes call: res.app.locals.setAuthCookie(res, token)
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
app.locals.setAuthCookie = (res, token) => {
  res.cookie('carelink_auth', token, {
    httpOnly: true,                                        // JS cannot read this cookie
    secure: process.env.NODE_ENV === 'production',        // HTTPS only in production
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  });
};
app.locals.clearAuthCookie = (res) => {
  res.clearCookie('carelink_auth', { httpOnly: true, path: '/' });
};

// Connect to MongoDB
connectDB();

// ─── Security Headers & Content Security Policy (CSP) ──────────────────────
const isProduction = process.env.NODE_ENV === 'production';
const isReportOnly = process.env.CSP_REPORT_ONLY === 'true';

const connectSrc = ["'self'", "https://carelink-api-3vzd.onrender.com", "https://accounts.google.com"];
if (process.env.CLIENT_URL && !connectSrc.includes(process.env.CLIENT_URL)) {
  connectSrc.push(process.env.CLIENT_URL);
}

const formAction = ["'self'", "https://accounts.google.com"];
if (process.env.CLIENT_URL && !formAction.includes(process.env.CLIENT_URL)) {
  formAction.push(process.env.CLIENT_URL);
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
      connectSrc,
      frameSrc: ["'self'", "https://accounts.google.com"],
      frameAncestors: ["'self'"],
      formAction,
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      reportUri: ['/api/csp-report'],
      upgradeInsecureRequests: isProduction ? [] : null
    },
    reportOnly: isReportOnly
  },
  crossOriginEmbedderPolicy: false
}));

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, 'http://localhost:5000']
  : ['http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS policy violation'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ─── Request Correlation ID ────────────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── Body Parsers & Cookie Parser ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());  // Required to read httpOnly auth cookie
app.use(morgan('dev'));

// ─── NoSQL Injection Sanitization ─────────────────────────────────────────
app.use((req, _res, next) => {
  req.body = mongoSanitize(req.body);
  req.query = mongoSanitize(req.query);
  req.params = mongoSanitize(req.params);
  next();
});

// ─── Rate Limiters ────────────────────────────────────────────────────────
const createRateLimitHandler = (message) => (req, res, _next, options) => {
  res.status(options.statusCode || 429).json({
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message,
      requestId: req.id
    },
    message
  });
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 20 : (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' ? 10000 : 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many login attempts. Please try again in 15 minutes.')
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' ? 10000 : 200,
  handler: createRateLimitHandler('Too many requests. Please slow down.')
});

// ─── Test-Only Rate Limit Reset ───────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/__test/reset-rate-limit', (req, res) => {
    const ips = [req.ip, '::1', '127.0.0.1', '::ffff:127.0.0.1'];
    ips.forEach(ip => {
      if (loginLimiter.resetKey) loginLimiter.resetKey(ip);
      if (apiLimiter.resetKey) apiLimiter.resetKey(ip);
    });
    res.status(200).json({ success: true, message: 'Rate limits reset for ' + ips.join(', ') });
  });
}

// Apply limiters
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

// ─── Session & Passport ───────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// ─── Static Files ─────────────────────────────────────────────────────────
// NOTE: /uploads is intentionally NOT served as a static directory.
// Medical files are protected by authentication and authorization.
// Access medical files through: GET /api/medical-reports/:id/view
//                            or: GET /api/medical-reports/:id/download
app.use('/uploads', (_req, res) => {
  res.status(404).json({ message: 'Direct file access is disabled. Use authenticated API endpoints.' });
});
app.use(express.static(path.join(__dirname, 'frontend')));

// ─── Scheduled Jobs ───────────────────────────────────────────────────────
require('./utils/scheduler');

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/googleAuth'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/medical-reports', require('./routes/medicalReports'));
app.use('/api/lab', require('./routes/lab'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/medication', require('./routes/medication'));
app.use('/api/pharmacy', require('./routes/pharmacy'));
app.use('/api/insurance', require('./routes/insurance'));
app.use('/api/emergency', require('./routes/emergency'));
app.use('/api/admin', require('./routes/admin'));

// ─── CSP Violation Reporting ───────────────────────────────────────────────
app.post('/api/csp-report', express.json({ type: ['application/json', 'application/csp-report'] }), (req, res) => {
  const report = req.body && (req.body['csp-report'] || req.body);
  if (report) {
    console.warn('[CSP VIOLATION REPORT]', {
      blockedURI: report['blocked-uri'] || report.blockedURL,
      violatedDirective: report['violated-directive'] || report.effectiveDirective,
      documentURI: report['document-uri'] || report.documentURL,
      disposition: report.disposition || (isReportOnly ? 'report-only' : 'enforce')
    });
  }
  res.status(204).end();
});

// ─── Health Check ─────────────────────────────────────────────────────────
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({ status: 'CareLink API is running ✅', timestamp: new Date() });
});

// ─── 404 API Route Handler ────────────────────────────────────────────────
app.all('/api/*', apiNotFoundHandler);

// ─── Catch-all: serve frontend SPA ────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ─── Centralized Error Handler ─────────────────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🏥 CareLink Server Running         ║
  ║   Port: ${PORT}                          ║
  ║   URL:  http://localhost:${PORT}         ║
  ║   Mode: ${process.env.NODE_ENV || 'development'}                   ║
  ╚═══════════════════════════════════════╝
  `);
});

// Initialize WebSocket server
const { initSocket } = require('./utils/socket');
initSocket(server);

module.exports = app;
