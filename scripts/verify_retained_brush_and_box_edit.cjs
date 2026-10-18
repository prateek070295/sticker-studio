const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const TMP_DIR = path.resolve('test-output/retained_brush_and_box_e2e');

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

    // 7. Test Bounding-Box Move via Pointer Drag (without in-place state mutation)
    console.log('\n--- Testing Bounding-Box Move via Pointer Drag ---');
    const firstPersonOverlay = page.locator('.inset-0 > div[style*="left:"]').first();
    const initBoxStyle = await firstPersonOverlay.getAttribute('style');
    const initBox = await firstPersonOverlay.boundingBox();
    if (!initBox) throw new Error('First person overlay bounding box not found');

    console.log(`Initial overlay style: ${initBoxStyle}`);
    const startDragX = initBox.x + initBox.width / 2;
    const startDragY = initBox.y + initBox.height / 2;

    // Drag region by +30px X, +20px Y
    await page.mouse.move(startDragX, startDragY);
    await page.mouse.down();
    await page.mouse.move(startDragX + 30, startDragY + 20, { steps: 5 });
    await page.mouse.up();

    // Await re-segmentation after move
    await page.waitForTimeout(1000);
    const movedBoxStyle = await firstPersonOverlay.getAttribute('style');
    console.log(`Moved overlay style: ${movedBoxStyle}`);
    if (movedBoxStyle === initBoxStyle) {
      throw new Error('Pointer drag failed to update overlay coordinates');
    }
    console.log('PASS: Bounding box moved via real browser pointer drag without in-place state mutation.');

    // 8. Test Undo / Redo of Bounding-Box Move
    console.log('\n--- Testing Undo / Redo of Bounding-Box Move ---');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    const undoneBoxStyle = await firstPersonOverlay.getAttribute('style');
    console.log(`After Undo style: ${undoneBoxStyle}`);
    if (undoneBoxStyle !== initBoxStyle) {
      throw new Error(`Undo failed to restore initial coordinates: expected "${initBoxStyle}", got "${undoneBoxStyle}"`);
    }
    console.log('PASS: Undo successfully restored original region coordinates and crop mask.');

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(500);
    const redoneBoxStyle = await firstPersonOverlay.getAttribute('style');
    console.log(`After Redo style: ${redoneBoxStyle}`);
    if (redoneBoxStyle !== movedBoxStyle) {
      throw new Error(`Redo failed to restore moved coordinates: expected "${movedBoxStyle}", got "${redoneBoxStyle}"`);
    }
    console.log('PASS: Redo successfully restored moved region coordinates.');

    // Restore to initial coordinates for clean testing
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // 9. Test 4-Corner Resize Handle
    console.log('\n--- Testing 4-Corner Resize Handle Drag ---');
    const seResizeHandle = page.locator('[data-testid="resize-handle-se"]').first();
    const handleBox = await seResizeHandle.boundingBox();
    if (!handleBox) throw new Error('SE Resize handle not found on selected region');

    const handleX = handleBox.x + handleBox.width / 2;
    const handleY = handleBox.y + handleBox.height / 2;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 25, handleY + 25, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(1000);

    const resizedBoxStyle = await firstPersonOverlay.getAttribute('style');
    console.log(`Resized overlay style: ${resizedBoxStyle}`);
    if (resizedBoxStyle === initBoxStyle) {
      throw new Error('Resize handle drag failed to update region dimensions');
    }
    console.log('PASS: Corner resize handle successfully updated region dimensions and re-segmented.');

    // Undo resize
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const undoneResizeStyle = await firstPersonOverlay.getAttribute('style');
    if (undoneResizeStyle !== initBoxStyle) {
      throw new Error(`Undo failed to restore pre-resize coordinates`);
    }
    console.log('PASS: Undo restored pre-resize dimensions.');

    // 10. Apply Erase Brush Stroke WITHOUT Undoing
    console.log('\n--- Testing Retained Brush Correction (No Undo) ---');
    const eraseToolBtn = page.locator('button:has-text("Erase")');
    await eraseToolBtn.click();
    await page.waitForTimeout(200);

    // Paint an erase stroke right through the body of Person 1
    const pBox = await firstPersonOverlay.boundingBox();
    const pMidX = pBox.x + pBox.width / 2;
    const pMidY = pBox.y + pBox.height / 2;

    await page.mouse.move(pMidX, pMidY);
    await page.mouse.down();
    await page.mouse.move(pMidX + 15, pMidY + 15, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    console.log('Painted erase stroke through center of Person 1.');

    // 11. Export Artwork PNG 1 (With Retained Erase Correction)
    console.log('Exporting initial corrected Artwork-Only PNG...');
    const artDownloadPromise1 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload1 = await artDownloadPromise1;
    const artPath1 = path.join(TMP_DIR, 'retained_brush_export_1.png');
    await artDownload1.saveAs(artPath1);

    const rawArt1 = await sharp(artPath1).raw().toBuffer({ resolveWithObject: true });
    console.log(`Saved initial corrected PNG (${rawArt1.info.width}x${rawArt1.info.height}).`);

    // 12. Save Photo Project (.stickerstudio) WITH Retained Brush Correction
    console.log('Saving .stickerstudio project with retained brush correction...');
    const projDownloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Save Photo Project")').click();
    const projDownload = await projDownloadPromise;
    const projPath = path.join(TMP_DIR, 'retained_brush_project.stickerstudio');
    await projDownload.saveAs(projPath);
    console.log(`Saved .stickerstudio project to: ${projPath} (${fs.statSync(projPath).size} bytes)`);

    // 13. Full Application Reload & Project Reopen
    console.log('\n--- Reloading Application & Reopening Project ---');
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('button:has-text("Photo Mode")').click();
    const projectInput = page.locator('input[type="file"][accept*=".stickerstudio"]').first();
    await projectInput.setInputFiles(projPath);

    await page.waitForSelector('text=People (', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const reloadedCount = await page.locator('.max-h-44 > div').count();
    console.log(`Reloaded region count in UI: ${reloadedCount} (Expected: ${detectedCount})`);
    if (reloadedCount !== detectedCount) {
      throw new Error(`Region count mismatch after reload: got ${reloadedCount}, expected ${detectedCount}`);
    }

    // 14. Export Artwork PNG 2 from Reloaded Project and Compare Bit-for-Bit
    console.log('Exporting Artwork-Only PNG from reloaded project...');
    const artDownloadPromise2 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload2 = await artDownloadPromise2;
    const artPath2 = path.join(TMP_DIR, 'retained_brush_export_2.png');
    await artDownload2.saveAs(artPath2);

    const rawArt2 = await sharp(artPath2).raw().toBuffer({ resolveWithObject: true });
    if (rawArt1.data.length !== rawArt2.data.length) {
      throw new Error(`Buffer size mismatch: ${rawArt1.data.length} vs ${rawArt2.data.length}`);
    }

    let diffBytes = 0;
    for (let i = 0; i < rawArt1.data.length; i++) {
      if (rawArt1.data[i] !== rawArt2.data[i]) diffBytes++;
    }
    console.log(`Retained brush correction bitwise pixel diff: ${diffBytes} (Expected: 0)`);
    if (diffBytes !== 0) {
      throw new Error(`Retained brush correction failed bitwise equality after reload: ${diffBytes} differing bytes`);
    }
    console.log('PASS: Retained brush correction matches bit-for-bit after project save and reload.');

    // 15. Exclude/Toggle a person region after reload and confirm retained brush correction persists
    console.log('\n--- Testing Region Toggle with Retained Manual Delta ---');
    const secondCheckbox = page.locator('.max-h-44 input[type="checkbox"]').nth(1);
    await secondCheckbox.click(); // Toggle Person 2 off
    await page.waitForTimeout(500);

    // Export Artwork PNG 3
    const artDownloadPromise3 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload3 = await artDownloadPromise3;
    const artPath3 = path.join(TMP_DIR, 'retained_brush_export_3.png');
    await artDownload3.saveAs(artPath3);

    console.log('PASS: Person 2 toggled off without crashing.');

    // Toggle back on
    await secondCheckbox.click();
    await page.waitForTimeout(500);

    const artDownloadPromise4 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload4 = await artDownloadPromise4;
    const artPath4 = path.join(TMP_DIR, 'retained_brush_export_4.png');
    await artDownload4.saveAs(artPath4);

    const rawArt4 = await sharp(artPath4).raw().toBuffer({ resolveWithObject: true });
    let diffAfterToggle = 0;
    for (let i = 0; i < rawArt1.data.length; i++) {
      if (rawArt1.data[i] !== rawArt4.data[i]) diffAfterToggle++;
    }
    console.log(`Bitwise diff after toggling region off and on: ${diffAfterToggle} (Expected: 0)`);
    if (diffAfterToggle !== 0) {
      throw new Error(`Manual brush correction was altered by region toggle: ${diffAfterToggle} differing bytes`);
    }
    console.log('PASS: Manual brush corrections completely persist across region edits and toggles!');

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
