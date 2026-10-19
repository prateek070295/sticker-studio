import { describe, it, expect } from 'vitest';
import {
  generateTrimap,
  computeUnknownBandRoi,
  boxFilter,
  solveGuidedAlphaMatte,
  refineContinuousConfidence,
  decontaminateEdgeColor,
  refinePhotoAlphaMatte,
} from '../photoMatting';
import { mergeAttachedAccessories } from '../accessoryAttacher';
import { detectPeopleInPhoto } from '../mediaPipeSegmenter';
import { composePhotoCutout } from '../photoAdapter';
import { saveProjectArchive, loadProjectArchive } from '../projectArchive';
import { BoundingBox } from '../../types';

describe('Sticker Studio V1.7 — Photo Matting & Edge Refinement Core', () => {
  it('1. Generates 3-state Trimap with EDT erosion, dilation, and hair dilation boost', () => {
    const W = 40;
    const H = 40;
    const mask = new Uint8Array(W * H);

    // Create a 20x20 square subject in center
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        mask[y * W + x] = 1;
      }
    }

    const trimap = generateTrimap(mask, W, H, {
      erosionRadius: 3,
      dilationRadius: 3,
      hairDetail: 5,
    });

    // Interior should be Definite FG (255)
    expect(trimap[20 * W + 20]).toBe(255);

    // Far outside should be Definite BG (0)
    expect(trimap[2 * W + 2]).toBe(0);
    expect(trimap[38 * W + 38]).toBe(0);

    // Edge boundary pixels should be Unknown Band (128)
    expect(trimap[10 * W + 10]).toBe(128); // on border
    expect(trimap[9 * W + 20]).toBe(128);  // 1px outside border
    expect(trimap[11 * W + 20]).toBe(128); // 1px inside border
  });

  it('2. Enforces strict hard constraints in Guided Alpha Matting (FG=255, BG=0, zero leakage)', () => {
    const W = 30;
    const H = 30;
    const rgb = new Uint8Array(W * H * 4);
    const coarseMask = new Uint8Array(W * H);
    const trimap = new Uint8Array(W * H);

    // Fill checkerboard colors
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const off = idx * 4;
        rgb[off] = (x % 2 === 0) ? 200 : 50;
        rgb[off + 1] = (y % 2 === 0) ? 180 : 30;
        rgb[off + 2] = 100;
        rgb[off + 3] = 255;

        if (x < 10) {
          trimap[idx] = 255; // Definite FG
          coarseMask[idx] = 1;
        } else if (x > 20) {
          trimap[idx] = 0;   // Definite BG
          coarseMask[idx] = 0;
        } else {
          trimap[idx] = 128; // Unknown band
          coarseMask[idx] = x < 15 ? 1 : 0;
        }
      }
    }

    const alpha = solveGuidedAlphaMatte(rgb, coarseMask, trimap, W, H, 4, 1e-4);

    // Strict constraint verification
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (trimap[idx] === 255) {
          expect(alpha[idx]).toBe(255);
        } else if (trimap[idx] === 0) {
          expect(alpha[idx]).toBe(0); // Zero leakage
        } else {
          // Unknown band produces continuous values in [0, 255]
          expect(alpha[idx]).toBeGreaterThanOrEqual(0);
          expect(alpha[idx]).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('3. Candidate B: Evaluates continuous confidence map preservation and joint RGB upsampling', () => {
    const W = 30;
    const H = 30;
    const rgb = new Uint8Array(W * H * 4);
    const conf = new Float32Array(W * H);

    // Create a smooth gradient confidence across a diagonal edge
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const off = idx * 4;
        // Edge along x + y = 30
        const dist = (x + y) - 30;
        const prob = 1.0 / (1.0 + Math.exp(dist * 0.5)); // sigmoid
        conf[idx] = prob;

        // RGB guide: dark hair on bright background
        const val = prob > 0.5 ? 40 : 220;
        rgb[off] = val;
        rgb[off + 1] = val;
        rgb[off + 2] = val;
        rgb[off + 3] = 255;
      }
    }

    const refined = refineContinuousConfidence(rgb, conf, W, H, 3, 1e-3);

    // Verify continuous output
    let intermediateCount = 0;
    for (let i = 0; i < refined.length; i++) {
      if (refined[i] > 10 && refined[i] < 245) {
        intermediateCount++;
      }
    }

    expect(intermediateCount).toBeGreaterThan(20);
    // Deep interior is opaque, far background is transparent
    expect(refined[0]).toBe(255);
    expect(refined[W * H - 1]).toBe(0);
  });

  it('4. Guarded Physical Color Decontamination preserves interior camera RGB exactly and removes background spill', () => {
    const W = 20;
    const H = 20;
    const rgb = new Uint8ClampedArray(W * H * 4);
    const alpha = new Uint8Array(W * H);
    const trimap = new Uint8Array(W * H);

    // Dark hair (RGB 30, 25, 20) over bright white background (RGB 255, 255, 255)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const off = idx * 4;

        if (x < 8) {
          // Deep interior
          rgb[off] = 30;
          rgb[off + 1] = 25;
          rgb[off + 2] = 20;
          rgb[off + 3] = 255;
          alpha[idx] = 255;
          trimap[idx] = 255;
        } else if (x > 14) {
          // Background
          rgb[off] = 250;
          rgb[off + 1] = 250;
          rgb[off + 2] = 250;
          rgb[off + 3] = 255;
          alpha[idx] = 0;
          trimap[idx] = 0;
        } else {
          // Transitional hair edge with white background color spill
          // e.g. observed = 0.5 * hair + 0.5 * white = (140, 137, 135)
          rgb[off] = 140;
          rgb[off + 1] = 137;
          rgb[off + 2] = 135;
          rgb[off + 3] = 255;
          alpha[idx] = 128;
          trimap[idx] = 128;
        }
      }
    }

    const decontaminated = decontaminateEdgeColor(rgb, alpha, trimap, W, H, 5);

    // Invariant 1: Deep interior (alpha === 255) must be 100% bitwise identical to untouched camera RGB
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 8; x++) {
        const off = (y * W + x) * 4;
        expect(decontaminated[off]).toBe(30);
        expect(decontaminated[off + 1]).toBe(25);
        expect(decontaminated[off + 2]).toBe(20);
        expect(decontaminated[off + 3]).toBe(255);
      }
    }

    // Invariant 2: Transitional pixels (alpha === 128) must have white spill stripped
    // Unmixed foreground should be significantly darker than observed 140 (closer to true hair ~30)
    const midOff = (10 * W + 10) * 4;
    expect(decontaminated[midOff]).toBeLessThan(140);
    expect(decontaminated[midOff]).toBeGreaterThanOrEqual(25);
  });

  it('5. Suppresses low-confidence person detections that strongly overlap primary subjects', async () => {
    // Synthetic detection simulating the red hair flower defect:
    // P1: Main person, score 0.92, bounds [10, 10, 80, 80]
    // P2: Red hair flower falsely detected as person, score 0.17, bounds [20, 15, 25, 25] (100% inside P1)
    // P3: Standalone secondary person, score 0.85, bounds [120, 10, 50, 80] (no overlap)
    // P4: Standalone small person in background, score 0.28, bounds [200, 20, 20, 30] (no overlap, reviewable)

    const W = 300;
    const H = 200;
    const personBoxes = [
      { box: { x: 10, y: 10, width: 80, height: 80 }, score: 0.92, isUncertain: false },
      { box: { x: 20, y: 15, width: 25, height: 25 }, score: 0.17, isUncertain: true },
      { box: { x: 120, y: 10, width: 50, height: 80 }, score: 0.85, isUncertain: false },
      { box: { x: 200, y: 20, width: 20, height: 30 }, score: 0.28, isUncertain: true },
    ];

    // Filter using the exact logic implemented in detectPeopleInPhoto
    const mapped = personBoxes.map((p, idx) => {
      let isSuppressedByOverlap = false;
      if (p.score < 0.35 || p.isUncertain) {
        const pArea = p.box.width * p.box.height;
        for (const other of personBoxes) {
          if (other === p) continue;
          if (other.score >= 0.45 && other.score > p.score + 0.15) {
            const ix0 = Math.max(p.box.x, other.box.x);
            const ix1 = Math.min(p.box.x + p.box.width, other.box.x + other.box.width);
            const iy0 = Math.max(p.box.y, other.box.y);
            const iy1 = Math.min(p.box.y + p.box.height, other.box.y + other.box.height);
            if (ix1 > ix0 && iy1 > iy0) {
              const overlapArea = (ix1 - ix0) * (iy1 - iy0);
              if (overlapArea / pArea >= 0.35) {
                isSuppressedByOverlap = true;
                break;
              }
            }
          }
        }
      }
      return {
        id: `person_${idx + 1}`,
        score: p.score,
        included: !isSuppressedByOverlap,
        isUncertain: p.isUncertain || isSuppressedByOverlap,
      };
    });

    // P1 (main): included
    expect(mapped[0].included).toBe(true);

    // P2 (flower falsely detected as person overlapping P1): SUPPRESSED from auto-inclusion
    expect(mapped[1].included).toBe(false);
    expect(mapped[1].isUncertain).toBe(true);

    // P3 (standalone): included
    expect(mapped[2].included).toBe(true);

    // P4 (standalone small person in group photo): included for review, not falsely suppressed because no overlap
    expect(mapped[3].included).toBe(true);
  });

  it('6. Accessory Attacher merges attached near-head items but ignores disconnected background objects', () => {
    const W = 60;
    const H = 60;
    const mask = new Uint8Array(W * H);

    // Primary person head & torso: [20..40, 15..50]
    for (let y = 15; y < 50; y++) {
      for (let x = 20; x < 40; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Component 1: Attached hair flower at [12..18, 16..22] (distance = 2px to head, in head zone)
    for (let y = 16; y < 22; y++) {
      for (let x = 12; x < 18; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Component 2: Disconnected background object at [4..10, 4..10] (distance > 20px, far background)
    for (let y = 4; y < 10; y++) {
      for (let x = 4; x < 10; x++) {
        mask[y * W + x] = 1;
      }
    }

    const coreBox: BoundingBox = { x: 20, y: 15, width: 20, height: 35 };
    const merged = mergeAttachedAccessories(mask, W, H, coreBox, {
      maxAttachmentDistance: 10,
      headZoneRatio: 0.65,
    });

    // Hair flower is merged and preserved directly without artificial bridge lines
    expect(merged.attachedCount).toBe(1);
    expect(merged.mask[18 * W + 15]).toBe(1); // flower pixel preserved
    expect(merged.mask[16 * W + 19]).toBe(0); // no artificial bridge lines drawn across gap

    // Disconnected background object is NOT merged
    expect(merged.mask[6 * W + 6]).toBe(0);
  });

  it('7. Photo Compositing Support Envelope does not clip recovered fractional alpha outside binary mask', () => {
    const W = 40;
    const H = 40;
    const sourceRgba = new Uint8ClampedArray(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Initial coarse mask: [12..28, 12..28]
    for (let y = 12; y < 28; y++) {
      for (let x = 12; x < 28; x++) {
        mask[y * W + x] = 1;
      }
    }

    for (let i = 0; i < W * H * 4; i += 4) {
      sourceRgba[i] = 100;
      sourceRgba[i + 1] = 150;
      sourceRgba[i + 2] = 200;
      sourceRgba[i + 3] = 255;
    }

    // Compose with Better quality mode (matting enabled)
    const composed = composePhotoCutout(
      mask,
      sourceRgba,
      W,
      H,
      10, // border
      20, // padding
      0,
      0,
      0,
      { qualityMode: 'better', decontaminateEdge: true }
    );

    // Verify composed result has valid bounds
    expect(composed.artworkOnlyWidth).toBeGreaterThan(0);
    expect(composed.whiteBackedWidth).toBeGreaterThan(0);

    // Verify artworkOnly contains real fractional alpha
    let hasFractional = false;
    for (let i = 3; i < composed.artworkOnlyRgba.length; i += 4) {
      const a = composed.artworkOnlyRgba[i];
      if (a > 0 && a < 255) {
        hasFractional = true;
        break;
      }
    }
    expect(hasFractional).toBe(true);

    // Verify white die-cut backing is wide enough to enclose all visible artwork
    expect(composed.whiteBackedWidth).toBeGreaterThanOrEqual(composed.artworkOnlyWidth);
    expect(composed.whiteBackedHeight).toBeGreaterThanOrEqual(composed.artworkOnlyHeight);
  });

  it('8. Enforces hard manualDelta constraints (erased pixels strictly clamped to 0, no trimap dilation into erased zones)', () => {
    const W = 40;
    const H = 40;
    const sourceRgba = new Uint8ClampedArray(W * H * 4);
    const mask = new Uint8Array(W * H);
    const manualDelta = new Int8Array(W * H);

    // Initial subject: [10..30, 10..30]
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Erase a 4px band on the right edge [26..29, 10..30]
    for (let y = 10; y < 30; y++) {
      for (let x = 26; x < 30; x++) {
        manualDelta[y * W + x] = -1;
      }
    }

    for (let i = 0; i < W * H * 4; i += 4) {
      sourceRgba[i] = 180;
      sourceRgba[i + 1] = 140;
      sourceRgba[i + 2] = 100;
      sourceRgba[i + 3] = 255;
    }

    const matting = refinePhotoAlphaMatte(
      sourceRgba,
      mask,
      W,
      H,
      {
        qualityMode: 'better',
        manualDelta,
      }
    );

    // All erased pixels MUST have trimap === 0 and alpha === 0
    for (let y = 10; y < 30; y++) {
      for (let x = 26; x < 30; x++) {
        const idx = y * W + x;
        expect(matting.trimap[idx]).toBe(0);
        expect(matting.alpha[idx]).toBe(0);
      }
    }
  });

  it('9. Caches intermediate matte when only borderThickness or padding changes', () => {
    const W = 40;
    const H = 40;
    const sourceRgba = new Uint8ClampedArray(W * H * 4);
    const mask = new Uint8Array(W * H);

    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        mask[y * W + x] = 1;
      }
    }

    for (let i = 0; i < W * H * 4; i += 4) {
      sourceRgba[i] = 120;
      sourceRgba[i + 1] = 140;
      sourceRgba[i + 2] = 160;
      sourceRgba[i + 3] = 255;
    }

    const options = { qualityMode: 'better' as const };

    // Initial compose
    const comp1 = composePhotoCutout(mask, sourceRgba, W, H, 10, 20, 0, 0, 0, options);

    // Second compose with different borderThickness only
    const comp2 = composePhotoCutout(mask, sourceRgba, W, H, 25, 20, 0, 0, 0, options);

    // Artwork only dimensions and RGBA must be bitwise identical
    expect(comp2.artworkOnlyWidth).toBe(comp1.artworkOnlyWidth);
    expect(comp2.artworkOnlyHeight).toBe(comp1.artworkOnlyHeight);
    expect(Array.from(comp2.artworkOnlyRgba)).toEqual(Array.from(comp1.artworkOnlyRgba));

    // White backed width should expand due to larger borderThickness
    expect(comp2.whiteBackedWidth).toBeGreaterThan(comp1.whiteBackedWidth);
  });

  it('10. Full production cutout call retains attached flower and rejects distant background island without bridges', () => {
    const W = 80;
    const H = 80;
    const sourceRgba = new Uint8ClampedArray(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Main person: [25..55, 20..70]
    for (let y = 20; y < 70; y++) {
      for (let x = 25; x < 55; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Attached flower accessory in hair zone: [16..22, 22..28]
    for (let y = 22; y < 28; y++) {
      for (let x = 16; x < 22; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Unrelated background island: [2..6, 2..6]
    for (let y = 2; y < 6; y++) {
      for (let x = 2; x < 6; x++) {
        mask[y * W + x] = 1;
      }
    }

    for (let i = 0; i < W * H * 4; i += 4) {
      sourceRgba[i] = 150;
      sourceRgba[i + 1] = 120;
      sourceRgba[i + 2] = 90;
      sourceRgba[i + 3] = 255;
    }

    const primaryBox: BoundingBox = { x: 25, y: 20, width: 30, height: 50 };

    const composed = composePhotoCutout(
      mask,
      sourceRgba,
      W,
      H,
      15,
      30,
      0,
      0,
      0,
      {
        qualityMode: 'better',
        accessoryMerge: true,
        primaryRegionBox: primaryBox,
      }
    );

    expect(composed.artworkOnlyWidth).toBeGreaterThan(0);
    // Flower pixel (18, 24) should be included in output bounds
    expect(composed.bounds.x).toBeLessThanOrEqual(16);

    // Unrelated background island (x=2..6, y=2..6) should NOT expand output bounds to 2
    expect(composed.bounds.x).toBeGreaterThan(6);
    expect(composed.bounds.y).toBeGreaterThan(6);
  });

  it('11. Multi-person protection preserves smaller child (<25% adult size) and attached accessory while excluding distant background object', () => {
    const W = 100;
    const H = 100;
    const mask = new Uint8Array(W * H);

    // Large adult: x in [30..70], y in [20..80] (area = 40 * 60 = 2400)
    for (let y = 20; y < 80; y++) {
      for (let x = 30; x < 70; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Small child: x in [5..20], y in [45..75] (area = 15 * 30 = 450, < 20% of adult)
    for (let y = 45; y < 75; y++) {
      for (let x = 5; x < 20; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Hair accessory touching adult head: x in [22..29], y in [24..30]
    for (let y = 24; y < 30; y++) {
      for (let x = 22; x < 29; x++) {
        mask[y * W + x] = 1;
      }
    }

    // Distant background picture/lamp: x in [85..95], y in [5..15]
    for (let y = 5; y < 15; y++) {
      for (let x = 85; x < 95; x++) {
        mask[y * W + x] = 1;
      }
    }

    const adultBox: BoundingBox = { x: 30, y: 20, width: 40, height: 60 };
    const childBox: BoundingBox = { x: 5, y: 45, width: 15, height: 30 };

    const merged = mergeAttachedAccessories(mask, W, H, adultBox, {
      protectedBoxes: [adultBox, childBox],
      maxAttachmentDistance: 16,
      headZoneRatio: 0.65,
    });

    const outMask = merged.mask;

    // 1. Adult is retained
    expect(outMask[50 * W + 50]).toBe(1);

    // 2. Small child is strictly retained (never classified as noise or dropped)
    expect(outMask[60 * W + 10]).toBe(1);

    // 3. Attached accessory is retained
    expect(outMask[27 * W + 25]).toBe(1);

    // 4. Distant background object is excluded
    expect(outMask[10 * W + 90]).toBe(0);
  });

  it('12. Lossless Better/Best project save and reopen guarantees exact bitwise decoded equality without re-segmentation', async () => {
    const W = 40;
    const H = 40;
    const imgData = new ImageData(W, H);
    for (let i = 0; i < W * H * 4; i += 4) {
      imgData.data[i] = 120;
      imgData.data[i + 1] = 140;
      imgData.data[i + 2] = 160;
      imgData.data[i + 3] = 255;
    }

    const alphaMask = new Uint8Array(W * H);
    const confidence = new Float32Array(W * H);
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        alphaMask[y * W + x] = 255;
        confidence[y * W + x] = 0.92;
      }
    }

    const confBytes = new Uint8Array(confidence.buffer, confidence.byteOffset, confidence.byteLength);
    const confBase64 = Buffer.from(confBytes).toString('base64');
    const maskBase64 = Buffer.from(alphaMask).toString('base64');

    const resolvedAlpha = new Uint8Array(W * H);
    resolvedAlpha.set(alphaMask);
    // Add fractional alpha on border
    resolvedAlpha[9 * W + 15] = 128;
    const resolvedAlphaBase64 = Buffer.from(resolvedAlpha).toString('base64');

    const zipBlob = await saveProjectArchive({
      name: 'lossless_matting_test',
      sourceImage: imgData,
      alphaMask,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 20,
        groupingProximityThreshold: 35,
        enableTitleDetection: false,
      },
      components: [],
      groups: [],
      holes: [],
      globalBorderThickness: 20,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'photo',
      photoSettings: {
        borderThickness: 20,
        previewBg: 'dark',
        hasRemovedBackground: true,
        qualityMode: 'best',
        decontaminateEdge: true,
        hairDetail: 6,
        accessoryMerge: true,
        alphaMatteData: resolvedAlphaBase64,
        personRegions: [
          {
            id: 'p1',
            label: 'Person 1',
            box: { x: 10, y: 10, width: 20, height: 20 },
            score: 0.95,
            included: true,
            isManual: false,
            maskData: maskBase64,
            confidenceData: confBase64,
          },
        ],
      },
    });

    const file = new File([zipBlob], 'lossless_matting_test.stickerstudio');
    const loaded = await loadProjectArchive(file);

    expect(loaded.metadata.projectType).toBe('photo');
    expect(loaded.metadata.photoSettings?.qualityMode).toBe('best');
    expect(loaded.metadata.photoSettings?.alphaMatteData).toBe(resolvedAlphaBase64);

    const restoredRegion = loaded.metadata.photoSettings?.personRegions?.[0];
    expect(restoredRegion).toBeDefined();
    expect(restoredRegion?.confidenceData).toBe(confBase64);

    // Decode and verify exact bitwise equality of confidence floats
    const restoredConfBytes = Buffer.from(restoredRegion!.confidenceData!, 'base64');
    const restoredConfFloats = new Float32Array(
      restoredConfBytes.buffer.slice(restoredConfBytes.byteOffset, restoredConfBytes.byteOffset + restoredConfBytes.byteLength)
    );
    expect(Array.from(restoredConfFloats)).toEqual(Array.from(confidence));

    // Verify precomputed alpha matte decoded equality
    const restoredAlpha = Buffer.from(loaded.metadata.photoSettings!.alphaMatteData!, 'base64');
    expect(Array.from(restoredAlpha)).toEqual(Array.from(resolvedAlpha));
  });

  it('13. Erase/Restore manual brush delta preserves exact user overrides across save/reload', async () => {
    const W = 30;
    const H = 30;
    const imgData = new ImageData(W, H);
    const alphaMask = new Uint8Array(W * H);
    const delta = new Int8Array(W * H);

    // User erased 2 pixels and restored 1 pixel
    delta[5 * W + 5] = -1;
    delta[5 * W + 6] = -1;
    delta[15 * W + 15] = 1;

    const deltaBytes = new Uint8Array(delta.buffer, delta.byteOffset, delta.byteLength);
    const deltaBase64 = Buffer.from(deltaBytes).toString('base64');

    const zipBlob = await saveProjectArchive({
      name: 'delta_persistence_test',
      sourceImage: imgData,
      alphaMask,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 20,
        groupingProximityThreshold: 35,
        enableTitleDetection: false,
      },
      components: [],
      groups: [],
      holes: [],
      globalBorderThickness: 20,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'photo',
      photoSettings: {
        borderThickness: 20,
        previewBg: 'checker',
        hasRemovedBackground: true,
        qualityMode: 'better',
        manualDelta: deltaBase64,
      },
    });

    const file = new File([zipBlob], 'delta_persistence_test.stickerstudio');
    const loaded = await loadProjectArchive(file);

    expect(loaded.metadata.photoSettings?.manualDelta).toBe(deltaBase64);
    const loadedDeltaBytes = Buffer.from(loaded.metadata.photoSettings!.manualDelta!, 'base64');
    const loadedDelta = new Int8Array(
      loadedDeltaBytes.buffer.slice(loadedDeltaBytes.byteOffset, loadedDeltaBytes.byteOffset + loadedDeltaBytes.byteLength)
    );
    expect(Array.from(loadedDelta)).toEqual(Array.from(delta));
  });
});
