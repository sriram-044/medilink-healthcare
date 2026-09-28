/**
 * utils/ai/rag/ragRetriever.js — Authorized Structured Retrieval Engine
 *
 * Executes MongoDB queries STRICTLY filtered by the RagAuthContext built
 * by ragAuthorization.js.  The LLM never calls this module — only ragService
 * calls it after all authorization checks have passed.
 *
 * Design principles:
 * - Every query carries an authorization filter (patientId / assignedPatientIds / role scope).
 * - All queries use projections (no full-document leaks).
 * - All queries use .limit() — no unbounded collection scans.
 * - All queries use existing Step 7 indexes (patientId+date, etc.).
 * - Temporal filters are applied server-side via resolveTemporalFilter().
 */

'use strict';

const VitalSigns      = require('../../../models/VitalSigns');
const MedicalReport   = require('../../../models/MedicalReport');
const Medication      = require('../../../models/Medication').Medication || require('../../../models/Medication');
const TestRequest     = require('../../../models/TestRequest');
const Sample          = require('../../../models/Sample');
const EmergencyCase   = require('../../../models/EmergencyCase');
const InsuranceClaim  = require('../../../models/InsuranceClaim');
const Alert           = require('../../../models/Alert');
const User            = require('../../../models/User');

const { RAG_LIMITS, CAPABILITY_COLLECTIONS, resolveTemporalFilter } = require('./ragConfig');

// ─── Source label helpers ──────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return 'Unknown date';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Individual collection retrievers ──────────────────────────────────────

async function retrieveVitalSigns(authCtx, dateFilter) {
  const query = {};
  if (authCtx.patientId) {
    query.patientId = authCtx.patientId;
  } else if (authCtx.assignedPatientIds) {
    query.patientId = { $in: authCtx.assignedPatientIds };
  } else {
    // No patient scope → skip (safety)
    return [];
  }
  if (dateFilter) query.recordedAt = dateFilter;

  const records = await VitalSigns
    .find(query)
    .select('patientId heartRate spo2 temperature systolicBP diastolicBP glucoseLevel aiStatus aiScore recordedAt')
    .sort({ recordedAt: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:  'vital',
    _sourceId:    r._id?.toString(),
    _patientId:   r.patientId?.toString(),
    _date:        r.recordedAt,
    _label:       `Vital Signs — ${fmtDate(r.recordedAt)}`,
    heartRate:    r.heartRate,
    spo2:         r.spo2,
    temperature:  r.temperature,
    systolicBP:   r.systolicBP,
    diastolicBP:  r.diastolicBP,
    glucoseLevel: r.glucoseLevel,
    aiStatus:     r.aiStatus,
    aiScore:      r.aiScore
  }));
}

async function retrieveMedicalReports(authCtx, dateFilter) {
  const query = {};
  if (authCtx.patientId) {
    query.patientId = authCtx.patientId;
  } else if (authCtx.assignedPatientIds) {
    query.patientId = { $in: authCtx.assignedPatientIds };
  } else if (authCtx.isLabStaff) {
    // Lab can see reports with lab-relevant categories
    query.category = { $in: ['Laboratory', 'Pathology', 'Diagnostic'] };
  } else {
    return [];
  }
  if (dateFilter) query.testDate = dateFilter;

  const records = await MedicalReport
    .find(query)
    .select('reportId reportType category testDate criticalStatus structuredResults patientNote doctorComment aiAnalysis extractedText')
    .sort({ testDate: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:       'medical_report',
    _sourceId:         r._id?.toString(),
    _patientId:        r.patientId?.toString(),
    _date:             r.testDate,
    _label:            `${r.reportType || 'Medical Report'} — ${fmtDate(r.testDate)}`,
    reportId:          r.reportId,
    reportType:        r.reportType,
    category:          r.category,
    testDate:          r.testDate,
    criticalStatus:    r.criticalStatus,
    extractedText:     r.extractedText,
    structuredResults: (r.structuredResults || []).slice(0, 10).map(s => ({
      parameter: s.parameter,
      value:     s.value,
      unit:      s.unit,
      status:    s.status
    })),
    aiSummary:         r.aiAnalysis?.summary,
    abnormalFindings:  r.aiAnalysis?.abnormalFindings,
    patientNote:       r.patientNote,
    doctorComment:     r.doctorComment
  }));
}

async function retrieveMedications(authCtx, dateFilter) {
  const query = { isActive: true };
  if (authCtx.patientId) {
    query.patientId = authCtx.patientId;
  } else if (authCtx.assignedPatientIds) {
    query.patientId = { $in: authCtx.assignedPatientIds };
  } else if (authCtx.isPharmacy) {
    // Pharmacy sees all active medications (no patient restriction for workload)
    // still bounded by maxRecordsPerType
  } else {
    return [];
  }
  if (dateFilter) query.createdAt = dateFilter;

  const records = await Medication
    .find(query)
    .select('patientId name dosage frequency instructions startDate endDate isActive')
    .sort({ createdAt: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:  'medication',
    _sourceId:    r._id?.toString(),
    _patientId:   r.patientId?.toString(),
    _date:        r.startDate,
    _label:       `Medication: ${r.name} — since ${fmtDate(r.startDate)}`,
    name:         r.name,
    dosage:       r.dosage,
    frequency:    r.frequency,
    instructions: r.instructions,
    startDate:    r.startDate,
    endDate:      r.endDate
  }));
}

async function retrieveTestRequests(authCtx, dateFilter) {
  const query = {};
  if (authCtx.patientId) {
    query.patientId = authCtx.patientId;
  } else if (authCtx.assignedPatientIds) {
    query.patientId = { $in: authCtx.assignedPatientIds };
  } else if (authCtx.isLabStaff) {
    // Lab sees their workload (no patient restriction)
  } else {
    return [];
  }
  if (dateFilter) query.requestDate = dateFilter;

  const records = await TestRequest
    .find(query)
    .select('requestId testName testCategory priority status requestDate clinicalNotes')
    .sort({ requestDate: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:    'test_request',
    _sourceId:      r._id?.toString(),
    _patientId:     r.patientId?.toString(),
    _date:          r.requestDate,
    _label:         `Lab Test: ${r.testName} — ${fmtDate(r.requestDate)}`,
    requestId:      r.requestId,
    testName:       r.testName,
    testCategory:   r.testCategory,
    priority:       r.priority,
    status:         r.status,
    requestDate:    r.requestDate,
    clinicalNotes:  r.clinicalNotes
  }));
}

async function retrieveSamples(authCtx, dateFilter) {
  if (!authCtx.isLabStaff && !authCtx.patientId) return [];

  const query = {};
  if (authCtx.patientId) {
    query.patientId = authCtx.patientId;
  }
  if (dateFilter) query.collectionDate = dateFilter;

  const records = await Sample
    .find(query)
    .select('sampleId sampleType status collectionDate collectedBy notes')
    .sort({ collectionDate: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:      'sample',
    _sourceId:        r._id?.toString(),
    _patientId:       r.patientId?.toString(),
    _date:            r.collectionDate,
    _label:           `Sample: ${r.sampleType} — ${fmtDate(r.collectionDate)}`,
    sampleId:         r.sampleId,
    sampleType:       r.sampleType,
    status:           r.status,
    collectionDate:   r.collectionDate,
    collectedBy:      r.collectedBy
  }));
}

async function retrieveAlerts(authCtx, dateFilter) {
  if (!authCtx.patientId && !authCtx.isEmergency) return [];

  const query = { resolved: false };
  if (authCtx.patientId) query.patientId = authCtx.patientId;
  if (dateFilter) query.createdAt = dateFilter;

  const records = await Alert
    .find(query)
    .select('type message score vitals fallDetected location emergencyStatus reasons createdAt')
    .sort({ createdAt: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:      'alert',
    _sourceId:        r._id?.toString(),
    _patientId:       r.patientId?.toString(),
    _date:            r.createdAt,
    _label:           `Alert (${r.type}) — ${fmtDate(r.createdAt)}`,
    type:             r.type,
    message:          r.message,
    score:            r.score,
    vitals:           r.vitals,
    emergencyStatus:  r.emergencyStatus,
    reasons:          r.reasons
  }));
}

async function retrieveEmergencyCases(authCtx, dateFilter) {
  if (!authCtx.isEmergency && !authCtx.isAdmin) return [];

  const query = {};
  if (authCtx.patientId) query.patientId = authCtx.patientId;
  if (dateFilter) query.triggeredAt = dateFilter;

  const records = await EmergencyCase
    .find(query)
    .select('emergencyId patientName emergencyType status priority triggeredAt recentHealthData notes assignedHospital')
    .sort({ triggeredAt: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:      'emergency_case',
    _sourceId:        r._id?.toString(),
    _date:            r.triggeredAt,
    _label:           `Emergency Case ${r.emergencyId} — ${fmtDate(r.triggeredAt)}`,
    emergencyId:      r.emergencyId,
    patientName:      r.patientName,
    emergencyType:    r.emergencyType,
    status:           r.status,
    priority:         r.priority,
    triggeredAt:      r.triggeredAt,
    recentHealthData: r.recentHealthData,
    assignedHospital: r.assignedHospital
  }));
}

async function retrieveInsuranceClaims(authCtx, dateFilter) {
  if (!authCtx.isInsurance && !authCtx.isAdmin) return [];

  const query = {};
  if (authCtx.patientId) query.patientId = authCtx.patientId;
  if (dateFilter) query.claimDate = dateFilter;

  const records = await InsuranceClaim
    .find(query)
    .select('claimId hospitalName claimAmount policyNumber status claimDate treatmentDescription')
    .sort({ claimDate: -1 })
    .limit(RAG_LIMITS.maxRecordsPerType)
    .lean();

  return records.map(r => ({
    _sourceType:          'insurance_claim',
    _sourceId:            r._id?.toString(),
    _patientId:           r.patientId?.toString(),
    _date:                r.claimDate,
    _label:               `Insurance Claim ${r.claimId} — ${fmtDate(r.claimDate)}`,
    claimId:              r.claimId,
    hospitalName:         r.hospitalName,
    claimAmount:          r.claimAmount,
    policyNumber:         r.policyNumber,
    status:               r.status,
    claimDate:            r.claimDate,
    treatmentDescription: r.treatmentDescription
  }));
}

async function retrieveStats(authCtx) {
  if (!authCtx.isAdmin) return [];

  const [totalPatients, activeEmergencies, pendingTests, totalReports] = await Promise.all([
    User.countDocuments({ role: 'patient' }),
    EmergencyCase.countDocuments({ status: { $in: ['ACTIVE', 'TEAM_ASSIGNED', 'EN_ROUTE'] } }),
    TestRequest.countDocuments({ status: { $in: ['Pending', 'Processing'] } }),
    MedicalReport.countDocuments({})
  ]);

  return [{
    _sourceType:      'operational_stats',
    _sourceId:        'stats-' + Date.now(),
    _date:            new Date(),
    _label:           `Hospital Operational Statistics — ${fmtDate(new Date())}`,
    totalPatients,
    activeEmergencies,
    pendingTests,
    totalReports
  }];
}

// ─── Routing dispatcher ────────────────────────────────────────────────────

const RETRIEVER_MAP = {
  vitalSigns:     retrieveVitalSigns,
  medicalReports: retrieveMedicalReports,
  medications:    retrieveMedications,
  testRequests:   retrieveTestRequests,
  samples:        retrieveSamples,
  alerts:         retrieveAlerts,
  emergencyCases: retrieveEmergencyCases,
  insuranceClaims:retrieveInsuranceClaims,
  stats:          (authCtx) => retrieveStats(authCtx)
};

/**
 * Dispatches retrieval for a given set of collection types.
 * Called exclusively by ragService after authorization has been verified.
 *
 * @param {string[]}    collectionTypes - From CAPABILITY_COLLECTIONS[capability]
 * @param {RagAuthContext} authCtx      - Authorization context from ragAuthorization
 * @param {object|null} dateFilter      - MongoDB date filter (from resolveTemporalFilter) or null
 * @returns {Promise<object[]>}         - Flat array of retrieved, source-tagged records
 */
async function retrieve(collectionTypes, authCtx, dateFilter) {
  if (!Array.isArray(collectionTypes) || collectionTypes.length === 0) return [];

  const tasks = collectionTypes.map(type => {
    const fn = RETRIEVER_MAP[type];
    if (!fn) return Promise.resolve([]);
    return fn(authCtx, dateFilter).catch(() => []); // never let one failure kill the request
  });

  const results = await Promise.all(tasks);
  return results.flat();
}

module.exports = { retrieve };
