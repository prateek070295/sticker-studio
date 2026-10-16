/**
 * Pointer event controller for continuous brush stroke capture and rasterization.
 */

import { useState, useCallback, useRef } from 'react';
import { MaskPatch, StrokePoint } from '../../../types';
import { applyBrushStroke, BrushOptions } from '../../../core/maskPatch';

interface UseBrushToolProps {
  alphaMask: Uint8Array | null;
  sheetWidth: number;
  sheetHeight: number;
  onApplyPatch: (patch: MaskPatch) => void;
  options: BrushOptions;
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
}

export function useBrushTool({
  alphaMask,
  sheetWidth,
  sheetHeight,
  onApplyPatch,
  options,
  screenToCanvas
}: UseBrushToolProps) {
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const pointsRef = useRef<StrokePoint[]>([]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || !alphaMask) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const pos = screenToCanvas(e.clientX, e.clientY);
    pointsRef.current = [pos];
    setIsDrawing(true);
    setCursorPos(pos);
  }, [alphaMask, screenToCanvas]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pos = screenToCanvas(e.clientX, e.clientY);
    setCursorPos(pos);

    if (!isDrawing || !alphaMask) return;
    pointsRef.current.push(pos);
  }, [isDrawing, alphaMask, screenToCanvas]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawing || !alphaMask) return;
    setIsDrawing(false);

    const points = pointsRef.current;
    if (points.length > 0) {
      const patch = applyBrushStroke(
        alphaMask,
        sheetWidth,
        sheetHeight,
        points,
        options
      );
      if (patch) {
        onApplyPatch(patch);
      }
    }
    pointsRef.current = [];
  }, [isDrawing, alphaMask, sheetWidth, sheetHeight, options, onApplyPatch]);

  const handlePointerLeave = useCallback(() => {
    setCursorPos(null);
  }, []);

  return {
    isDrawing,
    cursorPos,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave
  };
}
