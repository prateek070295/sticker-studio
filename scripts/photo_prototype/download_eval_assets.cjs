const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VENDOR_DIR = path.resolve('scripts/photo_prototype/vendor');
const MODELS_DIR = path.resolve('scripts/photo_prototype/models');

if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });
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
            sha256: hash
          });
        });
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading evaluation assets...');

  const downloads = [
    // 1. MediaPipe Tasks Vision JS bundle & WASM
    {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
      dest: path.join(VENDOR_DIR, 'vision_bundle.mjs')
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js',
      dest: path.join(VENDOR_DIR, 'vision_wasm_internal.js')
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm',
      dest: path.join(VENDOR_DIR, 'vision_wasm_internal.wasm')
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.js',
      dest: path.join(VENDOR_DIR, 'vision_wasm_nosimd_internal.js')
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.wasm',
      dest: path.join(VENDOR_DIR, 'vision_wasm_nosimd_internal.wasm')
    },

    // 2. MediaPipe Selfie Segmenter Models
    {
      url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
      dest: path.join(MODELS_DIR, 'selfie_segmenter.tflite')
    },
    {
      url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
      dest: path.join(MODELS_DIR, 'selfie_segmenter_landscape.tflite')
    },
    {
      url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
      dest: path.join(MODELS_DIR, 'selfie_multiclass_256x256.tflite')
    },

    // 3. TensorFlow.js and BodyPix bundles
    {
      url: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
      dest: path.join(VENDOR_DIR, 'tf.min.js')
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.js',
      dest: path.join(VENDOR_DIR, 'body-pix.min.js')
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation@1.0.2/dist/body-segmentation.min.js',
      dest: path.join(VENDOR_DIR, 'body-segmentation.min.js')
    }
  ];

  const results = {};
  for (const item of downloads) {
    console.log(`Downloading: ${item.url}`);
    try {
      const info = await downloadFile(item.url, item.dest);
      console.log(`  ✓ Saved ${info.file} (${(info.size / 1024).toFixed(1)} KB, sha256: ${info.sha256.slice(0, 16)}...)`);
      results[info.file] = {
        sourceUrl: item.url,
        sizeBytes: info.size,
        sha256: info.sha256
      };
    } catch (err) {
      console.error(`  ✗ Error downloading ${item.url}:`, err.message);
    }
  }

  const manifestPath = path.join(MODELS_DIR, 'eval_assets_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  console.log(`\nManifest written to: ${manifestPath}`);
}

main().catch(console.error);
