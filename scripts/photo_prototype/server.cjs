const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
const ROOT = path.resolve('.');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.onnx': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};

function createServer() {
  const server = http.createServer((req, res) => {
    // Cross-Origin Isolation headers for SharedArrayBuffer / multi-threaded WASM
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    let cleanUrl = req.url.split('?')[0];
    if (cleanUrl === '/app' || cleanUrl === '/app/') {
      cleanUrl = '/dist/index.html';
    } else if (cleanUrl === '/' || cleanUrl === '') {
      cleanUrl = '/scripts/photo_prototype/index.html';
    }

    let filePath;
    if (
      cleanUrl.startsWith('/assets/') ||
      cleanUrl.startsWith('/mediapipe/') ||
      cleanUrl.startsWith('/samples/') ||
      cleanUrl === '/sw.js' ||
      cleanUrl.startsWith('/workbox-') ||
      cleanUrl === '/manifest.webmanifest' ||
      cleanUrl === '/favicon.ico'
    ) {
      filePath = path.join(ROOT, 'dist', cleanUrl);
    } else if (cleanUrl.startsWith('/vendor/')) {
      const rel = cleanUrl.replace('/vendor/', '');
      filePath = path.join(ROOT, 'scripts/photo_prototype/vendor', rel);
    } else if (cleanUrl.startsWith('/eval-models/')) {
      const rel = cleanUrl.replace('/eval-models/', '');
      filePath = path.join(ROOT, 'scripts/photo_prototype/models', rel);
    } else if (cleanUrl.startsWith('/models/') || cleanUrl.startsWith('/Xenova/')) {
      // Map any model request to the cached slimsam directory files
      const parts = cleanUrl.split('/');
      let rel;
      if (cleanUrl.includes('/onnx/')) {
        rel = 'onnx/' + parts[parts.length - 1];
      } else {
        rel = parts[parts.length - 1];
      }
      filePath = path.join(ROOT, 'node_modules/@huggingface/transformers/.cache/Xenova/slimsam-77-uniform/5850ab45f587c112167512ffef949107115e26a0', rel);
    } else if (cleanUrl.startsWith('/ort/')) {
      // Map to onnxruntime-web dist
      const rel = cleanUrl.replace('/ort/', '');
      filePath = path.join(ROOT, 'node_modules/onnxruntime-web/dist', rel);
    } else if (cleanUrl.startsWith('/transformers/')) {
      const rel = cleanUrl.replace('/transformers/', '');
      filePath = path.join(ROOT, 'node_modules/@huggingface/transformers/dist', rel);
    } else if (cleanUrl.startsWith('/fixtures/')) {
      const rel = cleanUrl.replace('/fixtures/', '');
      filePath = path.join(ROOT, '.test-fixtures', rel);
    } else {
      filePath = path.join(ROOT, cleanUrl);
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end(`Not found: ${cleanUrl}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  return server;
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Prototype server running at http://127.0.0.1:${PORT}/`);
  });
}

module.exports = { createServer, PORT };
