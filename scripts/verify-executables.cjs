const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

async function verify() {
  console.log('=== Verifying Sticker Studio Windows Executables ===');
  const releaseDir = path.join(__dirname, '../release');

  if (!fs.existsSync(releaseDir)) {
    console.error('Release directory not found:', releaseDir);
    process.exit(1);
  }

  const files = fs.readdirSync(releaseDir);
  console.log('Release directory contents:', files);

  const setupExe = files.find(f => f.startsWith('StickerStudio-Setup') && f.endsWith('.exe'));
  const portableExe = files.find(f => f.startsWith('StickerStudio-Portable') && f.endsWith('.exe'));

  if (!setupExe) {
    console.error('FAIL: Setup executable (StickerStudio-Setup-*.exe) not found!');
  } else {
    const setupPath = path.join(releaseDir, setupExe);
    const setupStat = fs.statSync(setupPath);
    const setupHash = getSha256(setupPath);
    console.log(`PASS: Found Setup Executable: ${setupExe}`);
    console.log(`  Size: ${(setupStat.size / (1024 * 1024)).toFixed(2)} MB (${setupStat.size} bytes)`);
    console.log(`  SHA-256: ${setupHash}`);
  }

  if (!portableExe) {
    console.error('FAIL: Portable executable (StickerStudio-Portable-*.exe) not found!');
  } else {
    const portablePath = path.join(releaseDir, portableExe);
    const portableStat = fs.statSync(portablePath);
    const portableHash = getSha256(portablePath);
    console.log(`PASS: Found Portable Executable: ${portableExe}`);
    console.log(`  Size: ${(portableStat.size / (1024 * 1024)).toFixed(2)} MB (${portableStat.size} bytes)`);
    console.log(`  SHA-256: ${portableHash}`);
  }

  if (setupExe && portableExe) {
    console.log('\n=== All target release executables verified successfully! ===');
  } else {
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
