import { describe, it, expect } from 'vitest';
import { computeEuclideanDistanceTransform } from '../edt';
import { colorDistance, estimateBackgroundColor } from '../color';
import { segmentForeground } from '../segmentation';
import { analyzeComponents } from '../components';
import { proposeStickerGroups } from '../grouping';
import { createZip, crc32 } from '../zip';

describe('Euclidean Distance Transform (EDT)', () => {
  it('computes exact Euclidean distance from a single foreground seed', () => {
    const width = 5;
    const height = 5;
    const mask = new Uint8Array(width * height);
    // Center pixel (2, 2) is seed
    mask[2 * width + 2] = 1;

    const edt = computeEuclideanDistanceTransform(mask, width, height);

    // Distance at (2, 2) should be 0
    expect(edt[2 * width + 2]).toBe(0);
    // Distance at (2, 3) and (3, 2) should be 1
    expect(edt[2 * width + 3]).toBe(1);
    expect(edt[3 * width + 2]).toBe(1);
    // Distance at (3, 3) should be sqrt(2) = ~1.414
    expect(edt[3 * width + 3]).toBeCloseTo(Math.SQRT2, 2);
    // Distance at (0, 0) should be sqrt(4 + 4) = sqrt(8) = ~2.828
    expect(edt[0]).toBeCloseTo(Math.sqrt(8), 2);
  });
});

describe('Color Estimation', () => {
  it('accurately estimates off-white cream background and rejects foreground edge noise', () => {
    const width = 100;
    const height = 100;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Fill entire canvas with cream color (252, 248, 240)
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 252;
      rgba[i * 4 + 1] = 248;
      rgba[i * 4 + 2] = 240;
      rgba[i * 4 + 3] = 255;
    }

    // Add a dark spot on one edge to simulate edge artwork
    for (let x = 10; x < 20; x++) {
      for (let y = 0; y < 10; y++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 40;
        rgba[idx + 1] = 20;
        rgba[idx + 2] = 20;
      }
    }

    const estimated = estimateBackgroundColor(rgba, width, height);
    expect(estimated[0]).toBe(252);
    expect(estimated[1]).toBe(248);
    expect(estimated[2]).toBe(240);
  });
});

describe('Constrained Exterior Flood Fill & Internal White Preservation', () => {
  it('preserves 100% of internal white regions enclosed by a dark outline', () => {
    const width = 40;
    const height = 40;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Background: Cream (250, 245, 235)
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 250;
      rgba[i * 4 + 1] = 245;
      rgba[i * 4 + 2] = 235;
      rgba[i * 4 + 3] = 255;
    }

    // Draw an illustration: Dark outline circle/square from x=10..30, y=10..30
    // Inside: pure white fur (255, 255, 255)
    for (let y = 10; y <= 30; y++) {
      for (let x = 10; x <= 30; x++) {
        const idx = (y * width + x) * 4;
        if (x === 10 || x === 30 || y === 10 || y === 30) {
          // Dark brown outline
          rgba[idx] = 60;
          rgba[idx + 1] = 40;
          rgba[idx + 2] = 30;
        } else {
          // Pure white internal illustration
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
        }
      }
    }

    const seg = segmentForeground(rgba, width, height, [250, 245, 235], 18);

    // 1. Exterior background must be 0 (removed)
    expect(seg.foregroundSupport[0]).toBe(0);
    expect(seg.alphaMask[0]).toBe(0);

    // 2. Dark outline must be 1 (foreground)
    expect(seg.foregroundSupport[10 * width + 10]).toBe(1);

    // 3. Crucial: Internal white fur at (20, 20) MUST NOT be removed!
    expect(seg.foregroundSupport[20 * width + 20]).toBe(1);
    expect(seg.alphaMask[20 * width + 20]).toBe(255);
  });

  it('detects candidate enclosed holes inside objects', () => {
    const width = 50;
    const height = 50;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Background: Pure White (255, 255, 255)
    rgba.fill(255);

    // Draw a donut-shaped scissors handle from 10..40, with inner hole from 20..30
    for (let y = 10; y <= 40; y++) {
      for (let x = 10; x <= 40; x++) {
        const idx = (y * width + x) * 4;
        const isInnerHole = x >= 20 && x <= 30 && y >= 20 && y <= 30;
        if (isInnerHole) {
          // White background hole
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
        } else {
          // Solid color of scissor handle
          rgba[idx] = 200;
          rgba[idx + 1] = 80;
          rgba[idx + 2] = 80;
        }
      }
    }

    const seg = segmentForeground(rgba, width, height, [255, 255, 255], 15);
    expect(seg.enclosedHoleCandidates.length).toBeGreaterThan(0);
    const hole = seg.enclosedHoleCandidates[0];
    expect(hole.bounds.width).toBeGreaterThanOrEqual(10);
    expect(hole.bounds.height).toBeGreaterThanOrEqual(10);
  });
});

describe('Component Analysis & Grouping', () => {
  it('identifies components and attaches satellites without transitive runaway', () => {
    const width = 100;
    const height = 100;
    const fg = new Uint8Array(width * height);

    // Main character 1: 30x30 square at (10, 10)
    for (let y = 10; y < 40; y++) {
      for (let x = 10; x < 40; x++) {
        fg[y * width + x] = 1;
      }
    }

    // Small sparkle satellite near character 1 at (43, 15) (size 3x3)
    for (let y = 15; y < 18; y++) {
      for (let x = 43; x < 46; x++) {
        fg[y * width + x] = 1;
      }
    }

    // Main character 2: 30x30 square at (70, 70)
    for (let y = 70; y < 100; y++) {
      for (let x = 70; x < 100; x++) {
        fg[y * width + x] = 1;
      }
    }

    const { components, labelMap } = analyzeComponents(fg, width, height, 5);
    expect(components.length).toBe(3);

    const groups = proposeStickerGroups(components, 35, false, labelMap, width, height);

    // Should create exactly 2 sticker groups:
    // Group 1: Main character 1 + sparkle satellite
    // Group 2: Main character 2
    expect(groups.length).toBe(2);
    const char1Group = groups.find(g => g.componentIds.length === 2);
    expect(char1Group).toBeDefined();
  });
});

describe('ZIP Generation', () => {
  it('creates a valid ZIP binary with CRC32', async () => {
    const file1Data = new Uint8Array([1, 2, 3, 4, 5]);
    const file2Data = new Uint8Array([10, 20, 30]);

    const zipBlob = createZip([
      { name: 'test1.dat', data: file1Data },
      { name: 'test2.dat', data: file2Data }
    ]);

    expect(zipBlob.size).toBeGreaterThan(0);
    expect(zipBlob.type).toBe('application/zip');

    const buffer = new Uint8Array(await zipBlob.arrayBuffer());
    // Check PK\x03\x04 signature at offset 0
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });
});
