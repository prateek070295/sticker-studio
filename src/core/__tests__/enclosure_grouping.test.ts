import { describe, it, expect } from 'vitest';
import { ArtworkComponent } from '../../types';
import { isComponentEnclosed, detectEnclosures } from '../enclosure';
import { proposeStickerGroupsGeometricOnly } from '../grouping';

describe('Enclosure-Aware Sticker Grouping Unit Tests', () => {

  it('Case 1: Full Circular Badge with Ring, Contained Curved Text, Stars, Center Illustration', () => {
    // Outer circular badge ring
    const ring: ArtworkComponent = {
      id: 'comp_ring',
      label: 1,
      bounds: { x: 50, y: 50, width: 200, height: 200 },
      centroid: { x: 150, y: 150 },
      pixelCount: 4500,
      isTiny: false
    };

    // "CHAI" text (fits isTitleCandidate: pixels 80..1800, height < 150)
    const textChai: ArtworkComponent = {
      id: 'comp_text_chai',
      label: 2,
      bounds: { x: 90, y: 70, width: 120, height: 25 },
      centroid: { x: 150, y: 82 },
      pixelCount: 420,
      isTiny: false
    };

    // Left star
    const starLeft: ArtworkComponent = {
      id: 'comp_star_left',
      label: 3,
      bounds: { x: 65, y: 100, width: 15, height: 15 },
      centroid: { x: 72, y: 107 },
      pixelCount: 85,
      isTiny: true
    };

    // Right star
    const starRight: ArtworkComponent = {
      id: 'comp_star_right',
      label: 4,
      bounds: { x: 220, y: 100, width: 15, height: 15 },
      centroid: { x: 227, y: 107 },
      pixelCount: 85,
      isTiny: true
    };

    // Center illustration (fits isLarge: pixelCount >= 700)
    const centerCup: ArtworkComponent = {
      id: 'comp_cup',
      label: 5,
      bounds: { x: 110, y: 110, width: 80, height: 80 },
      centroid: { x: 150, y: 150 },
      pixelCount: 2800,
      isTiny: false
    };

    // "APPROVED" text (fits isTitleCandidate)
    const textApproved: ArtworkComponent = {
      id: 'comp_text_approved',
      label: 6,
      bounds: { x: 75, y: 205, width: 150, height: 25 },
      centroid: { x: 150, y: 217 },
      pixelCount: 650,
      isTiny: false
    };

    const components = [ring, textChai, starLeft, starRight, centerCup, textApproved];

    // Verify enclosure detection directly
    expect(isComponentEnclosed(textChai, ring)).toBe(true);
    expect(isComponentEnclosed(starLeft, ring)).toBe(true);
    expect(isComponentEnclosed(starRight, ring)).toBe(true);
    expect(isComponentEnclosed(centerCup, ring)).toBe(true);
    expect(isComponentEnclosed(textApproved, ring)).toBe(true);

    const enclosures = detectEnclosures(components);
    expect(enclosures.has(ring.id)).toBe(true);
    const enclosedIds = enclosures.get(ring.id)!;
    expect(enclosedIds.size).toBe(5);

    // Grouping must unify all 6 pieces into exactly 1 sticker group
    const groups = proposeStickerGroupsGeometricOnly(components, 35, true);
    expect(groups.length).toBe(1);

    const badgeGroup = groups[0];
    expect(badgeGroup.componentIds).toHaveLength(6);
    expect(badgeGroup.componentIds).toContain('comp_ring');
    expect(badgeGroup.componentIds).toContain('comp_text_chai');
    expect(badgeGroup.componentIds).toContain('comp_star_left');
    expect(badgeGroup.componentIds).toContain('comp_star_right');
    expect(badgeGroup.componentIds).toContain('comp_cup');
    expect(badgeGroup.componentIds).toContain('comp_text_approved');

    // Bounds must encompass the entire badge
    expect(badgeGroup.bounds.x).toBe(50);
    expect(badgeGroup.bounds.y).toBe(50);
    expect(badgeGroup.bounds.width).toBe(200);
    expect(badgeGroup.bounds.height).toBe(200);

    // Crucial requirement: Centroid connector bridges must NOT be generated across badge interior
    expect(badgeGroup.bridges).toHaveLength(0);
  });

  it('Case 2: External Sheet Caption Directly Below Badge Does NOT Leak Into Badge', () => {
    const ring: ArtworkComponent = {
      id: 'comp_ring',
      label: 1,
      bounds: { x: 50, y: 50, width: 200, height: 200 },
      centroid: { x: 150, y: 150 },
      pixelCount: 4500,
      isTiny: false
    };

    const centerCup: ArtworkComponent = {
      id: 'comp_cup',
      label: 2,
      bounds: { x: 110, y: 110, width: 80, height: 80 },
      centroid: { x: 150, y: 150 },
      pixelCount: 2800,
      isTiny: false
    };

    // External caption 20px below badge (within standard proximity threshold of 35px)
    const caption: ArtworkComponent = {
      id: 'comp_caption',
      label: 3,
      bounds: { x: 60, y: 270, width: 180, height: 11 },
      centroid: { x: 150, y: 275 },
      pixelCount: 520,
      isTiny: false
    };

    const components = [ring, centerCup, caption];
    const groups = proposeStickerGroupsGeometricOnly(components, 35, true);

    // Should create 2 distinct groups: 1 for the badge, 1 for the caption
    expect(groups.length).toBe(2);

    const badgeGroup = groups.find(g => g.componentIds.includes('comp_ring'))!;
    expect(badgeGroup.componentIds).not.toContain('comp_caption');
    expect(badgeGroup.componentIds).toContain('comp_cup');
    expect(badgeGroup.bounds.height).toBe(200); // Does NOT expand to include caption at y=270
  });

  it('Case 3: Two Adjacent Badges on a Sheet Maintain Complete Separation', () => {
    // Badge 1 (CHAI APPROVED at x: 50)
    const badge1Ring: ArtworkComponent = {
      id: 'b1_ring',
      label: 1,
      bounds: { x: 50, y: 100, width: 140, height: 140 },
      centroid: { x: 120, y: 170 },
      pixelCount: 3000,
      isTiny: false
    };
    const b1Inner: ArtworkComponent = {
      id: 'b1_cup',
      label: 2,
      bounds: { x: 80, y: 130, width: 80, height: 80 },
      centroid: { x: 120, y: 170 },
      pixelCount: 1500,
      isTiny: false
    };

    // Badge 2 (CHAI BREAK DEPT at x: 230)
    const badge2Ring: ArtworkComponent = {
      id: 'b2_ring',
      label: 3,
      bounds: { x: 230, y: 100, width: 140, height: 140 },
      centroid: { x: 300, y: 170 },
      pixelCount: 3200,
      isTiny: false
    };
    const b2Inner: ArtworkComponent = {
      id: 'b2_cup',
      label: 4,
      bounds: { x: 260, y: 130, width: 80, height: 80 },
      centroid: { x: 300, y: 170 },
      pixelCount: 1600,
      isTiny: false
    };

    const components = [badge1Ring, b1Inner, badge2Ring, b2Inner];
    const groups = proposeStickerGroupsGeometricOnly(components, 35, true);

    expect(groups.length).toBe(2);

    const g1 = groups.find(g => g.componentIds.includes('b1_ring'))!;
    expect(g1.componentIds).toEqual(['b1_ring', 'b1_cup']);

    const g2 = groups.find(g => g.componentIds.includes('b2_ring'))!;
    expect(g2.componentIds).toEqual(['b2_ring', 'b2_cup']);
  });

  it('Case 4: Free-Standing Sheet Titles Still Group Correctly', () => {
    // 3 horizontally aligned word components for "STICKER STUDIO SHEET"
    const word1: ArtworkComponent = {
      id: 'word_1',
      label: 1,
      bounds: { x: 100, y: 20, width: 60, height: 22 },
      centroid: { x: 130, y: 31 },
      pixelCount: 350,
      isTiny: false
    };
    const word2: ArtworkComponent = {
      id: 'word_2',
      label: 2,
      bounds: { x: 170, y: 21, width: 55, height: 21 },
      centroid: { x: 197, y: 31 },
      pixelCount: 320,
      isTiny: false
    };
    const word3: ArtworkComponent = {
      id: 'word_3',
      label: 3,
      bounds: { x: 235, y: 20, width: 50, height: 22 },
      centroid: { x: 260, y: 31 },
      pixelCount: 290,
      isTiny: false
    };

    const components = [word1, word2, word3];
    const groups = proposeStickerGroupsGeometricOnly(components, 35, true);

    expect(groups.length).toBe(1);
    expect(groups[0].componentIds).toHaveLength(3);
    expect(groups[0].componentIds).toContain('word_1');
    expect(groups[0].componentIds).toContain('word_2');
    expect(groups[0].componentIds).toContain('word_3');
  });

  it('Case 5: Multi-Piece Non-Badge Illustrations Still Attach Satellites & Receive Bridges', () => {
    const mainCharacter: ArtworkComponent = {
      id: 'char_main',
      label: 1,
      bounds: { x: 100, y: 100, width: 90, height: 90 },
      centroid: { x: 145, y: 145 },
      pixelCount: 3500,
      isTiny: false
    };

    const heart: ArtworkComponent = {
      id: 'satellite_heart',
      label: 2,
      bounds: { x: 195, y: 95, width: 18, height: 18 },
      centroid: { x: 204, y: 104 },
      pixelCount: 95,
      isTiny: true
    };

    const components = [mainCharacter, heart];
    const groups = proposeStickerGroupsGeometricOnly(components, 35, true);

    expect(groups.length).toBe(1);
    const grp = groups[0];
    expect(grp.componentIds).toContain('char_main');
    expect(grp.componentIds).toContain('satellite_heart');
    // For non-badge multi-piece illustrations, connector bridges ARE generated
    expect(grp.bridges.length).toBeGreaterThanOrEqual(1);
  });
});
