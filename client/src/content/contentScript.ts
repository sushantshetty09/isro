import {
  scanDOM,
  scanDOMPrivacyAndNodes,
  BoundingBox,
  NonSensitiveDOMNode,
  ScanResult,
} from '../utils/domScanner';

const DEBUG = true;
console.log('[ContentScript] ISRO Visual Perception & Privacy Redaction Engine loaded (Zero-Egress Mode).');

let cachedNodes: NonSensitiveDOMNode[] = [];

/**
 * Resilient DOM Element Resolution with Semantic Matching.
 */
function findElementWithDriftRecovery(nodeId: number): HTMLElement | null {
  const node = cachedNodes.find((n) => n.id === nodeId);
  if (!node) {
    if (DEBUG) console.warn(`[DOM Resolution] Target [${nodeId}] not in cache. Scanning live elements.`);
    const liveInteractive = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input, textarea, select, summary, [role="button"], [role="link"], [role="checkbox"]'
      )
    ).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return liveInteractive[nodeId] || null;
  }

  // Strategy 1: Coordinate + Tag Match within tolerance
  const tagCandidates = Array.from(document.querySelectorAll<HTMLElement>(node.tag));
  for (const el of tagCandidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const elX = Math.round(rect.left);
    const elY = Math.round(rect.top);

    if (Math.abs(elX - node.bbox.x) <= 25 && Math.abs(elY - node.bbox.y) <= 25) {
      if (DEBUG) console.log(`[DOM Resolution] Exact match for [${nodeId}] <${node.tag}> at (${elX}, ${elY})`);
      return el;
    }
  }

  // Strategy 2: Text / Label / Attribute Matching
  if (node.text) {
    const cleanTargetText = node.text.toLowerCase().trim();
    for (const el of tagCandidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const inner = (el.innerText || el.textContent || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).name || el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (inner && (inner === cleanTargetText || cleanTargetText.includes(inner) || inner.includes(cleanTargetText))) {
        if (DEBUG) console.log(`[DOM Resolution] Semantic text match for [${nodeId}] <${node.tag}>: "${inner}"`);
        return el;
      }
    }
  }

  return null;
}

/**
 * Execute Synthetic Action on Target Element
 */
async function executeAction(action: {
  type: string;
  targetId?: number;
  text?: string;
  distance?: number;
  url?: string;
  key?: string;
  explanation?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const actionType = (action.type || 'DONE').toUpperCase();
    const targetId = action.targetId;

    switch (actionType) {
      case 'CLICK': {
        if (targetId === undefined || targetId === null) {
          return { success: false, message: 'CLICK action missing targetId' };
        }
        const el = findElementWithDriftRecovery(targetId);
        if (!el) {
          return { success: false, message: `Target element [${targetId}] not found in live DOM.` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 150));

        el.focus();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.click();

        return { success: true, message: `Successfully clicked target [${targetId}]` };
      }

      case 'TYPE': {
        if (targetId === undefined || targetId === null) {
          return { success: false, message: 'TYPE action missing targetId' };
        }
        const textToType = action.text || '';
        const el = findElementWithDriftRecovery(targetId);
        if (!el) {
          return { success: false, message: `Target element [${targetId}] not found in live DOM.` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 100));

        el.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = textToType;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, message: `Typed "${textToType}" into target [${targetId}]` };
        }
        el.innerText = textToType;
        return { success: true, message: `Set text in target [${targetId}]` };
      }

      case 'SCROLL': {
        const dist = action.distance || 350;
        window.scrollBy({ top: dist, behavior: 'smooth' });
        return { success: true, message: `Scrolled window by ${dist}px` };
      }

      case 'DONE': {
        return { success: true, message: 'Agent completed assigned task.' };
      }

      default:
        return { success: true, message: `Completed action ${actionType}` };
    }
  } catch (err: any) {
    return { success: false, message: `Execution error: ${err.message}` };
  }
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse: (response: any) => void) => {
  if (message.action === 'SCAN_DOM' || message.action === 'SCAN_DOM_NODES' || message.type === 'SCAN_DOM_NODES') {
    try {
      const fullScan = scanDOM();
      cachedNodes = fullScan.interactiveNodes.map(n => ({
        id: n.id,
        tag: n.tagName,
        text: n.text,
        bbox: n.bbox,
      }));

      console.log(`[ContentScript] DOM Scan complete. Found ${fullScan.piiElements.length} PII elements, ${fullScan.interactiveNodes.length} interactive nodes.`);

      sendResponse({
        status: 'success',
        piiElements: fullScan.piiElements,
        interactiveNodes: fullScan.interactiveNodes,
        sensitiveBoxes: fullScan.piiElements.map(p => p.bbox),
        viewport: fullScan.viewport,
      });
    } catch (err: any) {
      console.error('[ContentScript] DOM scan error:', err);
      sendResponse({
        status: 'error',
        error: err.message,
        piiElements: [],
        interactiveNodes: [],
        sensitiveBoxes: [],
      });
    }
    return true;
  }

  if (message.action === 'EXECUTE_ACTION' || message.type === 'EXECUTE_ACTION') {
    executeAction(message.payload || message)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message }));

    return true;
  }

  return false;
});
