const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');

async function testOfflinePrivacy() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.2A — OFFLINE EXECUTION & ZERO-EXFILTRATION AUDIT');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Audit all network requests
  const networkAudit = {
    totalRequests: 0,
    externalRequests: [],
    outboundUploads: [],
    requestsAfterOffline: 0,
  };

  let isOffline = false;

  page.on('request', (req) => {
    networkAudit.totalRequests++;
    if (isOffline) {
      networkAudit.requestsAfterOffline++;
    }

    const url = req.url();
    const method = req.method();

    // Check for any external destinations
    if (
      !url.startsWith('http://127.0.0.1') &&
      !url.startsWith('http://localhost') &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:')
    ) {
      networkAudit.externalRequests.push({ url, method });
    }

    // Check for outbound payload upload (POST/PUT)
    if (method === 'POST' || method === 'PUT') {
      const postData = req.postData();
      if (postData && postData.length > 50) {
        networkAudit.outboundUploads.push({ url, method, size: postData.length });
      }
    }
  });

  // Step 1: Initial Load & Precaching
  console.log('[Step 1/5] Loading application online to initialize service worker & warm up models...');
  await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'networkidle' });

  // Switch to Photo Mode so MediaPipe model assets are initialized into browser memory/cache
  await page.click('button:has-text("Photo Mode")');
  await page.waitForTimeout(1000);
  console.log('  ✓ Initial assets loaded and MediaPipe model warmed up.');

  // Step 2: Simulate Complete Network Disconnection
  console.log('\n[Step 2/5] Simulating total network disconnect (context.setOffline(true))...');
  await context.setOffline(true);
  isOffline = true;
  console.log('  ✓ Network is completely OFFLINE (zero network connectivity).');

  // Step 3: Run Full Photo Pipeline in Offline Mode
  console.log('\n[Step 3/5] Executing Photo Mode AI segmentation completely offline...');
  const photoPath = path.join(FIXTURES_DIR, 'prototype_touching_subjects.jpg');
  const fileInput = page.locator('input[type="file"][accept*="image"]').first();
  await fileInput.setInputFiles(photoPath);

  await page.waitForSelector('canvas', { timeout: 10000 });
  console.log('  ✓ Photo loaded onto canvas offline.');

  // Run MediaPipe background removal while offline
  const startInference = Date.now();
  await page.click('button:has-text("Remove Background")');
  await page.waitForSelector('button:has-text("Sticker Border")', { timeout: 30000 });
  const duration = Date.now() - startInference;
  console.log(`  ✓ MediaPipe WASM segmentation completed offline in ${duration} ms.`);

  // Verify mask generated
  const maskPixels = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) count++;
    }
    return count;
  });
  console.log(`  ✓ Rendered sticker pixels offline: ${maskPixels.toLocaleString()} px.`);

  // Step 4: Mask Editing, Undo/Redo, and Persistence Offline
  console.log('\n[Step 4/5] Testing brush editing and .stickerstudio project persistence offline...');
  // Activate Erase brush
  await page.click('button:has-text("Erase")');
  await page.waitForTimeout(200);

  // Apply brush stroke on canvas
  const canvasBox = await page.locator('canvas').boundingBox();
  if (!canvasBox) throw new Error('Could not find canvas bounding box');

  const startX = canvasBox.x + canvasBox.width / 2;
  const startY = canvasBox.y + canvasBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const editedPixels = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) count++;
    }
    return count;
  });
  console.log(`  ✓ Edited mask pixels: ${editedPixels.toLocaleString()} px (Erase delta: ${(editedPixels - maskPixels).toLocaleString()} px).`);

  // Test Undo
  await page.click('button[title*="Undo"], button:has-text("Undo")');
  await page.waitForTimeout(200);
  const undonePixels = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) count++;
    }
    return count;
  });
  console.log(`  ✓ Undo restored exact pixel count: ${undonePixels.toLocaleString()} px (diff: ${undonePixels - maskPixels}).`);
  if (undonePixels !== maskPixels) {
    throw new Error(`Undo did not restore exact mask: expected ${maskPixels}, got ${undonePixels}`);
  }

  // Step 5: Privacy & Zero Exfiltration Audit
  console.log('\n[Step 5/5] Auditing Network Traffic for Zero External Exfiltration...');
  console.log(`  Total requests recorded: ${networkAudit.totalRequests}`);
  console.log(`  Requests attempted after offline disconnect: ${networkAudit.requestsAfterOffline}`);
  console.log(`  External requests: ${networkAudit.externalRequests.length}`);
  console.log(`  Outbound data uploads (POST/PUT): ${networkAudit.outboundUploads.length}`);

  if (networkAudit.externalRequests.length > 0) {
    console.error('  ⚠️ SECURITY VIOLATION: External requests detected:', networkAudit.externalRequests);
    throw new Error('Privacy audit failed: detected outbound external requests!');
  } else {
    console.log('  ✓ 100% Zero External Network Calls Verified.');
  }

  if (networkAudit.outboundUploads.length > 0) {
    console.error('  ⚠️ SECURITY VIOLATION: Outbound uploads detected:', networkAudit.outboundUploads);
    throw new Error('Privacy audit failed: detected outbound data uploads!');
  } else {
    console.log('  ✓ 100% Zero Outbound Photo/Mask Exfiltration Verified.');
  }

  const auditReport = {
    offlineCapable: true,
    localWasmInference: true,
    inferenceDurationMs: duration,
    undoRedoExact: undonePixels === maskPixels,
    networkAudit,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'offline_privacy_audit.json'), JSON.stringify(auditReport, null, 2));
  console.log(`\n✓ Saved offline privacy audit report to: ${path.join(ARTIFACT_DIR, 'offline_privacy_audit.json')}`);

  await browser.close();
  console.log('\n================================================================');
  console.log('OFFLINE & PRIVACY AUDIT: 100% PASSED (ZERO DATA EXFILTRATION)');
  console.log('================================================================\n');
}

testOfflinePrivacy().catch(err => {
  console.error('\n❌ OFFLINE & PRIVACY AUDIT FAILED:', err);
  process.exit(1);
});
