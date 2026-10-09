# Database Seed & Demo Accounts

In development and test environments, `backend/utils/autoSeed.js` automatically populates realistic healthcare datasets upon database connection.

---

## 1. 8-Portal Demo Credentials Matrix

All demo accounts share the password: `demo123`

| Role / Portal | Email | Primary Responsibilities & UI Features |
|---|---|---|
| **Patient** | `ravi@demo.com` | Elderly case study (Mr. Ravi, age 68), wearable telemetry, emergency contacts, 3s SOS button. |
| **Patient (Standard)** | `patient@demo.com` | Standard patient health portal, medical records, appointment history. |
| **Doctor** | `doctor@demo.com` | Assigned patients, clinical vitals inspection, emergency review modal, EHR reports. |
| **Hospital / Admin** | `admin@demo.com` | System-wide audit log, user management, hospital ward occupancy, bed capacity. |
| **Laboratory Staff** | `lab@demo.com` | Diagnostic orders queue, biospecimen barcoding, multi-format medical report uploads. |
| **Pharmacist** | `pharmacy@demo.com` | Medication dispensing, drug fulfillment, interaction checks. |
| **Insurance Officer** | `insurance@demo.com` | Insurance claims verification, policy review, approval/rejection. |
| **Emergency Officer** | `emergency@demo.com` | SOS command center, live ambulance GPS tracking, rapid response dispatch. |

---

## 2. Seeded Clinical Datasets

* **Vital Signs**: High-frequency biometric readings (Blood pressure, Heart rate, SpO2, Temperature, Glucose).
* **Emergency Contacts**: Primary and secondary contact cards with telephone numbers and SMS permissions.
* **Laboratory Tests**: Pre-populated pending and completed test requests with attached samples.
* **Lifetime Medical Reports**: Diagnostic PDF and image reports across Cardiology, Radiology, and Pathology.
