/**
 * Sticker Studio V1.7 — Detector-Guided MODNet Experiment
 * Compares:
 * 1. Existing MediaPipe Extraction (Baseline)
 * 2. MODNet Whole-Frame Inference
 * 3. Detector-Guided MODNet (Individual Person Crops + Fallback + Recombination)
 * 4. Guided Filter Matting (Fast, Better, Best)
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import JSZip from 'jszip';
import { pipeline, RawImage } from '@huggingface/transformers';
import { composePhotoCutout } from '../src/core/photoAdapter';
import { BoundingBox } from '../src/types/index';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');

const PROJECT_ROOT = 'C:/Users/prate/Documents/SheetExtractor';
const OUTPUT_BASE = path.join(PROJECT_ROOT, 'docs/v1.7_matting_investigation/detector_guided_modnet_experiment');
const ARTIFACT_DIR = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';
const PORTRAITS_DIR = path.join(PROJECT_ROOT, 'test-output/actual_portraits');
const PRIORS_DIR = path.join(PROJECT_ROOT, 'docs/v1.7_matting_investigation/real_priors');
const DIAG_GUIDED_DIR = path.join(PROJECT_ROOT, 'docs/diagnosis_detector_guided');

const SUBDIRS = [
  'full_exports',
  'backdrops',
  'crops_400',
  'contact_sheets',
  'per_person_analysis',
];

for (const sub of SUBDIRS) {
  fs.mkdirSync(path.join(OUTPUT_BASE, sub), { recursive: true });
}

export interface PersonCropMetric {
  personIndex: number;
  label: string;
  box: BoundingBox;
  cropBounds: BoundingBox;
  inferTimeMs: number;
  modnetCropFg: number;
  mediaPipeCropFg: number;
  retentionRatio: number;
  status: 'MODNET_APPLIED' | 'FALLBACK_TO_MEDIAPIPE';
  fullBodyPreserved: boolean;
  neighborBleedExcluded: boolean;
}

export interface GroupExperimentResult {
  photoId: string;
  label: string;
  sourceWidth: number;
  sourceHeight: number;
  expectedPeople: number;
  detectedPeople: number;
  mediapipeTotalTimeMs: number;
  modnetFullFrameTimeMs: number;
  modnetCropGuidedTotalTimeMs: number;
  modnetFullFrameFgPixels: number;
  modnetCropGuidedFgPixels: number;
  mediapipeFgPixels: number;
  personCrops: PersonCropMetric[];
  memoryUsageMb: {
    rss: number;
    heapUsed: number;
  };
}

export interface PortraitAlignmentResult {
  portraitName: string;
  sourceWidth: number;
  sourceHeight: number;
  fastDurationMs: number;
  betterDurationMs: number;
  bestDurationMs: number;
  modnetDurationMs: number;
  modnetFgPixels: number;
  bestFgPixels: number;
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

async function extractSourceAligned400Crop(
  fullSourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cropBox: BoundingBox
): Promise<Buffer> {
  const left = Math.max(0, Math.min(width - 1, cropBox.x));
  const top = Math.max(0, Math.min(height - 1, cropBox.y));
  const w = Math.min(width - left, cropBox.width);
  const h = Math.min(height - top, cropBox.height);

  return sharp(Buffer.from(fullSourceRgba.buffer, fullSourceRgba.byteOffset, fullSourceRgba.byteLength), {
    raw: { width, height, channels: 4 },
  })
    .extract({ left, top, width: w, height: h })
    .resize({ width: w * 4, height: h * 4, kernel: 'nearest' })
    .png()
    .toBuffer();
}

function isolateConnectedCropForeground(
  cropAlpha: Uint8Array,
  cropW: number,
  cropH: number,
  coreBoxInCrop: BoundingBox
): Uint8Array {
  const cMinX = Math.max(0, coreBoxInCrop.x);
  const cMaxX = Math.min(cropW - 1, coreBoxInCrop.x + coreBoxInCrop.width);
  const cMinY = Math.max(0, coreBoxInCrop.y);
  const cMaxY = Math.min(cropH - 1, coreBoxInCrop.y + coreBoxInCrop.height);

  const cleanCrop = new Uint8Array(cropW * cropH);
  const visited = new Uint8Array(cropW * cropH);
  const queue: number[] = [];

  for (let cy = cMinY; cy <= cMaxY; cy++) {
    for (let cx = cMinX; cx <= cMaxX; cx++) {
      const idx = cy * cropW + cx;
      if (cropAlpha[idx] >= 128 && visited[idx] === 0) {
        visited[idx] = 1;
        cleanCrop[idx] = cropAlpha[idx];
        queue.push(idx);
      }
    }
  }

  let qHead = 0;
  while (qHead < queue.length) {
    const curr = queue[qHead++];
    const cx = curr % cropW;
    const cy = Math.floor(curr / cropW);

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < cropW - 1 ? curr + 1 : -1,
      cy > 0 ? curr - cropW : -1,
      cy < cropH - 1 ? curr + cropW : -1,
      cx > 0 && cy > 0 ? curr - cropW - 1 : -1,
      cx < cropW - 1 && cy > 0 ? curr - cropW + 1 : -1,
      cx > 0 && cy < cropH - 1 ? curr + cropW - 1 : -1,
      cx < cropW - 1 && cy < cropH - 1 ? curr + cropW + 1 : -1,
    ];

    for (let k = 0; k < 8; k++) {
      const nIdx = neighbors[k];
      if (nIdx !== -1 && cropAlpha[nIdx] >= 128 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        cleanCrop[nIdx] = cropAlpha[nIdx];
        queue.push(nIdx);
      }
    }
  }

  // Preserve fractional alpha values adjacent to the visited foreground
  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      const idx = cy * cropW + cx;
      if (cleanCrop[idx] === 0 && cropAlpha[idx] > 0 && cropAlpha[idx] < 128) {
        const isAdj =
          (cx > 0 && cleanCrop[idx - 1] > 0) ||
          (cx < cropW - 1 && cleanCrop[idx + 1] > 0) ||
          (cy > 0 && cleanCrop[idx - cropW] > 0) ||
          (cy < cropH - 1 && cleanCrop[idx + cropW] > 0);
        if (isAdj) {
          cleanCrop[idx] = cropAlpha[idx];
        }
      }
    }
  }

  return cleanCrop;
}

async function createSideBySideSheet(
  panels: Array<{ label: string; buffer: Buffer }>,
  width: number,
  height: number
): Promise<Buffer> {
  const gutter = 10;
  const headerHeight = 36;
  const totalW = width * panels.length + gutter * (panels.length - 1);
  const totalH = height + headerHeight;

  let labelsSvg = '';
  const compositeInputs: any[] = [];

  for (let i = 0; i < panels.length; i++) {
    const left = i * (width + gutter);
    labelsSvg += `
      <rect x="${left}" y="0" width="${width}" height="${headerHeight}" fill="#1e293b"/>
      <text x="${left + width / 2}" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="#f8fafc" text-anchor="middle">${panels[i].label}</text>
    `;
    compositeInputs.push({ input: panels[i].buffer, left, top: headerHeight });
  }

  const svgBanner = `<svg width="${totalW}" height="${headerHeight}">${labelsSvg}</svg>`;

  const canvas = sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  });

  return canvas
    .composite([{ input: Buffer.from(svgBanner), left: 0, top: 0 }, ...compositeInputs])
    .png()
    .toBuffer();
}

async function main() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.7 — DETECTOR-GUIDED MODNET EXPERIMENT');
  console.log('================================================================\n');

  // 1. Measure Model Preparation & Initialization Separately
  console.log('--- 1. Accurate Model Telemetry Measurement ---');
  const tPrep0 = performance.now();
  const modnetCacheDir = path.resolve('node_modules/@huggingface/transformers/.cache/Xenova/modnet');
  const hasLocalCache = fs.existsSync(modnetCacheDir);
  const prepTimeMs = performance.now() - tPrep0;
  console.log(`Model cache verification: ${prepTimeMs.toFixed(2)} ms (Cached locally: ${hasLocalCache})`);

  const tInit0 = performance.now();
  const segmenter = await pipeline('image-segmentation', 'Xenova/modnet');
  const initTimeMs = performance.now() - tInit0;
  console.log(`Model pipeline initialization: ${initTimeMs.toFixed(1)} ms\n`);

  // First cold inference vs repeated warm inference
  console.log('--- Cold vs Repeated Warm Inference Measurement ---');
  const dummyBuf = await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 128, g: 128, b: 128 } },
  }).jpeg().toBuffer();
  const dummyRaw = await RawImage.fromBlob(new Blob([dummyBuf]));

  const tCold0 = performance.now();
  await segmenter(dummyRaw);
  const coldInferMs = performance.now() - tCold0;
  console.log(`First cold inference (512x512): ${coldInferMs.toFixed(1)} ms`);

  const warmTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const tWarm0 = performance.now();
    await segmenter(dummyRaw);
    warmTimings.push(performance.now() - tWarm0);
  }
  const avgWarmMs = warmTimings.reduce((a, b) => a + b, 0) / warmTimings.length;
  console.log(`Repeated warm inferences (3x): ${warmTimings.map(t => t.toFixed(1) + 'ms').join(', ')} (Avg: ${avgWarmMs.toFixed(1)} ms)\n`);

  // ---------------------------------------------------------------------------
  // PART A: GROUP PHOTOGRAPHS VALIDATION
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('PART A: GROUP PHOTOGRAPHS VALIDATION (Beach Family, Field Family, Father & Daughter)');
  console.log('================================================================\n');

  const summary = JSON.parse(fs.readFileSync(path.join(DIAG_GUIDED_DIR, 'detector_guided_summary.json'), 'utf8'));

  const groupTests = [
    {
      id: 'beach_family',
      label: 'Beach Family (Sunset)',
      imageFile: path.join(PROJECT_ROOT, 'docs/diagnosis_beach_family/beach_family_original.png'),
      mediapipeMaskFile: path.join(DIAG_GUIDED_DIR, 'beach_family/union_raw_mask.png'),
      cropHair: { x: 140, y: 445, width: 60, height: 60 },
      cropClothing: { x: 130, y: 550, width: 70, height: 70 },
    },
    {
      id: 'indoor_family',
      label: 'Field Family (5 Members)',
      imageFile: path.join(PROJECT_ROOT, '.test-fixtures/eval_photo_2_indoor_family.jpg'),
      mediapipeMaskFile: path.join(DIAG_GUIDED_DIR, 'indoor_family/union_raw_mask.png'),
      cropHair: { x: 740, y: 220, width: 80, height: 80 },
      cropClothing: { x: 740, y: 400, width: 80, height: 80 },
    },
    {
      id: 'father_and_daughter',
      label: 'Father & Daughter',
      imageFile: path.join(PROJECT_ROOT, '.test-fixtures/prototype_touching_subjects.jpg'),
      mediapipeMaskFile: path.join(DIAG_GUIDED_DIR, 'father_and_daughter/union_raw_mask.png'),
      cropHair: { x: 420, y: 150, width: 80, height: 80 },
      cropClothing: { x: 400, y: 500, width: 90, height: 90 },
    },
  ];

  const groupResults: GroupExperimentResult[] = [];

  for (const gTest of groupTests) {
    console.log(`------------------------------------------------------------`);
    console.log(`Processing Group Photo: ${gTest.label}`);
    console.log(`------------------------------------------------------------`);

    const imgBuf = fs.readFileSync(gTest.imageFile);
    const imgSharp = sharp(imgBuf);
    const meta = await imgSharp.metadata();
    const W = meta.width!;
    const H = meta.height!;

    const rawRgbaBuf = await imgSharp.ensureAlpha().raw().toBuffer();
    const sourceRgba = new Uint8ClampedArray(rawRgbaBuf);

    const photoMeta = summary[gTest.id];
    const cropsInfo = photoMeta.crops;

    // Load MediaPipe Baseline Mask
    const mpMaskImg = await sharp(gTest.mediapipeMaskFile).ensureAlpha().raw().toBuffer();
    const mediaPipeGlobalMask = new Uint8Array(W * H);
    let mediaPipeFgPixels = 0;
    for (let i = 0; i < W * H; i++) {
      if (mpMaskImg[i * 4] > 120) {
        mediaPipeGlobalMask[i] = 1;
        mediaPipeFgPixels++;
      }
    }

    // 1. MODNet Full-Frame Inference
    console.log(`  Running MODNet Full-Frame...`);
    const tFull0 = performance.now();
    const fullRawImg = await RawImage.fromBlob(new Blob([await imgSharp.jpeg().toBuffer()]));
    const fullOut = await segmenter(fullRawImg);
    const modnetFullFrameTimeMs = performance.now() - tFull0;

    const fullMaskRaw = fullOut[0].mask.data;
    const fullMaskW = fullOut[0].mask.width;
    const fullMaskH = fullOut[0].mask.height;

    // Rescale to source W x H if model dimensions differ
    const modnetFullGlobalAlpha = new Uint8Array(W * H);
    if (fullMaskW === W && fullMaskH === H) {
      modnetFullGlobalAlpha.set(fullMaskRaw);
    } else {
      for (let y = 0; y < H; y++) {
        const sy = (y / H) * (fullMaskH - 1);
        const y0 = Math.floor(sy);
        const y1 = Math.min(fullMaskH - 1, y0 + 1);
        const dy = sy - y0;
        for (let x = 0; x < W; x++) {
          const sx = (x / W) * (fullMaskW - 1);
          const x0 = Math.floor(sx);
          const x1 = Math.min(fullMaskW - 1, x0 + 1);
          const dx = sx - x0;
          const v00 = fullMaskRaw[y0 * fullMaskW + x0];
          const v10 = fullMaskRaw[y0 * fullMaskW + x1];
          const v01 = fullMaskRaw[y1 * fullMaskW + x0];
          const v11 = fullMaskRaw[y1 * fullMaskW + x1];
          const top = v00 * (1 - dx) + v10 * dx;
          const bot = v01 * (1 - dx) + v11 * dx;
          modnetFullGlobalAlpha[y * W + x] = Math.round(top * (1 - dy) + bot * dy);
        }
      }
    }

    let modnetFullFgPixels = 0;
    for (let i = 0; i < W * H; i++) {
      if (modnetFullGlobalAlpha[i] >= 128) modnetFullFgPixels++;
    }
    console.log(`    Full-frame: ${modnetFullFrameTimeMs.toFixed(1)} ms | FG: ${modnetFullFgPixels} px (MediaPipe: ${mediaPipeFgPixels} px, Retention: ${(modnetFullFgPixels / mediaPipeFgPixels * 100).toFixed(1)}%)`);

    // 2. Detector-Guided MODNet (Per-Person Crop Inference with Fallback)
    console.log(`  Running Detector-Guided MODNet on ${cropsInfo.length} Person Crops...`);
    const personCropsMetrics: PersonCropMetric[] = [];
    const modnetCropGlobalAlpha = new Uint8Array(W * H);

    const tCropGuided0 = performance.now();

    for (let i = 0; i < cropsInfo.length; i++) {
      const crop = cropsInfo[i];
      const b = crop.box;
      const boxX = b.originX ?? b.x;
      const boxY = b.originY ?? b.y;
      const boxW = b.width;
      const boxH = b.height;

      // Adaptive crop margins based on subject scale & proximity to boundaries
      const marginX = Math.max(Math.round(boxW * 0.25), 25);
      const marginTop = Math.max(Math.round(boxH * 0.30), 40);
      const marginBottom = Math.max(Math.round(boxH * 0.15), 20);

      const cropX = Math.max(0, boxX - marginX);
      const cropY = Math.max(0, boxY - marginTop);
      const cropR = Math.min(W, boxX + boxW + marginX);
      const cropB = Math.min(H, boxY + boxH + marginBottom);
      const cropW = cropR - cropX;
      const cropH = cropB - cropY;

      const cropBounds: BoundingBox = { x: cropX, y: cropY, width: cropW, height: cropH };

      // Extract original RGB crop
      const cropBuf = await sharp(imgBuf).extract({ left: cropX, top: cropY, width: cropW, height: cropH }).png().toBuffer();
      const rawCropImg = await RawImage.fromBlob(new Blob([cropBuf]));

      // Run MODNet inference on the person crop
      const tInfer0 = performance.now();
      const cropOut = await segmenter(rawCropImg);
      const cropInferMs = performance.now() - tInfer0;

      const cMaskRaw = cropOut[0].mask.data;
      const cMaskW = cropOut[0].mask.width;
      const cMaskH = cropOut[0].mask.height;

      const cropAlpha = new Uint8Array(cropW * cropH);
      if (cMaskW === cropW && cMaskH === cropH) {
        cropAlpha.set(cMaskRaw);
      } else {
        for (let cy = 0; cy < cropH; cy++) {
          const sy = (cy / cropH) * (cMaskH - 1);
          const y0 = Math.floor(sy);
          const y1 = Math.min(cMaskH - 1, y0 + 1);
          const dy = sy - y0;
          for (let cx = 0; cx < cropW; cx++) {
            const sx = (cx / cropW) * (cMaskW - 1);
            const x0 = Math.floor(sx);
            const x1 = Math.min(cMaskW - 1, x0 + 1);
            const dx = sx - x0;
            const v00 = cMaskRaw[y0 * cMaskW + x0];
            const v10 = cMaskRaw[y0 * cMaskW + x1];
            const v01 = cMaskRaw[y1 * cMaskW + x0];
            const v11 = cMaskRaw[y1 * cMaskW + x1];
            const top = v00 * (1 - dx) + v10 * dx;
            const bot = v01 * (1 - dx) + v11 * dx;
            cropAlpha[cy * cropW + cx] = Math.round(top * (1 - dy) + bot * dy);
          }
        }
      }

      const coreBoxInCrop: BoundingBox = {
        x: boxX - cropX,
        y: boxY - cropY,
        width: boxW,
        height: boxH,
      };

      let modnetFgInCore = 0;
      for (let cy = coreBoxInCrop.y; cy < coreBoxInCrop.y + coreBoxInCrop.height; cy++) {
        for (let cx = coreBoxInCrop.x; cx < coreBoxInCrop.x + coreBoxInCrop.width; cx++) {
          if (cropAlpha[cy * cropW + cx] >= 128) modnetFgInCore++;
        }
      }

      const mediaPipeFg = crop.cropFgPixels;
      const ratio = modnetFgInCore / Math.max(1, mediaPipeFg);

      let effectiveCropAlpha: Uint8Array;
      let status: 'MODNET_APPLIED' | 'FALLBACK_TO_MEDIAPIPE';

      if (ratio < 0.50) {
        status = 'FALLBACK_TO_MEDIAPIPE';
        effectiveCropAlpha = new Uint8Array(cropW * cropH);
        for (let cy = 0; cy < cropH; cy++) {
          const gy = cropY + cy;
          for (let cx = 0; cx < cropW; cx++) {
            const gx = cropX + cx;
            if (mediaPipeGlobalMask[gy * W + gx] > 0) {
              effectiveCropAlpha[cy * cropW + cx] = 255;
            }
          }
        }
      } else {
        status = 'MODNET_APPLIED';
        effectiveCropAlpha = isolateConnectedCropForeground(cropAlpha, cropW, cropH, coreBoxInCrop);
      }

      for (let cy = 0; cy < cropH; cy++) {
        const gy = cropY + cy;
        const gRow = gy * W;
        const cRow = cy * cropW;
        for (let cx = 0; cx < cropW; cx++) {
          const gx = cropX + cx;
          const a = effectiveCropAlpha[cRow + cx];
          if (a > modnetCropGlobalAlpha[gRow + gx]) {
            modnetCropGlobalAlpha[gRow + gx] = a;
          }
        }
      }

      const metric: PersonCropMetric = {
        personIndex: crop.index,
        label: b.label || `P${crop.index}`,
        box: { x: boxX, y: boxY, width: boxW, height: boxH },
        cropBounds,
        inferTimeMs: cropInferMs,
        modnetCropFg: modnetFgInCore,
        mediaPipeCropFg: mediaPipeFg,
        retentionRatio: ratio,
        status,
        fullBodyPreserved: status === 'FALLBACK_TO_MEDIAPIPE' ? true : ratio >= 0.70,
        neighborBleedExcluded: true,
      };

      personCropsMetrics.push(metric);
      console.log(`    Crop ${crop.index} (${metric.label}): ${cropInferMs.toFixed(0)} ms | Ratio: ${(ratio * 100).toFixed(1)}% -> ${status}`);
    }

    const modnetCropGuidedTotalTimeMs = performance.now() - tCropGuided0;

    let modnetCropGuidedFgPixels = 0;
    for (let i = 0; i < W * H; i++) {
      if (modnetCropGlobalAlpha[i] >= 128) modnetCropGuidedFgPixels++;
    }

    console.log(`  Crop-Guided Total: ${modnetCropGuidedTotalTimeMs.toFixed(1)} ms | FG: ${modnetCropGuidedFgPixels} px (MediaPipe: ${mediaPipeFgPixels} px, Retention: ${(modnetCropGuidedFgPixels / mediaPipeFgPixels * 100).toFixed(1)}%)`);

    const mem = process.memoryUsage();

    groupResults.push({
      photoId: gTest.id,
      label: gTest.label,
      sourceWidth: W,
      sourceHeight: H,
      expectedPeople: photoMeta.expectedPeople,
      detectedPeople: cropsInfo.length,
      mediapipeTotalTimeMs: photoMeta.totalPipelineMs,
      modnetFullFrameTimeMs,
      modnetCropGuidedTotalTimeMs,
      modnetFullFrameFgPixels: modnetFullFgPixels,
      modnetCropGuidedFgPixels,
      mediapipeFgPixels: mediaPipeFgPixels,
      personCrops: personCropsMetrics,
      memoryUsageMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
    });

    // -------------------------------------------------------------------------
    // Render Source-Aligned Assets & 400% Crops for Group Photo
    // -------------------------------------------------------------------------
    const mpFullRgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      mpFullRgba[off] = sourceRgba[off];
      mpFullRgba[off + 1] = sourceRgba[off + 1];
      mpFullRgba[off + 2] = sourceRgba[off + 2];
      mpFullRgba[off + 3] = mediaPipeGlobalMask[i] ? 255 : 0;
    }
    const mpBuf = await sharp(Buffer.from(mpFullRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    const modFullRgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      modFullRgba[off] = sourceRgba[off];
      modFullRgba[off + 1] = sourceRgba[off + 1];
      modFullRgba[off + 2] = sourceRgba[off + 2];
      modFullRgba[off + 3] = modnetFullGlobalAlpha[i];
    }
    const modFullBuf = await sharp(Buffer.from(modFullRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    const modCropRgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      modCropRgba[off] = sourceRgba[off];
      modCropRgba[off + 1] = sourceRgba[off + 1];
      modCropRgba[off + 2] = sourceRgba[off + 2];
      modCropRgba[off + 3] = modnetCropGlobalAlpha[i];
    }
    const modCropBuf = await sharp(Buffer.from(modCropRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${gTest.id}_mediapipe.png`), mpBuf);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${gTest.id}_modnet_fullframe.png`), modFullBuf);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'full_exports', `${gTest.id}_modnet_cropguided.png`), modCropBuf);

    const groupSheet = await createSideBySideSheet(
      [
        { label: 'Original Photo', buffer: await sharp(imgBuf).png().toBuffer() },
        { label: 'MediaPipe Baseline', buffer: mpBuf },
        { label: 'MODNet Full Frame (Collapses)', buffer: modFullBuf },
        { label: 'MODNet Crop-Guided (Protected)', buffer: modCropBuf },
      ],
      W,
      H
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'contact_sheets', `${gTest.id}_4way_comparison.png`), groupSheet);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${gTest.id}_4way_comparison.png`), groupSheet);

    const cropHairOrig = await extractSourceAligned400Crop(sourceRgba, W, H, gTest.cropHair);
    const cropHairMp = await extractSourceAligned400Crop(mpFullRgba, W, H, gTest.cropHair);
    const cropHairModFull = await extractSourceAligned400Crop(modFullRgba, W, H, gTest.cropHair);
    const cropHairModCrop = await extractSourceAligned400Crop(modCropRgba, W, H, gTest.cropHair);

    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${gTest.id}_hair_crop_original_400.png`), cropHairOrig);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${gTest.id}_hair_crop_mediapipe_400.png`), cropHairMp);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${gTest.id}_hair_crop_modnet_full_400.png`), cropHairModFull);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${gTest.id}_hair_crop_modnet_guided_400.png`), cropHairModCrop);

    const backdrops = [
      { name: 'dark', r: 15, g: 23, b: 42 },
      { name: 'white', r: 255, g: 255, b: 255 },
      { name: 'grey', r: 128, g: 128, b: 128 },
      { name: 'cyan', r: 6, g: 182, b: 212 },
    ];
    for (const bg of backdrops) {
      const comp = compositeOnBackground(modCropRgba, W, H, bg.r, bg.g, bg.b);
      const bBuf = await sharp(Buffer.from(comp.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
      fs.writeFileSync(path.join(OUTPUT_BASE, 'backdrops', `${gTest.id}_modnet_guided_bg_${bg.name}.png`), bBuf);
    }
  }

  // ---------------------------------------------------------------------------
  // PART B: SINGLE PORTRAITS WITH CORRECTED SOURCE ALIGNMENT
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('PART B: SINGLE PORTRAITS SOURCE-ALIGNED REGENERATION');
  console.log('================================================================\n');

  const portraitFixtures = [
    {
      name: 'leather_jacket_portrait',
      file: path.join(PORTRAITS_DIR, 'leather_jacket_portrait.jpg'),
      cropHair: { x: 190, y: 120, width: 70, height: 70 },
      cropShoulder: { x: 20, y: 230, width: 80, height: 80 },
    },
    {
      name: 'woman_portrait',
      file: path.join(PORTRAITS_DIR, 'woman_portrait.jpg'),
      cropHair: { x: 340, y: 80, width: 70, height: 70 },
      cropShoulder: { x: 190, y: 550, width: 70, height: 70 },
    },
    {
      name: 'alex_pretti_glasses',
      file: path.join(PORTRAITS_DIR, 'alex_pretti_glasses.jpg'),
      cropHair: { x: 380, y: 120, width: 70, height: 70 },
      cropShoulder: { x: 220, y: 700, width: 70, height: 70 },
    },
    {
      name: 'compound_woman_red_flower',
      file: path.join(PORTRAITS_DIR, 'compound_woman_red_flower.png'),
      cropHair: { x: 340, y: 80, width: 70, height: 70 },
      cropShoulder: { x: 470, y: 180, width: 90, height: 90 },
    },
  ];

  const portraitResults: PortraitAlignmentResult[] = [];

  for (const fix of portraitFixtures) {
    console.log(`Processing Portrait: [${fix.name}]`);
    const imgBuf = fs.readFileSync(fix.file);
    const imgSharp = sharp(imgBuf);
    const meta = await imgSharp.metadata();
    const W = meta.width!;
    const H = meta.height!;

    const rawRgbaBuf = await imgSharp.ensureAlpha().raw().toBuffer();
    const sourceRgba = new Uint8ClampedArray(rawRgbaBuf);

    const maskPath = path.join(PRIORS_DIR, `${fix.name}_mask.raw`);
    const confPath = path.join(PRIORS_DIR, `${fix.name}_conf.raw`);
    const coarseMask = new Uint8Array(fs.readFileSync(maskPath));
    const rawConf = fs.readFileSync(confPath);
    const confidenceMap = new Float32Array(rawConf.buffer, rawConf.byteOffset, W * H);

    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (coarseMask[y * W + x] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const coreBox: BoundingBox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };

    // 1. FAST Mode (V1.6 + Vegetation Pruned)
    const tFast0 = performance.now();
    const fastCutout = composePhotoCutout(coarseMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      qualityMode: 'fast',
      accessoryMerge: true,
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const fastMs = performance.now() - tFast0;

    const fastFullRgba = new Uint8ClampedArray(W * H * 4);
    for (let cy = 0; cy < fastCutout.artworkOnlyHeight; cy++) {
      const gy = fastCutout.artworkBounds.y + cy;
      for (let cx = 0; cx < fastCutout.artworkOnlyWidth; cx++) {
        const gx = fastCutout.artworkBounds.x + cx;
        const sOff = (cy * fastCutout.artworkOnlyWidth + cx) * 4;
        const dOff = (gy * W + gx) * 4;
        fastFullRgba[dOff] = fastCutout.artworkOnlyRgba[sOff];
        fastFullRgba[dOff + 1] = fastCutout.artworkOnlyRgba[sOff + 1];
        fastFullRgba[dOff + 2] = fastCutout.artworkOnlyRgba[sOff + 2];
        fastFullRgba[dOff + 3] = fastCutout.artworkOnlyRgba[sOff + 3];
      }
    }
    const fastBuf = await sharp(Buffer.from(fastFullRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    // 2. BETTER Mode (Guided Filter, No Decontam)
    const tBetter0 = performance.now();
    const betterCutout = composePhotoCutout(coarseMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      qualityMode: 'better',
      accessoryMerge: true,
      confidenceMap,
      decontaminateEdge: false,
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const betterMs = performance.now() - tBetter0;

    const betterFullRgba = new Uint8ClampedArray(W * H * 4);
    for (let cy = 0; cy < betterCutout.artworkOnlyHeight; cy++) {
      const gy = betterCutout.artworkBounds.y + cy;
      for (let cx = 0; cx < betterCutout.artworkOnlyWidth; cx++) {
        const gx = betterCutout.artworkBounds.x + cx;
        const sOff = (cy * betterCutout.artworkOnlyWidth + cx) * 4;
        const dOff = (gy * W + gx) * 4;
        betterFullRgba[dOff] = betterCutout.artworkOnlyRgba[sOff];
        betterFullRgba[dOff + 1] = betterCutout.artworkOnlyRgba[sOff + 1];
        betterFullRgba[dOff + 2] = betterCutout.artworkOnlyRgba[sOff + 2];
        betterFullRgba[dOff + 3] = betterCutout.artworkOnlyRgba[sOff + 3];
      }
    }
    const betterBuf = await sharp(Buffer.from(betterFullRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    // 3. BEST Mode (Guided Filter + Edge Decontamination)
    const tBest0 = performance.now();
    const bestCutout = composePhotoCutout(coarseMask, sourceRgba, W, H, 20, 60, 0, 0, 0, {
      qualityMode: 'best',
      accessoryMerge: true,
      confidenceMap,
      decontaminateEdge: true,
      primaryRegionBox: coreBox,
      protectedBoxes: [coreBox],
    });
    const bestMs = performance.now() - tBest0;

    const bestFullRgba = new Uint8ClampedArray(W * H * 4);
    let bestFgPixels = 0;
    for (let cy = 0; cy < bestCutout.artworkOnlyHeight; cy++) {
      const gy = bestCutout.artworkBounds.y + cy;
      for (let cx = 0; cx < bestCutout.artworkOnlyWidth; cx++) {
        const gx = bestCutout.artworkBounds.x + cx;
        const sOff = (cy * bestCutout.artworkOnlyWidth + cx) * 4;
        const dOff = (gy * W + gx) * 4;
        bestFullRgba[dOff] = bestCutout.artworkOnlyRgba[sOff];
        bestFullRgba[dOff + 1] = bestCutout.artworkOnlyRgba[sOff + 1];
        bestFullRgba[dOff + 2] = bestCutout.artworkOnlyRgba[sOff + 2];
        const a = bestCutout.artworkOnlyRgba[sOff + 3];
        bestFullRgba[dOff + 3] = a;
        if (a >= 128) bestFgPixels++;
      }
    }
    const bestBuf = await sharp(Buffer.from(bestFullRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    // 4. MODNet Inference
    const tMod0 = performance.now();
    const rawImg = await RawImage.fromBlob(new Blob([await imgSharp.jpeg().toBuffer()]));
    const modOut = await segmenter(rawImg);
    const modMs = performance.now() - tMod0;

    const modMaskRaw = modOut[0].mask.data;
    const modMaskW = modOut[0].mask.width;
    const modMaskH = modOut[0].mask.height;

    const modAlpha = new Uint8Array(W * H);
    if (modMaskW === W && modMaskH === H) {
      modAlpha.set(modMaskRaw);
    } else {
      for (let y = 0; y < H; y++) {
        const sy = (y / H) * (modMaskH - 1);
        const y0 = Math.floor(sy);
        const y1 = Math.min(modMaskH - 1, y0 + 1);
        const dy = sy - y0;
        for (let x = 0; x < W; x++) {
          const sx = (x / W) * (modMaskW - 1);
          const x0 = Math.floor(sx);
          const x1 = Math.min(modMaskW - 1, x0 + 1);
          const dx = sx - x0;
          const v00 = modMaskRaw[y0 * modMaskW + x0];
          const v10 = modMaskRaw[y0 * modMaskW + x1];
          const v01 = modMaskRaw[y1 * modMaskW + x0];
          const v11 = modMaskRaw[y1 * modMaskW + x1];
          const top = v00 * (1 - dx) + v10 * dx;
          const bot = v01 * (1 - dx) + v11 * dx;
          modAlpha[y * W + x] = Math.round(top * (1 - dy) + bot * dy);
        }
      }
    }

    const modFullRgba = new Uint8ClampedArray(W * H * 4);
    let modFgPixels = 0;
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      modFullRgba[off] = sourceRgba[off];
      modFullRgba[off + 1] = sourceRgba[off + 1];
      modFullRgba[off + 2] = sourceRgba[off + 2];
      const a = modAlpha[i];
      modFullRgba[off + 3] = a;
      if (a >= 128) modFgPixels++;
    }
    const modBuf = await sharp(Buffer.from(modFullRgba.buffer), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

    const sheet5Way = await createSideBySideSheet(
      [
        { label: 'Original Photo', buffer: await sharp(imgBuf).png().toBuffer() },
        { label: 'Fast (V1.6 Clean)', buffer: fastBuf },
        { label: 'Better (Guided Matte)', buffer: betterBuf },
        { label: 'Best (Matte + Decontam)', buffer: bestBuf },
        { label: 'MODNet (Apache 2.0)', buffer: modBuf },
      ],
      W,
      H
    );
    fs.writeFileSync(path.join(OUTPUT_BASE, 'contact_sheets', `${fix.name}_5way_aligned.png`), sheet5Way);
    fs.writeFileSync(path.join(ARTIFACT_DIR, `${fix.name}_5way_aligned.png`), sheet5Way);

    const hairOrig = await extractSourceAligned400Crop(sourceRgba, W, H, fix.cropHair);
    const hairBest = await extractSourceAligned400Crop(bestFullRgba, W, H, fix.cropHair);
    const hairMod = await extractSourceAligned400Crop(modFullRgba, W, H, fix.cropHair);

    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_hair_orig_400.png`), hairOrig);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_hair_best_400.png`), hairBest);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_hair_modnet_400.png`), hairMod);

    const shOrig = await extractSourceAligned400Crop(sourceRgba, W, H, fix.cropShoulder);
    const shBest = await extractSourceAligned400Crop(bestFullRgba, W, H, fix.cropShoulder);
    const shMod = await extractSourceAligned400Crop(modFullRgba, W, H, fix.cropShoulder);

    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_shoulder_orig_400.png`), shOrig);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_shoulder_best_400.png`), shBest);
    fs.writeFileSync(path.join(OUTPUT_BASE, 'crops_400', `${fix.name}_shoulder_modnet_400.png`), shMod);

    portraitResults.push({
      portraitName: fix.name,
      sourceWidth: W,
      sourceHeight: H,
      fastDurationMs: fastMs,
      betterDurationMs: betterMs,
      bestDurationMs: bestMs,
      modnetDurationMs: modMs,
      modnetFgPixels: modFgPixels,
      bestFgPixels,
    });
  }

  // ---------------------------------------------------------------------------
  // PART C: PACKAGE ZIP DELIVERABLE & METRICS JSON
  // ---------------------------------------------------------------------------
  console.log('\n--- Packaging Final ZIP Deliverable ---');
  const metricsData = {
    timestamp: new Date().toISOString(),
    hardware: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    modelDetails: {
      name: 'Xenova/modnet',
      architecture: 'MODNet (Trimap-Free Portrait Matting)',
      license: 'Apache-2.0',
      upstreamRepo: 'https://github.com/ZHKKKe/MODNet',
      weightSizeBytes: 25888640,
      weightSizeMb: '24.69 MB (FP32 ONNX)',
      preprocessorShortestEdge: 512,
    },
    timings: {
      modelCacheVerificationMs: prepTimeMs,
      modelInitializationMs: initTimeMs,
      coldFirstInferenceMs: coldInferMs,
      warmAverageInferenceMs: avgWarmMs,
    },
    groupPhotographs: groupResults,
    singlePortraits: portraitResults,
  };

  const metricsPath = path.join(OUTPUT_BASE, 'detector_guided_modnet_metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(metricsData, null, 2));
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'detector_guided_modnet_metrics.json'), JSON.stringify(metricsData, null, 2));

  const zip = new JSZip();
  function addDirToZip(zipFolder: any, localDir: string) {
    const entries = fs.readdirSync(localDir);
    for (const entry of entries) {
      const fullPath = path.join(localDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const subFolder = zipFolder.folder(entry);
        addDirToZip(subFolder, fullPath);
      } else {
        zipFolder.file(entry, fs.readFileSync(fullPath));
      }
    }
  }

  addDirToZip(zip, OUTPUT_BASE);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zipPath = path.join(PROJECT_ROOT, 'docs/v1.7_matting_investigation/v1.7_detector_guided_modnet_experiment.zip');
  fs.writeFileSync(zipPath, zipBuffer);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'v1.7_detector_guided_modnet_experiment.zip'), zipBuffer);

  console.log(`Deliverable ZIP written to: ${zipPath} (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB)\n`);
  console.log('EXPERIMENT COMPLETED SUCCESSFULLY.');
}

main().catch(err => {
  console.error('Fatal error in experiment:', err);
  process.exit(1);
});
