import { describe, it, expect } from 'vitest';
import { saveProjectArchive, loadProjectArchive, ProjectSaveState } from '../projectArchive';
import { ArtworkComponent, StickerGroup, ExtractionSettings, GridSheetConfig } from '../../types';
import { buildGroupDistanceField, compositeSticker } from '../composer';

describe('Exact Project Persistence Regression Test', () => {
  it('persists and restores exact alpha mask, ownership label map, split regions, and backing corrections', async () => {
    const width = 100;
    const height = 100;
    const size = width * height;

    // Create synthetic source image with 4 channels
    const rgba = new Uint8ClampedArray(size * 4);
    // Fill source background with white, alpha 255
    for (let i = 0; i < size; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }

    const sourceImage = {
      data: rgba,
      width,
      height,
      colorSpace: 'srgb' as PredefinedColorSpace
    } as ImageData;

    // 1. Alpha mask: mostly 0, with foreground pixels
    const originalAlphaMask = new Uint8Array(size);

    // 2. Ownership label map: 0 for background, comp.label for components
    const originalLabelMap = new Uint16Array(size);

    // Component 1: bounds [10, 10, 30, 30], label 1
    // It has a transparent hole / erased pixel inside its bounding box at (20, 20)
    for (let y = 10; y < 40; y++) {
      for (let x = 10; x < 40; x++) {
        const idx = y * width + x;
        // Erased patch inside bounding box:
        if (x >= 20 && x <= 25 && y >= 20 && y <= 25) {
          originalAlphaMask[idx] = 0;
          originalLabelMap[idx] = 0;
        } else {
          originalAlphaMask[idx] = 255;
          originalLabelMap[idx] = 1;
        }
      }
    }

    // Component 2: Restored disconnected detail at [60, 60, 10, 10], label 2
    for (let y = 60; y < 70; y++) {
      for (let x = 60; x < 70; x++) {
        const idx = y * width + x;
        originalAlphaMask[idx] = 255;
        originalLabelMap[idx] = 2;
      }
    }

    // Component 3 & 4: Manually split ownership region inside [10, 60, 30, 20]
    // Top half is label 3, bottom half is label 4 (sharing adjacent pixels in one rectangle)
    for (let y = 60; y < 80; y++) {
      for (let x = 10; x < 40; x++) {
        const idx = y * width + x;
        originalAlphaMask[idx] = 255;
        if (y < 70) {
          originalLabelMap[idx] = 3;
        } else {
          originalLabelMap[idx] = 4;
        }
      }
    }

    const components: ArtworkComponent[] = [
      {
        id: 'comp_1',
        label: 1,
        pixelCount: 30 * 30 - 36,
        bounds: { x: 10, y: 10, width: 30, height: 30 },
        centroid: { x: 25, y: 25 },
        isTiny: false
      },
      {
        id: 'comp_2',
        label: 2,
        pixelCount: 100,
        bounds: { x: 60, y: 60, width: 10, height: 10 },
        centroid: { x: 65, y: 65 },
        isTiny: false
      },
      {
        id: 'comp_3',
        label: 3,
        pixelCount: 300,
        bounds: { x: 10, y: 60, width: 30, height: 10 },
        centroid: { x: 25, y: 65 },
        isTiny: false
      },
      {
        id: 'comp_4',
        label: 4,
        pixelCount: 300,
        bounds: { x: 10, y: 70, width: 30, height: 10 },
        centroid: { x: 25, y: 75 },
        isTiny: false
      },
      {
        id: 'comp_cap_1',
        label: 5,
        pixelCount: 20,
        bounds: { x: 5, y: 40, width: 40, height: 5 },
        centroid: { x: 25, y: 42 },
        isTiny: false
      }
    ];

    const gridConfig: GridSheetConfig = {
      enabled: true,
      columns: 2,
      rows: 2,
      margin: { top: 5, right: 5, bottom: 5, left: 5 },
      excludeCaptions: true,
      captionHeightPercent: 10
    };

    const groups: StickerGroup[] = [
      {
        id: 'group_1',
        name: 'sticker_001',
        componentIds: ['comp_1', 'comp_2'],
        bounds: { x: 10, y: 10, width: 60, height: 60 },
        borderThickness: 20,
        customBorder: true,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        backingOverride: {
          groupId: 'group_1',
          smoothingRadius: 15
        },
        bridges: [
          {
            id: 'bridge_1',
            fromCompId: 'comp_1',
            toCompId: 'comp_2',
            x1: 20,
            y1: 20,
            x2: 30,
            y2: 30,
            width: 6,
            enabled: true
          }
        ],
        excludedFromExport: false
      },
      {
        id: 'group_2',
        name: 'sticker_002',
        componentIds: ['comp_3', 'comp_4'],
        bounds: { x: 10, y: 60, width: 30, height: 20 },
        borderThickness: 20,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      },
      {
        id: 'group_caption_1',
        name: 'caption_r1_c1',
        componentIds: ['comp_cap_1'],
        bounds: { x: 5, y: 40, width: 40, height: 5 },
        borderThickness: 20,
        customBorder: false,
        whiteBackingEnabled: false,
        connectBacking: false,
        solidBacking: false,
        bridges: [],
        excludedFromExport: true
      }
    ];

    const settings: ExtractionSettings = {
      bgTolerance: 18,
      edgeSoftness: 1.0,
      minComponentArea: 15,
      groupingProximityThreshold: 35,
      enableTitleDetection: true,
      gridConfig
    };

    const saveState: ProjectSaveState = {
      name: 'exact_persistence_test',
      sourceImage,
      settings,
      components,
      groups,
      holes: [],
      globalBorderThickness: 20,
      globalSolidBacking: true,
      globalWhiteBacking: true,
      // @ts-ignore
      alphaMask: originalAlphaMask,
      // @ts-ignore
      labelMap: originalLabelMap
    };

    const archiveBlob = await saveProjectArchive(saveState);
    const loaded = await loadProjectArchive(archiveBlob);

    // Assert exact persistence of alpha mask
    // @ts-ignore
    expect(loaded.alphaMask).toBeDefined();
    // @ts-ignore
    expect(loaded.alphaMask).toEqual(originalAlphaMask);

    // Assert exact persistence of ownership label map
    // @ts-ignore
    expect(loaded.labelMap).toBeDefined();
    // @ts-ignore
    expect(loaded.labelMap).toEqual(originalLabelMap);

    // Assert components and groups
    expect(loaded.components).toHaveLength(5);
    expect(loaded.groups).toHaveLength(3);

    // Assert backing override & bridge data
    const loadedG1 = loaded.groups.find(g => g.id === 'group_1')!;
    expect(loadedG1.backingOverride).toEqual(groups[0].backingOverride);
    expect(loadedG1.bridges).toEqual(groups[0].bridges);

    // Assert grid configuration & caption exclusion
    expect(loaded.metadata.gridConfig?.enabled).toBe(true);
    expect(loaded.metadata.gridConfig?.excludeCaptions).toBe(true);
    const captionGroup = loaded.groups.find(g => g.id === 'group_caption_1')!;
    expect(captionGroup.excludedFromExport).toBe(true);
  });

  it('rejects legacy v1 archives with clear, graceful error instead of silent rectangular reconstruction', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({
      metadata: {
        version: '1.1',
        schemaVersion: 1,
        sourceSha256: 'dummy',
        imageDimensions: { width: 10, height: 10 }
      },
      components: [
        { id: 'c1', label: 1, bounds: { x: 0, y: 0, width: 5, height: 5 }, centroid: { x: 2, y: 2 }, pixelCount: 25 }
      ],
      groups: [
        { id: 'g1', componentIds: ['c1'] }
      ]
    }));
    zip.file('source.png', new Uint8Array(100));

    const buffer = await zip.generateAsync({ type: 'uint8array' });
    const blob = new Blob([buffer]);

    await expect(loadProjectArchive(blob)).rejects.toThrow(
      /Legacy v1 project archives lack exact mask and ownership data and cannot be safely restored without workspace damage/
    );
  });

  it('persists and restores BackingOverride with painted addedMask and removedMask typed arrays', async () => {
    const width = 100;
    const height = 100;
    const size = width * height;

    const rgba = new Uint8ClampedArray(size * 4);
    // Fill background with white, alpha 255
    for (let i = 0; i < size; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }

    // Component 1: black artwork square at [30, 30, 40, 40]
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    for (let y = 30; y < 70; y++) {
      for (let x = 30; x < 70; x++) {
        const idx = y * width + x;
        alphaMask[idx] = 255;
        labelMap[idx] = 1;
        // Make artwork black
        rgba[idx * 4] = 20;
        rgba[idx * 4 + 1] = 20;
        rgba[idx * 4 + 2] = 20;
      }
    }

    const sourceImage = {
      data: rgba,
      width,
      height,
      colorSpace: 'srgb' as PredefinedColorSpace
    } as ImageData;

    const components: ArtworkComponent[] = [
      {
        id: 'comp_1',
        label: 1,
        pixelCount: 1600,
        bounds: { x: 30, y: 30, width: 40, height: 40 },
        centroid: { x: 50, y: 50 },
        isTiny: false
      }
    ];

    const compMap = new Map<string, ArtworkComponent>();
    compMap.set('comp_1', components[0]);

    // Padding = 10 -> localWidth = 40 + 20 = 60, localHeight = 60
    // patchBounds = { x: 20, y: 20, width: 60, height: 60 }
    // localSize = 3600
    const padding = 10;
    const localW = 60;
    const localH = 60;
    const localSize = localW * localH;
    const patchBounds = { x: 20, y: 20, width: localW, height: localH };

    // Baseline group WITHOUT painted backing overrides
    const baseGroup: StickerGroup = {
      id: 'group_test',
      name: 'sticker_test',
      componentIds: ['comp_1'],
      bounds: { x: 30, y: 30, width: 40, height: 40 },
      borderThickness: 5,
      customBorder: true,
      whiteBackingEnabled: true,
      connectBacking: false,
      solidBacking: false,
      bridges: [],
      excludedFromExport: false
    };

    const baseDf = buildGroupDistanceField(baseGroup, compMap, labelMap, width, height, padding);
    const baseExport = compositeSticker(
      baseGroup,
      compMap,
      labelMap,
      alphaMask,
      rgba,
      width,
      height,
      baseDf.distField,
      baseDf.patchBounds,
      baseGroup.borderThickness,
      0
    );

    // Create painted masks:
    // 1. addedMask: visibly adds white backing outside the base silhouette (at local x: 0..8, y: 0..8)
    const addedMask = new Uint8Array(localSize);
    for (let ly = 0; ly < 8; ly++) {
      for (let lx = 0; lx < 8; lx++) {
        addedMask[ly * localW + lx] = 1;
      }
    }

    // 2. removedMask: visibly removes white backing from a region inside the silhouette (at local x: 25..35, y: 25..35)
    const removedMask = new Uint8Array(localSize);
    for (let ly = 25; ly < 35; ly++) {
      for (let lx = 25; lx < 35; lx++) {
        removedMask[ly * localW + lx] = 1;
      }
    }

    const groupWithOverrides: StickerGroup = {
      ...baseGroup,
      backingOverride: {
        groupId: 'group_test',
        bounds: patchBounds,
        addedMask,
        removedMask,
        smoothingRadius: 2
      }
    };

    const preSaveDf = buildGroupDistanceField(groupWithOverrides, compMap, labelMap, width, height, padding);
    const preSaveExport = compositeSticker(
      groupWithOverrides,
      compMap,
      labelMap,
      alphaMask,
      rgba,
      width,
      height,
      preSaveDf.distField,
      preSaveDf.patchBounds,
      groupWithOverrides.borderThickness,
      0
    );

    // Verify preSaveExport is visibly DIFFERENT from baseExport:
    // In added region (e.g. lx: 2, ly: 2): preSaveExport has white backing (alpha 255)
    expect(preSaveExport.croppedRgba).not.toEqual(baseExport.croppedRgba);

    // Save project
    const saveState: ProjectSaveState = {
      name: 'backing_override_test',
      sourceImage,
      alphaMask,
      labelMap,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 10,
        groupingProximityThreshold: 35,
        enableTitleDetection: false
      },
      components,
      groups: [groupWithOverrides],
      holes: [],
      globalBorderThickness: 5,
      globalSolidBacking: true,
      globalWhiteBacking: true
    };

    const archiveBlob = await saveProjectArchive(saveState);
    const loaded = await loadProjectArchive(archiveBlob);

    const loadedGroup = loaded.groups.find(g => g.id === 'group_test')!;
    expect(loadedGroup).toBeDefined();
    expect(loadedGroup.backingOverride).toBeDefined();

    // 1. Verify actual Uint8Array types and values
    expect(loadedGroup.backingOverride?.addedMask).toBeInstanceOf(Uint8Array);
    expect(loadedGroup.backingOverride?.removedMask).toBeInstanceOf(Uint8Array);
    expect(loadedGroup.backingOverride?.addedMask).toEqual(addedMask);
    expect(loadedGroup.backingOverride?.removedMask).toEqual(removedMask);

    // 2. Verify mask dimensions and coordinate bounds
    expect(loadedGroup.backingOverride?.bounds).toEqual(patchBounds);

    // 3. Verify unchanged artwork alpha and ownership
    expect(loaded.alphaMask).toEqual(alphaMask);
    expect(loaded.labelMap).toEqual(labelMap);

    // 4. Verify identical rendered backing distance field
    const loadedCompMap = new Map<string, ArtworkComponent>();
    for (const c of loaded.components) loadedCompMap.set(c.id, c);

    const postLoadDf = buildGroupDistanceField(loadedGroup, loadedCompMap, loaded.labelMap, width, height, padding);
    expect(postLoadDf.distField).toEqual(preSaveDf.distField);

    // 5. Verify identical decoded white-backed export pixels
    const postLoadExport = compositeSticker(
      loadedGroup,
      loadedCompMap,
      loaded.labelMap,
      loaded.alphaMask,
      loaded.sourceImage.data,
      width,
      height,
      postLoadDf.distField,
      postLoadDf.patchBounds,
      loadedGroup.borderThickness,
      0
    );

    expect(postLoadExport.croppedRgba).toEqual(preSaveExport.croppedRgba);
    expect(postLoadExport.croppedRgba).not.toEqual(baseExport.croppedRgba);
  });

  it('rejects candidate project when individually acceptable backing masks together exceed cumulative budget, keeping active workspace intact', async () => {
    const width = 20;
    const height = 20;
    const pixelCount = width * height;

    const sourceData = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount * 4; i += 4) {
      sourceData[i] = 100;
      sourceData[i + 1] = 150;
      sourceData[i + 2] = 200;
      sourceData[i + 3] = 255;
    }
    const sourceImage = {
      width,
      height,
      data: sourceData,
      colorSpace: 'srgb'
    } as unknown as ImageData;

    const alphaMask = new Uint8Array(pixelCount).fill(255);
    const labelMap = new Uint16Array(pixelCount).fill(1);

    const components: ArtworkComponent[] = [
      {
        id: 'c1',
        label: 1,
        bounds: { x: 0, y: 0, width: 10, height: 20 },
        centroid: { x: 5, y: 10 },
        pixelCount: 200,
        isTiny: false
      },
      {
        id: 'c2',
        label: 2,
        bounds: { x: 10, y: 0, width: 10, height: 20 },
        centroid: { x: 15, y: 10 },
        pixelCount: 200,
        isTiny: false
      }
    ];

    // Each mask is 100 bytes (10x10) - well below MAX_PER_ENTRY_BYTES (150MB)
    const mask1 = new Uint8Array(100).fill(1);
    const mask2 = new Uint8Array(100).fill(1);

    const groups: StickerGroup[] = [
      {
        id: 'g1',
        name: 'sticker_001',
        componentIds: ['c1'],
        bounds: { x: 0, y: 0, width: 10, height: 20 },
        borderThickness: 5,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        smoothingRadius: 2,
        backingOverride: {
          groupId: 'g1',
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          addedMask: mask1
        }
      },
      {
        id: 'g2',
        name: 'sticker_002',
        componentIds: ['c2'],
        bounds: { x: 10, y: 0, width: 10, height: 20 },
        borderThickness: 5,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        smoothingRadius: 2,
        backingOverride: {
          groupId: 'g2',
          bounds: { x: 10, y: 0, width: 10, height: 10 },
          addedMask: mask2
        }
      }
    ];

    const saveState: ProjectSaveState = {
      name: 'cumulative_budget_test',
      sourceImage,
      alphaMask,
      labelMap,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 10,
        groupingProximityThreshold: 35,
        enableTitleDetection: false
      },
      components,
      groups,
      holes: [],
      globalBorderThickness: 5,
      globalSolidBacking: true,
      globalWhiteBacking: true
    };

    const archiveBlob = await saveProjectArchive(saveState);

    // Normal load without artificial budget constraint succeeds
    const okLoaded = await loadProjectArchive(archiveBlob);
    expect(okLoaded.groups.length).toBe(2);

    // Measure base uncompressed bytes (project.json + alpha + label + source):
    // Setting cumulative limit so that base + first backing mask fits, but second backing mask exceeds it
    // Each mask is individually acceptable (100 bytes < maxPerEntryBytes), but together with base they exceed budget
    const tightBudget = 2500; // base is ~2450 bytes; mask 1 brings to ~2550, exceeding 2500

    let activeWorkspace = {
      name: 'Original Active Workspace',
      groupsCount: 99,
      intact: true
    };

    let thrownError: Error | null = null;
    try {
      const candidate = await loadProjectArchive(archiveBlob, {
        maxUncompressedTotalBytes: tightBudget,
        maxPerEntryBytes: 150 * 1024 * 1024
      });
      activeWorkspace = {
        name: candidate.metadata.name,
        groupsCount: candidate.groups.length,
        intact: false
      };
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toMatch(/Cumulative decompression budget exceeded/);

    // Assert active workspace was NOT mutated or replaced
    expect(activeWorkspace.name).toBe('Original Active Workspace');
    expect(activeWorkspace.groupsCount).toBe(99);
    expect(activeWorkspace.intact).toBe(true);
  });
});


