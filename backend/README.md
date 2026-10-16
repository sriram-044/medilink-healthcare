# MediLink AI — Backend API Tier

The MediLink AI backend is an enterprise Node.js and Express.js REST API with integrated WebSockets, automated security hardening, and asynchronous task scheduling.

---

## 1. Directory Structure

```
backend/
│
├── server.js                 # Application bootstrap and server entry point
│
├── config/                   # System configuration & environment guards
│   ├── db.js                 # MongoDB connection manager (Atlas & in-memory fallback)
│   ├── env.js                # Production secrets validator, entropy checker & sanitization
│   └── passport.js           # Google OAuth 2.0 Passport strategy
│
├── routes/                   # Express HTTP API routes
│   ├── auth.js               # Registration, login, logout, /api/auth/me
│   ├── patients.js           # Patient records, allergies, Lifetime EHR history
│   ├── vitals.js             # Telemetric vitals ingestion
│   ├── doctors.js            # Doctor dashboard and patient assignments
│   ├── hospitals.js          # Nearby hospital locator & trauma status
│   ├── emergency.js          # Complete SOS emergency dispatch and lifecycle
│   ├── lab.js                # Laboratory test orders, samples, barcode generation
│   ├── pharmacy.js           # Medication orders and dispensing
│   ├── insurance.js          # Insurance claim lifecycle
│   └── ai.js                 # Clinical AI assistant queries
│
├── controllers/              # Modular request handlers
│   ├── authController.js
│   ├── patientController.js
│   ├── emergencyController.js
│   └── index.js
│
├── services/                 # Business logic and integrations
│   ├── emergency/            # Dispatch, SOS lifecycle, SMS notifications
│   ├── wearable/             # Telemetry drift simulation, critical threshold detection
│   ├── notifications/        # Cross-portal notification dispatcher
│   ├── hospitals/            # Geospatial haversine calculation & hospital routing
│   └── ai/                   # Multi-LLM provider, RAG, and NLP engines
│
├── middleware/               # HTTP middleware pipeline
│   ├── auth.js               # JWT verification (HttpOnly cookie & Bearer token fallback)
│   ├── errorHandler.js       # Centralized JSON error mask & API 404 handler
│   ├── requestId.js          # Request correlation ID injector (`x-request-id`)
│   └── role.js               # Role-based access control (RBAC) guard
│
├── models/                   # Mongoose ODM schemas & database indexes
│   ├── Alert.js              # Biometric threshold alerts
│   ├── EmergencyCase.js      # SOS incident lifecycle & GPS telemetry
│   ├── HospitalVisit.js      # Patient clinical encounters
│   ├── InsuranceClaim.js     # Insurance claims
│   ├── MedicalReport.js      # Diagnostic reports & AI summaries
│   ├── Medication.js         # Prescriptions & personalized diet plans
│   ├── Notification.js       # In-app and push notification feed
│   ├── Report.js             # Legacy report schema
│   ├── Sample.js             # Biospecimen tracking & barcodes
│   ├── TestRequest.js        # Laboratory test orders
│   ├── User.js               # System accounts & emergency contacts
│   └── VitalSigns.js         # Telemetric sensor time-series data
│
├── validators/               # Input validation schemas & guards
├── sockets/                  # Socket.IO handlers
├── jobs/                     # Scheduled cron jobs (node-cron)
├── utils/                    # Shared backend utilities
│
├── tests/                    # Categorized test suites
│   ├── unit/                 # Isolated module & logic unit tests
│   ├── integration/          # HTTP API & route integration tests
│   ├── security/             # CSP, IDOR, secrets, input security tests
│   ├── regression/           # Full system quality gate & regression suites
│   └── run_all_tests.js      # Categorized test runner
│
├── uploads/                  # Protected medical report storage
│   └── temp/                 # Temporary staging folder
│
├── package.json              # Dependencies and scripts
├── package-lock.json
├── Dockerfile                # Production container definition
├── Dockerfile.dev            # Development container definition
├── .dockerignore             # Docker build exclusions
├── .gitignore                # Package-level git exclusions
└── README.md                 # This backend documentation
```

---

## 2. Running & Developing the Backend

### Installation
```bash
cd backend
npm install
```

### Local Development
```bash
# Starts server on http://localhost:5000 with in-memory MongoDB fallback
npm start

# Or with nodemon hot-reloading
npm run dev
```

### Running Automated Tests
```bash
# In-Memory Unit & Integration Tests (no pre-started server needed)
node test_emergency_system.js
node test_emergency_sos_architecture.js
node test_step6_mongodb_queries.js
node test_step7_mongodb_indexes.js
node test_step8_pagination.js
node test_step9_error_handling.js
node test_step4_csp_security.js
node test_step5_secrets_security.js

# Full-System Master Regression Suite (with server running on :5000)
node run_all_tests.js
```

---

## 3. Adding New Backend Features

### Adding a Route
1. Create `backend/routes/<feature>.js`.
2. Define router: `const router = express.Router();`.
3. Protect routes with `authMiddleware` (`middleware/auth.js`) and role checks (`middleware/role.js`).
4. Mount the router in `backend/server.js`: `app.use('/api/<feature>', require('./routes/<feature>'));`.

### Adding a Model
1. Create `backend/models/<ModelName>.js`.
2. Define schema and declare explicit indexes via `schema.index(...)`.
3. Export model: `module.exports = mongoose.model('<ModelName>', schema);`.
4. Document the model in `database/README.md`.
