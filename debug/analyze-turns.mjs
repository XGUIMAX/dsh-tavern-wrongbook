// Cross-tab model request outcomes by day and finish reason.
// Usage: node analyze-turns.mjs <model-requests/chat-xxx dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node analyze-turns.mjs <dir>');
  process.exit(2);
}

const TZ_OFFSET_MS = 8 * 3600 * 1000; // UTC+8
const files = readdirSync(dir).filter((f) => f.endsWith('.result.json'));

const rows = [];
for (const f of files) {
  let j;
  try {
    j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  } catch {
    continue;
  }
  const bodyPath = join(dir, f.replace(/\.result\.json$/, '.json'));
  let bodySize = 0;
  try {
    bodySize = statSync(bodyPath).size;
  } catch {
    bodySize = 0;
  }
  const iso = new Date(Number(j.createdAt) + TZ_OFFSET_MS).toISOString();
  rows.push({
    day: iso.slice(0, 10),
    hhmm: iso.slice(11, 16),
    finish: (j.response && j.response.finish && j.response.finish.kind) || '?',
    len: String((j.response && j.response.text) || '').length,
    bodySize,
  });
}

console.log(`parsed ${rows.length} result files from ${dir}\n`);
console.log('day         finish        n    emptyLen   maxLen   maxBodyKB   minBodyKB');
const agg = new Map();
for (const r of rows) {
  const k = `${r.day}\t${r.finish}`;
  const a = agg.get(k) || { n: 0, zero: 0, maxLen: 0, maxBody: 0, minBody: Infinity };
  a.n += 1;
  if (r.len === 0) a.zero += 1;
  a.maxLen = Math.max(a.maxLen, r.len);
  a.maxBody = Math.max(a.maxBody, r.bodySize);
  a.minBody = Math.min(a.minBody, r.bodySize);
  agg.set(k, a);
}
for (const [k, a] of [...agg.entries()].sort()) {
  const [day, finish] = k.split('\t');
  console.log(
    `${day}  ${finish.padEnd(12)} ${String(a.n).padStart(4)}  ${String(a.zero).padStart(7)}  ${String(a.maxLen).padStart(7)}  ${String(Math.round(a.maxBody / 1024)).padStart(9)}  ${String(Math.round(a.minBody / 1024)).padStart(9)}`,
  );
}

// Every stop-kind call, newest last: did it carry text?
console.log('\nall finish=stop calls (day time ms len):');
const stops = rows.filter((r) => r.finish === 'stop' || r.finish === 'error' || r.finish === 'aborted');
console.log(`count = ${stops.length}`);
for (const r of stops.slice(-30)) {
  console.log(`  ${r.day} ${r.hhmm}  len=${String(r.len).padStart(5)}  body=${Math.round(r.bodySize / 1024)}KB`);
}
