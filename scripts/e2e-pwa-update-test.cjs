// Verifies the PWA update flow against the production build served by `vite preview` on :4173.
// Simulates publishing a new version by changing a precache revision in dist/sw.js (any byte
// change to sw.js is what the browser treats as a new release).
const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const URL = process.env.APP_URL || 'http://localhost:4173/';
const SW = path.resolve(__dirname, '../dist/sw.js');

(async () => {
  const original = fs.readFileSync(SW, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Available Offline', { timeout: 15000 });
    console.log('✓ v1 installed, offline-ready');

    // User has work in progress
    await page.click('button:has-text("Momo\'s Bakery")');
    await page.waitForSelector('text=Extracting Sticker Sheet', { state: 'detached', timeout: 30000 });
    console.log('✓ sheet extracted (work in progress)');

    // Publish "v2"
    assert(/revision:"[^"]+"/.test(original), 'sw.js has no precache revisions');
    fs.writeFileSync(SW, original.replace(/revision:"[^"]+"/, 'revision:"update-test-v2"'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('text=Update Available', { timeout: 15000 });
    console.log('✓ new version detected → "Update Available" shown, page NOT reloaded');

    // Declining the warning must keep the work
    page.once('dialog', d => d.dismiss());
    await page.click('button:has-text("Update Available")');
    await page.waitForTimeout(1000);
    assert(await page.isVisible('text=Sticker Previews'), 'work was lost after declining update');
    console.log('✓ declining the warning keeps the current sheet');

    // Accepting activates v2 and reloads once
    page.once('dialog', d => d.accept());
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }), page.click('button:has-text("Update Available")')]);
    await page.waitForSelector('text=Available Offline', { timeout: 15000 });
    const waiting = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    assert(!waiting, 'new worker still waiting after update');
    assert(!(await page.isVisible('text=Update Available')), 'update badge still shown');
    console.log('✓ accepted → v2 active, app reloaded cleanly');

    console.log('\n=== UPDATE FLOW TEST PASSED ===');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(SW, original);
    await browser.close();
  }
})();
