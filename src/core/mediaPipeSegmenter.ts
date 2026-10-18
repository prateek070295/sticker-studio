/**
 * Client-Side MediaPipe Vision Service.
 * Runs Google MediaPipe EfficientDet-Lite0 for Person Detection and
 * Selfie Segmenter (Landscape .tflite) for Region-Based Crop Segmentation 100% locally.
 * Retains exact bit-for-bit source RGB camera pixels without hallucination.
 * Strictly Apache 2.0 compliant.
 */

import { BoundingBox, PersonRegion } from '../types';

let segmenterPromise: Promise<any> | null = null;
let detectorPromise: Promise<any> | null = null;

export async function getMediaPipeSegmenter() {
  if (segmenterPromise) return segmenterPromise;

  segmenterPromise = (async () => {
    const bundlePath = '/mediapipe/vision_bundle.mjs';
    // @ts-ignore
    const mp = await import(/* @vite-ignore */ bundlePath);
    const ImageSegmenter = mp.ImageSegmenter;
    const FilesetResolver = mp.FilesetResolver;

    const vision = await FilesetResolver.forVisionTasks('/mediapipe');
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite',
        delegate: 'CPU', // Reliable across all client devices and headless browsers
      },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });

    return segmenter;
  })();

  return segmenterPromise;
}

export async function getMediaPipeDetector() {
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    const bundlePath = '/mediapipe/vision_bundle.mjs';
    // @ts-ignore
    const mp = await import(/* @vite-ignore */ bundlePath);
    const ObjectDetector = mp.ObjectDetector;
    const FilesetResolver = mp.FilesetResolver;

    const vision = await FilesetResolver.forVisionTasks('/mediapipe');
    const detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/efficientdet_lite0.tflite',
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      scoreThreshold: 0.15, // Sensitive enough for backlit sunset silhouettes
      categoryAllowlist: ['person'],
    });

    return detector;
  })();

  return detectorPromise;
}

export interface SegmentPhotoResult {
  mask: Uint8Array; // Binary 1 = foreground, 0 = background (width * height)
  fgCount: number;
  width: number;
  height: number;
}

/**
 * Detect candidate people in a photo using MediaPipe EfficientDet-Lite0.
 * Sorts detected boxes left-to-right for consistent user ordering (P1, P2, ...).
 */
export async function detectPeopleInPhoto(
  sourceImage: ImageData,
  minAreaFraction: number = 0.0008,
  onProgress?: (message: string) => void
): Promise<PersonRegion[]> {
  onProgress?.('Initializing local person detector...');
  const detector = await getMediaPipeDetector();

  onProgress?.('Scanning photo for people...');
  const W = sourceImage.width;
  const H = sourceImage.height;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D canvas context for object detection.');
  ctx.putImageData(sourceImage, 0, 0);

  const result = detector.detect(canvas);
  const detections = result.detections || [];

  const totalArea = W * H;
  const personBoxes: Array<{ box: BoundingBox; score: number; isUncertain: boolean }> = [];

  for (const det of detections) {
    const cat = det.categories?.[0];
    if (!cat || cat.categoryName !== 'person') continue;

    const b = det.boundingBox;
    if (!b) continue;

    const area = b.width * b.height;
    if (area / totalArea < minAreaFraction) continue; // Skip tiny noise below 0.08% image area

    // Clamp to image dimensions
    const x = Math.max(0, Math.min(W - 1, Math.round(b.originX)));
    const y = Math.max(0, Math.min(H - 1, Math.round(b.originY)));
    const w = Math.max(1, Math.min(W - x, Math.round(b.width)));
    const h = Math.max(1, Math.min(H - y, Math.round(b.height)));

    const score = cat.score ?? 0.5;
    const isUncertain = (area / totalArea < 0.0025) || (score < 0.25);

    personBoxes.push({
      box: { x, y, width: w, height: h },
      score,
      isUncertain,
    });
  }

  // Sort left-to-right (by x-coordinate)
  personBoxes.sort((a, b) => a.box.x - b.box.x);

  return personBoxes.map((p, idx) => ({
    id: `person_${idx + 1}_${p.box.x}_${p.box.y}`,
    label: `P${idx + 1} (${Math.round(p.score * 100)}%)`,
    box: p.box,
    score: p.score,
    isManual: false,
    included: true,
    isUncertain: p.isUncertain,
  }));
}

/**
 * Segment a single person crop using MediaPipe Selfie Segmenter Landscape.
 * Applies conservative margin, extracts sub-canvas, runs segmentation at person scale,
 * and suppresses detached neighbor artifacts in the margin.
 */
export async function segmentPersonCrop(
  sourceImage: ImageData,
  region: PersonRegion,
  marginPercent: number = 0.20
): Promise<{ cropMask: Uint8Array; cropBounds: BoundingBox; fgCount: number }> {
  const segmenter = await getMediaPipeSegmenter();
  const W = sourceImage.width;
  const H = sourceImage.height;

  // Calculate conservative crop bounds
  const marginX = Math.round(region.box.width * marginPercent);
  const marginY = Math.round(region.box.height * marginPercent);

  const cropX = Math.max(0, region.box.x - marginX);
  const cropY = Math.max(0, region.box.y - marginY);
  const cropR = Math.min(W, region.box.x + region.box.width + marginX);
  const cropB = Math.min(H, region.box.y + region.box.height + marginY);
  const cropW = cropR - cropX;
  const cropH = cropB - cropY;

  const cropBounds: BoundingBox = { x: cropX, y: cropY, width: cropW, height: cropH };

  if (cropW <= 0 || cropH <= 0) {
    return { cropMask: new Uint8Array(0), cropBounds, fgCount: 0 };
  }

  // Render crop canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) throw new Error('Failed to create crop canvas context.');

  // Create temporary full canvas to drawImage from
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = W;
  fullCanvas.height = H;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Failed to create full canvas context.');
  fullCtx.putImageData(sourceImage, 0, 0);

  cropCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Segment regional crop
  const segResult = segmenter.segment(cropCanvas);
  const confidenceMasks = segResult.confidenceMasks;
  if (!confidenceMasks || confidenceMasks.length === 0) {
    return { cropMask: new Uint8Array(cropW * cropH), cropBounds, fgCount: 0 };
  }

  const fgConfidence = confidenceMasks[0];
  const fgWidth = fgConfidence.width;
  const fgHeight = fgConfidence.height;
  const rawFloats = fgConfidence.getAsFloat32Array();

  const rawCropMask = new Uint8Array(cropW * cropH);

  if (fgWidth === cropW && fgHeight === cropH) {
    for (let i = 0; i < cropW * cropH; i++) {
      if (rawFloats[i] >= 0.45) rawCropMask[i] = 1;
    }
  } else {
    // Bilinear upsample from model resolution to crop resolution
    for (let cy = 0; cy < cropH; cy++) {
      const srcY = (cy / cropH) * (fgHeight - 1);
      const y0 = Math.floor(srcY);
      const y1 = Math.min(fgHeight - 1, y0 + 1);
      const dy = srcY - y0;

      for (let cx = 0; cx < cropW; cx++) {
        const srcX = (cx / cropW) * (fgWidth - 1);
        const x0 = Math.floor(srcX);
        const x1 = Math.min(fgWidth - 1, x0 + 1);
        const dx = srcX - x0;

        const v00 = rawFloats[y0 * fgWidth + x0];
        const v10 = rawFloats[y0 * fgWidth + x1];
        const v01 = rawFloats[y1 * fgWidth + x0];
        const v11 = rawFloats[y1 * fgWidth + x1];

        const top = v00 * (1 - dx) + v10 * dx;
        const bot = v01 * (1 - dx) + v11 * dx;
        const conf = top * (1 - dy) + bot * dy;

        if (conf >= 0.45) {
          rawCropMask[cy * cropW + cx] = 1;
        }
      }
    }
  }

  // Neighbor Isolation: Keep only components connected to the core person bounding box
  const cMinX = Math.max(0, region.box.x - cropX);
  const cMaxX = Math.min(cropW - 1, region.box.x + region.box.width - cropX);
  const cMinY = Math.max(0, region.box.y - cropY);
  const cMaxY = Math.min(cropH - 1, region.box.y + region.box.height - cropY);

  const cleanCropMask = new Uint8Array(cropW * cropH);
  const visited = new Uint8Array(cropW * cropH);
  const queue: number[] = [];

  for (let cy = cMinY; cy <= cMaxY; cy++) {
    for (let cx = cMinX; cx <= cMaxX; cx++) {
      const idx = cy * cropW + cx;
      if (rawCropMask[idx] > 0 && visited[idx] === 0) {
        visited[idx] = 1;
        cleanCropMask[idx] = 1;
        queue.push(idx);
      }
    }
  }

  let qHead = 0;
  while (qHead < queue.length) {
    const curr = queue[qHead++];
    const cx = curr % cropW;
    const cy = Math.floor(curr / cropW);

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < cropW - 1 ? curr + 1 : -1,
      cy > 0 ? curr - cropW : -1,
      cy < cropH - 1 ? curr + cropW : -1,
      (cx > 0 && cy > 0) ? curr - cropW - 1 : -1,
      (cx < cropW - 1 && cy > 0) ? curr - cropW + 1 : -1,
      (cx > 0 && cy < cropH - 1) ? curr + cropW - 1 : -1,
      (cx < cropW - 1 && cy < cropH - 1) ? curr + cropW + 1 : -1,
    ];

    for (let k = 0; k < 8; k++) {
      const nIdx = neighbors[k];
      if (nIdx !== -1 && rawCropMask[nIdx] > 0 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        cleanCropMask[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  let fgCount = 0;
  for (let i = 0; i < cleanCropMask.length; i++) {
    if (cleanCropMask[i] > 0) fgCount++;
  }

  return { cropMask: cleanCropMask, cropBounds, fgCount };
}

/**
 * Combine all accepted/included person regional masks into a canonical full-image binary mask.
 */
export function combinePersonRegions(
  regions: PersonRegion[],
  W: number,
  H: number
): Uint8Array {
  const globalMask = new Uint8Array(W * H);

  for (const region of regions) {
    if (!region.included || !region.cropMask || !region.cropBounds) continue;

    const { x: cropX, y: cropY, width: cropW, height: cropH } = region.cropBounds;
    const cropMask = region.cropMask;

    for (let cy = 0; cy < cropH; cy++) {
      const gy = cropY + cy;
      if (gy < 0 || gy >= H) continue;

      const gRowOff = gy * W;
      const cRowOff = cy * cropW;

      for (let cx = 0; cx < cropW; cx++) {
        const gx = cropX + cx;
        if (gx < 0 || gx >= W) continue;

        if (cropMask[cRowOff + cx] > 0) {
          globalMask[gRowOff + gx] = 1;
        }
      }
    }
  }

  return globalMask;
}

/**
 * Baseline single-pass full-frame foreground segmentation.
 */
export async function segmentPhotoForeground(
  sourceImage: ImageData,
  onProgress?: (message: string) => void
): Promise<SegmentPhotoResult> {
  onProgress?.('Initializing local MediaPipe Selfie Segmenter...');
  const segmenter = await getMediaPipeSegmenter();

  onProgress?.('Segmenting photo subjects locally...');
  const W = sourceImage.width;
  const H = sourceImage.height;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D canvas context for segmentation.');
  ctx.putImageData(sourceImage, 0, 0);

  const result = segmenter.segment(canvas);
  const confidenceMasks = result.confidenceMasks;
  if (!confidenceMasks || confidenceMasks.length === 0) {
    throw new Error('MediaPipe returned empty segmentation masks.');
  }

  const fgConfidence = confidenceMasks[0];
  const fgWidth = fgConfidence.width;
  const fgHeight = fgConfidence.height;
  const rawFloats = fgConfidence.getAsFloat32Array();

  const binaryMask = new Uint8Array(W * H);
  let fgCount = 0;

  if (fgWidth === W && fgHeight === H) {
    for (let i = 0; i < W * H; i++) {
      if (rawFloats[i] >= 0.5) {
        binaryMask[i] = 1;
        fgCount++;
      }
    }
  } else {
    for (let y = 0; y < H; y++) {
      const srcY = (y / H) * (fgHeight - 1);
      const y0 = Math.floor(srcY);
      const y1 = Math.min(fgHeight - 1, y0 + 1);
      const dy = srcY - y0;

      for (let x = 0; x < W; x++) {
        const srcX = (x / W) * (fgWidth - 1);
        const x0 = Math.floor(srcX);
        const x1 = Math.min(fgWidth - 1, x0 + 1);
        const dx = srcX - x0;

        const v00 = rawFloats[y0 * fgWidth + x0];
        const v10 = rawFloats[y0 * fgWidth + x1];
        const v01 = rawFloats[y1 * fgWidth + x0];
        const v11 = rawFloats[y1 * fgWidth + x1];

        const top = v00 * (1 - dx) + v10 * dx;
        const bot = v01 * (1 - dx) + v11 * dx;
        const conf = top * (1 - dy) + bot * dy;

        if (conf >= 0.5) {
          binaryMask[y * W + x] = 1;
          fgCount++;
        }
      }
    }
  }

  return {
    mask: binaryMask,
    fgCount,
    width: W,
    height: H,
  };
}
