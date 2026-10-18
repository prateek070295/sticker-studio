/**
 * Photo Cutout Adapter for Sticker Studio Composer.
 * Adapts isolated binary masks into StickerGroup representations for zero-leakage,
 * antialiased die-cut compositing without touching production sheet grouping or labelMap.
 */

import { ArtworkComponent, BoundingBox, StickerGroup } from '../types/index';
import { buildGroupDistanceField, compositeSticker } from './composer';
import { computeEuclideanDistanceTransform } from './edt';
import { analyzeComponents } from './components';
import { refineArtworkAlpha } from './artworkAlphaRefinement';

export interface PhotoFinishingOptions {
  edgeTrim?: number; // 0 to 10 px
  bottomFinish?: 'flat' | 'rounded' | 'curved';
  bottomCurveRadius?: number; // 5 to 100 px, default 30
  smoothOutline?: number; // 0 to 10, default 0 (recommended 1-2 for portraits)
  artworkEdgeSmoothness?: number; // 0 to 10, default 0 (subtle 1-2, moderate 3-5, strong 6-10)
  artworkEdgeFeather?: number; // 0 to 3 px, default 0 (fractional 0.5 px steps)
}

export interface PhotoComposedResult {
  artworkOnlyRgba: Uint8ClampedArray;
  artworkOnlyWidth: number;
  artworkOnlyHeight: number;
  artworkBounds: BoundingBox;
  whiteBackedRgba: Uint8ClampedArray;
  whiteBackedWidth: number;
  whiteBackedHeight: number;
  whiteBackedBounds: BoundingBox;
  bounds: BoundingBox;
}

export function composePhotoCutout(
  mask: Uint8Array,
  sourceRgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  borderThickness: number = 20,
  padding: number = 60,
  smoothOutline: number = 0,
  artworkEdgeSmoothness: number = 0,
  artworkEdgeFeather: number = 0
): PhotoComposedResult {
  // 1. Calculate bounding box of the mask in source coordinates
  let minX = sourceWidth;
  let maxX = -1;
  let minY = sourceHeight;
  let maxY = -1;

  for (let y = 0; y < sourceHeight; y++) {
    const rowOffset = y * sourceWidth;
    for (let x = 0; x < sourceWidth; x++) {
      if (mask[rowOffset + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    // Empty mask
    const emptyBox = { x: 0, y: 0, width: 0, height: 0 };
    return {
      artworkOnlyRgba: new Uint8ClampedArray(0),
      artworkOnlyWidth: 0,
      artworkOnlyHeight: 0,
      artworkBounds: emptyBox,
      whiteBackedRgba: new Uint8ClampedArray(0),
      whiteBackedWidth: 0,
      whiteBackedHeight: 0,
      whiteBackedBounds: emptyBox,
      bounds: emptyBox,
    };
  }

  const bounds: BoundingBox = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  // 2. Build isolated labelMap (label 1 for mask) and refined alphaMask (0..255)
  const totalPixels = sourceWidth * sourceHeight;
  const labelMap = new Uint16Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] > 0) {
      labelMap[i] = 1;
    }
  }

  const alphaMask = refineArtworkAlpha(
    mask,
    sourceWidth,
    sourceHeight,
    artworkEdgeSmoothness,
    artworkEdgeFeather
  );

  const compId = 'photo_cutout_comp';
  const groupId = 'photo_cutout_group';

  const component: ArtworkComponent = {
    id: compId,
    label: 1,
    bounds,
    pixelCount: 0,
    isTiny: false,
    centroid: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
  };

  const compMap = new Map<string, ArtworkComponent>([[compId, component]]);

  const group: StickerGroup = {
    id: groupId,
    name: 'photo_sticker',
    componentIds: [compId],
    bounds,
    borderThickness,
    customBorder: false,
    whiteBackingEnabled: true,
    connectBacking: false,
    solidBacking: false,
    bridges: [],
    excludedFromExport: false,
    backingOverride: smoothOutline > 0 ? {
      groupId,
      smoothingRadius: smoothOutline,
    } : undefined,
  };

  // 3. Compute distance field for die-cut border
  const effectivePadding = Math.max(padding, borderThickness + 10);
  const { distField, patchBounds } = buildGroupDistanceField(
    group,
    compMap,
    labelMap,
    sourceWidth,
    sourceHeight,
    effectivePadding,
    borderThickness
  );

  // 4. Render White-Backed Sticker
  const whiteBacked = compositeSticker(
    group,
    compMap,
    labelMap,
    alphaMask,
    sourceRgba,
    sourceWidth,
    sourceHeight,
    distField,
    patchBounds,
    borderThickness
  );

  // 5. Render Artwork-Only Sticker (borderThickness = 0)
  const artworkGroup: StickerGroup = {
    ...group,
    whiteBackingEnabled: false,
  };

  const artworkOnly = compositeSticker(
    artworkGroup,
    compMap,
    labelMap,
    alphaMask,
    sourceRgba,
    sourceWidth,
    sourceHeight,
    distField,
    patchBounds,
    0
  );

  const whiteCroppedX = whiteBacked.croppedX ?? 0;
  const whiteCroppedY = whiteBacked.croppedY ?? 0;
  const artCroppedX = artworkOnly.croppedX ?? 0;
  const artCroppedY = artworkOnly.croppedY ?? 0;

  return {
    artworkOnlyRgba: artworkOnly.croppedRgba,
    artworkOnlyWidth: artworkOnly.croppedWidth,
    artworkOnlyHeight: artworkOnly.croppedHeight,
    artworkBounds: {
      x: patchBounds.x + artCroppedX,
      y: patchBounds.y + artCroppedY,
      width: artworkOnly.croppedWidth,
      height: artworkOnly.croppedHeight,
    },
    whiteBackedRgba: whiteBacked.croppedRgba,
    whiteBackedWidth: whiteBacked.croppedWidth,
    whiteBackedHeight: whiteBacked.croppedHeight,
    whiteBackedBounds: {
      x: patchBounds.x + whiteCroppedX,
      y: patchBounds.y + whiteCroppedY,
      width: whiteBacked.croppedWidth,
      height: whiteBacked.croppedHeight,
    },
    bounds,
  };
}

/**
 * Trims/erodes alpha mask boundary by trimPixels (in Euclidean distance).
 * Strips color-bleed halos (e.g. cyan/blue background spill) along perimeter
 * without touching interior RGB pixels or damaging fine hair/clothing textures at subtle levels.
 */
export function trimMaskEdges(
  mask: Uint8Array,
  width: number,
  height: number,
  trimPixels: number
): Uint8Array {
  if (trimPixels <= 0) return mask;
  const size = width * height;
  const bg = new Uint8Array(size);
  let hasFg = false;
  let hasBg = false;

  for (let i = 0; i < size; i++) {
    if (mask[i] === 0) {
      bg[i] = 1;
      hasBg = true;
    } else {
      hasFg = true;
    }
  }

  if (!hasFg || !hasBg) return mask;

  // Compute Euclidean distance from every pixel to the nearest background pixel
  const dist = computeEuclideanDistanceTransform(bg, width, height);

  const trimmed = new Uint8Array(size);
  const threshold = trimPixels + 0.4;
  for (let i = 0; i < size; i++) {
    if (mask[i] > 0 && dist[i] >= threshold) {
      trimmed[i] = 1;
    }
  }

  return trimmed;
}

/**
 * Checks if mask extends to within thresholdRow pixels of the bottom canvas edge.
 */
export function maskTouchesBottom(
  mask: Uint8Array,
  width: number,
  height: number,
  thresholdRow: number = 2
): boolean {
  const startY = Math.max(0, height - thresholdRow);
  for (let y = startY; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[rowOffset + x] > 0) return true;
    }
  }
  return false;
}

/**
 * Applies intentional bottom-edge finish when a subject is cut off by the source image edge.
 * - 'flat': leaves bottom edge straight (original camera crop line)
 * - 'rounded': softly rounds the bottom-left and bottom-right corners without cropping torso center
 * - 'curved': creates an elegant convex upward arch at the perimeter without inventing anatomy
 */
export function applyBottomTreatment(
  mask: Uint8Array,
  width: number,
  height: number,
  options: PhotoFinishingOptions
): Uint8Array {
  const mode = options.bottomFinish ?? 'flat';
  if (mode === 'flat') return mask;

  if (!maskTouchesBottom(mask, width, height, 3)) {
    return mask;
  }

  const radius = Math.max(5, Math.min(150, options.bottomCurveRadius ?? 30));
  const out = new Uint8Array(mask);

  // Find lowest active row with foreground pixels
  let yBase = height - 1;
  while (yBase >= height - 4) {
    let rowHasFg = false;
    const rOff = yBase * width;
    for (let x = 0; x < width; x++) {
      if (out[rOff + x] > 0) {
        rowHasFg = true;
        break;
      }
    }
    if (rowHasFg) break;
    yBase--;
  }

  // Scan contiguous foreground segments at bottom rows
  const bottomSpanActive = new Uint8Array(width);
  for (let dy = 0; dy <= 2; dy++) {
    const y = yBase - dy;
    if (y < 0) continue;
    const rOff = y * width;
    for (let x = 0; x < width; x++) {
      if (out[rOff + x] > 0) bottomSpanActive[x] = 1;
    }
  }

  const spans: Array<{ start: number; end: number }> = [];
  let inSpan = false;
  let spanStart = 0;
  for (let x = 0; x < width; x++) {
    if (bottomSpanActive[x] === 1) {
      if (!inSpan) {
        inSpan = true;
        spanStart = x;
      }
    } else {
      if (inSpan) {
        inSpan = false;
        spans.push({ start: spanStart, end: x - 1 });
      }
    }
  }
  if (inSpan) {
    spans.push({ start: spanStart, end: width - 1 });
  }

  for (const span of spans) {
    const spanWidth = span.end - span.start + 1;
    if (spanWidth <= 4) continue;

    if (mode === 'rounded') {
      const R = Math.min(radius, Math.floor(spanWidth / 2));
      const R2 = R * R;
      const cornerTopY = yBase - R;

      // Bottom-Left corner
      const leftCenterX = span.start + R;
      for (let y = cornerTopY; y <= yBase; y++) {
        const rowOff = y * width;
        const dy = y - cornerTopY;
        for (let x = span.start; x < leftCenterX; x++) {
          const dx = x - leftCenterX;
          if (dx * dx + dy * dy > R2) {
            out[rowOff + x] = 0;
          }
        }
      }

      // Bottom-Right corner
      const rightCenterX = span.end - R;
      for (let y = cornerTopY; y <= yBase; y++) {
        const rowOff = y * width;
        const dy = y - cornerTopY;
        for (let x = rightCenterX + 1; x <= span.end; x++) {
          const dx = x - rightCenterX;
          if (dx * dx + dy * dy > R2) {
            out[rowOff + x] = 0;
          }
        }
      }
    } else if (mode === 'curved') {
      const A = Math.min(radius, Math.floor(spanWidth / 2), 80);
      const centerX = (span.start + span.end) / 2;
      const halfW = spanWidth / 2;

      for (let x = span.start; x <= span.end; x++) {
        const u = (x - centerX) / halfW;
        const dy = Math.round(A * (u * u));
        const cutoffY = yBase - dy;

        for (let y = cutoffY + 1; y <= yBase; y++) {
          out[y * width + x] = 0;
        }
      }
    }
  }

  return out;
}

/**
 * Removes small disconnected noise fragments/specks while preserving main subjects
 * and protected candidate bounding boxes (e.g. small legitimate detected figures).
 */
export function cleanStrayFragments(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number = 200,
  protectedBoxes?: BoundingBox[]
): { cleanedMask: Uint8Array; removedCount: number } {
  const { components, labelMap } = analyzeComponents(mask, width, height, 1, 0);

  if (components.length <= 1) {
    return { cleanedMask: mask, removedCount: 0 };
  }

  let maxArea = 0;
  for (const c of components) {
    if (c.pixelCount > maxArea) maxArea = c.pixelCount;
  }

  const out = new Uint8Array(mask);
  let removed = 0;

  for (const c of components) {
    // If component overlaps with any protected candidate box, protect it from deletion
    if (protectedBoxes && protectedBoxes.length > 0) {
      const isProtected = protectedBoxes.some(box => {
        return !(
          c.bounds.x + c.bounds.width < box.x ||
          box.x + box.width < c.bounds.x ||
          c.bounds.y + c.bounds.height < box.y ||
          box.y + box.height < c.bounds.y
        );
      });
      if (isProtected) {
        continue;
      }
    }

    if (c.pixelCount < minArea && c.pixelCount < maxArea * 0.05) {
      removed++;
      const bx = c.bounds.x;
      const by = c.bounds.y;
      const bw = c.bounds.width;
      const bh = c.bounds.height;
      for (let y = by; y < by + bh; y++) {
        const rowOff = y * width;
        for (let x = bx; x < bx + bw; x++) {
          if (labelMap[rowOff + x] === c.label) {
            out[rowOff + x] = 0;
          }
        }
      }
    }
  }

  return { cleanedMask: out, removedCount: removed };
}

/**
 * High-level compositor helper: combines edge defringing and bottom-edge treatment.
 */
export function applyPhotoFinishing(
  mask: Uint8Array,
  width: number,
  height: number,
  options: PhotoFinishingOptions
): Uint8Array {
  let result = mask;

  if (options.edgeTrim && options.edgeTrim > 0) {
    result = trimMaskEdges(result, width, height, options.edgeTrim);
  }

  if (options.bottomFinish && options.bottomFinish !== 'flat') {
    result = applyBottomTreatment(result, width, height, options);
  }

  return result;
}

