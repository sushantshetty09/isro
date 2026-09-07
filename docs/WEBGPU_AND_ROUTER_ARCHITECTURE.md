# 🧠 ISRO Agent: WebGPU On-Device Engine & Task Complexity Router

> **Project:** ISRO Privacy-Preserving Browser Agent (SIH PS 26171)  
> **Topic:** Hybrid On-Device WebGPU Inference & Server VLM Escalation  
> **Target:** Zero Raw PII Egress & Sub-30ms Client Perception  

---

## 1. The Core Architecture & Philosophy

The fundamental goal of **SIH PS 26171** is bridging two computing environments:
1. **Client Browser Environment (WebGPU & WebAssembly):** Runs lightweight machine learning models directly on the user's machine with **zero network calls, zero cloud latency, and 100% privacy**.
2. **Server Environment (Local FastAPI / Qwen2-VL):** Provides heavy visual-language reasoning for complex, multi-element, or ambiguous web layouts.

```
                            User Goal
             (e.g., "Enter username as admin and submit")
                                │
                                ▼
                ┌───────────────────────────────┐
                │ Task Complexity Classifier    │
                │ (client/src/utils/            │
                │  taskClassifier.ts)           │
                └───────────────┬───────────────┘
                                │
               Is it Low-Level or Complex Visual?
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
┌────────────────────────────────┐            ┌────────────────────────────────┐
│ LOW-LEVEL TASK (WebGPU / WASM) │            │ COMPLEX VISUAL TASK (Server)   │
├────────────────────────────────┤            ├────────────────────────────────┤
│ • chrome.offscreen worker runs │            │ • Privacy Sanitizer captures   │
│   WebGPU WGSL compute shaders  │            │   the screen                   │
│ • Tokenizes DOM elements       │            │ • Blacks out Passwords, Cards, │
│ • Calculates vector similarity │            │   Aadhaar & Biometric faces    │
│ • Dispatches Click/Type to tab │            │ • Overlays Set-of-Marks tags   │
│ • Server is NEVER contacted    │            │ • Sends sanitized frame to     │
├────────────────────────────────┤            │   FastAPI (127.0.0.1:8000)     │
│ ⚡ Latency: 20-30ms            │            ├────────────────────────────────┤
│ 🔒 Server RPCs: 0 bytes        │            │ 🛡️ Latency: 800-1500ms         │
│ 🔒 Network Egress: 0 bytes     │            │ 🔒 Zero raw sensitive bytes    │
└────────────────────────────────┘            └────────────────────────────────┘
```

---

## 2. How the Task Complexity Classifier Works

Located in [`client/src/utils/taskClassifier.ts`](file:///d:/UserData/User/Downloads/isro/client/src/utils/taskClassifier.ts):

### A. Detecting High-Level / Complex Tasks
The classifier scans the prompt for visual, spatial, and comparative keywords:
* **Visual cues:** `image`, `picture`, `photo`, `logo`, `avatar`, `color`, `blue`, `red`, `icon`, `banner`.
* **Spatial cues:** `below the`, `above the`, `next to the`, `layout`.
* **Multi-item comparisons:** `compare`, `cheapest`, `best rating`, `pricing table`.

If any of these keywords are present, the classifier tags the task as:
`{ complexity: 'high', suggestedEngine: 'server' }`

### B. Detecting Low-Level / Simple Tasks
Standard interactions are classified as:
`{ complexity: 'low', suggestedEngine: 'webgpu' }`
* Form filling: `"enter username as tomsmith"`, `"fill the email field"`.
* Clicks: `"click submit"`, `"press login"`, `"check the box"`.
* Navigation & Scrolling: `"scroll down by 400px"`, `"navigate to https://..."`.

### C. Compound Step Decomposition
The decomposer splits compound prompts into atomic steps:
* Input: `"Enter username as tomsmith, enter password as SuperSecretPassword! and click submit"`
* Decomposed into 3 atomic steps:
  1. `TYPE "tomsmith" into username`
  2. `TYPE "SuperSecretPassword!" into password`
  3. `CLICK on submit`

---

## 3. How the WebGPU On-Device Engine Works

Located in [`client/src/offscreen/webGpuEngine.ts`](file:///d:/UserData/User/Downloads/isro/client/src/offscreen/webGpuEngine.ts):

### A. WebGPU WGSL Compute Shader
The engine runs a parallel WebGPU compute shader directly on the user's graphics card:
```wgsl
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> queryVector: array<f32>;
@group(0) @binding(2) var<storage, read> candidateVectors: array<f32>;
@group(0) @binding(3) var<storage, read_write> similarityScores: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Parallel cosine similarity computation across all candidate DOM nodes
}
```

### B. Graceful WebAssembly (WASM SIMD) Fallback
If the browser or machine lacks hardware WebGPU support, the engine automatically falls back to Float32 SIMD vector operations. It never crashes or fails.

### C. Matching & Grounding Flow
1. Receives interactive nodes from active tab (buttons, inputs, links).
2. Generates 64-dimensional locality-sensitive subword dense embeddings for the target hint and candidate elements.
3. Computes cosine similarity matrix on GPU hardware.
4. If confidence is $\ge 70\%$, returns the exact element target ID and dispatches synthetic input events.
5. If confidence is $< 70\%$ (ambiguous element), it automatically triggers the visual fallback to the server.

---

## 4. UI Controls & Autonomous Looping

Located in [`client/src/App.tsx`](file:///d:/UserData/User/Downloads/isro/client/src/App.tsx):

* **3-Way Routing Mode Switcher:**
  * `Auto (Adaptive)`: Intelligently routes low-level tasks to WebGPU and visual tasks to Server.
  * `⚡ Force WebGPU`: Forces on-device WebGPU execution. Proves that form-filling works with the **backend server completely offline**.
  * `🛡️ Force Server`: Forces server VLM escalation. Proves visual Set-of-Marks tagging and PII redaction.
* **`⚡ Run Autonomous Task` Button:**
  * Runs an autonomous `while` loop that steps through compound prompts automatically without requiring manual clicks for each field.
