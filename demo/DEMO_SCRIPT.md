# 🛡️ 90-Second Hackathon Judge Presentation Script (SIH PS 26171)

> **Theme**: Privacy-First On-Device Perception & Visual Redaction for Autonomous Browser Agents  
> **Target Duration**: 90 Seconds  
> **Key Message**: *"Zero Raw Sensitive Bytes Ever Leave the Client Machine."*

---

## ⏱️ Timeline & Pitch Flow

### 0:00 – 0:20 | The Problem & The Redaction Shield (Lead with Privacy!)
- **Action**: Open [`test_pii_page.html`](file:///c:/Users/susha/OneDrive/Desktop/New%20folder/test_pii_page.html) in Google Chrome. Point out the Aadhaar card, PAN card, credit card, password, and profile face on screen.
- **Pitch**:
  > *"Judges, while AI browser agents are powerful, sending raw screen captures to central servers creates catastrophic privacy risks—exposing passwords, credit cards, government IDs, and facial biometric data.  
  > Our solution is the **ISRO Privacy-Preserving Browser Shield**: a 100% on-device perception engine running in the browser sandbox that detects and sanitizes all sensitive visual context before any network request is allowed to leave the device."*

---

### 0:20 – 0:50 | Live Before/After Dashboard & Multi-Style Redaction (80% Focus)
- **Action**: Click the **ISRO Privacy Shield** extension icon.
- **Showcase**:
  1. **Before / After Comparison**: Point out the side-by-side view (Raw Tainted Screen on left vs Sanitized Screen on right).
  2. **Interactive Reveal Slider**: Drag the slider across the screen to dynamically reveal the crisp redaction boxes.
  3. **Multi-Style Redaction Controls**: Click **`💧 Blur`**, **`🔲 Pixelate`**, and **`⬛ Blackout`** live to demonstrate instant client-side canvas re-rendering.
  4. **Live Metric Badges**:
     - `6 PII Fields Masked`
     - `1 Face Blurred (Biometric)`
     - `1 Aadhaar UIDAI Masked`
     - `1 PAN Card Masked`
     - `1 Card (Luhn Validated)`
     - `🔒 0 Bytes Leaked (PASS)`
  5. **Latency Metric**: Point out the live `~35ms frame latency` showing instantaneous on-device processing.

---

### 0:50 – 1:15 | The Proof: Judge Inspector Dashboard
- **Action**: In Chrome, open `http://127.0.0.1:8000/inspector`.
- **Pitch**:
  > *"To prove zero-trust compliance, look at our **Server Judge Inspector**. The server receives strictly the sanitized, anonymized screenshot. The banner confirms: **Zero Raw PII Transmitted**. All sensitive fields arrived pre-redacted from the browser sandbox."*

---

### 1:15 – 1:30 | Agent Ingestion Proof (20% Secondary Demo)
- **Action**: In the extension popup, switch to the **`Agent Demo`** tab, click **`Send Sanitized Frame to Server`**.
- **Pitch**:
  > *"Even with sensitive PII 100% masked, the central decision model can still ground non-sensitive interactive elements via Set-of-Marks and return actionable commands (e.g. `CLICK [0]` Proceed to Verification). Privacy is strictly preserved while AI assistance remains fully functional."*

---

## 🏆 Summary Checklist for Presenters

- [ ] Chrome extension loaded (`client/dist`)
- [ ] FastAPI backend running (`python main.py` at `127.0.0.1:8000`)
- [ ] `test_pii_page.html` loaded in active browser tab
- [ ] Extension popup opened, side-by-side comparison visible
- [ ] Switch styles live (Blur / Pixelate / Blackout)
- [ ] Show `127.0.0.1:8000/inspector` tab with green confirmation banner
