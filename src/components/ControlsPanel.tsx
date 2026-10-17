import React from 'react';
import {
  Sliders,
  Layers,
  Sparkles,
  Link,
  Shield,
  EyeOff,
  Split,
  AlertTriangle,
  RotateCcw,
  Grid
} from 'lucide-react';
import { EnclosedHole, GridSheetConfig, StickerGroup } from '../types';

interface ControlsPanelProps {
  groups: StickerGroup[];
  selectedGroupIds: string[];
  globalBorderThickness: number;
  holes: EnclosedHole[];
  gridConfig?: GridSheetConfig;
  onUpdateGlobalBorder: (val: number) => void;
  onUpdateGroupBorder: (groupId: string, val: number) => void;
  onToggleGroupSetting: (
    groupId: string,
    key: 'whiteBackingEnabled' | 'connectBacking' | 'solidBacking'
  ) => void;
  onMergeSelected: () => void;
  onSplitSelected: () => void;
  onToggleExcluded: (groupId: string) => void;
  onRepartitionGrid?: (config?: Partial<GridSheetConfig>) => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  groups,
  selectedGroupIds,
  globalBorderThickness,
  holes,
  gridConfig,
  onUpdateGlobalBorder,
  onUpdateGroupBorder,
  onToggleGroupSetting,
  onMergeSelected,
  onSplitSelected,
  onToggleExcluded,
  onRepartitionGrid
}) => {
  const selectedGroup =
    selectedGroupIds.length === 1 ? groups.find(g => g.id === selectedGroupIds[0]) : null;

  const currentThickness = selectedGroup ? selectedGroup.borderThickness : globalBorderThickness;
  const isSelectedCustom = selectedGroup ? selectedGroup.customBorder : false;

  const activeCount = groups.filter(g => !g.excludedFromExport).length;
  const excludedCount = groups.filter(g => g.excludedFromExport).length;
  const multiPieceCount = groups.filter(g => g.componentIds.length > 1).length;

  return (
    <aside className="w-80 h-full bg-white border-l border-neutral-200 flex flex-col select-none shadow-sm overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Die-Cut & Geometry
        </h2>
        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
          {activeCount} Active Stickers
        </span>
      </div>

      <div className="p-5 flex flex-col gap-6 flex-1">
        {/* 1. Border Thickness Slider */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-pink-600" />
              <span>
                {selectedGroup ? `Border (${selectedGroup.name})` : 'Global Border Thickness'}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (selectedGroup) {
                    onUpdateGroupBorder(selectedGroup.id, 20);
                  } else {
                    onUpdateGlobalBorder(20);
                  }
                }}
                title="Reset to default (20px)"
                className="p-1 rounded text-neutral-400 hover:text-neutral-700 transition"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <span className="font-mono text-xs font-bold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                {currentThickness}px
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="60"
              value={currentThickness}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (selectedGroup) {
                  onUpdateGroupBorder(selectedGroup.id, val);
                } else {
                  onUpdateGlobalBorder(val);
                }
              }}
              className="flex-1 accent-pink-600 cursor-pointer h-1.5 bg-neutral-200 rounded-lg"
            />
          </div>

          <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
            <span>0px (Artwork only)</span>
            <span>20px (Standard)</span>
            <span>60px (Thick)</span>
          </div>
        </div>

        {/* 2. Backing Topology & Bridging Options */}
        <div className="flex flex-col gap-3 pt-2 border-t border-neutral-100">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Backing Topology
          </h3>

          {/* White Backing Toggle */}
          <label className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer transition">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-pink-600" />
              <div>
                <div className="text-xs font-semibold text-neutral-800">White Die-Cut Backing</div>
                <div className="text-[11px] text-neutral-500">Render smooth white margin</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={selectedGroup ? selectedGroup.whiteBackingEnabled : true}
              onChange={() => {
                if (selectedGroup) {
                  onToggleGroupSetting(selectedGroup.id, 'whiteBackingEnabled');
                }
              }}
              className="accent-pink-600 w-4 h-4 rounded cursor-pointer"
            />
          </label>

          {/* Connect Backing (Multi-piece bridging) */}
          <label className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer transition">
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4 text-indigo-600" />
              <div>
                <div className="text-xs font-semibold text-neutral-800">Connect Multi-Piece Backing</div>
                <div className="text-[11px] text-neutral-500">Bridge floating droplets & satellites</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={selectedGroup ? selectedGroup.connectBacking : true}
              onChange={() => {
                if (selectedGroup) {
                  onToggleGroupSetting(selectedGroup.id, 'connectBacking');
                }
              }}
              className="accent-pink-600 w-4 h-4 rounded cursor-pointer"
            />
          </label>

          {/* Solid Backing vs Preserve Openings */}
          <label className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer transition">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <div>
                <div className="text-xs font-semibold text-neutral-800">Solid Backing</div>
                <div className="text-[11px] text-neutral-500">Keep solid behind internal holes</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={selectedGroup ? selectedGroup.solidBacking : false}
              onChange={() => {
                if (selectedGroup) {
                  onToggleGroupSetting(selectedGroup.id, 'solidBacking');
                }
              }}
              className="accent-pink-600 w-4 h-4 rounded cursor-pointer"
            />
          </label>
        </div>

        {/* Contact Sheet / Grid Mode */}
        <div className="flex flex-col gap-3 pt-2 border-t border-neutral-100">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-indigo-600" />
              <span>Contact Sheet / Grid</span>
            </h3>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={gridConfig?.enabled || false}
                onChange={e => onRepartitionGrid?.({ enabled: e.target.checked })}
                className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
              />
              <span className="text-xs font-semibold text-neutral-700">Grid Mode</span>
            </label>
          </div>

          {gridConfig?.enabled && (
            <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-700 block mb-1">Columns</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={gridConfig.columns}
                    onChange={e => onRepartitionGrid?.({ columns: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2 py-1 bg-white border border-neutral-300 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-neutral-700 block mb-1">Rows</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={gridConfig.rows}
                    onChange={e => onRepartitionGrid?.({ rows: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2 py-1 bg-white border border-neutral-300 rounded text-xs font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={gridConfig.excludeCaptions}
                  onChange={e => onRepartitionGrid?.({ excludeCaptions: e.target.checked })}
                  className="accent-indigo-600 w-3.5 h-3.5 rounded"
                />
                <span className="text-[11px] text-neutral-700 font-medium">Exclude Caption Bands</span>
              </label>

              <button
                onClick={() => onRepartitionGrid?.()}
                className="w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition cursor-pointer shadow-xs"
              >
                Repartition Grid ({gridConfig.columns}×{gridConfig.rows})
              </button>
            </div>
          )}
        </div>

        {/* 3. Group Selection Actions */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-neutral-100">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Selected Sticker Actions
          </h3>

          {selectedGroupIds.length > 1 && (
            <button
              onClick={onMergeSelected}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition shadow-xs"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Merge ({selectedGroupIds.length}) Selected Stickers</span>
            </button>
          )}

          {selectedGroupIds.length === 1 && selectedGroup && (
            <div className="flex flex-col gap-2">
              {selectedGroup.componentIds.length > 1 && (
                <button
                  onClick={onSplitSelected}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs border border-neutral-300 transition"
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>Split into Separate Pieces</span>
                </button>
              )}

              <button
                onClick={() => onToggleExcluded(selectedGroup.id)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs border transition ${
                  selectedGroup.excludedFromExport
                    ? 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100'
                    : 'bg-neutral-100 text-neutral-700 border-neutral-300 hover:bg-neutral-200'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>
                  {selectedGroup.excludedFromExport ? 'Include in Export' : 'Exclude from Export'}
                </span>
              </button>
            </div>
          )}

          {selectedGroupIds.length === 0 && (
            <p className="text-xs text-neutral-400 italic">
              Click a sticker on the canvas or grid to inspect and adjust its individual cut settings.
            </p>
          )}
        </div>

        {/* 4. Sheet Statistics & Review Notifications */}
        <div className="mt-auto pt-4 border-t border-neutral-100 flex flex-col gap-2 text-xs">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Extraction Review
          </h3>

          <div className="flex items-center justify-between py-1 text-neutral-600">
            <span>Total Stickers:</span>
            <span className="font-mono font-bold text-neutral-900">{groups.length}</span>
          </div>

          <div className="flex items-center justify-between py-1 text-neutral-600">
            <span>Multi-piece Stickers:</span>
            <span className="font-mono font-semibold text-neutral-800">{multiPieceCount}</span>
          </div>

          {excludedCount > 0 && (
            <div className="flex items-center justify-between py-1 text-pink-700 bg-pink-50 px-2 rounded">
              <span>Excluded Stickers:</span>
              <span className="font-mono font-bold">{excludedCount}</span>
            </div>
          )}

          {holes.length > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{holes.length} enclosed hole candidate(s) detected. Defaulting to solid backing.</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
