import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { PhotoToolMode, PhotoViewMode, PersonRegion, SerializedPersonRegion, BoundingBox } from '../types';
import {
  composePhotoCutout,
  PhotoComposedResult,
  applyPhotoFinishing,
  cleanStrayFragments,
  maskTouchesBottom
} from '../core/photoAdapter';
import { applyBrushStroke } from '../core/maskPatch';
import { saveProjectArchive, LoadedProjectData } from '../core/projectArchive';
import {
  segmentPhotoForeground,
  getMediaPipeSegmenter,
  getMediaPipeDetector,
  detectPeopleInPhoto,
  segmentPersonCrop,
  combinePersonRegions,
  DEFAULT_MIN_PERSON_AREA_RATIO,
  DEFAULT_CROP_MARGIN_RATIO
} from '../core/mediaPipeSegmenter';
import JSZip from 'jszip';

export interface UsePhotoModeReturn {
  sourceImage: ImageData | null;
  fileName: string;
  mask: Uint8Array | null;
  baseAiMask: Uint8Array | null;
  borderThickness: number;
  previewBg: 'checker' | 'dark' | 'light' | 'saturated';
  viewMode: PhotoViewMode;
  toolMode: PhotoToolMode;
  brushSize: number;
  edgeTrim: number;
  bottomFinish: 'flat' | 'rounded' | 'curved';
  bottomCurveRadius: number;
  touchesBottomEdge: boolean;
  isProcessing: boolean;
  progressMessage: string;
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';
  composedResult: PhotoComposedResult | null;
  canUndo: boolean;
  canRedo: boolean;
  personRegions: PersonRegion[];
  selectedRegionId: string | null;
  isReviewMode: boolean;
  stageTimings: Record<string, number>;
  importPhoto: (file: File) => Promise<void>;
  importFromDataUrl: (dataUrl: string, name: string) => Promise<void>;
  detectPeople: () => Promise<void>;
  removeBackground: () => Promise<void>;
  addPersonRegion: (box: BoundingBox) => Promise<void>;
  updatePersonRegion: (id: string, box: BoundingBox) => Promise<void>;
  deletePersonRegion: (id: string) => void;
  togglePersonIncluded: (id: string) => void;
  rerunPersonSegmentation: (id: string) => Promise<void>;
  setSelectedRegionId: (id: string | null) => void;
  setIsReviewMode: (val: boolean) => void;
  applyStroke: (points: Array<{ x: number; y: number }>, mode: 'erase' | 'restore') => void;
  undo: () => void;
  redo: () => void;
  setBorderThickness: (val: number) => void;
  setEdgeTrim: (val: number) => void;
  setBottomFinish: (mode: 'flat' | 'rounded' | 'curved') => void;
  setBottomCurveRadius: (val: number) => void;
  cleanFragments: (minArea?: number) => void;
  setPreviewBg: (bg: 'checker' | 'dark' | 'light' | 'saturated') => void;
  setViewMode: (mode: PhotoViewMode) => void;
  setToolMode: (mode: PhotoToolMode) => void;
  setBrushSize: (size: number) => void;
  exportArtworkOnly: () => Promise<void>;
  exportWhiteBacked: () => Promise<void>;
  exportZip: () => Promise<void>;
  savePhotoProject: () => Promise<void>;
  loadPhotoProject: (loaded: LoadedProjectData) => void;
  resetPhoto: () => void;
}

export interface PhotoHistorySnapshot {
  mask: Uint8Array;
  personRegions: PersonRegion[];
  selectedRegionId: string | null;
  manualDelta: Int8Array | null;
}

export const MAX_HISTORY_DEPTH = 20;
export const MAX_HISTORY_BYTES = 80 * 1024 * 1024; // 80 MB history memory budget

export function getSnapshotByteSize(snapshot: PhotoHistorySnapshot): number {
  let bytes = snapshot.mask.byteLength;
  if (snapshot.manualDelta) {
    bytes += snapshot.manualDelta.byteLength;
  }
  for (const r of snapshot.personRegions) {
    if (r.cropMask) {
      bytes += r.cropMask.byteLength;
    }
  }
  return bytes;
}

export function enforceHistoryBudget(
  stack: PhotoHistorySnapshot[],
  maxDepth: number = MAX_HISTORY_DEPTH,
  maxBytes: number = MAX_HISTORY_BYTES
): void {
  while (stack.length > maxDepth) {
    stack.shift();
  }
  let totalBytes = stack.reduce((sum, s) => sum + getSnapshotByteSize(s), 0);
  while (stack.length > 1 && totalBytes > maxBytes) {
    const evicted = stack.shift();
    if (evicted) {
      totalBytes -= getSnapshotByteSize(evicted);
    }
  }
}

function clonePersonRegions(regions: PersonRegion[]): PersonRegion[] {
  return regions.map(r => ({
    ...r,
    box: { ...r.box },
    cropBounds: r.cropBounds ? { ...r.cropBounds } : undefined,
    cropMask: r.cropMask ? new Uint8Array(r.cropMask) : undefined,
  }));
}

function composeCompositeMask(
  regions: PersonRegion[],
  W: number,
  H: number,
  delta: Int8Array | null
): Uint8Array {
  const base = combinePersonRegions(regions, W, H);
  if (!delta) return base;
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (delta[i] === 1) {
      out[i] = 1;
    } else if (delta[i] === -1) {
      out[i] = 0;
    } else {
      out[i] = base[i];
    }
  }
  return out;
}

export function usePhotoMode(): UsePhotoModeReturn {
  const [sourceImage, setSourceImage] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState<string>('photo.jpg');
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [baseAiMask, setBaseAiMask] = useState<Uint8Array | null>(null);
  const [borderThickness, setBorderThicknessState] = useState<number>(20);
  const [edgeTrim, setEdgeTrimState] = useState<number>(0);
  const [bottomFinish, setBottomFinish] = useState<'flat' | 'rounded' | 'curved'>('flat');
  const [bottomCurveRadius, setBottomCurveRadiusState] = useState<number>(30);
  const [previewBg, setPreviewBg] = useState<'checker' | 'dark' | 'light' | 'saturated'>('checker');
  const [viewMode, setViewMode] = useState<PhotoViewMode>('sticker');
  const [toolMode, setToolMode] = useState<PhotoToolMode>('pan');
  const [brushSize, setBrushSize] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [composedResult, setComposedResult] = useState<PhotoComposedResult | null>(null);

  // Detector-Guided Person Regions State
  const [personRegions, setPersonRegions] = useState<PersonRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [isReviewMode, setIsReviewMode] = useState<boolean>(false);
  const [stageTimings, setStageTimings] = useState<Record<string, number>>({});
  const [manualDelta, setManualDelta] = useState<Int8Array | null>(null);

  // Undo / Redo history with coherent snapshots (mask, personRegions, selection, manualDelta)
  const undoStackRef = useRef<PhotoHistorySnapshot[]>([]);
  const redoStackRef = useRef<PhotoHistorySnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  const pushUndoSnapshot = useCallback(() => {
    if (!mask) return;
    const snapshot: PhotoHistorySnapshot = {
      mask: new Uint8Array(mask),
      personRegions: clonePersonRegions(personRegions),
      selectedRegionId,
      manualDelta: manualDelta ? new Int8Array(manualDelta) : null,
    };
    undoStackRef.current.push(snapshot);
    enforceHistoryBudget(undoStackRef.current, MAX_HISTORY_DEPTH, MAX_HISTORY_BYTES);
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
  }, [mask, personRegions, selectedRegionId, manualDelta]);

  useEffect(() => {
    if (!sourceImage) return;
    // When a photo is imported, warm up models in background for instant detection and offline caching
    setModelStatus('loading');
    Promise.all([getMediaPipeSegmenter(), getMediaPipeDetector()])
      .then(() => setModelStatus('ready'))
      .catch((err) => {
        console.warn('MediaPipe background warmup deferred:', err);
        setModelStatus('idle');
      });
  }, [sourceImage]);

  // Recompose sticker whenever mask, sourceImage, borderThickness, or finishing options change
  useEffect(() => {
    if (!sourceImage || !mask) {
      setComposedResult(null);
      return;
    }

    const W = sourceImage.width;
    const H = sourceImage.height;
    const finishedMask = applyPhotoFinishing(mask, W, H, {
      edgeTrim,
      bottomFinish,
      bottomCurveRadius,
    });
    const res = composePhotoCutout(finishedMask, sourceImage.data, W, H, borderThickness);
    setComposedResult(res);
  }, [sourceImage, mask, borderThickness, edgeTrim, bottomFinish, bottomCurveRadius]);

  // Load photo file
  const importPhoto = useCallback(async (file: File) => {
    setFileName(file.name);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    await importFromDataUrl(dataUrl, file.name);
  }, []);

  // Import from dataUrl
  const importFromDataUrl = useCallback(async (dataUrl: string, name: string) => {
    setFileName(name);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });

    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2d context');

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, W, H);

    setSourceImage(imgData);
    setMask(null);
    setBaseAiMask(null);
    setComposedResult(null);
    setPersonRegions([]);
    setSelectedRegionId(null);
    setIsReviewMode(false);
    setStageTimings({});
    setManualDelta(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
  }, []);

  // Run Detector-Guided People Detection and Regional Crop Segmentation
  const detectPeople = useCallback(async () => {
    if (!sourceImage) return;
    setIsProcessing(true);
    setProgressMessage('Scanning photo for people...');

    const timings: Record<string, number> = {};
    const tTotal0 = performance.now();

    try {
      const tDet0 = performance.now();
      const detected = await detectPeopleInPhoto(sourceImage, DEFAULT_MIN_PERSON_AREA_RATIO, (msg) => {
        setProgressMessage(msg);
      });
      timings.detectionMs = performance.now() - tDet0;

      const W = sourceImage.width;
      const H = sourceImage.height;

      if (detected.length === 0) {
        // Fallback to single-pass whole-frame segmentation if no discrete person boxes found
        setProgressMessage('No discrete person boxes found; running whole-frame segmentation...');
        const tSeg0 = performance.now();
        const singleResult = await segmentPhotoForeground(sourceImage);
        timings.segmentationMs = performance.now() - tSeg0;
        timings.totalMs = performance.now() - tTotal0;

        const newMask = new Uint8Array(singleResult.mask);
        setBaseAiMask(new Uint8Array(newMask));
        if (mask) pushUndoSnapshot();
        setMask(newMask);
        setPersonRegions([]);
        setSelectedRegionId(null);
        setManualDelta(null);
        setIsReviewMode(true);
        setViewMode('sticker');
        setStageTimings(timings);
        setProgressMessage('Whole-frame segmentation complete.');
        return;
      }

      // Perform regional crop segmentation for each detected person
      const tCrops0 = performance.now();
      const processedRegions: PersonRegion[] = [];

      for (let i = 0; i < detected.length; i++) {
        const reg = detected[i];
        setProgressMessage(`Segmenting person ${i + 1} of ${detected.length}...`);
        const { cropMask, cropBounds } = await segmentPersonCrop(sourceImage, reg, DEFAULT_CROP_MARGIN_RATIO);
        processedRegions.push({
          ...reg,
          cropMask,
          cropBounds,
        });
      }
      timings.segmentationMs = performance.now() - tCrops0;

      // Union all regional masks in canonical source coordinates
      const tUnion0 = performance.now();
      const combinedMask = combinePersonRegions(processedRegions, W, H);
      timings.unionMs = performance.now() - tUnion0;
      timings.totalMs = performance.now() - tTotal0;

      if (mask) pushUndoSnapshot();
      setMask(combinedMask);
      setBaseAiMask(new Uint8Array(combinedMask));
      setPersonRegions(processedRegions);
      setSelectedRegionId(processedRegions[0]?.id ?? null);
      setManualDelta(null);
      setIsReviewMode(true);
      setViewMode('sticker');
      setStageTimings(timings);
      redoStackRef.current = [];
      setHistoryVersion(v => v + 1);

      setProgressMessage(`${processedRegions.length} people selected. Review the image and add anyone missing before creating your sticker.`);
    } catch (err: any) {
      console.error('Failed in detectPeople:', err);
      alert(`Person detection error: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImage, mask, pushUndoSnapshot]);

  // General removeBackground: delegates to detectPeople
  const removeBackground = useCallback(async () => {
    await detectPeople();
  }, [detectPeople]);

  // Add Manual Person Region
  const addPersonRegion = useCallback(async (box: BoundingBox) => {
    if (!sourceImage) return;
    if (box.width <= 4 || box.height <= 4) return;

    setIsProcessing(true);
    setProgressMessage('Segmenting manual person region...');

    try {
      const W = sourceImage.width;
      const H = sourceImage.height;

      const manualIndex = personRegions.filter(r => r.isManual).length + 1;
      const newRegion: PersonRegion = {
        id: `manual_${Date.now()}_${box.x}_${box.y}`,
        label: `Manual ${manualIndex}`,
        box,
        score: 1.0,
        isManual: true,
        included: true,
      };

      const { cropMask, cropBounds } = await segmentPersonCrop(sourceImage, newRegion, DEFAULT_CROP_MARGIN_RATIO);
      newRegion.cropMask = cropMask;
      newRegion.cropBounds = cropBounds;

      const updatedRegions = [...personRegions, newRegion];
      const combinedMask = composeCompositeMask(updatedRegions, W, H, manualDelta);

      if (mask) pushUndoSnapshot();
      setMask(combinedMask);
      setPersonRegions(updatedRegions);
      setSelectedRegionId(newRegion.id);
      setIsReviewMode(true);
      redoStackRef.current = [];
      setHistoryVersion(v => v + 1);

      setProgressMessage(`Added ${newRegion.label}. ${updatedRegions.filter(r => r.included).length} people selected.`);
    } catch (err: any) {
      console.error('Failed to add manual person region:', err);
      alert(`Manual region segmentation error: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImage, personRegions, mask, manualDelta, pushUndoSnapshot]);

  // Update Person Region Bounds (Move/Resize) and Re-segment
  const updatePersonRegion = useCallback(async (id: string, newBox: BoundingBox) => {
    if (!sourceImage) return;
    const regionIdx = personRegions.findIndex(r => r.id === id);
    if (regionIdx === -1) return;

    setIsProcessing(true);
    setProgressMessage('Updating and re-segmenting person region...');

    try {
      const W = sourceImage.width;
      const H = sourceImage.height;

      const targetRegion = { ...personRegions[regionIdx], box: newBox };
      const { cropMask, cropBounds } = await segmentPersonCrop(sourceImage, targetRegion, DEFAULT_CROP_MARGIN_RATIO);
      targetRegion.cropMask = cropMask;
      targetRegion.cropBounds = cropBounds;

      const updated = [...personRegions];
      updated[regionIdx] = targetRegion;

      const combinedMask = composeCompositeMask(updated, W, H, manualDelta);

      if (mask) pushUndoSnapshot();
      setMask(combinedMask);
      setPersonRegions(updated);
      setSelectedRegionId(id);
      redoStackRef.current = [];
      setHistoryVersion(v => v + 1);
      setProgressMessage(`Updated ${targetRegion.label}.`);
    } catch (err: any) {
      console.error('Failed to update region:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImage, personRegions, mask, manualDelta, pushUndoSnapshot]);

  // Delete Person Region
  const deletePersonRegion = useCallback((id: string) => {
    if (!sourceImage) return;
    const updated = personRegions.filter(r => r.id !== id);
    const W = sourceImage.width;
    const H = sourceImage.height;
    const combinedMask = composeCompositeMask(updated, W, H, manualDelta);

    if (mask) pushUndoSnapshot();
    setMask(combinedMask);
    setPersonRegions(updated);
    if (selectedRegionId === id) setSelectedRegionId(null);
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
    setProgressMessage(`Removed region. ${updated.filter(r => r.included).length} people selected.`);
  }, [sourceImage, personRegions, mask, selectedRegionId, manualDelta, pushUndoSnapshot]);

  // Toggle Person Included
  const togglePersonIncluded = useCallback((id: string) => {
    if (!sourceImage) return;
    const updated = personRegions.map(r => (r.id === id ? { ...r, included: !r.included } : r));
    const W = sourceImage.width;
    const H = sourceImage.height;
    const combinedMask = composeCompositeMask(updated, W, H, manualDelta);

    if (mask) pushUndoSnapshot();
    setMask(combinedMask);
    setPersonRegions(updated);
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
    const count = updated.filter(r => r.included).length;
    setProgressMessage(`${count} people selected. Review the image and add anyone missing before creating your sticker.`);
  }, [sourceImage, personRegions, mask, manualDelta, pushUndoSnapshot]);

  // Rerun Person Segmentation for selected region
  const rerunPersonSegmentation = useCallback(async (id: string) => {
    const region = personRegions.find(r => r.id === id);
    if (!region) return;
    await updatePersonRegion(id, region.box);
  }, [personRegions, updatePersonRegion]);

  // Apply brush strokes non-destructively
  const applyStroke = useCallback((points: Array<{ x: number; y: number }>, mode: 'erase' | 'restore') => {
    if (!sourceImage || !mask || points.length === 0) return;

    const W = sourceImage.width;
    const H = sourceImage.height;

    const currentAlpha = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      currentAlpha[i] = mask[i] > 0 ? 255 : 0;
    }

    const patch = applyBrushStroke(
      currentAlpha,
      W,
      H,
      points.map(p => ({ x: p.x, y: p.y })),
      {
        radius: brushSize,
        hardness: 0.9,
        opacity: 1.0,
        mode,
      }
    );

    if (patch) {
      if (mask) pushUndoSnapshot();

      const updatedMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        updatedMask[i] = currentAlpha[i] >= 128 ? 1 : 0;
      }

      // Update manualDelta so brush strokes persist across future region edits
      const nextDelta = manualDelta ? new Int8Array(manualDelta) : new Int8Array(W * H);
      const bx = patch.bounds.x;
      const by = patch.bounds.y;
      const bw = patch.bounds.width;
      const bh = patch.bounds.height;
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const gIdx = (by + dy) * W + (bx + dx);
          const oldVal = mask[gIdx] > 0 ? 1 : 0;
          const newVal = updatedMask[gIdx];
          if (newVal !== oldVal) {
            nextDelta[gIdx] = (newVal === 1 ? 1 : -1);
          }
        }
      }

      setManualDelta(nextDelta);
      setMask(updatedMask);
      setHistoryVersion(v => v + 1);
    }
  }, [sourceImage, mask, brushSize, manualDelta, pushUndoSnapshot]);

  // Undo
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0 || !mask) return;
    const prev = undoStackRef.current.pop()!;

    // Push current to redo
    const currentSnapshot: PhotoHistorySnapshot = {
      mask: new Uint8Array(mask),
      personRegions: clonePersonRegions(personRegions),
      selectedRegionId,
      manualDelta: manualDelta ? new Int8Array(manualDelta) : null,
    };
    redoStackRef.current.push(currentSnapshot);
    enforceHistoryBudget(redoStackRef.current, MAX_HISTORY_DEPTH, MAX_HISTORY_BYTES);

    setMask(prev.mask);
    setPersonRegions(prev.personRegions);
    setSelectedRegionId(prev.selectedRegionId);
    setManualDelta(prev.manualDelta);
    setHistoryVersion(v => v + 1);
  }, [mask, personRegions, selectedRegionId, manualDelta]);

  // Redo
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0 || !mask) return;
    const next = redoStackRef.current.pop()!;

    // Push current to undo
    const currentSnapshot: PhotoHistorySnapshot = {
      mask: new Uint8Array(mask),
      personRegions: clonePersonRegions(personRegions),
      selectedRegionId,
      manualDelta: manualDelta ? new Int8Array(manualDelta) : null,
    };
    undoStackRef.current.push(currentSnapshot);
    enforceHistoryBudget(undoStackRef.current, MAX_HISTORY_DEPTH, MAX_HISTORY_BYTES);

    setMask(next.mask);
    setPersonRegions(next.personRegions);
    setSelectedRegionId(next.selectedRegionId);
    setManualDelta(next.manualDelta);
    setHistoryVersion(v => v + 1);
  }, [mask, personRegions, selectedRegionId, manualDelta]);

  const setBorderThickness = useCallback((val: number) => {
    setBorderThicknessState(Math.max(0, Math.min(100, Math.round(val))));
  }, []);

  const setEdgeTrim = useCallback((val: number) => {
    setEdgeTrimState(Math.max(0, Math.min(10, Math.round(val))));
  }, []);

  const setBottomCurveRadius = useCallback((val: number) => {
    setBottomCurveRadiusState(Math.max(5, Math.min(100, Math.round(val))));
  }, []);

  const touchesBottomEdge = useMemo(() => {
    if (!sourceImage || !mask) return false;
    return maskTouchesBottom(mask, sourceImage.width, sourceImage.height, 3);
  }, [sourceImage, mask]);

  const cleanFragments = useCallback((minArea: number = 200) => {
    if (!sourceImage || !mask) return;
    const W = sourceImage.width;
    const H = sourceImage.height;
    const protectedBoxes = personRegions.filter(r => r.included).map(r => r.box);
    const { cleanedMask, removedCount } = cleanStrayFragments(mask, W, H, minArea, protectedBoxes);
    if (removedCount > 0) {
      pushUndoSnapshot();
      setMask(cleanedMask);
      const nextDelta = manualDelta ? new Int8Array(manualDelta) : new Int8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        if (mask[i] > 0 && cleanedMask[i] === 0) {
          nextDelta[i] = -1;
        }
      }
      setManualDelta(nextDelta);
      setHistoryVersion(v => v + 1);
      setProgressMessage(`Cleaned ${removedCount} stray fragment${removedCount > 1 ? 's' : ''}.`);
    } else {
      setProgressMessage('No stray fragments found.');
    }
  }, [sourceImage, mask, personRegions, manualDelta, pushUndoSnapshot]);

  const getBaseName = useCallback(() => {
    return fileName.replace(/\.[^/.]+$/, '');
  }, [fileName]);

  const downloadBlob = useCallback((blob: Blob, downloadFileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Export Artwork-Only PNG
  const exportArtworkOnly = useCallback(async () => {
    if (!composedResult || composedResult.artworkOnlyRgba.length === 0) return;
    const { artworkOnlyRgba, artworkOnlyWidth, artworkOnlyHeight } = composedResult;

    const canvas = document.createElement('canvas');
    canvas.width = artworkOnlyWidth;
    canvas.height = artworkOnlyHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(artworkOnlyRgba, artworkOnlyWidth, artworkOnlyHeight);
    ctx.putImageData(imgData, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${getBaseName()}_artwork_only.png`);
    }, 'image/png');
  }, [composedResult, getBaseName, downloadBlob]);

  // Export White-Backed Sticker PNG
  const exportWhiteBacked = useCallback(async () => {
    if (!composedResult || composedResult.whiteBackedRgba.length === 0) return;
    const { whiteBackedRgba, whiteBackedWidth, whiteBackedHeight } = composedResult;

    const canvas = document.createElement('canvas');
    canvas.width = whiteBackedWidth;
    canvas.height = whiteBackedHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(whiteBackedRgba, whiteBackedWidth, whiteBackedHeight);
    ctx.putImageData(imgData, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${getBaseName()}_white_backed.png`);
    }, 'image/png');
  }, [composedResult, getBaseName, downloadBlob]);

  // Export ZIP package
  const exportZip = useCallback(async () => {
    if (!composedResult || !sourceImage) return;
    const zip = new JSZip();

    // 1. Artwork only PNG
    if (composedResult.artworkOnlyRgba.length > 0) {
      const artCanvas = document.createElement('canvas');
      artCanvas.width = composedResult.artworkOnlyWidth;
      artCanvas.height = composedResult.artworkOnlyHeight;
      const ctx = artCanvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(
          new ImageData(composedResult.artworkOnlyRgba, composedResult.artworkOnlyWidth, composedResult.artworkOnlyHeight),
          0,
          0
        );
        const artBlob = await new Promise<Blob | null>(r => artCanvas.toBlob(r, 'image/png'));
        if (artBlob) zip.file(`${getBaseName()}_artwork_only.png`, artBlob);
      }
    }

    // 2. White-backed sticker PNG
    if (composedResult.whiteBackedRgba.length > 0) {
      const wbCanvas = document.createElement('canvas');
      wbCanvas.width = composedResult.whiteBackedWidth;
      wbCanvas.height = composedResult.whiteBackedHeight;
      const ctx = wbCanvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(
          new ImageData(composedResult.whiteBackedRgba, composedResult.whiteBackedWidth, composedResult.whiteBackedHeight),
          0,
          0
        );
        const wbBlob = await new Promise<Blob | null>(r => wbCanvas.toBlob(r, 'image/png'));
        if (wbBlob) zip.file(`${getBaseName()}_white_backed.png`, wbBlob);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${getBaseName()}_cutout_stickers.zip`);
  }, [composedResult, sourceImage, getBaseName, downloadBlob]);

  // Helper to encode Uint8Array to base64
  const uint8ToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)) as any);
    }
    return btoa(binary);
  };

  // Helper to decode base64 to Uint8Array
  const base64ToUint8 = (base64: string): Uint8Array => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  // Save Photo Project (.stickerstudio)
  const savePhotoProject = useCallback(async () => {
    if (!sourceImage || !mask) return;

    const W = sourceImage.width;
    const H = sourceImage.height;
    const alphaMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      alphaMask[i] = mask[i] > 0 ? 255 : 0;
    }

    // Serialize person regions with their masks
    const serializedRegions: SerializedPersonRegion[] = personRegions.map(r => ({
      id: r.id,
      label: r.label,
      box: r.box,
      score: r.score,
      isManual: r.isManual,
      included: r.included,
      cropBounds: r.cropBounds,
      maskData: r.cropMask ? uint8ToBase64(r.cropMask) : undefined,
    }));

    let manualDeltaBase64: string | undefined = undefined;
    if (manualDelta) {
      manualDeltaBase64 = uint8ToBase64(new Uint8Array(manualDelta.buffer, manualDelta.byteOffset, manualDelta.byteLength));
    }

    const zipBlob = await saveProjectArchive({
      name: getBaseName(),
      sourceImage,
      alphaMask,
      settings: {
        bgTolerance: 15,
        edgeSoftness: 1,
        minComponentArea: 20,
        groupingProximityThreshold: 35,
        enableTitleDetection: false,
      },
      components: [],
      groups: [],
      holes: [],
      globalBorderThickness: borderThickness,
      globalSolidBacking: false,
      globalWhiteBacking: true,
      projectType: 'photo',
        photoSettings: {
        borderThickness,
        previewBg,
        hasRemovedBackground: true,
        viewMode,
        personRegions: serializedRegions,
        selectedRegionId,
        isReviewMode,
        manualDelta: manualDeltaBase64,
        edgeTrim,
        bottomFinish,
        bottomCurveRadius,
      },
    });

    downloadBlob(zipBlob, `${getBaseName()}.stickerstudio`);
  }, [sourceImage, mask, borderThickness, previewBg, viewMode, personRegions, selectedRegionId, isReviewMode, manualDelta, edgeTrim, bottomFinish, bottomCurveRadius, getBaseName, downloadBlob]);

  // Load Photo Project
  const loadPhotoProject = useCallback((loaded: LoadedProjectData) => {
    setSourceImage(loaded.sourceImage);
    setFileName(loaded.metadata.name ? `${loaded.metadata.name}.png` : 'photo.png');

    const W = loaded.sourceImage.width;
    const H = loaded.sourceImage.height;
    const binMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      binMask[i] = loaded.alphaMask[i] >= 128 ? 1 : 0;
    }

    setMask(binMask);
    setBaseAiMask(new Uint8Array(binMask));

    if (loaded.metadata.photoSettings) {
      setBorderThicknessState(loaded.metadata.photoSettings.borderThickness ?? 20);
      setPreviewBg(loaded.metadata.photoSettings.previewBg ?? 'checker');
      if (loaded.metadata.photoSettings.viewMode) {
        setViewMode(loaded.metadata.photoSettings.viewMode);
      }
      setIsReviewMode(loaded.metadata.photoSettings.isReviewMode ?? false);
      setSelectedRegionId(loaded.metadata.photoSettings.selectedRegionId ?? null);
      setEdgeTrimState(loaded.metadata.photoSettings.edgeTrim ?? 0);
      setBottomFinish(loaded.metadata.photoSettings.bottomFinish ?? 'flat');
      setBottomCurveRadiusState(loaded.metadata.photoSettings.bottomCurveRadius ?? 30);

      if (loaded.metadata.photoSettings.manualDelta) {
        const u8 = base64ToUint8(loaded.metadata.photoSettings.manualDelta);
        setManualDelta(new Int8Array(u8.buffer, u8.byteOffset, u8.byteLength));
      } else {
        setManualDelta(null);
      }

      if (loaded.metadata.photoSettings.personRegions && loaded.metadata.photoSettings.personRegions.length > 0) {
        const restoredRegions: PersonRegion[] = loaded.metadata.photoSettings.personRegions.map(sr => ({
          id: sr.id,
          label: sr.label,
          box: sr.box,
          score: sr.score,
          isManual: sr.isManual,
          included: sr.included,
          cropBounds: sr.cropBounds,
          cropMask: sr.maskData ? base64ToUint8(sr.maskData) : undefined,
        }));
        setPersonRegions(restoredRegions);
      } else {
        setPersonRegions([]);
      }
    }

    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
  }, []);

  const resetPhoto = useCallback(() => {
    setSourceImage(null);
    setMask(null);
    setBaseAiMask(null);
    setComposedResult(null);
    setPersonRegions([]);
    setSelectedRegionId(null);
    setIsReviewMode(false);
    setStageTimings({});
    setViewMode('sticker');
    setManualDelta(null);
    setEdgeTrimState(0);
    setBottomFinish('flat');
    setBottomCurveRadiusState(30);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
  }, []);

  return {
    sourceImage,
    fileName,
    mask,
    baseAiMask,
    borderThickness,
    previewBg,
    viewMode,
    toolMode,
    brushSize,
    edgeTrim,
    bottomFinish,
    bottomCurveRadius,
    touchesBottomEdge,
    isProcessing,
    progressMessage,
    modelStatus,
    composedResult,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    personRegions,
    selectedRegionId,
    isReviewMode,
    stageTimings,
    importPhoto,
    importFromDataUrl,
    detectPeople,
    removeBackground,
    addPersonRegion,
    updatePersonRegion,
    deletePersonRegion,
    togglePersonIncluded,
    rerunPersonSegmentation,
    setSelectedRegionId,
    setIsReviewMode,
    applyStroke,
    undo,
    redo,
    setBorderThickness,
    setEdgeTrim,
    setBottomFinish,
    setBottomCurveRadius,
    cleanFragments,
    setPreviewBg,
    setViewMode,
    setToolMode,
    setBrushSize,
    exportArtworkOnly,
    exportWhiteBacked,
    exportZip,
    savePhotoProject,
    loadPhotoProject,
    resetPhoto,
  };
}
