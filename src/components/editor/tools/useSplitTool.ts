/**
 * Controller hook for constrained touching-object splitting (cut-line or dual seeds)
 * with live color-coded preview and transactional commit.
 */

import { useState, useCallback } from 'react';
import { ArtworkComponent, SplitPreview, TouchingSplitRequest } from '../../../types';
import { previewTouchingSplit } from '../../../core/watershedSplit';

interface UseSplitToolProps {
  targetComponent: ArtworkComponent | null;
  imageRgba: Uint8ClampedArray | null;
  alphaMask: Uint8Array | null;
  labelMap: Uint16Array | null;
  sheetWidth: number;
  onCommitSplit: (compId: string, request: TouchingSplitRequest) => boolean;
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
}

export function useSplitTool({
  targetComponent,
  imageRgba,
  alphaMask,
  labelMap,
  sheetWidth,
  onCommitSplit,
  screenToCanvas
}: UseSplitToolProps) {
  const [splitMode, setSplitMode] = useState<'cut-line' | 'seeds'>('cut-line');
  const [cutLine, setCutLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isDrawingLine, setIsDrawingLine] = useState<boolean>(false);
  const [seedA, setSeedA] = useState<{ x: number; y: number } | null>(null);
  const [seedB, setSeedB] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<SplitPreview | null>(null);

  const updatePreview = useCallback((req: TouchingSplitRequest) => {
    if (!targetComponent || !imageRgba || !alphaMask || !labelMap) return;
    const res = previewTouchingSplit(
      targetComponent,
      imageRgba,
      alphaMask,
      labelMap,
      sheetWidth,
      req
    );
    setPreview(res);
  }, [targetComponent, imageRgba, alphaMask, labelMap, sheetWidth]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || !targetComponent) return;
    const pos = screenToCanvas(e.clientX, e.clientY);

    if (splitMode === 'cut-line') {
      setIsDrawingLine(true);
      setCutLine({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
    } else {
      // Seeds mode
      if (!seedA) {
        setSeedA(pos);
      } else if (!seedB) {
        setSeedB(pos);
        updatePreview({
          componentId: targetComponent.id,
          mode: 'seeds',
          seedA,
          seedB: pos
        });
      } else {
        // Reset and start with seedA again
        setSeedA(pos);
        setSeedB(null);
        setPreview(null);
      }
    }
  }, [targetComponent, screenToCanvas, splitMode, seedA, seedB, updatePreview]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawingLine || !cutLine || splitMode !== 'cut-line') return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    setCutLine(prev => prev ? { ...prev, x2: pos.x, y2: pos.y } : null);
  }, [isDrawingLine, cutLine, splitMode, screenToCanvas]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingLine || !cutLine || !targetComponent || splitMode !== 'cut-line') return;
    setIsDrawingLine(false);

    updatePreview({
      componentId: targetComponent.id,
      mode: 'cut-line',
      cutLine
    });
  }, [isDrawingLine, cutLine, targetComponent, splitMode, updatePreview]);

  const commit = useCallback(() => {
    if (!targetComponent || !preview) return false;
    const req: TouchingSplitRequest = {
      componentId: targetComponent.id,
      mode: splitMode,
      cutLine: cutLine || undefined,
      seedA: seedA || undefined,
      seedB: seedB || undefined
    };

    const success = onCommitSplit(targetComponent.id, req);
    if (success) {
      setPreview(null);
      setCutLine(null);
      setSeedA(null);
      setSeedB(null);
    }
    return success;
  }, [targetComponent, preview, splitMode, cutLine, seedA, seedB, onCommitSplit]);

  const reset = useCallback(() => {
    setPreview(null);
    setCutLine(null);
    setSeedA(null);
    setSeedB(null);
  }, []);

  return {
    splitMode,
    setSplitMode,
    cutLine,
    seedA,
    seedB,
    preview,
    isDrawingLine,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    commit,
    reset
  };
}
