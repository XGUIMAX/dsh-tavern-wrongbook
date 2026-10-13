// One-off literal text scanner for the dsh-tavern tree.
// Usage: node scan-text.mjs <root> [extraKeyword ...]
// Keywords below are the defaults; extra args are appended.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DEFAULT_KEYS = [
  '重新生成本轮正文',
  '本轮运行失败',
  '只返回了思考过程',
  'reasoning-only',
  'reasoningOnly',
];

const [, , root, ...extra] = process.argv;
if (!root) {
  console.error('usage: node scan-text.mjs <root> [keyword ...]');
  process.exit(2);
}
const KEYS = [...DEFAULT_KEYS, ...extra];

const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'dist', 'build', 'coverage']);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.7z', '.pdf', '.mp3', '.wav', '.mp4', '.webm',
  '.lock', '.exe', '.dll', '.node', '.wasm',
]);

const hits = [];

function walk(dir) {
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (SKIP_EXT.has(ext) || e.name.endsWith('.map')) continue;

    let txt;
    try {
      const st = statSync(p);
      if (st.size > 8 * 1024 * 1024) continue;
      txt = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    if (txt.includes('\u0000')) continue;

    const lines = txt.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const k of KEYS) {
        if (line.includes(k)) {
          hits.push(`${p.slice(root.length).replace(/^[\\/]/, '')}:${i + 1}: ${line.trim().slice(0, 220)}`);
          break;
        }
      }
    }
  }
}

walk(root);
const LIMIT = 150;
console.log(hits.slice(0, LIMIT).join('\n'));
console.log(`\n[${hits.length} hit line(s); showing ${Math.min(hits.length, LIMIT)}]`);
