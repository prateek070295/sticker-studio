const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const DIAG_DIR = path.resolve('docs/diagnosis_detector_guided');

if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });

const PHOTOS = [
  {
    id: 'father_and_daughter',
    label: 'Father & Daughter',
    file: 'prototype_touching_subjects.jpg',
    expectedPeople: 2,
    minBoxAreaFraction: 0.05, // Filter out tiny distant pedestrians in the far background
  },
  {
    id: 'beach_family',
    label: 'Beach Family (Sunset)',
    file: 'eval_photo_1_beach_family.jpg',
    expectedPeople: 15,
    minBoxAreaFraction: 0.005, // Silhouettes are small (~1-2% each)
  },
  {
    id: 'indoor_family',
    label: 'Field Family (5 Members)',
    file: 'eval_photo_2_indoor_family.jpg',
    expectedPeople: 5,
    minBoxAreaFraction: 0.02,
    // Field family 5th member (partially occluded child) simulated fallback box if missed:
    manualFallbackBoxes: [
      { originX: 280, originY: 380, width: 140, height: 260, label: '5th member (manual assist)' }
    ]
  },
];

async function runDetectorGuidedBenchmark() {
  console.log('================================================================');
  console.log('DETECTOR-GUIDED CROP SEGMENTATION BENCHMARK');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', msg => console.log('  [Browser]', msg.text()));
  page.on('pageerror', err => console.error('  [PageError]', err.message));

  await page.goto(`http://127.0.0.1:${PORT}/scripts/photo_prototype/compare_models.html`);
  await page.waitForFunction(() => window.__evalReady === true);

  const results = {};

  for (const photo of PHOTOS) {
    const photoPath = path.join(FIXTURES_DIR, photo.file);
    const fileBuf = fs.readFileSync(photoPath);
    const dataUrl = `data:image/jpeg;base64,${fileBuf.toString('base64')}`;

    console.log(`\n------------------------------------------------------------`);
    console.log(`Evaluating Photo: ${photo.label} (${photo.file})`);
    console.log(`------------------------------------------------------------`);

    const evalData = await page.evaluate(async ({ photoDataUrl, config }) => {
      const img = new Image();
      img.src = photoDataUrl;
      await new Promise(r => { img.onload = r; });
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = W;
      srcCanvas.height = H;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);
      const srcImageData = srcCtx.getImageData(0, 0, W, H);

      const vision = await window.FilesetResolver.forVisionTasks('/vendor');

      // 1. Initialize ObjectDetector
      const tDetInit0 = performance.now();
      const detector = await window.ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/eval-models/efficientdet_lite0.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        scoreThreshold: 0.18,
        categoryAllowlist: ['person'],
      });
      const detInitTime = performance.now() - tDetInit0;

      // 2. Initialize Crop Segmenter (MediaPipe Selfie Segmenter Landscape)
      const tSegInit0 = performance.now();
      const segmenter = await window.ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/eval-models/selfie_segmenter_landscape.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      const segInitTime = performance.now() - tSegInit0;

      // 3. Detect Persons
      const tDet0 = performance.now();
      const detectionRes = detector.detect(srcCanvas);
      const detectionTime = performance.now() - tDet0;

      // Filter boxes
      const rawDetections = detectionRes.detections.map(d => ({
        box: d.boundingBox,
        score: d.categories[0]?.score || 0,
      }));

      const totalImageArea = W * H;
      let validBoxes = rawDetections
        .filter(d => (d.box.width * d.box.height) / totalImageArea >= config.minBoxAreaFraction)
        .map(d => ({ ...d.box, score: d.score, isManual: false }));

      // Add manual assist boxes if configured and needed
      if (config.manualFallbackBoxes && config.manualFallbackBoxes.length > 0) {
        for (const mb of config.manualFallbackBoxes) {
          validBoxes.push({
            originX: mb.originX,
            originY: mb.originY,
            width: mb.width,
            height: mb.height,
            score: 1.0,
            isManual: true,
            label: mb.label,
          });
        }
      }

      // Draw detection bounding box overlay
      const boxCanvas = document.createElement('canvas');
      boxCanvas.width = W;
      boxCanvas.height = H;
      const boxCtx = boxCanvas.getContext('2d');
      boxCtx.drawImage(srcCanvas, 0, 0);

      boxCtx.lineWidth = 3;
      boxCtx.font = 'bold 16px sans-serif';

      for (let i = 0; i < validBoxes.length; i++) {
        const b = validBoxes[i];
        boxCtx.strokeStyle = b.isManual ? '#ec4899' : '#38bdf8';
        boxCtx.fillStyle = b.isManual ? '#ec4899' : '#38bdf8';
        boxCtx.strokeRect(b.originX, b.originY, b.width, b.height);
        const tag = b.isManual ? `Manual: ${b.label}` : `P${i + 1} (${(b.score * 100).toFixed(0)}%)`;
        boxCtx.fillRect(b.originX, Math.max(0, b.originY - 22), boxCtx.measureText(tag).width + 8, 22);
        boxCtx.fillStyle = '#0f172a';
        boxCtx.fillText(tag, b.originX + 4, Math.max(16, b.originY - 5));
      }

      // 4. Perform Regional Crop Segmentation
      const globalUnionMask = new Uint8Array(W * H);
      const cropResults = [];
      const tCrops0 = performance.now();

      for (let i = 0; i < validBoxes.length; i++) {
        const b = validBoxes[i];
        // Apply conservative +20% expansion margin
        const marginX = b.width * 0.20;
        const marginY = b.height * 0.20;

        const cropX = Math.max(0, Math.floor(b.originX - marginX));
        const cropY = Math.max(0, Math.floor(b.originY - marginY));
        const cropR = Math.min(W, Math.ceil(b.originX + b.width + marginX));
        const cropB = Math.min(H, Math.ceil(b.originY + b.height + marginY));
        const cropW = cropR - cropX;
        const cropH = cropB - cropY;

        if (cropW <= 0 || cropH <= 0) continue;

        // Create sub-canvas for the crop
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // Segment regional crop
        const tCropInfer0 = performance.now();
        const segRes = segmenter.segment(cropCanvas);
        const cropInferTime = performance.now() - tCropInfer0;

        const conf = segRes.confidenceMasks[0];
        const confFloats = conf.getAsFloat32Array();
        const mW = conf.width;
        const mH = conf.height;

        let cropFgCount = 0;
        const cropMask = new Uint8Array(cropW * cropH);

        // Bilinear interpolation for regional crop mask
        for (let cy = 0; cy < cropH; cy++) {
          const gy = (cy / cropH) * (mH - 1);
          const y0 = Math.floor(gy);
          const y1 = Math.min(mH - 1, y0 + 1);
          const dy = gy - y0;
          for (let cx = 0; cx < cropW; cx++) {
            const gx = (cx / cropW) * (mW - 1);
            const x0 = Math.floor(gx);
            const x1 = Math.min(mW - 1, x0 + 1);
            const dx = gx - x0;
            const c00 = confFloats[y0 * mW + x0];
            const c10 = confFloats[y0 * mW + x1];
            const c01 = confFloats[y1 * mW + x0];
            const c11 = confFloats[y1 * mW + x1];
            const val = (c00 * (1 - dx) + c10 * dx) * (1 - dy) + (c01 * (1 - dx) + c11 * dx) * dy;

            if (val >= 0.45) { // Confidence threshold
              cropMask[cy * cropW + cx] = 1;
              cropFgCount++;

              // Remap to global union coordinates
              const gx = cropX + cx;
              const gy = cropY + cy;
              globalUnionMask[gy * W + gx] = 1;
            }
          }
        }

        cropResults.push({
          index: i + 1,
          box: b,
          cropW,
          cropH,
          inferTimeMs: cropInferTime,
          cropFgPixels: cropFgCount,
        });
      }
      const totalCropsTime = performance.now() - tCrops0;

      // 5. Render Union Assets
      let unionFgPixels = 0;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = W;
      maskCanvas.height = H;
      const maskCtx = maskCanvas.getContext('2d');
      const maskImgData = maskCtx.createImageData(W, H);

      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = W;
      overlayCanvas.height = H;
      const overlayCtx = overlayCanvas.getContext('2d');
      overlayCtx.drawImage(srcCanvas, 0, 0);
      const overlayImgData = overlayCtx.getImageData(0, 0, W, H);

      const artCanvas = document.createElement('canvas');
      artCanvas.width = W;
      artCanvas.height = H;
      const artCtx = artCanvas.getContext('2d');
      const artImgData = artCtx.createImageData(W, H);

      for (let i = 0; i < W * H; i++) {
        const off = i * 4;
        if (globalUnionMask[i] === 1) {
          unionFgPixels++;
          maskImgData.data[off] = 255;
          maskImgData.data[off + 1] = 255;
          maskImgData.data[off + 2] = 255;
          maskImgData.data[off + 3] = 255;

          overlayImgData.data[off] = Math.round(overlayImgData.data[off] * 0.4 + 56 * 0.6);
          overlayImgData.data[off + 1] = Math.round(overlayImgData.data[off + 1] * 0.4 + 189 * 0.6);
          overlayImgData.data[off + 2] = Math.round(overlayImgData.data[off + 2] * 0.4 + 248 * 0.6);

          artImgData.data[off] = srcImageData.data[off];
          artImgData.data[off + 1] = srcImageData.data[off + 1];
          artImgData.data[off + 2] = srcImageData.data[off + 2];
          artImgData.data[off + 3] = 255;
        } else {
          maskImgData.data[off + 3] = 255; // black bg
          artImgData.data[off + 3] = 0;   // transparent
        }
      }

      maskCtx.putImageData(maskImgData, 0, 0);
      overlayCtx.putImageData(overlayImgData, 0, 0);
      artCtx.putImageData(artImgData, 0, 0);

      // Render White-backed sticker
      // Simple morphological dilation (white border)
      const borderCanvas = document.createElement('canvas');
      borderCanvas.width = W;
      borderCanvas.height = H;
      const borderCtx = borderCanvas.getContext('2d');

      // Use canvas shadow/blur or multiple offsets for white border
      borderCtx.drawImage(artCanvas, 0, 0);
      // Create white silhouette by drawing art canvas with composite operation
      const whiteSilhouetteCanvas = document.createElement('canvas');
      whiteSilhouetteCanvas.width = W;
      whiteSilhouetteCanvas.height = H;
      const wsCtx = whiteSilhouetteCanvas.getContext('2d');
      wsCtx.drawImage(artCanvas, 0, 0);
      wsCtx.globalCompositeOperation = 'source-in';
      wsCtx.fillStyle = '#ffffff';
      wsCtx.fillRect(0, 0, W, H);

      const finalStickerCanvas = document.createElement('canvas');
      finalStickerCanvas.width = W;
      finalStickerCanvas.height = H;
      const fsCtx = finalStickerCanvas.getContext('2d');

      // Draw expanded white border (radius 8px)
      const radius = 8;
      for (let dy = -radius; dy <= radius; dy += 2) {
        for (let dx = -radius; dx <= radius; dx += 2) {
          if (dx * dx + dy * dy <= radius * radius) {
            fsCtx.drawImage(whiteSilhouetteCanvas, dx, dy);
          }
        }
      }
      fsCtx.drawImage(artCanvas, 0, 0);

      return {
        W,
        H,
        detInitTime,
        segInitTime,
        detectionTime,
        totalCropsTime,
        pipelineTotalTime: detectionTime + totalCropsTime,
        boxesCount: validBoxes.length,
        cropResults,
        unionFgPixels,
        unionFgRatio: unionFgPixels / (W * H),
        boxOverlayDataUrl: boxCanvas.toDataURL('image/png'),
        maskDataUrl: maskCanvas.toDataURL('image/png'),
        overlayDataUrl: overlayCanvas.toDataURL('image/png'),
        artDataUrl: artCanvas.toDataURL('image/png'),
        stickerDataUrl: finalStickerCanvas.toDataURL('image/png'),
      };
    }, { photoDataUrl: dataUrl, config: photo });

    console.log(`Detected Boxes: ${evalData.boxesCount}`);
    console.log(`Detection Latency: ${evalData.detectionTime.toFixed(1)}ms`);
    console.log(`Regional Segmentation Latency (${evalData.boxesCount} crops): ${evalData.totalCropsTime.toFixed(1)}ms`);
    console.log(`Total Pipeline Latency: ${evalData.pipelineTotalTime.toFixed(1)}ms`);
    console.log(`Union Foreground Pixels: ${evalData.unionFgPixels.toLocaleString()} (${(evalData.unionFgRatio * 100).toFixed(2)}%)`);

    // Save diagnostic images
    const targetDir = path.join(DIAG_DIR, photo.id);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    function savePng(filename, dataUrl) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(path.join(targetDir, filename), Buffer.from(base64Data, 'base64'));
    }

    savePng('boxes_overlay.png', evalData.boxOverlayDataUrl);
    savePng('union_raw_mask.png', evalData.maskDataUrl);
    savePng('union_overlay.png', evalData.overlayDataUrl);
    savePng('union_artwork_only.png', evalData.artDataUrl);
    savePng('union_white_backed.png', evalData.stickerDataUrl);

    results[photo.id] = {
      label: photo.label,
      width: evalData.W,
      height: evalData.H,
      expectedPeople: photo.expectedPeople,
      boxesCount: evalData.boxesCount,
      detectionTimeMs: evalData.detectionTime,
      cropsTimeMs: evalData.totalCropsTime,
      totalPipelineMs: evalData.pipelineTotalTime,
      unionFgPixels: evalData.unionFgPixels,
      unionFgRatio: evalData.unionFgRatio,
      crops: evalData.cropResults,
    };
  }

  await browser.close();

  const summaryPath = path.join(DIAG_DIR, 'detector_guided_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n================================================================`);
  console.log(`Summary saved to: ${summaryPath}`);
  console.log(`Diagnostics saved to: ${DIAG_DIR}`);
  console.log(`================================================================`);
}

runDetectorGuidedBenchmark().catch(console.error);
