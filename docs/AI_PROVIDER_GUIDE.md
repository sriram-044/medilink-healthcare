# CareLink Healthcare Platform — AI / LLM Provider Architecture Guide

## 1. Overview & Architecture

CareLink incorporates a modular, secure, role-aware AI architecture designed to support clinical workflows across all healthcare portals (Patient, Doctor, Lab, Pharmacy, Insurance, Emergency, and Admin).

The LLM integration is decoupled from specific vendors through an abstract provider pattern:

```text
Frontend (AI Chat Widget)
          ↓
POST /api/ai/chat
          ↓
Authentication Gate (JWT / Session Cookie via req.user)
          ↓
Role-Based Access Control (RBAC via req.user.role)
          ↓
AI Authorization Layer (Capability Matrix & Resource Ownership)
          ↓
Data Minimization & Context Builder (aiContext.js - PII/credential stripping)
          ↓
Prompt Construction (aiPrompts.js - System instruction vs. untrusted data separation)
          ↓
Provider Abstraction Layer (getAiProvider() factory)
    ┌─────┴─────────────────────────────────────┐
    ▼                                           ▼
MockAiProvider (Offline dev/testing)     RealHttpAiProvider (External LLM)
    └─────┬─────────────────────────────────────┘
          ↓
Safety Validation & Sanitization (aiSafety.js - Output scrubbing & clinical disclaimers)
          ↓
Standardized CareLink Response Envelope
```

---

## 2. Running with `MockAiProvider` (Default Development / Test Mode)

The `MockAiProvider` provides deterministic, zero-dependency clinical simulation for offline development, local demos, and automated regression testing. It requires no API keys and executes instantaneously.

To use `MockAiProvider`:
```env
AI_ENABLED=true
AI_PROVIDER=mock
AI_MODEL=carelink-clinical-assistant-v1
```

Features of `MockAiProvider`:
- Context-aware responses tailored to user roles (Patient vitals/reports, Doctor clinical summaries, Lab workloads, etc.).
- Embedded prompt injection defense simulation.
- Simulation hooks (`simulateError: true`, `simulateTimeout: true`) for testing upstream degradation.

---

## 3. Configuring the Real LLM Provider (`RealHttpAiProvider`)

`RealHttpAiProvider` provides a production-ready HTTP client compatible with OpenAI-compatible completion endpoints (including OpenAI, Gemini via OpenAI gateway, Ollama, vLLM, and private enterprise LLM gateways).

### Configuration Options
```env
AI_ENABLED=true
AI_PROVIDER=real
AI_MODEL=gpt-4o-mini
AI_API_KEY=your_actual_api_key
AI_BASE_URL=https://api.openai.com/v1
AI_TIMEOUT_MS=30000
AI_MAX_TOKENS=1000
AI_TEMPERATURE=0.2
AI_RATE_LIMIT_MAX=30
```

### Supported Provider Aliases
The `AI_PROVIDER` variable supports:
- `mock` (Deterministic offline mock)
- `real` (Production HTTP provider)
- `http` (Alias for `real`)
- `openai` (Alias for `real`)
- `gemini` (Alias for `real` when paired with an OpenAI-compatible gateway)

---

## 4. Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `AI_ENABLED` | No | `true` | Global kill-switch for CareLink AI features (`true` or `false`). |
| `AI_PROVIDER` | No | `mock` | Selected provider (`mock`, `real`, `http`, `openai`, `gemini`). |
| `AI_MODEL` | For real | `carelink-clinical-assistant-v1` | Identifier of upstream model (e.g. `gpt-4o-mini`). |
| `AI_API_KEY` | For real | *None* | External provider API authorization key. |
| `AI_BASE_URL` | No | `https://api.openai.com/v1` | Base URL for the OpenAI-compatible chat completions API. |
| `AI_TIMEOUT_MS` | No | `30000` | AbortController request timeout in milliseconds. |
| `AI_MAX_TOKENS` | No | `1000` | Max tokens requested for completions. |
| `AI_TEMPERATURE`| No | `0.2` | Sampling temperature (lower values ensure factual stability). |
| `AI_RATE_LIMIT_MAX` | No | `30` | Maximum AI chat requests allowed per user per minute. |
| `RUN_AI_INTEGRATION_TEST` | No | `false` | Controls execution of optional live external API tests. |

---

## 5. Security & Secret Protection

CareLink enforces strict confidentiality regarding external LLM credentials:

1. **Backend-Only Storage**: `AI_API_KEY` is loaded exclusively in backend memory and never sent to the browser or frontend scripts.
2. **Zero Response Exposure**: API keys, internal credentials, or Authorization headers are stripped and never returned in `/api/ai/chat` or `/api/ai/status`.
3. **Redacted Logging**: `aiLogger.js` logs only operational metadata (`requestId`, `userRole`, `latencyMs`, `success`, `errorCode`). Prompts, context bodies, user questions, and credentials are never written to disk or logs.
4. **No Silent Fallback**: When `AI_PROVIDER=real` is configured, if the API key is missing or invalid, CareLink returns an explicit `AI_CONFIG_ERROR` (HTTP 503) rather than silently falling back to mock data.
5. **Untrusted Data Isolation**: Patient records and lab results are passed to the model within clearly demarcated untrusted data blocks to prevent prompt injection attacks from hijacking system directives.

---

## 6. HTTP Resilience & Error Handling

`RealHttpAiProvider` implements robust, bounded-retry HTTP client semantics:

| HTTP Status / Condition | Provider Action | Error Code | Client Error Message |
| :--- | :--- | :--- | :--- |
| **401 / 403** (Unauthorized) | **Zero retry** — Fails immediately | `AI_AUTH_FAILED` | Safe CareLink configuration error |
| **429** (Rate Limited) | **Zero retry** — Fails immediately | `AI_RATE_LIMITED` | "Upstream AI service is currently rate-limited." |
| **400** (Bad Request) | **Zero retry** — Fails immediately | `AI_BAD_REQUEST` | "Upstream AI service rejected the prompt payload." |
| **404** (Not Found) | **Zero retry** — Fails immediately | `AI_MODEL_NOT_FOUND` | "Configured AI model or endpoint not found." |
| **500, 502, 503, 504** | **Bounded retry** (up to 2 retries) | `AI_UNAVAILABLE` | "Upstream AI service is temporarily unavailable." |
| **Timeout (`AbortError`)** | **Zero retry** | `AI_TIMEOUT` | "AI service request timed out." |
| **Malformed JSON** | **Zero retry** | `AI_MALFORMED_RESPONSE`| "Received malformed response from AI provider." |
| **Empty Completion** | **Zero retry** | `AI_MALFORMED_RESPONSE`| "Received empty or malformed completion from AI provider." |

All error responses strictly adhere to CareLink's Step 9 standard envelope:
```json
{
  "success": false,
  "error": {
    "code": "AI_UNAVAILABLE",
    "message": "AI service is temporarily unavailable.",
    "requestId": "req-12345"
  }
}
```

---

## 7. AI Status Endpoint

CareLink exposes a safe status endpoint:
```http
GET /api/ai/status
```
Requires authentication. Returns non-secret operational state:
```json
{
  "success": true,
  "ai": {
    "enabled": true,
    "provider": "mock",
    "model": "carelink-clinical-assistant-v1"
  },
  "requestId": "req-xyz"
}
```
API keys, key lengths, and authorization tokens are strictly omitted.

---

## 8. Running Live Integration Tests (Step 12 & Step 13)

Automated regression runs by default against `MockAiProvider` and simulated HTTP endpoints so that external API keys are not required for continuous integration.

### Live Verification Commands
To execute live verification against an actual external LLM:
```bash
# Set credentials in environment or temporary shell:
export AI_ENABLED=true
export AI_PROVIDER=real
export AI_MODEL="gpt-4o-mini"
export AI_API_KEY="your_actual_key"
export AI_BASE_URL="https://api.openai.com/v1"
export RUN_AI_INTEGRATION_TEST=true

# Execute Step 12 & Step 13 live suites:
node test_step12_real_llm.js
node test_step13_live_llm.js
```

### Synthetic Data Policy
- **STRICT MANDATE**: All tests executed against live or external LLMs must utilize **synthetic data only**.
- Never upload, prompt, or transmit real patient records, actual medical files, or production identity documents to external LLM providers during development or testing.

### Fallback Behavior When Credentials Absent
If `RUN_AI_INTEGRATION_TEST` is unset or `AI_API_KEY` is omitted, the suites cleanly output:
```text
ℹ️ [LIVE LLM TEST: SKIPPED] (RUN_AI_INTEGRATION_TEST not true or AI_API_KEY not configured)
```
and execute complete end-to-end pipeline verification using deterministic mock providers or controlled local HTTP servers, passing without failing the regression gate.

---

## 9. Cost & Abuse Protection

Because real provider integrations consume upstream tokens and API quota, CareLink enforces multi-layer cost and abuse guardrails:
1. **Per-User Rate Limiting**: Dedicated rate limiter (`AI_RATE_LIMIT_MAX`, default 30 requests/minute) throttles rapid bursts with HTTP `429 TOO_MANY_REQUESTS`.
2. **Input Length Clamping**: Client prompts are bounded strictly between 2 and 1,000 characters.
3. **Immutable Parameters**: Frontend clients cannot override `max_tokens`, `temperature`, `model`, or retry count.
4. **Bounded Retries**: Maximum of 2 linear retries strictly on transient 5xx or socket failures; zero retries on 4xx client errors.
5. **No Recursive LLM Calls**: Each user request results in at most one completion attempt sequence, preventing infinite execution loops.

---

## 9. Medical Safety & Clinical Boundaries

CareLink AI is an assistive communication and operational tool, **NOT** an autonomous diagnostic device.

### Hard Constraints
1. **No Autonomous Diagnoses**: The AI cannot formulate, issue, or finalize patient diagnoses.
2. **No Prescriptions**: The AI cannot prescribe medications, adjust dosages, or modify treatment plans.
3. **No Clinical Orders**: The AI cannot order laboratory panels, imaging, or surgery.
4. **No Automated Approvals**: The AI cannot approve or deny insurance claims.
5. **No Direct Database Modifications**: The LLM has zero direct access to MongoDB; all mutations occur via validated, human-driven REST APIs.

### Mandatory Clinical Disclaimer
All generated clinical outputs append the mandatory CareLink clinical disclaimer:
> *"[CareLink AI Disclaimer: This response is AI-assisted and provided for educational and operational information only. It does not constitute formal medical diagnosis, prescription, or clinical decision-making. Always consult a qualified healthcare professional for medical concerns.]"*

---

## 10. Startup Validation (Step 13)

When the CareLink server starts with `AI_PROVIDER=real`, it performs strict startup validation before accepting any requests:

- `AI_API_KEY` must be set and non-empty (no placeholder values allowed).
- `AI_MODEL` must be set and non-empty.
- `AI_BASE_URL` (if provided) must be a valid `http://` or `https://` URL.
- `AI_TIMEOUT_MS` (if provided) must be a positive integer.
- `AI_MAX_TOKENS` (if provided) must be a positive integer.
- `AI_TEMPERATURE` (if provided) must be a float between 0.0 and 2.0.

If any validation fails, the server **refuses to start** and prints a descriptive error without revealing the secret value. It never silently falls back to `MockAiProvider`.

---

## 11. No-Silent-Mock-Fallback Guarantee (Step 13)

When `AI_PROVIDER=real` is configured:
- If the external LLM returns a 4xx or 5xx error, CareLink returns a controlled error to the client (e.g., `AI_AUTH_FAILED`, `AI_UNAVAILABLE`).
- `MockAiProvider` is **never** automatically selected as a fallback.
- Mock mode can only be activated explicitly via `AI_PROVIDER=mock`.

This prevents users from unknowingly receiving synthetic/mock responses when a live integration is expected.

---

## 12. Live Integration Test Commands (Step 13)

**Windows (PowerShell) — set environment temporarily:**
```powershell
$env:AI_ENABLED = "true"
$env:AI_PROVIDER = "real"
$env:AI_MODEL = "gpt-4o-mini"
$env:AI_API_KEY = "your_actual_key_here"
$env:AI_BASE_URL = "https://api.openai.com/v1"
$env:RUN_AI_INTEGRATION_TEST = "true"

node test_step12_real_llm.js
node test_step13_live_llm.js
```

**Linux / macOS:**
```bash
export AI_ENABLED=true
export AI_PROVIDER=real
export AI_MODEL="gpt-4o-mini"
export AI_API_KEY="your_actual_key_here"
export AI_BASE_URL="https://api.openai.com/v1"
export RUN_AI_INTEGRATION_TEST=true

node test_step12_real_llm.js
node test_step13_live_llm.js
```

When credentials are absent, the suites cleanly skip the live calls and print:
```text
LIVE LLM TEST: SKIPPED (RUN_AI_INTEGRATION_TEST not true or AI_API_KEY not configured)
```
The suite then validates the complete pipeline using a controlled local HTTP mock server and passes without requiring external credentials.

**Standard CI/CD command (no credentials required):**
```bash
npm test
```

---

## 13. Synthetic Data Policy (Step 13)

> **STRICT MANDATE**: All tests executed against live or external LLMs must utilize **synthetic data only**.

- Never upload, prompt, or transmit real patient records, actual medical files, or production identity documents to external LLM providers during development or testing.
- Use clearly labeled synthetic identifiers: `Synthetic Patient 001`, `Synthetic Doctor 001`, etc.
- The live test suite registers throwaway users via `@carelink.test` email domains not associated with real medical information.

---

## 14. Step 13 Validation Summary

Step 13 verified the following end-to-end pipeline using controlled synthetic data:

```text
Frontend (AI Chat Widget)
   ↓
CareLink API (POST /api/ai/chat)
   ↓
Authentication (cookie-based JWT)
   ↓
RBAC (role capability matrix)
   ↓
AI Authorization (IDOR / resource ownership)
   ↓
Context Minimization (PII / credential stripping)
   ↓
Prompt Protection (system vs. untrusted data separation)
   ↓
RealHttpAiProvider (or MockAiProvider in CI)
   ↓
Safety Layer (secret scrubbing + clinical disclaimer)
   ↓
Frontend (standardized response envelope)
```

**Test results (mock/simulation mode — no external credentials required):**

| Category | Result |
| :--- | :--- |
| Live Connectivity (controlled non-clinical confirmation) | 2/2 PASS |
| Patient Context & IDOR isolation | 2/2 PASS |
| Doctor Context & unassigned patient rejection | 2/2 PASS |
| Multi-Role Scoping (7 portals) | 5/5 PASS |
| Prompt Injection Defense | 1/1 PASS |
| Secret Leak Protection | 2/2 PASS |
| Failure Handling (401, 404, 429, timeout, 500, network) | 6/6 PASS |
| No Silent Mock Fallback | 1/1 PASS |
| Cost & Abuse Protection | 4/4 PASS |
| Mock Mode Determinism | 1/1 PASS |
| **Total** | **26/26 PASS** |

### Remaining Genuine Limitations

- **Not clinically validated**: The system has not undergone formal clinical validation or regulatory approval (e.g., FDA, CE Mark). It must not be used for clinical decision-making in production without appropriate oversight.
- **LLM accuracy not guaranteed**: Responses are probabilistic and may be incorrect, outdated, or hallucinated. The mandatory clinical disclaimer is appended to every response.
- **External LLM dependency**: Live mode depends on an external API that may be rate-limited, unavailable, or changed by the vendor.
- **No audit trail for LLM completions**: Raw LLM responses are not stored in the database — only anonymized operational metadata (latency, role, capability, success/fail) is logged.
- **Context size**: Patient context is minimized to recent records only; comprehensive medical history is not included in LLM prompts.
