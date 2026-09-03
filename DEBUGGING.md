# ISRO SIH26171 Privacy Agent: Debugging & Pipeline Post-Mortem

This document details the audit findings, failure points identified, root cause fixes, and the structured instrumentation guide for the 5 pipeline handoff stages of the ISRO Privacy-Preserving Agent.

---

## 1. Executive Summary of Root Causes & Fixes

| Stage | Component | Observed Failure | Root Cause | Fix Applied |
|:---|:---|:---|:---|:---|
| **Stage 1** | `domScanner.ts` & `serviceWorker.ts` | Form inputs & passwords were not clickable/typeable. | `domScanner.ts` strictly whitelisted only buttons/links and omitted password fields from candidate interactive nodes. | Expanded selector set to all actionable elements (`input`, `textarea`, `select`, `button`, `a[href]`, ARIA widgets) while maintaining visual canvas blackouts. |
| **Stage 2** | `serviceWorker.ts` & `manifest.config.ts` | Connection dropped / `TypeError: Failed to fetch`. | Host permissions only permitted `localhost` instead of `127.0.0.1`, and unhandled network errors caused uninformative UI stalls. | Added explicit `http://127.0.0.1:8000/*` host permissions, and structured fetch error handlers with payload hash tracing. |
| **Stage 3** | `main.py` & `schemas.py` | 422 Unprocessable Entity failures on custom attributes. | Missing `url`, `title`, and `maskedCount` fields in schema and lack of descriptive 422 logging. | Added `RequestValidationError` handler returning exact schema error locations; updated `ScreenPayload` with Pydantic validators. |
| **Stage 4** | `vlm_engine.py` | VLM inference crashes on conversational markdown text or malformed JSON. | VLMs often return ` ```json { ... } ``` ` or single-quoted Python dictionaries, which caused `json.loads` to crash. | Created `repair_and_parse_json` featuring markdown fence stripping, regex extraction, trailing comma removal, and `ast.literal_eval` fallback. |
| **Stage 5** | `contentScript.ts` | Target element click failed after page updates (DOM Drift). | Coordinate shifts and dynamic re-renders caused cached coordinates to miss target elements. | Implemented `findElementWithDriftRecovery` with 3-tier fallback (Coordinate tolerance $\rightarrow$ Semantic text/attribute match $\rightarrow$ Live index). |

---

## 2. The 5 Pipeline Handoff Stages & Instrumentation

When `DEBUG=true` (or via browser DevTools console), each stage outputs structured diagnostic traces:

### Stage 1: DOM Tagging & Screenshot Sanitization (`contentScript.ts` ↔ `serviceWorker.ts`)
- **Console Trace**:
  ```
  [Stage 1 - ServiceWorker] Capturing visible tab for context [popup]
  [Stage 1 - ServiceWorker] Tab capture successful. Size: 145820 chars (hash: 4a2b1c8f)
  ```
- **What to Verify**: Ensure `tab capture successful` appears and `Size > 1000`.

### Stage 2: Client → Server Request Dispatch (`serviceWorker.ts`)
- **Console Trace**:
  ```
  [Stage 2 - Client->Server RPC] POST http://127.0.0.1:8000/process-screen | Step: 1 | Nodes: 18 | Frame: 145820 chars (hash: 4a2b1c8f)
  [Stage 2 - Server Response] Received 200 OK from local decision engine: { type: "CLICK", targetId: 0 }
  ```
- **What to Verify**: If connection fails, check that `python main.py` is running on port `8000`.

### Stage 3: FastAPI Request Validation (`main.py`)
- **Terminal Trace**:
  ```
  [Stage 3 - Payload Received] Step: 1 | Goal: 'Login' | DOM Nodes: 18 | Redacted Frame Size: 145820 chars (hash: 4a2b1c8f) | Masked PII Count: 1
  ```
- **What to Verify**: Confirms the schema is valid and no 422 errors are raised.

### Stage 4: Local VLM Decision Reasoning (`vlm_engine.py`)
- **Terminal Trace**:
  ```
  [Stage 4 - Decision] Action: TYPE | TargetId: 0 | Text: tomsmith | Explanation: [Step 1/3] Type 'tomsmith' into username
  ```
- **What to Verify**: Confirms the decision is structured JSON and mapped to an existing element index.

### Stage 5: Target Re-Resolution & Action Execution (`contentScript.ts`)
- **Console Trace**:
  ```
  [Stage 5 - Executing Action]: { type: "TYPE", targetId: 0, text: "tomsmith" }
  [Stage 5 - DOM Resolution] Exact match for [0] <input> at (420, 260)
  ```
- **What to Verify**: If layout shifted, `Semantic text match` or `Fallback index match` ensures the action still reaches the correct element.

---

## 3. Zero-Network Egress Verification

To verify that **zero data leaves your computer**:

1. **Open Chrome DevTools Network Tab** on the extension popup:
   - Filter by `Fetch/XHR`.
   - The **only** request is to `http://127.0.0.1:8000/process-screen`.
   - No requests to external CDNs, HuggingFace, or analytics servers.
2. **Server Startup Self-Check**:
   - Check the terminal output when launching `python main.py`:
     ```
     ======================================================================
     🔒 Zero-Network Egress Verification: Offline Mode Active
        • HF_HUB_OFFLINE=1
        • TRANSFORMERS_OFFLINE=1
        • HF_HUB_DISABLE_TELEMETRY=1
        • Binding Address: 127.0.0.1:8000 (Localhost Only)
     ======================================================================
     ```
3. **Automated Egress Unit Test**:
   - Run `python test_integration.py` — `test_04_zero_network_egress_assertion` mocks the Python `socket` layer and fails immediately if any outbound network connection is initiated.
