export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RedactionStyle = 'blur' | 'pixelate' | 'blackout';

export type PIIType = 
  | 'password' 
  | 'credit_card' 
  | 'aadhaar' 
  | 'pan' 
  | 'phone' 
  | 'email' 
  | 'cvv' 
  | 'face_avatar' 
  | 'personal_id'
  | 'custom_sensitive';

export interface PIIElement {
  id: string;
  source: 'dom' | 'visual';
  triggerType?: 'structural' | 'content';
  content_present?: boolean;
  type: PIIType;
  label: string;
  category: 'government_id' | 'financial' | 'credentials' | 'contact' | 'biometric' | 'general';
  confidence: number;
  bbox: BoundingBox;
  selector?: string;
  matchedPattern?: string;
}

export interface InteractiveNode {
  id: number;
  tagName: string;
  type?: string;
  role?: string;
  text: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  bbox: BoundingBox;
  isClickable: boolean;
  isInput: boolean;
  selector: string;
}

export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
}

export interface DOMScanResult {
  piiElements: PIIElement[];
  interactiveNodes: InteractiveNode[];
  viewport: ViewportInfo;
}

export interface CategoryBreakdown {
  faces: number;
  passwords: number;
  cards: number;
  aadhaar: number;
  pan: number;
  contact: number;
}

export interface FramePrivacyReport {
  timestamp: number;
  totalMasked: number;
  breakdown: CategoryBreakdown;
  redactionMode: RedactionStyle;
  processingLatencyMs: number;
  bytesLeaked: 0;
  zeroLeakVerified: boolean;
  rawPiiRegions: BoundingBox[];
  sanitizedPiiRegions: BoundingBox[];
}

export interface SanitizedPayload {
  timestamp: number;
  url: string;
  title: string;
  sanitizedImageBase64: string;
  domMap: InteractiveNode[];
  maskedPIICount: number;
  piiDetails: PIIElement[];
  redactionMode: RedactionStyle;
  privacyReport: FramePrivacyReport;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}

export type ActionType = 'CLICK' | 'SCROLL' | 'TYPE' | 'HOVER' | 'NAVIGATE' | 'KEY_PRESS' | 'DONE';

export interface AgentAction {
  type: ActionType;
  targetNodeId?: number;
  text?: string;
  direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  distance?: number;
  url?: string;
  key?: string;
  explanation?: string;
}

export interface AgentResponse {
  action: AgentAction;
  confidence: number;
  latency_ms: number;
  redaction_acknowledged: boolean;
}

export interface BrandSeal {
  algorithm: 'HMAC-SHA256' | 'ISRO-ZERO-LEAK-v1';
  timestamp: number;
  signature: string;
  sourceModule: 'getSanitizedScreenshot';
  zeroLeakVerified: true;
}

export interface SanitizedScreenshotResult {
  sanitizedDataUrl: string;
  sanitizedImageBase64: string;
  rawPreviewDataUrl?: string;
  redaction_manifest: FramePrivacyReport;
  piiElements: PIIElement[];
  interactiveNodes: InteractiveNode[];
  viewport: { width: number; height: number };
  processingTimeMs: number;
  brandSeal: BrandSeal;
}

