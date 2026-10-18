const { SamModel, AutoProcessor, RawImage, env } = require('@huggingface/transformers');
const path = require('path');
const fs = require('fs');

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.cacheDir = path.resolve('node_modules/@huggingface/transformers/.cache');

const FIXTURE_PATH = path.resolve('.test-fixtures/prototype_touching_subjects.jpg');
const DIAG_DIR = path.resolve('docs/diagnosis_photo_cutout');

async function diagnose() {
  if (!fs.existsSync(DIAG_DIR)) fs.mkdirSync(DIAG_DIR, { recursive: true });

  console.log('=== STAGE 1: LOADING MODEL & PROCESSOR ===');
  const model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform', {
    dtype: 'q8',
    revision: '5850ab45f587c112167512ffef949107115e26a0'
  });
  const processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform', {
    revision: '5850ab45f587c112167512ffef949107115e26a0'
  });
  console.log('Model and processor loaded.');

  console.log('\n=== STAGE 2: PREPROCESSING SOURCE IMAGE ===');
  const image = await RawImage.read(FIXTURE_PATH);
  console.log('Original image dimensions:', { width: image.width, height: image.height, channels: image.channels });

  const imageInputs = await processor(image);
  console.log('imageInputs.original_sizes:', imageInputs.original_sizes);
  console.log('imageInputs.reshaped_input_sizes:', imageInputs.reshaped_input_sizes);
  console.log('pixel_values dims:', imageInputs.pixel_values.dims);

  console.log('\n=== STAGE 3: ENCODING IMAGE EMBEDDINGS ===');
  const imageEmbeddings = await model.get_image_embeddings(imageInputs);
  console.log('image_embeddings dims:', imageEmbeddings.image_embeddings.dims);

  const subjects = [
    {
      name: 'Person_A_Father',
      // Prompts used in harness:
      points: [[375, 320], [360, 480], [290, 550], [580, 440], [580, 600], [520, 520]],
      labels: [1, 1, 1, 0, 0, 0],
    },
    {
      name: 'Person_B_Daughter',
      // Prompts used in harness:
      points: [[580, 440], [580, 600], [640, 500], [375, 320], [360, 480], [460, 500]],
      labels: [1, 1, 1, 0, 0, 0],
    }
  ];

  const W = image.width;
  const H = image.height;
  const outputData = {
    imageWidth: W,
    imageHeight: H,
    subjects: {},
  };

  for (const subj of subjects) {
    console.log(`\n======================================================`);
    console.log(`DIAGNOSING: ${subj.name}`);
    console.log(`======================================================`);

    const input_points = [subj.points];
    const input_labels = [subj.labels];

    console.log('Raw prompt points passed to processor:', input_points);
    console.log('Raw prompt labels passed to processor:', input_labels);

    const prompt_inputs = await processor(image, { input_points, input_labels });
    console.log('Reshaped input_points dims:', prompt_inputs.input_points.dims);
    console.log('Reshaped input_points values (first 3):', Array.from(prompt_inputs.input_points.data.slice(0, 6)));
    console.log('Reshaped input_labels dims:', prompt_inputs.input_labels.dims);

    const outputs = await model({
      ...imageEmbeddings,
      input_points: prompt_inputs.input_points,
      input_labels: prompt_inputs.input_labels,
    });

    console.log('outputs.pred_masks dims:', outputs.pred_masks.dims);
    console.log('outputs.iou_scores dims:', outputs.iou_scores.dims);
    console.log('outputs.iou_scores values:', Array.from(outputs.iou_scores.data));

    const postMasks = await processor.post_process_masks(
      outputs.pred_masks,
      imageInputs.original_sizes,
      imageInputs.reshaped_input_sizes
    );

    console.log('post_process_masks count:', postMasks.length);
    console.log('postMasks[0] dims:', postMasks[0].dims);
    console.log('postMasks[0] data length:', postMasks[0].data.length);

    const dims = postMasks[0].dims;
    const numCandidates = dims[dims.length - 3] || 3;
    const maskH = dims[dims.length - 2];
    const maskW = dims[dims.length - 1];
    const maskSize = maskH * maskW;

    const iouScores = Array.from(outputs.iou_scores.data);
    const candList = [];

    for (let c = 0; c < numCandidates; c++) {
      const offset = c * maskSize;
      const subMask = postMasks[0].data.slice(offset, offset + maskSize);

      let pxCount = 0;
      let minX = W, maxX = 0, minY = H, maxY = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = y * W + x;
          if (subMask[idx] === 1) {
            pxCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      console.log(`\n  Candidate ${c}:`);
      console.log(`    Predicted Quality Score: ${iouScores[c]}`);
      console.log(`    Pixel Count: ${pxCount} px (${((pxCount / (W * H)) * 100).toFixed(2)}% of image)`);
      console.log(`    Bounding Box: [x: ${minX}..${maxX}, y: ${minY}..${maxY}]`);

      // Write mask as binary file
      const maskBinPath = path.join(DIAG_DIR, `${subj.name}_cand_${c}.bin`);
      fs.writeFileSync(maskBinPath, Buffer.from(subMask));

      candList.push({
        candidateIndex: c,
        score: iouScores[c],
        pixelCount: pxCount,
        bounds: { minX, maxX, minY, maxY },
        maskBinFile: `${subj.name}_cand_${c}.bin`,
      });
    }

    outputData.subjects[subj.name] = {
      prompts: { points: subj.points, labels: subj.labels },
      candidates: candList,
    };
  }

  fs.writeFileSync(path.join(DIAG_DIR, 'candidates_meta.json'), JSON.stringify(outputData, null, 2));
  console.log(`\nAll candidate masks written to ${DIAG_DIR}`);
}

diagnose().catch(console.error);
