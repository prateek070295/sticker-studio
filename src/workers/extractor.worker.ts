/**
 * Extractor Web Worker.
 * Executes full-resolution background segmentation, connected-component analysis,
 * and distance field calculations off the main UI thread.
 */

import { estimateBackgroundColor } from '../core/color';
import { segmentForeground } from '../core/segmentation';
import { analyzeComponents } from '../core/components';
import { proposeStickerGroups } from '../core/grouping';
import { computeEuclideanDistanceTransform } from '../core/edt';
import { WorkerRequest, WorkerResponse } from '../types';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  try {
    if (msg.type === 'EXTRACT_SHEET') {
      const { id, imageData, settings, manualBgColor } = msg;
      const { width, height, data: rgba } = imageData;

      // Stage 1: Background Estimation
      self.postMessage({
        type: 'PROGRESS',
        progress: {
          stage: 'estimating',
          percentage: 15,
          message: 'Estimating background color...'
        }
      } as WorkerResponse);

      const bgColor = manualBgColor || estimateBackgroundColor(rgba, width, height);

      // Stage 2: Constrained Exterior Flood Fill & Alpha Refinement
      self.postMessage({
        type: 'PROGRESS',
        progress: {
          stage: 'segmenting',
          percentage: 40,
          message: 'Removing exterior background while protecting internal artwork...'
        }
      } as WorkerResponse);

      const { alphaMask, foregroundSupport, enclosedHoleCandidates } = segmentForeground(
        rgba,
        width,
        height,
        bgColor,
        settings.bgTolerance,
        settings.edgeSoftness
      );

      // Stage 3: Connected-Component Analysis
      self.postMessage({
        type: 'PROGRESS',
        progress: {
          stage: 'components',
          percentage: 70,
          message: 'Analyzing illustration components...'
        }
      } as WorkerResponse);

      const { components, labelMap } = analyzeComponents(
        foregroundSupport,
        width,
        height,
        settings.minComponentArea
      );

      // Stage 4: Intelligent Grouping
      self.postMessage({
        type: 'PROGRESS',
        progress: {
          stage: 'grouping',
          percentage: 90,
          message: 'Proposing logical sticker groups...'
        }
      } as WorkerResponse);

      const suggestedGroups = proposeStickerGroups(
        components,
        settings.groupingProximityThreshold,
        settings.enableTitleDetection
      );

      const holes = enclosedHoleCandidates.map((c, i) => ({
        id: c.id,
        componentId: `comp_hole_${i}`,
        bounds: c.bounds,
        pixelCount: c.pixels.length,
        removedFromArtwork: false
      }));

      // Stage 5: Complete
      const response: WorkerResponse = {
        type: 'EXTRACT_COMPLETE',
        id,
        bgColor,
        components,
        labelMap,
        alphaMask,
        suggestedGroups,
        holes,
        width,
        height
      };

      // Transfer large buffers to eliminate copying overhead
      (self as unknown as Worker).postMessage(response, [
        labelMap.buffer,
        alphaMask.buffer
      ]);
    } else if (msg.type === 'COMPUTE_GROUP_EDT') {
      const { id, groupId, width, height, binaryMask } = msg;

      const distField = computeEuclideanDistanceTransform(binaryMask, width, height);

      const response: WorkerResponse = {
        type: 'GROUP_EDT_COMPLETE',
        id,
        groupId,
        distanceField: distField,
        width,
        height,
        bounds: { x: 0, y: 0, width, height }
      };

      (self as unknown as Worker).postMessage(response, [distField.buffer]);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: 'ERROR',
      error: errorMsg
    } as WorkerResponse);
  }
};
