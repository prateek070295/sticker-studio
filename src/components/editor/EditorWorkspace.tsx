/**
 * Viewport container handling 60 FPS pan, zoom, and coordinate projections.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { BoundingBox, ToolMode } from '../../types';

interface EditorWorkspaceProps {
  patchBounds: BoundingBox;
  toolMode: ToolMode;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  screenToCanvasRef: React.MutableRefObject<((clientX: number, clientY: number) => { x: number; y: number }) | null>;
  zoomTrigger?: { type: 'fit' | '100%'; timestamp: number } | null;
  children: React.ReactNode;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  patchBounds,
  toolMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  screenToCanvasRef,
  zoomTrigger,
  children
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Coordinate projection from screen viewport to sheet pixel space
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    if (!contentWrapperRef.current) return { x: 0, y: 0 };
    const rect = contentWrapperRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const localX = (clientX - rect.left) * (patchBounds.width / rect.width);
    const localY = (clientY - rect.top) * (patchBounds.height / rect.height);
    return {
      x: patchBounds.x + localX,
      y: patchBounds.y + localY
    };
  }, [patchBounds]);

  // Expose screenToCanvas to parent via ref
  useEffect(() => {
    screenToCanvasRef.current = screenToCanvas;
  }, [screenToCanvas, screenToCanvasRef]);

  // Initial fit to view
  const fitToView = useCallback(() => {
    if (!containerRef.current || patchBounds.width <= 0 || patchBounds.height <= 0) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const padding = 60;
    const scaleX = (clientWidth - padding) / patchBounds.width;
    const scaleY = (clientHeight - padding) / patchBounds.height;
    const initialScale = Math.max(0.2, Math.min(4, Math.min(scaleX, scaleY)));
    setScale(initialScale);
    setPan({
      x: (clientWidth - patchBounds.width * initialScale) / 2,
      y: (clientHeight - patchBounds.height * initialScale) / 2
    });
  }, [patchBounds]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  // Handle zoom presets trigger
  useEffect(() => {
    if (!zoomTrigger) return;
    if (zoomTrigger.type === 'fit') {
      fitToView();
    } else if (zoomTrigger.type === '100%') {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setScale(1);
        setPan({
          x: (clientWidth - patchBounds.width) / 2,
          y: (clientHeight - patchBounds.height) / 2
        });
      }
    }
  }, [zoomTrigger, fitToView, patchBounds]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(0.1, Math.min(10, scale * zoomFactor));

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan(prev => ({
        x: mouseX - (mouseX - prev.x) * (newScale / scale),
        y: mouseY - (mouseY - prev.y) * (newScale / scale)
      }));
    }
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || toolMode === 'pan' || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onPointerDown={e => {
        if (!isPanning && toolMode !== 'pan') onPointerDown?.(e);
      }}
      onPointerMove={e => {
        if (!isPanning && toolMode !== 'pan') onPointerMove?.(e);
      }}
      onPointerUp={e => {
        if (!isPanning && toolMode !== 'pan') onPointerUp?.(e);
      }}
      onPointerLeave={e => {
        setIsPanning(false);
        onPointerLeave?.(e);
      }}
      className={`flex-1 relative overflow-hidden bg-neutral-900 select-none ${
        toolMode === 'pan' || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
      }`}
    >
      <div
        ref={contentWrapperRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          transition: 'none'
        }}
      >
        {children}
      </div>
    </div>
  );
};
