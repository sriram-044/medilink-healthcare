# SOS Emergency System API (`/api/emergency`)

The SOS Emergency System provides emergency response teams, attending physicians, hospital trauma command centers, and family members with real-time incident lifecycle tracking, GPS geolocation telemetry, and multi-party dispatch.

---

## Endpoints Summary

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/emergency/sos` | Patient | Trigger SOS alert with location and sensor telemetry |
| `POST` | `/api/emergency/:id/cancel` | Patient, Doctor, ER | Cancel active SOS with required cancellation audit reason |
| `GET` | `/api/emergency/dashboard-stats` | Emergency, Doctor, Admin | Live command center KPIs (Active, Pending, Assigned, Resolved) |
| `GET` | `/api/emergency/active` | Emergency, Doctor, Admin | Active incident work queue |
| `GET` | `/api/emergency/history` | Patient, Doctor, Admin | Historical emergency incidents |
| `GET` | `/api/emergency/cases` | Emergency, Doctor, Admin | Searchable, paginated emergency directory |
| `GET` | `/api/emergency/cases/:id` | Emergency, Doctor, Admin | Complete emergency details with masked vitals |
| `PUT` | `/api/emergency/cases/:id/status`| Emergency, Doctor | Transition case status across the 8 lifecycle stages |
| `POST` | `/api/emergency/cases/:id/acknowledge`| Doctor, ER | Case acknowledgement by clinical personnel |
| `POST` | `/api/emergency/cases/:id/assign-team` | Emergency | Assign Rapid Response Ambulance/MICU unit |
| `POST` | `/api/emergency/cases/:id/notes` | Doctor, Emergency | Append clinical note to case timeline |
| `GET` | `/api/emergency/contacts` | Patient | Retrieve registered emergency contacts |
| `POST` | `/api/emergency/contacts` | Patient | Add new emergency contact |
| `PUT` | `/api/emergency/contacts/:id` | Patient | Update emergency contact |
| `DELETE`| `/api/emergency/contacts/:id` | Patient | Remove emergency contact |
| `PUT` | `/api/emergency/contacts/:id/primary` | Patient | Set contact as Primary tier |
| `GET` | `/api/emergency/teams` | Emergency, Admin | Rapid response team roster & availability |

---

## 8-Stage Status Workflow
1. `ACTIVE` ➔ Alert triggered, multi-party dispatch in progress.
2. `ACKNOWLEDGED` ➔ Physician or trauma desk acknowledged alert.
3. `TEAM_ASSIGNED` ➔ Rapid response team allocated.
4. `EN_ROUTE` ➔ Ambulance / unit in transit with GPS tracking.
5. `ARRIVED` ➔ Unit on site with patient.
6. `UNDER_CARE` ➔ Paramedics delivering emergency treatment.
7. `RESOLVED` ➔ Case concluded, patient admitted or stabilized.
8. `CANCELLED` ➔ Cancelled by patient or physician with mandatory audit reason.
