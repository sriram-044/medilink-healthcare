# MediLink AI — Database Architecture & Data Dictionary

Comprehensive documentation of all MongoDB collections, schemas, indexes, and relationships in MediLink AI.

---

## 1. Primary Collections
1. **`users`**: Patient, doctor, hospital, admin, lab, pharmacy, and insurance accounts. Includes embedded emergency contacts.
2. **`vitalsigns`**: High-frequency telemetric biometric streams (heart rate, SpO2, blood pressure, temperature, respiratory rate).
3. **`emergencycases`**: Computer-Aided Dispatch (CAD) incidents, triage scores, GPS coordinates, response unit assignments, and audit timeline.
4. **`medicalreports`**: Multi-format diagnostic reports with AI findings and non-diagnostic disclaimers.
5. **`testrequests`**: Pathology laboratory test requests, specimens, and workflow stages.
6. **`samples`**: Biospecimen tracking and laboratory barcodes.
7. **`medications`**: Prescriptions, dosages, and personalized diet plans.
8. **`insuranceclaims`**: Claim submissions, review statuses, and reimbursement tracking.
9. **`alerts`**: Real-time clinical threshold violation alerts.
10. **`notifications`**: User notifications across in-app feed and WebSockets.
