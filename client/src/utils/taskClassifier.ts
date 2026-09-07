/**
 * Task Complexity Classifier & Prompt Decomposition Utility
 * ISRO Privacy-Preserving Browser Agent (SIH PS 26171)
 *
 * Distinguishes Low-Level (WebGPU/WASM local) from High-Level (Server VLM) tasks.
 */

export type TaskComplexity = 'low' | 'high';
export type EngineChoice = 'webgpu' | 'server';

export interface AtomicTaskStep {
  type: 'TYPE' | 'CLICK' | 'SCROLL' | 'NAVIGATE' | 'DONE';
  hint: string;
  value?: string;
  distance?: number;
  url?: string;
  description: string;
}

export interface TaskClassificationResult {
  complexity: TaskComplexity;
  suggestedEngine: EngineChoice;
  reason: string;
  confidenceScore: number;
  steps: AtomicTaskStep[];
}

// Keywords indicating visual spatial reasoning, color matching, or multi-column comparison
const VISUAL_REASONING_KEYWORDS = [
  'image',
  'picture',
  'photo',
  'logo',
  'avatar',
  'chart',
  'graph',
  'diagram',
  'visual',
  'color',
  'blue',
  'red',
  'green',
  'yellow',
  'icon',
  'banner',
  'compare',
  'cheapest',
  'best rating',
  'pricing table',
  'layout',
  'below the',
  'above the',
  'next to the',
];

/**
 * Parses compound multi-step instructions into discrete atomic steps.
 * e.g., "Enter username as tomsmith, enter password as SuperSecretPassword! and click submit"
 */
export function decomposePromptIntoSteps(prompt: string): AtomicTaskStep[] {
  const steps: AtomicTaskStep[] = [];
  if (!prompt || !prompt.trim()) return steps;

  // Split on logical conjunctions
  const clauses = prompt.split(/\s*(?:,\s*and\s*|;\s*|\sand\sthen\s|\sthen\s|\sand\s|\.\s+)\s*/i);

  for (const clause of clauses) {
    const c = clause.trim();
    if (!c) continue;

    // Pattern 1: Navigation -> "Go to https://..." or "Navigate to..."
    const mNav = c.match(/^(?:go\s+to|navigate\s+to|open)\s+(https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
    if (mNav) {
      let targetUrl = mNav[1];
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      steps.push({
        type: 'NAVIGATE',
        hint: targetUrl,
        url: targetUrl,
        description: `Navigate to ${targetUrl}`,
      });
      continue;
    }

    // Pattern 2: Scroll -> "Scroll down by 400px" or "Scroll down"
    const mScroll = c.match(/^scroll\s+(down|up)(?:\s+by\s+(\d+)(?:px)?)?/i);
    if (mScroll) {
      const dir = mScroll[1].toLowerCase();
      const dist = parseInt(mScroll[2] || '400', 10);
      steps.push({
        type: 'SCROLL',
        hint: dir,
        distance: dir === 'up' ? -dist : dist,
        description: `Scroll ${dir} by ${dist}px`,
      });
      continue;
    }

    // Pattern 3: Type/Enter -> "Enter username as tomsmith" or "type 'test' into search"
    const mType1 = c.match(/^(?:type|enter|input|write|fill)\s+(?:["']?(.+?)["']?\s+(?:as|with|value)\s+["']?(.+?)["']?)$/i);
    const mType2 = c.match(/^(?:type|enter|input|write|fill)\s+["']?(.+?)["']?\s+(?:in|into|on)\s+(?:the\s+)?["']?(.+?)["']?$/i);

    if (mType1) {
      const field = mType1[1].trim();
      const val = mType1[2].trim().replace(/^["']|["']$/g, '');
      steps.push({
        type: 'TYPE',
        hint: field,
        value: val,
        description: `Type "${val}" into ${field}`,
      });
      continue;
    } else if (mType2) {
      const val = mType2[1].trim().replace(/^["']|["']$/g, '');
      const field = mType2[2].trim();
      steps.push({
        type: 'TYPE',
        hint: field,
        value: val,
        description: `Type "${val}" into ${field}`,
      });
      continue;
    }

    // Pattern 4: Click -> "Click on submit", "Press login", "Hit search"
    const mClick = c.match(/^(?:click|press|tap|hit|check|tick|select|choose)\s+(?:on\s+)?(?:the\s+)?["']?(.+?)["']?$/i);
    if (mClick) {
      const target = mClick[1].trim().replace(/[.,;]$/, '');
      steps.push({
        type: 'CLICK',
        hint: target,
        description: `Click on "${target}"`,
      });
      continue;
    }

    // Standalone action verbs: "submit", "login", "register"
    const cLower = c.toLowerCase();
    if (['submit', 'login', 'log in', 'signin', 'sign in', 'register', 'signup', 'continue', 'next', 'search', 'confirm', 'apply'].includes(cLower)) {
      steps.push({
        type: 'CLICK',
        hint: c,
        description: `Click "${c}"`,
      });
      continue;
    }

    // Default fallback: Treat as target click
    steps.push({
      type: 'CLICK',
      hint: c,
      description: `Interact with "${c}"`,
    });
  }

  return steps;
}

/**
 * Classifies whether a task can be handled locally by WebGPU/WASM or requires Server VLM reasoning.
 */
export function classifyTaskComplexity(userGoal: string): TaskClassificationResult {
  const goalClean = (userGoal || '').trim().toLowerCase();

  // Check 1: Empty or trivial goal
  if (!goalClean) {
    return {
      complexity: 'low',
      suggestedEngine: 'webgpu',
      reason: 'Empty prompt; default to local idle.',
      confidenceScore: 1.0,
      steps: [],
    };
  }

  // Check 2: Visual perception or spatial reasoning keywords
  for (const keyword of VISUAL_REASONING_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(goalClean)) {
      return {
        complexity: 'high',
        suggestedEngine: 'server',
        reason: `Requires visual/spatial reasoning (detected "${keyword}"). Escalate to Server VLM.`,
        confidenceScore: 0.95,
        steps: decomposePromptIntoSteps(userGoal),
      };
    }
  }

  // Decompose into discrete steps
  const steps = decomposePromptIntoSteps(userGoal);

  // Check 3: Standard form fills, clicks, searches, scrolls -> 100% Low-Level WebGPU
  return {
    complexity: 'low',
    suggestedEngine: 'webgpu',
    reason: `Low-level deterministic action sequence (${steps.length} step(s)). Suitable for 100% On-Device WebGPU.`,
    confidenceScore: 0.92,
    steps,
  };
}
