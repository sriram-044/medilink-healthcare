# CareLink / MediLink AI — Intelligent Healthcare Ecosystem & SOS Emergency System

> **CareLink (MediLink AI)** is an enterprise multi-portal healthcare management ecosystem featuring real-time patient biometric monitoring, wearable sensor telemetry, clinical decision support, lifetime electronic health records (EHR), multi-category laboratory diagnostics, a production-grade **SOS Emergency Response System**, and turnkey **Docker & Docker Compose containerization**.

---

## 🚨 1. SOS Emergency System Architecture

The SOS Emergency System provides emergency response teams, attending physicians, hospital trauma command centers, family members, and caregivers with real-time lifecycle tracking, geolocation telemetry, and dispatch capabilities.

```
                    ┌─────────────────────────────────────────┐
                    │      👤 PATIENT EMERGENCY INITIATION     │
                    │  ├── 🔴 3s Interactive Hold Button      │
                    │  ├── ⏱️ 5s Countdown (Cancel Window)    │
                    │  ├── 📍 GPS Geolocation Capture         │
                    │  └── ⌚ Fall Sensor / Health Alert      │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │       🧠 EMERGENCY ENGINE & SAFETY      │
                    │  ├── 🛡️ Non-Diagnostic Guardrails      │
                    │  ├── 🚫 Duplicate Case Prevention       │
                    │  └── 🏷️ Auto Emergency ID (EMG-XXXX)   │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │     📡 MULTI-CHANNEL DISPATCH ENGINE    │
                    ├────────────────────┼────────────────────┤
                    │                    │                    │
                    ▼                    ▼                    ▼
        ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
        │ 👨‍👩‍👦 FAMILY/CAREGIVER │  │ 👨‍⚕️ ATTENDING DOCTOR │  │ 🏥 HOSPITAL COMMAND │
        │ Safe SMS/Preview  │  │ In-App Alert +    │  │ Trauma Ticket +   │
        │ Coordinates Link  │  │ Clinical Vitals   │  │ Response Dispatch │
        └───────────────────┘  └───────────────────┘  └───────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │     🚑 8-STAGE CASE LIFECYCLE TRACKER   │
                    │  ACTIVE ➔ ACKNOWLEDGED ➔ TEAM_ASSIGNED │
                    │    ➔ EN_ROUTE ➔ ARRIVED ➔ UNDER_CARE    │
                    │           ➔ RESOLVED / CANCELLED        │
                    └─────────────────────────────────────────┘
```

---

## 🌟 2. SOS Emergency System Key Capabilities

1. **🔴 Interactive 3-Second Hold Button**: Prevents accidental activation with visual countdown progress ring and tactile animation.
2. **⏱️ 5-Second Automatic Countdown**: Offers a 5-second grace period with an immediate "Cancel Alert" button before live dispatch.
3. **📍 Resilient Geolocation Capture**: Seamlessly retrieves GPS latitude, longitude, accuracy, and reverse-geocoded address. If user permission is denied or device GPS is unavailable, it gracefully falls back to the patient's registered room/home location without failing the SOS signal.
4. **🛡️ Non-Diagnostic Safety Guardrails**: All alerts and notifications strictly use non-diagnostic phrasing (e.g., *"Possible health emergency detected"*, *"Possible fall detected — Are you okay?"*) to ensure patient safety and regulatory compliance.
5. **📇 Priority Contact Management**: Full CRUD interface for Emergency Contacts with priority tiers (`Primary`, `Secondary`), relationships, phone numbers, and instant single-click "Set as Primary" designation.
6. **🚑 7-Section Emergency Command Portal (`frontend/emergency.html`)**:
   - **Dashboard**: Live database KPI metrics (*Active Emergencies*, *Pending Response*, *Teams Assigned*, *Resolved Today*), priority breakdown, active case queue.
   - **Emergency Cases**: Filterable, searchable directory across all statuses and priorities with timeline inspection.
   - **Live Locations**: Active incident map coordinates, Google Maps route deep-links, and precision radius indicators.
   - **Response Teams**: Rapid Response Unit roster (Trauma ALS Ambulances, MICUs, BLS, Motorbike Responders) with real-time assignment.
   - **Incident History**: Historical incident log with cancellation and resolution audit trails.
   - **Alerts & Broadcasts**: Real-time broadcast log across contacts, doctors, and hospitals.
   - **Protocols & Settings**: Emergency response triage protocols and hotline configuration.
7. **🔄 Complete 8-Stage Status Lifecycle**:
   - `ACTIVE` ➔ `ACKNOWLEDGED` ➔ `TEAM_ASSIGNED` ➔ `EN_ROUTE` ➔ `ARRIVED` ➔ `UNDER_CARE` ➔ `RESOLVED` (and `CANCELLED` with mandatory audit reason).
8. **👨‍⚕️ Doctor Portal Emergency Review Modal**: Integrated modal in the Doctor Portal with live map navigation, clinical vitals summary, and 1-click case acknowledgement.

---

## 🧪 3. Laboratory Portal & Medical Report System

The Laboratory Portal provides diagnostic and pathology staff with a workspace to manage test requests, track biospecimens, enter structured numerical test results with automated reference intervals, upload validated multi-format medical reports, and publish findings directly to the patient's **Lifetime Electronic Health Record (EHR)**.

### Supported Diagnostic Categories & Formats
| Category | Report Types | Supported File Formats |
|---|---|---|
| **🩸 Laboratory** | CBC Blood Test, Blood Sugar, Lipid Profile, LFT, KFT, Thyroid, Urine | `.pdf`, `.csv`, `.json` |
| **🩻 Radiology** | X-Ray, CT Scan, MRI Scan, Ultrasound, Mammogram, PET Scan | `.dcm` (DICOM), `.nii` (NIfTI), `.png`, `.jpg`, `.jpeg`, `.pdf` |
| **❤️ Cardiology** | ECG / EKG, Echocardiogram, Holter Monitor | `.pdf`, `.csv`, `.xml`, `.dcm`, `.edf` |
| **🧠 Neurology** | EEG, EMG | `.edf` (EDF waveform), `.csv`, `.pdf` |
| **🔬 Pathology** | Biopsy Report, Histopathology, Cytology Report | `.pdf`, `.dcm`, `.tiff`, `.tif`, `.jpg`, `.png` |
| **🫁 Diagnostic** | Pulmonary Function Test (PFT), Spirometry | `.pdf`, `.csv` |
| **🩺 Clinical** | Doctor Prescription, Discharge Summary | `.pdf`, `.jpg`, `.png`, `.docx` |

---

## 🗄️ 4. Database Models

1. **`EmergencyCase`** (`models/EmergencyCase.js`):
   - `emergencyId` (auto-generated `EMG-XXXX`), `patientId`, `patientName`, `emergencyType`, `status`, `priority`, `location`, `emergencyContacts`, `assignedDoctor`, `assignedHospital`, `assignedEmergencyTeam`, `recentHealthData`, `timeline`, `alertsSent`, `notes`.
2. **`User`** (`models/User.js`):
   - Supports `emergencyContacts` array of subdocuments (`name`, `relationship`, `phone`, `email`, `priority`, `isPrimary`).
3. **`MedicalReport`** (`models/MedicalReport.js`):
   - `reportId`, `patientId`, `doctorId`, `hospitalName`, `labName`, `category`, `reportType`, `fileName`, `fileFormat`, `fileSize`, `reportStatus`, `criticalStatus`, `structuredResults`, `aiAnalysis`.
4. **`TestRequest`** (`models/TestRequest.js`) & **`Sample`** (`models/Sample.js`):
   - Biospecimen collection tracking, barcode generation, and laboratory test orders.
5. **`Alert`** (`models/Alert.js`) & **`Notification`** (`models/Notification.js`):
   - Cross-portal push and in-app notifications with `emergencyCaseId` and `severity`.

---

## 🌐 5. API Reference

### SOS Emergency Operations (`/api/emergency`)
- `POST /api/emergency/sos` — Trigger emergency SOS alert with patient location and health telemetry.
- `POST /api/emergency/:id/cancel` — Cancel active SOS alert with reason audit.
- `GET /api/emergency/dashboard-stats` — Aggregated real-time metrics computed from DB.
- `GET /api/emergency/active` — Active emergency cases queue.
- `GET /api/emergency/history` — Patient's past emergency history.
- `GET /api/emergency/cases` — Filterable emergency cases directory.
- `GET /api/emergency/cases/:id` — Single emergency case details with privacy masking.
- `PUT /api/emergency/cases/:id/status` — Advance emergency case lifecycle status.
- `POST /api/emergency/cases/:id/acknowledge` — Doctor/ER responder case acknowledgement.
- `POST /api/emergency/cases/:id/assign-team` — Assign rapid response unit to case.
- `POST /api/emergency/cases/:id/notes` — Add clinical note to case timeline.
- `GET /api/emergency/contacts` — Retrieve patient emergency contacts.
- `POST /api/emergency/contacts` — Add new emergency contact.
- `PUT /api/emergency/contacts/:id` — Update emergency contact.
- `DELETE /api/emergency/contacts/:id` — Delete emergency contact.
- `PUT /api/emergency/contacts/:id/primary` — Set contact as Primary.
- `GET /api/emergency/teams` — Response team roster and availability.

### Laboratory & Medical Reports (`/api/lab`, `/api/medical-reports`)
- `GET /api/lab/dashboard` — Laboratory KPIs and statistics.
- `GET /api/lab/test-requests` — Diagnostic orders queue.
- `GET /api/lab/samples` — Biospecimen tracker.
- `POST /api/medical-reports/upload` — Validated multi-part file upload.
- `GET /api/medical-reports/:id/view` — Secure browser preview stream.
- `PUT /api/medical-reports/:id/publish` — Publish report to Patient Lifetime EHR.

---

## 🐳 6. Docker & Docker Compose Setup

CareLink AI can be packaged and run anywhere with multi-container Docker Compose orchestration.

### 🏗️ Docker Architecture

```
                    🌐 USER (Web Browser)
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    Port 3000: Frontend             Port 5000: Backend API
   ┌───────────────────────┐       ┌───────────────────────┐
   │  🐳 FRONTEND (Nginx)  │       │  🐳 BACKEND (Node.js) │
   │  ├── Web UI & Portals │──────►│  ├── Express REST API │
   │  └── Reverse Proxy    │       │  ├── AI Health Engine │
   └───────────────────────┘       │  └── SOS Dispatcher   │
                                   └──────────┬────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                     ┌─────────────────┐             ┌─────────────────┐
                     │  🗄️ MONGODB     │             │  📁 UPLOADS     │
                     │    CONTAINER    │             │    VOLUME       │
                     │  (Port 27017)   │             │  (Persistent    │
                     └────────┬────────┘             │   Reports)      │
                              │                      └─────────────────┘
                              ▼
                     ┌─────────────────┐
                     │  💾 DATABASE    │
                     │    VOLUME       │
                     │  (Persistent)   │
                     └─────────────────┘
```

### 📋 Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS / Linux) with Docker Compose support.

### ⚙️ Environment Configuration
1. Create your `.env` file from the provided `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. The default configuration connects directly to the containerized MongoDB service (`mongodb://mongodb:27017/carelink`) with persistent storage.

---

### 🚀 Docker Commands

#### 1. Build & Start All Services
```bash
# Build images and start containers in detached mode
docker compose up -d --build
```

#### 2. Check Container Status & Health
```bash
docker compose ps
```

#### 3. View Live Service Logs
```bash
# View all container logs
docker compose logs -f

# View only Backend API logs
docker compose logs -f backend

# View only MongoDB logs
docker compose logs -f mongodb
```

#### 4. Stop All Services
```bash
# Stop containers (preserves database data & uploaded reports)
docker compose down
```

#### 5. Stop and Remove Persistent Volumes (Clean Slate Reset)
```bash
# WARNING: This deletes the persistent MongoDB database and upload files
docker compose down -v
```

#### 6. Development Mode (Live Hot-Reloading)
```bash
docker compose -f docker-compose.dev.yml up --build
```

---

### 🌐 Access URLs in Docker Mode

| Service | URL | Container | Port |
|---|---|---|---|
| **Frontend Web App** | `http://localhost:3000` | `carelink-frontend` | `80 -> 3000` |
| **Backend REST API** | `http://localhost:5000` | `carelink-backend` | `5000 -> 5000` |
| **API Health Check** | `http://localhost:5000/api/health` | `carelink-backend` | `5000` |
| **MongoDB Database** | `mongodb://localhost:27017/carelink` | `carelink-mongodb` | `27017` |

---

### 💾 Data Persistence in Docker
- **Database (`carelink_mongodb_data`)**: Mapped to `/data/db` in the `mongodb` container. All patient records, emergency cases, biometrics, and credentials persist across container restarts.
- **Uploaded Medical Reports (`carelink_uploads_data`)**: Mapped to `/app/uploads` in the `backend` container. All PDF, DICOM, CSV, and image reports remain safe and persistent.

---

## 🚀 7. Local (Non-Docker) Startup & Demo Accounts

### Prerequisites
- Node.js v18+ (In-memory MongoDB starts automatically if no MongoDB instance is running).

### Installation & Startup
```bash
# 1. Navigate to backend directory and install dependencies
cd backend
npm install

# 2. Start CareLink Server (runs on Port 5000)
npm start
```

### Run Automated Test Suites
```bash
# Inside the backend/ directory:

# Unit, Database & Security Test Suites (self-contained, no external DB needed)
node test_emergency_system.js
node test_emergency_sos_architecture.js
node test_step6_mongodb_queries.js
node test_step7_mongodb_indexes.js
node test_step8_pagination.js
node test_step9_error_handling.js
node test_step4_csp_security.js
node test_step5_secrets_security.js

# Full-System Master Regression Suite (with server running on http://localhost:5000)
node run_all_tests.js
```

### Access Portals & Demo Accounts (Password: `demo123`)
- 🚑 **Emergency Command Center**: `emergency@demo.com` ➔ `emergency.html`
- 👤 **Patient (Elderly Case Study - Mr. Ravi)**: `ravi@demo.com` ➔ `patient.html`
- 👤 **Patient (Standard)**: `patient@demo.com` ➔ `patient.html`
- 👨‍⚕️ **Doctor**: `doctor@demo.com` ➔ `doctor.html`
- 🏥 **Hospital / Super Admin**: `admin@demo.com` ➔ `admin.html`
- 🧪 **Laboratory Staff**: `lab@demo.com` ➔ `lab.html`
- 💊 **Pharmacist**: `pharmacy@demo.com` ➔ `pharmacy.html`
- 🛡️ **Insurance Officer**: `insurance@demo.com` ➔ `insurance.html`

---

## ⚖️ 8. Clinical & AI Disclaimer

> [!NOTE]
> All AI-generated analyses, risk scores, and threshold alerts produced by MediLink AI are provided strictly for **clinical decision support and review**. The system does not generate autonomous medical diagnoses. Attending licensed physicians remain responsible for all medical evaluations, prescriptions, and patient care decisions.
