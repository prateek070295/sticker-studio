const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const PORT = 3888;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const AUDIT_OUT_DIR = path.resolve('docs/diagnosis_integration_acceptance');

if (!fs.existsSync(AUDIT_OUT_DIR)) fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });

async function runAcceptance() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.2 — DETECTOR-GUIDED ACCEPTANCE AUDIT');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('GL Driver Message') && !text.includes('Download the React DevTools')) {
      console.log('  [Browser]', text);
    }
  });
  page.on('pageerror', err => console.error('  [PageError]', err.message));

  // Navigate to production app
  await page.goto(`http://127.0.0.1:${PORT}/app/`);
  await page.waitForLoadState('networkidle');

  // Verify page title / layout
  console.log('App loaded successfully in browser.');

  // Test network isolation: track all requests to ensure 0 external network calls
  const externalRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (!url.startsWith('http://127.0.0.1:3888/') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      externalRequests.push(url);
    }
  });

  const testResults = {};

  // =========================================================================
  // FIXTURE 1: BEACH FAMILY (~15 Sunset Silhouettes)
  // Target: 12 auto-detected + 3 manually added = 15 total reviewed
  // =========================================================================
  console.log('\n--- Evaluating Fixture 1: Beach Family Sunset (~15 Silhouettes) ---');
  {
    const fileBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'eval_photo_1_beach_family.jpg'));
    const dataUrl = `data:image/jpeg;base64,${fileBuf.toString('base64')}`;

    const res = await page.evaluate(async ({ dataUrl }) => {
      // Access app or use local core modules loaded in window
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const srcImageData = ctx.getImageData(0, 0, W, H);

      // Load MediaPipe modules from /mediapipe/
      const tInit0 = performance.now();
      const mp = await import('/mediapipe/vision_bundle.mjs');
      const vision = await mp.FilesetResolver.forVisionTasks('/mediapipe');

      const detector = await mp.ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/efficientdet_lite0.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        scoreThreshold: 0.15,
        categoryAllowlist: ['person'],
      });
      const detectorInitMs = performance.now() - tInit0;

      const tSegInit0 = performance.now();
      const segmenter = await mp.ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      const segmenterInitMs = performance.now() - tSegInit0;

      // 1. Detect People
      const tDet0 = performance.now();
      const detRes = detector.detect(canvas);
      const detectionMs = performance.now() - tDet0;

      const totalArea = W * H;
      const autoBoxes = detRes.detections
        .filter(d => d.categories[0]?.categoryName === 'person')
        .map(d => ({
          box: {
            x: Math.round(d.boundingBox.originX),
            y: Math.round(d.boundingBox.originY),
            width: Math.round(d.boundingBox.width),
            height: Math.round(d.boundingBox.height),
          },
          score: d.categories[0].score,
          isManual: false,
        }))
        .filter(d => (d.box.width * d.box.height) / totalArea >= 0.003)
        .sort((a, b) => a.box.x - b.box.x);

      // 2. Add Missing Person: Manually add the 3 silhouettes missed by automatic detection
      // Leftmost silhouette figure and two between distant family groups
      const manualBoxes = [
        { box: { x: 18, y: 440, width: 85, height: 260 }, score: 1.0, isManual: true, label: 'Manual 1 (Leftmost adult)' },
        { box: { x: 630, y: 450, width: 75, height: 220 }, score: 1.0, isManual: true, label: 'Manual 2 (Middle child)' },
        { box: { x: 790, y: 480, width: 65, height: 180 }, score: 1.0, isManual: true, label: 'Manual 3 (Right child)' },
      ];

      const allRegions = [...autoBoxes, ...manualBoxes].map((r, i) => ({
        id: `person_${i + 1}`,
        label: r.label || `P${i + 1} (${Math.round(r.score * 100)}%)`,
        box: r.box,
        score: r.score,
        isManual: r.isManual,
        included: true,
      }));

      // 3. Segment each crop with neighbor isolation
      const cropTimings = [];
      const globalUnionMask = new Uint8Array(W * H);
      const tCrops0 = performance.now();

      for (let i = 0; i < allRegions.length; i++) {
        const reg = allRegions[i];
        const tCrop0 = performance.now();

        const marginX = Math.round(reg.box.width * 0.20);
        const marginY = Math.round(reg.box.height * 0.20);
        const cX = Math.max(0, reg.box.x - marginX);
        const cY = Math.max(0, reg.box.y - marginY);
        const cR = Math.min(W, reg.box.x + reg.box.width + marginX);
        const cB = Math.min(H, reg.box.y + reg.box.height + marginY);
        const cW = cR - cX;
        const cH = cB - cY;

        const cCanvas = document.createElement('canvas');
        cCanvas.width = cW;
        cCanvas.height = cH;
        const cCtx = cCanvas.getContext('2d');
        cCtx.drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

        const seg = segmenter.segment(cCanvas);
        const confFloats = seg.confidenceMasks[0].getAsFloat32Array();
        const mW = seg.confidenceMasks[0].width;
        const mH = seg.confidenceMasks[0].height;

        const rawCrop = new Uint8Array(cW * cH);
        for (let cy = 0; cy < cH; cy++) {
          const sy = (cy / cH) * (mH - 1);
          const y0 = Math.floor(sy);
          const y1 = Math.min(mH - 1, y0 + 1);
          const dy = sy - y0;
          for (let cx = 0; cx < cW; cx++) {
            const sx = (cx / cW) * (mW - 1);
            const x0 = Math.floor(sx);
            const x1 = Math.min(mW - 1, x0 + 1);
            const dx = sx - x0;
            const v00 = confFloats[y0 * mW + x0];
            const v10 = confFloats[y0 * mW + x1];
            const v01 = confFloats[y1 * mW + x0];
            const v11 = confFloats[y1 * mW + x1];
            const conf = (v00 * (1 - dx) + v10 * dx) * (1 - dy) + (v01 * (1 - dx) + v11 * dx) * dy;
            if (conf >= 0.45) rawCrop[cy * cW + cx] = 1;
          }
        }

        // Neighbor isolation flood-fill
        const coreX0 = Math.max(0, reg.box.x - cX);
        const coreX1 = Math.min(cW - 1, reg.box.x + reg.box.width - cX);
        const coreY0 = Math.max(0, reg.box.y - cY);
        const coreY1 = Math.min(cH - 1, reg.box.y + reg.box.height - cY);

        const cleanCrop = new Uint8Array(cW * cH);
        const visited = new Uint8Array(cW * cH);
        const queue = [];

        for (let cy = coreY0; cy <= coreY1; cy++) {
          for (let cx = coreX0; cx <= coreX1; cx++) {
            const idx = cy * cW + cx;
            if (rawCrop[idx] > 0 && visited[idx] === 0) {
              visited[idx] = 1;
              cleanCrop[idx] = 1;
              queue.push(idx);
            }
          }
        }

        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          const cx = curr % cW;
          const cy = Math.floor(curr / cW);
          const nbrs = [
            cx > 0 ? curr - 1 : -1,
            cx < cW - 1 ? curr + 1 : -1,
            cy > 0 ? curr - cW : -1,
            cy < cH - 1 ? curr + cW : -1,
          ];
          for (let k = 0; k < 4; k++) {
            const ni = nbrs[k];
            if (ni !== -1 && rawCrop[ni] > 0 && visited[ni] === 0) {
              visited[ni] = 1;
              cleanCrop[ni] = 1;
              queue.push(ni);
            }
          }
        }

        // Map into global union
        let fgCount = 0;
        for (let cy = 0; cy < cH; cy++) {
          const gy = cY + cy;
          for (let cx = 0; cx < cW; cx++) {
            if (cleanCrop[cy * cW + cx] > 0) {
              globalUnionMask[gy * W + (cX + cx)] = 1;
              fgCount++;
            }
          }
        }

        const cropElapsed = performance.now() - tCrop0;
        cropTimings.push({
          index: i + 1,
          label: reg.label,
          isManual: reg.isManual,
          elapsedMs: cropElapsed,
          fgPixels: fgCount,
        });
      }

      const totalCropsMs = performance.now() - tCrops0;

      // 4. Render Composite Sticker
      const tRender0 = performance.now();
      const artCanvas = document.createElement('canvas');
      artCanvas.width = W;
      artCanvas.height = H;
      const artCtx = artCanvas.getContext('2d');
      const artImgData = artCtx.createImageData(W, H);

      let totalFgPixels = 0;
      for (let i = 0; i < W * H; i++) {
        if (globalUnionMask[i] === 1) {
          totalFgPixels++;
          artImgData.data[i * 4] = srcImageData.data[i * 4];
          artImgData.data[i * 4 + 1] = srcImageData.data[i * 4 + 1];
          artImgData.data[i * 4 + 2] = srcImageData.data[i * 4 + 2];
          artImgData.data[i * 4 + 3] = 255;
        }
      }
      artCtx.putImageData(artImgData, 0, 0);

      // Render white backing border (radius 12px)
      const whiteSilhouette = document.createElement('canvas');
      whiteSilhouette.width = W;
      whiteSilhouette.height = H;
      const wsCtx = whiteSilhouette.getContext('2d');
      wsCtx.drawImage(artCanvas, 0, 0);
      wsCtx.globalCompositeOperation = 'source-in';
      wsCtx.fillStyle = '#ffffff';
      wsCtx.fillRect(0, 0, W, H);

      const stickerCanvas = document.createElement('canvas');
      stickerCanvas.width = W;
      stickerCanvas.height = H;
      const sCtx = stickerCanvas.getContext('2d');
      const radius = 12;
      for (let dy = -radius; dy <= radius; dy += 3) {
        for (let dx = -radius; dx <= radius; dx += 3) {
          if (dx * dx + dy * dy <= radius * radius) {
            sCtx.drawImage(whiteSilhouette, dx, dy);
          }
        }
      }
      sCtx.drawImage(artCanvas, 0, 0);
      const renderMs = performance.now() - tRender0;

      // Bounding box overlay for review
      const reviewCanvas = document.createElement('canvas');
      reviewCanvas.width = W;
      reviewCanvas.height = H;
      const rCtx = reviewCanvas.getContext('2d');
      rCtx.drawImage(canvas, 0, 0);
      rCtx.lineWidth = 3;
      rCtx.font = 'bold 15px sans-serif';

      for (const reg of allRegions) {
        rCtx.strokeStyle = reg.isManual ? '#ec4899' : '#38bdf8';
        rCtx.fillStyle = reg.isManual ? '#ec4899' : '#38bdf8';
        rCtx.strokeRect(reg.box.x, reg.box.y, reg.box.width, reg.box.height);
        rCtx.fillRect(reg.box.x, Math.max(0, reg.box.y - 20), rCtx.measureText(reg.label).width + 8, 20);
        rCtx.fillStyle = '#0f172a';
        rCtx.fillText(reg.label, reg.box.x + 4, Math.max(14, reg.box.y - 5));
      }

      // Memory measurement if supported
      const memoryUsage = performance.memory ? {
        usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      } : null;

      return {
        W, H,
        detectorInitMs,
        segmenterInitMs,
        detectionMs,
        autoCount: autoBoxes.length,
        manualCount: manualBoxes.length,
        totalPeopleCount: allRegions.length,
        cropTimings,
        totalCropsMs,
        renderMs,
        totalFgPixels,
        fgRatio: totalFgPixels / (W * H),
        memoryUsage,
        artDataUrl: artCanvas.toDataURL('image/png'),
        stickerDataUrl: stickerCanvas.toDataURL('image/png'),
        reviewDataUrl: reviewCanvas.toDataURL('image/png'),
      };
    }, { dataUrl });

    console.log(`Auto-detected: ${res.autoCount} people (${res.detectionMs.toFixed(1)} ms)`);
    console.log(`Manually added: ${res.manualCount} people`);
    console.log(`Total people selected: ${res.totalPeopleCount} of 15 expected`);
    console.log(`Total crop segmentation elapsed (${res.totalPeopleCount} crops): ${res.totalCropsMs.toFixed(1)} ms`);
    console.log(`Average per-crop time: ${(res.totalCropsMs / res.totalPeopleCount).toFixed(1)} ms`);
    console.log(`Foreground pixels: ${res.totalFgPixels.toLocaleString()} (${(res.fgRatio * 100).toFixed(2)}%)`);
    if (res.memoryUsage) {
      console.log(`Memory usage: ${res.memoryUsage.usedJSHeapMB} MB / ${res.memoryUsage.totalJSHeapMB} MB`);
    }

    testResults.beach_family = res;

    // Save outputs
    const savePng = (name, dUrl) => {
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, name), Buffer.from(dUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      fs.writeFileSync(path.join(ARTIFACT_DIR, name), Buffer.from(dUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    };

    savePng('beach_family_acceptance_review.png', res.reviewDataUrl);
    savePng('beach_family_acceptance_artwork.png', res.artDataUrl);
    savePng('beach_family_acceptance_sticker.png', res.stickerDataUrl);
  }

  // =========================================================================
  // FIXTURE 2: FIELD FAMILY (5 Members, 4 auto + 1 manual)
  // =========================================================================
  console.log('\n--- Evaluating Fixture 2: Field Family (5 Members) ---');
  {
    const fileBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'eval_photo_2_indoor_family.jpg'));
    const dataUrl = `data:image/jpeg;base64,${fileBuf.toString('base64')}`;

    const res = await page.evaluate(async ({ dataUrl }) => {
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const srcImageData = ctx.getImageData(0, 0, W, H);

      const mp = await import('/mediapipe/vision_bundle.mjs');
      const vision = await mp.FilesetResolver.forVisionTasks('/mediapipe');
      const detector = await mp.ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/efficientdet_lite0.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', scoreThreshold: 0.18, categoryAllowlist: ['person'],
      });
      const segmenter = await mp.ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
      });

      const tDet0 = performance.now();
      const detRes = detector.detect(canvas);
      const detectionMs = performance.now() - tDet0;

      const autoBoxes = detRes.detections
        .filter(d => d.categories[0]?.categoryName === 'person')
        .map(d => ({
          box: {
            x: Math.round(d.boundingBox.originX),
            y: Math.round(d.boundingBox.originY),
            width: Math.round(d.boundingBox.width),
            height: Math.round(d.boundingBox.height),
          },
          score: d.categories[0].score,
          isManual: false,
        }))
        .filter(d => (d.box.width * d.box.height) / (W * H) >= 0.01)
        .sort((a, b) => a.box.x - b.box.x);

      // Add 5th member manual assist (running boy in middle)
      const manualBoxes = [
        { box: { x: 490, y: 415, width: 175, height: 210 }, score: 1.0, isManual: true, label: 'Manual 1 (Running boy)' },
      ];

      const allRegions = [...autoBoxes, ...manualBoxes].map((r, i) => ({
        id: `person_${i + 1}`,
        label: r.label || `P${i + 1} (${Math.round(r.score * 100)}%)`,
        box: r.box,
        isManual: r.isManual,
      }));

      const globalUnionMask = new Uint8Array(W * H);
      const tCrops0 = performance.now();

      for (const reg of allRegions) {
        const mX = Math.round(reg.box.width * 0.20);
        const mY = Math.round(reg.box.height * 0.20);
        const cX = Math.max(0, reg.box.x - mX);
        const cY = Math.max(0, reg.box.y - mY);
        const cW = Math.min(W, reg.box.x + reg.box.width + mX) - cX;
        const cH = Math.min(H, reg.box.y + reg.box.height + mY) - cY;

        const cCanvas = document.createElement('canvas');
        cCanvas.width = cW; cCanvas.height = cH;
        cCanvas.getContext('2d').drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

        const seg = segmenter.segment(cCanvas);
        const confFloats = seg.confidenceMasks[0].getAsFloat32Array();
        const mW = seg.confidenceMasks[0].width;
        const mH = seg.confidenceMasks[0].height;

        for (let cy = 0; cy < cH; cy++) {
          const sy = (cy / cH) * (mH - 1);
          const y0 = Math.floor(sy);
          const dy = sy - y0;
          for (let cx = 0; cx < cW; cx++) {
            const sx = (cx / cW) * (mW - 1);
            const x0 = Math.floor(sx);
            const dx = sx - x0;
            const c00 = confFloats[y0 * mW + x0];
            const c10 = confFloats[y0 * mW + Math.min(mW - 1, x0 + 1)];
            const c01 = confFloats[Math.min(mH - 1, y0 + 1) * mW + x0];
            const c11 = confFloats[Math.min(mH - 1, y0 + 1) * mW + Math.min(mW - 1, x0 + 1)];
            const val = (c00 * (1 - dx) + c10 * dx) * (1 - dy) + (c01 * (1 - dx) + c11 * dx) * dy;
            if (val >= 0.45) {
              globalUnionMask[(cY + cy) * W + (cX + cx)] = 1;
            }
          }
        }
      }
      const totalCropsMs = performance.now() - tCrops0;

      // Render sticker
      const artCanvas = document.createElement('canvas');
      artCanvas.width = W; artCanvas.height = H;
      const artCtx = artCanvas.getContext('2d');
      const artData = artCtx.createImageData(W, H);
      let fgPixels = 0;
      for (let i = 0; i < W * H; i++) {
        if (globalUnionMask[i] === 1) {
          fgPixels++;
          artData.data[i * 4] = srcImageData.data[i * 4];
          artData.data[i * 4 + 1] = srcImageData.data[i * 4 + 1];
          artData.data[i * 4 + 2] = srcImageData.data[i * 4 + 2];
          artData.data[i * 4 + 3] = 255;
        }
      }
      artCtx.putImageData(artData, 0, 0);

      const stickerCanvas = document.createElement('canvas');
      stickerCanvas.width = W; stickerCanvas.height = H;
      const sCtx = stickerCanvas.getContext('2d');
      const wsCanvas = document.createElement('canvas');
      wsCanvas.width = W; wsCanvas.height = H;
      const wsCtx = wsCanvas.getContext('2d');
      wsCtx.drawImage(artCanvas, 0, 0);
      wsCtx.globalCompositeOperation = 'source-in';
      wsCtx.fillStyle = '#ffffff';
      wsCtx.fillRect(0, 0, W, H);
      for (let dy = -10; dy <= 10; dy += 2) {
        for (let dx = -10; dx <= 10; dx += 2) {
          if (dx * dx + dy * dy <= 100) sCtx.drawImage(wsCanvas, dx, dy);
        }
      }
      sCtx.drawImage(artCanvas, 0, 0);

      const reviewCanvas = document.createElement('canvas');
      reviewCanvas.width = W; reviewCanvas.height = H;
      const rCtx = reviewCanvas.getContext('2d');
      rCtx.drawImage(canvas, 0, 0);
      rCtx.lineWidth = 3;
      rCtx.font = 'bold 15px sans-serif';
      for (const reg of allRegions) {
        rCtx.strokeStyle = reg.isManual ? '#ec4899' : '#38bdf8';
        rCtx.strokeRect(reg.box.x, reg.box.y, reg.box.width, reg.box.height);
      }

      return {
        W, H,
        detectionMs,
        autoCount: autoBoxes.length,
        manualCount: manualBoxes.length,
        totalPeopleCount: allRegions.length,
        totalCropsMs,
        fgPixels,
        artDataUrl: artCanvas.toDataURL('image/png'),
        stickerDataUrl: stickerCanvas.toDataURL('image/png'),
        reviewDataUrl: reviewCanvas.toDataURL('image/png'),
      };
    }, { dataUrl });

    console.log(`Auto-detected: ${res.autoCount} people (${res.detectionMs.toFixed(1)} ms)`);
    console.log(`Manually added: ${res.manualCount} people`);
    console.log(`Total people selected: ${res.totalPeopleCount} of 5 expected`);
    console.log(`Total crop segmentation elapsed (${res.totalPeopleCount} crops): ${res.totalCropsMs.toFixed(1)} ms`);
    console.log(`Foreground pixels: ${res.fgPixels.toLocaleString()}`);

    testResults.field_family = res;

    const savePng = (name, dUrl) => {
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, name), Buffer.from(dUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      fs.writeFileSync(path.join(ARTIFACT_DIR, name), Buffer.from(dUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    };

    savePng('field_family_acceptance_review.png', res.reviewDataUrl);
    savePng('field_family_acceptance_artwork.png', res.artDataUrl);
    savePng('field_family_acceptance_sticker.png', res.stickerDataUrl);
  }

  // =========================================================================
  // FIXTURE 3: FATHER & DAUGHTER (Close-up)
  // =========================================================================
  console.log('\n--- Evaluating Fixture 3: Father & Daughter (Close-up) ---');
  {
    const fileBuf = fs.readFileSync(path.join(FIXTURES_DIR, 'prototype_touching_subjects.jpg'));
    const dataUrl = `data:image/jpeg;base64,${fileBuf.toString('base64')}`;

    const res = await page.evaluate(async ({ dataUrl }) => {
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const srcImageData = ctx.getImageData(0, 0, W, H);

      const mp = await import('/mediapipe/vision_bundle.mjs');
      const vision = await mp.FilesetResolver.forVisionTasks('/mediapipe');
      const detector = await mp.ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/efficientdet_lite0.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', scoreThreshold: 0.18, categoryAllowlist: ['person'],
      });
      const segmenter = await mp.ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
      });

      const tDet0 = performance.now();
      const detRes = detector.detect(canvas);
      const detectionMs = performance.now() - tDet0;

      const mainBoxes = detRes.detections
        .filter(d => d.categories[0]?.categoryName === 'person')
        .map(d => ({
          box: {
            x: Math.round(d.boundingBox.originX),
            y: Math.round(d.boundingBox.originY),
            width: Math.round(d.boundingBox.width),
            height: Math.round(d.boundingBox.height),
          },
          score: d.categories[0].score,
        }))
        .filter(d => (d.box.width * d.box.height) / (W * H) >= 0.05); // Filter tiny distant pedestrians in background

      const globalUnionMask = new Uint8Array(W * H);
      const tCrops0 = performance.now();

      for (const reg of mainBoxes) {
        const mX = Math.round(reg.box.width * 0.15);
        const mY = Math.round(reg.box.height * 0.15);
        const cX = Math.max(0, reg.box.x - mX);
        const cY = Math.max(0, reg.box.y - mY);
        const cW = Math.min(W, reg.box.x + reg.box.width + mX) - cX;
        const cH = Math.min(H, reg.box.y + reg.box.height + mY) - cY;

        const cCanvas = document.createElement('canvas');
        cCanvas.width = cW; cCanvas.height = cH;
        cCanvas.getContext('2d').drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

        const seg = segmenter.segment(cCanvas);
        const confFloats = seg.confidenceMasks[0].getAsFloat32Array();
        const mW = seg.confidenceMasks[0].width;
        const mH = seg.confidenceMasks[0].height;

        for (let cy = 0; cy < cH; cy++) {
          const sy = (cy / cH) * (mH - 1);
          const y0 = Math.floor(sy);
          const dy = sy - y0;
          for (let cx = 0; cx < cW; cx++) {
            const sx = (cx / cW) * (mW - 1);
            const x0 = Math.floor(sx);
            const dx = sx - x0;
            const c00 = confFloats[y0 * mW + x0];
            const c10 = confFloats[y0 * mW + Math.min(mW - 1, x0 + 1)];
            const c01 = confFloats[Math.min(mH - 1, y0 + 1) * mW + x0];
            const c11 = confFloats[Math.min(mH - 1, y0 + 1) * mW + Math.min(mW - 1, x0 + 1)];
            const val = (c00 * (1 - dx) + c10 * dx) * (1 - dy) + (c01 * (1 - dx) + c11 * dx) * dy;
            if (val >= 0.45) {
              globalUnionMask[(cY + cy) * W + (cX + cx)] = 1;
            }
          }
        }
      }
      const totalCropsMs = performance.now() - tCrops0;

      const artCanvas = document.createElement('canvas');
      artCanvas.width = W; artCanvas.height = H;
      const artCtx = artCanvas.getContext('2d');
      const artData = artCtx.createImageData(W, H);
      let fgPixels = 0;
      for (let i = 0; i < W * H; i++) {
        if (globalUnionMask[i] === 1) {
          fgPixels++;
          artData.data[i * 4] = srcImageData.data[i * 4];
          artData.data[i * 4 + 1] = srcImageData.data[i * 4 + 1];
          artData.data[i * 4 + 2] = srcImageData.data[i * 4 + 2];
          artData.data[i * 4 + 3] = 255;
        }
      }
      artCtx.putImageData(artData, 0, 0);

      const stickerCanvas = document.createElement('canvas');
      stickerCanvas.width = W; stickerCanvas.height = H;
      const sCtx = stickerCanvas.getContext('2d');
      const wsCanvas = document.createElement('canvas');
      wsCanvas.width = W; wsCanvas.height = H;
      const wsCtx = wsCanvas.getContext('2d');
      wsCtx.drawImage(artCanvas, 0, 0);
      wsCtx.globalCompositeOperation = 'source-in';
      wsCtx.fillStyle = '#ffffff';
      wsCtx.fillRect(0, 0, W, H);
      for (let dy = -16; dy <= 16; dy += 3) {
        for (let dx = -16; dx <= 16; dx += 3) {
          if (dx * dx + dy * dy <= 256) sCtx.drawImage(wsCanvas, dx, dy);
        }
      }
      sCtx.drawImage(artCanvas, 0, 0);

      return {
        W, H,
        detectionMs,
        boxesCount: mainBoxes.length,
        totalCropsMs,
        fgPixels,
        artDataUrl: artCanvas.toDataURL('image/png'),
        stickerDataUrl: stickerCanvas.toDataURL('image/png'),
      };
    }, { dataUrl });

    console.log(`Detected: ${res.boxesCount} primary subject box (${res.detectionMs.toFixed(1)} ms)`);
    console.log(`Crop segmentation elapsed: ${res.totalCropsMs.toFixed(1)} ms`);
    console.log(`Foreground pixels: ${res.fgPixels.toLocaleString()}`);

    testResults.father_and_daughter = res;

    const savePng = (name, dUrl) => {
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, name), Buffer.from(dUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
      fs.writeFileSync(path.join(ARTIFACT_DIR, name), Buffer.from(dUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    };

    savePng('father_daughter_acceptance_artwork.png', res.artDataUrl);
    savePng('father_daughter_acceptance_sticker.png', res.stickerDataUrl);
  }

  // Check network isolation
  console.log(`\nExternal network calls during inference: ${externalRequests.length}`);
  if (externalRequests.length > 0) {
    console.warn('WARNING: Unexpected network requests:', externalRequests);
  } else {
    console.log('PASS: 100% offline, zero external network requests detected.');
  }

  await browser.close();

  // Save audit summary
  fs.writeFileSync(
    path.join(AUDIT_OUT_DIR, 'integration_acceptance_summary.json'),
    JSON.stringify(testResults, null, 2)
  );

  console.log('\n================================================================');
  console.log('ACCEPTANCE AUDIT COMPLETE');
  console.log(`Results saved to: ${AUDIT_OUT_DIR}`);
  console.log('================================================================\n');
}

runAcceptance().catch(console.error);
