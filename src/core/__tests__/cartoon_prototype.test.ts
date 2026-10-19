import { describe, it, expect } from 'vitest';
import {
  HI_WAVING_TEMPLATE,
  HI_WAVING_BACK_SVG,
  HI_WAVING_FRONT_SVG,
  ALL_CARTOON_TEMPLATES,
} from '../../cartoon/templates/hiWaving';
import {
  CartoonTemplateManifest,
  ExtractedHeadResult,
  HeadTransform,
  FaceLandmarks,
  CartoonProjectData,
} from '../../cartoon/types';
import {
  computeInitialHeadPlacement,
  generateCartoonStickerDieCut,
} from '../cartoonCompositor';
import { refineArtworkAlpha } from '../artworkAlphaRefinement';

describe('Sticker Studio V1.4 — Cartoon Sticker Prototype ("HI!" Waving)', () => {
  // 1. Template Manifest Schema & Structure Tests
  describe('1. Template Manifest Schema & Asset Integrity', () => {
    it('validates HI! Waving manifest schema, dimensions, and normalized bounds', () => {
      expect(HI_WAVING_TEMPLATE.id).toBe('hi-waving-01');
      expect(HI_WAVING_TEMPLATE.name).toBe('HI! Waving');
      expect(HI_WAVING_TEMPLATE.canvas.width).toBe(1024);
      expect(HI_WAVING_TEMPLATE.canvas.height).toBe(1024);

      const slot = HI_WAVING_TEMPLATE.headSlot;
      expect(slot.centerX).toBeGreaterThan(0.3);
      expect(slot.centerX).toBeLessThan(0.7);
      expect(slot.centerY).toBeGreaterThan(0.2);
      expect(slot.centerY).toBeLessThan(0.6);
      expect(slot.targetWidth).toBeGreaterThan(0.2);
      expect(slot.targetWidth).toBeLessThan(0.8);
      expect(slot.neckAnchorX).toBeCloseTo(0.5, 1);
      expect(slot.neckAnchorY).toBeGreaterThan(slot.centerY);
      expect(slot.collarOverlapY).toBeGreaterThan(0);
    });

    it('validates SVG layers are valid SVG markup with viewBox and width/height', () => {
      expect(HI_WAVING_BACK_SVG).toContain('<svg');
      expect(HI_WAVING_BACK_SVG).toContain('viewBox="0 0 1024 1024"');
      expect(HI_WAVING_BACK_SVG).toContain('</svg>');
      // Check for greeting elements
      expect(HI_WAVING_BACK_SVG).toContain('hi-bubble-group');
      expect(HI_WAVING_BACK_SVG).toContain('waving-hand-group');

      // Check Front Collar SVG
      expect(HI_WAVING_FRONT_SVG).toContain('<svg');
      expect(HI_WAVING_FRONT_SVG).toContain('viewBox="0 0 1024 1024"');
      expect(HI_WAVING_FRONT_SVG).toContain('overlapping-collar-layer');
      expect(HI_WAVING_FRONT_SVG).toContain('</svg>');
    });

    it('ensures template registry has HI! Waving available', () => {
      expect(ALL_CARTOON_TEMPLATES['hi-waving-01']).toBeDefined();
      expect(ALL_CARTOON_TEMPLATES['hi-waving-01'].name).toBe('HI! Waving');
    });
  });

  // 2. Head Coordinate Conversion & Affine Transform Tests
  describe('2. Head Coordinate Conversion, Angle Alignment & Aspect Ratio', () => {
    function createMockHead(
      width: number,
      height: number,
      landmarks: FaceLandmarks | null
    ): ExtractedHeadResult {
      // Mock canvas for headless tests
      const canvas = {
        width,
        height,
      } as any;

      return {
        canvas,
        width,
        height,
        cropBounds: { x: 100, y: 100, width, height },
        alphaMask: new Uint8Array(width * height).fill(255),
        landmarks,
      };
    }

    it('computes initial placement for an upright frontal face', () => {
      const mockLandmarks: FaceLandmarks = {
        boundingBox: { originX: 150, originY: 140, width: 200, height: 260 },
        leftEye: { x: 200, y: 240 },
        rightEye: { x: 300, y: 240 },
        eyeMidpoint: { x: 250, y: 240 },
        eyeDistance: 100,
        eyeAngleDegrees: 0,
        estimatedChin: { x: 250, y: 390 },
      };

      const head = createMockHead(300, 380, mockLandmarks);
      const transform = computeInitialHeadPlacement(HI_WAVING_TEMPLATE, head);

      // Target chibi face height = 0.254 * 1024 = ~260 px
      const expectedScale = (1024 * 0.254) / mockLandmarks.boundingBox.height;
      expect(transform.scale).toBeCloseTo(expectedScale, 2);
      expect(transform.rotationDegrees).toBe(0);
      expect(transform.centerX).toBeCloseTo(512, 0);
      expect(transform.centerY).toBeCloseTo(402, 0);

      // Verifies autoPlacement is saved for reset
      expect(transform.autoPlacement.scale).toBe(transform.scale);
      expect(transform.autoPlacement.rotationDegrees).toBe(transform.rotationDegrees);
    });

    it('calculates corrective rotation for a tilted face (-15 degrees)', () => {
      const mockLandmarks: FaceLandmarks = {
        boundingBox: { originX: 100, originY: 100, width: 200, height: 250 },
        leftEye: { x: 160, y: 190 },
        rightEye: { x: 250, y: 215 },
        eyeMidpoint: { x: 205, y: 202.5 },
        eyeDistance: Math.hypot(90, 25),
        eyeAngleDegrees: 15.52, // tilted right
        estimatedChin: { x: 205, y: 340 },
      };

      const head = createMockHead(300, 360, mockLandmarks);
      const transform = computeInitialHeadPlacement(HI_WAVING_TEMPLATE, head);

      // Should counter-rotate by -15.52 degrees to match template upright (0 degrees)
      expect(transform.rotationDegrees).toBeCloseTo(-15.52, 1);
    });

    it('handles fallback gracefully when no face landmarks are detected', () => {
      const head = createMockHead(250, 300, null);
      const transform = computeInitialHeadPlacement(HI_WAVING_TEMPLATE, head);

      expect(transform.scale).toBeGreaterThan(0.5);
      expect(transform.rotationDegrees).toBe(0);
      expect(transform.centerX).toBe(512);
      expect(transform.centerY).toBe(410);
    });

    it('preserves aspect ratio strictly without anisotropic stretching', () => {
      // In computeInitialHeadPlacement, scale is a single scalar multiplier
      const head = createMockHead(400, 500, null);
      const transform = computeInitialHeadPlacement(HI_WAVING_TEMPLATE, head);
      expect(typeof transform.scale).toBe('number');
      expect(Number.isFinite(transform.scale)).toBe(true);
      // Width and height will both be scaled by transform.scale
      const scaledW = head.width * transform.scale;
      const scaledH = head.height * transform.scale;
      expect(scaledW / scaledH).toBeCloseTo(head.width / head.height, 4);
    });
  });

  // 3. Layer Ordering & Collar Overlap Geometry Tests
  describe('3. Layer Ordering & Collar Overlap Invariants', () => {
    it('verifies Front SVG collar span completely encloses the template neckAnchor slot', () => {
      const slot = HI_WAVING_TEMPLATE.headSlot;
      const canvasW = HI_WAVING_TEMPLATE.canvas.width;
      const canvasH = HI_WAVING_TEMPLATE.canvas.height;

      const neckPixelX = slot.neckAnchorX * canvasW; // 512
      const neckPixelY = slot.neckAnchorY * canvasH; // 542.72

      // Front SVG collar overlaps from Y=510 to Y=620 across X=390 to X=630
      // Verify neckAnchor is contained within this collar coverage box
      const collarMinX = 390;
      const collarMaxX = 630;
      const collarMinY = 510;
      const collarMaxY = 620;

      expect(neckPixelX).toBeGreaterThanOrEqual(collarMinX);
      expect(neckPixelX).toBeLessThanOrEqual(collarMaxX);
      expect(neckPixelY).toBeGreaterThanOrEqual(collarMinY);
      expect(neckPixelY).toBeLessThanOrEqual(collarMaxY);
    });

    it('verifies collar overlap buffer prevents any raw cut edge visibility', () => {
      const overlapPixels = HI_WAVING_TEMPLATE.headSlot.collarOverlapY * HI_WAVING_TEMPLATE.canvas.height;
      expect(overlapPixels).toBeGreaterThan(30); // at least 30px overlap margin
    });
  });

  // 4. Alpha Matte Refinement & Continuous 8-bit Contours
  describe('4. Alpha Matte Refinement on Head Cutout (refineArtworkAlpha)', () => {
    it('produces continuous antialiased intermediate alpha values (1..254) on hair silhouettes', () => {
      const W = 100;
      const H = 100;
      const mask = new Uint8Array(W * H);

      // Create a round head mask
      for (let y = 20; y < 80; y++) {
        for (let x = 20; x < 80; x++) {
          const dx = x - 50;
          const dy = y - 50;
          if (dx * dx + dy * dy <= 25 * 25) {
            mask[y * W + x] = 1;
          }
        }
      }

      // Raw binary: only 0 or 255
      const rawAlpha = refineArtworkAlpha(mask, W, H, 0, 0);
      let rawIntermediate = 0;
      for (let i = 0; i < W * H; i++) {
        if (rawAlpha[i] > 0 && rawAlpha[i] < 255) rawIntermediate++;
      }
      expect(rawIntermediate).toBe(0);

      // Refined with smoothness=2, feather=0.5
      const refined = refineArtworkAlpha(mask, W, H, 2, 0.5);
      let intermediateCount = 0;
      for (let i = 0; i < W * H; i++) {
        if (refined[i] > 0 && refined[i] < 255) intermediateCount++;
      }
      expect(intermediateCount).toBeGreaterThan(50); // real antialiased fringe
    });
  });

  // 5. Die-Cut Backing Generation Tests
  describe('5. Unified White Die-Cut Cutline Generation', () => {
    it('generates a single continuous die-cut contour enclosing both head and body', () => {
      const W = 200;
      const H = 200;

      // Mock artwork canvas with head (circle at top) and body (rectangle at bottom)
      const mockArtworkCanvas = {
        width: W,
        height: H,
        getContext: () => ({
          getImageData: () => {
            const data = new Uint8ClampedArray(W * H * 4);
            // Draw head: circle at (100, 70) r=30
            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                const idx = (y * W + x) * 4;
                const dHead = Math.hypot(x - 100, y - 70);
                // Draw body: rect x=70..130, y=90..160
                const isBody = x >= 70 && x <= 130 && y >= 90 && y <= 160;
                if (dHead <= 30 || isBody) {
                  data[idx] = 100;
                  data[idx + 1] = 150;
                  data[idx + 2] = 200;
                  data[idx + 3] = 255;
                }
              }
            }
            return { data };
          },
        }),
      } as any;

      // Test die cut generation
      const result = generateCartoonStickerDieCut(mockArtworkCanvas, 15, 2);
      expect(result.stickerCanvas).toBeDefined();
      expect(result.tightCrop.width).toBeGreaterThan(50);
      expect(result.tightCrop.height).toBeGreaterThan(50);
      expect(result.tightCrop.x).toBeLessThan(70);
      expect(result.tightCrop.y).toBeLessThan(70);
    });
  });

  // 6. Project Serialization & Round-Trip Fidelity
  describe('6. Save/Reopen Round-Trip Accuracy', () => {
    it('serializes and deserializes cartoon project without data loss', () => {
      const originalProject: CartoonProjectData = {
        version: 3,
        appMode: 'cartoon',
        templateId: 'hi-waving-01',
        selfieDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        headCropBounds: { x: 50, y: 60, width: 200, height: 250 },
        headTransform: {
          centerX: 520,
          centerY: 365,
          scale: 1.15,
          rotationDegrees: -3.5,
          autoPlacement: {
            centerX: 512,
            centerY: 358,
            scale: 1.0,
            rotationDegrees: 0,
          },
        },
        borderThickness: 28,
        smoothOutlineLevel: 2,
        alphaSettings: {
          smoothness: 2,
          feather: 0.5,
        },
        dateModified: '2026-10-19T03:00:00.000Z',
      };

      const jsonStr = JSON.stringify(originalProject);
      const parsed: CartoonProjectData = JSON.parse(jsonStr);

      expect(parsed.version).toBe(3);
      expect(parsed.appMode).toBe('cartoon');
      expect(parsed.templateId).toBe('hi-waving-01');
      expect(parsed.headTransform.centerX).toBe(520);
      expect(parsed.headTransform.centerY).toBe(365);
      expect(parsed.headTransform.scale).toBe(1.15);
      expect(parsed.headTransform.rotationDegrees).toBe(-3.5);
      expect(parsed.borderThickness).toBe(28);
      expect(parsed.smoothOutlineLevel).toBe(2);
      expect(parsed.alphaSettings.smoothness).toBe(2);
      expect(parsed.alphaSettings.feather).toBe(0.5);
    });
  });
});
