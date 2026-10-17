/**
 * Advanced Extraction Editor Modal.
 * High-performance workspace integrating brush painting, touching-object split,
 * backing override customization, and actionable edge quality inspection.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Check, Sliders } from 'lucide-react';
import {
  ArtworkComponent,
  BackingOverride,
  BoundingBox,
  EdgeInspectorConfig,
  EdgeWarning,
  MaskPatch,
  StickerGroup,
  ToolMode,
  TouchingSplitRequest
} from '../../types';
import { buildGroupDistanceField, compositeSticker } from '../../core/composer';
import { DEFAULT_EDGE_CONFIG, inspectStickerEdge } from '../../core/edgeInspector';
import { EditorToolbar } from './EditorToolbar';
import { EditorContextBar } from './EditorContextBar';
import { EditorWorkspace } from './EditorWorkspace';
import { EditorCanvas } from './EditorCanvas';
import { EdgeInspectorPanel } from './EdgeInspectorPanel';
import { useBrushTool } from './tools/useBrushTool';
import { useSplitTool } from './tools/useSplitTool';

interface AdvancedEditorModalProps {
  group: StickerGroup;
  components: ArtworkComponent[];
  groups: StickerGroup[];
  sourceImage: ImageData;
  labelMap: Uint16Array;
  alphaMask: Uint8Array;
  sheetWidth: number;
  sheetHeight: number;
  estimatedBgColor: [number, number, number];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onApplyBrushPatch: (patch: MaskPatch, activeGroupId: string) => void;
  onSplitTouchingComponent: (compId: string, request: TouchingSplitRequest) => boolean;
  onUpdateBackingOverride: (groupId: string, override: BackingOverride) => void;
  onClose: () => void;
}

export const AdvancedEditorModal: React.FC<AdvancedEditorModalProps> = ({
  group,
  components,
  groups,
  sourceImage,
  labelMap,
  alphaMask,
  sheetWidth,
  sheetHeight,
  estimatedBgColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onApplyBrushPatch,
  onSplitTouchingComponent,
  onUpdateBackingOverride,
  onClose
}) => {
  // Active tool
  const [toolMode, setToolMode] = useState<ToolMode>('restore-brush');

  // Brush settings
  const [brushSize, setBrushSize] = useState<number>(24);
  const [brushHardness, setBrushHardness] = useState<number>(0.8);
  const [brushOpacity, setBrushOpacity] = useState<number>(1.0);

  // Backing smoothing
  const [smoothingRadius, setSmoothingRadius] = useState<number>(
    group.backingOverride?.smoothingRadius || 0
  );

  // Before/After comparison
  const [showBeforeAfter, setShowBeforeAfter] = useState<boolean>(false);
  const [beforeRgba, setBeforeRgba] = useState<Uint8ClampedArray | null>(null);

  // Edge Inspector config & highlighted warning
  const [edgeConfig, setEdgeConfig] = useState<EdgeInspectorConfig>(DEFAULT_EDGE_CONFIG);
  const [highlightedBox, setHighlightedBox] = useState<BoundingBox | null>(null);

  // Zoom preset trigger
  const [zoomTrigger, setZoomTrigger] = useState<{ type: 'fit' | '100%' | '50%' | '200%' | '400%'; timestamp: number } | null>(null);

  // Screen to canvas coordinate transform ref
  const screenToCanvasRef = useRef<((clientX: number, clientY: number) => { x: number; y: number }) | null>(null);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    return screenToCanvasRef.current ? screenToCanvasRef.current(clientX, clientY) : { x: 0, y: 0 };
  }, []);

  const compMap = useMemo(() => new Map(components.map(c => [c.id, c])), [components]);

  // Primary component of this group
  const primaryComp = useMemo(() => {
    if (group.componentIds.length === 0) return null;
    return compMap.get(group.componentIds[0]) || null;
  }, [group, compMap]);

  // Compose isolated sticker buffer
  const { distField, patchBounds, localWidth, localHeight } = useMemo(() => {
    return buildGroupDistanceField(
      group,
      compMap,
      labelMap,
      sheetWidth,
      sheetHeight,
      Math.max(64, Math.ceil(group.borderThickness) + 12)
    );
  }, [group, compMap, labelMap, sheetWidth, sheetHeight]);

  const { rgba } = useMemo(() => {
    return compositeSticker(
      group,
      compMap,
      labelMap,
      alphaMask,
      sourceImage.data,
      sheetWidth,
      sheetHeight,
      distField,
      patchBounds,
      group.borderThickness,
      0
    );
  }, [group, compMap, labelMap, alphaMask, sourceImage, sheetWidth, sheetHeight, distField, patchBounds]);

  // Snapshot before state on initial open
  useEffect(() => {
    if (!beforeRgba && rgba) {
      setBeforeRgba(new Uint8ClampedArray(rgba));
    }
  }, [beforeRgba, rgba]);

  // Run Edge Inspector
  const edgeWarnings = useMemo(() => {
    return inspectStickerEdge(
      group,
      compMap,
      labelMap,
      alphaMask,
      sourceImage.data,
      sheetWidth,
      sheetHeight,
      distField,
      patchBounds,
      estimatedBgColor,
      edgeConfig
    );
  }, [group, compMap, labelMap, alphaMask, sourceImage, sheetWidth, sheetHeight, distField, patchBounds, estimatedBgColor, edgeConfig]);

  // Brush tool controller
  const brushTool = useBrushTool({
    alphaMask,
    sheetWidth,
    sheetHeight,
    onApplyPatch: patch => onApplyBrushPatch(patch, group.id),
    options: {
      radius: brushSize / 2,
      hardness: brushHardness,
      opacity: brushOpacity,
      mode: toolMode === 'erase-brush' ? 'erase' : 'restore'
    },
    screenToCanvas
  });

  // Split tool controller
  const splitTool = useSplitTool({
    targetComponent: primaryComp,
    imageRgba: sourceImage.data,
    alphaMask,
    labelMap,
    sheetWidth,
    onCommitSplit: (compId, req) => onSplitTouchingComponent(compId, req),
    screenToCanvas
  });

  // Smoothing radius update
  const handleSmoothingRadiusChange = (radius: number) => {
    setSmoothingRadius(radius);
    onUpdateBackingOverride(group.id, {
      ...group.backingOverride,
      groupId: group.id,
      smoothingRadius: radius
    });
  };

  // Keyboard accelerators
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        onRedo();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'b' || e.key === 'B') {
        setToolMode('restore-brush');
      } else if (e.key === 'e' || e.key === 'E') {
        setToolMode('erase-brush');
      } else if (e.key === 's' || e.key === 'S') {
        setToolMode('split');
      } else if (e.key === 'h' || e.key === 'H') {
        setToolMode('pan');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo, onClose]);

  // Route pointer events to active tool
  const handlePointerDown = (e: React.PointerEvent) => {
    if (toolMode === 'split') {
      splitTool.handlePointerDown(e);
    } else if (toolMode === 'restore-brush' || toolMode === 'erase-brush') {
      brushTool.handlePointerDown(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (toolMode === 'split') {
      splitTool.handlePointerMove(e);
    } else if (toolMode === 'restore-brush' || toolMode === 'erase-brush') {
      brushTool.handlePointerMove(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (toolMode === 'split') {
      splitTool.handlePointerUp();
    } else if (toolMode === 'restore-brush' || toolMode === 'erase-brush') {
      brushTool.handlePointerUp(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-[94vw] h-[92vh] max-w-7xl overflow-hidden border border-neutral-300">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-neutral-200 px-5 flex items-center justify-between select-none shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-neutral-800 text-base flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pink-500 inline-block" />
              Advanced Editor — {group.name}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono">
              {localWidth} × {localHeight} px
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-pink-600 text-white font-semibold text-xs hover:bg-pink-700 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-4 h-4" /> Done & Return
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-500 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Context Bar */}
        <EditorContextBar
          toolMode={toolMode}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          brushHardness={brushHardness}
          onBrushHardnessChange={setBrushHardness}
          brushOpacity={brushOpacity}
          onBrushOpacityChange={setBrushOpacity}
          smoothingRadius={smoothingRadius}
          onSmoothingRadiusChange={handleSmoothingRadiusChange}
          splitMode={splitTool.splitMode}
          onSplitModeChange={splitTool.setSplitMode}
          hasSplitPreview={!!splitTool.preview}
          onCommitSplit={splitTool.commit}
          onCancelSplit={splitTool.reset}
          showBeforeAfter={showBeforeAfter}
          onToggleBeforeAfter={() => setShowBeforeAfter(!showBeforeAfter)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onZoomFit={() => setZoomTrigger({ type: 'fit', timestamp: Date.now() })}
          onZoom100={() => setZoomTrigger({ type: '100%', timestamp: Date.now() })}
          onZoomPreset={preset => setZoomTrigger({ type: preset, timestamp: Date.now() })}
        />

        {/* Main Work Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Toolbar */}
          <EditorToolbar
            toolMode={toolMode}
            onToolModeChange={setToolMode}
          />

          {/* Central Workspace */}
          <EditorWorkspace
            patchBounds={patchBounds}
            toolMode={toolMode}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={brushTool.handlePointerLeave}
            screenToCanvasRef={screenToCanvasRef}
            zoomTrigger={zoomTrigger}
          >
            <EditorCanvas
              composedRgba={rgba}
              canvasWidth={localWidth}
              canvasHeight={localHeight}
              patchBounds={patchBounds}
              brushCursor={brushTool.cursorPos}
              brushRadius={brushSize / 2}
              brushHardness={brushHardness}
              splitCutLine={splitTool.cutLine}
              seedA={splitTool.seedA}
              seedB={splitTool.seedB}
              splitPreview={splitTool.preview}
              highlightedBox={highlightedBox}
              showBeforeAfter={showBeforeAfter}
              beforeRgba={beforeRgba}
            />
          </EditorWorkspace>

          {/* Right Edge Inspector */}
          <EdgeInspectorPanel
            warnings={edgeWarnings}
            config={edgeConfig}
            onConfigChange={setEdgeConfig}
            onHighlightWarning={warn => setHighlightedBox(warn.location as BoundingBox || null)}
          />
        </div>
      </div>
    </div>
  );
};
