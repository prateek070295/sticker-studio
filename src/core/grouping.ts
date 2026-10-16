/**
 * Intelligent Component Grouping Algorithm.
 * Implements graph-based affinity scoring, title banner detection,
 * and satellite component attachment (sparkles/droplets to parent illustrations)
 * with strict guards against runaway transitive chaining.
 */

import { ArtworkComponent, BoundingBox, ConnectorBridge, StickerGroup } from '../types';

/**
 * Computes Manhattan/Euclidean distance between two bounding boxes.
 * Returns 0 if boxes overlap.
 */
export function bboxDistance(b1: BoundingBox, b2: BoundingBox): number {
  const dx = Math.max(0, Math.max(b1.x - (b2.x + b2.width), b2.x - (b1.x + b1.width)));
  const dy = Math.max(0, Math.max(b1.y - (b2.y + b2.height), b2.y - (b1.y + b1.height)));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Union bounding boxes.
 */
export function unionBounds(bounds: BoundingBox[]): BoundingBox {
  if (bounds.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = bounds[0].x;
  let minY = bounds[0].y;
  let maxX = bounds[0].x + bounds[0].width;
  let maxY = bounds[0].y + bounds[0].height;

  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i];
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Proposes initial sticker groups from detected artwork components.
 */
export function proposeStickerGroups(
  components: ArtworkComponent[],
  proximityThreshold: number = 40,
  detectTitles: boolean = true
): StickerGroup[] {
  if (components.length === 0) return [];

  const compMap = new Map<string, ArtworkComponent>();
  components.forEach(c => compMap.set(c.id, c));

  // Classification: large main illustrations vs small satellite pieces
  // Threshold roughly 800-1200 pixels
  const isLarge = (c: ArtworkComponent) => c.pixelCount >= 700;
  const isTitleCandidate = (c: ArtworkComponent) =>
    c.pixelCount >= 80 && c.pixelCount < 1800 && c.bounds.height < 150;

  const assignedGroups: Array<Set<string>> = [];
  const assignedCompIds = new Set<string>();

  // --- STEP 1: Title Banner Detection ---
  if (detectTitles) {
    const titleCandidates = components.filter(isTitleCandidate);
    // Find horizontally aligned letters with similar baseline and height
    const sortedByY = [...titleCandidates].sort((a, b) => a.bounds.y - b.bounds.y);

    for (let i = 0; i < sortedByY.length; i++) {
      const c1 = sortedByY[i];
      if (assignedCompIds.has(c1.id)) continue;

      const titleGroup = new Set<string>([c1.id]);
      const baseMidY = c1.bounds.y + c1.bounds.height / 2;
      const baseHeight = c1.bounds.height;

      for (let j = 0; j < sortedByY.length; j++) {
        if (i === j) continue;
        const c2 = sortedByY[j];
        if (assignedCompIds.has(c2.id)) continue;

        const c2MidY = c2.bounds.y + c2.bounds.height / 2;
        const yDiff = Math.abs(c2MidY - baseMidY);
        const hRatio = Math.min(baseHeight, c2.bounds.height) / Math.max(baseHeight, c2.bounds.height);

        // Similar baseline and comparable font size
        if (yDiff < 25 && hRatio > 0.4) {
          // Check horizontal proximity to any letter already in titleGroup
          for (const memberId of titleGroup) {
            const member = compMap.get(memberId)!;
            const dist = bboxDistance(member.bounds, c2.bounds);
            // Letters in a word/title are typically within 20-50px of each other
            if (dist < proximityThreshold * 1.3) {
              titleGroup.add(c2.id);
              break;
            }
          }
        }
      }

      // If at least 3 letters/symbols were grouped horizontally, accept as title
      if (titleGroup.size >= 3) {
        titleGroup.forEach(id => assignedCompIds.add(id));
        assignedGroups.push(titleGroup);
      }
    }
  }

  // --- STEP 2: Main Illustrations as Group Anchors ---
  // Large components start as their own independent group anchor
  const anchorComps = components.filter(c => !assignedCompIds.has(c.id) && isLarge(c));
  for (const anchor of anchorComps) {
    const group = new Set<string>([anchor.id]);
    assignedCompIds.add(anchor.id);
    assignedGroups.push(group);
  }

  // --- STEP 3: Attach Small Satellite Components (sparkles, seeds, droplets) ---
  // Small components attach strictly to their SINGLE nearest anchor if within threshold
  const remainingComps = components.filter(c => !assignedCompIds.has(c.id));

  for (const small of remainingComps) {
    let bestGroup: Set<string> | null = null;
    let minDistance = Infinity;

    for (const group of assignedGroups) {
      // Find closest component in this group
      for (const memberId of group) {
        const member = compMap.get(memberId)!;
        const dist = bboxDistance(small.bounds, member.bounds);
        if (dist < minDistance) {
          minDistance = dist;
          bestGroup = group;
        }
      }
    }

    // Attach to nearest group if within proximity threshold
    if (bestGroup && minDistance <= proximityThreshold) {
      bestGroup.add(small.id);
      assignedCompIds.add(small.id);
    } else {
      // Otherwise, creates its own standalone group (e.g. isolated small sticker)
      const soloGroup = new Set<string>([small.id]);
      assignedCompIds.add(small.id);
      assignedGroups.push(soloGroup);
    }
  }

  // --- STEP 4: Build StickerGroup objects ---
  const groups: StickerGroup[] = assignedGroups.map((groupSet, idx) => {
    const compIds = Array.from(groupSet);
    const boundsList = compIds.map(id => compMap.get(id)!.bounds);
    const bounds = unionBounds(boundsList);
    const groupId = `group_${idx + 1}`;
    const name = `sticker_${String(idx + 1).padStart(3, '0')}`;

    // Auto-generate connector bridges for multi-part groups
    const bridges: ConnectorBridge[] = [];
    if (compIds.length > 1) {
      for (let i = 0; i < compIds.length; i++) {
        const c1 = compMap.get(compIds[i])!;
        let nearestOther: ArtworkComponent | null = null;
        let nearDist = Infinity;

        for (let j = 0; j < compIds.length; j++) {
          if (i === j) continue;
          const c2 = compMap.get(compIds[j])!;
          const d = bboxDistance(c1.bounds, c2.bounds);
          if (d < nearDist) {
            nearDist = d;
            nearestOther = c2;
          }
        }

        if (nearestOther && nearDist < proximityThreshold * 1.5) {
          bridges.push({
            id: `bridge_${c1.id}_${nearestOther.id}`,
            fromCompId: c1.id,
            toCompId: nearestOther.id,
            x1: c1.centroid.x,
            y1: c1.centroid.y,
            x2: nearestOther.centroid.x,
            y2: nearestOther.centroid.y,
            width: 14,
            enabled: true
          });
        }
      }
    }

    return {
      id: groupId,
      name,
      componentIds: compIds,
      bounds,
      borderThickness: 20, // default 20px smooth die-cut border
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: false,
      bridges,
      excludedFromExport: false
    };
  });

  // Sort groups top-to-bottom, left-to-right for predictable ordering
  return groups.sort((a, b) => {
    const rowA = Math.floor(a.bounds.y / 150);
    const rowB = Math.floor(b.bounds.y / 150);
    if (rowA !== rowB) return rowA - rowB;
    return a.bounds.x - b.bounds.x;
  });
}
