const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELS_DIR = path.resolve('scripts/photo_prototype/models');
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const u = new URL(url);
          redirectUrl = u.origin + redirectUrl;
        }
        return resolve(downloadFile(redirectUrl, destPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          const buffer = fs.readFileSync(destPath);
          const hash = crypto.createHash('sha256').update(buffer).digest('hex');
          resolve({
            file: path.basename(destPath),
            size: buffer.length,
            sha256: hash,
          });
        });
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading Phase 2 models (DeepLabV3 and EfficientDet-Lite0 Object Detector)...');

  const models = [
    {
      name: 'DeepLab-v3 Image Segmenter (Pascal VOC)',
      url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
      dest: path.join(MODELS_DIR, 'deeplab_v3.tflite'),
    },
    {
      name: 'EfficientDet-Lite0 Object Detector',
      url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
      dest: path.join(MODELS_DIR, 'efficientdet_lite0.tflite'),
    },
  ];

  for (const m of models) {
    if (fs.existsSync(m.dest) && fs.statSync(m.dest).size > 1000) {
      console.log(`✓ ${m.name} already exists (${(fs.statSync(m.dest).size / 1024 / 1024).toFixed(2)} MB). Skipping.`);
      continue;
    }
    console.log(`Downloading ${m.name} from: ${m.url}...`);
    const res = await downloadFile(m.url, m.dest);
    console.log(`✓ Downloaded ${res.file} (${(res.size / 1024 / 1024).toFixed(2)} MB, SHA-256: ${res.sha256})`);
  }

  console.log('\nAll models downloaded successfully.');
}

main().catch(console.error);
