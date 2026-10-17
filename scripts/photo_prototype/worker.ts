/**
 * Bundled Web Worker for SlimSAM browser inference.
 */

import { AutoModel, AutoProcessor, SamModel, RawImage, env } from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/';
env.backends.onnx.wasm.wasmPaths = '/ort/';
if (navigator.hardwareConcurrency) {
  env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency);
}

let model: any = null;
let processor: any = null;
let cachedImage: any = null;
let cachedImageInputs: any = null;
let cachedImageEmbeddings: any = null;
let cachedSourceKey: string | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, id, data } = e.data;

  try {
    if (type === 'INIT') {
      const t0 = performance.now();
      console.log('Worker: Loading Xenova/slimsam-77-uniform...');

      model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform', {
        dtype: 'q8',
        progress_callback: (prog: any) => {
          self.postMessage({ type: 'PROGRESS', prog });
        }
      });

      processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');
      const t1 = performance.now();
      console.log('Worker: Model loaded in', (t1 - t0).toFixed(1), 'ms');

      self.postMessage({
        type: 'INIT_DONE',
        id,
        durationMs: t1 - t0,
        executionProvider: 'wasm-simd-threaded',
        threads: env.backends.onnx.wasm.numThreads,
      });
    } else if (type === 'ENCODE') {
      const { imageUrl, sourceKey } = data;
      const t0 = performance.now();

      if (cachedSourceKey === sourceKey && cachedImageEmbeddings) {
        const t1 = performance.now();
        self.postMessage({
          type: 'ENCODE_DONE',
          id,
          cached: true,
          durationMs: t1 - t0,
          dims: cachedImageEmbeddings.image_embeddings.dims,
        });
        return;
      }

      const image = await RawImage.read(imageUrl);
      cachedImage = image;
      cachedImageInputs = await processor(image);
      cachedImageEmbeddings = await model.get_image_embeddings(cachedImageInputs);
      cachedSourceKey = sourceKey;
      const t1 = performance.now();

      self.postMessage({
        type: 'ENCODE_DONE',
        id,
        cached: false,
        durationMs: t1 - t0,
        dims: cachedImageEmbeddings.image_embeddings.dims,
        originalWidth: image.width,
        originalHeight: image.height,
      });
    } else if (type === 'DECODE') {
      const { points, labels } = data;
      console.log('Worker DECODE points count:', points.length, 'points:', JSON.stringify(points), 'labels:', JSON.stringify(labels));
      const t0 = performance.now();

      if (!cachedImageEmbeddings || !cachedImageInputs || !cachedImage) {
        throw new Error('Image embeddings not computed. Call ENCODE first.');
      }

      const input_points = [points];
      const input_labels = [labels];

      const prompt_inputs = await processor(cachedImage, { input_points, input_labels });
      const outputs = await model({
        ...cachedImageEmbeddings,
        input_points: prompt_inputs.input_points,
        input_labels: prompt_inputs.input_labels,
      });

      const tPromptDone = performance.now();

      const masks = await processor.post_process_masks(
        outputs.pred_masks,
        cachedImageInputs.original_sizes,
        cachedImageInputs.reshaped_input_sizes
      );
      const tPostDone = performance.now();

      const iouScores = Array.from(outputs.iou_scores.data as Float32Array);
      const H = cachedImageInputs.original_sizes[0][0];
      const W = cachedImageInputs.original_sizes[0][1];
      const maskSize = H * W;

      const candidates = [];
      for (let c = 0; c < 3; c++) {
        const offset = c * maskSize;
        const subMask = (masks[0].data as Uint8Array).slice(offset, offset + maskSize);
        let pixelCount = 0;
        for (let i = 0; i < maskSize; i++) {
          if (subMask[i] === 1) pixelCount++;
        }
        candidates.push({
          candidateIndex: c,
          score: iouScores[c],
          pixelCount,
          mask: subMask,
        });
      }

      self.postMessage({
        type: 'DECODE_DONE',
        id,
        decodeDurationMs: tPromptDone - t0,
        postProcessDurationMs: tPostDone - tPromptDone,
        totalDurationMs: tPostDone - t0,
        candidates,
        width: W,
        height: H,
      });
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: err.message || String(err),
      stack: err.stack,
    });
  }
};
