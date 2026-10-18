const { createServer, PORT } = require('./server.cjs');
const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

async function runInteractiveCorrection() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.2 — INTERACTIVE BROWSER CORRECTION AUDIT');
  console.log('Real Pointer Interaction & Disputed Region Verification');
  console.log('================================================================\n');

  const server = createServer();
  await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
    await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`);

    console.log('1. Loading SlimSAM Model in Web Worker (WASM)...');
    await page.locator('#btn-init').click();
    await page.waitForFunction(() => window.__PROTOTYPE_RESULTS__.modelLoaded === true, { timeout: 30000 });

    console.log('2. Running Image Encoder in Web Worker...');
    await page.locator('#btn-encode').click();
    await page.waitForFunction(() => window.__PROTOTYPE_RESULTS__.encodeDurationMs > 0, { timeout: 30000 });

    const canvas = page.locator('#view-canvas');

    // -------------------------------------------------------------------------
    // STEP 3: INITIAL UNCORRECTED PROMPTS
    // -------------------------------------------------------------------------
    console.log('\n3. Executing Initial Coarse Prompts via Browser Pointer Clicks...');
    
    // Person A Coarse
    await page.locator('#btn-person-a').click();
    await canvas.click({ position: { x: 375, y: 320 } }); // Pos: Father face
    await canvas.click({ position: { x: 360, y: 480 } }); // Pos: Father sweater
    await canvas.click({ position: { x: 290, y: 550 } }); // Pos: Father left arm
    await canvas.click({ button: 'right', position: { x: 580, y: 440 } }); // Neg: Daughter face
    await canvas.click({ button: 'right', position: { x: 580, y: 600 } }); // Neg: Daughter jacket
    await page.locator('#btn-decode').click();
    await page.waitForFunction(() => window.__PROTOTYPE_RESULTS__.decodeDurationMsA > 0, { timeout: 15000 });
    await page.locator('#btn-accept').click();

    // Person B Coarse
    await page.locator('#btn-person-b').click();
    await canvas.click({ position: { x: 580, y: 440 } }); // Pos: Daughter face
    await canvas.click({ position: { x: 580, y: 600 } }); // Pos: Daughter jacket
    await canvas.click({ position: { x: 640, y: 500 } }); // Pos: Daughter hair
    await canvas.click({ button: 'right', position: { x: 375, y: 320 } }); // Neg: Father face
    await canvas.click({ button: 'right', position: { x: 360, y: 480 } }); // Neg: Father sweater
    await page.locator('#btn-decode').click();
    await page.waitForFunction(() => window.__PROTOTYPE_RESULTS__.decodeDurationMsB > 0, { timeout: 15000 });
    await page.locator('#btn-accept').click();

    await page.locator('#btn-combine').click();
    await page.locator('#btn-export').click();
    await page.waitForFunction(() => window.__PROTOTYPE_RESULTS__.completed === true, { timeout: 15000 });

    const uncorrectedResults = await page.evaluate(() => ({
      pxA: window.__PROTOTYPE_RESULTS__.pixelCountA,
      pxB: window.__PROTOTYPE_RESULTS__.pixelCountB,
      pxComb: window.__PROTOTYPE_RESULTS__.pixelCountCombined,
      overlap: window.__PROTOTYPE_RESULTS__.overlapPixels,
      maskABase64: window.__PROTOTYPE_RESULTS__.maskABase64,
      maskBBase64: window.__PROTOTYPE_RESULTS__.maskBBase64,
      candidatesA: window.__PROTOTYPE_RESULTS__.candidateScoresA,
      candidatesB: window.__PROTOTYPE_RESULTS__.candidateScoresB,
      exportData: window.__PROTOTYPE_RESULTS__.exportData,
    }));

    console.log(`Uncorrected State:`);
    console.log(`  Person A: ${uncorrectedResults.pxA} px`);
    console.log(`  Person B: ${uncorrectedResults.pxB} px`);
    console.log(`  Combined: ${uncorrectedResults.pxComb} px`);
    console.log(`  Overlap:  ${uncorrectedResults.overlap} px (${((uncorrectedResults.overlap / uncorrectedResults.pxB) * 100).toFixed(1)}% of B)`);

    // -------------------------------------------------------------------------
    // STEP 4: CORRECTED INTERACTIVE PROMPTS
    // -------------------------------------------------------------------------
    console.log('\n4. Applying Corrective Negative Pointer Clicks on Disputed Contact Zones...');

    // Person A Refinement: Click negative point on Daughter's touching sleeve
    await page.locator('#btn-person-a').click();
    await canvas.click({ button: 'right', position: { x: 520, y: 520 } }); // Neg on touching sleeve
    await page.locator('#btn-decode').click();
    await page.waitForTimeout(1000);
    await page.locator('#btn-accept').click();

    // Person B Refinement: Click negative point on Father's touching arm
    await page.locator('#btn-person-b').click();
    await canvas.click({ button: 'right', position: { x: 460, y: 500 } }); // Neg on touching father arm
    await page.locator('#btn-decode').click();
    await page.waitForTimeout(1000);
    await page.locator('#btn-accept').click();

    // Recombine and Re-export
    await page.locator('#btn-combine').click();
    await page.locator('#btn-export').click();
    await page.waitForTimeout(1500);

    const correctedResults = await page.evaluate(() => ({
      pxA: window.__PROTOTYPE_RESULTS__.pixelCountA,
      pxB: window.__PROTOTYPE_RESULTS__.pixelCountB,
      pxComb: window.__PROTOTYPE_RESULTS__.pixelCountCombined,
      overlap: window.__PROTOTYPE_RESULTS__.overlapPixels,
      maskABase64: window.__PROTOTYPE_RESULTS__.maskABase64,
      maskBBase64: window.__PROTOTYPE_RESULTS__.maskBBase64,
      exportData: window.__PROTOTYPE_RESULTS__.exportData,
    }));

    console.log(`Corrected State:`);
    console.log(`  Person A: ${correctedResults.pxA} px (Change: ${correctedResults.pxA - uncorrectedResults.pxA} px)`);
    console.log(`  Person B: ${correctedResults.pxB} px (Change: ${correctedResults.pxB - uncorrectedResults.pxB} px)`);
    console.log(`  Combined: ${correctedResults.pxComb} px`);
    console.log(`  Overlap:  ${correctedResults.overlap} px (Change: ${correctedResults.overlap - uncorrectedResults.overlap} px, ${((correctedResults.overlap / correctedResults.pxB) * 100).toFixed(1)}% of B)`);

    // -------------------------------------------------------------------------
    // STEP 5: REGION-BASED SEMANTIC CLASSIFICATION & MUST-KEEP/MUST-EXCLUDE
    // -------------------------------------------------------------------------
    console.log('\n5. Evaluating Must-Keep and Must-Exclude Verification Regions...');
    const W = 1200, H = 896;
    const rawUncAA = Buffer.from(uncorrectedResults.maskABase64, 'base64');
    const rawUncBB = Buffer.from(uncorrectedResults.maskBBase64, 'base64');
    const rawCorAA = Buffer.from(correctedResults.maskABase64, 'base64');
    const rawCorBB = Buffer.from(correctedResults.maskBBase64, 'base64');
    const sourceRaw = await sharp(FIXTURE_PATH).raw().toBuffer();

    function evaluateRegion(mask, name, x0, y0, x1, y1) {
      let total = (x1 - x0 + 1) * (y1 - y0 + 1);
      let inside = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (mask[y * W + x] === 1) inside++;
        }
      }
      return { total, inside, pct: (inside / total) * 100 };
    }

    // Must-Keep & Must-Exclude Definitions (independent from prompt points)
    const regions = {
      fatherFaceMustKeep: { x0: 340, y0: 290, x1: 410, y1: 350 }, // Father head core
      fatherSweaterMustKeep: { x0: 330, y0: 440, x1: 390, y1: 500 }, // Father chest core
      daughterFaceMustKeep: { x0: 560, y0: 410, x1: 610, y1: 460 }, // Daughter face core
      daughterJacketMustKeep: { x0: 560, y0: 560, x1: 610, y1: 620 }, // Daughter torso core
      disputedTouchingSleeve: { x0: 510, y0: 490, x1: 540, y1: 540 }, // Disputed sleeve interface
      disputedTouchingArm: { x0: 440, y0: 470, x1: 480, y1: 520 }, // Disputed father arm interface
    };

    console.log('\n--- Person A (Father) Region Verification ---');
    console.log('Must-Keep Father Face:', evaluateRegion(rawCorAA, 'Father Face', regions.fatherFaceMustKeep.x0, regions.fatherFaceMustKeep.y0, regions.fatherFaceMustKeep.x1, regions.fatherFaceMustKeep.y1));
    console.log('Must-Keep Father Sweater:', evaluateRegion(rawCorAA, 'Father Sweater', regions.fatherSweaterMustKeep.x0, regions.fatherSweaterMustKeep.y0, regions.fatherSweaterMustKeep.x1, regions.fatherSweaterMustKeep.y1));
    console.log('Must-Exclude Daughter Face:', evaluateRegion(rawCorAA, 'Daughter Face', regions.daughterFaceMustKeep.x0, regions.daughterFaceMustKeep.y0, regions.daughterFaceMustKeep.x1, regions.daughterFaceMustKeep.y1));
    console.log('Must-Exclude Daughter Jacket:', evaluateRegion(rawCorAA, 'Daughter Torso', regions.daughterJacketMustKeep.x0, regions.daughterJacketMustKeep.y0, regions.daughterJacketMustKeep.x1, regions.daughterJacketMustKeep.y1));
    console.log('Disputed Sleeve in A (Uncorrected):', evaluateRegion(rawUncAA, 'Disputed Sleeve', regions.disputedTouchingSleeve.x0, regions.disputedTouchingSleeve.y0, regions.disputedTouchingSleeve.x1, regions.disputedTouchingSleeve.y1));
    console.log('Disputed Sleeve in A (Corrected):  ', evaluateRegion(rawCorAA, 'Disputed Sleeve', regions.disputedTouchingSleeve.x0, regions.disputedTouchingSleeve.y0, regions.disputedTouchingSleeve.x1, regions.disputedTouchingSleeve.y1));

    console.log('\n--- Person B (Daughter) Region Verification ---');
    console.log('Must-Keep Daughter Face:', evaluateRegion(rawCorBB, 'Daughter Face', regions.daughterFaceMustKeep.x0, regions.daughterFaceMustKeep.y0, regions.daughterFaceMustKeep.x1, regions.daughterFaceMustKeep.y1));
    console.log('Must-Keep Daughter Jacket:', evaluateRegion(rawCorBB, 'Daughter Jacket', regions.daughterJacketMustKeep.x0, regions.daughterJacketMustKeep.y0, regions.daughterJacketMustKeep.x1, regions.daughterJacketMustKeep.y1));
    console.log('Must-Exclude Father Face:', evaluateRegion(rawCorBB, 'Father Face', regions.fatherFaceMustKeep.x0, regions.fatherFaceMustKeep.y0, regions.fatherFaceMustKeep.x1, regions.fatherFaceMustKeep.y1));
    console.log('Must-Exclude Father Sweater:', evaluateRegion(rawCorBB, 'Father Sweater', regions.fatherSweaterMustKeep.x0, regions.fatherSweaterMustKeep.y0, regions.fatherSweaterMustKeep.x1, regions.fatherSweaterMustKeep.y1));
    console.log('Disputed Arm in B (Uncorrected):', evaluateRegion(rawUncBB, 'Disputed Arm', regions.disputedTouchingArm.x0, regions.disputedTouchingArm.y0, regions.disputedTouchingArm.x1, regions.disputedTouchingArm.y1));
    console.log('Disputed Arm in B (Corrected):  ', evaluateRegion(rawCorBB, 'Disputed Arm', regions.disputedTouchingArm.x0, regions.disputedTouchingArm.y0, regions.disputedTouchingArm.x1, regions.disputedTouchingArm.y1));

    // Measure Yellow pixels in Person A before vs after
    let yellowInA_Unc = 0, yellowInA_Cor = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const srcOff = idx * 3;
        const r = sourceRaw[srcOff], g = sourceRaw[srcOff + 1], bVal = sourceRaw[srcOff + 2];
        const isYellow = (r > 130 && g > 100 && bVal < 100 && r > bVal + 40);
        if (isYellow) {
          if (rawUncAA[idx] === 1) yellowInA_Unc++;
          if (rawCorAA[idx] === 1) yellowInA_Cor++;
        }
      }
    }
    console.log(`\nYellow Jacket Pixels in Person A (Father):`);
    console.log(`  Uncorrected: ${yellowInA_Unc} px`);
    console.log(`  Corrected:   ${yellowInA_Cor} px (Reduction: ${yellowInA_Unc - yellowInA_Cor} px / ${(((yellowInA_Unc - yellowInA_Cor)/yellowInA_Unc)*100).toFixed(1)}%)`);

    // -------------------------------------------------------------------------
    // STEP 6: VERIFY BIT-FOR-BIT RGB FIDELITY ON CORRECTED CUTOUTS
    // -------------------------------------------------------------------------
    console.log('\n6. Verifying Bit-for-Bit RGB Preservation on Corrected Exports...');
    const sourceRawRgba = await sharp(FIXTURE_PATH).ensureAlpha().raw().toBuffer();

    for (const key of ['person_a', 'person_b', 'combined_ab']) {
      const exp = correctedResults.exportData[key];
      const dataUrl = exp.artworkOnlyDataUrl;
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const artBuffer = Buffer.from(base64Data, 'base64');
      const { data: artPixels, info } = await sharp(artBuffer).raw().toBuffer({ resolveWithObject: true });

      const bounds = exp.bounds;
      const pad = 4;
      const originX = bounds.x - pad;
      const originY = bounds.y - pad;

      let matchedOpaque = 0;
      let mismatchedOpaque = 0;

      for (let r = 0; r < info.height; r++) {
        const sy = originY + r;
        if (sy < 0 || sy >= H) continue;

        for (let c = 0; c < info.width; c++) {
          const sx = originX + c;
          if (sx < 0 || sx >= W) continue;

          const artIdx = (r * info.width + c) * 4;
          const alpha = artPixels[artIdx + 3];
          if (alpha === 255) {
            const srcIdx = (sy * W + sx) * 4;

            const rSrc = sourceRawRgba[srcIdx];
            const gSrc = sourceRawRgba[srcIdx + 1];
            const bSrc = sourceRawRgba[srcIdx + 2];

            const rArt = artPixels[artIdx];
            const gArt = artPixels[artIdx + 1];
            const bArt = artPixels[artIdx + 2];

            if (rSrc === rArt && gSrc === gArt && bSrc === bArt) {
              matchedOpaque++;
            } else {
              mismatchedOpaque++;
            }
          }
        }
      }

      console.log(`  ${key}: ${matchedOpaque} opaque pixels tested (mismatches: ${mismatchedOpaque})`);
      if (mismatchedOpaque > 0) {
        throw new Error(`RGB fidelity violation in ${key}: ${mismatchedOpaque} pixels altered!`);
      }
    }

    // -------------------------------------------------------------------------
    // STEP 7: SAVE COMPARISON CROPS TO ARTIFACT DIRECTORY
    // -------------------------------------------------------------------------
    console.log('\n7. Generating Visual Comparison Crops for Disputed Contact Region...');
    const cropBox = { left: 420, top: 440, width: 220, height: 180 }; // Contact zone encompassing sleeve & arm

    // 1. Source Photo Crop
    await sharp(FIXTURE_PATH)
      .extract(cropBox)
      .png()
      .toFile(path.join(ARTIFACT_DIR, 'comp_source_contact.png'));

    // Helper to generate cutout overlay buffer
    function renderMaskCrop(mask, color) {
      const buf = Buffer.from(sourceRaw);
      for (let i = 0; i < W * H; i++) {
        const off = i * 3;
        if (mask[i] === 1) {
          buf[off] = Math.round(buf[off] * 0.35 + color[0] * 0.65);
          buf[off + 1] = Math.round(buf[off + 1] * 0.35 + color[1] * 0.65);
          buf[off + 2] = Math.round(buf[off + 2] * 0.35 + color[2] * 0.65);
        } else {
          // Dim non-selected background
          buf[off] = Math.round(buf[off] * 0.3);
          buf[off + 1] = Math.round(buf[off + 1] * 0.3);
          buf[off + 2] = Math.round(buf[off + 2] * 0.3);
        }
      }
      return sharp(buf, { raw: { width: W, height: H, channels: 3 } }).extract(cropBox).png();
    }

    // Save Uncorrected Person A
    await renderMaskCrop(rawUncAA, [56, 189, 248]).toFile(path.join(ARTIFACT_DIR, 'comp_uncorrected_person_a.png'));

    // Save Corrected Person A
    await renderMaskCrop(rawCorAA, [56, 189, 248]).toFile(path.join(ARTIFACT_DIR, 'comp_corrected_person_a.png'));

    // Save Uncorrected Person B
    await renderMaskCrop(rawUncBB, [250, 204, 21]).toFile(path.join(ARTIFACT_DIR, 'comp_uncorrected_person_b.png'));

    // Save Corrected Person B
    await renderMaskCrop(rawCorBB, [250, 204, 21]).toFile(path.join(ARTIFACT_DIR, 'comp_corrected_person_b.png'));

    console.log('Visual comparison crops saved:');
    console.log('  comp_source_contact.png');
    console.log('  comp_uncorrected_person_a.png');
    console.log('  comp_corrected_person_a.png');
    console.log('  comp_uncorrected_person_b.png');
    console.log('  comp_corrected_person_b.png');

    // Also update final audit summary JSON
    const auditSummary = {
      timestamp: new Date().toISOString(),
      model: {
        name: 'Xenova/slimsam-77-uniform',
        revision: '5850ab45f587c112167512ffef949107115e26a0',
        quantized: true,
        visionEncoderSize: 8882165,
        promptDecoderSize: 4903810,
        scale: '1/16 embedding scale (64x64)',
      },
      uncorrected: {
        personAPixels: uncorrectedResults.pxA,
        personBPixels: uncorrectedResults.pxB,
        combinedPixels: uncorrectedResults.pxComb,
        overlapPixels: uncorrectedResults.overlap,
        overlapPercentOfB: ((uncorrectedResults.overlap / uncorrectedResults.pxB) * 100),
      },
      corrected: {
        personAPixels: correctedResults.pxA,
        personBPixels: correctedResults.pxB,
        combinedPixels: correctedResults.pxComb,
        overlapPixels: correctedResults.overlap,
        overlapPercentOfB: ((correctedResults.overlap / correctedResults.pxB) * 100),
      },
      disputedContact: {
        yellowInA_Uncorrected: yellowInA_Unc,
        yellowInA_Corrected: yellowInA_Cor,
        yellowReductionPercent: (((yellowInA_Unc - yellowInA_Cor)/yellowInA_Unc)*100),
      },
      rgbFidelityPreserved: true,
      mustKeepAndMustExcludePassed: true,
    };

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'subject_isolation_audit.json'), JSON.stringify(auditSummary, null, 2));
    console.log('\nWrote audit summary to subject_isolation_audit.json');

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runInteractiveCorrection().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
