/**
 * Optional MODNet High-Quality Portrait Matting Service.
 * Runs Xenova/modnet on-device via @huggingface/transformers and ONNX Runtime Web.
 * 100% Client-Side, Apache 2.0 compliant.
 * Lazy-loaded: Sheet Mode and standard Photo Mode pay zero initial load cost.
 */

let pipelinePromise: Promise<any> | null = null;

export async function getModnetPipeline(onProgress?: (message: string) => void) {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    try {
      onProgress?.('Loading High-Quality portrait matting model (MODNet)...');
      const { pipeline, env } = await import('@huggingface/transformers');

      // In browser, ensure offline caching is enabled
      if (typeof window !== 'undefined') {
        env.allowLocalModels = false;
        env.useBrowserCache = true;
      }

      const segmenter = await (pipeline as any)('background-removal', 'Xenova/modnet', {
        progress_callback: (progressInfo: any) => {
          if (progressInfo && progressInfo.status === 'progress' && progressInfo.file) {
            const pct = Math.round(progressInfo.progress || 0);
            onProgress?.(`Caching neural weights (${progressInfo.file}): ${pct}%`);
          } else if (progressInfo && progressInfo.status === 'initiate') {
            onProgress?.(`Initializing ${progressInfo.file}...`);
          } else if (progressInfo && progressInfo.status === 'ready') {
            onProgress?.('Neural model ready.');
          }
        },
      });

      return segmenter;
    } catch (err: any) {
      pipelinePromise = null;
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        throw new Error('High-Quality portrait model is not yet cached for offline use. Please connect to the internet once to download the model (~25MB), or switch to Standard mode.');
      }
      throw err;
    }
  })();

  return pipelinePromise;
}

export interface ModnetSegmentResult {
  alphaMatte: Uint8Array; // Continuous alpha values 0..255 (width * height)
  binaryMask: Uint8Array; // Binary support mask 0 or 1 (width * height)
  width: number;
  height: number;
  fgCount: number;
  inferDurationMs: number;
}

/**
 * Segment a single-person portrait using MODNet.
 * Preserves continuous alpha matte and resizes to exact source dimensions if needed.
 */
export async function segmentPortraitModnet(
  sourceImage: ImageData,
  onProgress?: (message: string) => void
): Promise<ModnetSegmentResult> {
  const W = sourceImage.width;
  const H = sourceImage.height;

  onProgress?.('Preparing image for neural matting...');
  const segmenter = await getModnetPipeline(onProgress);

  onProgress?.('Running on-device neural portrait matting...');
  const t0 = performance.now();

  // Create canvas from sourceImage to pass to Transformers.js
  let inputSource: any;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context for MODNet input');
    ctx.putImageData(sourceImage, 0, 0);
    inputSource = canvas;
  } else {
    // Node.js fallback for test environments
    const { RawImage } = await import('@huggingface/transformers');
    inputSource = new RawImage(sourceImage.data, W, H, 4);
  }

  const output = await segmenter(inputSource);
  const inferDurationMs = performance.now() - t0;

  let mW: number;
  let mH: number;
  let mData: Uint8Array | Uint8ClampedArray;
  let isRgba = false;

  if (output && output.data && output.width && output.height) {
    // RawImage from background-removal pipeline
    mW = output.width;
    mH = output.height;
    mData = output.data;
    isRgba = output.channels === 4 || output.data.length === mW * mH * 4;
  } else if (output && output[0] && output[0].mask) {
    // [{ mask }] from image-segmentation pipeline
    mW = output[0].mask.width;
    mH = output[0].mask.height;
    mData = output[0].mask.data;
    isRgba = false;
  } else {
    throw new Error('MODNet returned empty or unrecognized segmentation output');
  }

  const alphaMatte = new Uint8Array(W * H);
  const binaryMask = new Uint8Array(W * H);
  let fgCount = 0;

  if (mW === W && mH === H) {
    for (let i = 0; i < W * H; i++) {
      const a = isRgba ? mData[i * 4 + 3] : mData[i];
      alphaMatte[i] = a;
      if (a >= 128) {
        binaryMask[i] = 1;
        fgCount++;
      }
    }
  } else {
    // Bilinear interpolation to exact source dimensions
    for (let y = 0; y < H; y++) {
      const sy = (y / H) * (mH - 1);
      const y0 = Math.floor(sy);
      const y1 = Math.min(mH - 1, y0 + 1);
      const dy = sy - y0;

      for (let x = 0; x < W; x++) {
        const sx = (x / W) * (mW - 1);
        const x0 = Math.floor(sx);
        const x1 = Math.min(mW - 1, x0 + 1);
        const dx = sx - x0;

        const v00 = isRgba ? mData[(y0 * mW + x0) * 4 + 3] : mData[y0 * mW + x0];
        const v10 = isRgba ? mData[(y0 * mW + x1) * 4 + 3] : mData[y0 * mW + x1];
        const v01 = isRgba ? mData[(y1 * mW + x0) * 4 + 3] : mData[y1 * mW + x0];
        const v11 = isRgba ? mData[(y1 * mW + x1) * 4 + 3] : mData[y1 * mW + x1];

        const top = v00 * (1 - dx) + v10 * dx;
        const bot = v01 * (1 - dx) + v11 * dx;
        const a = Math.round(top * (1 - dy) + bot * dy);

        const idx = y * W + x;
        alphaMatte[idx] = a;
        if (a >= 128) {
          binaryMask[idx] = 1;
          fgCount++;
        }
      }
    }
  }

  onProgress?.('Matting complete.');
  return {
    alphaMatte,
    binaryMask,
    width: W,
    height: H,
    fgCount,
    inferDurationMs,
  };
}

/**
 * Check if the MODNet weights are already cached in browser storage for offline use.
 */
export async function isModnetCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.includes('transformers') || key.includes('modnet')) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        const hasModel = reqs.some(r => r.url.includes('modnet') || r.url.endsWith('.onnx') || r.url.includes('onnx'));
        if (hasModel) return true;
      }
    }
  } catch {
    // Ignore cache inspection errors
  }
  return false;
}
