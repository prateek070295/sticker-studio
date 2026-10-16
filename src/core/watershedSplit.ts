/**
 * Constrained Touching-Object Split Engine.
 * Uses user-provided separating strokes or dual seeds as strong constraints.
 * Partitions ownership without losing any source artwork pixels (zero pixel loss).
 * Provides interactive color-coded preview and transactional commit.
 */

import { ArtworkComponent, BoundingBox, SplitPreview, SplitResult, StickerGroup, TouchingSplitRequest } from '../types';

interface QueueItem {
  x: number;
  y: number;
  cost: number;
  label: 1 | 2; // 1 = Object A, 2 = Object B
}

/**
 * Priority queue implementation (min-heap) for multi-source Dijkstra flood.
 */
class PriorityQueue {
  private heap: QueueItem[] = [];

  push(item: QueueItem): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueueItem | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(idx: number): void {
    const element = this.heap[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (element.cost >= parent.cost) break;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
    this.heap[idx] = element;
  }

  private bubbleDown(idx: number): void {
    const length = this.heap.length;
    const element = this.heap[idx];
    while (true) {
      const leftChildIdx = (idx << 1) + 1;
      const rightChildIdx = leftChildIdx + 1;
      let swapIdx: number | null = null;

      if (leftChildIdx < length) {
        if (this.heap[leftChildIdx].cost < element.cost) {
          swapIdx = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        if (
          (swapIdx === null && this.heap[rightChildIdx].cost < element.cost) ||
          (swapIdx !== null && this.heap[rightChildIdx].cost < this.heap[leftChildIdx].cost)
        ) {
          swapIdx = rightChildIdx;
        }
      }

      if (swapIdx === null) break;
      this.heap[idx] = this.heap[swapIdx];
      idx = swapIdx;
    }
    this.heap[idx] = element;
  }
}

/**
 * Computes a partition preview for a touching component based on a cut stroke or dual seeds.
 * Guarantees that every foreground pixel in the component is assigned to either A or B.
 */
export function previewTouchingSplit(
  comp: ArtworkComponent,
  imageRgba: Uint8ClampedArray,
  alphaMask: Uint8Array,
  labelMap: Uint16Array,
  sheetWidth: number,
  request: TouchingSplitRequest
): SplitPreview | null {
  const { bounds, label } = comp;
  const { width, height, x: minX, y: minY } = bounds;
  const size = width * height;

  if (width <= 0 || height <= 0) return null;

  const partition = new Uint8Array(size); // 0 = unassigned, 1 = A, 2 = B
  const costMap = new Float32Array(size);
  costMap.fill(Infinity);

  const pq = new PriorityQueue();

  // Rasterize barrier line if in cut-line mode
  const barrierMap = new Uint8Array(size);
  if (request.mode === 'cut-line' && request.cutLine) {
    const { x1, y1, x2, y2 } = request.cutLine;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const bx = Math.round(x1 + dx * t) - minX;
      const by = Math.round(y1 + dy * t) - minY;
      if (bx >= 0 && bx < width && by >= 0 && by < height) {
        barrierMap[by * width + bx] = 1;
      }
    }
  }

  // Determine seed locations
  let seedA = request.seedA;
  let seedB = request.seedB;

  if (request.mode === 'cut-line' && request.cutLine) {
    // If cut-line mode, automatically pick seeds on opposite sides of the cut line
    const { x1, y1, x2, y2 } = request.cutLine;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpX = -(y2 - y1);
    const perpY = x2 - x1;
    const perpLen = Math.hypot(perpX, perpY) || 1;
    const normPerpX = (perpX / perpLen) * 5;
    const normPerpY = (perpY / perpLen) * 5;

    // Search outward along normal for valid component pixels
    let foundA = false;
    let foundB = false;
    for (let step = 1; step <= Math.max(width, height); step++) {
      if (!foundA) {
        const ax = Math.round(midX + normPerpX * step);
        const ay = Math.round(midY + normPerpY * step);
        if (ax >= minX && ax < minX + width && ay >= minY && ay < minY + height) {
          if (labelMap[ay * sheetWidth + ax] === label) {
            seedA = { x: ax, y: ay };
            foundA = true;
          }
        }
      }
      if (!foundB) {
        const bx = Math.round(midX - normPerpX * step);
        const by = Math.round(midY - normPerpY * step);
        if (bx >= minX && bx < minX + width && by >= minY && by < minY + height) {
          if (labelMap[by * sheetWidth + bx] === label) {
            seedB = { x: bx, y: by };
            foundB = true;
          }
        }
      }
      if (foundA && foundB) break;
    }
  }

  // Fallback: If seeds could not be located via geometry, use component extremities
  if (!seedA || !seedB) {
    // Pick two farthest pixels belonging to this component
    let firstPixel: { x: number; y: number } | null = null;
    let maxDist = -1;
    let secondPixel: { x: number; y: number } | null = null;

    for (let ly = 0; ly < height; ly++) {
      for (let lx = 0; lx < width; lx++) {
        const sx = minX + lx;
        const sy = minY + ly;
        if (labelMap[sy * sheetWidth + sx] === label) {
          if (!firstPixel) {
            firstPixel = { x: sx, y: sy };
          } else {
            const d = Math.hypot(sx - firstPixel.x, sy - firstPixel.y);
            if (d > maxDist) {
              maxDist = d;
              secondPixel = { x: sx, y: sy };
            }
          }
        }
      }
    }

    if (firstPixel && secondPixel) {
      seedA = seedA || firstPixel;
      seedB = seedB || secondPixel;
    } else {
      return null;
    }
  }

  // Initialize seeds in priority queue
  const localAx = seedA.x - minX;
  const localAy = seedA.y - minY;
  if (localAx >= 0 && localAx < width && localAy >= 0 && localAy < height) {
    const idxA = localAy * width + localAx;
    partition[idxA] = 1;
    costMap[idxA] = 0;
    pq.push({ x: localAx, y: localAy, cost: 0, label: 1 });
  }

  const localBx = seedB.x - minX;
  const localBy = seedB.y - minY;
  if (localBx >= 0 && localBx < width && localBy >= 0 && localBy < height) {
    const idxB = localBy * width + localBx;
    partition[idxB] = 2;
    costMap[idxB] = 0;
    pq.push({ x: localBx, y: localBy, cost: 0, label: 2 });
  }

  if (pq.size === 0) return null;

  // 4-neighborhood offsets
  const dxs = [1, -1, 0, 0];
  const dys = [0, 0, 1, -1];

  const settled = new Uint8Array(size);
  while (pq.size > 0) {
    const curr = pq.pop()!;
    const currLocalIdx = curr.y * width + curr.x;
    if (settled[currLocalIdx]) continue;
    settled[currLocalIdx] = 1;

    const currSheetIdx = (minY + curr.y) * sheetWidth + (minX + curr.x);
    const currR = imageRgba[currSheetIdx * 4];
    const currG = imageRgba[currSheetIdx * 4 + 1];
    const currB = imageRgba[currSheetIdx * 4 + 2];

    for (let i = 0; i < 4; i++) {
      const nx = curr.x + dxs[i];
      const ny = curr.y + dys[i];

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const neighborLocalIdx = ny * width + nx;
      if (settled[neighborLocalIdx]) continue;
      const neighborSheetIdx = (minY + ny) * sheetWidth + (minX + nx);

      // Must belong to the component being split
      if (labelMap[neighborSheetIdx] !== label) continue;

      // Barrier penalty in cut-line mode
      const isBarrier = barrierMap[neighborLocalIdx] === 1;
      const barrierPenalty = isBarrier ? 200 : 0;

      // Color gradient cost
      const nR = imageRgba[neighborSheetIdx * 4];
      const nG = imageRgba[neighborSheetIdx * 4 + 1];
      const nB = imageRgba[neighborSheetIdx * 4 + 2];
      const colorDist = Math.hypot(nR - currR, nG - currG, nB - currB);

      // Alpha contrast cost
      const nAlpha = alphaMask[neighborSheetIdx];
      const alphaCost = (255 - nAlpha) * 0.1;

      const edgeCost = 1.0 + colorDist * 0.5 + alphaCost + barrierPenalty;
      const totalCost = curr.cost + edgeCost;

      if (totalCost < costMap[neighborLocalIdx]) {
        costMap[neighborLocalIdx] = totalCost;
        partition[neighborLocalIdx] = curr.label;
        pq.push({ x: nx, y: ny, cost: totalCost, label: curr.label });
      }
    }
  }

  // Ensure 100% of the component's pixels are assigned (zero pixel loss invariant)
  // Any unreached pixel gets assigned to the closest labeled pixel
  let countA = 0;
  let countB = 0;
  const partitionA = new Uint8Array(size);
  const partitionB = new Uint8Array(size);

  for (let ly = 0; ly < height; ly++) {
    for (let lx = 0; lx < width; lx++) {
      const sheetIdx = (minY + ly) * sheetWidth + (minX + lx);
      const localIdx = ly * width + lx;
      if (labelMap[sheetIdx] === label) {
        let pLabel = partition[localIdx];
        if (pLabel === 0) {
          // Fallback to geometric proximity to seedA vs seedB
          const distA = Math.hypot(lx - localAx, ly - localAy);
          const distB = Math.hypot(lx - localBx, ly - localBy);
          pLabel = distA <= distB ? 1 : 2;
          partition[localIdx] = pLabel;
        }

        if (pLabel === 1) {
          partitionA[localIdx] = 1;
          countA++;
        } else {
          partitionB[localIdx] = 1;
          countB++;
        }
      }
    }
  }

  return {
    componentId: comp.id,
    bounds,
    partitionA,
    partitionB,
    countA,
    countB
  };
}

/**
 * Commits an approved split preview, allocating a new component label,
 * updating labelMap, component list, and sticker groups without erasing any pixels.
 */
export function commitTouchingSplit(
  originalComp: ArtworkComponent,
  preview: SplitPreview,
  labelMap: Uint16Array,
  components: ArtworkComponent[],
  groups: StickerGroup[],
  sheetWidth: number
): SplitResult {
  const { bounds, partitionA, partitionB, countA, countB } = preview;
  const { width, height, x: minX, y: minY } = bounds;

  // Allocate new unique label integer
  let maxLabel = 0;
  for (const c of components) {
    if (c.label > maxLabel) maxLabel = c.label;
  }
  const newLabelB = maxLabel + 1;

  let aMinX = Infinity, aMinY = Infinity, aMaxX = -Infinity, aMaxY = -Infinity;
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  let aSumX = 0, aSumY = 0;
  let bSumX = 0, bSumY = 0;

  for (let ly = 0; ly < height; ly++) {
    const sy = minY + ly;
    for (let lx = 0; lx < width; lx++) {
      const sx = minX + lx;
      const sheetIdx = sy * sheetWidth + sx;
      const localIdx = ly * width + lx;

      if (partitionB[localIdx] === 1) {
        labelMap[sheetIdx] = newLabelB;
        bSumX += sx;
        bSumY += sy;
        if (sx < bMinX) bMinX = sx;
        if (sx > bMaxX) bMaxX = sx;
        if (sy < bMinY) bMinY = sy;
        if (sy > bMaxY) bMaxY = sy;
      } else if (partitionA[localIdx] === 1) {
        aSumX += sx;
        aSumY += sy;
        if (sx < aMinX) aMinX = sx;
        if (sx > aMaxX) aMaxX = sx;
        if (sy < aMinY) aMinY = sy;
        if (sy > aMaxY) aMaxY = sy;
      }
    }
  }

  const newCompA: ArtworkComponent = {
    ...originalComp,
    pixelCount: countA,
    bounds: {
      x: aMinX,
      y: aMinY,
      width: Math.max(1, aMaxX - aMinX + 1),
      height: Math.max(1, aMaxY - aMinY + 1)
    },
    centroid: {
      x: countA > 0 ? Math.round(aSumX / countA) : originalComp.centroid.x,
      y: countA > 0 ? Math.round(aSumY / countA) : originalComp.centroid.y
    }
  };

  const newCompBId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newCompB: ArtworkComponent = {
    id: newCompBId,
    label: newLabelB,
    pixelCount: countB,
    bounds: {
      x: bMinX,
      y: bMinY,
      width: Math.max(1, bMaxX - bMinX + 1),
      height: Math.max(1, bMaxY - bMinY + 1)
    },
    centroid: {
      x: countB > 0 ? Math.round(bSumX / countB) : originalComp.centroid.x,
      y: countB > 0 ? Math.round(bSumY / countB) : originalComp.centroid.y
    },
    isTiny: countB < 20
  };

  // Update components array in place
  const compIdx = components.findIndex(c => c.id === originalComp.id);
  if (compIdx !== -1) {
    components[compIdx] = newCompA;
  }
  components.push(newCompB);

  // Update group ownership: create a new group for newCompB
  const parentGroup = groups.find(g => g.componentIds.includes(originalComp.id));
  if (parentGroup) {
    const newGroup: StickerGroup = {
      id: `group_${Date.now()}_b`,
      name: `sticker_${String(groups.length + 1).padStart(3, '0')}`,
      componentIds: [newCompBId],
      bounds: newCompB.bounds,
      borderThickness: parentGroup.borderThickness,
      customBorder: parentGroup.customBorder,
      whiteBackingEnabled: parentGroup.whiteBackingEnabled,
      connectBacking: parentGroup.connectBacking,
      solidBacking: parentGroup.solidBacking,
      bridges: [],
      excludedFromExport: false
    };
    groups.push(newGroup);

    // Update parent group bounds as union of all remaining components
    const allParentComps = parentGroup.componentIds
      .map(id => components.find(c => c.id === id))
      .filter((c): c is ArtworkComponent => !!c && c.pixelCount > 0);
    if (allParentComps.length > 0) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      for (const c of allParentComps) {
        if (c.bounds.x < gMinX) gMinX = c.bounds.x;
        if (c.bounds.y < gMinY) gMinY = c.bounds.y;
        if (c.bounds.x + c.bounds.width - 1 > gMaxX) gMaxX = c.bounds.x + c.bounds.width - 1;
        if (c.bounds.y + c.bounds.height - 1 > gMaxY) gMaxY = c.bounds.y + c.bounds.height - 1;
      }
      parentGroup.bounds = {
        x: gMinX,
        y: gMinY,
        width: Math.max(1, gMaxX - gMinX + 1),
        height: Math.max(1, gMaxY - gMinY + 1)
      };
    } else {
      parentGroup.bounds = newCompA.bounds;
    }
  }

  return {
    originalComponentId: originalComp.id,
    newComponentA: newCompA,
    newComponentB: newCompB,
    affectedBounds: bounds
  };
}
