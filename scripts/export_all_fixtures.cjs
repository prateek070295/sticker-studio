const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const DIAG_DIR = path.resolve('docs/diagnosis_beach_family');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');

if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const FIXTURES = [
  { id: 'father_and_daughter', label: '1. Father & Daughter (Ref)', file: 'prototype_touching_subjects.jpg' },
  { id: 'beach_family', label: '2. Beach Family (Sunset)', file: 'eval_photo_1_beach_family.jpg' },
  { id: 'indoor_family', label: '3. Field Family (5 Members)', file: 'eval_photo_2_indoor_family.jpg' },
  { id: 'portrait_lighting', label: '4. Controller & Hand', file: 'eval_photo_3_portrait_lighting.jpg' },
];

async function run() {
  console.log('Launching browser to export stickers and measure pixels via UI...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'networkidle' });

  // Switch to Photo Mode
  await page.click('button:has-text("Photo Mode")');
  await page.waitForTimeout(300);

  const metrics = {};

  for (let idx = 0; idx < FIXTURES.length; idx++) {
    const f = FIXTURES[idx];
    console.log(`\nProcessing fixture: ${f.label} (${f.file})...`);

    const photoPath = path.join(FIXTURES_DIR, f.file);
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(photoPath);

    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log('  Photo loaded onto canvas.');

    // Click "Remove Background"
    const removeBgBtn = await page.waitForSelector('button:has-text("Remove Background")');
    await removeBgBtn.click();

    // Wait for Sticker Border button to be present
    await page.waitForSelector('button:has-text("Sticker Border")', { timeout: 30000 });
    console.log('  Background removal complete.');

    // 1. Explicitly ensure Sticker Border view is active
    await page.click('button:has-text("Sticker Border")');
    await page.waitForTimeout(200);

    const stickerData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonZeroAlpha = 0;
      for (let i = 3; i < imgData.data.length; i += 4) {
        if (imgData.data[i] > 0) nonZeroAlpha++;
      }
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: nonZeroAlpha,
        dataUrl: canvas.toDataURL('image/png'),
      };
    });

    // 2. Switch to Artwork Only view
    await page.click('button:has-text("Artwork Only")');
    await page.waitForTimeout(200);

    const artworkData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonZeroAlpha = 0;
      for (let i = 3; i < imgData.data.length; i += 4) {
        if (imgData.data[i] > 0) nonZeroAlpha++;
      }
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: nonZeroAlpha,
        dataUrl: canvas.toDataURL('image/png'),
      };
    });

    // 3. Switch to Original Photo view
    await page.click('button:has-text("Original Photo")');
    await page.waitForTimeout(200);

    const originalData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return {
        width: canvas.width,
        height: canvas.height,
        dataUrl: canvas.toDataURL('image/png'),
      };
    });

    metrics[f.id] = {
      id: f.id,
      label: f.label,
      width: originalData.width,
      height: originalData.height,
      totalPixels: originalData.width * originalData.height,
      artworkPixels: artworkData.pixels,
      whiteBackedPixels: stickerData.pixels,
      whiteBorderAddedPixels: stickerData.pixels - artworkData.pixels,
      originalDataUrl: originalData.dataUrl,
      artworkDataUrl: artworkData.dataUrl,
      whiteBackedDataUrl: stickerData.dataUrl,
    };

    console.log(`  Dimensions: ${originalData.width} × ${originalData.height} (${(originalData.width * originalData.height).toLocaleString()} px)`);
    console.log(`  Artwork Pixels: ${artworkData.pixels.toLocaleString()}`);
    console.log(`  White Backed Sticker: ${stickerData.pixels.toLocaleString()}`);
    console.log(`  White Border Added: +${(stickerData.pixels - artworkData.pixels).toLocaleString()} px`);

    // Reset for next fixture
    if (idx < FIXTURES.length - 1) {
      await page.click('button:has-text("Change Photo")');
      await page.waitForTimeout(300);
    }
  }

  // Save specific beach family assets
  const bf = metrics['beach_family'];
  const saveB64 = (filePath, dataUrl) => {
    const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, buf);
  };

  saveB64(path.join(DIAG_DIR, 'beach_family_original.png'), bf.originalDataUrl);
  saveB64(path.join(DIAG_DIR, 'beach_family_artwork_only.png'), bf.artworkDataUrl);
  saveB64(path.join(DIAG_DIR, 'beach_family_white_backed.png'), bf.whiteBackedDataUrl);

  saveB64(path.join(ARTIFACT_DIR, 'beach_family_original.png'), bf.originalDataUrl);
  saveB64(path.join(ARTIFACT_DIR, 'beach_family_artwork_only.png'), bf.artworkDataUrl);
  saveB64(path.join(ARTIFACT_DIR, 'beach_family_white_backed.png'), bf.whiteBackedDataUrl);

  // Generate 8-bit grayscale raw mask for beach family
  // We can generate it by comparing artworkDataUrl alpha
  const rawMaskB64 = await page.evaluate((artDataUrl) => {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < imgData.data.length; i += 4) {
          const val = imgData.data[i + 3] > 0 ? 255 : 0;
          imgData.data[i] = val;
          imgData.data[i + 1] = val;
          imgData.data[i + 2] = val;
          imgData.data[i + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      im.src = artDataUrl;
    });
  }, bf.artworkDataUrl);

  saveB64(path.join(DIAG_DIR, 'beach_family_raw_mask.png'), rawMaskB64);
  saveB64(path.join(ARTIFACT_DIR, 'beach_family_raw_mask.png'), rawMaskB64);
  console.log('✓ Saved beach family assets (original, raw_mask, overlay, artwork, white_backed)');

  // Render Master 4x4 Sheet
  console.log('\nComposing 4x4 Master Visual Comparison Sheet...');
  const overlayMap = {
    father_and_daughter: `data:image/png;base64,${fs.readFileSync(path.join(DIAG_DIR, 'father_and_daughter_overlay.png')).toString('base64')}`,
    beach_family: `data:image/png;base64,${fs.readFileSync(path.join(DIAG_DIR, 'beach_family_overlay.png')).toString('base64')}`,
    indoor_family: `data:image/png;base64,${fs.readFileSync(path.join(DIAG_DIR, 'indoor_family_overlay.png')).toString('base64')}`,
    portrait_lighting: `data:image/png;base64,${fs.readFileSync(path.join(DIAG_DIR, 'portrait_lighting_overlay.png')).toString('base64')}`,
  };

  const masterSheetB64 = await page.evaluate(async ({ metrics, overlayMap }) => {
    const colNames = ['Original Photograph', 'MediaPipe Mask Overlay', 'Transparent Artwork', 'White-Backed Sticker (20px)'];
    const rowKeys = ['father_and_daughter', 'beach_family', 'indoor_family', 'portrait_lighting'];

    const colWidth = 380;
    const rowHeight = 280;
    const headerHeight = 60;
    const leftHeaderWidth = 200;
    const totalWidth = leftHeaderWidth + colWidth * 4;
    const totalHeight = headerHeight + rowHeight * 4;

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    // Dark background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Column Headers
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#38bdf8';

    for (let c = 0; c < 4; c++) {
      const cx = leftHeaderWidth + c * colWidth + colWidth / 2;
      ctx.fillText(colNames[c], cx, headerHeight / 2);
    }

    // Checkerboard pattern for transparent columns (col 2 and 3)
    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 16;
    checkCanvas.height = 16;
    const checkCtx = checkCanvas.getContext('2d');
    checkCtx.fillStyle = '#1e293b';
    checkCtx.fillRect(0, 0, 16, 16);
    checkCtx.fillStyle = '#334155';
    checkCtx.fillRect(0, 0, 8, 8);
    checkCtx.fillRect(8, 8, 8, 8);
    const pattern = ctx.createPattern(checkCanvas, 'repeat');

    for (let r = 0; r < rowKeys.length; r++) {
      const rowKey = rowKeys[r];
      const data = metrics[rowKey];
      const y = headerHeight + r * rowHeight;

      // Row Header
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(data.label, leftHeaderWidth / 2, y + rowHeight / 2 - 18);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${data.width} × ${data.height} px`, leftHeaderWidth / 2, y + rowHeight / 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${data.artworkPixels.toLocaleString()} art px`, leftHeaderWidth / 2, y + rowHeight / 2 + 16);
      ctx.fillStyle = '#a855f7';
      ctx.fillText(`${data.whiteBackedPixels.toLocaleString()} sticker px`, leftHeaderWidth / 2, y + rowHeight / 2 + 32);

      // Load 4 images
      const urls = [
        data.originalDataUrl,
        overlayMap[rowKey],
        data.artworkDataUrl,
        data.whiteBackedDataUrl,
      ];

      const imgs = await Promise.all(urls.map(url => new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.src = url;
      })));

      for (let c = 0; c < 4; c++) {
        const x = leftHeaderWidth + c * colWidth;
        const im = imgs[c];

        // Draw cell background
        if (c >= 2) {
          ctx.fillStyle = pattern;
        } else {
          ctx.fillStyle = '#1e293b';
        }
        ctx.fillRect(x + 4, y + 4, colWidth - 8, rowHeight - 8);

        // Aspect fit image
        const pad = 6;
        const maxW = colWidth - pad * 2;
        const maxH = rowHeight - pad * 2;
        const scale = Math.min(maxW / im.width, maxH / im.height);
        const drawW = im.width * scale;
        const drawH = im.height * scale;
        const drawX = x + (colWidth - drawW) / 2;
        const drawY = y + (rowHeight - drawH) / 2;

        ctx.drawImage(im, drawX, drawY, drawW, drawH);

        // Border around cell
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4, y + 4, colWidth - 8, rowHeight - 8);
      }
    }

    return canvas.toDataURL('image/png');
  }, { metrics, overlayMap });

  saveB64(path.join(ARTIFACT_DIR, 'final_photo_quality_comparison.png'), masterSheetB64);
  console.log(`✓ Master sheet saved to: ${path.join(ARTIFACT_DIR, 'final_photo_quality_comparison.png')}`);

  // Save metrics JSON
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'photo_quality_metrics.json'), JSON.stringify(metrics, null, 2));

  console.log('\n================================================================');
  console.log('EXACT PIXEL MEASUREMENTS (ARTWORK vs. WHITE BACKING)');
  console.log('================================================================');
  for (const m of Object.values(metrics)) {
    console.log(`${m.label}:`);
    console.log(`  Dimensions: ${m.width} × ${m.height} (${m.totalPixels.toLocaleString()} px)`);
    console.log(`  Artwork Pixels: ${m.artworkPixels.toLocaleString()} (${(m.artworkPixels / m.totalPixels * 100).toFixed(2)}%)`);
    console.log(`  White-Backed Sticker: ${m.whiteBackedPixels.toLocaleString()} (${(m.whiteBackedPixels / m.totalPixels * 100).toFixed(2)}%)`);
    console.log(`  White Border Added: +${m.whiteBorderAddedPixels.toLocaleString()} px`);
  }

  await browser.close();
}

run().catch(console.error);
