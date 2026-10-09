const fs = require('fs');
const pdfParse = require('pdf-parse');
const { parse } = require('csv-parse/sync');

// Determine document class from extracted text
function classifyDocument(text, originalType = '') {
  if (!text) return 'Unknown';
  const lower = text.toLowerCase();
  
  if (lower.includes('complete blood count') || lower.includes('cbc') || lower.includes('hemoglobin') && lower.includes('platelets')) {
    return 'CBC';
  } else if (lower.includes('blood test') || lower.includes('serum')) {
    return 'Blood Test';
  } else if (lower.includes('rx') || lower.includes('prescription') || lower.includes('dispense')) {
    return 'Prescription';
  } else if (lower.includes('discharge') && lower.includes('summary')) {
    return 'Discharge Summary';
  } else if (lower.includes('diagnosis') || lower.includes('diagnostic')) {
    return 'Diagnostic Report';
  } else if (lower.includes('insurance') || lower.includes('claim')) {
    return 'Insurance Document';
  }
  
  // Fallback to original type if provided and matches one of our enums
  const types = ['CBC', 'Blood Test', 'Prescription', 'Discharge Summary', 'Diagnostic Report', 'Insurance Document'];
  const matchedType = types.find(t => t.toLowerCase() === originalType.toLowerCase());
  return matchedType || 'Unknown';
}

// Simple rule-based extractor
function extractMedicalData(text) {
  const structured = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const l = line.toLowerCase();
    // E.g., "Hemoglobin: 13.5 g/dL (Normal: 12-16)"
    const hbMatch = line.match(/(Hemoglobin|Hb)[\s:]*([\d\.]+)[\s]*(g\/dL)/i);
    if (hbMatch) {
      structured.push({
        parameter: 'Hemoglobin',
        value: hbMatch[2],
        unit: hbMatch[3],
        referenceRange: '12-16', // simplified for demo
        status: parseFloat(hbMatch[2]) < 12 ? 'Low' : (parseFloat(hbMatch[2]) > 16 ? 'High' : 'Normal')
      });
    }
  }
  return structured.length > 0 ? structured : null;
}

// Basic PII/Secret sanitization
function sanitizeExtractedText(text) {
  if (!text) return '';
  return text
    // Replace typical passwords / tokens
    .replace(/password[\s:=]+[\w!@#$%^&*]+/gi, 'password: [REDACTED]')
    .replace(/bearer[\s]+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/api_?key[\s:=]+[\w]+/gi, 'apikey [REDACTED]')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[DB URI REDACTED]')
    // Path sanitization
    .replace(/(?:\/[a-zA-Z0-9_\-\.]+)+\/[a-zA-Z0-9_\-\.]+/g, '[PATH REDACTED]');
}

async function extractTextFromFile(filePath, mimeType) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found for extraction');
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    let text = '';

    if (mimeType === 'application/pdf') {
      const data = await pdfParse(fileBuffer);
      text = data.text;
    } else if (mimeType === 'text/csv') {
      const records = parse(fileBuffer, { columns: true, skip_empty_lines: true });
      text = records.map(r => JSON.stringify(r)).join('\n');
    } else if (mimeType === 'text/plain') {
      text = fileBuffer.toString('utf-8');
    } else {
      text = '[Unsupported format for text extraction]';
    }

    return sanitizeExtractedText(text);
  } catch (err) {
    console.error('Extraction error:', err.message);
    return '[Extraction Failed]';
  }
}

async function processDocument(filePath, mimeType, originalType) {
  const text = await extractTextFromFile(filePath, mimeType);
  
  if (text.includes('[Unsupported format') || text.includes('[Extraction Failed]')) {
    return {
      text: null,
      classification: 'Unknown',
      structuredData: null
    };
  }

  const classification = classifyDocument(text, originalType);
  const structuredData = extractMedicalData(text);

  return {
    text,
    classification,
    structuredData
  };
}

module.exports = {
  extractTextFromFile,
  classifyDocument,
  extractMedicalData,
  sanitizeExtractedText,
  processDocument
};
