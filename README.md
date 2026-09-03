# 🛡️ ISRO Privacy-Preserving Browser Agent (SIH PS 26171)

> **Smart India Hackathon (SIH) Problem Statement 26171 (ISRO)**  
> **Topic:** Lightweight On-Device Privacy Redaction & Autonomous Browser Perception Engine  
> **Repository:** `https://github.com/sushantshetty09/isro-privacy-agent.git`

---

## 🌟 Overview

The **ISRO Privacy-Preserving Browser Agent** is a zero-trust, privacy-first autonomous web navigation assistant. It enables lightweight AI models and Vision-Language Models (VLMs) to perceive, reason about, and interact with live web pages **without exposing sensitive personal data or making outbound network calls to external third-party cloud APIs**.

### 🔒 Zero-Trust Architecture & Zero Network Egress Guarantee

1. **Client-Side Redaction (100% On-Device)**: The browser extension captures the active viewport, indexes all interactive DOM nodes (inputs, buttons, links), and automatically detects PII (passwords, payment cards, SSN, Aadhaar, sensitive credentials).
2. **Visual Blackout**: Sensitive regions are masked with black rectangles and marked `[MASKED PII]` on an offline HTML5 Canvas before reaching the decision model.
3. **Yellow [ID] Badges**: Safe interactive elements receive numbered bounding boxes (`[0]`, `[1]`, `[2]...`).
4. **Local Decision Server**: Only runs on `127.0.0.1:8000`. Offline environment variables (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`) prevent any outbound telemetry.
5. **DOM Drift Resilient Execution**: The content script re-resolves target elements dynamically using coordinate tolerance and semantic text matching before executing synthetic clicks and React/Vue-compatible inputs.

```
 [ Active Web Page ]
         │
         ▼ (1. Local DOM Scan + Untainted Tab Screenshot)
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT EXTENSION (Manifest V3 - Chrome Sandbox)                 │
│                                                                 │
│ • DOM Scanner indexes interactive elements (Buttons, Inputs).   │
│ • Sensitive PII (Passwords, Cards, Aadhaar) identified locally. │
│ • Local HTML5 Canvas blacks out regions: [MASKED PII].          │
│ • Yellow [ID] bounding box tags are assigned to safe nodes.     │
└────────────────────────────────┬────────────────────────────────┘
                                 │ (Strictly 127.0.0.1:8000 RPC)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ LOCAL FASTAPI SERVER (http://127.0.0.1:8000)                   │
│                                                                 │
│ • Qwen2-VL-2B-Instruct / Local Ollama / Deterministic Planner.  │
│ • Offline mode enforced: HF_HUB_OFFLINE=1, TRANSFORMERS_OFFLINE=1│
│ • Produces structured JSON action: { "type": "TYPE", ... }.     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼ (Action Dispatch)
┌─────────────────────────────────────────────────────────────────┐
│ CONTENT SCRIPT (DOM Drift Recovery & Synthetic Action Execution)│
│                                                                 │
│ • Focuses & dispatches React-compatible pointer & keyboard events│
│ • Automatically terminates with DONE upon completion.           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
.
├── client/                     # Chrome Extension (Manifest V3 + React + Vite + TypeScript)
│   ├── src/
│   │   ├── background/         # Service worker message routing & tab capture
│   │   ├── content/            # DOM injection, synthetic click/type execution & drift recovery
│   │   ├── offscreen/          # Zero-egress pattern perception
│   │   ├── utils/              # DOM scanner & PII coordinate extractor
│   │   └── App.tsx             # Clean popup UI with step-by-step logs & preview
│   ├── manifest.config.ts      # Extension permissions & CSP definition
│   ├── package.json
│   └── vite.config.ts
├── server/                     # Local Python Backend (FastAPI)
│   ├── main.py                 # 127.0.0.1 bound FastAPI app with CORS lockdown
│   ├── schemas.py              # Pydantic models for validation & action schema
│   ├── vlm_engine.py           # Offline Qwen2-VL loader, JSON repair & local planner
│   ├── test_integration.py     # 4-stage automated integration & egress verification tests
│   └── requirements.txt        # Python backend dependencies
├── .gitignore                  # Git ignore rules for node_modules, cache & weights
├── DEBUGGING.md                # 5-stage pipeline post-mortem & debugging instrumentation
├── docker-compose.yml          # Optional local containerization
└── README.md                   # Project documentation
```

---

## 🚀 Quickstart Guide (Works on Windows, macOS, Linux)

### Prerequisites
- **Node.js** (v18 or higher) & **npm**
- **Python** (v3.9 to v3.12 recommended)
- **Google Chrome** (or Chromium-based browser)

---

### Step 1: Start Local FastAPI Backend

```bash
# Navigate to the server folder
cd server

# Create and activate virtual environment (Optional but Recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Start local server
python main.py
```

*Terminal will display the startup self-check banner:*
```
======================================================================
🔒 Zero-Network Egress Verification: Offline Mode Active
   • HF_HUB_OFFLINE=1
   • TRANSFORMERS_OFFLINE=1
   • HF_HUB_DISABLE_TELEMETRY=1
   • Binding Address: 127.0.0.1:8000 (Localhost Only)
======================================================================
```

---

### Step 2: Build and Install the Chrome Extension

```bash
# In a second terminal window, navigate to client folder
cd client

# Install frontend dependencies
npm install

# Build the extension
npm run build
```

#### Load Unpacked Extension in Chrome:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top right corner.
3. Click **Load unpacked** (top left).
4. Select the `client/dist` folder inside this project.

---

### Step 3: Run Any Custom Instruction

1. Open any website in Chrome (e.g. login form, search engine, e-commerce site).
2. Click the **ISRO Privacy Shield** extension icon in your toolbar.
3. Type **any custom command you want**, such as:
   - `"Search for Chandrayaan-3 missions"`
   - `"Enter username as tomsmith and enter password as SuperSecretPassword! and submit"`
   - `"Scroll down by 400px"`
   - `"Click the second link and open settings"`
4. Click **Execute Command** — the agent executes each step autonomously and safely on-device!

---

## 🧪 Automated Verification & Testing

To verify end-to-end integration and prove zero external network calls:

```bash
cd server
python test_integration.py
```

### Test Suite Coverage:
- **`test_01_full_rpc_pipeline`**: Validates end-to-end perception $\rightarrow$ DOM node grounding $\rightarrow$ action dispatch.
- **`test_02_json_repair_and_validation`**: Tests resilient parsing of markdown code fences, trailing commas, and Python dict outputs from local models.
- **`test_03_cors_origin_policy`**: Verifies non-extension origins are rejected, while `chrome-extension://*` is allowed.
- **`test_04_zero_network_egress_assertion`**: Intercepts the Python `socket` layer to verify that **zero outbound connections** are made to external hosts.

---

## 🔍 Troubleshooting Guide

| Symptom | Likely Stage | Root Cause & Resolution |
|:---|:---|:---|
| **"Cannot reach local FastAPI server"** | Stage 2 (RPC) | The server is not running. Launch `python main.py` in the `server/` directory. |
| **"Target not found in live DOM"** | Stage 5 (Drift) | Dynamic SPA layout updated. The engine triggers `findElementWithDriftRecovery` to find the element by text/label. |
| **"Error: Please enter a command"** | Stage 1 (UI) | Input box is empty. Type your desired instruction and click Execute. |
| **"422 Unprocessable Entity"** | Stage 3 (Validation) | Payload structure mismatch. Handled automatically with structured 422 diagnostic logs in `main.py`. |

---

## 📜 License

Developed for the **Smart India Hackathon (SIH 2024 / PS SIH26171)** in collaboration with **ISRO**.  
Zero-Trust, Open Source, and Privacy Preserving.
