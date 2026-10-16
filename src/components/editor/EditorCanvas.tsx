/**
 * High-performance canvas and interaction overlay for sticker editing.
 */

import React, { useRef, useEffect } from 'react';
import { BoundingBox, SplitPreview } from '../../types';

interface EditorCanvasProps {
  composedRgba: Uint8ClampedArray | null;
  canvasWidth: number;
  canvasHeight: number;
  patchBounds: BoundingBox;
  brushCursor: { x: number; y: number } | null;
  brushRadius: number;
  brushHardness: number;
  splitCutLine: { x1: number; y1: number; x2: number; y2: number } | null;
  seedA: { x: number; y: number } | null;
  seedB: { x: number; y: number } | null;
  splitPreview: SplitPreview | null;
  highlightedBox: BoundingBox | null;
  showBeforeAfter: boolean;
  beforeRgba?: Uint8ClampedArray | null;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  composedRgba,
  canvasWidth,
  canvasHeight,
  patchBounds,
  brushCursor,
  brushRadius,
  brushHardness,
  splitCutLine,
  seedA,
  seedB,
  splitPreview,
  highlightedBox,
  showBeforeAfter,
  beforeRgba
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render sticker pixel buffer
  useEffect(() => {
    if (!canvasRef.current || !composedRgba || canvasWidth <= 0 || canvasHeight <= 0) return;
    if (composedRgba.length !== canvasWidth * canvasHeight * 4) return;
    const canvas = canvasRef.current;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (showBeforeAfter && beforeRgba && beforeRgba.length === composedRgba.length) {
      // Split view: Left half shows Before, Right half shows After
      const splitX = Math.round(canvasWidth / 2);
      const blended = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);

      for (let y = 0; y < canvasHeight; y++) {
        const rowOffset = y * canvasWidth * 4;
        for (let x = 0; x < canvasWidth; x++) {
          const idx = rowOffset + x * 4;
          const src = x < splitX ? beforeRgba : composedRgba;
          blended[idx] = src[idx];
          blended[idx + 1] = src[idx + 1];
          blended[idx + 2] = src[idx + 2];
          blended[idx + 3] = src[idx + 3];

          // Draw vertical divider line
          if (x === splitX) {
            blended[idx] = 236; // Pink divider
            blended[idx + 1] = 72;
            blended[idx + 2] = 153;
            blended[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(new ImageData(blended, canvasWidth, canvasHeight), 0, 0);
    } else {
      ctx.putImageData(new ImageData(composedRgba, canvasWidth, canvasHeight), 0, 0);
    }
  }, [composedRgba, canvasWidth, canvasHeight, showBeforeAfter, beforeRgba]);

  return (
    <div
      className="relative checker-bg shadow-lg rounded select-none"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="block"
      />

      {/* Interactive Vector Overlay */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      >
        {/* Brush Cursor */}
        {brushCursor && (
          <g transform={`translate(${brushCursor.x - patchBounds.x}, ${brushCursor.y - patchBounds.y})`}>
            {/* Outer radius */}
            <circle
              r={brushRadius}
              fill="rgba(236, 72, 153, 0.12)"
              stroke="#ec4899"
              strokeWidth="1.5"
            />
            {/* Inner hardness radius */}
            {brushHardness < 1 && (
              <circle
                r={brushRadius * brushHardness}
                fill="none"
                stroke="#ec4899"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            )}
            {/* Center dot */}
            <circle r="1.5" fill="#ec4899" />
          </g>
        )}

        {/* Split Cut Line */}
        {splitCutLine && (
          <line
            x1={splitCutLine.x1 - patchBounds.x}
            y1={splitCutLine.y1 - patchBounds.y}
            x2={splitCutLine.x2 - patchBounds.x}
            y2={splitCutLine.y2 - patchBounds.y}
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeDasharray="4,4"
          />
        )}

        {/* Split Seed A */}
        {seedA && (
          <g transform={`translate(${seedA.x - patchBounds.x}, ${seedA.y - patchBounds.y})`}>
            <circle r="7" fill="#06b6d4" stroke="#ffffff" strokeWidth="2" />
            <text textAnchor="middle" dy="3.5" fontSize="9" fill="#ffffff" fontWeight="bold">A</text>
          </g>
        )}

        {/* Split Seed B */}
        {seedB && (
          <g transform={`translate(${seedB.x - patchBounds.x}, ${seedB.y - patchBounds.y})`}>
            <circle r="7" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
            <text textAnchor="middle" dy="3.5" fontSize="9" fill="#ffffff" fontWeight="bold">B</text>
          </g>
        )}

        {/* Split Partition Preview Overlay */}
        {splitPreview && (
          <g transform={`translate(${splitPreview.bounds.x - patchBounds.x}, ${splitPreview.bounds.y - patchBounds.y})`}>
            {/* Rect for bounding feedback */}
            <rect
              width={splitPreview.bounds.width}
              height={splitPreview.bounds.height}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          </g>
        )}

        {/* Highlighted Warning Box */}
        {highlightedBox && (
          <rect
            x={highlightedBox.x - patchBounds.x}
            y={highlightedBox.y - patchBounds.y}
            width={highlightedBox.width}
            height={highlightedBox.height}
            fill="rgba(245, 158, 11, 0.2)"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeDasharray="4,4"
          />
        )}
      </svg>
    </div>
  );
};
