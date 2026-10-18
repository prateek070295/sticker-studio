/**
 * Photographic Artwork Edge Smoothing & Alpha Matte Refinement.
 * Produces clean, professional 8-bit antialiased alpha cutouts (0..255)
 * from accepted subject masks without modifying interior photographic RGB
 * or leaking into unaccepted background pixels.
 */

import { computeEuclideanDistanceTransform } from './edt';

/**
 * Refines a binary accepted subject mask into a continuous, antialiased 8-bit alpha matte (0..255).
 * Eliminates staircase jaggies along hair, shoulders, and clothing silhouettes.
 *
 * @param mask Binary mask (0 = background, >0 = accepted foreground)
 * @param width Image width
 * @param height Image height
 * @param smoothness Spatial boundary smoothing strength (0 to 10, default 0)
 * @param feather Alpha transition ramp width in pixels (0 to 3 px, default 0)
 * @returns 8-bit alpha matte (Uint8Array, length width * height, values 0..255)
 */
export function refineArtworkAlpha(
  mask: Uint8Array,
  width: number,
  height: number,
  smoothness: number = 0,
  feather: number = 0
): Uint8Array {
  const size = width * height;
  const alpha = new Uint8Array(size);

  // Fast path: bit-for-bit baseline reversibility when both controls are 0
  if (smoothness <= 0 && feather <= 0) {
    for (let i = 0; i < size; i++) {
      if (mask[i] > 0) alpha[i] = 255;
    }
    return alpha;
  }

  // 1. Build inverted mask for inside distance transform (foreground pixels to nearest background)
  const invMask = new Uint8Array(size);
  let hasFg = false;
  let hasBg = false;
  for (let i = 0; i < size; i++) {
    if (mask[i] > 0) {
      invMask[i] = 0;
      hasFg = true;
    } else {
      invMask[i] = 1;
      hasBg = true;
    }
  }

  // Edge cases: completely empty or completely filled mask
  if (!hasFg) return alpha;
  if (!hasBg) {
    alpha.fill(255);
    return alpha;
  }

  // D_in: distance from each pixel to the nearest background pixel (D_in >= 1.0 for foreground)
  const distIn = computeEuclideanDistanceTransform(invMask, width, height);

  // 2. Spatial boundary smoothing if smoothness > 0
  let effectiveDist = distIn;
  if (smoothness > 0) {
    const r = Math.max(1, Math.min(15, Math.round(smoothness * 1.2)));
    const bandThreshold = r * 2 + 3;

    // High-performance cache-friendly separable moving average
    let current = new Float32Array(distIn);
    const temp = new Float32Array(size);
    const out = new Float32Array(size);
    const windowLen = 2 * r + 1;
    const invWindow = 1.0 / windowLen;

    for (let pass = 0; pass < 2; pass++) {
      // 1. Horizontal pass: contiguous rows
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const px = Math.max(0, Math.min(width - 1, k));
          sum += current[rowOffset + px];
        }
        temp[rowOffset] = sum * invWindow;
        for (let x = 1; x < width; x++) {
          const drop = Math.max(0, x - r - 1);
          const add = Math.min(width - 1, x + r);
          sum += current[rowOffset + add] - current[rowOffset + drop];
          temp[rowOffset + x] = sum * invWindow;
        }
      }

      // 2. Vertical pass: cache-friendly contiguous row-wise sliding sum
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
        const dropY = Math.max(0, y - r - 1) * width;
        const addY = Math.min(height - 1, y + r) * width;
        const outY = y * width;
        for (let x = 0; x < width; x++) {
          colSum[x] += temp[addY + x] - temp[dropY + x];
          out[outY + x] = colSum[x] * invWindow;
        }
      }
      current.set(out);
    }

    // Blend smoothed distance near the boundary, keeping deep interior distance exact
    effectiveDist = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      if (mask[i] === 0) {
        effectiveDist[i] = 0;
      } else if (distIn[i] > bandThreshold) {
        effectiveDist[i] = distIn[i];
      } else {
        effectiveDist[i] = current[i];
      }
    }
  }

  // 3. Map distance to antialiased alpha with Hermite smoothstep
  // Nominal boundary is at d = 0 (pixel center at dist = 0.5)
  // Transition width in pixels:
  const transitionWidth = 1.0 + Math.max(0, Math.min(3, feather));

  for (let i = 0; i < size; i++) {
    // Strictly enforce zero background leakage: never render unaccepted background pixels
    if (mask[i] === 0) {
      alpha[i] = 0;
      continue;
    }

    const d = effectiveDist[i] - 0.5;
    if (d <= 0) {
      // Acute convex tip or outer boundary pixel:
      // Provide subtle minimum coverage (at least 15%) so thin tips don't disappear
      const subpixelCoverage = Math.max(0.15, Math.min(1, effectiveDist[i] / transitionWidth));
      alpha[i] = Math.round(subpixelCoverage * 255);
    } else if (d >= transitionWidth) {
      // Deep inside foreground: 100% opaque, untouched camera RGB
      alpha[i] = 255;
    } else {
      // Continuous smoothstep Hermite interpolation: 3t^2 - 2t^3
      const t = d / transitionWidth;
      const smoothT = t * t * (3 - 2 * t);
      alpha[i] = Math.round(Math.max(1, Math.min(255, smoothT * 255)));
    }
  }

  return alpha;
}
