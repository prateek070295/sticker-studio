/**
 * High-Performance Client-Side Alpha Matting and Foreground Color Decontamination.
 * Implements:
 * - Candidate A: Baseline distance-transform smoothing (V1.6)
 * - Candidate B: Continuous confidence preservation & joint RGB-guided refinement
 * - Candidate C: Evidence-based Trimap + Closed-form guided color covariance matting
 *   with guarded physical foreground color unmixing: C = alpha * F + (1 - alpha) * B
 */

import { computeEuclideanDistanceTransform } from './edt';
import { BoundingBox } from '../types/index';

export interface TrimapOptions {
  hairDetail?: number; // 0 to 10, default 5
  erosionRadius?: number; // default 3 to 4 px
  dilationRadius?: number; // default 4 px baseline
  faceBounds?: BoundingBox;
  manualEraseMask?: Uint8Array; // Hard background constraints
  manualRestoreMask?: Uint8Array; // Approved foreground constraints
  manualDelta?: Int8Array | null; // -1 = erased, 1 = restored
}

export interface MattingOptions {
  qualityMode?: 'fast' | 'better' | 'best';
  candidateAlgorithm?: 'candidate-a' | 'candidate-b' | 'candidate-c';
  smoothness?: number; // 0 to 10, default 0
  feather?: number; // 0 to 3 px, default 0
  hairDetail?: number; // 0 to 10, default 5
  decontaminateEdge?: boolean; // default true in better/best
  confidenceMap?: Float32Array; // Continuous probability 0.0 .. 1.0 from MediaPipe
  radius?: number; // guided filter radius (default 6)
  eps?: number; // guided filter regularization (default 1e-4)
  faceBounds?: BoundingBox;
  primaryRegionBox?: BoundingBox;
  manualDelta?: Int8Array | null;
}

export interface MattingResult {
  alpha: Uint8Array; // 0..255 refined alpha matte
  decontaminatedRgba?: Uint8ClampedArray; // RGBA buffer with decontaminated edge colors
  trimap: Uint8Array; // 0 = Definite BG, 128 = Unknown, 255 = Definite FG
  mattingDurationMs: number;
  roi?: BoundingBox;
}

/**
 * Generates a 3-state Trimap (0 = BG, 128 = Unknown, 255 = FG) from a coarse binary mask.
 * Uses Euclidean Distance Transform for linear-time O(W*H) erosion and dilation.
 * Supports context-adaptive dilation in the hair and head region modulated by hairDetail.
 * Respects hard user constraints (erased = BG, restored = FG).
 */
export function generateTrimap(
  mask: Uint8Array,
  width: number,
  height: number,
  options: TrimapOptions = {}
): Uint8Array {
  const size = width * height;
  const trimap = new Uint8Array(size);

  let hasFg = false;
  let hasBg = false;
  const invMask = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    if (mask[i] > 0) {
      invMask[i] = 0;
      hasFg = true;
    } else {
      invMask[i] = 1;
      hasBg = true;
    }
  }

  // Edge cases
  if (!hasFg) return trimap; // all 0
  if (!hasBg) {
    trimap.fill(255);
    return trimap;
  }

  const hairDetail = options.hairDetail ?? 5;
  const baseErosion = options.erosionRadius ?? 3;
  const baseDilation = options.dilationRadius ?? 4;

  // Compute EDT inside (distance to background) and outside (distance to foreground)
  const distIn = computeEuclideanDistanceTransform(invMask, width, height);
  const distOut = computeEuclideanDistanceTransform(mask, width, height);

  // Hair region hint: top 55% of the bounding envelope or above face chin
  const faceBounds = options.faceBounds;
  const hairYCutoff = faceBounds
    ? (faceBounds.y + faceBounds.height * 1.1)
    : (height * 0.55);

  const hairDilationBoost = (hairDetail / 10) * 8; // up to +8px dilation in hair zones

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const isHairRegion = y < hairYCutoff;
    const effectiveDilation = isHairRegion
      ? baseDilation + hairDilationBoost
      : baseDilation + (hairDetail > 5 ? 1 : 0);

    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;

      // Authoritative manual erase constraint: strictly hard background
      if (options.manualDelta && options.manualDelta[idx] === -1) {
        trimap[idx] = 0;
        continue;
      }
      // Authoritative manual restore constraint: strictly hard foreground
      if (options.manualDelta && options.manualDelta[idx] === 1) {
        trimap[idx] = 255;
        continue;
      }

      const dIn = distIn[idx];
      const dOut = distOut[idx];

      if (dIn > baseErosion) {
        trimap[idx] = 255; // Definite foreground
      } else if (dOut > effectiveDilation) {
        trimap[idx] = 0; // Definite background
      } else {
        trimap[idx] = 128; // Unknown band
      }
    }
  }

  // Hard constraints from user brush
  if (options.manualEraseMask) {
    const erase = options.manualEraseMask;
    for (let i = 0; i < size; i++) {
      if (erase[i] > 0) trimap[i] = 0; // Hard background
    }
  }

  if (options.manualDelta) {
    const delta = options.manualDelta;
    for (let i = 0; i < size; i++) {
      if (delta[i] === -1) trimap[i] = 0;
      else if (delta[i] === 1) trimap[i] = 255;
    }
  }

  return trimap;
}

/**
 * Finds the minimal bounding box containing all Unknown pixels (128) plus margin.
 * Allows restricting the guided matting solver to a narrow ROI.
 */
export function computeUnknownBandRoi(
  trimap: Uint8Array,
  width: number,
  height: number,
  margin: number = 8
): BoundingBox {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (trimap[rowOffset + x] === 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }

  const roiX = Math.max(0, minX - margin);
  const roiY = Math.max(0, minY - margin);
  const roiR = Math.min(width, maxX + margin + 1);
  const roiB = Math.min(height, maxY + margin + 1);

  return {
    x: roiX,
    y: roiY,
    width: roiR - roiX,
    height: roiB - roiY,
  };
}

/**
 * High-performance 2D Separable Box Filter (Moving Average) in O(W*H) time.
 * Operates on Float32Array buffers with border replication.
 */
export function boxFilter(
  src: Float32Array,
  width: number,
  height: number,
  r: number,
  dst?: Float32Array
): Float32Array {
  const size = width * height;
  const out = dst ?? new Float32Array(size);
  if (r <= 0) {
    out.set(src);
    return out;
  }

  const temp = new Float32Array(size);
  const windowLen = 2 * r + 1;
  const invWindow = 1.0 / windowLen;

  // Pass 1: Horizontal moving average
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k++) {
      const px = Math.max(0, Math.min(width - 1, k));
      sum += src[rowOffset + px];
    }
    temp[rowOffset] = sum * invWindow;

    for (let x = 1; x < width; x++) {
      const dropX = Math.max(0, x - r - 1);
      const addX = Math.min(width - 1, x + r);
      sum += src[rowOffset + addX] - src[rowOffset + dropX];
      temp[rowOffset + x] = sum * invWindow;
    }
  }

  // Pass 2: Vertical moving average
  const colSum = new Float32Array(width);
  for (let k = -r; k <= r; k++) {
    const py = Math.max(0, Math.min(height - 1, k));
    const rOff = py * width;
    for (let x = 0; x < width; x++) {
      colSum[x] += temp[rOff + x];
    }
  }
  for (let x = 0; x < width; x++) {
    out[x] = colSum[x] * invWindow;
  }

  for (let y = 1; y < height; y++) {
    const dropY = Math.max(0, y - r - 1);
    const addY = Math.min(height - 1, y + r);
    const dropOff = dropY * width;
    const addOff = addY * width;
    const rowOff = y * width;

    for (let x = 0; x < width; x++) {
      colSum[x] += temp[addOff + x] - temp[dropOff + x];
      out[rowOff + x] = colSum[x] * invWindow;
    }
  }

  return out;
}

/**
 * Candidate B: Continuous Confidence Preservation + Joint Edge-Aware Guided Refinement.
 * Evaluates whether continuous probability gradients [0.0, 1.0] from MediaPipe,
 * smoothed/upsampled with camera RGB guidance, deliver superior edge quality.
 */
export function refineContinuousConfidence(
  rgb: Uint8Array | Uint8ClampedArray,
  confidenceMap: Float32Array,
  width: number,
  height: number,
  radius: number = 5,
  eps: number = 1e-3
): Uint8Array {
  const size = width * height;
  const outAlpha = new Uint8Array(size);

  // Normalize grayscale guidance from RGB
  const I = new Float32Array(size);
  const stride = rgb.length >= size * 4 ? 4 : 3;
  for (let i = 0; i < size; i++) {
    const s = i * stride;
    // Standard perceptual luminance
    I[i] = (0.299 * rgb[s] + 0.587 * rgb[s + 1] + 0.114 * rgb[s + 2]) / 255.0;
  }

  const p = confidenceMap;
  const r = Math.max(1, Math.round(radius));

  const mean_I = boxFilter(I, width, height, r);
  const mean_p = boxFilter(p, width, height, r);

  const II = new Float32Array(size);
  const Ip = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    II[i] = I[i] * I[i];
    Ip[i] = I[i] * p[i];
  }

  const mean_II = boxFilter(II, width, height, r);
  const mean_Ip = boxFilter(Ip, width, height, r);

  const a = new Float32Array(size);
  const b = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const mI = mean_I[i];
    const mp = mean_p[i];
    const var_I = mean_II[i] - mI * mI + eps;
    const cov_Ip = mean_Ip[i] - mI * mp;

    const a_val = cov_Ip / var_I;
    a[i] = a_val;
    b[i] = mp - a_val * mI;
  }

  const mean_a = boxFilter(a, width, height, r);
  const mean_b = boxFilter(b, width, height, r);

  for (let i = 0; i < size; i++) {
    const q = mean_a[i] * I[i] + mean_b[i];
    // Map continuous confidence to physical alpha with S-curve contrast boost
    const clamped = Math.max(0.0, Math.min(1.0, q));
    outAlpha[i] = Math.round(clamped * 255.0);
  }

  return outAlpha;
}

/**
 * Candidate C: Closed-form Color Guided Filter Alpha Matting.
 * Uses full 3D RGB color covariance to recover subpixel alpha along fine hair strands
 * and smooth diagonal silhouettes.
 *
 * Enforces strict hard constraints:
 * - trimap === 255 => alpha === 255
 * - trimap === 0   => alpha === 0 (zero background leakage)
 * - trimap === 128 => alpha in [0, 255] solved from local linear model
 */
/**
 * Guided Color Covariance Alpha Matting with genuine ROI-bounded execution.
 * Uses 3D RGB color guidance to resolve subpixel alpha on hair and complex silhouettes.
 *
 * Enforces hard geometric constraints:
 * - trimap === 255 => alpha === 255 (pristine solid foreground)
 * - trimap === 0   => alpha === 0 (strict zero background leakage)
 * - trimap === 128 => alpha in [0, 255] solved via local linear color model
 */
export function solveGuidedAlphaMatte(
  rgb: Uint8Array | Uint8ClampedArray,
  coarseAlpha: Uint8Array,
  trimap: Uint8Array,
  width: number,
  height: number,
  radius: number = 6,
  eps: number = 1e-4,
  confidenceMap?: Float32Array
): Uint8Array {
  const size = width * height;
  const outAlpha = new Uint8Array(size);

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let unknownCount = 0;

  // Initialize hard constraints and determine unknown band bounds
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const t = trimap[idx];
      if (t === 255) {
        outAlpha[idx] = 255;
      } else if (t === 0) {
        outAlpha[idx] = 0;
      } else {
        unknownCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If no unknown band exists, return hard constrained mask directly
  if (unknownCount === 0 || maxX < minX || maxY < minY) {
    return outAlpha;
  }

  const r = Math.max(1, Math.round(radius));

  // Determine ROI bounding box with margin for box filter window context
  const margin = r * 2 + 2;
  const roiX = Math.max(0, minX - margin);
  const roiY = Math.max(0, minY - margin);
  const roiR = Math.min(width, maxX + margin + 1);
  const roiB = Math.min(height, maxY + margin + 1);
  const roiW = roiR - roiX;
  const roiH = roiB - roiY;
  const roiSize = roiW * roiH;

  // Sub-window guidance and prior buffers
  const I_r = new Float32Array(roiSize);
  const I_g = new Float32Array(roiSize);
  const I_b = new Float32Array(roiSize);
  const p = new Float32Array(roiSize);

  const stride = rgb.length >= size * 4 ? 4 : 3;

  for (let ry = 0; ry < roiH; ry++) {
    const gy = roiY + ry;
    const gRow = gy * width;
    const rRow = ry * roiW;
    for (let rx = 0; rx < roiW; rx++) {
      const gx = roiX + rx;
      const gIdx = gRow + gx;
      const rIdx = rRow + rx;

      const sIdx = gIdx * stride;
      I_r[rIdx] = rgb[sIdx] / 255.0;
      I_g[rIdx] = rgb[sIdx + 1] / 255.0;
      I_b[rIdx] = rgb[sIdx + 2] / 255.0;

      const t = trimap[gIdx];
      if (t === 255) {
        p[rIdx] = 1.0;
      } else if (t === 0) {
        p[rIdx] = 0.0;
      } else {
        // Unknown band prior: use model continuous confidence if available,
        // or properly normalized foreground indicator (not crushed by 1/255)
        if (confidenceMap && confidenceMap.length === size) {
          p[rIdx] = Math.max(0.0, Math.min(1.0, confidenceMap[gIdx]));
        } else {
          const val = coarseAlpha[gIdx];
          p[rIdx] = val > 1 ? val / 255.0 : (val === 1 ? 1.0 : 0.0);
        }
      }
    }
  }

  // Compute means of guidance image and target on ROI
  const mean_r = boxFilter(I_r, roiW, roiH, r);
  const mean_g = boxFilter(I_g, roiW, roiH, r);
  const mean_b = boxFilter(I_b, roiW, roiH, r);
  const mean_p = boxFilter(p, roiW, roiH, r);

  const I_rr = new Float32Array(roiSize);
  const I_rg = new Float32Array(roiSize);
  const I_rb = new Float32Array(roiSize);
  const I_gg = new Float32Array(roiSize);
  const I_gb = new Float32Array(roiSize);
  const I_bb = new Float32Array(roiSize);

  const I_rp = new Float32Array(roiSize);
  const I_gp = new Float32Array(roiSize);
  const I_bp = new Float32Array(roiSize);

  for (let i = 0; i < roiSize; i++) {
    const rVal = I_r[i];
    const gVal = I_g[i];
    const bVal = I_b[i];
    const pVal = p[i];

    I_rr[i] = rVal * rVal;
    I_rg[i] = rVal * gVal;
    I_rb[i] = rVal * bVal;
    I_gg[i] = gVal * gVal;
    I_gb[i] = gVal * bVal;
    I_bb[i] = bVal * bVal;

    I_rp[i] = rVal * pVal;
    I_gp[i] = gVal * pVal;
    I_bp[i] = bVal * pVal;
  }

  const mean_rr = boxFilter(I_rr, roiW, roiH, r);
  const mean_rg = boxFilter(I_rg, roiW, roiH, r);
  const mean_rb = boxFilter(I_rb, roiW, roiH, r);
  const mean_gg = boxFilter(I_gg, roiW, roiH, r);
  const mean_gb = boxFilter(I_gb, roiW, roiH, r);
  const mean_bb = boxFilter(I_bb, roiW, roiH, r);

  const mean_rp = boxFilter(I_rp, roiW, roiH, r);
  const mean_gp = boxFilter(I_gp, roiW, roiH, r);
  const mean_bp = boxFilter(I_bp, roiW, roiH, r);

  const a_r = new Float32Array(roiSize);
  const a_g = new Float32Array(roiSize);
  const a_b = new Float32Array(roiSize);
  const b = new Float32Array(roiSize);

  // Invert 3x3 covariance matrix (Sigma + eps * I) at each pixel in ROI
  for (let ry = 0; ry < roiH; ry++) {
    const gy = roiY + ry;
    const gRow = gy * width;
    const rRow = ry * roiW;
    for (let rx = 0; rx < roiW; rx++) {
      const gIdx = gRow + roiX + rx;
      const rIdx = rRow + rx;

      const mr = mean_r[rIdx];
      const mg = mean_g[rIdx];
      const mb = mean_b[rIdx];
      const mp = mean_p[rIdx];

      const cRR = mean_rr[rIdx] - mr * mr + eps;
      const cRG = mean_rg[rIdx] - mr * mg;
      const cRB = mean_rb[rIdx] - mr * mb;
      const cGG = mean_gg[rIdx] - mg * mg + eps;
      const cGB = mean_gb[rIdx] - mg * mb;
      const cBB = mean_bb[rIdx] - mb * mb + eps;

      const cov_rp = mean_rp[rIdx] - mr * mp;
      const cov_gp = mean_gp[rIdx] - mg * mp;
      const cov_bp = mean_bp[rIdx] - mb * mp;

      // 3x3 Determinant
      const inv00 = cGG * cBB - cGB * cGB;
      const inv01 = cRB * cGB - cRG * cBB;
      const inv02 = cRG * cGB - cRB * cGG;

      const det = cRR * inv00 + cRG * inv01 + cRB * inv02;

      if (Math.abs(det) < 1e-12) {
        b[rIdx] = mp;
        continue;
      }

      const invDet = 1.0 / det;

      const inv10 = inv01;
      const inv11 = cRR * cBB - cRB * cRB;
      const inv12 = cRB * cRG - cRR * cGB;

      const inv20 = inv02;
      const inv21 = inv12;
      const inv22 = cRR * cGG - cRG * cRG;

      const ar = (inv00 * cov_rp + inv10 * cov_gp + inv20 * cov_bp) * invDet;
      const ag = (inv01 * cov_rp + inv11 * cov_gp + inv21 * cov_bp) * invDet;
      const ab = (inv02 * cov_rp + inv12 * cov_gp + inv22 * cov_bp) * invDet;

      a_r[rIdx] = ar;
      a_g[rIdx] = ag;
      a_b[rIdx] = ab;
      b[rIdx] = mp - ar * mr - ag * mg - ab * mb;
    }
  }

  const mean_ar = boxFilter(a_r, roiW, roiH, r);
  const mean_ag = boxFilter(a_g, roiW, roiH, r);
  const mean_ab = boxFilter(a_b, roiW, roiH, r);
  const mean_b_val = boxFilter(b, roiW, roiH, r);

  // Write back refined alpha strictly to unknown band pixels
  for (let ry = 0; ry < roiH; ry++) {
    const gy = roiY + ry;
    const gRow = gy * width;
    const rRow = ry * roiW;
    for (let rx = 0; rx < roiW; rx++) {
      const gIdx = gRow + roiX + rx;
      const rIdx = rRow + rx;
      if (trimap[gIdx] === 128) {
        const q = mean_ar[rIdx] * I_r[rIdx] + mean_ag[rIdx] * I_g[rIdx] + mean_ab[rIdx] * I_b[rIdx] + mean_b_val[rIdx];
        const clamped = Math.max(0.0, Math.min(1.0, q));
        outAlpha[gIdx] = Math.round(clamped * 255.0);
      }
    }
  }

  return outAlpha;
}

/**
 * Guarded Physical Foreground Color Decontamination.
 * Based on the optical compositing equation:
 *   Observed RGB = alpha * Foreground RGB + (1 - alpha) * Background RGB
 *   => F_unmixed = (Observed RGB - (1 - alpha) * B_local) / alpha
 *
 * Estimates nearby background (from definite BG trimap) and nearby foreground (from definite FG trimap).
 * Smoothly guards against noise amplification at low alpha (alpha < 0.35) by blending toward F_local.
 *
 * CRITICAL INVARIANT:
 * Fully opaque interior pixels (alpha === 255) remain 100% untouched camera RGB bitwise.
 */
export function decontaminateEdgeColor(
  rgba: Uint8ClampedArray | Uint8Array,
  alpha: Uint8Array,
  trimap: Uint8Array,
  width: number,
  height: number,
  searchRadius: number = 6
): Uint8ClampedArray {
  const size = width * height;
  const outRgba = new Uint8ClampedArray(rgba);

  const radius = Math.max(2, Math.min(15, searchRadius));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const a = alpha[idx];

      // Interior pixel: pristine untouched camera RGB
      if (a === 255) {
        outRgba[idx * 4 + 3] = 255;
        continue;
      }

      // Background pixel: fully transparent
      if (a === 0) {
        outRgba[idx * 4 + 3] = 0;
        continue;
      }

      const outOff = idx * 4;
      outRgba[outOff + 3] = a;
      const normA = a / 255.0;

      // Sample nearby definite background (B_local) and definite foreground (F_local)
      let sumBgR = 0, sumBgG = 0, sumBgB = 0, totalBgWeight = 0;
      let sumFgR = 0, sumFgG = 0, sumFgB = 0, totalFgWeight = 0;

      const minPy = Math.max(0, y - radius);
      const maxPy = Math.min(height - 1, y + radius);
      const minPx = Math.max(0, x - radius);
      const maxPx = Math.min(width - 1, x + radius);

      for (let py = minPy; py <= maxPy; py++) {
        const pRow = py * width;
        const dy = py - y;
        for (let px = minPx; px <= maxPx; px++) {
          const pIdx = pRow + px;
          const tVal = trimap[pIdx];
          const dx = px - x;
          const distSq = dx * dx + dy * dy;

          if (distSq <= radius * radius) {
            const weight = 1.0 / (Math.sqrt(distSq) + 0.5);
            const pOff = pIdx * 4;

            if (tVal === 0) {
              sumBgR += rgba[pOff] * weight;
              sumBgG += rgba[pOff + 1] * weight;
              sumBgB += rgba[pOff + 2] * weight;
              totalBgWeight += weight;
            } else if (tVal === 255 || alpha[pIdx] === 255) {
              sumFgR += rgba[pOff] * weight;
              sumFgG += rgba[pOff + 1] * weight;
              sumFgB += rgba[pOff + 2] * weight;
              totalFgWeight += weight;
            }
          }
        }
      }

      const obsR = rgba[outOff];
      const obsG = rgba[outOff + 1];
      const obsB = rgba[outOff + 2];

      const hasBg = totalBgWeight > 0;
      const hasFg = totalFgWeight > 0;

      const fgLocalR = hasFg ? sumFgR / totalFgWeight : obsR;
      const fgLocalG = hasFg ? sumFgG / totalFgWeight : obsG;
      const fgLocalB = hasFg ? sumFgB / totalFgWeight : obsB;

      if (hasBg) {
        const bgR = sumBgR / totalBgWeight;
        const bgG = sumBgG / totalBgWeight;
        const bgB = sumBgB / totalBgWeight;

        // Physical unmixing equation: F = (C - (1 - a) * B) / a
        const unmixedR = Math.max(0, Math.min(255, (obsR - (1.0 - normA) * bgR) / normA));
        const unmixedG = Math.max(0, Math.min(255, (obsG - (1.0 - normA) * bgG) / normA));
        const unmixedB = Math.max(0, Math.min(255, (obsB - (1.0 - normA) * bgB) / normA));

        // Guard against noise amplification when alpha is small (< 0.35)
        const blendWeight = Math.max(0.0, Math.min(1.0, (normA - 0.08) / 0.27));
        outRgba[outOff] = Math.round(blendWeight * unmixedR + (1.0 - blendWeight) * fgLocalR);
        outRgba[outOff + 1] = Math.round(blendWeight * unmixedG + (1.0 - blendWeight) * fgLocalG);
        outRgba[outOff + 2] = Math.round(blendWeight * unmixedB + (1.0 - blendWeight) * fgLocalB);
      } else if (hasFg) {
        // Only foreground prior available: blend toward prior as alpha -> 0
        const blendToPrior = 1.0 - normA;
        outRgba[outOff] = Math.round(obsR * (1.0 - blendToPrior) + fgLocalR * blendToPrior);
        outRgba[outOff + 1] = Math.round(obsG * (1.0 - blendToPrior) + fgLocalG * blendToPrior);
        outRgba[outOff + 2] = Math.round(obsB * (1.0 - blendToPrior) + fgLocalB * blendToPrior);
      }
    }
  }

  return outRgba;
}

/**
 * Master Alpha Matte Refinement Pipeline.
 * Dispatches between Candidate A, B, and C.
 */
export function refinePhotoAlphaMatte(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  coarseMask: Uint8Array,
  width: number,
  height: number,
  options: MattingOptions = {}
): MattingResult {
  const startTime = performance.now();
  const qualityMode = options.qualityMode ?? 'better';
  const algorithm = options.candidateAlgorithm ?? (qualityMode === 'fast' ? 'candidate-a' : 'candidate-c');

  // Candidate A: Baseline distance-transform smoothing (V1.6)
  if (algorithm === 'candidate-a') {
    const size = width * height;
    const alpha = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      if (coarseMask[i] > 0) alpha[i] = 255;
    }
    const trimap = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      trimap[i] = coarseMask[i] > 0 ? 255 : 0;
    }
    return {
      alpha,
      trimap,
      mattingDurationMs: performance.now() - startTime,
    };
  }

  // Candidate B: Continuous confidence preservation + joint RGB-guided upsampling
  if (algorithm === 'candidate-b' && options.confidenceMap) {
    const alpha = refineContinuousConfidence(
      sourceRgba,
      options.confidenceMap,
      width,
      height,
      options.radius ?? 5,
      options.eps ?? 1e-3
    );
    const trimap = generateTrimap(coarseMask, width, height, {
      hairDetail: options.hairDetail ?? 5,
      faceBounds: options.faceBounds,
    });
    return {
      alpha,
      trimap,
      mattingDurationMs: performance.now() - startTime,
    };
  }

  // Candidate C: Narrow-ROI Trimap + Closed-form RGB guided matting + Guarded Decontamination
  const trimap = generateTrimap(coarseMask, width, height, {
    hairDetail: options.hairDetail ?? 5,
    faceBounds: options.faceBounds,
    manualDelta: options.manualDelta,
  });

  const roi = computeUnknownBandRoi(trimap, width, height, 12);
  const guidedRadius = qualityMode === 'best' ? 7 : 5;
  const guidedEps = qualityMode === 'best' ? 1e-4 : 5e-4;

  const alpha = solveGuidedAlphaMatte(
    sourceRgba,
    coarseMask,
    trimap,
    width,
    height,
    guidedRadius,
    guidedEps,
    options.confidenceMap
  );

  // Decontamination is enabled by default ONLY in 'best' mode (or if explicitly requested)
  const shouldDecontaminate = options.decontaminateEdge ?? (qualityMode === 'best');
  let decontaminatedRgba: Uint8ClampedArray | undefined;

  if (shouldDecontaminate) {
    const decontamRadius = qualityMode === 'best' ? 7 : 5;
    decontaminatedRgba = decontaminateEdgeColor(
      sourceRgba,
      alpha,
      trimap,
      width,
      height,
      decontamRadius
    );
  }

  return {
    alpha,
    decontaminatedRgba,
    trimap,
    mattingDurationMs: performance.now() - startTime,
    roi,
  };
}
