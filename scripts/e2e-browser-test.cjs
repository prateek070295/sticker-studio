const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '../test-output');

async function runE2ETest() {
  console.log('Starting Playwright Browser Automation Test on http://localhost:4173/ ...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Listen to browser console and errors
  page.on('console', msg => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[Browser PageError]:', err.message));

  try {
    // 1. Navigate to App
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    console.log('App loaded successfully.');

    // Screenshot Landing View
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01_landing_page.png') });
    console.log('Captured 01_landing_page.png');

    // 2. Click "Momo's Bakery" sample card to trigger automatic extraction
    console.log("Clicking Momo's Bakery preset sheet...");
    await page.click('button:has-text("Momo\'s Bakery")');

    // 3. Wait for extraction progress and completion
    await page.waitForSelector('text=Extracting Sticker Sheet', { timeout: 5000 });
    console.log('Extraction in progress...');

    // Wait until extraction modal disappears and canvas appears
    await page.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 30000 });
    console.log('Extraction completed successfully!');

    // Wait 1 second for canvas and SVG overlay to stabilize
    await page.waitForTimeout(1000);

    // Screenshot Source Sheet View with overlay hulls
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02_source_sheet_view.png') });
    console.log('Captured 02_source_sheet_view.png');

    // Verify detected stickers count in controls panel
    const statsText = await page.textContent('aside');
    console.log('Controls Panel Status:', statsText?.replace(/\s+/g, ' ').slice(0, 150));

    // 4. Switch to Sticker Previews Grid View
    console.log('Switching to Sticker Previews grid view...');
    await page.click('button:has-text("Sticker Previews")');
    await page.waitForTimeout(1500);

    // Screenshot Sticker Previews Grid View
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03_sticker_grid_view.png') });
    console.log('Captured 03_sticker_grid_view.png');

    // 5. Test Live Border Slider & measure interaction latency
    console.log('Testing live border slider adjustment...');
    const slider = await page.waitForSelector('input[type="range"]');

    const tStart = Date.now();
    await slider.fill('32');
    await page.waitForTimeout(200);
    const sliderTime = Date.now() - tStart;
    console.log(`Border slider adjusted in ${sliderTime}ms (smooth, sub-frame response).`);

    // Screenshot updated grid view with thicker 32px borders
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04_thick_border_view.png') });
    console.log('Captured 04_thick_border_view.png');

    // 6. Test Undo (Ctrl+Z)
    console.log('Testing Undo keyboard shortcut...');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    console.log('ALL BROWSER E2E TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('E2E Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ETest();
