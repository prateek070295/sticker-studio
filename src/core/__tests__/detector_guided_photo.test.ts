import { describe, it, expect } from 'vitest';
import { BoundingBox, PersonRegion, SerializedPersonRegion } from '../../types';
import { combinePersonRegions } from '../mediaPipeSegmenter';
import { saveProjectArchive, loadProjectArchive } from '../projectArchive';

describe('Detector-Guided Photo Segmentation & Persistence', () => {
  it('combines multiple non-overlapping and overlapping person regional masks into canonical union', () => {
    const W = 100;
    const H = 80;

    // Region 1: [10..30, 20..50]
    const cropMask1 = new Uint8Array(20 * 30);
    cropMask1.fill(1);
    const r1: PersonRegion = {
      id: 'p1',
      label: 'P1',
      box: { x: 12, y: 22, width: 16, height: 26 },
      score: 0.9,
      isManual: false,
      included: true,
      cropBounds: { x: 10, y: 20, width: 20, height: 30 },
      cropMask: cropMask1,
    };

    // Region 2: [50..70, 20..50]
    const cropMask2 = new Uint8Array(20 * 30);
    cropMask2.fill(1);
    const r2: PersonRegion = {
      id: 'p2',
      label: 'P2',
      box: { x: 52, y: 22, width: 16, height: 26 },
      score: 0.85,
      isManual: false,
      included: true,
      cropBounds: { x: 50, y: 20, width: 20, height: 30 },
      cropMask: cropMask2,
    };

    // Region 3 (Excluded): [80..95, 20..50]
    const cropMask3 = new Uint8Array(15 * 30);
    cropMask3.fill(1);
    const r3: PersonRegion = {
      id: 'p3',
      label: 'P3',
      box: { x: 80, y: 20, width: 15, height: 30 },
      score: 0.7,
      isManual: true,
      included: false, // Excluded!
      cropBounds: { x: 80, y: 20, width: 15, height: 30 },
      cropMask: cropMask3,
    };

    const union = combinePersonRegions([r1, r2, r3], W, H);

    // Verify r1 pixels are present
    expect(union[25 * W + 15]).toBe(1);
    // Verify r2 pixels are present
    expect(union[25 * W + 55]).toBe(1);
    // Verify r3 (excluded) pixels are NOT present
    expect(union[25 * W + 85]).toBe(0);
    // Verify background is NOT present
    expect(union[0]).toBe(0);
    expect(union[75 * W + 5]).toBe(0);

    // Count foreground pixels: should be 20*30 + 20*30 = 1200
    let fg = 0;
    for (let i = 0; i < W * H; i++) if (union[i] === 1) fg++;
    expect(fg).toBe(1200);
  });

  it('correctly handles overlapping regions with bitwise OR union without duplication', () => {
    const W = 60;
    const H = 60;

    // Box A: [10..30, 10..30] (size 20x20 = 400 px)
    const maskA = new Uint8Array(20 * 20);
    maskA.fill(1);
    const rA: PersonRegion = {
      id: 'pA',
      label: 'P A',
      box: { x: 10, y: 10, width: 20, height: 20 },
      score: 0.95,
      isManual: false,
      included: true,
      cropBounds: { x: 10, y: 10, width: 20, height: 20 },
      cropMask: maskA,
    };

    // Box B: [20..40, 10..30] (size 20x20 = 400 px, overlaps A on x:20..30 -> 10x20 = 200 px overlap)
    const maskB = new Uint8Array(20 * 20);
    maskB.fill(1);
    const rB: PersonRegion = {
      id: 'pB',
      label: 'P B',
      box: { x: 20, y: 10, width: 20, height: 20 },
      score: 0.88,
      isManual: true,
      included: true,
      cropBounds: { x: 20, y: 10, width: 20, height: 20 },
      cropMask: maskB,
    };

    const union = combinePersonRegions([rA, rB], W, H);

    // Total union area should be 400 + 400 - 200 = 600 px
    let fg = 0;
    for (let i = 0; i < W * H; i++) if (union[i] === 1) fg++;
    expect(fg).toBe(600);
  });

  it('persists and restores photo project with person regions and regional masks without re-running AI', async () => {
    const W = 120;
    const H = 90;

    const sourceData = new Uint8ClampedArray(W * H * 4);
    // Draw synthetic photo gradient
    for (let i = 0; i < W * H; i++) {
      sourceData[i * 4] = (i % 256);
      sourceData[i * 4 + 1] = ((i * 2) % 256);
      sourceData[i * 4 + 2] = 120;
      sourceData[i * 4 + 3] = 255;
    }
    const sourceImage = new ImageData(sourceData, W, H);

    // Create 2 person regions
    const mask1 = new Uint8Array(30 * 40);
    mask1.fill(1);
    const mask2 = new Uint8Array(25 * 35);
    mask2.fill(1);

    const helperUint8ToBase64 = (bytes: Uint8Array): string => {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };

    const serializedRegions: SerializedPersonRegion[] = [
      {
        id: 'person_1_10_20',
        label: 'P1 (92%)',
        box: { x: 12, y: 22, width: 26, height: 36 },
        score: 0.92,
        isManual: false,
        included: true,
        cropBounds: { x: 10, y: 20, width: 30, height: 40 },
        maskData: helperUint8ToBase64(mask1),
      },
      {
        id: 'manual_person_2',
        label: 'Manual 1',
        box: { x: 60, y: 25, width: 21, height: 31 },
        score: 1.0,
        isManual: true,
        included: true,
        cropBounds: { x: 58, y: 23, width: 25, height: 35 },
        maskData: helperUint8ToBase64(mask2),
      },
    ];

    const alphaMask = new Uint8Array(W * H);
    // Combined alpha
    for (let y = 20; y < 60; y++) {
      for (let x = 10; x < 40; x++) alphaMask[y * W + x] = 255;
    }
    for (let y = 23; y < 58; y++) {
      for (let x = 58; x < 83; x++) alphaMask[y * W + x] = 255;
    }

    const archiveBlob = await saveProjectArchive({
      name: 'family_photo_test',
      sourceImage,
      alphaMask,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 20,
        groupingProximityThreshold: 35,
        enableTitleDetection: false,
      },
      components: [],
      groups: [],
      holes: [],
      globalBorderThickness: 24,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'photo',
      photoSettings: {
        borderThickness: 24,
        previewBg: 'dark',
        hasRemovedBackground: true,
        viewMode: 'sticker',
        personRegions: serializedRegions,
        selectedRegionId: 'person_1_10_20',
        isReviewMode: true,
      },
    });

    // Re-open project from archive
    const loaded = await loadProjectArchive(archiveBlob);

    expect(loaded.metadata.name).toBe('family_photo_test');
    expect(loaded.metadata.projectType).toBe('photo');
    expect(loaded.metadata.photoSettings?.borderThickness).toBe(24);
    expect(loaded.metadata.photoSettings?.previewBg).toBe('dark');
    expect(loaded.metadata.photoSettings?.isReviewMode).toBe(true);
    expect(loaded.metadata.photoSettings?.selectedRegionId).toBe('person_1_10_20');

    const restored = loaded.metadata.photoSettings?.personRegions;
    expect(restored).toBeDefined();
    expect(restored?.length).toBe(2);

    expect(restored![0].id).toBe('person_1_10_20');
    expect(restored![0].label).toBe('P1 (92%)');
    expect(restored![0].isManual).toBe(false);
    expect(restored![0].box).toEqual({ x: 12, y: 22, width: 26, height: 36 });
    expect(restored![0].maskData).toBeDefined();

    expect(restored![1].id).toBe('manual_person_2');
    expect(restored![1].label).toBe('Manual 1');
    expect(restored![1].isManual).toBe(true);

    // Verify alphaMask restored exactly
    expect(loaded.alphaMask[25 * W + 20]).toBe(255);
    expect(loaded.alphaMask[0]).toBe(0);
  });
});
