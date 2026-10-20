export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArtworkComponent {
  id: string; // e.g. "comp_1"
  label: number; // 1-based integer in label map
  bounds: BoundingBox;
  pixelCount: number;
  centroid: { x: number; y: number };
  isTiny: boolean; // Area < minThreshold (e.g. sparkles/dots)
  isHoleCandidate?: boolean;
}

export interface ConnectorBridge {
  id: string;
  fromCompId: string;
  toCompId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  enabled: boolean;
}

export interface StickerGroup {
  id: string; // e.g. "group_1"
  name: string; // e.g. "sticker_001"
  componentIds: string[];
  bounds: BoundingBox; // Union bounding box of all owned components
  borderThickness: number; // in pixels (0 for artwork-only, default 20)
  customBorder: boolean; // If true, overrides global border slider
  whiteBackingEnabled: boolean;
  connectBacking: boolean; // Auto-bridge multi-piece stickers
  solidBacking: boolean; // If true, closes internal holes in die-cut backing
  bridges: ConnectorBridge[];
  excludedFromExport: boolean;
  backingOverride?: BackingOverride;
}

export interface EnclosedHole {
  id: string;
  componentId: string;
  bounds: BoundingBox;
  pixelCount: number;
  removedFromArtwork: boolean;
}

export interface GridCell {
  row: number;
  col: number;
  cellBounds: BoundingBox;
  artworkBounds: BoundingBox;
  captionBounds?: BoundingBox;
  hasCaption: boolean;
}

export interface GridSheetConfig {
  enabled: boolean;
  columns: number; // e.g. 4
  rows: number;    // e.g. 5
  margin: { top: number; right: number; bottom: number; left: number };
  excludeCaptions: boolean;
  captionHeightPercent: number; // percentage of cell height reserved for caption, default 15
  customColDividers?: number[]; // custom X split lines
  customRowDividers?: number[]; // custom Y split lines
}

export interface ExtractionSettings {
  bgTolerance: number; // 0 to 100, default 15
  edgeSoftness: number; // 0 to 5, default 1
  minComponentArea: number; // default 20 px
  groupingProximityThreshold: number; // in pixels, default 35
  enableTitleDetection: boolean;
  gridConfig?: GridSheetConfig;
}

export type AppMode = 'sheet' | 'photo';
export type ViewMode = 'sheet' | 'grid';
export type PhotoToolMode = 'pan' | 'erase' | 'restore' | 'add-person' | 'select-person';
export type PhotoViewMode = 'sticker' | 'artwork' | 'before-after' | 'original';

export interface PersonRegion {
  id: string;
  label: string;
  box: BoundingBox;
  score: number;
  isManual: boolean;
  included: boolean;
  isUncertain?: boolean;
  cropBounds?: BoundingBox;
  cropMask?: Uint8Array; // Binary mask (cropBounds.width * cropBounds.height)
  cropConfidence?: Float32Array; // Continuous model probabilities 0.0 .. 1.0
}

export interface SerializedPersonRegion {
  id: string;
  label: string;
  box: BoundingBox;
  score: number;
  isManual: boolean;
  included: boolean;
  isUncertain?: boolean;
  cropBounds?: BoundingBox;
  maskData?: string; // Base64 RLE or mask identifier
  confidenceData?: string; // Base64 raw Float32Array bytes
}
export type ToolMode =
  | 'select'
  | 'lasso'
  | 'remove-hole'
  | 'keep-brush'
  | 'erase-brush'
  | 'restore-brush'
  | 'smart-erase'
  | 'split'
  | 'fg-guide'
  | 'bg-guide'
  | 'add-backing'
  | 'remove-backing'
  | 'smooth-backing'
  | 'pan';

export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface MaskPatch {
  id: string;
  bounds: BoundingBox;
  beforeAlpha: Uint8Array; // original values in bounds
  afterAlpha: Uint8Array;  // modified values in bounds
  mode: 'restore' | 'erase';
  timestamp: number;
}

export interface GuidedStroke {
  id: string;
  points: StrokePoint[];
  type: 'foreground' | 'background' | 'split-cut';
  radius: number;
}

export interface TouchingSplitRequest {
  componentId: string;
  mode: 'cut-line' | 'seeds';
  cutLine?: { x1: number; y1: number; x2: number; y2: number };
  seedA?: { x: number; y: number };
  seedB?: { x: number; y: number };
}

export interface SplitResult {
  originalComponentId: string;
  newComponentA: ArtworkComponent;
  newComponentB: ArtworkComponent;
  affectedBounds: BoundingBox;
}

export interface BackingOverride {
  groupId: string;
  addedMask?: Uint8Array; // 0 or 1 in patchBounds
  removedMask?: Uint8Array;
  bounds?: BoundingBox;
  smoothingRadius?: number; // 0 to 10
}

export interface EdgeWarning {
  id: string;
  type: 'color-halo' | 'isolated-island' | 'thin-bridge' | 'clipped-border';
  severity: 'warning' | 'error' | 'info';
  message: string;
  location?: { x: number; y: number; width?: number; height?: number };
  autoFixable: boolean;
  groupId?: string;
  componentId?: string;
}

export interface EdgeInspectorConfig {
  colorHaloTolerance: number;      // delta-E / RGB Euclidean distance threshold (default 25)
  minBridgeWidthPx: number;         // default 8px at screen resolution
  printDpi?: number;                // e.g. 300 DPI for physical print
  minPhysicalBridgeMm?: number;     // e.g. 1.0mm minimum physical die-cut width
  detectIsolatedIslands: boolean;   // detect detached backing islands
  detectBorderClipping: boolean;    // detect margin collisions
}

export interface SplitPreview {
  componentId: string;
  bounds: BoundingBox;
  partitionA: Uint8Array; // 1 if assigned to A, 0 otherwise, size bounds.width * bounds.height
  partitionB: Uint8Array; // 1 if assigned to B, 0 otherwise
  countA: number;
  countB: number;
}

export interface MaskPayloadMetadata {
  fileName: string;
  format: 'uint8' | 'uint16';
  bytesPerElement: number;
  byteOrder?: 'little-endian';
  byteLength: number;
}

export interface ProjectMetadata {
  version: '1.1';
  schemaVersion: 1 | 2;
  projectType?: 'sheet' | 'photo';
  createdAt: number;
  updatedAt: number;
  name: string;
  sourceSha256: string;
  imageDimensions: { width: number; height: number };
  maskMetadata?: {
    alphaMask: MaskPayloadMetadata;
    labelMap: MaskPayloadMetadata;
  };
  settings: ExtractionSettings;
  globalBorderThickness: number;
  globalSolidBacking: boolean;
  globalWhiteBacking: boolean;
  gridConfig?: GridSheetConfig;
  photoSettings?: {
    borderThickness: number;
    previewBg: 'checker' | 'dark' | 'light' | 'saturated' | 'white' | 'grey';
    hasRemovedBackground: boolean;
    viewMode?: PhotoViewMode;
    personRegions?: SerializedPersonRegion[];
    selectedRegionId?: string | null;
    isReviewMode?: boolean;
    manualDelta?: string;
    edgeTrim?: number;
    bottomFinish?: 'flat' | 'rounded' | 'curved';
    bottomCurveRadius?: number;
    smoothOutline?: number;
    artworkEdgeSmoothness?: number;
    artworkEdgeFeather?: number;
    qualityMode?: 'fast' | 'better' | 'best';
    extractionMode?: 'standard' | 'high-quality';
    decontaminateEdge?: boolean;
    hairDetail?: number;
    accessoryMerge?: boolean;
    fallbackConfidence?: string; // Base64 raw Float32Array bytes for single-pass segmentation
    baseAlphaMatteData?: string; // Base64 original immutable neural alpha matte
    alphaMatteData?: string; // Base64 resolved artwork alpha mask (1 byte/px)
    decontaminatedData?: string; // Base64 decontaminated RGBA
  };
}

export interface SerializedProject {
  metadata: ProjectMetadata;
  components: ArtworkComponent[];
  groups: StickerGroup[];
  holes: EnclosedHole[];
  gridConfig?: GridSheetConfig;
  patches?: Array<{
    id: string;
    bounds: BoundingBox;
    mode: 'restore' | 'erase';
    timestamp: number;
  }>;
  backingOverrides?: Record<string, {
    smoothingRadius?: number;
    bounds?: BoundingBox;
  }>;
}

export interface ExtractorProgress {
  stage: 'estimating' | 'segmenting' | 'components' | 'grouping' | 'edt' | 'complete';
  percentage: number;
  message: string;
}

// Worker communication payloads
export type WorkerRequest =
  | {
      type: 'EXTRACT_SHEET';
      id: string;
      imageData: ImageData;
      settings: ExtractionSettings;
      manualBgColor?: [number, number, number] | null;
    }
  | {
      type: 'COMPUTE_GROUP_EDT';
      id: string;
      groupId: string;
      width: number;
      height: number;
      binaryMask: Uint8Array; // 0 or 255
      maxDistance: number;
    }
  | {
      type: 'APPLY_MASK_PATCH';
      id: string;
      patch: {
        bounds: BoundingBox;
        pixels: Uint8Array; // 1 = fg, 0 = bg
        mode: 'keep' | 'erase';
      };
    };

export type WorkerResponse =
  | {
      type: 'PROGRESS';
      progress: ExtractorProgress;
    }
  | {
      type: 'EXTRACT_COMPLETE';
      id: string;
      bgColor: [number, number, number];
      components: ArtworkComponent[];
      labelMap: Uint16Array; // width * height component IDs
      alphaMask: Uint8Array; // width * height alpha values (0..255)
      suggestedGroups: StickerGroup[];
      holes: EnclosedHole[];
      width: number;
      height: number;
    }
  | {
      type: 'GROUP_EDT_COMPLETE';
      id: string;
      groupId: string;
      distanceField: Float32Array; // Signed / Euclidean distance
      width: number;
      height: number;
      bounds: BoundingBox;
    }
  | {
      type: 'ERROR';
      error: string;
    };

declare global {
  interface Window {
    desktopAPI?: {
      isDesktop: boolean;
      openFileDialog: () => Promise<{ filePath: string; fileName: string; dataUrl: string } | null>;
      saveFileDialog: (options?: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
      writeFile: (filePath: string, data: Uint8Array) => Promise<{ success: boolean; error?: string }>;
      showAbout: () => Promise<void>;
      getVersion: () => Promise<string>;
    };
  }
}
