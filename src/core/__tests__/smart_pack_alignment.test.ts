import { describe, it, expect } from 'vitest';
import {
  getPhotographicChinCropAnchor,
  computeEffectiveHeadTransform,
  computeInitialHeadPlacement,
  convertLegacyTransformToIndividualAlignment,
} from '../cartoonCompositor';
import { CARTOON_REACTIONS_PACK, HI_WAVING_TEMPLATE } from '../../cartoon/templates';
import {
  ExtractedHeadResult,
  HeadTransform,
  GlobalHeadAlignment,
  IndividualHeadAlignment,
  CartoonProjectData,
} from '../../cartoon/types';

describe('V1.6 Smart Pack-Wide Head Alignment & Chin Anchoring', () => {
  // Mock extracted photographic head
  const mockHead: ExtractedHeadResult = {
    canvas: { width: 400, height: 400 } as any,
    frontCanvas: { width: 400, height: 400 } as any,
    rearHairCanvas: undefined,
    width: 400,
    height: 400,
    cropBounds: { x: 100, y: 50, width: 400, height: 400 },
    alphaMask: new Uint8Array(400 * 400),
    landmarks: {
      boundingBox: { originX: 100, originY: 50, width: 200, height: 260 },
      leftEye: { x: 150, y: 150 },
      rightEye: { x: 250, y: 150 },
      eyeMidpoint: { x: 200, y: 150 },
      eyeDistance: 100,
      eyeAngleDegrees: 0,
      noseTip: { x: 200, y: 220 },
      mouthCenter: { x: 200, y: 280 },
      estimatedChin: { x: 200, y: 340 },
    },
  };

  it('1. Extracts photographic chin crop anchor correctly with landmarks and with calibration', () => {
    const naturalChin = getPhotographicChinCropAnchor(mockHead);
    expect(naturalChin.x).toBe(100); // 200 - cropBounds.x(100)
    expect(naturalChin.y).toBe(290); // 340 - cropBounds.y(50)

    const calibrated = getPhotographicChinCropAnchor(mockHead, { x: 180, y: 310 });
    expect(calibrated.x).toBe(180);
    expect(calibrated.y).toBe(310);
  });

  it('2. Neutral global and individual alignment reproduces exact baseline autoPlacement', () => {
    for (const tpl of CARTOON_REACTIONS_PACK) {
      const base = computeInitialHeadPlacement(tpl, mockHead);
      const effective = computeEffectiveHeadTransform(
        tpl,
        mockHead,
        base,
        { scaleMultiplier: 1.0, rotationDelta: 0, offsetX: 0, offsetY: 0 },
        null,
        null
      );

      expect(effective.scale).toBe(base.scale);
      expect(effective.rotationDegrees).toBe(base.rotationDegrees);
      expect(effective.centerX).toBe(base.centerX);
      expect(effective.centerY).toBe(base.centerY);
      expect(effective.hairBehindBody).toBe(base.hairBehindBody);
    }
  });

  it('3. Global scale multiplier scales all 12 templates multiplicatively without detaching chin', () => {
    const gAlign: GlobalHeadAlignment = {
      scaleMultiplier: 1.15,
      rotationDelta: 0,
      offsetX: 0,
      offsetY: 0,
    };

    const chinCrop = getPhotographicChinCropAnchor(mockHead);
    const chinDx = chinCrop.x - mockHead.width * 0.5;
    const chinDy = chinCrop.y - mockHead.height * 0.5;

    for (const tpl of CARTOON_REACTIONS_PACK) {
      const base = computeInitialHeadPlacement(tpl, mockHead);
      const effective = computeEffectiveHeadTransform(tpl, mockHead, base, gAlign);

      expect(effective.scale).toBe(parseFloat((base.scale * 1.15).toFixed(4)));

      // Calculate where the chin lands on the canvas
      const rad = (effective.rotationDegrees * Math.PI) / 180;
      const rotChinX = (chinDx * Math.cos(rad) - chinDy * Math.sin(rad)) * effective.scale;
      const rotChinY = (chinDx * Math.sin(rad) + chinDy * Math.cos(rad)) * effective.scale;

      const canvasChinX = effective.centerX + rotChinX;
      const canvasChinY = effective.centerY + rotChinY;

      const targetCollarX = tpl.headSlot.centerX * tpl.canvas.width;
      const targetCollarY = (tpl.headSlot.targetChinY ?? 0.50) * tpl.canvas.height;

      // Chin must remain locked to collar anchor (within 1px integer rounding)
      expect(Math.abs(canvasChinX - targetCollarX)).toBeLessThanOrEqual(1.0);
      expect(Math.abs(canvasChinY - targetCollarY)).toBeLessThanOrEqual(1.0);
    }
  });

  it('4. Global rotation delta rotates all 12 templates additively around chin anchor', () => {
    const gAlign: GlobalHeadAlignment = {
      scaleMultiplier: 1.0,
      rotationDelta: 5.0,
      offsetX: 0,
      offsetY: 0,
    };

    const chinCrop = getPhotographicChinCropAnchor(mockHead);
    const chinDx = chinCrop.x - mockHead.width * 0.5;
    const chinDy = chinCrop.y - mockHead.height * 0.5;

    for (const tpl of CARTOON_REACTIONS_PACK) {
      const base = computeInitialHeadPlacement(tpl, mockHead);
      const effective = computeEffectiveHeadTransform(tpl, mockHead, base, gAlign);

      expect(effective.rotationDegrees).toBe(parseFloat((base.rotationDegrees + 5.0).toFixed(2)));

      const rad = (effective.rotationDegrees * Math.PI) / 180;
      const rotChinX = (chinDx * Math.cos(rad) - chinDy * Math.sin(rad)) * effective.scale;
      const rotChinY = (chinDx * Math.sin(rad) + chinDy * Math.cos(rad)) * effective.scale;

      const canvasChinX = effective.centerX + rotChinX;
      const canvasChinY = effective.centerY + rotChinY;

      const targetCollarX = tpl.headSlot.centerX * tpl.canvas.width;
      const targetCollarY = (tpl.headSlot.targetChinY ?? 0.50) * tpl.canvas.height;

      expect(Math.abs(canvasChinX - targetCollarX)).toBeLessThanOrEqual(1.0);
      expect(Math.abs(canvasChinY - targetCollarY)).toBeLessThanOrEqual(1.0);
    }
  });

  it('5. Global normalized offsets translate proportionally to template face height', () => {
    const gAlign: GlobalHeadAlignment = {
      scaleMultiplier: 1.0,
      rotationDelta: 0,
      offsetX: 0.05,
      offsetY: 0.10,
    };

    for (const tpl of CARTOON_REACTIONS_PACK) {
      const base = computeInitialHeadPlacement(tpl, mockHead);
      const effective = computeEffectiveHeadTransform(tpl, mockHead, base, gAlign);

      const faceH = (tpl.headSlot.targetFaceH ?? 0.254) * tpl.canvas.height;
      const expectedShiftX = Math.round(0.05 * faceH);
      const expectedShiftY = Math.round(0.10 * faceH);

      expect(Math.abs((effective.centerX - base.centerX) - expectedShiftX)).toBeLessThanOrEqual(1.0);
      expect(Math.abs((effective.centerY - base.centerY) - expectedShiftY)).toBeLessThanOrEqual(1.0);
    }
  });

  it('6. Individual fine-tuning overrides apply on top of global alignment for specific template only', () => {
    const gAlign: GlobalHeadAlignment = {
      scaleMultiplier: 1.10,
      rotationDelta: 3.0,
      offsetX: 0.02,
      offsetY: 0.02,
    };

    const sleepyTpl = CARTOON_REACTIONS_PACK.find((t) => t.id === 'sleepy-06')!;
    const hiTpl = CARTOON_REACTIONS_PACK.find((t) => t.id === 'hi-waving-01')!;

    const sleepyIndividual: IndividualHeadAlignment = {
      scaleMultiplier: 0.95,
      rotationDelta: -4.0,
      offsetX: 0.01,
      offsetY: -0.01,
    };

    const baseSleepy = computeInitialHeadPlacement(sleepyTpl, mockHead);
    const effectiveSleepy = computeEffectiveHeadTransform(
      sleepyTpl,
      mockHead,
      baseSleepy,
      gAlign,
      sleepyIndividual
    );

    const baseHi = computeInitialHeadPlacement(hiTpl, mockHead);
    const effectiveHi = computeEffectiveHeadTransform(hiTpl, mockHead, baseHi, gAlign, null);

    // Sleepy combines both global and individual:
    // Scale: base * 1.10 * 0.95 = base * 1.045
    expect(effectiveSleepy.scale).toBe(parseFloat((baseSleepy.scale * 1.10 * 0.95).toFixed(4)));
    // Rotation: base + 3.0 - 4.0 = base - 1.0
    expect(effectiveSleepy.rotationDegrees).toBe(parseFloat((baseSleepy.rotationDegrees - 1.0).toFixed(2)));

    // Hi template receives only global alignment:
    expect(effectiveHi.scale).toBe(parseFloat((baseHi.scale * 1.10).toFixed(4)));
    expect(effectiveHi.rotationDegrees).toBe(parseFloat((baseHi.rotationDegrees + 3.0).toFixed(2)));
  });

  it('7. Calibrating chin updates pivot point and re-anchors collar correctly', () => {
    const calibratedChin = { x: 210, y: 320 };
    const base = computeInitialHeadPlacement(HI_WAVING_TEMPLATE, mockHead, calibratedChin);
    const effective = computeEffectiveHeadTransform(
      HI_WAVING_TEMPLATE,
      mockHead,
      base,
      { scaleMultiplier: 1.2, rotationDelta: 5, offsetX: 0, offsetY: 0 },
      null,
      calibratedChin
    );

    const chinDx = calibratedChin.x - mockHead.width * 0.5;
    const chinDy = calibratedChin.y - mockHead.height * 0.5;

    const rad = (effective.rotationDegrees * Math.PI) / 180;
    const rotChinX = (chinDx * Math.cos(rad) - chinDy * Math.sin(rad)) * effective.scale;
    const rotChinY = (chinDx * Math.sin(rad) + chinDy * Math.cos(rad)) * effective.scale;

    const canvasChinX = effective.centerX + rotChinX;
    const canvasChinY = effective.centerY + rotChinY;

    const targetCollarX = HI_WAVING_TEMPLATE.headSlot.centerX * HI_WAVING_TEMPLATE.canvas.width;
    const targetCollarY = (HI_WAVING_TEMPLATE.headSlot.targetChinY ?? 0.50) * HI_WAVING_TEMPLATE.canvas.height;

    expect(Math.abs(canvasChinX - targetCollarX)).toBeLessThanOrEqual(1.0);
    expect(Math.abs(canvasChinY - targetCollarY)).toBeLessThanOrEqual(1.0);
  });

  it('8. Version 5 Project Serialization and Deserialization preserves alignment state', () => {
    const gAlign: GlobalHeadAlignment = {
      scaleMultiplier: 1.12,
      rotationDelta: 4.5,
      offsetX: -0.03,
      offsetY: 0.05,
    };
    const iAligns: Record<string, IndividualHeadAlignment> = {
      'butterfern-06-sleepy': {
        scaleMultiplier: 0.96,
        rotationDelta: -2.0,
        offsetX: 0.01,
        offsetY: -0.02,
      },
    };
    const calChin = { x: 195, y: 335 };

    const project: CartoonProjectData = {
      version: 5,
      appMode: 'cartoon',
      templateId: HI_WAVING_TEMPLATE.id,
      selfieDataUrl: 'data:image/jpeg;base64,mock',
      headCropBounds: { x: 100, y: 50, width: 400, height: 400 },
      headTransform: computeEffectiveHeadTransform(
        HI_WAVING_TEMPLATE,
        mockHead,
        computeInitialHeadPlacement(HI_WAVING_TEMPLATE, mockHead, calChin),
        gAlign,
        null,
        calChin
      ),
      borderThickness: 24,
      smoothOutlineLevel: 2,
      alphaSettings: { smoothness: 2, feather: 0.5 },
      headPngDataUrl: 'data:image/png;base64,mock',
      alphaMaskBase64: 'mockMask',
      landmarks: mockHead.landmarks,
      globalHeadAlignment: gAlign,
      individualHeadAlignments: iAligns,
      calibratedChin: calChin,
      templateTransforms: {},
      templateBorderThicknesses: { 'butterfern-02-love-you': 32 },
      selectedTemplateIds: ['butterfern-01-hi', 'butterfern-06-sleepy'],
      dateModified: new Date().toISOString(),
    };

    const serialized = JSON.stringify(project);
    const restored: CartoonProjectData = JSON.parse(serialized);

    expect(restored.version).toBe(5);
    expect(restored.globalHeadAlignment).toEqual(gAlign);
    expect(restored.individualHeadAlignments).toEqual(iAligns);
    expect(restored.calibratedChin).toEqual(calChin);
    expect(restored.templateBorderThicknesses).toEqual({ 'butterfern-02-love-you': 32 });
  });

  it('9. Backward compatibility with Version 4 and Version 3 projects', () => {
    // Version 4 archive without globalHeadAlignment
    const legacyV4Json = JSON.stringify({
      version: 4,
      appMode: 'cartoon',
      templateId: 'butterfern-01-hi',
      selfieDataUrl: 'data:image/jpeg;base64,mock',
      headCropBounds: { x: 0, y: 0, width: 400, height: 400 },
      headTransform: { centerX: 512, centerY: 350, scale: 0.8, rotationDegrees: 0, hairBehindBody: true },
      borderThickness: 24,
      templateTransforms: {
        'butterfern-01-hi': { centerX: 512, centerY: 350, scale: 0.8, rotationDegrees: 0, hairBehindBody: true },
      },
    });

    const parsed: CartoonProjectData = JSON.parse(legacyV4Json);
    const defaultGlobal = parsed.globalHeadAlignment || {
      scaleMultiplier: 1.0,
      rotationDelta: 0,
      offsetX: 0,
      offsetY: 0,
    };
    const defaultIndividual = parsed.individualHeadAlignments || {};
    const defaultChin = parsed.calibratedChin || null;

    expect(defaultGlobal.scaleMultiplier).toBe(1.0);
    expect(defaultGlobal.rotationDelta).toBe(0);
    expect(Object.keys(defaultIndividual)).toHaveLength(0);
    expect(defaultChin).toBeNull();
  });

  it('10. Converts legacy manual transform to IndividualHeadAlignment and reproduces bitwise appearance', () => {
    for (const tpl of CARTOON_REACTIONS_PACK) {
      const auto = computeInitialHeadPlacement(tpl, mockHead);
      // Create a heavily customized legacy transform (scale, tilt, drag, hair layer)
      const customLegacy: HeadTransform = {
        centerX: auto.centerX + 35,
        centerY: auto.centerY - 28,
        scale: parseFloat((auto.scale * 1.25).toFixed(4)),
        rotationDegrees: parseFloat((auto.rotationDegrees - 7.5).toFixed(2)),
        hairBehindBody: !auto.hairBehindBody,
        autoPlacement: auto,
      };

      const converted = convertLegacyTransformToIndividualAlignment(tpl, mockHead, customLegacy);
      expect(converted.hairBehindBody).toBe(customLegacy.hairBehindBody);

      // Evaluating with neutral global alignment must reproduce exact legacy values bitwise
      const reproduced = computeEffectiveHeadTransform(
        tpl,
        mockHead,
        auto,
        { scaleMultiplier: 1.0, rotationDelta: 0, offsetX: 0, offsetY: 0 },
        converted
      );

      expect(reproduced.scale).toBe(customLegacy.scale);
      expect(reproduced.rotationDegrees).toBe(customLegacy.rotationDegrees);
      expect(reproduced.centerX).toBe(customLegacy.centerX);
      expect(reproduced.centerY).toBe(customLegacy.centerY);
      expect(reproduced.hairBehindBody).toBe(customLegacy.hairBehindBody);
    }
  });

  it('11. Global adjustments compound on top of legacy manual placements and restore without drift', () => {
    const tpl = HI_WAVING_TEMPLATE;
    const auto = computeInitialHeadPlacement(tpl, mockHead);
    const legacyTransform: HeadTransform = {
      centerX: auto.centerX - 15,
      centerY: auto.centerY + 20,
      scale: 1.2,
      rotationDegrees: 5,
      hairBehindBody: false,
      autoPlacement: auto,
    };

    const indiv = convertLegacyTransformToIndividualAlignment(tpl, mockHead, legacyTransform);

    // Compound global adjustments on top
    const gAlign: GlobalHeadAlignment = {
      scaleMultiplier: 1.1,
      rotationDelta: 4,
      offsetX: 0.05,
      offsetY: -0.02,
    };

    const compounded = computeEffectiveHeadTransform(tpl, mockHead, auto, gAlign, indiv);
    expect(compounded.scale).toBe(parseFloat((legacyTransform.scale * 1.1).toFixed(4)));
    expect(compounded.rotationDegrees).toBe(parseFloat((legacyTransform.rotationDegrees + 4).toFixed(2)));
    expect(compounded.hairBehindBody).toBe(false);

    // Reset global alignment back to neutral
    const neutralGlobal: GlobalHeadAlignment = { scaleMultiplier: 1.0, rotationDelta: 0, offsetX: 0, offsetY: 0 };
    const restored = computeEffectiveHeadTransform(tpl, mockHead, auto, neutralGlobal, indiv);

    expect(restored.scale).toBe(legacyTransform.scale);
    expect(restored.rotationDegrees).toBe(legacyTransform.rotationDegrees);
    expect(restored.centerX).toBe(legacyTransform.centerX);
    expect(restored.centerY).toBe(legacyTransform.centerY);
    expect(restored.hairBehindBody).toBe(legacyTransform.hairBehindBody);
  });

  it('12. Chin calibration coordinate mapping calculates exact image coordinates on portrait and landscape crops', () => {
    function mapClientCoordsToImage(
      clientX: number,
      clientY: number,
      rect: { left: number; top: number; width: number; height: number },
      imageW: number,
      imageH: number
    ) {
      const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return {
        x: Math.round(relX * imageW),
        y: Math.round(relY * imageH),
      };
    }

    // Portrait crop: 300w x 500h inside a 400x400 container
    // With aspect ratio matching image, rendered canvas is 240w x 400h
    const portraitRect = { left: 80, top: 0, width: 240, height: 400 };
    const pCenter = mapClientCoordsToImage(80 + 120, 200, portraitRect, 300, 500);
    expect(pCenter.x).toBe(150);
    expect(pCenter.y).toBe(250);

    const pChinTip = mapClientCoordsToImage(80 + 120, 400 * 0.85, portraitRect, 300, 500);
    expect(pChinTip.x).toBe(150);
    expect(pChinTip.y).toBe(425); // 500 * 0.85 = 425

    // Landscape crop: 500w x 300h inside a 400x400 container
    // Rendered canvas is 400w x 240h
    const landscapeRect = { left: 0, top: 80, width: 400, height: 240 };
    const lCenter = mapClientCoordsToImage(200, 80 + 120, landscapeRect, 500, 300);
    expect(lCenter.x).toBe(250);
    expect(lCenter.y).toBe(150);

    const lChinTip = mapClientCoordsToImage(200, 80 + 240 * 0.85, landscapeRect, 500, 300);
    expect(lChinTip.x).toBe(250);
    expect(lChinTip.y).toBe(255); // 300 * 0.85 = 255
  });
});
