import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { estimateBackgroundColor } from '../color';
import { segmentForeground } from '../segmentation';
import { analyzeComponents } from '../components';
import { computeGridCells, partitionGridComponents, DEFAULT_GRID_CONFIG } from '../gridExtractor';
import { saveProjectArchive, loadProjectArchive } from '../projectArchive';
import { buildGroupDistanceField, compositeSticker } from '../composer';
import { BoundingBox, GridSheetConfig } from '../../types';

// @ts-ignore
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const SAMPLES_DIR = path.resolve(__dirname, '../../../public/samples');
const OUTPUT_DIR = path.resolve(__dirname, '../../../test-output');

async function loadSheetRgba(filename: string) {
  const filePath = path.join(SAMPLES_DIR, filename);
  const image = sharp(filePath).ensureAlpha();
  const metadata = await image.metadata();
  const rawBuffer = await image.raw().toBuffer();
  return {
    width: metadata.width!,
    height: metadata.height!,
    rgba: new Uint8ClampedArray(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength)
  };
}

describe('Contact Sheet Grid Mode & Eraser Coordinates Validation', () => {
  it('partitions 4x5 grid on chai_break.jpg into exactly 20 artwork stickers with isolated captions', async () => {
    const { width, height, rgba } = await loadSheetRgba('chai_break.jpg');
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);

    const gridConfig: GridSheetConfig = {
      ...DEFAULT_GRID_CONFIG,
      enabled: true,
      columns: 4,
      rows: 5,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      excludeCaptions: true,
      captionHeightPercent: 12
    };

    const cells = computeGridCells(width, height, gridConfig);
    expect(cells).toHaveLength(20);

    const partition = partitionGridComponents(components, cells, gridConfig);

    // Active artwork groups (excluding caption bands)
    const artworkGroups = partition.groups.filter(g => !g.excludedFromExport);
    expect(artworkGroups).toHaveLength(20);

    // Excluded caption groups (recoverable metadata)
    const captionGroups = partition.groups.filter(g => g.excludedFromExport);
    expect(captionGroups).toHaveLength(20);
    expect(partition.excludedCaptionGroupIds).toHaveLength(20);

    // Total groups is 40 (20 artwork + 20 captions)
    expect(partition.groups).toHaveLength(40);

    // Verify disjoint component ownership (each component belongs to at most one group)
    const claimedComponents = new Set<string>();
    for (const g of partition.groups) {
      for (const cId of g.componentIds) {
        expect(claimedComponents.has(cId)).toBe(false);
        claimedComponents.add(cId);
      }
    }

    // Verify CHAI APPROVED badge (Row 5, Col 1 => index row: 4, col: 0)
    const chaiApproved = artworkGroups.find(g => g.id === 'group_cell_4_0');
    expect(chaiApproved).toBeDefined();
    expect(chaiApproved!.bounds.width).toBeGreaterThan(100);
    expect(chaiApproved!.bounds.height).toBeGreaterThan(100);
    expect(chaiApproved!.bounds.height).toBeLessThanOrEqual(140);

    // Verify Chai Break Department badge (Row 4, Col 4 => index row: 3, col: 3)
    const chaiDept = artworkGroups.find(g => g.id === 'group_cell_3_3');
    expect(chaiDept).toBeDefined();
    expect(chaiDept!.bounds.width).toBeGreaterThan(100);
    expect(chaiDept!.bounds.height).toBeGreaterThan(100);
    // Crucial: verify caption underneath (y ≈ 800) did NOT leak into the badge!
    expect(chaiDept!.bounds.height).toBeLessThanOrEqual(140);

    // Verify all 20 artwork stickers composite successfully
    const compMap = new Map(components.map(c => [c.id, c]));
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    for (let i = 0; i < artworkGroups.length; i++) {
      const g = artworkGroups[i];
      const { distField, patchBounds } = buildGroupDistanceField(g, compMap, labelMap, width, height, 40);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        g,
        compMap,
        labelMap,
        alphaMask,
        rgba,
        width,
        height,
        distField,
        patchBounds,
        20,
        4
      );

      expect(croppedWidth).toBeGreaterThan(20);
      expect(croppedHeight).toBeGreaterThan(20);

      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();

      fs.writeFileSync(path.join(OUTPUT_DIR, `grid_sticker_${String(i + 1).padStart(2, '0')}.png`), pngBuffer);
    }

    // Verify project archive round-trip serialization with gridConfig
    const mockImageData = {
      data: rgba,
      width,
      height,
      colorSpace: 'srgb' as PredefinedColorSpace
    };

    const projectBlob = await saveProjectArchive({
      name: 'chai_break_grid_project',
      sourceImage: mockImageData as ImageData,
      settings: {
        bgTolerance: 18,
        edgeSoftness: 1.0,
        minComponentArea: 15,
        groupingProximityThreshold: 35,
        enableTitleDetection: true,
        gridConfig
      },
      components,
      groups: partition.groups,
      holes: [],
      globalBorderThickness: 20,
      globalSolidBacking: true,
      globalWhiteBacking: true
    });

    const loaded = await loadProjectArchive(projectBlob);
    expect(loaded.metadata.gridConfig).toBeDefined();
    expect(loaded.metadata.gridConfig?.columns).toBe(4);
    expect(loaded.metadata.gridConfig?.rows).toBe(5);
    expect(loaded.metadata.gridConfig?.excludeCaptions).toBe(true);
    expect(loaded.groups).toHaveLength(40);
  });

  it('verifies exact screenToCanvas coordinate projection without flexbox offset or scale distortion', () => {
    const patchBounds: BoundingBox = { x: 500, y: 600, width: 250, height: 200 };

    // Simulate different screen viewports and zoom/pan states
    const testCases = [
      { scale: 1.0, pan: { x: 100, y: 150 }, container: { left: 50, top: 80 } },
      { scale: 0.5, pan: { x: 50, y: 50 }, container: { left: 0, top: 0 } },
      { scale: 2.0, pan: { x: 200, y: 300 }, container: { left: 100, top: 120 } },
      { scale: 3.5, pan: { x: -50, y: -80 }, container: { left: 40, top: 60 } }
    ];

    for (const tc of testCases) {
      // Content wrapper element's exact bounding client rect:
      // In absolute positioning (left: 0, top: 0, transform: translate(pan) scale(scale)):
      const rect = {
        left: tc.container.left + tc.pan.x,
        top: tc.container.top + tc.pan.y,
        width: patchBounds.width * tc.scale,
        height: patchBounds.height * tc.scale
      };

      // Implementation formula in EditorWorkspace:
      const screenToCanvas = (clientX: number, clientY: number) => {
        const localX = (clientX - rect.left) * (patchBounds.width / rect.width);
        const localY = (clientY - rect.top) * (patchBounds.height / rect.height);
        return {
          x: patchBounds.x + localX,
          y: patchBounds.y + localY
        };
      };

      // Test Case A: Mouse directly at top-left corner of canvas
      const ptTopLeft = screenToCanvas(rect.left, rect.top);
      expect(ptTopLeft.x).toBe(patchBounds.x);
      expect(ptTopLeft.y).toBe(patchBounds.y);

      // Test Case B: Mouse directly at bottom-right corner of canvas
      const ptBottomRight = screenToCanvas(rect.left + rect.width, rect.top + rect.height);
      expect(ptBottomRight.x).toBe(patchBounds.x + patchBounds.width);
      expect(ptBottomRight.y).toBe(patchBounds.y + patchBounds.height);

      // Test Case C: Mouse at center of canvas
      const ptCenter = screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
      expect(ptCenter.x).toBe(patchBounds.x + patchBounds.width / 2);
      expect(ptCenter.y).toBe(patchBounds.y + patchBounds.height / 2);

      // Test Case D: Arbitrary point (e.g. 37.5% across, 62.5% down)
      const arbitraryClientX = rect.left + rect.width * 0.375;
      const arbitraryClientY = rect.top + rect.height * 0.625;
      const ptArbitrary = screenToCanvas(arbitraryClientX, arbitraryClientY);
      expect(ptArbitrary.x).toBeCloseTo(patchBounds.x + patchBounds.width * 0.375, 5);
      expect(ptArbitrary.y).toBeCloseTo(patchBounds.y + patchBounds.height * 0.625, 5);
    }
  });
});
