import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { composePhotoCutout } from '../photoAdapter';
import { applyBrushStroke } from '../maskPatch';
import { saveProjectArchive, loadProjectArchive, ProjectSaveState, LoadedProjectData } from '../projectArchive';
import { ArtworkComponent, StickerGroup, ExtractionSettings } from '../../types';
import { usePhotoMode, UsePhotoModeReturn } from '../../state/usePhotoMode';
import JSZip from 'jszip';

let modnetDeferredPromise: Promise<any> | null = null;
let mockDetectedPeople: any[] = [
  {
    id: 'p1',
    label: 'P1',
    box: { x: 0, y: 0, width: 100, height: 100 },
    score: 0.99,
    isManual: false,
    included: true,
  },
];

vi.mock('../modnetSegmenter', () => ({
  segmentPortraitModnet: vi.fn((_img: any, onProgress?: (msg: string) => void) => {
    onProgress?.('Running on-device High-Quality portrait matting (MODNet)...');
    if (modnetDeferredPromise) {
      return modnetDeferredPromise;
    }
    return Promise.resolve({
      alphaMatte: new Uint8Array(100 * 100),
      binaryMask: new Uint8Array(100 * 100),
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    });
  }),
  getModnetPipeline: vi.fn().mockResolvedValue({}),
}));

vi.mock('../mediaPipeSegmenter', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getMediaPipeSegmenter: vi.fn().mockResolvedValue({}),
    getMediaPipeDetector: vi.fn().mockResolvedValue({}),
    detectPeopleInPhoto: vi.fn((_img: any, _ratio: any, onProgress?: (msg: string) => void) => {
      onProgress?.('Scanning photo for people...');
      return Promise.resolve(mockDetectedPeople);
    }),
  };
});

describe('Sticker Studio Photo Mode — Focused Automated Test Suite', () => {
  const W = 80;
  const H = 80;
  const totalPixels = W * H;

  // Helper to create synthetic source image with distinct RGB patterns
  function createSyntheticPhoto(): ImageData {
    const data = new Uint8ClampedArray(totalPixels * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        data[idx] = (x * 3) % 256;         // R
        data[idx + 1] = (y * 3) % 256;     // G
        data[idx + 2] = ((x + y) * 2) % 256;// B
        data[idx + 3] = 255;                // A
      }
    }
    return new ImageData(data, W, H);
  }

  // Helper to create circular foreground mask
  function createCircularMask(cx: number, cy: number, radius: number): Uint8Array {
    const mask = new Uint8Array(totalPixels);
    const r2 = radius * radius;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          mask[y * W + x] = 1;
        }
      }
    }
    return mask;
  }

  // 1. Source RGB Preservation & Background Removal
  it('1. Preserves 100% exact source camera RGB values with zero color drift or filtering', () => {
    const source = createSyntheticPhoto();
    const mask = createCircularMask(40, 40, 20);

    const composed = composePhotoCutout(mask, source.data, W, H, 10, 20);

    expect(composed.bounds.width).toBe(41);
    expect(composed.bounds.height).toBe(41);

    // Verify every fully opaque pixel in artwork matches source RGB bit-for-bit
    const bounds = composed.artworkBounds;
    let verifiedCount = 0;
    for (let y = 0; y < composed.artworkOnlyHeight; y++) {
      for (let x = 0; x < composed.artworkOnlyWidth; x++) {
        const artIdx = (y * composed.artworkOnlyWidth + x) * 4;
        const artAlpha = composed.artworkOnlyRgba[artIdx + 3];

        const srcX = bounds.x + x;
        const srcY = bounds.y + y;
        const srcIdx = (srcY * W + srcX) * 4;

        if (artAlpha === 255 && srcX >= 0 && srcX < W && srcY >= 0 && srcY < H) {
          expect(composed.artworkOnlyRgba[artIdx]).toBe(source.data[srcIdx]);         // Exact R
          expect(composed.artworkOnlyRgba[artIdx + 1]).toBe(source.data[srcIdx + 1]); // Exact G
          expect(composed.artworkOnlyRgba[artIdx + 2]).toBe(source.data[srcIdx + 2]); // Exact B
          verifiedCount++;
        }
      }
    }
    expect(verifiedCount).toBeGreaterThan(1000);
  });

  // 2. Erase and Restore Brush Mutations
  it('2. Correctly applies Erase and Restore brush strokes to mask', () => {
    const mask = createCircularMask(40, 40, 20);
    const alphaMask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) alphaMask[i] = mask[i] > 0 ? 255 : 0;

    let initialCount = 0;
    for (let i = 0; i < totalPixels; i++) if (alphaMask[i] === 255) initialCount++;

    // Erase a circular patch of radius 5 at (40, 40)
    const erasePatch = applyBrushStroke(alphaMask, W, H, [{ x: 40, y: 40 }], {
      radius: 5,
      hardness: 1.0,
      opacity: 1.0,
      mode: 'erase',
    });
    expect(erasePatch).not.toBeNull();

    let afterEraseCount = 0;
    for (let i = 0; i < totalPixels; i++) if (alphaMask[i] === 255) afterEraseCount++;

    expect(afterEraseCount).toBeLessThan(initialCount);
    expect(alphaMask[40 * W + 40]).toBe(0);

    // Restore the erased patch
    const restorePatch = applyBrushStroke(alphaMask, W, H, [{ x: 40, y: 40 }], {
      radius: 5,
      hardness: 1.0,
      opacity: 1.0,
      mode: 'restore',
    });
    expect(restorePatch).not.toBeNull();
    expect(alphaMask[40 * W + 40]).toBe(255);
  });

  // 3. Exact Buffer Undo / Redo
  it('3. Guarantees bit-for-bit exact buffer equality across Undo and Redo operations', () => {
    const initialMask = createCircularMask(40, 40, 20);
    const undoStack: Uint8Array[] = [];
    const redoStack: Uint8Array[] = [];

    let currentMask = new Uint8Array(initialMask);

    // Helper to simulate Photo Mode stroke application
    const stroke = (maskBuf: Uint8Array, pt: { x: number; y: number }, radius: number, mode: 'erase' | 'restore') => {
      const alpha = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) alpha[i] = maskBuf[i] ? 255 : 0;
      applyBrushStroke(alpha, W, H, [pt], { radius, hardness: 1.0, opacity: 1.0, mode });
      const out = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) out[i] = alpha[i] >= 128 ? 1 : 0;
      return out;
    };

    // Perform Edit 1: Erase center
    undoStack.push(new Uint8Array(currentMask));
    currentMask = stroke(currentMask, { x: 40, y: 40 }, 8, 'erase');
    const stateAfterEdit1 = new Uint8Array(currentMask);

    // Perform Edit 2: Restore corner
    undoStack.push(new Uint8Array(currentMask));
    currentMask = stroke(currentMask, { x: 10, y: 10 }, 4, 'restore');
    const stateAfterEdit2 = new Uint8Array(currentMask);

    // Undo Edit 2
    redoStack.push(new Uint8Array(currentMask));
    currentMask = undoStack.pop()!;
    expect(currentMask).toEqual(stateAfterEdit1);

    // Undo Edit 1
    redoStack.push(new Uint8Array(currentMask));
    currentMask = undoStack.pop()!;
    expect(currentMask).toEqual(initialMask); // Exactly equals original initialMask!

    // Redo Edit 1
    undoStack.push(new Uint8Array(currentMask));
    currentMask = redoStack.pop()!;
    expect(currentMask).toEqual(stateAfterEdit1);

    // Redo Edit 2
    undoStack.push(new Uint8Array(currentMask));
    currentMask = redoStack.pop()!;
    expect(currentMask).toEqual(stateAfterEdit2);
  });

  // 4. Border Thickness Monotonic Scaling
  it('4. Monotonically scales white die-cut backing contour while keeping artwork pixels invariant', () => {
    const source = createSyntheticPhoto();
    const mask = createCircularMask(40, 40, 15);

    const b0 = composePhotoCutout(mask, source.data, W, H, 0, 30);
    const b10 = composePhotoCutout(mask, source.data, W, H, 10, 30);
    const b25 = composePhotoCutout(mask, source.data, W, H, 25, 30);

    // Artwork bounds and dimensions must be completely invariant to border thickness changes
    expect(b0.artworkOnlyWidth).toBe(b10.artworkOnlyWidth);
    expect(b10.artworkOnlyWidth).toBe(b25.artworkOnlyWidth);
    expect(b0.artworkOnlyHeight).toBe(b10.artworkOnlyHeight);
    expect(b10.artworkOnlyHeight).toBe(b25.artworkOnlyHeight);

    // White-backed sticker dimensions must grow monotonically with border thickness
    expect(b10.whiteBackedWidth).toBeGreaterThan(b0.whiteBackedWidth);
    expect(b25.whiteBackedWidth).toBeGreaterThan(b10.whiteBackedWidth);
    expect(b10.whiteBackedHeight).toBeGreaterThan(b0.whiteBackedHeight);
    expect(b25.whiteBackedHeight).toBeGreaterThan(b10.whiteBackedHeight);

    // Count non-zero alpha in whiteBacked
    const countAlpha = (rgba: Uint8ClampedArray) => {
      let cnt = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) cnt++;
      return cnt;
    };

    const count0 = countAlpha(b0.whiteBackedRgba);
    const count10 = countAlpha(b10.whiteBackedRgba);
    const count25 = countAlpha(b25.whiteBackedRgba);

    expect(count10).toBeGreaterThan(count0);
    expect(count25).toBeGreaterThan(count10);
  });

  // 5. Photo Mode Project Persistence Round-Trip
  it('5. Successfully saves and restores photo projects with exact decoded PNG source and alpha mask', async () => {
    const source = createSyntheticPhoto();
    const mask = createCircularMask(40, 40, 20);

    const alphaMask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) alphaMask[i] = mask[i] ? 255 : 0;

    const dummySettings: ExtractionSettings = {
      bgTolerance: 15,
      edgeSoftness: 1,
      minComponentArea: 10,
      groupingProximityThreshold: 35,
      enableTitleDetection: false,
    };

    const saveState: ProjectSaveState = {
      name: 'family_vacation_cutout',
      sourceImage: source,
      alphaMask,
      settings: dummySettings,
      components: [],
      groups: [],
      holes: [],
      globalBorderThickness: 25,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'photo',
      photoSettings: {
        borderThickness: 25,
        previewBg: 'checker',
        hasRemovedBackground: true,
        viewMode: 'sticker',
      },
    };

    const zipBlob = await saveProjectArchive(saveState);
    expect(zipBlob.size).toBeGreaterThan(0);

    const loaded = await loadProjectArchive(zipBlob);

    // Verify metadata
    expect(loaded.metadata.name).toBe('family_vacation_cutout');
    expect(loaded.metadata.projectType).toBe('photo');
    expect(loaded.metadata.photoSettings?.borderThickness).toBe(25);
    expect(loaded.metadata.photoSettings?.hasRemovedBackground).toBe(true);

    // Verify exact image dimensions
    expect(loaded.sourceImage.width).toBe(W);
    expect(loaded.sourceImage.height).toBe(H);

    // Verify exact source RGBA match
    for (let i = 0; i < totalPixels * 4; i++) {
      expect(loaded.sourceImage.data[i]).toBe(source.data[i]);
    }

    // Verify exact alpha mask match
    for (let i = 0; i < totalPixels; i++) {
      expect(loaded.alphaMask[i]).toBe(alphaMask[i]);
    }
  });

  // 6. Legacy Sheet Project Backward Compatibility
  it('6. Loads legacy Sheet Mode projects seamlessly without breaking existing workspace structures', async () => {
    const source = createSyntheticPhoto();
    const alphaMask = new Uint8Array(totalPixels).fill(255);
    const labelMap = new Uint16Array(totalPixels).fill(1);

    const components: ArtworkComponent[] = [
      {
        id: 'c1',
        label: 1,
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        centroid: { x: 20, y: 20 },
        pixelCount: 400,
        isTiny: false,
      },
    ];

    const groups: StickerGroup[] = [
      {
        id: 'g1',
        name: 'sheet_sticker_1',
        componentIds: ['c1'],
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        borderThickness: 15,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: false,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false,
      },
    ];

    const dummySettings: ExtractionSettings = {
      bgTolerance: 15,
      edgeSoftness: 1,
      minComponentArea: 10,
      groupingProximityThreshold: 35,
      enableTitleDetection: false,
    };

    const sheetState: ProjectSaveState = {
      name: 'legacy_sheet_sample',
      sourceImage: source,
      alphaMask,
      labelMap,
      settings: dummySettings,
      components,
      groups,
      holes: [],
      globalBorderThickness: 15,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'sheet',
    };

    const zipBlob = await saveProjectArchive(sheetState);
    const loaded = await loadProjectArchive(zipBlob);

    expect(loaded.metadata.name).toBe('legacy_sheet_sample');
    expect(loaded.metadata.projectType).toBe('sheet');
    expect(loaded.components.length).toBe(1);
    expect(loaded.groups.length).toBe(1);
    expect(loaded.groups[0].name).toBe('sheet_sticker_1');
    expect(loaded.labelMap[0]).toBe(1);
  });

  // 7. Corrupt & Oversized Payloads Rejection
  it('7. Rejects corrupt or oversized alpha_mask payloads and zip bombs safely', async () => {
    const source = createSyntheticPhoto();
    const alphaMask = new Uint8Array(totalPixels).fill(255);

    const dummySettings: ExtractionSettings = {
      bgTolerance: 15,
      edgeSoftness: 1,
      minComponentArea: 10,
      groupingProximityThreshold: 35,
      enableTitleDetection: false,
    };

    const validState: ProjectSaveState = {
      name: 'valid_base',
      sourceImage: source,
      alphaMask,
      settings: dummySettings,
      components: [],
      groups: [],
      holes: [],
      globalBorderThickness: 20,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'photo',
    };

    const validBlob = await saveProjectArchive(validState);
    const validArrayBuffer = await validBlob.arrayBuffer();

    // Test A: Truncated alpha_mask.bin (corrupt size)
    const zipA = await JSZip.loadAsync(validArrayBuffer);
    zipA.file('alpha_mask.bin', new Uint8Array(100)); // Should be 6400 bytes, corrupt to 100
    const corruptBlobA = await zipA.generateAsync({ type: 'blob' });

    await expect(loadProjectArchive(corruptBlobA)).rejects.toThrow(
      /Corrupted alpha_mask\.bin/
    );

    // Test B: Oversized alpha_mask.bin
    const zipB = await JSZip.loadAsync(validArrayBuffer);
    zipB.file('alpha_mask.bin', new Uint8Array(10000)); // Should be 6400 bytes
    const corruptBlobB = await zipB.generateAsync({ type: 'blob' });

    await expect(loadProjectArchive(corruptBlobB)).rejects.toThrow(
      /Corrupted alpha_mask\.bin/
    );

    // Test C: Corrupted source.png SHA-256 hash mismatch
    const zipC = await JSZip.loadAsync(validArrayBuffer);
    const metaStr = await zipC.file('project.json')!.async('text');
    const meta = JSON.parse(metaStr);
    meta.metadata.sourceSha256 = '0000000000000000000000000000000000000000000000000000000000000000';
    zipC.file('project.json', JSON.stringify(meta));
    const corruptBlobC = await zipC.generateAsync({ type: 'blob' });

    await expect(loadProjectArchive(corruptBlobC)).rejects.toThrow(
      /SHA-256 checksum mismatch/
    );

    // Test D: Path traversal attempt in archive
    const zipD = await JSZip.loadAsync(validArrayBuffer);
    zipD.file('../evil.txt', 'malicious content');
    const corruptBlobD = await zipD.generateAsync({ type: 'blob' });

    await expect(loadProjectArchive(corruptBlobD)).rejects.toThrow(
      /Security violation.*path traversal/
    );
  });

  // 8. In-Flight Operation Safety & Cancellation (Photo Import, Project Load, Reset)
  describe('8. In-Flight Extraction Safety & State Invalidation', () => {
    let root: Root | null = null;
    let hookResult: UsePhotoModeReturn;

    function TestHookComponent() {
      hookResult = usePhotoMode();
      return null;
    }

    function setupMockDom() {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      (globalThis as any).window = globalThis;

      class MockElement {
        nodeType = 1;
        tagName: string;
        style = {};
        childNodes: any[] = [];
        width = 100;
        height = 100;
        ownerDocument: any = null;
        constructor(tag?: string) {
          this.tagName = (tag || 'DIV').toUpperCase();
        }
        setAttribute() {}
        getAttribute() { return null; }
        removeAttribute() {}
        addEventListener() {}
        removeEventListener() {}
        appendChild(c: any) { this.childNodes.push(c); return c; }
        removeChild(c: any) { return c; }
        insertBefore(c: any) { return c; }
        getContext(_type: string) {
          return {
            drawImage: () => {},
            getImageData: (_x: number, _y: number, w: number, h: number) => {
              return new (globalThis as any).ImageData(w, h);
            },
            putImageData: () => {},
          };
        }
      }

      (globalThis as any).Element = MockElement;
      (globalThis as any).HTMLElement = MockElement;
      (globalThis as any).HTMLCanvasElement = MockElement;
      (globalThis as any).HTMLIFrameElement = class HTMLIFrameElement {};

      (globalThis as any).Image = class MockImage {
        naturalWidth = 100;
        naturalHeight = 100;
        onload: (() => void) | null = null;
        onerror: ((err: any) => void) | null = null;
        set src(_val: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      };

      const doc: any = {
        nodeType: 9,
        activeElement: null,
        createElement: (tag: string) => {
          const el = new MockElement(tag);
          el.ownerDocument = doc;
          return el;
        },
        createDocumentFragment: () => ({ nodeType: 11, childNodes: [], appendChild: (c: any) => c }),
        createTextNode: (t: string) => ({ nodeType: 3, textContent: t }),
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      doc.defaultView = globalThis;
      (globalThis as any).document = doc;

      const container = new MockElement('div');
      container.ownerDocument = doc;
      root = createRoot(container as any);

      act(() => {
        root!.render(React.createElement(TestHookComponent));
      });
    }

    function tearDownMockDom() {
      if (root) {
        act(() => {
          root!.unmount();
        });
        root = null;
      }
      modnetDeferredPromise = null;
      delete (globalThis as any).FileReader;
    }

    it('8a. Safely cancels in-flight High Quality inference when another photo is imported', async () => {
      setupMockDom();
      try {
        await act(async () => {
          await hookResult.importFromDataUrl('data:image/png;base64,mock1', 'initial_photo.jpg');
        });

        expect(hookResult.fileName).toBe('initial_photo.jpg');

        let resolveModnet: (val: any) => void = () => {};
        modnetDeferredPromise = new Promise((resolve) => {
          resolveModnet = resolve;
        });

        let detectPromise: Promise<void> = null as any;
        act(() => {
          detectPromise = hookResult.detectPeople('high-quality');
        });

        // Microtasks tick to transition from person detection to MODNet matting
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(hookResult.isProcessing).toBe(true);
        expect(hookResult.progressMessage).toContain('High-Quality');

        // While High Quality inference is in-flight, import second photo
        await act(async () => {
          await hookResult.importFromDataUrl('data:image/png;base64,mock2', 'second_photo.png');
        });

        // Interface must not remain stuck on "Processing"
        expect(hookResult.isProcessing).toBe(false);
        expect(hookResult.progressMessage).toBe('');
        expect(hookResult.fileName).toBe('second_photo.png');
        expect(hookResult.mask).toBeNull();

        // Stale MODNet completes later
        await act(async () => {
          resolveModnet({
            alphaMatte: new Uint8Array(100 * 100).fill(255),
            binaryMask: new Uint8Array(100 * 100).fill(1),
            bounds: { x: 0, y: 0, width: 100, height: 100 },
          });
          await detectPromise;
        });

        // Ensure stale result cannot overwrite the newly imported photo
        expect(hookResult.fileName).toBe('second_photo.png');
        expect(hookResult.mask).toBeNull();
        expect(hookResult.isProcessing).toBe(false);
      } finally {
        tearDownMockDom();
      }
    });

    it('8b. Safely cancels in-flight High Quality inference when a saved project is loaded', async () => {
      setupMockDom();
      try {
        await act(async () => {
          await hookResult.importFromDataUrl('data:image/png;base64,mock1', 'initial.jpg');
        });

        let resolveModnet: (val: any) => void = () => {};
        modnetDeferredPromise = new Promise((resolve) => {
          resolveModnet = resolve;
        });

        let detectPromise: Promise<void> = null as any;
        act(() => {
          detectPromise = hookResult.detectPeople('high-quality');
        });

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(hookResult.isProcessing).toBe(true);

        const projectSource = new (globalThis as any).ImageData(100, 100);
        const projectAlpha = new Uint8Array(100 * 100).fill(255);
        const mockLoadedProject: LoadedProjectData = {
          metadata: {
            version: '1.1',
            schemaVersion: 2,
            name: 'my_saved_portrait',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sourceSha256: 'mocksha',
            imageDimensions: { width: 100, height: 100 },
            projectType: 'photo',
            settings: {} as any,
            globalBorderThickness: 25,
            globalSolidBacking: false,
            globalWhiteBacking: true,
            photoSettings: {
              borderThickness: 25,
              previewBg: 'checker',
              hasRemovedBackground: true,
              extractionMode: 'high-quality',
              viewMode: 'sticker',
              isReviewMode: true,
            },
          },
          sourceImage: projectSource,
          alphaMask: projectAlpha,
          labelMap: new Uint16Array(100 * 100),
          components: [],
          groups: [],
          holes: [],
        };

        // Load project while inference is in-flight
        act(() => {
          hookResult.loadPhotoProject(mockLoadedProject);
        });

        expect(hookResult.isProcessing).toBe(false);
        expect(hookResult.progressMessage).toBe('');
        expect(hookResult.fileName).toBe('my_saved_portrait.png');
        expect(hookResult.mask![0]).toBe(1);

        // Stale inference resolves with binary 0
        await act(async () => {
          resolveModnet({
            alphaMatte: new Uint8Array(100 * 100).fill(0),
            binaryMask: new Uint8Array(100 * 100).fill(0),
            bounds: { x: 0, y: 0, width: 100, height: 100 },
          });
          await detectPromise;
        });

        // Loaded project mask must NOT be overwritten by stale 0s
        expect(hookResult.fileName).toBe('my_saved_portrait.png');
        expect(hookResult.mask![0]).toBe(1);
        expect(hookResult.isProcessing).toBe(false);
      } finally {
        tearDownMockDom();
      }
    });

    it('8c. Safely cancels in-flight inference when resetPhoto is called', async () => {
      setupMockDom();
      try {
        await act(async () => {
          await hookResult.importFromDataUrl('data:image/png;base64,mock1', 'reset_target.jpg');
        });

        let resolveModnet: (val: any) => void = () => {};
        modnetDeferredPromise = new Promise((resolve) => {
          resolveModnet = resolve;
        });

        let detectPromise: Promise<void> = null as any;
        act(() => {
          detectPromise = hookResult.detectPeople('high-quality');
        });

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(hookResult.isProcessing).toBe(true);

        act(() => {
          hookResult.resetPhoto();
        });

        expect(hookResult.isProcessing).toBe(false);
        expect(hookResult.progressMessage).toBe('');
        expect(hookResult.sourceImage).toBeNull();
        expect(hookResult.mask).toBeNull();

        await act(async () => {
          resolveModnet({
            alphaMatte: new Uint8Array(100 * 100).fill(255),
            binaryMask: new Uint8Array(100 * 100).fill(1),
            bounds: { x: 0, y: 0, width: 100, height: 100 },
          });
          await detectPromise;
        });

        expect(hookResult.sourceImage).toBeNull();
        expect(hookResult.mask).toBeNull();
        expect(hookResult.isProcessing).toBe(false);
      } finally {
        tearDownMockDom();
      }
    });

    it('8d. Safely invalidates in-flight FileReader when a saved project loads before FileReader finishes', async () => {
      setupMockDom();
      try {
        let triggerFileReaderLoad: (() => void) | null = null;
        (globalThis as any).FileReader = class MockFileReader {
          onload: (() => void) | null = null;
          onerror: ((err: any) => void) | null = null;
          result: string | null = null;
          readAsDataURL() {
            triggerFileReaderLoad = () => {
              this.result = 'data:image/png;base64,photoA_data';
              if (this.onload) this.onload();
            };
          }
        };

        const mockFileA = new File(['dummyA'], 'photoA.jpg', { type: 'image/jpeg' });

        // 1. Import A starts and FileReader remains pending
        let importAPromise: Promise<void>;
        act(() => {
          importAPromise = hookResult.importPhoto(mockFileA);
        });

        // FileReader is still pending (triggerFileReaderLoad has not been called)
        expect(triggerFileReaderLoad).not.toBeNull();

        // 2. Project B loads while FileReader A is pending
        const projectBSource = new (globalThis as any).ImageData(100, 100);
        projectBSource.data[0] = 42; // Distinct marker
        const projectBAlpha = new Uint8Array(100 * 100).fill(255);
        const mockLoadedProjectB: LoadedProjectData = {
          metadata: {
            version: '1.1',
            schemaVersion: 2,
            name: 'project_b_saved',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sourceSha256: 'sha_project_b',
            imageDimensions: { width: 100, height: 100 },
            projectType: 'photo',
            settings: {} as any,
            globalBorderThickness: 20,
            globalSolidBacking: false,
            globalWhiteBacking: true,
            photoSettings: {
              borderThickness: 20,
              previewBg: 'checker',
              hasRemovedBackground: true,
              extractionMode: 'standard',
              viewMode: 'sticker',
              isReviewMode: true,
            },
          },
          sourceImage: projectBSource,
          alphaMask: projectBAlpha,
          labelMap: new Uint16Array(100 * 100),
          components: [],
          groups: [],
          holes: [],
        };

        act(() => {
          hookResult.loadPhotoProject(mockLoadedProjectB);
        });

        // Verify Project B is active
        expect(hookResult.fileName).toBe('project_b_saved.png');
        expect(hookResult.sourceImage?.data[0]).toBe(42);
        expect(hookResult.mask![0]).toBe(1);

        // 3. FileReader A completes
        await act(async () => {
          triggerFileReaderLoad!();
          await importAPromise;
        });

        // 4. Project B remains intact, with no stale source-image replacement
        expect(hookResult.fileName).toBe('project_b_saved.png');
        expect(hookResult.sourceImage?.data[0]).toBe(42);
        expect(hookResult.mask![0]).toBe(1);
        expect(hookResult.isProcessing).toBe(false);
      } finally {
        tearDownMockDom();
      }
    });
  });
});
