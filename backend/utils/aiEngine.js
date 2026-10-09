/**
 * MediLink AI Risk Scoring Engine
 * Continuous health risk assessment & pattern detection
 * Input: heartRate, spo2, temperature, stepCount, systolicBP, diastolicBP, fallDetected
 * Output: score (0-100), status, reasons[], recommendation
 */

const analyzeVitals = (heartRate, spo2, temperature, stepCount = 0, systolicBP = null, diastolicBP = null, fallDetected = false) => {
  let score = 0;
  const reasons = [];

  // --- Fall Detection Analysis ---
  if (fallDetected) {
    score += 65;
    reasons.push('Hard Fall Impact detected by wearable acceleration sensors!');
  }

  // --- Heart Rate Analysis ---
  if (heartRate > 140) {
    score += 55;
    reasons.push(`Severe tachycardia: Heart rate ${heartRate} bpm (>140)`);
  } else if (heartRate > 120) {
    score += 45;
    reasons.push(`High heart rate: ${heartRate} bpm (>120)`);
  } else if (heartRate > 100) {
    score += 25;
    reasons.push(`Elevated heart rate: ${heartRate} bpm (>100)`);
  } else if (heartRate < 50) {
    score += 35;
    reasons.push(`Bradycardia detected: Heart rate ${heartRate} bpm (<50)`);
  } else if (heartRate < 60) {
    score += 10;
    reasons.push(`Slightly low heart rate: ${heartRate} bpm`);
  }

  // --- SpO2 Oxygen Saturation Analysis ---
  if (spo2 < 88) {
    score += 55;
    reasons.push(`Critical hypoxia: SpO2 ${spo2}% (<88%) — Emergency oxygen level`);
  } else if (spo2 < 92) {
    score += 35;
    reasons.push(`Severe low oxygen: SpO2 ${spo2}% (<92%)`);
  } else if (spo2 < 95) {
    score += 20;
    reasons.push(`Low oxygen saturation: SpO2 ${spo2}% (<95%)`);
  } else if (spo2 < 97) {
    score += 10;
    reasons.push(`Slightly below normal SpO2: ${spo2}%`);
  }

  // --- Temperature Analysis ---
  if (temperature > 103) {
    score += 35;
    reasons.push(`High fever / Hyperthermia: Temperature ${temperature}°F (>103°F)`);
  } else if (temperature > 100) {
    score += 15;
    reasons.push(`Mild fever: Temperature ${temperature}°F (>100°F)`);
  } else if (temperature < 96) {
    score += 25;
    reasons.push(`Hypothermia risk: Temperature ${temperature}°F (<96°F)`);
  }

  // --- Blood Pressure Analysis ---
  if (systolicBP && diastolicBP) {
    if (systolicBP >= 180 || diastolicBP >= 120) {
      score += 45;
      reasons.push(`Hypertensive Crisis: BP ${systolicBP}/${diastolicBP} mmHg`);
    } else if (systolicBP >= 140 || diastolicBP >= 90) {
      score += 20;
      reasons.push(`Hypertension Stage 2: BP ${systolicBP}/${diastolicBP} mmHg`);
    } else if (systolicBP < 90 || diastolicBP < 60) {
      score += 20;
      reasons.push(`Hypotension detected: BP ${systolicBP}/${diastolicBP} mmHg`);
    }
  }

  // --- Activity-Aware Correction (Step Count) ---
  if (stepCount > 7000 && heartRate > 100 && heartRate <= 120 && !fallDetected) {
    score = Math.max(0, score - 15);
    reasons.push(`Note: Elevated HR corrected for physical activity (${stepCount} steps)`);
  }

  // Cap score between 0 and 100
  score = Math.min(100, Math.max(0, score));

  // --- Classification ---
  let status, recommendation;
  if (score >= 70 || fallDetected) {
    status = 'Critical';
    recommendation = '🚨 CRITICAL RISK PATTERN DETECTED: Emergency escalation active. Caregiver, Doctor, and Emergency Hospital have been notified. Stay calm.';
  } else if (score >= 35) {
    status = 'Risk';
    recommendation = '⚠️ ELEVATED RISK: Vitals require clinical review. Doctor notified. Rest and recheck vitals in 15 minutes.';
  } else {
    status = 'Normal';
    recommendation = '🟢 ALL NORMAL: Vitals within normal physiological bounds. Continuous monitoring active.';
  }

  if (reasons.length === 0) {
    reasons.push('All vitals within normal range');
  }

  return { score, status, reasons, recommendation };
};

/**
 * Detect trending — returns 'Improving', 'Worsening', 'Stable'
 */
const analyzeTrend = (scoreHistory) => {
  if (!scoreHistory || scoreHistory.length < 3) return 'Insufficient data';
  const recent = scoreHistory.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const diff = last - first;
  if (diff >= 15) return 'Worsening';
  if (diff <= -15) return 'Improving';
  return 'Stable';
};

module.exports = { analyzeVitals, analyzeTrend };
