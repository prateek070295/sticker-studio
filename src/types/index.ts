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
}

export interface EnclosedHole {
  id: string;
  componentId: string;
  bounds: BoundingBox;
  pixelCount: number;
  removedFromArtwork: boolean;
}

export interface ExtractionSettings {
  bgTolerance: number; // 0 to 100, default 15
  edgeSoftness: number; // 0 to 5, default 1
  minComponentArea: number; // default 20 px
  groupingProximityThreshold: number; // in pixels, default 35
  enableTitleDetection: boolean;
}

export type ViewMode = 'sheet' | 'grid';
export type ToolMode = 'select' | 'lasso' | 'remove-hole' | 'keep-brush' | 'erase-brush';

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
