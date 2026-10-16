const fs = require('fs');
const path = require('path');
const sharp = require('c:/Users/prate/Documents/pheartp/node_modules/sharp');

const buildDir = path.resolve(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

async function generateIcons() {
  const size = 256;
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ec4899" />
          <stop offset="100%" stop-color="#be185d" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.25"/>
        </filter>
      </defs>
      
      <!-- Rounded Die-Cut Outer Margin -->
      <rect x="18" y="18" width="220" height="220" rx="48" fill="#ffffff" filter="url(#shadow)"/>
      
      <!-- Inner Vibrant Badge -->
      <rect x="28" y="28" width="200" height="200" rx="40" fill="url(#grad)"/>
      
      <!-- Cut Line Dashes -->
      <rect x="23" y="23" width="210" height="210" rx="44" fill="none" stroke="#fbcfe8" stroke-width="3" stroke-dasharray="8,6" opacity="0.6"/>

      <!-- Center Cut Scissors Icon -->
      <g fill="#ffffff" transform="translate(68, 68) scale(5)">
        <path d="M6 3a3 3 0 1 0 0 6 3 3 0 0 0 2.12-.88L12 12l-3.88 3.88A3 3 0 1 0 6 21a3 3 0 0 0 2.83-2H13l2-2h4a1 1 0 0 0 0-2h-3l-2-2 2-2h3a1 1 0 0 0 0-2h-4l-2-2H8.83A3 3 0 0 0 6 3zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0 12a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
      </g>
    </svg>
  `;

  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toBuffer();

  // Save 256x256 PNG
  const pngPath = path.join(buildDir, 'icon.png');
  fs.writeFileSync(pngPath, pngBuffer);
  console.log('Saved build/icon.png');

  // Generate Windows .ico (PNG encapsulated)
  const icoPath = path.join(buildDir, 'icon.ico');
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type 1 = Icon
  icoHeader.writeUInt16LE(1, 4); // 1 Image
  icoHeader.writeUInt8(0, 6); // Width (0 = 256)
  icoHeader.writeUInt8(0, 7); // Height (0 = 256)
  icoHeader.writeUInt8(0, 8); // Color palette
  icoHeader.writeUInt8(0, 9); // Reserved
  icoHeader.writeUInt16LE(1, 10); // Color planes
  icoHeader.writeUInt16LE(32, 12); // Bits per pixel
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // Size of image data
  icoHeader.writeUInt32LE(22, 18); // Offset to image data

  const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Saved build/icon.ico (size:', icoBuffer.length, 'bytes)');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
