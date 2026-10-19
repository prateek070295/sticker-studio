/**
 * Near-Head Accessory Attacher & Component Merger.
 * Identifies decorative items and accessories near the head/hair/temple/crown
 * (e.g. hair flowers, hair clips, headbands, ribbons, earrings, hats)
 * and bridges them into the subject prior rather than pruning them as noise.
 */

import { BoundingBox } from '../types/index';
import { computeEuclideanDistanceTransform } from './edt';

export interface AccessoryMergeOptions {
  enabled?: boolean; // default true
  maxAttachmentDistance?: number; // default 16 px
  headZoneRatio?: number; // default top 65% of person height
  minAccessoryPixels?: number; // default 15 px
  maxAccessoryPixels?: number; // default 25% of image
}

export interface AccessoryMergeResult {
  mask: Uint8Array;
  attachedCount: number;
  accessoryBoxes: BoundingBox[];
}

interface ComponentInfo {
  id: number;
  pixelCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pixels: number[];
  isPrimary: boolean;
  minDistToPrimary: number;
}

/**
 * Merges attached accessories near the head and hair boundary into the primary person mask.
 */
export function mergeAttachedAccessories(
  rawMask: Uint8Array,
  width: number,
  height: number,
  coreBox: BoundingBox,
  options: AccessoryMergeOptions = {}
): AccessoryMergeResult {
  const enabled = options.enabled ?? true;
  if (!enabled) {
    return {
      mask: new Uint8Array(rawMask),
      attachedCount: 0,
      accessoryBoxes: [],
    };
  }

  const size = width * height;
  const maxDist = options.maxAttachmentDistance ?? 16;
  const headZoneRatio = options.headZoneRatio ?? 0.65;
  const minPixels = options.minAccessoryPixels ?? 15;
  const maxPixels = options.maxAccessoryPixels ?? Math.round(size * 0.25);

  const headYThreshold = coreBox.y + coreBox.height * headZoneRatio;

  // 1. Connected Component Labeling (8-way)
  const labels = new Int32Array(size);
  let currentLabel = 0;
  const components: ComponentInfo[] = [];

  const queue: number[] = [];

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (rawMask[idx] > 0 && labels[idx] === 0) {
        currentLabel++;
        labels[idx] = currentLabel;
        queue.push(idx);

        let pCount = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        const compPixels: number[] = [];

        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          pCount++;
          compPixels.push(curr);

          const cx = curr % width;
          const cy = Math.floor(curr / width);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 8-way neighbors
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= height) continue;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= width) continue;
              const nIdx = nRow + nx;
              if (rawMask[nIdx] > 0 && labels[nIdx] === 0) {
                labels[nIdx] = currentLabel;
                queue.push(nIdx);
              }
            }
          }
        }
        queue.length = 0;

        components.push({
          id: currentLabel,
          pixelCount: pCount,
          minX,
          maxX,
          minY,
          maxY,
          pixels: compPixels,
          isPrimary: false,
          minDistToPrimary: Infinity,
        });
      }
    }
  }

  if (components.length === 0) {
    return { mask: new Uint8Array(rawMask), attachedCount: 0, accessoryBoxes: [] };
  }

  // 2. Classify Primary Person Components (those overlapping coreBox)
  const cMinX = Math.max(0, coreBox.x);
  const cMaxX = Math.min(width - 1, coreBox.x + coreBox.width);
  const cMinY = Math.max(0, coreBox.y);
  const cMaxY = Math.min(height - 1, coreBox.y + coreBox.height);

  let hasPrimary = false;
  for (const comp of components) {
    // Check overlap with coreBox
    const overlapX = Math.max(0, Math.min(comp.maxX, cMaxX) - Math.max(comp.minX, cMinX));
    const overlapY = Math.max(0, Math.min(comp.maxY, cMaxY) - Math.max(comp.minY, cMinY));
    const overlapArea = overlapX * overlapY;

    if (overlapArea > 0 || (comp.minX >= cMinX && comp.maxX <= cMaxX && comp.minY >= cMinY && comp.maxY <= cMaxY)) {
      comp.isPrimary = true;
      hasPrimary = true;
    }
  }

  // Fallback: if no component overlapped coreBox, the largest component is primary
  if (!hasPrimary) {
    let maxIdx = 0;
    for (let i = 1; i < components.length; i++) {
      if (components[i].pixelCount > components[maxIdx].pixelCount) {
        maxIdx = i;
      }
    }
    components[maxIdx].isPrimary = true;
  }

  // Build binary primary mask to calculate Euclidean distance to primary
  const primaryMask = new Uint8Array(size);
  for (const comp of components) {
    if (comp.isPrimary) {
      for (const idx of comp.pixels) {
        primaryMask[idx] = 1;
      }
    }
  }

  const distToPrimary = computeEuclideanDistanceTransform(primaryMask, width, height);

  // 3. Evaluate non-primary candidate components
  const outMask = new Uint8Array(size);
  outMask.set(primaryMask);

  const attachedBoxes: BoundingBox[] = [];
  let attachedCount = 0;

  for (const comp of components) {
    if (comp.isPrimary) continue;

    // Filter by size
    if (comp.pixelCount < minPixels || comp.pixelCount > maxPixels) continue;

    // Check if in head/hair zone
    const isHeadZone = comp.minY <= headYThreshold || comp.maxY <= headYThreshold;
    if (!isHeadZone) continue;

    // Find minimum distance of this component to primary mask
    let minDist = Infinity;
    let closestCompIdx = -1;

    for (const idx of comp.pixels) {
      const d = distToPrimary[idx];
      if (d < minDist) {
        minDist = d;
        closestCompIdx = idx;
      }
    }
    comp.minDistToPrimary = minDist;

    // If within attachment threshold, attach and merge!
    if (minDist <= maxDist) {
      attachedCount++;
      attachedBoxes.push({
        x: comp.minX,
        y: comp.minY,
        width: comp.maxX - comp.minX + 1,
        height: comp.maxY - comp.minY + 1,
      });

      // Add component pixels to result
      for (const idx of comp.pixels) {
        outMask[idx] = 1;
      }

      // Fill a small bridge to guarantee topological connectivity
      if (closestCompIdx >= 0 && minDist > 1.0) {
        const startX = closestCompIdx % width;
        const startY = Math.floor(closestCompIdx / width);

        // Bresenham walk toward closest primary pixel
        // Find nearest primary point within neighborhood
        let bestTargetX = startX;
        let bestTargetY = startY;
        let bestTargetDist = Infinity;

        const sRad = Math.ceil(minDist) + 2;
        const sy0 = Math.max(0, startY - sRad);
        const sy1 = Math.min(height - 1, startY + sRad);
        const sx0 = Math.max(0, startX - sRad);
        const sx1 = Math.min(width - 1, startX + sRad);

        for (let py = sy0; py <= sy1; py++) {
          const pRow = py * width;
          for (let px = sx0; px <= sx1; px++) {
            if (primaryMask[pRow + px] > 0) {
              const dSq = (px - startX) * (px - startX) + (py - startY) * (py - startY);
              if (dSq < bestTargetDist) {
                bestTargetDist = dSq;
                bestTargetX = px;
                bestTargetY = py;
              }
            }
          }
        }

        // Draw connecting bridge line
        drawBridge(outMask, width, height, startX, startY, bestTargetX, bestTargetY);
      }
    }
  }

  return {
    mask: outMask,
    attachedCount,
    accessoryBoxes: attachedBoxes,
  };
}

/**
 * Draws a 2px-wide bridge line between two points to guarantee topological connection.
 */
function drawBridge(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (true) {
    // Fill 2x2 footprint
    for (let by = 0; by <= 1; by++) {
      const py = cy + by;
      if (py >= 0 && py < height) {
        const row = py * width;
        for (let bx = 0; bx <= 1; bx++) {
          const px = cx + bx;
          if (px >= 0 && px < width) {
            mask[row + px] = 1;
          }
        }
      }
    }

    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}
