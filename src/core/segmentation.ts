/**
 * Constrained exterior flood-fill and foreground segmentation engine.
 * Guarantees preservation of internal white/cream illustration features
 * by restricting background extraction to exterior-connected paths.
 */

import { colorDistance } from './color';

export interface SegmentationResult {
  alphaMask: Uint8Array; // 0 = transparent background, 255 = fully opaque foreground (0..255 antialiased)
  foregroundSupport: Uint8Array; // Binary 1 = foreground, 0 = background
  enclosedHoleCandidates: Array<{
    id: string;
    pixels: number[]; // Flat pixel indices
    bounds: { x: number; y: number; width: number; height: number };
  }>;
}

/**
 * Computes luminance gradient magnitude to detect outline barriers.
 */
function computeGradientMap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const size = width * height;
  const gradient = new Uint8Array(size);

  // Simple 3x3 Sobel-like luminance gradient
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const idxRight = idx + 4;
      const idxDown = (idx + width * 4);

      // Fast luminance: 0.299 R + 0.587 G + 0.114 B
      const lum = rgba[idx] * 0.299 + rgba[idx + 1] * 0.587 + rgba[idx + 2] * 0.114;
      const lumR = rgba[idxRight] * 0.299 + rgba[idxRight + 1] * 0.587 + rgba[idxRight + 2] * 0.114;
      const lumD = rgba[idxDown] * 0.299 + rgba[idxDown + 1] * 0.587 + rgba[idxDown + 2] * 0.114;

      const gx = Math.abs(lumR - lum);
      const gy = Math.abs(lumD - lum);
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 2.5);
      gradient[y * width + x] = mag;
    }
  }

  return gradient;
}

/**
 * Performs constrained exterior flood fill and alpha refinement.
 */
export function segmentForeground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bgColor: [number, number, number],
  tolerance: number = 18,
  edgeSoftness: number = 1.0
): SegmentationResult {
  const size = width * height;
  const bgR = bgColor[0];
  const bgG = bgColor[1];
  const bgB = bgColor[2];

  // 1 = visited exterior background, 0 = unvisited (potential foreground or hole)
  const isExteriorBg = new Uint8Array(size);

  // Barrier map: detect edges and dark outlines
  const gradient = computeGradientMap(rgba, width, height);

  // Queue for Breadth-First-Search (BFS) flood fill
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  // Color threshold: Euclidean color distance threshold
  const tolSq = tolerance * 2.5;
  const edgeBarrierThreshold = 35; // Outline edge barrier

  function isBgPixel(x: number, y: number): boolean {
    const idx = (y * width + x) * 4;
    const a = rgba[idx + 3];
    if (a < 20) return true; // Already transparent

    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];

    const dist = colorDistance(r, g, b, bgR, bgG, bgB);
    const grad = gradient[y * width + x];

    // It's background if color is very close to bg and not on a strong edge outline
    return dist <= tolSq && grad < edgeBarrierThreshold;
  }

  // Seed boundary perimeter (all 4 edges of the sheet)
  for (let x = 0; x < width; x++) {
    if (isBgPixel(x, 0)) {
      const idx = x;
      isExteriorBg[idx] = 1;
      queue[tail++] = idx;
    }
    if (isBgPixel(x, height - 1)) {
      const idx = (height - 1) * width + x;
      if (!isExteriorBg[idx]) {
        isExteriorBg[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }

  for (let y = 1; y < height - 1; y++) {
    if (isBgPixel(0, y)) {
      const idx = y * width;
      if (!isExteriorBg[idx]) {
        isExteriorBg[idx] = 1;
        queue[tail++] = idx;
      }
    }
    if (isBgPixel(width - 1, y)) {
      const idx = y * width + (width - 1);
      if (!isExteriorBg[idx]) {
        isExteriorBg[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }

  // 4-connected exterior flood fill
  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % width;
    const cy = Math.floor(curr / width);

    // Check 4 neighbors (Up, Down, Left, Right)
    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < width - 1 ? curr + 1 : -1,
      cy > 0 ? curr - width : -1,
      cy < height - 1 ? curr + width : -1
    ];

    for (let i = 0; i < 4; i++) {
      const nIdx = neighbors[i];
      if (nIdx === -1 || isExteriorBg[nIdx]) continue;

      const nx = nIdx % width;
      const ny = Math.floor(nIdx / width);

      const pxOffset = nIdx * 4;
      const a = rgba[pxOffset + 3];
      if (a < 20) {
        isExteriorBg[nIdx] = 1;
        queue[tail++] = nIdx;
        continue;
      }

      const r = rgba[pxOffset];
      const g = rgba[pxOffset + 1];
      const b = rgba[pxOffset + 2];
      const dist = colorDistance(r, g, b, bgR, bgG, bgB);
      const grad = gradient[nIdx];

      // Allow slight color deviation near background but stop at dark outlines / high gradients
      if (dist <= tolSq && grad < edgeBarrierThreshold) {
        isExteriorBg[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  // Initial foreground support: everything NOT reached by exterior flood fill
  const foregroundSupport = new Uint8Array(size);
  const alphaMask = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    const isBg = isExteriorBg[i] === 1;
    if (!isBg) {
      foregroundSupport[i] = 1;
      alphaMask[i] = 255;
    } else {
      foregroundSupport[i] = 0;
      alphaMask[i] = 0;
    }
  }

  // Alpha edge refinement: smooth antialiased transition along boundary
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      // Only refine border transition pixels
      if (foregroundSupport[idx] === 1) {
        // If it touches exterior background
        const touchesBg =
          isExteriorBg[idx - 1] ||
          isExteriorBg[idx + 1] ||
          isExteriorBg[idx - width] ||
          isExteriorBg[idx + width];

        if (touchesBg) {
          const pxOffset = idx * 4;
          const r = rgba[pxOffset];
          const g = rgba[pxOffset + 1];
          const b = rgba[pxOffset + 2];
          const dist = colorDistance(r, g, b, bgR, bgG, bgB);

          // If color is very close to background right on boundary, assign anti-aliased partial alpha
          if (dist < tolSq) {
            const ratio = dist / tolSq;
            const smoothA = Math.round(Math.min(255, Math.max(0, ratio * 255)));
            alphaMask[idx] = smoothA;
          }
        }
      }
    }
  }

  // Identify enclosed candidate holes:
  // Any unreached region whose interior color is within tolerance of background
  // and completely surrounded by foreground artwork
  const enclosedHoleCandidates: SegmentationResult['enclosedHoleCandidates'] = [];
  const holeVisited = new Uint8Array(size);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      if (isExteriorBg[idx] || holeVisited[idx]) continue;

      const pxOffset = idx * 4;
      const r = rgba[pxOffset];
      const g = rgba[pxOffset + 1];
      const b = rgba[pxOffset + 2];
      const dist = colorDistance(r, g, b, bgR, bgG, bgB);

      // If it looks like background color but was trapped inside an outline
      if (dist < tolSq * 0.75 && gradient[idx] < 20) {
        // Flood fill to get whole candidate component
        const holeQueue = [idx];
        const holePixels: number[] = [];
        holeVisited[idx] = 1;
        let minX = x, maxX = x, minY = y, maxY = y;
        let isTrueEnclosure = true;

        let qHead = 0;
        while (qHead < holeQueue.length) {
          const cur = holeQueue[qHead++];
          holePixels.push(cur);
          const hx = cur % width;
          const hy = Math.floor(cur / width);

          if (hx < minX) minX = hx;
          if (hx > maxX) maxX = hx;
          if (hy < minY) minY = hy;
          if (hy > maxY) maxY = hy;

          if (hx <= 1 || hx >= width - 2 || hy <= 1 || hy >= height - 2) {
            isTrueEnclosure = false;
          }

          const hNeighbors = [cur - 1, cur + 1, cur - width, cur + width];
          for (const hn of hNeighbors) {
            if (hn < 0 || hn >= size || holeVisited[hn] || isExteriorBg[hn]) continue;
            const nOff = hn * 4;
            const ndist = colorDistance(rgba[nOff], rgba[nOff + 1], rgba[nOff + 2], bgR, bgG, bgB);
            if (ndist < tolSq * 0.85 && gradient[hn] < 25) {
              holeVisited[hn] = 1;
              holeQueue.push(hn);
            }
          }
        }

        // Only record plausible enclosed holes of reasonable size (> 25px, < 30% of sheet)
        if (isTrueEnclosure && holePixels.length >= 25 && holePixels.length < size * 0.2) {
          enclosedHoleCandidates.push({
            id: `hole_${enclosedHoleCandidates.length + 1}`,
            pixels: holePixels,
            bounds: {
              x: minX,
              y: minY,
              width: maxX - minX + 1,
              height: maxY - minY + 1
            }
          });
        }
      }
    }
  }

  return {
    alphaMask,
    foregroundSupport,
    enclosedHoleCandidates
  };
}
