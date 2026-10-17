/**
 * Group-specific isolated compositing engine.
 * Ensures zero pixel leakage from adjacent stickers, produces smooth white die-cut backings,
 * and outputs print-ready transparent RGBA buffers.
 */

import { computeEuclideanDistanceTransform } from './edt';
import { rasterizeBridge } from './bridging';
import { ArtworkComponent, BoundingBox, StickerGroup } from '../types';

export interface ComposedSticker {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  tightCrop: BoundingBox;
}

/**
 * Applies a separable morphological filter to smooth jagged raster steps along silhouette contours.
 */
function applyContourSmoothing(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const temp = new Float32Array(width * height);
  const out = new Uint8Array(width * height);
  const r = Math.min(10, Math.round(radius));

  // Horizontal blur pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    for (let x = 0; x < width; x++) {
      if (x === 0) {
        for (let k = -r; k <= r; k++) {
          const px = Math.max(0, Math.min(width - 1, k));
          sum += mask[rowOffset + px];
        }
      } else {
        const drop = Math.max(0, x - r - 1);
        const add = Math.min(width - 1, x + r);
        sum += mask[rowOffset + add] - mask[rowOffset + drop];
      }
      temp[rowOffset + x] = sum / (2 * r + 1);
    }
  }

  // Vertical blur pass & thresholding at 0.5
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      if (y === 0) {
        for (let k = -r; k <= r; k++) {
          const py = Math.max(0, Math.min(height - 1, k));
          sum += temp[py * width + x];
        }
      } else {
        const drop = Math.max(0, y - r - 1);
        const add = Math.min(height - 1, y + r);
        sum += temp[add * width + x] - temp[drop * width + x];
      }
      const val = sum / (2 * r + 1);
      out[y * width + x] = val >= 0.5 ? 1 : 0;
    }
  }

  return out;
}

/**
 * Builds the group-isolated binary seed mask and full-res distance field.
 * Follows the strict backing geometry pipeline:
 * Base Seed -> Manual Add/Remove Edits -> Bridges -> Contour Smoothing -> Linear EDT.
 * Padded by margin to prevent border clipping.
 */
export function buildGroupDistanceField(
  group: StickerGroup,
  compMap: Map<string, ArtworkComponent>,
  labelMap: Uint16Array,
  sheetWidth: number,
  sheetHeight: number,
  padding: number = 60
): {
  distField: Float32Array;
  patchBounds: BoundingBox;
  localWidth: number;
  localHeight: number;
} {
  const gb = group.bounds;
  const minX = gb.x - padding;
  const minY = gb.y - padding;
  const maxX = gb.x + gb.width + padding;
  const maxY = gb.y + gb.height + padding;

  const localWidth = maxX - minX;
  const localHeight = maxY - minY;
  const localSize = localWidth * localHeight;

  // Set of labels owned by this group
  const ownedLabels = new Set<number>();
  for (const compId of group.componentIds) {
    const comp = compMap.get(compId);
    if (comp) ownedLabels.add(comp.label);
  }

  // 1. Base seed mask
  let binarySeed = new Uint8Array(localSize);

  for (let ly = 0; ly < localHeight; ly++) {
    const sy = minY + ly;
    const localRowOffset = ly * localWidth;

    if (sy >= 0 && sy < sheetHeight) {
      const sheetRowOffset = sy * sheetWidth;
      for (let lx = 0; lx < localWidth; lx++) {
        const sx = minX + lx;
        if (sx >= 0 && sx < sheetWidth) {
          const label = labelMap[sheetRowOffset + sx];
          if (ownedLabels.has(label)) {
            binarySeed[localRowOffset + lx] = 1;
          }
        }
      }
    }
  }

  // 2. Apply manual backing overrides (additions and subtractions)
  if (group.backingOverride) {
    const { addedMask, removedMask, bounds: overrideBounds } = group.backingOverride;
    if (addedMask) {
      if (addedMask.length === localSize) {
        for (let i = 0; i < localSize; i++) {
          if (addedMask[i] === 1) binarySeed[i] = 1;
        }
      } else if (overrideBounds && addedMask.length === overrideBounds.width * overrideBounds.height) {
        for (let oy = 0; oy < overrideBounds.height; oy++) {
          const sy = overrideBounds.y + oy;
          const ly = sy - minY;
          if (ly >= 0 && ly < localHeight) {
            for (let ox = 0; ox < overrideBounds.width; ox++) {
              const sx = overrideBounds.x + ox;
              const lx = sx - minX;
              if (lx >= 0 && lx < localWidth) {
                if (addedMask[oy * overrideBounds.width + ox] === 1) {
                  binarySeed[ly * localWidth + lx] = 1;
                }
              }
            }
          }
        }
      }
    }
    if (removedMask) {
      if (removedMask.length === localSize) {
        for (let i = 0; i < localSize; i++) {
          if (removedMask[i] === 1) binarySeed[i] = 0;
        }
      } else if (overrideBounds && removedMask.length === overrideBounds.width * overrideBounds.height) {
        for (let oy = 0; oy < overrideBounds.height; oy++) {
          const sy = overrideBounds.y + oy;
          const ly = sy - minY;
          if (ly >= 0 && ly < localHeight) {
            for (let ox = 0; ox < overrideBounds.width; ox++) {
              const sx = overrideBounds.x + ox;
              const lx = sx - minX;
              if (lx >= 0 && lx < localWidth) {
                if (removedMask[oy * overrideBounds.width + ox] === 1) {
                  binarySeed[ly * localWidth + lx] = 0;
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Include approved connector bridges if connectBacking is enabled
  if (group.connectBacking && group.bridges && group.bridges.length > 0) {
    for (const bridge of group.bridges) {
      rasterizeBridge(binarySeed, localWidth, localHeight, minX, minY, bridge);
    }
  }

  // 4. Contour smoothing
  if (group.backingOverride?.smoothingRadius && group.backingOverride.smoothingRadius > 0) {
    binarySeed = applyContourSmoothing(
      binarySeed,
      localWidth,
      localHeight,
      group.backingOverride.smoothingRadius
    );
  }

  // 5. Compute local Euclidean Distance Transform
  const distField = computeEuclideanDistanceTransform(binarySeed, localWidth, localHeight);

  return {
    distField,
    patchBounds: { x: minX, y: minY, width: localWidth, height: localHeight },
    localWidth,
    localHeight
  };
}

/**
 * Renders an isolated sticker group into an RGBA ImageData buffer.
 * Composites the white die-cut backing under the isolated artwork pixels.
 */
export function compositeSticker(
  group: StickerGroup,
  compMap: Map<string, ArtworkComponent>,
  labelMap: Uint16Array,
  alphaMask: Uint8Array,
  sourceRgba: Uint8ClampedArray,
  sheetWidth: number,
  sheetHeight: number,
  distField: Float32Array,
  patchBounds: BoundingBox,
  borderThickness: number,
  safetyPadding: number = 4
): {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  croppedWidth: number;
  croppedHeight: number;
  croppedRgba: Uint8ClampedArray;
} {
  const localWidth = patchBounds.width;
  const localHeight = patchBounds.height;
  const localSize = localWidth * localHeight;
  const outRgba = new Uint8ClampedArray(localSize * 4);

  const ownedLabels = new Set<number>();
  for (const compId of group.componentIds) {
    const comp = compMap.get(compId);
    if (comp) ownedLabels.add(comp.label);
  }

  const whiteBacking = group.whiteBackingEnabled && borderThickness > 0;
  const radius = borderThickness;

  let minCropX = localWidth;
  let maxCropX = 0;
  let minCropY = localHeight;
  let maxCropY = 0;

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
      const outOffset = localIdx * 4;

      const label = isInsideSheet ? labelMap[sheetIdx] : 0;
      const isOwnedArtwork = ownedLabels.has(label);
      const artworkAlpha = isOwnedArtwork ? alphaMask[sheetIdx] : 0;

      // 1. Calculate white backing alpha from distance field
      let backingAlpha = 0;
      if (whiteBacking) {
        const dist = distField[localIdx];
        if (dist <= radius - 0.5) {
          backingAlpha = 255;
        } else if (dist < radius + 0.5) {
          // Smooth 1-pixel antialiasing transition at edge
          const frac = (radius + 0.5) - dist;
          backingAlpha = Math.round(Math.max(0, Math.min(255, frac * 255)));
        }
      }

      // 2. Composite: artwork over white backing
      if (artworkAlpha > 0) {
        // Original source artwork pixel
        const srcOffset = sheetIdx * 4;
        const srcR = sourceRgba[srcOffset];
        const srcG = sourceRgba[srcOffset + 1];
        const srcB = sourceRgba[srcOffset + 2];
        const srcA = artworkAlpha / 255;

        if (backingAlpha > 0 && srcA < 1) {
          // Standard Over blending: artwork over white backing
          const backA = (backingAlpha / 255) * (1 - srcA);
          const finalA = srcA + backA;
          outRgba[outOffset] = Math.round((srcR * srcA + 255 * backA) / finalA);
          outRgba[outOffset + 1] = Math.round((srcG * srcA + 255 * backA) / finalA);
          outRgba[outOffset + 2] = Math.round((srcB * srcA + 255 * backA) / finalA);
          outRgba[outOffset + 3] = Math.round(finalA * 255);
        } else {
          // Artwork fully opaque
          outRgba[outOffset] = srcR;
          outRgba[outOffset + 1] = srcG;
          outRgba[outOffset + 2] = srcB;
          outRgba[outOffset + 3] = artworkAlpha;
        }

        // Track crop bounds
        if (lx < minCropX) minCropX = lx;
        if (lx > maxCropX) maxCropX = lx;
        if (ly < minCropY) minCropY = ly;
        if (ly > maxCropY) maxCropY = ly;
      } else if (backingAlpha > 0) {
        // Pure white die-cut border
        outRgba[outOffset] = 255;
        outRgba[outOffset + 1] = 255;
        outRgba[outOffset + 2] = 255;
        outRgba[outOffset + 3] = backingAlpha;

        // Track crop bounds
        if (lx < minCropX) minCropX = lx;
        if (lx > maxCropX) maxCropX = lx;
        if (ly < minCropY) minCropY = ly;
        if (ly > maxCropY) maxCropY = ly;
      }
    }
  }

  // Handle empty or zero bounds
  if (minCropX > maxCropX || minCropY > maxCropY) {
    minCropX = 0;
    maxCropX = localWidth - 1;
    minCropY = 0;
    maxCropY = localHeight - 1;
  }

  // Add safety padding
  const paddedMinX = Math.max(0, minCropX - safetyPadding);
  const paddedMinY = Math.max(0, minCropY - safetyPadding);
  const paddedMaxX = Math.min(localWidth - 1, maxCropX + safetyPadding);
  const paddedMaxY = Math.min(localHeight - 1, maxCropY + safetyPadding);

  const croppedWidth = paddedMaxX - paddedMinX + 1;
  const croppedHeight = paddedMaxY - paddedMinY + 1;
  const croppedRgba = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);

  for (let cy = 0; cy < croppedHeight; cy++) {
    const srcRow = (paddedMinY + cy) * localWidth;
    const dstRow = cy * croppedWidth;
    for (let cx = 0; cx < croppedWidth; cx++) {
      const srcIdx = (srcRow + (paddedMinX + cx)) * 4;
      const dstIdx = (dstRow + cx) * 4;
      croppedRgba[dstIdx] = outRgba[srcIdx];
      croppedRgba[dstIdx + 1] = outRgba[srcIdx + 1];
      croppedRgba[dstIdx + 2] = outRgba[srcIdx + 2];
      croppedRgba[dstIdx + 3] = outRgba[srcIdx + 3];
    }
  }

  return {
    rgba: outRgba,
    width: localWidth,
    height: localHeight,
    croppedWidth,
    croppedHeight,
    croppedRgba
  };
}
