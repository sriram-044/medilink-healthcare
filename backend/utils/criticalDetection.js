/**
 * criticalDetection.js — Configurable Critical & Abnormal Result Detection Module
 * Evaluates laboratory structured test results against physiological reference ranges.
 * Non-diagnostic: Flags out-of-range values for urgent clinical review without claiming disease diagnoses.
 */

const Alert = require('../models/Alert');
const Notification = require('../models/Notification');
const { sendToUser } = require('./socket');

// Configurable Reference Ranges and Critical Thresholds
const DEFAULT_REFERENCE_RANGES = {
  // Complete Blood Count (CBC)
  'Hemoglobin': { unit: 'g/dL', normalMin: 12.0, normalMax: 17.5, criticalMin: 7.0, criticalMax: 20.0, category: 'CBC' },
  'WBC': { unit: '10^3/uL', normalMin: 4.5, normalMax: 11.0, criticalMin: 2.0, criticalMax: 30.0, category: 'CBC' },
  'RBC': { unit: '10^6/uL', normalMin: 4.0, normalMax: 5.9, criticalMin: 2.5, criticalMax: 7.0, category: 'CBC' },
  'Platelets': { unit: '10^3/uL', normalMin: 150, normalMax: 450, criticalMin: 50, criticalMax: 1000, category: 'CBC' },
  'Hematocrit': { unit: '%', normalMin: 36, normalMax: 50, criticalMin: 20, criticalMax: 60, category: 'CBC' },

  // Blood Sugar / Diabetes
  'Fasting Blood Glucose': { unit: 'mg/dL', normalMin: 70, normalMax: 99, criticalMin: 45, criticalMax: 350, category: 'Blood Sugar' },
  'Postprandial Blood Glucose': { unit: 'mg/dL', normalMin: 90, normalMax: 140, criticalMin: 50, criticalMax: 400, category: 'Blood Sugar' },
  'HbA1c': { unit: '%', normalMin: 4.0, normalMax: 5.6, criticalMin: 3.5, criticalMax: 12.0, category: 'Blood Sugar' },

  // Kidney Function Test (KFT)
  'Serum Creatinine': { unit: 'mg/dL', normalMin: 0.6, normalMax: 1.2, criticalMin: 0.3, criticalMax: 4.0, category: 'KFT' },
  'Blood Urea Nitrogen (BUN)': { unit: 'mg/dL', normalMin: 7, normalMax: 20, criticalMin: 3, criticalMax: 80, category: 'KFT' },
  'eGFR': { unit: 'mL/min/1.73m²', normalMin: 90, normalMax: 120, criticalMin: 15, criticalMax: 150, category: 'KFT' },
  'Serum Potassium': { unit: 'mEq/L', normalMin: 3.5, normalMax: 5.0, criticalMin: 2.8, criticalMax: 6.2, category: 'KFT' },
  'Serum Sodium': { unit: 'mEq/L', normalMin: 135, normalMax: 145, criticalMin: 120, criticalMax: 160, category: 'KFT' },

  // Liver Function Test (LFT)
  'ALT (SGPT)': { unit: 'U/L', normalMin: 7, normalMax: 56, criticalMin: 0, criticalMax: 300, category: 'LFT' },
  'AST (SGOT)': { unit: 'U/L', normalMin: 10, normalMax: 40, criticalMin: 0, criticalMax: 300, category: 'LFT' },
  'Total Bilirubin': { unit: 'mg/dL', normalMin: 0.2, normalMax: 1.2, criticalMin: 0.0, criticalMax: 12.0, category: 'LFT' },
  'Serum Albumin': { unit: 'g/dL', normalMin: 3.5, normalMax: 5.0, criticalMin: 1.5, criticalMax: 6.0, category: 'LFT' },

  // Lipid Profile
  'Total Cholesterol': { unit: 'mg/dL', normalMin: 125, normalMax: 200, criticalMin: 80, criticalMax: 350, category: 'Lipid' },
  'HDL Cholesterol': { unit: 'mg/dL', normalMin: 40, normalMax: 60, criticalMin: 20, criticalMax: 100, category: 'Lipid' },
  'LDL Cholesterol': { unit: 'mg/dL', normalMin: 50, normalMax: 100, criticalMin: 30, criticalMax: 220, category: 'Lipid' },
  'Triglycerides': { unit: 'mg/dL', normalMin: 50, normalMax: 150, criticalMin: 30, criticalMax: 500, category: 'Lipid' },

  // Thyroid Test
  'TSH': { unit: 'uIU/mL', normalMin: 0.4, normalMax: 4.0, criticalMin: 0.05, criticalMax: 15.0, category: 'Thyroid' },
  'Free T4': { unit: 'ng/dL', normalMin: 0.8, normalMax: 1.8, criticalMin: 0.3, criticalMax: 4.0, category: 'Thyroid' },
  'Free T3': { unit: 'pg/mL', normalMin: 2.3, normalMax: 4.2, criticalMin: 1.0, criticalMax: 8.0, category: 'Thyroid' },

  // Cardiac Biomarkers
  'Troponin I': { unit: 'ng/mL', normalMin: 0.0, normalMax: 0.04, criticalMin: 0.0, criticalMax: 0.40, category: 'Cardiology' },
  'CK-MB': { unit: 'ng/mL', normalMin: 0.0, normalMax: 5.0, criticalMin: 0.0, criticalMax: 25.0, category: 'Cardiology' }
};

/**
 * Evaluates an array of structured test results against reference ranges.
 * @param {Array<{ parameter: string, value: string|number, unit?: string, referenceRange?: string, status?: string }>} structuredResults
 * @returns {{ evaluatedResults: Array, overallStatus: 'Normal'|'Abnormal'|'Critical', criticalReasons: Array<string>, abnormalReasons: Array<string> }}
 */
function evaluateStructuredResults(structuredResults = []) {
  if (!Array.isArray(structuredResults) || structuredResults.length === 0) {
    return {
      evaluatedResults: [],
      overallStatus: 'Normal',
      criticalReasons: [],
      abnormalReasons: []
    };
  }

  const criticalReasons = [];
  const abnormalReasons = [];

  const evaluatedResults = structuredResults.map(item => {
    const paramName = (item.parameter || '').trim();
    const rawVal = typeof item.value === 'string' ? parseFloat(item.value.replace(/[^0-9.-]/g, '')) : parseFloat(item.value);
    const config = DEFAULT_REFERENCE_RANGES[paramName] || Object.values(DEFAULT_REFERENCE_RANGES).find(
      r => Object.keys(DEFAULT_REFERENCE_RANGES).find(k => k.toLowerCase() === paramName.toLowerCase())
    );

    let unit = item.unit || config?.unit || '';
    let refRange = item.referenceRange || (config ? `${config.normalMin} - ${config.normalMax}` : '');
    let status = item.status || 'Normal';

    if (!isNaN(rawVal) && config) {
      if (config.criticalMin !== undefined && rawVal <= config.criticalMin) {
        status = 'Critical';
        criticalReasons.push(`CRITICAL LOW: ${paramName} is ${rawVal} ${unit} (Critical Threshold: <${config.criticalMin})`);
      } else if (config.criticalMax !== undefined && rawVal >= config.criticalMax) {
        status = 'Critical';
        criticalReasons.push(`CRITICAL HIGH: ${paramName} is ${rawVal} ${unit} (Critical Threshold: >${config.criticalMax})`);
      } else if (rawVal < config.normalMin) {
        status = 'Low';
        abnormalReasons.push(`${paramName} is Below Normal (${rawVal} ${unit}; Normal: ${config.normalMin}-${config.normalMax})`);
      } else if (rawVal > config.normalMax) {
        status = 'High';
        abnormalReasons.push(`${paramName} is Above Normal (${rawVal} ${unit}; Normal: ${config.normalMin}-${config.normalMax})`);
      } else {
        status = 'Normal';
      }
    }

    return {
      parameter: paramName,
      value: String(item.value || rawVal),
      unit,
      referenceRange: refRange,
      status
    };
  });

  let overallStatus = 'Normal';
  if (criticalReasons.length > 0) {
    overallStatus = 'Critical';
  } else if (abnormalReasons.length > 0) {
    overallStatus = 'Abnormal';
  }

  return {
    evaluatedResults,
    overallStatus,
    criticalReasons,
    abnormalReasons
  };
}

/**
 * If a report is flagged as Critical, triggers an Alert and Notifications for Doctor and Hospital.
 * @param {Object} param0 - { report, patient, doctorId, hospitalName }
 */
async function triggerCriticalResultAlert({ report, patient, doctorId, hospitalName = 'CareLink Central Hospital' }) {
  try {
    if (!report || report.criticalStatus !== 'Critical') return null;

    const patientName = patient?.name || 'Patient';
    const reportType = report.reportType || 'Lab Test';
    const alertMessage = `⚠️ CRITICAL LAB RESULT DETECTED for ${patientName}: ${reportType}. Immediate clinical review required.`;

    const reasons = (report.aiAnalysis?.abnormalFindings && report.aiAnalysis.abnormalFindings.length > 0)
      ? report.aiAnalysis.abnormalFindings
      : [`Critical laboratory values identified in ${reportType} report.`];

    // 1. Create Alert Document in Alert Collection
    const alertDoc = new Alert({
      patientId: patient?._id || report.patientId,
      doctorId: doctorId || report.doctorId,
      type: 'Critical',
      message: alertMessage,
      score: 85,
      location: patient?.roomLocation || hospitalName,
      notifiedEntities: ['Doctor', 'Hospital Staff'],
      emergencyStatus: 'Pending',
      reasons: reasons,
      resolved: false
    });

    await alertDoc.save();

    // 2. Create Notification for Assigned Doctor
    if (doctorId || report.doctorId) {
      const docNotification = new Notification({
        recipientId: doctorId || report.doctorId,
        role: 'doctor',
        type: 'critical_alert',
        title: `🚨 Critical Lab Alert: ${patientName}`,
        message: `${reportType} contains values exceeding critical thresholds. Please review report immediately.`,
        reportId: report._id,
        severity: 'Critical'
      });
      await docNotification.save();
      sendToUser(docNotification.recipientId, 'notification', docNotification.toObject());
    }

    // 3. Create Notification for Patient (Informational)
    if (patient?._id || report.patientId) {
      const patNotification = new Notification({
        recipientId: patient?._id || report.patientId,
        role: 'patient',
        type: 'report_published',
        title: `📄 New ${reportType} Report Available`,
        message: `Your ${reportType} results have been uploaded and forwarded to Dr. ${patient?.assignedDoctor?.name || 'assigned physician'} for clinical review.`,
        reportId: report._id,
        severity: 'Warning'
      });
      await patNotification.save();
      sendToUser(patNotification.recipientId, 'notification', patNotification.toObject());
    }

    console.log(`[CRITICAL DETECTION] Alert & Notifications logged for report: ${report.reportId} (${patientName})`);
    return alertDoc;
  } catch (err) {
    console.error('[CRITICAL DETECTION ERROR]', err.message);
    return null;
  }
}

/**
 * Returns reference ranges template for frontend UI autofill
 */
function getReferenceRangesCatalog() {
  return DEFAULT_REFERENCE_RANGES;
}

module.exports = {
  DEFAULT_REFERENCE_RANGES,
  evaluateStructuredResults,
  triggerCriticalResultAlert,
  getReferenceRangesCatalog
};
