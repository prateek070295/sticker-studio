const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');
const archiver = require('c:/Users/prate/Documents/SheetExtractor/node_modules/archiver');

const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const REPO_HANDOFF_DIR = path.resolve('.photo-review-handoff');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

async function createReviewPackage() {
  console.log('=== PACKAGING PHASE 2A VISUAL REVIEW HANDOFF ===\n');

  if (!fs.existsSync(REPO_HANDOFF_DIR)) {
    fs.mkdirSync(REPO_HANDOFF_DIR, { recursive: true });
  }

  // 1. Files to package
  const fileNames = [
    'person_a_artwork_only.png',
    'person_a_white_backed.png',
    'person_b_artwork_only.png',
    'person_b_white_backed.png',
    'combined_ab_artwork_only.png',
    'combined_ab_white_backed.png',
    'comp_source_contact.png',
    'comp_uncorrected_person_a.png',
    'comp_finished_person_a.png',
    'comp_uncorrected_person_b.png',
    'comp_finished_person_b.png',
    'phase2a_finished_audit.json',
  ];

  // 2. Generate the Comprehensive Comparison Sheet Image
  console.log('1. Generating comprehensive comparison sheet image...');
  const compSheetWidth = 1800;
  const compSheetHeight = 1200;

  // Background canvas (dark theme #18181b)
  const baseCanvas = await sharp({
    create: {
      width: compSheetWidth,
      height: compSheetHeight,
      channels: 4,
      background: { r: 24, g: 24, b: 27, alpha: 1 }
    }
  }).png().toBuffer();

  // Load and resize elements
  // Row 1: Source (380x285), Person A Artwork on dark (340x360), Person B Artwork on dark (340x360), Combined A+B Artwork (340x360)
  const srcSmall = await sharp(FIXTURE_PATH).resize(380, 284, { fit: 'inside' }).toBuffer();
  
  // Cutout cards on checkered/dark background
  async function makeCard(imgName, bgR, bgG, bgB, maxW, maxH) {
    const raw = fs.readFileSync(path.join(ARTIFACT_DIR, imgName));
    const resized = await sharp(raw).resize(maxW, maxH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const meta = await sharp(resized).metadata();
    
    // Composite onto background card
    const card = await sharp({
      create: {
        width: maxW + 16,
        height: maxH + 16,
        channels: 4,
        background: { r: bgR, g: bgG, b: bgB, alpha: 1 }
      }
    }).composite([{ input: resized, top: 8, left: 8 }]).png().toBuffer();
    return card;
  }

  // Row 1: Artwork-only cutouts on dark background
  const cardArtA_Dark = await makeCard('person_a_artwork_only.png', 18, 18, 20, 260, 280);
  const cardArtB_Dark = await makeCard('person_b_artwork_only.png', 18, 18, 20, 260, 280);
  const cardArtAB_Dark = await makeCard('combined_ab_artwork_only.png', 18, 18, 20, 260, 280);

  // Row 2: White-Backed stickers on dark & light backgrounds
  const cardWbA_Dark = await makeCard('person_a_white_backed.png', 20, 20, 24, 240, 260);
  const cardWbA_Light = await makeCard('person_a_white_backed.png', 245, 245, 247, 240, 260);
  const cardWbB_Dark = await makeCard('person_b_white_backed.png', 20, 20, 24, 240, 260);
  const cardWbB_Light = await makeCard('person_b_white_backed.png', 245, 245, 247, 240, 260);
  const cardWbAB_Dark = await makeCard('combined_ab_white_backed.png', 20, 20, 24, 240, 260);
  const cardWbAB_Light = await makeCard('combined_ab_white_backed.png', 245, 245, 247, 240, 260);

  // Row 3: Contact close-ups (each 220x180)
  const cropSrc = await sharp(path.join(ARTIFACT_DIR, 'comp_source_contact.png')).resize(220, 180).toBuffer();
  const cropUncA = await sharp(path.join(ARTIFACT_DIR, 'comp_uncorrected_person_a.png')).resize(220, 180).toBuffer();
  const cropFinA = await sharp(path.join(ARTIFACT_DIR, 'comp_finished_person_a.png')).resize(220, 180).toBuffer();
  const cropUncB = await sharp(path.join(ARTIFACT_DIR, 'comp_uncorrected_person_b.png')).resize(220, 180).toBuffer();
  const cropFinB = await sharp(path.join(ARTIFACT_DIR, 'comp_finished_person_b.png')).resize(220, 180).toBuffer();

  // Composite everything onto comparison sheet
  const compositeList = [
    // Row 1: Source & Artwork Only
    { input: srcSmall, top: 60, left: 40 },
    { input: cardArtA_Dark, top: 50, left: 460 },
    { input: cardArtB_Dark, top: 50, left: 760 },
    { input: cardArtAB_Dark, top: 50, left: 1060 },

    // Row 2: White Backed on Dark vs Light
    { input: cardWbA_Dark, top: 400, left: 40 },
    { input: cardWbA_Light, top: 400, left: 320 },
    { input: cardWbB_Dark, top: 400, left: 620 },
    { input: cardWbB_Light, top: 400, left: 900 },
    { input: cardWbAB_Dark, top: 400, left: 1200 },
    { input: cardWbAB_Light, top: 400, left: 1480 },

    // Row 3: Contact Region Close-ups (Source, A Unc, A Fin, B Unc, B Fin)
    { input: cropSrc, top: 760, left: 60 },
    { input: cropUncA, top: 760, left: 320 },
    { input: cropFinA, top: 760, left: 580 },
    { input: cropUncB, top: 760, left: 880 },
    { input: cropFinB, top: 760, left: 1140 },
  ];

  const compSheetBuffer = await sharp(baseCanvas).composite(compositeList).png().toBuffer();
  
  const compSheetArtifactPath = path.join(ARTIFACT_DIR, 'photo_review_comparison_sheet.png');
  const compSheetRepoPath = path.join(REPO_HANDOFF_DIR, 'photo_review_comparison_sheet.png');
  fs.writeFileSync(compSheetArtifactPath, compSheetBuffer);
  fs.writeFileSync(compSheetRepoPath, compSheetBuffer);
  console.log('  Saved comparison sheet to:');
  console.log('    ' + compSheetArtifactPath);
  console.log('    ' + compSheetRepoPath);

  // 3. Copy files to repo handoff directory
  console.log('\n2. Copying existing review artifacts to private review directory...');
  const manifest = [];
  
  // Include original source photo in private handoff folder
  fs.copyFileSync(FIXTURE_PATH, path.join(REPO_HANDOFF_DIR, 'prototype_touching_subjects.jpg'));
  const srcHash = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE_PATH)).digest('hex');
  manifest.push({ file: 'prototype_touching_subjects.jpg', bytes: fs.statSync(FIXTURE_PATH).size, sha256: srcHash });

  for (const name of fileNames) {
    const srcPath = path.join(ARTIFACT_DIR, name);
    const dstPath = path.join(REPO_HANDOFF_DIR, name);
    fs.copyFileSync(srcPath, dstPath);
    const buf = fs.readFileSync(dstPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    manifest.push({ file: name, bytes: buf.length, sha256: hash });
  }

  // Also include the comparison sheet
  const csBuf = fs.readFileSync(compSheetRepoPath);
  const csHash = crypto.createHash('sha256').update(csBuf).digest('hex');
  manifest.push({ file: 'photo_review_comparison_sheet.png', bytes: csBuf.length, sha256: csHash });

  // 4. Create README.txt with checksums and provenance
  const readmeContent = [
    'STICKER STUDIO V1.2 — PHOTO MODE PHASE 2A VISUAL REVIEW HANDOFF',
    '================================================================',
    'Branch: feature/photo-cutout-stickers',
    'Date: ' + new Date().toISOString(),
    '',
    'CONTENTS AND SHA-256 CHECKSUMS:',
    '----------------------------------------------------------------',
    ...manifest.map(m => `${m.file.padEnd(35)} | ${String(m.bytes).padStart(8)} B | ${m.sha256}`),
    '',
    'ACCURATE MEASURED AUDIT SUMMARY:',
    '----------------------------------------------------------------',
    '- Person A (Father) artwork pixels:     244,944 px (RGB bit-for-bit matched)',
    '- Person B (Daughter) artwork pixels:   108,213 px (RGB bit-for-bit matched, 100% jacket core restored)',
    '- Combined A+B artwork pixels:          316,291 px (RGB bit-for-bit matched, bench erased independently)',
    '- Shared contact overlap:                31,224 px (28.85% of B, 9.70% of A|B union)',
    '  * Hands / forearms / touching skin:   16,403 px (52.5%)',
    '  * Navy sweater / arm wrapped behind:  10,362 px (33.2%)',
    '  * Contact seam ambiguity:              2,960 px (9.5%)',
    '  * Touching bench / seat shadow:        1,365 px (4.4%)',
    '  * Yellow sleeve seam:                    134 px (0.4%)',
    '',
    'INTERACTION EFFORT RECORDED:',
    '----------------------------------------------------------------',
    '- 13 prompt points placed (initial subject identification and foreign exclusion)',
    '- 5 manual brush strokes applied (1 jacket restore, 2 bench erasures, 2 seam refinements)',
    '- 1 undo/redo cycle verified (asserted foreground pixel counts: 108,213 -> 111,298 -> 108,213)',
    '- 10.5 seconds automated scripted test execution turnaround (NOT observed human session time)',
    '',
    'LOCAL HARNESS EXECUTION:',
    '----------------------------------------------------------------',
    'Command: node scripts/photo_prototype/server.cjs',
    'Address: http://127.0.0.1:3888/'
  ].join('\n');

  fs.writeFileSync(path.join(REPO_HANDOFF_DIR, 'README.txt'), readmeContent);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'README.txt'), readmeContent);

  // 5. Create ZIP Archive in both directories
  console.log('\n3. Creating ZIP archive...');
  const zipArtifactPath = path.join(ARTIFACT_DIR, 'photo_review_handoff.zip');
  const zipRepoPath = path.join(REPO_HANDOFF_DIR, 'photo_review_handoff.zip');

  async function buildZip(targetZipPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(targetZipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(archive.pointer()));
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // Add all files
      for (const m of manifest) {
        archive.file(path.join(REPO_HANDOFF_DIR, m.file), { name: m.file });
      }
      archive.file(path.join(REPO_HANDOFF_DIR, 'README.txt'), { name: 'README.txt' });
      archive.finalize();
    });
  }

  const zipBytes1 = await buildZip(zipArtifactPath);
  const zipBytes2 = await buildZip(zipRepoPath);

  const zipHash = crypto.createHash('sha256').update(fs.readFileSync(zipRepoPath)).digest('hex');

  console.log(`  Created ZIP at ${zipArtifactPath} (${zipBytes1} bytes)`);
  console.log(`  Created ZIP at ${zipRepoPath} (${zipBytes2} bytes)`);
  console.log(`  ZIP SHA-256: ${zipHash}`);

  console.log('\nPackage complete!');
}

createReviewPackage().catch(console.error);
