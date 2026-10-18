const fs = require('fs');
const path = require('path');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const GLOBAL_DIR = path.resolve('docs/diagnosis_global_models');
const DET_DIR = path.resolve('docs/diagnosis_detector_guided');
const FIXTURES_DIR = path.resolve('.test-fixtures');

async function main() {
  console.log('Building candidate model comparison master sheet & close-ups...');

  const photos = [
    {
      id: 'father_and_daughter',
      label: 'Father & Daughter (Close-up)',
      orig: path.join(FIXTURES_DIR, 'prototype_touching_subjects.jpg'),
      selfie: path.join(GLOBAL_DIR, 'father_and_daughter/selfie/overlay.png'),
      deeplab: path.join(GLOBAL_DIR, 'father_and_daughter/deeplab/overlay.png'),
      bodypix: path.join(GLOBAL_DIR, 'father_and_daughter/bodypix/overlay.png'),
      det: path.join(DET_DIR, 'father_and_daughter/union_overlay.png'),
      whiteBacked: path.join(DET_DIR, 'father_and_daughter/union_white_backed.png'),
    },
    {
      id: 'beach_family',
      label: 'Beach Family (~15 Distant Silhouettes)',
      orig: path.join(FIXTURES_DIR, 'eval_photo_1_beach_family.jpg'),
      selfie: path.join(GLOBAL_DIR, 'beach_family/selfie/overlay.png'),
      deeplab: path.join(GLOBAL_DIR, 'beach_family/deeplab/overlay.png'),
      bodypix: path.join(GLOBAL_DIR, 'beach_family/bodypix/overlay.png'),
      det: path.join(DET_DIR, 'beach_family/union_overlay.png'),
      whiteBacked: path.join(DET_DIR, 'beach_family/union_white_backed.png'),
    },
    {
      id: 'indoor_family',
      label: 'Field Family (5 Members, Occluded Limbs)',
      orig: path.join(FIXTURES_DIR, 'eval_photo_2_indoor_family.jpg'),
      selfie: path.join(GLOBAL_DIR, 'indoor_family/selfie/overlay.png'),
      deeplab: path.join(GLOBAL_DIR, 'indoor_family/deeplab/overlay.png'),
      bodypix: path.join(GLOBAL_DIR, 'indoor_family/bodypix/overlay.png'),
      det: path.join(DET_DIR, 'indoor_family/union_overlay.png'),
      whiteBacked: path.join(DET_DIR, 'indoor_family/union_white_backed.png'),
    },
  ];

  // =========================================================================
  // 1. Candidate Master Comparison Grid (3 Rows x 5 Columns)
  // Columns: [ Original | Selfie Global | DeepLab-v3 Global | BodyPix Global | Detector-Guided Crop ]
  // =========================================================================
  const cellW = 320;
  const cellH = 220;
  const colCount = 5;
  const rowCount = 3;
  const padding = 16;
  const headerH = 60;
  const rowLabelW = 40;

  const totalW = rowLabelW + (cellW + padding) * colCount + padding;
  const totalH = headerH + (cellH + padding + 30) * rowCount + padding;

  const columnHeaders = [
    'Original Photo',
    'MediaPipe Selfie (Global)',
    'MediaPipe DeepLab-v3 (Global)',
    'TF.js BodyPix (Global)',
    'Detector-Guided Crop (Ours)',
  ];

  const compositeItems = [];

  // Create base dark canvas
  const masterBase = sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 } // #0f172a
    }
  });

  // Render column headers via SVG
  let headersSvg = `<svg width="${totalW}" height="${headerH}">
    <rect width="${totalW}" height="${headerH}" fill="#1e293b"/>
    <text x="20" y="38" font-family="sans-serif" font-size="20" font-weight="bold" fill="#38bdf8">STICKER STUDIO V1.2 — PERSON SEGMENTATION BENCHMARK</text>
  `;

  for (let c = 0; c < colCount; c++) {
    const cx = rowLabelW + padding + c * (cellW + padding);
    headersSvg += `
      <text x="${cx + cellW / 2}" y="52" font-family="sans-serif" font-size="13" font-weight="bold" fill="#94a3b8" text-anchor="middle">${columnHeaders[c]}</text>
    `;
  }
  headersSvg += `</svg>`;

  compositeItems.push({
    input: Buffer.from(headersSvg),
    top: 0,
    left: 0,
  });

  for (let r = 0; r < rowCount; r++) {
    const photo = photos[r];
    const rowY = headerH + padding + r * (cellH + padding + 30);

    // Row title SVG
    const rowTitleSvg = Buffer.from(`
      <svg width="${totalW}" height="24">
        <text x="20" y="18" font-family="sans-serif" font-size="14" font-weight="bold" fill="#f8fafc">${r + 1}. ${photo.label.replace(/&/g, '&amp;')}</text>
      </svg>
    `);
    compositeItems.push({ input: rowTitleSvg, top: rowY - 26, left: 0 });

    const cellFiles = [photo.orig, photo.selfie, photo.deeplab, photo.bodypix, photo.det];

    for (let c = 0; c < colCount; c++) {
      const cellX = rowLabelW + padding + c * (cellW + padding);
      const filePath = cellFiles[c];

      if (fs.existsSync(filePath)) {
        const cellBuf = await sharp(filePath)
          .resize(cellW, cellH, { fit: 'contain', background: { r: 30, g: 41, b: 59, alpha: 1 } })
          .png()
          .toBuffer();

        compositeItems.push({
          input: cellBuf,
          top: rowY,
          left: cellX,
        });
      }
    }
  }

  const masterPath = path.join(ARTIFACT_DIR, 'candidate_model_comparison_master.png');
  await masterBase.composite(compositeItems).png().toFile(masterPath);
  console.log(`Saved master comparison sheet: ${masterPath}`);

  // =========================================================================
  // 2. Beach Silhouettes Zoomed Close-Up Comparison
  // Crop area across x: 100 to 550, y: 430 to 730 (width: 450, height: 300)
  // Shows 6-7 silhouettes in extreme detail:
  // [ Original | Selfie Global (Severed) | DeepLab (Missed) | BodyPix (Detected) | Detector-Guided (Sharp Cutouts) ]
  // =========================================================================
  const cropArea = { left: 100, top: 430, width: 450, height: 280 };
  const beachCloseUpW = 300;
  const beachCloseUpH = Math.round((cropArea.height / cropArea.width) * beachCloseUpW);
  const closeUpColW = beachCloseUpW + 12;
  const closeUpTotalW = closeUpColW * 5 + 24;
  const closeUpTotalH = beachCloseUpH + 110;

  const beachCloseUpItems = [];
  const beachFiles = [
    { name: 'Original Silhouette', file: photos[1].orig },
    { name: 'Selfie Global (1.38% - Severed)', file: photos[1].selfie },
    { name: 'DeepLab-v3 (2.19% - Missed)', file: photos[1].deeplab },
    { name: 'BodyPix Global (17.52%)', file: photos[1].bodypix },
    { name: 'Detector-Guided (15.06% Clean)', file: photos[1].det },
  ];

  let closeUpSvg = `<svg width="${closeUpTotalW}" height="${closeUpTotalH}">
    <rect width="${closeUpTotalW}" height="${closeUpTotalH}" fill="#0f172a"/>
    <text x="16" y="28" font-family="sans-serif" font-size="16" font-weight="bold" fill="#38bdf8">BEACH SUNSET SILHOUETTE DETAIL (Close-up: Left 6 Figures)</text>
    <text x="16" y="46" font-family="sans-serif" font-size="12" fill="#94a3b8">Notice Selfie/DeepLab severe torso truncation vs. BodyPix &amp; Detector-Guided full silhouette recovery.</text>
  `;

  for (let i = 0; i < beachFiles.length; i++) {
    const item = beachFiles[i];
    const itemX = 16 + i * closeUpColW;
    const itemY = 60;

    closeUpSvg += `
      <text x="${itemX + beachCloseUpW / 2}" y="${itemY + beachCloseUpH + 20}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#f1f5f9" text-anchor="middle">${item.name.replace(/&/g, '&amp;')}</text>
    `;

    if (fs.existsSync(item.file)) {
      const croppedBuf = await sharp(item.file)
        .extract(cropArea)
        .resize(beachCloseUpW, beachCloseUpH)
        .png()
        .toBuffer();

      beachCloseUpItems.push({
        input: croppedBuf,
        top: itemY,
        left: itemX,
      });
    }
  }
  closeUpSvg += `</svg>`;

  beachCloseUpItems.unshift({ input: Buffer.from(closeUpSvg), top: 0, left: 0 });

  const beachCloseUpPath = path.join(ARTIFACT_DIR, 'beach_silhouette_closeup_comparison.png');
  await sharp({
    create: {
      width: closeUpTotalW,
      height: closeUpTotalH,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 }
    }
  })
  .composite(beachCloseUpItems)
  .png()
  .toFile(beachCloseUpPath);
  console.log(`Saved beach closeup comparison: ${beachCloseUpPath}`);

  // =========================================================================
  // 3. Final Detector-Guided White-Backed Stickers Output
  // Shows the 3 photos processed into finished white-backed stickers
  // =========================================================================
  const stickerCellW = 400;
  const stickerCellH = 300;
  const stickerTotalW = stickerCellW * 3 + 48;
  const stickerTotalH = stickerCellH + 90;

  const stickerItems = [];
  let stickerSvg = `<svg width="${stickerTotalW}" height="${stickerTotalH}">
    <rect width="${stickerTotalW}" height="${stickerTotalH}" fill="#18181b"/>
    <text x="20" y="32" font-family="sans-serif" font-size="18" font-weight="bold" fill="#38bdf8">DETECTOR-GUIDED CROP PIPELINE — FINISHED WHITE-BORDER STICKERS</text>
    <text x="20" y="52" font-family="sans-serif" font-size="12" fill="#a1a1aa">100% Client-Side WASM / WebGL • Zero Hallucination • Native Camera RGB Preserved</text>
  `;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const x = 16 + i * (stickerCellW + 16);
    const y = 65;

    stickerSvg += `
      <text x="${x + stickerCellW / 2}" y="${y + stickerCellH + 18}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#fafafa" text-anchor="middle">${photo.label.replace(/&/g, '&amp;')}</text>
    `;

    if (fs.existsSync(photo.whiteBacked)) {
      const stickerBuf = await sharp(photo.whiteBacked)
        .resize(stickerCellW, stickerCellH, { fit: 'contain', background: { r: 24, g: 24, b: 27, alpha: 1 } })
        .png()
        .toBuffer();

      stickerItems.push({ input: stickerBuf, top: y, left: x });
    }
  }
  stickerSvg += `</svg>`;
  stickerItems.unshift({ input: Buffer.from(stickerSvg), top: 0, left: 0 });

  const finalStickersPath = path.join(ARTIFACT_DIR, 'final_detector_guided_stickers.png');
  await sharp({
    create: {
      width: stickerTotalW,
      height: stickerTotalH,
      channels: 4,
      background: { r: 24, g: 24, b: 27, alpha: 1 }
    }
  })
  .composite(stickerItems)
  .png()
  .toFile(finalStickersPath);
  console.log(`Saved final stickers preview: ${finalStickersPath}`);
}

main().catch(console.error);
