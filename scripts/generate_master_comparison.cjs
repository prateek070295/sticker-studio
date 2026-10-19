const { chromium } = require('C:/Users/prate/Documents/ReputIQ/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 960 } });

  const artDir = 'C:/Users/prate/.gemini/antigravity/brain/32e8d692-5414-49f8-a74e-58085e4d1c85';
  const imgA = 'data:image/png;base64,' + fs.readFileSync(path.join(artDir, 'case_a_short_hair_white_backed_diecut_sticker.png')).toString('base64');
  const imgB = 'data:image/png;base64,' + fs.readFileSync(path.join(artDir, 'case_b_glasses_white_backed_diecut_sticker.png')).toString('base64');
  const imgC = 'data:image/png;base64,' + fs.readFileSync(path.join(artDir, 'case_c_long_hair_tilt_white_backed_diecut_sticker.png')).toString('base64');

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0; background:#0B0C10; color:#F1F5F9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px; box-sizing:border-box;">
  <div style="display:flex; align-items:center; gap:12px; margin-bottom:6px;">
    <span style="background:linear-gradient(135deg, #FF9F1C, #FF4081); -webkit-background-clip:text; -webkit-text-fill-color:transparent; font-size:26px; font-weight:800; letter-spacing:0.5px;">
      STICKER STUDIO V1.4 — PERSONALIZED CARTOON STICKERS
    </span>
    <span style="background:rgba(255, 64, 129, 0.2); border:1px solid rgba(255, 64, 129, 0.4); color:#FF80AB; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; text-transform:uppercase;">
      Prototype Sign-Off
    </span>
  </div>
  <p style="color:#94A3B8; font-size:13px; margin:0 0 28px 0;">
    First Working Prototype: Real Photographic Head Seamlessly Overlapped by Cartoon Collar on "HI!" Waving Chibi Body
  </p>

  <div style="display:flex; gap:28px; justify-content:center;">
    <!-- Case A -->
    <div style="display:flex; flex-direction:column; align-items:center;">
      <div style="width:540px; height:540px; background:#18181B; border:1px solid #27272A; border-radius:24px; padding:20px; box-shadow:0 16px 36px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; box-sizing:border-box;">
        <img src="${imgA}" style="max-width:100%; max-height:100%; filter:drop-shadow(0 8px 16px rgba(0,0,0,0.3));" />
      </div>
      <h3 style="margin:16px 0 4px 0; font-size:15px; font-weight:700; color:#F8FAFC;">Case A: Short-Haired Adult</h3>
      <span style="color:#64748B; font-size:12px;">Styled short hair & beard • Chin collar overlap • Clean matte</span>
    </div>

    <!-- Case B -->
    <div style="display:flex; flex-direction:column; align-items:center;">
      <div style="width:540px; height:540px; background:#18181B; border:1px solid #27272A; border-radius:24px; padding:20px; box-shadow:0 16px 36px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; box-sizing:border-box;">
        <img src="${imgB}" style="max-width:100%; max-height:100%; filter:drop-shadow(0 8px 16px rgba(0,0,0,0.3));" />
      </div>
      <h3 style="margin:16px 0 4px 0; font-size:15px; font-weight:700; color:#F8FAFC;">Case B: Glasses-Wearing Adult</h3>
      <span style="color:#64748B; font-size:12px;">Authentic spectacles • Frames & lenses preserved • Ears intact</span>
    </div>

    <!-- Case C -->
    <div style="display:flex; flex-direction:column; align-items:center;">
      <div style="width:540px; height:540px; background:#18181B; border:1px solid #27272A; border-radius:24px; padding:20px; box-shadow:0 16px 36px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; box-sizing:border-box;">
        <img src="${imgC}" style="max-width:100%; max-height:100%; filter:drop-shadow(0 8px 16px rgba(0,0,0,0.3));" />
      </div>
      <h3 style="margin:16px 0 4px 0; font-size:15px; font-weight:700; color:#F8FAFC;">Case C: Long Hair with Tilt</h3>
      <span style="color:#64748B; font-size:12px;">Shoulder drape ROI • Natural shoulder locks • Soft taper tips</span>
    </div>
  </div>
</body>
</html>`;

  await page.setContent(html);
  const outPath = path.join(artDir, 'cartoon_v1_4_master_comparison.png');
  await page.screenshot({ path: outPath });
  console.log('Saved master comparison:', outPath);

  await browser.close();
})();
