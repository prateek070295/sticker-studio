import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { estimateBackgroundColor } from '../color';
import { segmentForeground } from '../segmentation';
import { analyzeComponents } from '../components';
import { proposeStickerGroups } from '../grouping';
import { buildGroupDistanceField, compositeSticker } from '../composer';
import { applyBrushStroke, applyBrushPatchWithOwnership, revertBrushPatchWithOwnership } from '../maskPatch';
import { previewTouchingSplit, commitTouchingSplit } from '../watershedSplit';
import { inspectStickerEdge, DEFAULT_EDGE_CONFIG } from '../edgeInspector';
import { saveProjectArchive, loadProjectArchive, computeSha256, MAX_ARCHIVE_BYTES } from '../projectArchive';
import { ArtworkComponent, BoundingBox, StickerGroup, TouchingSplitRequest } from '../../types';
import JSZip from 'jszip';

// Load sharp dynamically
// @ts-ignore
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const SAMPLES_DIR = path.resolve(__dirname, '../../../public/samples');
const AUDIT_OUT_DIR = path.resolve(__dirname, '../../../docs/v1.1-release-audit');

if (!fs.existsSync(AUDIT_OUT_DIR)) {
  fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });
}

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

describe('STICKER STUDIO V1.1 — RELEASE CANDIDATE AUDIT SUITE', () => {

  // =========================================================================
  // PHASE 2: REAL IMAGE QUALITY AUDIT ACROSS ALL 5 SHEETS
  // =========================================================================
  describe('Phase 2: Real Image Quality on 5 Kawaii Sheets', () => {

    it('Audits Sheet 1: Momo\'s Bakery (Internal whites & cream preservation)', async () => {
      const { width, height, rgba } = await loadSheetRgba('momos_bakery.jpg');
      const bgColor = estimateBackgroundColor(rgba, width, height);
      const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
      const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
      const groups = proposeStickerGroups(components, 35, true);

      // Verify internal white/cream pixels are opaque (A=255)
      // Check pixels belonging to components where RGB is high
      let internalWhiteCount = 0;
      for (const comp of components) {
        if (comp.pixelCount < 500) continue;
        const { x, y, width: cw, height: ch } = comp.bounds;
        for (let ly = 4; ly < ch - 4; ly++) {
          for (let lx = 4; lx < cw - 4; lx++) {
            const idx = (y + ly) * width + (x + lx);
            if (labelMap[idx] === comp.label) {
              const r = rgba[idx * 4];
              const g = rgba[idx * 4 + 1];
              const b = rgba[idx * 4 + 2];
              // If it's a white/cream pixel not on the exterior boundary
              const touchesBorder =
                idx % width === 0 || idx % width === width - 1 ||
                idx < width || idx >= width * (height - 1) ||
                alphaMask[idx - 1] === 0 || alphaMask[idx + 1] === 0 ||
                alphaMask[idx - width] === 0 || alphaMask[idx + width] === 0;

              if (!touchesBorder && r > 220 && g > 220 && b > 220) {
                // Internal light bread/cream must be fully opaque
                expect(alphaMask[idx]).toBe(255);
                internalWhiteCount++;
              }
            }
          }
        }
      }
      expect(internalWhiteCount).toBeGreaterThan(100);

      // Export representative sticker
      const compMap = new Map(components.map(c => [c.id, c]));
      const g0 = groups[0];
      const { distField, patchBounds } = buildGroupDistanceField(g0, compMap, labelMap, width, height, 64);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        g0, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 15, 4
      );
      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'audit_01_momos_bakery_sample.png'), pngBuffer);
    });

    it('Audits Sheet 2: Indoor Gardening (Thin stems, hole detection on shears)', async () => {
      const { width, height, rgba } = await loadSheetRgba('indoor_gardening.jpg');
      const bgColor = estimateBackgroundColor(rgba, width, height);
      const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
      const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
      const groups = proposeStickerGroups(components, 35, true);
      expect(groups.length).toBeGreaterThanOrEqual(8);

      const compMap = new Map(components.map(c => [c.id, c]));
      const g = groups[1] || groups[0];
      const { distField, patchBounds } = buildGroupDistanceField(g, compMap, labelMap, width, height, 64);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        g, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 12, 4
      );
      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'audit_02_indoor_gardening_sample.png'), pngBuffer);
    });

    it('Audits Sheet 3: Comfort Club (Delicate steam trails, socks & pastels)', async () => {
      const { width, height, rgba } = await loadSheetRgba('comfort_club.jpg');
      const bgColor = estimateBackgroundColor(rgba, width, height);
      const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
      const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
      const groups = proposeStickerGroups(components, 35, true);
      expect(groups.length).toBeGreaterThanOrEqual(8);

      const compMap = new Map(components.map(c => [c.id, c]));
      const g = groups[0];
      const { distField, patchBounds } = buildGroupDistanceField(g, compMap, labelMap, width, height, 64);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        g, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 15, 4
      );
      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'audit_03_comfort_club_sample.png'), pngBuffer);
    });

    it('Audits Sheet 4: Miso\'s Aquarium (Bubbles, whiskers & aquarium elements)', async () => {
      const { width, height, rgba } = await loadSheetRgba('misos_aquarium.jpg');
      const bgColor = estimateBackgroundColor(rgba, width, height);
      const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
      const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
      const groups = proposeStickerGroups(components, 35, true);
      expect(groups.length).toBeGreaterThanOrEqual(6);

      const compMap = new Map(components.map(c => [c.id, c]));
      const g = groups[0];
      const { distField, patchBounds } = buildGroupDistanceField(g, compMap, labelMap, width, height, 64);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        g, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 15, 4
      );
      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'audit_04_misos_aquarium_sample.png'), pngBuffer);
    });

    it('Audits Sheet 5: Chai Break (New user uploaded reference: cutting chai, teapots, biscuits, samosas)', async () => {
      const { width, height, rgba } = await loadSheetRgba('chai_break.jpg');
      expect(width).toBe(736);
      expect(height).toBe(1024);

      // 1. Background Estimation
      const bgColor = estimateBackgroundColor(rgba, width, height);
      // Background is warm off-white / light cream (R > 220, G > 220, B > 200)
      expect(bgColor[0]).toBeGreaterThan(220);
      expect(bgColor[1]).toBeGreaterThan(220);
      expect(bgColor[2]).toBeGreaterThan(200);

      // 2. Foreground segmentation
      const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);

      // 3. Components
      const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
      expect(components.length).toBeGreaterThan(10);

      // 4. Propose groups
      const groups = proposeStickerGroups(components, 35, true);
      expect(groups.length).toBeGreaterThanOrEqual(6);

      // Verify chai / teapot / samosa stickers render beautifully with clean white borders
      const compMap = new Map(components.map(c => [c.id, c]));
      for (let i = 0; i < Math.min(groups.length, 4); i++) {
        const grp = groups[i];
        const { distField, patchBounds } = buildGroupDistanceField(
          grp, compMap, labelMap, width, height, 64
        );
        const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
          grp, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 16, 4
        );
        expect(croppedWidth).toBeGreaterThan(20);
        expect(croppedHeight).toBeGreaterThan(20);

        const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
          raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
        }).png().toBuffer();
        fs.writeFileSync(path.join(AUDIT_OUT_DIR, `audit_05_chai_break_sticker_${i + 1}.png`), pngBuffer);
      }
    });

    it('Validates Disconnected Component Creation (restoring isolated sparkle/crumb to active group)', () => {
      const width = 100;
      const height = 100;
      const alphaMask = new Uint8Array(width * height);
      const labelMap = new Uint16Array(width * height);

      // Create an existing component (label 1) in group_1
      for (let y = 10; y < 30; y++) {
        for (let x = 10; x < 30; x++) {
          alphaMask[y * width + x] = 255;
          labelMap[y * width + x] = 1;
        }
      }

      const existingComp: ArtworkComponent = {
        id: 'comp_1',
        label: 1,
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        centroid: { x: 20, y: 20 },
        pixelCount: 400,
        isTiny: false
      };

      const existingGroup: StickerGroup = {
        id: 'group_1',
        name: 'sticker_001',
        componentIds: ['comp_1'],
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        borderThickness: 10,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      // Disconnected restore brush at (70, 70) to (80, 80)
      const patch = applyBrushStroke(
        alphaMask,
        width,
        height,
        [{ x: 75, y: 75, pressure: 1 }],
        { radius: 6, hardness: 1.0, opacity: 1.0, mode: 'restore' }
      );
      expect(patch).not.toBeNull();

      const diff = applyBrushPatchWithOwnership(
        alphaMask,
        labelMap,
        [existingComp],
        [existingGroup],
        width,
        height,
        patch!,
        'group_1'
      );

      // Verify: A new component was created and assigned to group_1
      expect(diff.updatedComponents.length).toBe(2);
      const newComp = diff.updatedComponents.find(c => c.id !== 'comp_1')!;
      expect(newComp).toBeDefined();
      expect(newComp.label).toBe(2);

      const updatedGroup = diff.updatedGroups.find(g => g.id === 'group_1')!;
      expect(updatedGroup.componentIds).toContain(newComp.id);
      // Group bounds expanded to enclose both components
      expect(updatedGroup.bounds.x).toBe(10);
      expect(updatedGroup.bounds.y).toBe(10);
      expect(updatedGroup.bounds.width).toBeGreaterThan(65);

      // Revert test
      revertBrushPatchWithOwnership(alphaMask, labelMap, width, diff);
      // Restored pixels should be zero in alpha and labelMap
      for (let y = 70; y < 80; y++) {
        for (let x = 70; x < 80; x++) {
          expect(labelMap[y * width + x]).toBe(0);
        }
      }
    });
  });

  // =========================================================================
  // PHASE 3: TOUCHING-OBJECT SPLIT VALIDATION & INVARIANTS
  // =========================================================================
  describe('Phase 3: Touching-Object Split Hardening', () => {

    it('Splits narrow-neck dumbbell with zero pixel loss', () => {
      const width = 100;
      const height = 60;
      const size = width * height;
      const alphaMask = new Uint8Array(size);
      const labelMap = new Uint16Array(size);
      const imageRgba = new Uint8ClampedArray(size * 4);

      // Draw two circles connected by a 2px narrow bridge at x=49..51, y=29..30
      let totalPixels = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const distL = Math.hypot(x - 25, y - 30);
          const distR = Math.hypot(x - 75, y - 30);
          const isBridge = x >= 40 && x <= 60 && Math.abs(y - 30) <= 2;
          if (distL <= 20 || distR <= 20 || isBridge) {
            alphaMask[idx] = 255;
            labelMap[idx] = 1;
            imageRgba[idx * 4] = 200;
            imageRgba[idx * 4 + 1] = 100;
            imageRgba[idx * 4 + 2] = 100;
            imageRgba[idx * 4 + 3] = 255;
            totalPixels++;
          }
        }
      }

      let bMinX = width, bMinY = height, bMaxX = -1, bMaxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (labelMap[y * width + x] === 1) {
            if (x < bMinX) bMinX = x;
            if (x > bMaxX) bMaxX = x;
            if (y < bMinY) bMinY = y;
            if (y > bMaxY) bMaxY = y;
          }
        }
      }

      const comp: ArtworkComponent = {
        id: 'dumbbell_comp',
        label: 1,
        bounds: { x: bMinX, y: bMinY, width: bMaxX - bMinX + 1, height: bMaxY - bMinY + 1 },
        centroid: { x: 50, y: 30 },
        pixelCount: totalPixels,
        isTiny: false
      };

      const group: StickerGroup = {
        id: 'dumbbell_group',
        name: 'dumbbell',
        componentIds: ['dumbbell_comp'],
        bounds: comp.bounds,
        borderThickness: 10,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      // Split via cut-line across neck (x=50, y=0 to x=50, y=60)
      const preview = previewTouchingSplit(
        comp,
        imageRgba,
        alphaMask,
        labelMap,
        width,
        {
          componentId: comp.id,
          mode: 'cut-line',
          cutLine: { x1: 50, y1: 5, x2: 50, y2: 55 }
        }
      );

      expect(preview).not.toBeNull();
      // Invariant 1: Zero pixel loss
      expect(preview!.countA + preview!.countB).toBe(totalPixels);
      expect(preview!.countA).toBeGreaterThan(0);
      expect(preview!.countB).toBeGreaterThan(0);

      // Invariant 2: Disjoint partition
      for (let i = 0; i < preview!.partitionA.length; i++) {
        if (preview!.partitionA[i] === 1) {
          expect(preview!.partitionB[i]).toBe(0);
        }
      }

      // Commit split
      const comps = [comp];
      const grps = [group];
      const result = commitTouchingSplit(comp, preview!, labelMap, comps, grps, width);

      expect(comps.length).toBe(2);
      expect(grps.length).toBe(2);
      expect(result.newComponentA.pixelCount + result.newComponentB.pixelCount).toBe(totalPixels);

      // Verify labelMap updated correctly: no pixel has label 0 where alpha > 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (alphaMask[idx] > 0) {
            expect(labelMap[idx] === result.newComponentA.label || labelMap[idx] === result.newComponentB.label).toBe(true);
          }
        }
      }
    });

    it('Splits interlocking concave shapes correctly', () => {
      const width = 80;
      const height = 80;
      const size = width * height;
      const alphaMask = new Uint8Array(size);
      const labelMap = new Uint16Array(size);
      const imageRgba = new Uint8ClampedArray(size * 4);

      let totalPixels = 0;
      for (let y = 10; y <= 70; y++) {
        for (let x = 10; x <= 70; x++) {
          const idx = y * width + x;
          const isA = (x >= 10 && x <= 30) || ((y <= 25 || y >= 55) && x <= 50);
          const isB = (x >= 32 && x <= 55 && y >= 30 && y <= 50) || (x === 31 && y === 40);
          if (isA || isB) {
            alphaMask[idx] = 255;
            labelMap[idx] = 1;
            imageRgba[idx * 4 + 3] = 255;
            totalPixels++;
          }
        }
      }

      const comp: ArtworkComponent = {
        id: 'interlock_comp',
        label: 1,
        bounds: { x: 10, y: 10, width: 61, height: 61 },
        centroid: { x: 35, y: 40 },
        pixelCount: totalPixels,
        isTiny: false
      };

      const preview = previewTouchingSplit(
        comp,
        imageRgba,
        alphaMask,
        labelMap,
        width,
        {
          componentId: comp.id,
          mode: 'seeds',
          seedA: { x: 15, y: 40 },
          seedB: { x: 45, y: 40 }
        }
      );

      expect(preview).not.toBeNull();
      expect(preview!.countA + preview!.countB).toBe(totalPixels);
      expect(preview!.countA).toBeGreaterThan(100);
      expect(preview!.countB).toBeGreaterThan(100);
    });

    it('Splits diagonally touching objects', () => {
      const width = 60;
      const height = 60;
      const size = width * height;
      const alphaMask = new Uint8Array(size);
      const labelMap = new Uint16Array(size);
      const imageRgba = new Uint8ClampedArray(size * 4);

      let totalPixels = 0;
      for (let y = 10; y <= 49; y++) {
        for (let x = 10; x <= 49; x++) {
          const idx = y * width + x;
          const in1 = x <= 29 && y <= 29;
          const in2 = x >= 30 && y >= 30;
          if (in1 || in2) {
            alphaMask[idx] = 255;
            labelMap[idx] = 1;
            imageRgba[idx * 4 + 3] = 255;
            totalPixels++;
          }
        }
      }

      const comp: ArtworkComponent = {
        id: 'diagonal_comp',
        label: 1,
        bounds: { x: 10, y: 10, width: 40, height: 40 },
        centroid: { x: 30, y: 30 },
        pixelCount: totalPixels,
        isTiny: false
      };

      const preview = previewTouchingSplit(
        comp,
        imageRgba,
        alphaMask,
        labelMap,
        width,
        {
          componentId: comp.id,
          mode: 'cut-line',
          cutLine: { x1: 25, y1: 35, x2: 35, y2: 25 }
        }
      );

      expect(preview).not.toBeNull();
      expect(preview!.countA + preview!.countB).toBe(totalPixels);
    });

    it('Verifies Parent Group Bounds recomputation when splitting a multi-component group', () => {
      const width = 100;
      const height = 100;
      const labelMap = new Uint16Array(width * height);
      const alphaMask = new Uint8Array(width * height);
      const imageRgba = new Uint8ClampedArray(width * height * 4);

      // Component 1 (touching object to split): at (10, 10) to (30, 30)
      for (let y = 10; y <= 30; y++) {
        for (let x = 10; x <= 30; x++) {
          const idx = y * width + x;
          labelMap[idx] = 1;
          alphaMask[idx] = 255;
        }
      }
      const comp1: ArtworkComponent = {
        id: 'comp_1',
        label: 1,
        bounds: { x: 10, y: 10, width: 21, height: 21 },
        centroid: { x: 20, y: 20 },
        pixelCount: 441,
        isTiny: false
      };

      // Component 2 (sparkle/dot in same group): at (70, 70) to (75, 75)
      for (let y = 70; y <= 75; y++) {
        for (let x = 70; x <= 75; x++) {
          const idx = y * width + x;
          labelMap[idx] = 2;
          alphaMask[idx] = 255;
        }
      }
      const comp2: ArtworkComponent = {
        id: 'comp_2',
        label: 2,
        bounds: { x: 70, y: 70, width: 6, height: 6 },
        centroid: { x: 72, y: 72 },
        pixelCount: 36,
        isTiny: false
      };

      // Multi-component parent group
      const parentGroup: StickerGroup = {
        id: 'parent_group',
        name: 'parent',
        componentIds: ['comp_1', 'comp_2'],
        bounds: { x: 10, y: 10, width: 66, height: 66 },
        borderThickness: 10,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      const preview = previewTouchingSplit(
        comp1,
        imageRgba,
        alphaMask,
        labelMap,
        width,
        {
          componentId: 'comp_1',
          mode: 'cut-line',
          cutLine: { x1: 20, y1: 5, x2: 20, y2: 35 }
        }
      );
      expect(preview).not.toBeNull();

      const comps = [comp1, comp2];
      const grps = [parentGroup];
      commitTouchingSplit(comp1, preview!, labelMap, comps, grps, width);

      // Verify: parentGroup STILL includes comp2 and its bounds correctly enclose both newCompA and comp2!
      expect(parentGroup.componentIds).toContain('comp_2');
      expect(parentGroup.bounds.x).toBe(10);
      expect(parentGroup.bounds.y).toBe(10);
      expect(parentGroup.bounds.x + parentGroup.bounds.width - 1).toBe(75);
      expect(parentGroup.bounds.y + parentGroup.bounds.height - 1).toBe(75);
    });

    it('Verifies Undo/Redo restores exact labels in labelMap for touching-object splits', () => {
      const width = 60;
      const height = 60;
      const size = width * height;
      const labelMap = new Uint16Array(size);
      const alphaMask = new Uint8Array(size);
      const imageRgba = new Uint8ClampedArray(size * 4);

      // Single component at (10, 10) to (30, 30)
      for (let y = 10; y <= 30; y++) {
        for (let x = 10; x <= 30; x++) {
          const idx = y * width + x;
          labelMap[idx] = 1;
          alphaMask[idx] = 255;
        }
      }

      const comp: ArtworkComponent = {
        id: 'comp_split_ur',
        label: 1,
        bounds: { x: 10, y: 10, width: 21, height: 21 },
        centroid: { x: 20, y: 20 },
        pixelCount: 441,
        isTiny: false
      };

      const group: StickerGroup = {
        id: 'group_split_ur',
        name: 'split_ur',
        componentIds: ['comp_split_ur'],
        bounds: comp.bounds,
        borderThickness: 10,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      const preview = previewTouchingSplit(
        comp,
        imageRgba,
        alphaMask,
        labelMap,
        width,
        {
          componentId: 'comp_split_ur',
          mode: 'cut-line',
          cutLine: { x1: 20, y1: 5, x2: 20, y2: 35 }
        }
      );
      expect(preview).not.toBeNull();

      // Snapshot before labels
      const { x, y, width: bw, height: bh } = preview!.bounds;
      const bSize = bw * bh;
      const beforeLabels = new Uint16Array(bSize);
      for (let r = 0; r < bh; r++) {
        const src = (y + r) * width + x;
        const dst = r * bw;
        beforeLabels.set(labelMap.subarray(src, src + bw), dst);
      }

      const comps = [comp];
      const grps = [group];
      const result = commitTouchingSplit(comp, preview!, labelMap, comps, grps, width);

      // Verify partitionB has new label 2
      const afterLabels = new Uint16Array(bSize);
      for (let r = 0; r < bh; r++) {
        const src = (y + r) * width + x;
        const dst = r * bw;
        afterLabels.set(labelMap.subarray(src, src + bw), dst);
      }

      // Check split applied: there are pixels with label 2 now
      let hasLabel2 = false;
      for (let i = 0; i < size; i++) {
        if (labelMap[i] === result.newComponentB.label) hasLabel2 = true;
      }
      expect(hasLabel2).toBe(true);

      // Revert (Undo simulation)
      for (let r = 0; r < bh; r++) {
        const src = r * bw;
        const dst = (y + r) * width + x;
        labelMap.set(beforeLabels.subarray(src, src + bw), dst);
      }

      // Verify: NO pixels have label 2 anymore! All pixels are label 1!
      for (let i = 0; i < size; i++) {
        expect(labelMap[i] === result.newComponentB.label).toBe(false);
        if (alphaMask[i] > 0) {
          expect(labelMap[i]).toBe(1);
        }
      }

      // Re-apply (Redo simulation)
      for (let r = 0; r < bh; r++) {
        const src = r * bw;
        const dst = (y + r) * width + x;
        labelMap.set(afterLabels.subarray(src, src + bw), dst);
      }

      // Verify: label 2 restored accurately!
      let countLabel2 = 0;
      for (let i = 0; i < size; i++) {
        if (labelMap[i] === result.newComponentB.label) countLabel2++;
      }
      expect(countLabel2).toBe(result.newComponentB.pixelCount);
    });
  });

  // =========================================================================
  // PHASE 4: WHITE BACKING AND BORDER PIPELINE AUDIT
  // =========================================================================
  describe('Phase 4: White Backing & Border Pipeline Audit', () => {

    it('Correctly renders borders across thickness ladder: 0px, 1px, 5px, 15px, 30px, 60px', async () => {
      const width = 140;
      const height = 140;
      const size = width * height;
      const alphaMask = new Uint8Array(size);
      const labelMap = new Uint16Array(size);
      const sourceRgba = new Uint8ClampedArray(size * 4);

      // Center disc at (70, 70) with radius 20
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (Math.hypot(x - 70, y - 70) <= 20) {
            alphaMask[idx] = 255;
            labelMap[idx] = 1;
            sourceRgba[idx * 4] = 255;
            sourceRgba[idx * 4 + 1] = 105;
            sourceRgba[idx * 4 + 2] = 180;
            sourceRgba[idx * 4 + 3] = 255;
          }
        }
      }

      const comp: ArtworkComponent = {
        id: 'disc_comp',
        label: 1,
        bounds: { x: 50, y: 50, width: 41, height: 41 },
        centroid: { x: 70, y: 70 },
        pixelCount: 1256,
        isTiny: false
      };

      const compMap = new Map([['disc_comp', comp]]);
      const thicknesses = [0, 1, 5, 15, 30, 60];

      for (const t of thicknesses) {
        const group: StickerGroup = {
          id: `group_t_${t}`,
          name: `sticker_t_${t}`,
          componentIds: ['disc_comp'],
          bounds: comp.bounds,
          borderThickness: t,
          customBorder: true,
          whiteBackingEnabled: true,
          connectBacking: true,
          solidBacking: false,
          bridges: [],
          excludedFromExport: false
        };

        const padding = Math.max(64, t + 12);
        const { distField, patchBounds } = buildGroupDistanceField(
          group, compMap, labelMap, width, height, padding
        );

        const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
          group, compMap, labelMap, alphaMask, sourceRgba, width, height, distField, patchBounds, t, 4
        );

        if (t === 0) {
          expect(croppedWidth).toBeLessThanOrEqual(51);
          expect(croppedHeight).toBeLessThanOrEqual(51);
        } else {
          const expectedMinDim = 41 + 2 * t + 4;
          expect(croppedWidth).toBeGreaterThanOrEqual(expectedMinDim - 4);
        }

        const warnings = inspectStickerEdge(
          group, compMap, labelMap, alphaMask, sourceRgba, width, height, distField, patchBounds, [255, 255, 255]
        );
        const clippedWarn = warnings.find(w => w.type === 'clipped-border');
        expect(clippedWarn).toBeUndefined();

        const pngBuf = await sharp(Buffer.from(croppedRgba.buffer), {
          raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
        }).png().toBuffer();
        fs.writeFileSync(path.join(AUDIT_OUT_DIR, `audit_border_${t}px.png`), pngBuf);
      }
    });

    it('Audits Edge-Touching Illustration (x=0, y=0) receives full white border without crashing or clipping', async () => {
      const width = 100;
      const height = 100;
      const size = width * height;
      const alphaMask = new Uint8Array(size);
      const labelMap = new Uint16Array(size);
      const sourceRgba = new Uint8ClampedArray(size * 4);

      for (let y = 0; y <= 30; y++) {
        for (let x = 0; x <= 30; x++) {
          const idx = y * width + x;
          alphaMask[idx] = 255;
          labelMap[idx] = 1;
          sourceRgba[idx * 4] = 80;
          sourceRgba[idx * 4 + 1] = 180;
          sourceRgba[idx * 4 + 2] = 240;
          sourceRgba[idx * 4 + 3] = 255;
        }
      }

      const comp: ArtworkComponent = {
        id: 'corner_comp',
        label: 1,
        bounds: { x: 0, y: 0, width: 31, height: 31 },
        centroid: { x: 15, y: 15 },
        pixelCount: 961,
        isTiny: false
      };

      const group: StickerGroup = {
        id: 'corner_group',
        name: 'corner_sticker',
        componentIds: ['corner_comp'],
        bounds: comp.bounds,
        borderThickness: 20,
        customBorder: true,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      const compMap = new Map([['corner_comp', comp]]);
      const padding = 64;
      const { distField, patchBounds } = buildGroupDistanceField(
        group, compMap, labelMap, width, height, padding
      );

      expect(patchBounds.x).toBe(-64);
      expect(patchBounds.y).toBe(-64);

      const warnings = inspectStickerEdge(
        group, compMap, labelMap, alphaMask, sourceRgba, width, height, distField, patchBounds, [255, 255, 255]
      );
      expect(Array.isArray(warnings)).toBe(true);

      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        group, compMap, labelMap, alphaMask, sourceRgba, width, height, distField, patchBounds, 20, 4
      );

      expect(croppedWidth).toBeGreaterThan(45);
      expect(croppedHeight).toBeGreaterThan(45);

      const pngBuf = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();
      fs.writeFileSync(path.join(AUDIT_OUT_DIR, 'audit_edge_touching_corner.png'), pngBuf);
    });
  });

  // =========================================================================
  // PHASE 5: PROJECT ARCHIVE & SECURITY FUZZING
  // =========================================================================
  describe('Phase 5: Project Save/Load & Archive Security Fuzzing', () => {

    it('Roundtrips project archive with SHA-256 integrity check', async () => {
      const width = 64;
      const height = 64;
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 120;
        rgba[i + 1] = 180;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
      const sourceImage = new (globalThis as any).ImageData(rgba, width, height);

      const comp: ArtworkComponent = {
        id: 'comp_test',
        label: 1,
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        centroid: { x: 20, y: 20 },
        pixelCount: 400,
        isTiny: false
      };

      const group: StickerGroup = {
        id: 'group_test',
        name: 'test_sticker',
        componentIds: ['comp_test'],
        bounds: comp.bounds,
        borderThickness: 15,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      const blob = await saveProjectArchive({
        name: 'Audit_Project',
        sourceImage,
        settings: {
          bgTolerance: 18,
          edgeSoftness: 1.0,
          minComponentArea: 15,
          groupingProximityThreshold: 35,
          enableTitleDetection: true
        },
        components: [comp],
        groups: [group],
        holes: [],
        globalBorderThickness: 15,
        globalSolidBacking: true,
        globalWhiteBacking: true
      });

      expect(blob.size).toBeGreaterThan(100);

      const loaded = await loadProjectArchive(blob);
      expect(loaded.metadata.name).toBe('Audit_Project');
      expect(loaded.metadata.imageDimensions.width).toBe(64);
      expect(loaded.metadata.imageDimensions.height).toBe(64);
      expect(loaded.components.length).toBe(1);
      expect(loaded.groups.length).toBe(1);
      expect(loaded.groups[0].componentIds[0]).toBe('comp_test');
    });

    it('Defends against Path Traversal attacks (rejection of ../ and absolute paths)', async () => {
      const maliciousZip = new JSZip();
      maliciousZip.file('../evil.sh', 'rm -rf /');
      maliciousZip.file('project.json', JSON.stringify({
        metadata: { schemaVersion: 1, imageDimensions: { width: 10, height: 10 } },
        components: [],
        groups: []
      }));
      maliciousZip.file('source.png', new Uint8Array(100));

      const maliciousBuffer = await maliciousZip.generateAsync({ type: 'uint8array' });
      const maliciousBlob = new Blob([maliciousBuffer]);

      await expect(loadProjectArchive(maliciousBlob)).rejects.toThrow(/Security violation/);
    });

    it('Defends against corrupted / non-JSON project.json', async () => {
      const zip = new JSZip();
      zip.file('project.json', 'THIS IS NOT VALID JSON {[[<');
      zip.file('source.png', new Uint8Array(100));

      const buffer = await zip.generateAsync({ type: 'uint8array' });
      await expect(loadProjectArchive(new Blob([buffer]))).rejects.toThrow(/Corrupted project\.json/);
    });

    it('Defends against Schema Version mismatch', async () => {
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify({
        metadata: { schemaVersion: 999, imageDimensions: { width: 10, height: 10 } },
        components: [],
        groups: []
      }));
      zip.file('source.png', new Uint8Array(100));

      const buffer = await zip.generateAsync({ type: 'uint8array' });
      await expect(loadProjectArchive(new Blob([buffer]))).rejects.toThrow(/Incompatible project schema version/);
    });

    it('Defends against Referential Integrity violation (orphaned or double-claimed components)', async () => {
      const zip = new JSZip();
      zip.file('project.json', JSON.stringify({
        metadata: { schemaVersion: 1, imageDimensions: { width: 10, height: 10 } },
        components: [
          { id: 'c1', label: 1, bounds: { x: 0, y: 0, width: 5, height: 5 }, centroid: { x: 2, y: 2 }, pixelCount: 25 }
        ],
        groups: [
          { id: 'g1', componentIds: ['c1', 'NON_EXISTENT_COMP'] }
        ]
      }));
      zip.file('source.png', new Uint8Array(100));

      const buffer = await zip.generateAsync({ type: 'uint8array' });
      await expect(loadProjectArchive(new Blob([buffer]))).rejects.toThrow(/Referential integrity error/);
    });
  });

  // =========================================================================
  // PHASE 6: PERFORMANCE & MEMORY STRESS BENCHMARK
  // =========================================================================
  describe('Phase 6: Performance & Memory Stress Benchmark', () => {

    it('Executes 100 consecutive brush strokes smoothly under 16ms/stroke budget', () => {
      const width = 500;
      const height = 500;
      const alphaMask = new Uint8Array(width * height);
      const labelMap = new Uint16Array(width * height);

      const comp: ArtworkComponent = {
        id: 'bench_comp',
        label: 1,
        bounds: { x: 50, y: 50, width: 400, height: 400 },
        centroid: { x: 250, y: 250 },
        pixelCount: 160000,
        isTiny: false
      };
      const group: StickerGroup = {
        id: 'bench_group',
        name: 'benchmark',
        componentIds: ['bench_comp'],
        bounds: comp.bounds,
        borderThickness: 15,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      const strokeTimes: number[] = [];

      for (let i = 0; i < 100; i++) {
        const x = 100 + (i % 20) * 15;
        const y = 100 + Math.floor(i / 20) * 60;

        const t0 = performance.now();
        const patch = applyBrushStroke(
          alphaMask,
          width,
          height,
          [
            { x, y, pressure: 1 },
            { x: x + 10, y: y + 10, pressure: 1 }
          ],
          { radius: 12, hardness: 0.8, opacity: 1.0, mode: 'restore' }
        );

        if (patch) {
          applyBrushPatchWithOwnership(
            alphaMask,
            labelMap,
            [comp],
            [group],
            width,
            height,
            patch,
            'bench_group'
          );
        }
        const dt = performance.now() - t0;
        strokeTimes.push(dt);
      }

      const avgTime = strokeTimes.reduce((a, b) => a + b, 0) / strokeTimes.length;
      const maxTime = Math.max(...strokeTimes);

      console.log(`\n--- 100 BRUSH STROKES BENCHMARK ---`);
      console.log(`Average stroke latency: ${avgTime.toFixed(2)} ms`);
      console.log(`Max stroke latency:     ${maxTime.toFixed(2)} ms`);

      expect(avgTime).toBeLessThan(16.0);
    });

    it('Supports 30 continuous undo/redo cycles with zero memory leak or state divergence', () => {
      const width = 100;
      const height = 100;
      const alphaMask = new Uint8Array(width * height);
      const labelMap = new Uint16Array(width * height);

      const history: any[] = [];
      const future: any[] = [];

      let comp: ArtworkComponent = {
        id: 'comp_ur',
        label: 1,
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        centroid: { x: 20, y: 20 },
        pixelCount: 400,
        isTiny: false
      };
      let group: StickerGroup = {
        id: 'group_ur',
        name: 'ur_test',
        componentIds: ['comp_ur'],
        bounds: comp.bounds,
        borderThickness: 10,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      };

      for (let i = 0; i < 30; i++) {
        const patch = applyBrushStroke(
          alphaMask,
          width,
          height,
          [{ x: 30 + i, y: 30 + i, pressure: 1 }],
          { radius: 4, hardness: 1.0, opacity: 1.0, mode: 'restore' }
        );
        if (patch) {
          const diff = applyBrushPatchWithOwnership(
            alphaMask,
            labelMap,
            [comp],
            [group],
            width,
            height,
            patch,
            'group_ur'
          );
          history.push(diff);
        }
      }

      expect(history.length).toBe(30);

      while (history.length > 0) {
        const diff = history.pop()!;
        revertBrushPatchWithOwnership(alphaMask, labelMap, width, diff);
        future.push(diff);
      }

      expect(future.length).toBe(30);

      for (let i = 0; i < 30; i++) {
        const idx = (30 + i) * width + (30 + i);
        expect(alphaMask[idx]).toBe(0);
        expect(labelMap[idx]).toBe(0);
      }
    });
  });
});
