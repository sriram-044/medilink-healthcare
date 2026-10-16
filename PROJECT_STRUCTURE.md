# MediLink AI — Architectural Project Structure & Codebase Organization

> **MediLink AI (CareLink)** is an enterprise multi-portal healthcare management ecosystem featuring real-time patient biometric monitoring, wearable sensor telemetry, clinical decision support, lifetime electronic health records (EHR), multi-category laboratory diagnostics, an SOS Emergency Response System, and turnkey Docker/Compose orchestration.

---

## 1. Executive Architecture Overview

```
                                      ┌─────────────────────────────────────────┐
                                      │         🌐 CLIENT INTERFACES            │
                                      ├────────────────────┬────────────────────┤
                                      │  Web Portals (8)   │  Android App (Kts) │
                                      │  (HTML5/CSS3/JS)   │  (Jetpack Compose) │
                                      └─────────┬──────────┴──────────┬─────────┘
                                                │                     │
                                                ▼                     ▼
                                      ┌─────────────────────────────────────────┐
                                      │      🛡️ NGINX / REVERSE PROXY & CSP      │
                                      └────────────────────┬────────────────────┘
                                                           │
                                                           ▼
                                      ┌─────────────────────────────────────────┐
                                      │      🚀 EXPRESS.JS REST API & WS        │
                                      │  ├── Helmet Security & Rate Limiting    │
                                      │  ├── JWT HttpOnly Cookie Auth & RBAC   │
                                      │  ├── Request Correlation ID Tracker     │
                                      │  └── NoSQL Sanitization & Error Masking │
                                      └─────┬──────────────┬──────────────┬─────┘
                                            │              │              │
                       ┌────────────────────┘              │              └────────────────────┐
                       ▼                                   ▼                                   ▼
        ┌─────────────────────────────┐     ┌─────────────────────────────┐     ┌─────────────────────────────┐
        │   🚨 SOS EMERGENCY ENGINE   │     │   🧠 CLINICAL AI & RAG      │     │   🧪 LAB & DIAGNOSTICS      │
        │  ├── 8-Stage Case Lifecycle │     │  ├── Risk Scoring Engine    │     │  ├── Multi-Format Ingestion │
        │  ├── GPS Telemetry & Audit  │     │  ├── Report Summarizer      │     │  ├── Barcode Biospecimens   │
        │  └── Multi-Party Dispatch   │     │  └── Multi-Model LLM Guard  │     │  └── Lifetime EHR Records   │
        └──────────────┬──────────────┘     └──────────────┬──────────────┘     └──────────────┬──────────────┘
                       │                                   │                                   │
                       └───────────────────────────────────┼───────────────────────────────────┘
                                                           │
                                                           ▼
                                      ┌─────────────────────────────────────────┐
                                      │          💾 PERSISTENCE TIER            │
                                      │  ├── MongoDB (Persistent & In-Memory)   │
                                      │  ├── Protected File Storage (/uploads)  │
                                      │  └── GridFS / Cloud Blob Storage        │
                                      └─────────────────────────────────────────┘
```

---

## 2. Current Folder Structure

```
medilink-ai/
│
├── frontend/                         # All website frontend code
│   │
│   ├── pages/                        # HTML pages for each portal
│   │   ├── index.html                # Login / landing page
│   │   ├── patient.html              # Patient portal
│   │   ├── doctor.html               # Doctor portal
│   │   ├── admin.html                # Admin / hospital portal
│   │   ├── lab.html                  # Laboratory portal
│   │   ├── pharmacy.html             # Pharmacy portal
│   │   ├── insurance.html            # Insurance portal
│   │   ├── emergency.html            # Emergency command dashboard
│   │   └── auth-success.html         # OAuth callback page
│   │
│   ├── assets/                       # Static assets
│   │   ├── images/
│   │   ├── icons/
│   │   └── fonts/
│   │
│   ├── css/                          # Stylesheets
│   │   ├── style.css                 # Master design system & component styles
│   │   ├── components/               # Modular component stylesheets
│   │   └── pages/                    # Page-specific styling overrides
│   │
│   ├── js/                           # Browser-side JavaScript
│   │   ├── core/                     # Shared frontend utilities (locationService.js, core.js)
│   │   ├── auth/                     # Login and authentication UI (auth.js, auth-success.js)
│   │   ├── patient/                  # Patient portal functionality (patient.js)
│   │   ├── doctor/                   # Doctor portal functionality (doctor.js)
│   │   ├── admin/                    # Admin portal functionality (admin.js)
│   │   ├── laboratory/               # Laboratory portal functionality (lab.js)
│   │   ├── pharmacy/                 # Pharmacy portal functionality (pharmacy.js)
│   │   ├── insurance/                # Insurance portal functionality (insurance.js)
│   │   ├── emergency/                # Emergency dashboard functionality (emergency.js)
│   │   ├── wearable/                 # Wearable simulator (wearable.js)
│   │   └── ai-assistant/             # AI chat interface (ai-chat.js)
│   │
│   ├── components/                   # Reusable frontend components
│   │   └── carelink-ai/              # Embedded AI Assistant chat widget
│   │
│   ├── config/                       # Frontend-safe configuration (frontend.config.js)
│   ├── tests/                        # Frontend tests (smoke.test.js)
│   ├── Dockerfile                    # Production container definition (Nginx Alpine)
│   ├── nginx.conf                    # Nginx reverse proxy & static file server config
│   └── README.md
│
├── backend/                          # Node.js + Express application
│   │
│   ├── server.js                     # Application entry point
│   │
│   ├── config/                       # Database and app configuration
│   │   ├── db.js                     # MongoDB connection & in-memory fallback
│   │   ├── env.js                    # Production secrets validation & sanitization
│   │   └── passport.js               # Google OAuth 2.0 Passport strategy
│   │
│   ├── routes/                       # HTTP API endpoints
│   │   ├── auth.js
│   │   ├── patients.js
│   │   ├── vitals.js
│   │   ├── doctors.js                # Doctor dashboard and patient assignments
│   │   ├── hospitals.js
│   │   ├── emergency.js
│   │   ├── lab.js
│   │   ├── pharmacy.js
│   │   ├── insurance.js
│   │   └── ai.js
│   │
│   ├── controllers/                  # Request handling
│   │   ├── authController.js
│   │   ├── patientController.js
│   │   ├── emergencyController.js
│   │   └── index.js
│   │
│   ├── services/                     # Business logic and integrations
│   │   ├── emergency/
│   │   ├── wearable/
│   │   ├── notifications/
│   │   ├── hospitals/
│   │   └── ai/
│   │
│   ├── middleware/                   # Request processing and security
│   │   ├── auth.js
│   │   ├── role.js
│   │   ├── errorHandler.js
│   │   └── requestId.js
│   │
│   ├── models/                       # MongoDB / Mongoose schemas
│   │   ├── User.js
│   │   ├── VitalSigns.js
│   │   ├── EmergencyCase.js
│   │   ├── MedicalReport.js
│   │   ├── Medication.js
│   │   └── ...
│   │
│   ├── validators/                   # Request validation
│   ├── utils/                        # Shared backend utilities
│   ├── sockets/                      # Socket.IO handlers
│   ├── jobs/                         # Scheduled tasks
│   ├── tests/                        # Backend test suites
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── security/
│   │   ├── regression/
│   │   └── run_all_tests.js
│   │
│   ├── uploads/                      # Private uploads
│   └── README.md
│
├── android/                          # Native Android application
│   ├── app/
│   ├── gradle/
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── README.md
│
├── database/                         # Database-related resources
│   ├── schema/
│   ├── seed/
│   ├── indexes/
│   ├── migrations/
│   └── README.md
│
├── docs/                             # Project documentation
│   ├── architecture/
│   ├── api/
│   ├── setup/
│   ├── security/
│   ├── ai/
│   ├── database/
│   └── deployment/
│
├── scripts/                          # Development and maintenance scripts
│   ├── setup/
│   ├── development/
│   └── maintenance/
│
├── tests/                            # Cross-module tests
│   └── e2e/
│
├── .env.example
├── .gitignore
├── .dockerignore
├── docker-compose.yml
├── docker-compose.dev.yml
├── package.json
├── package-lock.json
├── README.md
├── PROJECT_STRUCTURE.md
└── PROJECT_FILE_MAP.md
    ├── AI_PROVIDER_GUIDE.md          # Multi-LLM setup & provider configuration guide
    └── MEDICAL_DOCUMENT_INTELLIGENCE.md # Document intelligence & OCR processing guide
```

---

## 3. Technologies Used & Role In Architecture

| Tier | Technology | Purpose |
|---|---|---|
| **Frontend Web** | Vanilla HTML5, CSS3, ES6+ JS | High-performance, lightweight UI across 8 specialized portals without heavy framework overhead. |
| **Styling & Icons** | Vanilla CSS, FontAwesome 6, Google Fonts | Responsive healthcare design system with custom CSS custom properties and dark mode. |
| **Frontend Server** | Nginx Alpine | Serves static frontend assets and handles proxy routing to the backend API. |
| **Backend API** | Node.js 20+, Express.js 4.18 | RESTful API server handling business logic, routes, and JSON communication. |
| **Realtime Telemetry** | Socket.IO 4.8 | Bidirectional event streaming for live patient vitals, emergency dispatch, and AI alerts. |
| **Authentication** | JWT, HttpOnly Cookies, Passport Google OAuth | Secure stateless authentication with XSS-resilient HttpOnly cookies. |
| **Security & Hardening**| Helmet 8, Express-Rate-Limit, Mongo-Sanitize | Content Security Policy, rate limiting, and NoSQL injection protection. |
| **Database** | MongoDB 7.0, Mongoose 7.6 | Document database for healthcare entities, EHR records, and audit logs. |
| **Test Database** | MongoDB Memory Server 11.0 | Transient in-memory database for fully self-contained automated testing. |
| **File Processing** | Multer, PDF-Parse, CSV-Parse | Multi-format diagnostic document ingestion with magic-byte verification. |
| **Mobile Client** | Android Kotlin, Jetpack Compose, Health Connect | Native mobile app with hardware sensor telemetry and emergency triggers. |
| **Containerization** | Docker, Docker Compose | Production and development multi-container orchestration. |

---

## 4. Main Application Entry Points

1. **Frontend Web Landing & Authentication**: `frontend/index.html`
   - Handles public landing, role switcher, credential login, and Google OAuth trigger.
2. **Backend Server Bootstrap**: `backend/server.js`
   - Validates environment variables and AI configuration.
   - Connects to MongoDB (or starts in-memory server).
   - Applies Helmet, CORS, Rate Limiters, Cookie Parser, and Mongo Sanitize.
   - Registers all 14 API routers and WebSocket gateway.
   - Listens on `PORT=5000`.
3. **Database Connection & Seeding**: `backend/config/db.js`
   - Connects to MongoDB Atlas, local MongoDB, or initializes `MongoMemoryServer`.
   - Triggers `backend/utils/autoSeed.js` in development environments.
4. **Mobile Application**: `android/app/src/main/java/com/medilink/ai/MainActivity.kt`
   - Boots Jetpack Compose UI, checks permissions, and initiates Health Connect syncing.

---

## 5. Architectural & Organizational Issues Identified

### Issue 1: Test Files Cluttering Backend Root
* **Current State**: 21 test files (`test_step2_file_security.js` through `test_step16_realtime.js`, `test_emergency_*.js`, `test_lab_system.js`, `test_server_routes.js`, and `run_all_tests.js`) sit directly in the `backend/` root directory alongside `server.js` and `package.json`.
* **Impact**: Decreases codebase clarity, makes finding backend application files difficult, and mixes development testing scripts with production backend code.
* **Solution**: Move all test files to a dedicated `backend/tests/` directory (or organized subdirectories) and update internal relative imports and `run_all_tests.js`.

### Issue 2: Frontend Static Path Resolution in `backend/server.js`
* **Current State**: Lines 184 & 229 of `backend/server.js` use `path.join(__dirname, 'frontend')`. Because `server.js` is inside `backend/`, `__dirname` resolves to `d:\code\MediLink AI\backend`, where `frontend/` does not exist.
* **Impact**: When the backend is run standalone, requests for frontend static files or SPA catch-all (`GET /dashboard`) fail with 404 (causing regression test failures in `test_step9_error_handling.js`).
* **Solution**: Dynamically resolve the frontend directory:
  ```javascript
  const FRONTEND_DIR = process.env.FRONTEND_DIR || (
    fs.existsSync(path.join(__dirname, 'frontend', 'index.html'))
      ? path.join(__dirname, 'frontend')
      : path.join(__dirname, '..', 'frontend')
  );
  ```

### Issue 3: Docker Compose File Path Misalignments
* **Current State**: `docker-compose.yml` and `docker-compose.dev.yml` in the root directory specify `context: .` with `dockerfile: Dockerfile` and `dockerfile: Dockerfile.dev`. However, those Dockerfiles were moved into `backend/` (`backend/Dockerfile` and `backend/Dockerfile.dev`).
* **Impact**: Running `docker compose up` from the project root will fail with "Dockerfile not found".
* **Solution**: Update `docker-compose.yml` to specify `dockerfile: backend/Dockerfile` (or `context: ./backend`) and `docker-compose.dev.yml` to specify `dockerfile: backend/Dockerfile.dev`.

### Issue 4: Duplicate Configuration Files
* **Current State**: `.env.example` and `.dockerignore` exist in both the root directory and `backend/`.
* **Impact**: Duplicate maintenance burden and potential inconsistency.
* **Solution**: Keep root `.env.example` as the canonical template for the whole stack, and ensure `backend/.env.example` is aligned or referenced properly.

### Issue 5: Missing Dedicated Database Directory
* **Current State**: MongoDB models are in `backend/models/`, seed data in `backend/utils/autoSeed.js`, and index verifications in test files.
* **Impact**: New developers looking for database schemas or seeds have to search through utilities and test scripts.
* **Solution**: Create a `database/` directory in the root with schema documentation, index declarations, seed scripts reference, and a clear `database/README.md`.

### Issue 6: Missing Dedicated API Documentation Directory
* **Current State**: API specifications are scattered between the root `README.md` and test scripts.
* **Impact**: Difficult for third-party integrators or frontend developers to inspect endpoint contracts.
* **Solution**: Create `docs/api/` documenting the 8-portal API endpoints, authentication mechanisms, and request/response schemas.

---

## 6. Recommended Target Codebase Structure

```
MediLink-AI/
│
├── frontend/                         # Complete Frontend Tier
│   ├── components/
│   │   └── carelink-ai/              # AI chat widget
│   ├── css/
│   │   └── style.css                 # Master stylesheet
│   ├── js/                           # Portal JavaScript controllers
│   │   ├── admin.js
│   │   ├── auth-success.js
│   │   ├── auth.js
│   │   ├── doctor.js
│   │   ├── emergency.js
│   │   ├── index.js
│   │   ├── insurance.js
│   │   ├── lab.js
│   │   ├── patient.js
│   │   ├── pharmacy.js
│   │   └── wearable.js
│   ├── admin.html                    # Role portal pages
│   ├── auth-success.html
│   ├── doctor.html
│   ├── emergency.html
│   ├── index.html
│   ├── insurance.html
│   ├── lab.html
│   ├── patient.html
│   ├── pharmacy.html
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   └── README.md                     # Frontend documentation
│
├── backend/                          # Complete Backend Tier
│   ├── cert/                         # Certificates
│   │   └── cert.crt
│   ├── config/                       # System configuration
│   │   ├── db.js
│   │   ├── env.js
│   │   └── passport.js
│   ├── middleware/                   # Authentication & security middleware
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── requestId.js
│   │   └── role.js
│   ├── models/                       # Mongoose database schemas
│   │   ├── Alert.js
│   │   ├── EmergencyCase.js
│   │   ├── HospitalVisit.js
│   │   ├── InsuranceClaim.js
│   │   ├── MedicalReport.js
│   │   ├── Medication.js
│   │   ├── Notification.js
│   │   ├── Report.js
│   │   ├── Sample.js
│   │   ├── TestRequest.js
│   │   ├── User.js
│   │   └── VitalSigns.js
│   ├── routes/                       # Express REST API routes
│   │   ├── admin.js
│   │   ├── ai.js
│   │   ├── alerts.js
│   │   ├── auth.js
│   │   ├── emergency.js
│   │   ├── googleAuth.js
│   │   ├── insurance.js
│   │   ├── lab.js
│   │   ├── medicalReports.js
│   │   ├── medication.js
│   │   ├── patients.js
│   │   ├── pharmacy.js
│   │   ├── reports.js
│   │   └── vitals.js
│   ├── utils/                        # Services and core business logic
│   │   ├── ai/                       # AI Assistant & RAG system
│   │   ├── aiEngine.js
│   │   ├── autoSeed.js
│   │   ├── criticalDetection.js
│   │   ├── documentIntelligence.js
│   │   ├── emergencyCommunicationService.js
│   │   ├── emergencyEngine.js
│   │   ├── emergencySosService.js
│   │   ├── errors.js
│   │   ├── fileValidator.js
│   │   ├── notificationService.js
│   │   ├── paginationHelper.js
│   │   ├── queryHelper.js
│   │   ├── reportAiEngine.js
│   │   ├── scheduler.js
│   │   ├── socket.js
│   │   └── storageService.js
│   ├── uploads/                      # Protected medical report uploads
│   ├── server.js                     # Backend application entry point
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── .dockerignore
│   ├── .env.example
│   ├── .gitignore
│   ├── README.md                     # Backend documentation
│   └── [21 Automated Test Files]     # Self-contained & integration suites (run directly in backend/)
│       ├── run_all_tests.js          # Master test runner
│       ├── test_emergency_routes.js
│       ├── test_emergency_sos_architecture.js
│       ├── test_emergency_system.js
│       ├── test_lab_system.js
│       ├── test_server_routes.js
│       ├── test_step2_file_security.js
│       ├── test_step3_lab_notification.js
│       ├── test_step4_csp_security.js
│       ├── test_step5_secrets_security.js
│       ├── test_step6_mongodb_queries.js
│       ├── test_step7_mongodb_indexes.js
│       ├── test_step8_pagination.js
│       ├── test_step9_error_handling.js
│       ├── test_step10_full_system.js
│       ├── test_step11_ai_security.js
│       ├── test_step12_real_llm.js
│       ├── test_step13_live_llm.js
│       ├── test_step14_rag.js
│       ├── test_step15_document_intelligence.js
│       └── test_step16_realtime.js
│
├── database/                         # Database Architecture & Documentation
│   ├── schema/                       # Schema documentation & entity relationship diagrams
│   ├── indexes/                      # Compound and unique index definitions
│   ├── seed/                         # Seed data descriptions & accounts reference
│   └── README.md                     # Database setup & architecture guide
│
├── android/                          # Native Android Mobile Application
│   ├── app/
│   ├── gradle/
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── gradle.properties
│   └── gradlew.bat
│
├── docs/                             # Ecosystem Documentation
│   ├── architecture/                 # System architecture diagrams & specs
│   │   └── CODE_CLEANUP_REPORT.md    # Redundancy audit & cleanup report
│   ├── api/                          # REST API specifications
│   │   ├── auth_api.md
│   │   ├── emergency_api.md
│   │   ├── lab_api.md
│   │   └── patients_api.md
│   ├── AI_PROVIDER_GUIDE.md
│   └── MEDICAL_DOCUMENT_INTELLIGENCE.md
│
├── .dockerignore
├── .env                              # Active environment file (untracked)
├── .env.example                      # Canonical root environment template
├── .gitignore
├── docker-compose.yml                # Production Compose configuration
├── docker-compose.dev.yml            # Development Compose configuration
├── PROJECT_FILE_MAP.md               # Central lookup table across all features
├── PROJECT_STRUCTURE.md              # Codebase layout & architectural guidelines
└── README.md                         # Master ecosystem documentation
```

---

## 7. Major Folder Responsibilities & Entry Points

| Folder | Primary Responsibility | Key Entry Point / Bootstrap File |
| :--- | :--- | :--- |
| **`frontend/`** | Web user interfaces, role-based dashboards, styling, client-side WebSocket clients, and Nginx proxy rules. | [`frontend/index.html`](file:///d:/code/MediLink%20AI/frontend/index.html), [`frontend/js/auth.js`](file:///d:/code/MediLink%20AI/frontend/js/auth.js) |
| **`backend/`** | REST API routers, Mongoose ORM models, WebSocket gateway, task scheduler, AI engines, and automated test suites. | [`backend/server.js`](file:///d:/code/MediLink%20AI/backend/server.js), [`backend/config/db.js`](file:///d:/code/MediLink%20AI/backend/config/db.js) |
| **`database/`** | Architectural documentation for MongoDB schemas, compound indexes, explain plans, and demo seed data. | [`database/README.md`](file:///d:/code/MediLink%20AI/database/README.md) |
| **`docs/`** | REST API endpoint contracts, architecture diagrams, LLM provider guides, and cleanup audit reports. | [`docs/api/`](file:///d:/code/MediLink%20AI/docs/api/), [`docs/AI_PROVIDER_GUIDE.md`](file:///d:/code/MediLink%20AI/docs/AI_PROVIDER_GUIDE.md) |
| **`android/`** | Native mobile client using Jetpack Compose, Kotlin coroutines, and Health Connect hardware sensor telemetry. | [`android/app/src/main/java/com/medilink/ai/MainActivity.kt`](file:///d:/code/MediLink%20AI/android/app/src/main/java/com/medilink/ai/MainActivity.kt) |

---

## 8. Developer Implementation Guide: Where to Make Changes

### 1. Where to Add a New Frontend Page
1. **HTML File**: Create `frontend/<page-name>.html`. Include standard navigation header, `<link rel="stylesheet" href="css/style.css" />`, and script tags.
2. **JavaScript Controller**: Create `frontend/js/<page-name>.js`. Encapsulate page initialization and event handlers.
3. **Role Routing**: If the page is dedicated to a new user role, add redirect mapping in [`frontend/js/auth.js`](file:///d:/code/MediLink%20AI/frontend/js/auth.js#L50-L75) within `getRedirectUrlForRole()`.
4. **Static Route**: `backend/server.js` automatically serves all HTML files placed inside `frontend/` without needing new backend route declarations.

### 2. Where to Add a New API Endpoint
1. **Route File**: Open or create `backend/routes/<module>.js` (e.g., `backend/routes/telehealth.js`).
2. **Protect Endpoint**: Apply middleware guards:
   ```javascript
   const authMiddleware = require('../middleware/auth');
   const { requireRole } = require('../middleware/role');
   router.get('/my-endpoint', authMiddleware, requireRole(['doctor', 'admin']), async (req, res, next) => { ... });
   ```
3. **Mount Router**: Register the router in [`backend/server.js`](file:///d:/code/MediLink%20AI/backend/server.js#L190-L205):
   ```javascript
   app.use('/api/telehealth', require('./routes/telehealth'));
   ```
4. **Document Contract**: Document request/response schemas in [`docs/api/`](file:///d:/code/MediLink%20AI/docs/api/).

### 3. Where to Add or Modify Database Models
1. **Model Definition**: Add `backend/models/<ModelName>.js`. Define the Mongoose schema with explicit types and validators.
2. **Indexing**: Declare compound or unique indexes using `schema.index({ field1: 1, field2: -1 })`.
3. **Export**: Export the model via `module.exports = mongoose.model('<ModelName>', schema);`.
4. **Seed Integration**: If demo accounts should be populated with initial data, add documents to [`backend/utils/autoSeed.js`](file:///d:/code/MediLink%20AI/backend/utils/autoSeed.js).
5. **Documentation**: Update the data dictionary in [`database/schema/README.md`](file:///d:/code/MediLink%20AI/database/schema/README.md) and [`database/indexes/README.md`](file:///d:/code/MediLink%20AI/database/indexes/README.md).

### 4. Where to Modify Authentication & Role Permissions
* **Token Issuance & Verification**: [`backend/routes/auth.js`](file:///d:/code/MediLink%20AI/backend/routes/auth.js) and [`backend/middleware/auth.js`](file:///d:/code/MediLink%20AI/backend/middleware/auth.js).
* **HttpOnly Cookie Settings**: Configured in [`backend/server.js`](file:///d:/code/MediLink%20AI/backend/server.js#L30-L45) (`setAuthCookie`).
* **Role Guards (RBAC)**: [`backend/middleware/role.js`](file:///d:/code/MediLink%20AI/backend/middleware/role.js). To adjust permitted roles, update `requireRole(['role1', 'role2'])` on the specific route.
* **Google OAuth Strategy**: [`backend/config/passport.js`](file:///d:/code/MediLink%20AI/backend/config/passport.js) and [`backend/routes/googleAuth.js`](file:///d:/code/MediLink%20AI/backend/routes/googleAuth.js).

### 5. Where to Modify AI & Emergency Functionality
* **Vitals Risk Scoring**: [`backend/utils/aiEngine.js`](file:///d:/code/MediLink%20AI/backend/utils/aiEngine.js) (`analyzeVitals`).
* **LLM Providers & RAG**: [`backend/utils/ai/aiProvider.js`](file:///d:/code/MediLink%20AI/backend/utils/ai/aiProvider.js) and [`backend/utils/ai/rag/ragRetriever.js`](file:///d:/code/MediLink%20AI/backend/utils/ai/rag/ragRetriever.js).
* **Report Extraction & Summarization**: [`backend/utils/reportAiEngine.js`](file:///d:/code/MediLink%20AI/backend/utils/reportAiEngine.js) and [`backend/utils/documentIntelligence.js`](file:///d:/code/MediLink%20AI/backend/utils/documentIntelligence.js).
* **Emergency Dispatch**: [`backend/utils/emergencyEngine.js`](file:///d:/code/MediLink%20AI/backend/utils/emergencyEngine.js) (`triggerEmergencyWorkflow`).
* **Emergency Sensor Anomalies**: [`backend/utils/emergencySosService.js`](file:///d:/code/MediLink%20AI/backend/utils/emergencySosService.js).
* **Emergency SMS / Push Gateways**: [`backend/utils/emergencyCommunicationService.js`](file:///d:/code/MediLink%20AI/backend/utils/emergencyCommunicationService.js).

### 6. How Frontend Pages Connect to Backend APIs
* **Stateless Cookie Auth**: The frontend makes standard `fetch()` or `XMLHttpRequest` calls with `credentials: 'include'`:
  ```javascript
  const response = await fetch('/api/patients/me', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include' // Ensures the carelink_auth HttpOnly cookie is attached automatically
  });
  const data = await response.json();
  ```
* **Realtime Telemetry (WebSockets)**: Frontend establishes a Socket.IO connection:
  ```javascript
  const socket = io(window.location.origin, { withCredentials: true });
  socket.on('emergency:alert', (incident) => { displayEmergencyBanner(incident); });
  socket.on('vitals:update', (reading) => { updateChart(reading); });
  ```

