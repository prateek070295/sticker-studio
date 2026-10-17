import { describe, it } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { estimateBackgroundColor } from '../color';
import { segmentForeground } from '../segmentation';
import { analyzeComponents } from '../components';
import { proposeStickerGroups } from '../grouping';
import { buildGroupDistanceField, compositeSticker } from '../composer';

// @ts-ignore
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const DIAG_DIR = path.resolve(__dirname, '../../../docs/v1.1-release-audit/diagnosis');
if (!fs.existsSync(DIAG_DIR)) {
  fs.mkdirSync(DIAG_DIR, { recursive: true });
}

describe('Phase 1 — Reproduce and Diagnose Chai Break Grouping Defects', () => {
  it('Analyzes all components, groups, and enclosures on Chai Break reference sheet', async () => {
    const filePath = path.resolve(__dirname, '../../../public/samples/chai_break.jpg');
    const image = sharp(filePath).ensureAlpha();
    const meta = await image.metadata();
    const width = meta.width!;
    const height = meta.height!;
    const rawBuffer = await image.raw().toBuffer();
    const rgba = new Uint8ClampedArray(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

    // 1. Segmentation & Components
    const bgColor = estimateBackgroundColor(rgba, width, height);
    const { alphaMask, foregroundSupport } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    const { components, labelMap } = analyzeComponents(foregroundSupport, width, height, 15);
    const groups = proposeStickerGroups(components, 35, true, labelMap, width, height);

    console.log(`\n=== CHAI BREAK DIAGNOSTIC SUMMARY ===`);
    console.log(`Image Size: ${width}x${height}`);
    console.log(`Background Color: [${bgColor.join(', ')}]`);
    console.log(`Total Extracted Components: ${components.length}`);
    console.log(`Total Proposed Sticker Groups: ${groups.length}`);

    // Map each component to its assigned group
    const compToGroup = new Map<string, string>();
    for (const g of groups) {
      for (const cId of g.componentIds) {
        compToGroup.set(cId, g.name);
      }
    }

    // Identify badge areas by inspecting component centroids
    // Let's print components in the two badge clusters
    console.log('\n--- ALL COMPONENTS AND THEIR GROUP ASSIGNMENTS ---');
    for (const c of components) {
      const gName = compToGroup.get(c.id) || 'UNASSIGNED';
      console.log(`Comp #${c.label.toString().padStart(2, ' ')} (${c.id}): bounds=[x:${c.bounds.x}, y:${c.bounds.y}, w:${c.bounds.width}, h:${c.bounds.height}] centroid=(${c.centroid.x}, ${c.centroid.y}) pixels=${c.pixelCount} -> Group: ${gName}`);
    }

    // 2. Generate Distinct-Color Component Mask Map
    // Palette of distinct colors for components
    const palette = [
      [230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48],
      [145, 30, 180], [70, 240, 240], [240, 50, 230], [210, 245, 60], [250, 190, 212],
      [0, 128, 128], [220, 190, 255], [170, 110, 40], [255, 250, 200], [128, 0, 0],
      [170, 255, 195], [128, 128, 0], [255, 215, 180], [0, 0, 128], [128, 128, 128]
    ];

    const diagRgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const label = labelMap[i];
      if (label === 0) {
        // Light grey background
        diagRgba[i * 4] = 240;
        diagRgba[i * 4 + 1] = 240;
        diagRgba[i * 4 + 2] = 240;
        diagRgba[i * 4 + 3] = 255;
      } else {
        const color = palette[label % palette.length];
        diagRgba[i * 4] = color[0];
        diagRgba[i * 4 + 1] = color[1];
        diagRgba[i * 4 + 2] = color[2];
        diagRgba[i * 4 + 3] = 255;
      }
    }

    const diagPng = await sharp(Buffer.from(diagRgba.buffer), {
      raw: { width, height, channels: 4 }
    }).png().toBuffer();
    fs.writeFileSync(path.join(DIAG_DIR, '01_chai_break_components_distinct_colors.png'), diagPng);
    console.log('\nSaved: 01_chai_break_components_distinct_colors.png');

    // 3. Export each group PNG from Chai Break to inspect individual groups
    const compMap = new Map(components.map(c => [c.id, c]));
    for (const grp of groups) {
      const { distField, patchBounds } = buildGroupDistanceField(grp, compMap, labelMap, width, height, 64);
      const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
        grp, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, grp.borderThickness, 4
      );
      const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
        raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
      }).png().toBuffer();
      fs.writeFileSync(path.join(DIAG_DIR, `group_${grp.name}.png`), pngBuffer);
    }
    console.log(`Saved individual PNG exports for all ${groups.length} groups to docs/v1.1-release-audit/diagnosis/`);
  });

  it('Tests grouping when enclosed holes are removed (hollow badges with transparent interior)', async () => {
    const filePath = path.resolve(__dirname, '../../../public/samples/chai_break.jpg');
    const image = sharp(filePath).ensureAlpha();
    const meta = await image.metadata();
    const width = meta.width!;
    const height = meta.height!;
    const rawBuffer = await image.raw().toBuffer();
    const rgba = new Uint8ClampedArray(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);
    const bgColor = estimateBackgroundColor(rgba, width, height);

    const { foregroundSupport, enclosedHoleCandidates } = segmentForeground(rgba, width, height, bgColor, 18, 1.0);
    console.log(`Detected hole candidates: ${enclosedHoleCandidates.length}`);

    // If enclosed holes are removed from foreground support:
    const hollowSupport = new Uint8Array(foregroundSupport);
    for (const hole of enclosedHoleCandidates) {
      for (const p of hole.pixels) {
        hollowSupport[p] = 0;
      }
    }

    const { components, labelMap: hollowLabelMap } = analyzeComponents(hollowSupport, width, height, 15);
    const groups = proposeStickerGroups(components, 35, true, hollowLabelMap, width, height);

    console.log(`With holes removed: components=${components.length}, groups=${groups.length}`);

    const chaiApprovedGroups = groups.filter(g =>
      g.bounds.x >= 15 && g.bounds.x + g.bounds.width <= 240 &&
      g.bounds.y >= 830 && g.bounds.y + g.bounds.height <= 1000
    );
    // Print all components in both badge regions
    console.log('--- ALL COMPONENTS IN CHAI APPROVED & CHAI DEPT ---');
    for (const c of components) {
      if (
        (c.bounds.x >= 15 && c.bounds.x <= 230 && c.bounds.y >= 830 && c.bounds.y <= 1000) ||
        (c.bounds.x >= 550 && c.bounds.x <= 735 && c.bounds.y >= 620 && c.bounds.y <= 820)
      ) {
        console.log(`Comp #${c.label} (${c.id}): bounds=[x:${c.bounds.x}, y:${c.bounds.y}, w:${c.bounds.width}, h:${c.bounds.height}] centroid=(${c.centroid.x}, ${c.centroid.y}) pixels=${c.pixelCount}`);
      }
    }

    for (const g of groups) {
      if (
        (g.bounds.x >= 15 && g.bounds.x <= 230 && g.bounds.y >= 830 && g.bounds.y <= 1000) ||
        (g.bounds.x >= 540 && g.bounds.x <= 735 && g.bounds.y >= 620 && g.bounds.y <= 820)
      ) {
        console.log(`Group ${g.name} (${g.id}): bounds=[x:${g.bounds.x}, y:${g.bounds.y}, w:${g.bounds.width}, h:${g.bounds.height}], comps=[${g.componentIds.join(', ')}]`);
      }
    }
  });
});



