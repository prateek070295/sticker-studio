/**
 * Dedicated Web Worker for Photo Cutout Segmentation using MediaPipe Selfie Segmenter.
 * Runs non-blocking background inference off the main interface thread.
 */

interface SegmentRequest {
  type: 'SEGMENT_PHOTO';
  id: string;
  imageBitmap: ImageBitmap;
  width: number;
  height: number;
}

interface InitRequest {
  type: 'INIT_MODEL';
}

type WorkerMessage = SegmentRequest | InitRequest;

let segmenterInstance: any = null;
let isInitializing = false;

async function getSegmenter() {
  if (segmenterInstance) return segmenterInstance;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 50));
    }
    return segmenterInstance;
  }

  isInitializing = true;
  try {
    self.postMessage({ type: 'STATUS', status: 'loading', message: 'Loading MediaPipe Selfie Segmenter...' });
    
    // Dynamic import of local vendor bundle
    const bundlePath = '/mediapipe/vision_bundle.mjs';
    // @ts-ignore
    const mp = await import(/* @vite-ignore */ bundlePath);
    const ImageSegmenter = mp.ImageSegmenter;
    const FilesetResolver = mp.FilesetResolver;

    const vision = await FilesetResolver.forVisionTasks('/mediapipe');
    segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/selfie_segmenter_landscape.tflite',
        delegate: 'CPU', // Reliable across all client devices and headless browsers
      },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });

    self.postMessage({ type: 'STATUS', status: 'ready', message: 'MediaPipe model loaded and ready.' });
    return segmenterInstance;
  } catch (err: any) {
    self.postMessage({ type: 'STATUS', status: 'error', message: err?.message || 'Failed to load MediaPipe model.' });
    throw err;
  } finally {
    isInitializing = false;
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'INIT_MODEL') {
    try {
      await getSegmenter();
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err?.message || 'Initialization error' });
    }
    return;
  }

  if (data.type === 'SEGMENT_PHOTO') {
    const { id, imageBitmap, width, height } = data;
    const t0 = performance.now();

    try {
      const segmenter = await getSegmenter();
      self.postMessage({ type: 'PROGRESS', message: 'Segmenting photo foreground...' });

      // MediaPipe accepts ImageBitmap directly in worker context
      const result = segmenter.segment(imageBitmap);
      const confMask = result.confidenceMasks[0];
      const floatData = confMask.getAsFloat32Array();

      // Convert to binary mask (1 = person, 0 = background)
      const binMask = new Uint8Array(width * height);
      let fgCount = 0;

      for (let i = 0; i < floatData.length; i++) {
        if (floatData[i] >= 0.5) {
          binMask[i] = 1;
          fgCount++;
        }
      }

      imageBitmap.close(); // release GPU / canvas memory

      const durationMs = performance.now() - t0;

      // Transfer binary mask buffer without copying
      (self as any).postMessage(
        {
          type: 'SEGMENT_SUCCESS',
          id,
          mask: binMask,
          fgCount,
          width,
          height,
          durationMs,
        },
        [binMask.buffer]
      );
    } catch (err: any) {
      if (imageBitmap) {
        try { imageBitmap.close(); } catch {}
      }
      self.postMessage({
        type: 'SEGMENT_ERROR',
        id,
        error: err?.message || 'Segmentation failed in worker.',
      });
    }
  }
};
