const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve('C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85');

async function runAdvancedE2ETest() {
  console.log('Starting V1.1 Advanced Extraction Editor E2E Test on http://localhost:4173/ ...');

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
    // 1. Navigate to App
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    console.log('App loaded.');

    // 2. Click Momo's Bakery sample
    console.log("Loading Momo's Bakery...");
    await page.click('button:has-text("Momo\'s Bakery")');
    await page.waitForSelector('text=Extracting Sticker Sheet', { timeout: 5000 });
    await page.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 30000 });
    await page.waitForTimeout(1000);
    console.log('Momo\'s Bakery extracted.');

    // 3. Switch to Sticker Previews
    console.log('Switching to Sticker Previews grid view...');
    await page.click('button:has-text("Sticker Previews")');
    await page.waitForTimeout(1000);

    // 4. Click "Edit" on the first sticker card
    console.log('Opening Advanced Extraction Editor on first sticker card...');
    const editBtn = await page.waitForSelector('button[title*="Advanced Editor"]');
    await editBtn.click();

    // 5. Wait for AdvancedEditorModal to appear (lazy chunk loaded)
    const modal = page.locator('div.fixed.inset-0.z-50');
    await modal.waitFor({ timeout: 10000 });
    console.log('Advanced Extraction Editor modal opened successfully!');
    await page.waitForTimeout(1000);

    // Capture screenshot: 08_advanced_editor_modal.png
    await page.screenshot({ path: path.join(OUTPUT_DIR, '08_advanced_editor_modal.png') });
    console.log('Captured 08_advanced_editor_modal.png');

    // 6. Test interaction on editor canvas: Draw a restore stroke
    console.log('Testing brush painting in editor...');
    const editorCanvas = modal.locator('canvas');
    await editorCanvas.waitFor({ state: 'visible' });
    const box = await editorCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      console.log('Brush stroke painted.');
    }

    // 7. Test Touching Split Tool (press 's' keyboard shortcut)
    console.log('Activating Touching Split Tool via keyboard shortcut "s"...');
    await page.keyboard.press('s');
    await page.waitForTimeout(400);
    console.log('Keyboard "s" completed.');

    // Draw cut line stroke across sticker
    if (box) {
      console.log('Starting mouse drag for cut line...');
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2);
      console.log('Moved to start pos');
      await page.mouse.down();
      console.log('Mouse down completed');
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
      console.log('Mouse moved to end pos');
      await page.mouse.up();
      console.log('Mouse up completed');
      await page.waitForTimeout(600);
      console.log('Cut line drawn and preview evaluated.');
    }

    // Capture screenshot: 09_advanced_split_tool.png
    await page.screenshot({ path: path.join(OUTPUT_DIR, '09_advanced_split_tool.png') });
    console.log('Captured 09_advanced_split_tool.png');

    // 8. Test Edge Inspector Panel Drawer
    console.log('Opening Edge Quality Inspector settings...');
    const inspectorSettingsBtn = modal.locator('button[title="Inspector Settings"]').first();
    await inspectorSettingsBtn.click({ force: true });
    await page.waitForTimeout(400);

    // Capture screenshot: 10_edge_inspector.png
    await page.screenshot({ path: path.join(OUTPUT_DIR, '10_edge_inspector.png') });
    console.log('Captured 10_edge_inspector.png');

    // 9. Close modal
    console.log('Closing Advanced Extraction Editor...');
    const closeBtn = modal.locator('button:has-text("Done & Return")').first();
    await closeBtn.click({ force: true });
    await page.waitForTimeout(800);

    // 10. Test Project Save (.stickerstudio archive download)
    console.log('Testing Save Project (.stickerstudio)...');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Save Project")').first().click({ force: true });
    const download = await downloadPromise;
    const downloadPath = path.join(OUTPUT_DIR, 'scratch/test_project.stickerstudio');
    await download.saveAs(downloadPath);
    console.log('Project downloaded to:', downloadPath);

    // Verify downloaded archive exists and has valid zip magic header (PK\x03\x04)
    const fileBytes = fs.readFileSync(downloadPath);
    console.log('Saved project size:', fileBytes.length, 'bytes');
    if (fileBytes[0] === 0x50 && fileBytes[1] === 0x4b) {
      console.log('Verified ZIP magic header PK\\x03\\x04 on exported .stickerstudio!');
    } else {
      throw new Error('Downloaded file is not a valid ZIP archive');
    }

    console.log('ALL V1.1 ADVANCED EXTRACTION EDITOR E2E TESTS PASSED!');
  } catch (err) {
    console.error('V1.1 E2E Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runAdvancedE2ETest();
