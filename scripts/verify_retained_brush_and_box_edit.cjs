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
  console.log('GENUINE PRODUCTION PREVIEW E2E ACCEPTANCE TEST (BRUSH & BOX)');
  console.log('================================================================\n');

  // Start Vite preview server
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

    // 1. Switch to Photo Mode & Import Photograph
    console.log('\n--- Step 1: Import Photograph & Detect People ---');
    const photoModeBtn = page.locator('button:has-text("Photo Mode")');
    await photoModeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await photoModeBtn.click();

    const testPhotoPath = path.join(FIXTURES_DIR, 'eval_photo_1_beach_family.jpg');
    if (!fs.existsSync(testPhotoPath)) {
      throw new Error(`Test fixture not found: ${testPhotoPath}`);
    }

    console.log(`Importing test photo: ${testPhotoPath}...`);
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testPhotoPath);

    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log('Photo imported and rendered in PhotoModeView.');

    const detectBtn = page.locator('button:has-text("Detect People")');
    await detectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtn.click();

    console.log('Waiting for local MediaPipe detection & regional segmentation...');
    await page.waitForSelector('text=People (', { timeout: 30000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('button');
      return btn && !btn.disabled;
    }, { timeout: 15000 });

    const peopleListItems = page.locator('.max-h-44 > div');
    const detectedCount = await peopleListItems.count();
    console.log(`Detected people candidates rendered in UI: ${detectedCount}`);
    if (detectedCount < 12) {
      throw new Error(`Expected at least 12 detected people, got ${detectedCount}`);
    }

    // 2. Export artwork-only PNG before editing
    console.log('\n--- Step 2: Export Artwork-Only PNG Before Editing ---');
    const artDownloadPromise0 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload0 = await artDownloadPromise0;
    const artPath0 = path.join(TMP_DIR, 'artwork_0_before_edit.png');
    await artDownload0.saveAs(artPath0);

    const rawArt0 = await sharp(artPath0).raw().toBuffer({ resolveWithObject: true });
    console.log(`Exported pre-edit artwork PNG: ${rawArt0.info.width}x${rawArt0.info.height} (${rawArt0.data.length} bytes)`);

    // 3. Activate Erase
    console.log('\n--- Step 3: Activate Erase Tool ---');
    const eraseBtn = page.locator('button:has-text("Erase")');
    await eraseBtn.click();
    await page.waitForTimeout(200);

    const eraseBtnClass0 = await eraseBtn.getAttribute('class');
    if (!eraseBtnClass0.includes('bg-red-50')) {
      throw new Error('Erase button did not activate properly');
    }
    console.log('Erase tool mode is active.');

    // 4. Perform a real pointer stroke inside a detected person's bounding box
    console.log('\n--- Step 4: Perform Real Pointer Stroke Inside Person 1 Box ---');
    const firstPersonOverlay = page.locator('.inset-0 > div[style*="left:"]').first();
    const pBox = await firstPersonOverlay.boundingBox();
    if (!pBox) throw new Error('Person 1 overlay bounding box not found in DOM');

    console.log(`Person 1 screen bounds: x=${Math.round(pBox.x)}, y=${Math.round(pBox.y)}, w=${Math.round(pBox.width)}, h=${Math.round(pBox.height)}`);
    const strokeStartX = pBox.x + pBox.width / 2;
    const strokeStartY = pBox.y + pBox.height / 3;
    const strokeEndY = pBox.y + (2 * pBox.height) / 3;

    await page.mouse.move(strokeStartX, strokeStartY);
    await page.mouse.down();
    await page.mouse.move(strokeStartX, strokeEndY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    console.log('Completed pointer erase stroke inside Person 1 bounding box.');

    // 5. Export artwork-only PNG again
    console.log('\n--- Step 5: Export Artwork-Only PNG After Erase ---');
    const artDownloadPromise1 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload1 = await artDownloadPromise1;
    const artPath1 = path.join(TMP_DIR, 'artwork_1_after_erase.png');
    await artDownload1.saveAs(artPath1);

    const rawArt1 = await sharp(artPath1).raw().toBuffer({ resolveWithObject: true });
    console.log(`Exported post-erase artwork PNG: ${rawArt1.info.width}x${rawArt1.info.height}`);

    // 6. Assert that alpha pixels actually changed in the intended stroke area
    console.log('\n--- Step 6: Assert Alpha Pixels Changed in Intended Stroke Area ---');
    if (rawArt0.data.length !== rawArt1.data.length) {
      throw new Error(`Buffer dimensions changed unexpectedly: ${rawArt0.data.length} vs ${rawArt1.data.length}`);
    }

    let erasedAlphaPixels = 0;
    const pixelCount = rawArt0.data.length / 4;
    for (let i = 0; i < pixelCount; i++) {
      const a0 = rawArt0.data[i * 4 + 3];
      const a1 = rawArt1.data[i * 4 + 3];
      if (a0 > 0 && a1 === 0) {
        erasedAlphaPixels++;
      }
    }
    console.log(`Measured erased alpha pixels: ${erasedAlphaPixels}`);
    if (erasedAlphaPixels === 0) {
      throw new Error('FAIL: Erase pointer stroke failed to modify any alpha pixels! (Overlay blocked pointer event)');
    }
    console.log(`PASS: Real alpha pixel erasure verified (${erasedAlphaPixels} pixels transitioned from opaque to transparent).`);

    // 7. Assert that unrelated areas did not change
    console.log('\n--- Step 7: Assert Unrelated Areas Did Not Change ---');
    let spuriousAlphaGains = 0;
    let distantDifferences = 0;
    const W = rawArt0.info.width;
    const H = rawArt0.info.height;

    // Any pixel in the right half of the image (distant from Person 1 on the left) must be identical
    for (let y = 0; y < H; y++) {
      for (let x = Math.floor(W * 0.6); x < W; x++) {
        const idx = (y * W + x) * 4;
        for (let c = 0; c < 4; c++) {
          if (rawArt0.data[idx + c] !== rawArt1.data[idx + c]) {
            distantDifferences++;
          }
        }
      }
    }

    for (let i = 0; i < pixelCount; i++) {
      const a0 = rawArt0.data[i * 4 + 3];
      const a1 = rawArt1.data[i * 4 + 3];
      if (a0 === 0 && a1 > 0) {
        spuriousAlphaGains++;
      }
    }

    console.log(`Spurious alpha gains during erase: ${spuriousAlphaGains}`);
    console.log(`Distant differences on unrelated subjects: ${distantDifferences}`);
    if (spuriousAlphaGains > 0) {
      throw new Error(`FAIL: Erase stroke generated ${spuriousAlphaGains} spurious alpha pixels!`);
    }
    if (distantDifferences > 0) {
      throw new Error(`FAIL: Erase stroke corrupted ${distantDifferences} distant pixel channels!`);
    }
    console.log('PASS: Unrelated areas and distant subjects remained completely untouched.');

    // 8. Confirm the active tool did not silently switch to Select Person
    console.log('\n--- Step 8: Confirm Active Tool Did Not Silently Switch ---');
    const eraseBtnClass1 = await eraseBtn.getAttribute('class');
    const selectBtn = page.locator('button:has-text("Select")');
    const selectBtnClass1 = await selectBtn.getAttribute('class');

    console.log(`Erase button class: ${eraseBtnClass1}`);
    console.log(`Select button class: ${selectBtnClass1}`);
    if (!eraseBtnClass1.includes('bg-red-50 text-red-700')) {
      throw new Error('FAIL: Active tool mode was silently changed away from Erase!');
    }
    if (selectBtnClass1.includes('bg-sky-50 text-sky-700')) {
      throw new Error('FAIL: Tool mode was hijacked to Select Person during brushing!');
    }
    console.log('PASS: Active tool remained Erase throughout pointer stroke.');

    // 9. Save project WITHOUT undoing the brush correction
    console.log('\n--- Step 9: Save Project Without Undoing Brush Correction ---');
    const projDownloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Save Photo Project")').click();
    const projDownload = await projDownloadPromise;
    const projPath = path.join(TMP_DIR, 'retained_brush_project.stickerstudio');
    await projDownload.saveAs(projPath);
    console.log(`Saved .stickerstudio project to: ${projPath} (${fs.statSync(projPath).size} bytes)`);

    // 10. Reload and reopen the saved project
    console.log('\n--- Step 10: Reload Application & Reopen Project ---');
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('button:has-text("Photo Mode")').click();
    const projectInput = page.locator('input[type="file"][accept*=".stickerstudio"]').first();
    await projectInput.setInputFiles(projPath);

    await page.waitForSelector('text=People (', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const reloadedCount = await page.locator('.max-h-44 > div').count();
    console.log(`Reloaded candidate count: ${reloadedCount} (Expected: ${detectedCount})`);
    if (reloadedCount !== detectedCount) {
      throw new Error(`Region count mismatch after reload: got ${reloadedCount}, expected ${detectedCount}`);
    }

    // 11. Re-export and verify exact decoded RGBA equality
    console.log('\n--- Step 11: Re-export & Verify Exact Decoded RGBA Equality ---');
    const artDownloadPromise2 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload2 = await artDownloadPromise2;
    const artPath2 = path.join(TMP_DIR, 'artwork_2_reloaded.png');
    await artDownload2.saveAs(artPath2);

    const rawArt2 = await sharp(artPath2).raw().toBuffer({ resolveWithObject: true });
    let reloadDiffBytes = 0;
    for (let i = 0; i < rawArt1.data.length; i++) {
      if (rawArt1.data[i] !== rawArt2.data[i]) reloadDiffBytes++;
    }
    console.log(`Reloaded RGBA diff bytes: ${reloadDiffBytes} (Expected: 0)`);
    if (reloadDiffBytes !== 0) {
      throw new Error(`FAIL: Retained brush correction altered after reload: ${reloadDiffBytes} differing bytes!`);
    }
    console.log('PASS: Retained brush correction matches bit-for-bit after project save and reload.');

    // 12. Toggle a person off and on and confirm the correction persists
    console.log('\n--- Step 12: Toggle Person Off & On With Retained Correction ---');
    const secondCheckbox = page.locator('.max-h-44 input[type="checkbox"]').nth(1);
    await secondCheckbox.click(); // Toggle Person 2 off
    await page.waitForTimeout(500);

    await secondCheckbox.click(); // Toggle Person 2 back on
    await page.waitForTimeout(500);

    const artDownloadPromise3 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload3 = await artDownloadPromise3;
    const artPath3 = path.join(TMP_DIR, 'artwork_3_after_toggle.png');
    await artDownload3.saveAs(artPath3);

    const rawArt3 = await sharp(artPath3).raw().toBuffer({ resolveWithObject: true });
    let toggleDiffBytes = 0;
    for (let i = 0; i < rawArt1.data.length; i++) {
      if (rawArt1.data[i] !== rawArt3.data[i]) toggleDiffBytes++;
    }
    console.log(`Toggle off/on diff bytes against erased artwork: ${toggleDiffBytes} (Expected: 0)`);
    if (toggleDiffBytes !== 0) {
      throw new Error(`FAIL: Manual brush delta was corrupted by region toggle: ${toggleDiffBytes} differing bytes!`);
    }
    console.log('PASS: Manual brush corrections completely persist across region toggling.');

    // 13. Activate Restore and demonstrate an actual alpha restoration
    console.log('\n--- Step 13: Activate Restore & Demonstrate Actual Alpha Restoration ---');
    const restoreBtn = page.locator('button:has-text("Restore")');
    await restoreBtn.click();
    await page.waitForTimeout(200);

    const restoreBtnClass = await restoreBtn.getAttribute('class');
    if (!restoreBtnClass.includes('bg-emerald-50 text-emerald-700')) {
      throw new Error('Restore button did not activate properly');
    }

    // Paint restore stroke over the upper portion of the erased area
    await page.mouse.move(strokeStartX, strokeStartY);
    await page.mouse.down();
    await page.mouse.move(strokeStartX, strokeStartY + 25, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const artDownloadPromise4 = page.waitForEvent('download');
    await page.locator('div.border-t button:has-text("Artwork Only")').click();
    const artDownload4 = await artDownloadPromise4;
    const artPath4 = path.join(TMP_DIR, 'artwork_4_after_restore.png');
    await artDownload4.saveAs(artPath4);

    const rawArt4 = await sharp(artPath4).raw().toBuffer({ resolveWithObject: true });
    let restoredAlphaPixels = 0;
    for (let i = 0; i < pixelCount; i++) {
      const a1 = rawArt1.data[i * 4 + 3];
      const a4 = rawArt4.data[i * 4 + 3];
      if (a1 === 0 && a4 > 0) {
        restoredAlphaPixels++;
      }
    }
    console.log(`Measured restored alpha pixels: ${restoredAlphaPixels}`);
    if (restoredAlphaPixels === 0) {
      throw new Error('FAIL: Restore pointer stroke failed to restore any alpha pixels! (Overlay blocked pointer event)');
    }
    console.log(`PASS: Real alpha pixel restoration verified (${restoredAlphaPixels} pixels transitioned from transparent back to opaque).`);

    const restoreBtnClassAfter = await restoreBtn.getAttribute('class');
    if (!restoreBtnClassAfter.includes('bg-emerald-50 text-emerald-700')) {
      throw new Error('FAIL: Active tool mode was changed away from Restore during brushing!');
    }
    console.log('PASS: Tool remained Restore throughout restoration stroke.');

    // 14. Return to Select Person and confirm move, corner resize and Undo/Redo still work
    console.log('\n--- Step 14: Return to Select Person & Confirm Move, Resize, Undo/Redo ---');
    await selectBtn.click();
    await page.waitForTimeout(200);

    const selectBtnClassFinal = await selectBtn.getAttribute('class');
    if (!selectBtnClassFinal.includes('bg-sky-50 text-sky-700')) {
      throw new Error('Select button failed to activate');
    }

    // A. Move region via pointer drag
    const initBoxStyle = await firstPersonOverlay.getAttribute('style');
    const initBox = await firstPersonOverlay.boundingBox();
    if (!initBox) throw new Error('Person 1 bounding box not found in Select mode');

    console.log(`Initial overlay style in Select mode: ${initBoxStyle}`);
    const startDragX = initBox.x + initBox.width / 2;
    const startDragY = initBox.y + initBox.height / 2;

    await page.mouse.move(startDragX, startDragY);
    await page.mouse.down();
    await page.mouse.move(startDragX + 30, startDragY + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(1000);

    const movedBoxStyle = await firstPersonOverlay.getAttribute('style');
    console.log(`Moved overlay style: ${movedBoxStyle}`);
    if (movedBoxStyle === initBoxStyle) {
      throw new Error('Pointer drag failed to update overlay coordinates in Select mode');
    }
    console.log('PASS: Bounding box moved via pointer drag in Select mode.');

    // B. Undo / Redo of Move
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const undoneBoxStyle = await firstPersonOverlay.getAttribute('style');
    if (undoneBoxStyle !== initBoxStyle) {
      throw new Error(`Undo failed to restore initial coordinates: expected "${initBoxStyle}", got "${undoneBoxStyle}"`);
    }
    console.log('PASS: Undo restored pre-move coordinates.');

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(500);
    const redoneBoxStyle = await firstPersonOverlay.getAttribute('style');
    if (redoneBoxStyle !== movedBoxStyle) {
      throw new Error(`Redo failed to restore moved coordinates: expected "${movedBoxStyle}", got "${redoneBoxStyle}"`);
    }
    console.log('PASS: Redo restored moved coordinates.');

    // Undo move back to initial coordinates
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // C. 4-Corner Resize Handle
    const seResizeHandle = page.locator('[data-testid="resize-handle-se"]').first();
    await seResizeHandle.waitFor({ state: 'visible', timeout: 3000 });
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
    console.log('PASS: Corner resize handle successfully updated dimensions.');

    // D. Undo resize
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const undoneResizeStyle = await firstPersonOverlay.getAttribute('style');
    if (undoneResizeStyle !== initBoxStyle) {
      throw new Error('Undo failed to restore pre-resize coordinates');
    }
    console.log('PASS: Undo restored pre-resize dimensions.');

    await browser.close();
    console.log('\n================================================================');
    console.log('PASS: ALL 14 BRUSH & BOX REGRESSION ASSERTIONS PASSED (EXIT 0)');
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
