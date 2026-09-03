# ISRO SIH PS 26171: On-device Visual Perception for Light-weight Browser Agents

Production-grade Chrome Extension (Manifest V3 + Vite + React + TypeScript) implementing on-device WebGPU machine learning visual perception, DOM privacy scanning, and HTML5 Canvas redaction for light-weight browser agents.

---

## 🏛️ Architecture Overview

```
[ Active Web Page Viewport ]
             │
             ▼
[ Background Service Worker ] (chrome.tabs.captureVisibleTab)
       │                    │
       ▼                    ▼
[ Offscreen WebGPU Engine ] [ DOM Privacy Scanner ]
  (@huggingface/transformers)   - Input type & name heuristics
  - YOLOv8n object detection    - Password, Card, SSN, Aadhaar
  - Faces, avatars, IDs         - Interactive node grounding ([1], [2]...)
       │                    │
       └──────────┬─────────┘
                  ▼
   [ HTML5 Canvas Redaction Engine ]
     - Solid blackout masks (`#050508`)
     - Warning borders + `[MASKED PII]` badges
     - Numbered node overlays for VLM action grounding
                  │
                  ▼
   [ Sanitized Payload + DOM Map ]
                  │
                  ▼
[ VLM Agent Backend / Control UI ] (http://localhost:8000/process-screen)
                  │
                  ▼
   [ Action Execution: CLICK, SCROLL, TYPE ]
```

---

## 🚀 Quick Start & Setup

### 1. Install Dependencies
```bash
cd client
npm install
```

### 2. Build the Extension
```bash
npm run build
```
The compiled, production-ready extension will be output into the `client/dist/` folder.

### 3. Load into Google Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle at top right).
3. Click **Load unpacked** and select the `client/dist` directory.
4. Pin the extension and click the extension icon on any webpage to inspect and execute perception actions.

---

## 📦 Directory Structure

- `manifest.config.ts` - Manifest V3 configuration with activeTab, scripting, offscreen, and tabs permissions.
- `vite.config.ts` - Vite bundler setup with `@crxjs/vite-plugin`.
- `src/utils/domScanner.ts` - DOM privacy scanner & interactive node grounding.
- `src/offscreen/` - WebGPU ML pipeline (`Xenova/yolov8n`) running inside Chrome Offscreen document with WASM fallback.
- `src/content/contentScript.ts` - In-memory HTML5 Canvas redaction engine & VLM action dispatcher (`CLICK`, `SCROLL`, `TYPE`, `HOVER`).
- `src/background/serviceWorker.ts` - MV3 service worker orchestrating tab capture, offscreen lifecycle, and content script messages.
- `src/App.tsx` - React popup dashboard with live privacy metrics, sanitized canvas preview, node grounding inspector, and autonomous agent perception loop.
- `src/types/index.ts` - TypeScript interfaces for actions, payloads, and communication messages.

---

## 📡 Backend API Contract (`/process-screen`)

The extension sends a `POST` request to `http://localhost:8000/process-screen` with the following JSON payload:

```json
{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSU...",
  "domMap": [
    {
      "id": 1,
      "tagName": "button",
      "text": "Submit Application",
      "bbox": { "x": 120, "y": 450, "width": 140, "height": 40 },
      "isClickable": true,
      "isInput": false,
      "selector": "button.btn-primary"
    }
  ],
  "url": "https://example.com/portal",
  "title": "Application Form",
  "maskedCount": 3
}
```

### Expected Response from Backend:
```json
{
  "thought": "I will click the Submit Application button to proceed to the next step.",
  "action": {
    "type": "CLICK",
    "targetNodeId": 1
  },
  "status": "CONTINUE"
}
```
Supported action types: `CLICK`, `SCROLL`, `TYPE` (with `text`), `HOVER`, `NAVIGATE` (with `url`), `KEY_PRESS` (with `key`), `DONE`.
