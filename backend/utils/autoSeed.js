/**
 * autoSeed.js — Automatically seeds demo data for MediLink AI 8-Portal Ecosystem
 */

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const VitalSigns = require('../models/VitalSigns');
const { Medication, DietPlan } = require('../models/Medication');
const Report = require('../models/Report');
const Alert = require('../models/Alert');
const HospitalVisit = require('../models/HospitalVisit');
const InsuranceClaim = require('../models/InsuranceClaim');
const TestRequest = require('../models/TestRequest');
const Sample = require('../models/Sample');
const MedicalReport = require('../models/MedicalReport');
const Notification = require('../models/Notification');
const EmergencyCase = require('../models/EmergencyCase');
const { analyzeVitals } = require('./aiEngine');
const { generateReportAiAnalysis } = require('./reportAiEngine');

const seed = async () => {
  try {
    // In production, never seed demo accounts or mock passwords
    if (process.env.NODE_ENV === 'production') return;

    const existing = await User.findOne({ email: 'patient@demo.com' });
    if (existing) return; // already seeded

    console.log('🌱 Seeding MediLink AI 8-Portal Ecosystem demo dataset...');
    const password = await bcrypt.hash('demo123', 10);

    // 1. Admin User
    await new User({
      name: 'Admin Super User', email: 'admin@demo.com', password,
      role: 'admin', phone: '+91 98765 43210', isActive: true
    }).save();

    // 2. Doctor User
    const doctor = await new User({
      name: 'Dr. Priya Sharma', email: 'doctor@demo.com', password,
      role: 'doctor', specialization: 'Cardiologist',
      department: 'Cardiology', phone: '+91 98765 11111', isActive: true
    }).save();

    // 3. Lab Technician User
    const labTech = await new User({
      name: 'Lab Technician (John Doe)', email: 'lab@demo.com', password,
      role: 'lab', department: 'Pathology & Diagnostics', isActive: true
    }).save();

    // 4. Pharmacist User
    await new User({
      name: 'Pharmacist (Anita Patel)', email: 'pharmacy@demo.com', password,
      role: 'pharmacy', department: 'Central Pharmacy', isActive: true
    }).save();

    // 5. Insurance Officer User
    const insuranceOfficer = await new User({
      name: 'Insurance Officer (Rakesh Mehta)', email: 'insurance@demo.com', password,
      role: 'insurance', department: 'Claims Assessment', isActive: true
    }).save();

    // 6. Emergency Officer User
    await new User({
      name: 'Emergency Response Officer (Vikram Singh)', email: 'emergency@demo.com', password,
      role: 'emergency', department: 'Trauma & Ambulance Response', isActive: true
    }).save();

    // 7. Patient 1 (Rajan Kumar)
    const patient1 = await new User({
      name: 'Rajan Kumar', email: 'patient@demo.com', password,
      role: 'patient', age: 45, gender: 'male', bloodGroup: 'O+',
      phone: '+91 98765 22222', assignedDoctor: doctor._id,
      caregiverPhone: '+91 98765 00001', emergencyContact: '+91 98765 99991',
      emergencyContacts: [
        { name: 'Neha Kumar', relationship: 'Spouse', phone: '+91 98765 99991', email: 'neha.k@example.com', priority: 'Primary', isPrimary: true },
        { name: 'Dr. Priya Sharma', relationship: 'Personal Physician', phone: '+91 98765 11111', priority: 'Secondary', isPrimary: false }
      ],
      roomLocation: 'Sector 4, Apartment 2B',
      medicalHistory: ['Hypertension', 'Mild Asthma'],
      allergies: ['Penicillin'],
      allergiesDetail: [
        { name: 'Penicillin', severity: 'Severe', reaction: 'Anaphylactic reaction' }
      ],
      medicalConditionsDetail: [
        { condition: 'Essential Hypertension', diagnosedYear: '2020', status: 'Active' },
        { condition: 'Mild Asthma', diagnosedYear: '2017', status: 'Managed' }
      ],
      isActive: true
    }).save();

    // 8. Patient 2 — CASE STUDY ELDERLY PATIENT (Mr. Ravi)
    const patientRavi = await new User({
      name: 'Mr. Ravi', email: 'ravi@demo.com', password,
      role: 'patient', age: 68, gender: 'male', bloodGroup: 'B+',
      phone: '+91 98765 77777', assignedDoctor: doctor._id,
      caregiverPhone: '+91 98765 88888 (Anish - Caregiver)',
      emergencyContact: '+91 98765 99999 (Sunita - Daughter)',
      emergencyContacts: [
        { name: 'Sunita Sharma', relationship: 'Family (Daughter)', phone: '+91 98765 99999', email: 'sunita.sharma@example.com', priority: 'Primary', isPrimary: true },
        { name: 'Anish Verma', relationship: 'Caregiver', phone: '+91 98765 88888', email: 'caregiver.anish@example.com', priority: 'Primary', isPrimary: false },
        { name: 'Dr. Priya Sharma', relationship: 'Cardiologist', phone: '+91 98765 11111', priority: 'Secondary', isPrimary: false }
      ],
      roomLocation: 'Room 104, Sunrise Senior Home',
      medicalHistory: ['Coronary Artery Disease', 'Hypertension', 'History of Dizziness'],
      allergies: ['Sulfa Drugs', 'NSAIDs / Ibuprofen'],
      allergiesDetail: [
        { name: 'Sulfa Drugs', severity: 'Severe', reaction: 'Severe skin rash and hives' },
        { name: 'NSAIDs / Ibuprofen', severity: 'Moderate', reaction: 'Gastric irritation and facial swelling' }
      ],
      medicalConditionsDetail: [
        { condition: 'Coronary Artery Disease', diagnosedYear: '2019', status: 'Managed' },
        { condition: 'Essential Hypertension', diagnosedYear: '2018', status: 'Active' },
        { condition: 'History of Vertigo / Dizziness', diagnosedYear: '2022', status: 'Active' }
      ],
      isActive: true
    }).save();

    // Patient 3 (Meena Pillai)
    const patient3 = await new User({
      name: 'Meena Pillai', email: 'patient2@demo.com', password,
      role: 'patient', age: 38, gender: 'female', bloodGroup: 'B+',
      phone: '+91 98765 33333', assignedDoctor: doctor._id,
      roomLocation: 'Flat 301, Green Valley',
      medicalHistory: ['Type 2 Diabetes'],
      isActive: true
    }).save();

    // Link doctor to patients
    await User.findByIdAndUpdate(doctor._id, {
      assignedPatients: [patient1._id, patientRavi._id, patient3._id]
    });

    // Seed Hospital Visits for Mr. Ravi
    await new HospitalVisit({
      patientId: patientRavi._id,
      hospitalName: 'Apollo Emergency Care Center',
      visitDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      visitType: 'Emergency Admission',
      doctorName: 'Dr. Priya Sharma',
      reason: 'Acute dizziness and sudden hypertensive spike (BP 170/105)',
      diagnosis: 'Transient Hypertensive Crisis & Mild Dehydration',
      dischargeSummary: 'Patient IV hydrated, sublingual antihypertensives administered. Discharged in stable condition with modified beta-blocker dosage.',
      status: 'Discharged'
    }).save();

    await new HospitalVisit({
      patientId: patientRavi._id,
      hospitalName: 'Sunrise Specialty Clinic',
      visitDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      visitType: 'Outpatient Consult',
      doctorName: 'Dr. Priya Sharma',
      reason: 'Routine quarterly cardiac evaluation & ECG checkup',
      diagnosis: 'Stable Angina Pectoris',
      dischargeSummary: 'ECG within expected baseline. Lipid profile requested.',
      status: 'Completed'
    }).save();

    // Seed Insurance Claims
    await new InsuranceClaim({
      claimId: 'CLM100248',
      patientId: patientRavi._id,
      hospitalName: 'Apollo Emergency Care Center',
      claimAmount: 45000,
      policyNumber: 'POL-MED-99201',
      treatmentDescription: 'Emergency Admission for Hypertensive Crisis & IV Hydration Therapy',
      status: 'Pending'
    }).save();

    await new InsuranceClaim({
      claimId: 'CLM100249',
      patientId: patient1._id,
      hospitalName: 'City Care Hospital',
      claimAmount: 18500,
      policyNumber: 'POL-MED-88102',
      treatmentDescription: 'Outpatient Diagnostic Workup & Asthma Management',
      status: 'Approved',
      reviewedAt: new Date(),
      reviewedBy: insuranceOfficer._id
    }).save();

    // Seed 7 days telemetry for Mr. Ravi
    const now = new Date();
    const raviTelemetry = [
      { heartRate: 74, spo2: 98, temperature: 98.4, stepCount: 4250, systolicBP: 124, diastolicBP: 82, fallDetected: false },
      { heartRate: 76, spo2: 97, temperature: 98.6, stepCount: 3800, systolicBP: 126, diastolicBP: 84, fallDetected: false },
      { heartRate: 82, spo2: 96, temperature: 98.5, stepCount: 2900, systolicBP: 130, diastolicBP: 86, fallDetected: false },
      { heartRate: 88, spo2: 95, temperature: 98.8, stepCount: 1500, systolicBP: 138, diastolicBP: 90, fallDetected: false },
      { heartRate: 98, spo2: 93, temperature: 99.4, stepCount: 800, systolicBP: 145, diastolicBP: 94, fallDetected: false },
      { heartRate: 145, spo2: 88, temperature: 101.2, stepCount: 120, systolicBP: 165, diastolicBP: 102, fallDetected: true }
    ];

    for (let i = 0; i < raviTelemetry.length; i++) {
      const v = raviTelemetry[i];
      const ai = analyzeVitals(v.heartRate, v.spo2, v.temperature, v.stepCount, v.systolicBP, v.diastolicBP, v.fallDetected);
      const date = new Date(now);
      date.setDate(date.getDate() - (raviTelemetry.length - 1 - i));

      await new VitalSigns({
        patientId: patientRavi._id,
        ...v,
        source: 'wearable',
        location: 'Room 104, Sunrise Senior Home',
        aiScore: ai.score,
        aiStatus: ai.status,
        aiReasons: ai.reasons,
        aiRecommendation: ai.recommendation,
        recordedAt: date
      }).save();
    }

    // ─── SEED SOS EMERGENCY CASES ──────────────────────────────────────
    console.log('🚨 Seeding SOS Emergency Cases & Dispatch Incidents...');

    // 1. Active Emergency Case for Mr. Ravi (Fall Alert, Team Assigned)
    const emgCaseRavi = await new EmergencyCase({
      emergencyId: 'EMG-1042',
      patientId: patientRavi._id,
      patientName: patientRavi.name,
      emergencyType: 'FALL_ALERT',
      status: 'TEAM_ASSIGNED',
      priority: 'Critical',
      triggeredAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
      location: {
        latitude: 28.6139,
        longitude: 77.2090,
        accuracy: 8,
        timestamp: new Date(Date.now() - 25 * 60 * 1000),
        address: 'Room 104, Sunrise Senior Living, New Delhi',
        isAvailable: true
      },
      emergencyContacts: patientRavi.emergencyContacts.map(c => ({
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        email: c.email,
        priority: c.priority,
        notified: true,
        notifiedAt: new Date(Date.now() - 24 * 60 * 1000)
      })),
      assignedDoctor: doctor._id,
      assignedHospital: 'MediLink Central Trauma & Emergency Center',
      assignedEmergencyTeam: {
        teamId: 'TEAM-ALPHA',
        teamName: 'Rapid Response Unit 01 (Trauma)',
        leadResponder: 'Capt. Rajesh Varma (Paramedic)',
        contactPhone: '+91 98765 30001',
        vehicleType: 'Advanced Life Support (ALS) Ambulance',
        assignedAt: new Date(Date.now() - 15 * 60 * 1000)
      },
      recentHealthData: {
        heartRate: 145,
        spo2: 88,
        temperature: 101.2,
        systolicBP: 165,
        diastolicBP: 102,
        aiScore: 92,
        source: 'Apple Watch Series 9 & Dexcom G7'
      },
      timeline: [
        {
          event: 'SOS_TRIGGERED',
          message: 'Possible fall event & critical vitals detected by wearable sensor for Mr. Ravi.',
          timestamp: new Date(Date.now() - 25 * 60 * 1000),
          performedBy: patientRavi._id,
          performedByName: patientRavi.name,
          performedByRole: 'patient'
        },
        {
          event: 'CONTACT_NOTIFIED',
          message: 'Emergency contacts notified: Sunita Sharma (+91 98765 99999), Anish Verma (+91 98765 88888).',
          timestamp: new Date(Date.now() - 24 * 60 * 1000),
          performedByName: 'Notification Engine',
          performedByRole: 'system'
        },
        {
          event: 'DOCTOR_NOTIFIED',
          message: 'Assigned cardiologist Dr. Priya Sharma notified via Doctor Portal.',
          timestamp: new Date(Date.now() - 24 * 60 * 1000),
          performedByName: 'Notification Engine',
          performedByRole: 'system'
        },
        {
          event: 'HOSPITAL_NOTIFIED',
          message: 'Central Trauma Desk incident ticket created.',
          timestamp: new Date(Date.now() - 24 * 60 * 1000),
          performedByName: 'Notification Engine',
          performedByRole: 'system'
        },
        {
          event: 'CASE_ACKNOWLEDGED',
          message: 'Case acknowledged by Dr. Priya Sharma. Directing ALS response team.',
          timestamp: new Date(Date.now() - 20 * 60 * 1000),
          performedBy: doctor._id,
          performedByName: 'Dr. Priya Sharma',
          performedByRole: 'doctor'
        },
        {
          event: 'TEAM_ASSIGNED',
          message: 'Assigned Response Unit: Rapid Response Unit 01 (Trauma ALS Ambulance). Lead: Capt. Rajesh Varma.',
          timestamp: new Date(Date.now() - 15 * 60 * 1000),
          performedByName: 'ER Dispatch Officer',
          performedByRole: 'emergency'
        }
      ],
      alertsSent: [
        {
          recipientType: 'Emergency Contact',
          recipientName: 'Sunita Sharma',
          recipientContact: '+91 98765 99999',
          channel: 'SMS_PREVIEW',
          status: 'DELIVERED',
          sentAt: new Date(Date.now() - 24 * 60 * 1000)
        },
        {
          recipientType: 'Doctor',
          recipientName: 'Dr. Priya Sharma',
          recipientContact: '+91 98765 11111',
          channel: 'IN_APP',
          status: 'DELIVERED',
          sentAt: new Date(Date.now() - 24 * 60 * 1000)
        },
        {
          recipientType: 'Hospital',
          recipientName: 'Central Trauma Desk',
          recipientContact: 'Hotline 108',
          channel: 'SYSTEM_DISPATCH',
          status: 'DELIVERED',
          sentAt: new Date(Date.now() - 24 * 60 * 1000)
        }
      ]
    }).save();

    // 2. Past Resolved Emergency Case for Rajan Kumar
    await new EmergencyCase({
      emergencyId: 'EMG-1018',
      patientId: patient1._id,
      patientName: patient1.name,
      emergencyType: 'MANUAL_SOS',
      status: 'RESOLVED',
      priority: 'High Priority',
      triggeredAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h ago
      resolvedAt: new Date(Date.now() - 22 * 60 * 60 * 1000),
      resolvedBy: doctor._id,
      location: {
        latitude: 28.5355,
        longitude: 77.3910,
        accuracy: 12,
        address: 'Sector 4, Apartment 2B, Noida',
        isAvailable: true
      },
      emergencyContacts: patient1.emergencyContacts.map(c => ({
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        priority: c.priority,
        notified: true,
        notifiedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      })),
      assignedDoctor: doctor._id,
      assignedHospital: 'MediLink Central Trauma & Emergency Center',
      timeline: [
        {
          event: 'SOS_TRIGGERED',
          message: 'Patient Rajan Kumar activated manual SOS alert via app.',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          performedBy: patient1._id,
          performedByName: patient1.name,
          performedByRole: 'patient'
        },
        {
          event: 'CASE_ACKNOWLEDGED',
          message: 'Acknowledged by Dr. Priya Sharma via tele-consult.',
          timestamp: new Date(Date.now() - 23.5 * 60 * 60 * 1000),
          performedBy: doctor._id,
          performedByName: 'Dr. Priya Sharma',
          performedByRole: 'doctor'
        },
        {
          event: 'CASE_RESOLVED',
          message: 'Patient stabilized. Inhaler administered for acute mild bronchospasm. No hospitalization needed.',
          timestamp: new Date(Date.now() - 22 * 60 * 60 * 1000),
          performedBy: doctor._id,
          performedByName: 'Dr. Priya Sharma',
          performedByRole: 'doctor'
        }
      ]
    }).save();

    // Critical Emergency Alert for Mr. Ravi (linked to EMG-1042)
    await new Alert({
      patientId: patientRavi._id,
      doctorId: doctor._id,
      type: 'Critical',
      message: '🚨 CRITICAL FALL EVENT & Abnormal Vitals detected for Mr. Ravi. AI Risk Score: 92/100',
      score: 92,
      vitals: { heartRate: 145, spo2: 88, temperature: 101.2, systolicBP: 165, diastolicBP: 102 },
      fallDetected: true,
      location: 'Room 104, Sunrise Senior Home',
      notifiedEntities: ['Caregiver', 'Family', 'Doctor', 'Hospital'],
      emergencyStatus: 'Dispatched',
      emergencyCaseId: emgCaseRavi._id,
      reasons: [
        'Hard Fall Impact detected by wearable sensor',
        'Severe tachycardia: Heart rate 145 bpm (>140)',
        'Critical hypoxia: SpO2 88% (<88%)',
        'Hypertension Stage 2: BP 165/102 mmHg'
      ]
    }).save();

    // Telemetry for Rajan Kumar
    await new VitalSigns({
      patientId: patient1._id,
      heartRate: 85, spo2: 97, temperature: 98.6, stepCount: 6500,
      systolicBP: 120, diastolicBP: 80, fallDetected: false,
      aiScore: 10, aiStatus: 'Normal',
      aiReasons: ['All vitals within normal range'],
      aiRecommendation: 'All vitals normal. Continue regular monitoring.'
    }).save();

    // Medications for Mr. Ravi
    await new Medication({
      patientId: patientRavi._id, doctorId: doctor._id,
      name: 'Metoprolol Succinate', dosage: '50mg', frequency: 'Once daily in morning',
      instructions: 'Take with food. Monitors cardiac rhythm.', isActive: true
    }).save();

    await new Medication({
      patientId: patientRavi._id, doctorId: doctor._id,
      name: 'Ecosprin (Aspirin)', dosage: '75mg', frequency: 'Once daily after lunch',
      instructions: 'Antiplatelet therapy.', isActive: true
    }).save();

    await new Medication({
      patientId: patientRavi._id, doctorId: doctor._id,
      name: 'Atorvastatin', dosage: '20mg', frequency: 'Once at bedtime',
      instructions: 'Take before sleep.', isActive: true
    }).save();

    // Diet plan for Mr. Ravi
    await new DietPlan({
      patientId: patientRavi._id, doctorId: doctor._id,
      plan: `Breakfast: Oatmeal with chopped walnuts + low-fat milk\nMid-morning: Tender coconut water or 1 apple\nLunch: 2 Phulka + Dal + Boiled vegetables + Curd\nEvening: Green tea with roasted makhana\nDinner: Mixed vegetable soup + 1 Multigrain chapati\n\nGuidelines:\n- Low Sodium (<1.5g/day)\n- Hydration target: 2.5 Liters/day\n- Avoid high-fat dairy and fried snacks`,
      calories: 1600,
      notes: 'Geriatric Cardiac Diet — Sodium Restricted.'
    }).save();

    // ─── SEED LABORATORY DATA ─────────────────────────────────────────────
    console.log('🧪 Seeding Laboratory Test Requests, Samples, and Multi-Category Medical Reports...');

    // 1. Test Request: CBC for Mr. Ravi (Critical Priority)
    const testReq1 = await new TestRequest({
      requestId: 'REQ-100201',
      patientId: patientRavi._id,
      doctorId: doctor._id,
      testName: 'Complete Blood Count (CBC) with Platelets',
      testCategory: 'Laboratory',
      priority: 'Critical',
      status: 'Processing',
      clinicalNotes: 'Evaluate suspected acute bleeding or severe anemia post hypertensive crisis episode.'
    }).save();

    // Linked Sample for REQ-100201
    const sample1 = await new Sample({
      sampleId: 'SMP-883901',
      patientId: patientRavi._id,
      testRequestId: testReq1._id,
      sampleType: 'Blood',
      status: 'Processing',
      barcode: 'BAR-SMP-883901',
      storageLocation: 'Rack A-2, Hematology Cooler 4°C',
      notes: 'EDTA Vacutainer tube received. Specimen intact.'
    }).save();

    testReq1.sampleId = sample1._id;
    await testReq1.save();

    // 2. Test Request: Renal Function Test for Meena Pillai (Normal Priority)
    const testReq2 = await new TestRequest({
      requestId: 'REQ-100202',
      patientId: patient3._id,
      doctorId: doctor._id,
      testName: 'Kidney Function Test (KFT) Panel',
      testCategory: 'Laboratory',
      priority: 'Normal',
      status: 'Pending',
      clinicalNotes: 'Routine annual diabetic nephropathy screening.'
    }).save();

    const sample2 = await new Sample({
      sampleId: 'SMP-883902',
      patientId: patient3._id,
      testRequestId: testReq2._id,
      sampleType: 'Blood',
      status: 'Requested',
      barcode: 'BAR-SMP-883902',
      storageLocation: 'Rack B-1, Specimen Intake'
    }).save();

    testReq2.sampleId = sample2._id;
    await testReq2.save();

    // 3. Test Request: Chest X-Ray for Rajan Kumar (Urgent Priority)
    const testReq3 = await new TestRequest({
      requestId: 'REQ-100203',
      patientId: patient1._id,
      doctorId: doctor._id,
      testName: 'Chest X-Ray (PA View)',
      testCategory: 'Radiology',
      priority: 'Urgent',
      status: 'Completed',
      clinicalNotes: 'Check for bronchial thickening and asthma exacerbation baseline.'
    }).save();

    // ─── SEED COMPREHENSIVE MEDICAL REPORTS ───────────────────────────────

    // Report 1: CBC Blood Test for Mr. Ravi (Critical Hemoglobin = 6.8 g/dL)
    const cbcResults = [
      { parameter: 'Hemoglobin', value: '6.8', unit: 'g/dL', referenceRange: '12.0 - 17.5', status: 'Critical' },
      { parameter: 'WBC', value: '14.2', unit: '10^3/uL', referenceRange: '4.5 - 11.0', status: 'High' },
      { parameter: 'RBC', value: '2.9', unit: '10^6/uL', referenceRange: '4.0 - 5.9', status: 'Low' },
      { parameter: 'Platelets', value: '98', unit: '10^3/uL', referenceRange: '150 - 450', status: 'Low' },
      { parameter: 'Hematocrit', value: '22', unit: '%', referenceRange: '36 - 50', status: 'Low' }
    ];
    const cbcAi = generateReportAiAnalysis(cbcResults, 'CBC Blood Test', 'Laboratory');

    await new MedicalReport({
      reportId: 'REP-2026-0042',
      patientId: patientRavi._id,
      doctorId: doctor._id,
      testRequestId: testReq1._id,
      sampleId: sample1._id,
      hospitalName: 'Apollo Emergency Care Center',
      labName: 'Sunrise Diagnostic Pathology',
      category: 'Laboratory',
      reportType: 'CBC Blood Test',
      fileName: 'ravi_cbc_critical.pdf',
      originalFileName: 'CBC_Report_Ravi_Mr.pdf',
      fileFormat: 'PDF',
      fileSize: 420000,
      testDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      reportDate: new Date(),
      uploadDate: new Date(),
      uploadedBy: 'lab',
      uploaderId: labTech._id,
      reportStatus: 'Published',
      criticalStatus: 'Critical',
      structuredResults: cbcResults,
      aiAnalysis: cbcAi,
      doctorComment: 'Severe acute anemia observed (Hb 6.8 g/dL). Blood transfusion evaluation recommended.',
      patientNote: 'Urgent follow-up requested by attending clinician.'
    }).save();

    // Report 2: 12-Lead ECG for Mr. Ravi (Cardiology)
    await new MedicalReport({
      reportId: 'REP-2026-0043',
      patientId: patientRavi._id,
      doctorId: doctor._id,
      hospitalName: 'Sunrise Specialty Clinic',
      labName: 'Central Diagnostic Cardiology',
      category: 'Cardiology',
      reportType: 'ECG / EKG',
      fileName: 'ravi_ecg_telemetry.csv',
      originalFileName: 'ECG_12Lead_Ravi.csv',
      fileFormat: 'CSV',
      fileSize: 180000,
      testDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      reportDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      uploadedBy: 'lab',
      uploaderId: labTech._id,
      reportStatus: 'Published',
      criticalStatus: 'Abnormal',
      structuredResults: [
        { parameter: 'Heart Rate', value: '108', unit: 'bpm', referenceRange: '60 - 100', status: 'High' },
        { parameter: 'PR Interval', value: '164', unit: 'ms', referenceRange: '120 - 200', status: 'Normal' },
        { parameter: 'QRS Duration', value: '92', unit: 'ms', referenceRange: '80 - 120', status: 'Normal' },
        { parameter: 'QTc Interval', value: '458', unit: 'ms', referenceRange: '350 - 450', status: 'High' }
      ],
      aiAnalysis: {
        summary: 'Sinus tachycardia with borderline prolonged QTc interval detected in 12-lead ECG recording.',
        abnormalFindings: ['Elevated resting heart rate (108 bpm)', 'QTc interval borderline elongated (458 ms)'],
        trendNotes: 'Compare with baseline pre-admission trace.',
        disclaimer: 'AI-generated information for clinical review. Doctors remain responsible for medical decisions.',
        generatedAt: new Date()
      },
      doctorComment: 'Sinus tachycardia noted. Continue Metoprolol 50mg.'
    }).save();

    // Report 3: Chest X-Ray for Rajan Kumar (Radiology / DICOM)
    await new MedicalReport({
      reportId: 'REP-2026-0044',
      patientId: patient1._id,
      doctorId: doctor._id,
      testRequestId: testReq3._id,
      hospitalName: 'City Care Hospital',
      labName: 'Advanced Imaging & Radiology Center',
      category: 'Radiology',
      reportType: 'X-Ray',
      fileName: 'rajan_chest_xray.dcm',
      originalFileName: 'Chest_PA_RajanKumar.dcm',
      fileFormat: 'DICOM',
      fileSize: 8500000,
      testDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      reportDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      uploadedBy: 'lab',
      uploaderId: labTech._id,
      reportStatus: 'Published',
      criticalStatus: 'Normal',
      structuredResults: [
        { parameter: 'Cardiothoracic Ratio', value: '0.46', unit: '', referenceRange: '< 0.50', status: 'Normal' },
        { parameter: 'Lung Fields', value: 'Clear', unit: '', referenceRange: 'Clear', status: 'Normal' },
        { parameter: 'Pleural Spaces', value: 'Clear', unit: '', referenceRange: 'Clear', status: 'Normal' }
      ],
      aiAnalysis: {
        summary: 'No focal consolidation, pneumothorax, or active pleural effusion identified. Lung parenchyma clear.',
        abnormalFindings: [],
        trendNotes: 'Stable radiograph within normal limits.',
        disclaimer: 'AI-generated information for clinical review. Doctors remain responsible for medical decisions.',
        generatedAt: new Date()
      },
      doctorComment: 'Normal chest radiograph. Asthma is clinically controlled.'
    }).save();

    // Report 4: Lipid Profile for Rajan Kumar (Normal)
    await new MedicalReport({
      reportId: 'REP-2026-0045',
      patientId: patient1._id,
      doctorId: doctor._id,
      hospitalName: 'City Care Hospital',
      labName: 'Sunrise Diagnostic Pathology',
      category: 'Laboratory',
      reportType: 'Lipid Profile',
      fileName: 'rajan_lipid_profile.pdf',
      originalFileName: 'Lipid_Panel_Rajan.pdf',
      fileFormat: 'PDF',
      fileSize: 310000,
      testDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      reportDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      uploadedBy: 'lab',
      uploaderId: labTech._id,
      reportStatus: 'Published',
      criticalStatus: 'Normal',
      structuredResults: [
        { parameter: 'Total Cholesterol', value: '168', unit: 'mg/dL', referenceRange: '125 - 200', status: 'Normal' },
        { parameter: 'HDL Cholesterol', value: '48', unit: 'mg/dL', referenceRange: '40 - 60', status: 'Normal' },
        { parameter: 'LDL Cholesterol', value: '92', unit: 'mg/dL', referenceRange: '50 - 100', status: 'Normal' },
        { parameter: 'Triglycerides', value: '135', unit: 'mg/dL', referenceRange: '50 - 150', status: 'Normal' }
      ],
      aiAnalysis: {
        summary: 'All lipid fractions fall within target cardiovascular risk boundaries.',
        abnormalFindings: [],
        trendNotes: 'Maintain balanced dietary habits.',
        disclaimer: 'AI-generated information for clinical review. Doctors remain responsible for medical decisions.',
        generatedAt: new Date()
      }
    }).save();

    // Notifications for Lab
    await new Notification({
      recipientId: labTech._id,
      role: 'lab',
      type: 'test_requested',
      title: '📋 High Priority Test Request: REQ-100201',
      message: 'Critical CBC test requested for Mr. Ravi (Room 104).',
      testRequestId: testReq1._id,
      severity: 'Critical'
    }).save();

    await new Notification({
      recipientId: doctor._id,
      role: 'doctor',
      type: 'critical_alert',
      title: '🚨 Critical Lab Alert: Mr. Ravi',
      message: 'Hemoglobin measured at 6.8 g/dL (<7.0 g/dL critical threshold). Immediate evaluation needed.',
      severity: 'Critical'
    }).save();

    console.log('✅ MediLink AI 8-Portal Ecosystem dataset pre-loaded!');
    console.log('');
    console.log('  1. 👤 Patient (Elderly): ravi@demo.com     / demo123 (Mr. Ravi)');
    console.log('  2. 👤 Patient (Standard): patient@demo.com  / demo123 (Rajan Kumar)');
    console.log('  3. 👨‍⚕️ Doctor:             doctor@demo.com   / demo123 (Dr. Priya Sharma)');
    console.log('  4. 🏥 Hospital / Admin:  admin@demo.com    / demo123 (Super Admin)');
    console.log('  5. 🧪 Lab Staff:         lab@demo.com      / demo123 (John Doe)');
    console.log('  6. 💊 Pharmacist:        pharmacy@demo.com / demo123 (Anita Patel)');
    console.log('  7. 🛡️ Insurance Officer: insurance@demo.com/ demo123 (Rakesh Mehta)');
    console.log('  8. 🚑 Emergency Response: emergency@demo.com/ demo123 (Vikram Singh)');
    console.log('');

  } catch (err) {
    console.error('Seed error:', err.message);
  }
};

module.exports = { seed };

