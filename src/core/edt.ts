/**
 * High-performance 2D Euclidean Distance Transform (EDT).
 * Based on the linear-time Felzenszwalb-Huttenlocher parabolic envelope algorithm:
 * "Distance Transforms of Sampled Functions" (Theory of Computing, 2012).
 *
 * Runs in strict O(W * H) time using typed arrays.
 */

const INF = 1e9;

/**
 * Computes 1D squared distance transform along a column or row.
 */
function edt1D(
  f: Float32Array,
  n: number,
  d: Float32Array,
  v: Int32Array,
  z: Float32Array
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
}

/**
 * Computes 2D Euclidean Distance Transform from a binary mask.
 * @param binaryMask 1 for foreground, 0 for background
 * @param width Width of image
 * @param height Height of image
 * @returns Float32Array containing Euclidean distance to the nearest foreground pixel (0 inside foreground)
 */
export function computeEuclideanDistanceTransform(
  binaryMask: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const size = width * height;
  const f = new Float32Array(size);

  // Initialize: 0 for foreground seeds, INF for background
  for (let i = 0; i < size; i++) {
    f[i] = binaryMask[i] > 0 ? 0 : INF;
  }

  const d = new Float32Array(size);
  const maxDim = Math.max(width, height);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const colF = new Float32Array(height);
  const colD = new Float32Array(height);

  // Phase 1: Transform along each column
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      colF[y] = f[y * width + x];
    }
    edt1D(colF, height, colD, v, z);
    for (let y = 0; y < height; y++) {
      d[y * width + x] = colD[y];
    }
  }

  // Phase 2: Transform along each row
  const rowF = new Float32Array(width);
  const rowD = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      rowF[x] = d[rowOffset + x];
    }
    edt1D(rowF, width, rowD, v, z);
    for (let x = 0; x < width; x++) {
      d[rowOffset + x] = Math.sqrt(rowD[x]); // Final Euclidean distance in pixels
    }
  }

  return d;
}

/**
 * Computes signed distance field where:
 * - Negative values represent distance inside foreground (to border)
 * - Positive values represent distance outside foreground (to border)
 * - 0 represents exact boundary
 */
export function computeSignedDistanceField(
  binaryMask: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const size = width * height;
  const invMask = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    invMask[i] = binaryMask[i] > 0 ? 0 : 1;
  }

  // Outside distance (distance to foreground)
  const distOutside = computeEuclideanDistanceTransform(binaryMask, width, height);
  // Inside distance (distance to background)
  const distInside = computeEuclideanDistanceTransform(invMask, width, height);

  const sdf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    if (binaryMask[i] > 0) {
      sdf[i] = -distInside[i];
    } else {
      sdf[i] = distOutside[i];
    }
  }

  return sdf;
}
