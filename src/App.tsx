import React, { useEffect, useState, useCallback } from 'react';
import { Upload, Sparkles, Layers, ArrowRight, Loader2, Image as ImageIcon } from 'lucide-react';
import { useProjectState } from './state/useProjectState';
import { Toolbar } from './components/Toolbar';
import { SourceSheetView } from './components/SourceSheetView';
import { StickerGridView } from './components/StickerGridView';
import { ControlsPanel } from './components/ControlsPanel';
import { usePWA } from './pwa/usePWA';
import { InstallModal } from './components/InstallModal';

const SAMPLE_SHEETS = [
  {
    id: 'momos_bakery',
    name: "Momo's Bakery",
    description: "Cream puppies, white frosting, banners & loose ingredients",
    path: '/samples/momos_bakery.jpg',
    thumbnail: '/samples/momos_bakery.jpg'
  },
  {
    id: 'indoor_gardening',
    name: "Indoor Gardening",
    description: "Thin stems, scissors openings, watering can droplets & seeds",
    path: '/samples/indoor_gardening.jpg',
    thumbnail: '/samples/indoor_gardening.jpg'
  },
  {
    id: 'comfort_club',
    name: "Comfort Club",
    description: "Soft pastels, delicate steam, socks & disconnected groups",
    path: '/samples/comfort_club.jpg',
    thumbnail: '/samples/comfort_club.jpg'
  },
  {
    id: 'misos_aquarium',
    name: "Miso's Aquarium",
    description: "Aquarium scenes, cats, stingray, floating bubbles & sea life",
    path: '/samples/misos_aquarium.jpg',
    thumbnail: '/samples/misos_aquarium.jpg'
  }
];

export default function App() {
  const {
    sourceImage,
    fileName,
    sheetDimensions,
    labelMap,
    alphaMask,
    components,
    groups,
    holes,
    viewMode,
    toolMode,
    previewBg,
    selectedGroupIds,
    selectedComponentIds,
    globalBorderThickness,
    isProcessing,
    progress,
    exportProgress,
    groupDistanceFieldsRef,
    canUndo,
    canRedo,
    setViewMode,
    setToolMode,
    setPreviewBg,
    importImage,
    importFromDataUrl,
    selectGroup,
    selectComponent,
    setSelectedGroupIds,
    setSelectedComponentIds,
    mergeSelectedGroups,
    splitSelectedGroup,
    groupSelectedComponents,
    toggleGroupExcluded,
    updateGroupBorder,
    updateGlobalBorder,
    toggleGroupSetting,
    undo,
    redo,
    exportSingleSticker,
    exportAllZip
  } = useProjectState();

  const {
    canInstall,
    isOfflineReady,
    needRefresh,
    isInstallModalOpen,
    setIsInstallModalOpen,
    triggerInstall,
    reloadApp
  } = usePWA();

  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Global drag-and-drop listener
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      importImage(e.dataTransfer.files[0]);
    }
  };

  // Quick load sample sticker sheet
  const loadSampleSheet = useCallback(async (sample: typeof SAMPLE_SHEETS[0]) => {
    try {
      const response = await fetch(sample.path);
      const blob = await response.blob();
      const file = new File([blob], `${sample.id}.jpg`, { type: 'image/jpeg' });
      importImage(file);
    } catch (err) {
      console.error('Failed to load sample sheet:', err);
    }
  }, [importImage]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'v' || e.key === 'V') {
        setToolMode('select');
      } else if (e.key === 'l' || e.key === 'L') {
        setToolMode('lasso');
      } else if (e.key === 'Escape') {
        setSelectedGroupIds([]);
        setSelectedComponentIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setToolMode, setSelectedGroupIds, setSelectedComponentIds]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col w-screen h-screen overflow-hidden bg-neutral-100 text-neutral-900"
    >
      {/* Top Application Toolbar */}
      <Toolbar
        fileName={fileName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        previewBg={previewBg}
        onPreviewBgChange={setPreviewBg}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onImportFile={importImage}
        onImportDataUrl={importFromDataUrl}
        onExportSelected={() => {
          if (selectedGroupIds.length > 0) {
            exportSingleSticker(selectedGroupIds[0]);
          }
        }}
        onExportAll={exportAllZip}
        selectedCount={selectedGroupIds.length}
        totalCount={groups.filter(g => !g.excludedFromExport).length}
        isProcessing={isProcessing}
        canInstall={canInstall}
        onInstallClick={triggerInstall}
        isOfflineReady={isOfflineReady}
        needRefresh={needRefresh}
        onRefreshClick={reloadApp}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {sourceImage ? (
          <>
            {/* Left/Center Workspace: Source Sheet View OR Sticker Grid View */}
            {viewMode === 'sheet' ? (
              <SourceSheetView
                sourceImage={sourceImage}
                components={components}
                groups={groups}
                selectedGroupIds={selectedGroupIds}
                selectedComponentIds={selectedComponentIds}
                toolMode={toolMode}
                onToolModeChange={setToolMode}
                onSelectGroup={selectGroup}
                onSelectComponent={selectComponent}
                onGroupSelectedComponents={groupSelectedComponents}
                onMergeSelectedGroups={mergeSelectedGroups}
                onSplitSelectedGroup={splitSelectedGroup}
                onToggleGroupExcluded={toggleGroupExcluded}
              />
            ) : (
              <StickerGridView
                sourceImage={sourceImage}
                labelMap={labelMap}
                alphaMask={alphaMask}
                components={components}
                groups={groups}
                sheetWidth={sheetDimensions.width}
                sheetHeight={sheetDimensions.height}
                previewBg={previewBg}
                groupDistanceFieldsRef={groupDistanceFieldsRef}
                onToggleGroupExcluded={toggleGroupExcluded}
                onUpdateGroupBorder={updateGroupBorder}
                onExportSingle={exportSingleSticker}
                onSelectGroup={selectGroup}
                selectedGroupIds={selectedGroupIds}
              />
            )}

            {/* Right Controls Sidebar */}
            <ControlsPanel
              groups={groups}
              selectedGroupIds={selectedGroupIds}
              globalBorderThickness={globalBorderThickness}
              holes={holes}
              onUpdateGlobalBorder={updateGlobalBorder}
              onUpdateGroupBorder={updateGroupBorder}
              onToggleGroupSetting={toggleGroupSetting}
              onMergeSelected={mergeSelectedGroups}
              onSplitSelected={splitSelectedGroup}
              onToggleExcluded={toggleGroupExcluded}
            />
          </>
        ) : (
          /* Empty Landing / Import Screen */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-linear-to-b from-neutral-50 to-neutral-100 overflow-y-auto">
            <div className="max-w-2xl w-full flex flex-col items-center text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-semibold mb-4 border border-pink-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Production Local-First AI Sticker Extractor</span>
              </div>

              {/* Title */}
              <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight mb-2">
                Turn Sticker Sheets into Print-Ready PNGs
              </h2>
              <p className="text-sm text-neutral-500 max-w-lg mb-8">
                Drop your illustration sheet to automatically isolate artwork, protect internal white & cream colors, generate smooth die-cut borders, and export individual transparent PNGs.
              </p>

              {/* Dropzone Box */}
              <div
                onClick={async (e) => {
                  if (window.desktopAPI) {
                    e.preventDefault();
                    const result = await window.desktopAPI.openFileDialog();
                    if (result) {
                      importFromDataUrl(result.dataUrl, result.fileName);
                    }
                  }
                }}
                className="w-full flex flex-col items-center justify-center p-10 border-2 border-dashed border-pink-300 hover:border-pink-500 bg-white hover:bg-pink-50/40 rounded-2xl cursor-pointer shadow-xs hover:shadow-md transition group relative"
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      importImage(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="w-14 h-14 rounded-2xl bg-pink-100 group-hover:bg-pink-200 flex items-center justify-center text-pink-600 mb-4 transition group-hover:scale-105 pointer-events-none">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="text-sm font-bold text-neutral-800 mb-1 pointer-events-none">
                  Click to browse or drop sticker sheet image here
                </div>
                <div className="text-xs text-neutral-400 font-mono pointer-events-none">
                  Supports high-resolution PNG, JPEG, WebP (up to 4000×4000+)
                </div>
              </div>

              {/* Reference Sample Sheets */}
              <div className="w-full mt-10 text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Or Try With Reference Kawaii Sheets:
                  </span>
                  <span className="text-[11px] text-pink-600 font-medium">Click any sheet to test extraction</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {SAMPLE_SHEETS.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => loadSampleSheet(sample)}
                      className="group flex flex-col p-2.5 bg-white hover:bg-pink-50/40 border border-neutral-200 hover:border-pink-400 rounded-xl transition text-left shadow-2xs hover:shadow-sm"
                    >
                      <div className="w-full h-24 rounded-lg bg-neutral-100 overflow-hidden mb-2 border border-neutral-100">
                        <img
                          src={sample.thumbnail}
                          alt={sample.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                        />
                      </div>
                      <div className="text-xs font-bold text-neutral-800 group-hover:text-pink-600 transition truncate">
                        {sample.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 line-clamp-2 mt-0.5 leading-snug">
                        {sample.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Drag Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-pink-600/20 backdrop-blur-xs flex items-center justify-center border-4 border-dashed border-pink-500 z-50 pointer-events-none">
            <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
              <Upload className="w-6 h-6 text-pink-600 animate-bounce" />
              <span className="text-sm font-bold text-neutral-800">
                Drop sticker sheet to extract illustrations
              </span>
            </div>
          </div>
        )}

        {/* Extraction Progress Modal / Banner */}
        {isProcessing && progress && (
          <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-neutral-100 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600 mb-3">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <h3 className="text-sm font-bold text-neutral-800 mb-1">
                Extracting Sticker Sheet
              </h3>
              <p className="text-xs text-neutral-500 mb-4 font-mono">
                {progress.message}
              </p>
              {/* Progress bar */}
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden mb-2 border border-neutral-200">
                <div
                  className="h-full bg-pink-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-neutral-400 font-semibold">
                {progress.percentage}%
              </span>
            </div>
          </div>
        )}

        {/* Export Progress Modal */}
        {exportProgress && (
          <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-neutral-100 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-3">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <h3 className="text-sm font-bold text-neutral-800 mb-1">
                Exporting Print-Ready Stickers
              </h3>
              <p className="text-xs text-neutral-500 font-mono">
                {exportProgress}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Educational Installation Modal */}
      <InstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </div>
  );
}
