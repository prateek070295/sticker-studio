import { useState, useRef, useCallback, useEffect } from 'react';
import { PhotoToolMode, PhotoViewMode } from '../types';
import { composePhotoCutout, PhotoComposedResult } from '../core/photoAdapter';
import { applyBrushStroke } from '../core/maskPatch';
import { saveProjectArchive, LoadedProjectData } from '../core/projectArchive';
import { segmentPhotoForeground, getMediaPipeSegmenter } from '../core/mediaPipeSegmenter';
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
  isProcessing: boolean;
  progressMessage: string;
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';
  composedResult: PhotoComposedResult | null;
  canUndo: boolean;
  canRedo: boolean;
  importPhoto: (file: File) => Promise<void>;
  importFromDataUrl: (dataUrl: string, name: string) => Promise<void>;
  removeBackground: () => Promise<void>;
  applyStroke: (points: Array<{ x: number; y: number }>, mode: 'erase' | 'restore') => void;
  undo: () => void;
  redo: () => void;
  setBorderThickness: (val: number) => void;
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

export function usePhotoMode(): UsePhotoModeReturn {
  const [sourceImage, setSourceImage] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState<string>('photo.jpg');
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [baseAiMask, setBaseAiMask] = useState<Uint8Array | null>(null);
  const [borderThickness, setBorderThicknessState] = useState<number>(20);
  const [previewBg, setPreviewBg] = useState<'checker' | 'dark' | 'light' | 'saturated'>('checker');
  const [viewMode, setViewMode] = useState<PhotoViewMode>('sticker');
  const [toolMode, setToolMode] = useState<PhotoToolMode>('pan');
  const [brushSize, setBrushSize] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [composedResult, setComposedResult] = useState<PhotoComposedResult | null>(null);

  // Undo / Redo history
  const undoStackRef = useRef<Uint8Array[]>([]);
  const redoStackRef = useRef<Uint8Array[]>([]);
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  useEffect(() => {
    // Proactively initialize and cache MediaPipe segmenter for offline usage
    setModelStatus('loading');
    getMediaPipeSegmenter()
      .then(() => setModelStatus('ready'))
      .catch((err) => {
        console.warn('MediaPipe background warmup deferred:', err);
        setModelStatus('idle');
      });
  }, []);

  // Worker reference
  const workerRef = useRef<Worker | null>(null);

  // Initialize or get photo segmenter worker
  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    try {
      const worker = new Worker(
        new URL('../workers/photoSegmenter.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data) return;
        if (data.type === 'STATUS') {
          setModelStatus(data.status);
          if (data.message) setProgressMessage(data.message);
        }
      };

      workerRef.current = worker;
      return worker;
    } catch (err) {
      console.error('Failed to instantiate photo segmenter worker:', err);
      return null;
    }
  }, []);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Recompose sticker whenever mask, sourceImage, or borderThickness changes
  useEffect(() => {
    if (!sourceImage || !mask) {
      setComposedResult(null);
      return;
    }

    // Convert binary mask (0 or 1) to alpha (0 or 255) for composer
    const W = sourceImage.width;
    const H = sourceImage.height;
    const res = composePhotoCutout(mask, sourceImage.data, W, H, borderThickness);
    setComposedResult(res);
  }, [sourceImage, mask, borderThickness]);

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
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);

    // Warm up worker in background
    const worker = getWorker();
    if (worker) {
      worker.postMessage({ type: 'INIT_MODEL' });
    }
  }, [getWorker]);

  // Run AI background removal
  const removeBackground = useCallback(async () => {
    if (!sourceImage) return;
    setIsProcessing(true);
    setProgressMessage('Preparing image for AI background removal...');

    try {
      const result = await segmentPhotoForeground(sourceImage, (msg) => {
        setProgressMessage(msg);
      });

      // Save initial AI mask
      const newMask = new Uint8Array(result.mask);
      setBaseAiMask(new Uint8Array(newMask));

      // Push to undo history
      if (mask) {
        undoStackRef.current.push(new Uint8Array(mask));
      }
      setMask(newMask);
      setViewMode('sticker');
      redoStackRef.current = [];
      setHistoryVersion(v => v + 1);
      setProgressMessage('Background removed successfully.');
    } catch (err: any) {
      console.error('Failed to remove background:', err);
      alert(`Background removal error: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImage, mask]);

  // Apply brush strokes non-destructively
  const applyStroke = useCallback((points: Array<{ x: number; y: number }>, mode: 'erase' | 'restore') => {
    if (!sourceImage || !mask || points.length === 0) return;

    const W = sourceImage.width;
    const H = sourceImage.height;

    // Convert binary mask (0 or 1) to alpha (0 or 255) for applyBrushStroke
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
      // Save current mask to undo stack
      undoStackRef.current.push(new Uint8Array(mask));
      redoStackRef.current = [];

      // Convert updated alpha back to binary mask
      const updatedMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        updatedMask[i] = currentAlpha[i] >= 128 ? 1 : 0;
      }

      setMask(updatedMask);
      setHistoryVersion(v => v + 1);
    }
  }, [sourceImage, mask, brushSize]);

  // Undo / Redo
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0 || !mask) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(new Uint8Array(mask));
    setMask(prev);
    setHistoryVersion(v => v + 1);
  }, [mask]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0 || !mask) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(new Uint8Array(mask));
    setMask(next);
    setHistoryVersion(v => v + 1);
  }, [mask]);

  const setBorderThickness = useCallback((val: number) => {
    setBorderThicknessState(Math.max(0, Math.min(60, Math.round(val))));
  }, []);

  // Helper to trigger browser download
  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getBaseName = () => {
    return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  // Export Artwork-Only PNG (exact source RGB, transparency mask)
  const exportArtworkOnly = useCallback(async () => {
    if (!composedResult || composedResult.artworkOnlyWidth === 0) {
      alert('Please remove background or import a photo first.');
      return;
    }

    const { artworkOnlyRgba, artworkOnlyWidth: w, artworkOnlyHeight: h } = composedResult;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(artworkOnlyRgba, w, h);
    ctx.putImageData(imgData, 0, 0);

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
    if (blob) {
      downloadBlob(blob, `${getBaseName()}_artwork_only.png`);
    }
  }, [composedResult, fileName]);

  // Export White-Backed Sticker PNG
  const exportWhiteBacked = useCallback(async () => {
    if (!composedResult || composedResult.whiteBackedWidth === 0) {
      alert('Please remove background or import a photo first.');
      return;
    }

    const { whiteBackedRgba, whiteBackedWidth: w, whiteBackedHeight: h } = composedResult;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(whiteBackedRgba, w, h);
    ctx.putImageData(imgData, 0, 0);

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
    if (blob) {
      downloadBlob(blob, `${getBaseName()}_sticker.png`);
    }
  }, [composedResult, fileName]);

  // Export Both as ZIP
  const exportZip = useCallback(async () => {
    if (!composedResult || composedResult.artworkOnlyWidth === 0) {
      alert('Please remove background or import a photo first.');
      return;
    }

    const zip = new JSZip();
    const baseName = getBaseName();

    // 1. Artwork only
    const canvasArt = document.createElement('canvas');
    canvasArt.width = composedResult.artworkOnlyWidth;
    canvasArt.height = composedResult.artworkOnlyHeight;
    canvasArt.getContext('2d')?.putImageData(new ImageData(composedResult.artworkOnlyRgba, canvasArt.width, canvasArt.height), 0, 0);
    const artBlob = await new Promise<Blob | null>(r => canvasArt.toBlob(r, 'image/png'));
    if (artBlob) zip.file(`${baseName}_artwork_only.png`, artBlob);

    // 2. White backed
    const canvasWhite = document.createElement('canvas');
    canvasWhite.width = composedResult.whiteBackedWidth;
    canvasWhite.height = composedResult.whiteBackedHeight;
    canvasWhite.getContext('2d')?.putImageData(new ImageData(composedResult.whiteBackedRgba, canvasWhite.width, canvasWhite.height), 0, 0);
    const whiteBlob = await new Promise<Blob | null>(r => canvasWhite.toBlob(r, 'image/png'));
    if (whiteBlob) zip.file(`${baseName}_sticker.png`, whiteBlob);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${baseName}_cutout_stickers.zip`);
  }, [composedResult, fileName]);

  // Save Project as .stickerstudio archive
  const savePhotoProject = useCallback(async () => {
    if (!sourceImage || !mask) {
      alert('No photo or cutout mask to save.');
      return;
    }

    const W = sourceImage.width;
    const H = sourceImage.height;
    const alphaMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      alphaMask[i] = mask[i] > 0 ? 255 : 0;
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
      },
    });

    downloadBlob(zipBlob, `${getBaseName()}.stickerstudio`);
  }, [sourceImage, mask, borderThickness, previewBg, viewMode, fileName]);

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
    setViewMode('sticker');
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
    isProcessing,
    progressMessage,
    modelStatus,
    composedResult,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    importPhoto,
    importFromDataUrl,
    removeBackground,
    applyStroke,
    undo,
    redo,
    setBorderThickness,
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
