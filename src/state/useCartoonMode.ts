import { useState, useCallback, useRef, useEffect } from 'react';
import {
  CartoonTemplateManifest,
  ExtractedHeadResult,
  HeadTransform,
  CartoonProjectData,
} from '../cartoon/types';
import { HI_WAVING_TEMPLATE, ALL_CARTOON_TEMPLATES } from '../cartoon/templates/hiWaving';
import { extractPhotographicHead } from '../core/cartoonHeadExtractor';
import {
  computeInitialHeadPlacement,
  renderCartoonArtwork,
  generateCartoonStickerDieCut,
} from '../core/cartoonCompositor';

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

  // Actions
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
  setSmoothOutlineLevel: (val: number) => void;
  setPreviewBg: (bg: 'checker' | 'dark' | 'white' | 'print') => void;
  exportArtworkPng: () => void;
  exportStickerPng: () => void;
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

  // Cached full selfie image element
  const selfieImgRef = useRef<HTMLImageElement | null>(null);

  // Re-composite sticker whenever template, head, transform, or border changes
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
      } catch (err) {
        console.error('[useCartoonMode] Recomposition error:', err);
      }
    },
    []
  );

  // Pipeline from loaded selfie image
  const processImage = useCallback(
    async (img: HTMLImageElement, fileName: string) => {
      setIsProcessing(true);
      setError(null);
      setProgressMessage('Locating face and facial landmarks...');

      try {
        // Step 1: Extract Head & Alpha Matte
        setProgressMessage('Segmenting hair, face, and collar anchors...');
        const head = await extractPhotographicHead(img, {
          smoothness: 2,
          feather: 0.5,
          neckExtensionRatio: 0.35,
        });

        setExtractedHead(head);

        // Step 2: Compute Auto Placement
        setProgressMessage('Calculating natural head alignment & scale...');
        const initialTransform = computeInitialHeadPlacement(activeTemplate, head);
        setHeadTransform(initialTransform);

        // Step 3: Composite Layered Character & Smooth Cutline
        setProgressMessage('Rendering 3-layer cartoon sticker...');
        await recomposite(
          activeTemplate,
          head,
          initialTransform,
          borderThickness,
          smoothOutlineLevel
        );

        setProgressMessage('');
      } catch (err: any) {
        console.error('[useCartoonMode] Processing failed:', err);
        setError(err.message || 'Failed to process selfie');
      } finally {
        setIsProcessing(false);
      }
    },
    [activeTemplate, borderThickness, smoothOutlineLevel, recomposite]
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

  const updateHeadTransform = useCallback(
    (update: {
      centerX?: number;
      centerY?: number;
      scale?: number;
      rotationDegrees?: number;
      hairBehindBody?: boolean;
    }) => {
      if (!headTransform || !extractedHead) return;

      const newTf: HeadTransform = {
        ...headTransform,
        centerX: update.centerX !== undefined ? Math.round(update.centerX) : headTransform.centerX,
        centerY: update.centerY !== undefined ? Math.round(update.centerY) : headTransform.centerY,
        scale: update.scale !== undefined ? parseFloat(update.scale.toFixed(4)) : headTransform.scale,
        rotationDegrees:
          update.rotationDegrees !== undefined
            ? parseFloat(update.rotationDegrees.toFixed(2))
            : headTransform.rotationDegrees,
        hairBehindBody:
          update.hairBehindBody !== undefined ? update.hairBehindBody : headTransform.hairBehindBody,
      };

      setHeadTransform(newTf);
      recomposite(activeTemplate, extractedHead, newTf, borderThickness, smoothOutlineLevel);
    },
    [headTransform, extractedHead, activeTemplate, borderThickness, smoothOutlineLevel, recomposite]
  );

  const resetPlacement = useCallback(() => {
    if (!headTransform || !extractedHead) return;
    const resetTf: HeadTransform = {
      centerX: headTransform.autoPlacement.centerX,
      centerY: headTransform.autoPlacement.centerY,
      scale: headTransform.autoPlacement.scale,
      rotationDegrees: headTransform.autoPlacement.rotationDegrees,
      autoPlacement: headTransform.autoPlacement,
    };
    setHeadTransform(resetTf);
    recomposite(activeTemplate, extractedHead, resetTf, borderThickness, smoothOutlineLevel);
  }, [headTransform, extractedHead, activeTemplate, borderThickness, smoothOutlineLevel, recomposite]);

  const setBorderThickness = useCallback(
    (val: number) => {
      setBorderThicknessState(val);
      if (artworkCanvas) {
        const { stickerCanvas: stCanvas, tightCrop: crop } = generateCartoonStickerDieCut(
          artworkCanvas,
          val,
          smoothOutlineLevel
        );
        setStickerCanvas(stCanvas);
        setTightCrop(crop);
      }
    },
    [artworkCanvas, smoothOutlineLevel]
  );

  const exportArtworkPng = useCallback(() => {
    if (!artworkCanvas || !tightCrop) return;
    // Export tightly cropped transparent PNG
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = tightCrop.width;
    exportCanvas.height = tightCrop.height;
    const eCtx = exportCanvas.getContext('2d');
    if (!eCtx) return;

    eCtx.drawImage(
      artworkCanvas,
      tightCrop.x,
      tightCrop.y,
      tightCrop.width,
      tightCrop.height,
      0,
      0,
      tightCrop.width,
      tightCrop.height
    );

    const a = document.createElement('a');
    a.download = `cartoon_hi_artwork_${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
  }, [artworkCanvas, tightCrop]);

  const exportStickerPng = useCallback(() => {
    if (!stickerCanvas || !tightCrop) return;
    // Export tightly cropped white-backed sticker PNG
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = tightCrop.width;
    exportCanvas.height = tightCrop.height;
    const eCtx = exportCanvas.getContext('2d');
    if (!eCtx) return;

    eCtx.drawImage(
      stickerCanvas,
      tightCrop.x,
      tightCrop.y,
      tightCrop.width,
      tightCrop.height,
      0,
      0,
      tightCrop.width,
      tightCrop.height
    );

    const a = document.createElement('a');
    a.download = `cartoon_hi_sticker_${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
  }, [stickerCanvas, tightCrop]);

  const saveProjectJson = useCallback(() => {
    if (!selfieDataUrl || !headTransform || !extractedHead) return;

    const proj: CartoonProjectData = {
      version: 3,
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
      dateModified: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `cartoon_project_${activeTemplate.id}_${Date.now()}.stickerstudio`;
    a.href = URL.createObjectURL(blob);
    a.click();
  }, [selfieDataUrl, headTransform, extractedHead, activeTemplate, borderThickness, smoothOutlineLevel]);

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

        const img = new Image();
        img.onload = async () => {
          selfieImgRef.current = img;
          const head = await extractPhotographicHead(img, proj.alphaSettings);
          setExtractedHead(head);
          setHeadTransform(proj.headTransform);
          await recomposite(tpl, head, proj.headTransform, proj.borderThickness, proj.smoothOutlineLevel);
        };
        img.src = proj.selfieDataUrl;
      } catch (err: any) {
        setError('Failed to load cartoon project: ' + err.message);
      }
    },
    [recomposite]
  );

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

    loadSelfieFile,
    loadSelfieUrl,
    updateHeadTransform,
    resetPlacement,
    setBorderThickness,
    setSmoothOutlineLevel,
    setPreviewBg,
    exportArtworkPng,
    exportStickerPng,
    saveProjectJson,
    loadProjectJson,
  };
}
