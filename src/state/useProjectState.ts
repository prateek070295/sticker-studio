/**
 * Application state management with non-destructive Undo/Redo support.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ArtworkComponent,
  EnclosedHole,
  ExtractionSettings,
  ExtractorProgress,
  StickerGroup,
  ToolMode,
  ViewMode,
  WorkerResponse,
  MaskPatch,
  TouchingSplitRequest,
  BackingOverride,
  GridSheetConfig
} from '../types';
import { buildGroupDistanceField, compositeSticker } from '../core/composer';
import { createZip } from '../core/zip';
import { loadUserPreferences, saveUserPreferences } from './preferences';
import { applyBrushPatchWithOwnership, OwnershipDiff, revertBrushPatchWithOwnership } from '../core/maskPatch';
import { commitTouchingSplit, previewTouchingSplit } from '../core/watershedSplit';
import { loadProjectArchive, saveProjectArchive } from '../core/projectArchive';
import { computeGridCells, partitionGridComponents, DEFAULT_GRID_CONFIG } from '../core/gridExtractor';
import { proposeStickerGroups } from '../core/grouping';

interface HistorySnapshot {
  groups: StickerGroup[];
  holes: EnclosedHole[];
  components: ArtworkComponent[];
  globalBorderThickness: number;
  diff?: OwnershipDiff;
  splitDiff?: {
    bounds: { x: number; y: number; width: number; height: number };
    beforeLabels: Uint16Array;
    afterLabels: Uint16Array;
  };
}

export function useProjectState() {
  const initialPrefs = loadUserPreferences();

  // Source Image layer (immutable)
  const [sourceImage, setSourceImage] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [sheetDimensions, setSheetDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [estimatedBgColor, setEstimatedBgColor] = useState<[number, number, number]>([255, 255, 255]);

  // Extraction layers
  const [labelMap, setLabelMap] = useState<Uint16Array | null>(null);
  const [alphaMask, setAlphaMask] = useState<Uint8Array | null>(null);
  const [components, setComponents] = useState<ArtworkComponent[]>([]);
  const [groups, setGroups] = useState<StickerGroup[]>([]);
  const [holes, setHoles] = useState<EnclosedHole[]>([]);

  // Active group being edited in Advanced Editor Modal
  const [activeEditGroupId, setActiveEditGroupId] = useState<string | null>(null);

  // Cached group distance fields (Map: groupId -> Float32Array)
  const groupDistanceFieldsRef = useRef<Map<string, { distField: Float32Array; bounds: { x: number; y: number; width: number; height: number } }>>(new Map());

  // UI state
  const [viewMode, setViewModeState] = useState<ViewMode>(initialPrefs.preferredViewMode);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [previewBg, setPreviewBgState] = useState<'checker' | 'dark' | 'light' | 'saturated'>(initialPrefs.previewBg);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [globalBorderThickness, setGlobalBorderThickness] = useState<number>(initialPrefs.defaultBorderThickness);

  // Status & Progress
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExtractorProgress | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<ExtractionSettings>({
    bgTolerance: 18,
    edgeSoftness: 1.0,
    minComponentArea: 15,
    groupingProximityThreshold: 35,
    enableTitleDetection: true,
    gridConfig: DEFAULT_GRID_CONFIG
  });

  // Undo / Redo stacks with full structural transactions
  const historyRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      groups: JSON.parse(JSON.stringify(groups)),
      holes: JSON.parse(JSON.stringify(holes)),
      components: JSON.parse(JSON.stringify(components)),
      globalBorderThickness
    });
    // Cap history length at 30
    if (historyRef.current.length > 30) historyRef.current.shift();
    futureRef.current = [];
  }, [groups, holes, components, globalBorderThickness]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    futureRef.current.push({
      groups: JSON.parse(JSON.stringify(groups)),
      holes: JSON.parse(JSON.stringify(holes)),
      components: JSON.parse(JSON.stringify(components)),
      globalBorderThickness,
      diff: prev.diff,
      splitDiff: prev.splitDiff
    });

    if (prev.diff && alphaMask && labelMap) {
      revertBrushPatchWithOwnership(alphaMask, labelMap, sheetDimensions.width, prev.diff);
      for (const gId of prev.diff.affectedGroupIds) {
        groupDistanceFieldsRef.current.delete(gId);
      }
    }

    if (prev.splitDiff && labelMap) {
      const { x, y, width, height } = prev.splitDiff.bounds;
      for (let r = 0; r < height; r++) {
        const srcRow = r * width;
        const dstRow = (y + r) * sheetDimensions.width + x;
        labelMap.set(prev.splitDiff.beforeLabels.subarray(srcRow, srcRow + width), dstRow);
      }
      groupDistanceFieldsRef.current.clear();
    }

    setGroups(prev.groups);
    setHoles(prev.holes);
    setComponents(prev.components);
    setGlobalBorderThickness(prev.globalBorderThickness);
  }, [groups, holes, components, globalBorderThickness, alphaMask, labelMap, sheetDimensions.width]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push({
      groups: JSON.parse(JSON.stringify(groups)),
      holes: JSON.parse(JSON.stringify(holes)),
      components: JSON.parse(JSON.stringify(components)),
      globalBorderThickness,
      diff: next.diff,
      splitDiff: next.splitDiff
    });

    if (next.diff && alphaMask && labelMap) {
      const { x, y, width, height } = next.diff.patch.bounds;
      for (let r = 0; r < height; r++) {
        const srcRow = r * width;
        const dstRow = (y + r) * sheetDimensions.width + x;
        alphaMask.set(next.diff.patch.afterAlpha.subarray(srcRow, srcRow + width), dstRow);
        labelMap.set(next.diff.afterLabels.subarray(srcRow, srcRow + width), dstRow);
      }
      for (const gId of next.diff.affectedGroupIds) {
        groupDistanceFieldsRef.current.delete(gId);
      }
    }

    if (next.splitDiff && labelMap) {
      const { x, y, width, height } = next.splitDiff.bounds;
      for (let r = 0; r < height; r++) {
        const srcRow = r * width;
        const dstRow = (y + r) * sheetDimensions.width + x;
        labelMap.set(next.splitDiff.afterLabels.subarray(srcRow, srcRow + width), dstRow);
      }
      groupDistanceFieldsRef.current.clear();
    }

    setGroups(next.groups);
    setHoles(next.holes);
    setComponents(next.components);
    setGlobalBorderThickness(next.globalBorderThickness);
  }, [groups, holes, components, globalBorderThickness, alphaMask, labelMap, sheetDimensions.width]);

  // Worker instance
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Instantiate Web Worker with Vite ES module syntax
    const worker = new Worker(
      new URL('../workers/extractor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'PROGRESS') {
        setProgress(msg.progress);
      } else if (msg.type === 'EXTRACT_COMPLETE') {
        setEstimatedBgColor(msg.bgColor);
        setComponents(msg.components);
        setLabelMap(msg.labelMap);
        setAlphaMask(msg.alphaMask);
        setGroups(msg.suggestedGroups);
        setHoles(msg.holes);
        setIsProcessing(false);
        setProgress(null);
        historyRef.current = [];
        futureRef.current = [];
        // Clear cached distance fields
        groupDistanceFieldsRef.current.clear();
      } else if (msg.type === 'ERROR') {
        console.error('Extractor Worker Error:', msg.error);
        setIsProcessing(false);
        setProgress(null);
        alert(`Extraction Error: ${msg.error}`);
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Import Image Handler
  const importImage = useCallback((file: File) => {
    setIsProcessing(true);
    setProgress({ stage: 'estimating', percentage: 5, message: 'Decoding image...' });
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        setSheetDimensions({ width, height });

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        setSourceImage(imgData);

        // Send to worker
        if (workerRef.current) {
          workerRef.current.postMessage({
            type: 'EXTRACT_SHEET',
            id: 'job_' + Date.now(),
            imageData: imgData,
            settings
          });
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [settings]);

  const importFromDataUrl = useCallback((dataUrl: string, name: string) => {
    setIsProcessing(true);
    setProgress({ stage: 'estimating', percentage: 5, message: 'Decoding image...' });
    setFileName(name);

    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      setSheetDimensions({ width, height });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      setSourceImage(imgData);

      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'EXTRACT_SHEET',
          id: 'job_' + Date.now(),
          imageData: imgData,
          settings
        });
      }
    };
    img.src = dataUrl;
  }, [settings]);

  // Selection actions
  const selectGroup = useCallback((groupId: string, multi: boolean = false) => {
    setSelectedGroupIds(prev => {
      if (multi) {
        return prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId];
      }
      return [groupId];
    });
  }, []);

  const selectComponent = useCallback((compId: string, multi: boolean = false) => {
    setSelectedComponentIds(prev => {
      if (multi) {
        return prev.includes(compId) ? prev.filter(id => id !== compId) : [...prev, compId];
      }
      return [compId];
    });
  }, []);

  // Grouping modifications
  const mergeSelectedGroups = useCallback(() => {
    if (selectedGroupIds.length < 2) return;
    pushHistory();

    const selectedGroups = groups.filter(g => selectedGroupIds.includes(g.id));
    const remainingGroups = groups.filter(g => !selectedGroupIds.includes(g.id));

    const mergedCompIds = Array.from(new Set(selectedGroups.flatMap(g => g.componentIds)));
    const compMap = new Map(components.map(c => [c.id, c]));
    const boundsList = mergedCompIds.map(id => compMap.get(id)!.bounds);

    let minX = boundsList[0].x, minY = boundsList[0].y;
    let maxX = boundsList[0].x + boundsList[0].width;
    let maxY = boundsList[0].y + boundsList[0].height;
    for (const b of boundsList) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    const newGroup: StickerGroup = {
      ...selectedGroups[0],
      id: `group_${Date.now()}`,
      name: `sticker_${String(remainingGroups.length + 1).padStart(3, '0')}`,
      componentIds: mergedCompIds,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      bridges: []
    };

    setGroups([...remainingGroups, newGroup]);
    setSelectedGroupIds([newGroup.id]);
    groupDistanceFieldsRef.current.delete(newGroup.id);
  }, [selectedGroupIds, groups, components, pushHistory]);

  const splitSelectedGroup = useCallback(() => {
    if (selectedGroupIds.length !== 1) return;
    const targetGroup = groups.find(g => g.id === selectedGroupIds[0]);
    if (!targetGroup || targetGroup.componentIds.length <= 1) return;

    pushHistory();
    const remainingGroups = groups.filter(g => g.id !== targetGroup.id);
    const compMap = new Map(components.map(c => [c.id, c]));

    const newGroups: StickerGroup[] = targetGroup.componentIds.map((cId, idx) => {
      const comp = compMap.get(cId)!;
      return {
        id: `group_${Date.now()}_${idx}`,
        name: `sticker_${String(remainingGroups.length + idx + 1).padStart(3, '0')}`,
        componentIds: [cId],
        bounds: comp.bounds,
        borderThickness: targetGroup.borderThickness,
        customBorder: targetGroup.customBorder,
        whiteBackingEnabled: targetGroup.whiteBackingEnabled,
        connectBacking: targetGroup.connectBacking,
        solidBacking: targetGroup.solidBacking,
        bridges: [],
        excludedFromExport: false
      };
    });

    setGroups([...remainingGroups, ...newGroups]);
    setSelectedGroupIds(newGroups.map(g => g.id));
  }, [selectedGroupIds, groups, components, pushHistory]);

  const groupSelectedComponents = useCallback(() => {
    if (selectedComponentIds.length === 0) return;
    pushHistory();

    // Remove components from their current groups
    const newGroups: StickerGroup[] = [];
    const compMap = new Map(components.map(c => [c.id, c]));

    for (const g of groups) {
      const remainingCompIds = g.componentIds.filter(id => !selectedComponentIds.includes(id));
      if (remainingCompIds.length > 0) {
        const boundsList = remainingCompIds.map(id => compMap.get(id)!.bounds);
        let minX = boundsList[0].x, minY = boundsList[0].y;
        let maxX = boundsList[0].x + boundsList[0].width;
        let maxY = boundsList[0].y + boundsList[0].height;
        for (const b of boundsList) {
          if (b.x < minX) minX = b.x;
          if (b.y < minY) minY = b.y;
          if (b.x + b.width > maxX) maxX = b.x + b.width;
          if (b.y + b.height > maxY) maxY = b.y + b.height;
        }

        newGroups.push({
          ...g,
          componentIds: remainingCompIds,
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        });
      }
    }

    // Form new group from selected components
    const boundsList = selectedComponentIds.map(id => compMap.get(id)!.bounds);
    let minX = boundsList[0].x, minY = boundsList[0].y;
    let maxX = boundsList[0].x + boundsList[0].width;
    let maxY = boundsList[0].y + boundsList[0].height;
    for (const b of boundsList) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    const createdGroup: StickerGroup = {
      id: `group_${Date.now()}`,
      name: `sticker_${String(newGroups.length + 1).padStart(3, '0')}`,
      componentIds: selectedComponentIds,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      borderThickness: globalBorderThickness,
      customBorder: false,
      whiteBackingEnabled: true,
      connectBacking: true,
      solidBacking: false,
      bridges: [],
      excludedFromExport: false
    };

    setGroups([...newGroups, createdGroup]);
    setSelectedGroupIds([createdGroup.id]);
    setSelectedComponentIds([]);
  }, [selectedComponentIds, groups, components, globalBorderThickness, pushHistory]);

  const toggleGroupExcluded = useCallback((groupId: string) => {
    pushHistory();
    setGroups(prev =>
      prev.map(g => (g.id === groupId ? { ...g, excludedFromExport: !g.excludedFromExport } : g))
    );
  }, [pushHistory]);

  const repartitionGrid = useCallback((configUpdate?: Partial<GridSheetConfig>) => {
    setSettings(prev => {
      const currentGrid = prev.gridConfig || DEFAULT_GRID_CONFIG;
      const updatedGrid: GridSheetConfig = {
        ...currentGrid,
        ...(configUpdate || {})
      };
      const updatedSettings: ExtractionSettings = {
        ...prev,
        gridConfig: updatedGrid
      };

      if (components.length > 0 && sheetDimensions.width > 0 && sheetDimensions.height > 0) {
        pushHistory();
        let newGroups: StickerGroup[];
        if (updatedGrid.enabled) {
          const cells = computeGridCells(sheetDimensions.width, sheetDimensions.height, updatedGrid);
          const partition = partitionGridComponents(components, cells, updatedGrid);
          newGroups = partition.groups;
        } else if (labelMap) {
          newGroups = proposeStickerGroups(
            components,
            prev.groupingProximityThreshold,
            prev.enableTitleDetection,
            labelMap,
            sheetDimensions.width,
            sheetDimensions.height
          );
        } else {
          return updatedSettings;
        }

        setGroups(newGroups);
        groupDistanceFieldsRef.current.clear();
      }

      return updatedSettings;
    });
  }, [components, sheetDimensions, labelMap, pushHistory]);

  const updateGroupBorder = useCallback((groupId: string, thickness: number) => {
    setGroups(prev =>
      prev.map(g => (g.id === groupId ? { ...g, borderThickness: thickness, customBorder: true } : g))
    );
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    saveUserPreferences({ preferredViewMode: mode });
  }, []);

  const setPreviewBg = useCallback((bg: 'checker' | 'dark' | 'light' | 'saturated') => {
    setPreviewBgState(bg);
    saveUserPreferences({ previewBg: bg });
  }, []);

  const updateGlobalBorder = useCallback((thickness: number) => {
    setGlobalBorderThickness(thickness);
    saveUserPreferences({ defaultBorderThickness: thickness });
    setGroups(prev =>
      prev.map(g => (g.customBorder ? g : { ...g, borderThickness: thickness }))
    );
  }, []);

  const toggleGroupSetting = useCallback((
    groupId: string,
    key: 'whiteBackingEnabled' | 'connectBacking' | 'solidBacking'
  ) => {
    pushHistory();
    setGroups(prev =>
      prev.map(g => {
        if (g.id === groupId) {
          // If connectBacking or solidBacking changed, invalidate distance field cache
          if (key === 'connectBacking' || key === 'solidBacking') {
            groupDistanceFieldsRef.current.delete(groupId);
          }
          return { ...g, [key]: !g[key] };
        }
        return g;
      })
    );
  }, [pushHistory]);

  // Export a single sticker PNG
  const exportSingleSticker = useCallback(async (groupId: string) => {
    if (!sourceImage || !labelMap || !alphaMask) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const compMap = new Map(components.map(c => [c.id, c]));

    // Get or build distance field
    let cached = groupDistanceFieldsRef.current.get(groupId);
    if (!cached) {
      const built = buildGroupDistanceField(
        group,
        compMap,
        labelMap,
        sheetDimensions.width,
        sheetDimensions.height,
        Math.max(64, Math.ceil(group.borderThickness) + 12)
      );
      cached = { distField: built.distField, bounds: built.patchBounds };
      groupDistanceFieldsRef.current.set(groupId, cached);
    }

    const { croppedRgba, croppedWidth, croppedHeight } = compositeSticker(
      group,
      compMap,
      labelMap,
      alphaMask,
      sourceImage.data,
      sheetDimensions.width,
      sheetDimensions.height,
      cached.distField,
      cached.bounds,
      group.borderThickness,
      4
    );

    const canvas = document.createElement('canvas');
    canvas.width = croppedWidth;
    canvas.height = croppedHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(croppedRgba, croppedWidth, croppedHeight);
    ctx.putImageData(imgData, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      if (window.desktopAPI) {
        const filePath = await window.desktopAPI.saveFileDialog({
          title: `Save ${group.name}.png`,
          defaultPath: `${group.name}.png`,
          filters: [{ name: 'PNG Image', extensions: ['png'] }]
        });
        if (filePath) {
          const buffer = new Uint8Array(await blob.arrayBuffer());
          await window.desktopAPI.writeFile(filePath, buffer);
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${group.name}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }, [sourceImage, labelMap, alphaMask, groups, components, sheetDimensions]);

  // Export all selected stickers as a single ZIP archive
  const exportAllZip = useCallback(async () => {
    if (!sourceImage || !labelMap || !alphaMask) return;
    const activeGroups = groups.filter(g => !g.excludedFromExport);
    if (activeGroups.length === 0) {
      alert('No stickers are selected for export.');
      return;
    }

    setExportProgress('Preparing ZIP export...');
    const compMap = new Map(components.map(c => [c.id, c]));
    const zipEntries: Array<{ name: string; data: Uint8Array }> = [];
    const manifestEntries: Array<Record<string, unknown>> = [];

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    for (let i = 0; i < activeGroups.length; i++) {
      const group = activeGroups[i];
      setExportProgress(`Compositing sticker ${i + 1} of ${activeGroups.length} (${group.name})...`);

      let cached = groupDistanceFieldsRef.current.get(group.id);
      if (!cached) {
        const built = buildGroupDistanceField(
          group,
          compMap,
          labelMap,
          sheetDimensions.width,
          sheetDimensions.height,
          Math.max(64, Math.ceil(group.borderThickness) + 12)
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
        sheetDimensions.width,
        sheetDimensions.height,
        cached.distField,
        cached.bounds,
        group.borderThickness,
        4
      );

      tempCanvas.width = croppedWidth;
      tempCanvas.height = croppedHeight;
      if (tempCtx) {
        tempCtx.putImageData(new ImageData(croppedRgba, croppedWidth, croppedHeight), 0, 0);
        const blob = await new Promise<Blob | null>(res => tempCanvas.toBlob(res, 'image/png'));
        if (blob) {
          const buffer = new Uint8Array(await blob.arrayBuffer());
          zipEntries.push({
            name: `${group.name}.png`,
            data: buffer
          });

          manifestEntries.push({
            id: group.id,
            fileName: `${group.name}.png`,
            width: croppedWidth,
            height: croppedHeight,
            borderThickness: group.borderThickness,
            componentCount: group.componentIds.length
          });
        }
      }
    }

    // Add manifest.json
    const manifestJson = JSON.stringify(
      {
        generator: 'Sticker Studio — Sheet Extractor',
        sheet: fileName,
        sheetDimensions,
        totalStickers: zipEntries.length,
        exportedAt: new Date().toISOString(),
        stickers: manifestEntries
      },
      null,
      2
    );
    zipEntries.push({
      name: 'manifest.json',
      data: new TextEncoder().encode(manifestJson)
    });

    setExportProgress('Packaging ZIP archive...');
    const zipBlob = createZip(zipEntries);
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'stickers';

    if (window.desktopAPI) {
      const filePath = await window.desktopAPI.saveFileDialog({
        title: 'Save Stickers ZIP Archive',
        defaultPath: `${baseName}_stickers.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
      });
      if (filePath) {
        const buffer = new Uint8Array(await zipBlob.arrayBuffer());
        await window.desktopAPI.writeFile(filePath, buffer);
      }
    } else {
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_stickers.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setExportProgress(null);
  }, [sourceImage, labelMap, alphaMask, groups, components, sheetDimensions, fileName]);

  // V1.1 Advanced Actions
  const applyBrushPatch = useCallback((patch: MaskPatch, targetGroupId?: string) => {
    if (!alphaMask || !labelMap) return;
    const diff = applyBrushPatchWithOwnership(
      alphaMask,
      labelMap,
      components,
      groups,
      sheetDimensions.width,
      sheetDimensions.height,
      patch,
      targetGroupId
    );

    historyRef.current.push({
      groups: JSON.parse(JSON.stringify(groups)),
      holes: JSON.parse(JSON.stringify(holes)),
      components: JSON.parse(JSON.stringify(components)),
      globalBorderThickness,
      diff
    });
    if (historyRef.current.length > 30) historyRef.current.shift();
    futureRef.current = [];

    setComponents(diff.updatedComponents);
    setGroups(diff.updatedGroups);

    for (const gId of diff.affectedGroupIds) {
      groupDistanceFieldsRef.current.delete(gId);
    }
  }, [alphaMask, labelMap, components, groups, sheetDimensions, holes, globalBorderThickness]);

  const splitTouchingComponent = useCallback((compId: string, request: TouchingSplitRequest) => {
    if (!sourceImage || !labelMap || !alphaMask) return false;
    const comp = components.find(c => c.id === compId);
    if (!comp) return false;

    const preview = previewTouchingSplit(
      comp,
      sourceImage.data,
      alphaMask,
      labelMap,
      sheetDimensions.width,
      request
    );
    if (!preview) return false;

    const { x, y, width, height } = preview.bounds;
    const size = width * height;
    const beforeLabels = new Uint16Array(size);
    for (let r = 0; r < height; r++) {
      const src = (y + r) * sheetDimensions.width + x;
      const dst = r * width;
      beforeLabels.set(labelMap.subarray(src, src + width), dst);
    }

    const compsClone = [...components];
    const groupsClone = [...groups];

    commitTouchingSplit(
      comp,
      preview,
      labelMap,
      compsClone,
      groupsClone,
      sheetDimensions.width
    );

    const afterLabels = new Uint16Array(size);
    for (let r = 0; r < height; r++) {
      const src = (y + r) * sheetDimensions.width + x;
      const dst = r * width;
      afterLabels.set(labelMap.subarray(src, src + width), dst);
    }

    historyRef.current.push({
      groups: JSON.parse(JSON.stringify(groups)),
      holes: JSON.parse(JSON.stringify(holes)),
      components: JSON.parse(JSON.stringify(components)),
      globalBorderThickness,
      splitDiff: {
        bounds: preview.bounds,
        beforeLabels,
        afterLabels
      }
    });
    if (historyRef.current.length > 30) historyRef.current.shift();
    futureRef.current = [];

    groupDistanceFieldsRef.current.clear();
    setComponents(compsClone);
    setGroups(groupsClone);
    return true;
  }, [sourceImage, labelMap, alphaMask, components, groups, sheetDimensions, holes, globalBorderThickness]);

  const updateBackingOverride = useCallback((groupId: string, override: BackingOverride) => {
    pushHistory();
    groupDistanceFieldsRef.current.delete(groupId);
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        return { ...g, backingOverride: override };
      }
      return g;
    }));
  }, [pushHistory]);

  const confirmRemoveHole = useCallback((holeId: string) => {
    const hole = holes.find(h => h.id === holeId);
    if (!hole || !alphaMask || !labelMap) return;
    pushHistory();

    const { x, y, width, height } = hole.bounds;
    for (let r = 0; r < height; r++) {
      const rowOffset = (y + r) * sheetDimensions.width;
      for (let c = 0; c < width; c++) {
        const idx = rowOffset + (x + c);
        alphaMask[idx] = 0;
        labelMap[idx] = 0;
      }
    }

    setHoles(prev => prev.map(h => h.id === holeId ? { ...h, removedFromArtwork: true } : h));
    const parentGroup = groups.find(g => g.componentIds.includes(hole.componentId));
    if (parentGroup) groupDistanceFieldsRef.current.delete(parentGroup.id);
  }, [holes, alphaMask, labelMap, sheetDimensions, pushHistory, groups]);

  const keepHole = useCallback((holeId: string) => {
    setHoles(prev => prev.map(h => h.id === holeId ? { ...h, removedFromArtwork: false } : h));
  }, []);

  const saveProject = useCallback(async () => {
    if (!sourceImage) return;
    const blob = await saveProjectArchive({
      name: fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Sticker_Project',
      sourceImage,
      alphaMask: alphaMask || undefined,
      labelMap: labelMap || undefined,
      settings,
      components,
      groups,
      holes,
      globalBorderThickness,
      globalSolidBacking: true,
      globalWhiteBacking: true
    });

    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'project';
    if (window.desktopAPI) {
      const filePath = await window.desktopAPI.saveFileDialog({
        title: 'Save Sticker Studio Project',
        defaultPath: `${baseName}.stickerstudio`,
        filters: [{ name: 'Sticker Studio Project', extensions: ['stickerstudio', 'zip'] }]
      });
      if (filePath) {
        const buffer = new Uint8Array(await blob.arrayBuffer());
        await window.desktopAPI.writeFile(filePath, buffer);
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.stickerstudio`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [sourceImage, fileName, alphaMask, labelMap, settings, components, groups, holes, globalBorderThickness]);

  const loadProject = useCallback(async (file: File | Blob) => {
    setIsProcessing(true);
    setProgress({ stage: 'components', percentage: 20, message: 'Validating & unpacking project archive...' });
    try {
      const loaded = await loadProjectArchive(file);
      if (loaded.metadata.projectType === 'photo') {
        setIsProcessing(false);
        setProgress(null);
        return loaded;
      }
      setFileName(loaded.metadata.name);
      setSheetDimensions(loaded.metadata.imageDimensions);
      setSourceImage(loaded.sourceImage);
      setSettings(loaded.metadata.settings);
      setGlobalBorderThickness(loaded.metadata.globalBorderThickness);
      setComponents(loaded.components);
      setGroups(loaded.groups);
      setHoles(loaded.holes);
      setLabelMap(loaded.labelMap);
      setAlphaMask(loaded.alphaMask);
      groupDistanceFieldsRef.current.clear();
      historyRef.current = [];
      futureRef.current = [];
      setIsProcessing(false);
      setProgress(null);
      return loaded;
    } catch (err: unknown) {
      setIsProcessing(false);
      setProgress(null);
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to load project: ${message}`);
      throw err;
    }
  }, []);

  return {
    sourceImage,
    fileName,
    sheetDimensions,
    estimatedBgColor,
    labelMap,
    alphaMask,
    components,
    groups,
    holes,
    activeEditGroupId,
    viewMode,
    toolMode,
    previewBg,
    selectedGroupIds,
    selectedComponentIds,
    globalBorderThickness,
    isProcessing,
    progress,
    exportProgress,
    settings,
    groupDistanceFieldsRef,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,

    // Setters & Actions
    setActiveEditGroupId,
    setViewMode,
    setToolMode,
    setPreviewBg,
    setSettings,
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
    exportAllZip,

    // V1.1 Actions
    applyBrushPatch,
    splitTouchingComponent,
    updateBackingOverride,
    confirmRemoveHole,
    keepHole,
    saveProject,
    loadProject,
    repartitionGrid
  };
}
