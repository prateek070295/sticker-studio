import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { ArtworkComponent, BoundingBox } from '../../types';
import { isMaskEnclosed, detectEnclosures } from '../enclosure';
import { proposeStickerGroups } from '../grouping';
import { buildGroupDistanceField, compositeSticker } from '../composer';

// @ts-ignore
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const VALIDATION_DIR = path.resolve(__dirname, '../../../docs/v1.1-release-audit/targeted-validation');
if (!fs.existsSync(VALIDATION_DIR)) {
  fs.mkdirSync(VALIDATION_DIR, { recursive: true });
}

async function exportGroupPng(
  group: any,
  components: ArtworkComponent[],
  labelMap: Uint16Array,
  width: number,
  height: number,
  outFilename: string
) {
  const compMap = new Map(components.map(c => [c.id, c]));
  const alphaMask = new Uint8Array(width * height);
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Synthesize RGBA and alpha from labelMap
  for (let i = 0; i < width * height; i++) {
    const lbl = labelMap[i];
    if (lbl > 0) {
      alphaMask[i] = 255;
      const offset = i * 4;
      // Vibrant illustration colors per label
      rgba[offset] = (lbl * 67) % 200 + 40;
      rgba[offset + 1] = (lbl * 131) % 200 + 40;
      rgba[offset + 2] = (lbl * 197) % 200 + 40;
      rgba[offset + 3] = 255;
    }
  }

  const { distField, patchBounds } = buildGroupDistanceField(group, compMap, labelMap, width, height, 32);
  const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
    group, compMap, labelMap, alphaMask, rgba, width, height, distField, patchBounds, 12, 4
  );

  const pngBuffer = await sharp(Buffer.from(croppedRgba.buffer), {
    raw: { width: croppedWidth, height: croppedHeight, channels: 4 }
  }).png().toBuffer();

  const outPath = path.join(VALIDATION_DIR, outFilename);
  fs.writeFileSync(outPath, pngBuffer);
  return { outPath, croppedWidth, croppedHeight };
}

describe('Targeted Validation of False Enclosure Grouping', () => {

  // =========================================================================
  // TEST 1: C-shaped / Crescent illustration containing unrelated smaller sticker
  // =========================================================================
  it('1. Rejects false enclosure for C-shaped / crescent illustration with open mouth', async () => {
    const width = 300;
    const height = 300;
    const labelMap = new Uint16Array(width * height);

    // Component 1: Large C-shaped illustration (center at 150, 150, radius 80, thickness 25)
    // Mouth opens to the right between -45 deg and +45 deg (a 90-degree wide opening ~80px wide)
    let cPixelCount = 0;
    let sumX = 0, sumY = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;

    for (let y = 50; y <= 250; y++) {
      for (let x = 50; x <= 250; x++) {
        const dx = x - 150;
        const dy = y - 150;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 55 && dist <= 85) {
          const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180
          // If angle is NOT in mouth opening (-40 to +40 deg)
          if (angle < -40 || angle > 40) {
            labelMap[y * width + x] = 1;
            cPixelCount++;
            sumX += x;
            sumY += y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }

    const cShapeComp: ArtworkComponent = {
      id: 'comp_c_shape',
      label: 1,
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      centroid: { x: Math.round(sumX / cPixelCount), y: Math.round(sumY / cPixelCount) },
      pixelCount: cPixelCount,
      isTiny: false
    };

    // Component 2: Unrelated smaller star/sticker nestled inside the bite of the C (at x: 150, y: 150)
    let starCount = 0;
    let sSumX = 0, sSumY = 0;
    let sMinX = width, sMaxX = 0, sMinY = height, sMaxY = 0;

    for (let y = 140; y <= 160; y++) {
      for (let x = 140; x <= 160; x++) {
        labelMap[y * width + x] = 2;
        starCount++;
        sSumX += x;
        sSumY += y;
        if (x < sMinX) sMinX = x;
        if (x > sMaxX) sMaxX = x;
        if (y < sMinY) sMinY = y;
        if (y > sMaxY) sMaxY = y;
      }
    }

    const starComp: ArtworkComponent = {
      id: 'comp_inner_star',
      label: 2,
      bounds: { x: sMinX, y: sMinY, width: sMaxX - sMinX + 1, height: sMaxY - sMinY + 1 },
      centroid: { x: Math.round(sSumX / starCount), y: Math.round(sSumY / starCount) },
      pixelCount: starCount,
      isTiny: false
    };

    const components = [cShapeComp, starComp];

    // Assert: Mask enclosure MUST return FALSE (not a closed cavity!)
    const isEnclosed = isMaskEnclosed(cShapeComp, starComp, labelMap, width, height, 14);
    expect(isEnclosed).toBe(false);

    const enclosures = detectEnclosures(components, labelMap, width, height);
    expect(enclosures.has(cShapeComp.id)).toBe(false);

    // Grouping MUST keep them as TWO independent stickers
    const groups = proposeStickerGroups(components, 25, true, labelMap, width, height);
    expect(groups.length).toBe(2);

    // Export both stickers to PNG to verify visually
    await exportGroupPng(groups[0], components, labelMap, width, height, 'test1_c_shape_sticker.png');
    await exportGroupPng(groups[1], components, labelMap, width, height, 'test1_unrelated_star_sticker.png');
  });

  // =========================================================================
  // TEST 2: Two independent stickers with heavily overlapping bounding boxes
  // =========================================================================
  it('2. Rejects false enclosure between two independent overlapping stickers', async () => {
    const width = 300;
    const height = 300;
    const labelMap = new Uint16Array(width * height);

    // Sticker 1: Top-Left L-shape
    let l1Count = 0, l1MinX = width, l1MaxX = 0, l1MinY = height, l1MaxY = 0;
    let l1SumX = 0, l1SumY = 0;
    for (let y = 50; y <= 150; y++) {
      for (let x = 50; x <= 80; x++) {
        labelMap[y * width + x] = 1;
        l1Count++;
        l1SumX += x; l1SumY += y;
        if (x < l1MinX) l1MinX = x; if (x > l1MaxX) l1MaxX = x;
        if (y < l1MinY) l1MinY = y; if (y > l1MaxY) l1MaxY = y;
      }
    }
    for (let y = 120; y <= 150; y++) {
      for (let x = 81; x <= 160; x++) {
        labelMap[y * width + x] = 1;
        l1Count++;
        l1SumX += x; l1SumY += y;
        if (x < l1MinX) l1MinX = x; if (x > l1MaxX) l1MaxX = x;
        if (y < l1MinY) l1MinY = y; if (y > l1MaxY) l1MaxY = y;
      }
    }

    const comp1: ArtworkComponent = {
      id: 'comp_l1',
      label: 1,
      bounds: { x: l1MinX, y: l1MinY, width: l1MaxX - l1MinX + 1, height: l1MaxY - l1MinY + 1 },
      centroid: { x: Math.round(l1SumX / l1Count), y: Math.round(l1SumY / l1Count) },
      pixelCount: l1Count,
      isTiny: false
    };

    // Sticker 2: Inverted L nestled right inside the corner of L1 (heavily overlapping bounding boxes)
    let l2Count = 0, l2MinX = width, l2MaxX = 0, l2MinY = height, l2MaxY = 0;
    let l2SumX = 0, l2SumY = 0;
    for (let y = 60; y <= 110; y++) {
      for (let x = 90; x <= 170; x++) {
        labelMap[y * width + x] = 2;
        l2Count++;
        l2SumX += x; l2SumY += y;
        if (x < l2MinX) l2MinX = x; if (x > l2MaxX) l2MaxX = x;
        if (y < l2MinY) l2MinY = y; if (y > l2MaxY) l2MaxY = y;
      }
    }

    const comp2: ArtworkComponent = {
      id: 'comp_l2',
      label: 2,
      bounds: { x: l2MinX, y: l2MinY, width: l2MaxX - l2MinX + 1, height: l2MaxY - l2MinY + 1 },
      centroid: { x: Math.round(l2SumX / l2Count), y: Math.round(l2SumY / l2Count) },
      pixelCount: l2Count,
      isTiny: false
    };

    const components = [comp1, comp2];

    // Assert: Neither encloses the other
    expect(isMaskEnclosed(comp1, comp2, labelMap, width, height, 14)).toBe(false);
    expect(isMaskEnclosed(comp2, comp1, labelMap, width, height, 14)).toBe(false);

    const enclosures = detectEnclosures(components, labelMap, width, height);
    expect(enclosures.size).toBe(0);

    const groups = proposeStickerGroups(components, 35, true, labelMap, width, height);
    expect(groups.length).toBe(2);

    await exportGroupPng(groups[0], components, labelMap, width, height, 'test2_overlapping_sticker1.png');
    await exportGroupPng(groups[1], components, labelMap, width, height, 'test2_overlapping_sticker2.png');
  });

  // =========================================================================
  // TEST 3: Circular badge with a small gap in its outer outline (8px gap)
  // =========================================================================
  it('3. Confirms enclosure for a circular badge with a small (8px) outline gap', async () => {
    const width = 300;
    const height = 300;
    const labelMap = new Uint16Array(width * height);

    // Circular badge ring (radius 80, thickness 10) with an 8px intentional break at the top (angle near -90 deg)
    let ringCount = 0, rSumX = 0, rSumY = 0;
    let rMinX = width, rMaxX = 0, rMinY = height, rMaxY = 0;

    for (let y = 50; y <= 250; y++) {
      for (let x = 50; x <= 250; x++) {
        const dx = x - 150;
        const dy = y - 150;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 75 && dist <= 85) {
          // 8px gap at top: x between 146 and 154, y < 150
          if (Math.abs(x - 150) <= 4 && dy < 0) {
            continue; // Small 8px gap
          }
          labelMap[y * width + x] = 1;
          ringCount++;
          rSumX += x; rSumY += y;
          if (x < rMinX) rMinX = x; if (x > rMaxX) rMaxX = x;
          if (y < rMinY) rMinY = y; if (y > rMaxY) rMaxY = y;
        }
      }
    }

    const ringComp: ArtworkComponent = {
      id: 'comp_gapped_ring',
      label: 1,
      bounds: { x: rMinX, y: rMinY, width: rMaxX - rMinX + 1, height: rMaxY - rMinY + 1 },
      centroid: { x: Math.round(rSumX / ringCount), y: Math.round(rSumY / ringCount) },
      pixelCount: ringCount,
      isTiny: false
    };

    // Central cup illustration inside the badge
    let cupCount = 0, cSumX = 0, cSumY = 0;
    let cMinX = width, cMaxX = 0, cMinY = height, cMaxY = 0;
    for (let y = 120; y <= 180; y++) {
      for (let x = 120; x <= 180; x++) {
        labelMap[y * width + x] = 2;
        cupCount++;
        cSumX += x; cSumY += y;
        if (x < cMinX) cMinX = x; if (x > cMaxX) cMaxX = x;
        if (y < cMinY) cMinY = y; if (y > cMaxY) cMaxY = y;
      }
    }

    const cupComp: ArtworkComponent = {
      id: 'comp_center_cup',
      label: 2,
      bounds: { x: cMinX, y: cMinY, width: cMaxX - cMinX + 1, height: cMaxY - cMinY + 1 },
      centroid: { x: Math.round(cSumX / cupCount), y: Math.round(cSumY / cupCount) },
      pixelCount: cupCount,
      isTiny: false
    };

    const components = [ringComp, cupComp];

    // Assert: Morphological closing bridges the 8px gap $\implies$ true enclosure!
    expect(isMaskEnclosed(ringComp, cupComp, labelMap, width, height, 14)).toBe(true);

    const groups = proposeStickerGroups(components, 35, true, labelMap, width, height);
    expect(groups.length).toBe(1);
    expect(groups[0].componentIds).toEqual(['comp_gapped_ring', 'comp_center_cup']);
    expect(groups[0].bridges).toHaveLength(0); // Suppressed interior bridges

    await exportGroupPng(groups[0], components, labelMap, width, height, 'test3_gapped_badge_unified.png');
  });

  // =========================================================================
  // TEST 4: Nested decorative frame containing text and central illustration
  // =========================================================================
  it('4. Correctly unifies nested decorative frame with text and illustration', async () => {
    const width = 300;
    const height = 300;
    const labelMap = new Uint16Array(width * height);

    // 1. Outer decorative frame (x: 40..260, y: 40..260, thickness 10)
    let f1Count = 0, f1MinX = width, f1MaxX = 0, f1MinY = height, f1MaxY = 0;
    for (let y = 40; y <= 260; y++) {
      for (let x = 40; x <= 260; x++) {
        const isBorder = x <= 50 || x >= 250 || y <= 50 || y >= 250;
        if (isBorder) {
          labelMap[y * width + x] = 1;
          f1Count++;
          if (x < f1MinX) f1MinX = x; if (x > f1MaxX) f1MaxX = x;
          if (y < f1MinY) f1MinY = y; if (y > f1MaxY) f1MaxY = y;
        }
      }
    }
    const outerFrame: ArtworkComponent = {
      id: 'comp_outer_frame',
      label: 1,
      bounds: { x: f1MinX, y: f1MinY, width: f1MaxX - f1MinX + 1, height: f1MaxY - f1MinY + 1 },
      centroid: { x: 150, y: 150 },
      pixelCount: f1Count,
      isTiny: false
    };

    // 2. Inner ornate frame (x: 70..230, y: 70..230, thickness 6)
    let f2Count = 0, f2MinX = width, f2MaxX = 0, f2MinY = height, f2MaxY = 0;
    for (let y = 70; y <= 230; y++) {
      for (let x = 70; x <= 230; x++) {
        const isBorder = x <= 76 || x >= 224 || y <= 76 || y >= 224;
        if (isBorder) {
          labelMap[y * width + x] = 2;
          f2Count++;
          if (x < f2MinX) f2MinX = x; if (x > f2MaxX) f2MaxX = x;
          if (y < f2MinY) f2MinY = y; if (y > f2MaxY) f2MaxY = y;
        }
      }
    }
    const innerFrame: ArtworkComponent = {
      id: 'comp_inner_frame',
      label: 2,
      bounds: { x: f2MinX, y: f2MinY, width: f2MaxX - f2MinX + 1, height: f2MaxY - f2MinY + 1 },
      centroid: { x: 150, y: 150 },
      pixelCount: f2Count,
      isTiny: false
    };

    // 3. Contained banner text (x: 90..210, y: 90..110)
    let tCount = 0;
    for (let y = 90; y <= 110; y++) {
      for (let x = 90; x <= 210; x++) {
        labelMap[y * width + x] = 3;
        tCount++;
      }
    }
    const textComp: ArtworkComponent = {
      id: 'comp_frame_text',
      label: 3,
      bounds: { x: 90, y: 90, width: 121, height: 21 },
      centroid: { x: 150, y: 100 },
      pixelCount: tCount,
      isTiny: false
    };

    // 4. Central portrait/illustration (x: 110..190, y: 130..210)
    let pCount = 0;
    for (let y = 130; y <= 210; y++) {
      for (let x = 110; x <= 190; x++) {
        labelMap[y * width + x] = 4;
        pCount++;
      }
    }
    const portraitComp: ArtworkComponent = {
      id: 'comp_portrait',
      label: 4,
      bounds: { x: 110, y: 130, width: 81, height: 81 },
      centroid: { x: 150, y: 170 },
      pixelCount: pCount,
      isTiny: false
    };

    const components = [outerFrame, innerFrame, textComp, portraitComp];
    const groups = proposeStickerGroups(components, 35, true, labelMap, width, height);

    // MUST unify all 4 nested pieces into exactly 1 sticker group
    expect(groups.length).toBe(1);
    expect(groups[0].componentIds).toHaveLength(4);
    expect(groups[0].bridges).toHaveLength(0);

    await exportGroupPng(groups[0], components, labelMap, width, height, 'test4_nested_frame_unified.png');
  });

  // =========================================================================
  // TEST 5: Badge with an external caption immediately underneath
  // =========================================================================
  it('5. Protects badge from external caption immediately underneath (no false merge)', async () => {
    const width = 300;
    const height = 300;
    const labelMap = new Uint16Array(width * height);

    // Circular badge (y: 40..200, center at 150, 120, radius 70)
    let bCount = 0;
    for (let y = 40; y <= 200; y++) {
      for (let x = 40; x <= 260; x++) {
        const dist = Math.sqrt((x - 150) ** 2 + (y - 120) ** 2);
        if (dist >= 60 && dist <= 70) {
          labelMap[y * width + x] = 1;
          bCount++;
        }
      }
    }
    const badgeRing: ArtworkComponent = {
      id: 'comp_badge_ring',
      label: 1,
      bounds: { x: 80, y: 50, width: 140, height: 140 },
      centroid: { x: 150, y: 120 },
      pixelCount: bCount,
      isTiny: false
    };

    // Inner icon (y: 100..140)
    let iCount = 0;
    for (let y = 100; y <= 140; y++) {
      for (let x = 130; x <= 170; x++) {
        labelMap[y * width + x] = 2;
        iCount++;
      }
    }
    const innerIcon: ArtworkComponent = {
      id: 'comp_inner_icon',
      label: 2,
      bounds: { x: 130, y: 100, width: 41, height: 41 },
      centroid: { x: 150, y: 120 },
      pixelCount: iCount,
      isTiny: false
    };

    // External caption 15px underneath the badge (y: 205..215, width: 100, height: 11)
    let cCount = 0;
    for (let y = 205; y <= 215; y++) {
      for (let x = 100; x <= 200; x++) {
        labelMap[y * width + x] = 3;
        cCount++;
      }
    }
    const caption: ArtworkComponent = {
      id: 'comp_ext_caption',
      label: 3,
      bounds: { x: 100, y: 205, width: 101, height: 11 },
      centroid: { x: 150, y: 210 },
      pixelCount: cCount,
      isTiny: false
    };

    const components = [badgeRing, innerIcon, caption];
    const groups = proposeStickerGroups(components, 35, true, labelMap, width, height);

    // MUST create 2 separate groups: 1 for the badge, 1 for the external caption
    expect(groups.length).toBe(2);

    const badgeGroup = groups.find(g => g.componentIds.includes('comp_badge_ring'))!;
    expect(badgeGroup.componentIds).toEqual(['comp_badge_ring', 'comp_inner_icon']);
    expect(badgeGroup.componentIds).not.toContain('comp_ext_caption');

    await exportGroupPng(badgeGroup, components, labelMap, width, height, 'test5_badge_clean.png');
    const captionGroup = groups.find(g => g.componentIds.includes('comp_ext_caption'))!;
    await exportGroupPng(captionGroup, components, labelMap, width, height, 'test5_caption_isolated.png');
  });

  // =========================================================================
  // TEST 6: Two adjacent badges with decorative elements between them
  // =========================================================================
  it('6. Preserves separation between two adjacent badges with intermediate decorative stars', async () => {
    const width = 500;
    const height = 250;
    const labelMap = new Uint16Array(width * height);

    // Badge A (Left: center at 100, 125, radius 60)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt((x - 100) ** 2 + (y - 125) ** 2);
        if (dist >= 50 && dist <= 60) labelMap[y * width + x] = 1;
        if (dist <= 30) labelMap[y * width + x] = 2; // Inner icon A
      }
    }
    const badgeARing: ArtworkComponent = {
      id: 'comp_badge_a_ring',
      label: 1,
      bounds: { x: 40, y: 65, width: 121, height: 121 },
      centroid: { x: 100, y: 125 },
      pixelCount: 3500,
      isTiny: false
    };
    const badgeAInner: ArtworkComponent = {
      id: 'comp_badge_a_inner',
      label: 2,
      bounds: { x: 70, y: 95, width: 61, height: 61 },
      centroid: { x: 100, y: 125 },
      pixelCount: 2800,
      isTiny: false
    };

    // Badge B (Right: center at 380, 125, radius 60)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt((x - 380) ** 2 + (y - 125) ** 2);
        if (dist >= 50 && dist <= 60) labelMap[y * width + x] = 3;
        if (dist <= 30) labelMap[y * width + x] = 4; // Inner icon B
      }
    }
    const badgeBRing: ArtworkComponent = {
      id: 'comp_badge_b_ring',
      label: 3,
      bounds: { x: 320, y: 65, width: 121, height: 121 },
      centroid: { x: 380, y: 125 },
      pixelCount: 3500,
      isTiny: false
    };
    const badgeBInner: ArtworkComponent = {
      id: 'comp_badge_b_inner',
      label: 4,
      bounds: { x: 350, y: 95, width: 61, height: 61 },
      centroid: { x: 380, y: 125 },
      pixelCount: 2800,
      isTiny: false
    };

    // Decorative star sitting midway between the two badges (at x: 240, y: 125)
    for (let y = 118; y <= 132; y++) {
      for (let x = 233; x <= 247; x++) {
        labelMap[y * width + x] = 5;
      }
    }
    const midStar: ArtworkComponent = {
      id: 'comp_mid_star',
      label: 5,
      bounds: { x: 233, y: 118, width: 15, height: 15 },
      centroid: { x: 240, y: 125 },
      pixelCount: 225,
      isTiny: true
    };

    const components = [badgeARing, badgeAInner, badgeBRing, badgeBInner, midStar];
    const groups = proposeStickerGroups(components, 35, true, labelMap, width, height);

    // Grouping MUST maintain Badge A and Badge B as separate stickers!
    const groupA = groups.find(g => g.componentIds.includes('comp_badge_a_ring'))!;
    const groupB = groups.find(g => g.componentIds.includes('comp_badge_b_ring'))!;

    expect(groupA).toBeDefined();
    expect(groupB).toBeDefined();
    expect(groupA.id).not.toBe(groupB.id);

    // Badge A must not contain any component from Badge B, and vice-versa
    expect(groupA.componentIds).not.toContain('comp_badge_b_ring');
    expect(groupA.componentIds).not.toContain('comp_badge_b_inner');
    expect(groupB.componentIds).not.toContain('comp_badge_a_ring');
    expect(groupB.componentIds).not.toContain('comp_badge_a_inner');

    await exportGroupPng(groupA, components, labelMap, width, height, 'test6_badge_a.png');
    await exportGroupPng(groupB, components, labelMap, width, height, 'test6_badge_b.png');
  });
});
