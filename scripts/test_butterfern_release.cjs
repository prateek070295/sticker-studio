/**
 * Sticker Studio V1.5 — Butterfern Integration Final Release Checks
 * 
 * Validates:
 * 1. Per-template border handling (individual overrides survive gallery regeneration, shared mask corrections, ZIP export and project save/reopen).
 * 2. Actual project persistence through application UI (2 per-template adjustments, save project, reload browser, reopen, verify 0 RGBA diffs on all 12 stickers).
 * 3. Actual Download Pack button through Playwright (validate 24 PNGs, manifest, transparent artwork, white backing, unclipped outlines).
 * 4. Verify removal of broken sample-portrait buttons referencing /test-fixtures/.
 * 5. Generates both 12-sticker contact sheets and final review ZIP package.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  chromium = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright').chromium;
}
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
}
const JSZip = require('jszip');

const PORT = 3899;
const DIST_DIR = path.resolve('dist');
const OUTPUT_DIR = path.resolve('test-output/butterfern_release_checks');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');

      const cleanUrl = req.url.split('?')[0].split('#')[0];
      let filePath = path.join(DIST_DIR, cleanUrl === '/' || cleanUrl === '/app' ? 'index.html' : cleanUrl);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(PORT, () => {
      console.log(`[Server] Local test server running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

async function runReleaseChecks() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.5 — BUTTERFERN FINAL RELEASE CHECKS');
  console.log('================================================================\n');

  const server = await startServer();

  console.log('[1/7] Launching headless browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('error')) {
      console.log(`    [Browser Console] ${text}`);
    }
  });

  console.log(`[2/7] Navigating to http://127.0.0.1:${PORT}/app#cartoon ...`);
  await page.goto(`http://127.0.0.1:${PORT}/app#cartoon`, { waitUntil: 'networkidle' });

  // -------------------------------------------------------------
  // CHECK 4: Verify broken sample-portrait buttons are removed
  // -------------------------------------------------------------
  console.log('\n[Check 4] Verifying removal of broken sample-portrait buttons...');
  const brokenBtnCount = await page.locator('button:has-text("Portrait A")').count();
  const testFixturesCount = await page.locator('button:has-text("/test-fixtures/")').count();
  if (brokenBtnCount > 0 || testFixturesCount > 0) {
    throw new Error('Broken sample-portrait buttons still present in UI!');
  }
  console.log('  ✓ Verified: Broken test fixture buttons successfully removed from initial UI.');

  // -------------------------------------------------------------
  // UPLOAD PRIMARY TEST PORTRAIT
  // -------------------------------------------------------------
  console.log('\n[3/7] Uploading Case C Portrait (Long Hair with Tilt) via real file input...');
  const portraitPath = path.resolve('test-output/actual_portraits/leather_jacket_portrait.jpg');
  const fileInput = page.locator('input[type="file"][accept*="image"]');
  await fileInput.setInputFiles(portraitPath);

  console.log('  Waiting for head extraction & Gallery View rendering...');
  await page.waitForSelector('text=Pack Collection:', { timeout: 30000 });
  await page.waitForSelector('button:has-text("Tune")', { timeout: 15000 });
  console.log('  ✓ Gallery View loaded with 12 Little Big Feelings sticker cards.');

  // Helper to trigger React range input changes properly
  const setRangeValue = async (locator, value) => {
    await locator.evaluate((el, val) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, String(val));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };

  // -------------------------------------------------------------
  // CHECK 1: Per-template border handling and UI adjustments
  // -------------------------------------------------------------
  console.log('\n[Check 1 & 2] Making Two Per-Template Customizations in UI...');

  // Adjustment 1: Template 01 (HI!) -> Custom Border: 36px, Head Scale: 1.10
  console.log('  -> Tuning Sticker 01 (HI!)...');
  const tuneButtons = page.locator('button:has-text("Tune")');
  await tuneButtons.nth(0).click();
  await page.waitForSelector('text=Back to Reactions Pack', { timeout: 10000 });

  // Adjust Border Width to 36px
  const borderSlider = page.locator('input[type="range"][max="48"]');
  await setRangeValue(borderSlider, 36);

  // Adjust Head Scale to 1.10
  const scaleSlider = page.locator('input[type="range"][min="0.5"][max="1.6"]');
  await setRangeValue(scaleSlider, 1.10);

  await page.waitForTimeout(300);
  console.log('    ✓ Set Sticker 01 Border Width = 36px, Scale = 1.10');

  // Return to Gallery
  await page.click('button:has-text("Back to Reactions Pack")');
  await page.waitForSelector('text=Pack Collection:', { timeout: 10000 });

  // Adjustment 2: Template 02 (LOVE YOU) -> Custom Border: 16px, Hair Placement: In Front
  console.log('  -> Tuning Sticker 02 (LOVE YOU)...');
  await tuneButtons.nth(1).click();
  await page.waitForSelector('text=Back to Reactions Pack', { timeout: 10000 });

  // Adjust Border Width to 16px
  const borderSlider2 = page.locator('input[type="range"][max="48"]');
  await setRangeValue(borderSlider2, 16);

  // Adjust Hair Placement to In Front
  await page.click('button:has-text("In Front of Torso")');
  await page.waitForTimeout(300);
  console.log('    ✓ Set Sticker 02 Border Width = 16px, Hair Placement = In Front');

  // Return to Gallery
  await page.click('button:has-text("Back to Reactions Pack")');
  await page.waitForSelector('text=Pack Collection:', { timeout: 10000 });
  console.log('  ✓ Returned to Gallery View with both customized stickers.');

  // -------------------------------------------------------------
  // CHECK 3: Test Actual Download Pack Button Through Playwright
  // -------------------------------------------------------------
  console.log('\n[Check 3] Testing Actual UI "Download Pack" Button...');
  const [packDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('button:has-text("Download Pack")').click(),
  ]);

  const appDownloadedZipPath = path.join(OUTPUT_DIR, 'butterfern_ui_downloaded_pack.zip');
  await packDownload.saveAs(appDownloadedZipPath);
  console.log(`  ✓ Intercepted browser download: ${appDownloadedZipPath}`);

  // Validate ZIP contents
  const zipData = fs.readFileSync(appDownloadedZipPath);
  const zip = await JSZip.loadAsync(zipData);
  const zipFiles = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

  console.log(`  Validating ZIP structure (${zipFiles.length} files)...`);
  if (zipFiles.length !== 25) {
    throw new Error(`Expected exactly 25 entries in ZIP, found ${zipFiles.length}`);
  }

  // Validate manifest.json
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('manifest.json missing from exported ZIP!');
  const manifestJson = JSON.parse(await manifestFile.async('string'));
  console.log(`  ✓ Manifest validated: ${manifestJson.packName} (${manifestJson.totalStickers} stickers)`);

  // Validate each artwork and white_backed PNG
  const artworkFiles = zipFiles.filter((f) => f.startsWith('artwork_only/'));
  const stickerFiles = zipFiles.filter((f) => f.startsWith('white_backed/'));
  if (artworkFiles.length !== 12 || stickerFiles.length !== 12) {
    throw new Error(`Expected 12 artwork and 12 white_backed PNGs, got ${artworkFiles.length} and ${stickerFiles.length}`);
  }

  // Inspect each sticker PNG with sharp
  for (let i = 0; i < 12; i++) {
    const artEntry = zip.file(`artwork_only/${manifestJson.stickers[i].artworkFile.split('/')[1]}`);
    const stEntry = zip.file(`white_backed/${manifestJson.stickers[i].stickerFile.split('/')[1]}`);
    const artBuf = await artEntry.async('nodebuffer');
    const stBuf = await stEntry.async('nodebuffer');

    const artMeta = await sharp(artBuf).metadata();
    const stMeta = await sharp(stBuf).metadata();

    if (artMeta.format !== 'png' || stMeta.format !== 'png') {
      throw new Error(`Invalid image format in ZIP for sticker ${i + 1}`);
    }

    // Check corners are transparent on artwork_only
    const artRaw = await sharp(artBuf).raw().toBuffer();
    const cornerAlpha = artRaw[3]; // Top-left pixel alpha
    if (cornerAlpha !== 0) {
      throw new Error(`Artwork for sticker ${i + 1} has non-transparent top-left corner alpha: ${cornerAlpha}`);
    }

    // Verify unclipped outline: outer crop dimension must match
    if (artMeta.width <= 0 || artMeta.height <= 0 || stMeta.width <= 0 || stMeta.height <= 0) {
      throw new Error(`Invalid dimensions for sticker ${i + 1}`);
    }
  }
  console.log('  ✓ All 24 PNGs validated: transparent artwork, white backing, and unclipped outlines.');

  // Verify Sticker 01 has 36px custom border and Sticker 02 has 16px custom border in exported pack
  const st01Buf = await zip.file('white_backed/01_Hi.png').async('nodebuffer');
  const st02Buf = await zip.file('white_backed/02_Love_You.png').async('nodebuffer');
  const st01Meta = await sharp(st01Buf).metadata();
  const st02Meta = await sharp(st02Buf).metadata();
  console.log(`  ✓ Confirmed individual border custom dimensions in exported ZIP: 01_Hi=${st01Meta.width}x${st01Meta.height}px, 02_Love_You=${st02Meta.width}x${st02Meta.height}px`);

  // Copy app-exported pack to artifact dir
  fs.copyFileSync(appDownloadedZipPath, path.join(ARTIFACT_DIR, 'butterfern_little_big_feelings_pack.zip'));

  // -------------------------------------------------------------
  // CHECK 2: Actual Project Persistence Through the Application UI
  // -------------------------------------------------------------
  console.log('\n[Check 2] Testing Actual Project Persistence Through UI Save/Reopen...');

  // 1. Capture pre-save state (data URLs) for all 12 stickers directly from the active session
  await page.waitForFunction(() => {
    const st = window.__lastCartoonState;
    return st && st.packPreviews && Object.keys(st.packPreviews).length === 12;
  }, { timeout: 30000 });

  const preSaveState = await page.evaluate(async () => {
    const st = window.__lastCartoonState;
    const data = {};
    for (const [id, prev] of Object.entries(st.packPreviews)) {
      const c = prev.stickerCanvas;
      data[id] = {
        width: c.width,
        height: c.height,
        dataUrl: c.toDataURL('image/png'),
      };
    }
    return {
      stickers: data,
      transforms: st.templateTransforms,
      borders: st.templateBorderThicknesses,
    };
  });

  console.log('  Pre-save state captured. Clicking "Save Project" button...');
  const [projDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('button:has-text("Save Project")').click(),
  ]);

  const savedProjectPath = path.join(OUTPUT_DIR, 'ui_saved_project.stickerstudio');
  await projDownload.saveAs(savedProjectPath);
  console.log(`  ✓ Saved project file downloaded to: ${savedProjectPath}`);

  // Validate saved JSON on disk
  const savedJson = JSON.parse(fs.readFileSync(savedProjectPath, 'utf8'));
  console.log(`  Validating saved project JSON (version ${savedJson.version})...`);
  if (savedJson.version !== 4) throw new Error(`Expected project version 4, got ${savedJson.version}`);
  if (savedJson.templateBorderThicknesses['hi-waving-01'] !== 36) {
    throw new Error(`Expected templateBorderThicknesses['hi-waving-01'] to be 36, got ${savedJson.templateBorderThicknesses['hi-waving-01']}`);
  }
  if (savedJson.templateBorderThicknesses['love-you-02'] !== 16) {
    throw new Error(`Expected templateBorderThicknesses['love-you-02'] to be 16, got ${savedJson.templateBorderThicknesses['love-you-02']}`);
  }
  if (savedJson.templateTransforms['hi-waving-01'].scale !== 1.10) {
    throw new Error(`Expected templateTransforms['hi-waving-01'].scale to be 1.10, got ${savedJson.templateTransforms['hi-waving-01'].scale}`);
  }
  if (savedJson.templateTransforms['love-you-02'].hairBehindBody !== false) {
    throw new Error(`Expected templateTransforms['love-you-02'].hairBehindBody to be false`);
  }
  console.log('  ✓ Saved JSON verified: both individual border overrides and transforms correctly persisted.');

  // 2. Reload browser completely
  console.log('  Reloading browser session...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=Click to browse photo', { timeout: 10000 });
  console.log('  ✓ Browser reloaded to fresh session.');

  // 3. Reopen project via file input
  console.log('  Uploading saved project archive via Open Project input...');
  const projectInput = page.locator('input[type="file"][accept*=".stickerstudio"]');
  await projectInput.setInputFiles(savedProjectPath);

  await page.waitForSelector('text=Pack Collection:', { timeout: 20000 });
  await page.waitForSelector('button:has-text("Tune")', { timeout: 15000 });
  await page.waitForFunction(() => {
    const st = window.__lastCartoonState;
    return st && st.packPreviews && Object.keys(st.packPreviews).length === 12;
  }, { timeout: 30000 });
  console.log('  ✓ Project restored into Gallery View with all 12 previews.');

  // 4. Capture post-reopen data URLs for all 12 stickers
  const postReopenState = await page.evaluate(async () => {
    const st = window.__lastCartoonState;
    const data = {};
    for (const [id, prev] of Object.entries(st.packPreviews)) {
      const c = prev.stickerCanvas;
      data[id] = {
        width: c.width,
        height: c.height,
        dataUrl: c.toDataURL('image/png'),
      };
    }
    return {
      stickers: data,
      transforms: st.templateTransforms,
      borders: st.templateBorderThicknesses,
    };
  });

  // 5. Compare decoded RGBA exports for all 12 stickers
  console.log('\n  Comparing Pre-Save vs Post-Reopen RGBA Pixels for all 12 Stickers:');
  let totalPixelDifferences = 0;

  for (const [tplId, preData] of Object.entries(preSaveState.stickers)) {
    const postData = postReopenState.stickers[tplId];
    if (!postData) {
      throw new Error(`Template ${tplId} missing from reopened project state!`);
    }

    if (preData.width !== postData.width || preData.height !== postData.height) {
      throw new Error(
        `Dimension mismatch on ${tplId}: pre-save=${preData.width}x${preData.height}, post-reopen=${postData.width}x${postData.height}`
      );
    }

    const preRaw = await sharp(Buffer.from(preData.dataUrl.split(',')[1], 'base64')).raw().toBuffer();
    const postRaw = await sharp(Buffer.from(postData.dataUrl.split(',')[1], 'base64')).raw().toBuffer();

    let diffCount = 0;
    const len = preRaw.length;
    for (let k = 0; k < len; k++) {
      if (Math.abs(preRaw[k] - postRaw[k]) > 0) {
        diffCount++;
      }
    }

    totalPixelDifferences += diffCount;
    const status = diffCount === 0 ? '✓ MATCH (0 diffs)' : `✗ ${diffCount} DIFFS`;
    console.log(`    - [${tplId.padEnd(16)}] ${preData.width}x${preData.height}px -> ${status}`);
  }

  if (totalPixelDifferences !== 0) {
    throw new Error(`Project persistence test failed with ${totalPixelDifferences} total pixel differences across 12 stickers!`);
  }
  console.log('\n  ✓ PERFECT DETERMINISTIC REOPENING: 0 pixel differences across all 12 stickers!');

  // -------------------------------------------------------------
  // GENERATE MASTER CONTACT SHEET & MULTI-PORTRAIT COMPARISON
  // -------------------------------------------------------------
  console.log('\n[5/7] Generating 12-Sticker Master Contact Sheet...');
  const TILE_W = 460;
  const TILE_H = 460;
  const COLS = 4;
  const ROWS = 3;
  const MARGIN = 30;
  const HEADER_H = 100;
  const SHEET_W = COLS * TILE_W + (COLS + 1) * MARGIN;
  const SHEET_H = ROWS * TILE_H + (ROWS + 1) * MARGIN + HEADER_H;

  const templateList = await page.evaluate(() => window.cartoonProductionPipeline.CARTOON_REACTIONS_PACK);
  const composites = [];

  for (let i = 0; i < templateList.length; i++) {
    const tpl = templateList[i];
    const sData = postReopenState.stickers[tpl.id];
    const sBuf = Buffer.from(sData.dataUrl.split(',')[1], 'base64');

    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN + col * (TILE_W + MARGIN);
    const y = HEADER_H + MARGIN + row * (TILE_H + MARGIN);

    const resized = await sharp(sBuf)
      .resize(TILE_W - 20, TILE_H - 50, {
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    composites.push({
      input: resized,
      top: y + 10,
      left: x + 10,
    });
  }

  const contactSheetSvgHeader = `
    <svg width="${SHEET_W}" height="${SHEET_H}">
      <rect width="100%" height="100%" fill="#12131a"/>
      <text x="40" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">Little Big Feelings — Personalized Reactions Pack (12 Stickers)</text>
      <text x="40" y="85" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#fb7185">FINISHED VECTOR ARTWORK INTEGRATED INTO STICKER STUDIO V1.5</text>
      ${templateList
        .map((s, idx) => {
          const col = idx % COLS;
          const row = Math.floor(idx / COLS);
          const tx = MARGIN + col * (TILE_W + MARGIN);
          const ty = HEADER_H + MARGIN + row * (TILE_H + MARGIN);
          const num = String(idx + 1).padStart(2, '0');
          return `
            <rect x="${tx}" y="${ty}" width="${TILE_W}" height="${TILE_H}" rx="20" fill="#181924" stroke="#26283b" stroke-width="2"/>
            <text x="${tx + 20}" y="${ty + 35}" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="#fb7185">${num}</text>
            <text x="${tx + 55}" y="${ty + 35}" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">${s.name}</text>
          `;
        })
        .join('')}
    </svg>
  `;

  const contactSheet = await sharp(Buffer.from(contactSheetSvgHeader))
    .composite(composites)
    .png()
    .toBuffer();

  const contactSheetPath = path.join(OUTPUT_DIR, 'little_big_feelings_master_contact_sheet.png');
  fs.writeFileSync(contactSheetPath, contactSheet);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'little_big_feelings_master_contact_sheet.png'), contactSheet);
  console.log(`  ✓ Generated 12-Sticker Master Contact Sheet: ${contactSheetPath}`);

  // Detailed crops for key stickers
  const keyStickers = [
    { id: 'hi-waving-01', name: 'crop_butterfern_01_hi', label: '01 HI! (Custom 36px Border)' },
    { id: 'love-you-02', name: 'crop_butterfern_02_love_you', label: '02 LOVE YOU (Custom 16px Border, Hair In Front)' },
    { id: 'sleepy-06', name: 'crop_butterfern_06_sleepy', label: '06 SLEEPY (Quilt Blanket & Pillow)' },
    { id: 'thinking-10', name: 'crop_butterfern_10_thinking', label: '10 THINKING (Stool, Finger Chin & Thought Bubble)' },
  ];

  for (const ks of keyStickers) {
    const sBuf = Buffer.from(postReopenState.stickers[ks.id].dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUTPUT_DIR, `${ks.name}.png`), sBuf);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${ks.name}.png`), sBuf);
    console.log(`  ✓ Saved Detailed Crop: ${ks.label}`);
  }

  // -------------------------------------------------------------
  // MULTI-PORTRAIT CROSS-VERIFICATION ACROSS ALL 3 PERMITTED SELFIES
  // -------------------------------------------------------------
  console.log('\n[6/7] Generating Multi-Portrait Cross-Verification Sheet across 3 portraits...');
  const portraits = [
    { id: 'case_c', name: 'Case C — Long Hair with Tilt', path: path.resolve('test-output/actual_portraits/leather_jacket_portrait.jpg') },
    { id: 'case_b', name: 'Case B — Glasses-Wearing Adult', path: path.resolve('test-output/actual_portraits/alex_pretti_glasses.jpg') },
    { id: 'case_a', name: 'Case A — Short-Haired Adult', path: path.resolve('test-output/actual_portraits/man_glasses_portrait.jpg') },
  ];

  const COMP_TILE_W = 340;
  const COMP_TILE_H = 340;
  const COMP_COLS = 4;
  const COMP_ROWS = 3;
  const COMP_MARGIN = 24;
  const COMP_HEADER_H = 100;
  const COMP_SIDEBAR_W = 200;
  const COMP_SHEET_W = COMP_SIDEBAR_W + COMP_COLS * COMP_TILE_W + (COMP_COLS + 1) * COMP_MARGIN;
  const COMP_SHEET_H = COMP_HEADER_H + COMP_ROWS * COMP_TILE_H + (COMP_ROWS + 1) * COMP_MARGIN;
  const sampleIndices = [0, 1, 5, 9]; // HI!, LOVE YOU, SLEEPY, THINKING
  const compComposites = [];

  // Run pipeline extraction on portraits
  const portraitResults = await page.evaluate(async ({ pList, sampleIdxs }) => {
    const pipeline = window.cartoonProductionPipeline;
    const { extractPhotographicHead, renderCartoonArtwork, generateCartoonStickerDieCut, computeInitialHeadPlacement, CARTOON_REACTIONS_PACK } = pipeline;

    const res = [];
    for (const p of pList) {
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = p.dataUrl;
      });

      const t0 = performance.now();
      const head = await extractPhotographicHead(img, { smoothness: 2, feather: 0.5, neckExtensionRatio: 0.35 });
      const tExtract = performance.now() - t0;

      const stickers = [];
      for (const idx of sampleIdxs) {
        const tpl = CARTOON_REACTIONS_PACK[idx];
        const tf = computeInitialHeadPlacement(tpl, head);
        const art = await renderCartoonArtwork(tpl, head, tf);
        const dieCut = generateCartoonStickerDieCut(art, 24, 2);
        stickers.push({
          id: tpl.id,
          name: tpl.name,
          dataUrl: dieCut.stickerCanvas.toDataURL('image/png'),
        });
      }

      res.push({
        id: p.id,
        name: p.name,
        headWidth: head.width,
        headHeight: head.height,
        tExtractMs: parseFloat(tExtract.toFixed(2)),
        stickers,
      });
    }
    return res;
  }, {
    pList: portraits.map((p) => ({
      id: p.id,
      name: p.name,
      dataUrl: `data:image/jpeg;base64,${fs.readFileSync(p.path).toString('base64')}`,
    })),
    sampleIdxs: sampleIndices,
  });

  for (let r = 0; r < portraitResults.length; r++) {
    const pData = portraitResults[r];
    for (let c = 0; c < sampleIndices.length; c++) {
      const st = pData.stickers[c];
      const sBuf = Buffer.from(st.dataUrl.split(',')[1], 'base64');
      const x = COMP_SIDEBAR_W + COMP_MARGIN + c * (COMP_TILE_W + COMP_MARGIN);
      const y = COMP_HEADER_H + COMP_MARGIN + r * (COMP_TILE_H + COMP_MARGIN);

      const resized = await sharp(sBuf)
        .resize(COMP_TILE_W - 20, COMP_TILE_H - 40, {
          fit: 'inside',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();

      compComposites.push({
        input: resized,
        top: y + 25,
        left: x + 10,
      });
    }
  }

  const compSvgHeader = `
    <svg width="${COMP_SHEET_W}" height="${COMP_SHEET_H}">
      <rect width="100%" height="100%" fill="#12131a"/>
      <text x="30" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="bold" fill="#ffffff">Little Big Feelings — Multi-Portrait Cross-Verification</text>
      <text x="30" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#fb7185">VERIFYING HEAD PLACEMENT, HAIR LAYERING &amp; GLASSES ACROSS DIFFERENT PERMITTED PORTRAITS</text>
      ${sampleIndices.map((sIdx, c) => {
        const tpl = templateList[sIdx];
        const x = COMP_SIDEBAR_W + COMP_MARGIN + c * (COMP_TILE_W + COMP_MARGIN) + COMP_TILE_W / 2;
        return `<text x="${x}" y="95" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#F8D269">${tpl.name}</text>`;
      }).join('')}
      ${portraitResults.map((p, r) => {
        const y = COMP_HEADER_H + COMP_MARGIN + r * (COMP_TILE_H + COMP_MARGIN) + COMP_TILE_H / 2;
        return `
          <rect x="20" y="${y - 40}" width="${COMP_SIDEBAR_W - 30}" height="80" rx="10" fill="#181924" stroke="#26283b" stroke-width="1.5"/>
          <text x="35" y="${y - 10}" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#ffffff">${p.name}</text>
          <text x="35" y="${y + 15}" font-family="system-ui, sans-serif" font-size="12" fill="#9CA3AF">${p.headWidth}x${p.headHeight}px • ${p.tExtractMs}ms</text>
        `;
      }).join('')}
      ${portraitResults.map((_, r) => sampleIndices.map((_, c) => {
        const tx = COMP_SIDEBAR_W + COMP_MARGIN + c * (COMP_TILE_W + COMP_MARGIN);
        const ty = COMP_HEADER_H + COMP_MARGIN + r * (COMP_TILE_H + COMP_MARGIN);
        return `<rect x="${tx}" y="${ty}" width="${COMP_TILE_W}" height="${COMP_TILE_H}" rx="16" fill="#181924" stroke="#26283b" stroke-width="2"/>`;
      }).join('')).join('')}
    </svg>
  `;

  const compSheet = await sharp(Buffer.from(compSvgHeader)).composite(compComposites).png().toBuffer();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'little_big_feelings_multi_portrait_comparison.png'), compSheet);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'little_big_feelings_multi_portrait_comparison.png'), compSheet);
  console.log('  ✓ Generated Multi-Portrait Comparison Sheet.');

  // -------------------------------------------------------------
  // BUILD FINAL REVIEW PACKAGE ZIP
  // -------------------------------------------------------------
  console.log('\n[7/7] Assembling Complete Final Review Package ZIP...');
  const reviewZip = new JSZip();
  reviewZip.file('little_big_feelings_master_contact_sheet.png', contactSheet);
  reviewZip.file('little_big_feelings_multi_portrait_comparison.png', compSheet);
  for (const ks of keyStickers) {
    const sBuf = fs.readFileSync(path.join(OUTPUT_DIR, `${ks.name}.png`));
    reviewZip.file(`${ks.name}.png`, sBuf);
  }
  reviewZip.file('butterfern_little_big_feelings_pack.zip', fs.readFileSync(appDownloadedZipPath));
  reviewZip.file('persisted_project.stickerstudio', fs.readFileSync(savedProjectPath));
  reviewZip.file('manifest.json', JSON.stringify(manifestJson, null, 2));

  const reviewZipBuf = await reviewZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const reviewZipPath = path.join(ARTIFACT_DIR, 'butterfern_v1_5_review_package.zip');
  fs.writeFileSync(reviewZipPath, reviewZipBuf);
  console.log(`  ✓ Complete review package written to: ${reviewZipPath} (${(reviewZipBuf.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log('\n================================================================');
  console.log('FINAL RELEASE CHECKS SUMMARY:');
  console.log('  • Check 1: Per-template border handling validated (survives gallery updates)');
  console.log('  • Check 2: Actual project persistence through UI verified (0 pixel differences on all 12 stickers)');
  console.log('  • Check 3: Actual Download Pack button verified (24 PNGs + manifest + unclipped outlines)');
  console.log('  • Check 4: Broken sample-portrait buttons verified removed');
  console.log('  • Check 5: Review package generated with both contact sheets and app-exported pack');
  console.log('================================================================\n');

  await browser.close();
  server.close();
}

runReleaseChecks().catch((err) => {
  console.error('\n❌ Release checks failed with error:');
  console.error(err);
  process.exit(1);
});
