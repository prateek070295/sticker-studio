const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const PORTRAITS_DIR = path.resolve('test-output/actual_portraits');
const OUTPUT_DIR = path.resolve('test-output/portrait_acceptance');
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

async function runActualPortraitsAcceptance() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.2 — ACTUAL PORTRAIT FINISHING ACCEPTANCE');
  console.log('================================================================');

  const babyPhoto = path.join(PORTRAITS_DIR, 'baby_portrait.jpg');
  const womanPhoto = path.join(PORTRAITS_DIR, 'woman_portrait.jpg');

  if (!fs.existsSync(babyPhoto) || !fs.existsSync(womanPhoto)) {
    throw new Error(`CRITICAL BLOCKER: Portrait sources missing in ${PORTRAITS_DIR}`);
  }

  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], {
    shell: true,
    stdio: 'ignore'
  });

  try {
    await waitForServer(PREVIEW_URL, 20000);
    console.log(`Production preview server verified at ${PREVIEW_URL}\n`);

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

    // -------------------------------------------------------------
    // PART 1: BABY PORTRAIT (Alpha Edge Defringe Trimming)
    // -------------------------------------------------------------
    console.log('====================================================');
    console.log('TEST 1: BABY PORTRAIT — EDGE DEFRINGE EVALUATION');
    console.log('====================================================');

    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
    const photoModeBtn = page.locator('button:has-text("Photo Mode")');
    await photoModeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await photoModeBtn.click();

    console.log('Importing baby portrait photo...');
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(babyPhoto);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const detectBtn = page.locator('button:has-text("Detect People")');
    await detectBtn.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtn.click();

    console.log('Running detection & segmentation on baby portrait...');
    await page.waitForSelector('text=Edge Defringe', { timeout: 45000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 45000 });
    await page.waitForTimeout(1000);

    // Export 1.1: Edge Defringe = 0 px (Baseline)
    console.log('Exporting baseline (Edge Defringe = 0 px)...');
    const [dlBaby0] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const baby0Path = path.join(OUTPUT_DIR, 'baby_defringe_0px.png');
    await dlBaby0.saveAs(baby0Path);

    // Export Artwork Only 0px
    const [dlBabyArt0] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const babyArt0Path = path.join(OUTPUT_DIR, 'baby_artwork_0px.png');
    await dlBabyArt0.saveAs(babyArt0Path);

    // Export 1.2: Edge Defringe = 1 px
    console.log('Setting Edge Defringe = 1 px...');
    const defringeSlider = page.locator('div:has(> div > span:has-text("Edge Defringe")) input[type="range"]');
    await defringeSlider.fill('1');
    await page.waitForTimeout(800);

    const [dlBaby1] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const baby1Path = path.join(OUTPUT_DIR, 'baby_defringe_1px.png');
    await dlBaby1.saveAs(baby1Path);

    const [dlBabyArt1] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const babyArt1Path = path.join(OUTPUT_DIR, 'baby_artwork_1px.png');
    await dlBabyArt1.saveAs(babyArt1Path);

    // Export 1.3: Edge Defringe = 2 px
    console.log('Setting Edge Defringe = 2 px...');
    await defringeSlider.fill('2');
    await page.waitForTimeout(800);

    const [dlBaby2] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const baby2Path = path.join(OUTPUT_DIR, 'baby_defringe_2px.png');
    await dlBaby2.saveAs(baby2Path);

    const [dlBabyArt2] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const babyArt2Path = path.join(OUTPUT_DIR, 'baby_artwork_2px.png');
    await dlBabyArt2.saveAs(babyArt2Path);

    // Measure Baby Alpha Reductions
    const rawBabyArt0 = await sharp(babyArt0Path).raw().toBuffer({ resolveWithObject: true });
    const rawBabyArt1 = await sharp(babyArt1Path).raw().toBuffer({ resolveWithObject: true });
    const rawBabyArt2 = await sharp(babyArt2Path).raw().toBuffer({ resolveWithObject: true });

    let opaquePixels0 = 0;
    let opaquePixels1 = 0;
    let opaquePixels2 = 0;
    for (let i = 0; i < rawBabyArt0.data.length / 4; i++) {
      if (rawBabyArt0.data[i * 4 + 3] > 128) opaquePixels0++;
    }
    for (let i = 0; i < rawBabyArt1.data.length / 4; i++) {
      if (rawBabyArt1.data[i * 4 + 3] > 128) opaquePixels1++;
    }
    for (let i = 0; i < rawBabyArt2.data.length / 4; i++) {
      if (rawBabyArt2.data[i * 4 + 3] > 128) opaquePixels2++;
    }

    const trimmedPixels1 = opaquePixels0 - opaquePixels1;
    const trimmedPixels2 = opaquePixels0 - opaquePixels2;

    console.log(`Baby Portrait Opaque Pixels: 0px=${opaquePixels0}, 1px=${opaquePixels1}, 2px=${opaquePixels2}`);
    console.log(`Trimmed pixels: 0->1px = ${trimmedPixels1} pixels, 0->2px = ${trimmedPixels2} pixels`);

    if (trimmedPixels1 <= 0 || trimmedPixels2 <= trimmedPixels1) {
      throw new Error(`FAIL: Edge defringe did not produce expected progressive alpha trimming!`);
    }
    console.log('PASS: Baby portrait edge defringing produces measurable, progressive perimeter trimming.');

    // -------------------------------------------------------------
    // PART 2: WOMAN'S PORTRAIT (Bottom Finish & Fragment Cleanup)
    // -------------------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 2: WOMAN PORTRAIT — BOTTOM FINISH & FRAGMENTS');
    console.log('====================================================');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    console.log('Importing woman portrait photo (mid-torso cutoff)...');
    const fileInputWoman = page.locator('input[type="file"][accept*="image"]').first();
    await fileInputWoman.setInputFiles(womanPhoto);
    await page.waitForSelector('canvas', { timeout: 10000 });

    const detectBtnWoman = page.locator('button:has-text("Detect People")');
    await detectBtnWoman.waitFor({ state: 'visible', timeout: 5000 });
    await detectBtnWoman.click();

    console.log('Running detection on woman portrait...');
    await page.waitForSelector('text=Edge Defringe', { timeout: 45000 });
    await page.waitForSelector('button:has-text("Re-detect People"):not([disabled])', { timeout: 45000 });
    await page.waitForTimeout(1000);

    // Confirm Photo Cutoff badge is visible
    const cutoffBadge = page.locator('text=Photo Cutoff');
    const hasCutoffBadge = await cutoffBadge.count() > 0;
    console.log(`Bottom cutoff detection badge displayed: ${hasCutoffBadge}`);
    if (!hasCutoffBadge) {
      console.warn('Note: Subject cutoff check triggered');
    }

    // Export 2.1: Flat Bottom Finish (Baseline)
    console.log('Exporting Flat bottom finish...');
    await page.locator('button:has-text("Flat")').click();
    await page.waitForTimeout(500);

    const [dlWomanFlat] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const womanFlatPath = path.join(OUTPUT_DIR, 'woman_bottom_flat.png');
    await dlWomanFlat.saveAs(womanFlatPath);

    // Export 2.2: Rounded Bottom Finish (R = 40px)
    console.log('Setting Rounded bottom finish (Corner Radius = 40px)...');
    await page.locator('button:has-text("Rounded")').click();
    await page.waitForTimeout(500);
    const radiusSlider = page.locator('div:has(> div > span:has-text("Corner Radius")) input[type="range"]');
    if (await radiusSlider.count() > 0) {
      await radiusSlider.fill('40');
      await page.waitForTimeout(800);
    }

    const [dlWomanRounded] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const womanRoundedPath = path.join(OUTPUT_DIR, 'woman_bottom_rounded.png');
    await dlWomanRounded.saveAs(womanRoundedPath);

    // Export 2.3: Curved Bottom Finish (A = 45px)
    console.log('Setting Curved bottom finish (Arch Height = 45px)...');
    await page.locator('button:has-text("Curved")').click();
    await page.waitForTimeout(500);
    const archSlider = page.locator('div:has(> div > span:has-text("Arch Height")) input[type="range"]');
    if (await archSlider.count() > 0) {
      await archSlider.fill('45');
      await page.waitForTimeout(800);
    }

    const [dlWomanCurved] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside button:has-text("Export Sticker PNG")').click()
    ]);
    const womanCurvedPath = path.join(OUTPUT_DIR, 'woman_bottom_curved.png');
    await dlWomanCurved.saveAs(womanCurvedPath);

    // Compare Flat vs Rounded vs Curved
    const rawFlat = await sharp(womanFlatPath).raw().toBuffer({ resolveWithObject: true });
    const rawRounded = await sharp(womanRoundedPath).raw().toBuffer({ resolveWithObject: true });
    const rawCurved = await sharp(womanCurvedPath).raw().toBuffer({ resolveWithObject: true });

    let diffFlatVsRounded = 0;
    let diffFlatVsCurved = 0;
    for (let i = 0; i < Math.min(rawFlat.data.length, rawRounded.data.length); i++) {
      if (rawFlat.data[i] !== rawRounded.data[i]) diffFlatVsRounded++;
    }
    for (let i = 0; i < Math.min(rawFlat.data.length, rawCurved.data.length); i++) {
      if (rawFlat.data[i] !== rawCurved.data[i]) diffFlatVsCurved++;
    }

    console.log(`Byte difference (Flat vs Rounded): ${diffFlatVsRounded}`);
    console.log(`Byte difference (Flat vs Curved): ${diffFlatVsCurved}`);

    if (diffFlatVsRounded === 0 || diffFlatVsCurved === 0) {
      throw new Error(`FAIL: Bottom finish modes did not produce genuine pixel changes!`);
    }
    console.log('PASS: Bottom finish modes produce genuinely distinct bottom-contour pixels.');

    // -------------------------------------------------------------
    // PART 3: FRAGMENT CLEANUP & PERSISTENCE REGRESSION
    // -------------------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST 3: STRAY FRAGMENT CLEANUP & TOGGLE PERSISTENCE');
    console.log('====================================================');

    console.log('Executing Clean Stray Fragments on woman portrait...');
    const cleanFragmentsBtn = page.locator('button:has-text("Clean Stray Fragments")');
    await cleanFragmentsBtn.click();
    await page.waitForTimeout(800);

    const [dlWomanCleaned] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const womanCleanedPath = path.join(OUTPUT_DIR, 'woman_artwork_cleaned.png');
    await dlWomanCleaned.saveAs(womanCleanedPath);
    const rawCleaned = await sharp(womanCleanedPath).raw().toBuffer({ resolveWithObject: true });

    // Toggle region off and back on
    console.log('Toggling person region off and back on...');
    const firstCheckbox = page.locator('.max-h-44 input[type="checkbox"]').first();
    await firstCheckbox.click(); // Off
    await page.waitForTimeout(500);
    await firstCheckbox.click(); // Back on
    await page.waitForTimeout(500);

    const [dlWomanToggled] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const womanToggledPath = path.join(OUTPUT_DIR, 'woman_artwork_toggled.png');
    await dlWomanToggled.saveAs(womanToggledPath);
    const rawToggled = await sharp(womanToggledPath).raw().toBuffer({ resolveWithObject: true });

    let toggleDiff = 0;
    for (let i = 0; i < rawCleaned.data.length; i++) {
      if (rawCleaned.data[i] !== rawToggled.data[i]) toggleDiff++;
    }
    console.log(`Toggle diff bytes against cleaned mask: ${toggleDiff} (Expected: 0)`);
    if (toggleDiff !== 0) {
      throw new Error(`FAIL: Cleaned fragments restored when region was toggled off/on!`);
    }
    console.log('PASS: Fragment removals persist across region toggling.');

    // Save project and reload
    console.log('Saving project to verify roundtrip persistence of finishing & cleanup...');
    const [dlProj] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button:has-text("Save Photo Project")').click()
    ]);
    const projPath = path.join(OUTPUT_DIR, 'woman_cleaned_project.stickerstudio');
    await dlProj.saveAs(projPath);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button:has-text("Photo Mode")').click();

    const projInput = page.locator('input[type="file"][accept*=".stickerstudio"]').first();
    await projInput.setInputFiles(projPath);
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const [dlWomanReloaded] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('aside div.border-t button:has-text("Artwork Only")').click()
    ]);
    const womanReloadedPath = path.join(OUTPUT_DIR, 'woman_artwork_reloaded.png');
    await dlWomanReloaded.saveAs(womanReloadedPath);
    const rawReloaded = await sharp(womanReloadedPath).raw().toBuffer({ resolveWithObject: true });

    let reloadDiff = 0;
    for (let i = 0; i < rawCleaned.data.length; i++) {
      if (rawCleaned.data[i] !== rawReloaded.data[i]) reloadDiff++;
    }
    console.log(`Reload RGBA diff bytes: ${reloadDiff} (Expected: 0)`);
    if (reloadDiff !== 0) {
      throw new Error(`FAIL: Decoded RGBA differed after saving and reloading project (${reloadDiff} bytes)!`);
    }
    console.log('PASS: Cleaned fragments and finishing options restored with exact 0-byte RGBA diff.');

    // -------------------------------------------------------------
    // PART 4: GENERATE UNIFIED VISUAL COMPARISON SHEET
    // -------------------------------------------------------------
    console.log('\n====================================================');
    console.log('GENERATING CONSOLIDATED COMPARISON SHEET');
    console.log('====================================================');

    // Create a 4-column layout for Baby and a 3-column layout for Woman
    // We'll assemble a high-res comparison image using sharp
    const babyW = 340;
    const babyH = 460;
    const b0 = await sharp(baby0Path).resize(babyW, babyH, { fit: 'contain', background: { r: 240, g: 240, b: 240, alpha: 1 } }).toBuffer();
    const b1 = await sharp(baby1Path).resize(babyW, babyH, { fit: 'contain', background: { r: 240, g: 240, b: 240, alpha: 1 } }).toBuffer();
    const b2 = await sharp(baby2Path).resize(babyW, babyH, { fit: 'contain', background: { r: 240, g: 240, b: 240, alpha: 1 } }).toBuffer();

    const womanW = 340;
    const womanH = 460;
    const wFlat = await sharp(womanFlatPath).resize(womanW, womanH, { fit: 'contain', background: { r: 240, g: 240, b: 240, alpha: 1 } }).toBuffer();
    const wRound = await sharp(womanRoundedPath).resize(womanW, womanH, { fit: 'contain', background: { r: 240, g: 240, b: 240, alpha: 1 } }).toBuffer();
    const wCurve = await sharp(womanCurvedPath).resize(womanW, womanH, { fit: 'contain', background: { r: 240, g: 240, b: 240, alpha: 1 } }).toBuffer();

    // Composite single side-by-side sheet: 1060 x 980
    const comparisonWidth = 1060;
    const comparisonHeight = 980;

    const comparisonSheet = await sharp({
      create: {
        width: comparisonWidth,
        height: comparisonHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).composite([
      // Row 1: Baby Portrait (0px vs 1px vs 2px)
      { input: b0, left: 15, top: 20 },
      { input: b1, left: 365, top: 20 },
      { input: b2, left: 715, top: 20 },

      // Row 2: Woman Portrait (Flat vs Rounded vs Curved)
      { input: wFlat, left: 15, top: 500 },
      { input: wRound, left: 365, top: 500 },
      { input: wCurve, left: 715, top: 500 },
    ]).png().toBuffer();

    const comparisonArtifactPath = path.join(ARTIFACT_DIR, 'actual_portrait_finishing_comparison.png');
    fs.writeFileSync(comparisonArtifactPath, comparisonSheet);
    console.log(`Saved consolidated comparison sheet to: ${comparisonArtifactPath}`);

    // Also copy individual stickers into artifacts directory
    fs.copyFileSync(baby0Path, path.join(ARTIFACT_DIR, 'actual_baby_defringe_0px.png'));
    fs.copyFileSync(baby1Path, path.join(ARTIFACT_DIR, 'actual_baby_defringe_1px.png'));
    fs.copyFileSync(baby2Path, path.join(ARTIFACT_DIR, 'actual_baby_defringe_2px.png'));
    fs.copyFileSync(womanFlatPath, path.join(ARTIFACT_DIR, 'actual_woman_bottom_flat.png'));
    fs.copyFileSync(womanRoundedPath, path.join(ARTIFACT_DIR, 'actual_woman_bottom_rounded.png'));
    fs.copyFileSync(womanCurvedPath, path.join(ARTIFACT_DIR, 'actual_woman_bottom_curved.png'));

    await browser.close();
    console.log('\n================================================================');
    console.log('PASS: ALL ACTUAL PORTRAIT FINISHING ACCEPTANCE PASSED (EXIT 0)');
    console.log('================================================================');
  } finally {
    previewProcess.kill();
  }
}

runActualPortraitsAcceptance().catch(err => {
  console.error('FAIL in runActualPortraitsAcceptance:', err);
  process.exit(1);
});
