/**
 * CareLink Scheduled Jobs
 * Using node-cron for background tasks
 */
const cron = require('node-cron');
const { Medication } = require('../models/Medication');

// ─── Reset medication takenToday at midnight every day ─────────────────────
// Without this, once a patient marks a pill as taken, it stays taken forever.
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await Medication.updateMany({ takenToday: true }, { takenToday: false });
    console.log(`[CRON 00:00] Medication reset: ${result.modifiedCount} records updated`);
  } catch (err) {
    console.error('[CRON ERROR] Medication reset failed:', err.message);
  }
}, {
  timezone: 'Asia/Kolkata' // Set to your timezone (IST)
});

console.log('[SCHEDULER] Cron jobs registered ✅');
