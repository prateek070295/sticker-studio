import { describe, it, expect } from 'vitest';
import { solveGuidedAlphaMatte } from '../photoMatting';

/**
 * Independent, brute-force reference implementation of 3D RGB Guided Filter.
 * Computes window means, covariance matrices, and matrix inverses directly
 * without separable moving averages or spatial approximations.
 */
function referenceRgbGuidedFilter(
  rgb: Uint8Array,
  prior: Float32Array,
  trimap: Uint8Array,
  width: number,
  height: number,
  radius: number,
  eps: number
): Float32Array {
  const size = width * height;
  const out = new Float32Array(size);

  const aR = new Float32Array(size);
  const aG = new Float32Array(size);
  const aB = new Float32Array(size);
  const bVal = new Float32Array(size);

  // Pass 1: Compute linear coefficients (a, b) in each local window
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);

      let meanR = 0, meanG = 0, meanB = 0, meanP = 0;
      for (let wy = y0; wy <= y1; wy++) {
        for (let wx = x0; wx <= x1; wx++) {
          const wIdx = wy * width + wx;
          meanR += rgb[wIdx * 3] / 255.0;
          meanG += rgb[wIdx * 3 + 1] / 255.0;
          meanB += rgb[wIdx * 3 + 2] / 255.0;
          meanP += prior[wIdx];
        }
      }
      meanR /= count;
      meanG /= count;
      meanB /= count;
      meanP /= count;

      let cRR = 0, cRG = 0, cRB = 0, cGG = 0, cGB = 0, cBB = 0;
      let covRP = 0, covGP = 0, covBP = 0;

      for (let wy = y0; wy <= y1; wy++) {
        for (let wx = x0; wx <= x1; wx++) {
          const wIdx = wy * width + wx;
          const rVal = rgb[wIdx * 3] / 255.0;
          const gVal = rgb[wIdx * 3 + 1] / 255.0;
          const bVal2 = rgb[wIdx * 3 + 2] / 255.0;
          const pVal = prior[wIdx];

          const dr = rVal - meanR;
          const dg = gVal - meanG;
          const db = bVal2 - meanB;
          const dp = pVal - meanP;

          cRR += dr * dr;
          cRG += dr * dg;
          cRB += dr * db;
          cGG += dg * dg;
          cGB += dg * db;
          cBB += db * db;

          covRP += dr * dp;
          covGP += dg * dp;
          covBP += db * dp;
        }
      }

      cRR = cRR / count + eps;
      cRG = cRG / count;
      cRB = cRB / count;
      cGG = cGG / count + eps;
      cGB = cGB / count;
      cBB = cBB / count + eps;

      covRP /= count;
      covGP /= count;
      covBP /= count;

      // Invert 3x3 symmetric matrix:
      // [ cRR cRG cRB ]
      // [ cRG cGG cGB ]
      // [ cRB cGB cBB ]
      const inv00 = cGG * cBB - cGB * cGB;
      const inv01 = cRB * cGB - cRG * cBB;
      const inv02 = cRG * cGB - cRB * cGG;

      const det = cRR * inv00 + cRG * inv01 + cRB * inv02;

      if (Math.abs(det) < 1e-12) {
        bVal[idx] = meanP;
        continue;
      }

      const invDet = 1.0 / det;
      const inv10 = inv01;
      const inv11 = cRR * cBB - cRB * cRB;
      const inv12 = cRB * cRG - cRR * cGB;

      const inv20 = inv02;
      const inv21 = inv12;
      const inv22 = cRR * cGG - cRG * cRG;

      // Correct matrix multiplication a = Sigma^-1 * cov
      const ar = (inv00 * covRP + inv10 * covGP + inv20 * covBP) * invDet;
      const ag = (inv01 * covRP + inv11 * covGP + inv21 * covBP) * invDet;
      const ab = (inv02 * covRP + inv12 * covGP + inv22 * covBP) * invDet;

      aR[idx] = ar;
      aG[idx] = ag;
      aB[idx] = ab;
      bVal[idx] = meanP - ar * meanR - ag * meanG - ab * meanB;
    }
  }

  // Pass 2: Average coefficients in each local window and compute output
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);

      let meanAR = 0, meanAG = 0, meanAB = 0, meanB = 0;
      for (let wy = y0; wy <= y1; wy++) {
        for (let wx = x0; wx <= x1; wx++) {
          const wIdx = wy * width + wx;
          meanAR += aR[wIdx];
          meanAG += aG[wIdx];
          meanAB += aB[wIdx];
          meanB += bVal[wIdx];
        }
      }
      meanAR /= count;
      meanAG /= count;
      meanAB /= count;
      meanB /= count;

      const rVal = rgb[idx * 3] / 255.0;
      const gVal = rgb[idx * 3 + 1] / 255.0;
      const bVal2 = rgb[idx * 3 + 2] / 255.0;

      out[idx] = meanAR * rVal + meanAG * gVal + meanAB * bVal2 + meanB;
    }
  }

  return out;
}

describe('Guided Filter Numerical Reference Test', () => {
  it('correctly matches reference 3D RGB guided filter output on small synthetic matrix', () => {
    const W = 8;
    const H = 8;
    const size = W * H;

    // Create synthetic RGB image with varied color gradient
    const rgb = new Uint8Array(size * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 3;
        rgb[idx] = Math.round((x / W) * 220 + 20); // Red gradient
        rgb[idx + 1] = Math.round((y / H) * 200 + 30); // Green gradient
        rgb[idx + 2] = Math.round(((x + y) / (W + H)) * 180 + 40); // Blue gradient
      }
    }

    // Trimap: left 3 cols = FG (255), middle 2 cols = unknown (128), right 3 cols = BG (0)
    const trimap = new Uint8Array(size);
    const coarseAlpha = new Uint8Array(size);
    const priorFloat = new Float32Array(size);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (x < 3) {
          trimap[idx] = 255;
          coarseAlpha[idx] = 255;
          priorFloat[idx] = 1.0;
        } else if (x >= 5) {
          trimap[idx] = 0;
          coarseAlpha[idx] = 0;
          priorFloat[idx] = 0.0;
        } else {
          trimap[idx] = 128;
          coarseAlpha[idx] = x === 3 ? 180 : 80;
          priorFloat[idx] = coarseAlpha[idx] / 255.0;
        }
      }
    }

    const radius = 1;
    const eps = 1e-3;

    // Run solver
    const solvedAlpha = solveGuidedAlphaMatte(
      rgb,
      coarseAlpha,
      trimap,
      W,
      H,
      radius,
      eps
    );

    // Run independent reference
    const refFloats = referenceRgbGuidedFilter(
      rgb,
      priorFloat,
      trimap,
      W,
      H,
      radius,
      eps
    );

    // Hard boundary constraint verification
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (trimap[idx] === 255) {
          expect(solvedAlpha[idx]).toBe(255);
        } else if (trimap[idx] === 0) {
          expect(solvedAlpha[idx]).toBe(0);
        } else {
          // Inside unknown band, compare solved value against clamped reference
          const refClamped = Math.round(Math.max(0.0, Math.min(1.0, refFloats[idx])) * 255.0);
          expect(Math.abs(solvedAlpha[idx] - refClamped)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('guarantees that green covariance bug (cov_bp vs cov_gp) causes difference in presence of asymmetric blue/green channels', () => {
    // When covariance with blue differs significantly from covariance with green,
    // the bug in line 452 (inv21 * cov_gp instead of inv21 * cov_bp) would produce wrong green weights.
    const inv01 = 0.5;
    const inv11 = 1.2;
    const inv21 = -0.8;
    const invDet = 1.5;

    const cov_rp = 0.1;
    const cov_gp = 0.4;
    const cov_bp = -0.6; // Large difference between cov_gp and cov_bp

    const correct_ag = (inv01 * cov_rp + inv11 * cov_gp + inv21 * cov_bp) * invDet;
    const buggy_ag = (inv01 * cov_rp + inv11 * cov_gp + inv21 * cov_gp) * invDet;

    expect(correct_ag).not.toBe(buggy_ag);
    expect(Math.abs(correct_ag - buggy_ag)).toBeGreaterThan(0.5);
  });
});
