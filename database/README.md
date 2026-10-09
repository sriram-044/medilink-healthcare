# MediLink AI — Database Architecture & Data Layer

MediLink AI utilizes **MongoDB 7.0** paired with the **Mongoose ODM (Object Data Modeling)** library for persistent, resilient, and HIPAA-compliant healthcare data management.

---

## 1. Overview & Connection Modes

The database layer supports two operating paradigms configured seamlessly in `backend/config/db.js`:

1. **Production Mode (MongoDB Atlas / Replica Set)**:
   - Configured via `MONGODB_URI` or `MONGO_URI`.
   - Requires strong authentication and TLS encryption.
   - Demo account auto-seeding is **strictly disabled** in production.
2. **Development / Test Mode (In-Memory Fallback)**:
   - Powered by `mongodb-memory-server` (v11.0.1).
   - Automatically initializes if no local or Atlas MongoDB daemon is detected.
   - Auto-populates 8 role accounts and clinical datasets via `backend/utils/autoSeed.js`.

---

## 2. Directory Structure

```
database/
│
├── schema/                 # Mongoose Model Schemas and Entity Relationships
│   └── README.md           # Entity Relationship (ER) diagrams & data dictionary
│
├── indexes/                # Compound, Unique, and TTL Index Specifications
│   └── README.md           # Index list, compound keys, and explain plan benchmarks
│
├── seed/                   # Pre-seeded Demo Healthcare Accounts & Clinical Data
│   └── README.md           # 8-portal credential matrix and sample patient telemetry
│
└── README.md               # This database architecture document
```

---

## 3. Core Database Models

All Mongoose schemas are maintained under `backend/models/`:

| Model | File | Primary Function |
|---|---|---|
| **User** | `models/User.js` | User accounts, credentials (bcrypt), RBAC roles, contact info, and embedded `emergencyContacts`. |
| **EmergencyCase** | `models/EmergencyCase.js` | SOS emergency incidents, 8-stage lifecycle tracker, GPS coordinates, response team assignment, timeline audit. |
| **MedicalReport** | `models/MedicalReport.js` | Multi-category diagnostic reports (Lab, Radiology, Cardiology, Pathology), AI clinical findings, EHR status. |
| **TestRequest** | `models/TestRequest.js` | Diagnostic test orders, priority triage (Routine, Urgent, STAT), physician orders. |
| **Sample** | `models/Sample.js` | Biospecimen tracking (Blood, Urine, Tissue, CSF), barcode identifiers, cold-chain status. |
| **VitalSigns** | `models/VitalSigns.js` | High-frequency telemetry (Heart rate, SpO2, Blood pressure, Glucose, Respiratory rate, Temperature). |
| **Alert** | `models/Alert.js` | Real-time threshold alerts triggered by abnormal biometric telemetry or emergency events. |
| **Notification** | `models/Notification.js` | Cross-portal notification feed with read receipts and role dispatching. |
| **Medication** | `models/Medication.js` | Prescriptions, active drug regimens, dosages, and personalized dietary plans (`DietPlan`). |
| **InsuranceClaim**| `models/InsuranceClaim.js` | Patient insurance reimbursement claims, policy details, and claim approval status. |
| **HospitalVisit** | `models/HospitalVisit.js` | Inpatient and outpatient clinical encounters, admissions, and discharge summaries. |
| **Report** | `models/Report.js` | Legacy report schema maintained for backward compatibility. |

---

## 4. Security & Data Protection Controls

- **NoSQL Injection Guardrails**: All incoming query parameters, request bodies, and route parameters are sanitized using `mongo-sanitize`.
- **Sensitive Field Projections**: Database queries for user lists explicitly exclude password hashes via `.select('-password')`.
- **Data Minimization in AI Context**: Context builders for clinical AI and RAG models strip credentials, file system paths, and internal tokens prior to LLM submission.
- **Role-Based Query Isolation (IDOR Defense)**: Patient queries enforce `{ patientId: req.user._id }`, and doctor queries enforce `{ doctorId: req.user._id }` or assigned patient scopes.
