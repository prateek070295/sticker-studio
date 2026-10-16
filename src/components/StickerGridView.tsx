import React, { useEffect, useRef } from 'react';
import { Download, Sliders, CheckSquare, Square } from 'lucide-react';
import { ArtworkComponent, StickerGroup } from '../types';
import { buildGroupDistanceField, compositeSticker } from '../core/composer';

interface StickerGridViewProps {
  sourceImage: ImageData | null;
  labelMap: Uint16Array | null;
  alphaMask: Uint8Array | null;
  components: ArtworkComponent[];
  groups: StickerGroup[];
  sheetWidth: number;
  sheetHeight: number;
  previewBg: 'checker' | 'dark' | 'light' | 'saturated';
  groupDistanceFieldsRef: React.MutableRefObject<Map<string, { distField: Float32Array; bounds: { x: number; y: number; width: number; height: number } }>>;
  onToggleGroupExcluded: (groupId: string) => void;
  onUpdateGroupBorder: (groupId: string, thickness: number) => void;
  onExportSingle: (groupId: string) => void;
  onSelectGroup: (groupId: string, multi: boolean) => void;
  selectedGroupIds: string[];
}

const StickerCard: React.FC<{
  group: StickerGroup;
  sourceImage: ImageData;
  labelMap: Uint16Array;
  alphaMask: Uint8Array;
  compMap: Map<string, ArtworkComponent>;
  sheetWidth: number;
  sheetHeight: number;
  previewBg: 'checker' | 'dark' | 'light' | 'saturated';
  groupDistanceFieldsRef: React.MutableRefObject<Map<string, { distField: Float32Array; bounds: { x: number; y: number; width: number; height: number } }>>;
  onToggleExcluded: () => void;
  onUpdateBorder: (val: number) => void;
  onExport: () => void;
  isSelected: boolean;
  onSelect: () => void;
}> = ({
  group,
  sourceImage,
  labelMap,
  alphaMask,
  compMap,
  sheetWidth,
  sheetHeight,
  previewBg,
  groupDistanceFieldsRef,
  onToggleExcluded,
  onUpdateBorder,
  onExport,
  isSelected,
  onSelect
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render sticker preview whenever group, border thickness or backing changes
  useEffect(() => {
    if (!canvasRef.current) return;

    // Get or compute distance field
    let cached = groupDistanceFieldsRef.current.get(group.id);
    if (!cached) {
      const built = buildGroupDistanceField(
        group,
        compMap,
        labelMap,
        sheetWidth,
        sheetHeight,
        60
      );
      cached = { distField: built.distField, bounds: built.patchBounds };
      groupDistanceFieldsRef.current.set(group.id, cached);
    }

    const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
      group,
      compMap,
      labelMap,
      alphaMask,
      sourceImage.data,
      sheetWidth,
      sheetHeight,
      cached.distField,
      cached.bounds,
      group.borderThickness,
      4
    );

    const canvas = canvasRef.current;
    canvas.width = croppedWidth;
    canvas.height = croppedHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(croppedRgba, croppedWidth, croppedHeight);
    ctx.putImageData(imgData, 0, 0);
  }, [
    group.borderThickness,
    group.whiteBackingEnabled,
    group.connectBacking,
    group.solidBacking,
    group.componentIds,
    sourceImage,
    labelMap,
    alphaMask,
    compMap,
    sheetWidth,
    sheetHeight,
    group.id,
    groupDistanceFieldsRef
  ]);

  const bgClass =
    previewBg === 'dark'
      ? 'bg-neutral-900'
      : previewBg === 'light'
      ? 'bg-neutral-100'
      : previewBg === 'saturated'
      ? 'bg-sky-400'
      : 'checker-bg';

  return (
    <div
      onClick={onSelect}
      className={`group relative flex flex-col bg-white rounded-xl border transition-all duration-150 overflow-hidden shadow-xs hover:shadow-md cursor-pointer ${
        isSelected
          ? 'border-pink-500 ring-2 ring-pink-500/20 shadow-md'
          : group.excludedFromExport
          ? 'border-neutral-200 opacity-50 bg-neutral-50'
          : 'border-neutral-200 hover:border-neutral-300'
      }`}
    >
      {/* Top Card Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 bg-neutral-50/50">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExcluded();
            }}
            className="text-neutral-500 hover:text-pink-600 transition"
          >
            {group.excludedFromExport ? (
              <Square className="w-4 h-4 text-neutral-400" />
            ) : (
              <CheckSquare className="w-4 h-4 text-pink-600" />
            )}
          </button>
          <span className="text-xs font-bold text-neutral-800 font-mono">
            {group.name}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
          title="Export this PNG"
          className="p-1 rounded-md text-neutral-400 hover:text-pink-600 hover:bg-pink-50 transition"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas Preview Area */}
      <div className={`relative flex items-center justify-center p-4 min-h-[180px] max-h-[220px] overflow-hidden ${bgClass}`}>
        <canvas
          ref={canvasRef}
          className="max-h-[170px] max-w-full object-contain filter drop-shadow-sm transition-transform duration-100 group-hover:scale-102"
        />
      </div>

      {/* Footer controls: Border & specs */}
      <div className="p-2.5 border-t border-neutral-100 flex items-center justify-between bg-white text-[11px] text-neutral-500">
        <div className="flex items-center gap-1.5 font-mono">
          <span>{Math.round(group.bounds.width)}×{Math.round(group.bounds.height)}px</span>
          <span>•</span>
          <span>{group.componentIds.length} pcs</span>
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5"
        >
          <Sliders className="w-3 h-3 text-neutral-400" />
          <input
            type="range"
            min="0"
            max="50"
            value={group.borderThickness}
            onChange={(e) => onUpdateBorder(Number(e.target.value))}
            className="w-16 accent-pink-600 cursor-pointer h-1 bg-neutral-200 rounded-lg"
          />
          <span className="w-6 text-right font-mono font-medium text-neutral-700">
            {group.borderThickness}px
          </span>
        </div>
      </div>
    </div>
  );
};

export const StickerGridView: React.FC<StickerGridViewProps> = ({
  sourceImage,
  labelMap,
  alphaMask,
  components,
  groups,
  sheetWidth,
  sheetHeight,
  previewBg,
  groupDistanceFieldsRef,
  onToggleGroupExcluded,
  onUpdateGroupBorder,
  onExportSingle,
  onSelectGroup,
  selectedGroupIds
}) => {
  if (!sourceImage || !labelMap || !alphaMask) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
        No sticker sheet loaded.
      </div>
    );
  }

  const compMap = new Map(components.map(c => [c.id, c]));

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 bg-neutral-100">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {groups.map((group) => (
          <StickerCard
            key={group.id}
            group={group}
            sourceImage={sourceImage}
            labelMap={labelMap}
            alphaMask={alphaMask}
            compMap={compMap}
            sheetWidth={sheetWidth}
            sheetHeight={sheetHeight}
            previewBg={previewBg}
            groupDistanceFieldsRef={groupDistanceFieldsRef}
            onToggleExcluded={() => onToggleGroupExcluded(group.id)}
            onUpdateBorder={(val) => onUpdateGroupBorder(group.id, val)}
            onExport={() => onExportSingle(group.id)}
            isSelected={selectedGroupIds.includes(group.id)}
            onSelect={() => onSelectGroup(group.id, false)}
          />
        ))}
      </div>
    </div>
  );
};
