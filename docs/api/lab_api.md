# Laboratory & Medical Reports API (`/api/lab` & `/api/medical-reports`)

The Laboratory Portal provides diagnostics, pathology, and radiology staff with endpoints to track biospecimens, enter structured results, upload multi-format medical reports, and publish findings to the Lifetime Electronic Health Record (EHR).

---

## 1. Laboratory Diagnostic Operations (`/api/lab`)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/lab/dashboard` | Lab, Admin | Aggregated lab metrics (Total requests, pending, completed, samples). |
| `GET` | `/api/lab/test-requests` | Lab, Doctor, Admin | Filterable, paginated test requests worklist. |
| `POST` | `/api/lab/test-requests` | Doctor, Admin | Create new diagnostic test order for patient. |
| `GET` | `/api/lab/samples` | Lab, Admin | Biospecimen tracking queue. |
| `POST` | `/api/lab/samples` | Lab | Register biospecimen collection with barcode. |
| `PUT` | `/api/lab/samples/:id/status`| Lab | Advance specimen state (Collected, Processing, Stored, Disposed). |
| `GET` | `/api/lab/notifications` | Lab | Notification alerts for lab personnel. |

---

## 2. Medical Reports & Diagnostic Files (`/api/medical-reports`)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/medical-reports` | Authenticated (RBAC) | Paginated report directory. Patients see own; Doctors see assigned. |
| `GET` | `/api/medical-reports/:id` | Authenticated (RBAC) | Report metadata, AI findings, and structured test values. |
| `POST` | `/api/medical-reports/upload` | Lab, Doctor, Admin | Multipart file upload with magic-byte validation and extension check. |
| `GET` | `/api/medical-reports/:id/view`| Authenticated (RBAC) | Secure authenticated streaming preview (inline Content-Disposition). |
| `GET` | `/api/medical-reports/:id/download` | Authenticated (RBAC)| Secure file download stream (attachment Content-Disposition). |
| `PUT` | `/api/medical-reports/:id/publish` | Lab, Doctor | Publish verified diagnostic report to patient's Lifetime EHR. |

> **Security Note**: Direct static access to `/uploads` is strictly blocked with a 404 handler in `backend/server.js`. All report file downloads and views pass through authentication and IDOR access validation.
