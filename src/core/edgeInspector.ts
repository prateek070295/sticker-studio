/**
 * Actionable Edge Quality Inspector.
 * Detects color fringing/halos, isolated backing islands, razor-thin bridges,
 * and border clipping with configurable thresholds and physical print DPI interpretation.
 */

import { ArtworkComponent, BoundingBox, EdgeInspectorConfig, EdgeWarning, StickerGroup } from '../types';

export const DEFAULT_EDGE_CONFIG: EdgeInspectorConfig = {
  colorHaloTolerance: 25,
  minBridgeWidthPx: 8,
  printDpi: 300,
  minPhysicalBridgeMm: 1.0,
  detectIsolatedIslands: true,
  detectBorderClipping: true
};

/**
 * Computes effective minimum bridge width in pixels, factoring in print DPI if configured.
 */
export function getEffectiveMinBridgeWidth(config: EdgeInspectorConfig): number {
  let minPx = config.minBridgeWidthPx || 8;
  if (config.printDpi && config.minPhysicalBridgeMm) {
    const physicalPx = Math.round((config.minPhysicalBridgeMm * config.printDpi) / 25.4);
    minPx = Math.max(minPx, physicalPx);
  }
  return minPx;
}

/**
 * Inspects a sticker group for edge and backing anomalies.
 */
export function inspectStickerEdge(
  group: StickerGroup,
  compMap: Map<string, ArtworkComponent>,
  labelMap: Uint16Array,
  alphaMask: Uint8Array,
  sourceRgba: Uint8ClampedArray,
  sheetWidth: number,
  sheetHeight: number,
  distField: Float32Array,
  patchBounds: BoundingBox,
  estimatedBgColor: [number, number, number],
  config: EdgeInspectorConfig = DEFAULT_EDGE_CONFIG
): EdgeWarning[] {
  const warnings: EdgeWarning[] = [];
  const localWidth = patchBounds.width;
  const localHeight = patchBounds.height;
  const localSize = localWidth * localHeight;

  const ownedLabels = new Set<number>();
  for (const compId of group.componentIds) {
    const comp = compMap.get(compId);
    if (comp) ownedLabels.add(comp.label);
  }

  const radius = group.borderThickness;
  const effectiveMinBridge = getEffectiveMinBridgeWidth(config);

  // 1. Check connector bridges
  if (group.bridges && group.bridges.length > 0) {
    for (const bridge of group.bridges) {
      if (bridge.enabled && bridge.width < effectiveMinBridge) {
        warnings.push({
          id: `warn_bridge_${bridge.id}`,
          type: 'thin-bridge',
          severity: 'warning',
          message: `Bridge between ${bridge.fromCompId} and ${bridge.toCompId} is only ${bridge.width}px (minimum recommended: ${effectiveMinBridge}px / ${config.minPhysicalBridgeMm || 1}mm @ ${config.printDpi || 300} DPI).`,
          location: {
            x: Math.min(bridge.x1, bridge.x2),
            y: Math.min(bridge.y1, bridge.y2),
            width: Math.abs(bridge.x2 - bridge.x1) + bridge.width,
            height: Math.abs(bridge.y2 - bridge.y1) + bridge.width
          },
          autoFixable: true,
          groupId: group.id
        });
      }
    }
  }

  // 2. Pixel scan for Halo, Border Clipping, and Backing Islands
  let clippedPixelCount = 0;
  let haloPixelCount = 0;
  let haloSumX = 0;
  let haloSumY = 0;

  const backingBinary = new Uint8Array(localSize);

  for (let ly = 0; ly < localHeight; ly++) {
    const sy = patchBounds.y + ly;
    const isInsideSheetY = sy >= 0 && sy < sheetHeight;
    const sheetRowOffset = isInsideSheetY ? sy * sheetWidth : 0;
    const localRowOffset = ly * localWidth;

    for (let lx = 0; lx < localWidth; lx++) {
      const sx = patchBounds.x + lx;
      const isInsideSheet = isInsideSheetY && sx >= 0 && sx < sheetWidth;
      const sheetIdx = isInsideSheet ? sheetRowOffset + sx : 0;
      const localIdx = localRowOffset + lx;

      const label = isInsideSheet ? labelMap[sheetIdx] : 0;
      const isOwnedArtwork = ownedLabels.has(label);
      const artworkAlpha = isOwnedArtwork ? alphaMask[sheetIdx] : 0;
      const dist = distField[localIdx];

      const isBacking = group.whiteBackingEnabled && radius > 0 && dist <= radius;
      if (isBacking) {
        backingBinary[localIdx] = 1;

        // Check border clipping on edge of patch
        if (config.detectBorderClipping) {
          if (lx === 0 || ly === 0 || lx === localWidth - 1 || ly === localHeight - 1) {
            clippedPixelCount++;
          }
        }
      }

      // Check color halo / fringing on semi-transparent artwork edge pixels
      if (isInsideSheet && artworkAlpha > 15 && artworkAlpha < 240) {
        const srcOffset = sheetIdx * 4;
        const r = sourceRgba[srcOffset];
        const g = sourceRgba[srcOffset + 1];
        const b = sourceRgba[srcOffset + 2];

        // Euclidean distance to background color
        const bgDist = Math.hypot(
          r - estimatedBgColor[0],
          g - estimatedBgColor[1],
          b - estimatedBgColor[2]
        );

        if (bgDist < config.colorHaloTolerance) {
          haloPixelCount++;
          haloSumX += sx;
          haloSumY += sy;
        }
      }
    }
  }

  // Generate border clipping warning
  if (clippedPixelCount > 0) {
    warnings.push({
      id: `warn_clip_${group.id}`,
      type: 'clipped-border',
      severity: 'error',
      message: `Die-cut border is clipped at the bounding boundary (${clippedPixelCount} edge pixels contact margin).`,
      location: patchBounds,
      autoFixable: false,
      groupId: group.id
    });
  }

  // Generate color halo warning
  if (haloPixelCount > 20) {
    const avgX = Math.round(haloSumX / haloPixelCount);
    const avgY = Math.round(haloSumY / haloPixelCount);
    warnings.push({
      id: `warn_halo_${group.id}`,
      type: 'color-halo',
      severity: 'warning',
      message: `Detected background color fringing / halo (${haloPixelCount} semi-transparent border pixels contain background color tint).`,
      location: { x: avgX - 20, y: avgY - 20, width: 40, height: 40 },
      autoFixable: true,
      groupId: group.id
    });
  }

  // 3. Detect isolated backing islands (detached white patches with no artwork)
  if (config.detectIsolatedIslands && group.whiteBackingEnabled && radius > 0) {
    const visited = new Uint8Array(localSize);
    const q = new Int32Array(localSize);

    for (let ly = 0; ly < localHeight; ly++) {
      for (let lx = 0; lx < localWidth; lx++) {
        const idx = ly * localWidth + lx;
        if (backingBinary[idx] === 1 && visited[idx] === 0) {
          // BFS flood this backing component
          let head = 0;
          let tail = 0;
          q[tail++] = idx;
          visited[idx] = 1;

          let hasArtwork = false;
          let islandPixelCount = 0;
          let minIslandX = lx, maxIslandX = lx;
          let minIslandY = ly, maxIslandY = ly;

          while (head < tail) {
            const curr = q[head++];
            islandPixelCount++;
            const cy = Math.floor(curr / localWidth);
            const cx = curr % localWidth;

            if (cx < minIslandX) minIslandX = cx;
            if (cx > maxIslandX) maxIslandX = cx;
            if (cy < minIslandY) minIslandY = cy;
            if (cy > maxIslandY) maxIslandY = cy;

            const csy = patchBounds.y + cy;
            const csx = patchBounds.x + cx;
            if (csx >= 0 && csx < sheetWidth && csy >= 0 && csy < sheetHeight) {
              const sheetIdx = csy * sheetWidth + csx;
              if (ownedLabels.has(labelMap[sheetIdx]) && alphaMask[sheetIdx] > 0) {
                hasArtwork = true;
              }
            }

            // 4 neighbors
            const neighbors = [curr - 1, curr + 1, curr - localWidth, curr + localWidth];
            for (const n of neighbors) {
              if (n >= 0 && n < localSize && backingBinary[n] === 1 && visited[n] === 0) {
                visited[n] = 1;
                q[tail++] = n;
              }
            }
          }

          // If this entire backing blob contains zero artwork, it's an isolated island!
          if (!hasArtwork && islandPixelCount > 10) {
            warnings.push({
              id: `warn_island_${group.id}_${minIslandX}_${minIslandY}`,
              type: 'isolated-island',
              severity: 'warning',
              message: `Isolated white backing island detected (${islandPixelCount}px detached patch with zero illustration artwork).`,
              location: {
                x: patchBounds.x + minIslandX,
                y: patchBounds.y + minIslandY,
                width: maxIslandX - minIslandX + 1,
                height: maxIslandY - minIslandY + 1
              },
              autoFixable: true,
              groupId: group.id
            });
          }
        }
      }
    }
  }

  return warnings;
}
