const { createServer, PORT } = require('./server.cjs');
const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

async function main() {
  console.log('=== INSPECTING ACTUAL BROWSER OVERLAP PIXELS ===\n');

  const server = createServer();
  await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`);

    console.log('1. Executing browser prototype to collect raw masks...');
    const results = await page.evaluate(async () => {
      return await window.__RUN_AUTOMATED_PROTOTYPE__();
    });

    console.log('2. Decoding raw masks from browser...');
    const rawA = Buffer.from(results.maskABase64, 'base64');
    const rawB = Buffer.from(results.maskBBase64, 'base64');

    const W = 1200, H = 896;
    const sourceRaw = await sharp(FIXTURE_PATH).raw().toBuffer();

    let countA = 0, countB = 0, shared = 0;
    let minX = W, maxX = 0, minY = H, maxY = 0;

    // Detailed classification counters for shared pixels
    let yellowJacketPixels = 0; // Daughter's yellow jacket
    let navySweaterPixels = 0;  // Father's navy sweater
    let skinTonePixels = 0;     // Hands / skin
    let benchOrBgPixels = 0;    // Bench wood or background
    let otherPixels = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const a = rawA[idx];
        const b = rawB[idx];
        if (a === 1) countA++;
        if (b === 1) countB++;

        if (a === 1 && b === 1) {
          shared++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          // Classify color of pixel from source photograph
          const srcIdx = idx * 3;
          const r = sourceRaw[srcIdx];
          const g = sourceRaw[srcIdx + 1];
          const bVal = sourceRaw[srcIdx + 2];

          // Yellow jacket: High R and G, lower B (R > 130, G > 100, B < 90, R > B + 40)
          if (r > 130 && g > 100 && bVal < 100 && r > bVal + 40) {
            yellowJacketPixels++;
          }
          // Navy sweater: Low R and G, dark blue/gray (R < 90, G < 90, B > R - 10)
          else if (r < 90 && g < 90 && bVal < 120) {
            navySweaterPixels++;
          }
          // Skin tones: R > G > BVal, warm tones
          else if (r > 140 && g > 90 && bVal > 60 && r > g && g > bVal) {
            skinTonePixels++;
          }
          // Bench wood: brownish
          else if (r > 70 && r < 140 && g > 40 && g < 100 && bVal < 80) {
            benchOrBgPixels++;
          } else {
            otherPixels++;
          }
        }
      }
    }

    console.log(`\nMask Counts:`);
    console.log(`  Person A Total:     ${countA} px`);
    console.log(`  Person B Total:     ${countB} px`);
    console.log(`  Shared Pixels:      ${shared} px (${((shared / (countA + countB - shared)) * 100).toFixed(2)}% of union, ${((shared / countB) * 100).toFixed(2)}% of Person B)`);
    console.log(`  Shared Bounding Box: [minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}, width=${maxX - minX + 1}, height=${maxY - minY + 1}]`);

    console.log(`\nSemantic Classification of Shared Pixels:`);
    console.log(`  Daughter's Yellow Jacket:  ${yellowJacketPixels} px (${((yellowJacketPixels / shared) * 100).toFixed(1)}%)`);
    console.log(`  Father's Navy Sweater/Arm: ${navySweaterPixels} px (${((navySweaterPixels / shared) * 100).toFixed(1)}%)`);
    console.log(`  Hands / Skin:              ${skinTonePixels} px (${((skinTonePixels / shared) * 100).toFixed(1)}%)`);
    console.log(`  Park Bench / Contact Base: ${benchOrBgPixels} px (${((benchOrBgPixels / shared) * 100).toFixed(1)}%)`);
    console.log(`  Boundary Ambiguity/Other:  ${otherPixels} px (${((otherPixels / shared) * 100).toFixed(1)}%)`);

    // 3. Generate Visual Diagnostic Overlays
    const ternary = Buffer.from(sourceRaw);
    for (let i = 0; i < W * H; i++) {
      const isA = rawA[i] === 1;
      const isB = rawB[i] === 1;
      const off = i * 3;

      if (isA && isB) {
        // Shared: Bright Magenta
        ternary[off] = 255;
        ternary[off + 1] = 0;
        ternary[off + 2] = 180;
      } else if (isA) {
        // Person A only: Cyan tint
        ternary[off] = Math.round(ternary[off] * 0.4 + 0 * 0.6);
        ternary[off + 1] = Math.round(ternary[off + 1] * 0.4 + 200 * 0.6);
        ternary[off + 2] = Math.round(ternary[off + 2] * 0.4 + 255 * 0.6);
      } else if (isB) {
        // Person B only: Gold Yellow tint
        ternary[off] = Math.round(ternary[off] * 0.4 + 255 * 0.6);
        ternary[off + 1] = Math.round(ternary[off + 1] * 0.4 + 200 * 0.6);
        ternary[off + 2] = Math.round(ternary[off + 2] * 0.4 + 0 * 0.6);
      }
    }

    await sharp(ternary, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(path.join(ARTIFACT_DIR, 'diag_browser_ternary.png'));

    // Extract close-up crop of disputed shared contact region with 30px padding
    const cropX = Math.max(0, minX - 30);
    const cropY = Math.max(0, minY - 30);
    const cropW = Math.min(W - cropX, maxX - minX + 60);
    const cropH = Math.min(H - cropY, maxY - minY + 60);

    await sharp(ternary, { raw: { width: W, height: H, channels: 3 } })
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png()
      .toFile(path.join(ARTIFACT_DIR, 'diag_browser_shared_crop.png'));

    await sharp(FIXTURE_PATH)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png()
      .toFile(path.join(ARTIFACT_DIR, 'diag_browser_source_crop.png'));

    console.log('\nDiagnostic crops saved to:');
    console.log('  ' + path.join(ARTIFACT_DIR, 'diag_browser_ternary.png'));
    console.log('  ' + path.join(ARTIFACT_DIR, 'diag_browser_shared_crop.png'));
    console.log('  ' + path.join(ARTIFACT_DIR, 'diag_browser_source_crop.png'));

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch(console.error);
