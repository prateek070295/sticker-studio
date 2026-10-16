/**
 * Connected-Component Analysis (CCA) engine.
 * Identifies distinct 8-connected foreground pieces, computes stable component IDs,
 * precise bounding boxes, pixel counts, and centroids.
 */

import { ArtworkComponent, BoundingBox } from '../types';

export interface ComponentAnalysisResult {
  components: ArtworkComponent[];
  labelMap: Uint16Array; // Flat array matching width * height. 0 = bg, label = comp_N
}

export function analyzeComponents(
  foregroundSupport: Uint8Array,
  width: number,
  height: number,
  minArea: number = 10,
  tinyThreshold: number = 120
): ComponentAnalysisResult {
  const size = width * height;
  const labelMap = new Uint16Array(size);
  const components: ArtworkComponent[] = [];

  // Temporary queue for BFS component discovery
  const queue = new Int32Array(size);
  let nextLabel = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;

      // Unlabeled foreground pixel
      if (foregroundSupport[startIdx] === 1 && labelMap[startIdx] === 0) {
        const currentLabel = nextLabel;
        let head = 0;
        let tail = 0;

        queue[tail++] = startIdx;
        labelMap[startIdx] = currentLabel;

        let minX = x, maxX = x;
        let minY = y, maxY = y;
        let sumX = 0, sumY = 0;
        let count = 0;

        while (head < tail) {
          const curr = queue[head++];
          const cx = curr % width;
          const cy = Math.floor(curr / width);

          count++;
          sumX += cx;
          sumY += cy;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 8-connected neighborhood
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= width) continue;

              const nIdx = ny * width + nx;
              if (foregroundSupport[nIdx] === 1 && labelMap[nIdx] === 0) {
                labelMap[nIdx] = currentLabel;
                queue[tail++] = nIdx;
              }
            }
          }
        }

        // Ignore micro noise (< minArea pixels, e.g. stray single sensor noise pixels)
        if (count >= minArea) {
          const bounds: BoundingBox = {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
          };

          components.push({
            id: `comp_${currentLabel}`,
            label: currentLabel,
            bounds,
            pixelCount: count,
            centroid: {
              x: Math.round(sumX / count),
              y: Math.round(sumY / count)
            },
            isTiny: count < tinyThreshold
          });

          nextLabel++;
          // Safety guard for 16-bit label map limit
          if (nextLabel >= 65535) {
            console.warn('Component limit reached (65534 components)');
            break;
          }
        } else {
          // Relabel rejected noise as 0
          for (let k = 0; k < tail; k++) {
            labelMap[queue[k]] = 0;
          }
        }
      }
    }
  }

  return {
    components,
    labelMap
  };
}
