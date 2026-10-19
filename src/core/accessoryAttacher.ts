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
  protectedBoxes?: BoundingBox[]; // Bounding boxes of all user-selected people (e.g. adults, children)
  confidenceMap?: Float32Array; // Continuous model confidence to recover cut-off accessory details
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

  // 2. Classify Primary & Protected Person Components
  // Every user-selected person region in protectedBoxes is guaranteed protection
  const protectedBoxes = options.protectedBoxes && options.protectedBoxes.length > 0
    ? options.protectedBoxes
    : [coreBox];

  function overlapsBox(c: ComponentInfo, b: BoundingBox): boolean {
    return !(
      c.maxX < b.x ||
      b.x + b.width < c.minX ||
      c.maxY < b.y ||
      b.y + b.height < c.minY
    );
  }

  // Find dominant component for coreBox
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

  const mainPixelCount = components[primaryCompIdx].pixelCount;

  // Mark all components overlapping ANY protected box as primary
  // Also preserve dominant component and massive components (>45% of dominant)
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const isDominant = (i === primaryCompIdx || comp.pixelCount > mainPixelCount * 0.45);
    const overlapsAnyProtected = protectedBoxes.some(box => overlapsBox(comp, box));

    if (isDominant || overlapsAnyProtected) {
      comp.isPrimary = true;
    }
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

  // Distance to all primary person pixels
  const distToPrimary = computeEuclideanDistanceTransform(primaryMask, width, height);

  // Compute head zone thresholds for each protected person box
  const personHeadZones = protectedBoxes.map(b => ({
    minY: Math.max(0, b.y - 10),
    maxY: b.y + b.height * headZoneRatio,
  }));

  // 3. Evaluate non-primary candidate components
  const outMask = new Uint8Array(size);
  outMask.set(primaryMask);

  const attachedBoxes: BoundingBox[] = [];
  let attachedCount = 0;

  for (const comp of components) {
    if (comp.isPrimary) continue;

    // Reject components that are too small or excessively large
    if (comp.pixelCount < minPixels || comp.pixelCount > maxPixels) continue;

    // Check if component falls within the head zone of ANY protected person
    const isNearAnyHead = personHeadZones.some(hz => {
      return (comp.minY <= hz.maxY && comp.maxY >= hz.minY);
    });
    if (!isNearAnyHead) continue;

    // Find minimum distance of this component to any primary person pixel
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
      const aBox: BoundingBox = {
        x: comp.minX,
        y: comp.minY,
        width: comp.maxX - comp.minX + 1,
        height: comp.maxY - comp.minY + 1,
      };
      attachedBoxes.push(aBox);

      // Add component pixels directly to result without artificial bridge lines
      for (const idx of comp.pixels) {
        outMask[idx] = 1;
      }

      // Recover any soft / continuous confidence pixels around this accessory that were truncated
      if (options.confidenceMap) {
        const conf = options.confidenceMap;
        const pad = 4;
        const xStart = Math.max(0, aBox.x - pad);
        const xEnd = Math.min(width - 1, aBox.x + aBox.width + pad);
        const yStart = Math.max(0, aBox.y - pad);
        const yEnd = Math.min(height - 1, aBox.y + aBox.height + pad);

        for (let y = yStart; y <= yEnd; y++) {
          const rowOff = y * width;
          for (let x = xStart; x <= xEnd; x++) {
            const idx = rowOff + x;
            if (outMask[idx] === 0 && conf[idx] >= 0.28) {
              outMask[idx] = 1;
            }
          }
        }
      }
    }
  }

  return {
    mask: outMask,
    attachedCount,
    accessoryBoxes: attachedBoxes,
  };
}
