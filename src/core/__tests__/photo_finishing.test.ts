import { describe, it, expect } from 'vitest';
import {
  trimMaskEdges,
  applyBottomTreatment,
  maskTouchesBottom,
  cleanStrayFragments,
  applyPhotoFinishing,
  PhotoFinishingOptions,
  composePhotoCutout
} from '../photoAdapter';

describe('Photo Finishing — Alpha Edge Trimming, Bottom Treatment & Fragment Cleanup', () => {
  const W = 100;
  const H = 100;

  // 1. Edge Trimming (Defringing) Tests
  describe('Alpha Edge Trimming (trimMaskEdges)', () => {
    it('returns original mask if trimPixels is 0 or negative', () => {
      const mask = new Uint8Array(W * H);
      mask[50 * W + 50] = 1;
      const res0 = trimMaskEdges(mask, W, H, 0);
      expect(res0).toBe(mask);
      const resNeg = trimMaskEdges(mask, W, H, -2);
      expect(resNeg).toBe(mask);
    });

    it('erodes the boundary perimeter of a square foreground mask by exact pixel depth', () => {
      const mask = new Uint8Array(W * H);
      // Create a 20x20 square from x=40..59, y=40..59
      for (let y = 40; y < 60; y++) {
        for (let x = 40; x < 60; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Initial area = 20 * 20 = 400
      let initialCount = 0;
      for (let i = 0; i < W * H; i++) if (mask[i] === 1) initialCount++;
      expect(initialCount).toBe(400);

      // Trim 1 pixel
      const trimmed1 = trimMaskEdges(mask, W, H, 1);
      // A 20x20 square trimmed by 1px from each of 4 sides should be 18x18 = 324
      let count1 = 0;
      for (let i = 0; i < W * H; i++) if (trimmed1[i] === 1) count1++;
      expect(count1).toBe(18 * 18);

      // Verify outermost pixel at (40, 40) is removed, but inner pixel at (41, 41) is kept
      expect(trimmed1[40 * W + 40]).toBe(0);
      expect(trimmed1[40 * W + 50]).toBe(0); // top border removed
      expect(trimmed1[41 * W + 50]).toBe(1); // inner pixel kept

      // Trim 2 pixels -> should be 16x16 = 256
      const trimmed2 = trimMaskEdges(mask, W, H, 2);
      let count2 = 0;
      for (let i = 0; i < W * H; i++) if (trimmed2[i] === 1) count2++;
      expect(count2).toBe(16 * 16);
      expect(trimmed2[41 * W + 50]).toBe(0); // 2nd row removed
      expect(trimmed2[42 * W + 50]).toBe(1); // 3rd row kept
    });

    it('preserves camera RGB values bit-for-bit when composing trimmed cutouts', () => {
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      // Give distinct colors
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = (y * W + x) * 4;
          sourceRgba[idx] = 120;     // R
          sourceRgba[idx + 1] = 200; // G
          sourceRgba[idx + 2] = 250; // B
          sourceRgba[idx + 3] = 255; // A
        }
      }

      const mask = new Uint8Array(W * H);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      const trimmedMask = trimMaskEdges(mask, W, H, 2);
      const composed = composePhotoCutout(trimmedMask, sourceRgba, W, H, 10);

      // Check that opaque artwork pixels match sourceRgba exactly
      let checkedPixels = 0;
      for (let y = 0; y < composed.artworkOnlyHeight; y++) {
        for (let x = 0; x < composed.artworkOnlyWidth; x++) {
          const artIdx = (y * composed.artworkOnlyWidth + x) * 4;
          if (composed.artworkOnlyRgba[artIdx + 3] === 255) {
            expect(composed.artworkOnlyRgba[artIdx]).toBe(120);
            expect(composed.artworkOnlyRgba[artIdx + 1]).toBe(200);
            expect(composed.artworkOnlyRgba[artIdx + 2]).toBe(250);
            checkedPixels++;
          }
        }
      }
      expect(checkedPixels).toBeGreaterThan(500);
    });
  });

  // 2. Bottom-Edge Treatment Tests
  describe('Bottom-Edge Treatment (applyBottomTreatment)', () => {
    it('correctly detects if mask touches the bottom edge', () => {
      const maskNotTouching = new Uint8Array(W * H);
      // Subject ends at y = 80
      for (let y = 20; y <= 80; y++) {
        for (let x = 30; x <= 70; x++) {
          maskNotTouching[y * W + x] = 1;
        }
      }
      expect(maskTouchesBottom(maskNotTouching, W, H)).toBe(false);

      const maskTouching = new Uint8Array(W * H);
      // Subject ends at y = 99 (H - 1)
      for (let y = 20; y < H; y++) {
        for (let x = 30; x <= 70; x++) {
          maskTouching[y * W + x] = 1;
        }
      }
      expect(maskTouchesBottom(maskTouching, W, H)).toBe(true);
    });

    it('flat mode leaves mask unchanged', () => {
      const mask = new Uint8Array(W * H);
      for (let y = 50; y < H; y++) {
        for (let x = 30; x <= 70; x++) {
          mask[y * W + x] = 1;
        }
      }
      const out = applyBottomTreatment(mask, W, H, { bottomFinish: 'flat' });
      expect(out).toBe(mask);
    });

    it('rounded mode rounds bottom-left and bottom-right corners without touching center', () => {
      const mask = new Uint8Array(W * H);
      // Subject from x = 20 to x = 80, extending to y = 99
      for (let y = 50; y < H; y++) {
        for (let x = 20; x <= 80; x++) {
          mask[y * W + x] = 1;
        }
      }

      const radius = 10;
      const rounded = applyBottomTreatment(mask, W, H, {
        bottomFinish: 'rounded',
        bottomCurveRadius: radius
      });

      // Center bottom pixel at x = 50, y = 99 MUST be preserved (never cropped)
      expect(rounded[99 * W + 50]).toBe(1);

      // Extreme bottom-left corner at x = 20, y = 99 MUST be clipped to 0
      expect(rounded[99 * W + 20]).toBe(0);

      // Extreme bottom-right corner at x = 80, y = 99 MUST be clipped to 0
      expect(rounded[99 * W + 80]).toBe(0);

      // Just inside the radius corner: at center of corner arc (x = 20 + radius, y = 99 - radius) it is kept
      expect(rounded[(99 - radius) * W + (20 + radius)]).toBe(1);
    });

    it('curved mode forms a smooth upward arch at sides while preserving center bottom', () => {
      const mask = new Uint8Array(W * H);
      for (let y = 50; y < H; y++) {
        for (let x = 20; x <= 80; x++) {
          mask[y * W + x] = 1;
        }
      }

      const archHeight = 15;
      const curved = applyBottomTreatment(mask, W, H, {
        bottomFinish: 'curved',
        bottomCurveRadius: archHeight
      });

      // Center bottom pixel at x = 50, y = 99 is preserved
      expect(curved[99 * W + 50]).toBe(1);

      // Sides near x = 20 and x = 80 are arched upward, so bottom rows are 0
      expect(curved[99 * W + 20]).toBe(0);
      expect(curved[99 * W + 80]).toBe(0);
      expect(curved[95 * W + 20]).toBe(0); // Arched up beyond 95

      // But higher up at y = 80, pixels are intact
      expect(curved[80 * W + 20]).toBe(1);
      expect(curved[80 * W + 50]).toBe(1);
      expect(curved[80 * W + 80]).toBe(1);
    });
  });

  // 3. Stray Fragment Cleanup Tests
  describe('Stray Fragment Cleanup (cleanStrayFragments)', () => {
    it('removes small isolated islands under minArea while preserving main subject', () => {
      const mask = new Uint8Array(W * H);

      // Main subject: 40x40 square = 1600 pixels
      for (let y = 20; y < 60; y++) {
        for (let x = 20; x < 60; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Small unwanted fragment 1: 3x3 at (5, 5) = 9 pixels
      for (let y = 5; y < 8; y++) {
        for (let x = 5; x < 8; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Small unwanted fragment 2: 4x4 at (85, 85) = 16 pixels
      for (let y = 85; y < 89; y++) {
        for (let x = 85; x < 89; x++) {
          mask[y * W + x] = 1;
        }
      }

      const { cleanedMask, removedCount } = cleanStrayFragments(mask, W, H, 50);

      expect(removedCount).toBe(2);

      // Main subject intact
      expect(cleanedMask[40 * W + 40]).toBe(1);
      expect(cleanedMask[20 * W + 20]).toBe(1);
      expect(cleanedMask[59 * W + 59]).toBe(1);

      // Stray fragments removed
      expect(cleanedMask[5 * W + 5]).toBe(0);
      expect(cleanedMask[85 * W + 85]).toBe(0);
    });

    it('protects legitimate tiny selected figures from removal when inside a candidate box', () => {
      const mask = new Uint8Array(W * H);

      // Main subject: 40x40 square = 1600 pixels
      for (let y = 20; y < 60; y++) {
        for (let x = 20; x < 60; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Small legitimate distant person: 4x4 at (85, 85) = 16 pixels
      for (let y = 85; y < 89; y++) {
        for (let x = 85; x < 89; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Stray noise island: 3x3 at (5, 5) = 9 pixels (NOT in any candidate box)
      for (let y = 5; y < 8; y++) {
        for (let x = 5; x < 8; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Candidate box protecting the distant person
      const protectedBoxes = [{ x: 80, y: 80, width: 15, height: 15 }];

      const { cleanedMask, removedCount } = cleanStrayFragments(mask, W, H, 50, protectedBoxes);

      // Only the stray noise at (5, 5) should be removed
      expect(removedCount).toBe(1);
      expect(cleanedMask[5 * W + 5]).toBe(0);

      // The legitimate tiny figure at (85, 85) MUST be protected and preserved!
      expect(cleanedMask[85 * W + 85]).toBe(1);
      expect(cleanedMask[88 * W + 88]).toBe(1);
    });
  });

  // 4. Combined applyPhotoFinishing
  describe('Combined applyPhotoFinishing pipeline', () => {
    it('applies edge trimming and bottom rounded treatment together cleanly', () => {
      const mask = new Uint8Array(W * H);
      for (let y = 20; y < H; y++) {
        for (let x = 20; x <= 80; x++) {
          mask[y * W + x] = 1;
        }
      }

      const finished = applyPhotoFinishing(mask, W, H, {
        edgeTrim: 1,
        bottomFinish: 'rounded',
        bottomCurveRadius: 10
      });

      // Top edge at y=20 should be trimmed (y=20 was perimeter)
      expect(finished[20 * W + 50]).toBe(0);
      expect(finished[21 * W + 50]).toBe(1);

      // Bottom-left corner should be rounded
      expect(finished[99 * W + 20]).toBe(0);

      // Center bottom should be preserved
      expect(finished[99 * W + 50]).toBe(1);
    });
  });

  // 5. Smooth Outline Die-Cut Tests
  describe('Smooth Outline Die-Cut Silhouette (smoothOutline)', () => {
    it('produces identical output when smoothOutline is 0 (backwards compatibility)', () => {
      const mask = new Uint8Array(W * H);
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
          const idx = (y * W + x) * 4;
          sourceRgba[idx] = 200;
          sourceRgba[idx + 1] = 50;
          sourceRgba[idx + 2] = 100;
          sourceRgba[idx + 3] = 255;
        }
      }

      const resDefault = composePhotoCutout(mask, sourceRgba, W, H, 10, 20);
      const resExplicit0 = composePhotoCutout(mask, sourceRgba, W, H, 10, 20, 0);

      expect(resExplicit0.whiteBackedWidth).toBe(resDefault.whiteBackedWidth);
      expect(resExplicit0.whiteBackedHeight).toBe(resDefault.whiteBackedHeight);
      expect(Buffer.from(resExplicit0.whiteBackedRgba.buffer)).toEqual(
        Buffer.from(resDefault.whiteBackedRgba.buffer)
      );
    });

    it('preserves camera RGB values bit-for-bit when smoothing is active', () => {
      const mask = new Uint8Array(W * H);
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
          const idx = (y * W + x) * 4;
          sourceRgba[idx] = 42;
          sourceRgba[idx + 1] = 173;
          sourceRgba[idx + 2] = 220;
          sourceRgba[idx + 3] = 255;
        }
      }

      const resSmoothed = composePhotoCutout(mask, sourceRgba, W, H, 10, 20, 3);

      // Verify artwork pixels are bit-for-bit identical to source
      for (let y = 0; y < resSmoothed.artworkOnlyHeight; y++) {
        for (let x = 0; x < resSmoothed.artworkOnlyWidth; x++) {
          const idx = (y * resSmoothed.artworkOnlyWidth + x) * 4;
          if (resSmoothed.artworkOnlyRgba[idx + 3] === 255) {
            expect(resSmoothed.artworkOnlyRgba[idx]).toBe(42);
            expect(resSmoothed.artworkOnlyRgba[idx + 1]).toBe(173);
            expect(resSmoothed.artworkOnlyRgba[idx + 2]).toBe(220);
          }
        }
      }
    });

    it('smooths high-frequency jagged stair-steps and protrusions on outer border', () => {
      const mask = new Uint8Array(W * H);
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      // Flat rectangular subject from x=30..60, y=30..70 with an isolated 2-pixel jagged spike at y=50, x=63
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x <= 60; x++) {
          mask[y * W + x] = 1;
        }
      }
      // Add jagged 3px spike at y=50, x=61..63
      mask[50 * W + 61] = 1;
      mask[50 * W + 62] = 1;
      mask[50 * W + 63] = 1;

      const res0 = composePhotoCutout(mask, sourceRgba, W, H, 10, 20, 0);
      const res3 = composePhotoCutout(mask, sourceRgba, W, H, 10, 20, 3);

      // Find the rightmost border pixel at y=50 for both
      const getRightmostAtY = (rgba: Uint8ClampedArray, w: number, h: number, targetY: number) => {
        let maxX = -1;
        for (let x = 0; x < w; x++) {
          if (rgba[(targetY * w + x) * 4 + 3] > 128) {
            if (x > maxX) maxX = x;
          }
        }
        return maxX;
      };

      // Res0 will have a prominent circular protrusion around the spike
      // Res3 will smooth the spike into the silhouette, reducing the protrusion
      const cropY50_0 = getRightmostAtY(res0.whiteBackedRgba, res0.whiteBackedWidth, res0.whiteBackedHeight, Math.floor(res0.whiteBackedHeight / 2));
      const cropY50_3 = getRightmostAtY(res3.whiteBackedRgba, res3.whiteBackedWidth, res3.whiteBackedHeight, Math.floor(res3.whiteBackedHeight / 2));

      expect(cropY50_3).toBeLessThan(cropY50_0);
    });

    it('enforces safety enclosure invariant: all artwork pixels have full white backing underneath', () => {
      const mask = new Uint8Array(W * H);
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      // Sharp single-pixel corner at (50, 20)
      for (let y = 20; y < 80; y++) {
        const halfWidth = Math.floor((y - 20) / 2);
        for (let x = 50 - halfWidth; x <= 50 + halfWidth; x++) {
          mask[y * W + x] = 1;
          const idx = (y * W + x) * 4;
          sourceRgba[idx] = 100;
          sourceRgba[idx + 1] = 150;
          sourceRgba[idx + 2] = 200;
          sourceRgba[idx + 3] = 255;
        }
      }

      // Strong smoothing on a sharp cone
      const res = composePhotoCutout(mask, sourceRgba, W, H, 5, 20, 5);

      // For every pixel in whiteBackedRgba that corresponds to artwork, alpha must be 255
      expect(res.whiteBackedRgba.length).toBeGreaterThan(0);
      let checked = 0;
      for (let i = 0; i < W * H; i++) {
        if (mask[i] === 1) {
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(100);
    });
  });
});
