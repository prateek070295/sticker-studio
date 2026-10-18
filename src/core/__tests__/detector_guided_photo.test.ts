import { describe, it, expect } from 'vitest';
import { BoundingBox, PersonRegion, SerializedPersonRegion } from '../../types';
import {
  combinePersonRegions,
  DEFAULT_MIN_PERSON_AREA_RATIO,
  filterPersonCandidate,
  isolateConnectedPersonRegion
} from '../mediaPipeSegmenter';
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

  it('proves that a small 0.1%-area person candidate survives filtering and is marked uncertain for user review', () => {
    const totalArea = 1200 * 800; // 960,000 pixels
    // 0.1% of total area is 960 pixels (e.g. 30 x 32 box)
    const smallBox: BoundingBox = { x: 500, y: 300, width: 30, height: 32 }; // 960 pixels = 0.0010 ratio (0.10%)
    
    // Test with default threshold (0.0008 = 0.08%)
    const result = filterPersonCandidate(smallBox, totalArea, 0.45, DEFAULT_MIN_PERSON_AREA_RATIO);
    expect(result.keep).toBe(true); // Must survive!
    expect(result.isUncertain).toBe(true); // Marked uncertain for review because < 0.25%

    // A tiny noise box of 0.05% (e.g. 480 pixels) should be filtered out
    const noiseBox: BoundingBox = { x: 100, y: 100, width: 20, height: 24 }; // 480 pixels = 0.0005 ratio (0.05%)
    const noiseResult = filterPersonCandidate(noiseBox, totalArea, 0.45, DEFAULT_MIN_PERSON_AREA_RATIO);
    expect(noiseResult.keep).toBe(false); // Discarded as noise
  });

  it('demonstrates neighbor disconnected-island suppression while preserving touching connected subjects', () => {
    const cropW = 60;
    const cropH = 60;
    const rawCropMask = new Uint8Array(cropW * cropH);

    // Person A in core box [15..35, 15..45]
    for (let y = 15; y < 45; y++) {
      for (let x = 15; x < 35; x++) {
        rawCropMask[y * cropW + x] = 1;
      }
    }

    // Person B: Touching Person A at x=35 with a wrist/arm bridge [35..38, 25..28]
    // and expanding into margin [38..52, 20..48]
    for (let y = 25; y < 28; y++) {
      for (let x = 35; x < 38; x++) {
        rawCropMask[y * cropW + x] = 1;
      }
    }
    for (let y = 20; y < 48; y++) {
      for (let x = 38; x < 52; x++) {
        rawCropMask[y * cropW + x] = 1;
      }
    }

    // Island C: Disconnected background clutter in the margin at [5..10, 5..10]
    for (let y = 5; y < 10; y++) {
      for (let x = 5; x < 10; x++) {
        rawCropMask[y * cropW + x] = 1;
      }
    }

    const coreBoxInCrop: BoundingBox = { x: 15, y: 15, width: 20, height: 30 };
    const cleaned = isolateConnectedPersonRegion(rawCropMask, cropW, cropH, coreBoxInCrop);

    // 1. Person A pixels are preserved
    expect(cleaned[20 * cropW + 20]).toBe(1);

    // 2. Touching Person B is preserved (BFS preserves single connected foreground component; no severed limbs)
    expect(cleaned[26 * cropW + 36]).toBe(1); // bridge
    expect(cleaned[30 * cropW + 45]).toBe(1); // Person B body

    // 3. Disconnected Island C in the margin is discarded
    expect(cleaned[7 * cropW + 7]).toBe(0);
    expect(cleaned[5 * cropW + 5]).toBe(0);
  });

  it('verifies region editing undo/redo and manual brush correction reconciliation', () => {
    const W = 100;
    const H = 100;

    // Helper functions mirroring state reconciliation
    function cloneRegions(regions: PersonRegion[]): PersonRegion[] {
      return regions.map(r => ({
        ...r,
        box: { ...r.box },
        cropBounds: r.cropBounds ? { ...r.cropBounds } : undefined,
        cropMask: r.cropMask ? new Uint8Array(r.cropMask) : undefined,
      }));
    }

    function composeMask(regions: PersonRegion[], delta: Int8Array | null): Uint8Array {
      const base = combinePersonRegions(regions, W, H);
      if (!delta) return base;
      const out = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        if (delta[i] === 1) out[i] = 1;
        else if (delta[i] === -1) out[i] = 0;
        else out[i] = base[i];
      }
      return out;
    }

    // Initial State: Person 1 at [10..30, 10..30] and Person 2 at [50..70, 50..70]
    const m1 = new Uint8Array(20 * 20); m1.fill(1);
    const m2 = new Uint8Array(20 * 20); m2.fill(1);
    const r1: PersonRegion = {
      id: 'p1', label: 'P1', box: { x: 10, y: 10, width: 20, height: 20 },
      score: 0.9, isManual: false, included: true,
      cropBounds: { x: 10, y: 10, width: 20, height: 20 }, cropMask: m1
    };
    const r2: PersonRegion = {
      id: 'p2', label: 'P2', box: { x: 50, y: 50, width: 20, height: 20 },
      score: 0.85, isManual: false, included: true,
      cropBounds: { x: 50, y: 50, width: 20, height: 20 }, cropMask: m2
    };

    let regions = [r1, r2];
    let manualDelta: Int8Array | null = null;
    let mask = composeMask(regions, manualDelta);

    interface Snapshot {
      mask: Uint8Array;
      regions: PersonRegion[];
      manualDelta: Int8Array | null;
    }

    const undoStack: Snapshot[] = [];
    const redoStack: Snapshot[] = [];

    const pushState = () => {
      undoStack.push({
        mask: new Uint8Array(mask),
        regions: cloneRegions(regions),
        manualDelta: manualDelta ? new Int8Array(manualDelta) : null,
      });
      redoStack.length = 0;
    };

    // 1. Exclude person 2
    pushState();
    regions = regions.map(r => r.id === 'p2' ? { ...r, included: false } : r);
    mask = composeMask(regions, manualDelta);
    expect(mask[60 * W + 60]).toBe(0); // Person 2 excluded

    // Undo exclusion
    const undoItem1 = undoStack.pop()!;
    redoStack.push({
      mask: new Uint8Array(mask),
      regions: cloneRegions(regions),
      manualDelta: manualDelta ? new Int8Array(manualDelta) : null,
    });
    regions = undoItem1.regions;
    mask = undoItem1.mask;
    expect(regions.find(r => r.id === 'p2')?.included).toBe(true);
    expect(mask[60 * W + 60]).toBe(1); // Person 2 restored

    // Redo exclusion
    const redoItem1 = redoStack.pop()!;
    undoStack.push({
      mask: new Uint8Array(mask),
      regions: cloneRegions(regions),
      manualDelta: manualDelta ? new Int8Array(manualDelta) : null,
    });
    regions = redoItem1.regions;
    mask = redoItem1.mask;
    expect(regions.find(r => r.id === 'p2')?.included).toBe(false);
    expect(mask[60 * W + 60]).toBe(0);

    // 2. Perform manual erase on Person 1 at [15, 15]
    pushState();
    manualDelta = new Int8Array(W * H);
    manualDelta[15 * W + 15] = -1; // erased
    mask = composeMask(regions, manualDelta);
    expect(mask[15 * W + 15]).toBe(0);

    // 3. Now add a new manual region 3 at [80..90, 80..90]
    pushState();
    const m3 = new Uint8Array(10 * 10); m3.fill(1);
    const r3: PersonRegion = {
      id: 'manual_3', label: 'Manual 1', box: { x: 80, y: 80, width: 10, height: 10 },
      score: 1.0, isManual: true, included: true,
      cropBounds: { x: 80, y: 80, width: 10, height: 10 }, cropMask: m3
    };
    regions = [...regions, r3];
    mask = composeMask(regions, manualDelta);

    // Verify Region 3 is present
    expect(mask[85 * W + 85]).toBe(1);
    // AND verify previous manual erase on Person 1 was NOT wiped out!
    expect(mask[15 * W + 15]).toBe(0);
    expect(mask[20 * W + 20]).toBe(1); // Rest of Person 1 still there
  });
});
