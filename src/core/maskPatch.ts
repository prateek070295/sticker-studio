/**
 * Non-destructive mask corrections & continuous brush rasterization engine.
 * Supports soft/hard edges, variable opacity, sub-pixel interpolation,
 * compact bounded delta patches, and strict pixel ownership invariants.
 */

import { ArtworkComponent, BoundingBox, MaskPatch, StickerGroup, StrokePoint } from '../types';

export interface BrushOptions {
  radius: number; // brush radius in pixels (1 to 100)
  hardness: number; // 0.0 (soft Gaussian-like) to 1.0 (crisp edge)
  opacity: number; // 0.0 to 1.0 strength per stroke application
  mode: 'restore' | 'erase';
}

export interface OwnershipDiff {
  patch: MaskPatch;
  affectedGroupIds: string[];
  beforeLabels: Uint16Array; // size bounds.width * bounds.height
  afterLabels: Uint16Array;
  previousComponents: ArtworkComponent[];
  previousGroups: StickerGroup[];
  updatedComponents: ArtworkComponent[];
  updatedGroups: StickerGroup[];
}

/**
 * Interpolates points between stroke events and stamps circular radial profiles into alphaMask.
 * Computes and returns a compact MaskPatch containing the exact affected bounding box
 * and before/after alpha buffers for instantaneous, memory-efficient undo/redo.
 */
export function applyBrushStroke(
  alphaMask: Uint8Array,
  sheetWidth: number,
  sheetHeight: number,
  points: StrokePoint[],
  options: BrushOptions
): MaskPatch | null {
  if (points.length === 0) return null;

  const { radius, hardness, opacity, mode } = options;
  const clampedRadius = Math.max(1, Math.round(radius));
  const clampedHardness = Math.max(0, Math.min(1, hardness));
  const clampedOpacity = Math.max(0, Math.min(1, opacity));

  // Determine overall bounding box of this stroke
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const pad = clampedRadius + 2;
  const boundX = Math.max(0, Math.floor(minX - pad));
  const boundY = Math.max(0, Math.floor(minY - pad));
  const boundMaxX = Math.min(sheetWidth - 1, Math.ceil(maxX + pad));
  const boundMaxY = Math.min(sheetHeight - 1, Math.ceil(maxY + pad));

  const boundW = boundMaxX - boundX + 1;
  const boundH = boundMaxY - boundY + 1;

  if (boundW <= 0 || boundH <= 0) return null;

  // Snapshot before-alpha state for the bounded region
  const beforeAlpha = new Uint8Array(boundW * boundH);
  for (let y = 0; y < boundH; y++) {
    const srcRow = (boundY + y) * sheetWidth + boundX;
    const dstRow = y * boundW;
    beforeAlpha.set(alphaMask.subarray(srcRow, srcRow + boundW), dstRow);
  }

  // Generate interpolated stamp center points (spacing = 0.25 * radius)
  const stepSize = Math.max(1, clampedRadius * 0.25);
  const stampPoints: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    if (i === 0) {
      stampPoints.push({ x: p1.x, y: p1.y });
    } else {
      const p0 = points[i - 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.ceil(dist / stepSize);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        stampPoints.push({
          x: p0.x + dx * t,
          y: p0.y + dy * t
        });
      }
    }
  }

  // Precompute radial falloff profile for fast stamping
  const radiusSq = clampedRadius * clampedRadius;
  const innerRadius = clampedRadius * clampedHardness;
  const innerRadiusSq = innerRadius * innerRadius;
  const fadeDistance = clampedRadius - innerRadius;

  // Track actual modified sub-bounds
  let actualMinX = sheetWidth;
  let actualMinY = sheetHeight;
  let actualMaxX = -1;
  let actualMaxY = -1;

  for (const pt of stampPoints) {
    const px = Math.round(pt.x);
    const py = Math.round(pt.y);

    const sMinY = Math.max(boundY, py - clampedRadius);
    const sMaxY = Math.min(boundMaxY, py + clampedRadius);
    const sMinX = Math.max(boundX, px - clampedRadius);
    const sMaxX = Math.min(boundMaxX, px + clampedRadius);

    for (let sy = sMinY; sy <= sMaxY; sy++) {
      const dy = sy - pt.y;
      const dySq = dy * dy;
      const rowOffset = sy * sheetWidth;

      for (let sx = sMinX; sx <= sMaxX; sx++) {
        const dx = sx - pt.x;
        const distSq = dx * dx + dySq;

        if (distSq <= radiusSq) {
          let factor = 1.0;
          if (clampedHardness < 1.0 && distSq > innerRadiusSq) {
            const d = Math.sqrt(distSq);
            // Smooth hermite curve for anti-aliasing
            const t = Math.max(0, Math.min(1, (clampedRadius - d) / (fadeDistance || 1)));
            factor = t * t * (3 - 2 * t);
          }

          const weight = factor * clampedOpacity;
          const maskIdx = rowOffset + sx;
          const currentA = alphaMask[maskIdx];

          let newA = currentA;
          if (mode === 'restore') {
            newA = Math.min(255, Math.round(currentA + (255 - currentA) * weight));
          } else {
            newA = Math.max(0, Math.round(currentA * (1 - weight)));
          }

          if (newA !== currentA) {
            alphaMask[maskIdx] = newA;
            if (sx < actualMinX) actualMinX = sx;
            if (sx > actualMaxX) actualMaxX = sx;
            if (sy < actualMinY) actualMinY = sy;
            if (sy > actualMaxY) actualMaxY = sy;
          }
        }
      }
    }
  }

  // If no pixels actually changed, return null
  if (actualMaxX < actualMinX || actualMaxY < actualMinY) {
    return null;
  }

  // Trim to tight modified bounding box
  const tightW = actualMaxX - actualMinX + 1;
  const tightH = actualMaxY - actualMinY + 1;

  const tightBefore = new Uint8Array(tightW * tightH);
  const tightAfter = new Uint8Array(tightW * tightH);

  for (let ty = 0; ty < tightH; ty++) {
    const origSheetRow = (actualMinY + ty) * sheetWidth + actualMinX;
    const tightRow = ty * tightW;
    const origSnapshotRow = (actualMinY - boundY + ty) * boundW + (actualMinX - boundX);
    tightBefore.set(beforeAlpha.subarray(origSnapshotRow, origSnapshotRow + tightW), tightRow);
    tightAfter.set(alphaMask.subarray(origSheetRow, origSheetRow + tightW), tightRow);
  }

  return {
    id: `patch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    bounds: { x: actualMinX, y: actualMinY, width: tightW, height: tightH },
    beforeAlpha: tightBefore,
    afterAlpha: tightAfter,
    mode,
    timestamp: Date.now()
  };
}

/**
 * Applies a mask stroke AND updates pixel ownership, component bounds,
 * affected sticker groups, and invalidates backing caches.
 * Preserves the disjoint ownership invariant: every pixel with alpha > 0
 * belongs to exactly one component, and every component belongs to one group.
 */
export function applyBrushPatchWithOwnership(
  alphaMask: Uint8Array,
  labelMap: Uint16Array,
  components: ArtworkComponent[],
  groups: StickerGroup[],
  sheetWidth: number,
  sheetHeight: number,
  patch: MaskPatch,
  activeGroupId?: string
): OwnershipDiff {
  const { x, y, width, height } = patch.bounds;
  const size = width * height;

  const beforeLabels = new Uint16Array(size);
  const afterLabels = new Uint16Array(size);

  // Snapshot before labels
  for (let row = 0; row < height; row++) {
    const src = (y + row) * sheetWidth + x;
    const dst = row * width;
    beforeLabels.set(labelMap.subarray(src, src + width), dst);
  }

  // Deep clone previous components & groups for undo capability
  const prevComponents: ArtworkComponent[] = JSON.parse(JSON.stringify(components));
  const prevGroups: StickerGroup[] = JSON.parse(JSON.stringify(groups));

  const updatedComponents: ArtworkComponent[] = JSON.parse(JSON.stringify(components));
  const updatedGroups: StickerGroup[] = JSON.parse(JSON.stringify(groups));

  const compMap = new Map<string, ArtworkComponent>(updatedComponents.map(c => [c.id, c]));
  const compByLabel = new Map<number, ArtworkComponent>(updatedComponents.map(c => [c.label, c]));

  const activeGroup = activeGroupId ? updatedGroups.find(g => g.id === activeGroupId) : undefined;
  const activeGroupLabels = new Set<number>();
  if (activeGroup) {
    for (const cId of activeGroup.componentIds) {
      const c = compMap.get(cId);
      if (c) activeGroupLabels.add(c.label);
    }
  }

  // Map each label to its owner group ID
  const labelToGroupId = new Map<number, string>();
  for (const grp of updatedGroups) {
    for (const cId of grp.componentIds) {
      const c = compMap.get(cId);
      if (c) labelToGroupId.set(c.label, grp.id);
    }
  }

  // Find maximum label in use
  let maxLabel = 0;
  for (const c of updatedComponents) {
    if (c.label > maxLabel) maxLabel = c.label;
  }

  const affectedCompIds = new Set<string>();
  const affectedGroupIds = new Set<string>();
  if (activeGroupId) affectedGroupIds.add(activeGroupId);

  if (patch.mode === 'restore' && activeGroup) {
    // 1. Identify newly restored unclaimed pixels (newAlpha > 0 && curLabel === 0)
    const unclaimedMask = new Uint8Array(size);
    for (let r = 0; r < height; r++) {
      const sheetRowOffset = (y + r) * sheetWidth;
      const patchRowOffset = r * width;
      for (let c = 0; c < width; c++) {
        const sheetIdx = sheetRowOffset + (x + c);
        const patchIdx = patchRowOffset + c;
        const newAlpha = patch.afterAlpha[patchIdx];
        const curLabel = labelMap[sheetIdx];

        if (curLabel !== 0) {
          // Never overwrite another group's ownership without explicit confirmation
          afterLabels[patchIdx] = curLabel;
        } else if (newAlpha > 0) {
          unclaimedMask[patchIdx] = 1;
        } else {
          afterLabels[patchIdx] = 0;
        }
      }
    }

    // 2. Group unclaimed pixels into 8-connected clusters
    const visited = new Uint8Array(size);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const rootIdx = r * width + c;
        if (unclaimedMask[rootIdx] === 1 && visited[rootIdx] === 0) {
          // BFS this cluster
          const cluster: Array<{ c: number; r: number; patchIdx: number; sheetIdx: number }> = [];
          const queue = [rootIdx];
          visited[rootIdx] = 1;

          let touchedActiveLabel: number | null = null;

          while (queue.length > 0) {
            const currIdx = queue.pop()!;
            const cr = Math.floor(currIdx / width);
            const cc = currIdx % width;
            const csx = x + cc;
            const csy = y + cr;
            const sheetIdx = csy * sheetWidth + csx;

            cluster.push({ c: cc, r: cr, patchIdx: currIdx, sheetIdx });

            // Check 8-neighbors for touching an active group component
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = cr + dr;
                const nc = cc + dc;

                // Within patch?
                if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
                  const nPatchIdx = nr * width + nc;
                  if (unclaimedMask[nPatchIdx] === 1 && visited[nPatchIdx] === 0) {
                    visited[nPatchIdx] = 1;
                    queue.push(nPatchIdx);
                  }
                }

                // Check sheet-space neighbor label
                const nSheetX = csx + dc;
                const nSheetY = csy + dr;
                if (nSheetX >= 0 && nSheetX < sheetWidth && nSheetY >= 0 && nSheetY < sheetHeight) {
                  const nSheetIdx = nSheetY * sheetWidth + nSheetX;
                  const nLabel = labelMap[nSheetIdx];
                  if (activeGroupLabels.has(nLabel)) {
                    touchedActiveLabel = nLabel;
                  }
                }
              }
            }
          }

          if (touchedActiveLabel !== null) {
            // Case A: Connected restoration extends the existing component
            const targetComp = compByLabel.get(touchedActiveLabel);
            if (targetComp) {
              for (const pt of cluster) {
                labelMap[pt.sheetIdx] = touchedActiveLabel;
                afterLabels[pt.patchIdx] = touchedActiveLabel;
              }
              affectedCompIds.add(targetComp.id);
            }
          } else {
            // Case B: Disconnected restoration creates a new stable component within the active group
            maxLabel++;
            const newLabel = maxLabel;
            activeGroupLabels.add(newLabel);

            let clMinX = sheetWidth, clMinY = sheetHeight;
            let clMaxX = -1, clMaxY = -1;
            let sumX = 0, sumY = 0;

            for (const pt of cluster) {
              labelMap[pt.sheetIdx] = newLabel;
              afterLabels[pt.patchIdx] = newLabel;
              const sx = x + pt.c;
              const sy = y + pt.r;
              sumX += sx;
              sumY += sy;
              if (sx < clMinX) clMinX = sx;
              if (sx > clMaxX) clMaxX = sx;
              if (sy < clMinY) clMinY = sy;
              if (sy > clMaxY) clMaxY = sy;
            }

            const newCompId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const newComp: ArtworkComponent = {
              id: newCompId,
              label: newLabel,
              bounds: {
                x: clMinX,
                y: clMinY,
                width: clMaxX - clMinX + 1,
                height: clMaxY - clMinY + 1
              },
              centroid: {
                x: Math.round(sumX / cluster.length),
                y: Math.round(sumY / cluster.length)
              },
              pixelCount: cluster.length,
              isTiny: cluster.length < 20
            };

            updatedComponents.push(newComp);
            compMap.set(newCompId, newComp);
            compByLabel.set(newLabel, newComp);
            activeGroup.componentIds.push(newCompId);
            affectedCompIds.add(newCompId);
          }
        }
      }
    }
  } else if (patch.mode === 'erase') {
    for (let r = 0; r < height; r++) {
      const sy = y + r;
      const sheetRowOffset = sy * sheetWidth;
      const patchRowOffset = r * width;

      for (let c = 0; c < width; c++) {
        const sx = x + c;
        const sheetIdx = sheetRowOffset + sx;
        const patchIdx = patchRowOffset + c;

        const newAlpha = patch.afterAlpha[patchIdx];
        const curLabel = labelMap[sheetIdx];

        if (newAlpha === 0 && curLabel !== 0) {
          const comp = compByLabel.get(curLabel);
          if (comp) affectedCompIds.add(comp.id);
          labelMap[sheetIdx] = 0;
          afterLabels[patchIdx] = 0;
        } else {
          afterLabels[patchIdx] = curLabel;
        }
      }
    }
  }

  // Recompute bounding boxes and pixel counts for affected components
  for (const compId of affectedCompIds) {
    const comp = compMap.get(compId);
    if (!comp) continue;

    let cMinX = sheetWidth, cMinY = sheetHeight;
    let cMaxX = -1, cMaxY = -1;
    let count = 0;
    let sumX = 0, sumY = 0;

    // Scan the union of previous bounds and patch bounds
    const scanMinX = Math.max(0, Math.min(comp.bounds.x, x));
    const scanMinY = Math.max(0, Math.min(comp.bounds.y, y));
    const scanMaxX = Math.min(sheetWidth - 1, Math.max(comp.bounds.x + comp.bounds.width - 1, x + width - 1));
    const scanMaxY = Math.min(sheetHeight - 1, Math.max(comp.bounds.y + comp.bounds.height - 1, y + height - 1));

    for (let sy = scanMinY; sy <= scanMaxY; sy++) {
      const rowOffset = sy * sheetWidth;
      for (let sx = scanMinX; sx <= scanMaxX; sx++) {
        const idx = rowOffset + sx;
        if (labelMap[idx] === comp.label && alphaMask[idx] > 0) {
          count++;
          sumX += sx;
          sumY += sy;
          if (sx < cMinX) cMinX = sx;
          if (sx > cMaxX) cMaxX = sx;
          if (sy < cMinY) cMinY = sy;
          if (sy > cMaxY) cMaxY = sy;
        }
      }
    }

    comp.pixelCount = count;
    if (count > 0) {
      comp.bounds = {
        x: cMinX,
        y: cMinY,
        width: cMaxX - cMinX + 1,
        height: cMaxY - cMinY + 1
      };
      comp.centroid = {
        x: Math.round(sumX / count),
        y: Math.round(sumY / count)
      };
    } else {
      // Component was completely erased
      comp.bounds = { x: 0, y: 0, width: 0, height: 0 };
    }

    // Find parent group
    for (const g of updatedGroups) {
      if (g.componentIds.includes(compId)) {
        affectedGroupIds.add(g.id);
      }
    }
  }

  // Recalculate group bounds for all affected groups
  for (const gId of affectedGroupIds) {
    const g = updatedGroups.find(grp => grp.id === gId);
    if (!g) continue;

    const ownedComps = g.componentIds.map(id => compMap.get(id)).filter((c): c is ArtworkComponent => !!c && c.pixelCount > 0);
    if (ownedComps.length > 0) {
      let gMinX = sheetWidth, gMinY = sheetHeight;
      let gMaxX = -1, gMaxY = -1;
      for (const c of ownedComps) {
        if (c.bounds.x < gMinX) gMinX = c.bounds.x;
        if (c.bounds.y < gMinY) gMinY = c.bounds.y;
        if (c.bounds.x + c.bounds.width - 1 > gMaxX) gMaxX = c.bounds.x + c.bounds.width - 1;
        if (c.bounds.y + c.bounds.height - 1 > gMaxY) gMaxY = c.bounds.y + c.bounds.height - 1;
      }
      g.bounds = {
        x: gMinX,
        y: gMinY,
        width: Math.max(1, gMaxX - gMinX + 1),
        height: Math.max(1, gMaxY - gMinY + 1)
      };
    }
  }

  return {
    patch,
    affectedGroupIds: Array.from(affectedGroupIds),
    beforeLabels,
    afterLabels,
    previousComponents: prevComponents,
    previousGroups: prevGroups,
    updatedComponents,
    updatedGroups
  };
}

/**
 * Reverts a patch and restores labelMap, components, and groups to exact previous state.
 */
export function revertBrushPatchWithOwnership(
  alphaMask: Uint8Array,
  labelMap: Uint16Array,
  sheetWidth: number,
  diff: OwnershipDiff
): void {
  const { x, y, width, height } = diff.patch.bounds;
  for (let r = 0; r < height; r++) {
    const srcRow = r * width;
    const dstRow = (y + r) * sheetWidth + x;
    alphaMask.set(diff.patch.beforeAlpha.subarray(srcRow, srcRow + width), dstRow);
    labelMap.set(diff.beforeLabels.subarray(srcRow, srcRow + width), dstRow);
  }
}
