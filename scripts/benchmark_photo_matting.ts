/**
 * STICKER STUDIO V1.7 — REAL PHOTO MATTING QUALITY BENCHMARK
 *
 * Compares the three production quality modes:
 * - FAST (V1.6 Baseline: binary mask + distance transform smoothing)
 * - BETTER (V1.7 Guided RGB Alpha Matting, no decontamination)
 * - BEST (V1.7 Guided RGB Alpha Matting + Guarded Edge Color Decontamination)
 *
 * All priors are genuine MediaPipe selfie segmentation confidence maps & masks
 * extracted directly from the actual image pixels with ZERO manual confidence injection.
 *
 * Produces:
 * - Full-resolution artwork-only PNGs for Fast, Better, and Best
 * - 400% zoom crops of hair, accessory, and diagonal clothing boundaries on Black, White, Grey, and Cyan
 * - Alpha matte and Trimap debug PNGs
 * - 4-way side-by-side comparison contact sheets
 * - Wall-clock timings and pixel metrics JSON
 * - Bundled v1.7_matting_visual_review.zip archive
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import JSZip from 'jszip';
import {
  generateTrimap,
  computeUnknownBandRoi,
  solveGuidedAlphaMatte,
  decontaminateEdgeColor,
  refinePhotoAlphaMatte,
} from '../src/core/photoMatting';
import { refineArtworkAlpha } from '../src/core/artworkAlphaRefinement';
import { mergeAttachedAccessories } from '../src/core/accessoryAttacher';
import { BoundingBox } from '../src/types/index';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');

const PORTRAITS_DIR = path.resolve('test-output/actual_portraits');
const OUTPUT_DIR = path.resolve('docs/v1.7_matting_investigation');
const ARTIFACT_DIR = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, 'crops_400'), { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, 'contact_sheets'), { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, 'debug'), { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, 'full_exports'), { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, 'backdrops'), { recursive: true });

export interface BenchmarkMetric {
  portraitName: string;
  width: number;
  height: number;
  fast: {
    durationMs: number;
    fractionalPixels: number;
    fractionalPercent: number;
  };
  better: {
    durationMs: number;
    fractionalPixels: number;
    fractionalPercent: number;
  };
  best: {
    durationMs: number;
    fractionalPixels: number;
    fractionalPercent: number;
    roiWidth: number;
    roiHeight: number;
    roiFractionPercent: number;
  };
}

const metricsLedger: BenchmarkMetric[] = [];

/**
 * Composites an RGBA buffer over a solid background color.
 */
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

/**
 * Extracts a region of interest and enlarges it by 4x using nearest-neighbor / clean scaling.
 */
async function extract400Crop(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cropBox: BoundingBox
): Promise<Buffer> {
  const cropped = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
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

  return cropped;
}

/**
 * Creates a 4-way side-by-side comparison image:
 * [ ORIGINAL PHOTO | FAST (V1.6) | BETTER (GUIDED MATTE) | BEST (MATTE + DECONTAM) ]
 */
async function create4WayComparison(
  origBuffer: Buffer,
  fastBuffer: Buffer,
  betterBuffer: Buffer,
  bestBuffer: Buffer,
  label: string
): Promise<Buffer> {
  const meta = await sharp(origBuffer).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const gutter = 10;
  const headerHeight = 40;
  const totalW = w * 4 + gutter * 3;
  const totalH = h + headerHeight;

  const svgBanner = `
    <svg width="${totalW}" height="${headerHeight}">
      <rect width="100%" height="100%" fill="#0f172a" />
      <text x="${w * 0.5}" y="25" fill="#94a3b8" font-size="15" font-family="sans-serif" font-weight="bold" text-anchor="middle">ORIGINAL PHOTO</text>
      <text x="${w + gutter + w * 0.5}" y="25" fill="#f87171" font-size="15" font-family="sans-serif" font-weight="bold" text-anchor="middle">FAST (V1.6 BASELINE)</text>
      <text x="${(w + gutter) * 2 + w * 0.5}" y="25" fill="#fbbf24" font-size="15" font-family="sans-serif" font-weight="bold" text-anchor="middle">BETTER (GUIDED MATTE)</text>
      <text x="${(w + gutter) * 3 + w * 0.5}" y="25" fill="#38bdf8" font-size="15" font-family="sans-serif" font-weight="bold" text-anchor="middle">BEST (MATTE + DECONTAM)</text>
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
    ])
    .png()
    .toBuffer();
}

/**
 * Loads real MediaPipe coarse segmentation prior and continuous confidence map from disk.
 * 100% genuine model output — zero manual confidence injection.
 */
function loadMediaPipePrior(
  fixtureName: string,
  width: number,
  height: number
): { coarseMask: Uint8Array; confidenceMap: Float32Array; coreBox: BoundingBox } {
  const size = width * height;
  const priorDir = path.resolve('docs/v1.7_matting_investigation/real_priors');
  const maskPath = path.join(priorDir, `${fixtureName}_mask.raw`);
  const confPath = path.join(priorDir, `${fixtureName}_conf.raw`);

  let coarseMask = new Uint8Array(size);
  let confidenceMap = new Float32Array(size);

  if (fs.existsSync(maskPath) && fs.existsSync(confPath)) {
    const rawMask = fs.readFileSync(maskPath);
    const rawConf = fs.readFileSync(confPath);
    if (rawMask.byteLength === size) {
      coarseMask.set(rawMask);
    }
    if (rawConf.byteLength === size * 4) {
      confidenceMap = new Float32Array(rawConf.buffer, rawConf.byteOffset, size);
    }
  } else {
    throw new Error(`Real MediaPipe priors not found for ${fixtureName} at ${priorDir}`);
  }

  // Calculate subject core box from mask
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (coarseMask[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const coreBox: BoundingBox = {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };

  return { coarseMask, confidenceMap, coreBox };
}

/**
 * Main Benchmark Runner
 */
async function runMattingBenchmark() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.7 — REAL PHOTO MATTING QUALITY BENCHMARK');
  console.log('================================================================\n');

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
      cropAccessory: { x: 440, y: 160, width: 140, height: 140 },
    },
  ];

  for (const fixture of fixtures) {
    console.log(`\nEvaluating Portrait: [${fixture.name}]...`);
    const imgSharp = sharp(fixture.file);
    const meta = await imgSharp.metadata();
    const width = meta.width!;
    const height = meta.height!;
    const rawRgba = await imgSharp.ensureAlpha().raw().toBuffer();
    const rgba = new Uint8ClampedArray(rawRgba);
    const origBuffer = await imgSharp.png().toBuffer();

    // 1. Load genuine MediaPipe prior (no manual confidence injection)
    const { coarseMask, confidenceMap, coreBox } = loadMediaPipePrior(fixture.name, width, height);

    // 2. Accessory attachment (evaluates head zone candidates without artificial bridges)
    const merged = mergeAttachedAccessories(coarseMask, width, height, coreBox, {
      protectedBoxes: [coreBox],
      confidenceMap,
      maxAttachmentDistance: 16,
      headZoneRatio: 0.65,
    });
    const effectiveMask = merged.mask;

    // -------------------------------------------------------------------------
    // FAST MODE: Baseline V1.6 (Distance Transform Smoothing, no guided solver)
    // -------------------------------------------------------------------------
    const tFast0 = performance.now();
    const alphaFast = refineArtworkAlpha(effectiveMask, width, height, 2, 0.5);
    const durationFast = performance.now() - tFast0;

    const rgbaFast = new Uint8ClampedArray(rgba);
    let fracFast = 0;
    for (let i = 0; i < width * height; i++) {
      const a = alphaFast[i];
      rgbaFast[i * 4 + 3] = a;
      if (a > 0 && a < 255) fracFast++;
    }

    // -------------------------------------------------------------------------
    // BETTER MODE: Guided RGB Matting (No Decontamination)
    // -------------------------------------------------------------------------
    const tBetter0 = performance.now();
    const mattingBetter = refinePhotoAlphaMatte(rgba, effectiveMask, width, height, {
      qualityMode: 'better',
      decontaminateEdge: false,
      hairDetail: 5,
      confidenceMap,
    });
    const durationBetter = performance.now() - tBetter0;
    const alphaBetter = mattingBetter.alpha;

    const rgbaBetter = new Uint8ClampedArray(rgba);
    let fracBetter = 0;
    for (let i = 0; i < width * height; i++) {
      const a = alphaBetter[i];
      rgbaBetter[i * 4 + 3] = a;
      if (a > 0 && a < 255) fracBetter++;
    }

    // -------------------------------------------------------------------------
    // BEST MODE: Guided RGB Matting + Guarded Edge Color Decontamination
    // -------------------------------------------------------------------------
    const tBest0 = performance.now();
    const mattingBest = refinePhotoAlphaMatte(rgba, effectiveMask, width, height, {
      qualityMode: 'best',
      decontaminateEdge: true,
      hairDetail: 5,
      confidenceMap,
    });
    const durationBest = performance.now() - tBest0;
    const alphaBest = mattingBest.alpha;
    const decontamRgba = mattingBest.decontaminatedRgba ?? rgba;

    const rgbaBest = new Uint8ClampedArray(decontamRgba);
    let fracBest = 0;
    for (let i = 0; i < width * height; i++) {
      const a = alphaBest[i];
      rgbaBest[i * 4 + 3] = a;
      if (a > 0 && a < 255) fracBest++;
    }

    const roi = mattingBest.roi ?? { x: 0, y: 0, width, height };
    const roiArea = roi.width * roi.height;
    const totalArea = width * height;

    const metric: BenchmarkMetric = {
      portraitName: fixture.name,
      width,
      height,
      fast: {
        durationMs: Number(durationFast.toFixed(2)),
        fractionalPixels: fracFast,
        fractionalPercent: Number(((fracFast / totalArea) * 100).toFixed(2)),
      },
      better: {
        durationMs: Number(durationBetter.toFixed(2)),
        fractionalPixels: fracBetter,
        fractionalPercent: Number(((fracBetter / totalArea) * 100).toFixed(2)),
      },
      best: {
        durationMs: Number(durationBest.toFixed(2)),
        fractionalPixels: fracBest,
        fractionalPercent: Number(((fracBest / totalArea) * 100).toFixed(2)),
        roiWidth: roi.width,
        roiHeight: roi.height,
        roiFractionPercent: Number(((roiArea / totalArea) * 100).toFixed(2)),
      },
    };
    metricsLedger.push(metric);

    console.log(`  Fast (V1.6 Baseline):       ${durationFast.toFixed(1)} ms | Frac Alpha: ${fracFast} px (${metric.fast.fractionalPercent}%)`);
    console.log(`  Better (Guided Matte):     ${durationBetter.toFixed(1)} ms | Frac Alpha: ${fracBetter} px (${metric.better.fractionalPercent}%)`);
    console.log(`  Best (Matte + Decontam):   ${durationBest.toFixed(1)} ms | Frac Alpha: ${fracBest} px (${metric.best.fractionalPercent}%) | ROI: ${roi.width}x${roi.height} (${metric.best.roiFractionPercent}% frame)`);

    // Save full artwork exports
    const fastPng = await sharp(Buffer.from(rgbaFast.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();
    const betterPng = await sharp(Buffer.from(rgbaBetter.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();
    const bestPng = await sharp(Buffer.from(rgbaBest.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();

    fs.writeFileSync(path.join(OUTPUT_DIR, 'full_exports', `${fixture.name}_fast_export.png`), fastPng);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'full_exports', `${fixture.name}_better_export.png`), betterPng);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'full_exports', `${fixture.name}_best_export.png`), bestPng);

    // Save Alpha Matte & Trimap grayscale PNGs
    const alphaBestGrayscale = new Uint8ClampedArray(width * height * 4);
    const trimapBestGrayscale = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const a = alphaBest[i];
      const t = mattingBest.trimap[i];
      const s = i * 4;
      alphaBestGrayscale[s] = a;
      alphaBestGrayscale[s + 1] = a;
      alphaBestGrayscale[s + 2] = a;
      alphaBestGrayscale[s + 3] = 255;

      trimapBestGrayscale[s] = t;
      trimapBestGrayscale[s + 1] = t;
      trimapBestGrayscale[s + 2] = t;
      trimapBestGrayscale[s + 3] = 255;
    }

    await sharp(Buffer.from(alphaBestGrayscale.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'debug', `${fixture.name}_alpha_matte.png`));

    await sharp(Buffer.from(trimapBestGrayscale.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'debug', `${fixture.name}_trimap.png`));

    // Save 4-Way Comparison Contact Sheet
    const contactSheetBuffer = await create4WayComparison(origBuffer, fastPng, betterPng, bestPng, fixture.name);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'contact_sheets', `${fixture.name}_4way_comparison.png`), contactSheetBuffer);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_4way_comparison.png`), contactSheetBuffer);

    // Generate 400% Zoom Crops
    // Crop 1: Hair
    const cropHairOrig = await extract400Crop(rgba, width, height, fixture.cropHair);
    const cropHairFast = await extract400Crop(rgbaFast, width, height, fixture.cropHair);
    const cropHairBetter = await extract400Crop(rgbaBetter, width, height, fixture.cropHair);
    const cropHairBest = await extract400Crop(rgbaBest, width, height, fixture.cropHair);
    const hairSheet = await create4WayComparison(cropHairOrig, cropHairFast, cropHairBetter, cropHairBest, `${fixture.name}_hair_400x`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'crops_400', `${fixture.name}_hair_crop_400.png`), hairSheet);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_hair_crop_400.png`), hairSheet);

    // Crop 2: Diagonal contour
    const cropDiagOrig = await extract400Crop(rgba, width, height, fixture.cropDiagonal);
    const cropDiagFast = await extract400Crop(rgbaFast, width, height, fixture.cropDiagonal);
    const cropDiagBetter = await extract400Crop(rgbaBetter, width, height, fixture.cropDiagonal);
    const cropDiagBest = await extract400Crop(rgbaBest, width, height, fixture.cropDiagonal);
    const diagSheet = await create4WayComparison(cropDiagOrig, cropDiagFast, cropDiagBetter, cropDiagBest, `${fixture.name}_diagonal_400x`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'crops_400', `${fixture.name}_diagonal_crop_400.png`), diagSheet);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_diagonal_crop_400.png`), diagSheet);

    // Crop 3: Accessory (if present)
    if (fixture.cropAccessory) {
      const cropAccOrig = await extract400Crop(rgba, width, height, fixture.cropAccessory);
      const cropAccFast = await extract400Crop(rgbaFast, width, height, fixture.cropAccessory);
      const cropAccBetter = await extract400Crop(rgbaBetter, width, height, fixture.cropAccessory);
      const cropAccBest = await extract400Crop(rgbaBest, width, height, fixture.cropAccessory);
      const accSheet = await create4WayComparison(cropAccOrig, cropAccFast, cropAccBetter, cropAccBest, `${fixture.name}_accessory_400x`);
      fs.writeFileSync(path.join(OUTPUT_DIR, 'crops_400', `${fixture.name}_accessory_crop_400.png`), accSheet);
      fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_accessory_crop_400.png`), accSheet);
    }

    // Multi-background inspection previews for BEST mode:
    // 1. Black
    const onBlack = compositeOnBackground(rgbaBest, width, height, 0, 0, 0);
    await sharp(Buffer.from(onBlack.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'backdrops', `${fixture.name}_best_on_black.png`));

    // 2. White
    const onWhite = compositeOnBackground(rgbaBest, width, height, 255, 255, 255);
    await sharp(Buffer.from(onWhite.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'backdrops', `${fixture.name}_best_on_white.png`));

    // 3. Neutral Grey
    const onGrey = compositeOnBackground(rgbaBest, width, height, 128, 128, 128);
    await sharp(Buffer.from(onGrey.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'backdrops', `${fixture.name}_best_on_grey.png`));

    // 4. Vibrant Cyan
    const onCyan = compositeOnBackground(rgbaBest, width, height, 0, 255, 255);
    await sharp(Buffer.from(onCyan.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'backdrops', `${fixture.name}_best_on_cyan.png`));
  }

  // Write Benchmark Metrics JSON
  const metricsJson = JSON.stringify(metricsLedger, null, 2);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'matting_benchmark_metrics.json'), metricsJson);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'matting_benchmark_metrics.json'), metricsJson);

  // Bundle entire investigation directory into single review ZIP
  console.log('\nPackaging visual review deliverables into v1.7_matting_visual_review.zip...');
  const zip = new JSZip();

  function addDirToZip(zipFolder: JSZip, localDir: string) {
    const entries = fs.readdirSync(localDir);
    for (const entry of entries) {
      const fullPath = path.join(localDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const sub = zipFolder.folder(entry);
        if (sub) addDirToZip(sub, fullPath);
      } else if (!entry.endsWith('.zip')) {
        zipFolder.file(entry, fs.readFileSync(fullPath));
      }
    }
  }

  addDirToZip(zip, OUTPUT_DIR);
  const zipContent = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const zipPath = path.join(OUTPUT_DIR, 'v1.7_matting_visual_review.zip');
  fs.writeFileSync(zipPath, zipContent);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'v1.7_matting_visual_review.zip'), zipContent);

  console.log(`Review ZIP generated: ${zipPath} (${(zipContent.byteLength / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('================================================================');
  console.log('MATTING QUALITY BENCHMARK COMPLETED SUCCESSFULLY');
  console.log('================================================================\n');
}

runMattingBenchmark().catch(err => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
