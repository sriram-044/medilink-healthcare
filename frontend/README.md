# MediLink AI — Frontend Web Tier

The MediLink AI frontend is a pure HTML5, CSS3, and ES6+ JavaScript client architecture designed for speed, low runtime footprint, and high reliability across clinical desktop workstations, mobile tablets, and emergency control room displays.

---

## 1. Directory Structure

```
frontend/
│
├── components/
│   └── carelink-ai/          # Embedded AI Assistant chat widget
│       ├── ai-chat.css       # Widget styling and floating dialog animations
│       ├── ai-chat.js        # Chat client controller, WebSocket & REST communication
│       └── ai-config.js      # Role-specific AI prompts, disclaimer banners & capabilities
│
├── css/
│   └── style.css             # Unified healthcare design system, tokens, CSS variables, dark mode
│
├── js/                       # Portal controllers and client-side utilities
│   ├── admin.js              # Hospital Administrator dashboard logic
│   ├── auth-success.js       # OAuth 2.0 post-login landing logic
│   ├── auth.js               # Session management, HttpOnly cookie requests, logout handlers
│   ├── doctor.js             # Doctor dashboard, patient records review, emergency alerts modal
│   ├── emergency.js          # SOS Emergency Command Center, live GIS mapping & unit dispatch
│   ├── index.js              # Landing page UI interactions
│   ├── insurance.js          # Insurance officer claims review
│   ├── lab.js                # Laboratory worklist, sample collection, report upload
│   ├── patient.js            # Patient self-service portal, vitals graph, EHR view, SOS button
│   ├── pharmacy.js           # Pharmacy dispensing, medication logs
│   └── wearable.js           # Simulated continuous sensor telemetry generator
│
├── admin.html                # Hospital Admin Portal
├── auth-success.html         # OAuth Callback Landing View
├── doctor.html               # Doctor Clinical Portal
├── emergency.html            # SOS Emergency Command Center
├── index.html                # Public Landing Page & Unified Authentication Portal
├── insurance.html            # Insurance Claims Portal
├── lab.html                  # Laboratory & Pathology Portal
├── patient.html              # Patient Health Portal
├── pharmacy.html             # Pharmacy Portal
├── nginx.conf                # Nginx production reverse proxy & static asset delivery rules
├── Dockerfile                # Production container definition (Nginx Alpine)
└── .dockerignore             # Docker build exclusions
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
