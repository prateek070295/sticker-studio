const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const DIAG_DIR = path.resolve('docs/diagnosis_photo_cutout');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');

if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });

async function runComparison() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.2 — BROWSER PERSON SEGMENTATION COMPARISON');
  console.log('================================================================\n');

  console.log('[1/4] Launching headless Chromium browser...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=SharedArrayBuffer',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Audit network requests (including potential SDK telemetry)
  const networkAudit = [];
  page.on('request', (req) => {
    const url = req.url();
    const isLocal = url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost');
    networkAudit.push({
      url: url,
      method: req.method(),
      isLocal: isLocal,
      timestamp: Date.now()
    });
    if (!isLocal) {
      console.warn(`    ⚠️ [EXTERNAL NETWORK REQUEST DETECTED]: ${req.method()} ${url}`);
    } else {
      console.log(`    [Network] ${req.method()} ${url.split('/').slice(3).join('/')}`);
    }
  });

  page.on('console', (msg) => {
    console.log(`    [Browser Console] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.error(`    [Browser PageError] ${err.message}\n${err.stack}`);
  });

  console.log('[2/4] Navigating to http://127.0.0.1:3888/scripts/photo_prototype/compare_models.html ...');
  await page.goto(`http://127.0.0.1:${PORT}/scripts/photo_prototype/compare_models.html`);

  await page.waitForFunction(() => window.__evalReady === true, { timeout: 30000 });
  console.log('[3/4] Evaluation page ready. Executing models in browser context...');

  const result = await page.evaluate(async () => {
    return await window.runCompleteComparison();
  });

  console.log('\n[4/4] Processing browser results and saving binary masks...');
  const W = result.imageWidth;
  const H = result.imageHeight;

  // 1. MediaPipe Whole-Family Mask
  const mpBuffer = Buffer.from(result.mediapipe.maskBase64, 'base64');
  const mpBinPath = path.join(DIAG_DIR, 'mediapipe_whole_family.bin');
  fs.writeFileSync(mpBinPath, mpBuffer);
  console.log(`  ✓ Saved MediaPipe whole-family mask (${result.mediapipe.fgCount.toLocaleString()} px) -> ${mpBinPath}`);

  // 2. BodyPix Masks
  console.log(`  ✓ BodyPix detected ${result.bodypix.detectedCount} people.`);
  const bpPersons = [];
  const unionMask = new Uint8Array(W * H);

  for (let i = 0; i < result.bodypix.people.length; i++) {
    const p = result.bodypix.people[i];
    const pBuf = Buffer.from(p.maskBase64, 'base64');
    const pBinPath = path.join(DIAG_DIR, `bodypix_person_${i}.bin`);
    fs.writeFileSync(pBinPath, pBuf);
    console.log(`    - Person ${i} (${p.fgCount.toLocaleString()} px, bounds: [${p.bounds.minX}..${p.bounds.maxX}, ${p.bounds.minY}..${p.bounds.maxY}]) -> ${pBinPath}`);

    // Update union
    for (let j = 0; j < W * H; j++) {
      if (pBuf[j] === 1) unionMask[j] = 1;
    }

    bpPersons.push({
      personIndex: i,
      fgCount: p.fgCount,
      bounds: p.bounds,
      binFile: `bodypix_person_${i}.bin`
    });
  }

  // Save BodyPix Union Mask
  let unionCount = 0;
  for (let j = 0; j < W * H; j++) if (unionMask[j] === 1) unionCount++;
  const bpUnionPath = path.join(DIAG_DIR, 'bodypix_union.bin');
  fs.writeFileSync(bpUnionPath, Buffer.from(unionMask));
  console.log(`  ✓ Saved BodyPix union mask (${unionCount.toLocaleString()} px) -> ${bpUnionPath}`);

  // 3. Hybrid Masks
  const hybridBufA = Buffer.from(result.hybrid.maskABase64, 'base64');
  const hybridBufB = Buffer.from(result.hybrid.maskBBase64, 'base64');
  const hybridBufUncertain = Buffer.from(result.hybrid.uncertainBase64, 'base64');

  fs.writeFileSync(path.join(DIAG_DIR, 'hybrid_person_a.bin'), hybridBufA);
  fs.writeFileSync(path.join(DIAG_DIR, 'hybrid_person_b.bin'), hybridBufB);
  fs.writeFileSync(path.join(DIAG_DIR, 'hybrid_uncertain.bin'), hybridBufUncertain);

  console.log(`  ✓ Saved Hybrid Partition: A=${result.hybrid.assignedACount.toLocaleString()} px, B=${result.hybrid.assignedBCount.toLocaleString()} px, Uncertain=${result.hybrid.uncertainCount.toLocaleString()} px`);

  // Summarize and save metadata
  const externalRequests = networkAudit.filter(r => !r.isLocal);
  const metadata = {
    testDate: new Date().toISOString(),
    imageDimensions: { width: W, height: H },
    mediapipe: {
      modelName: result.mediapipe.name,
      modelAsset: result.mediapipe.modelAsset,
      initLatencyMs: result.mediapipe.initLatencyMs,
      inferenceLatencyMs: result.mediapipe.inferenceLatencyMs,
      fgCount: result.mediapipe.fgCount,
      binFile: 'mediapipe_whole_family.bin'
    },
    bodypix: {
      modelName: result.bodypix.name,
      backend: result.bodypix.backend,
      initLatencyMs: result.bodypix.initLatencyMs,
      inferenceLatencyMs: result.bodypix.inferenceLatencyMs,
      detectedCount: result.bodypix.detectedCount,
      unionCount: unionCount,
      unionBinFile: 'bodypix_union.bin',
      people: bpPersons
    },
    hybrid: {
      assignedACount: result.hybrid.assignedACount,
      assignedBCount: result.hybrid.assignedBCount,
      uncertainCount: result.hybrid.uncertainCount,
      uncertainPercent: (result.hybrid.uncertainCount / result.mediapipe.fgCount) * 100,
      maskABin: 'hybrid_person_a.bin',
      maskBBin: 'hybrid_person_b.bin',
      uncertainBin: 'hybrid_uncertain.bin'
    },
    networkAudit: {
      totalRequests: networkAudit.length,
      externalRequestsCount: externalRequests.length,
      externalRequests: externalRequests,
      isCompletelyOffline: externalRequests.length === 0
    }
  };

  const metaPath = path.join(DIAG_DIR, 'model_comparison_meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(`\nMetadata written to: ${metaPath}`);

  await browser.close();
  console.log('\nBrowser comparison finished successfully!');
}

runComparison().catch(err => {
  console.error('\nFatal error during comparison:', err);
  process.exit(1);
});
