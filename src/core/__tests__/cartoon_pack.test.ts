import { describe, it, expect } from 'vitest';
import {
  CARTOON_REACTIONS_PACK,
  ALL_CARTOON_TEMPLATES,
  HI_WAVING_TEMPLATE,
  LOVE_YOU_TEMPLATE,
  LOL_TEMPLATE,
  OH_NO_TEMPLATE,
  ANGRY_TEMPLATE,
  SLEEPY_TEMPLATE,
  THANK_YOU_TEMPLATE,
  LETS_GO_TEMPLATE,
  WOW_TEMPLATE,
  THINKING_TEMPLATE,
  YUMMY_TEMPLATE,
  BYE_BYE_TEMPLATE,
} from '../../cartoon/templates';
import { computeInitialHeadPlacement } from '../cartoonCompositor';
import { ExtractedHeadResult, CartoonProjectData, HeadTransform } from '../../cartoon/types';
import { createZip, ZipEntry } from '../zip';
import { getPackStickerFilename } from '../../state/useCartoonMode';

describe('Sticker Studio V1.5 — Personalized Reactions Pack (12 Stickers)', () => {
  // Mock extracted photographic head with realistic facial landmarks
  const mockHead: ExtractedHeadResult = {
    canvas: { width: 360, height: 420 } as any,
    width: 360,
    height: 420,
    cropBounds: { x: 120, y: 80, width: 360, height: 420 },
    alphaMask: new Uint8Array(360 * 420).fill(255),
    landmarks: {
      boundingBox: { originX: 150, originY: 100, width: 300, height: 350 },
      leftEye: { x: 230, y: 220 },
      rightEye: { x: 370, y: 220 },
      noseTip: { x: 300, y: 270 },
      mouthCenter: { x: 300, y: 340 },
      eyeMidpoint: { x: 300, y: 220 },
      eyeDistance: 140,
      eyeAngleDegrees: 0,
      estimatedChin: { x: 300, y: 410 },
    },
  };

  it('contains exactly 12 unique, valid cartoon reaction templates', () => {
    expect(CARTOON_REACTIONS_PACK).toHaveLength(12);

    const ids = new Set<string>();
    const names = new Set<string>();

    for (const tpl of CARTOON_REACTIONS_PACK) {
      expect(tpl.id).toBeTruthy();
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);

      expect(tpl.name).toBeTruthy();
      expect(names.has(tpl.name)).toBe(false);
      names.add(tpl.name);

      expect(tpl.canvas.width).toBe(1024);
      expect(tpl.canvas.height).toBe(1024);

      expect(tpl.layers.backSvg).toContain('<svg');
      expect(tpl.layers.frontSvg).toContain('<svg');

      // Head slot parameters
      expect(tpl.headSlot.centerX).toBeGreaterThan(0.2);
      expect(tpl.headSlot.centerX).toBeLessThan(0.8);
      expect(tpl.headSlot.centerY).toBeGreaterThan(0.2);
      expect(tpl.headSlot.centerY).toBeLessThan(0.8);
      expect(tpl.headSlot.targetWidth).toBeGreaterThan(0.2);
      expect(tpl.headSlot.defaultScale).toBeGreaterThan(0.5);
    }
  });

  it('registers all 12 templates in ALL_CARTOON_TEMPLATES lookup map', () => {
    expect(Object.keys(ALL_CARTOON_TEMPLATES)).toHaveLength(12);
    for (const tpl of CARTOON_REACTIONS_PACK) {
      expect(ALL_CARTOON_TEMPLATES[tpl.id]).toBe(tpl);
    }
  });

  it('computes stable, valid initial head placements for all 12 templates', () => {
    for (const tpl of CARTOON_REACTIONS_PACK) {
      const transform = computeInitialHeadPlacement(tpl, mockHead);

      expect(transform.centerX).toBeGreaterThan(200);
      expect(transform.centerX).toBeLessThan(850);
      expect(transform.centerY).toBeGreaterThan(200);
      expect(transform.centerY).toBeLessThan(850);

      expect(transform.scale).toBeGreaterThan(0.4);
      expect(transform.scale).toBeLessThan(1.8);
      expect(Number.isNaN(transform.scale)).toBe(false);
      expect(Number.isNaN(transform.rotationDegrees)).toBe(false);

      expect(transform.autoPlacement).toBeDefined();
      expect(transform.autoPlacement.centerX).toBe(transform.centerX);
      expect(transform.autoPlacement.centerY).toBe(transform.centerY);
    }
  });

  it('maintains strict transform isolation across individual templates', () => {
    const transformHi = computeInitialHeadPlacement(HI_WAVING_TEMPLATE, mockHead);
    const transformLove = computeInitialHeadPlacement(LOVE_YOU_TEMPLATE, mockHead);
    const transformLol = computeInitialHeadPlacement(LOL_TEMPLATE, mockHead);

    const packTransforms: Record<string, HeadTransform> = {
      [HI_WAVING_TEMPLATE.id]: { ...transformHi },
      [LOVE_YOU_TEMPLATE.id]: { ...transformLove },
      [LOL_TEMPLATE.id]: { ...transformLol },
    };

    // User tunes LOVE YOU specifically (e.g. scales up and rotates)
    packTransforms[LOVE_YOU_TEMPLATE.id].scale = 1.35;
    packTransforms[LOVE_YOU_TEMPLATE.id].rotationDegrees = 7.5;

    // Check that HI and LOL remain untouched
    expect(packTransforms[HI_WAVING_TEMPLATE.id].scale).toBe(transformHi.scale);
    expect(packTransforms[HI_WAVING_TEMPLATE.id].rotationDegrees).toBe(transformHi.rotationDegrees);

    expect(packTransforms[LOL_TEMPLATE.id].scale).toBe(transformLol.scale);
    expect(packTransforms[LOL_TEMPLATE.id].rotationDegrees).toBe(transformLol.rotationDegrees);

    expect(packTransforms[LOVE_YOU_TEMPLATE.id].scale).toBe(1.35);
    expect(packTransforms[LOVE_YOU_TEMPLATE.id].rotationDegrees).toBe(7.5);
  });

  it('generates predictable, 2-digit indexed filenames for all 12 stickers', () => {
    const filenames = CARTOON_REACTIONS_PACK.map((tpl, i) => getPackStickerFilename(tpl, i));

    expect(filenames).toEqual([
      '01_Hi.png',
      '02_Love_You.png',
      '03_Lol.png',
      '04_Oh_No.png',
      '05_Angry.png',
      '06_Sleepy.png',
      '07_Thank_You.png',
      '08_Lets_Go.png',
      '09_Wow.png',
      '10_Thinking.png',
      '11_Yummy.png',
      '12_Bye_Bye.png',
    ]);
  });

  it('creates valid ZIP archive containing artwork_only, white_backed folders and manifest.json', () => {
    const dummyPngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header signature
    const zipEntries: ZipEntry[] = [];
    const manifestStickers: any[] = [];

    for (let i = 0; i < CARTOON_REACTIONS_PACK.length; i++) {
      const tpl = CARTOON_REACTIONS_PACK[i];
      const filename = getPackStickerFilename(tpl, i);

      zipEntries.push({
        name: `artwork_only/${filename}`,
        data: dummyPngBytes,
      });

      zipEntries.push({
        name: `white_backed/${filename}`,
        data: dummyPngBytes,
      });

      manifestStickers.push({
        index: i + 1,
        id: tpl.id,
        name: tpl.name,
        artworkFile: `artwork_only/${filename}`,
        stickerFile: `white_backed/${filename}`,
        canvasWidth: 640,
        canvasHeight: 720,
      });
    }

    const manifest = {
      packName: 'Sticker Studio Personalized Reactions Pack',
      version: '1.5.0',
      totalStickers: 12,
      stickers: manifestStickers,
    };

    zipEntries.push({
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });

    // 12 artwork + 12 white-backed + 1 manifest = 25 entries
    expect(zipEntries).toHaveLength(25);

    const zipBlob = createZip(zipEntries);
    expect(zipBlob.size).toBeGreaterThan(1000);
    expect(zipBlob.type).toBe('application/zip');
  });

  it('serializes and deserializes Version 4 project data with per-template transforms', () => {
    const initialTransforms: Record<string, HeadTransform> = {};
    for (const tpl of CARTOON_REACTIONS_PACK) {
      initialTransforms[tpl.id] = computeInitialHeadPlacement(tpl, mockHead);
    }

    // Override one
    initialTransforms[LOVE_YOU_TEMPLATE.id].scale = 1.15;
    initialTransforms[LOVE_YOU_TEMPLATE.id].rotationDegrees = 5;

    const v4Project: CartoonProjectData = {
      version: 4,
      appMode: 'cartoon',
      templateId: LOVE_YOU_TEMPLATE.id,
      selfieDataUrl: 'data:image/jpeg;base64,/9j/fake',
      headCropBounds: mockHead.cropBounds,
      headTransform: initialTransforms[LOVE_YOU_TEMPLATE.id],
      borderThickness: 28,
      smoothOutlineLevel: 2,
      alphaSettings: { smoothness: 2, feather: 0.5 },
      templateTransforms: initialTransforms,
      templateBorderThicknesses: { [LOVE_YOU_TEMPLATE.id]: 32 },
      selectedTemplateIds: [LOVE_YOU_TEMPLATE.id, HI_WAVING_TEMPLATE.id],
      landmarks: mockHead.landmarks,
      dateModified: new Date().toISOString(),
    };

    const serialized = JSON.stringify(v4Project);
    const deserialized: CartoonProjectData = JSON.parse(serialized);

    expect(deserialized.version).toBe(4);
    expect(deserialized.templateId).toBe('love-you-02');
    expect(deserialized.templateTransforms).toBeDefined();
    expect(deserialized.templateTransforms!['love-you-02'].scale).toBe(1.15);
    expect(deserialized.templateTransforms!['love-you-02'].rotationDegrees).toBe(5);
    expect(deserialized.selectedTemplateIds).toEqual(['love-you-02', 'hi-waving-01']);
    expect(deserialized.templateBorderThicknesses!['love-you-02']).toBe(32);
  });
});
