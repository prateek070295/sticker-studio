const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4174;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const OUTPUT_DIR = path.resolve('docs/v1.7_matting_investigation/real_priors');

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

const sharp = require('C:/Users/prate/Documents/pheartp/node_modules/sharp');

async function ensureCompoundFlowerPortrait() {
  const compoundPath = path.resolve('test-output/actual_portraits/compound_woman_red_flower.png');
  if (fs.existsSync(compoundPath)) return compoundPath;

  const womanPath = path.resolve('test-output/actual_portraits/woman_portrait.jpg');
  const baseImg = sharp(womanPath);
  const meta = await baseImg.metadata();
  const width = meta.width;
  const height = meta.height;

  const raw = await baseImg.ensureAlpha().raw().toBuffer();
  const rgba = new Uint8ClampedArray(raw);

  const fx = Math.round(width * 0.62);
  const fy = Math.round(height * 0.22);
  const fRadius = Math.round(width * 0.08);

  for (let dy = -fRadius; dy <= fRadius; dy++) {
    const py = fy + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -fRadius; dx <= fRadius; dx++) {
      const px = fx + dx;
      if (px < 0 || px >= width) continue;

      const d = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const petalR = fRadius * (0.8 + 0.2 * Math.cos(5 * angle));

      if (d <= petalR) {
        const idx = (py * width + px) * 4;
        if (d < fRadius * 0.28) {
          rgba[idx] = 250;
          rgba[idx + 1] = 210;
          rgba[idx + 2] = 40;
        } else {
          const shade = 1.0 - (d / fRadius) * 0.3;
          rgba[idx] = Math.round(225 * shade);
          rgba[idx + 1] = Math.round(30 * shade);
          rgba[idx + 2] = Math.round(45 * shade);
        }
        rgba[idx + 3] = 255;
      }
    }
  }

  await sharp(Buffer.from(rgba.buffer), {
    raw: { width, height, channels: 4 },
  }).png().toFile(compoundPath);

  console.log(`Generated compound woman flower portrait at ${compoundPath}`);
  return compoundPath;
}

async function extractPriors() {
  await ensureCompoundFlowerPortrait();

  const fixtures = [
    { name: 'woman_portrait', file: 'test-output/actual_portraits/woman_portrait.jpg' },
    { name: 'leather_jacket_portrait', file: 'test-output/actual_portraits/leather_jacket_portrait.jpg' },
    { name: 'alex_pretti_glasses', file: 'test-output/actual_portraits/alex_pretti_glasses.jpg' },
    { name: 'compound_woman_red_flower', file: 'test-output/actual_portraits/compound_woman_red_flower.png' },
  ];

  const previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT)], {
    shell: true,
    stdio: 'ignore'
  });

  try {
    await waitForServer(PREVIEW_URL, 20000);
    console.log(`Vite preview server running at ${PREVIEW_URL}`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox']
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });

    for (const f of fixtures) {
      console.log(`Extracting real MediaPipe prior for ${f.name}...`);
      const absPath = path.resolve(f.file);
      if (!fs.existsSync(absPath)) {
        console.warn(`File not found: ${absPath}`);
        continue;
      }

      // Convert image to data URL
      const imgBuffer = fs.readFileSync(absPath);
      const mime = f.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${imgBuffer.toString('base64')}`;

      // Run MediaPipe segmentation in page context
      const prior = await page.evaluate(async (url) => {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Load MediaPipe segmenter
        const bundlePath = '/mediapipe/vision_bundle.mjs';
        const mp = await import(/* @vite-ignore */ bundlePath);
        const vision = await mp.FilesetResolver.forVisionTasks('/mediapipe');
        const segmenter = await mp.ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite',
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });

        const result = segmenter.segment(canvas);
        const confidenceMasks = result.confidenceMasks;
        if (!confidenceMasks || confidenceMasks.length === 0) {
          throw new Error('No confidence masks returned');
        }

        const fgConfidence = confidenceMasks[0];
        const confW = fgConfidence.width;
        const confH = fgConfidence.height;
        const rawFloats = fgConfidence.getAsFloat32Array();

        // Bilinearly upsample confidence map to full canvas size
        const W = canvas.width;
        const H = canvas.height;
        const fullConf = new Float32Array(W * H);
        const fullMask = new Uint8Array(W * H);

        if (confW === W && confH === H) {
          for (let i = 0; i < W * H; i++) {
            const val = rawFloats[i];
            fullConf[i] = val;
            if (val >= 0.45) fullMask[i] = 1;
          }
        } else {
          for (let y = 0; y < H; y++) {
            const gy = (y / H) * (confH - 1);
            const y0 = Math.floor(gy);
            const y1 = Math.min(confH - 1, y0 + 1);
            const fy = gy - y0;

            for (let x = 0; x < W; x++) {
              const gx = (x / W) * (confW - 1);
              const x0 = Math.floor(gx);
              const x1 = Math.min(confW - 1, x0 + 1);
              const fx = gx - x0;

              const c00 = rawFloats[y0 * confW + x0];
              const c10 = rawFloats[y0 * confW + x1];
              const c01 = rawFloats[y1 * confW + x0];
              const c11 = rawFloats[y1 * confW + x1];

              const top = c00 + fx * (c10 - c00);
              const btm = c01 + fx * (c11 - c01);
              const val = top + fy * (btm - top);

              fullConf[y * W + x] = val;
              if (val >= 0.45) fullMask[y * W + x] = 1;
            }
          }
        }

        function uint8ToBase64(bytes) {
          let binary = '';
          const len = bytes.byteLength;
          const chunkSize = 16384;
          for (let i = 0; i < len; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
          }
          return btoa(binary);
        }

        return {
          width: W,
          height: H,
          maskBase64: uint8ToBase64(fullMask),
          confBase64: uint8ToBase64(new Uint8Array(fullConf.buffer)),
        };
      }, dataUrl);

      const maskBuf = Buffer.from(prior.maskBase64, 'base64');
      const confBuf = Buffer.from(prior.confBase64, 'base64');

      fs.writeFileSync(path.join(OUTPUT_DIR, `${f.name}_mask.raw`), maskBuf);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${f.name}_conf.raw`), confBuf);
      console.log(`Saved real MediaPipe priors for ${f.name} (${prior.width}x${prior.height})`);
    }

    await browser.close();
    console.log('Finished extracting real MediaPipe priors!');
  } finally {
    previewProcess.kill();
  }
}

extractPriors().catch(err => {
  console.error('Error extracting priors:', err);
  process.exit(1);
});
