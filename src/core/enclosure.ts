/**
 * Enclosure and Container Detection Module.
 * Detects illustrated outer rings, frames, badges, and seals that structurally enclose
 * internal illustration elements (text, stars, central artwork, steam curls).
 *
 * Implements rigorous topological cavity analysis with morphological gap-bridging
 * to distinguish true enclosures from open C-shapes, crescents, or overlapping stickers.
 */

import { ArtworkComponent, BoundingBox } from '../types';

export interface EnclosureContainer {
  containerComponent: ArtworkComponent;
  enclosedComponentIds: string[];
}

/**
 * Computes intersection area between two bounding boxes.
 */
export function intersectionArea(b1: BoundingBox, b2: BoundingBox): number {
  const left = Math.max(b1.x, b2.x);
  const right = Math.min(b1.x + b1.width, b2.x + b2.width);
  const top = Math.max(b1.y, b2.y);
  const bottom = Math.min(b1.y + b1.height, b2.y + b2.height);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

/**
 * Applies 2-pass separable morphological closing (dilation then erosion)
 * with a sliding window of radius R to bridge small outline gaps up to 2*R.
 */
export function morphologicalClose(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const r = Math.round(radius);

  // 1. DILATION (Horizontal pass)
  const dilH = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    const initialSpan = Math.min(width, r);
    for (let x = 0; x < initialSpan; x++) {
      if (mask[row + x]) count++;
    }
    for (let x = 0; x < width; x++) {
      const add = x + r;
      if (add < width && mask[row + add]) count++;
      const sub = x - r - 1;
      if (sub >= 0 && mask[row + sub]) count--;
      dilH[row + x] = count > 0 ? 1 : 0;
    }
  }

  // 1. DILATION (Vertical pass)
  const dilated = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let count = 0;
    const initialSpan = Math.min(height, r);
    for (let y = 0; y < initialSpan; y++) {
      if (dilH[y * width + x]) count++;
    }
    for (let y = 0; y < height; y++) {
      const add = y + r;
      if (add < height && dilH[add * width + x]) count++;
      const sub = y - r - 1;
      if (sub >= 0 && dilH[sub * width + x]) count--;
      dilated[y * width + x] = count > 0 ? 1 : 0;
    }
  }

  // 2. EROSION (Horizontal pass on dilated)
  const eroH = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    const initialSpan = Math.min(width, r);
    for (let x = 0; x < initialSpan; x++) {
      if (dilated[row + x]) count++;
    }
    for (let x = 0; x < width; x++) {
      const add = x + r;
      if (add < width && dilated[row + add]) count++;
      const sub = x - r - 1;
      if (sub >= 0 && dilated[row + sub]) count--;

      const left = Math.max(0, x - r);
      const right = Math.min(width - 1, x + r);
      const winLen = right - left + 1;
      eroH[row + x] = count >= winLen ? 1 : 0;
    }
  }

  // 2. EROSION (Vertical pass)
  const closed = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let count = 0;
    const initialSpan = Math.min(height, r);
    for (let y = 0; y < initialSpan; y++) {
      if (eroH[y * width + x]) count++;
    }
    for (let y = 0; y < height; y++) {
      const add = y + r;
      if (add < height && eroH[add * width + x]) count++;
      const sub = y - r - 1;
      if (sub >= 0 && eroH[sub * width + x]) count--;

      const top = Math.max(0, y - r);
      const bottom = Math.min(height - 1, y + r);
      const winLen = bottom - top + 1;
      closed[y * width + x] = count >= winLen ? 1 : 0;
    }
  }

  return closed;
}

/**
 * Checks whether component `inner` is topologically enclosed within the raster cavity
 * of component `outer`.
 *
 * Distinguishes true enclosures (rings, seals, frames) from open shapes (C-shapes, crescents,
 * horseshoes) by verifying that the exterior flood fill cannot reach inner component pixels.
 */
export function isMaskEnclosed(
  outer: ArtworkComponent,
  inner: ArtworkComponent,
  labelMap: Uint16Array,
  sheetWidth: number,
  sheetHeight: number,
  maxGap: number = 14
): boolean {
  if (inner.id === outer.id) return false;

  const ob = outer.bounds;
  const ib = inner.bounds;

  // Outer container must have substantial dimensions
  if (ob.width < 35 || ob.height < 35) return false;

  // Inner centroid must lie strictly within the outer bounding box
  const cx = inner.centroid.x;
  const cy = inner.centroid.y;
  if (cx < ob.x || cx > ob.x + ob.width || cy < ob.y || cy > ob.y + ob.height) {
    return false;
  }

  // Bounding box overlap must be at least 60%
  const innerArea = ib.width * ib.height;
  if (innerArea === 0) return false;
  const overlap = intersectionArea(ob, ib);
  if (overlap / innerArea < 0.60) return false;

  // Create local patch around outer component with safety margin
  const pad = Math.max(4, Math.ceil(maxGap / 2) + 2);
  const minX = Math.max(0, ob.x - pad);
  const minY = Math.max(0, ob.y - pad);
  const maxX = Math.min(sheetWidth - 1, ob.x + ob.width + pad - 1);
  const maxY = Math.min(sheetHeight - 1, ob.y + ob.height + pad - 1);

  const localW = maxX - minX + 1;
  const localH = maxY - minY + 1;
  const localSize = localW * localH;

  // Extract binary mask of outer container in the local patch
  const outerLabel = outer.label;
  const outerMask = new Uint8Array(localSize);

  for (let ly = 0; ly < localH; ly++) {
    const sy = minY + ly;
    const sheetRowOffset = sy * sheetWidth;
    const localRowOffset = ly * localW;
    for (let lx = 0; lx < localW; lx++) {
      const sx = minX + lx;
      if (labelMap[sheetRowOffset + sx] === outerLabel) {
        outerMask[localRowOffset + lx] = 1;
      }
    }
  }

  // Apply morphological closing to bridge small gaps (e.g. 5-14px)
  const radius = Math.max(1, Math.floor(maxGap / 2));
  const closedMask = morphologicalClose(outerMask, localW, localH, radius);

  // Exterior flood fill from borders of the local patch
  const visited = new Uint8Array(localSize);
  const queue = new Int32Array(localSize);
  let head = 0;
  let tail = 0;

  for (let lx = 0; lx < localW; lx++) {
    if (closedMask[lx] === 0 && !visited[lx]) {
      visited[lx] = 1;
      queue[tail++] = lx;
    }
    const bIdx = (localH - 1) * localW + lx;
    if (closedMask[bIdx] === 0 && !visited[bIdx]) {
      visited[bIdx] = 1;
      queue[tail++] = bIdx;
    }
  }

  for (let ly = 0; ly < localH; ly++) {
    const lIdx = ly * localW;
    if (closedMask[lIdx] === 0 && !visited[lIdx]) {
      visited[lIdx] = 1;
      queue[tail++] = lIdx;
    }
    const rIdx = ly * localW + (localW - 1);
    if (closedMask[rIdx] === 0 && !visited[rIdx]) {
      visited[rIdx] = 1;
      queue[tail++] = rIdx;
    }
  }

  while (head < tail) {
    const curr = queue[head++];
    const qx = curr % localW;
    const qy = Math.floor(curr / localW);

    const neighbors = [
      qx > 0 ? curr - 1 : -1,
      qx < localW - 1 ? curr + 1 : -1,
      qy > 0 ? curr - localW : -1,
      qy < localH - 1 ? curr + localW : -1
    ];

    for (let i = 0; i < 4; i++) {
      const nIdx = neighbors[i];
      if (nIdx !== -1 && !visited[nIdx] && closedMask[nIdx] === 0) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  // Verify how many of inner component's pixels fall inside the unreached cavity (visited === 0)
  const innerLabel = inner.label;
  let innerPixelsInPatch = 0;
  let cavityPixels = 0;

  for (let ly = 0; ly < localH; ly++) {
    const sy = minY + ly;
    const sheetRowOffset = sy * sheetWidth;
    const localRowOffset = ly * localW;
    for (let lx = 0; lx < localW; lx++) {
      const sx = minX + lx;
      if (labelMap[sheetRowOffset + sx] === innerLabel) {
        innerPixelsInPatch++;
        if (visited[localRowOffset + lx] === 0) {
          cavityPixels++;
        }
      }
    }
  }

  if (innerPixelsInPatch === 0) return false;

  // At least 70% of inner component's pixels must lie inside the true cavity
  return (cavityPixels / innerPixelsInPatch) >= 0.70;
}

/**
 * Geometric-only fallback for when labelMap is not available.
 * Preserves conservative behavior: requires tight bounding box containment
 * and container extent significantly larger than inner piece.
 */
export function isComponentEnclosed(
  inner: ArtworkComponent,
  outer: ArtworkComponent,
  minOverlapRatio: number = 0.75
): boolean {
  if (inner.id === outer.id) return false;

  const ob = outer.bounds;
  const ib = inner.bounds;

  if (ob.width < 40 || ob.height < 40) return false;

  const cx = inner.centroid.x;
  const cy = inner.centroid.y;
  if (cx < ob.x || cx > ob.x + ob.width || cy < ob.y || cy > ob.y + ob.height) {
    return false;
  }

  const innerArea = ib.width * ib.height;
  if (innerArea === 0) return false;

  const overlap = intersectionArea(ob, ib);
  const ratio = overlap / innerArea;

  if (ratio < minOverlapRatio) return false;

  const outerArea = ob.width * ob.height;
  if (outerArea < innerArea * 1.25) return false;

  return true;
}

/**
 * Finds all enclosure containers among components and maps each container
 * to the set of components enclosed within it.
 * Uses exact raster mask cavity analysis when labelMap is provided.
 */
export function detectEnclosures(
  components: ArtworkComponent[],
  labelMap?: Uint16Array,
  sheetWidth?: number,
  sheetHeight?: number
): Map<string, Set<string>> {
  const enclosures = new Map<string, Set<string>>();
  if (components.length < 2) return enclosures;

  // Sort candidate containers by bounding box area descending so outer-most containers come first
  const sortedByArea = [...components].sort((a, b) => {
    const areaA = a.bounds.width * a.bounds.height;
    const areaB = b.bounds.width * b.bounds.height;
    return areaB - areaA;
  });

  const claimedAsEnclosed = new Set<string>();

  for (let i = 0; i < sortedByArea.length; i++) {
    const outer = sortedByArea[i];
    if (claimedAsEnclosed.has(outer.id)) continue;
    if (outer.bounds.width < 35 || outer.bounds.height < 35) continue;

    const enclosedSet = new Set<string>();

    for (let j = 0; j < sortedByArea.length; j++) {
      if (i === j) continue;
      const inner = sortedByArea[j];
      if (claimedAsEnclosed.has(inner.id)) continue;

      let isEnclosed = false;
      if (labelMap && sheetWidth && sheetHeight) {
        isEnclosed = isMaskEnclosed(outer, inner, labelMap, sheetWidth, sheetHeight, 14);
      } else {
        isEnclosed = isComponentEnclosed(inner, outer);
      }

      if (isEnclosed) {
        enclosedSet.add(inner.id);
      }
    }

    if (enclosedSet.size > 0) {
      enclosures.set(outer.id, enclosedSet);
      enclosedSet.forEach(id => claimedAsEnclosed.add(id));
    }
  }

  return enclosures;
}

/**
 * Checks whether two components have actual raster pixels within maxDistance of each other,
 * guarding against false proximity where disjoint bounding boxes overlap (e.g. inside a C-shape).
 */
export function isComponentNearPixels(
  compA: ArtworkComponent,
  compB: ArtworkComponent,
  labelMap: Uint16Array,
  sheetWidth: number,
  sheetHeight: number,
  maxDistance: number
): boolean {
  // If bounding boxes are farther apart than maxDistance, impossible
  if (bboxDistance(compA.bounds, compB.bounds) > maxDistance) {
    return false;
  }

  // Scan the expanded bounding box of the smaller component
  const small = compA.pixelCount <= compB.pixelCount ? compA : compB;
  const targetLabel = (small === compA ? compB : compA).label;

  const minX = Math.max(0, small.bounds.x - maxDistance);
  const minY = Math.max(0, small.bounds.y - maxDistance);
  const maxX = Math.min(sheetWidth - 1, small.bounds.x + small.bounds.width + maxDistance - 1);
  const maxY = Math.min(sheetHeight - 1, small.bounds.y + small.bounds.height + maxDistance - 1);

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * sheetWidth;
    for (let x = minX; x <= maxX; x++) {
      if (labelMap[rowOffset + x] === targetLabel) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Computes Manhattan/Euclidean distance between two bounding boxes.
 */
function bboxDistance(b1: BoundingBox, b2: BoundingBox): number {
  const dx = Math.max(0, Math.max(b1.x - (b2.x + b2.width), b2.x - (b1.x + b1.width)));
  const dy = Math.max(0, Math.max(b1.y - (b2.y + b2.height), b2.y - (b1.y + b1.height)));
  return Math.sqrt(dx * dx + dy * dy);
}

