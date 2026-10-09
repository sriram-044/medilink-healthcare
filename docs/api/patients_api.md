# Patient & Clinical Vitals API (`/api/patients` & `/api/vitals`)

Provides endpoints for patient medical record retrieval, allergy tracking, lifetime EHR aggregation, and telemetric sensor data streams.

---

## 1. Patients Operations (`/api/patients`)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/patients` | Doctor, Admin | Searchable directory of registered patients. |
| `GET` | `/api/patients/:id` | Authenticated (RBAC) | Patient clinical overview. Restricted by IDOR. |
| `POST` | `/api/patients/:id/allergies` | Doctor, Admin | Register allergy or contraindication to patient profile. |
| `GET` | `/api/patients/:id/lifetime-history` | Authenticated (RBAC) | Chronologically sorted lifetime health history (EHR records, visits, vitals). |
| `PUT` | `/api/patients/:id` | Doctor, Admin, Self | Update demographic and contact information. |

---

## 2. Telemetric Vitals Operations (`/api/vitals`)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/vitals` | Authenticated (RBAC) | Time-series vitals telemetry for logged-in or assigned patient. |
| `POST` | `/api/vitals` | Authenticated (RBAC) | Ingest wearable or manual vital signs reading. |
| `GET` | `/api/vitals/latest` | Authenticated (RBAC) | Most recent biometric snapshot for real-time dashboard display. |
