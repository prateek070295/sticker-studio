/**
 * Browser-compatible Photo Cutout Adapter & Compositor for Prototype Harness.
 * Identical algorithm to src/core/edt.ts, src/core/composer.ts, and src/core/photoAdapter.ts.
 */

const INF = 1e9;

function edt1D(f, n, d, v, z) {
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

export function computeEuclideanDistanceTransform(binaryMask, width, height) {
  const size = width * height;
  const f = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    f[i] = binaryMask[i] > 0 ? 0 : INF;
  }

  const d = new Float32Array(size);
  const maxDim = Math.max(width, height);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const colF = new Float32Array(height);
  const colD = new Float32Array(height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      colF[y] = f[y * width + x];
    }
    edt1D(colF, height, colD, v, z);
    for (let y = 0; y < height; y++) {
      d[y * width + x] = colD[y];
    }
  }

  const rowF = new Float32Array(width);
  const rowD = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      rowF[x] = d[rowOffset + x];
    }
    edt1D(rowF, width, rowD, v, z);
    for (let x = 0; x < width; x++) {
      d[rowOffset + x] = Math.sqrt(rowD[x]);
    }
  }

  return d;
}

function applyContourSmoothing(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const temp = new Float32Array(width * height);
  const out = new Uint8Array(width * height);
  const r = Math.min(10, Math.round(radius));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    for (let x = 0; x < width; x++) {
      if (x === 0) {
        for (let k = -r; k <= r; k++) {
          const px = Math.max(0, Math.min(width - 1, k));
          sum += mask[rowOffset + px];
        }
      } else {
        const drop = Math.max(0, x - r - 1);
        const add = Math.min(width - 1, x + r);
        sum += mask[rowOffset + add] - mask[rowOffset + drop];
      }
      temp[rowOffset + x] = sum / (2 * r + 1);
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      if (y === 0) {
        for (let k = -r; k <= r; k++) {
          const py = Math.max(0, Math.min(height - 1, k));
          sum += temp[py * width + x];
        }
      } else {
        const drop = Math.max(0, y - r - 1);
        const add = Math.min(height - 1, y + r);
        sum += temp[add * width + x] - temp[drop * width + x];
      }
      const val = sum / (2 * r + 1);
      out[y * width + x] = val >= 0.5 ? 1 : 0;
    }
  }

  return out;
}

export function composePhotoCutout(
  mask,
  sourceRgba,
  sourceWidth,
  sourceHeight,
  borderThickness = 20,
  padding = 60
) {
  let minX = sourceWidth, maxX = -1, minY = sourceHeight, maxY = -1;
  for (let y = 0; y < sourceHeight; y++) {
    const row = y * sourceWidth;
    for (let x = 0; x < sourceWidth; x++) {
      if (mask[row + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      artworkOnlyRgba: new Uint8ClampedArray(0),
      whiteBackedRgba: new Uint8ClampedArray(0),
      artworkOnlyWidth: 0,
      artworkOnlyHeight: 0,
      whiteBackedWidth: 0,
      whiteBackedHeight: 0,
      bounds: { x: 0, y: 0, width: 0, height: 0 }
    };
  }

  const effectivePadding = Math.max(padding, borderThickness + 10);
  const pMinX = minX - effectivePadding;
  const pMinY = minY - effectivePadding;
  const pMaxX = maxX + 1 + effectivePadding;
  const pMaxY = maxY + 1 + effectivePadding;

  const localWidth = pMaxX - pMinX;
  const localHeight = pMaxY - pMinY;
  const localSize = localWidth * localHeight;

  const binarySeed = new Uint8Array(localSize);
  for (let ly = 0; ly < localHeight; ly++) {
    const sy = pMinY + ly;
    if (sy >= 0 && sy < sourceHeight) {
      const srcRow = sy * sourceWidth;
      const locRow = ly * localWidth;
      for (let lx = 0; lx < localWidth; lx++) {
        const sx = pMinX + lx;
        if (sx >= 0 && sx < sourceWidth) {
          if (mask[srcRow + sx] > 0) {
            binarySeed[locRow + lx] = 1;
          }
        }
      }
    }
  }

  const smoothed = applyContourSmoothing(binarySeed, localWidth, localHeight, 2.0);
  const distField = computeEuclideanDistanceTransform(smoothed, localWidth, localHeight);

  // White backed render
  const wbOut = new Uint8ClampedArray(localSize * 4);
  const artOut = new Uint8ClampedArray(localSize * 4);

  let wbMinX = localWidth, wbMaxX = 0, wbMinY = localHeight, wbMaxY = 0;
  let artMinX = localWidth, artMaxX = 0, artMinY = localHeight, artMaxY = 0;

  for (let ly = 0; ly < localHeight; ly++) {
    const sy = pMinY + ly;
    const isY = sy >= 0 && sy < sourceHeight;
    const srcRow = isY ? sy * sourceWidth : 0;
    const locRow = ly * localWidth;

    for (let lx = 0; lx < localWidth; lx++) {
      const sx = pMinX + lx;
      const isInside = isY && sx >= 0 && sx < sourceWidth;
      const srcIdx = isInside ? srcRow + sx : 0;
      const locIdx = locRow + lx;
      const outIdx = locIdx * 4;

      const isArtwork = isInside && mask[srcIdx] > 0;
      const dist = distField[locIdx];

      let backingAlpha = 0;
      if (borderThickness > 0) {
        if (dist <= borderThickness - 0.5) {
          backingAlpha = 255;
        } else if (dist < borderThickness + 0.5) {
          const frac = (borderThickness + 0.5) - dist;
          backingAlpha = Math.round(Math.max(0, Math.min(255, frac * 255)));
        }
      }

      if (isArtwork) {
        const sOff = srcIdx * 4;
        const r = sourceRgba[sOff];
        const g = sourceRgba[sOff + 1];
        const b = sourceRgba[sOff + 2];

        // White-backed: artwork is opaque, so canonical RGB is preserved bit-for-bit
        wbOut[outIdx] = r;
        wbOut[outIdx + 1] = g;
        wbOut[outIdx + 2] = b;
        wbOut[outIdx + 3] = 255;

        artOut[outIdx] = r;
        artOut[outIdx + 1] = g;
        artOut[outIdx + 2] = b;
        artOut[outIdx + 3] = 255;

        if (lx < wbMinX) wbMinX = lx;
        if (lx > wbMaxX) wbMaxX = lx;
        if (ly < wbMinY) wbMinY = ly;
        if (ly > wbMaxY) wbMaxY = ly;

        if (lx < artMinX) artMinX = lx;
        if (lx > artMaxX) artMaxX = lx;
        if (ly < artMinY) artMinY = ly;
        if (ly > artMaxY) artMaxY = ly;
      } else if (backingAlpha > 0) {
        // Pure white die-cut border
        wbOut[outIdx] = 255;
        wbOut[outIdx + 1] = 255;
        wbOut[outIdx + 2] = 255;
        wbOut[outIdx + 3] = backingAlpha;

        if (lx < wbMinX) wbMinX = lx;
        if (lx > wbMaxX) wbMaxX = lx;
        if (ly < wbMinY) wbMinY = ly;
        if (ly > wbMaxY) wbMaxY = ly;
      }
    }
  }

  // Crop white-backed with 4px safety padding
  const pad = 4;
  const cWbX = Math.max(0, wbMinX - pad);
  const cWbY = Math.max(0, wbMinY - pad);
  const cWbW = Math.min(localWidth, wbMaxX + 1 + pad) - cWbX;
  const cWbH = Math.min(localHeight, wbMaxY + 1 + pad) - cWbY;
  const wbCropped = new Uint8ClampedArray(cWbW * cWbH * 4);

  for (let y = 0; y < cWbH; y++) {
    const srcOff = ((cWbY + y) * localWidth + cWbX) * 4;
    const dstOff = (y * cWbW) * 4;
    wbCropped.set(wbOut.subarray(srcOff, srcOff + cWbW * 4), dstOff);
  }

  // Crop artwork-only with 4px safety padding
  const cArtX = Math.max(0, artMinX - pad);
  const cArtY = Math.max(0, artMinY - pad);
  const cArtW = Math.min(localWidth, artMaxX + 1 + pad) - cArtX;
  const cArtH = Math.min(localHeight, artMaxY + 1 + pad) - cArtY;
  const artCropped = new Uint8ClampedArray(cArtW * cArtH * 4);

  for (let y = 0; y < cArtH; y++) {
    const srcOff = ((cArtY + y) * localWidth + cArtX) * 4;
    const dstOff = (y * cArtW) * 4;
    artCropped.set(artOut.subarray(srcOff, srcOff + cArtW * 4), dstOff);
  }

  return {
    artworkOnlyRgba: artCropped,
    artworkOnlyWidth: cArtW,
    artworkOnlyHeight: cArtH,
    whiteBackedRgba: wbCropped,
    whiteBackedWidth: cWbW,
    whiteBackedHeight: cWbH,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    }
  };
}

/**
 * Interpolates points between stroke events and stamps circular radial profiles into mask.
 * Returns a compact MaskPatch for exact undo/redo.
 */
export function applyBrushStroke(
  mask,
  width,
  height,
  points,
  options = { radius: 20, hardness: 1.0, opacity: 1.0, mode: 'erase' }
) {
  if (!points || points.length === 0) return null;

  const radius = Math.max(1, Math.round(options.radius || 20));
  const hardness = Math.max(0, Math.min(1, options.hardness !== undefined ? options.hardness : 1.0));
  const opacity = Math.max(0, Math.min(1, options.opacity !== undefined ? options.opacity : 1.0));
  const mode = options.mode || 'erase'; // 'restore' or 'erase'

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const pad = radius + 2;
  const boundX = Math.max(0, Math.floor(minX - pad));
  const boundY = Math.max(0, Math.floor(minY - pad));
  const boundMaxX = Math.min(width - 1, Math.ceil(maxX + pad));
  const boundMaxY = Math.min(height - 1, Math.ceil(maxY + pad));
  const boundW = boundMaxX - boundX + 1;
  const boundH = boundMaxY - boundY + 1;

  if (boundW <= 0 || boundH <= 0) return null;

  // Snapshot before-mask state for bounded region
  const beforeAlpha = new Uint8Array(boundW * boundH);
  for (let y = 0; y < boundH; y++) {
    const srcRow = (boundY + y) * width + boundX;
    const dstRow = y * boundW;
    beforeAlpha.set(mask.subarray(srcRow, srcRow + boundW), dstRow);
  }

  // Interpolate stamp center points
  const stepSize = Math.max(1, radius * 0.25);
  const stampPoints = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    if (i === 0) {
      stampPoints.push({ x: p1.x, y: p1.y });
    } else {
      const p0 = points[i - 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.ceil(dist / stepSize);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        stampPoints.push({ x: p0.x + dx * t, y: p0.y + dy * t });
      }
    }
  }

  const radiusSq = radius * radius;
  const innerRadius = radius * hardness;
  const innerRadiusSq = innerRadius * innerRadius;
  const fadeDistance = radius - innerRadius;

  let actualMinX = width, actualMinY = height, actualMaxX = -1, actualMaxY = -1;

  for (const pt of stampPoints) {
    const px = Math.round(pt.x);
    const py = Math.round(pt.y);

    const sMinY = Math.max(boundY, py - radius);
    const sMaxY = Math.min(boundMaxY, py + radius);
    const sMinX = Math.max(boundX, px - radius);
    const sMaxX = Math.min(boundMaxX, px + radius);

    for (let sy = sMinY; sy <= sMaxY; sy++) {
      const dy = sy - pt.y;
      const dySq = dy * dy;
      const rowOffset = sy * width;

      for (let sx = sMinX; sx <= sMaxX; sx++) {
        const dx = sx - pt.x;
        const distSq = dx * dx + dySq;

        if (distSq <= radiusSq) {
          let factor = 1.0;
          if (hardness < 1.0 && distSq > innerRadiusSq) {
            const d = Math.sqrt(distSq);
            const t = Math.max(0, Math.min(1, (radius - d) / (fadeDistance || 1)));
            factor = t * t * (3 - 2 * t);
          }

          const weight = factor * opacity;
          const maskIdx = rowOffset + sx;
          const currentA = mask[maskIdx];

          let newA = currentA;
          if (mode === 'restore') {
            newA = Math.min(255, Math.round(currentA + (255 - currentA) * weight));
          } else {
            newA = Math.max(0, Math.round(currentA * (1 - weight)));
          }

          if (newA !== currentA) {
            mask[maskIdx] = newA;
            if (sx < actualMinX) actualMinX = sx;
            if (sx > actualMaxX) actualMaxX = sx;
            if (sy < actualMinY) actualMinY = sy;
            if (sy > actualMaxY) actualMaxY = sy;
          }
        }
      }
    }
  }

  if (actualMaxX < actualMinX || actualMaxY < actualMinY) {
    return null; // No pixels altered
  }

  const tightW = actualMaxX - actualMinX + 1;
  const tightH = actualMaxY - actualMinY + 1;
  const tightBefore = new Uint8Array(tightW * tightH);
  const tightAfter = new Uint8Array(tightW * tightH);

  for (let y = 0; y < tightH; y++) {
    const origLocalX = actualMinX - boundX;
    const origLocalY = actualMinY - boundY + y;
    const bSrcRow = origLocalY * boundW + origLocalX;
    const dstRow = y * tightW;
    tightBefore.set(beforeAlpha.subarray(bSrcRow, bSrcRow + tightW), dstRow);

    const mSrcRow = (actualMinY + y) * width + actualMinX;
    tightAfter.set(mask.subarray(mSrcRow, mSrcRow + tightW), dstRow);
  }

  return {
    id: 'patch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: Date.now(),
    bounds: {
      x: actualMinX,
      y: actualMinY,
      width: tightW,
      height: tightH
    },
    beforeAlpha: tightBefore,
    afterAlpha: tightAfter
  };
}

export function revertMaskPatch(mask, width, patch) {
  if (!patch || !patch.bounds) return;
  const { x, y, width: pW, height: pH } = patch.bounds;
  for (let r = 0; r < pH; r++) {
    const srcRow = r * pW;
    const dstRow = (y + r) * width + x;
    mask.set(patch.beforeAlpha.subarray(srcRow, srcRow + pW), dstRow);
  }
}

export function applyMaskPatch(mask, width, patch) {
  if (!patch || !patch.bounds) return;
  const { x, y, width: pW, height: pH } = patch.bounds;
  for (let r = 0; r < pH; r++) {
    const srcRow = r * pW;
    const dstRow = (y + r) * width + x;
    mask.set(patch.afterAlpha.subarray(srcRow, srcRow + pW), dstRow);
  }
}
