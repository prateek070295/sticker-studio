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

  // 2. Classify Primary Person Component
  // Find the single dominant component with the maximum pixel count inside coreBox
  const cMinX = Math.max(0, coreBox.x);
  const cMaxX = Math.min(width - 1, coreBox.x + coreBox.width);
  const cMinY = Math.max(0, coreBox.y);
  const cMaxY = Math.min(height - 1, coreBox.y + coreBox.height);

  let primaryCompIdx = -1;
  let maxCoreOverlapPixels = 0;

  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    let overlapInCore = 0;
    for (const idx of comp.pixels) {
      const px = idx % width;
      const py = Math.floor(idx / width);
      if (px >= cMinX && px <= cMaxX && py >= cMinY && py <= cMaxY) {
        overlapInCore++;
      }
    }

    if (overlapInCore > maxCoreOverlapPixels) {
      maxCoreOverlapPixels = overlapInCore;
      primaryCompIdx = i;
    }
  }

  // Fallback: if no component had pixels in coreBox, pick largest component overall
  if (primaryCompIdx === -1) {
    let maxIdx = 0;
    for (let i = 1; i < components.length; i++) {
      if (components[i].pixelCount > components[maxIdx].pixelCount) {
        maxIdx = i;
      }
    }
    primaryCompIdx = maxIdx;
  }

  // Mark the dominant component (and any massive components > 35% of its size) as primary
  const mainPixelCount = components[primaryCompIdx].pixelCount;
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    if (i === primaryCompIdx || comp.pixelCount > mainPixelCount * 0.45) {
      comp.isPrimary = true;
    }
  }

  // Build binary primary mask to calculate Euclidean distance to primary
  const primaryMask = new Uint8Array(size);
  let pMinY = height;
  let pMaxY = 0;

  for (const comp of components) {
    if (comp.isPrimary) {
      for (const idx of comp.pixels) {
        primaryMask[idx] = 1;
        const py = Math.floor(idx / width);
        if (py < pMinY) pMinY = py;
        if (py > pMaxY) pMaxY = py;
      }
    }
  }

  const primaryHeight = Math.max(20, pMaxY - pMinY + 1);
  const effectiveHeadThreshold = pMinY + primaryHeight * headZoneRatio;

  const distToPrimary = computeEuclideanDistanceTransform(primaryMask, width, height);

  // 3. Evaluate non-primary candidate components
  const outMask = new Uint8Array(size);
  outMask.set(primaryMask);

  const attachedBoxes: BoundingBox[] = [];
  let attachedCount = 0;

  for (const comp of components) {
    if (comp.isPrimary) continue;

    // Reject components that are too small or excessively large
    if (comp.pixelCount < minPixels || comp.pixelCount > maxPixels) continue;

    // Check if in head/hair/temple/crown zone of primary person
    const isHeadZone = comp.minY <= effectiveHeadThreshold || comp.maxY <= effectiveHeadThreshold;
    if (!isHeadZone) continue;

    // Find minimum distance of this component to primary mask
    let minDist = Infinity;
    for (const idx of comp.pixels) {
      const d = distToPrimary[idx];
      if (d < minDist) {
        minDist = d;
      }
    }
    comp.minDistToPrimary = minDist;

    // If within attachment threshold, attach and merge!
    // Reject unrelated background objects that are distant
    if (minDist <= maxDist) {
      attachedCount++;
      attachedBoxes.push({
        x: comp.minX,
        y: comp.minY,
        width: comp.maxX - comp.minX + 1,
        height: comp.maxY - comp.minY + 1,
      });

      // Add component pixels directly to result WITHOUT drawing artificial visible bridge lines
      for (const idx of comp.pixels) {
        outMask[idx] = 1;
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
