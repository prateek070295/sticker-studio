import { describe, it, expect } from 'vitest';
import { composePhotoCutout } from '../photoAdapter';

describe('Photo Cutout Adapter', () => {
  it('correctly adapts an isolated mask to produce artwork-only and white-backed stickers', () => {
    const width = 100;
    const height = 100;
    const totalPixels = width * height;
    const mask = new Uint8Array(totalPixels);
    const sourceRgba = new Uint8ClampedArray(totalPixels * 4);

    // Create a circular blob of red pixels at center (50, 50) radius 20
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - 50;
        const dy = y - 50;
        const idx = y * width + x;
        if (dx * dx + dy * dy <= 400) {
          mask[idx] = 1;
          sourceRgba[idx * 4] = 255;     // R
          sourceRgba[idx * 4 + 1] = 0;   // G
          sourceRgba[idx * 4 + 2] = 0;   // B
          sourceRgba[idx * 4 + 3] = 255; // A
        }
      }
    }

    const res = composePhotoCutout(mask, sourceRgba, width, height, 5, 20);

    expect(res.bounds.width).toBe(41);
    expect(res.bounds.height).toBe(41);
    expect(res.whiteBackedWidth).toBeGreaterThan(41); // with 5px white backing
    expect(res.whiteBackedHeight).toBeGreaterThan(41);
    expect(res.whiteBackedRgba.length).toBe(res.whiteBackedWidth * res.whiteBackedHeight * 4);
    expect(res.artworkOnlyRgba.length).toBe(res.artworkOnlyWidth * res.artworkOnlyHeight * 4);

    // Check that center pixel is exact red in both
    const artCenterX = Math.floor(res.artworkOnlyWidth / 2);
    const artCenterY = Math.floor(res.artworkOnlyHeight / 2);
    const artCenterIdx = (artCenterY * res.artworkOnlyWidth + artCenterX) * 4;

    expect(res.artworkOnlyRgba[artCenterIdx]).toBe(255);
    expect(res.artworkOnlyRgba[artCenterIdx + 1]).toBe(0);
    expect(res.artworkOnlyRgba[artCenterIdx + 2]).toBe(0);
    expect(res.artworkOnlyRgba[artCenterIdx + 3]).toBe(255);

    const wbCenterX = Math.floor(res.whiteBackedWidth / 2);
    const wbCenterY = Math.floor(res.whiteBackedHeight / 2);
    const wbCenterIdx = (wbCenterY * res.whiteBackedWidth + wbCenterX) * 4;

    expect(res.whiteBackedRgba[wbCenterIdx]).toBe(255);
    expect(res.whiteBackedRgba[wbCenterIdx + 1]).toBe(0);
    expect(res.whiteBackedRgba[wbCenterIdx + 2]).toBe(0);
    expect(res.whiteBackedRgba[wbCenterIdx + 3]).toBe(255);
  });
});
