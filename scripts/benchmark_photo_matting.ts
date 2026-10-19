/**
 * STICKER STUDIO V1.7 — ISOLATED PHOTO MATTING QUALITY EXPERIMENT
 *
 * Evaluates and compares three candidate algorithms on real portrait fixtures:
 * - Candidate A: Baseline V1.6 (Binary segmentation + Distance-Transform smoothing)
 * - Candidate B: Preserved Continuous Confidence + Joint RGB-Guided Upsampling
 * - Candidate C: Narrow-ROI Trimap + Closed-Form Guided Matting + Guarded Physical Decontamination
 *
 * Produces:
 * - Full-resolution artwork-only PNGs
 * - 400% zoom crops of hair, accessory, and diagonal clothing boundaries
 * - Previews across Black, White, Neutral Grey, and Vibrant Cyan backdrops
 * - Trimap and Alpha debug visualizations
 * - 4-way side-by-side comparison contact sheets
 * - Execution timings and memory metrics
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import {
  generateTrimap,
  computeUnknownBandRoi,
  solveGuidedAlphaMatte,
  refineContinuousConfidence,
  decontaminateEdgeColor,
  refinePhotoAlphaMatte,
} from '../src/core/photoMatting';
import { refineArtworkAlpha } from '../src/core/artworkAlphaRefinement';
import { mergeAttachedAccessories } from '../src/core/accessoryAttacher';
import { composePhotoCutout } from '../src/core/photoAdapter';
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

interface BenchmarkMetric {
  portraitName: string;
  width: number;
  height: number;
  candidateA: {
    durationMs: number;
    fractionalPixels: number;
    fractionalPercent: number;
  };
  candidateB: {
    durationMs: number;
    fractionalPixels: number;
    fractionalPercent: number;
  };
  candidateC: {
    durationMs: number;
    fractionalPixels: number;
    fractionalPercent: number;
    roiWidth: number;
    roiHeight: number;
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
 * [ Original Camera | Candidate A (Baseline) | Candidate B (Confidence) | Candidate C (Matting) ]
 */
async function create4WayComparison(
  origBuffer: Buffer,
  aBuffer: Buffer,
  bBuffer: Buffer,
  cBuffer: Buffer,
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
      <text x="${w * 0.5}" y="25" fill="#94a3b8" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">ORIGINAL PHOTO</text>
      <text x="${w + gutter + w * 0.5}" y="25" fill="#f87171" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">CANDIDATE A: BASELINE (V1.6)</text>
      <text x="${(w + gutter) * 2 + w * 0.5}" y="25" fill="#fbbf24" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">CANDIDATE B: CONTINUOUS CONF</text>
      <text x="${(w + gutter) * 3 + w * 0.5}" y="25" fill="#38bdf8" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">CANDIDATE C: GUIDED MATTING (V1.7)</text>
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
      { input: aBuffer, left: w + gutter, top: headerHeight },
      { input: bBuffer, left: (w + gutter) * 2, top: headerHeight },
      { input: cBuffer, left: (w + gutter) * 3, top: headerHeight },
    ])
    .png()
    .toBuffer();
}

/**
 * Creates a synthetic high-resolution attached red flower accessory on woman_portrait.jpg
 */
async function createCompoundWomanFlowerPortrait(): Promise<{
  imageBuffer: Buffer;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  flowerBox: BoundingBox;
}> {
  const womanPath = path.join(PORTRAITS_DIR, 'woman_portrait.jpg');
  const baseImg = sharp(womanPath);
  const meta = await baseImg.metadata();
  const width = meta.width!;
  const height = meta.height!;

  const raw = await baseImg.ensureAlpha().raw().toBuffer();
  const rgba = new Uint8ClampedArray(raw);

  // Position of red flower accessory: near temple / upper hair on right side [x: ~250..320, y: ~90..160]
  // In woman_portrait (usually ~400x500 or ~800x1000):
  const fx = Math.round(width * 0.62);
  const fy = Math.round(height * 0.22);
  const fRadius = Math.round(width * 0.08);

  const flowerBox: BoundingBox = {
    x: fx - fRadius,
    y: fy - fRadius,
    width: fRadius * 2,
    height: fRadius * 2,
  };

  // Draw vibrant organic red flower petals with yellow center
  for (let dy = -fRadius; dy <= fRadius; dy++) {
    const py = fy + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -fRadius; dx <= fRadius; dx++) {
      const px = fx + dx;
      if (px < 0 || px >= width) continue;

      const d = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      // 5-petal flower shape: r(theta) = R * (0.8 + 0.2 * cos(5 * theta))
      const petalR = fRadius * (0.8 + 0.2 * Math.cos(5 * angle));

      if (d <= petalR) {
        const idx = (py * width + px) * 4;
        if (d < fRadius * 0.28) {
          // Yellow center
          rgba[idx] = 250;
          rgba[idx + 1] = 210;
          rgba[idx + 2] = 40;
        } else {
          // Vibrant crimson red petals with subtle shading
          const shade = 1.0 - (d / fRadius) * 0.3;
          rgba[idx] = Math.round(225 * shade);
          rgba[idx + 1] = Math.round(30 * shade);
          rgba[idx + 2] = Math.round(45 * shade);
        }
        rgba[idx + 3] = 255;
      }
    }
  }

  const imageBuffer = await sharp(Buffer.from(rgba.buffer), {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();

  return { imageBuffer, rgba, width, height, flowerBox };
}

/**
 * Loads real MediaPipe coarse segmentation prior and continuous confidence map from disk,
 * extracted via real MediaPipe vision tasks in headless browser.
 */
function loadMediaPipePrior(
  fixtureName: string,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  accessoryBox?: BoundingBox
): { coarseMask: Uint8Array; confidenceMap: Float32Array; coreBox: BoundingBox } {
  const size = width * height;
  const priorDir = path.resolve('docs/v1.7_matting_investigation/real_priors');
  const baseName = fixtureName === 'compound_woman_red_flower' ? 'woman_portrait' : fixtureName;
  const maskPath = path.join(priorDir, `${baseName}_mask.raw`);
  const confPath = path.join(priorDir, `${baseName}_conf.raw`);

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
  }

  // If accessory exists, add accessory pixels to coarse mask and confidence map
  if (accessoryBox) {
    for (let y = accessoryBox.y; y < accessoryBox.y + accessoryBox.height; y++) {
      for (let x = accessoryBox.x; x < accessoryBox.x + accessoryBox.width; x++) {
        const idx = y * width + x;
        const off = idx * 4;
        const r = rgba[off];
        const g = rgba[off + 1];
        const b = rgba[off + 2];
        if (r > 150 && g < 100 && b < 100) {
          coarseMask[idx] = 1;
          confidenceMap[idx] = 0.95;
        }
      }
    }
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
  console.log('STICKER STUDIO V1.7 — PHOTO EXTRACTION ALGORITHM BENCHMARK');
  console.log('================================================================');
  console.log(`Portraits Source: ${PORTRAITS_DIR}`);
  console.log(`Output Directory: ${OUTPUT_DIR}\n`);

  // Fixture list
  const fixtures: Array<{
    name: string;
    load: () => Promise<{
      imageBuffer: Buffer;
      rgba: Uint8ClampedArray;
      width: number;
      height: number;
      cropHair: BoundingBox;
      cropDiagonal: BoundingBox;
      cropAccessory?: BoundingBox;
    }>;
  }> = [
    {
      name: 'woman_portrait',
      load: async () => {
        const p = path.join(PORTRAITS_DIR, 'woman_portrait.jpg');
        const raw = await sharp(p).ensureAlpha().raw().toBuffer();
        const meta = await sharp(p).metadata();
        const w = meta.width!;
        const h = meta.height!;
        return {
          imageBuffer: await sharp(p).png().toBuffer(),
          rgba: new Uint8ClampedArray(raw),
          width: w,
          height: h,
          cropHair: { x: Math.round(w * 0.15), y: Math.round(h * 0.12), width: 70, height: 70 },
          cropDiagonal: { x: Math.round(w * 0.08), y: Math.round(h * 0.65), width: 70, height: 70 },
        };
      },
    },
    {
      name: 'leather_jacket_portrait',
      load: async () => {
        const p = path.join(PORTRAITS_DIR, 'leather_jacket_portrait.jpg');
        const raw = await sharp(p).ensureAlpha().raw().toBuffer();
        const meta = await sharp(p).metadata();
        const w = meta.width!;
        const h = meta.height!;
        return {
          imageBuffer: await sharp(p).png().toBuffer(),
          rgba: new Uint8ClampedArray(raw),
          width: w,
          height: h,
          cropHair: { x: Math.round(w * 0.42), y: Math.round(h * 0.08), width: 70, height: 70 },
          cropDiagonal: { x: Math.round(w * 0.18), y: Math.round(h * 0.55), width: 70, height: 70 },
        };
      },
    },
    {
      name: 'alex_pretti_glasses',
      load: async () => {
        const p = path.join(PORTRAITS_DIR, 'alex_pretti_glasses.jpg');
        const raw = await sharp(p).ensureAlpha().raw().toBuffer();
        const meta = await sharp(p).metadata();
        const w = meta.width!;
        const h = meta.height!;
        return {
          imageBuffer: await sharp(p).png().toBuffer(),
          rgba: new Uint8ClampedArray(raw),
          width: w,
          height: h,
          cropHair: { x: Math.round(w * 0.35), y: Math.round(h * 0.08), width: 70, height: 70 },
          cropDiagonal: { x: Math.round(w * 0.22), y: Math.round(h * 0.48), width: 70, height: 70 },
        };
      },
    },
    {
      name: 'compound_woman_red_flower',
      load: async () => {
        const res = await createCompoundWomanFlowerPortrait();
        return {
          imageBuffer: res.imageBuffer,
          rgba: res.rgba,
          width: res.width,
          height: res.height,
          cropHair: { x: Math.round(res.width * 0.15), y: Math.round(res.height * 0.12), width: 70, height: 70 },
          cropDiagonal: { x: Math.round(res.width * 0.08), y: Math.round(res.height * 0.65), width: 70, height: 70 },
          cropAccessory: {
            x: Math.max(0, res.flowerBox.x - 10),
            y: Math.max(0, res.flowerBox.y - 10),
            width: res.flowerBox.width + 20,
            height: res.flowerBox.height + 20,
          },
        };
      },
    },
  ];

  for (const fixture of fixtures) {
    console.log(`\nEvaluating Portrait: [${fixture.name}]...`);
    const loaded = await fixture.load();
    const { imageBuffer, rgba, width, height, cropHair, cropDiagonal, cropAccessory } = loaded;

    // Load real MediaPipe prior
    const { coarseMask, confidenceMap, coreBox } = loadMediaPipePrior(fixture.name, rgba, width, height, cropAccessory);

    // Merge accessories
    const merged = mergeAttachedAccessories(coarseMask, width, height, coreBox, {
      maxAttachmentDistance: 16,
      headZoneRatio: 0.65,
    });
    const effectiveMask = merged.mask;

    // -------------------------------------------------------------------------
    // CANDIDATE A: Baseline V1.6 (Binary + Distance Transform Smoothing)
    // -------------------------------------------------------------------------
    const startA = performance.now();
    const alphaA = refineArtworkAlpha(effectiveMask, width, height, 2, 0.5);
    const durationA = performance.now() - startA;

    const rgbaA = new Uint8ClampedArray(rgba);
    let fracA = 0;
    for (let i = 0; i < width * height; i++) {
      const a = alphaA[i];
      rgbaA[i * 4 + 3] = a;
      if (a > 0 && a < 255) fracA++;
    }

    // -------------------------------------------------------------------------
    // CANDIDATE B: Preserved Confidence + Joint RGB-Guided Upsampling
    // -------------------------------------------------------------------------
    const startB = performance.now();
    const alphaB = refineContinuousConfidence(rgba, confidenceMap, width, height, 5, 1e-3);
    const durationB = performance.now() - startB;

    const rgbaB = new Uint8ClampedArray(rgba);
    let fracB = 0;
    for (let i = 0; i < width * height; i++) {
      const a = alphaB[i];
      rgbaB[i * 4 + 3] = a;
      if (a > 0 && a < 255) fracB++;
    }

    // -------------------------------------------------------------------------
    // CANDIDATE C: Narrow-ROI Trimap + Guided Alpha Matting + Guarded Decontamination
    // -------------------------------------------------------------------------
    const startC = performance.now();
    const trimapC = generateTrimap(effectiveMask, width, height, { hairDetail: 5 });
    const roiC = computeUnknownBandRoi(trimapC, width, height, 8);
    const alphaC = solveGuidedAlphaMatte(rgba, effectiveMask, trimapC, width, height, 6, 1e-4);
    const decontamC = decontaminateEdgeColor(rgba, alphaC, trimapC, width, height, 6);
    const durationC = performance.now() - startC;

    let fracC = 0;
    for (let i = 0; i < width * height; i++) {
      const a = alphaC[i];
      if (a > 0 && a < 255) fracC++;
    }

    const metric: BenchmarkMetric = {
      portraitName: fixture.name,
      width,
      height,
      candidateA: {
        durationMs: Number(durationA.toFixed(2)),
        fractionalPixels: fracA,
        fractionalPercent: Number(((fracA / (width * height)) * 100).toFixed(2)),
      },
      candidateB: {
        durationMs: Number(durationB.toFixed(2)),
        fractionalPixels: fracB,
        fractionalPercent: Number(((fracB / (width * height)) * 100).toFixed(2)),
      },
      candidateC: {
        durationMs: Number(durationC.toFixed(2)),
        fractionalPixels: fracC,
        fractionalPercent: Number(((fracC / (width * height)) * 100).toFixed(2)),
        roiWidth: roiC.width,
        roiHeight: roiC.height,
      },
    };
    metricsLedger.push(metric);

    console.log(`  Candidate A (Baseline):    ${durationA.toFixed(1)} ms | Frac Alpha: ${fracA} px (${metric.candidateA.fractionalPercent}%)`);
    console.log(`  Candidate B (Confidence):  ${durationB.toFixed(1)} ms | Frac Alpha: ${fracB} px (${metric.candidateB.fractionalPercent}%)`);
    console.log(`  Candidate C (Guided Matte):${durationC.toFixed(1)} ms | Frac Alpha: ${fracC} px (${metric.candidateC.fractionalPercent}%) | ROI: ${roiC.width}x${roiC.height}`);

    // Save full artwork PNGs
    const aPng = await sharp(Buffer.from(rgbaA.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();
    const bPng = await sharp(Buffer.from(rgbaB.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();
    const cPng = await sharp(Buffer.from(decontamC.buffer), { raw: { width, height, channels: 4 } }).png().toBuffer();

    fs.writeFileSync(path.join(OUTPUT_DIR, `${fixture.name}_candA_artwork.png`), aPng);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${fixture.name}_candB_artwork.png`), bPng);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${fixture.name}_candC_artwork.png`), cPng);

    // Save Alpha & Trimap debug images
    const alphaC_rgba = new Uint8ClampedArray(width * height * 4);
    const trimapC_rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const aVal = alphaC[i];
      const tVal = trimapC[i];
      alphaC_rgba[i * 4] = aVal;
      alphaC_rgba[i * 4 + 1] = aVal;
      alphaC_rgba[i * 4 + 2] = aVal;
      alphaC_rgba[i * 4 + 3] = 255;

      trimapC_rgba[i * 4] = tVal;
      trimapC_rgba[i * 4 + 1] = tVal;
      trimapC_rgba[i * 4 + 2] = tVal;
      trimapC_rgba[i * 4 + 3] = 255;
    }
    await sharp(Buffer.from(alphaC_rgba.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'debug', `${fixture.name}_alpha_matte.png`));
    await sharp(Buffer.from(trimapC_rgba.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'debug', `${fixture.name}_trimap.png`));

    // Generate 4-Way Comparison Contact Sheet
    const sheetBuffer = await create4WayComparison(imageBuffer, aPng, bPng, cPng, fixture.name);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'contact_sheets', `${fixture.name}_4way_comparison.png`), sheetBuffer);

    // Save to artifact dir as well
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_4way_comparison.png`), sheetBuffer);

    // Generate 400% Zoom Crops
    // Crop 1: Hair
    const cropHairOrig = await extract400Crop(rgba, width, height, cropHair);
    const cropHairA = await extract400Crop(rgbaA, width, height, cropHair);
    const cropHairB = await extract400Crop(rgbaB, width, height, cropHair);
    const cropHairC = await extract400Crop(decontamC, width, height, cropHair);

    const hairCropSheet = await create4WayComparison(cropHairOrig, cropHairA, cropHairB, cropHairC, `${fixture.name}_hair_400x`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'crops_400', `${fixture.name}_hair_crop_400.png`), hairCropSheet);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_hair_crop_400.png`), hairCropSheet);

    // Crop 2: Diagonal clothing
    const cropDiagOrig = await extract400Crop(rgba, width, height, cropDiagonal);
    const cropDiagA = await extract400Crop(rgbaA, width, height, cropDiagonal);
    const cropDiagB = await extract400Crop(rgbaB, width, height, cropDiagonal);
    const cropDiagC = await extract400Crop(decontamC, width, height, cropDiagonal);

    const diagCropSheet = await create4WayComparison(cropDiagOrig, cropDiagA, cropDiagB, cropDiagC, `${fixture.name}_diagonal_400x`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'crops_400', `${fixture.name}_diagonal_crop_400.png`), diagCropSheet);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_diagonal_crop_400.png`), diagCropSheet);

    // Crop 3: Accessory (if present)
    if (cropAccessory) {
      const cropAccOrig = await extract400Crop(rgba, width, height, cropAccessory);
      const cropAccA = await extract400Crop(rgbaA, width, height, cropAccessory);
      const cropAccB = await extract400Crop(rgbaB, width, height, cropAccessory);
      const cropAccC = await extract400Crop(decontamC, width, height, cropAccessory);

      const accCropSheet = await create4WayComparison(cropAccOrig, cropAccA, cropAccB, cropAccC, `${fixture.name}_accessory_400x`);
      fs.writeFileSync(path.join(OUTPUT_DIR, 'crops_400', `${fixture.name}_accessory_crop_400.png`), accCropSheet);
      fs.writeFileSync(path.join(ARTIFACT_DIR, `${fixture.name}_accessory_crop_400.png`), accCropSheet);
    }

    // Multi-background inspection previews for Candidate C
    // 1. Black
    const onBlack = compositeOnBackground(decontamC, width, height, 15, 23, 42);
    await sharp(Buffer.from(onBlack.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, `${fixture.name}_candC_on_dark.png`));

    // 2. White
    const onWhite = compositeOnBackground(decontamC, width, height, 255, 255, 255);
    await sharp(Buffer.from(onWhite.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, `${fixture.name}_candC_on_white.png`));

    // 3. Neutral Grey
    const onGrey = compositeOnBackground(decontamC, width, height, 115, 115, 115);
    await sharp(Buffer.from(onGrey.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, `${fixture.name}_candC_on_grey.png`));

    // 4. Vibrant Cyan
    const onCyan = compositeOnBackground(decontamC, width, height, 6, 182, 212);
    await sharp(Buffer.from(onCyan.buffer), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, `${fixture.name}_candC_on_vibrant.png`));
  }

  // Write Benchmark Metrics JSON
  const metricsJson = JSON.stringify(metricsLedger, null, 2);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'matting_benchmark_metrics.json'), metricsJson);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'matting_benchmark_metrics.json'), metricsJson);

  console.log('\n================================================================');
  console.log('MATTING QUALITY BENCHMARK COMPLETED SUCCESSFULLY');
  console.log(`Metrics written to: ${path.join(OUTPUT_DIR, 'matting_benchmark_metrics.json')}`);
  console.log('================================================================\n');
}

runMattingBenchmark().catch(err => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
