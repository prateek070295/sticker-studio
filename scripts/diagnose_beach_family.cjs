const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const DIAG_DIR = path.resolve('docs/diagnosis_beach_family');

if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });

async function diagnose() {
  console.log('================================================================');
  console.log('DIAGNOSING PHOTO CUTOUT & BEACH FAMILY EXTRACTION');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('  [Browser]', msg.text()));
  page.on('pageerror', err => console.error('  [PageError]', err.message));

  await page.goto(`http://127.0.0.1:${PORT}/scripts/photo_prototype/compare_models.html`);
  await page.waitForFunction(() => window.__evalReady === true);

  const photos = [
    { id: 'beach_family', file: 'eval_photo_1_beach_family.jpg' },
    { id: 'father_and_daughter', file: 'prototype_touching_subjects.jpg' },
    { id: 'indoor_family', file: 'eval_photo_2_indoor_family.jpg' },
    { id: 'portrait_lighting', file: 'eval_photo_3_portrait_lighting.jpg' },
  ];

  for (const photo of photos) {
    const photoPath = path.join(FIXTURES_DIR, photo.file);
    console.log(`\n--- Diagnosing: ${photo.id} (${photo.file}) ---`);

    const fileBuf = fs.readFileSync(photoPath);
    const dataUrl = `data:image/jpeg;base64,${fileBuf.toString('base64')}`;

    const diagResult = await page.evaluate(async ({ dataUrl, id }) => {
      // 1. Load image
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      const W = img.naturalWidth;
      const H = img.naturalHeight;

      // 2. Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const srcImageData = ctx.getImageData(0, 0, W, H);

      // 3. Run MediaPipe Segmenter
      const vision = await window.FilesetResolver.forVisionTasks('/mediapipe');
      const segmenter = await window.ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });

      const result = segmenter.segment(canvas);
      const confMask = result.confidenceMasks[0];
      const modelW = confMask.width;
      const modelH = confMask.height;
      const rawFloats = confMask.getAsFloat32Array();

      // Analyze raw float distribution
      let minConf = 1.0;
      let maxConf = 0.0;
      let sumConf = 0;
      const bins = new Array(10).fill(0); // 0.0-0.1, 0.1-0.2, etc.

      for (let i = 0; i < rawFloats.length; i++) {
        const v = rawFloats[i];
        if (v < minConf) minConf = v;
        if (v > maxConf) maxConf = v;
        sumConf += v;
        const b = Math.min(9, Math.floor(v * 10));
        bins[b]++;
      }

      // Check pixel counts at multiple thresholds: 0.1, 0.2, 0.3, 0.4, 0.5
      const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5];
      const countsAtThresh = {};

      // Compute native upsampled masks and count
      for (const th of thresholds) {
        let count = 0;
        for (let y = 0; y < H; y++) {
          const srcY = (y / H) * (modelH - 1);
          const y0 = Math.floor(srcY);
          const y1 = Math.min(modelH - 1, y0 + 1);
          const dy = srcY - y0;

          for (let x = 0; x < W; x++) {
            const srcX = (x / W) * (modelW - 1);
            const x0 = Math.floor(srcX);
            const x1 = Math.min(modelW - 1, x0 + 1);
            const dx = srcX - x0;

            const v00 = rawFloats[y0 * modelW + x0];
            const v10 = rawFloats[y0 * modelW + x1];
            const v01 = rawFloats[y1 * modelW + x0];
            const v11 = rawFloats[y1 * modelW + x1];

            const top = v00 * (1 - dx) + v10 * dx;
            const bot = v01 * (1 - dx) + v11 * dx;
            const conf = top * (1 - dy) + bot * dy;

            if (conf >= th) count++;
          }
        }
        countsAtThresh[th] = count;
      }

      // Generate mask overlay canvas at threshold 0.5
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = W;
      maskCanvas.height = H;
      const maskCtx = maskCanvas.getContext('2d');
      const maskImgData = maskCtx.createImageData(W, H);

      // Generate artwork-only canvas
      const artCanvas = document.createElement('canvas');
      artCanvas.width = W;
      artCanvas.height = H;
      const artCtx = artCanvas.getContext('2d');
      const artImgData = artCtx.createImageData(W, H);

      // Also render heatmap of model confidence
      const heatCanvas = document.createElement('canvas');
      heatCanvas.width = modelW;
      heatCanvas.height = modelH;
      const heatCtx = heatCanvas.getContext('2d');
      const heatImgData = heatCtx.createImageData(modelW, modelH);

      for (let i = 0; i < modelW * modelH; i++) {
        const v = rawFloats[i];
        const off = i * 4;
        // Colormap: blue (0) -> green (0.5) -> red (1.0)
        heatImgData.data[off] = Math.round(Math.min(255, Math.max(0, (v - 0.5) * 2 * 255)));
        heatImgData.data[off + 1] = Math.round(255 * (1 - Math.abs(v - 0.5) * 2));
        heatImgData.data[off + 2] = Math.round(Math.min(255, Math.max(0, (0.5 - v) * 2 * 255)));
        heatImgData.data[off + 3] = 255;
      }
      heatCtx.putImageData(heatImgData, 0, 0);

      // Upsampled mask at 0.5
      let minX = W, maxX = -1, minY = H, maxY = -1;
      for (let y = 0; y < H; y++) {
        const srcY = (y / H) * (modelH - 1);
        const y0 = Math.floor(srcY);
        const y1 = Math.min(modelH - 1, y0 + 1);
        const dy = srcY - y0;

        for (let x = 0; x < W; x++) {
          const srcX = (x / W) * (modelW - 1);
          const x0 = Math.floor(srcX);
          const x1 = Math.min(modelW - 1, x0 + 1);
          const dx = srcX - x0;

          const v00 = rawFloats[y0 * modelW + x0];
          const v10 = rawFloats[y0 * modelW + x1];
          const v01 = rawFloats[y1 * modelW + x0];
          const v11 = rawFloats[y1 * modelW + x1];

          const top = v00 * (1 - dx) + v10 * dx;
          const bot = v01 * (1 - dx) + v11 * dx;
          const conf = top * (1 - dy) + bot * dy;

          const idx = (y * W + x) * 4;
          if (conf >= 0.5) {
            maskImgData.data[idx] = 255;
            maskImgData.data[idx + 1] = 0;
            maskImgData.data[idx + 2] = 0;
            maskImgData.data[idx + 3] = 160;

            artImgData.data[idx] = srcImageData.data[idx];
            artImgData.data[idx + 1] = srcImageData.data[idx + 1];
            artImgData.data[idx + 2] = srcImageData.data[idx + 2];
            artImgData.data[idx + 3] = 255;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          } else {
            maskImgData.data[idx + 3] = 0;
            artImgData.data[idx + 3] = 0;
          }
        }
      }

      maskCtx.putImageData(maskImgData, 0, 0);
      artCtx.putImageData(artImgData, 0, 0);

      // Composite mask overlay on top of original
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = W;
      overlayCanvas.height = H;
      const overlayCtx = overlayCanvas.getContext('2d');
      overlayCtx.drawImage(canvas, 0, 0);
      overlayCtx.drawImage(maskCanvas, 0, 0);

      return {
        width: W,
        height: H,
        modelWidth: modelW,
        modelHeight: modelH,
        minConf,
        maxConf,
        avgConf: sumConf / rawFloats.length,
        bins,
        countsAtThresh,
        bounds: { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
        overlayDataUrl: overlayCanvas.toDataURL('image/png'),
        artworkDataUrl: artCanvas.toDataURL('image/png'),
        heatmapDataUrl: heatCanvas.toDataURL('image/png'),
      };
    }, { dataUrl, id: photo.id });

    console.log(`  Dimensions: ${diagResult.width} × ${diagResult.height} | Model Grid: ${diagResult.modelWidth} × ${diagResult.modelHeight}`);
    console.log(`  Confidence Range: min=${diagResult.minConf.toFixed(4)}, max=${diagResult.maxConf.toFixed(4)}, avg=${diagResult.avgConf.toFixed(4)}`);
    console.log(`  Histogram bins (0.0..1.0): ${diagResult.bins.join(', ')}`);
    console.log('  Pixel counts by threshold:');
    for (const [th, cnt] of Object.entries(diagResult.countsAtThresh)) {
      console.log(`    >= ${th}: ${cnt.toLocaleString()} px (${(cnt / (diagResult.width * diagResult.height) * 100).toFixed(2)}%)`);
    }
    console.log(`  Detected bounding box: [x: ${diagResult.bounds.minX}..${diagResult.bounds.maxX}, y: ${diagResult.bounds.minY}..${diagResult.bounds.maxY}] (${diagResult.bounds.width} × ${diagResult.bounds.height})`);

    // Save diagnostic images
    const overlayBuf = Buffer.from(diagResult.overlayDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(DIAG_DIR, `${photo.id}_overlay.png`), overlayBuf);

    const artBuf = Buffer.from(diagResult.artworkDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(DIAG_DIR, `${photo.id}_artwork.png`), artBuf);

    const heatBuf = Buffer.from(diagResult.heatmapDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(DIAG_DIR, `${photo.id}_heatmap.png`), heatBuf);

    console.log(`  ✓ Saved ${photo.id}_overlay.png, ${photo.id}_artwork.png, ${photo.id}_heatmap.png`);
  }

  await browser.close();
}

diagnose().catch(console.error);
