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

  // For each protected box, identify its dominant person component
  // (the component having the largest number of pixels inside that protected box)
  for (const box of protectedBoxes) {
    const bMinX = Math.max(0, box.x);
    const bMaxX = Math.min(width - 1, box.x + box.width);
    const bMinY = Math.max(0, box.y);
    const bMaxY = Math.min(height - 1, box.y + box.height);

    let bestCompIdx = -1;
    let maxOverlap = 0;

    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      let overlap = 0;
      for (const idx of comp.pixels) {
        const px = idx % width;
        const py = Math.floor(idx / width);
        if (px >= bMinX && px <= bMaxX && py >= bMinY && py <= bMaxY) {
          overlap++;
        }
      }
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestCompIdx = i;
      }
    }

    if (bestCompIdx !== -1 && maxOverlap >= 15) {
      components[bestCompIdx].isPrimary = true;
      // Also protect secondary body parts of the same person if they have substantial mass in the box
      for (let i = 0; i < components.length; i++) {
        if (i === bestCompIdx) continue;
        const comp = components[i];
        let overlap = 0;
        for (const idx of comp.pixels) {
          const px = idx % width;
          const py = Math.floor(idx / width);
          if (px >= bMinX && px <= bMaxX && py >= bMinY && py <= bMaxY) {
            overlap++;
          }
        }
        // Substantial body piece (> 35% of its own pixels are inside the box AND > 20% of maxOverlap)
        if (overlap >= comp.pixelCount * 0.35 && overlap >= maxOverlap * 0.20) {
          comp.isPrimary = true;
        }
      }
    }
  }

  // Safety fallback: if no component was selected as primary (e.g. empty boxes), select largest component overall
  if (!components.some(c => c.isPrimary)) {
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

  // Distance to all primary person pixels
  const distToPrimary = computeEuclideanDistanceTransform(primaryMask, width, height);

  // Build binary head mask: only primary pixels located in the upper head/hair zone
  const primaryHeadMask = new Uint8Array(size);
  const effectiveHeadRatio = Math.min(0.50, headZoneRatio);
  for (const comp of components) {
    if (comp.isPrimary) {
      for (const idx of comp.pixels) {
        const py = Math.floor(idx / width);
        const inAnyHead = protectedBoxes.some(b => py <= b.y + b.height * effectiveHeadRatio);
        if (inAnyHead) {
          primaryHeadMask[idx] = 1;
        }
      }
    }
  }

  // Distance to primary head/hair pixels (accessories attach to head/hair, not torso/hips)
  const distToHead = computeEuclideanDistanceTransform(primaryHeadMask, width, height);

  // Compute 2D head zones for each protected person box
  // Head is centered horizontally in the upper torso/body box (central ~70% width)
  const personHeadZones = protectedBoxes.map(b => {
    const headCenterX = b.x + b.width * 0.5;
    const halfHeadWidth = b.width * 0.35;
    return {
      minX: Math.max(0, headCenterX - halfHeadWidth - maxDist),
      maxX: Math.min(width - 1, headCenterX + halfHeadWidth + maxDist),
      minY: Math.max(0, b.y - maxDist),
      maxY: b.y + b.height * effectiveHeadRatio,
    };
  });

  // 3. Evaluate non-primary candidate components
  const outMask = new Uint8Array(size);
  outMask.set(primaryMask);

  const attachedBoxes: BoundingBox[] = [];
  let attachedCount = 0;

  for (const comp of components) {
    if (comp.isPrimary) continue;

    // Reject components that are too small or excessively large
    if (comp.pixelCount < minPixels || comp.pixelCount > maxPixels) continue;

    // Check if component falls within the 2D head zone of ANY protected person
    const isNearAnyHead = personHeadZones.some(hz => {
      return (
        comp.minY <= hz.maxY &&
        comp.maxY >= hz.minY &&
        comp.minX <= hz.maxX &&
        comp.maxX >= hz.minX
      );
    });
    if (!isNearAnyHead) continue;

    // Reject false foreground objects that cling to image borders far from head center
    // e.g. detached edge vegetation or framing
    const isEdgeClutter = personHeadZones.some(hz => {
      const headCenterX = (hz.minX + hz.maxX) * 0.5;
      const compCenterX = (comp.minX + comp.maxX) * 0.5;
      const isTouchingBorder = comp.minX === 0 || comp.maxX === width - 1;
      return isTouchingBorder && Math.abs(compCenterX - headCenterX) > (hz.maxX - hz.minX) * 0.35;
    });
    if (isEdgeClutter) continue;

    // Find minimum distance of this component to any primary HEAD pixel
    let minDist = Infinity;
    for (const idx of comp.pixels) {
      const d = distToHead[idx];
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
