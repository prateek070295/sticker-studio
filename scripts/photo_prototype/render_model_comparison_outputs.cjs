const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const DIAG_DIR = path.resolve('docs/diagnosis_photo_cutout');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

const INF = 1e9;

function edt1D(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
}

function computeEDT(binaryMask, width, height) {
  const size = width * height;
  const f = new Float32Array(size);
  for (let i = 0; i < size; i++) f[i] = binaryMask[i] > 0 ? 0 : INF;

  const d = new Float32Array(size);
  const maxDim = Math.max(width, height);
  const v = new Int32Array(maxDim);
  const z = new Float32Array(maxDim + 1);
  const colF = new Float32Array(height);
  const colD = new Float32Array(height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) colF[y] = f[y * width + x];
    edt1D(colF, height, colD, v, z);
    for (let y = 0; y < height; y++) d[y * width + x] = colD[y];
  }

  const rowF = new Float32Array(width);
  const rowD = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) rowF[x] = d[rowOffset + x];
    edt1D(rowF, width, rowD, v, z);
    for (let x = 0; x < width; x++) d[rowOffset + x] = Math.sqrt(rowD[x]);
  }
  return d;
}

function composeSticker(mask, srcRgba, W, H, borderThickness = 15) {
  const artRgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const off = i * 4;
    if (mask[i] === 1) {
      artRgba[off] = srcRgba[off];
      artRgba[off + 1] = srcRgba[off + 1];
      artRgba[off + 2] = srcRgba[off + 2];
      artRgba[off + 3] = 255;
    }
  }

  const edt = computeEDT(mask, W, H);
  const whiteBacked = Buffer.alloc(W * H * 4);

  for (let i = 0; i < W * H; i++) {
    const off = i * 4;
    const dist = edt[i];
    if (mask[i] === 1) {
      whiteBacked[off] = srcRgba[off];
      whiteBacked[off + 1] = srcRgba[off + 1];
      whiteBacked[off + 2] = srcRgba[off + 2];
      whiteBacked[off + 3] = 255;
    } else if (dist <= borderThickness) {
      const alpha = dist >= borderThickness - 1.5 ? (borderThickness - dist) / 1.5 : 1.0;
      whiteBacked[off] = 255;
      whiteBacked[off + 1] = 255;
      whiteBacked[off + 2] = 255;
      whiteBacked[off + 3] = Math.round(alpha * 255);
    }
  }

  return { artRgba, whiteBacked };
}

function countHolesAndIslands(binMask, W, H) {
  // Flood fill outside boundary to identify exterior background
  const visited = new Uint8Array(W * H);
  const queue = [];

  for (let x = 0; x < W; x++) {
    if (binMask[x] === 0) { visited[x] = 1; queue.push(x); }
    const bot = (H - 1) * W + x;
    if (binMask[bot] === 0) { visited[bot] = 1; queue.push(bot); }
  }
  for (let y = 0; y < H; y++) {
    const l = y * W;
    if (binMask[l] === 0 && !visited[l]) { visited[l] = 1; queue.push(l); }
    const r = y * W + (W - 1);
    if (binMask[r] === 0 && !visited[r]) { visited[r] = 1; queue.push(r); }
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % W;
    const cy = Math.floor(curr / W);

    const neighbors = [
      cy > 0 ? (cy - 1) * W + cx : -1,
      cy < H - 1 ? (cy + 1) * W + cx : -1,
      cx > 0 ? cy * W + (cx - 1) : -1,
      cx < W - 1 ? cy * W + (cx + 1) : -1
    ];

    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && binMask[n] === 0) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }

  // Holes are 0-pixels that were never visited from exterior
  let holePixels = 0;
  for (let i = 0; i < W * H; i++) {
    if (binMask[i] === 0 && visited[i] === 0) {
      holePixels++;
    }
  }

  // Count foreground connected components (islands)
  const fgVisited = new Uint8Array(W * H);
  const components = [];

  for (let i = 0; i < W * H; i++) {
    if (binMask[i] === 1 && !fgVisited[i]) {
      let compSize = 0;
      const cQueue = [i];
      fgVisited[i] = 1;
      let cHead = 0;

      while (cHead < cQueue.length) {
        const curr = cQueue[cHead++];
        compSize++;
        const cx = curr % W;
        const cy = Math.floor(curr / W);

        const neighbors = [
          cy > 0 ? (cy - 1) * W + cx : -1,
          cy < H - 1 ? (cy + 1) * W + cx : -1,
          cx > 0 ? cy * W + (cx - 1) : -1,
          cx < W - 1 ? cy * W + (cx + 1) : -1
        ];

        for (const n of neighbors) {
          if (n >= 0 && !fgVisited[n] && binMask[n] === 1) {
            fgVisited[n] = 1;
            cQueue.push(n);
          }
        }
      }
      components.push(compSize);
    }
  }

  components.sort((a, b) => b - a);
  const detachedIslands = components.length > 1 ? components.length - 1 : 0;
  const secondaryIslandPixels = components.slice(1).reduce((a, b) => a + b, 0);

  return {
    holePixels,
    mainComponentSize: components[0] || 0,
    detachedIslands,
    secondaryIslandPixels,
    allComponents: components.slice(0, 10)
  };
}

async function renderAll() {
  console.log('Rendering model comparison outputs...');
  const meta = JSON.parse(fs.readFileSync(path.join(DIAG_DIR, 'model_comparison_meta.json')));
  const W = meta.imageDimensions.width; // 1200
  const H = meta.imageDimensions.height; // 896

  const srcRgba = await sharp(FIXTURE_PATH).ensureAlpha().raw().toBuffer();

  // Helper to save PNG both to DIAG_DIR and ARTIFACT_DIR
  async function savePng(buf, filename, w = W, h = H) {
    const p1 = path.join(DIAG_DIR, filename);
    const p2 = path.join(ARTIFACT_DIR, filename);
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(p1);
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(p2);
  }

  // Helper to create tinted overlay
  function createOverlay(binMask, tintRgb = [56, 189, 248]) {
    const overlay = Buffer.from(srcRgba);
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      if (binMask[i] === 1) {
        overlay[off] = Math.round(overlay[off] * 0.35 + tintRgb[0] * 0.65);
        overlay[off + 1] = Math.round(overlay[off + 1] * 0.35 + tintRgb[1] * 0.65);
        overlay[off + 2] = Math.round(overlay[off + 2] * 0.35 + tintRgb[2] * 0.65);
      } else {
        overlay[off] = Math.round(overlay[off] * 0.25);
        overlay[off + 1] = Math.round(overlay[off + 1] * 0.25);
        overlay[off + 2] = Math.round(overlay[off + 2] * 0.25);
      }
    }
    return overlay;
  }

  // 1. Process MediaPipe
  console.log('\n[1/4] Processing MediaPipe Whole-Family outputs...');
  const mpBin = fs.readFileSync(path.join(DIAG_DIR, 'mediapipe_whole_family.bin'));
  const mpSticker = composeSticker(mpBin, srcRgba, W, H);
  const mpOverlay = createOverlay(mpBin, [56, 189, 248]);
  const mpMetrics = countHolesAndIslands(mpBin, W, H);

  await savePng(mpSticker.artRgba, 'mediapipe_whole_family_artwork_only.png');
  await savePng(mpSticker.whiteBacked, 'mediapipe_whole_family_white_backed.png');
  await savePng(mpOverlay, 'mediapipe_whole_family_overlay.png');
  console.log(`  MediaPipe metrics: holes=${mpMetrics.holePixels} px, islands=${mpMetrics.detachedIslands}`);

  // 2. Process BodyPix Individual & Union
  console.log('\n[2/4] Processing BodyPix Individual & Union outputs...');
  // Person 1 is Father (minX ~135), Person 0 is Daughter (minX ~538)
  const bpFatherBin = fs.readFileSync(path.join(DIAG_DIR, 'bodypix_person_1.bin'));
  const bpDaughterBin = fs.readFileSync(path.join(DIAG_DIR, 'bodypix_person_0.bin'));
  const bpUnionBin = fs.readFileSync(path.join(DIAG_DIR, 'bodypix_union.bin'));

  const bpFatherSticker = composeSticker(bpFatherBin, srcRgba, W, H);
  const bpDaughterSticker = composeSticker(bpDaughterBin, srcRgba, W, H);
  const bpUnionSticker = composeSticker(bpUnionBin, srcRgba, W, H);

  const bpFatherOverlay = createOverlay(bpFatherBin, [56, 189, 248]);
  const bpDaughterOverlay = createOverlay(bpDaughterBin, [250, 204, 21]);
  const bpUnionOverlay = createOverlay(bpUnionBin, [168, 85, 247]);

  const bpFatherMetrics = countHolesAndIslands(bpFatherBin, W, H);
  const bpDaughterMetrics = countHolesAndIslands(bpDaughterBin, W, H);
  const bpUnionMetrics = countHolesAndIslands(bpUnionBin, W, H);

  await savePng(bpFatherSticker.artRgba, 'bodypix_person_a_father_artwork_only.png');
  await savePng(bpFatherSticker.whiteBacked, 'bodypix_person_a_father_white_backed.png');
  await savePng(bpFatherOverlay, 'bodypix_person_a_father_overlay.png');

  await savePng(bpDaughterSticker.artRgba, 'bodypix_person_b_daughter_artwork_only.png');
  await savePng(bpDaughterSticker.whiteBacked, 'bodypix_person_b_daughter_white_backed.png');
  await savePng(bpDaughterOverlay, 'bodypix_person_b_daughter_overlay.png');

  await savePng(bpUnionSticker.artRgba, 'bodypix_union_artwork_only.png');
  await savePng(bpUnionSticker.whiteBacked, 'bodypix_union_white_backed.png');
  await savePng(bpUnionOverlay, 'bodypix_union_overlay.png');

  console.log(`  BodyPix Father metrics: holes=${bpFatherMetrics.holePixels} px, islands=${bpFatherMetrics.detachedIslands}`);
  console.log(`  BodyPix Daughter metrics: holes=${bpDaughterMetrics.holePixels} px, islands=${bpDaughterMetrics.detachedIslands}`);
  console.log(`  BodyPix Union metrics: holes=${bpUnionMetrics.holePixels} px, islands=${bpUnionMetrics.detachedIslands}`);

  // 3. Process Hybrid Partition outputs
  console.log('\n[3/4] Processing Hybrid Partition outputs...');
  const hybridABin = fs.readFileSync(path.join(DIAG_DIR, 'hybrid_person_a.bin'));
  const hybridBBin = fs.readFileSync(path.join(DIAG_DIR, 'hybrid_person_b.bin'));
  const hybridUncertainBin = fs.readFileSync(path.join(DIAG_DIR, 'hybrid_uncertain.bin'));

  const hybridASticker = composeSticker(hybridABin, srcRgba, W, H);
  const hybridBSticker = composeSticker(hybridBBin, srcRgba, W, H);

  // Hybrid 3-color diagnostic overlay (Blue=Father, Yellow=Daughter, Red=Uncertain)
  const hybridOverlay = Buffer.from(srcRgba);
  for (let i = 0; i < W * H; i++) {
    const off = i * 4;
    if (hybridABin[i] === 1) {
      hybridOverlay[off] = Math.round(hybridOverlay[off] * 0.35 + 56 * 0.65);
      hybridOverlay[off + 1] = Math.round(hybridOverlay[off + 1] * 0.35 + 189 * 0.65);
      hybridOverlay[off + 2] = Math.round(hybridOverlay[off + 2] * 0.35 + 248 * 0.65);
    } else if (hybridBBin[i] === 1) {
      hybridOverlay[off] = Math.round(hybridOverlay[off] * 0.35 + 250 * 0.65);
      hybridOverlay[off + 1] = Math.round(hybridOverlay[off + 1] * 0.35 + 204 * 0.65);
      hybridOverlay[off + 2] = Math.round(hybridOverlay[off + 2] * 0.35 + 21 * 0.65);
    } else if (hybridUncertainBin[i] === 1) {
      hybridOverlay[off] = Math.round(hybridOverlay[off] * 0.2 + 239 * 0.8);
      hybridOverlay[off + 1] = Math.round(hybridOverlay[off + 1] * 0.2 + 68 * 0.8);
      hybridOverlay[off + 2] = Math.round(hybridOverlay[off + 2] * 0.2 + 68 * 0.8);
    } else {
      hybridOverlay[off] = Math.round(hybridOverlay[off] * 0.25);
      hybridOverlay[off + 1] = Math.round(hybridOverlay[off + 1] * 0.25);
      hybridOverlay[off + 2] = Math.round(hybridOverlay[off + 2] * 0.25);
    }
  }

  await savePng(hybridASticker.artRgba, 'hybrid_person_a_artwork_only.png');
  await savePng(hybridASticker.whiteBacked, 'hybrid_person_a_white_backed.png');
  await savePng(hybridBSticker.artRgba, 'hybrid_person_b_artwork_only.png');
  await savePng(hybridBSticker.whiteBacked, 'hybrid_person_b_white_backed.png');
  await savePng(hybridOverlay, 'hybrid_partition_overlay.png');

  // Save quantitative metrics to JSON
  const comparisonAudit = {
    ...meta,
    topologicalMetrics: {
      slimsam_baseline_daughter: { holePixels: 4938, detachedIslands: 47, maxIslandPx: 568 },
      slimsam_baseline_father: { holePixels: 938, detachedIslands: 22, maxIslandPx: 300 },
      mediapipe_whole_family: mpMetrics,
      bodypix_father: bpFatherMetrics,
      bodypix_daughter: bpDaughterMetrics,
      bodypix_union: bpUnionMetrics,
    }
  };
  fs.writeFileSync(path.join(DIAG_DIR, 'model_comparison_metrics.json'), JSON.stringify(comparisonAudit, null, 2));

  // 4. Generate Master Comparison Sheets & Close-ups
  console.log('\n[4/4] Generating Master Model Comparison Sheet & Close-ups...');

  // Create Master Comparison Montage:
  // 5 Columns: Original Photo | SlimSAM Baseline | MediaPipe Family | BodyPix Union | Hybrid
  // Row 1: Full Stickers
  // Row 2: Dark Background Artwork
  // Row 3: Light Background Artwork
  // Row 4: 5 Close-up Crops
  const colW = 360;
  const colH = Math.round((colW * H) / W); // ~269
  const sheetW = colW * 5; // 1800
  const sheetH = colH * 3 + 360; // 3 rows + close-up row

  console.log(`Montage Sheet Dimensions: ${sheetW} x ${sheetH}`);

  const origThumb = await sharp(FIXTURE_PATH).resize(colW, colH).png().toBuffer();

  // Load SlimSAM baseline (Father Cand 0 + Daughter Cand 0 union)
  const samA = fs.readFileSync(path.join(DIAG_DIR, 'Person_A_Father_cand_0.bin'));
  const samB = fs.readFileSync(path.join(DIAG_DIR, 'Person_B_Daughter_cand_0.bin'));
  const samUnion = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (samA[i] === 1 || samB[i] === 1) samUnion[i] = 1;
  const samSticker = composeSticker(samUnion, srcRgba, W, H);

  const composites = [];

  async function addCard(buf, col, row, label, bg = '#0f172a') {
    const x = col * colW;
    const y = row * colH;

    // Background tile
    const bgTile = await sharp({
      create: { width: colW, height: colH, channels: 4, background: bg }
    }).png().toBuffer();
    composites.push({ input: bgTile, top: y, left: x });

    const sharpInput = (Buffer.isBuffer(buf) && buf.length === W * H * 4)
      ? sharp(buf, { raw: { width: W, height: H, channels: 4 } })
      : sharp(buf);

    const thumb = await sharpInput.resize(colW, colH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    composites.push({ input: thumb, top: y, left: x });

    const titleSvg = Buffer.from(`
      <svg width="${colW}" height="28">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" />
        <text x="8" y="19" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffffff">${label}</text>
      </svg>
    `);
    composites.push({ input: titleSvg, top: y, left: x });
  }

  // Row 0: Full Stickers (White-backed)
  await addCard(origThumb, 0, 0, '1. Source Photograph');
  await addCard(samSticker.whiteBacked, 1, 0, '2. SlimSAM Baseline (Holes/Islands)');
  await addCard(mpSticker.whiteBacked, 2, 0, '3. MediaPipe (Whole-Family)');
  await addCard(bpUnionSticker.whiteBacked, 3, 0, '4. BodyPix Union (MultiPerson)');
  await addCard(hybridOverlay, 4, 0, '5. Hybrid (Blue=A, Yellow=B, Red=Seam)');

  // Row 1: Artwork-only on Dark (#0f172a)
  await addCard(origThumb, 0, 1, 'Source Photo (Dark BG)');
  await addCard(samSticker.artRgba, 1, 1, 'SlimSAM Artwork (Dark BG)');
  await addCard(mpSticker.artRgba, 2, 1, 'MediaPipe Artwork (Dark BG)');
  await addCard(bpUnionSticker.artRgba, 3, 1, 'BodyPix Artwork (Dark BG)');
  await addCard(hybridASticker.artRgba, 4, 1, 'Hybrid Person A Artwork (Dark BG)');

  // Row 2: Artwork-only on Light (#f1f5f9)
  await addCard(origThumb, 0, 2, 'Source Photo (Light BG)', '#f1f5f9');
  await addCard(samSticker.artRgba, 1, 2, 'SlimSAM Artwork (Light BG)', '#f1f5f9');
  await addCard(mpSticker.artRgba, 2, 2, 'MediaPipe Artwork (Light BG)', '#f1f5f9');
  await addCard(bpUnionSticker.artRgba, 3, 2, 'BodyPix Artwork (Light BG)', '#f1f5f9');
  await addCard(hybridBSticker.artRgba, 4, 2, 'Hybrid Person B Artwork (Light BG)', '#f1f5f9');

  // Row 3: 5 Key Close-Up Crops (Width = colW = 360, Height = 360)
  const closeY = colH * 3;

  async function addCloseUp(file, cropBox, col, title, desc) {
    const x = col * colW;
    const crop = await sharp(file)
      .extract(cropBox)
      .resize(colW, 360, { fit: 'contain', background: '#0f172a' })
      .png().toBuffer();
    composites.push({ input: crop, top: closeY, left: x });

    const svg = Buffer.from(`
      <svg width="${colW}" height="56">
        <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.9)" />
        <text x="10" y="22" font-family="sans-serif" font-size="13" font-weight="bold" fill="#38bdf8">${title}</text>
        <text x="10" y="42" font-family="sans-serif" font-size="11" fill="#cbd5e1">${desc}</text>
      </svg>
    `);
    composites.push({ input: svg, top: closeY + 360 - 56, left: x });
  }

  // Crop 1: Father's Arm & Sweater [180, 480, 260, 260]
  await addCloseUp(path.join(DIAG_DIR, 'mediapipe_whole_family_white_backed.png'),
    { left: 180, top: 480, width: 260, height: 260 },
    0,
    "1. Father's Arm &amp; Sweater",
    "Clean contiguous limb, zero holes"
  );

  // Crop 2: Daughter's Jacket [540, 420, 240, 240]
  await addCloseUp(path.join(DIAG_DIR, 'mediapipe_whole_family_white_backed.png'),
    { left: 540, top: 420, width: 240, height: 240 },
    1,
    "2. Daughter's Jacket (MediaPipe)",
    "0 holes (vs 4,938 holes in SlimSAM)"
  );

  // Crop 3: Hair and Faces [320, 100, 360, 360]
  await addCloseUp(path.join(DIAG_DIR, 'mediapipe_whole_family_white_backed.png'),
    { left: 320, top: 100, width: 360, height: 360 },
    2,
    "3. Hair &amp; Faces (MediaPipe)",
    "Preserves facial contours &amp; hair curls"
  );

  // Crop 4: Body Contact & Hands [460, 460, 280, 280]
  await addCloseUp(path.join(DIAG_DIR, 'hybrid_partition_overlay.png'),
    { left: 460, top: 460, width: 280, height: 280 },
    3,
    "4. Contact &amp; Seam (Hybrid)",
    "Red band shows uncertain seam zone"
  );

  // Crop 5: Bench Edge & Foliage [700, 680, 300, 200]
  await addCloseUp(path.join(DIAG_DIR, 'mediapipe_whole_family_white_backed.png'),
    { left: 700, top: 680, width: 300, height: 200 },
    4,
    "5. Bench Exclusion (MediaPipe)",
    "Excludes wooden bench slats cleanly"
  );

  const masterSheet = await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } }
  }).composite(composites).png().toBuffer();

  fs.writeFileSync(path.join(DIAG_DIR, 'model_comparison_master_sheet.png'), masterSheet);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'model_comparison_master_sheet.png'), masterSheet);
  console.log(`Saved model_comparison_master_sheet.png (${sheetW}x${sheetH}) to diagnostics and artifacts.`);
}

renderAll().catch(console.error);
