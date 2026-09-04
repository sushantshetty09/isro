import {
  createBrandSeal,
  verifyBrandSeal,
  assertSanitizedScreenshot,
  ZeroTrustPrivacyViolation,
} from '../src/utils/sanitizer';
import { FramePrivacyReport } from '../src/types';

function runTests() {
  console.log('🧪 [Unit Test Suite] Running Sanitizer Runtime Guard & BrandSeal Tests...');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  function createMockReport(overrides: Partial<FramePrivacyReport> = {}): FramePrivacyReport {
    return {
      timestamp: Date.now(),
      totalMasked: 4,
      breakdown: { faces: 1, passwords: 1, cards: 1, aadhaar: 1, pan: 0, contact: 0 },
      redactionMode: 'blur',
      processingLatencyMs: 42,
      bytesLeaked: 0,
      zeroLeakVerified: true,
      rawPiiRegions: [],
      sanitizedPiiRegions: [],
      ...overrides,
    };
  }

  // Test 1: Brand seal generation and verification
  const sampleSanitizedImage = 'data:image/jpeg;base64,' + 'A'.repeat(500);
  const seal = createBrandSeal(sampleSanitizedImage);

  assert(seal.algorithm === 'ISRO-ZERO-LEAK-v1', 'Brand seal contains valid algorithm');
  assert(seal.zeroLeakVerified === true, 'Brand seal confirms zero leak');
  assert(verifyBrandSeal(seal, sampleSanitizedImage) === true, 'Brand seal verifies against matching image');

  // Test 2: Brand seal tamper-detection
  const tamperedImage = sampleSanitizedImage + 'TAMPER';
  assert(verifyBrandSeal(seal, tamperedImage) === false, 'Brand seal rejects tampered image data');

  // Test 3: Rejection of raw unsealed image
  let rawBlocked = false;
  try {
    assertSanitizedScreenshot({
      image: 'data:image/png;base64,RAW_UNREDACTED_IMAGE_DATA',
      // No brandSeal
      redaction_manifest: createMockReport(),
    });
  } catch (err: any) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      rawBlocked = true;
    }
  }
  assert(rawBlocked, 'assertSanitizedScreenshot blocks raw unsealed screenshot');

  // Test 4: Rejection of missing manifest
  let manifestBlocked = false;
  try {
    assertSanitizedScreenshot({
      image: sampleSanitizedImage,
      brandSeal: seal,
      // Missing manifest
    });
  } catch (err: any) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      manifestBlocked = true;
    }
  }
  assert(manifestBlocked, 'assertSanitizedScreenshot blocks payload with missing manifest');

  // Test 5: Rejection of non-zero leak
  let leakBlocked = false;
  try {
    assertSanitizedScreenshot({
      image: sampleSanitizedImage,
      brandSeal: seal,
      redaction_manifest: createMockReport({ bytesLeaked: 128 as any, zeroLeakVerified: false }),
    });
  } catch (err: any) {
    if (err instanceof ZeroTrustPrivacyViolation) {
      leakBlocked = true;
    }
  }
  assert(leakBlocked, 'assertSanitizedScreenshot blocks payload when bytesLeaked > 0');

  // Test 6: Acceptance of valid sanitized payload
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
  assert(validPassed, 'assertSanitizedScreenshot passes valid sanitized payload');

  console.log(`\n🎉 [Unit Test Result] All ${passed}/${total} unit tests PASSED successfully.\n`);
}

runTests();
