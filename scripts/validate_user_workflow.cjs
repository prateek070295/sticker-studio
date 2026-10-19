const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');

const PORT = 3896;
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
  '.tflite': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');

      let cleanUrl = req.url.split('?')[0];
      if (cleanUrl === '/' || cleanUrl === '/app' || cleanUrl === '/app/') {
        cleanUrl = '/dist/index.html';
      }

      let filePath;
      if (
        cleanUrl.startsWith('/assets/') ||
        cleanUrl.startsWith('/mediapipe/') ||
        cleanUrl.startsWith('/samples/') ||
        cleanUrl === '/dist/index.html' ||
        cleanUrl === '/sw.js' ||
        cleanUrl.startsWith('/workbox-') ||
        cleanUrl === '/manifest.webmanifest' ||
        cleanUrl === '/favicon.ico'
      ) {
        filePath = path.join(ROOT, cleanUrl.startsWith('/dist/') ? cleanUrl : path.join('dist', cleanUrl));
      } else {
        filePath = path.join(ROOT, cleanUrl);
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end('Not found: ' + cleanUrl);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(PORT, () => {
      console.log('[Workflow Server] Running on http://127.0.0.1:' + PORT);
      resolve(server);
    });
  });
}

async function runWorkflowValidation() {
  console.log('================================================================');
  console.log('STICKER STUDIO V1.4 ? END-TO-END BROWSER WORKFLOW VALIDATION');
  console.log('================================================================\n');

  const server = await startServer();

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox', '--disable-web-security']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Cartoon') || text.includes('[DEBUG') || text.includes('error') || text.includes('Error')) {
      console.log('    [Browser Console] ' + text);
    }
  });

  try {
    console.log('[Step 1] Navigating to http://127.0.0.1:' + PORT + '/app#cartoon ...');
    await page.goto('http://127.0.0.1:' + PORT + '/app#cartoon', { waitUntil: 'networkidle' });

    const headerText = await page.textContent('h1');
    console.log('  ? Loaded Cartoon Mode view: ' + headerText);
    if (!headerText.includes('Personalized Cartoon Stickers')) {
      throw new Error('Unexpected header title: ' + headerText);
    }

    console.log('\n[Step 2] Uploading selfie photo: alex_pretti_glasses.jpg ...');
    const photoPath = path.resolve('test-output/actual_portraits/alex_pretti_glasses.jpg');
    if (!fs.existsSync(photoPath)) throw new Error('Photo fixture missing: ' + photoPath);

    const fileInput = await page.$('input[type="file"][accept*="image"]');
    if (!fileInput) throw new Error('File input missing');
    await fileInput.setInputFiles(photoPath);

    console.log('[Step 3] Waiting for AI inference and 3-layer composition...');
    await page.waitForSelector('canvas', { timeout: 25000 });
    await page.waitForTimeout(2000);

    const canvasInfo = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { width: c.width, height: c.height } : null;
    });
    console.log('  ? Interactive stage canvas rendered: ' + canvasInfo?.width + 'x' + canvasInfo?.height);

    console.log('\n[Step 4] Adjusting interactive placement sliders (Scale, Tilt, Hair Layering)...');
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const s = document.querySelector('input[type="range"][min="0.5"]');
      if (s && setter) {
        setter.call(s, '1.14');
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const r = document.querySelector('input[type="range"][min="-45"]');
      if (r && setter) {
        setter.call(r, '5');
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const hairBtn = await page.$('button:has-text("Over Torso"), button:has-text("Behind Torso")');
    if (hairBtn) {
      const t1 = await hairBtn.textContent();
      await hairBtn.click();
      await page.waitForTimeout(300);
      const t2 = await hairBtn.textContent();
      console.log('  ? Hair placement toggled: ' + t1 + ' -> ' + t2);
    }

    await page.waitForTimeout(500);

    console.log('\n[Step 5] Triggering "Save .stickerstudio Project" ...');
    const [downloadSave] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Save .stickerstudio Project")')
    ]);

    const saveFilename = downloadSave.suggestedFilename();
    const saveFilePath = path.resolve('test-output/cartoon_acceptance', saveFilename);
    await downloadSave.saveAs(saveFilePath);
    console.log('  ? Downloaded project file: ' + saveFilename + ' (' + fs.statSync(saveFilePath).size + ' bytes)');

    const projectData = JSON.parse(fs.readFileSync(saveFilePath, 'utf8'));
    console.log('    - appMode: ' + projectData.appMode);
    console.log('    - templateId: ' + projectData.templateId);
    console.log('    - scale: ' + projectData.headTransform?.scale);
    console.log('    - rotation: ' + projectData.headTransform?.rotationDegrees);

    if (projectData.appMode !== 'cartoon') throw new Error('Not cartoon mode in project');
    if (projectData.templateId !== 'hi-waving-01') throw new Error('Template mismatch');

    console.log('\n[Step 6] Reloading browser to clear state, then opening saved project...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const projectInput = await page.$('input[accept*=".stickerstudio"]');
    if (!projectInput) throw new Error('Project input missing');
    await projectInput.setInputFiles(saveFilePath);

    console.log('  Waiting for project restoration and re-composition...');
    await page.waitForSelector('canvas', { timeout: 25000 });
    await page.waitForTimeout(1000);

    const restoredValues = await page.evaluate(() => {
      const s = document.querySelector('input[type="range"][min="0.5"]');
      const r = document.querySelector('input[type="range"][min="-45"]');
      return { scale: s ? parseFloat(s.value) : null, tilt: r ? parseFloat(r.value) : null };
    });
    console.log('  ✓ Restored transform: Scale = ' + restoredValues.scale + ', Tilt = ' + restoredValues.tilt + '°');
    if (Math.abs(restoredValues.scale - 1.14) > 0.05) {
      throw new Error('Scale was not restored accurately: ' + restoredValues.scale);
    }

    console.log('\n[Step 7] Testing PNG exports...');
    const [downloadSticker] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export Sticker (White Backed)")')
    ]);
    const stickerFile = path.resolve('test-output/cartoon_acceptance/workflow_exported_sticker.png');
    await downloadSticker.saveAs(stickerFile);
    console.log('  ? Exported White-Backed Sticker PNG: ' + fs.statSync(stickerFile).size + ' bytes');

    const [downloadArtwork] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export Artwork Only (Transparent)")')
    ]);
    const artworkFile = path.resolve('test-output/cartoon_acceptance/workflow_exported_artwork.png');
    await downloadArtwork.saveAs(artworkFile);
    console.log('  ? Exported Transparent Artwork PNG: ' + fs.statSync(artworkFile).size + ' bytes');

    console.log('\n================================================================');
    console.log('? ALL 7 WORKFLOW PHASES PASSED SUCCESSFULLY');
    console.log('================================================================\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runWorkflowValidation().catch((err) => {
  console.error('[Workflow Validation Failed]:', err);
  process.exit(1);
});
