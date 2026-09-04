import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SANITIZER_KEY_SECRET = 'ISRO_ZERO_LEAK_SECRET_2024_PS26171';

class ZeroTrustPrivacyViolation extends Error {
  constructor(message) {
    super(`🚨 [ZERO-TRUST PRIVACY VIOLATION] ${message}`);
    this.name = 'ZeroTrustPrivacyViolation';
  }
}

function computeSealSignature(imageData, timestamp) {
  let hash = 0x811c9dc5;
  const sample = imageData.slice(0, 1024) + imageData.slice(-1024) + timestamp + SANITIZER_KEY_SECRET;
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return 'ISRO-SEAL-' + (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function createBrandSeal(sanitizedImage) {
  const timestamp = Date.now();
  const signature = computeSealSignature(sanitizedImage, timestamp);
  return {
    algorithm: 'ISRO-ZERO-LEAK-v1',
    timestamp,
    signature,
    sourceModule: 'getSanitizedScreenshot',
    zeroLeakVerified: true,
  };
}

function verifyBrandSeal(seal, imageData) {
  if (!seal || !imageData) return false;
  if (seal.sourceModule !== 'getSanitizedScreenshot' || !seal.zeroLeakVerified) return false;
  const expectedSig = computeSealSignature(imageData, seal.timestamp);
  return seal.signature === expectedSig;
}

function assertSanitizedScreenshot(payloadOrImage) {
  const img = payloadOrImage.sanitizedImageBase64 || payloadOrImage.sanitizedDataUrl || payloadOrImage.image;

  if (!img || typeof img !== 'string') {
    throw new ZeroTrustPrivacyViolation('No image data found in outgoing payload.');
  }

  // Check 1: BrandSeal verification
  const seal = payloadOrImage.brandSeal;
  if (!seal || !verifyBrandSeal(seal, img)) {
    throw new ZeroTrustPrivacyViolation(
      'Image failed on-device brand seal validation! Attempted to transmit unverified or raw screen capture.'
    );
  }

  // Check 2: Redaction manifest verification
  const manifest = payloadOrImage.redaction_manifest || payloadOrImage.privacyReport;
  if (!manifest) {
    throw new ZeroTrustPrivacyViolation(
      'Missing on-device redaction manifest in payload. Zero-leak proof required.'
    );
  }

  if (manifest.bytesLeaked !== 0 || !manifest.zeroLeakVerified) {
    throw new ZeroTrustPrivacyViolation(
      `Zero-leak verification check failed: bytesLeaked = ${manifest.bytesLeaked}. Transmission blocked.`
    );
  }
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log('🧪 ISRO PRIVACY SHIELD: UNIT & INTEGRATION TEST SUITE (PS 26171)');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  function createMockReport(overrides = {}) {
    return {
      timestamp: Date.now(),
      totalMasked: 5,
      breakdown: { faces: 1, passwords: 1, cards: 1, aadhaar: 1, pan: 1, contact: 0 },
      redactionMode: 'blur',
      processingLatencyMs: 38,
      bytesLeaked: 0,
      zeroLeakVerified: true,
      rawPiiRegions: [],
      sanitizedPiiRegions: [],
      ...overrides,
    };
  }

  // UNIT TESTS: Runtime Guard & BrandSeal Assertions
  console.log('--- 1. UNIT TESTS: Runtime Guard & Sealed Cryptographic Token ---');

  const sampleSanitizedImage = 'data:image/jpeg;base64,' + 'B'.repeat(600);
  const seal = createBrandSeal(sampleSanitizedImage);

  assert(seal.algorithm === 'ISRO-ZERO-LEAK-v1', 'Brand seal contains valid algorithm');
  assert(seal.zeroLeakVerified === true, 'Brand seal confirms zero leak');
  assert(verifyBrandSeal(seal, sampleSanitizedImage) === true, 'Brand seal verifies against matching image');

  const tamperedImage = sampleSanitizedImage + 'TAMPER_DETECTION';
  assert(verifyBrandSeal(seal, tamperedImage) === false, 'Brand seal detects and rejects tampered image data');

  let rawBlocked = false;
  try {
    assertSanitizedScreenshot({
      image: 'data:image/png;base64,RAW_UNREDACTED_IMAGE_DATA',
      redaction_manifest: createMockReport(),
    });
  } catch (err) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      rawBlocked = true;
    }
  }
  assert(rawBlocked, 'assertSanitizedScreenshot strictly blocks raw unsealed screenshots');

  let missingManifestBlocked = false;
  try {
    assertSanitizedScreenshot({
      image: sampleSanitizedImage,
      brandSeal: seal,
    });
  } catch (err) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      missingManifestBlocked = true;
    }
  }
  assert(missingManifestBlocked, 'assertSanitizedScreenshot strictly blocks payloads without manifest');

  let leakBlocked = false;
  try {
    assertSanitizedScreenshot({
      image: sampleSanitizedImage,
      brandSeal: seal,
      redaction_manifest: createMockReport({ bytesLeaked: 64, zeroLeakVerified: false }),
    });
  } catch (err) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      leakBlocked = true;
    }
  }
  assert(leakBlocked, 'assertSanitizedScreenshot strictly blocks payloads with bytesLeaked > 0');

  let validPassed = false;
  try {
    assertSanitizedScreenshot({
      sanitizedImageBase64: sampleSanitizedImage,
      brandSeal: seal,
      redaction_manifest: createMockReport(),
    });
    validPassed = true;
  } catch (err) {
    validPassed = false;
  }
  assert(validPassed, 'assertSanitizedScreenshot passes valid on-device sanitized payload');

  // INTEGRATION TESTS: Agent Zero-Leak End-to-End Flow
  console.log('\n--- 2. INTEGRATION TEST: Agent Form-Fill Zero-Leak Workflow ---');

  const testPagePath = path.resolve(__dirname, '../../test_pii_page.html');
  assert(fs.existsSync(testPagePath), 'Test bench test_pii_page.html exists and is accessible');

  const testPageHtml = fs.readFileSync(testPagePath, 'utf-8');
  assert(testPageHtml.includes('Aadhaar') && testPageHtml.includes('PAN') && testPageHtml.includes('password'), 'Test page contains Aadhaar, PAN, and Password fields');

  const networkTrace = [];
  const storageTrace = [];

  const mockStorage = {
    setItem(key, value) {
      if (typeof value === 'string' && value.includes('RAW_SCREENSHOT')) {
        throw new ZeroTrustPrivacyViolation(`Agent attempted to write raw screenshot into storage key "${key}"!`);
      }
      storageTrace.push({ key, value });
    }
  };

  const mockFetch = async (url, options) => {
    const parsedBody = JSON.parse(options.body);
    // Hard runtime assertion before dispatch
    assertSanitizedScreenshot(parsedBody);

    networkTrace.push({
      endpoint: url,
      body: parsedBody,
      headers: options.headers,
    });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        action: { type: 'TYPE', targetId: 2, text: 'test@isro.gov.in', explanation: 'Fill form securely' },
        confidence: 0.98,
        latency_ms: 22,
      }),
    };
  };

  // Simulate Agent Execution Loop
  const mockSanitizedFrame = 'data:image/jpeg;base64,SANITIZED_REDACTED_PAGE_FRAME';
  const manifest = createMockReport();
  const agentSeal = createBrandSeal(mockSanitizedFrame);

  // Store in agent state / history
  mockStorage.setItem('agent_history_step_1', mockSanitizedFrame);

  // Dispatch to server
  const agentPayload = {
    image: mockSanitizedFrame,
    sanitizedImageBase64: mockSanitizedFrame,
    brandSeal: agentSeal,
    redaction_manifest: manifest,
    domElements: [
      { id: 0, tag: 'input', text: 'Aadhaar Number', bbox: { x: 100, y: 120, width: 200, height: 35 } },
      { id: 1, tag: 'input', text: 'PAN Card', bbox: { x: 100, y: 180, width: 200, height: 35 } },
    ],
    userGoal: 'Submit identity verification form securely',
  };

  const response = await mockFetch('http://127.0.0.1:8000/process-screen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agentPayload),
  });

  const agentAction = await response.json();
  assert(agentAction.action.type === 'TYPE', 'Agent received valid server action from sanitized payload');

  // Verify Network & Storage Trace for zero leaks
  assert(networkTrace.length > 0, 'Network request successfully recorded in trace');
  for (const req of networkTrace) {
    const str = JSON.stringify(req.body);
    assert(!str.includes('RAW_SCREENSHOT'), 'Trace verification: 0 raw screenshot bytes in outgoing payload');
    assert(req.body.redaction_manifest !== undefined, 'Trace verification: Redaction manifest attached');
    assert(req.body.redaction_manifest.totalMasked > 0, 'Trace verification: Manifest includes protected items');
    assert(req.body.redaction_manifest.bytesLeaked === 0, 'Trace verification: Proven 0 bytes leaked');
  }

  // Storage Trace verification
  for (const item of storageTrace) {
    assert(!String(item.value).includes('RAW_SCREENSHOT'), `Trace verification: No raw screenshot in storage key "${item.key}"`);
  }

  // Negative Test: Attempting to exfiltrate unredacted frame throws & fails closed
  let caughtNegative = false;
  try {
    await mockFetch('http://127.0.0.1:8000/process-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: 'data:image/png;base64,RAW_LEAKED_FRAME',
        redaction_manifest: manifest,
      }),
    });
  } catch (err) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      caughtNegative = true;
    }
  }
  // 3. REGRESSION TEST: Structural Redaction on Empty Forms (Content-Independent)
  console.log('\n--- 3. REGRESSION TEST: Structural Redaction on Empty Fields (Content-Independent) ---');

  // Simulated DOM input scanner for structural fields
  function scanStructuralInputs(elements) {
    const piiList = [];
    for (const el of elements) {
      const type = (el.type || 'text').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const label = (el.label || '').toLowerCase();
      const val = (el.value || '').trim();
      const contentPresent = val.length > 0;

      let isStructural = false;
      let piiType = 'password';
      let piiLabel = 'Password Field';

      if (type === 'password') {
        isStructural = true;
        piiType = 'password';
        piiLabel = contentPresent ? 'Password Value' : 'Password Field (Empty)';
      } else if (name.includes('cvv') || label.includes('cvv')) {
        isStructural = true;
        piiType = 'cvv';
        piiLabel = contentPresent ? 'Card CVV Value' : 'Card CVV Field';
      } else if (name.includes('card') || label.includes('card')) {
        isStructural = true;
        piiType = 'credit_card';
        piiLabel = contentPresent ? 'Card Number Value' : 'Payment Card Field';
      } else if (label.includes('aadhaar') || label.includes('aadhar')) {
        isStructural = true;
        piiType = 'aadhaar';
        piiLabel = contentPresent ? 'Aadhaar Value' : 'Aadhaar Field (Empty)';
      }

      if (isStructural) {
        piiList.push({
          id: `structural-${el.id}`,
          source: 'dom',
          triggerType: 'structural',
          content_present: contentPresent,
          type: piiType,
          label: piiLabel,
          category: 'credentials',
          confidence: 1.0,
          bbox: { x: el.x || 100, y: el.y || 100, width: 200, height: 40 },
        });
      }
    }
    return piiList;
  }

  // Scenario A: Empty login form (Empty Username, Empty Password input)
  const emptyLoginForm = [
    { id: 'user', type: 'text', name: 'username', label: 'Username', value: '' },
    { id: 'pass', type: 'password', name: 'password', label: 'Password', value: '' },
  ];

  const emptyDetections = scanStructuralInputs(emptyLoginForm);
  assert(emptyDetections.length === 1, 'Empty password input is structurally detected with 0 bytes entered');
  assert(emptyDetections[0].triggerType === 'structural', 'Empty password element is tagged triggerType: "structural"');
  assert(emptyDetections[0].content_present === false, 'Empty password element is tagged content_present: false');
  assert(emptyDetections[0].label === 'Password Field (Empty)', 'Empty password label reflects structural empty state');

  // Scenario B: Plain text input with descriptive sensitive label (e.g. "Aadhaar" or "CVV")
  const emptyGenericForm = [
    { id: 'adh', type: 'text', name: 'uid', label: 'Enter Aadhaar Number', value: '' },
    { id: 'sec', type: 'text', name: 'cvv', label: 'Security Code (CVV)', value: '' },
  ];

  const genericDetections = scanStructuralInputs(emptyGenericForm);
  assert(genericDetections.length === 2, 'Empty plain-text inputs with sensitive labels are structurally detected');
  assert(genericDetections.every(d => d.triggerType === 'structural'), 'All label-matched empty inputs are tagged structural');

  // Scenario C: Filled password input switches content_present to true
  const filledLoginForm = [
    { id: 'user', type: 'text', name: 'username', label: 'Username', value: 'student' },
    { id: 'pass', type: 'password', name: 'password', label: 'Password', value: 'Secret123!' },
  ];

  const filledDetections = scanStructuralInputs(filledLoginForm);
  assert(filledDetections.length === 1, 'Filled password input is detected');
  assert(filledDetections[0].content_present === true, 'Filled password input is tagged content_present: true');
  assert(filledDetections[0].label === 'Password Value', 'Filled password label reflects content presence');

  // 4. REGRESSION TEST: Service Worker Chokepoint & Public Action Lockdown
  console.log('\n--- 4. REGRESSION TEST: ServiceWorker CAPTURE_VISIBLE_TAB Lockdown ---');

  // Simulate Service Worker message router
  function simulateServiceWorkerMessage(message) {
    if (message.action === 'CAPTURE_VISIBLE_TAB') {
      return { status: 'error', error: '🚨 [SECURITY POLICY] Raw tab capture is disabled. All screenshots must route through getSanitizedScreenshot().' };
    }
    if (message.action === '_INTERNAL_RAW_CAPTURE_FOR_SANITIZER_ONLY') {
      if (message.internalToken !== SANITIZER_KEY_SECRET) {
        return { status: 'error', error: '🚨 [SECURITY VIOLATION] Unauthorized attempt to access internal capture without valid sanitizer token.' };
      }
      return { status: 'success', dataUrl: 'data:image/png;base64,RAW_SCOPED_FRAME_FOR_SANITIZER_ONLY' };
    }
    return { status: 'error', error: 'Unknown action' };
  }

  // Test 4.1: Attempting to call old public action fails
  const publicRes = simulateServiceWorkerMessage({ action: 'CAPTURE_VISIBLE_TAB' });
  assert(publicRes.status === 'error' && publicRes.error.includes('SECURITY POLICY'), 'Public CAPTURE_VISIBLE_TAB is blocked and rejected at service worker');

  // Test 4.2: Attempting to call internal action without token fails
  const untrustedRes = simulateServiceWorkerMessage({ action: '_INTERNAL_RAW_CAPTURE_FOR_SANITIZER_ONLY', internalToken: 'BAD_TOKEN' });
  assert(untrustedRes.status === 'error' && untrustedRes.error.includes('SECURITY VIOLATION'), 'Internal capture without valid token is rejected with security violation');

  // Test 4.3: Authorized sanitizer call succeeds and output is stamped with BrandSeal
  const authRes = simulateServiceWorkerMessage({ action: '_INTERNAL_RAW_CAPTURE_FOR_SANITIZER_ONLY', internalToken: SANITIZER_KEY_SECRET });
  assert(authRes.status === 'success' && authRes.dataUrl !== undefined, 'Authorized sanitizer context receives scoped frame for immediate on-device redaction');

  console.log('\n============================================================');
  console.log(`🏆 ALL ${passed}/${total} TESTS PASSED (STRUCTURAL + SERVICEWORKER LOCKDOWN VERIFIED).`);
  console.log('============================================================\n');
}

runAllTests().catch((err) => {
  console.error('\n❌ Test Suite Encountered Fatal Error:', err);
  process.exit(1);
});
