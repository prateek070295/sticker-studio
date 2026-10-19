import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  RotateCcw,
  Download,
  Image as ImageIcon,
  Move,
  ZoomIn,
  Eye,
  Sliders,
  CheckCircle,
  AlertCircle,
  FileCode,
  Layers,
  Smile,
  Eraser,
  Paintbrush,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useCartoonMode } from '../../state/useCartoonMode';

interface CartoonModeViewProps {
  onBackToMain?: () => void;
}

export const CartoonModeView: React.FC<CartoonModeViewProps> = ({ onBackToMain }) => {
  const {
    selfieDataUrl,
    selfieFileName,
    isProcessing,
    progressMessage,
    extractedHead,
    activeTemplate,
    headTransform,
    borderThickness,
    smoothOutlineLevel,
    previewBg,
    artworkCanvas,
    stickerCanvas,
    tightCrop,
    error,

    toolMode,
    brushSize,
    canUndo,
    canRedo,
    setToolMode,
    setBrushSize,
    undo,
    redo,
    applyBrushStrokeToHead,

    loadSelfieFile,
    loadSelfieUrl,
    updateHeadTransform,
    resetPlacement,
    setBorderThickness,
    setSmoothOutlineLevel,
    setPreviewBg,
    exportArtworkPng,
    exportStickerPng,
    saveProjectJson,
    loadProjectJson,
  } = useCartoonMode();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interaction state on preview canvas (move vs brush)
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initCenterX: number; initCenterY: number }>({
    mouseX: 0,
    mouseY: 0,
    initCenterX: 0,
    initCenterY: 0,
  });
  const strokePointsRef = useRef<Array<{ x: number; y: number; pressure: number }>>([]);

  // Render sticker to the interactive display canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !stickerCanvas) return;

    canvas.width = stickerCanvas.width;
    canvas.height = stickerCanvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(stickerCanvas, 0, 0);
  }, [stickerCanvas]);

  const getHeadCropCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!headTransform || !extractedHead || !previewCanvasRef.current) return null;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const scaleFactor = 1024 / rect.width;
    const canvasX = (e.clientX - rect.left) * scaleFactor;
    const canvasY = (e.clientY - rect.top) * scaleFactor;

    const dx = canvasX - headTransform.centerX;
    const dy = canvasY - headTransform.centerY;
    const rad = (-headTransform.rotationDegrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const unscaledX = (dx * cos - dy * sin) / headTransform.scale;
    const unscaledY = (dx * sin + dy * cos) / headTransform.scale;

    const cropX = unscaledX + extractedHead.width * 0.5;
    const cropY = unscaledY + extractedHead.height * 0.5;
    return { x: cropX, y: cropY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!headTransform || !previewCanvasRef.current) return;
    setIsInteracting(true);

    if (toolMode === 'move') {
      const rect = previewCanvasRef.current.getBoundingClientRect();
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        initCenterX: headTransform.centerX,
        initCenterY: headTransform.centerY,
      };
    } else if ((toolMode === 'erase' || toolMode === 'restore') && extractedHead) {
      const coords = getHeadCropCoords(e);
      if (coords) {
        strokePointsRef.current = [{ x: coords.x, y: coords.y, pressure: 1.0 }];
      } else {
        strokePointsRef.current = [];
      }
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isInteracting || !headTransform || !previewCanvasRef.current) return;

      if (toolMode === 'move') {
        const rect = previewCanvasRef.current.getBoundingClientRect();
        const scaleFactor = 1024 / rect.width;
        const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleFactor;
        const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleFactor;

        updateHeadTransform({
          centerX: dragStartRef.current.initCenterX + deltaX,
          centerY: dragStartRef.current.initCenterY + deltaY,
        });
      } else if ((toolMode === 'erase' || toolMode === 'restore') && extractedHead) {
        const coords = getHeadCropCoords(e);
        if (coords) {
          strokePointsRef.current.push({ x: coords.x, y: coords.y, pressure: 1.0 });
        }
      }
    },
    [isInteracting, toolMode, headTransform, extractedHead, updateHeadTransform]
  );

  const handleMouseUp = () => {
    if (!isInteracting) return;
    setIsInteracting(false);
    if ((toolMode === 'erase' || toolMode === 'restore') && strokePointsRef.current.length > 0) {
      applyBrushStrokeToHead(strokePointsRef.current);
      strokePointsRef.current = [];
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadSelfieFile(e.dataTransfer.files[0]);
    }
  };

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (typeof evt.target?.result === 'string') {
          loadProjectJson(evt.target.result);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-20">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-slate-950 font-bold shadow-lg shadow-rose-500/20">
            <Smile className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-base tracking-wide bg-gradient-to-r from-amber-400 via-rose-300 to-sky-400 bg-clip-text text-transparent">
                Sticker Studio — Personalized Cartoon Stickers
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                V1.4 Prototype
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Template: <span className="text-slate-200 font-semibold">{activeTemplate.name}</span> — Real selfie head on illustrated chibi body
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => projectInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
            title="Open saved .stickerstudio project"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Open Project</span>
          </button>
          <input
            ref={projectInputRef}
            type="file"
            accept=".stickerstudio,.json"
            onChange={handleProjectFileChange}
            className="hidden"
          />

          {selfieDataUrl && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Change Selfie</span>
            </button>
          )}

          {onBackToMain && (
            <button
              onClick={onBackToMain}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-400 hover:text-slate-200 transition"
            >
              Exit Prototype
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Upload Landing Screen when no selfie is loaded */}
        {!selfieDataUrl && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
            <div className="max-w-xl w-full flex flex-col items-center text-center space-y-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-3xl p-10 bg-slate-900/50 hover:bg-slate-900/80 cursor-pointer transition flex flex-col items-center space-y-4 shadow-xl"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-slate-100">Upload a Portrait or Selfie</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Drag and drop your photo here, or click to browse (JPEG, PNG)
                  </p>
                </div>
                <div className="inline-flex items-center space-x-2 text-xs text-slate-500 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50">
                  <span>100% on-device local inference</span>
                  <span>•</span>
                  <span>Zero photo uploads</span>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => e.target.files?.[0] && loadSelfieFile(e.target.files[0])}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Processing State Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
            <div className="text-sm font-medium text-slate-200 animate-pulse">{progressMessage}</div>
            <div className="text-xs text-slate-500">Processing on local CPU/WebAssembly...</div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="absolute top-16 right-6 max-w-md bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-start space-x-2 z-50">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Processing Notice</div>
              <div className="mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {/* Workspace Active: Controls Side Panel + Interactive Stage */}
        {selfieDataUrl && (
          <>
            {/* Left Controls Side-Panel */}
            <div className="w-80 border-r border-slate-800 bg-slate-900/70 backdrop-blur flex flex-col overflow-y-auto z-10">
              <div className="p-4 space-y-6">
                {/* 1. Extracted Head Thumbnail Card */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Photographic Head</span>
                    {extractedHead?.landmarks && (
                      <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Face detected</span>
                      </span>
                    )}
                  </div>
                  <div className="relative aspect-square w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-2 flex items-center justify-center overflow-hidden checkerboard-bg">
                    {extractedHead ? (
                      <img
                        src={extractedHead.canvas.toDataURL()}
                        alt="Extracted Head"
                        className="max-h-full max-w-full object-contain filter drop-shadow-md"
                      />
                    ) : (
                      <div className="text-xs text-slate-500">No head extracted</div>
                    )}
                  </div>
                </div>

                {/* 2. Interactive Head & Mask Tools */}
                <div className="space-y-3 border-t border-slate-800/80 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Interactive Tools</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                        title="Undo mask edit"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
                        title="Redo mask edit"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setToolMode('move')}
                      className={`flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition ${
                        toolMode === 'move'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Move className="w-3.5 h-3.5" />
                      <span>Move</span>
                    </button>
                    <button
                      onClick={() => setToolMode('erase')}
                      className={`flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition ${
                        toolMode === 'erase'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span>Erase</span>
                    </button>
                    <button
                      onClick={() => setToolMode('restore')}
                      className={`flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition ${
                        toolMode === 'restore'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  </div>

                  {toolMode !== 'move' && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>Brush Size</span>
                        <span className="font-mono text-slate-400">{brushSize} px</span>
                      </div>
                      <input
                        type="range"
                        min="6"
                        max="80"
                        step="2"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="text-[11px] text-slate-500 leading-tight">
                        {toolMode === 'erase'
                          ? 'Drag on the head to erase background fragments.'
                          : 'Drag on the head to restore camera pixels.'}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Head Transform Controls */}
                {headTransform && (
                  <div className="space-y-4 border-t border-slate-800/80 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                        <Move className="w-3.5 h-3.5 text-amber-400" />
                        <span>Head Positioning</span>
                      </div>
                      <button
                        onClick={resetPlacement}
                        className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center space-x-1 transition"
                        title="Reset to automatic landmark alignment"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {/* Scale Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>Head Size</span>
                        <span className="font-mono text-slate-400">{Math.round(headTransform.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.02"
                        value={headTransform.scale}
                        onChange={(e) => updateHeadTransform({ scale: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    {/* Rotation Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>Head Tilt</span>
                        <span className="font-mono text-slate-400">{headTransform.rotationDegrees}°</span>
                      </div>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        step="1"
                        value={headTransform.rotationDegrees}
                        onChange={(e) => updateHeadTransform({ rotationDegrees: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    {/* Hair Layering Toggle */}
                    <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                      <span>Hair Placement</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateHeadTransform({
                            hairBehindBody: !headTransform.hairBehindBody,
                          })
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                          headTransform.hairBehindBody
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {headTransform.hairBehindBody ? 'Behind Torso' : 'Over Torso (Front)'}
                      </button>
                    </div>

                    {/* Drag on canvas hint */}
                    <div className="text-[11px] text-slate-500 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 flex items-center space-x-2">
                      <Move className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Drag directly on character to reposition head</span>
                    </div>
                  </div>
                )}

                {/* 3. White Die-Cut Border Controls */}
                <div className="space-y-4 border-t border-slate-800/80 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Sliders className="w-3.5 h-3.5 text-rose-400" />
                    <span>Die-Cut Cutline</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Border Thickness</span>
                      <span className="font-mono text-slate-400">{borderThickness} px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="60"
                      step="2"
                      value={borderThickness}
                      onChange={(e) => setBorderThickness(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    />
                  </div>

                  {/* Smooth Outline Setting */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Smooth Outline</span>
                      <span className="font-mono text-slate-400">Level {smoothOutlineLevel}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 1, 2, 4].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setSmoothOutlineLevel(lvl)}
                          className={`py-1 text-xs rounded-lg border font-medium transition ${
                            smoothOutlineLevel === lvl
                              ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {lvl === 0 ? 'Raw' : `Lvl ${lvl}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Background Staging */}
                <div className="space-y-2 border-t border-slate-800/80 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>Preview Background</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'checker', label: 'Grid' },
                      { id: 'dark', label: 'Dark' },
                      { id: 'white', label: 'White' },
                      { id: 'print', label: 'Paper' }
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => setPreviewBg(bg.id as any)}
                        className={`py-1 text-xs rounded-lg border font-medium transition ${
                          previewBg === bg.id
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Export Actions */}
                <div className="space-y-2.5 border-t border-slate-800/80 pt-4">
                  <button
                    onClick={exportStickerPng}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-semibold text-xs transition shadow-lg shadow-rose-500/20 active:scale-[0.98]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Sticker (White Backed)</span>
                  </button>

                  <button
                    onClick={exportArtworkPng}
                    className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs transition active:scale-[0.98]"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Export Artwork Only (Transparent)</span>
                  </button>

                  <button
                    onClick={saveProjectJson}
                    className="w-full flex items-center justify-center space-x-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300 text-[11px] transition"
                  >
                    <FileCode className="w-3 h-3" />
                    <span>Save .stickerstudio Project</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Center: Interactive Preview Canvas Stage */}
            <div className="flex-1 flex items-center justify-center p-8 overflow-auto relative">
              {/* Background Backdrop Styling */}
              <div
                className={`relative max-w-full max-h-full rounded-3xl p-6 shadow-2xl transition duration-200 ${
                  previewBg === 'checker'
                    ? 'checkerboard-bg'
                    : previewBg === 'dark'
                    ? 'bg-zinc-900 border border-zinc-800'
                    : previewBg === 'white'
                    ? 'bg-white'
                    : 'bg-stone-100 border border-stone-200'
                }`}
              >
                <canvas
                  ref={previewCanvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className={`max-w-[85vh] max-h-[85vh] object-contain transition-transform select-none ${
                    toolMode === 'move'
                      ? isInteracting
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                      : 'cursor-crosshair'
                  }`}
                  style={{
                    filter: borderThickness > 0 ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.25))' : 'none'
                  }}
                />

                {/* Layer Stack Pill Indicator */}
                <div className="absolute bottom-4 left-6 flex items-center space-x-2 text-[10px] text-slate-400 bg-slate-950/80 backdrop-blur px-3 py-1 rounded-full border border-slate-800/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>3-Layer Composite (Back SVG &lt; Photo Head &lt; Front Collar)</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .checkerboard-bg {
          background-color: #12131a;
          background-image: linear-gradient(45deg, #181922 25%, transparent 25%),
                            linear-gradient(-45deg, #181922 25%, transparent 25%),
                            linear-gradient(45deg, transparent 75%, #181922 75%),
                            linear-gradient(-45deg, transparent 75%, #181922 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
      `}</style>
    </div>
  );
};
