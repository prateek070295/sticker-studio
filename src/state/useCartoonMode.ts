import { useState, useCallback, useRef, useEffect } from 'react';
import {
  CartoonTemplateManifest,
  ExtractedHeadResult,
  HeadTransform,
  CartoonProjectData,
  GlobalHeadAlignment,
  IndividualHeadAlignment,
} from '../cartoon/types';
import {
  HI_WAVING_TEMPLATE,
  CARTOON_REACTIONS_PACK,
  ALL_CARTOON_TEMPLATES,
} from '../cartoon/templates';
import { extractPhotographicHead } from '../core/cartoonHeadExtractor';
import {
  computeInitialHeadPlacement,
  computeEffectiveHeadTransform,
  renderCartoonArtwork,
  generateCartoonStickerDieCut,
} from '../core/cartoonCompositor';
import { createZip, ZipEntry } from '../core/zip';
import { MaskPatch, StrokePoint } from '../types';
import { separateFrontAndRearHairCanvases } from '../core/cartoonHeadExtractor';
import { applyBrushStroke } from '../core/maskPatch';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    const sub = bytes.subarray(i, Math.min(len, i + chunk));
    binary += String.fromCharCode.apply(null, sub as any);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function getPackStickerFilename(template: CartoonTemplateManifest, index: number): string {
  const num = String(index + 1).padStart(2, '0');
  const rawName = template.id === 'hi-waving-01' ? 'Hi' : template.name;
  const cleanTitle = rawName
    .replace(/[!?.()']/g, '')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('_');
  return `${num}_${cleanTitle}.png`;
}

export function getCroppedCanvas(
  srcCanvas: HTMLCanvasElement,
  crop: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = Math.max(1, crop.width);
  exportCanvas.height = Math.max(1, crop.height);
  const eCtx = exportCanvas.getContext('2d');
  if (eCtx) {
    eCtx.drawImage(
      srcCanvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
  }
  return exportCanvas;
}

export function canvasToPngUint8Array(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  return base64ToUint8Array(base64);
}

export interface PackStickerPreview {
  artworkCanvas: HTMLCanvasElement;
  stickerCanvas: HTMLCanvasElement;
  tightCrop: { x: number; y: number; width: number; height: number };
}

export interface UseCartoonModeReturn {
  // State
  selfieDataUrl: string | null;
  selfieFileName: string;
  isProcessing: boolean;
  progressMessage: string;
  extractedHead: ExtractedHeadResult | null;
  activeTemplate: CartoonTemplateManifest;
  headTransform: HeadTransform | null;
  borderThickness: number;
  smoothOutlineLevel: number;
  previewBg: 'checker' | 'dark' | 'white' | 'print';
  artworkCanvas: HTMLCanvasElement | null;
  stickerCanvas: HTMLCanvasElement | null;
  tightCrop: { x: number; y: number; width: number; height: number } | null;
  error: string | null;

  // V1.5 Reactions Pack State
  viewMode: 'gallery' | 'detail' | 'global_alignment';
  templates: CartoonTemplateManifest[];
  selectedTemplateIds: string[];
  packPreviews: Record<string, PackStickerPreview>;
  templateTransforms: Record<string, HeadTransform>;
  templateBorderThicknesses: Record<string, number>;
  isExportingZip: boolean;

  // V1.6 Smart Alignment State
  globalHeadAlignment: GlobalHeadAlignment;
  individualHeadAlignments: Record<string, IndividualHeadAlignment>;
  calibratedChin: { x: number; y: number } | null;
  alignmentScope: 'all' | 'individual';
  globalRefTemplateId: string;

  // Mask & Tool Controls
  toolMode: 'move' | 'erase' | 'restore';
  brushSize: number;
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  setViewMode: (mode: 'gallery' | 'detail' | 'global_alignment') => void;
  setAlignmentScope: (scope: 'all' | 'individual') => void;
  setGlobalRefTemplateId: (id: string) => void;
  setGlobalHeadAlignment: (update: Partial<GlobalHeadAlignment>) => void;
  setIndividualHeadAlignment: (templateId: string, update: Partial<IndividualHeadAlignment> | null) => void;
  setCalibratedChin: (chin: { x: number; y: number } | null) => void;
  applyAlignmentDrag: (deltaCanvasX: number, deltaCanvasY: number, referenceTemplateId?: string) => void;
  resetGlobalAlignment: () => void;
  resetIndividualAlignment: (templateId: string) => void;
  resetAllAlignment: () => void;
  selectTemplateForEdit: (templateId: string) => void;
  toggleTemplateSelection: (id: string) => void;
  selectAllTemplates: () => void;
  deselectAllTemplates: () => void;
  setToolMode: (mode: 'move' | 'erase' | 'restore') => void;
  setBrushSize: (size: number) => void;
  undo: () => void;
  redo: () => void;
  applyBrushStrokeToHead: (points: StrokePoint[]) => void;
  loadSelfieFile: (file: File) => Promise<void>;
  loadSelfieUrl: (url: string, name?: string) => Promise<void>;
  updateHeadTransform: (update: {
    centerX?: number;
    centerY?: number;
    scale?: number;
    rotationDegrees?: number;
    hairBehindBody?: boolean;
  }) => void;
  resetPlacement: () => void;
  setBorderThickness: (val: number) => void;
  setGlobalBorderThickness: (val: number) => void;
  setTemplateBorderThickness: (templateId: string, val: number | null) => void;
  setSmoothOutlineLevel: (val: number) => void;
  setPreviewBg: (bg: 'checker' | 'dark' | 'white' | 'print') => void;
  exportArtworkPng: () => void;
  exportStickerPng: () => void;
  exportPackZip: () => Promise<void>;
  saveProjectJson: () => void;
  loadProjectJson: (jsonString: string) => Promise<void>;
}

export function useCartoonMode(): UseCartoonModeReturn {
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [selfieFileName, setSelfieFileName] = useState<string>('selfie.jpg');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [extractedHead, setExtractedHead] = useState<ExtractedHeadResult | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<CartoonTemplateManifest>(HI_WAVING_TEMPLATE);
  const [headTransform, setHeadTransform] = useState<HeadTransform | null>(null);
  const [borderThickness, setBorderThicknessState] = useState<number>(24);
  const [smoothOutlineLevel, setSmoothOutlineLevel] = useState<number>(2);
  const [previewBg, setPreviewBg] = useState<'checker' | 'dark' | 'white' | 'print'>('checker');
  const [artworkCanvas, setArtworkCanvas] = useState<HTMLCanvasElement | null>(null);
  const [stickerCanvas, setStickerCanvas] = useState<HTMLCanvasElement | null>(null);
  const [tightCrop, setTightCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // V1.5 Reactions Pack State
  const [viewMode, setViewMode] = useState<'gallery' | 'detail' | 'global_alignment'>('gallery');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    CARTOON_REACTIONS_PACK.map((t) => t.id)
  );
  const [packPreviews, setPackPreviews] = useState<Record<string, PackStickerPreview>>({});
  const [templateTransforms, setTemplateTransforms] = useState<Record<string, HeadTransform>>({});
  const [templateBorderThicknesses, setTemplateBorderThicknesses] = useState<Record<string, number>>({});
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);

  // V1.6 Smart Alignment State
  const [globalHeadAlignment, setGlobalHeadAlignmentState] = useState<GlobalHeadAlignment>({
    scaleMultiplier: 1.0,
    rotationDelta: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [individualHeadAlignments, setIndividualHeadAlignmentsState] = useState<Record<string, IndividualHeadAlignment>>({});
  const [calibratedChin, setCalibratedChinState] = useState<{ x: number; y: number } | null>(null);
  const [alignmentScope, setAlignmentScope] = useState<'all' | 'individual'>('all');
  const [globalRefTemplateId, setGlobalRefTemplateId] = useState<string>(HI_WAVING_TEMPLATE.id);

  // Debounced preview rendering timer
  const debounceTimerRef = useRef<any>(null);

  // Brush mask editing controls
  const [toolMode, setToolMode] = useState<'move' | 'erase' | 'restore'>('move');
  const [brushSize, setBrushSize] = useState<number>(24);
  const [undoStack, setUndoStack] = useState<MaskPatch[]>([]);
  const [redoStack, setRedoStack] = useState<MaskPatch[]>([]);

  // Cached full selfie image element
  const selfieImgRef = useRef<HTMLImageElement | null>(null);

  // Compute effective transforms across all reaction templates
  const computeAllTransforms = useCallback(
    (
      head: ExtractedHeadResult,
      gAlign: GlobalHeadAlignment,
      iAligns: Record<string, IndividualHeadAlignment>,
      cChin: { x: number; y: number } | null
    ): Record<string, HeadTransform> => {
      const transforms: Record<string, HeadTransform> = {};
      for (const tpl of CARTOON_REACTIONS_PACK) {
        const base = computeInitialHeadPlacement(tpl, head, cChin);
        transforms[tpl.id] = computeEffectiveHeadTransform(
          tpl,
          head,
          base,
          gAlign,
          iAligns[tpl.id],
          cChin
        );
      }
      return transforms;
    },
    []
  );

  // Re-composite active sticker whenever active template, head, transform, or border changes
  const recomposite = useCallback(
    async (
      tpl: CartoonTemplateManifest,
      head: ExtractedHeadResult,
      tf: HeadTransform,
      bThickness: number,
      sLevel: number
    ) => {
      try {
        const artCanvas = await renderCartoonArtwork(tpl, head, tf);
        const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
          artCanvas,
          bThickness,
          sLevel
        );

        setArtworkCanvas(artCanvas);
        setStickerCanvas(stCanvas);
        setTightCrop(crop);

        setPackPreviews((prev) => ({
          ...prev,
          [tpl.id]: {
            artworkCanvas: artCanvas,
            stickerCanvas: stCanvas,
            tightCrop: crop,
          },
        }));
      } catch (err) {
        console.error('[useCartoonMode] Recomposition error:', err);
      }
    },
    []
  );

  // Re-render all 12 templates in reactions pack
  const renderAllPackPreviews = useCallback(
    async (
      head: ExtractedHeadResult,
      transforms: Record<string, HeadTransform>,
      customBorders: Record<string, number>,
      globalBorder: number,
      sLevel: number
    ) => {
      const newPreviews: Record<string, PackStickerPreview> = {};
      for (let i = 0; i < CARTOON_REACTIONS_PACK.length; i++) {
        const tpl = CARTOON_REACTIONS_PACK[i];
        const tf = transforms[tpl.id] || computeInitialHeadPlacement(tpl, head);
        const bThick = customBorders[tpl.id] ?? globalBorder;
        const art = await renderCartoonArtwork(tpl, head, tf);
        const dieCut = generateCartoonStickerDieCut(art, bThick, sLevel);
        newPreviews[tpl.id] = {
          artworkCanvas: art,
          stickerCanvas: dieCut.stickerCanvas,
          tightCrop: dieCut.tightCrop,
        };
      }
      setPackPreviews(newPreviews);
      return newPreviews;
    },
    []
  );

  // Schedule pack preview rendering with immediate active template update and debounced rest
  const triggerPackPreviewsUpdate = useCallback(
    (
      head: ExtractedHeadResult,
      transforms: Record<string, HeadTransform>,
      customBorders: Record<string, number>,
      gBorder: number,
      sLevel: number,
      immediateTemplateId?: string
    ) => {
      if (immediateTemplateId) {
        const tpl =
          ALL_CARTOON_TEMPLATES[immediateTemplateId] ||
          CARTOON_REACTIONS_PACK.find((t) => t.id === immediateTemplateId);
        const tf = transforms[immediateTemplateId];
        if (tpl && tf) {
          const bThick = customBorders[immediateTemplateId] ?? gBorder;
          renderCartoonArtwork(tpl, head, tf)
            .then((art) => {
              const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
                art,
                bThick,
                sLevel
              );
              setPackPreviews((prev) => ({
                ...prev,
                [immediateTemplateId]: {
                  artworkCanvas: art,
                  stickerCanvas: stCanvas,
                  tightCrop: crop,
                },
              }));
              if (activeTemplate.id === immediateTemplateId) {
                setArtworkCanvas(art);
                setStickerCanvas(stCanvas);
                setTightCrop(crop);
                setHeadTransform(tf);
              }
            })
            .catch(console.error);
        }
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        renderAllPackPreviews(head, transforms, customBorders, gBorder, sLevel);
      }, 70);
    },
    [activeTemplate.id, renderAllPackPreviews]
  );

  // Pipeline from loaded selfie image
  const processImage = useCallback(
    async (img: HTMLImageElement, fileName: string) => {
      setIsProcessing(true);
      setError(null);
      setProgressMessage('Locating face and facial landmarks...');

      try {
        // Step 1: Extract Head & Alpha Matte once
        setProgressMessage('Segmenting hair, face, and collar anchors...');
        const head = await extractPhotographicHead(img, {
          smoothness: 2,
          feather: 0.5,
          neckExtensionRatio: 0.35,
        });

        setExtractedHead(head);

        // Reset alignment state for new selfie
        const defaultGlobal: GlobalHeadAlignment = {
          scaleMultiplier: 1.0,
          rotationDelta: 0,
          offsetX: 0,
          offsetY: 0,
        };
        setGlobalHeadAlignmentState(defaultGlobal);
        setIndividualHeadAlignmentsState({});
        setCalibratedChinState(null);
        setAlignmentScope('all');
        setGlobalRefTemplateId(HI_WAVING_TEMPLATE.id);

        // Step 2: Compute initial auto placement for all 12 templates
        setProgressMessage('Calculating natural head alignment across 12 reaction templates...');
        const initialTransforms = computeAllTransforms(head, defaultGlobal, {}, null);
        setTemplateTransforms(initialTransforms);

        const currentActiveTransform =
          initialTransforms[activeTemplate.id] || initialTransforms[HI_WAVING_TEMPLATE.id];
        setHeadTransform(currentActiveTransform);

        // Step 3: Composite entire 12-sticker collection
        setProgressMessage('Rendering 12 personalized cartoon reaction stickers...');
        const previews = await renderAllPackPreviews(
          head,
          initialTransforms,
          {},
          borderThickness,
          smoothOutlineLevel
        );

        const activePreview = previews[activeTemplate.id] || previews[HI_WAVING_TEMPLATE.id];
        if (activePreview) {
          setArtworkCanvas(activePreview.artworkCanvas);
          setStickerCanvas(activePreview.stickerCanvas);
          setTightCrop(activePreview.tightCrop);
        }

        setSelectedTemplateIds(CARTOON_REACTIONS_PACK.map((t) => t.id));
        setViewMode('gallery');
        setProgressMessage('');
      } catch (err: any) {
        console.error('[useCartoonMode] Processing failed:', err);
        setError(err.message || 'Failed to process selfie');
      } finally {
        setIsProcessing(false);
      }
    },
    [activeTemplate, borderThickness, smoothOutlineLevel, computeAllTransforms, renderAllPackPreviews]
  );

  const loadSelfieFile = useCallback(
    async (file: File) => {
      setSelfieFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setSelfieDataUrl(dataUrl);

        const img = new Image();
        img.onload = () => {
          selfieImgRef.current = img;
          processImage(img, file.name);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [processImage]
  );

  const loadSelfieUrl = useCallback(
    async (url: string, name: string = 'sample.jpg') => {
      setSelfieFileName(name);
      setSelfieDataUrl(url);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        selfieImgRef.current = img;
        processImage(img, name);
      };
      img.src = url;
    },
    [processImage]
  );

  // Switch to detail view for a specific template
  const selectTemplateForEdit = useCallback(
    (templateId: string) => {
      const tpl = ALL_CARTOON_TEMPLATES[templateId] || HI_WAVING_TEMPLATE;
      setActiveTemplate(tpl);

      let tf = templateTransforms[templateId];
      if (!tf && extractedHead) {
        tf = computeEffectiveHeadTransform(
          tpl,
          extractedHead,
          computeInitialHeadPlacement(tpl, extractedHead, calibratedChin),
          globalHeadAlignment,
          individualHeadAlignments[templateId],
          calibratedChin
        );
        setTemplateTransforms((prev) => ({ ...prev, [templateId]: tf }));
      }
      if (tf) {
        setHeadTransform(tf);
      }

      const prev = packPreviews[templateId];
      const customBorder = templateBorderThicknesses[templateId] ?? borderThickness;
      if (prev) {
        setArtworkCanvas(prev.artworkCanvas);
        setStickerCanvas(prev.stickerCanvas);
        setTightCrop(prev.tightCrop);
      } else if (extractedHead && tf) {
        recomposite(tpl, extractedHead, tf, customBorder, smoothOutlineLevel);
      }

      setViewMode('detail');
    },
    [
      templateTransforms,
      extractedHead,
      calibratedChin,
      globalHeadAlignment,
      individualHeadAlignments,
      packPreviews,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel,
      recomposite,
    ]
  );

  const toggleTemplateSelection = useCallback((id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const selectAllTemplates = useCallback(() => {
    setSelectedTemplateIds(CARTOON_REACTIONS_PACK.map((t) => t.id));
  }, []);

  const deselectAllTemplates = useCallback(() => {
    setSelectedTemplateIds([]);
  }, []);

  // V1.6 Alignment Actions
  const setGlobalHeadAlignment = useCallback(
    (update: Partial<GlobalHeadAlignment>) => {
      if (!extractedHead) return;
      const next: GlobalHeadAlignment = {
        scaleMultiplier:
          update.scaleMultiplier !== undefined
            ? Math.max(0.75, Math.min(1.35, parseFloat(update.scaleMultiplier.toFixed(3))))
            : globalHeadAlignment.scaleMultiplier,
        rotationDelta:
          update.rotationDelta !== undefined
            ? Math.max(-15, Math.min(15, parseFloat(update.rotationDelta.toFixed(1))))
            : globalHeadAlignment.rotationDelta,
        offsetX:
          update.offsetX !== undefined
            ? Math.max(-0.5, Math.min(0.5, parseFloat(update.offsetX.toFixed(4))))
            : globalHeadAlignment.offsetX,
        offsetY:
          update.offsetY !== undefined
            ? Math.max(-0.5, Math.min(0.5, parseFloat(update.offsetY.toFixed(4))))
            : globalHeadAlignment.offsetY,
      };
      setGlobalHeadAlignmentState(next);

      const nextTransforms = computeAllTransforms(
        extractedHead,
        next,
        individualHeadAlignments,
        calibratedChin
      );
      setTemplateTransforms(nextTransforms);

      const refId = viewMode === 'global_alignment' ? globalRefTemplateId : activeTemplate.id;
      if (nextTransforms[activeTemplate.id]) {
        setHeadTransform(nextTransforms[activeTemplate.id]);
      }
      triggerPackPreviewsUpdate(
        extractedHead,
        nextTransforms,
        templateBorderThicknesses,
        borderThickness,
        smoothOutlineLevel,
        refId
      );
    },
    [
      extractedHead,
      globalHeadAlignment,
      individualHeadAlignments,
      calibratedChin,
      viewMode,
      globalRefTemplateId,
      activeTemplate.id,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel,
      computeAllTransforms,
      triggerPackPreviewsUpdate,
    ]
  );

  const setIndividualHeadAlignment = useCallback(
    (templateId: string, update: Partial<IndividualHeadAlignment> | null) => {
      if (!extractedHead) return;
      const nextAlignments = { ...individualHeadAlignments };
      if (update === null) {
        delete nextAlignments[templateId];
      } else {
        const current = nextAlignments[templateId] || {};
        nextAlignments[templateId] = {
          scaleMultiplier:
            update.scaleMultiplier !== undefined
              ? Math.max(0.75, Math.min(1.35, parseFloat(update.scaleMultiplier.toFixed(3))))
              : (current.scaleMultiplier ?? 1.0),
          rotationDelta:
            update.rotationDelta !== undefined
              ? Math.max(-15, Math.min(15, parseFloat(update.rotationDelta.toFixed(1))))
              : (current.rotationDelta ?? 0),
          offsetX:
            update.offsetX !== undefined
              ? Math.max(-0.5, Math.min(0.5, parseFloat(update.offsetX.toFixed(4))))
              : (current.offsetX ?? 0),
          offsetY:
            update.offsetY !== undefined
              ? Math.max(-0.5, Math.min(0.5, parseFloat(update.offsetY.toFixed(4))))
              : (current.offsetY ?? 0),
        };
      }
      setIndividualHeadAlignmentsState(nextAlignments);

      const nextTransforms = computeAllTransforms(
        extractedHead,
        globalHeadAlignment,
        nextAlignments,
        calibratedChin
      );
      setTemplateTransforms(nextTransforms);

      if (activeTemplate.id === templateId && nextTransforms[templateId]) {
        setHeadTransform(nextTransforms[templateId]);
      }
      triggerPackPreviewsUpdate(
        extractedHead,
        nextTransforms,
        templateBorderThicknesses,
        borderThickness,
        smoothOutlineLevel,
        templateId
      );
    },
    [
      extractedHead,
      individualHeadAlignments,
      globalHeadAlignment,
      calibratedChin,
      activeTemplate.id,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel,
      computeAllTransforms,
      triggerPackPreviewsUpdate,
    ]
  );

  const setCalibratedChin = useCallback(
    (chin: { x: number; y: number } | null) => {
      if (!extractedHead) return;
      setCalibratedChinState(chin);

      const nextTransforms = computeAllTransforms(
        extractedHead,
        globalHeadAlignment,
        individualHeadAlignments,
        chin
      );
      setTemplateTransforms(nextTransforms);

      const refId = viewMode === 'global_alignment' ? globalRefTemplateId : activeTemplate.id;
      if (nextTransforms[activeTemplate.id]) {
        setHeadTransform(nextTransforms[activeTemplate.id]);
      }
      triggerPackPreviewsUpdate(
        extractedHead,
        nextTransforms,
        templateBorderThicknesses,
        borderThickness,
        smoothOutlineLevel,
        refId
      );
    },
    [
      extractedHead,
      globalHeadAlignment,
      individualHeadAlignments,
      viewMode,
      globalRefTemplateId,
      activeTemplate.id,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel,
      computeAllTransforms,
      triggerPackPreviewsUpdate,
    ]
  );

  const applyAlignmentDrag = useCallback(
    (deltaCanvasX: number, deltaCanvasY: number, referenceTemplateId?: string) => {
      if (!extractedHead) return;
      const refId =
        referenceTemplateId || (viewMode === 'global_alignment' ? globalRefTemplateId : activeTemplate.id);
      const refTpl =
        ALL_CARTOON_TEMPLATES[refId] ||
        CARTOON_REACTIONS_PACK.find((t) => t.id === refId) ||
        HI_WAVING_TEMPLATE;
      const canvasH = refTpl.canvas.height;
      const faceH = (refTpl.headSlot.targetFaceH ?? 0.254) * canvasH;

      const deltaNormX = deltaCanvasX / faceH;
      const deltaNormY = deltaCanvasY / faceH;

      if (alignmentScope === 'all') {
        setGlobalHeadAlignment({
          offsetX: globalHeadAlignment.offsetX + deltaNormX,
          offsetY: globalHeadAlignment.offsetY + deltaNormY,
        });
      } else {
        const cur = individualHeadAlignments[refId] || {
          scaleMultiplier: 1.0,
          rotationDelta: 0,
          offsetX: 0,
          offsetY: 0,
        };
        setIndividualHeadAlignment(refId, {
          offsetX: (cur.offsetX ?? 0) + deltaNormX,
          offsetY: (cur.offsetY ?? 0) + deltaNormY,
        });
      }
    },
    [
      extractedHead,
      viewMode,
      globalRefTemplateId,
      activeTemplate.id,
      alignmentScope,
      globalHeadAlignment,
      individualHeadAlignments,
      setGlobalHeadAlignment,
      setIndividualHeadAlignment,
    ]
  );

  const resetGlobalAlignment = useCallback(() => {
    setGlobalHeadAlignment({ scaleMultiplier: 1.0, rotationDelta: 0, offsetX: 0, offsetY: 0 });
  }, [setGlobalHeadAlignment]);

  const resetIndividualAlignment = useCallback(
    (templateId: string) => {
      setIndividualHeadAlignment(templateId, null);
    },
    [setIndividualHeadAlignment]
  );

  const resetAllAlignment = useCallback(() => {
    if (!extractedHead) return;
    const neutralGlobal = { scaleMultiplier: 1.0, rotationDelta: 0, offsetX: 0, offsetY: 0 };
    setGlobalHeadAlignmentState(neutralGlobal);
    setIndividualHeadAlignmentsState({});
    setCalibratedChinState(null);

    const baselineTransforms = computeAllTransforms(extractedHead, neutralGlobal, {}, null);
    setTemplateTransforms(baselineTransforms);
    if (baselineTransforms[activeTemplate.id]) {
      setHeadTransform(baselineTransforms[activeTemplate.id]);
    }
    const refId = viewMode === 'global_alignment' ? globalRefTemplateId : activeTemplate.id;
    triggerPackPreviewsUpdate(
      extractedHead,
      baselineTransforms,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel,
      refId
    );
  }, [
    extractedHead,
    computeAllTransforms,
    activeTemplate.id,
    viewMode,
    globalRefTemplateId,
    triggerPackPreviewsUpdate,
    templateBorderThicknesses,
    borderThickness,
    smoothOutlineLevel,
  ]);

  const updateHeadTransform = useCallback(
    (update: {
      centerX?: number;
      centerY?: number;
      scale?: number;
      rotationDegrees?: number;
      hairBehindBody?: boolean;
    }) => {
      if (!headTransform || !extractedHead) return;

      const basePlacement = computeInitialHeadPlacement(activeTemplate, extractedHead, calibratedChin);
      const faceH = (activeTemplate.headSlot.targetFaceH ?? 0.254) * activeTemplate.canvas.height;
      const curInd = individualHeadAlignments[activeTemplate.id] || {};

      let newScaleMultiplier = curInd.scaleMultiplier;
      if (update.scale !== undefined) {
        const baseScale = basePlacement.scale * globalHeadAlignment.scaleMultiplier;
        newScaleMultiplier = baseScale > 0 ? parseFloat((update.scale / baseScale).toFixed(4)) : 1.0;
      }

      let newRotationDelta = curInd.rotationDelta;
      if (update.rotationDegrees !== undefined) {
        const baseRot = basePlacement.rotationDegrees + globalHeadAlignment.rotationDelta;
        newRotationDelta = parseFloat((update.rotationDegrees - baseRot).toFixed(2));
      }

      let newOffsetX = curInd.offsetX;
      let newOffsetY = curInd.offsetY;
      if (update.centerX !== undefined && update.centerY !== undefined) {
        const deltaX = update.centerX - headTransform.centerX;
        const deltaY = update.centerY - headTransform.centerY;
        newOffsetX = (curInd.offsetX ?? 0) + deltaX / faceH;
        newOffsetY = (curInd.offsetY ?? 0) + deltaY / faceH;
      }

      setIndividualHeadAlignment(activeTemplate.id, {
        scaleMultiplier: newScaleMultiplier,
        rotationDelta: newRotationDelta,
        offsetX: newOffsetX,
        offsetY: newOffsetY,
      });
    },
    [
      headTransform,
      extractedHead,
      activeTemplate,
      calibratedChin,
      individualHeadAlignments,
      globalHeadAlignment,
      setIndividualHeadAlignment,
    ]
  );

  const resetPlacement = useCallback(() => {
    resetIndividualAlignment(activeTemplate.id);
  }, [resetIndividualAlignment, activeTemplate.id]);

  // Set individual border thickness for a specific template (or null to revert to global)
  const setTemplateBorderThickness = useCallback(
    (templateId: string, val: number | null) => {
      const updatedBorders = { ...templateBorderThicknesses };
      if (val === null) {
        delete updatedBorders[templateId];
      } else {
        updatedBorders[templateId] = val;
      }
      setTemplateBorderThicknesses(updatedBorders);

      const effectiveVal = val ?? borderThickness;
      if (templateId === activeTemplate.id && artworkCanvas) {
        const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
          artworkCanvas,
          effectiveVal,
          smoothOutlineLevel
        );
        setStickerCanvas(stCanvas);
        setTightCrop(crop);

        setPackPreviews((prev) => ({
          ...prev,
          [templateId]: {
            artworkCanvas,
            stickerCanvas: stCanvas,
            tightCrop: crop,
          },
        }));
      } else if (packPreviews[templateId]) {
        const prev = packPreviews[templateId];
        const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
          prev.artworkCanvas,
          effectiveVal,
          smoothOutlineLevel
        );
        setPackPreviews((prevMap) => ({
          ...prevMap,
          [templateId]: {
            artworkCanvas: prev.artworkCanvas,
            stickerCanvas: stCanvas,
            tightCrop: crop,
          },
        }));
      }
    },
    [templateBorderThicknesses, borderThickness, activeTemplate.id, artworkCanvas, smoothOutlineLevel, packPreviews]
  );

  // Set global border thickness across the whole pack (preserves individual overrides)
  const setGlobalBorderThickness = useCallback(
    (val: number) => {
      setBorderThicknessState(val);

      setPackPreviews((prevMap) => {
        const nextMap: Record<string, PackStickerPreview> = { ...prevMap };
        for (const tpl of CARTOON_REACTIONS_PACK) {
          if (templateBorderThicknesses[tpl.id] !== undefined) {
            // Keep individual override intact!
            continue;
          }
          const prev = prevMap[tpl.id];
          if (prev) {
            const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
              prev.artworkCanvas,
              val,
              smoothOutlineLevel
            );
            nextMap[tpl.id] = {
              artworkCanvas: prev.artworkCanvas,
              stickerCanvas: stCanvas,
              tightCrop: crop,
            };
          }
        }
        return nextMap;
      });

      if (templateBorderThicknesses[activeTemplate.id] === undefined && artworkCanvas) {
        const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
          artworkCanvas,
          val,
          smoothOutlineLevel
        );
        setStickerCanvas(stCanvas);
        setTightCrop(crop);
      }
    },
    [templateBorderThicknesses, activeTemplate.id, artworkCanvas, smoothOutlineLevel]
  );

  // Unified setter: detail mode sets individual template border, gallery mode sets global pack border
  const setBorderThickness = useCallback(
    (val: number) => {
      if (viewMode === 'detail') {
        setTemplateBorderThickness(activeTemplate.id, val);
      } else {
        setGlobalBorderThickness(val);
      }
    },
    [viewMode, activeTemplate.id, setTemplateBorderThickness, setGlobalBorderThickness]
  );

  const exportArtworkPng = useCallback(() => {
    if (!artworkCanvas || !tightCrop) return;
    const exportCanvas = getCroppedCanvas(artworkCanvas, tightCrop);
    const a = document.createElement('a');
    a.download = `cartoon_${activeTemplate.id}_artwork_${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
  }, [artworkCanvas, tightCrop, activeTemplate.id]);

  const exportStickerPng = useCallback(() => {
    if (!stickerCanvas || !tightCrop) return;
    const exportCanvas = getCroppedCanvas(stickerCanvas, tightCrop);
    const a = document.createElement('a');
    a.download = `cartoon_${activeTemplate.id}_sticker_${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
  }, [stickerCanvas, tightCrop, activeTemplate.id]);

  // Export full selected sticker pack as ZIP
  const exportPackZip = useCallback(async () => {
    if (!extractedHead) return;
    setIsExportingZip(true);

    try {
      const selectedTemplates = CARTOON_REACTIONS_PACK.filter((tpl) =>
        selectedTemplateIds.includes(tpl.id)
      );

      if (selectedTemplates.length === 0) {
        throw new Error('Please select at least one sticker template to export.');
      }

      const zipEntries: ZipEntry[] = [];
      const manifestStickers: any[] = [];

      for (let i = 0; i < selectedTemplates.length; i++) {
        const tpl = selectedTemplates[i];
        let preview = packPreviews[tpl.id];

        if (!preview) {
          const tf = templateTransforms[tpl.id] || computeInitialHeadPlacement(tpl, extractedHead);
          const bThick = templateBorderThicknesses[tpl.id] ?? borderThickness;
          const art = await renderCartoonArtwork(tpl, extractedHead, tf);
          const dieCut = generateCartoonStickerDieCut(art, bThick, smoothOutlineLevel);
          preview = {
            artworkCanvas: art,
            stickerCanvas: dieCut.stickerCanvas,
            tightCrop: dieCut.tightCrop,
          };
        }

        const filename = getPackStickerFilename(tpl, i);

        // 1. artwork_only/ (transparent PNG tightly cropped)
        const artCropped = getCroppedCanvas(preview.artworkCanvas, preview.tightCrop);
        const artBytes = canvasToPngUint8Array(artCropped);
        zipEntries.push({
          name: `artwork_only/${filename}`,
          data: artBytes,
        });

        // 2. white_backed/ (die-cut white backed PNG tightly cropped)
        const stickerCropped = getCroppedCanvas(preview.stickerCanvas, preview.tightCrop);
        const stickerBytes = canvasToPngUint8Array(stickerCropped);
        zipEntries.push({
          name: `white_backed/${filename}`,
          data: stickerBytes,
        });

        manifestStickers.push({
          index: i + 1,
          id: tpl.id,
          name: tpl.name,
          description: tpl.description,
          artworkFile: `artwork_only/${filename}`,
          stickerFile: `white_backed/${filename}`,
          cropBounds: preview.tightCrop,
          canvasWidth: preview.tightCrop.width,
          canvasHeight: preview.tightCrop.height,
        });
      }

      // 3. manifest.json
      const manifest = {
        packName: 'Sticker Studio Personalized Reactions Pack',
        version: '1.5.0',
        dateGenerated: new Date().toISOString(),
        sourceSelfie: selfieFileName,
        totalStickers: selectedTemplates.length,
        stickers: manifestStickers,
      };

      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
      zipEntries.push({
        name: 'manifest.json',
        data: manifestBytes,
      });

      const zipBlob = createZip(zipEntries);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.download = `sticker_pack_${Date.now()}.zip`;
      a.href = downloadUrl;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error('[useCartoonMode] Zip export failed:', err);
      setError(err.message || 'Failed to export sticker pack');
    } finally {
      setIsExportingZip(false);
    }
  }, [
    extractedHead,
    selectedTemplateIds,
    packPreviews,
    templateTransforms,
    templateBorderThicknesses,
    borderThickness,
    smoothOutlineLevel,
    selfieFileName,
  ]);

  // Synchronize brush strokes to extracted head and all templates
  const applyBrushStrokeToHead = useCallback(
    (points: StrokePoint[]) => {
      if (!extractedHead || points.length === 0 || toolMode === 'move') return;

      const patch = applyBrushStroke(
        extractedHead.alphaMask,
        extractedHead.width,
        extractedHead.height,
        points,
        {
          radius: Math.max(1, Math.round(brushSize / 2)),
          hardness: 0.8,
          opacity: 1.0,
          mode: toolMode as 'erase' | 'restore',
        }
      );

      if (!patch) return;

      const headCtx = extractedHead.canvas.getContext('2d');
      if (headCtx) {
        if (selfieImgRef.current) {
          headCtx.drawImage(
            selfieImgRef.current,
            extractedHead.cropBounds.x,
            extractedHead.cropBounds.y,
            extractedHead.cropBounds.width,
            extractedHead.cropBounds.height,
            0,
            0,
            extractedHead.width,
            extractedHead.height
          );
        }
        const imgData = headCtx.getImageData(0, 0, extractedHead.width, extractedHead.height);
        const px = imgData.data;
        for (let i = 0; i < extractedHead.alphaMask.length; i++) {
          px[i * 4 + 3] = extractedHead.alphaMask[i];
        }
        headCtx.putImageData(imgData, 0, 0);
      }

      const { frontCanvas, rearHairCanvas } = separateFrontAndRearHairCanvases(
        extractedHead.canvas,
        extractedHead.alphaMask,
        extractedHead.cropBounds,
        extractedHead.landmarks
      );
      extractedHead.frontCanvas = frontCanvas;
      extractedHead.rearHairCanvas = rearHairCanvas;

      setUndoStack((prev) => [...prev, patch]);
      setRedoStack([]);

      // Recomposite active template immediately
      if (headTransform) {
        const curBorder = templateBorderThicknesses[activeTemplate.id] ?? borderThickness;
        recomposite(activeTemplate, extractedHead, headTransform, curBorder, smoothOutlineLevel);
      }

      // Re-render all 12 pack previews in background so gallery remains accurate
      renderAllPackPreviews(
        extractedHead,
        templateTransforms,
        templateBorderThicknesses,
        borderThickness,
        smoothOutlineLevel
      );
    },
    [
      extractedHead,
      toolMode,
      brushSize,
      headTransform,
      activeTemplate,
      borderThickness,
      templateBorderThicknesses,
      smoothOutlineLevel,
      templateTransforms,
      recomposite,
      renderAllPackPreviews,
    ]
  );

  const undo = useCallback(() => {
    if (!extractedHead || undoStack.length === 0) return;
    const patch = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);

    for (let row = 0; row < patch.bounds.height; row++) {
      const maskOffset = (patch.bounds.y + row) * extractedHead.width + patch.bounds.x;
      const patchOffset = row * patch.bounds.width;
      extractedHead.alphaMask.set(
        patch.beforeAlpha.subarray(patchOffset, patchOffset + patch.bounds.width),
        maskOffset
      );
    }

    const headCtx = extractedHead.canvas.getContext('2d');
    if (headCtx) {
      if (selfieImgRef.current) {
        headCtx.drawImage(
          selfieImgRef.current,
          extractedHead.cropBounds.x,
          extractedHead.cropBounds.y,
          extractedHead.cropBounds.width,
          extractedHead.cropBounds.height,
          0,
          0,
          extractedHead.width,
          extractedHead.height
        );
      }
      const imgData = headCtx.getImageData(0, 0, extractedHead.width, extractedHead.height);
      const px = imgData.data;
      for (let i = 0; i < extractedHead.alphaMask.length; i++) {
        px[i * 4 + 3] = extractedHead.alphaMask[i];
      }
      headCtx.putImageData(imgData, 0, 0);
    }

    const { frontCanvas, rearHairCanvas } = separateFrontAndRearHairCanvases(
      extractedHead.canvas,
      extractedHead.alphaMask,
      extractedHead.cropBounds,
      extractedHead.landmarks
    );
    extractedHead.frontCanvas = frontCanvas;
    extractedHead.rearHairCanvas = rearHairCanvas;

    setUndoStack(newUndo);
    setRedoStack((prev) => [...prev, patch]);

    if (headTransform) {
      const curBorder = templateBorderThicknesses[activeTemplate.id] ?? borderThickness;
      recomposite(activeTemplate, extractedHead, headTransform, curBorder, smoothOutlineLevel);
    }
    renderAllPackPreviews(
      extractedHead,
      templateTransforms,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel
    );
  }, [
    extractedHead,
    undoStack,
    headTransform,
    activeTemplate,
    borderThickness,
    templateBorderThicknesses,
    smoothOutlineLevel,
    templateTransforms,
    recomposite,
    renderAllPackPreviews,
  ]);

  const redo = useCallback(() => {
    if (!extractedHead || redoStack.length === 0) return;
    const patch = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);

    for (let row = 0; row < patch.bounds.height; row++) {
      const maskOffset = (patch.bounds.y + row) * extractedHead.width + patch.bounds.x;
      const patchOffset = row * patch.bounds.width;
      extractedHead.alphaMask.set(
        patch.afterAlpha.subarray(patchOffset, patchOffset + patch.bounds.width),
        maskOffset
      );
    }

    const headCtx = extractedHead.canvas.getContext('2d');
    if (headCtx) {
      if (selfieImgRef.current) {
        headCtx.drawImage(
          selfieImgRef.current,
          extractedHead.cropBounds.x,
          extractedHead.cropBounds.y,
          extractedHead.cropBounds.width,
          extractedHead.cropBounds.height,
          0,
          0,
          extractedHead.width,
          extractedHead.height
        );
      }
      const imgData = headCtx.getImageData(0, 0, extractedHead.width, extractedHead.height);
      const px = imgData.data;
      for (let i = 0; i < extractedHead.alphaMask.length; i++) {
        px[i * 4 + 3] = extractedHead.alphaMask[i];
      }
      headCtx.putImageData(imgData, 0, 0);
    }

    const { frontCanvas, rearHairCanvas } = separateFrontAndRearHairCanvases(
      extractedHead.canvas,
      extractedHead.alphaMask,
      extractedHead.cropBounds,
      extractedHead.landmarks
    );
    extractedHead.frontCanvas = frontCanvas;
    extractedHead.rearHairCanvas = rearHairCanvas;

    setRedoStack(newRedo);
    setUndoStack((prev) => [...prev, patch]);

    if (headTransform) {
      const curBorder = templateBorderThicknesses[activeTemplate.id] ?? borderThickness;
      recomposite(activeTemplate, extractedHead, headTransform, curBorder, smoothOutlineLevel);
    }
    renderAllPackPreviews(
      extractedHead,
      templateTransforms,
      templateBorderThicknesses,
      borderThickness,
      smoothOutlineLevel
    );
  }, [
    extractedHead,
    redoStack,
    headTransform,
    activeTemplate,
    borderThickness,
    templateBorderThicknesses,
    smoothOutlineLevel,
    templateTransforms,
    recomposite,
    renderAllPackPreviews,
  ]);

  const saveProjectJson = useCallback(() => {
    if (!selfieDataUrl || !headTransform || !extractedHead) return;

    const proj: CartoonProjectData = {
      version: 5,
      appMode: 'cartoon',
      templateId: activeTemplate.id,
      selfieDataUrl,
      headCropBounds: extractedHead.cropBounds,
      headTransform,
      borderThickness,
      smoothOutlineLevel,
      alphaSettings: {
        smoothness: 2,
        feather: 0.5,
      },
      headPngDataUrl: extractedHead.canvas.toDataURL('image/png'),
      alphaMaskBase64: uint8ArrayToBase64(extractedHead.alphaMask),
      rawCropMaskBase64: extractedHead.rawCropMask ? uint8ArrayToBase64(extractedHead.rawCropMask) : undefined,
      landmarks: extractedHead.landmarks,
      templateTransforms,
      templateBorderThicknesses,
      selectedTemplateIds,
      globalHeadAlignment,
      individualHeadAlignments,
      calibratedChin,
      dateModified: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `cartoon_pack_project_${Date.now()}.stickerstudio`;
    a.href = URL.createObjectURL(blob);
    a.click();
  }, [
    selfieDataUrl,
    headTransform,
    extractedHead,
    activeTemplate.id,
    borderThickness,
    smoothOutlineLevel,
    templateTransforms,
    templateBorderThicknesses,
    selectedTemplateIds,
    globalHeadAlignment,
    individualHeadAlignments,
    calibratedChin,
  ]);

  const loadProjectJson = useCallback(
    async (jsonString: string) => {
      try {
        const proj: CartoonProjectData = JSON.parse(jsonString);
        if (proj.appMode !== 'cartoon') {
          throw new Error('Not a valid Cartoon Sticker Studio project archive.');
        }

        const tpl = ALL_CARTOON_TEMPLATES[proj.templateId] || HI_WAVING_TEMPLATE;
        setActiveTemplate(tpl);
        setBorderThicknessState(proj.borderThickness ?? 24);
        setSmoothOutlineLevel(proj.smoothOutlineLevel ?? 2);
        setSelfieDataUrl(proj.selfieDataUrl);

        const gAlign: GlobalHeadAlignment = proj.globalHeadAlignment || {
          scaleMultiplier: 1.0,
          rotationDelta: 0,
          offsetX: 0,
          offsetY: 0,
        };
        const iAligns: Record<string, IndividualHeadAlignment> = proj.individualHeadAlignments || {};
        const cChin = proj.calibratedChin || null;

        setGlobalHeadAlignmentState(gAlign);
        setIndividualHeadAlignmentsState(iAligns);
        setCalibratedChinState(cChin);
        setAlignmentScope('all');
        setGlobalRefTemplateId(tpl.id);

        if (proj.headPngDataUrl && proj.headCropBounds) {
          // Fast-path: deterministic lossless restoration without re-segmentation
          const img = new Image();
          const headPromise = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to decode head PNG'));
            img.src = proj.headPngDataUrl!;
          });

          let selfiePromise: Promise<void> | null = null;
          if (proj.selfieDataUrl) {
            const selfieImg = new Image();
            selfiePromise = new Promise<void>((resolve, reject) => {
              selfieImg.onload = () => {
                selfieImgRef.current = selfieImg;
                resolve();
              };
              selfieImg.onerror = () => reject(new Error('Failed to decode saved selfie image'));
              selfieImg.src = proj.selfieDataUrl;
            });
          }

          await Promise.all([headPromise, selfiePromise ? selfiePromise : Promise.resolve()]);

          const cropW = img.width;
          const cropH = img.height;
          const headCanvas = document.createElement('canvas');
          headCanvas.width = cropW;
          headCanvas.height = cropH;
          const headCtx = headCanvas.getContext('2d');
          if (!headCtx) throw new Error('Failed to get canvas context');
          headCtx.drawImage(img, 0, 0);

          let alphaMask: Uint8Array;
          if (proj.alphaMaskBase64) {
            alphaMask = base64ToUint8Array(proj.alphaMaskBase64);
          } else {
            const imgData = headCtx.getImageData(0, 0, cropW, cropH);
            alphaMask = new Uint8Array(cropW * cropH);
            for (let i = 0; i < alphaMask.length; i++) {
              alphaMask[i] = imgData.data[i * 4 + 3];
            }
          }

          const rawCropMask = proj.rawCropMaskBase64 ? base64ToUint8Array(proj.rawCropMaskBase64) : undefined;
          const restoredLandmarks = proj.landmarks ?? null;

          const { frontCanvas, rearHairCanvas } = separateFrontAndRearHairCanvases(
            headCanvas,
            alphaMask,
            proj.headCropBounds,
            restoredLandmarks
          );

          const restoredHead: ExtractedHeadResult = {
            canvas: headCanvas,
            frontCanvas,
            rearHairCanvas,
            rawCropMask,
            width: cropW,
            height: cropH,
            cropBounds: proj.headCropBounds,
            alphaMask,
            landmarks: restoredLandmarks,
          };

          setExtractedHead(restoredHead);
          setUndoStack([]);
          setRedoStack([]);

          let restoredTransforms: Record<string, HeadTransform>;
          if (proj.version === 5 || !proj.templateTransforms) {
            restoredTransforms = computeAllTransforms(restoredHead, gAlign, iAligns, cChin);
          } else {
            restoredTransforms = proj.templateTransforms;
          }
          setTemplateTransforms(restoredTransforms);

          const curTransform = restoredTransforms[tpl.id] || proj.headTransform;
          setHeadTransform(curTransform);

          const restoredBorders = proj.templateBorderThicknesses || {};
          setTemplateBorderThicknesses(restoredBorders);
          if (proj.selectedTemplateIds) {
            setSelectedTemplateIds(proj.selectedTemplateIds);
          } else {
            setSelectedTemplateIds(CARTOON_REACTIONS_PACK.map((t) => t.id));
          }

          const previews = await renderAllPackPreviews(
            restoredHead,
            restoredTransforms,
            restoredBorders,
            proj.borderThickness ?? 24,
            proj.smoothOutlineLevel ?? 2
          );

          const activePrev = previews[tpl.id];
          if (activePrev) {
            setArtworkCanvas(activePrev.artworkCanvas);
            setStickerCanvas(activePrev.stickerCanvas);
            setTightCrop(activePrev.tightCrop);
          }

          setViewMode('gallery');
        } else {
          // Fallback legacy project load
          const img = new Image();
          img.onload = async () => {
            selfieImgRef.current = img;
            const head = await extractPhotographicHead(img, proj.alphaSettings);
            setExtractedHead(head);
            setHeadTransform(proj.headTransform);
            setUndoStack([]);
            setRedoStack([]);
            await recomposite(tpl, head, proj.headTransform, proj.borderThickness, proj.smoothOutlineLevel);
          };
          img.src = proj.selfieDataUrl;
        }
      } catch (err: any) {
        setError('Failed to load cartoon project: ' + err.message);
      }
    },
    [recomposite, renderAllPackPreviews, computeAllTransforms]
  );

  if (typeof window !== 'undefined') {
    (window as any).__lastCartoonState = {
      extractedHead,
      packPreviews,
      templateTransforms,
      templateBorderThicknesses,
      borderThickness,
      selectedTemplateIds,
      globalHeadAlignment,
      individualHeadAlignments,
      calibratedChin,
      alignmentScope,
      globalRefTemplateId,
      viewMode,
    };
  }

  return {
    selfieDataUrl,
    selfieFileName,
    isProcessing,
    progressMessage,
    extractedHead,
    activeTemplate,
    headTransform,
    borderThickness,
    smoothOutlineLevel,
    previewBg,
    artworkCanvas,
    stickerCanvas,
    tightCrop,
    error,

    viewMode,
    templates: CARTOON_REACTIONS_PACK,
    selectedTemplateIds,
    packPreviews,
    templateTransforms,
    templateBorderThicknesses,
    isExportingZip,

    globalHeadAlignment,
    individualHeadAlignments,
    calibratedChin,
    alignmentScope,
    globalRefTemplateId,

    toolMode,
    brushSize,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,

    setViewMode,
    setAlignmentScope,
    setGlobalRefTemplateId,
    setGlobalHeadAlignment,
    setIndividualHeadAlignment,
    setCalibratedChin,
    applyAlignmentDrag,
    resetGlobalAlignment,
    resetIndividualAlignment,
    resetAllAlignment,
    selectTemplateForEdit,
    toggleTemplateSelection,
    selectAllTemplates,
    deselectAllTemplates,
    setToolMode,
    setBrushSize,
    undo,
    redo,
    applyBrushStrokeToHead,
    loadSelfieFile,
    loadSelfieUrl,
    updateHeadTransform,
    resetPlacement,
    setBorderThickness,
    setGlobalBorderThickness,
    setTemplateBorderThickness,
    setSmoothOutlineLevel,
    setPreviewBg,
    exportArtworkPng,
    exportStickerPng,
    exportPackZip,
    saveProjectJson,
    loadProjectJson,
  };
}
