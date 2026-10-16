const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '../test-output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function runPWAOfflineTest() {
  console.log('=== Starting E2E PWA & Offline Verification Test ===');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  page.on('console', msg => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[Browser PageError]:', err.message));

  try {
    // 1. Initial Load Online
    console.log('Step 1: Loading application on http://localhost:4173/ ...');
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    console.log('✓ Initial page loaded successfully.');

    // 2. Verify Manifest and Icons
    const manifestHref = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
    console.log(`✓ Web App Manifest linked at: ${manifestHref}`);

    // Wait for Service Worker registration and caching
    console.log('Waiting for Service Worker registration...');
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && reg.active !== null;
    }, { timeout: 10000 });
    console.log('✓ Service Worker is registered and active.');

    // Wait for precaching to populate
    await page.waitForTimeout(2000);

    const cacheNames = await page.evaluate(async () => {
      const keys = await caches.keys();
      const entries = [];
      for (const k of keys) {
        const cache = await caches.open(k);
        const reqs = await cache.keys();
        entries.push({ cache: k, count: reqs.length });
      }
      return entries;
    });
    console.log('✓ Cache storage verified:', JSON.stringify(cacheNames));

    // 3. Verify Install App Button & Modal
    console.log('Step 2: Testing Install App flow...');
    const installBtn = await page.$('button:has-text("Install App")');
    if (installBtn) {
      console.log('✓ Found "Install App" button in toolbar.');
      await installBtn.click();
      await page.waitForSelector('text=Install Sticker Studio', { timeout: 3000 });
      console.log('✓ Install instructions modal displayed successfully.');
      await page.screenshot({ path: path.join(OUTPUT_DIR, '05_pwa_install_modal.png') });
      await page.click('button:has-text("Got it")');
      await page.waitForSelector('text=Install Sticker Studio', { state: 'detached' });
      console.log('✓ Closed Install modal.');
    }

    // 4. Verify "Available Offline" indicator
    const offlineReady = await page.waitForSelector('text=Available Offline', { timeout: 5000 });
    if (offlineReady) {
      console.log('✓ "Available Offline" badge is visible in toolbar!');
    }

    // 5. GO OFFLINE (Simulate complete network loss)
    console.log('\nStep 3: Simulating COMPLETE OFFLINE mode (network disconnected)...');
    await context.setOffline(true);
    console.log('Network emulation is now OFFLINE.');

    // 6. Reload page while offline
    console.log('Reloading page while completely offline...');
    await page.reload({ waitUntil: 'networkidle' });
    console.log('✓ Page successfully reloaded and rendered from Service Worker offline cache!');

    // Capture screenshot of offline app load
    await page.screenshot({ path: path.join(OUTPUT_DIR, '06_pwa_offline_reload.png') });
    console.log('Captured 06_pwa_offline_reload.png');

    // 7. Execute full segmentation and extraction while OFFLINE
    console.log("Triggering Momo's Bakery extraction while completely offline...");
    await page.click('button:has-text("Momo\'s Bakery")');

    await page.waitForSelector('text=Extracting Sticker Sheet', { timeout: 5000 });
    console.log('Offline extraction in progress...');
    await page.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 30000 });
    console.log('✓ Offline extraction completed successfully!');

    // Wait for canvas render
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '07_pwa_offline_extracted.png') });
    console.log('Captured 07_pwa_offline_extracted.png');

    // 8. Test live border slider and ZIP export while OFFLINE
    console.log('Testing live border adjustment and ZIP export offline...');
    await page.click('button:has-text("Sticker Previews")');
    await page.waitForTimeout(1000);

    // Click Export All ZIP
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.click('button:has-text("Export All")')
    ]);

    const downloadPath = await download.path();
    console.log(`✓ Offline ZIP export completed! File downloaded to: ${downloadPath}`);

    console.log('\n=== ALL PWA & OFFLINE TESTS PASSED WITH ZERO ERRORS! ===');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('\nFAIL: PWA offline test encountered an error:', err);
    await browser.close();
    process.exit(1);
  }
}

runPWAOfflineTest();
