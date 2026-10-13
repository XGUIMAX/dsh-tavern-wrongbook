// DSH 升级后一键重打所有宿主补丁。
//
// 为什么需要它：宿主补丁改的是 apps/dsh-tavern/ 下的文件（src/ 与 lib/），
// 而 DSH 升级是整份替换 —— 补丁会静默失效，不报错，只是功能悄悄回到补丁前。
// 实测已发生三次（v2.3 一次、之后两次）。
//
// 用法：
//   node debug/patch-all.mjs           # 只检查，列出每个补丁的状态
//   node debug/patch-all.mjs --apply   # 缺的重打（含必要的 build）
//
// ⚠ 顺序很重要，脚本自己处理：
//   1) patch-src        改 src/client/*.js        —— 源码
//   2) build:client     用 src 重建 lib/client.js —— 会覆盖 lib 上的一切直接改动
//   3) workshop-direct  改 lib/client.js          —— 必须在 build 之后
//   4) patch / patch-test / reasoning-fallback   —— 改 lib/domain/*.js 与 lib/index.js
//                                                 —— 不受 build 影响，放最后更稳
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DATA = 'C:/Users/213123543/.dsh/profile-data/tavern/data'
const APP = 'C:/Users/213123543/.dsh/apps/dsh-tavern'
const DEBUG = DATA + '/tools'

const args = process.argv.slice(2)
const apply = args.includes('--apply')

function run(cmd, argv, cwd) {
  try {
    return { out: execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }
  } catch (e) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status === undefined ? 1 : e.status }
  }
}

const node = (script, cwd) => run(process.execPath, [script], cwd)
// 注意要带 --apply —— 漏了这个参数，子脚本只会再查一遍状态、什么都不改
const nodeApply = (script, cwd) => run(process.execPath, [script, '--apply'], cwd)

// ── 补丁清单（顺序即执行顺序的依赖关系，见文件头）─────────────────────────
//
// status() 返回 'ok' | 'need' | 'unknown'
const PATCHES = [
  {
    id: 'src',
    title: '源码补丁（九处 + 三处包装归一化）',
    script: DEBUG + '/mvu-api-test/patch-src.mjs',
    status() {
      // 不能只数 MARK —— ②③④ 是"替换清单"，不带标记。
      // 逐项检查实际内容（和 verify-srcpatch.mjs 同一套判据）。
      const srcDir = APP + '/tavern-plugin/src/client'
      let main = ''
      let open = ''
      try {
        main = fs.readFileSync(srcDir + '/main.js', 'utf8')
        open = fs.readFileSync(srcDir + '/opening-preview.js', 'utf8')
      } catch {
        return 'unknown'
      }
      const checks = [
        /genVia\(config\)/.test(main), // ① 四个 helper 实现
        /"updateVariablesWith","generateRaw","generate"/.test(main), // ② iframe 清单
        /window\.generate=function\(a,b\)/.test(main), // ③ iframe window.generate
        /"generateRaw", "generate", "injectPrompts"/.test(main), // ④ facade 清单
        /helper patch \(src\)/.test(main), // ⑤ facade window.generate
        /generate: window\.generate/.test(open), // ⑥ 开场预览层
        /cloudflare-workshop\.saugrodep\.workers\.dev\//.test(main), // ⑦⑧ 创意工坊域名例外
        // ⑨ frame-sizing 的两行 include。缺了它整个文件不进产物 —— 而这次实测
        // 的症状是 createIndexedArrayApi 未定义、整个前端崩（不只是某个按钮坏）。
        /@include-domain frame-sizing\.js/.test(main) && /@include modules\/frame-sizing\.js/.test(main),
      ]
      // 三处 generate 包装的归一化数量 —— 卡读的是其中一份，少了任何一份都会报
      // "需要显式 ordered_prompts"。光看"某一处存在"不够。
      const normCount = (src) => (String(src).match(/config\.ordered_prompts\s*=/g) || []).length
      checks.push(normCount(main) === 2) // ①⑤ 各一处
      checks.push(normCount(open) === 1) // ⑥ 一处
      // 升级会整份替换 apps/dsh-tavern/，万一它又带来新文件却漏了 include，
      // 这里能当作一个粗筛：include 总数掉下来了就说明有东西被抹掉。
      const incCount = (String(main).match(/^\s*\/\/\s*@include/gm) || []).length
      this.incCount = incCount
      checks.push(incCount >= 40)
      const ok = checks.filter(Boolean).length
      this.detail =
        ok +
        '/' +
        checks.length +
        ' 处就位（含三处包装的归一化；include ' +
        incCount +
        ' 条，应 ≥40）'
      return ok === checks.length ? 'ok' : ok === 0 ? 'need' : 'partial'
    },
    apply: (s) => nodeApply(s, DATA),
    needsBuild: true,
  },
  {
    id: 'reasoning-notice',
    title: '思考通道轮次的界面标注',
    // 改 src/client/main.js —— 必须和源码补丁同一批、排在 build 之前。
    // 后端那条路已验证走不通：DSH 把 replace 事件限定为只给模型看
    // （dsh-client-ui-chat:5686-5698，`replacement copies stay model-only`），
    // 人类转录只认 surfaceOp === "append" 的事件。所以"本轮没有正文"只能在渲染层标。
    script: DEBUG + '/mvu-api-test/patch-reasoning-notice.mjs',
    status() {
      const src = APP + '/tavern-plugin/src/client/main.js'
      let main = ''
      try {
        main = fs.readFileSync(src, 'utf8')
      } catch {
        return 'unknown'
      }
      const applied = main.includes('reasoningOnlyTurn') && main.includes('思考通道轮次标注')
      const pending = main.includes('input.streaming && index === blocks.length - 1 ? "思考中…" : "思考过程"')
      this.detail = applied
        ? '已写入界面标注'
        : pending
          ? '未打补丁（本轮没有正文时不会标注）'
          : '锚点对不上，需人工确认'
      return applied ? 'ok' : pending ? 'need' : 'unknown'
    },
    apply: (s) => nodeApply(s, DATA),
    needsBuild: true,
  },
  {
    id: 'workshop',
    title: '创意工坊直连域名',
    // 已并入源码补丁（patch-src.mjs 的 ⑦⑧）。不再单独往 lib/client.js 注入 ——
    // 那样会让 check:client 永远报"已过期"（src 有改动、lib 多出源码里没有的东西，
    // 两者必然对不上）。这里只如实标注，不再单独检查、也不单独应用。
    status() {
      this.detail = '已并入源码补丁（⑦⑧）'
      return 'ok'
    },
    apply: null,
  },
  {
    id: 'mvu-api',
    title: 'MVU 卡纯 API 测试',
    script: DEBUG + '/mvu-api-test/patch.mjs',
    status() {
      const r = node(this.script, DATA)
      this.detail = (r.out.split('\n').find((l) => l.includes('状态：')) || '').trim()
      return /状态：\s*已打补丁/.test(r.out) ? 'ok' : /状态：\s*未打补丁/.test(r.out) ? 'need' : 'unknown'
    },
    apply: (s) => nodeApply(s, DATA),
  },
  {
    id: 'partial-body',
    title: '超时保留前台正文',
    script: DEBUG + '/mvu-api-test/patch-test.mjs',
    status() {
      const r = node(this.script, DATA)
      this.detail = (r.out.split('\n').find((l) => l.includes('状态：')) || '').trim()
      return /状态：\s*已打补丁/.test(r.out) ? 'ok' : /状态：\s*未打补丁/.test(r.out) ? 'need' : 'unknown'
    },
    apply: (s) => nodeApply(s, DATA),
  },
  {
    id: 'reasoning-fallback',
    title: '思考通道兜底（正文为空时用思考内容续走）',
    script: DEBUG + '/mvu-api-test/patch-reasoning-fallback.mjs',
    note: '改 lib/index.js，不受 build 影响',
    status() {
      const r = node(this.script, DATA)
      this.detail = (r.out.split('\n').find((l) => l.includes('状态：')) || '').trim()
      return /状态：\s*已打补丁/.test(r.out) ? 'ok' : /状态：\s*未打补丁/.test(r.out) ? 'need' : 'unknown'
    },
    apply: (s) => nodeApply(s, DATA),
  },
  {
    id: 'card',
    title: '卡内 generate 兜底（龙娘回廊）',
    script: DEBUG + '/mvu-api-test/patch-card-generate.mjs',
    note: '不受宿主升级影响，列在这里只为一起看状态',
    status() {
      const r = node(this.script, DATA)
      this.detail = (r.out.split('\n').find((l) => l.includes('状态：')) || '').trim()
      return r.out.includes('已写入卡内补丁') ? 'ok' : r.out.includes('未写入') ? 'need' : 'unknown'
    },
    apply: (s) => nodeApply(s, DATA),
  },
]

// patch-frame-helper 已退役：六处补丁现在住在 src/，build 会带进 lib/
const RETIRED = {
  id: 'frame-helper',
  title: 'iframe helper（已退役）',
  note: '由 src 补丁取代，lib/ 上的旧标记已被 build 清除 → 现在会误报"只打了一半"，属正常',
}

// ── 先查状态 ────────────────────────────────────────────────────────────
console.log('DSH Tavern 宿主补丁状态')
console.log('')
const need = []
for (const p of PATCHES) {
  const st = p.status()
  const mark = st === 'ok' ? '[ ok ]' : st === 'need' ? '[需要]' : st === 'partial' ? '[部分]' : '[ ?? ]'
  console.log('  ' + mark + ' ' + p.title)
  if (p.detail) console.log('         ' + p.detail)
  if (p.note) console.log('         (' + p.note + ')')
  // partial 也算要处理 —— patch-src --apply 是幂等的，会补齐缺的那几处
  if (st === 'need' || st === 'partial') need.push(p)
}
console.log('  ' + '[ -- ]' + ' ' + RETIRED.title)
console.log('         (' + RETIRED.note + ')')
console.log('')

if (!apply) {
  if (need.length) {
    console.log('有 ' + need.length + ' 个需要重打。跑 --apply 处理。')
  } else {
    console.log('全部就位。')
  }
  process.exit(0)
}

// ── 应用 ────────────────────────────────────────────────────────────────
if (!need.length) {
  console.log('没有需要重打的。')
  process.exit(0)
}

console.log('开始重打…')
console.log('')

// 1) 源码补丁
// 改 src/ 的补丁（源码补丁 + 界面标注）都要在 build 之前跑完 —— build 会整份
// 重建 lib/client.js，跑在它前面的 src 改动才会进产物。任一项需要应用就要 build。
const SRC_IDS = ['src', 'reasoning-notice']
const needSrc = PATCHES.filter((p) => SRC_IDS.includes(p.id)).filter((p) => need.includes(p))
let didBuild = false
if (needSrc.length) {
  console.log('① 应用源码补丁')
  for (const p of needSrc) {
    console.log('   · ' + p.title)
    const r = p.apply(p.script)
    console.log(r.out.split('\n').filter((l) => l.trim()).map((l) => '     ' + l).join('\n'))
    if (r.code !== 0) {
      console.log('   源码补丁失败，中止（后面依赖它）。')
      process.exit(1)
    }
  }
  console.log('')
  console.log('② 重建 lib/client.js')
  const b = run(process.execPath, ['bin/build-tavern-client.mjs'], APP)
  console.log('   ' + (b.out.trim().split('\n').pop() || '(无输出)'))
  if (b.code !== 0) {
    console.log('   构建失败，中止。')
    process.exit(1)
  }
  didBuild = true
  console.log('')
}

// 2) 其余补丁（改 lib/ 的直接注入，必须在 build 之后）
let step = didBuild ? 3 : 1
const NUMS = ['①', '②', '③', '④', '⑤', '⑥']
for (const p of need) {
  if (needSrc.includes(p)) continue
  // 没有 apply 的项 = 已并入别处（如 workshop 并入源码补丁），只列不跑
  if (typeof p.apply !== 'function') continue
  console.log((NUMS[step - 1] || '·') + ' ' + p.title)
  const r = p.apply(p.script)
  const lines = r.out.split('\n').filter((l) => l.trim())
  console.log(lines.slice(0, 6).map((l) => '   ' + l).join('\n'))
  if (r.code !== 0) console.log('   ⚠ 退出码 ' + r.code)
  step += 1
  console.log('')
}

// 3) 复查
console.log('复查：')
console.log('')
let bad = 0
for (const p of PATCHES) {
  const st = p.status()
  if (st !== 'ok') bad += 1
  console.log('  ' + (st === 'ok' ? '[ ok ]' : '[需要]') + ' ' + p.title)
}
console.log('')

if (didBuild) {
  console.log('提示：重建过 lib/client.js，所以还要确认一次一致性 ——')
  const c = run(process.execPath, ['bin/build-tavern-client.mjs', '--check'], APP)
  console.log('  ' + c.out.trim().split('\n').filter(Boolean).pop())
  console.log('')
}

if (bad) {
  console.log('仍有 ' + bad + ' 个未就位，看上面的输出。')
} else {
  console.log('全部就位。**重启 DSH 才生效。**')
}
