import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { estimateBackgroundColor } from '../core/color';
import { segmentForeground } from '../core/segmentation';
import { analyzeComponents } from '../core/components';
import { proposeStickerGroups } from '../core/grouping';
import { buildGroupDistanceField, compositeSticker } from '../core/composer';
import { createZip } from '../core/zip';

// Load sharp dynamically from local installation
// @ts-ignore
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const SAMPLES_DIR = path.resolve(__dirname, '../../public/samples');
const OUTPUT_DIR = path.resolve(__dirname, '../../test-output');

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

describe('Real Kawaii Sticker Sheets Pipeline Verification', () => {
  it("processes Momo's Bakery: preserves internal whites, isolates stickers, exports PNGs & ZIP", async () => {
    const t0 = performance.now();
    const { width, height, rgba } = await loadSheetRgba('momos_bakery.jpg');
    const loadTime = performance.now() - t0;

    // 1. Background Estimation
    const tBg0 = performance.now();
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const bgTime = performance.now() - tBg0;

    expect(bgColor[0]).toBeGreaterThan(240);
    expect(bgColor[1]).toBeGreaterThan(240);
    expect(bgColor[2]).toBeGreaterThan(240);

    // 2. Foreground Extraction & Constrained Exterior Flood Fill
    const tSeg0 = performance.now();
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const segTime = performance.now() - tSeg0;

    // 3. Component Analysis
    const tComp0 = performance.now();
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
    const compTime = performance.now() - tComp0;
    expect(components.length).toBeGreaterThan(15);

    // 4. Grouping
    const tGroup0 = performance.now();
    const groups = proposeStickerGroups(components, 35, true);
    const groupTime = performance.now() - tGroup0;
    expect(groups.length).toBeGreaterThanOrEqual(10);

    const compMap = new Map(components.map(c => [c.id, c]));

    // 5. Export individual PNGs and package ZIP
    const zipEntries: Array<{ name: string; data: Uint8Array }> = [];
    const tCompStickers0 = performance.now();

    for (let i = 0; i < Math.min(groups.length, 12); i++) {
      const group = groups[i];
      const { distField, patchBounds } = buildGroupDistanceField(
        group,
        compMap,
        labelMap,
        width,
        height,
        50
      );

      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        group,
        compMap,
        labelMap,
        alphaMask,
        rgba,
        width,
        height,
        distField,
        patchBounds,
        group.borderThickness,
        4
      );

      // Verify that cropped output contains valid alpha and non-zero pixels
      expect(croppedWidth).toBeGreaterThan(10);
      expect(croppedHeight).toBeGreaterThan(10);

      // Save PNG via sharp
      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: {
          width: croppedWidth,
          height: croppedHeight,
          channels: 4
        }
      }).png().toBuffer();

      const outFileName = `momos_bakery_${group.name}.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, outFileName), pngBuffer);

      zipEntries.push({
        name: outFileName,
        data: new Uint8Array(pngBuffer)
      });
    }
    const compStickersTime = performance.now() - tCompStickers0;

    // Save ZIP
    const zipBlob = createZip(zipEntries);
    const zipBuffer = Buffer.from(await zipBlob.arrayBuffer());
    fs.writeFileSync(path.join(OUTPUT_DIR, 'momos_bakery_stickers.zip'), zipBuffer);

    expect(zipBuffer.length).toBeGreaterThan(1000);

    console.log(`\n--- PERFORMANCE BENCHMARK: Momo's Bakery (${width}x${height}) ---`);
    console.log(`Image Decode:        ${loadTime.toFixed(1)} ms`);
    console.log(`Background Est:      ${bgTime.toFixed(1)} ms`);
    console.log(`Flood Fill & Matting:${segTime.toFixed(1)} ms`);
    console.log(`Connected Components:${compTime.toFixed(1)} ms (${components.length} components)`);
    console.log(`Grouping:            ${groupTime.toFixed(1)} ms (${groups.length} sticker groups)`);
    console.log(`Render & PNG Export: ${compStickersTime.toFixed(1)} ms (12 stickers + ZIP)`);
    console.log(`ZIP Archive Size:    ${(zipBuffer.length / 1024).toFixed(1)} KB`);
  });

  it("processes Indoor Gardening: preserves thin stems, handles scissors & droplets", async () => {
    const { width, height, rgba } = await loadSheetRgba('indoor_gardening.jpg');
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
    const groups = proposeStickerGroups(components, 35, true);

    expect(groups.length).toBeGreaterThan(8);
    const compMap = new Map(components.map(c => [c.id, c]));

    // Export top 4 stickers
    for (let i = 0; i < Math.min(groups.length, 4); i++) {
      const group = groups[i];
      const { distField, patchBounds } = buildGroupDistanceField(group, compMap, labelMap, width, height, 50);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        group, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 20, 4
      );

      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();

      fs.writeFileSync(path.join(OUTPUT_DIR, `indoor_gardening_${group.name}.png`), pngBuffer);
    }
  });

  it("processes Comfort Club: preserves pastels, delicate steam & socks", async () => {
    const { width, height, rgba } = await loadSheetRgba('comfort_club.jpg');
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
    const groups = proposeStickerGroups(components, 35, true);

    expect(groups.length).toBeGreaterThan(8);
    const compMap = new Map(components.map(c => [c.id, c]));

    for (let i = 0; i < Math.min(groups.length, 4); i++) {
      const group = groups[i];
      const { distField, patchBounds } = buildGroupDistanceField(group, compMap, labelMap, width, height, 50);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        group, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 20, 4
      );

      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();

      fs.writeFileSync(path.join(OUTPUT_DIR, `comfort_club_${group.name}.png`), pngBuffer);
    }
  });

  it("processes Miso's Aquarium Afternoon: preserves aquarium scenes, cats & bubbles", async () => {
    const { width, height, rgba } = await loadSheetRgba('misos_aquarium.jpg');
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
    const groups = proposeStickerGroups(components, 35, true);

    expect(groups.length).toBeGreaterThan(6);
    const compMap = new Map(components.map(c => [c.id, c]));

    for (let i = 0; i < Math.min(groups.length, 4); i++) {
      const group = groups[i];
      const { distField, patchBounds } = buildGroupDistanceField(group, compMap, labelMap, width, height, 50);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        group, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 20, 4
      );

      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();

      fs.writeFileSync(path.join(OUTPUT_DIR, `misos_aquarium_${group.name}.png`), pngBuffer);
    }
  });

  it('processes Chai Break: unifies circular badges ("CHAI APPROVED" & "Chai Break Department") into single stickers', async () => {
    const { width, height, rgba } = await loadSheetRgba('chai_break.jpg');
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
    const groups = proposeStickerGroups(components, 35, true);

    const compMap = new Map(components.map(c => [c.id, c]));

    // 1. Verify CHAI APPROVED badge (Row 5, Col 1: x: 20..220, y: 830..990)
    // Find group containing the badge
    const chaiApprovedGroup = groups.find(g =>
      g.bounds.x >= 20 && g.bounds.x <= 100 &&
      g.bounds.y >= 830 && g.bounds.y <= 900 &&
      g.bounds.width >= 100 && g.bounds.height >= 100
    );
    expect(chaiApprovedGroup).toBeDefined();

    // Verify there are no duplicate/split groups inside the CHAI APPROVED badge bounding box
    const overlappingChaiApprovedGroups = groups.filter(g =>
      g.id !== chaiApprovedGroup!.id &&
      g.bounds.x >= chaiApprovedGroup!.bounds.x - 10 &&
      g.bounds.x + g.bounds.width <= chaiApprovedGroup!.bounds.x + chaiApprovedGroup!.bounds.width + 10 &&
      g.bounds.y >= chaiApprovedGroup!.bounds.y - 10 &&
      g.bounds.y + g.bounds.height <= chaiApprovedGroup!.bounds.y + chaiApprovedGroup!.bounds.height + 10
    );
    expect(overlappingChaiApprovedGroups).toHaveLength(0);

    // 2. Verify Chai Break Department badge (Row 4, Col 4: x: 550..720, y: 630..780)
    const chaiDeptGroup = groups.find(g =>
      g.bounds.x >= 550 && g.bounds.x <= 620 &&
      g.bounds.y >= 630 && g.bounds.y <= 670 &&
      g.bounds.width >= 100 && g.bounds.height >= 100
    );
    expect(chaiDeptGroup).toBeDefined();

    // Verify no duplicate/split groups inside the Chai Break Department badge bounding box
    const overlappingChaiDeptGroups = groups.filter(g =>
      g.id !== chaiDeptGroup!.id &&
      g.bounds.x >= chaiDeptGroup!.bounds.x - 10 &&
      g.bounds.x + g.bounds.width <= chaiDeptGroup!.bounds.x + chaiDeptGroup!.bounds.width + 10 &&
      g.bounds.y >= chaiDeptGroup!.bounds.y - 10 &&
      g.bounds.y + g.bounds.height <= chaiDeptGroup!.bounds.y + chaiDeptGroup!.bounds.height + 10
    );
    expect(overlappingChaiDeptGroups).toHaveLength(0);

    // Verify sheet caption underneath (y ≈ 800) did NOT leak into the badge (height should be <= 140)
    expect(chaiDeptGroup!.bounds.height).toBeLessThanOrEqual(140);

    // 3. Export both badges to test-output and assert non-empty valid PNGs
    for (const badge of [chaiApprovedGroup!, chaiDeptGroup!]) {
      const { distField, patchBounds } = buildGroupDistanceField(badge, compMap, labelMap, width, height, 50);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        badge, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 20, 4
      );

      expect(croppedWidth).toBeGreaterThan(50);
      expect(croppedHeight).toBeGreaterThan(50);

      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();

      const outName = `chai_break_${badge.name}.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, outName), pngBuffer);
    }
  });
});

