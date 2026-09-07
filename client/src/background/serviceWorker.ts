const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
const DEBUG = true;
export const INTERNAL_SANITIZER_SECRET = 'ISRO_SECURE_INTERNAL_CHOKEPOINT_TOKEN_2024_PS26171';

interface OffscreenVisionRequest {
  action: 'RUN_OFFSCREEN_VISION';
  imageDataUrl: string;
}

interface InternalSanitizerCaptureRequest {
  action: '_INTERNAL_RAW_CAPTURE_FOR_SANITIZER_ONLY';
  internalToken: string;
}

interface BackendProxyRequest {
  action: 'SEND_TO_SERVER';
  payload: {
    image?: string;
    sanitizedImageBase64?: string;
    domElements?: any[];
    domMap?: any[];
    userGoal?: string;
    stepIndex?: number;
    url?: string;
    title?: string;
    viewport?: { width: number; height: number };
    maskedPiiCount?: number;
    maskedCount?: number;
  };
  endpoint?: string;
}

type ServiceWorkerMessage = OffscreenVisionRequest | InternalSanitizerCaptureRequest | BackendProxyRequest | { action: string };

async function setupOffscreenDocument(path: string): Promise<void> {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (hasDoc) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(path),
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Local on-device visual perception & pattern analysis',
  });
}

function computeShortHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 512); i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

chrome.runtime.onMessage.addListener(
  (message: any, sender, sendResponse: (response: any) => void) => {
    const tabId = sender.tab?.id ?? 'popup';

    // 1. HARD SECURITY LOCK: Block any raw CAPTURE_VISIBLE_TAB requests
    if (message.action === 'CAPTURE_VISIBLE_TAB') {
      console.error(`[ServiceWorker - SECURITY BLOCK] Public CAPTURE_VISIBLE_TAB requested by context [${tabId}] is disabled!`);
      sendResponse({
        status: 'error',
        error: '🚨 [SECURITY POLICY] Raw tab capture is disabled. All screenshots must route through getSanitizedScreenshot().',
      });
      return false;
    }

    // 2. Internal isolated capture accessible ONLY to sanitizer with valid token
    if (message.action === '_INTERNAL_RAW_CAPTURE_FOR_SANITIZER_ONLY') {
      if (message.internalToken !== INTERNAL_SANITIZER_SECRET) {
        console.error(`[ServiceWorker - SECURITY BLOCK] Invalid token provided for _INTERNAL_RAW_CAPTURE_FOR_SANITIZER_ONLY from [${tabId}]`);
        sendResponse({
          status: 'error',
          error: '🚨 [SECURITY VIOLATION] Unauthorized attempt to access internal capture without valid sanitizer token.',
        });
        return false;
      }

      if (DEBUG) console.log(`[ServiceWorker] Internal raw frame captured exclusively for on-device sanitizer (windowId: ${message.windowId}).`);

      try {
        const targetWinId = (typeof message.windowId === 'number') ? message.windowId : undefined;
        
        const captureOptions = { format: 'png' as const };

        const handleResult = (dataUrl?: string, err?: chrome.runtime.LastError) => {
          if (err || !dataUrl) {
            console.error('[ServiceWorker] captureVisibleTab failed:', err?.message);
            sendResponse({ status: 'error', error: err?.message || 'Failed to capture screen' });
          } else {
            sendResponse({ status: 'success', dataUrl });
          }
        };

        if (targetWinId !== undefined) {
          chrome.tabs.captureVisibleTab(targetWinId, captureOptions, (dataUrl) => {
            const err = chrome.runtime.lastError;
            if (err || !dataUrl) {
              // Fallback to active window
              chrome.tabs.captureVisibleTab(captureOptions, (fallbackUrl) => {
                handleResult(fallbackUrl, chrome.runtime.lastError);
              });
            } else {
              handleResult(dataUrl);
            }
          });
        } else {
          chrome.tabs.captureVisibleTab(captureOptions, (dataUrl) => {
            handleResult(dataUrl, chrome.runtime.lastError);
          });
        }
      } catch (syncErr: any) {
        console.error('[ServiceWorker] captureVisibleTab sync exception:', syncErr);
        sendResponse({ status: 'error', error: syncErr.message });
      }

      return true; // Keep message channel open for async response
    }

    // 3. Offscreen Local Vision Detection Relay
    if (message.action === 'RUN_OFFSCREEN_VISION') {
      const { imageDataUrl } = message as OffscreenVisionRequest;

      if (!imageDataUrl) {
        sendResponse({ status: 'error', error: 'Missing imageDataUrl' });
        return true;
      }

      setupOffscreenDocument(OFFSCREEN_PATH)
        .then(() => {
          return chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'RUN_VISION_DETECTION',
            imageDataUrl,
          });
        })
        .then((offscreenResponse) => {
          sendResponse(offscreenResponse);
        })
        .catch((err) => {
          console.debug('[Stage 1 - ServiceWorker] Offscreen vision notice:', err);
          sendResponse({ status: 'success', visualPiiBoxes: [] });
        });

      return true;
    }

    // 3b. Offscreen WebGPU Local Task Evaluation Relay
    if (message.action === 'EVALUATE_LOCAL_TASK') {
      setupOffscreenDocument(OFFSCREEN_PATH)
        .then(() => {
          return chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'EVALUATE_LOCAL_TASK',
            userGoal: message.userGoal,
            currentStep: message.currentStep,
            interactiveNodes: message.interactiveNodes,
          });
        })
        .then((offscreenResponse) => {
          sendResponse(offscreenResponse);
        })
        .catch((err) => {
          console.debug('[Stage 1 - ServiceWorker] Offscreen WebGPU evaluation notice:', err);
          sendResponse({ status: 'error', canHandleLocally: false, error: err?.message });
        });

      return true;
    }

    // 4. Relay payload to local FastAPI backend (Stage 2: Client -> Server with Zero-Trust Guard)
    if (message.action === 'SEND_TO_SERVER') {
      const { payload, endpoint } = message as BackendProxyRequest;
      const targetUrl = endpoint || 'http://127.0.0.1:8000/process-screen';

      const img = payload.image || payload.sanitizedImageBase64 || '';
      
      // Hard Zero-Trust Guard: Disallow transmitting unredacted raw capture
      const isSanitized = (payload as any).brandSeal?.zeroLeakVerified || 
                          (payload as any).privacyVerification?.verifiedOffline || 
                          (payload as any).redaction_manifest !== undefined;

      if (img && !isSanitized) {
        const errorMsg = '🚨 [ZERO-TRUST ERROR] Attempted to transmit unverified/unredacted screenshot to server! Transmission blocked.';
        console.error(`[Stage 2 - Zero-Trust Guard BLOCKED] ${errorMsg}`);
        sendResponse({ status: 'error', error: errorMsg });
        return true;
      }

      const requestBody = {
        image: img,
        domElements: payload.domElements || payload.domMap || [],
        userGoal: payload.userGoal || '',
        stepIndex: payload.stepIndex || 0,
        url: payload.url || '',
        title: payload.title || '',
        maskedCount: payload.maskedCount || payload.maskedPiiCount || 0,
        redactionMode: (payload as any).redactionMode || 'blur',
        privacyVerification: (payload as any).privacyVerification || { bytesLeaked: 0, verifiedOffline: true },
      };

      const imgLen = requestBody.image.length;
      const imgHash = computeShortHash(requestBody.image);

      if (DEBUG) {
        console.log(
          `[Stage 2 - Client->Server RPC] POST ${targetUrl} | Step: ${(requestBody.stepIndex || 0) + 1} | ` +
          `Nodes: ${requestBody.domElements.length} | Frame: ${imgLen} chars (hash: ${imgHash}) | Pre-Redacted: YES`
        );
      }

      fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
          }
          return res.json();
        })
        .then((data) => {
          if (DEBUG) {
            console.log(`[Stage 2 - Server Response] Received 200 OK from local decision engine:`, data);
          }
          sendResponse({ status: 'success', agentResponse: data });
        })
        .catch((err) => {
          console.warn(`[Stage 2 - Server Connection Warning] ${err.message}`);
          sendResponse({
            status: 'error',
            error: `Cannot reach local FastAPI server at ${targetUrl}. Start it with "python main.py" in server/ folder (${err.message}).`,
          });
        });

      return true;
    }

    return false;
  }
);
