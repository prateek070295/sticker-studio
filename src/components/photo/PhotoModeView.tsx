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
  Layers,
  Eye,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Columns
} from 'lucide-react';
import { UsePhotoModeReturn } from '../../state/usePhotoMode';

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
    modelStatus,
    composedResult,
    canUndo,
    canRedo,
    removeBackground,
    applyStroke,
    undo,
    redo,
    setBorderThickness,
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

  // Cursor position in canvas coordinates (for circular reticle)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; onCanvas: boolean }>({ x: 0, y: 0, onCanvas: false });

  // Current active drawing stroke
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);

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
      // Draw untouched original photo
      ctx.putImageData(sourceImage, 0, 0);
    } else if (viewMode === 'artwork') {
      // Draw artwork only (mask transparency)
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
        // Fallback: render source with mask alpha
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
      // Left half: Original, Right half: Cutout sticker
      const splitX = Math.floor(W / 2);
      ctx.putImageData(sourceImage, 0, 0);

      // Render cutout on right half
      if (composedResult && composedResult.whiteBackedWidth > 0) {
        const offX = composedResult.whiteBackedBounds?.x ?? composedResult.bounds.x;
        const offY = composedResult.whiteBackedBounds?.y ?? composedResult.bounds.y;
        const stickerImgData = new ImageData(
          composedResult.whiteBackedRgba,
          composedResult.whiteBackedWidth,
          composedResult.whiteBackedHeight
        );
        
        // Draw into temporary canvas to clip right half
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

        // Divider line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(splitX, 0);
        ctx.lineTo(splitX, H);
        ctx.stroke();
      }
    } else {
      // Default: 'sticker' (white-backed sticker)
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
        // Fallback
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
      // Middle click or pan mode -> Pan canvas
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (e.button === 0 && (toolMode === 'erase' || toolMode === 'restore') && mask) {
      // Left click in brush mode -> Start stroke
      isDrawingRef.current = true;
      const pt = getCanvasCoords(e);
      currentStrokeRef.current = [pt];
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Update reticle cursor
    const pt = getCanvasCoords(e);
    setCursorPos({ x: pt.x, y: pt.y, onCanvas: true });

    if (isDragging) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
      return;
    }

    if (isDrawingRef.current && (toolMode === 'erase' || toolMode === 'restore')) {
      currentStrokeRef.current.push(pt);
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
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

    // Zoom centered on cursor
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

  // Background style helper
  const getBgStyle = () => {
    if (previewBg === 'dark') return 'bg-slate-900';
    if (previewBg === 'light') return 'bg-white';
    if (previewBg === 'saturated') return 'bg-cyan-500';
    return 'bg-checker'; // Custom CSS checkerboard
  };

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
          setCursorPos(c => ({ ...c, onCanvas: false }));
        }}
        onWheel={handleWheel}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${getBgStyle()} ${toolMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
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
              className={`absolute rounded-full border-2 pointer-events-none transition-transform duration-75 ${toolMode === 'erase' ? 'border-red-500 bg-red-500/20' : 'border-emerald-500 bg-emerald-500/20'}`}
            />
          )}
        </div>

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
              <h4 className="font-bold text-base mb-1">Local AI Background Removal</h4>
              <p className="text-xs text-slate-300 mb-2">{progressMessage || 'Processing photograph...'}</p>
              <span className="text-[10px] text-slate-500 font-mono">100% Client-Side • MediaPipe Selfie Segmenter</span>
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
          {/* 1. Main Action: Remove Background */}
          <div>
            <button
              onClick={removeBackground}
              disabled={isProcessing}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition ${
                mask
                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
                  : 'bg-linear-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-md'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{mask ? 'Re-run Background Removal' : 'Remove Background'}</span>
            </button>
            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
              <span>Model: MediaPipe Selfie Landscape</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Offline Ready
              </span>
            </div>
          </div>

          {/* 2. View Mode Selector */}
          {mask && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                Display Preview
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                <button
                  onClick={() => setViewMode('sticker')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${viewMode === 'sticker' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  Sticker Border
                </button>
                <button
                  onClick={() => setViewMode('artwork')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${viewMode === 'artwork' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  Artwork Only
                </button>
                <button
                  onClick={() => setViewMode('before-after')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${viewMode === 'before-after' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  Before / After
                </button>
                <button
                  onClick={() => setViewMode('original')}
                  className={`py-1.5 text-xs font-medium rounded-lg transition ${viewMode === 'original' ? 'bg-white shadow-xs text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  Original Photo
                </button>
              </div>
            </div>
          )}

          {/* 3. Manual Correction Brushes */}
          {mask && (
            <div className="space-y-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  Touch-up Tools
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={undo}
                    disabled={!canUndo}
                    className="p-1 rounded-md text-neutral-500 hover:bg-neutral-200 disabled:opacity-30 transition"
                    title="Undo (Ctrl+Z)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => setToolMode('pan')}
                  className={`py-2 px-2 rounded-lg flex flex-col items-center gap-1 text-xs font-medium transition ${toolMode === 'pan' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'}`}
                >
                  <Hand className="w-4 h-4" />
                  <span>Pan</span>
                </button>
                <button
                  onClick={() => setToolMode('erase')}
                  className={`py-2 px-2 rounded-lg flex flex-col items-center gap-1 text-xs font-medium transition ${toolMode === 'erase' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'}`}
                >
                  <Eraser className="w-4 h-4" />
                  <span>Erase</span>
                </button>
                <button
                  onClick={() => setToolMode('restore')}
                  className={`py-2 px-2 rounded-lg flex flex-col items-center gap-1 text-xs font-medium transition ${toolMode === 'restore' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'}`}
                >
                  <RotateCcw className="w-4 h-4" />
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
            </div>
          )}

          {/* 4. White Border Thickness Slider */}
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

          {/* 5. Background Preview Color */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
              Preview Background
            </span>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setPreviewBg('checker')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${previewBg === 'checker' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-300 bg-checker" />
                <span>Checker</span>
              </button>
              <button
                onClick={() => setPreviewBg('light')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${previewBg === 'light' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-300 bg-white" />
                <span>Light</span>
              </button>
              <button
                onClick={() => setPreviewBg('dark')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${previewBg === 'dark' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                <div className="w-4 h-4 rounded-full border border-neutral-700 bg-slate-900" />
                <span>Dark</span>
              </button>
              <button
                onClick={() => setPreviewBg('saturated')}
                className={`py-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition ${previewBg === 'saturated' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                <div className="w-4 h-4 rounded-full border border-cyan-600 bg-cyan-400" />
                <span>Vibrant</span>
              </button>
            </div>
          </div>
        </div>

        {/* 6. Export & Save Actions (Sticky Footer) */}
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
