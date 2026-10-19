/**
 * Face detection service using Google MediaPipe BlazeFace (Short Range).
 * Runs 100% locally on-device via WebAssembly/CPU.
 * Strictly Apache 2.0 compliant.
 */

import { FaceLandmarks } from '../cartoon/types';

let faceDetectorPromise: Promise<any> | null = null;

export async function getMediaPipeFaceDetector(): Promise<any> {
  if (faceDetectorPromise) return faceDetectorPromise;

  faceDetectorPromise = (async () => {
    const bundlePath = '/mediapipe/vision_bundle.mjs';
    // @ts-ignore
    const mp = await import(/* @vite-ignore */ bundlePath);
    const FaceDetector = mp.FaceDetector;
    const FilesetResolver = mp.FilesetResolver;

    const vision = await FilesetResolver.forVisionTasks('/mediapipe');
    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/blaze_face_short_range.tflite',
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.30,
      minSuppressionThreshold: 0.30,
    });

    return detector;
  })();

  return faceDetectorPromise;
}

/**
 * Detects the primary face in an image and extracts normalized/pixel landmarks:
 * eye positions, nose, mouth, ears, eye-line angle, and eye distance.
 */
export async function detectPrimaryFace(
  source: HTMLCanvasElement | HTMLImageElement | ImageData
): Promise<FaceLandmarks | null> {
  let detector: any;
  try {
    detector = await getMediaPipeFaceDetector();
  } catch (err) {
    console.warn('[FaceDetector] Could not initialize MediaPipe FaceDetector:', err);
    return null;
  }

  // Determine width and height
  let width = 0;
  let height = 0;
  let canvasSource: HTMLCanvasElement | HTMLImageElement = source as any;

  if (source instanceof ImageData) {
    width = source.width;
    height = source.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.putImageData(source, 0, 0);
    canvasSource = canvas;
  } else if ('naturalWidth' in source && source.naturalWidth) {
    width = source.naturalWidth;
    height = source.naturalHeight;
  } else {
    width = source.width;
    height = source.height;
  }

  if (width <= 0 || height <= 0) return null;

  try {
    const result = detector.detect(canvasSource);
    const detections = result?.detections;
    if (!detections || detections.length === 0) {
      return null;
    }

    // Select the largest face by bounding box area
    let primary = detections[0];
    let maxArea = (primary.boundingBox?.width ?? 0) * (primary.boundingBox?.height ?? 0);

    for (let i = 1; i < detections.length; i++) {
      const d = detections[i];
      const area = (d.boundingBox?.width ?? 0) * (d.boundingBox?.height ?? 0);
      if (area > maxArea) {
        maxArea = area;
        primary = d;
      }
    }

    const bbox = primary.boundingBox ?? { originX: 0, originY: 0, width, height, angle: 0 };
    const kps = primary.keypoints ?? [];

    const toAbs = (pt: { x: number; y: number } | undefined) => {
      if (!pt) return { x: width * 0.5, y: height * 0.5 };
      const x = pt.x <= 1.0 ? pt.x * width : pt.x;
      const y = pt.y <= 1.0 ? pt.y * height : pt.y;
      return { x, y };
    };

    // BlazeFace standard keypoints:
    // 0: right eye (from subject view)
    // 1: left eye (from subject view)
    // 2: nose tip
    // 3: mouth center
    // 4: right ear tragion
    // 5: left ear tragion
    const rawKp0 = toAbs(kps[0]);
    const rawKp1 = toAbs(kps[1]);

    // Order eyes left-to-right on screen (smaller X is screen-left)
    const screenLeftEye = rawKp0.x <= rawKp1.x ? rawKp0 : rawKp1;
    const screenRightEye = rawKp0.x <= rawKp1.x ? rawKp1 : rawKp0;

    const eyeMidpoint = {
      x: (screenLeftEye.x + screenRightEye.x) / 2,
      y: (screenLeftEye.y + screenRightEye.y) / 2,
    };

    const eyeDistance = Math.hypot(
      screenRightEye.x - screenLeftEye.x,
      screenRightEye.y - screenLeftEye.y
    );

    // Angle of eye line relative to horizontal
    const eyeAngleDegrees =
      Math.atan2(screenRightEye.y - screenLeftEye.y, screenRightEye.x - screenLeftEye.x) *
      (180 / Math.PI);

    const noseTip = kps[2] ? toAbs(kps[2]) : undefined;
    const mouthCenter = kps[3] ? toAbs(kps[3]) : undefined;

    // Estimate anatomical chin landmark along vertical facial axis
    let estimatedChin: { x: number; y: number };
    if (noseTip && mouthCenter) {
      // Vector from nose tip to mouth center reflects vertical scale and tilt
      const vX = mouthCenter.x - noseTip.x;
      const vY = mouthCenter.y - noseTip.y;
      // In human cephalometrics, chin tip is approx 0.75x of nose-to-mouth distance below mouth
      estimatedChin = {
        x: Math.round(mouthCenter.x + vX * 0.75),
        y: Math.round(mouthCenter.y + vY * 0.75),
      };
    } else {
      // Fallback to bounding box base centered on eye midpoint
      estimatedChin = {
        x: Math.round(eyeMidpoint.x),
        y: Math.round(bbox.originY + bbox.height),
      };
    }

    return {
      boundingBox: {
        originX: Math.max(0, Math.round(bbox.originX)),
        originY: Math.max(0, Math.round(bbox.originY)),
        width: Math.min(width, Math.round(bbox.width)),
        height: Math.min(height, Math.round(bbox.height)),
        angle: bbox.angle ?? 0,
      },
      leftEye: screenLeftEye,
      rightEye: screenRightEye,
      noseTip,
      mouthCenter,
      leftEarTragion: kps[4] ? toAbs(kps[4]) : undefined,
      rightEarTragion: kps[5] ? toAbs(kps[5]) : undefined,
      eyeMidpoint,
      eyeDistance: Math.max(1, eyeDistance),
      eyeAngleDegrees,
      estimatedChin,
    };
  } catch (err) {
    console.warn('[FaceDetector] Face detection error:', err);
    return null;
  }
}
