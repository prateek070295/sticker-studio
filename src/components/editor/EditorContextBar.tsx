/**
 * Contextual settings bar for active tools in the Advanced Extraction Editor.
 */

import React from 'react';
import {
  Undo2,
  Redo2,
  Maximize2,
  Split,
  Check,
  X,
  Sliders
} from 'lucide-react';
import { ToolMode } from '../../types';

interface EditorContextBarProps {
  toolMode: ToolMode;
  brushSize: number;
  onBrushSizeChange: (val: number) => void;
  brushHardness: number;
  onBrushHardnessChange: (val: number) => void;
  brushOpacity: number;
  onBrushOpacityChange: (val: number) => void;
  smoothingRadius: number;
  onSmoothingRadiusChange: (val: number) => void;
  splitMode: 'cut-line' | 'seeds';
  onSplitModeChange: (mode: 'cut-line' | 'seeds') => void;
  hasSplitPreview: boolean;
  onCommitSplit: () => void;
  onCancelSplit: () => void;
  showBeforeAfter: boolean;
  onToggleBeforeAfter: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomFit: () => void;
  onZoom100: () => void;
  onZoomPreset?: (preset: '50%' | '100%' | '200%' | '400%') => void;
}

export const EditorContextBar: React.FC<EditorContextBarProps> = ({
  toolMode,
  brushSize,
  onBrushSizeChange,
  brushHardness,
  onBrushHardnessChange,
  brushOpacity,
  onBrushOpacityChange,
  smoothingRadius,
  onSmoothingRadiusChange,
  splitMode,
  onSplitModeChange,
  hasSplitPreview,
  onCommitSplit,
  onCancelSplit,
  showBeforeAfter,
  onToggleBeforeAfter,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomFit,
  onZoom100,
  onZoomPreset
}) => {
  const isBrushTool =
    toolMode === 'restore-brush' ||
    toolMode === 'erase-brush' ||
    toolMode === 'add-backing' ||
    toolMode === 'remove-backing';

  return (
    <div className="h-12 bg-neutral-50 border-b border-neutral-200 px-4 flex items-center justify-between select-none text-xs text-neutral-700">
      {/* Left: Contextual tool controls */}
      <div className="flex items-center gap-4">
        {isBrushTool && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-600">Size:</span>
              <input
                type="range"
                min="2"
                max="120"
                value={brushSize}
                onChange={e => onBrushSizeChange(Number(e.target.value))}
                className="w-24 accent-pink-500 cursor-pointer"
              />
              <span className="w-8 font-mono">{brushSize}px</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-600">Hardness:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(brushHardness * 100)}
                onChange={e => onBrushHardnessChange(Number(e.target.value) / 100)}
                className="w-20 accent-pink-500 cursor-pointer"
              />
              <span className="w-8 font-mono">{Math.round(brushHardness * 100)}%</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-600">Opacity:</span>
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(brushOpacity * 100)}
                onChange={e => onBrushOpacityChange(Number(e.target.value) / 100)}
                className="w-20 accent-pink-500 cursor-pointer"
              />
              <span className="w-8 font-mono">{Math.round(brushOpacity * 100)}%</span>
            </div>
          </>
        )}

        {toolMode === 'smooth-backing' && (
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-pink-500" />
            <span className="font-semibold text-neutral-600">Contour Smoothing:</span>
            <input
              type="range"
              min="0"
              max="10"
              value={smoothingRadius}
              onChange={e => onSmoothingRadiusChange(Number(e.target.value))}
              className="w-28 accent-pink-500 cursor-pointer"
            />
            <span className="w-8 font-mono">{smoothingRadius}px</span>
          </div>
        )}

        {toolMode === 'split' && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-neutral-600">Split Method:</span>
            <div className="flex bg-neutral-200 rounded p-0.5">
              <button
                onClick={() => onSplitModeChange('cut-line')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  splitMode === 'cut-line' ? 'bg-white font-bold text-pink-600 shadow-xs' : 'text-neutral-600'
                }`}
              >
                Cut Line
              </button>
              <button
                onClick={() => onSplitModeChange('seeds')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  splitMode === 'seeds' ? 'bg-white font-bold text-pink-600 shadow-xs' : 'text-neutral-600'
                }`}
              >
                Dual Seeds (A + B)
              </button>
            </div>

            {hasSplitPreview && (
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={onCommitSplit}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Accept Split
                </button>
                <button
                  onClick={onCancelSplit}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-200 text-neutral-700 hover:bg-neutral-300 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: History, View toggles & Zoom */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleBeforeAfter}
          className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
            showBeforeAfter ? 'bg-pink-100 text-pink-700 border border-pink-300' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
          }`}
        >
          {showBeforeAfter ? 'Split View: ON' : 'Before/After'}
        </button>

        <div className="h-4 w-px bg-neutral-300 mx-1" />

        <button
          onClick={onZoomFit}
          title="Zoom to Fit"
          className="p-1 hover:bg-neutral-200 rounded cursor-pointer text-neutral-600"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onZoomPreset ? onZoomPreset('50%') : null}
          title="Zoom 50%"
          className="px-1.5 py-0.5 hover:bg-neutral-200 rounded cursor-pointer font-mono text-[11px] text-neutral-600"
        >
          50%
        </button>
        <button
          onClick={onZoom100}
          title="Zoom 100%"
          className="px-1.5 py-0.5 hover:bg-neutral-200 rounded cursor-pointer font-mono text-[11px] text-neutral-600"
        >
          100%
        </button>
        <button
          onClick={() => onZoomPreset ? onZoomPreset('200%') : null}
          title="Zoom 200%"
          className="px-1.5 py-0.5 hover:bg-neutral-200 rounded cursor-pointer font-mono text-[11px] text-neutral-600"
        >
          200%
        </button>
        <button
          onClick={() => onZoomPreset ? onZoomPreset('400%') : null}
          title="Zoom 400%"
          className="px-1.5 py-0.5 hover:bg-neutral-200 rounded cursor-pointer font-mono text-[11px] text-neutral-600"
        >
          400%
        </button>

        <div className="h-4 w-px bg-neutral-300 mx-1" />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className={`p-1 rounded transition ${
            canUndo ? 'hover:bg-neutral-200 text-neutral-700 cursor-pointer' : 'text-neutral-300 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className={`p-1 rounded transition ${
            canRedo ? 'hover:bg-neutral-200 text-neutral-700 cursor-pointer' : 'text-neutral-300 cursor-not-allowed'
          }`}
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
