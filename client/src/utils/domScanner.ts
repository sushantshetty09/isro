import { BoundingBox, PIIElement, InteractiveNode, DOMScanResult, PIIType } from '../types';

export type { BoundingBox };

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
 * Validates credit/debit card numbers using the Luhn Algorithm (Mod 10)
 */
export function validateLuhn(numStr: string): boolean {
  const sanitized = numStr.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(sanitized)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * India-Specific & Universal PII Regular Expression Patterns
 */
export const PII_PATTERNS = [
  {
    type: 'aadhaar' as PIIType,
    category: 'government_id' as const,
    label: 'Aadhaar (12-Digit UIDAI)',
    regex: /\b[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}\b|\b[2-9]\d{11}\b/g,
    confidence: 0.96,
  },
  {
    type: 'pan' as PIIType,
    category: 'government_id' as const,
    label: 'PAN Card (Tax ID)',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    confidence: 0.98,
  },
  {
    type: 'credit_card' as PIIType,
    category: 'financial' as const,
    label: 'Payment Card',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{2})[0-9]{12}|3[47][0-9]{13}|(?:508[5-9]|652[1-2]|606[1-9]|607[0-9]|608[0-5])[0-9]{12})\b|\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
    validate: validateLuhn,
    confidence: 0.99,
  },
  {
    type: 'phone' as PIIType,
    category: 'contact' as const,
    label: 'Indian Phone (+91)',
    regex: /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|(?:\+91[\s-]?)?[6-9]\d{9}\b/g,
    confidence: 0.92,
  },
  {
    type: 'email' as PIIType,
    category: 'contact' as const,
    label: 'Email Address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g,
    confidence: 0.97,
  },
];

const SENSITIVE_LABEL_KEYWORDS = [
  { keyword: 'password', type: 'password' as PIIType, label: 'Password Field', category: 'credentials' as const },
  { keyword: 'passcode', type: 'password' as PIIType, label: 'Passcode Field', category: 'credentials' as const },
  { keyword: 'pass', type: 'password' as PIIType, label: 'Password Field', category: 'credentials' as const },
  { keyword: 'pwd', type: 'password' as PIIType, label: 'Password Field', category: 'credentials' as const },
  { keyword: 'pin', type: 'password' as PIIType, label: 'PIN Field', category: 'credentials' as const },
  { keyword: 'secret', type: 'password' as PIIType, label: 'Secret Field', category: 'credentials' as const },
  { keyword: 'otp', type: 'password' as PIIType, label: 'OTP Code Field', category: 'credentials' as const },
  { keyword: 'aadhaar', type: 'aadhaar' as PIIType, label: 'Aadhaar Field', category: 'government_id' as const },
  { keyword: 'aadhar', type: 'aadhaar' as PIIType, label: 'Aadhaar Field', category: 'government_id' as const },
  { keyword: 'uidai', type: 'aadhaar' as PIIType, label: 'Aadhaar Field', category: 'government_id' as const },
  { keyword: 'pan', type: 'pan' as PIIType, label: 'PAN Card Field', category: 'government_id' as const },
  { keyword: 'card number', type: 'credit_card' as PIIType, label: 'Payment Card Field', category: 'financial' as const },
  { keyword: 'credit card', type: 'credit_card' as PIIType, label: 'Payment Card Field', category: 'financial' as const },
  { keyword: 'debit card', type: 'credit_card' as PIIType, label: 'Payment Card Field', category: 'financial' as const },
  { keyword: 'cvv', type: 'cvv' as PIIType, label: 'Card CVV Field', category: 'financial' as const },
  { keyword: 'cvc', type: 'cvv' as PIIType, label: 'Card CVC Field', category: 'financial' as const },
  { keyword: 'ssn', type: 'personal_id' as PIIType, label: 'SSN Field', category: 'government_id' as const },
];

const INTERACTIVE_SELECTORS = [
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

function isVisible(el: HTMLElement, rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    style.clipPath === 'circle(0px)'
  ) {
    return false;
  }
  return true;
}

/**
 * Viewport-relative padded bounding box
 */
function padBoundingBox(rect: DOMRect, padPx: number = 4): BoundingBox {
  const left = Math.max(0, rect.left - padPx);
  const top = Math.max(0, rect.top - padPx);
  const width = rect.width + padPx * 2;
  const height = rect.height + padPx * 2;
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Find associated label text for an input element
 */
function getAssociatedLabelText(el: HTMLElement): string {
  let labelText = '';

  // 1. Check label[for="id"]
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) labelText += ' ' + (label as HTMLElement).innerText;
  }

  // 2. Check closest parent label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    labelText += ' ' + parentLabel.innerText;
  }

  // 3. Check aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelledEl = document.getElementById(labelledBy);
    if (labelledEl) labelText += ' ' + labelledEl.innerText;
  }

  // 4. Check preceding sibling element (common in table / grid forms)
  const prev = el.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'P')) {
    labelText += ' ' + (prev as HTMLElement).innerText;
  }

  // 5. Check parent's preceding sibling (common in 2-column row layouts)
  const parentPrev = el.parentElement?.previousElementSibling;
  if (parentPrev) {
    labelText += ' ' + (parentPrev as HTMLElement).innerText;
  }

  return labelText.toLowerCase().trim();
}

function extractElementText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const inputType = el instanceof HTMLInputElement ? el.type : 'textarea';
    const placeholder = el.placeholder || '';
    const name = el.name || '';
    const id = el.id || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const labelText = getAssociatedLabelText(el);

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
 * Pure In-DOM Privacy & Interactive Node Scanner
 * Implements TWO independent triggers:
 * 1. Structural Redaction (Content-Independent): Fires on page load even on empty inputs
 * 2. Content-Based Redaction: Regex / Text pattern matching on typed content
 */
export function scanDOM(): DOMScanResult {
  const piiElements: PIIElement[] = [];
  const interactiveNodes: InteractiveNode[] = [];
  const seenPiiBoxes = new Set<string>();

  // =========================================================================
  // TRIGGER 1 & 2: Form Inputs & Textareas (Structural + Content-Based)
  // =========================================================================
  const allInputs = document.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable="true"]');
  allInputs.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) return;

    let isSensitive = false;
    let triggerType: 'structural' | 'content' = 'structural';
    let sensitiveType: PIIType = 'custom_sensitive';
    let sensitiveLabel = 'Sensitive Input';
    let category: PIIElement['category'] = 'credentials';
    let confidence = 0.95;
    let contentPresent = false;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const type = (el instanceof HTMLInputElement ? el.type : 'textarea').toLowerCase();
      const name = (el.getAttribute('name') || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const dataPii = el.getAttribute('data-pii') || el.getAttribute('data-sensitive');
      const val = (el.value || el.defaultValue || '');
      contentPresent = val.trim().length > 0;

      const associatedLabel = getAssociatedLabelText(el);

      // --- TRIGGER 1: STRUCTURAL REDACTION (Content-Independent) ---
      // Rule 1.1: input[type="password"]
      if (type === 'password') {
        isSensitive = true;
        triggerType = 'structural';
        sensitiveType = 'password';
        sensitiveLabel = contentPresent ? 'Password Value' : 'Password Field (Empty)';
        category = 'credentials';
        confidence = 1.0;
      }
      // Rule 1.2: Explicit data-pii attribute
      else if (dataPii === 'true') {
        isSensitive = true;
        triggerType = 'structural';
        sensitiveType = 'custom_sensitive';
        sensitiveLabel = contentPresent ? 'Protected Field Value' : 'Protected Sensitive Field';
        category = 'general';
        confidence = 1.0;
      }
      // Rule 1.3: Sensitive name, id, autocomplete, or placeholder keywords
      else if (
        name.includes('cvv') || id.includes('cvv') || autocomplete.includes('cc-csc') ||
        name.includes('card') || id.includes('card') || autocomplete.includes('cc-') ||
        name.includes('pass') || id.includes('pass') || name.includes('pwd') || id.includes('pwd') ||
        name.includes('aadhaar') || name.includes('aadhar') || id.includes('aadhaar') || id.includes('aadhar') || id.includes('uidai') ||
        name.includes('pan') || id.includes('pan') ||
        name.includes('ssn') || id.includes('ssn')
      ) {
        isSensitive = true;
        triggerType = 'structural';

        if (name.includes('cvv') || id.includes('cvv') || autocomplete.includes('cc-csc')) {
          sensitiveType = 'cvv';
          sensitiveLabel = contentPresent ? 'Card CVV Value' : 'Card CVV Field';
          category = 'financial';
          confidence = 0.99;
        } else if (name.includes('card') || id.includes('card') || autocomplete.includes('cc-')) {
          sensitiveType = 'credit_card';
          sensitiveLabel = contentPresent ? 'Card Number Value' : 'Payment Card Field';
          category = 'financial';
          confidence = 0.98;
        } else if (name.includes('aadhaar') || name.includes('aadhar') || id.includes('aadhaar') || id.includes('aadhar') || id.includes('uidai')) {
          sensitiveType = 'aadhaar';
          sensitiveLabel = contentPresent ? 'Aadhaar Value' : 'Aadhaar Field';
          category = 'government_id';
          confidence = 0.97;
        } else if (name.includes('pan') || id.includes('pan')) {
          sensitiveType = 'pan';
          sensitiveLabel = contentPresent ? 'PAN Value' : 'PAN Card Field';
          category = 'government_id';
          confidence = 0.97;
        } else {
          sensitiveType = 'password';
          sensitiveLabel = contentPresent ? 'Password Value' : 'Password Field';
          category = 'credentials';
          confidence = 0.99;
        }
      }
      // Rule 1.4: Associated Label Keyword Matching (e.g. plain text input with label "Password" or "Aadhaar Number")
      else if (associatedLabel || placeholder || ariaLabel) {
        const fullLabelContext = `${associatedLabel} ${placeholder} ${ariaLabel}`;
        for (const item of SENSITIVE_LABEL_KEYWORDS) {
          if (fullLabelContext.includes(item.keyword)) {
            isSensitive = true;
            triggerType = 'structural';
            sensitiveType = item.type;
            sensitiveLabel = contentPresent ? `${item.label.replace('Field', 'Value')}` : `${item.label} (Empty)`;
            category = item.category;
            confidence = 0.96;
            break;
          }
        }
      }

      // --- TRIGGER 2: CONTENT-BASED REDACTION (Regex on typed text) ---
      if (!isSensitive && val) {
        for (const pattern of PII_PATTERNS) {
          pattern.regex.lastIndex = 0;
          if (pattern.regex.test(val)) {
            if (!pattern.validate || pattern.validate(val)) {
              isSensitive = true;
              triggerType = 'content';
              sensitiveType = pattern.type;
              sensitiveLabel = pattern.label;
              category = pattern.category;
              confidence = pattern.confidence;
              contentPresent = true;
              break;
            }
          }
        }
      }
    }

    if (isSensitive) {
      const bbox = padBoundingBox(rect, 4);
      const boxKey = `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`;
      if (!seenPiiBoxes.has(boxKey)) {
        seenPiiBoxes.add(boxKey);
        piiElements.push({
          id: `dom-pii-input-${index}`,
          source: 'dom',
          triggerType,
          content_present: contentPresent,
          type: sensitiveType,
          label: sensitiveLabel,
          category,
          confidence,
          bbox,
          selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`,
        });
      }
    }
  });

  // =========================================================================
  // TRIGGER 2: Rendered Text Nodes (Content-Based Regex Detection)
  // =========================================================================
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = walker.nextNode() as Text | null;

    while (textNode) {
      const text = textNode.nodeValue || '';
      if (text.trim().length > 3 && textNode.parentElement) {
        const parent = textNode.parentElement;
        if (parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE' && parent.tagName !== 'NOSCRIPT') {
          for (const pattern of PII_PATTERNS) {
            pattern.regex.lastIndex = 0;
            const match = pattern.regex.exec(text);
            if (match) {
              const matchedStr = match[0];
              if (!pattern.validate || pattern.validate(matchedStr)) {
                const range = document.createRange();
                try {
                  range.setStart(textNode, match.index);
                  range.setEnd(textNode, match.index + matchedStr.length);
                  const rangeRect = range.getBoundingClientRect();

                  if (isVisible(parent, rangeRect)) {
                    const bbox = padBoundingBox(rangeRect, 4);
                    const boxKey = `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`;
                    if (!seenPiiBoxes.has(boxKey)) {
                      seenPiiBoxes.add(boxKey);
                      piiElements.push({
                        id: `dom-pii-text-${piiElements.length}`,
                        source: 'dom',
                        triggerType: 'content',
                        content_present: true,
                        type: pattern.type,
                        label: pattern.label,
                        category: pattern.category,
                        confidence: pattern.confidence,
                        bbox,
                        matchedPattern: matchedStr.slice(0, 4) + '****' + matchedStr.slice(-2),
                      });
                    }
                  }
                } catch {
                  // Ignore range errors
                }
              }
            }
          }
        }
      }
      textNode = walker.nextNode() as Text | null;
    }
  } catch (e) {
    console.warn('[DOM Scanner] Text walker error:', e);
  }

  // =========================================================================
  // TRIGGER 1 & 2: Avatar / Face Elements in DOM
  // =========================================================================
  try {
    const avatarSelectors = [
      '.avatar', '.face-avatar', '.user-avatar', '.profile-avatar', '.user-pic', '.profile-pic', '.user-img', '.profile-img', '.headshot',
      '[class*="avatar" i]', '[class*="profile" i]', '[class*="headshot" i]', '[class*="user-photo" i]', '[class*="author" i] img', '[class*="member" i] img', '[class*="team" i] img',
      '[id*="avatar" i]', '[id*="profile" i]', '[id*="headshot" i]',
      'img[alt*="avatar" i]', 'img[alt*="profile" i]', 'img[alt*="face" i]', 'img[alt*="user" i]', 'img[alt*="photo" i]', 'img[alt*="person" i]', 'img[alt*="headshot" i]',
      'img[src*="avatar" i]', 'img[src*="profile" i]', 'img[src*="user" i]', 'img[src*="gravatar" i]', 'img[src*="headshot" i]',
      'svg[class*="avatar" i]', 'svg[class*="profile" i]', 'svg[class*="user" i]',
    ].join(', ');

    const candidateElements = Array.from(
      document.querySelectorAll<HTMLElement>(`img, svg, picture, .face-avatar, [class*="avatar" i], [class*="profile" i], [id*="avatar" i]`)
    );

    candidateElements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect) || rect.width < 18 || rect.height < 18 || rect.width > 600 || rect.height > 600) return;

      const style = window.getComputedStyle(el);
      const isCircular = style.borderRadius === '50%' || style.borderRadius.includes('9999px') || parseInt(style.borderRadius || '0', 10) >= rect.width / 2.5;
      const isMatchedSelector = el.matches(avatarSelectors);

      if (isMatchedSelector || isCircular) {
        const bbox = padBoundingBox(rect, 4);
        const boxKey = `${bbox.x},${bbox.y},${bbox.width},${bbox.height}`;
        if (!seenPiiBoxes.has(boxKey)) {
          seenPiiBoxes.add(boxKey);
          piiElements.push({
            id: `dom-face-avatar-${index}`,
            source: 'dom',
            triggerType: 'structural',
            content_present: true,
            type: 'face_avatar',
            label: 'Face / Profile Avatar',
            category: 'biometric',
            confidence: 0.95,
            bbox,
            selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`,
          });
        }
      }
    });
  } catch (e) {
    console.warn('[DOM Scanner] Avatar scan error:', e);
  }

  // =========================================================================
  // Safe Interactive Action Nodes for Set-of-Marks
  // =========================================================================
  const seenElements = new Set<HTMLElement>();
  let currentId = 0;

  try {
    const elements = document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTORS.join(', '));
    elements.forEach((el) => {
      if (seenElements.has(el)) return;
      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect)) return;

      // Do NOT attach clickable action tags to sensitive password / credential inputs
      const isSensitiveInput = (el instanceof HTMLInputElement && el.type === 'password') ||
                               el.getAttribute('data-pii') === 'true';
      if (isSensitiveInput) return;

      seenElements.add(el);
      interactiveNodes.push({
        id: currentId++,
        tagName: el.tagName.toLowerCase(),
        type: el instanceof HTMLInputElement ? el.type : undefined,
        text: extractElementText(el),
        bbox: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        isClickable: true,
        isInput: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement,
        selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`,
      });
    });
  } catch (e) {
    console.warn('[DOM Scanner] Interactive element scan error:', e);
  }

  return {
    piiElements,
    interactiveNodes,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };
}

export function scanDOMPrivacyAndNodes(): ScanResult {
  const result = scanDOM();
  return {
    sensitiveBoxes: result.piiElements.map(p => p.bbox),
    interactiveNodes: result.interactiveNodes.map(n => ({
      id: n.id,
      tag: n.tagName,
      text: n.text,
      bbox: n.bbox,
    })),
  };
}
