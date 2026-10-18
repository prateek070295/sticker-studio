const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const DIAG_DIR = path.resolve('docs/diagnosis_photo_cutout');
const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

async function renderDiagnostics() {
  console.log('Rendering all candidate masks to PNG...');

  const meta = JSON.parse(fs.readFileSync(path.join(DIAG_DIR, 'candidates_meta.json')));
  const W = meta.imageWidth;
  const H = meta.imageHeight;

  // Read source photo using sharp
  const src = await sharp(FIXTURE_PATH).ensureAlpha().raw().toBuffer();

  for (const [subjName, subjInfo] of Object.entries(meta.subjects)) {
    console.log(`\nRendering candidates for: ${subjName}`);
    for (const cand of subjInfo.candidates) {
      const maskBin = fs.readFileSync(path.join(DIAG_DIR, cand.maskBinFile));

      // 1. Artwork only
      const art = Buffer.alloc(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const off = i * 4;
        if (maskBin[i] === 1) {
          art[off] = src[off];
          art[off + 1] = src[off + 1];
          art[off + 2] = src[off + 2];
          art[off + 3] = 255;
        }
      }

      const artPath = path.join(DIAG_DIR, `${subjName}_cand_${cand.candidateIndex}_artwork.png`);
      const artArtifact = path.join(ARTIFACT_DIR, `${subjName}_cand_${cand.candidateIndex}_artwork.png`);
      await sharp(art, { raw: { width: W, height: H, channels: 4 } }).png().toFile(artPath);
      await sharp(art, { raw: { width: W, height: H, channels: 4 } }).png().toFile(artArtifact);

      // 2. Overlay on source photo
      const overlay = Buffer.from(src);
      const isA = subjName.includes('Father');
      const tint = isA ? [56, 189, 248] : [250, 204, 21];

      for (let i = 0; i < W * H; i++) {
        const off = i * 4;
        if (maskBin[i] === 1) {
          overlay[off] = Math.round(overlay[off] * 0.35 + tint[0] * 0.65);
          overlay[off + 1] = Math.round(overlay[off + 1] * 0.35 + tint[1] * 0.65);
          overlay[off + 2] = Math.round(overlay[off + 2] * 0.35 + tint[2] * 0.65);
        } else {
          overlay[off] = Math.round(overlay[off] * 0.25);
          overlay[off + 1] = Math.round(overlay[off + 1] * 0.25);
          overlay[off + 2] = Math.round(overlay[off + 2] * 0.25);
        }
      }

      const overlayPath = path.join(DIAG_DIR, `${subjName}_cand_${cand.candidateIndex}_overlay.png`);
      const overlayArtifact = path.join(ARTIFACT_DIR, `${subjName}_cand_${cand.candidateIndex}_overlay.png`);
      await sharp(overlay, { raw: { width: W, height: H, channels: 4 } }).png().toFile(overlayPath);
      await sharp(overlay, { raw: { width: W, height: H, channels: 4 } }).png().toFile(overlayArtifact);

      console.log(`  Candidate ${cand.candidateIndex} (${cand.score.toFixed(4)}, ${cand.pixelCount} px) -> saved PNGs`);
    }
  }

  console.log('\nAll diagnostic PNGs rendered successfully.');
}

renderDiagnostics().catch(console.error);
