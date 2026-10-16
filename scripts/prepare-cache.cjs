const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA;
const cacheDir = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign');
const srcDir = path.join(cacheDir, '539513823');
const targetDir = path.join(cacheDir, 'winCodeSign-2.6.0');

console.log('Cache directory:', cacheDir);

if (!fs.existsSync(srcDir)) {
  console.log('Source directory does not exist:', srcDir);
} else {
  if (!fs.existsSync(targetDir)) {
    console.log('Copying', srcDir, 'to', targetDir);
    fs.cpSync(srcDir, targetDir, { recursive: true });
  }

  // Ensure dylib files exist
  const darwinLib = path.join(targetDir, 'darwin', '10.12', 'lib');
  if (fs.existsSync(darwinLib)) {
    const cryptoSrc = path.join(darwinLib, 'libcrypto.1.0.0.dylib');
    const cryptoDest = path.join(darwinLib, 'libcrypto.dylib');
    if (fs.existsSync(cryptoSrc) && !fs.existsSync(cryptoDest)) {
      fs.copyFileSync(cryptoSrc, cryptoDest);
      console.log('Created libcrypto.dylib');
    }

    const sslSrc = path.join(darwinLib, 'libssl.1.0.0.dylib');
    const sslDest = path.join(darwinLib, 'libssl.dylib');
    if (fs.existsSync(sslSrc) && !fs.existsSync(sslDest)) {
      fs.copyFileSync(sslSrc, sslDest);
      console.log('Created libssl.dylib');
    }
  }

  console.log('winCodeSign-2.6.0 successfully prepared!');
}
