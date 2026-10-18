const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const TMP_DIR = path.resolve('test-output/preview_acceptance_e2e');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function waitForServer(url, timeoutMs = 15000) {
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

async function runRealProductionPreviewAcceptance() {
  console.log('================================================================');
  console.log('GENUINE PRODUCTION PREVIEW E2E ACCEPTANCE TEST');
  console.log('================================================================\n');

  // 1. Start Vite preview server
  console.log(`Starting Vite production preview on port ${PREVIEW_PORT}...`);
  const previewProcess = spawn('npx.cmd', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: path.resolve('.'),
    stdio: 'pipe',
    shell: true,
  });

  previewProcess.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('Local:')) console.log(`  [Preview Server] ${str.trim()}`);
  });
  previewProcess.stderr.on('data', (d) => {
    console.error(`  [Preview Server Error] ${d.toString().trim()}`);
  });

  try {
    await waitForServer(PREVIEW_URL, 20000);
    console.log(`Preview server is ready at ${PREVIEW_URL}\n`);

    // 2. Launch Chromium browser
    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
    });

    const page = await context.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('WebGL') && !txt.includes('XNNPACK')) {
        console.log(`  [Browser Console] ${txt}`);
      }
    });

    console.log('Navigating to application in production preview...');
    await page.goto(PREVIEW_URL);
    await page.waitForLoadState('networkidle');

    // 3. Switch to Photo Mode
    console.log('Switching to Photo Mode via UI...');
    const photoModeBtn = page.locator('button:has-text("Photo Mode")');
    await photoModeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await photoModeBtn.click();

    // 4. Import test photo (eval_photo_1_beach_family.jpg)
    const testPhotoPath = path.join(FIXTURES_DIR, 'eval_photo_1_beach_family.jpg');
    if (!fs.existsSync(testPhotoPath)) {
      throw new Error(`Test fixture not found: ${testPhotoPath}`);
    }

    console.log(`Importing test photo: ${testPhotoPath}...`);
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testPhotoPath);

    // Wait for PhotoModeView canvas to render
    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log('Photo imported and rendered in PhotoModeView.');

    // 5. Click "Detect People" button
    console.log('Clicking "Detect People" button in UI...');
    const detectBtn = page.locator('button:has-text("Detect People")');
    await detectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtn.click();

    // Wait for detection and segmentation to finish
    console.log('Waiting for local MediaPipe detection & regional segmentation...');
    await page.waitForSelector('text=People (', { timeout: 30000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button');
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    // 6. Inspect detected people list in DOM
    const peopleListItems = page.locator('.max-h-44 > div');
    const detectedCount = await peopleListItems.count();
    console.log(`Detected people candidates rendered in UI: ${detectedCount}`);
    if (detectedCount < 12) {
      throw new Error(`Expected at least 12 detected people, got ${detectedCount}`);
    }

    // 7. Add Missing Person via interactive drawing
    console.log('\n--- Testing "Add Person" Drawing Tool ---');
    const addPersonBtn = page.locator('button[title="Draw a rectangle around missing person"]');
    await addPersonBtn.click();

    // Get canvas bounding client rect
    const canvasEl = page.locator('canvas').first();
    const canvasBox = await canvasEl.boundingBox();
    if (!canvasBox) throw new Error('Canvas bounding box not found');

    // Draw a box over background silhouette at (x: 450, y: 350)
    const startX = canvasBox.x + canvasBox.width * 0.40;
    const startY = canvasBox.y + canvasBox.height * 0.45;
    const endX = startX + canvasBox.width * 0.05;
    const endY = startY + canvasBox.height * 0.12;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();

    // Wait for manual region segmentation to complete
    console.log('Drawn manual person bounding box; awaiting regional segmentation...');
    await page.waitForTimeout(1000);
    const newCount = await peopleListItems.count();
    console.log(`People count after manual addition: ${newCount} (Expected: ${detectedCount + 1})`);
    if (newCount !== detectedCount + 1) {
      throw new Error(`Manual addition failed to increment region count from ${detectedCount}`);
    }

    // 8. Test Toggle Person Inclusion
    console.log('\n--- Testing Toggle Person Inclusion ---');
    const firstCheckbox = page.locator('.max-h-44 input[type="checkbox"]').first();
    const isInitiallyChecked = await firstCheckbox.isChecked();
    if (!isInitiallyChecked) throw new Error('First person should be included by default');

    await firstCheckbox.click();
    const isNowChecked = await firstCheckbox.isChecked();
    if (isNowChecked) throw new Error('First person should be excluded after toggle');
    console.log('Toggled person inclusion off successfully.');

    // 9. Test Undo / Redo
    console.log('\n--- Testing Undo / Redo ---');
    // Press Ctrl+Z to undo exclusion
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const isRestoredChecked = await firstCheckbox.isChecked();
    console.log(`After Undo: Checkbox is checked = ${isRestoredChecked} (Expected: true)`);
    if (!isRestoredChecked) throw new Error('Undo failed to restore person inclusion');

    // Press Ctrl+Shift+Z to redo exclusion
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(300);
    const isRedoneChecked = await firstCheckbox.isChecked();
    console.log(`After Redo: Checkbox is checked = ${isRedoneChecked} (Expected: false)`);
    if (isRedoneChecked) throw new Error('Redo failed to re-exclude person');

    // Restore it back for full export
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // 10. Test Brush Erase & Undo
    console.log('\n--- Testing Manual Erase Brush Tool ---');
    const eraseToolBtn = page.locator('button:has-text("Erase")');
    await eraseToolBtn.click();

    // Find the first person's overlay box on screen
    const personOverlay = page.locator('.inset-0 > div[style*="left:"]').first();
    const overlayBox = await personOverlay.boundingBox();
    if (!overlayBox) throw new Error('Person overlay box not found on screen');

    const pMidX = overlayBox.x + overlayBox.width / 2;
    const pMidY = overlayBox.y + overlayBox.height / 2;

    // Paint an erase stroke directly over the center of the first person
    await page.mouse.move(pMidX, pMidY);
    await page.mouse.down();
    await page.mouse.move(pMidX + 10, pMidY + 10, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    console.log('Painted erase stroke on canvas.');

    // Undo the brush stroke
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    console.log('Undid brush stroke successfully.');

    const preExportCount = await peopleListItems.count();
    console.log(`Pre-export people count: ${preExportCount} (Expected: ${newCount})`);
    if (preExportCount !== newCount) {
      throw new Error(`Pre-export count mismatch: expected ${newCount}, got ${preExportCount}`);
    }

    // 11. Export Actual Downloads via UI
    console.log('\n--- Exporting Real Downloads via UI Controls ---');
    // Artwork-Only PNG
    const artDownloadPromise = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload = await artDownloadPromise;
    const artPath1 = path.join(TMP_DIR, 'preview_export_artwork_1.png');
    await artDownload.saveAs(artPath1);
    console.log(`Saved artwork-only PNG to: ${artPath1} (${fs.statSync(artPath1).size} bytes)`);

    // White-Backed PNG
    const wbDownloadPromise = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Export Sticker PNG")').click();
    const wbDownload = await wbDownloadPromise;
    const wbPath1 = path.join(TMP_DIR, 'preview_export_white_backed_1.png');
    await wbDownload.saveAs(wbPath1);
    console.log(`Saved white-backed PNG to: ${wbPath1} (${fs.statSync(wbPath1).size} bytes)`);

    // Save Photo Project (.stickerstudio)
    const projDownloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Save Photo Project")').click();
    const projDownload = await projDownloadPromise;
    const projPath = path.join(TMP_DIR, 'preview_export_project.stickerstudio');
    await projDownload.saveAs(projPath);
    console.log(`Saved .stickerstudio project to: ${projPath} (${fs.statSync(projPath).size} bytes)`);

    // 12. Test Full Application Reload and Project Open Round-Trip
    console.log('\n--- Testing Real Application Reload & Project Reopen ---');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Switch to Photo Mode
    await page.locator('button:has-text("Photo Mode")').click();

    // Load project file via hidden project input or main load input
    const projectInput = page.locator('input[type="file"][accept*=".stickerstudio"]').first();
    await projectInput.setInputFiles(projPath);

    // Wait for project to restore
    console.log('Uploaded .stickerstudio file; awaiting project restoration...');
    await page.waitForSelector('text=People (', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const reloadedPeopleCount = await page.locator('.max-h-44 > div').count();
    console.log(`Reloaded project candidate count in UI: ${reloadedPeopleCount} (Expected: ${newCount})`);
    if (reloadedPeopleCount !== newCount) {
      throw new Error(`Project reload region count mismatch: got ${reloadedPeopleCount}, expected ${newCount}`);
    }

    // 13. Re-export both PNGs from the reloaded UI
    console.log('Re-exporting PNGs from reloaded project...');
    const art2DownloadPromise = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const art2Download = await art2DownloadPromise;
    const artPath2 = path.join(TMP_DIR, 'preview_export_artwork_2.png');
    await art2Download.saveAs(artPath2);

    const wb2DownloadPromise = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Export Sticker PNG")').click();
    const wb2Download = await wb2DownloadPromise;
    const wbPath2 = path.join(TMP_DIR, 'preview_export_white_backed_2.png');
    await wb2Download.saveAs(wbPath2);

    // 14. Bitwise pixel equality comparison using sharp
    console.log('\n--- Comparing Bitwise RGBA Decoded Pixels ---');
    const artBuf1 = await sharp(artPath1).raw().toBuffer();
    const artBuf2 = await sharp(artPath2).raw().toBuffer();
    if (artBuf1.length !== artBuf2.length) {
      throw new Error(`Artwork buffer length mismatch: ${artBuf1.length} vs ${artBuf2.length}`);
    }
    let artDiff = 0;
    for (let i = 0; i < artBuf1.length; i++) {
      if (artBuf1[i] !== artBuf2[i]) artDiff++;
    }
    console.log(`Artwork-Only RGBA bitwise pixel diff: ${artDiff} (Expected: 0)`);
    if (artDiff !== 0) throw new Error(`Artwork PNG pixel mismatch after project reload: ${artDiff} diff bytes`);

    const wbBuf1 = await sharp(wbPath1).raw().toBuffer();
    const wbBuf2 = await sharp(wbPath2).raw().toBuffer();
    if (wbBuf1.length !== wbBuf2.length) {
      throw new Error(`White-backed buffer length mismatch: ${wbBuf1.length} vs ${wbBuf2.length}`);
    }
    let wbDiff = 0;
    for (let i = 0; i < wbBuf1.length; i++) {
      if (wbBuf1[i] !== wbBuf2[i]) wbDiff++;
    }
    console.log(`White-Backed RGBA bitwise pixel diff: ${wbDiff} (Expected: 0)`);
    if (wbDiff !== 0) throw new Error(`White-backed PNG pixel mismatch after project reload: ${wbDiff} diff bytes`);

    await browser.close();
    console.log('\n================================================================');
    console.log('PASS: ALL REAL UI PRODUCTION PREVIEW ASSERTIONS PASSED (EXIT 0)');
    console.log('================================================================\n');
  } finally {
    previewProcess.kill();
  }
}

runRealProductionPreviewAcceptance()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFAIL: Real Production Preview Acceptance Test Failed:', err);
    process.exit(1);
  });
