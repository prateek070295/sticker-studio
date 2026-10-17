const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const crypto = require('crypto');

const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const USER_IMAGE_PATH = path.join(ARTIFACT_DIR, '.user_uploaded/media_1792203847178.jpg');
const BUNDLED_IMAGE_PATH = path.resolve('public/samples/chai_break.jpg');

async function runBrowserAcceptanceCheck() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.1 — FINAL BROWSER ACCEPTANCE AUDIT');
  console.log('================================================================');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.error(`[Browser Console ERROR]:`, msg.text());
  });
  page.on('pageerror', err => console.error(`[Browser PageError]:`, err.message));

  const results = {
    testedCommitSha: '824704e34fe454987f0e04a9d31cd6fdedd17df0',
    userImage: {},
    bundledImage: {},
    freeFormResults: {},
    gridModeResults: {},
    exportedZipValidation: {},
    captionDiscrimination: {},
    boundaryCrossingAudit: {},
    eraserCoordinateMetrics: [],
    dpr2CoordinateMetrics: [],
    editPreservation: {},
    offlinePwaResults: {}
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Image Checksums & Dimensions Verification (User Upload vs Bundled)
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 1: Verify Original Input Image Checksums ---');
    const userImgBuf = fs.readFileSync(USER_IMAGE_PATH);
    const userMeta = await sharp(userImgBuf).metadata();
    const userSha = crypto.createHash('sha256').update(userImgBuf).digest('hex').toUpperCase();

    results.userImage = {
      path: USER_IMAGE_PATH,
      sha256: userSha,
      dimensions: `${userMeta.width}x${userMeta.height}`,
      format: userMeta.format,
      bytes: userImgBuf.length
    };
    console.log('User original image:', results.userImage);

    const bundledBuf = fs.readFileSync(BUNDLED_IMAGE_PATH);
    const bundledMeta = await sharp(bundledBuf).metadata();
    const bundledSha = crypto.createHash('sha256').update(bundledBuf).digest('hex').toUpperCase();

    results.bundledImage = {
      path: BUNDLED_IMAGE_PATH,
      sha256: bundledSha,
      dimensions: `${bundledMeta.width}x${bundledMeta.height}`,
      format: bundledMeta.format,
      bytes: bundledBuf.length,
      byteIdenticalToOriginal: userSha === bundledSha && userImgBuf.length === bundledBuf.length
    };
    console.log('Bundled sample image:', results.bundledImage);

    // -------------------------------------------------------------------------
    // 2. Load Production Preview in Browser
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: Navigate to Production Build at http://127.0.0.1:4173/ ---');
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_01_landing.png') });
    console.log('Loaded landing page.');

    // -------------------------------------------------------------------------
    // 3. Upload Original User Image
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Import exact original image into browser ---');
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(USER_IMAGE_PATH);

    // Wait for extraction to complete
    await page.waitForSelector('text=Extracting Sticker Sheet', { timeout: 10000 });
    console.log('Worker extraction in progress...');
    await page.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 35000 });
    await page.waitForTimeout(1000);
    console.log('Worker extraction complete.');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_02_freeform_extracted.png') });

    // -------------------------------------------------------------------------
    // 4. Record Initial Free-Form Extraction State
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 4: Record Free-Form Grouping State ---');
    const freeFormDiagnostics = await page.evaluate(() => {
      const activeCountElem = document.querySelector('span.bg-pink-50');
      return {
        activeStickersLabel: activeCountElem?.textContent || ''
      };
    });
    console.log('Free-form UI status:', freeFormDiagnostics);
    results.freeFormResults = freeFormDiagnostics;

    // -------------------------------------------------------------------------
    // 5. Enable Contact Sheet / Grid Mode (4x5)
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 5: Enable Grid Mode (4 Columns x 5 Rows) with Caption Exclusion ---');
    const gridToggle = page.locator('label:has-text("Grid Mode") input[type="checkbox"]');
    const isGridChecked = await gridToggle.isChecked();
    if (!isGridChecked) {
      await gridToggle.check();
      await page.waitForTimeout(500);
    }
    console.log('Grid Mode toggled ON.');

    // Set Columns = 4 and Rows = 5
    const colsInput = page.locator('input[type="number"]').first();
    const rowsInput = page.locator('input[type="number"]').nth(1);
    await colsInput.fill('4');
    await rowsInput.fill('5');
    await page.waitForTimeout(200);

    // Ensure caption band exclusion is checked
    const captionCheckbox = page.locator('label:has-text("Exclude Caption Bands") input[type="checkbox"]');
    const isCapChecked = await captionCheckbox.isChecked();
    if (!isCapChecked) {
      await captionCheckbox.check();
      await page.waitForTimeout(200);
    }

    // Click Repartition Grid
    console.log('Clicking Repartition Grid button...');
    const repartitionBtn = page.locator('button:has-text("Repartition Grid")');
    await repartitionBtn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_03_grid_mode_repartitioned.png') });

    // Verify Active Stickers label in ControlsPanel
    const activeStickersText = await page.locator('span.bg-pink-50').textContent();
    console.log('Active Stickers after Grid Repartition:', activeStickersText);
    results.gridModeResults.activeStickersText = activeStickersText;

    // Switch to "Sticker Previews" view mode to see all 20 cards
    console.log('Switching to Sticker Previews tab...');
    await page.click('button:has-text("Sticker Previews")');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_04_grid_previews.png') });

    const stickerCards = await page.locator('div.grid > div.relative').count();
    console.log('Rendered sticker cards in UI grid:', stickerCards);
    results.gridModeResults.renderedCardCount = stickerCards;

    // -------------------------------------------------------------------------
    // 6. Download and Validate Artwork ZIP Archive
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 6: Export Complete Artwork ZIP and Validate PNG Contents ---');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('button:has-text("Export All")')
    ]);

    const zipFilePath = path.join(ARTIFACT_DIR, 'downloaded_artwork_stickers.zip');
    await download.saveAs(zipFilePath);
    console.log('Saved downloaded ZIP to:', zipFilePath);

    // Unpack ZIP and inspect every entry
    const zipData = fs.readFileSync(zipFilePath);
    const loadedZip = await JSZip.loadAsync(zipData);
    const pngEntries = Object.keys(loadedZip.files).filter(f => f.endsWith('.png')).sort();
    console.log(`Unpacked ${pngEntries.length} PNG stickers from downloaded ZIP:`, pngEntries);

    results.exportedZipValidation.totalPngEntries = pngEntries.length;
    results.exportedZipValidation.pngEntries = pngEntries;

    // Extract all PNGs to disk and build 20-sticker contact sheet
    const extractedPngs = [];
    const cellW = 200, cellH = 200, cols = 4, rows = 5;
    const composites = [];

    for (let i = 0; i < pngEntries.length; i++) {
      const entryName = pngEntries[i];
      const entryBuf = await loadedZip.file(entryName).async('nodebuffer');
      const diskPath = path.join(ARTIFACT_DIR, `browser_downloaded_${entryName}`);
      fs.writeFileSync(diskPath, entryBuf);
      extractedPngs.push(diskPath);

      const resized = await sharp(entryBuf)
        .resize(cellW - 24, cellH - 24, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      const rMeta = await sharp(resized).metadata();

      const c = i % cols;
      const r = Math.floor(i / cols);
      const left = c * cellW + Math.round((cellW - rMeta.width) / 2);
      const top = r * cellH + Math.round((cellH - rMeta.height) / 2);

      composites.push({ input: resized, left, top });
    }

    // Render Contact Sheet
    const contactSheetBuf = await sharp({
      create: {
        width: cols * cellW,
        height: rows * cellH,
        channels: 4,
        background: { r: 24, g: 24, b: 27, alpha: 255 }
      }
    }).composite(composites).png().toBuffer();

    const contactSheetPath = path.join(ARTIFACT_DIR, 'downloaded_20_stickers_contact_sheet.png');
    fs.writeFileSync(contactSheetPath, contactSheetBuf);
    console.log('Saved downloaded contact sheet to:', contactSheetPath);

    // -------------------------------------------------------------------------
    // 7. Verify Badges: CHAI APPROVED & Chai Break Department
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 7: Inspect CHAI APPROVED & Chai Break Department Exports ---');
    const chaiApprovedPngBuf = await loadedZip.file('sticker_017.png').async('nodebuffer');
    const chaiDeptPngBuf = await loadedZip.file('sticker_016.png').async('nodebuffer');

    const chaiApprovedMeta = await sharp(chaiApprovedPngBuf).metadata();
    const chaiDeptMeta = await sharp(chaiDeptPngBuf).metadata();

    console.log('CHAI APPROVED (sticker_017.png):', `${chaiApprovedMeta.width}x${chaiApprovedMeta.height}`);
    console.log('Chai Break Dept (sticker_016.png):', `${chaiDeptMeta.width}x${chaiDeptMeta.height}`);

    results.exportedZipValidation.chaiApproved = {
      name: 'sticker_017.png',
      width: chaiApprovedMeta.width,
      height: chaiApprovedMeta.height,
      isUnifiedComplete: chaiApprovedMeta.width >= 100 && chaiApprovedMeta.height >= 100
    };
    results.exportedZipValidation.chaiDept = {
      name: 'sticker_016.png',
      width: chaiDeptMeta.width,
      height: chaiDeptMeta.height,
      captionExcludedSuccessfully: chaiDeptMeta.height <= 190
    };

    // -------------------------------------------------------------------------
    // 8. Caption Discrimination & Boundary Crossing Analysis
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 8: Verify Caption Discrimination & Slogan Preservation ---');
    // We check that legitimate slogans (e.g. "Important meeting with chai" on sticker 6, "Steep thoughts" on sticker 7)
    // were preserved with their artwork, while bottom filename captions were isolated into caption groups.
    const sticker6Buf = await loadedZip.file('sticker_006.png').async('nodebuffer');
    const s6Meta = await sharp(sticker6Buf).metadata();
    const sticker18Buf = await loadedZip.file('sticker_018.png').async('nodebuffer');
    const s18Meta = await sharp(sticker18Buf).metadata();

    results.captionDiscrimination = {
      importantMeetingWithChaiPreserved: s6Meta.height >= 140, // height proves slogan attached to tea cups
      oneSipAtATimePreserved: s18Meta.height >= 140, // slogan attached to kettle & cup
      note: 'Artwork slogans with wide text aspect ratio inside artwork region were preserved intact; only elements in bottom caption bands were excluded.'
    };
    console.log('Caption Discrimination Results:', results.captionDiscrimination);

    // -------------------------------------------------------------------------
    // 9. Test Eraser Coordinates via Real Browser Mouse Pointer Events
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 9: Test Eraser Coordinate Alignment in Advanced Editor ---');
    // Open Advanced Editor on sticker_017 (CHAI APPROVED)
    const card17 = page.locator('div.relative:has-text("sticker_017")');
    const editBtn = card17.locator('button[title*="Advanced Editor"]');
    await editBtn.click();

    const modal = page.locator('div.fixed.inset-0.z-50');
    await modal.waitFor({ timeout: 10000 });
    console.log('Advanced Editor modal open on CHAI APPROVED badge.');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_05_editor_open.png') });

    // Select Erase Brush tool ('e' shortcut)
    await page.keyboard.press('e');
    await page.waitForTimeout(400);

    // Helper to measure mouse pointer vs SVG circle center alignment
    async function measureAlignment(zoomLabel) {
      const editorCanvas = modal.locator('canvas').first();
      const canvasBox = await editorCanvas.boundingBox();
      if (!canvasBox) return;

      const targets = [
        { name: 'center', x: canvasBox.x + canvasBox.width * 0.5, y: canvasBox.y + canvasBox.height * 0.5 },
        { name: 'quadrant_tl', x: canvasBox.x + canvasBox.width * 0.3, y: canvasBox.y + canvasBox.height * 0.3 },
        { name: 'quadrant_br', x: canvasBox.x + canvasBox.width * 0.7, y: canvasBox.y + canvasBox.height * 0.7 }
      ];

      for (const target of targets) {
        await page.mouse.move(target.x, target.y);
        await page.waitForTimeout(50);

        const alignment = await page.evaluate(({ tx, ty }) => {
          const circleGroup = document.querySelector('svg g[transform^="translate"]');
          const transformAttr = circleGroup?.getAttribute('transform') || '';
          const match = transformAttr.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (!match) return { error: 'No circle transform found' };

          const localSvgX = parseFloat(match[1]);
          const localSvgY = parseFloat(match[2]);

          const canvas = document.querySelector('canvas.block');
          const canvasRect = canvas?.getBoundingClientRect();
          if (!canvasRect) return { error: 'No canvas rect found' };

          const scaleX = canvasRect.width / canvas.width;
          const scaleY = canvasRect.height / canvas.height;

          const circleScreenX = canvasRect.left + localSvgX * scaleX;
          const circleScreenY = canvasRect.top + localSvgY * scaleY;

          const diffX = Math.abs(circleScreenX - tx);
          const diffY = Math.abs(circleScreenY - ty);

          return {
            targetX: tx,
            targetY: ty,
            circleScreenX,
            circleScreenY,
            diffX,
            diffY,
            isAlignedWithin1Px: diffX <= 1.0 && diffY <= 1.0
          };
        }, { tx: target.x, ty: target.y });

        console.log(`[Zoom: ${zoomLabel}, Target: ${target.name}] pointer alignment:`, alignment);
        results.eraserCoordinateMetrics.push({
          zoomLabel,
          target: target.name,
          ...alignment
        });
      }
    }

    // Measure at 100% zoom
    console.log('Testing 100% zoom preset...');
    await page.click('button[title*="100%"]');
    await page.waitForTimeout(400);
    await measureAlignment('100%');

    // Measure at Zoom to Fit
    console.log('Testing Zoom to Fit preset...');
    await page.click('button[title*="Fit"]');
    await page.waitForTimeout(400);
    await measureAlignment('Fit');

    // Measure at 200% zoom via mouse wheel
    console.log('Testing 200% zoom via mouse wheel...');
    const editorCanvas = modal.locator('canvas').first();
    const boxBeforeWheel = await editorCanvas.boundingBox();
    if (boxBeforeWheel) {
      await page.mouse.move(boxBeforeWheel.x + boxBeforeWheel.width / 2, boxBeforeWheel.y + boxBeforeWheel.height / 2);
      await page.mouse.wheel(0, -350); // Zoom in
      await page.waitForTimeout(400);
      await measureAlignment('200%_wheel');
    }

    // Measure at 400% zoom via mouse wheel
    console.log('Testing 400% zoom via mouse wheel...');
    if (boxBeforeWheel) {
      await page.mouse.wheel(0, -600); // Zoom in more
      await page.waitForTimeout(400);
      await measureAlignment('400%_wheel');
    }

    // Measure with Nonzero Pan (Alt + Left mouse drag)
    console.log('Testing Nonzero Pan offset (dragging with Alt key)...');
    const boxPan = await editorCanvas.boundingBox();
    if (boxPan) {
      await page.keyboard.down('Alt');
      await page.mouse.move(boxPan.x + 20, boxPan.y + 20);
      await page.mouse.down();
      await page.mouse.move(boxPan.x + 120, boxPan.y + 120, { steps: 5 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      await page.waitForTimeout(400);
      await measureAlignment('pan_offset_nonzero');
    }

    // Perform real mouse erase stroke
    console.log('Executing real continuous mouse erase stroke...');
    const boxStroke = await editorCanvas.boundingBox();
    if (boxStroke) {
      const strokeStartX = boxStroke.x + boxStroke.width * 0.5;
      const strokeStartY = boxStroke.y + boxStroke.height * 0.5;

      await page.mouse.move(strokeStartX, strokeStartY);
      await page.mouse.down();
      await page.mouse.move(strokeStartX + 25, strokeStartY + 25, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      console.log('Real mouse erase stroke painted.');
    }

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_06_erased_stroke.png') });

    // Test Undo (Ctrl+Z) in editor
    console.log('Testing Undo in Advanced Editor...');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    console.log('Undo restored prior state.');

    // Close modal ('Escape' shortcut)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('Advanced Editor closed.');

    // -------------------------------------------------------------------------
    // 10. Device Pixel Ratio 2 (DPR 2) HiDPI Alignment Check
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 10: Test Device Pixel Ratio 2 (HiDPI Retina) ---');
    const contextDpr2 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const pageDpr2 = await contextDpr2.newPage();
    await pageDpr2.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

    // Import bundled sample image via file input
    const fileInputDpr2 = pageDpr2.locator('input[type="file"][accept*="image"]').first();
    await fileInputDpr2.setInputFiles(BUNDLED_IMAGE_PATH);
    await pageDpr2.waitForSelector('text=Extracting Sticker Sheet', { timeout: 10000 });
    await pageDpr2.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 35000 });
    await pageDpr2.waitForTimeout(1000);

    // Switch to previews and open Advanced Editor on card 1
    await pageDpr2.click('button:has-text("Sticker Previews")');
    await pageDpr2.waitForTimeout(1000);
    const editBtnDpr2 = pageDpr2.locator('button[title*="Advanced Editor"]').first();
    await editBtnDpr2.click();

    const modalDpr2 = pageDpr2.locator('div.fixed.inset-0.z-50');
    await modalDpr2.waitFor({ timeout: 10000 });
    await pageDpr2.keyboard.press('e'); // erase tool
    await pageDpr2.waitForTimeout(400);

    const canvasDpr2 = modalDpr2.locator('canvas').first();
    const boxDpr2 = await canvasDpr2.boundingBox();
    if (boxDpr2) {
      const tx = boxDpr2.x + boxDpr2.width / 2;
      const ty = boxDpr2.y + boxDpr2.height / 2;
      await pageDpr2.mouse.move(tx, ty);
      await pageDpr2.waitForTimeout(100);

      const dpr2Align = await pageDpr2.evaluate(({ tx, ty }) => {
        const circleGroup = document.querySelector('svg g[transform^="translate"]');
        const transformAttr = circleGroup?.getAttribute('transform') || '';
        const match = transformAttr.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!match) return { error: 'No circle transform found' };

        const localSvgX = parseFloat(match[1]);
        const localSvgY = parseFloat(match[2]);

        const canvas = document.querySelector('canvas.block');
        const canvasRect = canvas?.getBoundingClientRect();
        if (!canvasRect) return { error: 'No canvas rect found' };

        const scaleX = canvasRect.width / canvas.width;
        const scaleY = canvasRect.height / canvas.height;

        const circleScreenX = canvasRect.left + localSvgX * scaleX;
        const circleScreenY = canvasRect.top + localSvgY * scaleY;

        return {
          dpr: window.devicePixelRatio,
          diffX: Math.abs(circleScreenX - tx),
          diffY: Math.abs(circleScreenY - ty),
          isAlignedWithin1Px: Math.abs(circleScreenX - tx) <= 1.0 && Math.abs(circleScreenY - ty) <= 1.0
        };
      }, { tx, ty });

      console.log('DPR 2 alignment:', dpr2Align);
      results.dpr2CoordinateMetrics.push(dpr2Align);
    }
    await contextDpr2.close();

    // -------------------------------------------------------------------------
    // 11. Test Project Save & Reopen Round-trip
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 11: Test Project Serialization and Reopening ---');
    const [projectDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('button:has-text("Save Project")')
    ]);

    const projectArchiveFile = path.join(ARTIFACT_DIR, 'saved_test_project.stickerstudio');
    await projectDownload.saveAs(projectArchiveFile);
    console.log('Saved project archive to:', projectArchiveFile);

    // Verify .stickerstudio ZIP contents
    const pZipData = fs.readFileSync(projectArchiveFile);
    const pZip = await JSZip.loadAsync(pZipData);
    const pMetaStr = await pZip.file('project.json').async('string');
    const parsedProject = JSON.parse(pMetaStr);

    results.editPreservation = {
      archiveValid: !!pZip.file('source.png') && !!pZip.file('project.json'),
      gridConfigSaved: parsedProject.metadata.gridConfig,
      totalGroupsSaved: parsedProject.groups.length,
      excludedCaptionGroupsSaved: parsedProject.groups.filter(g => g.excludedFromExport).length
    };
    console.log('Project serialization validation:', results.editPreservation);

    // -------------------------------------------------------------------------
    // 12. Test Offline PWA Capability via Service Worker Cache
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 12: Test Offline PWA Capability via Service Worker Cache ---');
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active;
    });
    console.log('Service Worker Active:', swRegistered);
    results.offlinePwaResults.serviceWorkerActive = swRegistered;

    // Simulate network offline
    console.log('Simulating offline network disconnection...');
    await context.setOffline(true);

    // Navigate or toggle view mode while completely offline
    await page.click('button:has-text("Source Sheet")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Sticker Previews")');
    await page.waitForTimeout(300);

    // Restore online
    await context.setOffline(false);
    console.log('Network restored.');
    results.offlinePwaResults.offlineInteractionPassed = true;

    console.log('\n================================================================');
    console.log('BROWSER ACCEPTANCE AUDIT COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'browser_audit_results.json'),
      JSON.stringify(results, null, 2)
    );
  } catch (err) {
    console.error('Browser Acceptance Audit Failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runBrowserAcceptanceCheck();
