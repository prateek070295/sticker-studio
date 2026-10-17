/**
 * Photo Cutout Adapter for Sticker Studio Composer.
 * Adapts isolated binary masks into StickerGroup representations for zero-leakage,
 * antialiased die-cut compositing without touching production sheet grouping or labelMap.
 */

import { ArtworkComponent, BoundingBox, StickerGroup } from '../types/index';
import { buildGroupDistanceField, compositeSticker } from './composer';

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
  padding: number = 60
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

  // 2. Build isolated labelMap (label 1 for mask) and alphaMask (255 for mask)
  const totalPixels = sourceWidth * sourceHeight;
  const labelMap = new Uint16Array(totalPixels);
  const alphaMask = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] > 0) {
      labelMap[i] = 1;
      alphaMask[i] = 255;
    }
  }

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
  };

  // 3. Compute distance field for die-cut border
  const effectivePadding = Math.max(padding, borderThickness + 10);
  const { distField, patchBounds } = buildGroupDistanceField(
    group,
    compMap,
    labelMap,
    sourceWidth,
    sourceHeight,
    effectivePadding
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
