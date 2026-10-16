# MediLink AI — Frontend Web Tier

The MediLink AI frontend is a pure HTML5, CSS3, and ES6+ JavaScript client architecture designed for speed, low runtime footprint, and high reliability across clinical desktop workstations, mobile tablets, and emergency control room displays.

---

## 1. Directory Structure

```
frontend/
│
├── pages/                        # HTML pages for each portal
│   ├── index.html                # Login / landing page
│   ├── patient.html              # Patient portal
│   ├── doctor.html               # Doctor portal
│   ├── admin.html                # Admin / hospital portal
│   ├── lab.html                  # Laboratory portal
│   ├── pharmacy.html             # Pharmacy portal
│   ├── insurance.html            # Insurance portal
│   ├── emergency.html            # Emergency command dashboard
│   └── auth-success.html         # OAuth callback page
│
├── assets/                       # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── css/                          # Stylesheets
│   ├── style.css                 # Master stylesheet
│   ├── components/               # Component-specific styles
│   └── pages/                    # Page-specific styles
│
├── js/                           # Browser-side JavaScript
│   ├── core/                     # Shared frontend utilities (locationService.js, core.js)
│   ├── auth/                     # Login and authentication UI (auth.js, auth-success.js)
│   ├── patient/                  # Patient portal functionality (patient.js)
│   ├── doctor/                   # Doctor portal functionality (doctor.js)
│   ├── admin/                    # Admin portal functionality (admin.js)
│   ├── laboratory/               # Laboratory portal functionality (lab.js)
│   ├── pharmacy/                 # Pharmacy portal functionality (pharmacy.js)
│   ├── insurance/                # Insurance portal functionality (insurance.js)
│   ├── emergency/                # Emergency dashboard functionality (emergency.js)
│   ├── wearable/                 # Wearable simulator (wearable.js)
│   └── ai-assistant/             # AI chat interface (ai-chat.js)
│
├── components/                   # Reusable frontend components
│   └── carelink-ai/              # AI Assistant chat widget
│
├── config/                       # Frontend-safe configuration (frontend.config.js)
├── tests/                        # Frontend smoke and verification tests (smoke.test.js)
├── Dockerfile                    # Production container definition (Nginx Alpine)
├── nginx.conf                    # Nginx reverse proxy & static file server config
└── README.md                     # Frontend documentation
```

---

## 2. 8 Specialized Role Portals

Each healthcare stakeholder interacts through an interface tailored to their workflow:

1. **Patient Portal (`patient.html`)**: Real-time biometric telemetry charts, EHR medical report browser, medication schedule, emergency contact cards, and interactive 3-second SOS Emergency button.
2. **Doctor Portal (`doctor.html`)**: Patient directory, clinical vital trend alerts, emergency response popup modal with GPS coordinates and single-click case acknowledgement, lab order management.
3. **Emergency Command Center (`emergency.html`)**: 7-section emergency dispatch portal with live KPI metrics, active triage worklists, GIS map view, rapid response team assignment, and audit logs.
4. **Laboratory Portal (`lab.html`)**: Biospecimen tracking, barcode scanner, multi-format medical report upload with magic-byte validation, and publishing to Lifetime EHR.
5. **Hospital Admin Portal (`admin.html`)**: Hospital bed management, audit logs, system-wide metrics, user directory.
6. **Pharmacy Portal (`pharmacy.html`)**: Prescription queue, medication dispensing, allergy warnings.
7. **Insurance Portal (`insurance.html`)**: Claims review, diagnostic report cross-referencing, approval/denial workflow.
8. **Public Authentication Portal (`index.html`)**: Public entry point, credentials login, role selector, Google OAuth 2.0.

---

## 3. Adding New Features

### Adding a New Portal
1. Create `frontend/my-portal.html` following the standard header, navigation bar, and container layout found in existing portals.
2. Create `frontend/js/my-portal.js` implementing portal-specific initialization, API requests (`fetch` with `credentials: 'include'`), and UI rendering.
3. Add role routing rules to `frontend/js/auth.js` in `getRedirectUrlForRole()`.
4. Ensure the page includes `css/style.css` and FontAwesome / Google Fonts links.

### Adding a Reusable Component
1. Place new components under `frontend/components/<component-name>/`.
2. Encapsulate CSS rules inside dedicated CSS files or standard utility classes in `css/style.css`.
3. Provide clean JavaScript export or global initialization function.
