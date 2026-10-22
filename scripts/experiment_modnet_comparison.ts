/**
 * Sticker Studio V1.7 — Comparative Portrait Matting Experiment
 * Compares:
 * 1. Fast (V1.6 Baseline: Coarse Mask + EDT Refinement)
 * 2. Better (Guided Alpha Matte Solver, No Decontam)
 * 3. Best (Guided Alpha Matte Solver + Edge Decontamination)
 * 4. MODNet (Apache 2.0 Trimap-Free Portrait Matting ONNX Model via Transformers.js)
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import JSZip from 'jszip';
import { pipeline } from '@huggingface/transformers';
import { composePhotoCutout } from '../src/core/photoAdapter';
import { BoundingBox } from '../src/types/index';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');

const PROJECT_ROOT = 'C:/Users/prate/Documents/SheetExtractor';
const OUTPUT_BASE = path.join(PROJECT_ROOT, 'docs/v1.7_matting_investigation/modnet_experiment');
const ARTIFACT_DIR = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';
const PORTRAITS_DIR = path.join(PROJECT_ROOT, 'test-output/actual_portraits');
const PRIORS_DIR = path.join(PROJECT_ROOT, 'docs/v1.7_matting_investigation/real_priors');

const SUBDIRS = [
  'full_exports',
  'backdrops',
  'crops_400',
  'contact_sheets',
  'debug',
];

for (const sub of SUBDIRS) {
  fs.mkdirSync(path.join(OUTPUT_BASE, sub), { recursive: true });
}

export interface CandidateMetric {
  name: string;
  durationMs: number;
  fractionalPixels: number;
  fractionalPercent: number;
  exportBytes: number;
}

export interface PortraitExperimentResult {
  portraitName: string;
  width: number;
  height: number;
  fast: CandidateMetric;
  better: CandidateMetric;
  best: CandidateMetric;
  modnet: CandidateMetric;
  modnetModelSizeBytes: number;
  memoryUsageMb: {
    rss: number;
    heapUsed: number;
  };
}

function compositeOnBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  bgR: number,
  bgG: number,
  bgB: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const a = rgba[off + 3] / 255.0;
    const invA = 1.0 - a;
    out[off] = Math.round(rgba[off] * a + bgR * invA);
    out[off + 1] = Math.round(rgba[off + 1] * a + bgG * invA);
    out[off + 2] = Math.round(rgba[off + 2] * a + bgB * invA);
    out[off + 3] = 255;
  }
  return out;
}

async function extract400Crop(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cropBox: BoundingBox
): Promise<Buffer> {
  return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width, height, channels: 4 },
  })
    .extract({
      left: Math.max(0, Math.min(width - 1, cropBox.x)),
      top: Math.max(0, Math.min(height - 1, cropBox.y)),
      width: Math.min(width - cropBox.x, cropBox.width),
      height: Math.min(height - cropBox.y, cropBox.height),
    })
    .resize({
      width: cropBox.width * 4,
      height: cropBox.height * 4,
      kernel: 'nearest',
    })
    .png()
    .toBuffer();
}

async function create5WayComparison(
  origBuffer: Buffer,
  fastBuffer: Buffer,
  betterBuffer: Buffer,
  bestBuffer: Buffer,
  modnetBuffer: Buffer
): Promise<Buffer> {
  const meta = await sharp(origBuffer).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const gutter = 10;
  const headerHeight = 40;
  const totalW = w * 5 + gutter * 4;
  const totalH = h + headerHeight;

  const svgBanner = `
    <svg width="${totalW}" height="${headerHeight}">
      <rect width="100%" height="100%" fill="#0f172a" />
      <text x="${w * 0.5}" y="25" fill="#94a3b8" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">ORIGINAL PHOTO</text>
      <text x="${w + gutter + w * 0.5}" y="25" fill="#f87171" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">FAST (V1.6 BASELINE)</text>
      <text x="${(w + gutter) * 2 + w * 0.5}" y="25" fill="#fbbf24" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">BETTER (GUIDED MATTE)</text>
      <text x="${(w + gutter) * 3 + w * 0.5}" y="25" fill="#38bdf8" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">BEST (MATTE + DECONTAM)</text>
      <text x="${(w + gutter) * 4 + w * 0.5}" y="25" fill="#34d399" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">MODNET (APACHE 2.0)</text>
    </svg>
  `;

  const canvas = sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  });

  return canvas
    .composite([
      { input: Buffer.from(svgBanner), left: 0, top: 0 },
      { input: origBuffer, left: 0, top: headerHeight },
      { input: fastBuffer, left: w + gutter, top: headerHeight },
      { input: betterBuffer, left: (w + gutter) * 2, top: headerHeight },
      { input: bestBuffer, left: (w + gutter) * 3, top: headerHeight },
      { input: modnetBuffer, left: (w + gutter) * 4, top: headerHeight },
    ])
    .png()
    .toBuffer();
}

function loadMediaPipePrior(fixtureName: string, width: number, height: number) {
  const size = width * height;
  const maskPath = path.join(PRIORS_DIR, `${fixtureName}_mask.raw`);
  const confPath = path.join(PRIORS_DIR, `${fixtureName}_conf.raw`);

  if (!fs.existsSync(maskPath) || !fs.existsSync(confPath)) {
    throw new Error(`Priors not found for ${fixtureName}`);
  }

  const coarseMask = new Uint8Array(fs.readFileSync(maskPath));
  const rawConf = fs.readFileSync(confPath);
  const confidenceMap = new Float32Array(rawConf.buffer, rawConf.byteOffset, size);

  // Compute dominant component bounding box for coreBox (rejects detached outer noise)
  const visited = new Uint8Array(size);
  let maxCompPixels = 0;
  let bestBox: BoundingBox = { x: 0, y: 0, width, height };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (coarseMask[idx] === 0 || visited[idx]) continue;
      let count = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      const q = [idx];
      visited[idx] = 1;
      let head = 0;
      while (head < q.length) {
        const cur = q[head++];
        count++;
        const cy = Math.floor(cur / width);
        const cx = cur % width;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        const nbs = [cur - 1, cur + 1, cur - width, cur + width];
        for (const n of nbs) {
          if (n >= 0 && n < size && !visited[n] && coarseMask[n] > 0) {
            visited[n] = 1;
            q.push(n);
          }
        }
      }
      if (count > maxCompPixels) {
        maxCompPixels = count;
        bestBox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
      }
    }
  }

  return { coarseMask, confidenceMap, coreBox: bestBox };
}

async function runModnetComparison() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.7 — MODNET VS GUIDED MATTING EXPERIMENT');
  console.log('================================================================\n');

  console.log('1. Initializing MODNet pipeline from @huggingface/transformers...');
  const tLoad0 = performance.now();
  const segmenter = await pipeline('image-segmentation', 'Xenova/modnet');
  const modnetLoadTimeMs = performance.now() - tLoad0;
  console.log(`MODNet pipeline loaded in ${modnetLoadTimeMs.toFixed(1)} ms.\n`);

  const fixtures = [
    {
      name: 'woman_portrait',
      file: path.join(PORTRAITS_DIR, 'woman_portrait.jpg'),
      cropHair: { x: 340, y: 80, width: 70, height: 70 },
      cropDiagonal: { x: 190, y: 550, width: 70, height: 70 },
    },
    {
      name: 'leather_jacket_portrait',
      file: path.join(PORTRAITS_DIR, 'leather_jacket_portrait.jpg'),
      cropHair: { x: 200, y: 50, width: 70, height: 70 },
      cropDiagonal: { x: 80, y: 440, width: 70, height: 70 },
    },
    {
      name: 'alex_pretti_glasses',
      file: path.join(PORTRAITS_DIR, 'alex_pretti_glasses.jpg'),
      cropHair: { x: 380, y: 120, width: 70, height: 70 },
      cropDiagonal: { x: 220, y: 700, width: 70, height: 70 },
    },
    {
      name: 'compound_woman_red_flower',
      file: path.join(PORTRAITS_DIR, 'compound_woman_red_flower.png'),
      cropHair: { x: 340, y: 80, width: 70, height: 70 },
      cropDiagonal: { x: 190, y: 550, width: 70, height: 70 },
      cropAccessory: { x: 470, y: 180, width: 90, height: 90 },
    },
  ];

  const results: PortraitExperimentResult[] = [];

  for (const fix of fixtures) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Processing Portrait: [${fix.name}]`);
    console.log(`----------------------------------------------------------------`);

    const imageBuffer = fs.readFileSync(fix.file);
    const imageSharp = sharp(imageBuffer);
    const meta = await imageSharp.metadata();
    const W = meta.width!;
    const H = meta.height!;
    const rawRgbaBuffer = await imageSharp.ensureAlpha().raw().toBuffer();
    const sourceRgba = new Uint8ClampedArray(rawRgbaBuffer);

    const { coarseMask, confidenceMap, coreBox } = loadMediaPipePrior(fix.name, W, H);

    // -------------------------------------------------------------------------
    // CANDIDATE 1: FAST (V1.6 Baseline + False Foreground Pruning)
    // -------------------------------------------------------------------------
    const tFast0 = performance.now();
    const fastComposed = composePhotoCutout(coarseMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      qualityMode: 'fast',
      accessoryMerge: true,
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const fastDurationMs = performance.now() - tFast0;

    let fastFrac = 0;
    for (let i = 3; i < fastComposed.artworkOnlyRgba.length; i += 4) {
      const a = fastComposed.artworkOnlyRgba[i];
      if (a > 0 && a < 255) fastFrac++;
    }

    const fastExportBuffer = await sharp(
      Buffer.from(fastComposed.artworkOnlyRgba.buffer, fastComposed.artworkOnlyRgba.byteOffset, fastComposed.artworkOnlyRgba.byteLength),
      { raw: { width: fastComposed.artworkOnlyWidth, height: fastComposed.artworkOnlyHeight, channels: 4 } }
    ).png().toBuffer();

    console.log(`  Fast (V1.6 Baseline):     ${fastDurationMs.toFixed(1)} ms | Frac Alpha: ${fastFrac} px (${(fastFrac / (W * H) * 100).toFixed(2)}%)`);

    // -------------------------------------------------------------------------
    // CANDIDATE 2: BETTER (Guided Alpha Matte)
    // -------------------------------------------------------------------------
    const tBetter0 = performance.now();
    const betterComposed = composePhotoCutout(coarseMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      qualityMode: 'better',
      accessoryMerge: true,
      confidenceMap,
      decontaminateEdge: false,
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const betterDurationMs = performance.now() - tBetter0;

    let betterFrac = 0;
    for (let i = 3; i < betterComposed.artworkOnlyRgba.length; i += 4) {
      const a = betterComposed.artworkOnlyRgba[i];
      if (a > 0 && a < 255) betterFrac++;
    }

    const betterExportBuffer = await sharp(
      Buffer.from(betterComposed.artworkOnlyRgba.buffer, betterComposed.artworkOnlyRgba.byteOffset, betterComposed.artworkOnlyRgba.byteLength),
      { raw: { width: betterComposed.artworkOnlyWidth, height: betterComposed.artworkOnlyHeight, channels: 4 } }
    ).png().toBuffer();

    console.log(`  Better (Guided Matte):   ${betterDurationMs.toFixed(1)} ms | Frac Alpha: ${betterFrac} px (${(betterFrac / (W * H) * 100).toFixed(2)}%)`);

    // -------------------------------------------------------------------------
    // CANDIDATE 3: BEST (Guided Alpha Matte + Decontamination)
    // -------------------------------------------------------------------------
    const tBest0 = performance.now();
    const bestComposed = composePhotoCutout(coarseMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      qualityMode: 'best',
      accessoryMerge: true,
      confidenceMap,
      decontaminateEdge: true,
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const bestDurationMs = performance.now() - tBest0;

    let bestFrac = 0;
    for (let i = 3; i < bestComposed.artworkOnlyRgba.length; i += 4) {
      const a = bestComposed.artworkOnlyRgba[i];
      if (a > 0 && a < 255) bestFrac++;
    }

    const bestExportBuffer = await sharp(
      Buffer.from(bestComposed.artworkOnlyRgba.buffer, bestComposed.artworkOnlyRgba.byteOffset, bestComposed.artworkOnlyRgba.byteLength),
      { raw: { width: bestComposed.artworkOnlyWidth, height: bestComposed.artworkOnlyHeight, channels: 4 } }
    ).png().toBuffer();

    console.log(`  Best (Matte + Decontam): ${bestDurationMs.toFixed(1)} ms | Frac Alpha: ${bestFrac} px (${(bestFrac / (W * H) * 100).toFixed(2)}%)`);

    // -------------------------------------------------------------------------
    // CANDIDATE 4: MODNET (ONNX Model via Transformers.js)
    // -------------------------------------------------------------------------
    const tMod0 = performance.now();
    const modnetOutput = await segmenter(fix.file);
    const modnetInferDurationMs = performance.now() - tMod0;

    const modnetRawMask = modnetOutput[0].mask.data;
    // Map continuous sigmoid alpha [0..255] into production cutout pipeline
    const modnetAlphaMatte = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      modnetAlphaMatte[i] = modnetRawMask[i];
    }

    // Binary support mask thresholded at 0.5 (128)
    const modnetBinaryMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (modnetAlphaMatte[i] >= 128) modnetBinaryMask[i] = 1;
    }

    // Pass through production composePhotoCutout using precomputedAlphaMatte
    const tModCompose0 = performance.now();
    const modnetComposed = composePhotoCutout(modnetBinaryMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      precomputedAlphaMatte: modnetAlphaMatte,
      accessoryMerge: false, // MODNet predicts accessories directly
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const modnetTotalDurationMs = modnetInferDurationMs + (performance.now() - tModCompose0);

    let modnetFrac = 0;
    for (let i = 3; i < modnetComposed.artworkOnlyRgba.length; i += 4) {
      const a = modnetComposed.artworkOnlyRgba[i];
      if (a > 0 && a < 255) modnetFrac++;
    }

    const modnetExportBuffer = await sharp(
      Buffer.from(modnetComposed.artworkOnlyRgba.buffer, modnetComposed.artworkOnlyRgba.byteOffset, modnetComposed.artworkOnlyRgba.byteLength),
      { raw: { width: modnetComposed.artworkOnlyWidth, height: modnetComposed.artworkOnlyHeight, channels: 4 } }
    ).png().toBuffer();

    console.log(`  MODNet (Apache 2.0 ONNX): ${modnetTotalDurationMs.toFixed(1)} ms (infer: ${modnetInferDurationMs.toFixed(1)}ms) | Frac Alpha: ${modnetFrac} px (${(modnetFrac / (W * H) * 100).toFixed(2)}%)`);

    // -------------------------------------------------------------------------
    // EXPORT DELIVERABLES FOR VISUAL INSPECTION
    // -------------------------------------------------------------------------
    // 1. Full transparent PNG exports
    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${fix.name}_fast_export.png`), fastExportBuffer);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${fix.name}_better_export.png`), betterExportBuffer);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${fix.name}_best_export.png`), bestExportBuffer);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${fix.name}_modnet_export.png`), modnetExportBuffer);

    // 2. Full-frame composites across Black, White, Grey, Cyan for Best and MODNet
    const backdrops = [
      { name: 'dark', r: 15, g: 23, b: 42 },
      { name: 'white', r: 255, g: 255, b: 255 },
      { name: 'grey', r: 128, g: 128, b: 128 },
      { name: 'cyan', r: 0, g: 220, b: 255 },
    ];

    for (const bg of backdrops) {
      // Best on backdrop
      const bestBgRgba = compositeOnBackground(
        bestComposed.artworkOnlyRgba,
        bestComposed.artworkOnlyWidth,
        bestComposed.artworkOnlyHeight,
        bg.r, bg.g, bg.b
      );
      await sharp(Buffer.from(bestBgRgba.buffer), {
        raw: { width: bestComposed.artworkOnlyWidth, height: bestComposed.artworkOnlyHeight, channels: 4 }
      }).png().toFile(path.join(OUTPUT_BASE, 'backdrops', `${fix.name}_best_on_${bg.name}.png`));

      // MODNet on backdrop
      const modnetBgRgba = compositeOnBackground(
        modnetComposed.artworkOnlyRgba,
        modnetComposed.artworkOnlyWidth,
        modnetComposed.artworkOnlyHeight,
        bg.r, bg.g, bg.b
      );
      await sharp(Buffer.from(modnetBgRgba.buffer), {
        raw: { width: modnetComposed.artworkOnlyWidth, height: modnetComposed.artworkOnlyHeight, channels: 4 }
      }).png().toFile(path.join(OUTPUT_BASE, 'backdrops', `${fix.name}_modnet_on_${bg.name}.png`));
    }

    // 3. 400% Zoom Crops
    // Hair crop
    const bestHairCrop = await extract400Crop(
      bestComposed.artworkOnlyRgba,
      bestComposed.artworkOnlyWidth,
      bestComposed.artworkOnlyHeight,
      fix.cropHair
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_best_hair_crop_400.png`), bestHairCrop);

    const modnetHairCrop = await extract400Crop(
      modnetComposed.artworkOnlyRgba,
      modnetComposed.artworkOnlyWidth,
      modnetComposed.artworkOnlyHeight,
      fix.cropHair
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_modnet_hair_crop_400.png`), modnetHairCrop);

    // Diagonal/shoulder crop
    const bestDiagCrop = await extract400Crop(
      bestComposed.artworkOnlyRgba,
      bestComposed.artworkOnlyWidth,
      bestComposed.artworkOnlyHeight,
      fix.cropDiagonal
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_best_diagonal_crop_400.png`), bestDiagCrop);

    const modnetDiagCrop = await extract400Crop(
      modnetComposed.artworkOnlyRgba,
      modnetComposed.artworkOnlyWidth,
      modnetComposed.artworkOnlyHeight,
      fix.cropDiagonal
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_modnet_diagonal_crop_400.png`), modnetDiagCrop);

    // Accessory crop if applicable
    if (fix.cropAccessory) {
      const bestAccCrop = await extract400Crop(
        bestComposed.artworkOnlyRgba,
        bestComposed.artworkOnlyWidth,
        bestComposed.artworkOnlyHeight,
        fix.cropAccessory
      );
      fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_best_accessory_crop_400.png`), bestAccCrop);

      const modnetAccCrop = await extract400Crop(
        modnetComposed.artworkOnlyRgba,
        modnetComposed.artworkOnlyWidth,
        modnetComposed.artworkOnlyHeight,
        fix.cropAccessory
      );
      fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_modnet_accessory_crop_400.png`), modnetAccCrop);
    }

    // 4. 5-Way Comparison Contact Sheet
    const sheetBuffer = await create5WayComparison(
      imageBuffer,
      fastExportBuffer,
      betterExportBuffer,
      bestExportBuffer,
      modnetExportBuffer
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'contact_sheets', `${fix.name}_5way_comparison.png`), sheetBuffer);

    // Record metrics
    const mem = process.memoryUsage();
    results.push({
      portraitName: fix.name,
      width: W,
      height: H,
      fast: {
        name: 'Fast (V1.6 Baseline)',
        durationMs: fastDurationMs,
        fractionalPixels: fastFrac,
        fractionalPercent: Number((fastFrac / (W * H) * 100).toFixed(2)),
        exportBytes: fastExportBuffer.byteLength,
      },
      better: {
        name: 'Better (Guided Matte)',
        durationMs: betterDurationMs,
        fractionalPixels: betterFrac,
        fractionalPercent: Number((betterFrac / (W * H) * 100).toFixed(2)),
        exportBytes: betterExportBuffer.byteLength,
      },
      best: {
        name: 'Best (Matte + Decontam)',
        durationMs: bestDurationMs,
        fractionalPixels: bestFrac,
        fractionalPercent: Number((bestFrac / (W * H) * 100).toFixed(2)),
        exportBytes: bestExportBuffer.byteLength,
      },
      modnet: {
        name: 'MODNet (Apache 2.0 ONNX)',
        durationMs: modnetTotalDurationMs,
        fractionalPixels: modnetFrac,
        fractionalPercent: Number((modnetFrac / (W * H) * 100).toFixed(2)),
        exportBytes: modnetExportBuffer.byteLength,
      },
      modnetModelSizeBytes: 27150000, // ~25.9 MB unquantized FP32
      memoryUsageMb: {
        rss: Number((mem.rss / 1024 / 1024).toFixed(1)),
        heapUsed: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
      },
    });
  }

  // Write metrics JSON
  const metricsJsonPath = path.join(OUTPUT_BASE, 'modnet_experiment_metrics.json');
  fs.writeFileSync(metricsJsonPath, JSON.stringify(results, null, 2), 'utf-8');
  fs.copyFileSync(metricsJsonPath, path.join(ARTIFACT_DIR, 'modnet_experiment_metrics.json'));

  // ---------------------------------------------------------------------------
  // PACKAGE DELIVERABLES ZIP
  // ---------------------------------------------------------------------------
  console.log('\nPackaging experiment deliverables into v1.7_modnet_experiment.zip...');
  const zip = new JSZip();

  function addDirToZip(dirPath: string, zipFolder: JSZip) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = zipFolder.folder(entry.name);
        if (sub) addDirToZip(fullPath, sub);
      } else if (entry.isFile() && !entry.name.endsWith('.zip')) {
        zipFolder.file(entry.name, fs.readFileSync(fullPath));
      }
    }
  }

  addDirToZip(OUTPUT_BASE, zip);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const zipOutputPath = path.join(PROJECT_ROOT, 'docs/v1.7_matting_investigation/v1.7_modnet_experiment.zip');
  fs.writeFileSync(zipOutputPath, zipBuffer);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'v1.7_modnet_experiment.zip'), zipBuffer);

  console.log(`Experiment ZIP generated: ${zipOutputPath} (${(zipBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  console.log('================================================================');
  console.log('MODNET EXPERIMENT COMPLETED SUCCESSFULLY');
  console.log('================================================================');
}

runModnetComparison().catch(err => {
  console.error('Experiment failed with error:', err);
  process.exit(1);
});
