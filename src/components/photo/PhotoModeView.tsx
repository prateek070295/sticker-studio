import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Eraser,
  RotateCcw,
  Hand,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Download,
  Save,
  CheckCircle2,
  Loader2,
  UserPlus,
  Users,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  MousePointer,
  RotateCw
} from 'lucide-react';
import { UsePhotoModeReturn } from '../../state/usePhotoMode';
import { BoundingBox } from '../../types';
import { isModnetCached } from '../../core/modnetSegmenter';

interface PhotoModeViewProps {
  photo: UsePhotoModeReturn;
}

export const PhotoModeView: React.FC<PhotoModeViewProps> = ({ photo }) => {
  const {
    sourceImage,
    fileName,
    mask,
    borderThickness,
    previewBg,
    viewMode,
    toolMode,
    brushSize,
    isProcessing,
    progressMessage,
    composedResult,
    canUndo,
    personRegions,
    selectedRegionId,
    isReviewMode,
    detectPeople,
    addPersonRegion,
    updatePersonRegion,
    deletePersonRegion,
    togglePersonIncluded,
    rerunPersonSegmentation,
    setSelectedRegionId,
    setIsReviewMode,
    applyStroke,
    undo,
    redo,
    canRedo,
    setBorderThickness,
    setEdgeTrim,
    setSmoothOutline,
    setArtworkEdgeSmoothness,
    setArtworkEdgeFeather,
    setBottomFinish,
    setBottomCurveRadius,
    cleanFragments,
    edgeTrim,
    smoothOutline,
    artworkEdgeSmoothness,
    artworkEdgeFeather,
    bottomFinish,
    bottomCurveRadius,
    touchesBottomEdge,
    qualityMode,
    extractionMode,
    decontaminateEdge,
    hairDetail,
    accessoryMerge,
    setQualityMode,
    setExtractionMode,
    setDecontaminateEdge,
    setHairDetail,
    setAccessoryMerge,
    setPreviewBg,
    setViewMode,
    setToolMode,
    setBrushSize,
    exportArtworkOnly,
    exportWhiteBacked,
    exportZip,
    savePhotoProject,
    resetPhoto,
  } = photo;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom transform state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Cursor position in canvas coordinates
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; onCanvas: boolean }>({ x: 0, y: 0, onCanvas: false });

  // Brush drawing state
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);

  // Interactive Bounding Box Drawing state (for Add Person tool)
  const [drawBoxStart, setDrawBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrawBox, setCurrentDrawBox] = useState<BoundingBox | null>(null);

  // Interactive Box Move/Resize state
  const [boxDragMode, setBoxDragMode] = useState<'move' | 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw' | null>(null);
  const [draftBox, setDraftBox] = useState<{ id: string; box: BoundingBox } | null>(null);
  const draftBoxRef = useRef<{ id: string; box: BoundingBox } | null>(null);
  const boxDragStartRef = useRef<{ mouseX: number; mouseY: number; initialBox: BoundingBox } | null>(null);

  // Check if MODNet weights are cached for offline indicator
  const [modnetCached, setModnetCached] = useState<boolean>(false);
  useEffect(() => {
    isModnetCached().then(setModnetCached).catch(() => setModnetCached(false));
  }, [extractionMode, isProcessing]);

  // Auto-fit image to container on initial load
  useEffect(() => {
    if (!sourceImage || !containerRef.current) return;
    const container = containerRef.current;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const iW = sourceImage.width;
    const iH = sourceImage.height;

    const scale = Math.min((cW - 60) / iW, (cH - 60) / iH, 1);
    setZoom(scale);
    setPan({
      x: (cW - iW * scale) / 2,
      y: (cH - iH * scale) / 2,
    });
  }, [sourceImage]);

  // Render the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return;

    const W = sourceImage.width;
    const H = sourceImage.height;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    if (viewMode === 'original' || !mask) {
      ctx.putImageData(sourceImage, 0, 0);
    } else if (viewMode === 'artwork') {
      if (composedResult && composedResult.artworkOnlyWidth > 0) {
        const offX = composedResult.artworkBounds?.x ?? composedResult.bounds.x;
        const offY = composedResult.artworkBounds?.y ?? composedResult.bounds.y;
        const artImgData = new ImageData(
          composedResult.artworkOnlyRgba,
          composedResult.artworkOnlyWidth,
          composedResult.artworkOnlyHeight
        );
        ctx.putImageData(artImgData, offX, offY);
      } else {
        const imgData = ctx.createImageData(W, H);
        for (let i = 0; i < W * H; i++) {
          const off = i * 4;
          if (mask[i] === 1) {
            imgData.data[off] = sourceImage.data[off];
            imgData.data[off + 1] = sourceImage.data[off + 1];
            imgData.data[off + 2] = sourceImage.data[off + 2];
            imgData.data[off + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    } else if (viewMode === 'before-after') {
      const splitX = Math.floor(W / 2);
      ctx.putImageData(sourceImage, 0, 0);

      if (composedResult && composedResult.whiteBackedWidth > 0) {
        const offX = composedResult.whiteBackedBounds?.x ?? composedResult.bounds.x;
        const offY = composedResult.whiteBackedBounds?.y ?? composedResult.bounds.y;
        const stickerImgData = new ImageData(
          composedResult.whiteBackedRgba,
          composedResult.whiteBackedWidth,
          composedResult.whiteBackedHeight
        );

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = W;
        tmpCanvas.height = H;
        tmpCanvas.getContext('2d')?.putImageData(stickerImgData, offX, offY);

        ctx.save();
        ctx.beginPath();
        ctx.rect(splitX, 0, W - splitX, H);
        ctx.clip();
        ctx.clearRect(splitX, 0, W - splitX, H);
        ctx.drawImage(tmpCanvas, 0, 0);
        ctx.restore();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(splitX, 0);
        ctx.lineTo(splitX, H);
        ctx.stroke();
      }
    } else {
      // Default: 'sticker'
      if (composedResult && composedResult.whiteBackedWidth > 0) {
        const offX = composedResult.whiteBackedBounds?.x ?? composedResult.bounds.x;
        const offY = composedResult.whiteBackedBounds?.y ?? composedResult.bounds.y;
        const stickerImgData = new ImageData(
          composedResult.whiteBackedRgba,
          composedResult.whiteBackedWidth,
          composedResult.whiteBackedHeight
        );
        ctx.putImageData(stickerImgData, offX, offY);
      } else {
        ctx.putImageData(sourceImage, 0, 0);
      }
    }
  }, [sourceImage, mask, composedResult, viewMode]);

  // Convert mouse event coordinates to photo canvas coordinates
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / zoom);
    const y = Math.round((e.clientY - rect.top) / zoom);
    return { x, y };
  }, [zoom]);

  // Mouse / Pointer handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || toolMode === 'pan') {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const pt = getCanvasCoords(e);

    // 1. Add Person Mode -> Start drawing bounding box
    if (e.button === 0 && toolMode === 'add-person') {
      setDrawBoxStart(pt);
      setCurrentDrawBox({ x: pt.x, y: pt.y, width: 0, height: 0 });
      return;
    }

    // 2. Erase / Restore brush modes
    if (e.button === 0 && (toolMode === 'erase' || toolMode === 'restore') && mask) {
      isDrawingRef.current = true;
      currentStrokeRef.current = [pt];
      return;
    }

    // 3. Select Person Mode
    if (e.button === 0 && toolMode === 'select-person') {
      // Check if clicked inside any person region
      const clicked = [...personRegions].reverse().find(r => {
        return (
          pt.x >= r.box.x &&
          pt.x <= r.box.x + r.box.width &&
          pt.y >= r.box.y &&
          pt.y <= r.box.y + r.box.height
        );
      });

      if (clicked) {
        setSelectedRegionId(clicked.id);
        setBoxDragMode('move');
        setDraftBox(null);
        boxDragStartRef.current = {
          mouseX: pt.x,
          mouseY: pt.y,
          initialBox: { ...clicked.box },
        };
      } else {
        setSelectedRegionId(null);
        setBoxDragMode(null);
        setDraftBox(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = getCanvasCoords(e);
    setCursorPos({ x: pt.x, y: pt.y, onCanvas: true });

    if (isDragging) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
      return;
    }

    // Drawing new box in Add Person mode
    if (drawBoxStart && toolMode === 'add-person') {
      const x = Math.min(drawBoxStart.x, pt.x);
      const y = Math.min(drawBoxStart.y, pt.y);
      const width = Math.abs(pt.x - drawBoxStart.x);
      const height = Math.abs(pt.y - drawBoxStart.y);
      setCurrentDrawBox({ x, y, width, height });
      return;
    }

    // Moving or resizing selected box via draftBox (without mutating personRegions state in place!)
    if (boxDragMode && boxDragStartRef.current && selectedRegionId) {
      const dx = pt.x - boxDragStartRef.current.mouseX;
      const dy = pt.y - boxDragStartRef.current.mouseY;
      const init = boxDragStartRef.current.initialBox;
      const W = sourceImage?.width ?? 2000;
      const H = sourceImage?.height ?? 2000;

      let newBox: BoundingBox;
      if (boxDragMode === 'move') {
        const newX = Math.max(0, Math.min(W - init.width, init.x + dx));
        const newY = Math.max(0, Math.min(H - init.height, init.y + dy));
        newBox = { ...init, x: newX, y: newY };
      } else if (boxDragMode === 'resize-se') {
        const newW = Math.max(20, Math.min(W - init.x, init.width + dx));
        const newH = Math.max(20, Math.min(H - init.y, init.height + dy));
        newBox = { ...init, width: newW, height: newH };
      } else if (boxDragMode === 'resize-nw') {
        const rawX = init.x + dx;
        const newX = Math.max(0, Math.min(init.x + init.width - 20, rawX));
        const newW = init.width - (newX - init.x);
        const rawY = init.y + dy;
        const newY = Math.max(0, Math.min(init.y + init.height - 20, rawY));
        const newH = init.height - (newY - init.y);
        newBox = { ...init, x: newX, y: newY, width: newW, height: newH };
      } else if (boxDragMode === 'resize-ne') {
        const rawY = init.y + dy;
        const newY = Math.max(0, Math.min(init.y + init.height - 20, rawY));
        const newH = init.height - (newY - init.y);
        const newW = Math.max(20, Math.min(W - init.x, init.width + dx));
        newBox = { ...init, y: newY, width: newW, height: newH };
      } else { // resize-sw
        const rawX = init.x + dx;
        const newX = Math.max(0, Math.min(init.x + init.width - 20, rawX));
        const newW = init.width - (newX - init.x);
        const newH = Math.max(20, Math.min(H - init.y, init.height + dy));
        newBox = { ...init, x: newX, width: newW, height: newH };
      }

      draftBoxRef.current = { id: selectedRegionId, box: newBox };
      setDraftBox({ id: selectedRegionId, box: newBox });
      return;
    }

    // Brush stroke
    if (isDrawingRef.current && (toolMode === 'erase' || toolMode === 'restore')) {
      currentStrokeRef.current.push(pt);
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }

    // Finished drawing new box in Add Person mode
    if (drawBoxStart && currentDrawBox && toolMode === 'add-person') {
      if (currentDrawBox.width > 10 && currentDrawBox.height > 10) {
        addPersonRegion(currentDrawBox);
        setToolMode('select-person');
      }
      setDrawBoxStart(null);
      setCurrentDrawBox(null);
      return;
    }

    // Finished moving or resizing selected box
    if (boxDragMode && selectedRegionId) {
      const activeDraft = draftBoxRef.current || draftBox;
      if (activeDraft && activeDraft.id === selectedRegionId) {
        const init = boxDragStartRef.current?.initialBox;
        if (
          init &&
          (init.x !== activeDraft.box.x ||
            init.y !== activeDraft.box.y ||
            init.width !== activeDraft.box.width ||
            init.height !== activeDraft.box.height)
        ) {
          updatePersonRegion(selectedRegionId, activeDraft.box);
        }
      }
      setBoxDragMode(null);
      setDraftBox(null);
      draftBoxRef.current = null;
      boxDragStartRef.current = null;
      return;
    }

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentStrokeRef.current.length > 0 && (toolMode === 'erase' || toolMode === 'restore')) {
        applyStroke(currentStrokeRef.current, toolMode);
        currentStrokeRef.current = [];
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan({
        x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
        y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
      });
    }

    setZoom(newZoom);
  };

  const getBgStyle = () => {
    if (previewBg === 'dark') return 'bg-slate-900';
    if (previewBg === 'light' || previewBg === 'white') return 'bg-white';
    if (previewBg === 'grey') return 'bg-neutral-600';
    if (previewBg === 'saturated') return 'bg-cyan-500';
    return 'bg-checker';
  };

  const selectedCount = personRegions.filter(r => r.included).length;

  return (
    <div className="flex-1 flex overflow-hidden relative select-none">
      {/* Center Interactive Canvas Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          isDrawingRef.current = false;
          setDrawBoxStart(null);
          setCurrentDrawBox(null);
          const activeDraft = draftBoxRef.current || draftBox;
          if (boxDragMode && selectedRegionId && activeDraft && activeDraft.id === selectedRegionId) {
            const init = boxDragStartRef.current?.initialBox;
            if (
              init &&
              (init.x !== activeDraft.box.x ||
                init.y !== activeDraft.box.y ||
                init.width !== activeDraft.box.width ||
                init.height !== activeDraft.box.height)
            ) {
              updatePersonRegion(selectedRegionId, activeDraft.box);
            }
          }
          setBoxDragMode(null);
          setDraftBox(null);
          draftBoxRef.current = null;
          boxDragStartRef.current = null;
          setCursorPos(c => ({ ...c, onCanvas: false }));
        }}
        onWheel={handleWheel}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${getBgStyle()} ${
          toolMode === 'pan'
            ? 'cursor-grab active:cursor-grabbing'
            : toolMode === 'add-person'
            ? 'cursor-crosshair'
            : toolMode === 'select-person'
            ? 'cursor-default'
            : 'cursor-crosshair'
        }`}
      >
        {/* Transform Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute left-0 top-0 pointer-events-none"
        >
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-sm block pointer-events-auto"
          />

          {/* Person Regions Bounding Box Overlay */}
          {(isReviewMode || toolMode === 'select-person' || toolMode === 'add-person' || viewMode === 'original') && (
            <div className="absolute inset-0 pointer-events-none">
              {personRegions.map((region) => {
                const isSelected = region.id === selectedRegionId;
                const isManual = region.isManual;
                const isIncluded = region.included;
                const displayBox = (draftBox && draftBox.id === region.id) ? draftBox.box : region.box;
                const isSelectPersonMode = toolMode === 'select-person';

                return (
                  <div
                    key={region.id}
                    style={{
                      left: `${displayBox.x}px`,
                      top: `${displayBox.y}px`,
                      width: `${displayBox.width}px`,
                      height: `${displayBox.height}px`,
                    }}
                    onMouseDown={(e) => {
                      if (!isSelectPersonMode || e.button !== 0) return;
                      e.stopPropagation();
                      setSelectedRegionId(region.id);
                      const pt = getCanvasCoords(e);
                      setBoxDragMode('move');
                      setDraftBox(null);
                      draftBoxRef.current = null;
                      boxDragStartRef.current = {
                        mouseX: pt.x,
                        mouseY: pt.y,
                        initialBox: { ...region.box },
                      };
                    }}
                    onClick={(e) => {
                      if (!isSelectPersonMode) return;
                      e.stopPropagation();
                      setSelectedRegionId(region.id);
                    }}
                    className={`absolute transition-all ${
                      isSelectPersonMode ? 'pointer-events-auto' : 'pointer-events-none'
                    } ${
                      isSelected
                        ? isSelectPersonMode
                          ? 'ring-2 ring-white border-2 border-sky-400 bg-sky-400/15 z-20 shadow-lg cursor-move'
                          : 'ring-2 ring-white border-2 border-sky-400 bg-sky-400/15 z-20 shadow-lg'
                        : isManual
                        ? isIncluded
                          ? isSelectPersonMode
                            ? 'border-2 border-pink-500 bg-pink-500/10 hover:bg-pink-500/20 z-10 cursor-pointer'
                            : 'border-2 border-pink-500 bg-pink-500/10 z-10'
                          : 'border-2 border-dashed border-slate-500 bg-slate-500/10 opacity-50 z-0'
                        : isIncluded
                        ? isSelectPersonMode
                          ? 'border-2 border-sky-400 bg-sky-400/10 hover:bg-sky-400/20 z-10 cursor-pointer'
                          : 'border-2 border-sky-400 bg-sky-400/10 z-10'
                        : 'border-2 border-dashed border-slate-500 bg-slate-500/10 opacity-50 z-0'
                    }`}
                  >
                    {/* Person Badge & Controls Header */}
                    <div
                      style={{ transform: 'translateY(-100%)' }}
                      className={`absolute top-0 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded-t-md text-[11px] font-bold shadow-md whitespace-nowrap ${
                        isSelectPersonMode ? 'pointer-events-auto' : 'pointer-events-none'
                      } ${
                        isSelected
                          ? 'bg-sky-500 text-white'
                          : isManual
                          ? isIncluded
                            ? 'bg-pink-600 text-white'
                            : 'bg-slate-700 text-slate-300'
                          : isIncluded
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      <span>{region.label}</span>
                      {isSelectPersonMode && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePersonIncluded(region.id);
                            }}
                            className="p-0.5 hover:bg-black/20 rounded transition cursor-pointer"
                            title={region.included ? 'Exclude person' : 'Include person'}
                          >
                            {region.included ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                          {region.isManual && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePersonRegion(region.id);
                              }}
                              className="p-0.5 hover:bg-black/20 rounded transition text-red-200 cursor-pointer"
                              title="Delete manual region"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* 4 Corner Resize Handles (Only for selected region in select-person mode) */}
                    {isSelected && isSelectPersonMode && (
                      <>
                        <div
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            const pt = getCanvasCoords(e);
                            setBoxDragMode('resize-nw');
                            setDraftBox(null);
                            draftBoxRef.current = null;
                            boxDragStartRef.current = { mouseX: pt.x, mouseY: pt.y, initialBox: { ...displayBox } };
                          }}
                          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-sky-600 rounded-xs cursor-nwse-resize z-30 shadow-sm pointer-events-auto"
                          title="Resize Top-Left"
                          data-testid="resize-handle-nw"
                        />
                        <div
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            const pt = getCanvasCoords(e);
                            setBoxDragMode('resize-ne');
                            setDraftBox(null);
                            draftBoxRef.current = null;
                            boxDragStartRef.current = { mouseX: pt.x, mouseY: pt.y, initialBox: { ...displayBox } };
                          }}
                          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-sky-600 rounded-xs cursor-nesw-resize z-30 shadow-sm pointer-events-auto"
                          title="Resize Top-Right"
                          data-testid="resize-handle-ne"
                        />
                        <div
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            const pt = getCanvasCoords(e);
                            setBoxDragMode('resize-se');
                            setDraftBox(null);
                            draftBoxRef.current = null;
                            boxDragStartRef.current = { mouseX: pt.x, mouseY: pt.y, initialBox: { ...displayBox } };
                          }}
                          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-sky-600 rounded-xs cursor-nwse-resize z-30 shadow-sm pointer-events-auto"
                          title="Resize Bottom-Right"
                          data-testid="resize-handle-se"
                        />
                        <div
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            const pt = getCanvasCoords(e);
                            setBoxDragMode('resize-sw');
                            setDraftBox(null);
                            draftBoxRef.current = null;
                            boxDragStartRef.current = { mouseX: pt.x, mouseY: pt.y, initialBox: { ...displayBox } };
                          }}
                          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-sky-600 rounded-xs cursor-nesw-resize z-30 shadow-sm pointer-events-auto"
                          title="Resize Bottom-Left"
                          data-testid="resize-handle-sw"
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Live drawing preview rectangle for Add Person */}
              {currentDrawBox && (
                <div
                  style={{
                    left: `${currentDrawBox.x}px`,
                    top: `${currentDrawBox.y}px`,
                    width: `${currentDrawBox.width}px`,
                    height: `${currentDrawBox.height}px`,
                  }}
                  className="absolute border-2 border-pink-400 border-dashed bg-pink-500/20 pointer-events-none z-30"
                >
                  <span className="absolute -top-6 left-0 bg-pink-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                    New Person
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Interactive Brush Reticle Ring */}
          {cursorPos.onCanvas && (toolMode === 'erase' || toolMode === 'restore') && (
            <div
              style={{
                left: `${cursorPos.x}px`,
                top: `${cursorPos.y}px`,
                width: `${brushSize * 2}px`,
                height: `${brushSize * 2}px`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute rounded-full border-2 pointer-events-none transition-transform duration-75 ${
                toolMode === 'erase' ? 'border-red-500 bg-red-500/20' : 'border-emerald-500 bg-emerald-500/20'
              }`}
            />
          )}
        </div>

        {/* Prominent Review Selection Banner */}
        {isReviewMode && personRegions.length > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/80 shadow-2xl flex items-center gap-4 text-xs text-white z-20 max-w-xl">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-sky-400">
                {selectedCount} {selectedCount === 1 ? 'person' : 'people'} selected
              </span>
            </div>
            <span className="text-slate-300 text-[11px] hidden sm:inline">
              Review the image and add anyone missing before creating your sticker.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setToolMode('add-person')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-xs flex items-center gap-1 transition shadow-xs ${
                  toolMode === 'add-person'
                    ? 'bg-pink-500 text-white ring-2 ring-pink-300'
                    : 'bg-pink-600 hover:bg-pink-700 text-white'
                }`}
                title="Draw a rectangle around any person missed by detector"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Person</span>
              </button>
            </div>
          </div>
        )}

        {/* Floating View Controls (Bottom Left) */}
        <div className="absolute bottom-5 left-5 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-xs text-white z-20">
          <button
            onClick={() => {
              if (containerRef.current && sourceImage) {
                const cW = containerRef.current.clientWidth;
                const cH = containerRef.current.clientHeight;
                const scale = Math.min((cW - 60) / sourceImage.width, (cH - 60) / sourceImage.height, 1);
                setZoom(scale);
                setPan({ x: (cW - sourceImage.width * scale) / 2, y: (cH - sourceImage.height * scale) / 2 });
              }
            }}
            className="p-1 hover:bg-slate-700 rounded-md transition"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <div className="h-4 w-[1px] bg-slate-700" />
          <button onClick={() => setZoom(z => Math.max(0.1, z * 0.85))} className="p-1 hover:bg-slate-700 rounded-md transition" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(10, z * 1.15))} className="p-1 hover:bg-slate-700 rounded-md transition" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Processing Notification Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center text-white z-30">
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center max-w-sm text-center">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-3" />
              <h4 className="font-bold text-base mb-1">Local AI Person Segmentation</h4>
              <p className="text-xs text-slate-300 mb-2">{progressMessage || 'Processing photograph...'}</p>
              <span className="text-[10px] text-slate-500 font-mono">100% Client-Side • MediaPipe EfficientDet + Selfie Segmenter</span>
            </div>
          </div>
        )}
      </div>

      {/* Right Controls Sidebar */}
      <aside className="w-80 bg-white border-l border-neutral-200 flex flex-col h-full overflow-y-auto shadow-sm z-10 text-neutral-800">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-neutral-900 truncate max-w-[180px]" title={fileName}>
              {fileName}
            </h3>
            <span className="text-[11px] text-neutral-500">
              {sourceImage ? `${sourceImage.width} × ${sourceImage.height} px` : ''}
            </span>
          </div>
          <button
            onClick={resetPhoto}
            className="text-xs text-neutral-500 hover:text-neutral-800 underline"
          >
            Change Photo
          </button>
        </div>

        <div className="p-4 space-y-6 flex-1">
          {/* Extraction Mode: Standard vs High Quality */}
          <div className="space-y-2 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Photo Extraction
              </span>
              {extractionMode === 'high-quality' ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-purple-100 text-purple-800">
                  MODNet Neural
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-sky-100 text-sky-800">
                  MediaPipe
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
              <button
                onClick={() => setExtractionMode('standard')}
                disabled={isProcessing}
                className={`py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-50 ${
                  extractionMode === 'standard'
                    ? 'bg-white shadow-xs text-neutral-900 font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
                title="Standard MediaPipe extraction for individuals & groups"
              >
                Standard
              </button>
              <button
                onClick={() => setExtractionMode('high-quality')}
                disabled={isProcessing}
                className={`py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-50 ${
                  extractionMode === 'high-quality'
                    ? 'bg-white shadow-xs text-purple-700 font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
                title="On-device MODNet portrait matting with continuous alpha"
              >
                High Quality
              </button>
            </div>
            {personRegions.length > 1 ? (
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] leading-tight font-medium">
                ⚠️ High Quality is optimized for single-person portraits. Multi-person photos default to Standard to protect all members.
              </div>
            ) : extractionMode === 'high-quality' ? (
              <p className="text-[11px] text-neutral-500 leading-tight">
                Continuous alpha portrait matting for natural hair strands and clean edges.
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500 leading-tight">
                Fast MediaPipe detector-guided segmentation. Supports multi-person groups.
              </p>
            )}
          </div>

          {/* 1. Main Action: Detect People (Detector-Guided Pipeline) */}
          <div>
            <button
              onClick={() => detectPeople(extractionMode)}
              disabled={isProcessing}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 ${
                mask
                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
                  : 'bg-linear-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-md'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              <span>
                {isProcessing
                  ? 'Processing...'
                  : mask
                  ? (extractionMode === 'high-quality' ? 'Re-extract (High Quality)' : 'Re-detect People')
                  : (extractionMode === 'high-quality' ? 'Extract High Quality' : 'Detect People')}
              </span>
            </button>
            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
              <span>{extractionMode === 'high-quality' ? 'MODNet On-Device Matting' : 'EfficientDet-Lite0 + Selfie Crop'}</span>
              {extractionMode === 'high-quality' ? (
                modnetCached ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Offline Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 font-medium" title="First run requires on-device model download (~25MB)">
                    Download Required (~25MB)
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Offline Ready
                </span>
              )}
            </div>
          </div>

          {/* 2. Detected & Manual People List */}
          {personRegions.length > 0 && (
            <div className="space-y-2 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-neutral-700" />
                  <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                    People ({selectedCount}/{personRegions.length})
                  </span>
                </div>
                <button
                  onClick={() => setToolMode('add-person')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition ${
                    toolMode === 'add-person' ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                  }`}
                  title="Draw a rectangle around missing person"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Add Person</span>
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {personRegions.map((region) => {
                  const isSelected = region.id === selectedRegionId;
                  return (
                    <div
                      key={region.id}
                      onClick={() => {
                        setSelectedRegionId(region.id);
                        setToolMode('select-person');
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-sky-100/80 text-sky-900 border border-sky-300'
                          : region.included
                          ? 'bg-white text-neutral-800 border border-neutral-200 hover:bg-neutral-50'
                          : 'bg-neutral-100 text-neutral-400 border border-neutral-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={region.included}
                          onChange={(e) => {
                            e.stopPropagation();
                            togglePersonIncluded(region.id);
                          }}
                          className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                        <span className="font-medium truncate">{region.label}</span>
                        {region.isManual && (
                          <span className="px-1 py-0.2 bg-pink-100 text-pink-700 text-[10px] rounded font-semibold">
                            Manual
                          </span>
                        )}
                        {region.isUncertain && (
                          <span className="px-1 py-0.2 bg-amber-100 text-amber-700 text-[10px] rounded font-semibold" title="Small silhouette or lower confidence">
                            Uncertain
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            rerunPersonSegmentation(region.id);
                          }}
                          className="p-1 hover:bg-neutral-200 rounded text-neutral-500 transition"
                          title="Re-run crop segmentation"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                        {region.isManual && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePersonRegion(region.id);
                            }}
                            className="p-1 hover:bg-red-100 rounded text-red-500 transition"
                            title="Delete manual person"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Display View Mode Selector */}
          {mask && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Display Preview
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                <button
                  onClick={() => setViewMode('sticker')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    viewMode === 'sticker' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Sticker Border
                </button>
                <button
                  onClick={() => setViewMode('artwork')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    viewMode === 'artwork' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Artwork Only
                </button>
                <button
                  onClick={() => setViewMode('before-after')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    viewMode === 'before-after' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Before / After
                </button>
                <button
                  onClick={() => setViewMode('original')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    viewMode === 'original' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Original Photo
                </button>
              </div>
            </div>
          )}

          {/* 4. Tools (Box Selection & Brush Touch-ups) */}
          {mask && (
            <div className="space-y-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Interactive Tools
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={undo}
                    disabled={!canUndo}
                    className="p-1 rounded-md text-neutral-500 hover:bg-neutral-200 disabled:opacity-30 transition cursor-pointer"
                    title="Undo (Ctrl+Z)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={!canRedo}
                    className="p-1 rounded-md text-neutral-500 hover:bg-neutral-200 disabled:opacity-30 transition cursor-pointer"
                    title="Redo (Ctrl+Y)"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => setToolMode('pan')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-[11px] font-medium transition ${
                    toolMode === 'pan' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Pan</span>
                </button>
                <button
                  onClick={() => setToolMode('select-person')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-[11px] font-medium transition ${
                    toolMode === 'select-person' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Select</span>
                </button>
                <button
                  onClick={() => setToolMode('erase')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-[11px] font-medium transition ${
                    toolMode === 'erase' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Erase</span>
                </button>
                <button
                  onClick={() => setToolMode('restore')}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-[11px] font-medium transition ${
                    toolMode === 'restore' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
              </div>

              {(toolMode === 'erase' || toolMode === 'restore') && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>Brush Radius</span>
                    <span className="font-mono">{brushSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
                  />
                </div>
              )}

              <button
                onClick={() => cleanFragments()}
                className="w-full py-1.5 px-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
                title="Remove small disconnected background speckles and stray fragments"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Clean Stray Fragments</span>
              </button>
            </div>
          )}

          {/* V1.7 Photographic Matting & Edge Quality */}
          {mask && (
            <div className="space-y-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Matting Quality
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  extractionMode === 'high-quality' ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'
                }`}>
                  {extractionMode === 'high-quality' ? 'High Quality (MODNet Active)' : qualityMode === 'fast' ? 'Fast (V1.6)' : qualityMode === 'better' ? 'Guided Matte' : 'Studio Matting'}
                </span>
              </div>

              {extractionMode === 'high-quality' ? (
                <div className="p-2.5 rounded-lg bg-purple-50/70 border border-purple-200 text-purple-900 text-[11px] leading-relaxed">
                  <p className="font-semibold mb-0.5">On-Device Neural Matting Active</p>
                  <p className="text-purple-700">Continuous alpha hair wisps and edge detail are produced directly by MODNet. Guided filter adjustments below are active in Standard mode.</p>
                </div>
              ) : (
                <>
                  {/* Quality Mode Segmented Buttons */}
                  <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                    <button
                      onClick={() => setQualityMode('fast')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition ${
                        qualityMode === 'fast' ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                      title="Fast baseline segmentation (V1.6)"
                    >
                      Fast
                    </button>
                    <button
                      onClick={() => setQualityMode('better')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition ${
                        qualityMode === 'better' ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                      title="Continuous guided subpixel matting"
                    >
                      Better
                    </button>
                    <button
                      onClick={() => setQualityMode('best')}
                      className={`py-1.5 text-xs font-medium rounded-lg transition ${
                        qualityMode === 'best' ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                      title="Guided matting with color decontamination"
                    >
                      Best
                    </button>
                  </div>

                  {/* Hair & Fine Detail Sensitivity Slider */}
                  {qualityMode !== 'fast' && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-xs text-neutral-600">
                        <span>Hair & Edge Detail</span>
                        <span className="font-mono">{hairDetail}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={hairDetail}
                        onChange={(e) => setHairDetail(Number(e.target.value))}
                        className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-neutral-400">
                        <span>Subtle</span>
                        <span className="text-sky-600 font-semibold">Standard (5)</span>
                        <span>Max Hair Wisps</span>
                      </div>
                    </div>
                  )}

                  {/* Color Decontamination Checkbox */}
                  {qualityMode !== 'fast' && (
                    <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={decontaminateEdge}
                        onChange={(e) => setDecontaminateEdge(e.target.checked)}
                        className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <span>Decontaminate background color halos</span>
                    </label>
                  )}

                  {/* Attached Accessories Merge Checkbox */}
                  <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accessoryMerge}
                      onChange={(e) => setAccessoryMerge(e.target.checked)}
                      className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span>Preserve hair flowers & attached accessories</span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* 5. White Border Thickness Slider */}
          {mask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700 uppercase tracking-wider">
                  White Border
                </span>
                <span className="font-mono text-neutral-600 font-semibold">{borderThickness} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                value={borderThickness}
                onChange={(e) => setBorderThickness(Number(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>0 px (Artwork only)</span>
                <span>30 px</span>
                <span>60 px (Thick die-cut)</span>
              </div>
            </div>
          )}

          {/* 6. Edge Defringe / Alpha Trimming Slider */}
          {mask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700 uppercase tracking-wider">
                  Edge Defringe
                </span>
                <span className="font-mono text-neutral-600 font-semibold">{edgeTrim} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={edgeTrim}
                onChange={(e) => setEdgeTrim(Number(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>0 px (Original)</span>
                <span>1-2 px (Subtle halo trim)</span>
                <span>10 px (Deep)</span>
              </div>
            </div>
          )}

          {/* Artwork Edge Smoothness (Antialiased Cutout Silhouettes) */}
          {mask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700 uppercase tracking-wider">
                  Artwork Smoothness
                </span>
                <span className="font-mono text-neutral-600 font-semibold">{artworkEdgeSmoothness}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={artworkEdgeSmoothness}
                onChange={(e) => setArtworkEdgeSmoothness(Number(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>0 (Original)</span>
                <span className="text-sky-600 font-semibold">1-2 (Subtle)</span>
                <span>3-5 (Moderate)</span>
                <span>6-10 (Strong)</span>
              </div>
              {artworkEdgeSmoothness >= 6 && (
                <div className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Note: Strong smoothness may soften fine hair wisps.
                </div>
              )}
            </div>
          )}

          {/* Artwork Edge Feather (Soft Subpixel Transition) */}
          {mask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700 uppercase tracking-wider">
                  Artwork Feather
                </span>
                <span className="font-mono text-neutral-600 font-semibold">{artworkEdgeFeather} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.5"
                value={artworkEdgeFeather}
                onChange={(e) => setArtworkEdgeFeather(Number(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>0 px (Crisp antialiased)</span>
                <span>1 px</span>
                <span>2 px</span>
                <span>3 px (Soft)</span>
              </div>
            </div>
          )}

          {/* Smooth Die-Cut Outline Slider */}
          {mask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700 uppercase tracking-wider">
                  Smooth Outline
                </span>
                <span className="font-mono text-neutral-600 font-semibold">{smoothOutline}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={smoothOutline}
                onChange={(e) => setSmoothOutline(Number(e.target.value))}
                className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>0 (Original)</span>
                <span className="text-sky-600 font-semibold">1-2 (Portraits)</span>
                <span>3-5 (Moderate)</span>
                <span>6-10 (Strong)</span>
              </div>
            </div>
          )}

          {/* 7. Bottom Edge Treatment (Photo Cutoff) */}
          {mask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-700 uppercase tracking-wider">
                  Bottom Finish
                </span>
                {touchesBottomEdge && (
                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold rounded">
                    Photo Cutoff
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                <button
                  onClick={() => setBottomFinish('flat')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    bottomFinish === 'flat' ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                  title="Retain flat straight bottom edge"
                >
                  Flat
                </button>
                <button
                  onClick={() => setBottomFinish('rounded')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    bottomFinish === 'rounded' ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                  title="Softly round bottom-left and bottom-right corners"
                >
                  Rounded
                </button>
                <button
                  onClick={() => setBottomFinish('curved')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${
                    bottomFinish === 'curved' ? 'bg-white shadow-xs text-neutral-900 font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                  title="Smooth upward arch at bottom"
                >
                  Curved
                </button>
              </div>
              {bottomFinish !== 'flat' && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>{bottomFinish === 'rounded' ? 'Corner Radius' : 'Arch Height'}</span>
                    <span className="font-mono">{bottomCurveRadius} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={bottomCurveRadius}
                    onChange={(e) => setBottomCurveRadius(Number(e.target.value))}
                    className="w-full accent-sky-500 h-1.5 bg-neutral-200 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          {/* 6. Background Preview Color */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
              Preview Background
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setPreviewBg('checker')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${
                  previewBg === 'checker' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-300 bg-checker" />
                <span>Checker</span>
              </button>
              <button
                onClick={() => setPreviewBg('light')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${
                  previewBg === 'light' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-300 bg-white" />
                <span>Light</span>
              </button>
              <button
                onClick={() => setPreviewBg('white')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${
                  previewBg === 'white' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-300 bg-white shadow-inner" />
                <span>White</span>
              </button>
              <button
                onClick={() => setPreviewBg('dark')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${
                  previewBg === 'dark' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-700 bg-slate-900" />
                <span>Dark</span>
              </button>
              <button
                onClick={() => setPreviewBg('grey')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${
                  previewBg === 'grey' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-400 bg-neutral-500" />
                <span>Grey</span>
              </button>
              <button
                onClick={() => setPreviewBg('saturated')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${
                  previewBg === 'saturated' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-cyan-600 bg-cyan-400" />
                <span>Vibrant</span>
              </button>
            </div>
          </div>
        </div>

        {/* 7. Export & Save Actions (Sticky Footer) */}
        {mask && (
          <div className="p-4 border-t border-neutral-200 bg-neutral-50 space-y-2">
            <button
              onClick={exportWhiteBacked}
              className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
            >
              <Download className="w-4 h-4" />
              <span>Export Sticker PNG</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={exportArtworkOnly}
                className="py-2 px-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition"
              >
                <span>Artwork Only</span>
              </button>
              <button
                onClick={exportZip}
                className="py-2 px-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition"
              >
                <span>Export ZIP</span>
              </button>
            </div>
            <button
              onClick={savePhotoProject}
              className="w-full py-2 px-3 text-neutral-500 hover:text-neutral-800 text-xs font-medium flex items-center justify-center gap-1.5 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Photo Project (.stickerstudio)</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
