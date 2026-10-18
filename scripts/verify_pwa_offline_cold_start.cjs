const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const sharp = require('C:/Users/prate/Documents/ReputIQ/node_modules/sharp');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
const FIXTURES_DIR = path.resolve('.test-fixtures');
const USER_DATA_DIR = path.resolve('test-output/pwa_offline_user_data');
const TMP_DIR = path.resolve('test-output/pwa_offline_cold_start');

if (fs.existsSync(USER_DATA_DIR)) {
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(USER_DATA_DIR, { recursive: true });

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve();
        } else {
          setTimeout(ping, 250);
        }
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for preview server at ${url}`));
        } else {
          setTimeout(ping, 250);
        }
      });
    }
    ping();
  });
}

async function runPwaOfflineColdStartTest() {
  console.log('================================================================');
  console.log('INSTALLED PWA OFFLINE COLD-START ACCEPTANCE TEST');
  console.log('================================================================\n');

  // Start Vite preview
  console.log(`Starting Vite production preview on port ${PREVIEW_PORT}...`);
  const previewProcess = spawn('npx.cmd', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: path.resolve('.'),
    stdio: 'pipe',
    shell: true,
  });

  try {
    await waitForServer(PREVIEW_URL, 20000);
    console.log(`Preview server ready at ${PREVIEW_URL}\n`);

    // -------------------------------------------------------------
    // PHASE 1: Online Prime & Sheet Mode Precache Audit
    // -------------------------------------------------------------
    console.log('--- Phase 1: Online Prime & Precache Audit ---');
    let onlineContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: true,
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
    });

    const networkRequests = [];
    onlineContext.on('request', (req) => {
      networkRequests.push(req.url());
    });

    let page = await onlineContext.newPage();
    console.log('Visiting Sheet Mode online...');
    await page.goto(PREVIEW_URL);
    await page.waitForLoadState('networkidle');

    // Wait for ServiceWorker registration and activation
    console.log('Awaiting ServiceWorker activation...');
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('ServiceWorker not supported in browser');
      await navigator.serviceWorker.ready;
    });
    await page.waitForTimeout(1500);

    // Measure Sheet Mode requests
    const modelRequestsInSheetMode = networkRequests.filter(url => url.endsWith('.tflite') || url.endsWith('.wasm'));
    console.log(`Sheet Mode neural model requests (Expected: 0): ${modelRequestsInSheetMode.length}`);
    if (modelRequestsInSheetMode.length > 0) {
      throw new Error(`Sheet Mode precache violated: downloaded ${modelRequestsInSheetMode.length} model files!`);
    }
    console.log('PASS: Sheet Mode initiates 0 bytes of Photo Mode neural models.\n');

    // Now visit Photo Mode to prime the runtime cache
    console.log('Navigating to Photo Mode to prime optional runtime cache...');
    await page.locator('button:has-text("Photo Mode")').click();

    // Import first photo to trigger model fetch into ServiceWorker CacheFirst cache
    const primePhoto = path.join(FIXTURES_DIR, 'eval_photo_1_beach_family.jpg');
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(primePhoto);
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Click detect people to ensure detector + segmenter WASM and TFLite are loaded and cached
    console.log('Triggering detection to populate ServiceWorker runtime cache...');
    await page.locator('button:has-text("Detect People")').click();
    await page.waitForSelector('text=People (', { timeout: 30000 });

    // Verify cache in CacheStorage
    const cachesList = await page.evaluate(async () => {
      const keys = await caches.keys();
      const entries = {};
      for (const k of keys) {
        const c = await caches.open(k);
        const reqs = await c.keys();
        entries[k] = reqs.map(r => r.url);
      }
      return entries;
    });
    console.log('ServiceWorker Caches Populated:');
    for (const [cName, urls] of Object.entries(cachesList)) {
      console.log(`  - Cache: ${cName} (${urls.length} entries)`);
    }

    // Close the browser completely to kill all in-memory processes and memory caches
    console.log('\nClosing browser context to simulate complete process exit...');
    await onlineContext.close();
    onlineContext = null;
    page = null;
    await new Promise(r => setTimeout(r, 1000));

    // -------------------------------------------------------------
    // PHASE 2: Disconnected Cold-Start Offline Launch
    // -------------------------------------------------------------
    console.log('\n--- Phase 2: Disconnected Cold-Start Offline Verification ---');
    console.log('Launching fresh browser session with offline: true (network disconnected)...');

    const offlineContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: true,
      viewport: { width: 1440, height: 960 },
      acceptDownloads: true,
      offline: true, // Complete network disconnection
      args: ['--enable-features=SharedArrayBuffer', '--no-sandbox'],
    });

    const offlinePage = await offlineContext.newPage();
    offlinePage.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('WebGL') && !txt.includes('XNNPACK')) {
        console.log(`  [Offline Browser Console] ${txt}`);
      }
    });

    console.log('Loading app offline from ServiceWorker precache...');
    await offlinePage.goto(PREVIEW_URL, { waitUntil: 'load' });
    console.log('PASS: Application loaded successfully offline!');

    // Switch to Photo Mode offline
    await offlinePage.locator('button:has-text("Photo Mode")').click();

    // Import a PREVIOUSLY UNSEEN photo while completely offline
    const unseenPhoto = path.join(FIXTURES_DIR, 'eval_photo_2_indoor_family.jpg');
    console.log(`Importing unseen photo while offline: ${unseenPhoto}...`);
    const offlineFileInput = offlinePage.locator('input[type="file"][accept*="image"]').first();
    await offlineFileInput.setInputFiles(unseenPhoto);
    await offlinePage.waitForSelector('canvas', { timeout: 10000 });

    // Run Detection & Segmentation while completely offline
    console.log('Running detection and segmentation completely offline...');
    await offlinePage.locator('button:has-text("Detect People")').click();
    await offlinePage.waitForSelector('text=People (', { timeout: 30000 });

    const offlineCount = await offlinePage.locator('.max-h-44 > div').count();
    console.log(`Offline detected people count: ${offlineCount} (Expected: >= 4)`);
    if (offlineCount < 4) {
      throw new Error(`Offline detection failed: got ${offlineCount} people`);
    }

    // Export sticker and save project while offline
    console.log('Exporting white-backed sticker PNG while offline...');
    const wbDownloadPromise = offlinePage.waitForEvent('download');
    await offlinePage.locator('div.border-t button:has-text("Export Sticker PNG")').click();
    const wbDownload = await wbDownloadPromise;
    const offlineWbPath = path.join(TMP_DIR, 'offline_exported_sticker.png');
    await wbDownload.saveAs(offlineWbPath);
    console.log(`Exported sticker offline: ${offlineWbPath} (${fs.statSync(offlineWbPath).size} bytes)`);

    console.log('Saving photo project (.stickerstudio) while offline...');
    const projDownloadPromise = offlinePage.waitForEvent('download');
    await offlinePage.locator('button:has-text("Save Photo Project")').click();
    const projDownload = await projDownloadPromise;
    const offlineProjPath = path.join(TMP_DIR, 'offline_project.stickerstudio');
    await projDownload.saveAs(offlineProjPath);
    console.log(`Saved project offline: ${offlineProjPath} (${fs.statSync(offlineProjPath).size} bytes)`);

    // Reload page while offline and reopen project
    console.log('Reloading application while offline...');
    await offlinePage.reload();
    await offlinePage.waitForLoadState('load');

    await offlinePage.locator('button:has-text("Photo Mode")').click();
    const offlineProjInput = offlinePage.locator('input[type="file"][accept*=".stickerstudio"]').first();
    await offlineProjInput.setInputFiles(offlineProjPath);

    await offlinePage.waitForSelector('text=People (', { timeout: 10000 });
    const reloadedOfflineCount = await offlinePage.locator('.max-h-44 > div').count();
    console.log(`Reloaded offline candidate count: ${reloadedOfflineCount} (Expected: ${offlineCount})`);
    if (reloadedOfflineCount !== offlineCount) {
      throw new Error(`Reloaded offline project mismatch: got ${reloadedOfflineCount}, expected ${offlineCount}`);
    }

    await offlineContext.close();
    console.log('\n================================================================');
    console.log('PASS: INSTALLED PWA OFFLINE COLD-START VERIFIED (EXIT 0)');
    console.log('================================================================\n');
  } finally {
    previewProcess.kill();
  }
}

runPwaOfflineColdStartTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFAIL: PWA Offline Cold-Start Test Failed:', err);
    process.exit(1);
  });
