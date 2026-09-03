export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NonSensitiveDOMNode {
  id: number;
  tag: string;
  text: string;
  bbox: BoundingBox;
}

export interface ScanResult {
  sensitiveBoxes: BoundingBox[];
  interactiveNodes: NonSensitiveDOMNode[];
}

/**
 * CSS selectors targeting sensitive PII input fields for visual redaction
 */
const SENSITIVE_SELECTORS: string[] = [
  'input[type="password"]',
  'input[name*="pass" i]',
  'input[name*="card" i]',
  'input[name*="ssn" i]',
  'input[name*="aadhar" i]',
  'input[name*="cvv" i]',
  'input[autocomplete*="cc-" i]',
];

/**
 * Comprehensive interactive elements covering all modern web apps (React, Vue, Angular, Web Components)
 */
const INTERACTIVE_SELECTORS: string[] = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
];

/**
 * Check whether an HTML element is rendered and visible on screen
 */
function isVisible(el: HTMLElement, rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  return true;
}

/**
 * Extract rich semantic text/label metadata from an element
 */
function extractElementText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const inputType = el instanceof HTMLInputElement ? el.type : 'textarea';
    const placeholder = el.placeholder || '';
    const name = el.name || '';
    const id = el.id || '';
    const ariaLabel = el.getAttribute('aria-label') || '';

    // Find linked label
    let labelText = '';
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) labelText = (label as HTMLElement).innerText.trim();
    }

    const parts = [
      labelText,
      placeholder,
      ariaLabel,
      name,
      inputType === 'password' ? 'secure-password' : '',
    ].filter(Boolean);

    return parts.join(' | ').slice(0, 60) || `${el.tagName.toLowerCase()}[${inputType}]`;
  }

  if (el instanceof HTMLSelectElement) {
    const selected = el.options[el.selectedIndex]?.text || '';
    const ariaLabel = el.getAttribute('aria-label') || el.name || '';
    return `select: ${selected || ariaLabel}`.slice(0, 60);
  }

  const text = el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '';
  return text.trim().replace(/\s+/g, ' ').slice(0, 60);
}

/**
 * Compute page-adjusted bounding box coordinates
 */
function computeBoundingBox(rect: DOMRect): BoundingBox {
  return {
    x: Math.round(rect.left + window.scrollX),
    y: Math.round(rect.top + window.scrollY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/**
 * Scan DOM for sensitive PII bounding boxes (for Canvas blackouts)
 * and index all actionable DOM elements for agent execution
 */
export function scanDOMPrivacyAndNodes(): ScanResult {
  const sensitiveBoxes: BoundingBox[] = [];

  // 1. Identify all sensitive PII fields for visual canvas masking
  for (const selector of SENSITIVE_SELECTORS) {
    try {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (isVisible(el, rect)) {
          sensitiveBoxes.push(computeBoundingBox(rect));
        }
      });
    } catch {
      // Ignore selector errors
    }
  }

  // 2. Scan and index ALL interactive elements across the webpage
  const interactiveNodes: NonSensitiveDOMNode[] = [];
  const seenElements = new Set<HTMLElement>();
  let currentId = 0;

  try {
    const elements = document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTORS.join(', '));
    elements.forEach((el) => {
      if (seenElements.has(el)) return;

      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect)) return;

      seenElements.add(el);

      interactiveNodes.push({
        id: currentId++,
        tag: el.tagName.toLowerCase(),
        text: extractElementText(el),
        bbox: computeBoundingBox(rect),
      });
    });
  } catch {
    // Ignore query errors
  }

  return {
    sensitiveBoxes,
    interactiveNodes,
  };
}

/**
 * Helper compatibility export
 */
export function scanDOM() {
  const result = scanDOMPrivacyAndNodes();
  return {
    piiElements: result.sensitiveBoxes.map((box, idx) => ({
      id: `dom-pii-${idx}`,
      source: 'dom' as const,
      type: 'password' as const,
      label: 'Sensitive Input Field',
      bbox: {
        x: Math.max(0, box.x - window.scrollX),
        y: Math.max(0, box.y - window.scrollY),
        width: box.width,
        height: box.height,
      },
    })),
    interactiveNodes: result.interactiveNodes.map((node) => ({
      id: node.id,
      tagName: node.tag,
      text: node.text,
      isClickable: true,
      isInput: node.tag === 'input' || node.tag === 'textarea',
      selector: `${node.tag}:nth-of-type(${node.id + 1})`,
      bbox: {
        x: Math.max(0, node.bbox.x - window.scrollX),
        y: Math.max(0, node.bbox.y - window.scrollY),
        width: node.bbox.width,
        height: node.bbox.height,
      },
    })),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };
}
