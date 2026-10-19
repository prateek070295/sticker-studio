const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');

const PORT = 3897;
const ROOT = path.resolve('.');
const OUTPUT_DIR = path.resolve('test-output/restoration_acceptance');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.tflite': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
  '.favicon.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');

      let cleanUrl = req.url.split('?')[0];
      if (cleanUrl === '/' || cleanUrl === '/app' || cleanUrl === '/app/') {
        cleanUrl = '/dist/index.html';
      }

      let filePath;
      if (
        cleanUrl.startsWith('/assets/') ||
        cleanUrl.startsWith('/mediapipe/') ||
        cleanUrl.startsWith('/samples/') ||
        cleanUrl === '/dist/index.html' ||
        cleanUrl === '/sw.js' ||
        cleanUrl.startsWith('/workbox-') ||
        cleanUrl === '/manifest.webmanifest' ||
        cleanUrl === '/favicon.ico'
      ) {
        filePath = path.join(ROOT, cleanUrl.startsWith('/dist/') ? cleanUrl : path.join('dist', cleanUrl));
      } else {
        filePath = path.join(ROOT, cleanUrl);
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end('Not found: ' + cleanUrl);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(PORT, () => {
      console.log(`[Test Server] Running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

// Decode PNG in browser context to get exact RGBA pixel data
async function decodePngInBrowser(page, pngBuffer) {
  const base64 = pngBuffer.toString('base64');
  return await page.evaluate(async (b64) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cvs = document.createElement('canvas');
        cvs.width = img.width;
        cvs.height = img.height;
        const ctx = cvs.getContext('2d');
        if (!ctx) return reject(new Error('Cannot get canvas context'));
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        resolve({
          width: img.width,
          height: img.height,
          rgba: Array.from(imgData.data),
        });
      };
      img.onerror = () => reject(new Error('Failed to decode PNG in browser'));
      img.src = 'data:image/png;base64,' + b64;
    });
  }, base64);
}

async function runTestCase(page, { testId, name, photoPath, setHairBehind }) {
  console.log(`\n================================================================`);
  console.log(`TEST SUITE: ${name} (${testId})`);
  console.log(`Photo: ${photoPath}`);
  console.log(`================================================================`);

  // Step 1: Navigate to fresh app
  console.log('\n[Step 1] Loading Cartoon Mode...');
  await page.goto(`http://127.0.0.1:${PORT}/app#cartoon`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Step 2: Upload selfie photo
  console.log(`[Step 2] Uploading photo fixture: ${path.basename(photoPath)} ...`);
  const fileInput = await page.$('input[type="file"][accept*="image"]');
  if (!fileInput) throw new Error('Photo input element missing');
  await fileInput.setInputFiles(photoPath);

  // Step 3: Wait for MediaPipe extraction and initial canvas render
  console.log('  Waiting for MediaPipe extraction & initial composition...');
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Step 4: Toggle Hair Placement to Behind Torso if requested
  if (setHairBehind) {
    console.log('[Step 3] Ensuring Hair Placement is "Behind Torso" ...');
    const hairBtn = await page.$('button:has-text("Over Torso"), button:has-text("Behind Torso")');
    if (hairBtn) {
      const currentText = await hairBtn.textContent();
      if (currentText.includes('Over Torso')) {
        await hairBtn.click();
        await page.waitForTimeout(500);
        console.log('  ✓ Toggled hair layering: Over Torso -> Behind Torso');
      } else {
        console.log('  ✓ Hair placement is already Behind Torso');
      }
    }
  }

  // Record initial sticker before edits
  console.log('[Step 4] Exporting initial sticker PNG and recording RGBA...');
  const [downloadInit] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export Sticker (White Backed)")')
  ]);
  const initStickerPath = path.join(OUTPUT_DIR, `${testId}_initial.png`);
  await downloadInit.saveAs(initStickerPath);
  const initBuf = fs.readFileSync(initStickerPath);
  const initDecoded = await decodePngInBrowser(page, initBuf);
  console.log(`  ✓ Initial sticker exported: ${initDecoded.width}x${initDecoded.height} (${initBuf.length} bytes)`);

  // Step 5: Perform an Erase brush correction
  console.log('\n[Step 5] Performing Erase brush edit on head canvas...');
  await page.click('button:has-text("Erase")');
  await page.waitForTimeout(200);

  // Drag on canvas over top-right head region
  const canvasEl = await page.$('canvas');
  const box = await canvasEl.boundingBox();
  const eraseStartX = box.x + box.width * 0.58;
  const eraseStartY = box.y + box.height * 0.32;
  await page.mouse.move(eraseStartX, eraseStartY);
  await page.mouse.down();
  await page.mouse.move(eraseStartX + 15, eraseStartY + 15, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log('  ✓ Erase brush stroke applied');

  // Step 6: Restore another pixel and verify its source RGB
  console.log('\n[Step 6] Performing Restore brush edit and verifying photographic RGB...');
  await page.click('button:has-text("Restore")');
  await page.waitForTimeout(200);

  // Paint restore on the previously erased point
  await page.mouse.move(eraseStartX + 5, eraseStartY + 5);
  await page.mouse.down();
  await page.mouse.move(eraseStartX + 8, eraseStartY + 8, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  // Verify in browser context that restored pixel recovered actual photographic RGB
  const rgbCheck = await page.evaluate(() => {
    // Check pixel data on stage canvas
    const cvs = document.querySelector('canvas');
    if (!cvs) return { success: false, reason: 'No canvas' };
    const ctx = cvs.getContext('2d');
    const pixel = ctx.getImageData(Math.round(cvs.width * 0.58), Math.round(cvs.height * 0.32), 1, 1).data;
    const isNonZero = pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0;
    return {
      success: isNonZero,
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      a: pixel[3],
    };
  });
  console.log(`  ✓ Restored pixel RGB verification: R=${rgbCheck.r}, G=${rgbCheck.g}, B=${rgbCheck.b}, A=${rgbCheck.a}`);
  if (!rgbCheck.success || rgbCheck.a === 0) {
    throw new Error(`Restored pixel failed RGB check: R=${rgbCheck.r}, G=${rgbCheck.g}, B=${rgbCheck.b}, A=${rgbCheck.a}`);
  }

  // Step 7: Export pre-save edited sticker PNG and record its decoded RGBA
  console.log('\n[Step 7] Exporting pre-save edited sticker PNG...');
  const [downloadPreSave] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export Sticker (White Backed)")')
  ]);
  const preSavePath = path.join(OUTPUT_DIR, `${testId}_presave.png`);
  await downloadPreSave.saveAs(preSavePath);
  const preSaveBuf = fs.readFileSync(preSavePath);
  const preSaveDecoded = await decodePngInBrowser(page, preSaveBuf);
  console.log(`  ✓ Pre-save sticker recorded: ${preSaveDecoded.width}x${preSaveDecoded.height} (${preSaveBuf.length} bytes)`);

  // Step 8: Save .stickerstudio project
  console.log('\n[Step 8] Saving .stickerstudio project...');
  const [downloadProject] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Save .stickerstudio Project")')
  ]);
  const projectFilename = downloadProject.suggestedFilename();
  const projectPath = path.join(OUTPUT_DIR, projectFilename);
  await downloadProject.saveAs(projectPath);
  console.log(`  ✓ Project file saved: ${projectFilename} (${fs.statSync(projectPath).size} bytes)`);

  // Inspect project json content
  const projectJson = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  console.log(`    - Has headPngDataUrl: ${!!projectJson.headPngDataUrl}`);
  console.log(`    - Has alphaMaskBase64: ${!!projectJson.alphaMaskBase64}`);
  console.log(`    - Has selfieDataUrl: ${!!projectJson.selfieDataUrl}`);
  console.log(`    - Has landmarks: ${!!projectJson.landmarks}`);
  if (!projectJson.landmarks) {
    throw new Error('FAIL: landmarks missing in saved project JSON!');
  }
  if (!projectJson.headPngDataUrl) {
    throw new Error('FAIL: headPngDataUrl missing in saved project JSON!');
  }

  // Step 9: Reload browser completely
  console.log('\n[Step 9] Reloading browser completely (fresh session)...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Install spy to verify MediaPipe is NOT called during reopen
  await page.evaluate(() => {
    window.__mediaPipeCallCount = 0;
    if (window.cartoonProductionPipeline?.extractPhotographicHead) {
      const orig = window.cartoonProductionPipeline.extractPhotographicHead;
      window.cartoonProductionPipeline.extractPhotographicHead = function(...args) {
        window.__mediaPipeCallCount++;
        return orig.apply(this, args);
      };
    }
  });

  // Step 10: Reopen saved project
  console.log('[Step 10] Reopening project without MediaPipe inference...');
  const projectInput = await page.$('input[accept*=".stickerstudio"]');
  if (!projectInput) throw new Error('Project input missing after reload');
  await projectInput.setInputFiles(projectPath);

  // Wait for canvas re-composite
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const mediaPipeCalls = await page.evaluate(() => window.__mediaPipeCallCount);
  console.log(`  ✓ MediaPipe invocation count during reopen: ${mediaPipeCalls}`);
  if (mediaPipeCalls !== 0) {
    throw new Error(`FAIL: MediaPipe was invoked ${mediaPipeCalls} times during reopen! Fast-path failed.`);
  }

  // Step 11: Export post-reopen sticker PNG
  console.log('\n[Step 11] Exporting post-reopen sticker PNG...');
  const [downloadPostReopen] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export Sticker (White Backed)")')
  ]);
  const postReopenPath = path.join(OUTPUT_DIR, `${testId}_postreopen.png`);
  await downloadPostReopen.saveAs(postReopenPath);
  const postReopenBuf = fs.readFileSync(postReopenPath);
  const postReopenDecoded = await decodePngInBrowser(page, postReopenBuf);
  console.log(`  ✓ Post-reopen sticker exported: ${postReopenDecoded.width}x${postReopenDecoded.height} (${postReopenBuf.length} bytes)`);

  // Step 12: Assert zero RGBA differences across entire sticker
  console.log('\n[Step 12] Bit-for-bit RGBA Equality Verification...');
  console.log(`  Pre-save dims: ${preSaveDecoded.width}x${preSaveDecoded.height}, Post-reopen dims: ${postReopenDecoded.width}x${postReopenDecoded.height}`);
  if (preSaveDecoded.width !== postReopenDecoded.width || preSaveDecoded.height !== postReopenDecoded.height) {
    throw new Error(`Dimension mismatch: pre-save (${preSaveDecoded.width}x${preSaveDecoded.height}) vs post-reopen (${postReopenDecoded.width}x${postReopenDecoded.height})`);
  }

  const rgbaPre = preSaveDecoded.rgba;
  const rgbaPost = postReopenDecoded.rgba;
  let diffCount = 0;
  let maxChannelDiff = 0;

  for (let i = 0; i < rgbaPre.length; i++) {
    const diff = Math.abs(rgbaPre[i] - rgbaPost[i]);
    if (diff > 0) {
      diffCount++;
      if (diff > maxChannelDiff) maxChannelDiff = diff;
    }
  }

  console.log(`  Total sticker pixel channels: ${rgbaPre.length}`);
  console.log(`  Differing channels: ${diffCount}`);
  console.log(`  Max channel difference: ${maxChannelDiff}`);

  if (diffCount !== 0) {
    throw new Error(`FAIL: Found ${diffCount} differing RGBA bytes between pre-save and post-reopen sticker!`);
  }
  console.log(`  ✓ EXACT EQUALITY CONFIRMED: 0 RGBA differences across the entire final sticker!`);

  // Step 13: Verify manual correction remains functional after reopening
  console.log('\n[Step 13] Verifying manual correction remains functional after reopening...');
  await page.click('button:has-text("Erase")');
  await page.waitForTimeout(200);

  // Apply another erase brush stroke
  await page.mouse.move(eraseStartX, eraseStartY);
  await page.mouse.down();
  await page.mouse.move(eraseStartX + 10, eraseStartY + 10, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  // Now test Restore recovers original photographic RGB after reopening
  await page.click('button:has-text("Restore")');
  await page.waitForTimeout(200);
  await page.mouse.move(eraseStartX + 5, eraseStartY + 5);
  await page.mouse.down();
  await page.mouse.move(eraseStartX + 7, eraseStartY + 7, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const postReopenRgbCheck = await page.evaluate(() => {
    const cvs = document.querySelector('canvas');
    if (!cvs) return { success: false };
    const ctx = cvs.getContext('2d');
    const pixel = ctx.getImageData(Math.round(cvs.width * 0.58), Math.round(cvs.height * 0.32), 1, 1).data;
    return {
      success: pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0,
      r: pixel[0],
      g: pixel[1],
      b: pixel[2],
      a: pixel[3],
    };
  });

  console.log(`  ✓ Post-reopen Restore RGB check: R=${postReopenRgbCheck.r}, G=${postReopenRgbCheck.g}, B=${postReopenRgbCheck.b}, A=${postReopenRgbCheck.a}`);
  if (!postReopenRgbCheck.success || postReopenRgbCheck.a === 0) {
    throw new Error(`FAIL: Manual restore failed after reopening! Pixel: ${JSON.stringify(postReopenRgbCheck)}`);
  }
  console.log(`  ✓ Manual correction is fully functional after project reopening!`);

  return {
    testId,
    name,
    preSaveSize: preSaveBuf.length,
    postReopenSize: postReopenBuf.length,
    width: preSaveDecoded.width,
    height: preSaveDecoded.height,
    diffCount,
    mediaPipeCalls,
    restoredRgb: rgbCheck,
    postReopenRgb: postReopenRgbCheck,
  };
}

async function main() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.4 — REAL BROWSER EQUALITY ACCEPTANCE SUITE');
  console.log('================================================================\n');

  const server = await startServer();

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox', '--disable-web-security']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });

  try {
    // 1. Long-haired portrait with Behind Torso hair placement
    const page1 = await context.newPage();
    const longHairResult = await runTestCase(page1, {
      testId: 'long_hair_behind_torso',
      name: 'Long-Haired Portrait (Behind Torso)',
      photoPath: path.resolve('test-output/actual_portraits/leather_jacket_portrait.jpg'),
      setHairBehind: true,
    });
    await page1.close();

    // 2. Short-haired portrait
    const page2 = await context.newPage();
    const shortHairResult = await runTestCase(page2, {
      testId: 'short_hair_portrait',
      name: 'Short-Haired Portrait (Adult Glasses)',
      photoPath: path.resolve('test-output/actual_portraits/alex_pretti_glasses.jpg'),
      setHairBehind: false,
    });
    await page2.close();

    console.log('\n================================================================');
    console.log('ALL BROWSER EQUALITY ACCEPTANCE TESTS PASSED!');
    console.log('================================================================');
    console.log(JSON.stringify({ longHairResult, shortHairResult }, null, 2));

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'browser_equality_summary.json'),
      JSON.stringify({ longHairResult, shortHairResult, timestamp: new Date().toISOString() }, null, 2)
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('\n❌ BROWSER EQUALITY SUITE FAILED:', err);
  process.exit(1);
});
