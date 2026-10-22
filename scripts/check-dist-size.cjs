const fs = require('fs');
const path = require('path');

const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB = 26,214,400 bytes
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

// Or use relative to execution root
const targetDist = fs.existsSync(DIST_DIR) ? DIST_DIR : path.resolve(process.cwd(), 'dist');

if (!fs.existsSync(targetDist)) {
  console.error(`[check-dist-size] ERROR: dist directory missing at ${targetDist}`);
  process.exit(1);
}

function walk(dir) {
  let out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      out = out.concat(walk(p));
    } else {
      out.push({ path: p, size: s.size });
    }
  }
  return out;
}

const files = walk(targetDist);
const oversized = files.filter(f => f.size > MAX_BYTES);
const largest = files.reduce((max, f) => f.size > max.size ? f : max, { path: '', size: 0 });
const relLargest = path.relative(targetDist, largest.path).replace(/\\/g, '/');
const mib = (largest.size / (1024 * 1024)).toFixed(2);

console.log(`[check-dist-size] Checked ${files.length} assets in dist/.`);
console.log(`[check-dist-size] Largest asset: ${relLargest} (${mib} MiB, ${largest.size.toLocaleString()} bytes)`);

if (oversized.length > 0) {
  console.error(`\n[check-dist-size] ERROR: ${oversized.length} asset(s) exceed 25 MiB limit:`);
  for (const o of oversized) {
    const rel = path.relative(targetDist, o.path).replace(/\\/g, '/');
    const szMiB = (o.size / (1024 * 1024)).toFixed(2);
    console.error(`  - ${rel}: ${szMiB} MiB (${o.size.toLocaleString()} bytes) > 25.00 MiB limit`);
  }
  process.exit(1);
}

console.log('[check-dist-size] PASS: All assets are strictly under Cloudflare Pages 25 MiB limit.\n');
process.exit(0);
