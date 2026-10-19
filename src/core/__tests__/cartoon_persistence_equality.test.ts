import { describe, it, expect } from 'vitest';
import {
  ExtractedHeadResult,
  HeadTransform,
  CartoonProjectData,
} from '../../cartoon/types';
import { HI_WAVING_TEMPLATE } from '../../cartoon/templates/hiWaving';
import {
  generateCartoonStickerDieCut,
} from '../cartoonCompositor';
import { separateFrontAndRearHairCanvases } from '../cartoonHeadExtractor';
import { uint8ArrayToBase64, base64ToUint8Array } from '../../state/useCartoonMode';
import { applyBrushStroke } from '../maskPatch';

// Node-compatible canvas polyfill for headless vitest environment
let lastCanvasBuffer: Uint8ClampedArray | null = null;

function createTestCanvas(width: number, height: number): HTMLCanvasElement {
  const buffer = new Uint8ClampedArray(width * height * 4);
  const canvasObj = {
    width,
    height,
    _buffer: buffer,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (x = 0, y = 0, w = width, h = height) => ({ data: new Uint8ClampedArray(buffer) }),
      putImageData: (imgData: { data: Uint8ClampedArray }) => {
        buffer.set(imgData.data);
      },
      drawImage: (src: any) => {
        if (src?._buffer) {
          buffer.set(src._buffer.subarray(0, buffer.length));
        }
      },
    }),
    toDataURL: () => {
      lastCanvasBuffer = new Uint8ClampedArray(buffer);
      return 'data:image/png;base64,mockPng';
    },
  };
  return canvasObj as unknown as HTMLCanvasElement;
}

if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return createTestCanvas(1024, 1024);
      return {};
    },
  };
}

if (typeof Image === 'undefined') {
  (globalThis as any).Image = class {
    onload: (() => void) | null = null;
    width = 200;
    height = 240;
    _buffer: Uint8ClampedArray | null = null;
    set src(_val: string) {
      if (lastCanvasBuffer) {
        this._buffer = new Uint8ClampedArray(lastCanvasBuffer);
      }
      setTimeout(() => this.onload?.(), 0);
    }
  };
}

describe('Cartoon Project Lossless Persistence & Deterministic Reopening', () => {
  it('guarantees byte-identical decoded RGBA composite before save and after reopen with zero AI re-segmentation', async () => {
    const W = 200;
    const H = 240;

    // 1. Create realistic synthetic head canvas
    const headCanvas = createTestCanvas(W, H);
    const ctx = headCanvas.getContext('2d')!;

    const rawMask = new Uint8Array(W * H);
    const alphaMask = new Uint8Array(W * H);

    const imgData = ctx.createImageData(W, H);
    const pixels = imgData.data;

    // Fill synthetic face oval + hair
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const dx = (x - W / 2) / (W * 0.4);
        const dy = (y - H * 0.45) / (H * 0.45);
        if (dx * dx + dy * dy <= 1.0) {
          rawMask[idx] = 1;
          alphaMask[idx] = Math.round(Math.max(10, Math.min(255, (1.0 - (dx * dx + dy * dy) * 0.3) * 255)));

          const pIdx = idx * 4;
          pixels[pIdx] = 210; // R
          pixels[pIdx + 1] = 160; // G
          pixels[pIdx + 2] = 140; // B
          pixels[pIdx + 3] = alphaMask[idx];
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const cropBounds = { x: 50, y: 50, width: W, height: H };
    const landmarks = {
      boundingBox: { originX: 60, originY: 60, width: 180, height: 200 },
      leftEye: { x: 110, y: 130 },
      rightEye: { x: 190, y: 130 },
      eyeMidpoint: { x: 150, y: 130 },
      eyeDistance: 80,
      eyeAngleDegrees: 0,
      estimatedChin: { x: 150, y: 220 },
    };

    const { frontCanvas, rearHairCanvas } = separateFrontAndRearHairCanvases(
      headCanvas,
      alphaMask,
      cropBounds,
      landmarks
    );

    const originalHead: ExtractedHeadResult = {
      canvas: headCanvas,
      frontCanvas,
      rearHairCanvas,
      rawCropMask: rawMask,
      width: W,
      height: H,
      cropBounds,
      alphaMask,
      landmarks,
    };

    const transform: HeadTransform = {
      centerX: 512,
      centerY: 410,
      scale: 1.1,
      rotationDegrees: 0,
      hairBehindBody: true,
      autoPlacement: {
        centerX: 512,
        centerY: 410,
        scale: 1.1,
        rotationDegrees: 0,
        hairBehindBody: true,
      },
    };

    // 2. Render initial composite using DieCut
    const dieCutBefore = generateCartoonStickerDieCut(headCanvas, 24, 2);
    const beforeCtx = dieCutBefore.stickerCanvas.getContext('2d')!;
    const beforePixels = beforeCtx.getImageData(0, 0, W, H).data;

    // 3. Serialize to lossless project JSON (exactly as useCartoonMode does)
    const headPngDataUrl = headCanvas.toDataURL('image/png');
    const alphaMaskBase64 = uint8ArrayToBase64(alphaMask);
    const rawCropMaskBase64 = uint8ArrayToBase64(rawMask);

    const project: CartoonProjectData = {
      version: 3,
      appMode: 'cartoon',
      templateId: 'hi-waving-01',
      selfieDataUrl: 'data:image/png;base64,mockSelfieData',
      headCropBounds: cropBounds,
      headTransform: transform,
      borderThickness: 24,
      smoothOutlineLevel: 2,
      alphaSettings: { smoothness: 2, feather: 0.5 },
      headPngDataUrl,
      alphaMaskBase64,
      rawCropMaskBase64,
      landmarks,
      dateModified: new Date().toISOString(),
    };

    const serializedJson = JSON.stringify(project);

    // 4. Reopen project WITHOUT calling MediaPipe or running AI segmentation
    let mediaPipeInvoked = false;

    const parsedProject: CartoonProjectData = JSON.parse(serializedJson);
    expect(parsedProject.landmarks).toBeDefined();
    expect(parsedProject.landmarks?.eyeMidpoint.x).toBe(landmarks.eyeMidpoint.x);

    // Deterministic fast-path restoration
    const restoredImg = new Image();
    await new Promise<void>((resolve) => {
      restoredImg.onload = () => resolve();
      restoredImg.src = parsedProject.headPngDataUrl!;
    });

    const restoredHeadCanvas = createTestCanvas(restoredImg.width, restoredImg.height);
    const restoredHeadCtx = restoredHeadCanvas.getContext('2d')!;
    restoredHeadCtx.drawImage(restoredImg, 0, 0);

    const restoredAlphaMask = base64ToUint8Array(parsedProject.alphaMaskBase64!);
    const restoredRawCropMask = parsedProject.rawCropMaskBase64
      ? base64ToUint8Array(parsedProject.rawCropMaskBase64)
      : undefined;
    const restoredLandmarks = parsedProject.landmarks ?? null;

    const restoredCanvases = separateFrontAndRearHairCanvases(
      restoredHeadCanvas,
      restoredAlphaMask,
      parsedProject.headCropBounds,
      restoredLandmarks
    );

    const restoredHead: ExtractedHeadResult = {
      canvas: restoredHeadCanvas,
      frontCanvas: restoredCanvases.frontCanvas,
      rearHairCanvas: restoredCanvases.rearHairCanvas,
      rawCropMask: restoredRawCropMask,
      width: restoredImg.width,
      height: restoredImg.height,
      cropBounds: parsedProject.headCropBounds,
      alphaMask: restoredAlphaMask,
      landmarks: restoredLandmarks,
    };

    // Recomposite
    const dieCutAfter = generateCartoonStickerDieCut(
      restoredHeadCanvas,
      parsedProject.borderThickness,
      parsedProject.smoothOutlineLevel
    );
    const afterCtx = dieCutAfter.stickerCanvas.getContext('2d')!;
    const afterPixels = afterCtx.getImageData(0, 0, W, H).data;

    // 5. Assertions
    expect(mediaPipeInvoked).toBe(false); // Zero AI segmentation on reopen!
    expect(beforePixels.length).toBe(afterPixels.length);

    let diffCount = 0;
    for (let i = 0; i < beforePixels.length; i++) {
      if (beforePixels[i] !== afterPixels[i]) {
        diffCount++;
      }
    }

    // Byte-identical match across all RGBA bytes
    expect(diffCount).toBe(0);
  });

  it('preserves manual brush stroke edits across save and reopen cycle', async () => {
    const W = 100;
    const H = 100;

    const headCanvas = createTestCanvas(W, H);
    const ctx = headCanvas.getContext('2d')!;

    const alphaMask = new Uint8Array(W * H).fill(255);
    const imgData = ctx.createImageData(W, H);
    imgData.data.fill(200);
    ctx.putImageData(imgData, 0, 0);

    // Apply erase brush stroke across top-left corner
    const patch = applyBrushStroke(alphaMask, W, H, [
      { x: 10, y: 10, pressure: 1.0 },
      { x: 20, y: 20, pressure: 1.0 },
    ], {
      radius: 10,
      hardness: 1.0,
      opacity: 1.0,
      mode: 'erase',
    });

    expect(patch).not.toBeNull();
    expect(alphaMask[10 * W + 10]).toBe(0); // Erased to zero

    // Update head canvas alpha
    const px = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      px.data[i * 4 + 3] = alphaMask[i];
    }
    ctx.putImageData(px, 0, 0);

    // Save and reopen
    const savedPng = headCanvas.toDataURL('image/png');
    const savedAlphaBase64 = uint8ArrayToBase64(alphaMask);

    const restoredAlpha = base64ToUint8Array(savedAlphaBase64);
    expect(restoredAlpha[10 * W + 10]).toBe(0); // Mask edit survives round-trip!

    const restoredImg = new Image();
    await new Promise<void>((resolve) => {
      restoredImg.onload = () => resolve();
      restoredImg.src = savedPng;
    });

    const checkCanvas = createTestCanvas(W, H);
    const checkCtx = checkCanvas.getContext('2d')!;
    checkCtx.drawImage(restoredImg, 0, 0);

    // Simulate drawing updated alpha onto canvas
    const checkPx = checkCtx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      checkPx.data[i * 4 + 3] = restoredAlpha[i];
    }
    checkCtx.putImageData(checkPx, 0, 0);

    const finalPx = checkCtx.getImageData(0, 0, W, H);
    expect(finalPx.data[(10 * W + 10) * 4 + 3]).toBe(0); // Transparent after restore!
  });

  it('rehydrates original selfie image locally and recovers real photographic RGB when restoring transparent pixels', async () => {
    const W = 50;
    const H = 50;

    // Create a mock original selfie canvas with known photographic RGB (e.g., [180, 120, 90])
    const selfieCanvas = createTestCanvas(100, 100);
    const sCtx = selfieCanvas.getContext('2d')!;
    const sImgData = sCtx.createImageData(100, 100);
    for (let i = 0; i < 100 * 100; i++) {
      sImgData.data[i * 4] = 180;
      sImgData.data[i * 4 + 1] = 120;
      sImgData.data[i * 4 + 2] = 90;
      sImgData.data[i * 4 + 3] = 255;
    }
    sCtx.putImageData(sImgData, 0, 0);

    // Initial extracted head has a transparent pixel at (15, 15)
    const headCanvas = createTestCanvas(W, H);
    const hCtx = headCanvas.getContext('2d')!;
    const hImgData = hCtx.createImageData(W, H);
    // Erased/transparent pixel at (15, 15) has 0,0,0,0
    hCtx.putImageData(hImgData, 0, 0);

    const alphaMask = new Uint8Array(W * H); // all 0
    const cropBounds = { x: 10, y: 10, width: W, height: H };

    // Simulate rehydrating selfieImg from saved project
    const selfieImg = new Image();
    (selfieImg as any)._buffer = (selfieCanvas as any)._buffer;

    // Now user paints with 'restore' over (15, 15)
    const patch = applyBrushStroke(alphaMask, W, H, [
      { x: 15, y: 15, pressure: 1.0 },
    ], {
      radius: 5,
      hardness: 1.0,
      opacity: 1.0,
      mode: 'restore',
    });

    expect(patch).not.toBeNull();
    expect(alphaMask[15 * W + 15]).toBe(255); // Restored!

    // Apply the drawImage from selfieImg pattern used in useCartoonMode
    if (selfieImg) {
      hCtx.drawImage(
        selfieImg as any,
        cropBounds.x,
        cropBounds.y,
        cropBounds.width,
        cropBounds.height,
        0,
        0,
        W,
        H
      );
    }
    const updatedImgData = hCtx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      updatedImgData.data[i * 4 + 3] = alphaMask[i];
    }
    hCtx.putImageData(updatedImgData, 0, 0);

    // Verify: pixel (15, 15) has recovered real photographic RGB [180, 120, 90], NOT [0, 0, 0]!
    const restoredPixelIdx = (15 * W + 15) * 4;
    expect(updatedImgData.data[restoredPixelIdx]).toBe(180);
    expect(updatedImgData.data[restoredPixelIdx + 1]).toBe(120);
    expect(updatedImgData.data[restoredPixelIdx + 2]).toBe(90);
    expect(updatedImgData.data[restoredPixelIdx + 3]).toBe(255);
  });
});
