import React, { useRef } from 'react';
import {
  Upload,
  Undo2,
  Redo2,
  LayoutGrid,
  Maximize2,
  Download,
  Archive,
  Sun,
  Moon,
  Grid,
  DownloadCloud,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { ViewMode } from '../types';

interface ToolbarProps {
  fileName: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  previewBg: 'checker' | 'dark' | 'light' | 'saturated';
  onPreviewBgChange: (bg: 'checker' | 'dark' | 'light' | 'saturated') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImportFile: (file: File) => void;
  onExportSelected: () => void;
  onExportAll: () => void;
  selectedCount: number;
  totalCount: number;
  isProcessing: boolean;
  onImportDataUrl?: (dataUrl: string, name: string) => void;
  canInstall?: boolean;
  onInstallClick?: () => void;
  isOfflineReady?: boolean;
  needRefresh?: boolean;
  onRefreshClick?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  fileName,
  viewMode,
  onViewModeChange,
  previewBg,
  onPreviewBgChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImportFile,
  onImportDataUrl,
  onExportSelected,
  onExportAll,
  selectedCount,
  totalCount,
  isProcessing,
  canInstall,
  onInstallClick,
  isOfflineReady,
  needRefresh,
  onRefreshClick
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = async () => {
    if (window.desktopAPI && onImportDataUrl) {
      const result = await window.desktopAPI.openFileDialog();
      if (result) {
        onImportDataUrl(result.dataUrl, result.fileName);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportFile(e.target.files[0]);
    }
  };

  const handleAboutClick = () => {
    if (window.desktopAPI) {
      window.desktopAPI.showAbout();
    } else {
      alert("Sticker Studio — Sheet Extractor v1.0.0\n\nLocal-first illustration extractor and print-ready transparent PNG die-cut generator.\nZero Cloud Dependencies.");
    }
  };

  return (
    <header className="h-14 bg-white border-b border-neutral-200 px-4 flex items-center justify-between select-none shadow-sm z-30">
      {/* Left: Branding & Upload */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAboutClick}
          title="About Sticker Studio"
          className="flex items-center gap-2 text-left hover:opacity-85 transition cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            ✂
          </div>
          <div>
            <h1 className="text-sm font-bold text-neutral-800 leading-tight">
              Sticker Studio
            </h1>
            <span className="text-[11px] font-medium text-pink-600 block leading-tight">
              Sheet Extractor
            </span>
          </div>
        </button>

        <div className="h-6 w-px bg-neutral-200 mx-1" />

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
        />

        <button
          onClick={handleImportClick}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 font-semibold text-xs transition border border-pink-200 shadow-xs active:scale-98 disabled:opacity-50 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{fileName ? 'Import Another Sheet' : 'Import Sticker Sheet'}</span>
        </button>

        {fileName && (
          <span className="text-xs text-neutral-500 font-mono truncate max-w-[160px] bg-neutral-50 px-2 py-1 rounded border border-neutral-200">
            {fileName}
          </span>
        )}
      </div>

      {/* Center: View mode & Undo/Redo */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
          <button
            onClick={() => onViewModeChange('sheet')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
              viewMode === 'sheet'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Source Sheet</span>
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
              viewMode === 'grid'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Sticker Previews</span>
          </button>
        </div>

        <div className="h-5 w-px bg-neutral-200 mx-1" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-600 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-600 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-px bg-neutral-200 mx-1" />

        {/* Background color toggles */}
        <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
          <button
            onClick={() => onPreviewBgChange('checker')}
            title="Checkerboard Transparency"
            className={`p-1.5 rounded-md transition ${previewBg === 'checker' ? 'bg-white shadow-xs text-neutral-800' : 'text-neutral-500'}`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onPreviewBgChange('dark')}
            title="Dark Background"
            className={`p-1.5 rounded-md transition ${previewBg === 'dark' ? 'bg-white shadow-xs text-neutral-800' : 'text-neutral-500'}`}
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onPreviewBgChange('light')}
            title="Light Background"
            className={`p-1.5 rounded-md transition ${previewBg === 'light' ? 'bg-white shadow-xs text-neutral-800' : 'text-neutral-500'}`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Export actions */}
      <div className="flex items-center gap-2">
        {isOfflineReady && (
          <div
            title="App resources are cached on your device. Fully functional offline."
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200/90 shadow-2xs"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Available Offline</span>
          </div>
        )}

        {needRefresh && onRefreshClick && (
          <button
            onClick={onRefreshClick}
            title="New version available. Click to reload safely."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300 animate-pulse transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
            <span>Update Available</span>
          </button>
        )}

        {!window.desktopAPI && canInstall && onInstallClick && (
          <button
            onClick={onInstallClick}
            title="Install Sticker Studio on your device"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-semibold border border-pink-200 transition cursor-pointer active:scale-98"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-pink-600" />
            <span>Install App</span>
          </button>
        )}

        {selectedCount > 0 && (
          <button
            onClick={onExportSelected}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs transition border border-neutral-300 shadow-xs active:scale-98"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export ({selectedCount})</span>
          </button>
        )}

        <button
          onClick={onExportAll}
          disabled={isProcessing || totalCount === 0}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xs transition shadow-sm hover:shadow active:scale-98 disabled:opacity-50"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Export All ({totalCount}) as ZIP</span>
        </button>
      </div>
    </header>
  );
};
