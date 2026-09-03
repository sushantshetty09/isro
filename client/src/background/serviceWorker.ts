const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
const DEBUG = true;

interface OffscreenVisionRequest {
  action: 'RUN_OFFSCREEN_VISION';
  imageDataUrl: string;
}

interface CaptureTabRequest {
  action: 'CAPTURE_VISIBLE_TAB';
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

type ServiceWorkerMessage = OffscreenVisionRequest | CaptureTabRequest | BackendProxyRequest;

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
  (message: ServiceWorkerMessage, sender, sendResponse: (response: any) => void) => {
    const tabId = sender.tab?.id ?? 'popup';

    // 1. Untainted visible tab capture using official Chrome API
    if (message.action === 'CAPTURE_VISIBLE_TAB') {
      if (DEBUG) console.log(`[Stage 1 - ServiceWorker] Capturing visible tab for context [${tabId}]`);

      chrome.tabs.captureVisibleTab({ format: 'png' })
        .then((dataUrl) => {
          if (DEBUG) {
            console.log(`[Stage 1 - ServiceWorker] Tab capture successful. Size: ${dataUrl.length} chars (hash: ${computeShortHash(dataUrl)})`);
          }
          sendResponse({ status: 'success', dataUrl });
        })
        .catch((err) => {
          console.error('[Stage 1 - ServiceWorker] captureVisibleTab error:', err);
          sendResponse({ status: 'error', error: err.message });
        });

      return true; // Keep channel open
    }

    // 2. Offscreen Local Vision Detection Relay
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

    // 3. Relay payload to local FastAPI backend (Stage 2: Client -> Server)
    if (message.action === 'SEND_TO_SERVER') {
      const { payload, endpoint } = message as BackendProxyRequest;
      const targetUrl = endpoint || 'http://127.0.0.1:8000/process-screen';

      const requestBody = {
        image: payload.image || payload.sanitizedImageBase64,
        domElements: payload.domElements || payload.domMap || [],
        userGoal: payload.userGoal || '',
        stepIndex: payload.stepIndex || 0,
        url: payload.url || '',
        title: payload.title || '',
        maskedCount: payload.maskedCount || payload.maskedPiiCount || 0,
      };

      const imgLen = requestBody.image?.length || 0;
      const imgHash = computeShortHash(requestBody.image || '');

      if (DEBUG) {
        console.log(
          `[Stage 2 - Client->Server RPC] POST ${targetUrl} | Step: ${(requestBody.stepIndex || 0) + 1} | ` +
          `Nodes: ${requestBody.domElements.length} | Frame: ${imgLen} chars (hash: ${imgHash})`
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
