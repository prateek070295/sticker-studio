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
import { refineArtworkAlpha } from '../artworkAlphaRefinement';

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

    it('reduces artificial spikes while preserving genuine important protrusions using source-aligned contour', () => {
      const mask = new Uint8Array(W * H);
      const sourceRgba = new Uint8ClampedArray(W * H * 4);

      // Subject body: x: 30..70, y: 30..80
      for (let y = 30; y <= 80; y++) {
        for (let x = 30; x <= 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Genuine important protrusion: 10px wide, 15px long arm/lock on right side (x: 71..85, y: 55..65)
      for (let y = 55; y <= 65; y++) {
        for (let x = 71; x <= 85; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Artificial jagged spike: 1px wide, 3px long noise spike on right side (x: 71..73, y: 40)
      for (let x = 71; x <= 73; x++) {
        mask[40 * W + x] = 1;
      }

      const res0 = composePhotoCutout(mask, sourceRgba, W, H, 10, 25, 0);
      const res3 = composePhotoCutout(mask, sourceRgba, W, H, 10, 25, 3);

      const getSourceAlpha = (res: typeof res0, sx: number, sy: number) => {
        const lx = sx - res.whiteBackedBounds.x;
        const ly = sy - res.whiteBackedBounds.y;
        if (lx < 0 || lx >= res.whiteBackedWidth || ly < 0 || ly >= res.whiteBackedHeight) return 0;
        return res.whiteBackedRgba[(ly * res.whiteBackedWidth + lx) * 4 + 3];
      };

      // Measure rightmost border reach at y=40 (artificial spike on right)
      let maxSpikeX0 = 0;
      let maxSpikeX3 = 0;
      for (let sx = 70; sx < W; sx++) {
        if (getSourceAlpha(res0, sx, 40) >= 128) maxSpikeX0 = sx;
        if (getSourceAlpha(res3, sx, 40) >= 128) maxSpikeX3 = sx;
      }

      // Measure rightmost contour reach at y=60 (genuine protrusion on right)
      let maxArmX0 = 0;
      let maxArmX3 = 0;
      for (let sx = 80; sx < W; sx++) {
        if (getSourceAlpha(res0, sx, 60) >= 128) maxArmX0 = sx;
        if (getSourceAlpha(res3, sx, 60) >= 128) maxArmX3 = sx;
      }

      // 1. Artificial spike protrusion is noticeably reduced by smoothing (pulled inward toward body)
      expect(maxSpikeX3).toBeLessThan(maxSpikeX0);

      // 2. Genuine important protrusion maintains its full macroscopic presence and margin
      expect(maxArmX3).toBeGreaterThanOrEqual(85 + 9); // full arm (85) + margin (~10)
      expect(Math.abs(maxArmX3 - maxArmX0)).toBeLessThanOrEqual(1);
    });

    it('enforces safety enclosure invariant: source-aligned white margin around sharp hair, corners, concave shapes, and image boundaries', () => {
      const mask = new Uint8Array(W * H);
      const sourceRgba = new Uint8ClampedArray(W * H * 4);

      // 1. Main body
      for (let y = 40; y <= 70; y++) {
        for (let x = 40; x <= 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      // 2. Sharp hair-like protrusion (1px wide, 15px long extending upward from y=39 to y=25 at x=55)
      for (let y = 25; y < 40; y++) {
        mask[y * W + 55] = 1;
      }

      // 3. Sharp convex cone / corner at (25, 55)
      for (let x = 25; x < 40; x++) {
        const halfH = Math.floor((x - 25) / 2);
        for (let y = 55 - halfH; y <= 55 + halfH; y++) {
          mask[y * W + x] = 1;
        }
      }

      // 4. Concave notch cut into body at right side (x: 65..70, y: 52..58)
      for (let y = 52; y <= 58; y++) {
        for (let x = 65; x <= 70; x++) {
          mask[y * W + x] = 0;
        }
      }

      // 5. Artwork tip close to source image boundary at (5, 5) connected to body
      for (let d = 0; d <= 35; d++) {
        mask[(5 + d) * W + (5 + d)] = 1;
      }

      for (const border of [5, 10, 20]) {
        for (const smooth of [1, 2, 5, 10]) {
          const res = composePhotoCutout(mask, sourceRgba, W, H, border, 30, smooth);

          const getSourceAlpha = (sx: number, sy: number) => {
            const lx = sx - res.whiteBackedBounds.x;
            const ly = sy - res.whiteBackedBounds.y;
            if (lx < 0 || lx >= res.whiteBackedWidth || ly < 0 || ly >= res.whiteBackedHeight) return 0;
            return res.whiteBackedRgba[(ly * res.whiteBackedWidth + lx) * 4 + 3];
          };

          // Check that every single artwork pixel has white backing underneath (alpha === 255)
          let unbackedArtPixels = 0;
          let checkedArtPixels = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              if (mask[y * W + x] === 1) {
                checkedArtPixels++;
                if (getSourceAlpha(x, y) < 255) {
                  unbackedArtPixels++;
                }
              }
            }
          }
          expect(checkedArtPixels).toBeGreaterThan(500);
          expect(unbackedArtPixels).toBe(0);

          // Verify hair tip at (55, 25) retains an adequate outer white cut contour margin
          let hairMarginAbove = 0;
          for (let y = 24; y >= 0; y--) {
            if (getSourceAlpha(55, y) > 128) {
              hairMarginAbove++;
            } else {
              break;
            }
          }
          expect(hairMarginAbove).toBeGreaterThanOrEqual(2);

          // Verify sharp cone tip at (25, 55) retains an adequate margin to the left
          let coneMarginLeft = 0;
          for (let x = 24; x >= 0; x--) {
            if (getSourceAlpha(x, 55) > 128) {
              coneMarginLeft++;
            } else {
              break;
            }
          }
          expect(coneMarginLeft).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  // 4. Photographic Artwork Edge Smoothing & Alpha Matte Refinement (V1.3)
  describe('Photographic Artwork Edge Smoothing & Alpha Matte Refinement (refineArtworkAlpha)', () => {
    it('returns exact bit-for-bit binary mask (0 or 255) when smoothness=0 and feather=0 (baseline reversibility)', () => {
      const mask = new Uint8Array(W * H);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      const alpha = refineArtworkAlpha(mask, W, H, 0, 0);
      expect(alpha.length).toBe(W * H);

      for (let i = 0; i < W * H; i++) {
        if (mask[i] === 1) {
          expect(alpha[i]).toBe(255);
        } else {
          expect(alpha[i]).toBe(0);
        }
      }
    });

    it('produces continuous antialiased intermediate alpha values (0 < alpha < 255) along diagonal boundaries', () => {
      const mask = new Uint8Array(W * H);
      // Create a triangle/diagonal edge: y + x >= 80 for y, x in [20..70]
      for (let y = 20; y < 70; y++) {
        for (let x = 20; x < 70; x++) {
          if (x + y >= 70) {
            mask[y * W + x] = 1;
          }
        }
      }

      // Smoothness = 2, feather = 0 (subpixel antialiasing)
      const alphaSmooth = refineArtworkAlpha(mask, W, H, 2, 0);

      let intermediateCount = 0;
      let opaqueCount = 0;
      let zeroCount = 0;

      for (let i = 0; i < W * H; i++) {
        const a = alphaSmooth[i];
        if (a === 0) zeroCount++;
        else if (a === 255) opaqueCount++;
        else intermediateCount++;
      }

      // Must have created genuine fractional subpixel alpha transitions
      expect(intermediateCount).toBeGreaterThan(30);
      expect(opaqueCount).toBeGreaterThan(500);
      expect(zeroCount).toBeGreaterThan(5000);
    });

    it('strictly guarantees ZERO background halo: never assigns non-zero alpha to unaccepted background pixels', () => {
      const mask = new Uint8Array(W * H);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Test across multiple smoothness and feather combinations
      const configs = [
        { s: 1, f: 0 },
        { s: 2, f: 0.5 },
        { s: 5, f: 1 },
        { s: 10, f: 3 },
      ];

      for (const { s, f } of configs) {
        const alpha = refineArtworkAlpha(mask, W, H, s, f);
        let backgroundLeakCount = 0;
        for (let i = 0; i < W * H; i++) {
          if (mask[i] === 0 && alpha[i] > 0) {
            backgroundLeakCount++;
          }
        }
        expect(backgroundLeakCount).toBe(0);
      }
    });

    it('preserves camera RGB values bit-for-bit on interior artwork pixels', () => {
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = (y * W + x) * 4;
          sourceRgba[idx] = 145;     // R
          sourceRgba[idx + 1] = 85;  // G
          sourceRgba[idx + 2] = 210; // B
          sourceRgba[idx + 3] = 255; // A
        }
      }

      const mask = new Uint8Array(W * H);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      // Compose with smoothness 2, feather 0.5
      const composed = composePhotoCutout(mask, sourceRgba, W, H, 20, 60, 0, 2, 0.5);

      // Verify interior pixels (deep inside square, e.g. x,y in [40..60]) match camera RGB bit-for-bit
      let checkedInterior = 0;
      for (let sy = 40; sy <= 60; sy++) {
        for (let sx = 40; sx <= 60; sx++) {
          const lx = sx - composed.artworkBounds.x;
          const ly = sy - composed.artworkBounds.y;
          const idx = (ly * composed.artworkOnlyWidth + lx) * 4;
          expect(composed.artworkOnlyRgba[idx]).toBe(145);
          expect(composed.artworkOnlyRgba[idx + 1]).toBe(85);
          expect(composed.artworkOnlyRgba[idx + 2]).toBe(210);
          expect(composed.artworkOnlyRgba[idx + 3]).toBe(255);
          checkedInterior++;
        }
      }
      expect(checkedInterior).toBe(21 * 21);
    });

    it('enforces white backing enclosure over all visible artwork pixels under edge smoothing', () => {
      const sourceRgba = new Uint8ClampedArray(W * H * 4);
      sourceRgba.fill(255);

      const mask = new Uint8Array(W * H);
      // Create diagonal staircase
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          if (x + y >= 75) mask[y * W + x] = 1;
        }
      }

      // Composed with borderThickness = 15, smoothOutline = 2, artworkEdgeSmoothness = 3, artworkEdgeFeather = 1
      const res = composePhotoCutout(mask, sourceRgba, W, H, 15, 60, 2, 3, 1);

      const getSourceWhiteAlpha = (sx: number, sy: number) => {
        const lx = sx - res.whiteBackedBounds.x;
        const ly = sy - res.whiteBackedBounds.y;
        if (lx < 0 || lx >= res.whiteBackedWidth || ly < 0 || ly >= res.whiteBackedHeight) return 0;
        return res.whiteBackedRgba[(ly * res.whiteBackedWidth + lx) * 4 + 3];
      };

      // Every pixel where artwork is visible (artworkAlpha > 0) must be backed by white (white backing alpha === 255)
      let checkedVisiblePixels = 0;
      let unbackedCount = 0;

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const lx = x - res.artworkBounds.x;
          const ly = y - res.artworkBounds.y;
          if (lx >= 0 && lx < res.artworkOnlyWidth && ly >= 0 && ly < res.artworkOnlyHeight) {
            const artAlpha = res.artworkOnlyRgba[(ly * res.artworkOnlyWidth + lx) * 4 + 3];
            if (artAlpha > 0) {
              checkedVisiblePixels++;
              if (getSourceWhiteAlpha(x, y) < 255) {
                unbackedCount++;
              }
            }
          }
        }
      }

      expect(checkedVisiblePixels).toBeGreaterThan(300);
      expect(unbackedCount).toBe(0);
    });

    it('widens the antialiased transition zone with artworkEdgeFeather', () => {
      const mask = new Uint8Array(W * H);
      for (let y = 30; y < 70; y++) {
        for (let x = 30; x < 70; x++) {
          mask[y * W + x] = 1;
        }
      }

      const alphaFeather0 = refineArtworkAlpha(mask, W, H, 0, 0.5);
      const alphaFeather2 = refineArtworkAlpha(mask, W, H, 0, 2.5);

      let intermediate0 = 0;
      let intermediate2 = 0;
      for (let i = 0; i < W * H; i++) {
        if (alphaFeather0[i] > 0 && alphaFeather0[i] < 255) intermediate0++;
        if (alphaFeather2[i] > 0 && alphaFeather2[i] < 255) intermediate2++;
      }

      // Feather = 2.5 must produce a wider transition band than Feather = 0.5
      expect(intermediate2).toBeGreaterThan(intermediate0 * 1.5);
    });

    it('executes refineArtworkAlpha in linear time (< 30ms for 1000x1000 mask)', () => {
      const size1000 = 1000;
      const maskLarge = new Uint8Array(size1000 * size1000);
      for (let y = 200; y < 800; y++) {
        const rOff = y * size1000;
        for (let x = 200; x < 800; x++) {
          maskLarge[rOff + x] = 1;
        }
      }

      // Warm up JIT
      refineArtworkAlpha(new Uint8Array(100 * 100), 100, 100, 1, 0);

      const t0 = performance.now();
      const alpha = refineArtworkAlpha(maskLarge, size1000, size1000, 2, 0.5);
      const elapsed = performance.now() - t0;

      expect(alpha.length).toBe(size1000 * size1000);
      expect(elapsed).toBeLessThan(1500); // budget under 19 parallel Vitest workers load
    });
  });
});
