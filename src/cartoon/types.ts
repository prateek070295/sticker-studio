/**
 * Type definitions for Sticker Studio V1.4 — Personalized Cartoon Stickers.
 */

export interface HeadSlotDefinition {
  /** Normalized X center of the head slot (0.0 - 1.0) on the template canvas */
  centerX: number;
  /** Normalized Y center of the head slot (0.0 - 1.0) on the template canvas */
  centerY: number;
  /** Target head width normalized to template canvas width (e.g. 0.40 = 40% width for oversized chibi look) */
  targetWidth: number;
  /** Expected angle of eye-line in degrees (usually 0 for horizontal, or slightly tilted if cartoon body tilts) */
  targetEyeAngleDegrees: number;
  /** Normalized target Y position for eye midpoint on canvas (default 0.3125 = 320px on 1024) */
  targetEyeY?: number;
  /** Normalized target eye distance on canvas (e.g. 0.1025 = ~105px on 1024) */
  targetEyeDistance?: number;
  /** Normalized target Y position for chin on canvas (e.g. 0.50 = 512px on 1024, rests on collar) */
  targetChinY?: number;
  /** Normalized target face height on canvas (e.g. 0.254 = 260px on 1024 for chibi proportion) */
  targetFaceH?: number;
  /** Normalized anchor position where the neck base should land (0.0 - 1.0) */
  neckAnchorX: number;
  neckAnchorY: number;
  /** Vertical overlap buffer where the front collar covers the lower neck (normalized 0.0 - 1.0) */
  collarOverlapY: number;
  /** Normalized maximum hair extent below chin (e.g. 0.75 = 75% of face height below chin) */
  hairExtentRatio?: number;
  /** Layering order for long hair: 'front' (over torso, tucked under collar) or 'behind' (behind torso) */
  hairLayering?: 'front' | 'behind';
  /** Default scale multiplier applied to the normalized target width */
  defaultScale: number;
  /** Default rotation offset in degrees */
  defaultRotation: number;
}

export interface CartoonTemplateLayers {
  /** SVG markup or path for the back layer (body, limbs, outfit, action effects, text bubble) */
  backSvg: string;
  /** SVG markup or path for the front layer (overlapping collar, lapels, neckband) */
  frontSvg: string;
}

export interface CartoonTemplateManifest {
  id: string;
  name: string;
  description: string;
  canvas: {
    width: number;
    height: number;
  };
  layers: CartoonTemplateLayers;
  headSlot: HeadSlotDefinition;
  category?: string;
  tags?: string[];
}

export interface FaceLandmarks {
  boundingBox: {
    originX: number; // Pixels in original photo
    originY: number;
    width: number;
    height: number;
    angle?: number;
  };
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  noseTip?: { x: number; y: number };
  mouthCenter?: { x: number; y: number };
  leftEarTragion?: { x: number; y: number };
  rightEarTragion?: { x: number; y: number };
  eyeMidpoint: { x: number; y: number };
  eyeDistance: number;
  eyeAngleDegrees: number;
  /** Estimated anatomical chin landmark derived by projecting vector from noseTip to mouthCenter */
  estimatedChin: { x: number; y: number };
}

export interface HeadTransform {
  /** Current canvas pixel X center of the photographic head on template */
  centerX: number;
  /** Current canvas pixel Y center of the photographic head on template */
  centerY: number;
  /** Scale multiplier */
  scale: number;
  /** Total rotation in degrees */
  rotationDegrees: number;
  /** Whether long hair is layered behind the cartoon body */
  hairBehindBody?: boolean;
  /** Baseline auto-detected placement to support "Reset Placement" */
  autoPlacement: {
    centerX: number;
    centerY: number;
    scale: number;
    rotationDegrees: number;
    hairBehindBody?: boolean;
  };
}

export interface ExtractedHeadResult {
  /** Offscreen or HTML canvas containing the isolated photographic head */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Original unscaled head crop bounds within the selfie */
  cropBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Refined 8-bit alpha mask (0 - 255) for the cropped head */
  alphaMask: Uint8Array;
  /** Raw binary mask (0 or 1) of the cropped head prior to alpha feathering */
  rawCropMask?: Uint8Array;
  /** Front-only canvas (face, eyes, ears, skull hair, and neck) for true rear-hair layering */
  frontCanvas?: HTMLCanvasElement;
  /** Rear-only canvas (lower hair below chin line) for true rear-hair layering */
  rearHairCanvas?: HTMLCanvasElement;
  /** Detected face landmarks if available */
  landmarks: FaceLandmarks | null;
}

export interface CartoonProjectData {
  version: 3 | 4;
  appMode: 'cartoon';
  templateId: string;
  selfieDataUrl: string;
  headCropBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  headTransform: HeadTransform;
  borderThickness: number;
  smoothOutlineLevel: number;
  alphaSettings: {
    smoothness: number;
    feather: number;
  };
  /** Lossless PNG data URL of extracted head for reproducible reopening without re-segmentation */
  headPngDataUrl?: string;
  /** Base64-encoded crop alpha mask */
  alphaMaskBase64?: string;
  /** Base64-encoded raw crop mask */
  rawCropMaskBase64?: string;
  /** Saved face landmarks to reproduce exact front/rear hair partition without rerunning MediaPipe */
  landmarks?: FaceLandmarks | null;
  /** V1.5 multi-template per-template transform overrides */
  templateTransforms?: Record<string, HeadTransform>;
  /** V1.5 per-template border overrides */
  templateBorderThicknesses?: Record<string, number>;
  /** V1.5 set of selected template IDs for pack export */
  selectedTemplateIds?: string[];
  dateModified: string;
}
