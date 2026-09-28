# MEDICAL DOCUMENT INTELLIGENCE (Step 15)

## Overview
CareLink's Medical Document Intelligence layer securely processes, categorizes, and extracts structured data from uploaded medical documents (PDF, CSV, Text) and seamlessly integrates them into the AI (RAG) system for intelligent retrieval and summarization. 

## Supported Formats
- `application/pdf`: Uses `pdf-parse` for text extraction.
- `text/csv`: Processed using `csv-parse` to convert tabular data to text records.
- `text/plain`: Direct string decoding.
- Scanned/Image-only PDFs are explicitly identified and unsupported to avoid the complexity and inconsistencies of full OCR integration.

## Extraction Pipeline
1. **Upload**: User securely uploads a medical document.
2. **Validation**: Document MIME type, size, and extensions are strictly validated.
3. **Storage**: File is stored in a secure backend storage service with obfuscated filenames.
4. **Text Extraction**: The system extracts raw text from the file buffer.
5. **Sanitization**: Any detected PII, API tokens, passwords, database URIs, or filesystem paths are explicitly redacted from the extracted text before persistence.
6. **Classification**: Deterministic rules classify the document (e.g. `CBC`, `Prescription`, `Discharge Summary`).
7. **Structured Extraction**: Heuristics are used to detect exact medical values (e.g., Hemoglobin, Platelets) and normalize them into a uniform structured JSON representation.
8. **RAG Integration**: Both structured findings and sanitized raw text are preserved alongside the original record for subsequent authorized RAG chunking and context delivery to the LLM.

## Security
- **Strict Authorization**: Document processing leverages the same Step 2 IDOR and RBAC protections. Documents are bound to strict patient scopes.
- **Sanitization First**: The text extraction process explicitly sanitizes credentials and PII.
- **Data Minimization**: The LLM is never given direct access to the uploaded file buffer. Instead, it only receives explicit RAG chunks (up to a bounded character limit) containing sanitized, verified text strings.
- **Prompt Injection Defense**: Medical reports are tagged defensively when routed to the LLM.

## Limitations
- **OCR**: Image-based or scanned PDFs that lack embedded text layers will result in empty extractions. An explicitly logged "Unsupported format" is captured.
- **Heuristics**: Structured data extraction is primarily rule-based. Unpredictable or highly idiosyncratic layouts may not be fully parsed into structured parameters, though the raw text will still be indexed for conversational RAG queries.

## Testing
The `test_step15_document_intelligence.js` suite extensively covers classification, rule-based extraction, secret sanitization, missing values, and file processing boundaries. Regression against all previous 14 security and data steps remains active.
