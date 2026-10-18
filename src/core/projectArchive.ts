/**
 * Hardened Project Archive Engine (.stickerstudio).
 * Handles transactional project serialization and deserialization with:
 * - Schema versioning (schemaVersion: 1)
 * - SHA-256 source image integrity verification
 * - Archive size & decompression ratio enforcement (Zip Bomb defense)
 * - Path traversal defense (rejection of ../ and absolute paths)
 * - Referential integrity validation across groups and components
 * - Safe transactional staging (active workspace untouched if load fails)
 */

import JSZip from 'jszip';
import {
  ArtworkComponent,
  BackingOverride,
  EnclosedHole,
  ExtractionSettings,
  MaskPatch,
  ProjectMetadata,
  SerializedProject,
  StickerGroup
} from '../types';
import { createZip, ZipEntry } from './zip';

export const CURRENT_SCHEMA_VERSION = 2;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100 MB max compressed archive
export const MAX_UNCOMPRESSED_TOTAL_BYTES = 250 * 1024 * 1024; // 250 MB total uncompressed budget
export const MAX_PER_ENTRY_BYTES = 150 * 1024 * 1024; // 150 MB per single entry
export const MAX_DECOMPRESSION_RATIO = 100; // 100x maximum expansion ratio
export const MAX_IMAGE_WIDTH = 16384;
export const MAX_IMAGE_HEIGHT = 16384;
export const MAX_IMAGE_PIXELS = 30_000_000;
export const MAX_IMAGE_ALLOCATION_BYTES = 256 * 1024 * 1024; // 256 MB RGBA buffer budget

export interface ProjectSaveState {
  name: string;
  sourceImage: ImageData;
  alphaMask?: Uint8Array;
  labelMap?: Uint16Array;
  settings: ExtractionSettings;
  components: ArtworkComponent[];
  groups: StickerGroup[];
  holes: EnclosedHole[];
  globalBorderThickness: number;
  globalSolidBacking: boolean;
  globalWhiteBacking: boolean;
  patches?: MaskPatch[];
  projectType?: 'sheet' | 'photo';
  photoSettings?: {
    borderThickness: number;
    previewBg: 'checker' | 'dark' | 'light' | 'saturated';
    hasRemovedBackground: boolean;
    viewMode?: 'sticker' | 'artwork' | 'before-after' | 'original';
    personRegions?: import('../types').SerializedPersonRegion[];
    selectedRegionId?: string | null;
    isReviewMode?: boolean;
    manualDelta?: string;
    edgeTrim?: number;
    bottomFinish?: 'flat' | 'rounded' | 'curved';
    bottomCurveRadius?: number;
  };
}

export interface LoadedProjectData {
  metadata: ProjectMetadata;
  sourceImage: ImageData;
  components: ArtworkComponent[];
  groups: StickerGroup[];
  holes: EnclosedHole[];
  alphaMask: Uint8Array;
  labelMap: Uint16Array;
  patches?: MaskPatch[];
}

/**
 * Computes a hexadecimal SHA-256 hash using native Web Cryptography API.
 */
export async function computeSha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBufferView);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Polyfill ImageData for Node.js test environments if undefined
if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(wOrData: any, hOrW?: any, h?: any) {
      if (wOrData instanceof Uint8ClampedArray) {
        this.data = wOrData;
        this.width = hOrW;
        this.height = h;
      } else {
        this.width = wOrData;
        this.height = hOrW;
        this.data = new Uint8ClampedArray(wOrData * hOrW * 4);
      }
    }
  };
}

let nodeSharp: any = null;
try {
  // @ts-ignore
  nodeSharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
} catch {}

/**
 * Encodes an ImageData into a PNG Uint8Array.
 */
export async function imageDataToPngBytes(imageData: ImageData): Promise<Uint8Array> {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined' && nodeSharp) {
    const pngBuffer = await nodeSharp(Buffer.from(imageData.data.buffer), {
      raw: { width: imageData.width, height: imageData.height, channels: 4 }
    }).png().toBuffer();
    return new Uint8Array(pngBuffer);
  }

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(imageData.width, imageData.height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.putImageData(imageData, 0, 0);

  if ('convertToBlob' in canvas) {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  } else {
    return new Promise((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to encode canvas to PNG'));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
      }, 'image/png');
    });
  }
}

/**
 * Decodes a PNG Uint8Array into an ImageData object.
 */
export async function pngBytesToImageData(pngBytes: Uint8Array): Promise<ImageData> {
  if (typeof FileReader === 'undefined' && nodeSharp) {
    const img = nodeSharp(Buffer.from(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength)).ensureAlpha();
    const meta = await img.metadata();
    const rawBuf = await img.raw().toBuffer();
    const clamped = new Uint8ClampedArray(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
    return new (globalThis as any).ImageData(clamped, meta.width!, meta.height!);
  }

  const blob = new Blob([pngBytes as BlobPart], { type: 'image/png' });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => reject(new Error('Corrupted or unreadable PNG image'));
    img.src = dataUrl;
  });
}

/**
 * Serializes the complete project state into a secure .stickerstudio ZIP archive.
 */
export async function saveProjectArchive(state: ProjectSaveState): Promise<Blob> {
  const pngBytes = await imageDataToPngBytes(state.sourceImage);
  const sourceSha256 = await computeSha256(pngBytes);

  const width = state.sourceImage.width;
  const height = state.sourceImage.height;
  const pixelCount = width * height;

  // Prepare exact alphaMask payload
  let alphaMask: Uint8Array;
  if (state.alphaMask) {
    if (state.alphaMask.length !== pixelCount) {
      throw new Error(`Invalid alphaMask size: expected ${pixelCount}, got ${state.alphaMask.length}`);
    }
    alphaMask = state.alphaMask;
  } else {
    alphaMask = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      alphaMask[i] = state.sourceImage.data[i * 4 + 3];
    }
  }

  // Prepare exact labelMap payload (little-endian Uint16)
  let labelMap: Uint16Array;
  if (state.labelMap) {
    if (state.labelMap.length !== pixelCount) {
      throw new Error(`Invalid labelMap size: expected ${pixelCount}, got ${state.labelMap.length}`);
    }
    labelMap = state.labelMap;
  } else {
    labelMap = new Uint16Array(pixelCount);
  }

  const labelBuffer = new ArrayBuffer(pixelCount * 2);
  const labelView = new DataView(labelBuffer);
  for (let i = 0; i < pixelCount; i++) {
    labelView.setUint16(i * 2, labelMap[i], true); // little-endian
  }
  const labelBytes = new Uint8Array(labelBuffer);

  const metadata: ProjectMetadata = {
    version: '1.1',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    name: state.name || 'Untitled Sticker Project',
    sourceSha256,
    imageDimensions: {
      width,
      height
    },
    maskMetadata: {
      alphaMask: {
        fileName: 'alpha_mask.bin',
        format: 'uint8',
        bytesPerElement: 1,
        byteLength: pixelCount
      },
      labelMap: {
        fileName: 'label_map.bin',
        format: 'uint16',
        bytesPerElement: 2,
        byteOrder: 'little-endian',
        byteLength: pixelCount * 2
      }
    },
    settings: state.settings,
    globalBorderThickness: state.globalBorderThickness,
    globalSolidBacking: state.globalSolidBacking,
    globalWhiteBacking: state.globalWhiteBacking,
    gridConfig: state.settings.gridConfig,
    projectType: state.projectType || 'sheet',
    photoSettings: state.photoSettings
  };

  const entries: ZipEntry[] = [
    { name: 'source.png', data: pngBytes },
    { name: 'alpha_mask.bin', data: alphaMask },
    { name: 'label_map.bin', data: labelBytes }
  ];

  const serializedGroups = state.groups.map(group => {
    if (!group.backingOverride) return group;
    const bo = group.backingOverride;
    const serializedBo: Record<string, any> = {
      groupId: bo.groupId,
      bounds: bo.bounds,
      smoothingRadius: bo.smoothingRadius
    };
    if (bo.addedMask && bo.addedMask.length > 0) {
      const entryName = `backing_masks/${group.id}_added.bin`;
      entries.push({ name: entryName, data: new Uint8Array(bo.addedMask) });
      serializedBo.addedMaskEntry = entryName;
      serializedBo.addedMaskLength = bo.addedMask.length;
    }
    if (bo.removedMask && bo.removedMask.length > 0) {
      const entryName = `backing_masks/${group.id}_removed.bin`;
      entries.push({ name: entryName, data: new Uint8Array(bo.removedMask) });
      serializedBo.removedMaskEntry = entryName;
      serializedBo.removedMaskLength = bo.removedMask.length;
    }
    return {
      ...group,
      backingOverride: serializedBo as BackingOverride
    };
  });

  const serializedProject: SerializedProject = {
    metadata,
    components: state.components,
    groups: serializedGroups,
    holes: state.holes,
    gridConfig: state.settings.gridConfig,
    patches: state.patches ? state.patches.map(p => ({
      id: p.id,
      bounds: p.bounds,
      mode: p.mode,
      timestamp: p.timestamp
    })) : []
  };

  const projectJsonBytes = new TextEncoder().encode(JSON.stringify(serializedProject, null, 2));
  entries.unshift({ name: 'project.json', data: projectJsonBytes });

  return createZip(entries);
}

/**
 * Scans ZIP local and central directory headers for illegal path traversal filenames (../ or absolute paths)
 * before JSZip normalizes them away.
 */
export function checkZipHeaderPathTraversal(rawBytes: Uint8Array): void {
  const len = rawBytes.length;
  for (let i = 0; i < len - 30; i++) {
    // Local file header magic PK\x03\x04
    if (rawBytes[i] === 0x50 && rawBytes[i + 1] === 0x4b && rawBytes[i + 2] === 0x03 && rawBytes[i + 3] === 0x04) {
      const nameLen = rawBytes[i + 26] | (rawBytes[i + 27] << 8);
      if (nameLen > 0 && i + 30 + nameLen <= len) {
        const name = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes.subarray(i + 30, i + 30 + nameLen));
        if (name.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
          throw new Error(`Security violation: Archive contains illegal path traversal entry "${name}".`);
        }
      }
    }
    // Central directory file header magic PK\x01\x02
    if (rawBytes[i] === 0x50 && rawBytes[i + 1] === 0x4b && rawBytes[i + 2] === 0x01 && rawBytes[i + 3] === 0x02) {
      const nameLen = rawBytes[i + 28] | (rawBytes[i + 29] << 8);
      if (nameLen > 0 && i + 46 + nameLen <= len) {
        const name = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes.subarray(i + 46, i + 46 + nameLen));
        if (name.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
          throw new Error(`Security violation: Archive contains illegal path traversal entry "${name}".`);
        }
      }
    }
  }
}

export interface LoadArchiveOptions {
  maxUncompressedTotalBytes?: number;
  maxDecompressionRatio?: number;
  maxPerEntryBytes?: number;
}

/**
 * Loads, decompresses, and transactionally validates a .stickerstudio archive.
 * Throws on corruption, invalid checksum, schema mismatch, or path traversal,
 * ensuring the active workspace is never replaced with invalid state.
 *
 * Note: Cumulative post-decompression checks enforce defense-in-depth size caps
 * on extracted payloads; they do not bound in-flight memory amplification during zip decompression.
 */
export async function loadProjectArchive(
  fileOrBlob: File | Blob,
  options?: LoadArchiveOptions
): Promise<LoadedProjectData> {
  if (fileOrBlob.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive exceeds maximum allowable size (${Math.round(fileOrBlob.size / 1024 / 1024)}MB > ${MAX_ARCHIVE_BYTES / 1024 / 1024}MB limit).`);
  }

  // Pre-scan raw ZIP headers for path traversal before JSZip normalizes entry paths
  const rawBytes = fileOrBlob instanceof Uint8Array ? fileOrBlob : new Uint8Array(await fileOrBlob.arrayBuffer());
  checkZipHeaderPathTraversal(rawBytes);

  const maxTotalBytes = options?.maxUncompressedTotalBytes ?? MAX_UNCOMPRESSED_TOTAL_BYTES;
  const maxRatio = options?.maxDecompressionRatio ?? MAX_DECOMPRESSION_RATIO;
  const maxEntryBytes = options?.maxPerEntryBytes ?? MAX_PER_ENTRY_BYTES;

  const zip = new JSZip();
  let uncompressedTotalBytes = 0;

  const enforceCumulativeBudget = (currentBytes: number) => {
    if (currentBytes > maxTotalBytes) {
      const currentMb = (currentBytes / (1024 * 1024)).toFixed(2);
      const maxMb = (maxTotalBytes / (1024 * 1024)).toFixed(2);
      throw new Error(`Cumulative decompression budget exceeded: Total uncompressed data (${currentMb}MB / ${currentBytes} bytes) exceeds ${maxMb}MB (${maxTotalBytes} bytes) limit.`);
    }
    if (fileOrBlob.size > 1024) {
      const ratio = currentBytes / fileOrBlob.size;
      if (ratio > maxRatio) {
        throw new Error(`Decompression ratio violation: Archive expansion ratio (${ratio.toFixed(1)}x) exceeds allowable ${maxRatio}x threshold.`);
      }
    }
  };

  let loadedZip: JSZip;
  try {
    loadedZip = await zip.loadAsync(fileOrBlob);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Corrupted or invalid ZIP container: ${message}`);
  }

  // 1. Path traversal and entry integrity check
  for (const relativePath of Object.keys(loadedZip.files)) {
    if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      throw new Error(`Security violation: Archive contains illegal path traversal entry "${relativePath}".`);
    }
  }

  // 2. Validate project.json presence and entry size budget
  const projectFile = loadedZip.file('project.json');
  if (!projectFile) {
    throw new Error('Invalid .stickerstudio archive: missing project.json definition.');
  }

  const projectJsonBytes = await projectFile.async('uint8array');
  if (projectJsonBytes.length > maxEntryBytes) {
    throw new Error(`Per-entry size budget exceeded: project.json size (${Math.round(projectJsonBytes.length / 1024 / 1024)}MB) exceeds ${maxEntryBytes / 1024 / 1024}MB limit.`);
  }
  uncompressedTotalBytes += projectJsonBytes.length;
  enforceCumulativeBudget(uncompressedTotalBytes);

  const projectJsonStr = new TextDecoder().decode(projectJsonBytes);
  let serialized: SerializedProject;
  try {
    serialized = JSON.parse(projectJsonStr);
  } catch {
    throw new Error('Corrupted project.json: invalid JSON syntax.');
  }

  // 3. Schema version verification
  if (serialized.metadata?.schemaVersion === 1) {
    throw new Error('Legacy v1 project archives lack exact mask and ownership data and cannot be safely restored without workspace damage. Please re-import the original image.');
  }
  if (!serialized.metadata || serialized.metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Incompatible project schema version: expected ${CURRENT_SCHEMA_VERSION}, received ${serialized.metadata?.schemaVersion}.`);
  }

  // 4. Image dimension & allocation safety checks
  const { width: metaW, height: metaH } = serialized.metadata.imageDimensions || { width: 0, height: 0 };
  if (metaW <= 0 || metaW > MAX_IMAGE_WIDTH || metaH <= 0 || metaH > MAX_IMAGE_HEIGHT) {
    throw new Error(`Invalid image dimensions (${metaW}x${metaH}): dimensions must be between 1 and ${MAX_IMAGE_WIDTH}px.`);
  }

  const pixelCount = metaW * metaH;
  if (pixelCount > MAX_IMAGE_PIXELS) {
    throw new Error(`Pixel budget exceeded: image contains ${pixelCount} pixels (maximum allowable: ${MAX_IMAGE_PIXELS}).`);
  }

  const requiredAllocationBytes = pixelCount * 4;
  if (requiredAllocationBytes > MAX_IMAGE_ALLOCATION_BYTES) {
    throw new Error(`Allocation budget exceeded: required buffer (${Math.round(requiredAllocationBytes / 1024 / 1024)}MB) exceeds ${MAX_IMAGE_ALLOCATION_BYTES / 1024 / 1024}MB limit.`);
  }

  // 5. Referential Integrity Validation (validate object graph before expensive image decoding)
  const compIdSet = new Set<string>();
  const validComponentLabels = new Set<number>();
  for (const comp of serialized.components || []) {
    if (!comp.id || typeof comp.label !== 'number' || comp.label <= 0) {
      throw new Error(`Invalid component metadata: Component "${comp?.id}" has an invalid label or identifier.`);
    }
    compIdSet.add(comp.id);
    validComponentLabels.add(comp.label);
  }

  const claimedCompIds = new Set<string>();
  for (const group of serialized.groups || []) {
    if (!group.id || !group.componentIds || group.componentIds.length === 0) {
      throw new Error(`Invalid group metadata: Group "${group?.id}" is missing valid component assignments.`);
    }
    for (const cId of group.componentIds) {
      if (!compIdSet.has(cId)) {
        throw new Error(`Referential integrity error: Group "${group.id}" references non-existent component "${cId}".`);
      }
      if (claimedCompIds.has(cId)) {
        throw new Error(`Ownership violation: Component "${cId}" is assigned to multiple sticker groups.`);
      }
      claimedCompIds.add(cId);
    }
  }

  // 6. Validate alpha_mask.bin presence and size
  const alphaFile = loadedZip.file('alpha_mask.bin');
  if (!alphaFile) {
    throw new Error('Invalid .stickerstudio archive: missing alpha_mask.bin payload.');
  }
  const alphaBytes = await alphaFile.async('uint8array');
  if (alphaBytes.length > maxEntryBytes) {
    throw new Error(`Per-entry size budget exceeded: alpha_mask.bin (${Math.round(alphaBytes.length / 1024 / 1024)}MB) exceeds ${maxEntryBytes / 1024 / 1024}MB limit.`);
  }
  if (alphaBytes.length !== pixelCount) {
    throw new Error(`Corrupted alpha_mask.bin: expected ${pixelCount} bytes, got ${alphaBytes.length}.`);
  }
  uncompressedTotalBytes += alphaBytes.length;
  enforceCumulativeBudget(uncompressedTotalBytes);
  const alphaMask = new Uint8Array(alphaBytes);

  // 7. Validate label_map.bin presence, size, and decode little-endian Uint16
  const labelFile = loadedZip.file('label_map.bin');
  if (!labelFile) {
    throw new Error('Invalid .stickerstudio archive: missing label_map.bin payload.');
  }
  const labelBytes = await labelFile.async('uint8array');
  if (labelBytes.length > maxEntryBytes) {
    throw new Error(`Per-entry size budget exceeded: label_map.bin (${Math.round(labelBytes.length / 1024 / 1024)}MB) exceeds ${maxEntryBytes / 1024 / 1024}MB limit.`);
  }
  if (labelBytes.length !== pixelCount * 2) {
    throw new Error(`Corrupted label_map.bin: expected ${pixelCount * 2} bytes, got ${labelBytes.length}.`);
  }
  uncompressedTotalBytes += labelBytes.length;
  enforceCumulativeBudget(uncompressedTotalBytes);

  const labelMap = new Uint16Array(pixelCount);
  const labelView = new DataView(labelBytes.buffer, labelBytes.byteOffset, labelBytes.byteLength);
  for (let i = 0; i < pixelCount; i++) {
    const lbl = labelView.getUint16(i * 2, true); // little-endian
    if (lbl !== 0 && !validComponentLabels.has(lbl)) {
      throw new Error(`Referential integrity error: labelMap contains label ${lbl} not assigned to any component.`);
    }
    labelMap[i] = lbl;
  }

  // 8. Validate source.png presence, per-entry size, and cumulative decompression budget
  const sourceFile = loadedZip.file('source.png');
  if (!sourceFile) {
    throw new Error('Invalid .stickerstudio archive: missing source.png image asset.');
  }

  const sourceBytes = await sourceFile.async('uint8array');
  if (sourceBytes.length > maxEntryBytes) {
    throw new Error(`Per-entry size budget exceeded: source.png (${Math.round(sourceBytes.length / 1024 / 1024)}MB) exceeds ${maxEntryBytes / 1024 / 1024}MB limit.`);
  }
  uncompressedTotalBytes += sourceBytes.length;
  enforceCumulativeBudget(uncompressedTotalBytes);

  // 9. Source image SHA-256 integrity verification
  const calculatedSha256 = await computeSha256(sourceBytes);
  if (serialized.metadata.sourceSha256 && calculatedSha256 !== serialized.metadata.sourceSha256) {
    throw new Error(`Integrity check failed: source.png SHA-256 checksum mismatch (expected ${serialized.metadata.sourceSha256}, got ${calculatedSha256}).`);
  }

  // 10. Decode source image
  const sourceImage = await pngBytesToImageData(sourceBytes);

  if (
    sourceImage.width !== serialized.metadata.imageDimensions.width ||
    sourceImage.height !== serialized.metadata.imageDimensions.height
  ) {
    throw new Error(`Dimension mismatch: Image dimensions (${sourceImage.width}x${sourceImage.height}) do not match project metadata (${serialized.metadata.imageDimensions.width}x${serialized.metadata.imageDimensions.height}).`);
  }

  // 11. Reconstruct backing override masks as validated Uint8Array instances
  for (const group of serialized.groups || []) {
    if (group.backingOverride) {
      const bo: any = group.backingOverride;
      if (bo.addedMaskEntry) {
        if (bo.addedMaskEntry.includes('..') || bo.addedMaskEntry.startsWith('/') || bo.addedMaskEntry.startsWith('\\')) {
          throw new Error(`Security violation: Illegal entry path "${bo.addedMaskEntry}".`);
        }
        const file = loadedZip.file(bo.addedMaskEntry);
        if (!file) {
          throw new Error(`Invalid .stickerstudio archive: missing backing mask entry "${bo.addedMaskEntry}".`);
        }
        const maskBytes = await file.async('uint8array');
        if (maskBytes.length > maxEntryBytes) {
          throw new Error(`Per-entry size budget exceeded: ${bo.addedMaskEntry} exceeds ${maxEntryBytes / 1024 / 1024}MB limit.`);
        }
        uncompressedTotalBytes += maskBytes.length;
        enforceCumulativeBudget(uncompressedTotalBytes);
        if (bo.bounds && maskBytes.length !== bo.bounds.width * bo.bounds.height) {
          throw new Error(`Corrupted backing mask: ${bo.addedMaskEntry} length (${maskBytes.length}) does not match bounds dimensions (${bo.bounds.width * bo.bounds.height}).`);
        }
        bo.addedMask = new Uint8Array(maskBytes);
      } else if (bo.addedMask && !(bo.addedMask instanceof Uint8Array)) {
        bo.addedMask = new Uint8Array(Object.values(bo.addedMask).map(Number));
      }

      if (bo.removedMaskEntry) {
        if (bo.removedMaskEntry.includes('..') || bo.removedMaskEntry.startsWith('/') || bo.removedMaskEntry.startsWith('\\')) {
          throw new Error(`Security violation: Illegal entry path "${bo.removedMaskEntry}".`);
        }
        const file = loadedZip.file(bo.removedMaskEntry);
        if (!file) {
          throw new Error(`Invalid .stickerstudio archive: missing backing mask entry "${bo.removedMaskEntry}".`);
        }
        const maskBytes = await file.async('uint8array');
        if (maskBytes.length > maxEntryBytes) {
          throw new Error(`Per-entry size budget exceeded: ${bo.removedMaskEntry} exceeds ${maxEntryBytes / 1024 / 1024}MB limit.`);
        }
        uncompressedTotalBytes += maskBytes.length;
        enforceCumulativeBudget(uncompressedTotalBytes);
        if (bo.bounds && maskBytes.length !== bo.bounds.width * bo.bounds.height) {
          throw new Error(`Corrupted backing mask: ${bo.removedMaskEntry} length (${maskBytes.length}) does not match bounds dimensions (${bo.bounds.width * bo.bounds.height}).`);
        }
        bo.removedMask = new Uint8Array(maskBytes);
      } else if (bo.removedMask && !(bo.removedMask instanceof Uint8Array)) {
        bo.removedMask = new Uint8Array(Object.values(bo.removedMask).map(Number));
      }
    }
  }

  // 12. Final cumulative limit & expansion ratio enforcement before accepting candidate project
  enforceCumulativeBudget(uncompressedTotalBytes);

  // Transactionally validated and ready for hydration
  return {
    metadata: serialized.metadata,
    sourceImage,
    components: serialized.components || [],
    groups: serialized.groups || [],
    holes: serialized.holes || [],
    alphaMask,
    labelMap
  };
}
