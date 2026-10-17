const https = require('https');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.resolve('.test-fixtures');

const items = [
  { url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&q=85', name: 'eval_photo_1_beach_family.jpg' },
  { url: 'https://images.unsplash.com/photo-1542037104857-ffbb0b9155fb?w=1200&q=85', name: 'eval_photo_2_indoor_family.jpg' },
  { url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=85', name: 'eval_photo_3_portrait_lighting.jpg' }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) return reject(new Error(`Status ${res.statusCode}`));
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(resolve); });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  for (const item of items) {
    const p = path.join(FIXTURES_DIR, item.name);
    console.log(`Downloading ${item.name}...`);
    await download(item.url, p);
    const size = fs.statSync(p).size;
    console.log(`  ✓ Saved ${item.name} (${(size / 1024).toFixed(1)} KB)`);
  }
}

main().catch(console.error);
