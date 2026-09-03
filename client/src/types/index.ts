export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PIIType = 
  | 'password' 
  | 'credit_card' 
  | 'ssn' 
  | 'aadhar' 
  | 'cvv' 
  | 'pin' 
  | 'email' 
  | 'phone' 
  | 'face_avatar' 
  | 'personal_id'
  | 'custom_sensitive';

export interface PIIElement {
  id: string;
  source: 'dom' | 'visual';
  type: PIIType;
  label: string;
  confidence?: number;
  bbox: BoundingBox;
  selector?: string;
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

export interface VisualDetection {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

export interface SanitizedPayload {
  timestamp: number;
  url: string;
  title: string;
  sanitizedImageBase64: string;
  domMap: InteractiveNode[];
  maskedPIICount: number;
  piiDetails: PIIElement[];
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
  thought?: string;
  status: 'SUCCESS' | 'CONTINUE' | 'FAILED' | 'COMPLETED';
}

export interface ExtensionMessage {
  type: 
    | 'TRIGGER_CAPTURE_AND_SANITIZE'
    | 'DOM_SCAN_REQUEST'
    | 'DOM_SCAN_RESPONSE'
    | 'OFFSCREEN_DETECT_VISUAL_PII'
    | 'OFFSCREEN_DETECT_RESPONSE'
    | 'EXECUTE_ACTION'
    | 'ACTION_EXECUTION_RESULT'
    | 'GET_STATUS'
    | 'STATUS_RESPONSE';
  payload?: any;
}
