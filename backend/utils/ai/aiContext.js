/**
 * utils/ai/aiContext.js — Controlled Context Builder & Data Minimization
 *
 * Implements strict data minimization:
 * - Only queries data strictly authorized for the user
 * - Removes passwords, hashes, tokens, internal paths, and secret metadata
 * - Caps volume to prevent prompt bloating and context stuffing
 */

const User = require('../../models/User');
const VitalSigns = require('../../models/VitalSigns');
const MedicalReport = require('../../models/MedicalReport');
const Medication = require('../../models/Medication').Medication || require('../../models/Medication');
const TestRequest = require('../../models/TestRequest');
const Sample = require('../../models/Sample');
const EmergencyCase = require('../../models/EmergencyCase');
const InsuranceClaim = require('../../models/InsuranceClaim');

/**
 * Deep sanitization function to strip sensitive or internal fields.
 * @param {any} data
 * @returns {any}
 */
function sanitizeContext(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeContext(item));
  }

  const forbiddenKeys = new Set([
    'password',
    'passwordHash',
    'token',
    'secret',
    'accessToken',
    'refreshToken',
    'filePath',
    'tempFilePath',
    'fileUrl',
    'googleId',
    '__v',
    'stack'
  ]);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (forbiddenKeys.has(key)) continue;

    if (key === '_id' && typeof value === 'object' && value !== null) {
      clean[key] = value.toString();
    } else if (value instanceof Date) {
      clean[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeContext(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Builds minimized, role-authorized context for the AI prompt.
 *
 * @param {object} user - Authenticated user
 * @param {string} capability - Validated capability
 * @param {string} [patientId] - Authorized patient ID
 * @param {string} [resourceId] - Authorized resource ID
 * @returns {Promise<object>} Minimized clinical context object
 */
async function buildAuthorizedContext(user, capability, patientId, resourceId) {
  const context = {
    role: user.role,
    capability,
    retrievedAt: new Date().toISOString()
  };

  switch (capability) {
    case 'medical_report':
    case 'lab_analysis': {
      const query = {};
      if (resourceId) {
        query._id = resourceId;
      } else if (patientId) {
        query.patientId = patientId;
      }

      const reports = await MedicalReport.find(query)
        .select('reportType category testDate summary criticalStatus findings structuredResults')
        .sort({ testDate: -1 })
        .limit(3)
        .lean();

      context.medicalReports = reports.map(r => ({
        reportType: r.reportType,
        category: r.category,
        testDate: r.testDate,
        summary: r.summary,
        criticalStatus: r.criticalStatus,
        findings: (r.findings || []).slice(0, 5),
        structuredResults: (r.structuredResults || []).slice(0, 10).map(s => ({
          parameter: s.parameter,
          value: s.value,
          unit: s.unit,
          flag: s.flag
        }))
      }));
      break;
    }

    case 'vital_trends':
    case 'critical_vitals': {
      if (patientId) {
        const vitals = await VitalSigns.find({ patientId })
          .select('heartRate spo2 temperature recordedAt aiStatus aiScore')
          .sort({ recordedAt: -1 })
          .limit(5)
          .lean();

        context.vitalSigns = vitals.map(v => ({
          heartRate: v.heartRate,
          spo2: v.spo2,
          temperature: v.temperature,
          recordedAt: v.recordedAt,
          aiStatus: v.aiStatus,
          aiScore: v.aiScore
        }));
      }
      break;
    }

    case 'medications':
    case 'prescription_summary': {
      if (patientId) {
        const meds = await Medication.find({ patientId, isActive: true })
          .select('name dosage frequency instructions timing')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();

        context.medications = meds.map(m => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          instructions: m.instructions,
          timing: m.timing
        }));
      }
      break;
    }

    case 'patient_summary':
    case 'clinical_documentation': {
      if (patientId) {
        const patient = await User.findById(patientId)
          .select('name age gender bloodGroup allergies roomLocation')
          .lean();

        if (patient) {
          context.patientProfile = {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            bloodGroup: patient.bloodGroup,
            allergies: patient.allergies || [],
            roomLocation: patient.roomLocation
          };
        }

        const latestVitals = await VitalSigns.findOne({ patientId })
          .select('heartRate spo2 temperature recordedAt aiStatus')
          .sort({ recordedAt: -1 })
          .lean();

        if (latestVitals) {
          context.latestVitals = {
            heartRate: latestVitals.heartRate,
            spo2: latestVitals.spo2,
            temperature: latestVitals.temperature,
            recordedAt: latestVitals.recordedAt,
            aiStatus: latestVitals.aiStatus
          };
        }
      }
      break;
    }

    case 'test_results':
    case 'abnormal_values':
    case 'report_drafting':
    case 'workload_summary': {
      if (user.role === 'lab') {
        const testRequests = await TestRequest.find({})
          .select('requestId testName priority status requestDate')
          .sort({ requestDate: -1 })
          .limit(5)
          .lean();

        context.labWorkload = {
          recentRequests: testRequests.map(t => ({
            requestId: t.requestId,
            testName: t.testName,
            priority: t.priority,
            status: t.status,
            requestDate: t.requestDate
          }))
        };
      }
      break;
    }

    case 'emergency_case_summary':
    case 'dispatch_coordination': {
      if (user.role === 'emergency' || user.role === 'admin') {
        const activeCases = await EmergencyCase.find({ status: { $in: ['ACTIVE', 'TEAM_ASSIGNED', 'EN_ROUTE'] } })
          .select('emergencyId patientName priority status incidentDescription triagePriority triggeredAt')
          .sort({ triggeredAt: -1 })
          .limit(3)
          .lean();

        context.activeEmergencies = activeCases.map(c => ({
          emergencyId: c.emergencyId,
          patientName: c.patientName,
          priority: c.priority,
          status: c.status,
          triagePriority: c.triagePriority,
          incidentDescription: c.incidentDescription,
          triggeredAt: c.triggeredAt
        }));
      }
      break;
    }

    case 'claim_summary':
    case 'policy_explanation': {
      if (user.role === 'insurance' || user.role === 'admin') {
        const claims = await InsuranceClaim.find({})
          .select('claimId treatmentType claimAmount status claimDate')
          .sort({ claimDate: -1 })
          .limit(5)
          .lean();

        context.insuranceClaims = claims.map(c => ({
          claimId: c.claimId,
          treatmentType: c.treatmentType,
          claimAmount: c.claimAmount,
          status: c.status,
          claimDate: c.claimDate
        }));
      }
      break;
    }

    case 'operational_summary':
    case 'hospital_trends':
    case 'inventory_summary': {
      if (user.role === 'admin' || user.role === 'hospital') {
        const [totalPatients, totalEmergencies, totalReports] = await Promise.all([
          User.countDocuments({ role: 'patient' }),
          EmergencyCase.countDocuments({ status: { $in: ['ACTIVE', 'TEAM_ASSIGNED'] } }),
          MedicalReport.countDocuments({})
        ]);

        context.hospitalOperations = {
          activePatientsCount: totalPatients,
          activeEmergenciesCount: totalEmergencies,
          totalReportsProcessed: totalReports
        };
      }
      break;
    }

    case 'general_health':
    default: {
      if (patientId) {
        const patient = await User.findById(patientId)
          .select('age gender bloodGroup allergies')
          .lean();

        if (patient) {
          context.generalInfo = {
            age: patient.age,
            gender: patient.gender,
            bloodGroup: patient.bloodGroup,
            allergies: patient.allergies || []
          };
        }
      }
      break;
    }
  }

  return sanitizeContext(context);
}

module.exports = {
  sanitizeContext,
  buildAuthorizedContext
};
