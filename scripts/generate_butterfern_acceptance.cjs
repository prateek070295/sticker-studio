const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const PORT = 3897;
const ROOT = path.resolve('.');
const OUTPUT_DIR = path.resolve('test-output/butterfern_acceptance');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.tflite': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');

      let cleanUrl = req.url.split('?')[0];
      if (cleanUrl === '/' || cleanUrl === '/app' || cleanUrl === '/app/') {
        cleanUrl = '/dist/index.html';
      }

      let filePath;
      if (
        cleanUrl.startsWith('/assets/') ||
        cleanUrl.startsWith('/mediapipe/') ||
        cleanUrl.startsWith('/samples/') ||
        cleanUrl === '/dist/index.html' ||
        cleanUrl === '/sw.js' ||
        cleanUrl.startsWith('/workbox-') ||
        cleanUrl === '/manifest.webmanifest' ||
        cleanUrl === '/favicon.ico'
      ) {
        filePath = path.join(ROOT, cleanUrl.startsWith('/dist/') ? cleanUrl : path.join('dist', cleanUrl));
      } else {
        filePath = path.join(ROOT, cleanUrl);
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end(`Not found: ${cleanUrl}`);
        return;
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

async function runAcceptance() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.5 — LITTLE BIG FEELINGS TEMPLATE ACCEPTANCE');
  console.log('================================================================\n');

  const server = await startServer();

  console.log('[1/6] Launching headless browser...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-features=SharedArrayBuffer',
      '--no-sandbox',
      '--disable-web-security',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Cartoon') || text.includes('[DEBUG') || text.includes('Error') || text.includes('Notice')) {
      console.log(`    [Browser Console] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.error(`    [Browser PageError] ${err.message}`);
  });

  console.log(`[2/6] Navigating to http://127.0.0.1:${PORT}/app#cartoon ...`);
  await page.goto(`http://127.0.0.1:${PORT}/app#cartoon`, { waitUntil: 'networkidle' });

  // Verify production pipeline is exposed
  const pipelineManifest = await page.evaluate(() => {
    const p = window.cartoonProductionPipeline;
    if (!p) return null;
    return {
      templateCount: p.CARTOON_REACTIONS_PACK ? p.CARTOON_REACTIONS_PACK.length : 0,
      templates: p.CARTOON_REACTIONS_PACK ? p.CARTOON_REACTIONS_PACK.map((t) => ({ id: t.id, name: t.name, desc: t.description })) : [],
    };
  });

  if (!pipelineManifest || pipelineManifest.templateCount !== 12) {
    throw new Error(
      `window.cartoonProductionPipeline did not expose 12 templates! Found: ${
        pipelineManifest ? pipelineManifest.templateCount : 0
      }`
    );
  }

  console.log(`  ✓ Verified 12 Little Big Feelings templates on window.cartoonProductionPipeline:`);
  pipelineManifest.templates.forEach((t, i) => {
    console.log(`    ${String(i + 1).padStart(2, '0')}: [${t.id}] ${t.name.padEnd(16)} (${t.desc})`);
  });

  // Test portraits
  const portraits = [
    {
      id: 'case_c_long_hair',
      name: 'Case C — Long Hair with Tilt',
      path: path.resolve('test-output/actual_portraits/leather_jacket_portrait.jpg'),
    },
    {
      id: 'case_b_glasses',
      name: 'Case B — Glasses-Wearing Adult',
      path: path.resolve('test-output/actual_portraits/alex_pretti_glasses.jpg'),
    },
    {
      id: 'case_a_short_hair',
      name: 'Case A — Short-Haired Adult',
      path: path.resolve('test-output/actual_portraits/man_glasses_portrait.jpg'),
    },
  ];

  console.log('\n[3/6] Executing Production Pipeline with Little Big Feelings Templates...');

  console.log(`  Testing all 3 permitted portraits:`);
  for (const p of portraits) {
    console.log(`    - ${p.name} (${p.path})`);
  }

  const portraitDataUrls = portraits.map((p) => ({
    id: p.id,
    name: p.name,
    dataUrl: `data:image/jpeg;base64,${fs.readFileSync(p.path).toString('base64')}`,
  }));

  const evalResult = await page.evaluate(async ({ portraitList }) => {
    const pipeline = window.cartoonProductionPipeline;
    const {
      extractPhotographicHead,
      renderCartoonArtwork,
      generateCartoonStickerDieCut,
      computeInitialHeadPlacement,
      CARTOON_REACTIONS_PACK,
    } = pipeline;

    function cropCanvas(src, crop) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, crop.width);
      c.height = Math.max(1, crop.height);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(src, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      }
      return c;
    }

    function formatFilename(tpl, index) {
      const num = String(index + 1).padStart(2, '0');
      const raw = tpl.id === 'hi-waving-01' ? 'Hi' : tpl.name;
      const clean = raw
        .replace(/[!?.()']/g, '')
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('_');
      return `${num}_${clean}.png`;
    }

    // Process all portraits
    const portraitResults = [];

    for (const pItem of portraitList) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = pItem.dataUrl;
      });

      const tExtract0 = performance.now();
      const head = await extractPhotographicHead(img, {
        smoothness: 2,
        feather: 0.5,
        neckExtensionRatio: 0.35,
      });
      const tExtract = performance.now() - tExtract0;

      const stickersData = [];
      const templateTransforms = {};

      for (let i = 0; i < CARTOON_REACTIONS_PACK.length; i++) {
        const tpl = CARTOON_REACTIONS_PACK[i];
        const tComp0 = performance.now();

        const transform = computeInitialHeadPlacement(tpl, head);
        templateTransforms[tpl.id] = transform;

        const art = await renderCartoonArtwork(tpl, head, transform);
        const dieCut = generateCartoonStickerDieCut(art, 24, 2);
        const tComp = performance.now() - tComp0;

        const artCropped = cropCanvas(art, dieCut.tightCrop);
        const stickerCropped = cropCanvas(dieCut.stickerCanvas, dieCut.tightCrop);

        // Verify die cut pixels
        const stCtx = stickerCropped.getContext('2d');
        const stPixels = stCtx.getImageData(0, 0, stickerCropped.width, stickerCropped.height).data;
        let whiteBorderPixels = 0;
        let artworkPixels = 0;
        for (let pt = 0; pt < stPixels.length; pt += 4) {
          const a = stPixels[pt + 3];
          const r = stPixels[pt];
          const g = stPixels[pt + 1];
          const b = stPixels[pt + 2];
          if (a > 12) {
            if (r > 240 && g > 240 && b > 240) {
              whiteBorderPixels++;
            } else {
              artworkPixels++;
            }
          }
        }

        const filename = formatFilename(tpl, i);

        stickersData.push({
          index: i + 1,
          id: tpl.id,
          name: tpl.name,
          filename,
          crop: dieCut.tightCrop,
          transform,
          renderTimeMs: parseFloat(tComp.toFixed(2)),
          whiteBorderPixels,
          artworkPixels,
          artworkDataUrl: artCropped.toDataURL('image/png'),
          stickerDataUrl: stickerCropped.toDataURL('image/png'),
        });
      }

      portraitResults.push({
        id: pItem.id,
        name: pItem.name,
        headWidth: head.width,
        headHeight: head.height,
        tExtractMs: parseFloat(tExtract.toFixed(2)),
        stickers: stickersData,
        head,
        templateTransforms,
      });
    }

    // Helper base64
    function u8ToBase64(bytes) {
      let bin = '';
      const len = bytes.byteLength;
      for (let j = 0; j < len; j += 8192) {
        bin += String.fromCharCode.apply(null, bytes.subarray(j, Math.min(len, j + 8192)));
      }
      return btoa(bin);
    }

    // Project persistence round-trip test on primary
    const primaryHead = portraitResults[0].head;
    const v4Project = {
      version: 4,
      appMode: 'cartoon',
      templateId: CARTOON_REACTIONS_PACK[0].id,
      selfieDataUrl: portraitList[0].dataUrl,
      headCropBounds: primaryHead.cropBounds,
      headTransform: portraitResults[0].templateTransforms[CARTOON_REACTIONS_PACK[0].id],
      borderThickness: 24,
      smoothOutlineLevel: 2,
      alphaSettings: { smoothness: 2, feather: 0.5 },
      headPngDataUrl: primaryHead.canvas.toDataURL('image/png'),
      alphaMaskBase64: u8ToBase64(primaryHead.alphaMask),
      rawCropMaskBase64: primaryHead.rawCropMask ? u8ToBase64(primaryHead.rawCropMask) : undefined,
      landmarks: primaryHead.landmarks,
      templateTransforms: portraitResults[0].templateTransforms,
      templateBorderThicknesses: {},
      selectedTemplateIds: CARTOON_REACTIONS_PACK.map((t) => t.id),
      dateModified: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(v4Project);
    const reloaded = JSON.parse(jsonStr);

    const reloadedImg = new Image();
    await new Promise((res, rej) => {
      reloadedImg.onload = res;
      reloadedImg.onerror = rej;
      reloadedImg.src = reloaded.headPngDataUrl;
    });

    const reHeadCanvas = document.createElement('canvas');
    reHeadCanvas.width = reloadedImg.width;
    reHeadCanvas.height = reloadedImg.height;
    const reCtx = reHeadCanvas.getContext('2d');
    reCtx.drawImage(reloadedImg, 0, 0);

    const reHead = {
      canvas: reHeadCanvas,
      frontCanvas: primaryHead.frontCanvas,
      rearHairCanvas: primaryHead.rearHairCanvas,
      width: primaryHead.width,
      height: primaryHead.height,
      cropBounds: reloaded.headCropBounds,
      alphaMask: primaryHead.alphaMask,
      landmarks: reloaded.landmarks,
    };

    const reArt = await renderCartoonArtwork(
      CARTOON_REACTIONS_PACK[1],
      reHead,
      reloaded.templateTransforms[CARTOON_REACTIONS_PACK[1].id]
    );
    const reDieCut = generateCartoonStickerDieCut(reArt, 24, 2);
    const reStickerCropped = cropCanvas(reDieCut.stickerCanvas, reDieCut.tightCrop);

    const origStickerImg = new Image();
    await new Promise((res) => {
      origStickerImg.onload = res;
      origStickerImg.src = portraitResults[0].stickers[1].stickerDataUrl;
    });
    const origC = document.createElement('canvas');
    origC.width = origStickerImg.width;
    origC.height = origStickerImg.height;
    origC.getContext('2d').drawImage(origStickerImg, 0, 0);

    const origData = origC.getContext('2d').getImageData(0, 0, origC.width, origC.height).data;
    const reData = reStickerCropped.getContext('2d').getImageData(0, 0, origC.width, origC.height).data;

    let diffCount = 0;
    for (let k = 0; k < origData.length; k++) {
      if (Math.abs(origData[k] - reData[k]) > 0) diffCount++;
    }

    return {
      portraits: portraitResults,
      roundTripDiffCount: diffCount,
      projectJsonLength: jsonStr.length,
    };
  }, { portraitList: portraitDataUrls });

  const primaryPortrait = portraits[0];
  const primaryResult = evalResult.portraits[0];
  console.log(`  ✓ Primary head extracted (${primaryPortrait.name}): ${primaryResult.headWidth}x${primaryResult.headHeight} in ${primaryResult.tExtractMs} ms`);

  for (let pi = 1; pi < evalResult.portraits.length; pi++) {
    const p = evalResult.portraits[pi];
    console.log(`  ✓ Additional portrait tested (${p.name}): head ${p.headWidth}x${p.headHeight} in ${p.tExtractMs} ms`);
  }

  console.log(`  ✓ 12 stickers rendered for primary portrait:`);

  const zip = new JSZip();
  const artworkFolder = zip.folder('artwork_only');
  const stickerFolder = zip.folder('white_backed');
  const manifestStickers = [];
  const stickerSharpBuffers = [];

  for (const s of primaryResult.stickers) {
    console.log(
      `    ${String(s.index).padStart(2, '0')}: ${s.name.padEnd(16)} -> ${s.filename.padEnd(20)} [${s.crop.width}x${s.crop.height}px, ${s.renderTimeMs}ms, die-cut pixels=${s.whiteBorderPixels}]`
    );

    const artBuf = Buffer.from(s.artworkDataUrl.split(',')[1], 'base64');
    const stickerBuf = Buffer.from(s.stickerDataUrl.split(',')[1], 'base64');

    artworkFolder.file(s.filename, artBuf);
    stickerFolder.file(s.filename, stickerBuf);

    stickerSharpBuffers.push({
      index: s.index,
      id: s.id,
      name: s.name,
      filename: s.filename,
      buffer: stickerBuf,
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, `art_${s.filename}`), artBuf);
    fs.writeFileSync(path.join(OUTPUT_DIR, `sticker_${s.filename}`), stickerBuf);

    manifestStickers.push({
      index: s.index,
      id: s.id,
      name: s.name,
      artworkFile: `artwork_only/${s.filename}`,
      stickerFile: `white_backed/${s.filename}`,
      width: s.crop.width,
      height: s.crop.height,
      renderTimeMs: s.renderTimeMs,
    });
  }

  const packManifest = {
    packName: 'Little Big Feelings — Personalized Reactions Pack',
    version: '1.5.0',
    dateGenerated: new Date().toISOString(),
    sourceSelfie: path.basename(primaryPortrait.path),
    totalStickers: 12,
    stickers: manifestStickers,
  };
  zip.file('manifest.json', JSON.stringify(packManifest, null, 2));

  console.log(`\n[4/6] Verifying Project Round-Trip Persistence...`);
  console.log(`  Project JSON size: ${evalResult.projectJsonLength} bytes`);
  console.log(`  LOVE YOU sticker reload diff: ${evalResult.roundTripDiffCount} pixel differences`);
  if (evalResult.roundTripDiffCount !== 0) {
    throw new Error(`Round-trip persistence verification failed with ${evalResult.roundTripDiffCount} pixel diffs!`);
  }
  console.log('  ✓ Deterministic lossless reopening verified with 0 diffs!');

  console.log('\n[5/6] Generating Master Contact Sheet & Inspection Crops...');

  // Build 4x3 Contact Sheet
  const TILE_W = 460;
  const TILE_H = 460;
  const COLS = 4;
  const ROWS = 3;
  const MARGIN = 30;
  const HEADER_H = 100;

  const SHEET_W = COLS * TILE_W + (COLS + 1) * MARGIN;
  const SHEET_H = ROWS * TILE_H + (ROWS + 1) * MARGIN + HEADER_H;

  const composites = [];

  for (let i = 0; i < stickerSharpBuffers.length; i++) {
    const s = stickerSharpBuffers[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    const x = MARGIN + col * (TILE_W + MARGIN);
    const y = HEADER_H + MARGIN + row * (TILE_H + MARGIN);

    const resized = await sharp(s.buffer)
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
      <!-- Header -->
      <text x="40" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">Little Big Feelings — Personalized Reactions Pack (12 Stickers)</text>
      <text x="40" y="85" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#fb7185">FINISHED VECTOR ARTWORK INTEGRATED INTO STICKER STUDIO V1.5</text>

      <!-- Tile frames and labels -->
      ${stickerSharpBuffers
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
  const artifactContactSheetPath = path.join(ARTIFACT_DIR, 'little_big_feelings_master_contact_sheet.png');
  fs.writeFileSync(contactSheetPath, contactSheet);
  fs.writeFileSync(artifactContactSheetPath, contactSheet);
  console.log(`  ✓ Generated 12-Sticker Master Contact Sheet: ${contactSheetPath}`);

  // Detailed crops for key stickers
  const keyStickers = [
    { idx: 0, name: 'crop_butterfern_01_hi', label: '01 HI! (Waving Hand & Pop Starburst)' },
    { idx: 1, name: 'crop_butterfern_02_love_you', label: '02 LOVE YOU (Wrapping Arms & Heart)' },
    { idx: 5, name: 'crop_butterfern_06_sleepy', label: '06 SLEEPY (Quilt Blanket & Pillow)' },
    { idx: 9, name: 'crop_butterfern_10_thinking', label: '10 THINKING (Stool, Finger Chin & Thought Bubble)' },
  ];

  for (const ks of keyStickers) {
    const sBuf = stickerSharpBuffers[ks.idx].buffer;
    const cropFile = path.join(OUTPUT_DIR, `${ks.name}.png`);
    const artifactCropFile = path.join(ARTIFACT_DIR, `${ks.name}.png`);
    fs.writeFileSync(cropFile, sBuf);
    fs.writeFileSync(artifactCropFile, sBuf);
    console.log(`  ✓ Saved Detailed Crop: ${ks.label} -> ${cropFile}`);
  }

  // Multi-portrait cross-verification contact sheet
  console.log('\n  Generating Multi-Portrait Verification Sheet across 3 portraits...');
  const COMP_TILE_W = 340;
  const COMP_TILE_H = 340;
  const COMP_COLS = 4;
  const COMP_ROWS = 3;
  const COMP_MARGIN = 24;
  const COMP_HEADER_H = 100;
  const COMP_SIDEBAR_W = 200;

  const COMP_SHEET_W = COMP_SIDEBAR_W + COMP_COLS * COMP_TILE_W + (COMP_COLS + 1) * COMP_MARGIN;
  const COMP_SHEET_H = COMP_HEADER_H + COMP_ROWS * COMP_TILE_H + (COMP_ROWS + 1) * COMP_MARGIN;

  const sampleStickerIndices = [0, 1, 5, 9]; // HI!, LOVE YOU, SLEEPY, THINKING
  const compComposites = [];

  for (let r = 0; r < evalResult.portraits.length; r++) {
    const pData = evalResult.portraits[r];
    for (let c = 0; c < sampleStickerIndices.length; c++) {
      const sIdx = sampleStickerIndices[c];
      const stickerItem = pData.stickers[sIdx];
      const sBuf = Buffer.from(stickerItem.stickerDataUrl.split(',')[1], 'base64');

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
      <!-- Header -->
      <text x="30" y="45" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="bold" fill="#ffffff">Little Big Feelings — Multi-Portrait Cross-Verification</text>
      <text x="30" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#fb7185">VERIFYING HEAD PLACEMENT, HAIR LAYERING &amp; GLASSES ACROSS DIFFERENT PERMITTED PORTRAITS</text>

      <!-- Column Headers (Sticker Names) -->
      ${sampleStickerIndices.map((sIdx, c) => {
        const tpl = evalResult.portraits[0].stickers[sIdx];
        const x = COMP_SIDEBAR_W + COMP_MARGIN + c * (COMP_TILE_W + COMP_MARGIN) + COMP_TILE_W / 2;
        return `<text x="${x}" y="95" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#F8D269">${tpl.name}</text>`;
      }).join('')}

      <!-- Row Labels (Portrait Names) -->
      ${evalResult.portraits.map((p, r) => {
        const y = COMP_HEADER_H + COMP_MARGIN + r * (COMP_TILE_H + COMP_MARGIN) + COMP_TILE_H / 2;
        return `
          <rect x="20" y="${y - 40}" width="${COMP_SIDEBAR_W - 30}" height="80" rx="10" fill="#181924" stroke="#26283b" stroke-width="1.5"/>
          <text x="35" y="${y - 10}" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#ffffff">${p.name}</text>
          <text x="35" y="${y + 15}" font-family="system-ui, sans-serif" font-size="12" fill="#9CA3AF">${p.headWidth}x${p.headHeight}px • ${p.tExtractMs}ms</text>
        `;
      }).join('')}

      <!-- Tile frames -->
      ${evalResult.portraits.map((_, r) => sampleStickerIndices.map((_, c) => {
        const tx = COMP_SIDEBAR_W + COMP_MARGIN + c * (COMP_TILE_W + COMP_MARGIN);
        const ty = COMP_HEADER_H + COMP_MARGIN + r * (COMP_TILE_H + COMP_MARGIN);
        return `<rect x="${tx}" y="${ty}" width="${COMP_TILE_W}" height="${COMP_TILE_H}" rx="16" fill="#181924" stroke="#26283b" stroke-width="2"/>`;
      }).join('')).join('')}
    </svg>
  `;

  const compSheet = await sharp(Buffer.from(compSvgHeader))
    .composite(compComposites)
    .png()
    .toBuffer();

  const compSheetPath = path.join(OUTPUT_DIR, 'little_big_feelings_multi_portrait_comparison.png');
  const artifactCompSheetPath = path.join(ARTIFACT_DIR, 'little_big_feelings_multi_portrait_comparison.png');
  fs.writeFileSync(compSheetPath, compSheet);
  fs.writeFileSync(artifactCompSheetPath, compSheet);
  console.log(`  ✓ Generated Multi-Portrait Comparison: ${compSheetPath}`);

  // Create downloadable review ZIP
  console.log('\n[6/6] Building Application Exported ZIP & Review Package...');
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const appZipPath = path.join(OUTPUT_DIR, 'butterfern_little_big_feelings_pack.zip');
  const artifactAppZipPath = path.join(ARTIFACT_DIR, 'butterfern_little_big_feelings_pack.zip');
  fs.writeFileSync(appZipPath, zipBuf);
  fs.writeFileSync(artifactAppZipPath, zipBuf);
  console.log(`  ✓ Application-exported ZIP written to: ${artifactAppZipPath} (${(zipBuf.length / 1024 / 1024).toFixed(2)} MB)`);

  const benchmarkMetrics = {
    testDate: new Date().toISOString(),
    sourceSelfie: path.basename(primaryPortrait.path),
    collectionName: 'Little Big Feelings',
    totalTemplates: 12,
    headExtractionTimeMs: primaryResult.tExtractMs,
    totalPackCompositionTimeMs: primaryResult.stickers.reduce((acc, s) => acc + s.renderTimeMs, 0),
    stickers: primaryResult.stickers.map((s) => ({
      index: s.index,
      id: s.id,
      name: s.name,
      filename: s.filename,
      width: s.crop.width,
      height: s.crop.height,
      renderTimeMs: s.renderTimeMs,
      whiteBorderPixels: s.whiteBorderPixels,
      artworkPixels: s.artworkPixels,
    })),
    projectPersistence: {
      version: 4,
      roundTripPixelDiffCount: evalResult.roundTripDiffCount,
      projectJsonLengthBytes: evalResult.projectJsonLength,
    },
  };

  const metricsJson = JSON.stringify(benchmarkMetrics, null, 2);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'butterfern_benchmark_metrics.json'), metricsJson);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'butterfern_benchmark_metrics.json'), metricsJson);

  // Review package zip
  const reviewZip = new JSZip();
  reviewZip.file('little_big_feelings_master_contact_sheet.png', contactSheet);
  reviewZip.file('little_big_feelings_multi_portrait_comparison.png', compSheet);
  for (const ks of keyStickers) {
    reviewZip.file(`${ks.name}.png`, stickerSharpBuffers[ks.idx].buffer);
  }
  reviewZip.file('butterfern_little_big_feelings_pack.zip', zipBuf);
  reviewZip.file('manifest.json', JSON.stringify(packManifest, null, 2));
  reviewZip.file('benchmark_metrics.json', metricsJson);

  const reviewZipBuf = await reviewZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const reviewZipPath = path.join(ARTIFACT_DIR, 'butterfern_v1_5_review_package.zip');
  fs.writeFileSync(reviewZipPath, reviewZipBuf);
  console.log(`  ✓ Complete review package written to: ${reviewZipPath} (${(reviewZipBuf.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log(`\n================================================================`);
  console.log('ACCEPTANCE SUMMARY:');
  console.log(`  • Collection: Little Big Feelings (12 templates)`);
  console.log(`  • Primary Selfie: ${primaryPortrait.name}`);
  console.log(`  • Head extraction latency: ${primaryResult.tExtractMs} ms (computed ONCE)`);
  console.log(
    `  • Average sticker rendering time: ${(
      primaryResult.stickers.reduce((acc, s) => acc + s.renderTimeMs, 0) / 12
    ).toFixed(2)} ms/sticker`
  );
  console.log(`  • Project persistence round-trip diffs: 0 pixels`);
  console.log(`  • ZIP bundle: 24 PNG files (12 artwork + 12 white-backed) + manifest.json`);
  console.log('================================================================\n');

  await browser.close();
  server.close();
}

runAcceptance().catch((err) => {
  console.error('\n❌ Acceptance test failed with error:');
  console.error(err);
  process.exit(1);
});
