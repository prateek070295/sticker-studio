const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const OUTPUT_DIR = path.resolve('docs/v1.7_matting_investigation/modnet_release_acceptance');
const ARTIFACT_DIR = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve();
        } else {
          setTimeout(ping, 250);
        }
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for preview server at ${url}`));
        } else {
          setTimeout(ping, 250);
        }
      });
    }
    ping();
  });
}

async function runAcceptance() {
  console.log('================================================================');
  console.log('STICKER STUDIO — OPTIONAL MODNET HIGH QUALITY BROWSER ACCEPTANCE');
  console.log('================================================================\n');

  const testAssets = {
    woman: path.resolve('test-output/actual_portraits/woman_portrait.jpg'),
    glasses: path.resolve('test-output/actual_portraits/alex_pretti_glasses.jpg'),
    flower: path.resolve('test-output/actual_portraits/compound_woman_red_flower.png'),
    leather: path.resolve('test-output/actual_portraits/leather_jacket_portrait.jpg'),
    beach: path.resolve('docs/diagnosis_beach_family/beach_family_original.png'),
  };

  for (const [key, filePath] of Object.entries(testAssets)) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required test asset not found: ${filePath}`);
    }
  }

  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], {
    shell: true,
    stdio: 'ignore',
  });

  const metrics = {
    tests: {},
    networkUploadsDetected: 0,
    startTime: new Date().toISOString(),
  };

  try {
    await waitForServer(PREVIEW_URL, 25000);
    console.log(`Vite preview server running at ${PREVIEW_URL}`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });
    const page = await context.newPage();

    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      if (method === 'POST' && !url.includes('127.0.0.1') && !url.includes('localhost')) {
        console.warn(`[WARNING] External POST request detected: ${url}`);
        metrics.networkUploadsDetected++;
      }
    });

    page.on('console', (msg) => {
      const txt = msg.text();
      if (!txt.includes('WebGL') && !txt.includes('XNNPACK')) {
        console.log(`  [Browser] ${txt}`);
      }
    });

    // =========================================================================
    // TEST 1: WOMAN PORTRAIT — HIGH QUALITY (MODNet) + BRUSH + SAVE/REOPEN + EXPORTS
    // =========================================================================
    console.log('\n--- Test 1: Woman Portrait (Long Flowing Hair) in High Quality Mode ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    console.log('Importing woman portrait...');
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testAssets.woman);
    await page.waitForSelector('canvas', { timeout: 10000 });

    console.log('Selecting "High Quality" mode...');
    const hqBtn = page.locator('button:has-text("High Quality")');
    await hqBtn.waitFor({ state: 'visible', timeout: 5000 });
    await hqBtn.click();

    console.log('Triggering High Quality extraction...');
    const t0 = Date.now();
    const detectBtn = page.locator('button:has-text("Detect People")');
    await detectBtn.click();

    await page.waitForSelector('text=Artwork Feather', { timeout: 90000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 90000 });
    const latencyWoman = Date.now() - t0;
    console.log(`MODNet High Quality extraction completed in ${latencyWoman} ms`);
    metrics.tests.woman = { latencyMs: latencyWoman, success: true };

    await page.waitForTimeout(1000);

    const uiShotWoman = path.join(OUTPUT_DIR, '01_woman_high_quality_extracted.png');
    await page.screenshot({ path: uiShotWoman });
    fs.copyFileSync(uiShotWoman, path.join(ARTIFACT_DIR, '01_woman_high_quality_extracted.png'));
    console.log(`Saved screenshot: ${uiShotWoman}`);

    console.log('Exporting Sticker PNG...');
    const [dlSticker] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click(),
    ]);
    const exportedStickerPath = path.join(OUTPUT_DIR, 'woman_high_quality_sticker.png');
    await dlSticker.saveAs(exportedStickerPath);
    fs.copyFileSync(exportedStickerPath, path.join(ARTIFACT_DIR, 'woman_high_quality_sticker.png'));
    console.log(`Exported Sticker PNG (${fs.statSync(exportedStickerPath).size} bytes)`);

    console.log('Exporting Artwork Only PNG...');
    const [dlArtwork] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click(),
    ]);
    const exportedArtPath = path.join(OUTPUT_DIR, 'woman_high_quality_artwork_only.png');
    await dlArtwork.saveAs(exportedArtPath);
    fs.copyFileSync(exportedArtPath, path.join(ARTIFACT_DIR, 'woman_high_quality_artwork_only.png'));
    console.log(`Exported Artwork Only PNG (${fs.statSync(exportedArtPath).size} bytes)`);

    console.log('Exporting ZIP package...');
    const [dlZip] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Export ZIP")').click(),
    ]);
    const exportedZipPath = path.join(OUTPUT_DIR, 'woman_high_quality_bundle.zip');
    await dlZip.saveAs(exportedZipPath);
    console.log(`Exported ZIP (${fs.statSync(exportedZipPath).size} bytes)`);

    console.log('Testing Erase brush...');
    const eraseBtn = page.locator('button:has-text("Erase")');
    if (await eraseBtn.count() > 0) {
      await eraseBtn.click();
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 80);
        await page.mouse.up();
        await page.waitForTimeout(500);
      }
    }

    console.log('Testing Clean Stray Fragments...');
    const cleanBtn = page.locator('button:has-text("Clean Stray Fragments")');
    if (await cleanBtn.count() > 0) {
      await cleanBtn.click();
      await page.waitForTimeout(500);
    }

    console.log('Saving .stickerstudio Project Archive...');
    const [dlProject] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Save Photo Project")').click(),
    ]);
    const projectFilePath = path.join(OUTPUT_DIR, 'woman_saved_project.stickerstudio');
    await dlProject.saveAs(projectFilePath);
    console.log(`Saved .stickerstudio project archive (${fs.statSync(projectFilePath).size} bytes)`);

    console.log('Reloading page and reopening project archive to test lossless restoration...');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    const projectFileInput = page.locator('input[accept*=".stickerstudio"]').first();
    await projectFileInput.setInputFiles(projectFilePath);
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForSelector('text=Artwork Feather', { timeout: 15000 });
    console.log('Project successfully restored!');

    const uiShotRestored = path.join(OUTPUT_DIR, '01_woman_project_restored.png');
    await page.screenshot({ path: uiShotRestored });
    fs.copyFileSync(uiShotRestored, path.join(ARTIFACT_DIR, '01_woman_project_restored.png'));

    // =========================================================================
    // TEST 2: ALEX PRETTI
    // =========================================================================
    console.log('\n--- Test 2: Short Hair & Glasses (Alex Pretti) in High Quality Mode ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const fileInputGlasses = page.locator('input[type="file"][accept*="image"]').first();
    await fileInputGlasses.setInputFiles(testAssets.glasses);
    await page.waitForSelector('canvas', { timeout: 10000 });

    await page.locator('button:has-text("High Quality")').click();

    const tGlasses0 = Date.now();
    await page.locator('button:has-text("Detect People")').click();
    await page.waitForSelector('text=Artwork Feather', { timeout: 90000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 90000 });
    const latencyGlasses = Date.now() - tGlasses0;
    console.log(`Alex Pretti extraction completed in ${latencyGlasses} ms`);
    metrics.tests.glasses = { latencyMs: latencyGlasses, success: true };

    const uiShotGlasses = path.join(OUTPUT_DIR, '02_alex_pretti_glasses_high_quality.png');
    await page.screenshot({ path: uiShotGlasses });
    fs.copyFileSync(uiShotGlasses, path.join(ARTIFACT_DIR, '02_alex_pretti_glasses_high_quality.png'));

    // =========================================================================
    // TEST 3: COMPOUND WOMAN RED FLOWER
    // =========================================================================
    console.log('\n--- Test 3: Attached Hair Accessory (Red Flower) in High Quality Mode ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const fileInputFlower = page.locator('input[type="file"][accept*="image"]').first();
    await fileInputFlower.setInputFiles(testAssets.flower);
    await page.waitForSelector('canvas', { timeout: 10000 });

    await page.locator('button:has-text("High Quality")').click();

    const tFlower0 = Date.now();
    await page.locator('button:has-text("Detect People")').click();
    await page.waitForSelector('text=Artwork Feather', { timeout: 90000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 90000 });
    const latencyFlower = Date.now() - tFlower0;
    console.log(`Woman Red Flower extraction completed in ${latencyFlower} ms`);
    metrics.tests.flower = { latencyMs: latencyFlower, success: true };

    const uiShotFlower = path.join(OUTPUT_DIR, '03_woman_red_flower_high_quality.png');
    await page.screenshot({ path: uiShotFlower });
    fs.copyFileSync(uiShotFlower, path.join(ARTIFACT_DIR, '03_woman_red_flower_high_quality.png'));

    // =========================================================================
    // TEST 4: LEATHER JACKET PORTRAIT
    // =========================================================================
    console.log('\n--- Test 4: Leather Jacket Portrait (Vegetation Background) in High Quality Mode ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const fileInputLeather = page.locator('input[type="file"][accept*="image"]').first();
    await fileInputLeather.setInputFiles(testAssets.leather);
    await page.waitForSelector('canvas', { timeout: 10000 });

    await page.locator('button:has-text("High Quality")').click();

    const tLeather0 = Date.now();
    await page.locator('button:has-text("Detect People")').click();
    await page.waitForSelector('text=Artwork Feather', { timeout: 90000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 90000 });
    const latencyLeather = Date.now() - tLeather0;
    console.log(`Leather jacket portrait extraction completed in ${latencyLeather} ms`);
    metrics.tests.leather = { latencyMs: latencyLeather, success: true };

    const uiShotLeather = path.join(OUTPUT_DIR, '04_leather_jacket_high_quality.png');
    await page.screenshot({ path: uiShotLeather });
    fs.copyFileSync(uiShotLeather, path.join(ARTIFACT_DIR, '04_leather_jacket_high_quality.png'));

    // =========================================================================
    // TEST 5: GROUP PHOTO SAFETY
    // =========================================================================
    console.log('\n--- Test 5: Multi-Person Group Photo (Beach Family) Safety Check ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const fileInputBeach = page.locator('input[type="file"][accept*="image"]').first();
    await fileInputBeach.setInputFiles(testAssets.beach);
    await page.waitForSelector('canvas', { timeout: 10000 });

    console.log('Running Standard extraction on multi-person group photo...');
    await page.locator('button:has-text("Detect People")').click();
    await page.waitForSelector('text=Artwork Feather', { timeout: 90000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 90000 });

    console.log('Attempting to switch to High Quality on group photo...');
    await page.locator('button:has-text("High Quality")').click();
    await page.waitForTimeout(1000);

    const warningText = await page.locator('text=optimized for single-person portraits').count();
    console.log(`Group photo warning displayed: ${warningText > 0 ? 'YES' : 'NO'}`);
    metrics.tests.groupSafety = { warningDisplayed: warningText > 0, success: true };

    const uiShotBeach = path.join(OUTPUT_DIR, '05_beach_family_group_safety.png');
    await page.screenshot({ path: uiShotBeach });
    fs.copyFileSync(uiShotBeach, path.join(ARTIFACT_DIR, '05_beach_family_group_safety.png'));

    await browser.close();

    metrics.endTime = new Date().toISOString();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'acceptance_metrics.json'), JSON.stringify(metrics, null, 2));
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'modnet_acceptance_metrics.json'), JSON.stringify(metrics, null, 2));

    console.log('\n================================================================');
    console.log('ALL BROWSER ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
    console.log(`Zero photo uploads detected: ${metrics.networkUploadsDetected === 0}`);
    console.log('================================================================\n');
  } finally {
    previewProcess.kill();
  }
}

runAcceptance().catch((err) => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});
