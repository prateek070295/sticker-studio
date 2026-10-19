/**
 * 3-Layer Cartoon Compositor & Die-Cut Engine.
 * Layer 1 (Back SVG) -> Layer 2 (Photographic Head) -> Layer 3 (Front Collar SVG).
 * Generates a unified, smooth white die-cut backing using Euclidean Distance Transform.
 */

import { CartoonTemplateManifest, ExtractedHeadResult, HeadTransform } from '../cartoon/types';
import { computeEuclideanDistanceTransform } from './edt';
import { applyContourSmoothing } from './composer';

/**
 * Computes optimal initial head scale, rotation, and placement
 * based on template manifest headSlot definition and detected face landmarks.
 */
export function computeInitialHeadPlacement(
  template: CartoonTemplateManifest,
  head: ExtractedHeadResult
): HeadTransform {
  const { canvas, headSlot } = template;
  const canvasW = canvas.width;
  const canvasH = canvas.height;

  // Normalized template slot targets in canvas pixels
  const targetHeadPixelWidth = headSlot.targetWidth * canvasW;
  const slotCenterX = headSlot.centerX * canvasW;
  const slotCenterY = headSlot.centerY * canvasH;

  // 1. Calculate Head Scale
  let scale = (targetHeadPixelWidth / Math.max(10, head.width)) * headSlot.defaultScale;
  if (head.landmarks?.boundingBox?.height) {
    const targetFaceH = (headSlot.targetFaceH ?? 0.254) * canvasH;
    scale = (targetFaceH / head.landmarks.boundingBox.height) * headSlot.defaultScale;
  }
  // Clamp scale to sensible bounds
  scale = Math.max(0.4, Math.min(1.8, scale));

  // 2. Calculate Rotation Offset
  let rotationDegrees = headSlot.defaultRotation;
  if (head.landmarks) {
    // Delta angle to align eye line with template target
    const angleDelta = headSlot.targetEyeAngleDegrees - head.landmarks.eyeAngleDegrees;
    rotationDegrees += angleDelta;
  }

  // 3. Center Position
  let centerX = slotCenterX;
  let centerY = slotCenterY;

  if (head.landmarks) {
    // Chin anchoring on collar
    const targetChinX = slotCenterX;
    const targetChinY = (headSlot.targetChinY ?? 0.50) * canvasH;

    const chinY = head.landmarks.estimatedChin?.y ?? (
      head.landmarks.mouthCenter
        ? head.landmarks.mouthCenter.y + (head.landmarks.mouthCenter.y - (head.landmarks.noseTip?.y ?? head.landmarks.mouthCenter.y - 30)) * 0.7
        : head.landmarks.boundingBox.originY + head.landmarks.boundingBox.height
    );

    const chinCropX = (head.landmarks.estimatedChin?.x ?? head.landmarks.eyeMidpoint.x) - head.cropBounds.x;
    const chinCropY = chinY - head.cropBounds.y;

    const dx = chinCropX - head.width * 0.5;
    const dy = chinCropY - head.height * 0.5;

    const rad = (rotationDegrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotChinX = (dx * cos - dy * sin) * scale;
    const rotChinY = (dx * sin + dy * cos) * scale;

    centerX = targetChinX - rotChinX;
    centerY = targetChinY - rotChinY;
  }

  const hairBehind = headSlot.hairLayering === 'behind';

  return {
    centerX: Math.round(centerX),
    centerY: Math.round(centerY),
    scale: parseFloat(scale.toFixed(4)),
    rotationDegrees: parseFloat(rotationDegrees.toFixed(2)),
    hairBehindBody: hairBehind,
    autoPlacement: {
      centerX: Math.round(centerX),
      centerY: Math.round(centerY),
      scale: parseFloat(scale.toFixed(4)),
      rotationDegrees: parseFloat(rotationDegrees.toFixed(2)),
      hairBehindBody: hairBehind,
    },
  };
}

export function createCompatibleCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  return {
    width,
    height,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }),
  } as any;
}

/**
 * High-performance SVG to Canvas rasterizer.
 */
export function rasterizeSvgToCanvas(
  svgMarkup: string,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Failed to create 2d canvas context'));

    const img = new Image();
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG markup into Image: ' + err));
    };

    img.src = url;
  });
}

/**
 * Renders the 3-layer cartoon character (Back SVG -> Photo Head -> Front Collar SVG)
 * into a single unified 1024x1024 canvas.
 */
export async function renderCartoonArtwork(
  template: CartoonTemplateManifest,
  head: ExtractedHeadResult,
  transform: HeadTransform
): Promise<HTMLCanvasElement> {
  const { width: W, height: H } = template.canvas;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create composite canvas context');

  const halfW = head.width * 0.5;
  const halfH = head.height * 0.5;

  // Optional Under-Layer — Photographic Head behind body (when hair behind body is selected)
  if (transform.hairBehindBody) {
    ctx.save();
    ctx.translate(transform.centerX, transform.centerY);
    ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
    ctx.scale(transform.scale, transform.scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(head.canvas, -halfW, -halfH, head.width, head.height);
    ctx.restore();
  }

  // Layer 1 — Back SVG (Body, limbs, waving hand, pop bubble)
  const backCanvas = await rasterizeSvgToCanvas(template.layers.backSvg, W, H);
  ctx.drawImage(backCanvas, 0, 0);

  // Layer 2 — Photographic Head (Transformed)
  ctx.save();
  ctx.translate(transform.centerX, transform.centerY);
  ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(head.canvas, -halfW, -halfH, head.width, head.height);
  ctx.restore();

  // Layer 3 — Front SVG (Collar, lapels, drawstrings overlapping lower neck)
  const frontCanvas = await rasterizeSvgToCanvas(template.layers.frontSvg, W, H);
  ctx.drawImage(frontCanvas, 0, 0);

  return canvas;
}

/**
 * Builds a single continuous white die-cut cutline around the complete 3-layer character
 * using Euclidean Distance Transform and Smooth Outline contour filtering.
 */
export function generateCartoonStickerDieCut(
  artworkCanvas: HTMLCanvasElement,
  borderThickness: number = 24,
  smoothOutlineLevel: number = 2
): {
  artworkCanvas: HTMLCanvasElement;
  stickerCanvas: HTMLCanvasElement;
  tightCrop: { x: number; y: number; width: number; height: number };
} {
  const W = artworkCanvas.width;
  const H = artworkCanvas.height;
  const size = W * H;

  const artCtx = artworkCanvas.getContext('2d');
  if (!artCtx) throw new Error('Cannot get artwork canvas context');

  const artData = artCtx.getImageData(0, 0, W, H);
  const artPixels = artData.data;

  // 1. Binary seed mask for the complete character (alpha > 12)
  const binarySeed = new Uint8Array(size);
  let hasArtwork = false;

  for (let i = 0; i < size; i++) {
    const a = artPixels[i * 4 + 3];
    if (a > 12) {
      binarySeed[i] = 1;
      hasArtwork = true;
    }
  }

  const stickerCanvas = createCompatibleCanvas(W, H);
  const stickerCtx = stickerCanvas.getContext('2d');
  if (!stickerCtx) throw new Error('Cannot get sticker canvas context');

  if (!hasArtwork || borderThickness <= 0) {
    // If no border, return artwork as sticker
    stickerCtx.drawImage(artworkCanvas, 0, 0);
    return {
      artworkCanvas,
      stickerCanvas,
      tightCrop: { x: 0, y: 0, width: W, height: H },
    };
  }

  // 2. Compute Euclidean Distance Transform (distance from each pixel to nearest artwork pixel)
  const rawDist = computeEuclideanDistanceTransform(binarySeed, W, H);

  // 3. Apply Smooth Outline Contour Filter (Level 2 default)
  const smoothedDist = applyContourSmoothing(
    rawDist,
    binarySeed,
    W,
    H,
    smoothOutlineLevel,
    borderThickness
  );

  // 4. Composite: White backing underneath artwork
  const stickerImgData = stickerCtx.createImageData(W, H);
  const out = stickerImgData.data;
  const radius = borderThickness;

  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < H; y++) {
    const rowOffset = y * W;
    for (let x = 0; x < W; x++) {
      const idx = rowOffset + x;
      const pIdx = idx * 4;

      const artA = artPixels[pIdx + 3];
      const dist = smoothedDist[idx];

      // White backing alpha from distance field
      let backingAlpha = 0;
      if (dist <= radius - 0.5) {
        backingAlpha = 255;
      } else if (dist < radius + 0.5) {
        // Antialiased 1px edge transition
        const frac = radius + 0.5 - dist;
        backingAlpha = Math.round(Math.max(0, Math.min(255, frac * 255)));
      }

      // Safety enclosure invariant: artwork pixel always has backing underneath
      if (artA > 0 && backingAlpha < 255) {
        backingAlpha = 255;
      }

      if (artA > 0) {
        // Source artwork pixel over white backing
        const fgNorm = artA / 255;
        const bgNorm = (backingAlpha / 255) * (1 - fgNorm);
        const finalAlpha = fgNorm + bgNorm;

        if (finalAlpha > 0) {
          const r = Math.round((artPixels[pIdx] * fgNorm + 255 * bgNorm) / finalAlpha);
          const g = Math.round((artPixels[pIdx + 1] * fgNorm + 255 * bgNorm) / finalAlpha);
          const b = Math.round((artPixels[pIdx + 2] * fgNorm + 255 * bgNorm) / finalAlpha);

          out[pIdx] = r;
          out[pIdx + 1] = g;
          out[pIdx + 2] = b;
          out[pIdx + 3] = Math.round(finalAlpha * 255);
        }
      } else if (backingAlpha > 0) {
        // Pure white die-cut border
        out[pIdx] = 255;
        out[pIdx + 1] = 255;
        out[pIdx + 2] = 255;
        out[pIdx + 3] = backingAlpha;
      }

      // Track bounding box of visible sticker
      if (out[pIdx + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  stickerCtx.putImageData(stickerImgData, 0, 0);

  const tightCrop = {
    x: Math.max(0, minX - 2),
    y: Math.max(0, minY - 2),
    width: Math.min(W, maxX - minX + 5),
    height: Math.min(H, maxY - minY + 5),
  };

  return {
    artworkCanvas,
    stickerCanvas,
    tightCrop,
  };
}
