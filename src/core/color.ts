/**
 * Color distance and background estimation utilities.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Perceptually weighted Euclidean color distance (low-cost CIE76 approximation).
 */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Approximation of human eye sensitivity to red, green, and blue
  const weightR = 2 + rmean / 256;
  const weightG = 4.0;
  const weightB = 2 + (255 - rmean) / 256;
  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}

/**
 * Estimates dominant background color by sampling low-variance perimeter blocks.
 * Rejects foreground outliers (such as illustrations touching or near edges).
 */
export function estimateBackgroundColor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number] {
  const sampleColors: Array<[number, number, number]> = [];
  const borderDepth = Math.min(24, Math.floor(Math.min(width, height) * 0.05));
  const step = Math.max(2, Math.floor(Math.min(width, height) / 300));

  // Helper to sample a patch and return variance and average color
  function samplePatch(
    startX: number,
    startY: number,
    w: number,
    h: number
  ): { variance: number; avg: [number, number, number] } | null {
    let count = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    let sumSqR = 0, sumSqG = 0, sumSqB = 0;

    for (let y = startY; y < startY + h && y < height; y += step) {
      for (let x = startX; x < startX + w && x < width; x += step) {
        const idx = (y * width + x) * 4;
        const a = rgba[idx + 3];
        if (a < 50) continue; // Skip already-transparent pixels
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];

        sumR += r;
        sumG += g;
        sumB += b;
        sumSqR += r * r;
        sumSqG += g * g;
        sumSqB += b * b;
        count++;
      }
    }

    if (count < 4) return null;
    const avgR = sumR / count;
    const avgG = sumG / count;
    const avgB = sumB / count;
    const varR = sumSqR / count - avgR * avgR;
    const varG = sumSqG / count - avgG * avgG;
    const varB = sumSqB / count - avgB * avgB;
    const totalVar = varR + varG + varB;

    return { variance: totalVar, avg: [Math.round(avgR), Math.round(avgG), Math.round(avgB)] };
  }

  const patchSize = 16;
  const patches: Array<{ variance: number; avg: [number, number, number] }> = [];

  // Top and bottom borders
  for (let x = 0; x < width - patchSize; x += patchSize * 2) {
    const topP = samplePatch(x, 0, patchSize, borderDepth);
    if (topP) patches.push(topP);
    const btmP = samplePatch(x, Math.max(0, height - borderDepth), patchSize, borderDepth);
    if (btmP) patches.push(btmP);
  }

  // Left and right borders
  for (let y = borderDepth; y < height - borderDepth - patchSize; y += patchSize * 2) {
    const leftP = samplePatch(0, y, borderDepth, patchSize);
    if (leftP) patches.push(leftP);
    const rightP = samplePatch(Math.max(0, width - borderDepth), y, borderDepth, patchSize);
    if (rightP) patches.push(rightP);
  }

  if (patches.length === 0) {
    return [255, 255, 255]; // Default fallback
  }

  // Sort by lowest variance (cleanest, most uniform background areas)
  patches.sort((a, b) => a.variance - b.variance);

  // Take the median color from the 50% lowest-variance patches
  const topPatches = patches.slice(0, Math.max(1, Math.floor(patches.length * 0.6)));
  const reds = topPatches.map(p => p.avg[0]).sort((a, b) => a - b);
  const greens = topPatches.map(p => p.avg[1]).sort((a, b) => a - b);
  const blues = topPatches.map(p => p.avg[2]).sort((a, b) => a - b);

  const mid = Math.floor(topPatches.length / 2);
  return [reds[mid], greens[mid], blues[mid]];
}
