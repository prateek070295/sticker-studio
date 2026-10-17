/**
 * Client-Side MediaPipe Selfie Segmentation Service.
 * Runs Google MediaPipe Selfie Segmenter (Landscape .tflite) 100% locally.
 * Retains exact bit-for-bit source RGB camera pixels while predicting clean foreground silhouettes.
 */

let segmenterPromise: Promise<any> | null = null;

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

export interface SegmentPhotoResult {
  mask: Uint8Array; // Binary 1 = foreground, 0 = background (width * height)
  fgCount: number;
  width: number;
  height: number;
}

export async function segmentPhotoForeground(
  sourceImage: ImageData,
  onProgress?: (message: string) => void
): Promise<SegmentPhotoResult> {
  onProgress?.('Initializing local MediaPipe Selfie Segmenter...');
  const segmenter = await getMediaPipeSegmenter();

  onProgress?.('Segmenting photo subjects locally...');
  const W = sourceImage.width;
  const H = sourceImage.height;

  // Render to temporary canvas to supply to MediaPipe segment()
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
    // Bilinear upsampling from model resolution (e.g. 256x144) to native photo resolution
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
