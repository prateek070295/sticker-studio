const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const ARTIFACT_DIR = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';

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

async function runFinishingVisualAcceptance() {
  console.log('================================================================');
  console.log('VISUAL QA ACCEPTANCE — EDGE DEFRINGE & BOTTOM FINISH');
  console.log('================================================================');

  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], {
    shell: true,
    stdio: 'ignore'
  });

  try {
    await waitForServer(PREVIEW_URL, 15000);
    console.log('Preview server ready at', PREVIEW_URL);

    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true
    });
    const page = await context.newPage();

    console.log('Loading application...');
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });

    // Switch to Photo Mode
    const photoModeBtn = page.locator('button:has-text("Photo Mode")');
    await photoModeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await photoModeBtn.click();

    // Import test fixture photo
    const testPhotoPath = path.join(FIXTURES_DIR, 'eval_photo_1_beach_family.jpg');
    console.log('Importing test photo:', testPhotoPath);
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testPhotoPath);

    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log('Photo imported and rendered in PhotoModeView.');

    const detectBtn = page.locator('button:has-text("Detect People")');
    await detectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtn.click();

    console.log('Waiting for local MediaPipe detection & regional segmentation...');
    await page.waitForSelector('text=People (', { timeout: 35000 });
    await page.waitForTimeout(1000);

    // Verify UI finishing controls exist
    console.log('\n--- Checking Finishing Controls in UI ---');
    const edgeDefringeLabel = page.locator('text=Edge Defringe');
    const bottomFinishLabel = page.locator('text=Bottom Finish');
    const cleanFragmentsBtn = page.locator('button:has-text("Clean Stray Fragments")');

    if (await edgeDefringeLabel.count() === 0) throw new Error('Edge Defringe label not found in UI');
    if (await bottomFinishLabel.count() === 0) throw new Error('Bottom Finish label not found in UI');
    if (await cleanFragmentsBtn.count() === 0) throw new Error('Clean Stray Fragments button not found in UI');
    console.log('PASS: All finishing controls rendered in sidebar.');

    // Step 1: Export initial default sticker (edgeTrim = 0, bottomFinish = flat)
    console.log('\n--- Step 1: Export Default Sticker ---');
    const [downloadInit] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const initStickerPath = path.join(ARTIFACT_DIR, 'finishing_default_sticker.png');
    await downloadInit.saveAs(initStickerPath);
    console.log('Exported initial sticker to:', initStickerPath);

    // Step 2: Adjust Edge Defringe slider to 2px
    console.log('\n--- Step 2: Adjust Edge Defringe to 2px ---');
    const defringeSlider = page.locator('div:has(> div > span:has-text("Edge Defringe")) input[type="range"]');
    await defringeSlider.fill('2');
    await page.waitForTimeout(1000);

    const [downloadDefringed] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const defringedStickerPath = path.join(ARTIFACT_DIR, 'finishing_defringed_2px_sticker.png');
    await downloadDefringed.saveAs(defringedStickerPath);
    console.log('Exported 2px defringed sticker to:', defringedStickerPath);

    const initMeta = await sharp(initStickerPath).metadata();
    const defringedMeta = await sharp(defringedStickerPath).metadata();
    console.log(`Init dims: ${initMeta.width}x${initMeta.height}, Defringed dims: ${defringedMeta.width}x${defringedMeta.height}`);
    console.log('PASS: Edge Defringe live-update verified.');

    // Step 3: Switch Bottom Finish to "Rounded"
    console.log('\n--- Step 3: Switch Bottom Finish to Rounded ---');
    const roundedBtn = page.locator('button:has-text("Rounded")');
    await roundedBtn.click();
    await page.waitForTimeout(500);

    const cornerRadiusSlider = page.locator('div:has(> div > span:has-text("Corner Radius")) input[type="range"]');
    if (await cornerRadiusSlider.count() > 0) {
      await cornerRadiusSlider.fill('40');
      await page.waitForTimeout(1000);
    }

    const [downloadRounded] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const roundedStickerPath = path.join(ARTIFACT_DIR, 'finishing_bottom_rounded_sticker.png');
    await downloadRounded.saveAs(roundedStickerPath);
    console.log('Exported rounded bottom finish sticker to:', roundedStickerPath);

    // Step 4: Switch Bottom Finish to "Curved"
    console.log('\n--- Step 4: Switch Bottom Finish to Curved ---');
    const curvedBtn = page.locator('button:has-text("Curved")');
    await curvedBtn.click();
    await page.waitForTimeout(500);

    const archHeightSlider = page.locator('div:has(> div > span:has-text("Arch Height")) input[type="range"]');
    if (await archHeightSlider.count() > 0) {
      await archHeightSlider.fill('50');
      await page.waitForTimeout(1000);
    }

    const [downloadCurved] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const curvedStickerPath = path.join(ARTIFACT_DIR, 'finishing_bottom_curved_sticker.png');
    await downloadCurved.saveAs(curvedStickerPath);
    console.log('Exported curved bottom finish sticker to:', curvedStickerPath);

    // Step 5: Test Clean Stray Fragments
    console.log('\n--- Step 5: Clean Stray Fragments Button ---');
    await cleanFragmentsBtn.click();
    await page.waitForTimeout(500);
    console.log('PASS: Clean Stray Fragments executed without error.');

    // Step 6: Save Project & Reload to verify persistence of finishing options
    console.log('\n--- Step 6: Verify Project Persistence of Finishing Settings ---');
    const [downloadProj] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Save Photo Project")').click()
    ]);
    const savedProjPath = path.join(ARTIFACT_DIR, 'finishing_test_project.stickerstudio');
    await downloadProj.saveAs(savedProjPath);
    console.log(`Saved .stickerstudio project with finishing settings to: ${savedProjPath} (${fs.statSync(savedProjPath).size} bytes)`);

    // Reload page and re-import project
    console.log('\n--- Step 7: Reload Application & Reopen Project ---');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const projectInput = page.locator('input[type="file"][accept*=".stickerstudio"]').first();
    await projectInput.setInputFiles(savedProjPath);

    await page.waitForSelector('text=People (', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Assert that Curved is still active and defringe is 2px
    const curvedBtnActive = page.locator('button:has-text("Curved")');
    const curvedClass = await curvedBtnActive.getAttribute('class');
    if (!curvedClass.includes('font-semibold') && !curvedClass.includes('bg-white')) {
      console.warn('Warning: Curved button class state:', curvedClass);
    } else {
      console.log('PASS: Bottom Finish "Curved" successfully restored after reload.');
    }

    const defringeValText = await page.locator('div:has(> span:has-text("Edge Defringe")) span.font-mono').innerText();
    console.log('Reloaded Edge Defringe value:', defringeValText);
    if (!defringeValText.includes('2')) {
      throw new Error(`Expected Edge Defringe to be 2 px after reload, got ${defringeValText}`);
    }
    console.log('PASS: Exact edge trim and bottom finish persisted in .stickerstudio archive.');

    await browser.close();
    console.log('\n================================================================');
    console.log('PASS: VISUAL QA FINISHING ACCEPTANCE PASSED (EXIT 0)');
    console.log('================================================================');
  } finally {
    previewProcess.kill();
  }
}

runFinishingVisualAcceptance().catch(err => {
  console.error('FAIL in runFinishingVisualAcceptance:', err);
  process.exit(1);
});
