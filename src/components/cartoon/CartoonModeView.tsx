import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  RotateCcw,
  Download,
  Image as ImageIcon,
  Move,
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
  ArrowLeft,
  CheckSquare,
  Square,
  Package,
  ZoomIn,
  Target,
} from 'lucide-react';
import { useCartoonMode, getPackStickerFilename, getCroppedCanvas } from '../../state/useCartoonMode';
import { CartoonTemplateManifest, ExtractedHeadResult } from '../../cartoon/types';
import { getPhotographicChinCropAnchor } from '../../core/cartoonCompositor';

interface CartoonModeViewProps {
  onBackToMain?: () => void;
}

const ChinCalibrationModal: React.FC<{
  head: ExtractedHeadResult;
  calibratedChin: { x: number; y: number } | null;
  onSave: (chin: { x: number; y: number } | null) => void;
  onClose: () => void;
}> = ({ head, calibratedChin, onSave, onClose }) => {
  const naturalChin = getPhotographicChinCropAnchor(head, null);
  const [pin, setPin] = useState<{ x: number; y: number }>(calibratedChin || naturalChin);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = head.width;
    canvas.height = head.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, head.width, head.height);
    ctx.drawImage(head.canvas, 0, 0);
  }, [head]);

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * head.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * head.height);
    setPin({
      x: Math.max(0, Math.min(head.width, x)),
      y: Math.max(0, Math.min(head.height, y)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">Calibrate Photographic Chin Anchor</h3>
          <p className="text-xs text-slate-400 mt-1">
            Click or drag to place the anchor marker at the tip of your chin. All 12 cartoon collar anchors will lock to this point.
          </p>
        </div>

        <div
          onMouseDown={handlePointerDown}
          className="relative w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 cursor-crosshair flex items-center justify-center checkerboard-bg"
        >
          <canvas ref={canvasRef} className="max-w-full max-h-full object-contain pointer-events-none" />
          <div
            style={{
              left: `${(pin.x / head.width) * 100}%`,
              top: `${(pin.y / head.height) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute pointer-events-none flex flex-col items-center"
          >
            <div className="w-5 h-5 rounded-full border-2 border-amber-400 bg-amber-500/40 shadow-lg flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-300 bg-slate-950/90 px-1 rounded mt-0.5 border border-amber-500/40">
              Chin Anchor
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              onSave(null);
              onClose();
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
          >
            Reset to AI Landmark
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSave(pin);
                onClose();
              }}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow"
            >
              Save Chin Anchor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StickerThumbnail: React.FC<{
  stickerCanvas?: HTMLCanvasElement;
  tightCrop?: { x: number; y: number; width: number; height: number };
  previewBg: string;
}> = ({ stickerCanvas, tightCrop, previewBg }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stickerCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tightCrop && tightCrop.width > 0 && tightCrop.height > 0) {
      canvas.width = tightCrop.width;
      canvas.height = tightCrop.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        stickerCanvas,
        tightCrop.x,
        tightCrop.y,
        tightCrop.width,
        tightCrop.height,
        0,
        0,
        tightCrop.width,
        tightCrop.height
      );
    } else {
      canvas.width = stickerCanvas.width;
      canvas.height = stickerCanvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(stickerCanvas, 0, 0);
    }
  }, [stickerCanvas, tightCrop]);

  return (
    <div
      className={`w-full aspect-square rounded-2xl flex items-center justify-center p-3 relative overflow-hidden transition ${
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
        ref={canvasRef}
        className="max-w-full max-h-full object-contain filter drop-shadow-md select-none"
      />
    </div>
  );
};

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

    viewMode,
    templates,
    selectedTemplateIds,
    packPreviews,
    templateTransforms,
    isExportingZip,

    toolMode,
    brushSize,
    canUndo,
    canRedo,

    globalHeadAlignment,
    individualHeadAlignments,
    calibratedChin,
    alignmentScope,
    globalRefTemplateId,

    setViewMode,
    setAlignmentScope,
    setGlobalRefTemplateId,
    setGlobalHeadAlignment,
    setIndividualHeadAlignment,
    setCalibratedChin,
    applyAlignmentDrag,
    resetGlobalAlignment,
    resetIndividualAlignment,
    resetAllAlignment,
    selectTemplateForEdit,
    toggleTemplateSelection,
    selectAllTemplates,
    deselectAllTemplates,
    setToolMode,
    setBrushSize,
    undo,
    redo,
    applyBrushStrokeToHead,

    loadSelfieFile,
    loadSelfieUrl,
    updateHeadTransform,
    resetPlacement,
    templateBorderThicknesses,
    setBorderThickness,
    setGlobalBorderThickness,
    setTemplateBorderThickness,
    setSmoothOutlineLevel,
    setPreviewBg,
    exportArtworkPng,
    exportStickerPng,
    exportPackZip,
    saveProjectJson,
    loadProjectJson,
  } = useCartoonMode();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const globalPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Chin calibration modal toggle
  const [isCalibratingChin, setIsCalibratingChin] = useState<boolean>(false);

  // Interaction state on preview canvas (move vs brush in detail mode)
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initCenterX: number; initCenterY: number }>({
    mouseX: 0,
    mouseY: 0,
    initCenterX: 0,
    initCenterY: 0,
  });
  const strokePointsRef = useRef<Array<{ x: number; y: number; pressure: number }>>([]);

  // Drag interaction state for Global Alignment canvas
  const [isGlobalDragging, setIsGlobalDragging] = useState<boolean>(false);
  const globalDragStartRef = useRef<{ mouseX: number; mouseY: number }>({ mouseX: 0, mouseY: 0 });

  // Render active reference template to global alignment preview canvas
  useEffect(() => {
    if (viewMode !== 'global_alignment') return;
    const canvas = globalPreviewCanvasRef.current;
    const refPreview = packPreviews[globalRefTemplateId] || packPreviews[activeTemplate.id];
    if (!canvas || !refPreview?.stickerCanvas) return;

    canvas.width = refPreview.stickerCanvas.width;
    canvas.height = refPreview.stickerCanvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(refPreview.stickerCanvas, 0, 0);
  }, [packPreviews, globalRefTemplateId, activeTemplate.id, viewMode]);

  const handleGlobalMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsGlobalDragging(true);
    globalDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY };
  };

  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isGlobalDragging || !globalPreviewCanvasRef.current) return;
      const rect = globalPreviewCanvasRef.current.getBoundingClientRect();
      const scaleFactor = 1024 / rect.width;
      const deltaX = (e.clientX - globalDragStartRef.current.mouseX) * scaleFactor;
      const deltaY = (e.clientY - globalDragStartRef.current.mouseY) * scaleFactor;

      applyAlignmentDrag(deltaX, deltaY, globalRefTemplateId);
      globalDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY };
    },
    [isGlobalDragging, applyAlignmentDrag, globalRefTemplateId]
  );

  const handleGlobalMouseUp = useCallback(() => {
    setIsGlobalDragging(false);
  }, []);

  useEffect(() => {
    if (isGlobalDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isGlobalDragging, handleGlobalMouseMove, handleGlobalMouseUp]);

  // Render sticker to the interactive display canvas in Detail Mode
  useEffect(() => {
    if (viewMode !== 'detail') return;
    const canvas = previewCanvasRef.current;
    if (!canvas || !stickerCanvas) return;

    canvas.width = stickerCanvas.width;
    canvas.height = stickerCanvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(stickerCanvas, 0, 0);
  }, [stickerCanvas, viewMode]);

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

  const exportSingleThumbnail = (tpl: CartoonTemplateManifest) => {
    const preview = packPreviews[tpl.id];
    if (!preview) return;
    const exportCanvas = getCroppedCanvas(preview.stickerCanvas, preview.tightCrop);
    const a = document.createElement('a');
    a.download = `cartoon_${tpl.id}_sticker_${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
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
              <span className="font-bold text-sm tracking-tight text-white">Sticker Studio</span>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-rose-300 border border-rose-500/30">
                V1.6 Smart Alignment & Reactions Pack
              </span>
            </div>
            <p className="text-[11px] text-slate-400">1 Selfie → 1 Extracted Head → 12 Cartoon Reactions</p>
          </div>
        </div>

        {/* Center / Navigation in Detail Mode */}
        {extractedHead && viewMode === 'detail' && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setViewMode('gallery')}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Reactions Pack</span>
            </button>
            <span className="text-xs text-slate-400 font-medium">
              Editing: <span className="text-rose-300 font-semibold">{activeTemplate.name}</span>
            </span>
          </div>
        )}

        {/* Center / Navigation in Global Alignment Mode */}
        {extractedHead && viewMode === 'global_alignment' && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setViewMode('gallery')}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Reactions Pack</span>
            </button>
            <span className="text-xs text-rose-300 font-semibold flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-rose-400" />
              <span>Smart Pack-Wide Head Alignment</span>
            </span>
          </div>
        )}

        {/* Right Top Actions */}
        <div className="flex items-center space-x-2">
          {extractedHead && viewMode === 'gallery' && (
            <button
              onClick={() => setViewMode('global_alignment')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold shadow-sm transition active:scale-95"
            >
              <Sliders className="w-3.5 h-3.5 text-rose-400" />
              <span>Adjust All Heads</span>
            </button>
          )}

          {extractedHead && viewMode === 'gallery' && (
            <button
              onClick={exportPackZip}
              disabled={isExportingZip || selectedTemplateIds.length === 0}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 text-xs font-semibold shadow-lg shadow-rose-500/20 transition disabled:opacity-50 active:scale-95"
            >
              <Package className="w-4 h-4" />
              <span>
                {isExportingZip
                  ? 'Generating ZIP...'
                  : `Download Pack (${selectedTemplateIds.length} Stickers)`}
              </span>
            </button>
          )}

          {extractedHead && (
            <button
              onClick={saveProjectJson}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
              title="Save lossless project archive"
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Save Project</span>
            </button>
          )}

          <input
            type="file"
            ref={projectInputRef}
            onChange={handleProjectFileChange}
            accept=".stickerstudio,.json"
            className="hidden"
          />
          <button
            onClick={() => projectInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium transition"
          >
            <FileCode className="w-3.5 h-3.5 text-slate-400" />
            <span>Open Project</span>
          </button>

          {extractedHead && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>New Selfie</span>
            </button>
          )}

          {onBackToMain && (
            <button
              onClick={onBackToMain}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            >
              Main Mode
            </button>
          )}
        </div>
      </header>

      {/* Main Container Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && loadSelfieFile(e.target.files[0])}
          accept="image/*"
          className="hidden"
        />

        {/* 1. Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-700/40" />
              <div className="absolute inset-0 rounded-full border-4 border-t-rose-500 border-r-amber-500 border-b-transparent border-l-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Smile className="w-6 h-6 text-rose-400 animate-pulse" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-white mb-1">Creating Reactions Pack</h3>
            <p className="text-xs text-rose-300 animate-pulse text-center max-w-sm">{progressMessage}</p>
          </div>
        )}

        {/* 2. Error Toast */}
        {error && (
          <div className="absolute top-4 right-4 z-50 flex items-center space-x-2 bg-rose-950/90 border border-rose-500/50 text-rose-200 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3. Welcome / Upload Screen when no selfie is loaded */}
        {!extractedHead && !isProcessing && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="max-w-xl w-full flex flex-col items-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 via-rose-500/20 to-purple-500/20 border border-rose-500/30 flex items-center justify-center mb-6 shadow-xl shadow-rose-500/10">
                <Smile className="w-10 h-10 text-rose-400" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                Personalized Reactions Pack
              </h2>
              <p className="text-sm text-slate-400 mb-8 max-w-md">
                Upload one portrait or selfie. Your real photographic head will be extracted once and
                fitted onto 12 original illustrated reaction stickers ready for WhatsApp, iMessage, and print.
              </p>

              {/* Upload Card */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-700/80 hover:border-rose-500/60 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-900/40 hover:bg-slate-900/80 transition group"
              >
                <div className="w-12 h-12 rounded-2xl bg-slate-800 group-hover:bg-rose-500/20 flex items-center justify-center mb-3 text-slate-400 group-hover:text-rose-400 transition">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition mb-1">
                  Click to browse photo or drag & drop here
                </span>
                <span className="text-xs text-slate-500">Supports JPG, PNG, WebP up to 30MP</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. GALLERY VIEW (12-Sticker Collection Grid) */}
        {extractedHead && viewMode === 'gallery' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Gallery Control Bar */}
            <div className="flex flex-wrap items-center justify-between px-8 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur gap-3">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pack Collection:
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-medium">
                  {selectedTemplateIds.length} of {templates.length} selected
                </span>
                <button
                  onClick={selectAllTemplates}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium transition"
                >
                  Select All
                </button>
                <span className="text-slate-600 text-xs">•</span>
                <button
                  onClick={deselectAllTemplates}
                  className="text-xs text-slate-400 hover:text-slate-300 font-medium transition"
                >
                  Deselect All
                </button>
                <span className="text-slate-600 text-xs">•</span>
                <button
                  onClick={() => setViewMode('global_alignment')}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-rose-500/20 transition active:scale-95 ml-2"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-950" />
                  <span>Adjust All Heads</span>
                </button>
              </div>

              {/* Die-Cut Thickness & Background Selector */}
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400 font-medium">Pack Border:</span>
                  <input
                    type="range"
                    min="0"
                    max="48"
                    value={borderThickness}
                    onChange={(e) => setGlobalBorderThickness(Number(e.target.value))}
                    className="w-24 accent-rose-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-300 w-8">{borderThickness}px</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-slate-400 font-medium mr-1">Backdrop:</span>
                  {[
                    { id: 'checker', label: 'Grid' },
                    { id: 'dark', label: 'Dark' },
                    { id: 'white', label: 'White' },
                    { id: 'print', label: 'Paper' },
                  ].map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => setPreviewBg(bg.id as any)}
                      className={`px-2 py-0.5 text-xs rounded-md border font-medium transition ${
                        previewBg === bg.id
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 12-Sticker Grid */}
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 gap-6 max-w-7xl mx-auto">
                {templates.map((tpl, index) => {
                  const preview = packPreviews[tpl.id];
                  const isSelected = selectedTemplateIds.includes(tpl.id);
                  const numStr = String(index + 1).padStart(2, '0');

                  return (
                    <div
                      key={tpl.id}
                      className={`flex flex-col bg-slate-900/80 border rounded-2xl p-4 transition shadow-lg relative group ${
                        isSelected
                          ? 'border-slate-700 hover:border-rose-500/50 shadow-rose-950/10'
                          : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* Card Header: Checkbox + Number + Title */}
                      <div className="flex items-center justify-between mb-3">
                        <div
                          onClick={() => toggleTemplateSelection(tpl.id)}
                          className="flex items-center space-x-2 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-rose-400 flex-shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          )}
                          <span className="text-[11px] font-mono font-bold text-slate-400">
                            {numStr}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-white truncate text-right max-w-[100px]">
                          {tpl.name}
                        </span>
                      </div>

                      {/* Card Middle: Thumbnail */}
                      <div
                        onClick={() => selectTemplateForEdit(tpl.id)}
                        className="cursor-pointer mb-3 relative group"
                        title="Click to customize this sticker"
                      >
                        <StickerThumbnail
                          stickerCanvas={preview?.stickerCanvas}
                          tightCrop={preview?.tightCrop}
                          previewBg={previewBg}
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition backdrop-blur-[2px]">
                          <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-500 text-slate-950 text-xs font-bold shadow-lg">
                            <Sliders className="w-3 h-3" />
                            <span>Customize</span>
                          </span>
                        </div>
                      </div>

                      {/* Card Footer: Action Buttons */}
                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => selectTemplateForEdit(tpl.id)}
                          className="flex-1 flex items-center justify-center space-x-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition"
                        >
                          <Sliders className="w-3 h-3 text-slate-400" />
                          <span>Tune</span>
                        </button>
                        <button
                          onClick={() => exportSingleThumbnail(tpl)}
                          className="p-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                          title="Export single sticker PNG"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 5. GLOBAL ALIGNMENT VIEW (V1.6 Smart Pack-Wide Head Alignment) */}
        {extractedHead && viewMode === 'global_alignment' && (() => {
          const refTpl = templates.find((t) => t.id === globalRefTemplateId) || activeTemplate;
          const refPreview = packPreviews[refTpl.id];
          const hasOverride = !!individualHeadAlignments[refTpl.id];

          return (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Top Bar for Global Alignment */}
              <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-800 bg-slate-900/60 backdrop-blur">
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Adjustment Scope:
                  </span>
                  <div className="flex p-0.5 rounded-xl bg-slate-800 border border-slate-700">
                    <button
                      onClick={() => setAlignmentScope('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        alignmentScope === 'all'
                          ? 'bg-rose-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All 12 Stickers (Global)
                    </button>
                    <button
                      onClick={() => setAlignmentScope('individual')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        alignmentScope === 'individual'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      This Sticker ({refTpl.name})
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsCalibratingChin(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-medium transition"
                    title="Calibrate natural chin anchor point"
                  >
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span>{calibratedChin ? 'Chin Calibrated (Edit)' : 'Calibrate Chin'}</span>
                  </button>

                  <button
                    onClick={resetAllAlignment}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
                    title="Reset all alignments across the pack back to auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Reset All</span>
                  </button>

                  <button
                    onClick={() => setViewMode('gallery')}
                    className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold shadow-md shadow-rose-500/20 transition active:scale-95"
                  >
                    <CheckCircle className="w-4 h-4 text-slate-950" />
                    <span>Done</span>
                  </button>
                </div>
              </div>

              {/* Middle Area: Left Controls + Center Canvas */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left Controls Sidebar */}
                <div className="w-80 border-r border-slate-800 bg-slate-900/40 backdrop-blur p-5 space-y-6 overflow-y-auto">
                  {/* Active Scope Card */}
                  <div
                    className={`p-3.5 rounded-2xl border ${
                      alignmentScope === 'all'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Target Mode
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          alignmentScope === 'all'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {alignmentScope === 'all' ? 'Pack-Wide' : 'Single Sticker'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {alignmentScope === 'all'
                        ? 'Global Pack Alignment'
                        : `Fine-Tuning: ${refTpl.name}`}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {alignmentScope === 'all'
                        ? 'Adjusting scale or tilt here scales and pivots all 12 templates proportionally around each character’s chin anchor.'
                        : 'Changes apply only to this sticker as a relative adjustment on top of global alignment.'}
                    </p>
                  </div>

                  {/* Sliders */}
                  <div className="space-y-4">
                    {/* Head Size Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span className="font-medium">Head Size</span>
                        <span className="font-mono text-slate-200">
                          {alignmentScope === 'all'
                            ? `${Math.round(globalHeadAlignment.scaleMultiplier * 100)}%`
                            : `${Math.round((individualHeadAlignments[refTpl.id]?.scaleMultiplier ?? 1.0) * 100)}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="75"
                        max="135"
                        step="1"
                        value={
                          alignmentScope === 'all'
                            ? Math.round(globalHeadAlignment.scaleMultiplier * 100)
                            : Math.round(
                                (individualHeadAlignments[refTpl.id]?.scaleMultiplier ?? 1.0) * 100
                              )
                        }
                        onChange={(e) => {
                          const val = Number(e.target.value) / 100;
                          if (alignmentScope === 'all') {
                            setGlobalHeadAlignment({ scaleMultiplier: val });
                          } else {
                            setIndividualHeadAlignment(refTpl.id, { scaleMultiplier: val });
                          }
                        }}
                        className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>75%</span>
                        <span>100% (Default)</span>
                        <span>135%</span>
                      </div>
                    </div>

                    {/* Head Tilt Slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span className="font-medium">Head Tilt</span>
                        <span className="font-mono text-slate-200">
                          {alignmentScope === 'all'
                            ? `${globalHeadAlignment.rotationDelta > 0 ? '+' : ''}${globalHeadAlignment.rotationDelta}°`
                            : `${(individualHeadAlignments[refTpl.id]?.rotationDelta ?? 0) > 0 ? '+' : ''}${individualHeadAlignments[refTpl.id]?.rotationDelta ?? 0}°`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-15"
                        max="15"
                        step="0.5"
                        value={
                          alignmentScope === 'all'
                            ? globalHeadAlignment.rotationDelta
                            : (individualHeadAlignments[refTpl.id]?.rotationDelta ?? 0)
                        }
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (alignmentScope === 'all') {
                            setGlobalHeadAlignment({ rotationDelta: val });
                          } else {
                            setIndividualHeadAlignment(refTpl.id, { rotationDelta: val });
                          }
                        }}
                        className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>-15°</span>
                        <span>0°</span>
                        <span>+15°</span>
                      </div>
                    </div>

                    {/* Drag to Position Hint */}
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start space-x-2.5">
                      <Move className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-300 leading-tight">
                        <strong className="text-white block mb-0.5">Drag to Position</strong>
                        Click and drag directly on the preview canvas to position the head.
                      </div>
                    </div>

                    {/* Resets */}
                    <div className="pt-2 space-y-2 border-t border-slate-800">
                      {alignmentScope === 'all' ? (
                        <button
                          onClick={resetGlobalAlignment}
                          className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset Global Alignment</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => resetIndividualAlignment(refTpl.id)}
                          disabled={!hasOverride}
                          className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition disabled:opacity-40"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset This Sticker Override</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center Interactive Preview Canvas */}
                <div
                  className={`flex-1 flex items-center justify-center p-8 relative overflow-hidden ${
                    previewBg === 'checker'
                      ? 'checkerboard-bg'
                      : previewBg === 'dark'
                      ? 'bg-zinc-950'
                      : previewBg === 'white'
                      ? 'bg-white'
                      : 'bg-stone-100'
                  }`}
                >
                  <div className="relative max-w-full max-h-full flex items-center justify-center">
                    <canvas
                      ref={globalPreviewCanvasRef}
                      onMouseDown={handleGlobalMouseDown}
                      className="max-h-[60vh] max-w-full object-contain filter drop-shadow-2xl cursor-grab active:cursor-grabbing rounded-2xl select-none"
                    />
                    {/* Collar / Chin Alignment Visual Indicator */}
                    <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur border border-slate-800 text-[11px] text-slate-300 font-mono flex items-center space-x-2 pointer-events-none">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Chin Anchored to Collar</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom 12-Sticker Live Strip */}
              <div className="h-32 border-t border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-2 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Live Pack Previews (Select Reference Sticker)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Click any thumbnail to preview and tune that template
                  </span>
                </div>
                <div className="flex items-center space-x-3 overflow-x-auto pb-1 scrollbar-thin">
                  {templates.map((tpl, idx) => {
                    const prev = packPreviews[tpl.id];
                    const isRef = tpl.id === refTpl.id;
                    const stickerHasOverride = !!individualHeadAlignments[tpl.id];
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setGlobalRefTemplateId(tpl.id)}
                        className={`flex-shrink-0 w-20 h-20 rounded-xl p-1 relative cursor-pointer border transition flex flex-col items-center justify-center ${
                          isRef
                            ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/40'
                            : 'border-slate-800 hover:border-slate-600 bg-slate-800/40'
                        }`}
                      >
                        <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
                          <StickerThumbnail
                            stickerCanvas={prev?.stickerCanvas}
                            tightCrop={prev?.tightCrop}
                            previewBg={previewBg}
                          />
                        </div>
                        <span className="text-[9px] font-bold text-slate-300 truncate w-full text-center mt-0.5">
                          {String(idx + 1).padStart(2, '0')}. {tpl.name.split(' ')[0]}
                        </span>
                        {stickerHasOverride && (
                          <span
                            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"
                            title="Custom individual override"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 6. DETAIL VIEW (Individual Sticker Tuning & Shared Brush Editing) */}
        {extractedHead && viewMode === 'detail' && (
          <>
            {/* Left Control Sidebar */}
            <div className="w-80 border-r border-slate-800 bg-slate-900/60 backdrop-blur flex flex-col justify-between overflow-y-auto z-10">
              <div className="p-5 space-y-5">
                {/* Back to Pack Bar */}
                <button
                  onClick={() => setViewMode('gallery')}
                  className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Reactions Pack</span>
                </button>

                {/* Sticker Info */}
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                    Active Sticker
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">{activeTemplate.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{activeTemplate.description}</div>
                </div>

                {/* 1. Mode Controls (Move vs Erase vs Restore) */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Tool Mode</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition"
                        title="Undo brush stroke"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition"
                        title="Redo brush stroke"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setToolMode('move')}
                      className={`flex flex-col items-center justify-center py-2 rounded-xl border text-xs font-medium transition ${
                        toolMode === 'move'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Move className="w-4 h-4 mb-1" />
                      <span>Move</span>
                    </button>
                    <button
                      onClick={() => setToolMode('erase')}
                      className={`flex flex-col items-center justify-center py-2 rounded-xl border text-xs font-medium transition ${
                        toolMode === 'erase'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Eraser className="w-4 h-4 mb-1" />
                      <span>Erase Hair</span>
                    </button>
                    <button
                      onClick={() => setToolMode('restore')}
                      className={`flex flex-col items-center justify-center py-2 rounded-xl border text-xs font-medium transition ${
                        toolMode === 'restore'
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Paintbrush className="w-4 h-4 mb-1" />
                      <span>Restore</span>
                    </button>
                  </div>

                  {(toolMode === 'erase' || toolMode === 'restore') && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Brush Size</span>
                        <span className="font-mono text-slate-200">{brushSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="80"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <p className="text-[10px] text-amber-400/90 leading-tight pt-1">
                        Brush edits update the shared head across all 12 reaction stickers.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Transform Controls */}
                {headTransform && (
                  <div className="space-y-3.5 border-t border-slate-800/80 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Placement & Tilt
                      </span>
                      <button
                        onClick={resetPlacement}
                        className="flex items-center space-x-1 text-[11px] text-rose-400 hover:text-rose-300 font-medium transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Head Scale</span>
                        <span className="font-mono text-slate-200">
                          {Math.round(headTransform.scale * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="1.6"
                        step="0.01"
                        value={headTransform.scale}
                        onChange={(e) => updateHeadTransform({ scale: Number(e.target.value) })}
                        className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Head Tilt</span>
                        <span className="font-mono text-slate-200">
                          {headTransform.rotationDegrees}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-30"
                        max="30"
                        step="0.5"
                        value={headTransform.rotationDegrees}
                        onChange={(e) => updateHeadTransform({ rotationDegrees: Number(e.target.value) })}
                        className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Hair Layering Toggle */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs text-slate-400 font-medium">Hair Placement</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => updateHeadTransform({ hairBehindBody: false })}
                          className={`py-1.5 text-xs rounded-lg border font-medium transition ${
                            !headTransform.hairBehindBody
                              ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          In Front of Torso
                        </button>
                        <button
                          onClick={() => updateHeadTransform({ hairBehindBody: true })}
                          className={`py-1.5 text-xs rounded-lg border font-medium transition ${
                            headTransform.hairBehindBody
                              ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Behind Torso
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Die-Cut Border Settings */}
                <div className="space-y-3.5 border-t border-slate-800/80 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Die-Cut Border
                    </div>
                    {templateBorderThicknesses[activeTemplate.id] !== undefined && (
                      <button
                        onClick={() => setTemplateBorderThickness(activeTemplate.id, null)}
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-medium transition"
                        title="Revert to global pack border"
                      >
                        Reset to Pack Default ({borderThickness}px)
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Sticker Border Width</span>
                      <span className="font-mono text-slate-200">
                        {(templateBorderThicknesses[activeTemplate.id] ?? borderThickness)}px
                        <span className="text-[11px] text-slate-400 font-sans ml-1">
                          {templateBorderThicknesses[activeTemplate.id] !== undefined ? '(Custom)' : '(Pack Default)'}
                        </span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="48"
                      value={templateBorderThicknesses[activeTemplate.id] ?? borderThickness}
                      onChange={(e) => setTemplateBorderThickness(activeTemplate.id, Number(e.target.value))}
                      className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* 4. Background Staging */}
                <div className="space-y-2 border-t border-slate-800/80 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-rose-400" />
                    <span>Preview Background</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'checker', label: 'Grid' },
                      { id: 'dark', label: 'Dark' },
                      { id: 'white', label: 'White' },
                      { id: 'print', label: 'Paper' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => setPreviewBg(bg.id as any)}
                        className={`py-1 text-xs rounded-lg border font-medium transition ${
                          previewBg === bg.id
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Export Actions for this sticker */}
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
                </div>
              </div>
            </div>

            {/* Right Center: Interactive Preview Canvas Stage */}
            <div className="flex-1 flex items-center justify-center p-8 overflow-auto relative">
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
                    filter:
                      borderThickness > 0 ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.25))' : 'none',
                  }}
                />

                <div className="absolute bottom-4 left-6 flex items-center space-x-2 text-[10px] text-slate-400 bg-slate-950/80 backdrop-blur px-3 py-1 rounded-full border border-slate-800/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>3-Layer Composite • {activeTemplate.name}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {isCalibratingChin && extractedHead && (
        <ChinCalibrationModal
          head={extractedHead}
          calibratedChin={calibratedChin}
          onSave={setCalibratedChin}
          onClose={() => setIsCalibratingChin(false)}
        />
      )}

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
