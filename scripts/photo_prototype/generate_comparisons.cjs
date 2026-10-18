const fs = require('fs');
const path = require('path');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const ARTIFACT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');
const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');

async function main() {
  console.log('Generating face/detail comparison crops and overlay images...');

  // 1. Generate dark and light background previews for each white-backed sticker
  for (const name of ['person_a_white_backed', 'person_b_white_backed', 'combined_ab_white_backed']) {
    const pngPath = path.join(ARTIFACT_DIR, `${name}.png`);
    const pngMeta = await sharp(pngPath).metadata();

    // Dark background (#18181b)
    await sharp({
      create: {
        width: pngMeta.width,
        height: pngMeta.height,
        channels: 4,
        background: { r: 24, g: 24, b: 27, alpha: 1 }
      }
    })
    .composite([{ input: pngPath }])
    .png()
    .toFile(path.join(ARTIFACT_DIR, `${name}_on_dark.png`));

    // Light background (#f4f4f5)
    await sharp({
      create: {
        width: pngMeta.width,
        height: pngMeta.height,
        channels: 4,
        background: { r: 244, g: 244, b: 245, alpha: 1 }
      }
    })
    .composite([{ input: pngPath }])
    .png()
    .toFile(path.join(ARTIFACT_DIR, `${name}_on_light.png`));
  }

  // 2. Generate tight face crops for Person A (Father glasses/face) and Person B (Daughter wavy hair/face)
  // Person A face center: (375, 320) -> crop 200x200 [x: 275, y: 220, w: 200, h: 200]
  // Extract from original source:
  await sharp(FIXTURE_PATH)
    .extract({ left: 275, top: 220, width: 200, height: 200 })
    .png()
    .toFile(path.join(ARTIFACT_DIR, 'crop_father_face_source.png'));

  // Extract from Person A white-backed export:
  // In Person A export: bounds.x = 227, bounds.y = 80, crop origin = (223, 76)
  // local (275, 220) maps to export (275 - 223, 220 - 76) = (52, 144)
  const aMeta = await sharp(path.join(ARTIFACT_DIR, 'person_a_white_backed.png')).metadata();
  console.log('Person A WB meta:', aMeta.width, aMeta.height);

  // Person B face center: (580, 440) -> crop 200x200 [x: 480, y: 340, w: 200, h: 200]
  await sharp(FIXTURE_PATH)
    .extract({ left: 480, top: 340, width: 200, height: 200 })
    .png()
    .toFile(path.join(ARTIFACT_DIR, 'crop_daughter_face_source.png'));

  console.log('Comparisons successfully generated!');
}

main().catch(console.error);
