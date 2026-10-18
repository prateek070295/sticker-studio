const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/float/075/';
const OUT_DIR = path.resolve('scripts/photo_prototype/models/bodypix_mobilenet_075_stride16');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function downloadFile(fileName) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + fileName;
    const destPath = path.join(OUT_DIR, fileName);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed ${url}: ${res.statusCode}`));
      }
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close(() => {
          const buf = fs.readFileSync(destPath);
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
          resolve({ file: fileName, size: buf.length, sha256: hash });
        });
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading BodyPix mobilenet float 075 stride 16...');
  const jsonInfo = await downloadFile('model-stride16.json');
  console.log(`Saved ${jsonInfo.file} (${jsonInfo.size} B, ${jsonInfo.sha256.slice(0, 16)}...)`);

  const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'model-stride16.json'), 'utf8'));
  const shards = manifest.weightsManifest[0].paths;

  for (const shard of shards) {
    console.log(`Downloading shard: ${shard}`);
    const shardInfo = await downloadFile(shard);
    console.log(`Saved ${shardInfo.file} (${(shardInfo.size / (1024 * 1024)).toFixed(2)} MB, ${shardInfo.sha256.slice(0, 16)}...)`);
  }

  console.log('BodyPix model downloaded successfully!');
}

main().catch(console.error);
