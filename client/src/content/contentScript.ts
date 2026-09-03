import {
  scanDOMPrivacyAndNodes,
  BoundingBox,
  NonSensitiveDOMNode,
  ScanResult,
} from '../utils/domScanner';

const DEBUG = true;
console.log('[ContentScript] ISRO Visual Perception & Privacy Redaction Engine loaded (Zero-Egress Mode).');

let cachedNodes: NonSensitiveDOMNode[] = [];

/**
 * Stage 5: Resilient DOM Element Re-Resolution with DOM Drift Handling.
 * Handles dynamic layout shifts, asynchronous renders, and coordinate changes
 * between screenshot perception and action execution.
 */
function findElementWithDriftRecovery(nodeId: number): HTMLElement | null {
  const node = cachedNodes.find((n) => n.id === nodeId);
  if (!node) {
    if (DEBUG) console.warn(`[Stage 5 - DOM Resolution] Target [${nodeId}] not in cache. Scanning live elements.`);
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

    const elX = Math.round(rect.left + window.scrollX);
    const elY = Math.round(rect.top + window.scrollY);

    if (Math.abs(elX - node.bbox.x) <= 20 && Math.abs(elY - node.bbox.y) <= 20) {
      if (DEBUG) console.log(`[Stage 5 - DOM Resolution] Exact match for [${nodeId}] <${node.tag}> at (${elX}, ${elY})`);
      return el;
    }
  }

  // Strategy 2: Text / Label / Attribute Matching (handles scroll & layout drift)
  if (node.text) {
    const cleanTargetText = node.text.toLowerCase().trim();
    for (const el of tagCandidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const inner = (el.innerText || el.textContent || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).name || el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (inner && (inner === cleanTargetText || cleanTargetText.includes(inner) || inner.includes(cleanTargetText))) {
        if (DEBUG) console.log(`[Stage 5 - DOM Resolution] Semantic text match for [${nodeId}] <${node.tag}>: "${inner}"`);
        return el;
      }
    }
  }

  // Strategy 3: Global Interactive Element Index Fallback
  const allInteractive = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, a[href], input, textarea, select, summary, [role="button"], [role="link"], [role="checkbox"]'
    )
  ).filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  if (allInteractive[nodeId]) {
    if (DEBUG) console.log(`[Stage 5 - DOM Resolution] Fallback index match [${nodeId}] <${allInteractive[nodeId].tagName.toLowerCase()}>`);
    return allInteractive[nodeId];
  }

  return null;
}

/**
 * Stage 5: High-Fidelity Synthetic Action Execution
 */
export async function executeAction(action: {
  type: 'CLICK' | 'SCROLL' | 'TYPE' | 'NAVIGATE' | 'SELECT' | 'DONE' | 'NOOP';
  targetNodeId?: number;
  targetId?: number;
  distance?: number;
  y?: number;
  text?: string;
  url?: string;
  explanation?: string;
}): Promise<{ success: boolean; message: string }> {
  if (DEBUG) console.log('[Stage 5 - Executing Action]:', action);

  const targetId = action.targetId !== undefined ? action.targetId : action.targetNodeId;

  try {
    switch (action.type) {
      case 'TYPE': {
        if (targetId === undefined) {
          return { success: false, message: 'Missing targetId for TYPE action' };
        }

        const el = findElementWithDriftRecovery(targetId) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) {
          return { success: false, message: `Input target [${targetId}] not found after drift recovery` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 100));

        el.focus();

        const textToType = action.text || '';

        // React / Vue controlled component prototype setter bypass
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (valueSetter) {
          valueSetter.call(el, textToType);
        } else {
          el.value = textToType;
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // Dispatch full keyboard events for SPA change detectors
        for (const char of textToType) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }

        // If search field, trigger Enter
        if (el.type === 'search' || el.name.toLowerCase().includes('search') || el.name.toLowerCase().includes('q')) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }

        return { success: true, message: `Typed "${textToType}" into [${targetId}] <${el.tagName.toLowerCase()}>` };
      }

      case 'CLICK': {
        if (targetId === undefined) {
          return { success: false, message: 'Missing targetId for CLICK action' };
        }

        const el = findElementWithDriftRecovery(targetId);
        if (!el) {
          return { success: false, message: `Target [${targetId}] not found in live DOM` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 120));

        el.focus();

        // Handle Checkbox / Radio state toggle
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          el.checked = !el.checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Full pointer/mouse event simulation
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.click();

        return { success: true, message: `Clicked element [${targetId}] <${el.tagName.toLowerCase()}>` };
      }

      case 'SCROLL': {
        const scrollDistance = action.distance !== undefined ? action.distance : action.y !== undefined ? action.y : 400;
        window.scrollBy({
          top: scrollDistance,
          left: 0,
          behavior: 'smooth',
        });
        return { success: true, message: `Scrolled viewport by ${scrollDistance}px` };
      }

      case 'NAVIGATE': {
        if (action.url) {
          window.location.href = action.url;
          return { success: true, message: `Navigating to ${action.url}` };
        }
        return { success: false, message: 'Missing URL for NAVIGATE action' };
      }

      case 'SELECT': {
        if (targetId !== undefined) {
          const el = findElementWithDriftRecovery(targetId) as HTMLSelectElement | null;
          if (el && el instanceof HTMLSelectElement) {
            if (action.text) {
              for (let i = 0; i < el.options.length; i++) {
                if (el.options[i].text.toLowerCase().includes(action.text.toLowerCase()) || el.options[i].value === action.text) {
                  el.selectedIndex = i;
                  break;
                }
              }
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, message: `Selected option in [${targetId}]` };
          }
        }
        return { success: false, message: 'Target is not a select element' };
      }

      case 'DONE': {
        return { success: true, message: 'Agent completed assigned task.' };
      }

      case 'NOOP': {
        return { success: true, message: `NOOP: ${action.explanation || 'No operation requested'}` };
      }

      default:
        return { success: false, message: `Unsupported action type: ${(action as any).type}` };
    }
  } catch (err: any) {
    return { success: false, message: `Execution error: ${err.message}` };
  }
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse: (response: any) => void) => {
  if (message.action === 'SCAN_DOM_NODES' || message.type === 'SCAN_DOM_NODES') {
    try {
      const scanResult = scanDOMPrivacyAndNodes();
      cachedNodes = scanResult.interactiveNodes;
      sendResponse({
        status: 'success',
        sensitiveBoxes: scanResult.sensitiveBoxes,
        interactiveNodes: scanResult.interactiveNodes,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
      });
    } catch (err: any) {
      sendResponse({
        status: 'error',
        error: err.message,
        sensitiveBoxes: [],
        interactiveNodes: [],
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
