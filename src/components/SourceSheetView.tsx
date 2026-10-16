import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, MousePointer, Lasso, Layers, Split, EyeOff } from 'lucide-react';
import { ArtworkComponent, StickerGroup, ToolMode } from '../types';

interface SourceSheetViewProps {
  sourceImage: ImageData | null;
  components: ArtworkComponent[];
  groups: StickerGroup[];
  selectedGroupIds: string[];
  selectedComponentIds: string[];
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  onSelectGroup: (groupId: string, multi: boolean) => void;
  onSelectComponent: (compId: string, multi: boolean) => void;
  onGroupSelectedComponents: () => void;
  onMergeSelectedGroups: () => void;
  onSplitSelectedGroup: () => void;
  onToggleGroupExcluded: (groupId: string) => void;
  onEditGroup?: (groupId: string) => void;
}

// Visual color palette for distinct sticker groups
const GROUP_COLORS = [
  '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f43f5e', '#84cc16', '#6366f1', '#14b8a6'
];

export const SourceSheetView: React.FC<SourceSheetViewProps> = ({
  sourceImage,
  components,
  groups,
  selectedGroupIds,
  selectedComponentIds,
  toolMode,
  onToolModeChange,
  onSelectGroup,
  onSelectComponent,
  onGroupSelectedComponents,
  onMergeSelectedGroups,
  onSplitSelectedGroup,
  onToggleGroupExcluded,
  onEditGroup
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pan & Zoom state
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Lasso selection points
  const [lassoPoints, setLassoPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isLassoing, setIsLassoing] = useState<boolean>(false);

  // Fit image to view on initial load
  useEffect(() => {
    if (sourceImage && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const scaleX = (clientWidth - 40) / sourceImage.width;
      const scaleY = (clientHeight - 40) / sourceImage.height;
      const initialScale = Math.min(1, Math.min(scaleX, scaleY));
      setScale(initialScale);
      setPan({
        x: (clientWidth - sourceImage.width * initialScale) / 2,
        y: (clientHeight - sourceImage.height * initialScale) / 2
      });
    }
  }, [sourceImage]);

  // Render image to canvas
  useEffect(() => {
    if (!sourceImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(sourceImage, 0, 0);
  }, [sourceImage]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(0.1, Math.min(10, scale * zoomFactor));

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan(prev => ({
        x: mouseX - (mouseX - prev.x) * (newScale / scale),
        y: mouseY - (mouseY - prev.y) * (newScale / scale)
      }));
    }
    setScale(newScale);
  };

  // Pan and Lasso mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click pans
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (toolMode === 'lasso' && e.button === 0) {
      setIsLassoing(true);
      const sheetCoord = screenToSheet(e.clientX, e.clientY);
      setLassoPoints([sheetCoord]);
      return;
    }

    if (e.button === 0 && toolMode === 'select') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    } else if (isLassoing && toolMode === 'lasso') {
      const pt = screenToSheet(e.clientX, e.clientY);
      setLassoPoints(prev => [...prev, pt]);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false);
    if (isLassoing && toolMode === 'lasso') {
      setIsLassoing(false);
      finishLassoSelection();
    }
  };

  // Convert screen coordinates to image coordinates
  const screenToSheet = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / scale;
    const y = (clientY - rect.top - pan.y) / scale;
    return { x, y };
  }, [pan, scale]);

  // Point in polygon test for lasso
  const pointInPolygon = (px: number, py: number, polygon: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const finishLassoSelection = () => {
    if (lassoPoints.length < 3) {
      setLassoPoints([]);
      return;
    }

    const enclosedComps: string[] = [];
    for (const comp of components) {
      if (pointInPolygon(comp.centroid.x, comp.centroid.y, lassoPoints)) {
        enclosedComps.push(comp.id);
      }
    }

    if (enclosedComps.length > 0) {
      enclosedComps.forEach(id => onSelectComponent(id, true));
    }
    setLassoPoints([]);
  };

  const resetView = () => {
    if (sourceImage && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const scaleX = (clientWidth - 40) / sourceImage.width;
      const scaleY = (clientHeight - 40) / sourceImage.height;
      const initialScale = Math.min(1, Math.min(scaleX, scaleY));
      setScale(initialScale);
      setPan({
        x: (clientWidth - sourceImage.width * initialScale) / 2,
        y: (clientHeight - sourceImage.height * initialScale) / 2
      });
    }
  };

  // Map components to their group index for color coding
  const compToGroupIdx = new Map<string, number>();
  groups.forEach((g, gIdx) => {
    g.componentIds.forEach(cId => compToGroupIdx.set(cId, gIdx));
  });

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative flex-1 h-full bg-neutral-900 overflow-hidden cursor-crosshair select-none"
    >
      {/* Floating Canvas Transform Container */}
      <div
        style={{
          width: sourceImage ? `${sourceImage.width}px` : 'auto',
          height: sourceImage ? `${sourceImage.height}px` : 'auto',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0'
        }}
        className="absolute top-0 left-0 transition-transform duration-75 will-change-transform"
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
          className="shadow-2xl rounded-sm"
        />

        {/* SVG Overlay for Group Outlines and Component Boxes */}
        {sourceImage && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            style={{ display: 'block', width: '100%', height: '100%' }}
            width={sourceImage.width}
            height={sourceImage.height}
            viewBox={`0 0 ${sourceImage.width} ${sourceImage.height}`}
          >
            {/* 1. Group hulls and bridges */}
            {groups.map((group, idx) => {
              const isSelected = selectedGroupIds.includes(group.id);
              const isExcluded = group.excludedFromExport;
              const color = GROUP_COLORS[idx % GROUP_COLORS.length];
              const b = group.bounds;

              return (
                <g key={group.id} opacity={isExcluded ? 0.35 : 1}>
                  {/* Bounding outline */}
                  <rect
                    x={b.x - 4}
                    y={b.y - 4}
                    width={b.width + 8}
                    height={b.height + 8}
                    rx="8"
                    fill={isSelected ? `${color}25` : 'transparent'}
                    stroke={isSelected ? '#ffffff' : color}
                    strokeWidth={isSelected ? 3 : 1.5}
                    strokeDasharray={isExcluded ? '4,4' : undefined}
                    className="pointer-events-auto cursor-pointer transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGroup(group.id, e.shiftKey);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEditGroup?.(group.id);
                    }}
                  />

                  {/* Label badge */}
                  <rect
                    x={b.x - 4}
                    y={b.y - 20}
                    width={Math.max(60, group.name.length * 7 + 14)}
                    height={16}
                    rx="3"
                    fill={color}
                  />
                  <text
                    x={b.x}
                    y={b.y - 8}
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {group.name}
                  </text>

                  {/* Connector lines between multi-part components */}
                  {group.componentIds.length > 1 && group.bridges && group.bridges.map((br) => (
                    <line
                      key={br.id}
                      x1={br.x1}
                      y1={br.y1}
                      x2={br.x2}
                      y2={br.y2}
                      stroke={color}
                      strokeWidth={3}
                      strokeDasharray="2,2"
                      opacity={0.8}
                    />
                  ))}
                </g>
              );
            })}

            {/* 2. Component selection boxes */}
            {components.map((comp) => {
              const isSelected = selectedComponentIds.includes(comp.id);
              const b = comp.bounds;
              return (
                <rect
                  key={comp.id}
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  fill="transparent"
                  stroke={isSelected ? '#38bdf8' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={isSelected ? 2 : 1}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectComponent(comp.id, e.shiftKey);
                  }}
                />
              );
            })}

            {/* 3. Live Lasso Drawing Path */}
            {lassoPoints.length > 1 && (
              <polyline
                points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(236, 72, 153, 0.2)"
                stroke="#ec4899"
                strokeWidth={2}
                strokeDasharray="4,4"
              />
            )}
          </svg>
        )}
      </div>

      {/* Floating Toolbar: Tools & Zoom Controls */}
      <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-neutral-800/90 backdrop-blur-md p-1.5 rounded-xl border border-neutral-700 shadow-xl z-20">
        <button
          onClick={() => onToolModeChange('select')}
          title="Pointer / Selection Tool (V)"
          className={`p-2 rounded-lg text-xs font-medium transition ${
            toolMode === 'select' ? 'bg-pink-600 text-white' : 'text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          <MousePointer className="w-4 h-4" />
        </button>

        <button
          onClick={() => onToolModeChange('lasso')}
          title="Lasso Grouping Tool (L)"
          className={`p-2 rounded-lg text-xs font-medium transition ${
            toolMode === 'lasso' ? 'bg-pink-600 text-white' : 'text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          <Lasso className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-neutral-700 mx-1" />

        <button
          onClick={() => setScale(s => Math.min(10, s * 1.25))}
          title="Zoom In"
          className="p-2 rounded-lg text-neutral-300 hover:bg-neutral-700 transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <span className="text-[11px] font-mono font-medium text-neutral-400 min-w-[42px] text-center">
          {Math.round(scale * 100)}%
        </span>

        <button
          onClick={() => setScale(s => Math.max(0.1, s * 0.8))}
          title="Zoom Out"
          className="p-2 rounded-lg text-neutral-300 hover:bg-neutral-700 transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={resetView}
          title="Fit to Screen"
          className="p-2 rounded-lg text-neutral-300 hover:bg-neutral-700 transition"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Action Bar when Groups/Components are Selected */}
      {(selectedGroupIds.length > 0 || selectedComponentIds.length > 0) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-neutral-900/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-neutral-700 shadow-2xl z-20 animate-fade-in">
          {selectedComponentIds.length > 0 && (
            <button
              onClick={onGroupSelectedComponents}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Group Selected ({selectedComponentIds.length})</span>
            </button>
          )}

          {selectedGroupIds.length > 1 && (
            <button
              onClick={onMergeSelectedGroups}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Merge ({selectedGroupIds.length}) Stickers</span>
            </button>
          )}

          {selectedGroupIds.length === 1 && (
            <>
              <button
                onClick={onSplitSelectedGroup}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
              >
                <Split className="w-3.5 h-3.5" />
                <span>Split into Pieces</span>
              </button>

              <button
                onClick={() => onToggleGroupExcluded(selectedGroupIds[0])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Toggle Exclude</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
