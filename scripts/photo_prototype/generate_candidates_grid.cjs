const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const DIAG_DIR = path.resolve('docs/diagnosis_photo_cutout');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

async function generateGrid() {
  const meta = JSON.parse(fs.readFileSync(path.join(DIAG_DIR, 'candidates_meta.json')));
  const W = meta.imageWidth; // 1200
  const H = meta.imageHeight; // 896

  // We will create a montage/grid image of size 1200 x 900 (scaled thumbnails)
  // 2 rows of 4 columns:
  // Col 1: Original Image
  // Col 2: Candidate 0
  // Col 3: Candidate 1
  // Col 4: Candidate 2
  // Row 1: Person A (Father)
  // Row 2: Person B (Daughter)

  const thumbW = 400;
  const thumbH = Math.round((thumbW * H) / W); // ~299
  const gridW = thumbW * 4; // 1600
  const gridH = thumbH * 2 + 350; // 2 rows + defect zoom row

  console.log(`Grid dimensions: ${gridW} x ${gridH}`);

  const origThumb = await sharp(FIXTURE_PATH).resize(thumbW, thumbH).png().toBuffer();

  const composites = [];

  // Helper to add titled thumbnail
  async function addThumb(buf, col, row, title) {
    const x = col * thumbW;
    const y = row * thumbH;
    composites.push({ input: buf, top: y, left: x });

    // SVG title banner
    const svgTitle = Buffer.from(`
      <svg width="${thumbW}" height="32">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" />
        <text x="10" y="22" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">${title}</text>
      </svg>
    `);
    composites.push({ input: svgTitle, top: y, left: x });
  }

  // Row 0: Father
  await addThumb(origThumb, 0, 0, 'Original Source Photo');
  for (let c = 0; c < 3; c++) {
    const artPath = path.join(DIAG_DIR, `Person_A_Father_cand_${c}_artwork.png`);
    const cand = meta.subjects.Person_A_Father.candidates[c];
    const thumb = await sharp(artPath).resize(thumbW, thumbH).png().toBuffer();
    await addThumb(thumb, c + 1, 0, `Father Cand ${c} (IoU: ${cand.score.toFixed(3)}, ${cand.pixelCount}px)`);
  }

  // Row 1: Daughter
  await addThumb(origThumb, 0, 1, 'Original Source Photo');
  for (let c = 0; c < 3; c++) {
    const artPath = path.join(DIAG_DIR, `Person_B_Daughter_cand_${c}_artwork.png`);
    const cand = meta.subjects.Person_B_Daughter.candidates[c];
    const thumb = await sharp(artPath).resize(thumbW, thumbH).png().toBuffer();
    await addThumb(thumb, c + 1, 1, `Daughter Cand ${c} (IoU: ${cand.score.toFixed(3)}, ${cand.pixelCount}px)`);
  }

  // Row 2: Zoomed-in Defect Crops (Y = thumbH * 2 = ~598)
  const zoomY = thumbH * 2;
  const zoomW = 400;
  const zoomH = 350;

  // Defect 1: Daughter Torso Holes in Cand 0 (yellow jacket [530, 420, 220, 220])
  const crop1 = await sharp(path.join(DIAG_DIR, 'Person_B_Daughter_cand_0_artwork.png'))
    .extract({ left: 530, top: 420, width: 220, height: 220 })
    .resize(zoomW, zoomH, { fit: 'contain', background: '#1e293b' })
    .png().toBuffer();
  composites.push({ input: crop1, top: zoomY, left: 0 });
  composites.push({
    input: Buffer.from(`
      <svg width="${zoomW}" height="40">
        <rect width="100%" height="100%" fill="rgba(185, 28, 28, 0.85)" />
        <text x="10" y="26" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">DEFECT: 4,938 Holes in Daughter Torso</text>
      </svg>
    `),
    top: zoomY,
    left: 0,
  });

  // Defect 2: Foreign Islands on Father's Head/Sweater in Daughter Cand 0 ([320, 280, 240, 240])
  const crop2 = await sharp(path.join(DIAG_DIR, 'Person_B_Daughter_cand_0_artwork.png'))
    .extract({ left: 320, top: 280, width: 240, height: 240 })
    .resize(zoomW, zoomH, { fit: 'contain', background: '#1e293b' })
    .png().toBuffer();
  composites.push({ input: crop2, top: zoomY, left: zoomW });
  composites.push({
    input: Buffer.from(`
      <svg width="${zoomW}" height="40">
        <rect width="100%" height="100%" fill="rgba(185, 28, 28, 0.85)" />
        <text x="10" y="26" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">DEFECT: Foreign Islands on Father Body</text>
      </svg>
    `),
    top: zoomY,
    left: zoomW,
  });

  // Defect 3: Daughter Cand 1 Fragmentation (Head detached from body)
  const crop3 = await sharp(path.join(DIAG_DIR, 'Person_B_Daughter_cand_1_artwork.png'))
    .extract({ left: 520, top: 320, width: 240, height: 260 })
    .resize(zoomW, zoomH, { fit: 'contain', background: '#1e293b' })
    .png().toBuffer();
  composites.push({ input: crop3, top: zoomY, left: zoomW * 2 });
  composites.push({
    input: Buffer.from(`
      <svg width="${zoomW}" height="40">
        <rect width="100%" height="100%" fill="rgba(185, 28, 28, 0.85)" />
        <text x="10" y="26" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">Cand 1: Head/Body Split Detachment</text>
      </svg>
    `),
    top: zoomY,
    left: zoomW * 2,
  });

  // Defect 4: Daughter Cand 2 Catastrophic Fragmentation (20,125 holes, 86 islands)
  const crop4 = await sharp(path.join(DIAG_DIR, 'Person_B_Daughter_cand_2_artwork.png'))
    .extract({ left: 500, top: 350, width: 280, height: 280 })
    .resize(zoomW, zoomH, { fit: 'contain', background: '#1e293b' })
    .png().toBuffer();
  composites.push({ input: crop4, top: zoomY, left: zoomW * 3 });
  composites.push({
    input: Buffer.from(`
      <svg width="${zoomW}" height="40">
        <rect width="100%" height="100%" fill="rgba(185, 28, 28, 0.85)" />
        <text x="10" y="26" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff">Cand 2: 20,125 Holes / 86 Islands</text>
      </svg>
    `),
    top: zoomY,
    left: zoomW * 3,
  });

  const finalGrid = await sharp({
    create: {
      width: gridW,
      height: gridH,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const outPath = path.join(DIAG_DIR, 'raw_candidates_comparison_grid.png');
  const artifactPath = path.join(ARTIFACT_DIR, 'raw_candidates_comparison_grid.png');

  fs.writeFileSync(outPath, finalGrid);
  fs.writeFileSync(artifactPath, finalGrid);
  console.log(`Saved comparison grid to ${outPath} and ${artifactPath}`);
}

generateGrid().catch(console.error);
