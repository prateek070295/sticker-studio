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
 * Builds the group-isolated binary seed mask and full-res distance field.
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
  const minX = Math.max(0, gb.x - padding);
  const minY = Math.max(0, gb.y - padding);
  const maxX = Math.min(sheetWidth, gb.x + gb.width + padding);
  const maxY = Math.min(sheetHeight, gb.y + gb.height + padding);

  const localWidth = maxX - minX;
  const localHeight = maxY - minY;
  const localSize = localWidth * localHeight;

  // Set of labels owned by this group
  const ownedLabels = new Set<number>();
  for (const compId of group.componentIds) {
    const comp = compMap.get(compId);
    if (comp) ownedLabels.add(comp.label);
  }

  // Group-specific binary mask (1 for owned artwork, 0 for everything else)
  const binarySeed = new Uint8Array(localSize);

  for (let ly = 0; ly < localHeight; ly++) {
    const sy = minY + ly;
    const sheetRowOffset = sy * sheetWidth;
    const localRowOffset = ly * localWidth;

    for (let lx = 0; lx < localWidth; lx++) {
      const sx = minX + lx;
      const label = labelMap[sheetRowOffset + sx];
      if (ownedLabels.has(label)) {
        binarySeed[localRowOffset + lx] = 1;
      }
    }
  }

  // Include approved connector bridges if connectBacking is enabled
  if (group.connectBacking && group.bridges && group.bridges.length > 0) {
    for (const bridge of group.bridges) {
      rasterizeBridge(binarySeed, localWidth, localHeight, minX, minY, bridge);
    }
  }

  // Compute local Euclidean Distance Transform
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
    const sheetRowOffset = sy * sheetWidth;
    const localRowOffset = ly * localWidth;

    for (let lx = 0; lx < localWidth; lx++) {
      const sx = patchBounds.x + lx;
      const sheetIdx = sheetRowOffset + sx;
      const localIdx = localRowOffset + lx;
      const outOffset = localIdx * 4;

      const label = labelMap[sheetIdx];
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
