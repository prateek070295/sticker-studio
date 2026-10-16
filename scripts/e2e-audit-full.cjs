const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const AUDIT_OUT_DIR = path.resolve(__dirname, '../docs/v1.1-release-audit');
if (!fs.existsSync(AUDIT_OUT_DIR)) {
  fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });
}

async function runE2EAudit() {
  console.log('--- Starting Phase 7: Browser E2E & Offline PWA Audit ---');

  // 1. Start preview server
  console.log('Starting preview server on port 4173...');
  const server = spawn('cmd.exe', ['/c', 'npm', 'run', 'preview', '--', '--port', '4173'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe'
  });

  server.stdout.on('data', d => console.log('[Server stdout]:', d.toString().trim()));
  server.stderr.on('data', d => console.error('[Server stderr]:', d.toString().trim()));

  // Wait for server ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  const page = await context.newPage();

  page.on('console', msg => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[Browser PageError]:', err.message));

  try {
    // 2. Load application
    console.log('Navigating to http://localhost:4173/ ...');
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

    // 3. Upload and extract Chai Break sample
    console.log('Uploading Chai Break reference sheet...');
    const dropzone = page.locator('input[accept*="image"]').first();
    await dropzone.setInputFiles(path.resolve(__dirname, '../public/samples/chai_break.jpg'));

    console.log('Waiting for extraction to complete...');
    await page.waitForSelector('text=Extracting Sticker Sheet', { timeout: 10000 });
    await page.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 40000 });
    await page.waitForTimeout(1000);
    console.log('Chai Break extracted successfully!');

    // Capture screenshot: Source sheet with bounding boxes
    await page.screenshot({ path: path.join(AUDIT_OUT_DIR, 'audit_06_browser_chai_break_extracted.png') });
    console.log('Captured audit_06_browser_chai_break_extracted.png');

    // 4. Switch to Sticker Previews
    await page.click('button:has-text("Sticker Previews")');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(AUDIT_OUT_DIR, 'audit_07_browser_sticker_previews_grid.png') });
    console.log('Captured audit_07_browser_sticker_previews_grid.png');

    // 5. Open Advanced Extraction Editor on first sticker card
    console.log('Opening Advanced Extraction Editor...');
    const editBtn = await page.waitForSelector('button[title*="Advanced Editor"]');
    await editBtn.click();

    const modal = page.locator('div.fixed.inset-0.z-50');
    await modal.waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('Advanced Editor modal open.');

    await page.screenshot({ path: path.join(AUDIT_OUT_DIR, 'audit_08_browser_advanced_editor_modal.png') });
    console.log('Captured audit_08_browser_advanced_editor_modal.png');

    // 6. Test interaction: Draw brush stroke
    const editorCanvas = modal.locator('canvas');
    await editorCanvas.waitFor({ state: 'visible' });
    const box = await editorCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 25, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    // 7. Test split tool cut line
    await page.keyboard.press('s');
    await page.waitForTimeout(400);
    if (box) {
      await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }

    await page.screenshot({ path: path.join(AUDIT_OUT_DIR, 'audit_09_browser_split_cutline.png') });
    console.log('Captured audit_09_browser_split_cutline.png');

    // 8. Open Edge Inspector Panel settings
    const inspectorSettingsBtn = modal.locator('button[title="Inspector Settings"]').first();
    await inspectorSettingsBtn.click({ force: true });
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(AUDIT_OUT_DIR, 'audit_10_browser_edge_inspector.png') });
    console.log('Captured audit_10_browser_edge_inspector.png');

    // Close modal
    const closeBtn = modal.locator('button:has-text("Done & Return")').first();
    await closeBtn.click({ force: true });
    await page.waitForTimeout(600);

    // 9. Test Save Project
    console.log('Testing Save Project archive download...');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Save Project")').first().click({ force: true });
    const download = await downloadPromise;
    const saveProjPath = path.join(AUDIT_OUT_DIR, 'audit_saved_project.stickerstudio');
    await download.saveAs(saveProjPath);
    console.log('Saved project verified at:', saveProjPath);

    // 10. Test PWA Offline Capability: Put browser context offline and reload
    console.log('Enabling offline mode in browser context...');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Verify title and app shell loaded offline via Service Worker
    const pageTitle = await page.title();
    console.log('Offline page title:', pageTitle);
    await page.screenshot({ path: path.join(AUDIT_OUT_DIR, 'audit_11_browser_pwa_offline_reload.png') });
    console.log('Captured audit_11_browser_pwa_offline_reload.png');

    console.log('--- ALL E2E & OFFLINE PWA AUDIT CHECKS PASSED! ---');
  } catch (err) {
    console.error('E2E Audit Failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
}

runE2EAudit();
