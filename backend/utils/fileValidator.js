/**
 * fileValidator.js — Modular File Format & Security Validation Engine
 * Validates extension, MIME type, file size, dangerous file patterns, and generates safe filenames.
 */

const path = require('path');

// Category & Report Type Configuration with Allowed Extensions & MIME Types
const REPORT_TYPE_CONFIG = {
  // ─── 🩸 Laboratory ──────────────────────────────────────────────────────────
  'CBC Blood Test': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv', '.json'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'application/json', 'text/plain'],
    description: 'Complete Blood Count (CBC) Profile'
  },
  'Blood Sugar Test': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv', '.json'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'application/json', 'text/plain'],
    description: 'Fasting & Postprandial Glucose, HbA1c'
  },
  'Lipid Profile': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'Cholesterol, Triglycerides, HDL, LDL, VLDL'
  },
  'Liver Function Test (LFT)': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'Bilirubin, SGOT/AST, SGPT/ALT, Alkaline Phosphatase'
  },
  'Kidney Function Test (KFT)': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'Serum Creatinine, Blood Urea Nitrogen (BUN), eGFR, Uric Acid'
  },
  'Thyroid Test': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'TSH, Total/Free T3, Total/Free T4'
  },
  'Urine Test': {
    category: 'Laboratory',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'Routine Urinalysis, Specific Gravity, Protein, Glucose'
  },

  // ─── 🩻 Radiology ───────────────────────────────────────────────────────────
  'X-Ray': {
    category: 'Radiology',
    allowedExtensions: ['.dcm', '.png', '.jpg', '.jpeg', '.pdf'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'image/png', 'image/jpeg', 'application/pdf'],
    description: 'Radiographic Skeletal & Chest Imaging'
  },
  'CT Scan': {
    category: 'Radiology',
    allowedExtensions: ['.dcm', '.nii', '.nii.gz'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'application/gzip', 'application/x-gzip'],
    description: 'Computed Tomography 3D Volumetric Imaging'
  },
  'MRI Scan': {
    category: 'Radiology',
    allowedExtensions: ['.dcm', '.nii', '.nii.gz'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'application/gzip', 'application/x-gzip'],
    description: 'Magnetic Resonance Imaging Structural & Functional'
  },
  'Ultrasound': {
    category: 'Radiology',
    allowedExtensions: ['.dcm', '.png', '.jpg', '.jpeg'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'image/png', 'image/jpeg'],
    description: 'Diagnostic Sonography Imaging'
  },
  'Mammogram': {
    category: 'Radiology',
    allowedExtensions: ['.dcm', '.png'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'image/png'],
    description: 'Digital Mammographic Screening & Diagnostics'
  },
  'PET Scan': {
    category: 'Radiology',
    allowedExtensions: ['.dcm', '.nii', '.nii.gz'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'application/gzip', 'application/x-gzip'],
    description: 'Positron Emission Tomography Nuclear Imaging'
  },

  // ─── ❤️ Cardiology ──────────────────────────────────────────────────────────
  'ECG / EKG': {
    category: 'Cardiology',
    allowedExtensions: ['.pdf', '.csv', '.xml'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'application/xml', 'text/xml', 'text/plain'],
    description: '12-Lead Electrocardiogram Telemetry'
  },
  'Echocardiogram': {
    category: 'Cardiology',
    allowedExtensions: ['.dcm', '.pdf'],
    allowedMimeTypes: ['application/dicom', 'application/octet-stream', 'application/pdf'],
    description: 'Transthoracic & Doppler Cardiac Ultrasound'
  },
  'Holter Monitor': {
    category: 'Cardiology',
    allowedExtensions: ['.csv', '.edf', '.pdf'],
    allowedMimeTypes: ['text/csv', 'application/octet-stream', 'application/edf', 'application/pdf', 'text/plain'],
    description: '24/48-Hour Continuous Ambulatory ECG'
  },

  // ─── 🧠 Neurology ───────────────────────────────────────────────────────────
  'EEG': {
    category: 'Neurology',
    allowedExtensions: ['.edf', '.csv'],
    allowedMimeTypes: ['application/octet-stream', 'application/edf', 'text/csv', 'text/plain'],
    description: 'Electroencephalogram Multi-Channel Brainwave Recording'
  },
  'EMG': {
    category: 'Neurology',
    allowedExtensions: ['.edf', '.csv', '.pdf'],
    allowedMimeTypes: ['application/octet-stream', 'application/edf', 'text/csv', 'application/pdf', 'text/plain'],
    description: 'Electromyography Neuromuscular Signal Analysis'
  },

  // ─── 🔬 Pathology ───────────────────────────────────────────────────────────
  'Biopsy Report': {
    category: 'Pathology',
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    description: 'Histological Tissue Biopsy Assessment'
  },
  'Histopathology': {
    category: 'Pathology',
    allowedExtensions: ['.pdf', '.dcm', '.tiff', '.tif', '.jpg', '.jpeg'],
    allowedMimeTypes: ['application/pdf', 'application/dicom', 'image/tiff', 'image/jpeg', 'application/octet-stream'],
    description: 'Microscopic Tissue Staining & Cellular Pathology'
  },
  'Cytology Report': {
    category: 'Pathology',
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    description: 'Exfoliative & Aspiration Cytopathology'
  },

  // ─── 🫁 Diagnostic ──────────────────────────────────────────────────────────
  'PFT': {
    category: 'Diagnostic',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'Pulmonary Function Test Lung Volumes & Diffusion'
  },
  'Spirometry': {
    category: 'Diagnostic',
    allowedExtensions: ['.pdf', '.csv'],
    allowedMimeTypes: ['application/pdf', 'text/csv', 'text/plain'],
    description: 'Forced Expiratory Volume & Vital Capacity Curve'
  },

  // ─── 🩺 Clinical ────────────────────────────────────────────────────────────
  'Doctor Prescription': {
    category: 'Clinical',
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    description: 'Signed Clinical Prescription & Pharmacotherapy'
  },
  'Discharge Summary': {
    category: 'Clinical',
    allowedExtensions: ['.pdf', '.docx'],
    allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
    description: 'Hospital Admission & Inpatient Discharge Summary'
  }
};

// Dangerous executable & script extensions explicitly forbidden
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.vbs', '.js', '.mjs',
  '.py', '.php', '.pl', '.bin', '.msi', '.com', '.scr', '.dll',
  '.jar', '.war', '.apk', '.app', '.dmg', '.iso', '.ps1', '.reg'
];

// Maximum allowed upload size (default 50MB)
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || (50 * 1024 * 1024), 10);

/**
 * Validates an uploaded file against report category, report type, and security policies.
 * @param {Object} file - Multer file object ({ originalname, mimetype, size, buffer/path })
 * @param {string} reportType - Name of the report type
 * @returns {{ isValid: boolean, error?: string, format?: string }}
 */
function validateMedicalReportFile(file, reportType) {
  if (!file) {
    return { isValid: false, error: 'No file was uploaded.' };
  }

  // 1. Check for empty file
  if (!file.size || file.size === 0) {
    return { isValid: false, error: 'Uploaded file is empty (0 bytes).' };
  }

  // 2. Check maximum file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const maxMb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    const actualMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      error: `File size exceeds the configured maximum limit of ${maxMb}MB (Received: ${actualMb}MB).`
    };
  }

  const originalName = file.originalname || '';
  const ext = path.extname(originalName).toLowerCase();

  // 3. Reject known dangerous scripts and executables
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      error: `Security Violation: Executable and script files (${ext}) are strictly prohibited.`
    };
  }

  // 4. Verify report type configuration
  const config = REPORT_TYPE_CONFIG[reportType];
  if (!config) {
    // Fallback if custom or general report type
    const generalAllowed = ['.pdf', '.jpg', '.jpeg', '.png', '.csv', '.json', '.dcm', '.docx'];
    if (!generalAllowed.includes(ext)) {
      return {
        isValid: false,
        error: `Unsupported file extension (${ext}) for report type "${reportType}".`
      };
    }
    return {
      isValid: true,
      format: ext.replace('.', '').toUpperCase()
    };
  }

  // 5. Verify allowed extension for this specific report type
  const isExtensionAllowed = config.allowedExtensions.some(allowed => {
    if (allowed.startsWith('.')) return ext === allowed.toLowerCase();
    return ext === ('.' + allowed).toLowerCase();
  });

  if (!isExtensionAllowed) {
    const allowedDisplay = config.allowedExtensions.map(e => e.toUpperCase().replace('.', '')).join(', ');
    return {
      isValid: false,
      error: `This report type (${reportType}) does not support "${ext.toUpperCase()}" files. Allowed formats: ${allowedDisplay}.`
    };
  }

  // 6. Verify MIME type (allow standard octet-stream for binary DICOM/EDF/NIfTI where browser MIME may be generic)
  const mime = (file.mimetype || '').toLowerCase();
  const isMimeAllowed = config.allowedMimeTypes.includes(mime) ||
    mime === 'application/octet-stream' ||
    mime === '' ||
    ext === '.dcm' ||
    ext === '.nii' ||
    ext === '.edf';

  if (!isMimeAllowed) {
    return {
      isValid: false,
      error: `Invalid file MIME type (${mime}) for report format ${ext}.`
    };
  }

  // Format label (e.g. PDF, DICOM, CSV, PNG)
  let formatLabel = ext.replace('.', '').toUpperCase();
  if (formatLabel === 'DCM') formatLabel = 'DICOM';
  if (formatLabel === 'NII') formatLabel = 'NIFTI';

  return {
    isValid: true,
    format: formatLabel,
    category: config.category
  };
}

/**
 * Generates safe unique filename: <category>_<timestamp>_<random>.<ext>
 */
function generateSafeFileName(originalName, category = 'report') {
  const ext = path.extname(originalName).toLowerCase();
  const safeBase = originalName
    .replace(ext, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e8);
  const cleanCat = category.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanCat}_${timestamp}_${randomSuffix}${ext}`;
}

/**
 * Returns complete category and report type directory for frontend dropdowns & validation rules
 */
function getReportCategoriesConfig() {
  const categoriesMap = {};

  Object.entries(REPORT_TYPE_CONFIG).forEach(([typeName, config]) => {
    const { category, allowedExtensions, description } = config;
    if (!categoriesMap[category]) {
      categoriesMap[category] = [];
    }
    categoriesMap[category].push({
      reportType: typeName,
      allowedExtensions,
      allowedFormats: allowedExtensions.map(e => e.toUpperCase().replace('.', '')),
      description
    });
  });

  return categoriesMap;
}

module.exports = {
  REPORT_TYPE_CONFIG,
  DANGEROUS_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  validateMedicalReportFile,
  generateSafeFileName,
  getReportCategoriesConfig
};
