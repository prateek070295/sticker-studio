/**
 * Backing bridge rasterization.
 * Renders connector bridges into a group's binary backing mask
 * so that multi-piece stickers can form a single physically connected die-cut cut-line.
 */

import { ConnectorBridge } from '../types';

/**
 * Draws a thick rounded capsule bridge between (x1, y1) and (x2, y2)
 * into a local binary backing mask (offset by group bounds.x, bounds.y).
 */
export function rasterizeBridge(
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  offsetX: number,
  offsetY: number,
  bridge: ConnectorBridge
): void {
  if (!bridge.enabled) return;

  const lx1 = bridge.x1 - offsetX;
  const ly1 = bridge.y1 - offsetY;
  const lx2 = bridge.x2 - offsetX;
  const ly2 = bridge.y2 - offsetY;

  const dx = lx2 - lx1;
  const dy = ly2 - ly1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const radius = bridge.width / 2;
  const minX = Math.max(0, Math.floor(Math.min(lx1, lx2) - radius));
  const maxX = Math.min(maskWidth - 1, Math.ceil(Math.max(lx1, lx2) + radius));
  const minY = Math.max(0, Math.floor(Math.min(ly1, ly2) - radius));
  const maxY = Math.min(maskHeight - 1, Math.ceil(Math.max(ly1, ly2) + radius));

  const invLenSq = 1 / (len * len);

  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * maskWidth;
    for (let x = minX; x <= maxX; x++) {
      // Distance from point (x, y) to line segment (lx1, ly1)-(lx2, ly2)
      const t = Math.max(0, Math.min(1, ((x - lx1) * dx + (y - ly1) * dy) * invLenSq));
      const projX = lx1 + t * dx;
      const projY = ly1 + t * dy;
      const distSq = (x - projX) * (x - projX) + (y - projY) * (y - projY);

      if (distSq <= radius * radius) {
        mask[rowOffset + x] = 1; // Mark as backing seed
      }
    }
  }
}
