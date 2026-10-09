/**
 * reportAiEngine.js — Non-Diagnostic AI Clinical Summary Generator for Medical Reports
 * Generates automated clinical summaries and highlights out-of-range parameters.
 * Strict medical disclaimer included on all outputs.
 */

const AI_DISCLAIMER = 'AI-generated information for clinical review. Doctors remain responsible for medical decisions.';

/**
 * Generates an AI summary object from structured test results.
 * @param {Array} structuredResults - Array of evaluated parameters
 * @param {string} reportType - Name of the test/report
 * @param {string} category - Medical Category
 * @returns {{ summary: string, abnormalFindings: Array<string>, trendNotes: string, disclaimer: string, generatedAt: Date }}
 */
function generateReportAiAnalysis(structuredResults = [], reportType = 'Medical Test', category = 'Laboratory') {
  const abnormalFindings = [];
  const normalFindings = [];
  const criticalFindings = [];

  structuredResults.forEach(item => {
    const p = item.parameter;
    const v = item.value;
    const u = item.unit || '';
    const r = item.referenceRange ? ` (Reference: ${item.referenceRange} ${u})` : '';

    if (item.status === 'Critical') {
      criticalFindings.push(`CRITICAL: ${p} measured at ${v} ${u}${r}.`);
      abnormalFindings.push(`[Critical Threshold Exceeded] ${p}: ${v} ${u}${r}`);
    } else if (item.status === 'Low') {
      abnormalFindings.push(`[Below Range] ${p}: ${v} ${u}${r}`);
    } else if (item.status === 'High') {
      abnormalFindings.push(`[Above Range] ${p}: ${v} ${u}${r}`);
    } else {
      normalFindings.push(`${p}: ${v} ${u}`);
    }
  });

  let summary = '';
  if (structuredResults.length === 0) {
    summary = `Report uploaded under category "${category}" (${reportType}). Awaiting detailed clinician review and structured parameter evaluation.`;
  } else if (criticalFindings.length > 0) {
    summary = `⚠️ Urgent Attention Required: ${criticalFindings.length} parameter(s) flagged at critical physiological limits in ${reportType}. Immediate attending physician evaluation advised.`;
  } else if (abnormalFindings.length > 0) {
    summary = `${abnormalFindings.length} parameter(s) deviate from standard laboratory reference intervals in ${reportType}. Clinical correlation recommended.`;
  } else {
    summary = `All evaluated parameters (${normalFindings.length} metrics) in ${reportType} fall within expected normal baseline ranges.`;
  }

  let trendNotes = '';
  if (criticalFindings.length > 0) {
    trendNotes = 'High-priority clinical review recommended. Ensure follow-up vitals and repeat laboratory confirmation if indicated.';
  } else if (abnormalFindings.length > 0) {
    trendNotes = 'Routine clinical follow-up suggested based on observed out-of-range parameters.';
  } else {
    trendNotes = 'Parameters stable and consistent with normal physiological baselines.';
  }

  return {
    summary,
    abnormalFindings,
    trendNotes,
    disclaimer: AI_DISCLAIMER,
    generatedAt: new Date()
  };
}

module.exports = {
  AI_DISCLAIMER,
  generateReportAiAnalysis
};
