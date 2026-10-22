const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const OUTPUT_DIR = path.resolve('docs/v1.7_matting_investigation/browser_acceptance');
const ARTIFACT_DIR = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function waitForServer(url, timeoutMs = 20000) {
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

async function runBrowserMattingAcceptance() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.7 — REAL BROWSER PHOTO MATTING ACCEPTANCE');
  console.log('================================================================\n');

  const womanPhoto = path.resolve('test-output/actual_portraits/woman_portrait.jpg');
  const beachPhoto = path.resolve('docs/diagnosis_beach_family/beach_family_original.png');

  if (!fs.existsSync(womanPhoto)) {
    throw new Error(`Portrait missing: ${womanPhoto}`);
  }

  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], {
    shell: true,
    stdio: 'ignore'
  });

  try {
    await waitForServer(PREVIEW_URL, 20000);
    console.log(`Vite preview server running at ${PREVIEW_URL}`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true
    });
    const page = await context.newPage();

    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('WebGL') && !txt.includes('XNNPACK')) {
        console.log(`  [Browser] ${txt}`);
      }
    });

    // -------------------------------------------------------------------------
    // TEST 1: WOMAN PORTRAIT IN PHOTO MODE
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 1: Woman Portrait Extraction ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });

    const photoModeBtn = page.locator('button:has-text("Photo Mode")');
    await photoModeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await photoModeBtn.click();

    console.log('Importing woman portrait...');
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(womanPhoto);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const detectBtn = page.locator('button:has-text("Detect People")');
    await detectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtn.click();

    console.log('Waiting for MediaPipe detector & selfie segmenter...');
    await page.waitForSelector('text=Edge Defringe', { timeout: 45000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 45000 });
    await page.waitForTimeout(1500);

    // Capture screenshot of UI with detected subject
    const uiShot1 = path.join(OUTPUT_DIR, '01_woman_photo_mode_extracted.png');
    await page.screenshot({ path: uiShot1 });
    fs.copyFileSync(uiShot1, path.join(ARTIFACT_DIR, '01_woman_photo_mode_extracted.png'));
    console.log(`Saved screenshot: ${uiShot1}`);

    // Export Sticker PNG
    console.log('Exporting Sticker PNG from real browser...');
    const [dlSticker] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const exportedStickerPath = path.join(OUTPUT_DIR, 'woman_browser_sticker.png');
    await dlSticker.saveAs(exportedStickerPath);
    fs.copyFileSync(exportedStickerPath, path.join(ARTIFACT_DIR, 'woman_browser_sticker.png'));
    console.log(`Exported Sticker PNG: ${exportedStickerPath} (${fs.statSync(exportedStickerPath).size} bytes)`);

    // Export Artwork Only PNG
    console.log('Exporting Artwork Only PNG from real browser...');
    const [dlArtwork] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const exportedArtPath = path.join(OUTPUT_DIR, 'woman_browser_artwork_only.png');
    await dlArtwork.saveAs(exportedArtPath);
    fs.copyFileSync(exportedArtPath, path.join(ARTIFACT_DIR, 'woman_browser_artwork_only.png'));
    console.log(`Exported Artwork Only PNG: ${exportedArtPath} (${fs.statSync(exportedArtPath).size} bytes)`);

    // -------------------------------------------------------------------------
    // TEST 2: GROUP PHOTO (BEACH FAMILY) - FALSE PERSON DETECTION SUPPRESSION
    // -------------------------------------------------------------------------
    console.log('\n--- Running Test 2: Group Photo Overlap Suppression ---');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const fileInput2 = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput2.setInputFiles(beachPhoto);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const detectBtn2 = page.locator('button:has-text("Detect People")');
    await detectBtn2.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtn2.click();

    console.log('Detecting people in group photo...');
    await page.waitForSelector('text=Edge Defringe', { timeout: 45000 });
    await page.waitForTimeout(1500);

    const uiShot2 = path.join(OUTPUT_DIR, '02_beach_family_extracted.png');
    await page.screenshot({ path: uiShot2 });
    fs.copyFileSync(uiShot2, path.join(ARTIFACT_DIR, '02_beach_family_extracted.png'));
    console.log(`Saved screenshot: ${uiShot2}`);

    await browser.close();
    console.log('\nBrowser acceptance test completed successfully!');
  } finally {
    previewProcess.kill();
  }
}

runBrowserMattingAcceptance().catch(err => {
  console.error('Browser acceptance test failed:', err);
  process.exit(1);
});
