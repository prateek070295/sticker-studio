/**
 * Photographic Head Extraction Service for Cartoon Stickers.
 * Identifies face, hair, ears, spectacles, and neck base using MediaPipe BlazeFace
 * and Multiclass Segmentation (Apache 2.0).
 * Refines outer perimeter using V1.3 continuous 8-bit alpha matte smoothing.
 */

import { ExtractedHeadResult, FaceLandmarks } from '../cartoon/types';
import { detectPrimaryFace } from './faceDetector';
import { refineArtworkAlpha } from './artworkAlphaRefinement';

let multiclassSegmenterPromise: Promise<any> | null = null;

export async function getMediaPipeMulticlassSegmenter(): Promise<any> {
  if (multiclassSegmenterPromise) return multiclassSegmenterPromise;

  multiclassSegmenterPromise = (async () => {
    const bundlePath = '/mediapipe/vision_bundle.mjs';
    // @ts-ignore
    const mp = await import(/* @vite-ignore */ bundlePath);
    const ImageSegmenter = mp.ImageSegmenter;
    const FilesetResolver = mp.FilesetResolver;

    const vision = await FilesetResolver.forVisionTasks('/mediapipe');
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/selfie_multiclass_256x256.tflite',
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      outputConfidenceMasks: false,
      outputCategoryMask: true,
    });

    return segmenter;
  })();

  return multiclassSegmenterPromise;
}

export interface ExtractHeadOptions {
  smoothness?: number; // Default 2
  feather?: number; // Default 0.5
  neckExtensionRatio?: number; // How far below chin neck extends (default 0.24)
  hairExtentRatio?: number; // Maximum downward extent of long hair below chin (default 0.75)
}

/**
 * Extracts the complete photographic head (hair, face, ears, glasses, neck anchor)
 * from a selfie image with antialiased 8-bit alpha edges.
 */
export async function extractPhotographicHead(
  source: HTMLImageElement | HTMLCanvasElement | ImageData,
  options: ExtractHeadOptions = {}
): Promise<ExtractedHeadResult> {
  const {
    smoothness = 2,
    feather = 0.5,
    neckExtensionRatio = 0.24,
    hairExtentRatio = 0.75,
  } = options;

  // 1. Prepare source canvas and dimensions
  let W = 0;
  let H = 0;
  let sourceCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;

  if (source instanceof ImageData) {
    W = source.width;
    H = source.height;
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = W;
    sourceCanvas.height = H;
    ctx = sourceCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');
    ctx.putImageData(source, 0, 0);
  } else if ('naturalWidth' in source && source.naturalWidth) {
    W = source.naturalWidth;
    H = source.naturalHeight;
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = W;
    sourceCanvas.height = H;
    ctx = sourceCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');
    ctx.drawImage(source, 0, 0);
  } else {
    W = source.width;
    H = source.height;
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = W;
    sourceCanvas.height = H;
    ctx = sourceCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');
    ctx.drawImage(source, 0, 0);
  }

  // 2. Detect face landmarks (eye positions, tilt, bounding box)
  const landmarks: FaceLandmarks | null = await detectPrimaryFace(sourceCanvas);

  // 3. Run Multiclass Segmentation (categories: 0=bg, 1=hair, 2=body, 3=face, 4=clothes, 5=accessories)
  let rawCategoryMask: Uint8Array | null = null;
  let modelW = 0;
  let modelH = 0;

  try {
    const segmenter = await getMediaPipeMulticlassSegmenter();
    const segResult = segmenter.segment(sourceCanvas);
    if (segResult?.categoryMask) {
      modelW = segResult.categoryMask.width;
      modelH = segResult.categoryMask.height;
      rawCategoryMask = segResult.categoryMask.getAsUint8Array();
    }
  } catch (err) {
    console.warn('[CartoonHeadExtractor] Multiclass segmenter failed, falling back:', err);
  }

  // Determine face geometry
  let faceBox = landmarks?.boundingBox ?? {
    originX: Math.round(W * 0.25),
    originY: Math.round(H * 0.15),
    width: Math.round(W * 0.5),
    height: Math.round(H * 0.5),
  };

  const eyeMid = landmarks?.eyeMidpoint ?? {
    x: faceBox.originX + faceBox.width * 0.5,
    y: faceBox.originY + faceBox.height * 0.4,
  };

  const eyeDist = landmarks?.eyeDistance ?? faceBox.width * 0.4;
  const chinY = landmarks?.mouthCenter
    ? landmarks.mouthCenter.y + (landmarks.mouthCenter.y - (landmarks.noseTip?.y ?? landmarks.mouthCenter.y - 30)) * 0.7
    : faceBox.originY + faceBox.height * 0.95;

  // Restrict neck to collar overlap depth under chin
  const maxNeckDepth = Math.min(48, faceBox.height * 0.24);
  const maxNeckY = chinY + maxNeckDepth;
  const neckMinX = eyeMid.x - eyeDist * 0.95;
  const neckMaxX = eyeMid.x + eyeDist * 0.95;

  // 4. Construct Full-Resolution Binary Head Mask & Vertical Taper Map
  const binaryMask = new Uint8Array(W * H);
  const hairTaperMap = new Float32Array(W * H);
  hairTaperMap.fill(1.0);

  const centerHairDepth = faceBox.height * hairExtentRatio;
  const taperZone = Math.max(16, Math.min(48, faceBox.height * 0.20));

  if (rawCategoryMask && modelW > 0 && modelH > 0) {
    for (let y = 0; y < H; y++) {
      const my = Math.min(modelH - 1, Math.round((y / H) * (modelH - 1)));
      const rowOffset = my * modelW;
      const maskRowOffset = y * W;

      for (let x = 0; x < W; x++) {
        const mx = Math.min(modelW - 1, Math.round((x / W) * (modelW - 1)));
        const cat = rawCategoryMask[rowOffset + mx];

        // Anatomical shoulder drape limit for hair:
        // Allows natural lock length over shoulders while preventing drop toward feet
        const sideDist = Math.abs(x - eyeMid.x) / Math.max(10, faceBox.width * 0.65);
        const shoulderSlope = Math.min(1.2, sideDist);
        const maxHairY = chinY + centerHairDepth + shoulderSlope * (faceBox.height * 0.35);

        let isIncluded = false;
        if (cat === 3 || cat === 5) {
          // 3 = Face-skin, 5 = Accessories/Glasses/Hats
          if (y <= maxNeckY + 12) {
            isIncluded = true;
          }
        } else if (cat === 1) {
          // 1 = Hair: bounded by anatomical shoulder drape with soft tip falloff
          if (y <= maxHairY) {
            isIncluded = true;
            if (y > maxHairY - taperZone) {
              const taper = (maxHairY - y) / taperZone;
              hairTaperMap[maskRowOffset + x] = Math.max(0, Math.min(1.0, taper));
            }
          }
        } else if (cat === 2) {
          // 2 = Body-skin: include if within neck anchor zone below chin
          if (y >= chinY - 10 && y <= maxNeckY && x >= neckMinX && x <= neckMaxX) {
            isIncluded = true;
          }
        }

        if (isIncluded) {
          binaryMask[maskRowOffset + x] = 1;
        }
      }
    }
  } else {
    // Fallback heuristic if ML model unavailable: elliptical face region
    const rx = faceBox.width * 0.55;
    const ry = faceBox.height * 0.65;
    const cx = faceBox.originX + faceBox.width * 0.5;
    const cy = faceBox.originY + faceBox.height * 0.5;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) {
          binaryMask[y * W + x] = 1;
        }
      }
    }
  }

  // 5. Connected Component Filtering (Retain component containing face center)
  const seedX = Math.max(0, Math.min(W - 1, Math.round(eyeMid.x)));
  const seedY = Math.max(0, Math.min(H - 1, Math.round(eyeMid.y)));

  const filteredMask = isolateConnectedHeadComponent(binaryMask, W, H, seedX, seedY);

  // 6. Calculate Bounding Box of Head
  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  let fgPixels = 0;

  for (let y = 0; y < H; y++) {
    const rowOffset = y * W;
    for (let x = 0; x < W; x++) {
      if (filteredMask[rowOffset + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        fgPixels++;
      }
    }
  }

  // Fallback if mask is empty
  if (fgPixels < 100) {
    minX = Math.max(0, faceBox.originX - 20);
    minY = Math.max(0, faceBox.originY - 40);
    maxX = Math.min(W - 1, faceBox.originX + faceBox.width + 20);
    maxY = Math.min(H - 1, faceBox.originY + faceBox.height + 40);
  }

  // Add 16px safety padding around head
  const pad = 16;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(W - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(H - cropY, maxY - minY + 1 + pad * 2);

  const cropBounds = { x: cropX, y: cropY, width: cropW, height: cropH };

  // 7. Extract Crop Alpha Mask and Apply V1.3 Alpha Matte Refinement
  const cropBinaryMask = new Uint8Array(cropW * cropH);
  for (let cy = 0; cy < cropH; cy++) {
    const srcRow = (cropY + cy) * W;
    const dstRow = cy * cropW;
    for (let cx = 0; cx < cropW; cx++) {
      cropBinaryMask[dstRow + cx] = filteredMask[srcRow + (cropX + cx)];
    }
  }

  // Continuous 8-bit alpha matte (0..255)
  const refinedAlpha = refineArtworkAlpha(cropBinaryMask, cropW, cropH, smoothness, feather);

  // Modulate alpha with hairTaperMap to softly feather ends of long hair without flat cuts
  for (let cy = 0; cy < cropH; cy++) {
    const srcRow = (cropY + cy) * W;
    const dstRow = cy * cropW;
    for (let cx = 0; cx < cropW; cx++) {
      const taper = hairTaperMap[srcRow + (cropX + cx)];
      if (taper < 1.0) {
        refinedAlpha[dstRow + cx] = Math.round(refinedAlpha[dstRow + cx] * taper);
      }
    }
  }

  // 8. Render photographic crop to output canvas
  const headCanvas = document.createElement('canvas');
  headCanvas.width = cropW;
  headCanvas.height = cropH;
  const headCtx = headCanvas.getContext('2d');
  if (!headCtx) throw new Error('Failed to create head canvas context');

  // Copy RGB pixels from source
  headCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Modulate alpha channel with refinedAlpha
  const headImgData = headCtx.getImageData(0, 0, cropW, cropH);
  const pixels = headImgData.data;
  for (let i = 0; i < cropW * cropH; i++) {
    pixels[i * 4 + 3] = refinedAlpha[i];
  }
  headCtx.putImageData(headImgData, 0, 0);

  return {
    canvas: headCanvas,
    width: cropW,
    height: cropH,
    cropBounds,
    alphaMask: refinedAlpha,
    landmarks,
  };
}

/**
 * 8-connected flood fill from seed point to retain only the head and hair,
 * dropping detached arms, hands, or background people.
 */
function isolateConnectedHeadComponent(
  mask: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number
): Uint8Array {
  const size = width * height;
  const result = new Uint8Array(size);

  // Find nearest foreground pixel to seed if seed is not on foreground
  let startIdx = seedY * width + seedX;
  if (mask[startIdx] === 0) {
    let found = false;
    for (let r = 1; r < 50 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = seedX + dx;
          const ny = seedY + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = ny * width + nx;
            if (mask[idx] > 0) {
              startIdx = idx;
              found = true;
            }
          }
        }
      }
    }
    if (!found) return mask; // return whole mask if no foreground nearby
  }

  // Breadth-first search queue
  const queue = new Int32Array(size);
  let qHead = 0;
  let qTail = 0;

  queue[qTail++] = startIdx;
  result[startIdx] = 1;

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % width;
    const cy = Math.floor(curr / width);

    // 8-connected neighbors
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= height) continue;
      const rowOffset = ny * width;

      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= width) continue;

        const nIdx = rowOffset + nx;
        if (mask[nIdx] > 0 && result[nIdx] === 0) {
          result[nIdx] = 1;
          queue[qTail++] = nIdx;
        }
      }
    }
  }

  return result;
}
