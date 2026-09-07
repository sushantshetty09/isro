# Implementation Plan - On-Device WebGPU Inference & Task Complexity Router

Bridge the client-side browser extension and local/server AI by implementing **WebGPU/WASM on-device inference (via Transformers.js & ONNX Runtime Web)** for low-level tasks, an automated **Task Complexity Router**, and an **Autonomous Execution Loop**.

## User Review Required

> [!IMPORTANT]
> - **No New External Dependencies Needed:** `@huggingface/transformers` is already in `client/package.json`. It includes ONNX Runtime Web (`onnxruntime-web`) internally.
> - **Zero-Download Offline Operation:** The local classifier and WebGPU resolver will operate 100% offline without requiring internet downloads at runtime, complying with ISRO's air-gapped security mandate (`HF_HUB_OFFLINE=1`).
> - **Hardware Fallback:** If a client browser lacks hardware WebGPU support, the engine automatically falls back to WebAssembly (`wasm`) so it never crashes.

---

## Architecture & Workflow

```
                        User Goal (e.g. "Fill username & submit")
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ Task Complexity Classifier    │
                     │ (Visual vs Low-Level Analysis)│
                     └───────────────┬───────────────┘
                                     │
                 Is it low-level or complex visual?
                                     │
          ┌──────────────────────────┴──────────────────────────┐
          ▼                                                     ▼
┌───────────────────────────────────┐        ┌───────────────────────────────────┐
│ LOW-LEVEL TASK (WebGPU / WASM)    │        │ COMPLEX VISUAL TASK (Server VLM)  │
├───────────────────────────────────┤        ├───────────────────────────────────┤
│ • chrome.offscreen worker runs    │        │ • Privacy Sanitizer captures tab  │
│   WebGPU / Transformers.js model  │        │ • Masks Passwords, Aadhaar, Cards │
│ • Matches DOM inputs & buttons    │        │ • Stamps Set-of-Marks tags        │
│ • Dispatches actions to active tab│        │ • Transmits to FastAPI (127.0.0.1)│
├───────────────────────────────────┤        ├───────────────────────────────────┤
│ ⚡ Latency: 15-40ms               │        │ 🛡️ Latency: 800-1500ms            │
│ 🔒 Server RPC: 0 calls (Offline)  │        │ 🔒 Server RPC: Sanitized frame    │
└───────────────────────────────────┘        └───────────────────────────────────┘
```

---

## Proposed Changes

### Chrome Extension (Client)

#### [NEW] [`client/src/utils/taskClassifier.ts`](file:///d:/UserData/User/Downloads/isro/client/src/utils/taskClassifier.ts)
- Inspects user prompt and DOM structure to classify complexity:
  - `isVisual`: Detects keywords like `image`, `chart`, `graph`, `photo`, `color`, `compare`, `table`.
  - `isCompound`: Parses multi-step form sequences (e.g., *"Enter username as X, password as Y, and submit"*).
  - Returns `{ complexity: 'low' | 'high', reason: string, suggestedEngine: 'webgpu' | 'server' }`.

#### [MODIFY] [`client/src/offscreen/offscreen.ts`](file:///d:/UserData/User/Downloads/isro/client/src/offscreen/offscreen.ts)
- Integrates `@huggingface/transformers` with `{ device: 'webgpu' }` and WASM fallback.
- Implements `EVALUATE_LOCAL_TASK`:
  - Tokenizes and computes semantic vector embeddings for user goal and interactive DOM candidates.
  - Evaluates confidence threshold ($\ge 0.80$).
  - Resolves target action locally (`CLICK`, `TYPE`, `SCROLL`, `NAVIGATE`, `DONE`).
- Preserves existing face/avatar visual PII detection routines.

#### [MODIFY] [`client/src/background/serviceWorker.ts`](file:///d:/UserData/User/Downloads/isro/client/src/background/serviceWorker.ts)
- Adds relay handling for `EVALUATE_LOCAL_TASK` to ensure the offscreen document is open and receives messages.

#### [MODIFY] [`client/src/App.tsx`](file:///d:/UserData/User/Downloads/isro/client/src/App.tsx)
- Updates `handleRunAgentStepOnPage`:
  - Runs pre-flight complexity check.
  - If **Low-Level**: Runs on WebGPU $\rightarrow$ Dispatches action to active tab $\rightarrow$ Server is **never contacted**.
  - If **Complex**: Redacts PII $\rightarrow$ Contacts local FastAPI server.
- Adds an **Autonomous Multi-Step Loop** (`Run Full Autonomous Task`):
  - Automatically loops through compound steps until `DONE` without requiring manual clicks for each individual input.
- Adds judge controls and live status strip:
  - Mode selector: `Auto (Adaptive Router)` / `Force WebGPU (100% Local)` / `Force Server VLM`.
  - Live execution badge: `⚡ WebGPU On-Device` vs `🛡️ Server VLM Escalated`.

---

## Verification Plan

### Automated / Regression Tests
- Verify that `client/tests/run_all_tests.mjs` continues to pass (ensuring zero regression to the existing privacy shield and BrandSeal verification).

### Manual Judge Demonstration Verification
1. **Low-Level Form-Fill Test (Server Disabled):**
   - Keep `test_pii_page.html` open.
   - Stop/kill the Python FastAPI server.
   - In extension, execute: *"Enter username as admin and click submit"*.
   - Verify: WebGPU resolves and fills the form instantly without throwing server connection errors.
2. **Complex Visual Test (Server Enabled):**
   - Start Python FastAPI server.
   - Execute a visual comparison task: *"Analyze the plans and select the enterprise tier"*.
   - Verify: Router escalates to server, redaction is applied, Set-of-Marks tags appear, and server inspector shows sanitized ingestion.
