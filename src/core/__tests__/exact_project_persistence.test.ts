import { describe, it, expect } from 'vitest';
import { saveProjectArchive, loadProjectArchive, ProjectSaveState } from '../projectArchive';
import { ArtworkComponent, StickerGroup, ExtractionSettings, GridSheetConfig } from '../../types';

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
});

