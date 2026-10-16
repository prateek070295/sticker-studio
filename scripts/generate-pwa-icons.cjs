const fs = require('fs');
const path = require('path');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function getSvg(size, isMaskable = false) {
  // If maskable, add 18% safe-zone margin to avoid outer clipping on Android squircle/circle masks
  const padding = isMaskable ? Math.round(size * 0.12) : 0;
  const contentSize = size - padding * 2;
  const scale = contentSize / 256;
  const cx = padding;
  const cy = padding;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${isMaskable ? `<rect width="${size}" height="${size}" fill="#fdf2f8"/>` : ''}
      <g transform="translate(${cx}, ${cy}) scale(${scale})">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ec4899" />
            <stop offset="100%" stop-color="#be185d" />
          </linearGradient>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.25"/>
          </filter>
        </defs>
        
        <!-- White Die-Cut Backing Outline -->
        <rect x="18" y="18" width="220" height="220" rx="48" fill="#ffffff" filter="url(#shadow)"/>
        
        <!-- Inner Vibrant Pink Badge -->
        <rect x="28" y="28" width="200" height="200" rx="40" fill="url(#grad)"/>
        
        <!-- Die-Cut Dashed Guide -->
        <rect x="23" y="23" width="210" height="210" rx="44" fill="none" stroke="#fbcfe8" stroke-width="3" stroke-dasharray="8,6" opacity="0.6"/>

        <!-- Scissors Icon -->
        <g fill="#ffffff" transform="translate(68, 68) scale(5)">
          <path d="M6 3a3 3 0 1 0 0 6 3 3 0 0 0 2.12-.88L12 12l-3.88 3.88A3 3 0 1 0 6 21a3 3 0 0 0 2.83-2H13l2-2h4a1 1 0 0 0 0-2h-3l-2-2 2-2h3a1 1 0 0 0 0-2h-4l-2-2H8.83A3 3 0 0 0 6 3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0 12a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
        </g>
      </g>
    </svg>
  `;
}

async function buildAllIcons() {
  console.log('Generating PWA and application icons in public/...');

  // 1. Standard 192x192
  const svg192 = getSvg(192, false);
  const buf192 = await sharp(Buffer.from(svg192)).resize(192, 192).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), buf192);
  console.log('✓ public/pwa-192x192.png');

  // 2. Standard 512x512
  const svg512 = getSvg(512, false);
  const buf512 = await sharp(Buffer.from(svg512)).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), buf512);
  console.log('✓ public/pwa-512x512.png');

  // 3. Maskable 512x512
  const svgMaskable = getSvg(512, true);
  const bufMaskable = await sharp(Buffer.from(svgMaskable)).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'maskable-icon-512x512.png'), bufMaskable);
  console.log('✓ public/maskable-icon-512x512.png');

  // 4. Apple Touch Icon 180x180
  const svgApple = getSvg(180, false);
  const bufApple = await sharp(Buffer.from(svgApple)).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), bufApple);
  console.log('✓ public/apple-touch-icon.png');

  // 5. Favicon SVG
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), getSvg(64, false));
  console.log('✓ public/favicon.svg');

  // 6. Favicon ICO (64x64 encapsulated)
  const buf64 = await sharp(Buffer.from(getSvg(64, false))).resize(64, 64).png().toBuffer();
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);
  icoHeader.writeUInt8(64, 6);
  icoHeader.writeUInt8(64, 7);
  icoHeader.writeUInt8(0, 8);
  icoHeader.writeUInt8(0, 9);
  icoHeader.writeUInt16LE(1, 10);
  icoHeader.writeUInt16LE(32, 12);
  icoHeader.writeUInt32LE(buf64.length, 14);
  icoHeader.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), Buffer.concat([icoHeader, buf64]));
  console.log('✓ public/favicon.ico');

  console.log('All icons generated successfully!');
}

buildAllIcons().catch(err => {
  console.error('Error generating PWA icons:', err);
  process.exit(1);
});
