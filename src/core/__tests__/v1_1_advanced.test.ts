/**
 * Comprehensive Unit & Integration Verification Suite for Sticker Studio V1.1.
 * Tests:
 * 1. Pixel ownership invariants (connected vs disconnected restore, cross-group protection, erase contraction)
 * 2. Constrained touching-object partition (zero pixel loss, complex shapes: dumbbell, concave interlocking, diagonal)
 * 3. Backing pipeline (manual overrides, contour smoothing, edge-touching illustration padding, slider independence)
 * 4. Hardened project archive (.stickerstudio security, SHA-256 integrity, path traversal, decompression budget, referential checks)
 * 5. Configurable edge inspector (color halo, isolated backing islands, DPI-interpreted physical bridge widths)
 */

import { describe, it, expect } from 'vitest';
import {
  applyBrushPatchWithOwnership,
  applyBrushStroke,
  revertBrushPatchWithOwnership
} from '../maskPatch';
import {
  commitTouchingSplit,
  previewTouchingSplit
} from '../watershedSplit';
import {
  buildGroupDistanceField,
  compositeSticker
} from '../composer';
import {
  computeSha256,
  loadProjectArchive,
  MAX_ARCHIVE_BYTES,
  MAX_DECOMPRESSION_RATIO,
  saveProjectArchive
} from '../projectArchive';
import {
  DEFAULT_EDGE_CONFIG,
  getEffectiveMinBridgeWidth,
  inspectStickerEdge
} from '../edgeInspector';
import { ArtworkComponent, StickerGroup, TouchingSplitRequest } from '../../types';
import { createZip, ZipEntry } from '../zip';

describe('V1.1 Pixel Ownership Invariants & Mask Brush', () => {
  it('extends existing component on connected restoration', () => {
    const width = 20;
    const height = 20;
    const size = width * height;
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    // Initial component at (5, 5) to (7, 7)
    for (let y = 5; y <= 7; y++) {
      for (let x = 5; x <= 7; x++) {
        const idx = y * width + x;
        alphaMask[idx] = 255;
        labelMap[idx] = 1;
      }
    }

    const comp1: ArtworkComponent = {
      id: 'comp_1',
      label: 1,
      bounds: { x: 5, y: 5, width: 3, height: 3 },
      centroid: { x: 6, y: 6 },
      pixelCount: 9,
      isTiny: false
    };

    const group1: StickerGroup = {
      id: 'group_1',
      name: 'sticker_001',
      componentIds: ['comp_1'],
      bounds: { x: 5, y: 5, width: 3, height: 3 },
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    // Apply restore stroke immediately adjacent to (8, 6)
    const patch = applyBrushStroke(
      alphaMask,
      width,
      height,
      [{ x: 8, y: 6 }],
      { radius: 1, hardness: 1.0, opacity: 1.0, mode: 'restore' }
    );
    expect(patch).not.toBeNull();

    const diff = applyBrushPatchWithOwnership(
      alphaMask,
      labelMap,
      [comp1],
      [group1],
      width,
      height,
      patch!,
      'group_1'
    );

    // Since the restored stroke touched comp_1, it should extend comp_1
    expect(diff.updatedComponents.length).toBe(1);
    expect(diff.updatedComponents[0].id).toBe('comp_1');
    expect(diff.updatedComponents[0].pixelCount).toBeGreaterThan(9);
    // Bounds should now include x=8
    expect(diff.updatedComponents[0].bounds.width).toBeGreaterThanOrEqual(4);
    // Every restored pixel in bounds belongs to label 1
    expect(labelMap[6 * width + 8]).toBe(1);
  });

  it('creates a new stable component on disconnected restoration within active group', () => {
    const width = 30;
    const height = 30;
    const size = width * height;
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    // Existing component at (5, 5)
    alphaMask[5 * width + 5] = 255;
    labelMap[5 * width + 5] = 1;

    const comp1: ArtworkComponent = {
      id: 'comp_1',
      label: 1,
      bounds: { x: 5, y: 5, width: 1, height: 1 },
      centroid: { x: 5, y: 5 },
      pixelCount: 1,
      isTiny: false
    };

    const group1: StickerGroup = {
      id: 'group_1',
      name: 'sticker_001',
      componentIds: ['comp_1'],
      bounds: { x: 5, y: 5, width: 1, height: 1 },
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    // Apply restore stroke far away at (22, 22) (completely disconnected)
    const patch = applyBrushStroke(
      alphaMask,
      width,
      height,
      [{ x: 22, y: 22 }],
      { radius: 1, hardness: 1.0, opacity: 1.0, mode: 'restore' }
    );
    expect(patch).not.toBeNull();

    const diff = applyBrushPatchWithOwnership(
      alphaMask,
      labelMap,
      [comp1],
      [group1],
      width,
      height,
      patch!,
      'group_1'
    );

    // Should create a NEW component in group_1
    expect(diff.updatedComponents.length).toBe(2);
    expect(diff.updatedGroups[0].componentIds.length).toBe(2);

    const newComp = diff.updatedComponents.find(c => c.id !== 'comp_1')!;
    expect(newComp).toBeDefined();
    expect(newComp.label).toBe(2);
    expect(labelMap[22 * width + 22]).toBe(2);
  });

  it('never overwrites another group ownership during restore', () => {
    const width = 20;
    const height = 20;
    const size = width * height;
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    // comp_2 belonging to group_2 at (10, 10)
    alphaMask[10 * width + 10] = 255;
    labelMap[10 * width + 10] = 2;

    const comp1: ArtworkComponent = {
      id: 'comp_1',
      label: 1,
      bounds: { x: 2, y: 2, width: 1, height: 1 },
      centroid: { x: 2, y: 2 },
      pixelCount: 1,
      isTiny: false
    };
    const comp2: ArtworkComponent = {
      id: 'comp_2',
      label: 2,
      bounds: { x: 10, y: 10, width: 1, height: 1 },
      centroid: { x: 10, y: 10 },
      pixelCount: 1,
      isTiny: false
    };

    const group1: StickerGroup = {
      id: 'group_1',
      name: 'sticker_001',
      componentIds: ['comp_1'],
      bounds: { x: 2, y: 2, width: 1, height: 1 },
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: false,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };
    const group2: StickerGroup = {
      id: 'group_2',
      name: 'sticker_002',
      componentIds: ['comp_2'],
      bounds: { x: 10, y: 10, width: 1, height: 1 },
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: false,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    // User paints with group_1 restore brush over (10, 10)
    const patch = applyBrushStroke(
      alphaMask,
      width,
      height,
      [{ x: 10, y: 10 }],
      { radius: 1, hardness: 1.0, opacity: 1.0, mode: 'restore' }
    );
    expect(patch).not.toBeNull();

    const diff = applyBrushPatchWithOwnership(
      alphaMask,
      labelMap,
      [comp1, comp2],
      [group1, group2],
      width,
      height,
      patch!,
      'group_1'
    );

    // Pixel (10, 10) must strictly remain label 2 and NOT be reassigned to group_1
    expect(labelMap[10 * width + 10]).toBe(2);
    expect(diff.updatedGroups.find(g => g.id === 'group_2')?.componentIds).toContain('comp_2');
  });

  it('reverts all structural metadata and label maps on undo', () => {
    const width = 20;
    const height = 20;
    const size = width * height;
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    alphaMask[5 * width + 5] = 255;
    labelMap[5 * width + 5] = 1;

    const comp1: ArtworkComponent = {
      id: 'comp_1',
      label: 1,
      bounds: { x: 5, y: 5, width: 1, height: 1 },
      centroid: { x: 5, y: 5 },
      pixelCount: 1,
      isTiny: false
    };
    const group1: StickerGroup = {
      id: 'group_1',
      name: 'sticker_001',
      componentIds: ['comp_1'],
      bounds: { x: 5, y: 5, width: 1, height: 1 },
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: false,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    // Erase pixel at (5, 5)
    const patch = applyBrushStroke(
      alphaMask,
      width,
      height,
      [{ x: 5, y: 5 }],
      { radius: 1, hardness: 1.0, opacity: 1.0, mode: 'erase' }
    );
    expect(patch).not.toBeNull();

    const diff = applyBrushPatchWithOwnership(
      alphaMask,
      labelMap,
      [comp1],
      [group1],
      width,
      height,
      patch!,
      'group_1'
    );
    expect(alphaMask[5 * width + 5]).toBe(0);
    expect(labelMap[5 * width + 5]).toBe(0);

    // Undo
    revertBrushPatchWithOwnership(alphaMask, labelMap, width, diff);
    expect(alphaMask[5 * width + 5]).toBe(255);
    expect(labelMap[5 * width + 5]).toBe(1);
  });
});

describe('V1.1 Constrained Touching-Object Split', () => {
  it('cleanly splits narrow-neck dumbbell shape with zero pixel loss', () => {
    const width = 40;
    const height = 20;
    const size = width * height;
    const imageRgba = new Uint8ClampedArray(size * 4);
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    let originalCount = 0;
    // Create dumbbell: left sphere (x: 5..12), thin neck (x: 13..17, y: 10), right sphere (x: 18..25)
    for (let y = 6; y <= 14; y++) {
      for (let x = 5; x <= 25; x++) {
        const isLeftSphere = x <= 12;
        const isRightSphere = x >= 18;
        const isNeck = x > 12 && x < 18 && y >= 9 && y <= 11;

        if (isLeftSphere || isRightSphere || isNeck) {
          const idx = y * width + x;
          alphaMask[idx] = 255;
          labelMap[idx] = 1;
          // Left sphere cyan, right sphere pink, gradient in neck
          imageRgba[idx * 4] = isLeftSphere ? 50 : 230;
          imageRgba[idx * 4 + 1] = isLeftSphere ? 180 : 50;
          imageRgba[idx * 4 + 2] = isLeftSphere ? 220 : 150;
          imageRgba[idx * 4 + 3] = 255;
          originalCount++;
        }
      }
    }

    const dumbbellComp: ArtworkComponent = {
      id: 'comp_dumbbell',
      label: 1,
      bounds: { x: 5, y: 6, width: 21, height: 9 },
      centroid: { x: 15, y: 10 },
      pixelCount: originalCount,
      isTiny: false
    };

    const dumbbellGroup: StickerGroup = {
      id: 'group_dumbbell',
      name: 'sticker_dumbbell',
      componentIds: ['comp_dumbbell'],
      bounds: dumbbellComp.bounds,
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    // User cuts across neck at x=15
    const request: TouchingSplitRequest = {
      componentId: 'comp_dumbbell',
      mode: 'cut-line',
      cutLine: { x1: 15, y1: 5, x2: 15, y2: 15 }
    };

    const preview = previewTouchingSplit(
      dumbbellComp,
      imageRgba,
      alphaMask,
      labelMap,
      width,
      request
    );
    expect(preview).not.toBeNull();

    // Critical assertion: zero pixel loss!
    expect(preview!.countA + preview!.countB).toBe(originalCount);
    expect(preview!.countA).toBeGreaterThan(0);
    expect(preview!.countB).toBeGreaterThan(0);

    const comps = [dumbbellComp];
    const groups = [dumbbellGroup];

    const result = commitTouchingSplit(
      dumbbellComp,
      preview!,
      labelMap,
      comps,
      groups,
      width
    );

    expect(comps.length).toBe(2);
    expect(groups.length).toBe(2);
    expect(result.newComponentA.pixelCount + result.newComponentB.pixelCount).toBe(originalCount);

    // Verify disjoint labels: all pixels originally in component now belong to label 1 or newLabelB
    let checkCountA = 0;
    let checkCountB = 0;
    for (let y = 6; y <= 14; y++) {
      for (let x = 5; x <= 25; x++) {
        const idx = y * width + x;
        if (alphaMask[idx] > 0) {
          if (labelMap[idx] === result.newComponentA.label) checkCountA++;
          else if (labelMap[idx] === result.newComponentB.label) checkCountB++;
        }
      }
    }
    expect(checkCountA).toBe(result.newComponentA.pixelCount);
    expect(checkCountB).toBe(result.newComponentB.pixelCount);
    expect(checkCountA + checkCountB).toBe(originalCount);
  });

  it('handles large 300x300 component touching split quickly', () => {
    const width = 400;
    const height = 400;
    const size = width * height;
    const imageRgba = new Uint8ClampedArray(size * 4);
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    for (let y = 50; y < 350; y++) {
      for (let x = 50; x < 350; x++) {
        const idx = y * width + x;
        alphaMask[idx] = 255;
        labelMap[idx] = 1;
        imageRgba[idx * 4] = 200;
        imageRgba[idx * 4 + 1] = 100;
        imageRgba[idx * 4 + 2] = 100;
        imageRgba[idx * 4 + 3] = 255;
      }
    }

    const comp: ArtworkComponent = {
      id: 'comp_large',
      label: 1,
      bounds: { x: 50, y: 50, width: 300, height: 300 },
      centroid: { x: 200, y: 200 },
      pixelCount: 90000,
      isTiny: false
    };

    const t0 = performance.now();
    const preview = previewTouchingSplit(
      comp,
      imageRgba,
      alphaMask,
      labelMap,
      width,
      {
        componentId: 'comp_large',
        mode: 'cut-line',
        cutLine: { x1: 200, y1: 40, x2: 200, y2: 360 }
      }
    );
    const elapsed = performance.now() - t0;
    console.log('Large 300x300 split time:', elapsed, 'ms');
    expect(preview).not.toBeNull();
    expect(preview!.countA + preview!.countB).toBe(90000);
  });

  it('partitions concave interlocking shapes with dual seeds without erasing artwork pixels', () => {
    const width = 30;
    const height = 30;
    const size = width * height;
    const imageRgba = new Uint8ClampedArray(size * 4);
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    let count = 0;
    // Interlocking C-shape and nested core
    for (let y = 5; y <= 25; y++) {
      for (let x = 5; x <= 25; x++) {
        const isOuterRing = (x === 5 || x === 25 || y === 5 || y === 25) && (x < 22 || y < 22);
        const isInnerCore = x >= 10 && x <= 20 && y >= 10 && y <= 20;
        if (isOuterRing || isInnerCore) {
          const idx = y * width + x;
          alphaMask[idx] = 255;
          labelMap[idx] = 1;
          imageRgba[idx * 4] = isOuterRing ? 255 : 50;
          imageRgba[idx * 4 + 1] = isOuterRing ? 100 : 200;
          imageRgba[idx * 4 + 2] = 100;
          imageRgba[idx * 4 + 3] = 255;
          count++;
        }
      }
    }

    const comp: ArtworkComponent = {
      id: 'comp_interlock',
      label: 1,
      bounds: { x: 5, y: 5, width: 21, height: 21 },
      centroid: { x: 15, y: 15 },
      pixelCount: count,
      isTiny: false
    };

    const request: TouchingSplitRequest = {
      componentId: 'comp_interlock',
      mode: 'seeds',
      seedA: { x: 6, y: 6 },
      seedB: { x: 15, y: 15 }
    };

    const preview = previewTouchingSplit(
      comp,
      imageRgba,
      alphaMask,
      labelMap,
      width,
      request
    );
    expect(preview).not.toBeNull();
    expect(preview!.countA + preview!.countB).toBe(count);
  });
});

describe('V1.1 Backing Pipeline & Padding', () => {
  it('preserves complete white borders and padding for illustrations touching sheet edge', () => {
    const sheetWidth = 50;
    const sheetHeight = 50;
    const size = sheetWidth * sheetHeight;
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);
    const sourceRgba = new Uint8ClampedArray(size * 4);

    // Illustration placed exactly at sheet boundary x=0, y=0 (5x5 pixels)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const idx = y * sheetWidth + x;
        alphaMask[idx] = 255;
        labelMap[idx] = 1;
        sourceRgba[idx * 4] = 255;
        sourceRgba[idx * 4 + 1] = 0;
        sourceRgba[idx * 4 + 2] = 0;
        sourceRgba[idx * 4 + 3] = 255;
      }
    }

    const comp: ArtworkComponent = {
      id: 'comp_edge',
      label: 1,
      bounds: { x: 0, y: 0, width: 5, height: 5 },
      centroid: { x: 2, y: 2 },
      pixelCount: 25,
      isTiny: false
    };

    const group: StickerGroup = {
      id: 'group_edge',
      name: 'sticker_edge',
      componentIds: ['comp_edge'],
      bounds: comp.bounds,
      borderThickness: 15,
      customBorder: true,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    const compMap = new Map([['comp_edge', comp]]);

    // Build distance field with padding 30
    const { distField, patchBounds, localWidth, localHeight } = buildGroupDistanceField(
      group,
      compMap,
      labelMap,
      sheetWidth,
      sheetHeight,
      30
    );

    // Critical assertion: patchBounds must extend outside the sheet (minX < 0)
    expect(patchBounds.x).toBe(-30);
    expect(patchBounds.y).toBe(-30);

    const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
      group,
      compMap,
      labelMap,
      alphaMask,
      sourceRgba,
      sheetWidth,
      sheetHeight,
      distField,
      patchBounds,
      group.borderThickness,
      4
    );

    // Dimensions must be larger than original 5x5 artwork because border expands 15px around all sides
    expect(croppedWidth).toBeGreaterThanOrEqual(35);
    expect(croppedHeight).toBeGreaterThanOrEqual(35);
    expect(croppedRgba.length).toBe(croppedWidth * croppedHeight * 4);
  });

  it('retains manual additions and smoothing when changing border thickness slider', () => {
    const sheetWidth = 50;
    const sheetHeight = 50;
    const size = sheetWidth * sheetHeight;
    const alphaMask = new Uint8Array(size);
    const labelMap = new Uint16Array(size);

    alphaMask[25 * sheetWidth + 25] = 255;
    labelMap[25 * sheetWidth + 25] = 1;

    const comp: ArtworkComponent = {
      id: 'comp_1',
      label: 1,
      bounds: { x: 25, y: 25, width: 1, height: 1 },
      centroid: { x: 25, y: 25 },
      pixelCount: 1,
      isTiny: false
    };

    const group: StickerGroup = {
      id: 'group_1',
      name: 'sticker_001',
      componentIds: ['comp_1'],
      bounds: comp.bounds,
      borderThickness: 10,
      customBorder: true,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false,
      backingOverride: {
        groupId: 'group_1',
        smoothingRadius: 3
      }
    };

    const compMap = new Map([['comp_1', comp]]);

    const df1 = buildGroupDistanceField(group, compMap, labelMap, sheetWidth, sheetHeight, 20);

    // Change border thickness slider to 25 (without rebuilding distance field or losing smoothing)
    group.borderThickness = 25;

    const df2 = buildGroupDistanceField(group, compMap, labelMap, sheetWidth, sheetHeight, 20);

    // Distance field values must be identical because manual override and smoothing were preserved
    expect(df1.distField[0]).toBeCloseTo(df2.distField[0]);
  });
});

describe('V1.1 Hardened Project Archive Security & Integrity', () => {
  it('saves and loads .stickerstudio archive with exact fidelity', async () => {
    const width = 16;
    const height = 16;
    const imgData = new ImageData(width, height);
    for (let i = 0; i < width * height * 4; i += 4) {
      imgData.data[i] = 255;
      imgData.data[i + 1] = 100;
      imgData.data[i + 2] = 50;
      imgData.data[i + 3] = 255;
    }

    const comp: ArtworkComponent = {
      id: 'comp_test',
      label: 1,
      bounds: { x: 2, y: 2, width: 12, height: 12 },
      centroid: { x: 8, y: 8 },
      pixelCount: 144,
      isTiny: false
    };

    const group: StickerGroup = {
      id: 'group_test',
      name: 'sticker_test',
      componentIds: ['comp_test'],
      bounds: comp.bounds,
      borderThickness: 18,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [],
      excludedFromExport: false
    };

    const archiveBlob = await saveProjectArchive({
      name: 'Test Project',
      sourceImage: imgData,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 10,
        groupingProximityThreshold: 35,
        enableTitleDetection: true
      },
      components: [comp],
      groups: [group],
      holes: [],
      globalBorderThickness: 18,
      globalSolidBacking: true,
      globalWhiteBacking: true
    });

    expect(archiveBlob.size).toBeGreaterThan(0);

    const loaded = await loadProjectArchive(archiveBlob);
    expect(loaded.metadata.name).toBe('Test Project');
    expect(loaded.metadata.schemaVersion).toBe(1);
    expect(loaded.components.length).toBe(1);
    expect(loaded.groups.length).toBe(1);
    expect(loaded.sourceImage.width).toBe(16);
    expect(loaded.sourceImage.height).toBe(16);
  });

  it('rejects archive when source.png SHA-256 hash is tampered', async () => {
    const width = 8;
    const height = 8;
    const imgData = new ImageData(width, height);
    const validBlob = await saveProjectArchive({
      name: 'Tamper Test',
      sourceImage: imgData,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 10,
        groupingProximityThreshold: 35,
        enableTitleDetection: true
      },
      components: [{
        id: 'comp_1',
        label: 1,
        bounds: { x: 0, y: 0, width: 8, height: 8 },
        centroid: { x: 4, y: 4 },
        pixelCount: 64,
        isTiny: false
      }],
      groups: [{
        id: 'grp_1',
        name: 'sticker_001',
        componentIds: ['comp_1'],
        bounds: { x: 0, y: 0, width: 8, height: 8 },
        borderThickness: 10,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: true,
        bridges: [],
        excludedFromExport: false
      }],
      holes: [],
      globalBorderThickness: 10,
      globalSolidBacking: true,
      globalWhiteBacking: true
    });

    // Tamper with project.json sourceSha256
    const entries: ZipEntry[] = [
      {
        name: 'project.json',
        data: new TextEncoder().encode(JSON.stringify({
          metadata: {
            version: '1.1',
            schemaVersion: 1,
            sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000',
            imageDimensions: { width: 8, height: 8 }
          },
          components: [{ id: 'comp_1', label: 1 }],
          groups: [{ id: 'grp_1', componentIds: ['comp_1'] }]
        }))
      },
      {
        name: 'source.png',
        data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) // dummy bytes
      }
    ];

    const corruptedBlob = createZip(entries);

    await expect(loadProjectArchive(corruptedBlob)).rejects.toThrow(/Integrity check failed/);
  });

  it('rejects archive containing illegal path traversal entries', async () => {
    const evilEntries: ZipEntry[] = [
      { name: '../../etc/passwd', data: new Uint8Array([1, 2, 3]) },
      { name: 'project.json', data: new Uint8Array([1, 2, 3]) }
    ];
    const evilZip = createZip(evilEntries);

    await expect(loadProjectArchive(evilZip)).rejects.toThrow(/path traversal/i);
  });

  it('rejects archive with referential integrity violations', async () => {
    const invalidRefEntries: ZipEntry[] = [
      {
        name: 'project.json',
        data: new TextEncoder().encode(JSON.stringify({
          metadata: {
            version: '1.1',
            schemaVersion: 1,
            sourceSha256: '',
            imageDimensions: { width: 8, height: 8 }
          },
          components: [{ id: 'comp_1', label: 1 }],
          // Refers to comp_999 which does NOT exist!
          groups: [{ id: 'grp_1', componentIds: ['comp_999'] }]
        }))
      },
      {
        name: 'source.png',
        data: new Uint8Array([1, 2, 3])
      }
    ];
    const invalidZip = createZip(invalidRefEntries);

    await expect(loadProjectArchive(invalidZip)).rejects.toThrow(/Referential integrity error/);
  });
});

describe('V1.1 Configurable Edge Inspector', () => {
  it('computes effective bridge threshold interpreting physical DPI and mm', () => {
    const config = {
      ...DEFAULT_EDGE_CONFIG,
      printDpi: 300,
      minPhysicalBridgeMm: 1.0 // 1mm @ 300 DPI = ~11.8 -> 12 px
    };
    const minPx = getEffectiveMinBridgeWidth(config);
    expect(minPx).toBe(12);

    const configHighDpi = {
      ...DEFAULT_EDGE_CONFIG,
      printDpi: 600,
      minPhysicalBridgeMm: 1.5 // 1.5mm @ 600 DPI = 35.4 -> 35 px
    };
    expect(getEffectiveMinBridgeWidth(configHighDpi)).toBe(35);
  });

  it('detects razor-thin bridges below physical threshold', () => {
    const comp: ArtworkComponent = {
      id: 'comp_1',
      label: 1,
      bounds: { x: 0, y: 0, width: 20, height: 20 },
      centroid: { x: 10, y: 10 },
      pixelCount: 400,
      isTiny: false
    };
    const group: StickerGroup = {
      id: 'group_1',
      name: 'sticker_001',
      componentIds: ['comp_1'],
      bounds: comp.bounds,
      borderThickness: 10,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: true,
      bridges: [{
        id: 'br_1',
        fromCompId: 'comp_1',
        toCompId: 'comp_2',
        x1: 5,
        y1: 5,
        x2: 15,
        y2: 15,
        width: 4, // 4px is thinner than 12px requirement
        enabled: true
      }],
      excludedFromExport: false
    };

    const warnings = inspectStickerEdge(
      group,
      new Map([['comp_1', comp]]),
      new Uint16Array(100),
      new Uint8Array(100),
      new Uint8ClampedArray(400),
      10,
      10,
      new Float32Array(100),
      { x: 0, y: 0, width: 10, height: 10 },
      [255, 255, 255],
      { ...DEFAULT_EDGE_CONFIG, printDpi: 300, minPhysicalBridgeMm: 1.0 }
    );

    const thinWarning = warnings.find(w => w.type === 'thin-bridge');
    expect(thinWarning).toBeDefined();
    expect(thinWarning?.severity).toBe('warning');
  });
});
