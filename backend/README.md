# MediLink AI — Backend API Tier

The MediLink AI backend is an enterprise Node.js and Express.js REST API with integrated WebSockets, automated security hardening, and asynchronous task scheduling.

---

## 1. Directory Structure

```
backend/
│
├── cert/                     # SSL/TLS certificates for HTTPS termination
│   └── cert.crt
│
├── config/                   # System configuration & environment guards
│   ├── db.js                 # MongoDB connection manager (Atlas & in-memory fallback)
│   ├── env.js                # Production secrets validator, entropy checker & sanitization
│   └── passport.js           # Google OAuth 2.0 Passport strategy
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
├── routes/                   # Express route definitions
│   ├── admin.js              # System analytics, user administration, audit logs
│   ├── ai.js                 # Clinical AI assistant queries
│   ├── alerts.js             # Biometric alerts CRUD
│   ├── auth.js               # Registration, login, logout, /api/auth/me
│   ├── emergency.js          # Complete SOS emergency dispatch and lifecycle
│   ├── googleAuth.js         # OAuth redirect and callback routes
│   ├── insurance.js          # Insurance claim lifecycle
│   ├── lab.js                # Laboratory test orders, samples, barcode generation
│   ├── medicalReports.js     # Validated file uploads, secure streaming preview, EHR publish
│   ├── medication.js         # Prescriptions and diet plans
│   ├── patients.js           # Patient records, allergies, Lifetime EHR history
│   ├── pharmacy.js           # Medication orders and dispensing
│   ├── reports.js            # Legacy reports
│   └── vitals.js             # Telemetric vitals ingestion
│
├── utils/                    # Business logic, services & helper modules
│   ├── ai/                   # Modular LLM & RAG architecture
│   ├── aiEngine.js           # Vitals anomaly detection engine
│   ├── autoSeed.js           # In-memory and development initial data seeder
│   ├── criticalDetection.js  # Critical biometric threshold evaluator
│   ├── documentIntelligence.js # PDF & text extraction for reports
│   ├── emergencyCommunicationService.js # SMS and push dispatcher
│   ├── emergencyEngine.js    # Multi-party emergency alert coordinator
│   ├── emergencySosService.js # SOS service & vitals anomaly evaluator
│   ├── errors.js             # Custom operational error classes
│   ├── fileValidator.js      # Magic-byte and MIME file security
│   ├── notificationService.js # Cross-portal notification dispatcher
│   ├── paginationHelper.js   # Production-safe pagination parser
│   ├── queryHelper.js        # Sanitized MongoDB search & date builder
│   ├── reportAiEngine.js     # Report AI analysis generator
│   ├── scheduler.js          # Background cron jobs (node-cron)
│   ├── socket.js             # Socket.IO WebSocket gateway
│   └── storageService.js     # Local protected file storage manager
│
├── uploads/                  # Protected medical report storage
│   └── temp/                 # Temporary staging folder
│
├── server.js                 # Application bootstrap and server entry point
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
