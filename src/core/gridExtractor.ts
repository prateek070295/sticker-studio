/**
 * Grid / Contact Sheet Mode Processor.
 * Provides reliable, structured partitioning for regular grid sticker sheets (e.g. 4x5 layout).
 * Partitions sheet into distinct cells, divides artwork regions from caption bands,
 * and builds exactly one logical sticker group per approved artwork cell.
 */

import { ArtworkComponent, BoundingBox, GridCell, GridSheetConfig, StickerGroup } from '../types';
import { unionBounds } from './grouping';

export const DEFAULT_GRID_CONFIG: GridSheetConfig = {
  enabled: false,
  columns: 4,
  rows: 5,
  margin: { top: 10, right: 10, bottom: 10, left: 10 },
  excludeCaptions: true,
  captionHeightPercent: 12
};

/**
 * Computes individual grid cells based on configuration and sheet dimensions.
 */
export function computeGridCells(
  sheetWidth: number,
  sheetHeight: number,
  config: GridSheetConfig
): GridCell[] {
  const { columns, rows, margin, excludeCaptions, captionHeightPercent } = config;
  const availWidth = Math.max(1, sheetWidth - margin.left - margin.right);
  const availHeight = Math.max(1, sheetHeight - margin.top - margin.bottom);

  // Compute column dividing boundaries
  const colWidth = availWidth / columns;
  const rowHeight = availHeight / rows;

  const cells: GridCell[] = [];

  for (let r = 0; r < rows; r++) {
    const y = Math.round(margin.top + r * rowHeight);
    const cellH = Math.round((r === rows - 1) ? (sheetHeight - margin.bottom - y) : rowHeight);

    // Compute caption split if enabled
    let artH = cellH;
    let capBounds: BoundingBox | undefined = undefined;

    if (excludeCaptions && captionHeightPercent > 0) {
      const capH = Math.max(12, Math.round(cellH * (captionHeightPercent / 100)));
      artH = cellH - capH;
      capBounds = {
        x: 0, // will be set per column below
        y: y + artH,
        width: 0,
        height: capH
      };
    }

    for (let c = 0; c < columns; c++) {
      const x = Math.round(margin.left + c * colWidth);
      const cellW = Math.round((c === columns - 1) ? (sheetWidth - margin.right - x) : colWidth);

      const cellBounds: BoundingBox = {
        x,
        y,
        width: cellW,
        height: cellH
      };

      const artworkBounds: BoundingBox = {
        x,
        y,
        width: cellW,
        height: artH
      };

      let finalCapBounds: BoundingBox | undefined = undefined;
      if (capBounds) {
        finalCapBounds = {
          x,
          y: capBounds.y,
          width: cellW,
          height: capBounds.height
        };
      }

      cells.push({
        row: r,
        col: c,
        cellBounds,
        artworkBounds,
        captionBounds: finalCapBounds,
        hasCaption: !!finalCapBounds
      });
    }
  }

  return cells;
}

export interface GridPartitionResult {
  groups: StickerGroup[];
  cellAssignments: Map<string, string[]>; // cellId -> compIds
  boundaryCrossingComponents: ArtworkComponent[];
  excludedCaptionGroupIds: string[];
}

/**
 * Assigns artwork components to grid cells, separating illustrations from caption bands.
 * Guarantees exactly one logical sticker group per approved artwork region.
 */
export function partitionGridComponents(
  components: ArtworkComponent[],
  cells: GridCell[],
  config: GridSheetConfig
): GridPartitionResult {
  const cellAssignments = new Map<string, string[]>();
  const captionAssignments = new Map<string, string[]>();
  const boundaryCrossingComponents: ArtworkComponent[] = [];
  const compMap = new Map<string, ArtworkComponent>();

  cells.forEach((cell, idx) => {
    cellAssignments.set(`cell_${cell.row}_${cell.col}`, []);
    if (cell.captionBounds) {
      captionAssignments.set(`cap_${cell.row}_${cell.col}`, []);
    }
  });

  components.forEach(comp => {
    compMap.set(comp.id, comp);
    const { centroid, bounds } = comp;

    // Find the cell containing the component centroid
    let matchedCell: GridCell | null = null;
    for (const cell of cells) {
      const cb = cell.cellBounds;
      if (
        centroid.x >= cb.x &&
        centroid.x < cb.x + cb.width &&
        centroid.y >= cb.y &&
        centroid.y < cb.y + cb.height
      ) {
        matchedCell = cell;
        break;
      }
    }

    if (!matchedCell) {
      // Centroid fell into sheet margin; find nearest cell
      let bestDist = Infinity;
      for (const cell of cells) {
        const cb = cell.cellBounds;
        const cx = cb.x + cb.width / 2;
        const cy = cb.y + cb.height / 2;
        const d = Math.hypot(centroid.x - cx, centroid.y - cy);
        if (d < bestDist) {
          bestDist = d;
          matchedCell = cell;
        }
      }
    }

    if (!matchedCell) return;

    // Check if component significantly crosses cell boundaries (more than 5px overlap into neighbour)
    const cb = matchedCell.cellBounds;
    const isCrossing =
      bounds.x < cb.x - 5 ||
      bounds.x + bounds.width > cb.x + cb.width + 5 ||
      bounds.y < cb.y - 5 ||
      bounds.y + bounds.height > cb.y + cb.height + 5;

    if (isCrossing && !comp.isTiny) {
      boundaryCrossingComponents.push(comp);
    }

    const cellKey = `cell_${matchedCell.row}_${matchedCell.col}`;
    const capKey = `cap_${matchedCell.row}_${matchedCell.col}`;

    // Test if component is inside the caption band
    if (
      config.excludeCaptions &&
      matchedCell.captionBounds &&
      centroid.y >= matchedCell.captionBounds.y &&
      bounds.height <= 20 // Guard: only shallow text-height elements
    ) {
      captionAssignments.get(capKey)?.push(comp.id);
    } else {
      cellAssignments.get(cellKey)?.push(comp.id);
    }
  });

  // Construct StickerGroup objects: exactly 1 logical group per cell with artwork
  const groups: StickerGroup[] = [];
  const excludedCaptionGroupIds: string[] = [];
  let stickerIndex = 1;

  for (const cell of cells) {
    const cellKey = `cell_${cell.row}_${cell.col}`;
    const compIds = cellAssignments.get(cellKey) || [];

    if (compIds.length > 0) {
      const boundsList = compIds.map(id => compMap.get(id)!.bounds);
      const bounds = unionBounds(boundsList);
      const groupId = `group_cell_${cell.row}_${cell.col}`;
      const name = `sticker_${String(stickerIndex++).padStart(3, '0')}`;

      groups.push({
        id: groupId,
        name,
        componentIds: compIds,
        bounds,
        borderThickness: 20,
        customBorder: false,
        whiteBackingEnabled: true,
        connectBacking: true,
        solidBacking: false,
        bridges: [],
        excludedFromExport: false
      });
    }

    // If caption components exist, group them into an excluded metadata group
    if (config.excludeCaptions && cell.captionBounds) {
      const capKey = `cap_${cell.row}_${cell.col}`;
      const capCompIds = captionAssignments.get(capKey) || [];
      if (capCompIds.length > 0) {
        const capBoundsList = capCompIds.map(id => compMap.get(id)!.bounds);
        const capBounds = unionBounds(capBoundsList);
        const capGroupId = `group_caption_${cell.row}_${cell.col}`;
        const capName = `caption_r${cell.row + 1}_c${cell.col + 1}`;

        groups.push({
          id: capGroupId,
          name: capName,
          componentIds: capCompIds,
          bounds: capBounds,
          borderThickness: 0,
          customBorder: true,
          whiteBackingEnabled: false,
          connectBacking: false,
          solidBacking: false,
          bridges: [],
          excludedFromExport: true // Excluded by default, but recoverable
        });
        excludedCaptionGroupIds.push(capGroupId);
      }
    }
  }

  return {
    groups,
    cellAssignments,
    boundaryCrossingComponents,
    excludedCaptionGroupIds
  };
}
