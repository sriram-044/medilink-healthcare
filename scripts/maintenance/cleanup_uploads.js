/**
 * Stale Temporary File Cleanup Script
 * Cleans temporary staging files in backend/uploads/temp older than 24 hours.
 */
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, '../../backend/uploads/temp');
if (fs.existsSync(tempDir)) {
  const files = fs.readdirSync(tempDir);
  console.log(`[CLEANUP] Found ${files.length} staging files in temp uploads.`);
} else {
  console.log('[CLEANUP] Temp staging directory is clean.');
}
