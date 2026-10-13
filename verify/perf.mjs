// 性能基准：造一份「用久了」的数据（几百张卡、几千条记录），量一遍最常走的那几条路。
//
// 用法：node verify/perf.mjs
//
// 阈值定得宽松：这是防止自己写出 O(n²) 的哨兵，不是跑分。真要看绝对值，
// 跑的时候留意打印出来的数字就好。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SANDBOX = path.join(os.tmpdir(), 'dsh-wrongbook-perf')
fs.rmSync(SANDBOX, { recursive: true, force: true })

const CARDS = path.join(SANDBOX, 'resources', 'cards')
const ORIGINALS = path.join(SANDBOX, 'originals', 'cards')
const DATA = path.join(SANDBOX, 'tools', 'wrongbook')
for (const dir of [CARDS, ORIGINALS, DATA]) fs.mkdirSync(dir, { recursive: true })

const CARD_COUNT = 300
const ENTRY_COUNT = 8000
const ENTRY_IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

// 回流要有落脚点。放在数据根的 skills 下，跟真实布局一致。
fs.mkdirSync(path.join(SANDBOX, 'skills', 'perf-notes'), { recursive: true })
fs.writeFileSync(
  path.join(SANDBOX, 'skills', 'perf-notes', 'SKILL.md'),
  '---\nname: perf-notes\ndescription: "基准用"\n---\n',
  'utf8',
)

/** 一半原版、一半 MVU 版，凑成 150 对。 */
for (let i = 0; i < CARD_COUNT / 2; i += 1) {
  const base = `测试卡-${String(i).padStart(3, '0')}`
  fs.writeFileSync(path.join(CARDS, `${base}.json`), '{}', 'utf8')
  fs.writeFileSync(path.join(CARDS, `${base} MVU版本.json`), '{}', 'utf8')
  fs.writeFileSync(path.join(ORIGINALS, `${base}.png`), '', 'utf8')
}

process.env.DSH_TAVERN_DATA = SANDBOX
const mod = await import('file:///C:/Users/213123543/.dsh/plugins/dsh-tavern-wrongbook/lib/index.js')

const routes = []
const tools = []
const ctx = {
  get: (k) => (k === 'tools' ? { register: (d) => (tools.push(d), () => {}) } : undefined),
  inject: (_deps, cb) => cb({ webServer: { register: (r) => (routes.push(r), () => {}) }, effect: (fn) => void fn() }),
  effect: (fn) => void fn(),
}
mod.apply(ctx)

function fakeRes() {
  return {
    statusCode: 0,
    body: '',
    writeHead(c) {
      this.statusCode = c
      return this
    },
    end(c) {
      if (c) this.body += c
      return this
    },
  }
}
async function call(pathname, query) {
  const res = fakeRes()
  await routes.find((r) => r.path === pathname).handler({ method: 'GET', url: pathname + (query || ''), on() {} }, res)
  return JSON.parse(res.body)
}
async function action(body) {
  const res = fakeRes()
  const h = {}
  const req = {
    method: 'POST',
    url: '/dsh-wrongbook/action',
    on(e, fn) {
      ;(h[e] = h[e] || []).push(fn)
      return req
    },
  }
  setTimeout(() => {
    h.data?.forEach((fn) => fn(Buffer.from(JSON.stringify(body))))
    h.end?.forEach((fn) => fn())
  }, 0)
  await routes.find((r) => r.path === '/dsh-wrongbook/action').handler(req, res)
  return JSON.parse(res.body)
}

const timings = []
async function timeIt(label, fn, runs = 1) {
  let out
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < runs; i += 1) out = await fn()
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / runs
  timings.push({ label, ms })
  console.log(`  ${label.padEnd(40)} ${ms.toFixed(1).padStart(8)} ms`)
  return out
}

console.log(`沙盒：${CARD_COUNT} 张卡 / ${ENTRY_COUNT} 条记录`)
console.log('')

/* 铺数据：一次导入到底，走的是 Set 去重 + 一次性合并那条路。 */
const cards = (await call('/dsh-wrongbook/state')).cards.filter((c) => c.group === 'card')
const entries = []
for (let i = 0; i < ENTRY_COUNT; i += 1) {
  const card = cards[i % cards.length]
  entries.push({
    cardKey: card.key,
    title: `${card.name} 的问题 ${i}`,
    symptom: `第 ${i} 条现象：状态栏空白、变量不结算`,
    cause: '根因说明',
    fix: '修法说明',
    scope: 'MVU',
    tags: ['状态栏', `T-${i % 40}`],
  })
}
const bulk = await timeIt('importEntries 铺满 8000 条', () =>
  action({ action: 'importEntries', json: JSON.stringify({ entries }) }),
)
console.log(`    → 新增 ${bulk.added} 条，跳过 ${bulk.skipped} 条`)

const state = await call('/dsh-wrongbook/state')
console.log(`分类 ${state.cards.length} 个 · 条目 ${state.entries.length} 条`)
console.log('')

console.log('读取路径')
await timeIt('GET /state（首轮，冷）', () => call('/dsh-wrongbook/state'))
await timeIt('GET /state（热，×5）', () => call('/dsh-wrongbook/state'), 5)
await timeIt('lookup 带关键词（×5）', () => action({ action: 'lookup', card: cards[0].key, query: '状态栏 空白' }), 5)
await timeIt('lookup 无关键词（×5）', () => action({ action: 'lookup', card: cards[0].key }), 5)
await timeIt('lookup 靠名字模糊匹配（×5）', () => action({ action: 'lookup', card: '测试卡-001' }), 5)

console.log('')
console.log('写入路径')
await timeIt('addEntry（×5）', () => action({ action: 'addEntry', cardKey: cards[0].key, entry: { title: `基准 ${Math.random().toString(36).slice(2)}` } }), 5)
const increment = []
for (let i = 0; i < 500; i += 1) increment.push({ cardKey: cards[i % cards.length].key, title: `增量 ${i}` })
await timeIt('importEntries 500 条增量', () => action({ action: 'importEntries', json: JSON.stringify({ entries: increment }) }))
await timeIt('rescan（×3）', () => action({ action: 'rescan' }), 3)
await timeIt('backupNow（×3）', () => action({ action: 'backupNow' }), 3)
await timeIt('备份列表', () => call('/dsh-wrongbook/state'))

// 自动同步每次记错题都要走一遍全量回流。原来这里是 ids.includes(e.id)，
// 8000 条时 800 ms —— 换 Set 之后 30 ms 上下，这条预算就是钉住它别再回去。
const refluxIds = state.entries.map((e) => e.id)
await timeIt('回流·首次铺满 8000 条', () => action({ action: 'refluxToSkill', skill: 'perf-notes', ids: refluxIds }))
await timeIt('回流·全部已存在（自动同步的常态）', () => action({ action: 'refluxToSkill', skill: 'perf-notes', ids: refluxIds }))

console.log('')
const budget = [
  ['importEntries 铺满 8000 条', 4000],
  ['GET /state（热', 800],
  ['lookup 带关键词', 600],
  ['lookup 靠名字模糊匹配', 600],
  ['addEntry', 900],
  ['importEntries 500 条增量', 900],
  ['rescan', 900],
  ['回流·首次铺满', 400],
  ['回流·全部已存在', 400],
]
let failed = 0
for (const [name, limit] of budget) {
  const hit = timings.find((t) => t.label.startsWith(name))
  if (!hit) continue
  const ok = hit.ms <= limit
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ≤ ${limit} ms  [${hit.ms.toFixed(1)} ms]`)
}
console.log(`\n预算 ${budget.length - failed}/${budget.length} 通过`)

fs.rmSync(SANDBOX, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
