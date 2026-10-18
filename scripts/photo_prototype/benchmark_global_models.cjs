const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const DIAG_DIR = path.resolve('docs/diagnosis_global_models');

if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });

const PHOTOS = [
  { id: 'father_and_daughter', label: 'Father & Daughter', file: 'prototype_touching_subjects.jpg', expectedPeople: 2 },
  { id: 'beach_family', label: 'Beach Family (Sunset)', file: 'eval_photo_1_beach_family.jpg', expectedPeople: 15 },
  { id: 'indoor_family', label: 'Field Family (5 Members)', file: 'eval_photo_2_indoor_family.jpg', expectedPeople: 5 },
];

async function runGlobalBenchmark() {
  console.log('================================================================');
  console.log('GLOBAL PERSON SEGMENTATION BENCHMARK: DEEPLAB-V3 vs BODYPIX vs SELFIE');
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

    console.log(`\nEvaluating Photo: ${photo.label} (${photo.file})...`);

    const evalData = await page.evaluate(async ({ dataUrl, id, label }) => {
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = W;
      srcCanvas.height = H;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);
      const srcImageData = srcCtx.getImageData(0, 0, W, H);

      // Helper to generate visual diagnostic PNGs from binary mask
      function renderMaskAssets(binaryMask) {
        // 1. Raw 8-bit grayscale mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = W;
        maskCanvas.height = H;
        const maskCtx = maskCanvas.getContext('2d');
        const maskImgData = maskCtx.createImageData(W, H);

        // 2. Overlay
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = W;
        overlayCanvas.height = H;
        const overlayCtx = overlayCanvas.getContext('2d');
        overlayCtx.drawImage(srcCanvas, 0, 0);
        const overlayImgData = overlayCtx.getImageData(0, 0, W, H);

        // 3. Artwork only
        const artCanvas = document.createElement('canvas');
        artCanvas.width = W;
        artCanvas.height = H;
        const artCtx = artCanvas.getContext('2d');
        const artImgData = artCtx.createImageData(W, H);

        let fgCount = 0;
        for (let i = 0; i < W * H; i++) {
          const off = i * 4;
          if (binaryMask[i] > 0) {
            fgCount++;
            maskImgData.data[off] = 255;
            maskImgData.data[off + 1] = 255;
            maskImgData.data[off + 2] = 255;
            maskImgData.data[off + 3] = 255;

            overlayImgData.data[off] = Math.round(overlayImgData.data[off] * 0.4 + 255 * 0.6);
            overlayImgData.data[off + 1] = Math.round(overlayImgData.data[off + 1] * 0.4);
            overlayImgData.data[off + 2] = Math.round(overlayImgData.data[off + 2] * 0.4);

            artImgData.data[off] = srcImageData.data[off];
            artImgData.data[off + 1] = srcImageData.data[off + 1];
            artImgData.data[off + 2] = srcImageData.data[off + 2];
            artImgData.data[off + 3] = 255;
          } else {
            maskImgData.data[off + 3] = 255; // opaque black background for raw mask
            artImgData.data[off + 3] = 0;
          }
        }

        maskCtx.putImageData(maskImgData, 0, 0);
        overlayCtx.putImageData(overlayImgData, 0, 0);
        artCtx.putImageData(artImgData, 0, 0);

        return {
          fgCount,
          rawMaskDataUrl: maskCanvas.toDataURL('image/png'),
          overlayDataUrl: overlayCanvas.toDataURL('image/png'),
          artworkDataUrl: artCanvas.toDataURL('image/png'),
        };
      }

      const modelsOut = {};

      // -------------------------------------------------------------
      // 1. MediaPipe Selfie Segmenter Landscape (Baseline)
      // -------------------------------------------------------------
      try {
        const t0 = performance.now();
        const vision = await window.FilesetResolver.forVisionTasks('/vendor');
        const selfieSegmenter = await window.ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/eval-models/selfie_segmenter_landscape.tflite',
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });

        const selfieRes = selfieSegmenter.segment(srcCanvas);
        const selfieConf = selfieRes.confidenceMasks[0];
        const confFloats = selfieConf.getAsFloat32Array();
        const mW = selfieConf.width;
        const mH = selfieConf.height;

        const selfieMask = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
          const gy = (y / H) * (mH - 1);
          const y0 = Math.floor(gy);
          const y1 = Math.min(mH - 1, y0 + 1);
          const dy = gy - y0;
          for (let x = 0; x < W; x++) {
            const gx = (x / W) * (mW - 1);
            const x0 = Math.floor(gx);
            const x1 = Math.min(mW - 1, x0 + 1);
            const dx = gx - x0;
            const c00 = confFloats[y0 * mW + x0];
            const c10 = confFloats[y0 * mW + x1];
            const c01 = confFloats[y1 * mW + x0];
            const c11 = confFloats[y1 * mW + x1];
            const val = (c00 * (1 - dx) + c10 * dx) * (1 - dy) + (c01 * (1 - dx) + c11 * dx) * dy;
            if (val >= 0.5) {
              selfieMask[y * W + x] = 1;
            }
          }
        }
        const selfieTime = performance.now() - t0;
        const assets = renderMaskAssets(selfieMask);

        modelsOut['selfie'] = {
          name: 'MediaPipe Selfie Landscape',
          timeMs: selfieTime,
          fgPixels: assets.fgCount,
          fgRatio: assets.fgCount / (W * H),
          rawMaskDataUrl: assets.rawMaskDataUrl,
          overlayDataUrl: assets.overlayDataUrl,
          artworkDataUrl: assets.artworkDataUrl,
        };
      } catch (err) {
        modelsOut['selfie'] = { error: err.message };
      }

      // -------------------------------------------------------------
      // 2. MediaPipe DeepLab-v3 (Pascal VOC Semantic Segmentation)
      // -------------------------------------------------------------
      try {
        const t0 = performance.now();
        const vision = await window.FilesetResolver.forVisionTasks('/vendor');
        const deepLabSegmenter = await window.ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/eval-models/deeplab_v3.tflite',
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });

        const dlRes = deepLabSegmenter.segment(srcCanvas);
        const catMask = dlRes.categoryMask;
        const catArray = catMask.getAsUint8Array();
        const dlW = catMask.width;
        const dlH = catMask.height;

        const dlMask = new Uint8Array(W * H);
        const detectedClasses = new Set();
        for (let i = 0; i < catArray.length; i++) {
          detectedClasses.add(catArray[i]);
        }

        for (let y = 0; y < H; y++) {
          const sy = Math.floor((y / H) * dlH);
          for (let x = 0; x < W; x++) {
            const sx = Math.floor((x / W) * dlW);
            const cls = catArray[sy * dlW + sx];
            if (cls === 15) { // Class 15 = Person
              dlMask[y * W + x] = 1;
            }
          }
        }
        const dlTime = performance.now() - t0;
        const assets = renderMaskAssets(dlMask);

        modelsOut['deeplab'] = {
          name: 'MediaPipe DeepLab-v3 (Person Class 15)',
          timeMs: dlTime,
          fgPixels: assets.fgCount,
          fgRatio: assets.fgCount / (W * H),
          gridSize: `${dlW}x${dlH}`,
          classesDetected: Array.from(detectedClasses),
          rawMaskDataUrl: assets.rawMaskDataUrl,
          overlayDataUrl: assets.overlayDataUrl,
          artworkDataUrl: assets.artworkDataUrl,
        };
      } catch (err) {
        modelsOut['deeplab'] = { error: err.message };
      }

      // -------------------------------------------------------------
      // 3. TensorFlow.js BodyPix Multi-Person
      // -------------------------------------------------------------
      try {
        const t0 = performance.now();
        const segmenter = await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.BodyPix,
          {
            runtime: 'tfjs',
            architecture: 'MobileNetV1',
            outputStride: 16,
            multiplier: 0.75,
            quantBytes: 2,
            modelUrl: '/eval-models/bodypix_mobilenet_075_stride16/model-stride16.json',
          }
        );

        const people = await segmenter.segmentPeople(srcCanvas, {
          multiPersonDecoding: {
            maxDetections: 20,
            scoreThreshold: 0.2,
            nmsRadius: 20,
          },
          segmentationThreshold: 0.4,
        });

        const bpMask = new Uint8Array(W * H);
        const peopleInfo = [];

        for (let pIdx = 0; pIdx < people.length; pIdx++) {
          const person = people[pIdx];
          const maskData = await person.mask.toImageData();
          let pPixels = 0;
          for (let i = 0; i < W * H; i++) {
            if (maskData.data[i * 4 + 3] > 0) {
              bpMask[i] = 1;
              pPixels++;
            }
          }
          peopleInfo.push({ index: pIdx, pixels: pPixels });
        }

        const bpTime = performance.now() - t0;
        const assets = renderMaskAssets(bpMask);

        modelsOut['bodypix'] = {
          name: 'TensorFlow.js BodyPix Multi-Person',
          timeMs: bpTime,
          peopleDetected: people.length,
          peopleBreakdown: peopleInfo,
          fgPixels: assets.fgCount,
          fgRatio: assets.fgCount / (W * H),
          rawMaskDataUrl: assets.rawMaskDataUrl,
          overlayDataUrl: assets.overlayDataUrl,
          artworkDataUrl: assets.artworkDataUrl,
        };
      } catch (err) {
        modelsOut['bodypix'] = { error: err.message };
      }

      return {
        width: W,
        height: H,
        models: modelsOut,
      };
    }, { dataUrl, id: photo.id, label: photo.label });

    results[photo.id] = evalData;

    console.log(`  Dimensions: ${evalData.width} × ${evalData.height}`);
    for (const [mKey, mRes] of Object.entries(evalData.models)) {
      if (mRes.error) {
        console.error(`  [${mKey}] Error: ${mRes.error}`);
        continue;
      }
      console.log(`  [${mKey}] ${mRes.name}:`);
      console.log(`    Time: ${mRes.timeMs.toFixed(1)} ms | Foreground: ${mRes.fgPixels.toLocaleString()} px (${(mRes.fgRatio * 100).toFixed(2)}%)`);
      if (mRes.peopleDetected !== undefined) {
        console.log(`    People Detected: ${mRes.peopleDetected} (Breakdown: ${mRes.peopleBreakdown.map(p => `${p.pixels} px`).join(', ')})`);
      }
      if (mRes.classesDetected) {
        console.log(`    VOC Classes Detected: ${mRes.classesDetected.join(', ')}`);
      }

      // Save diagnostic images
      const photoDir = path.join(DIAG_DIR, photo.id, mKey);
      if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

      const saveB64 = (filePath, b64) => {
        if (!b64) return;
        const buf = Buffer.from(b64.replace(/^data:image\/png;base64,/, ''), 'base64');
        fs.writeFileSync(filePath, buf);
      };

      saveB64(path.join(photoDir, 'raw_mask.png'), mRes.rawMaskDataUrl);
      saveB64(path.join(photoDir, 'overlay.png'), mRes.overlayDataUrl);
      saveB64(path.join(photoDir, 'artwork.png'), mRes.artworkDataUrl);
    }
  }

  // Strip large dataUrls from JSON before saving
  const cleanSummary = JSON.parse(JSON.stringify(results));
  for (const p of Object.values(cleanSummary)) {
    for (const m of Object.values(p.models)) {
      delete m.rawMaskDataUrl;
      delete m.overlayDataUrl;
      delete m.artworkDataUrl;
    }
  }

  fs.writeFileSync(path.join(DIAG_DIR, 'global_models_summary.json'), JSON.stringify(cleanSummary, null, 2));
  console.log(`\n✓ Saved benchmark data to: ${path.join(DIAG_DIR, 'global_models_summary.json')}`);

  await browser.close();
}

runGlobalBenchmark().catch(console.error);
