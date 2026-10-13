// ⑪ 思考通道轮次的界面标注：整条消息只有思考块（没有 text 块）时，
// 必须让人一眼看出"本轮没有正文"，否则界面上就是一段没头没尾的半截文字，
// 看着像卡住了。
//
// 用法：
//   node patch-reasoning-notice.mjs            # 看状态
//   node patch-reasoning-notice.mjs --apply    # 应用（幂等，自动备份）
//   node patch-reasoning-notice.mjs --revert   # 还原
//
// 注意：改的是 src/client/main.js，**必须 build 才会进产物**。
// 单独跑本脚本不生效；走 patch-all.mjs 会自动在 build 之前带上它。
//
// ── 为什么这件事只能在前端做 ────────────────────────────────────────────
//
// 后端那条路试过并已证伪：用 replaceSessionSurface 把会话消息换成
// 「来源声明 + 正文」，**数据层完全正确**（surfaceOp=replace、target 指向原节点、
// content kinds 从 ["reasoning"] 变成 ["text"]、发生在 turn/end 之前），
// 但界面上什么都不会变。原因是 DSH 把替换事件明确限定为只给模型看：
//
//   // @deepseek-ai/dsh-client-ui-chat/lib/client.js:5686-5698
//   // "The model-visible surface deliberately shadows replaced ranges, so it is the
//   //  wrong source for a human transcript — a landed replacement would erase
//   //  conversation the user already saw. Append-origin events are that transcript's
//   //  durable source material; replacement copies stay model-only."
//
// 人类看到的转录只取 surfaceOp === "append" 的事件（hasTextAssistant /
// visibleAssistantEvent 都这么判）。所以：**要改变"看到的东西"，只能在渲染层做。**
//
// ── 改什么 ─────────────────────────────────────────────────────────────
//
// renderTavernAssistantBlocks 渲染 reasoning 块时，若整条消息不存在非空 text 块，
// 就把折叠标题改成「思考过程（本轮没有正文：以下为模型的思考内容）」并默认展开。
// **内容一个字不动**，只是不再让它冒充成品回答。
import fs from 'node:fs'
import path from 'node:path'

const TARGET = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/src/client/main.js'
const BACKUP = TARGET + '.bak-reasoning-notice'

const MARK = '思考通道轮次标注'

// 锚点必须跨到插入点之后（含 `continue;` 与收尾 `}`）—— 否则补丁后原锚点仍在，
// 状态永远认不出"已应用"。
const FROM = [
  '\t\t\t\tif (block.kind === "reasoning") {',
  '\t\t\t\t\trendered.push(h("details", { key: index, className: "dsh-tavern-assistant-reasoning", open: input.streaming && index === blocks.length - 1 }, h("summary", null, input.streaming && index === blocks.length - 1 ? "思考中…" : "思考过程"), h("pre", null, String(block.text || ""))));',
  '\t\t\t\t\tcontinue;',
  '\t\t\t\t}',
].join('\n')

const TO = [
  '\t\t\t\tif (block.kind === "reasoning") {',
  '\t\t\t\t\t// ' + MARK + '：整条消息只有思考块时，把"本轮没有正文"写在标题上并默认展开。',
  '\t\t\t\t\tconst reasoningTail = input.streaming && index === blocks.length - 1;',
  '\t\t\t\t\tconst reasoningOnlyTurn = !blocks.some(function (item) { return item && item.kind === "text" && String(item.text || "").trim() !== ""; });',
  '\t\t\t\t\tconst reasoningLabel = reasoningTail ? "思考中…" : (reasoningOnlyTurn ? "思考过程（本轮没有正文：以下为模型的思考内容）" : "思考过程");',
  '\t\t\t\t\trendered.push(h("details", { key: index, className: "dsh-tavern-assistant-reasoning", open: reasoningTail || reasoningOnlyTurn }, h("summary", null, reasoningLabel), h("pre", null, String(block.text || ""))));',
  '\t\t\t\t\tcontinue;',
  '\t\t\t\t}',
].join('\n')

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

if (!fs.existsSync(TARGET)) {
  console.log('找不到宿主源码：' + TARGET)
  console.log('（Tavern 可能换了目录结构，先确认它还在不在。）')
  process.exit(1)
}

const read = () => fs.readFileSync(TARGET, 'utf8')
const write = (s) => fs.writeFileSync(TARGET, s, 'utf8')

function countOf(text, needle) {
  let n = 0
  let i = text.indexOf(needle)
  while (i !== -1) {
    n += 1
    i = text.indexOf(needle, i + needle.length)
  }
  return n
}

function stateOf(text) {
  const fromCount = countOf(text, FROM)
  const applied = fromCount === 0 && text.includes(MARK) && text.includes('reasoningOnlyTurn')
  if (applied) return 'patched'
  if (fromCount === 1 && !text.includes(MARK)) return 'original'
  return 'unknown'
}

function report() {
  const text = read()
  const st = stateOf(text)
  console.log('宿主源码：' + TARGET)
  console.log('  修改时间：' + fs.statSync(TARGET).mtime.toLocaleString())
  if (fs.existsSync(BACKUP)) console.log('  备份：' + path.basename(BACKUP))
  const label = {
    original: '未打补丁（锚点齐全，可应用）',
    patched: '已打补丁（本轮没有正文时会在标题上说明并默认展开）',
    unknown: '⭐ 锚点对不上 —— 这段渲染可能被改过，需要人工看一眼',
  }
  console.log('  状态：' + label[st])
  if (st === 'patched') console.log('  → 记得 build：改的是 src，产物 lib/client.js 需要重建才生效。')
  return st
}

if (mode === 'status') {
  report()
  console.log('')
  console.log('  --apply   应用')
  console.log('  --revert  还原')
  process.exit(0)
}

if (mode === 'apply') {
  const text = read()
  const st = stateOf(text)
  if (st === 'patched') {
    console.log('已经是打过的状态，不动。')
    report()
    process.exit(0)
  }
  if (st === 'unknown') {
    console.log('锚点没匹配上，拒绝改 —— 先确认这段渲染代码长什么样。')
    process.exit(1)
  }
  const i = text.indexOf(FROM)
  const next = text.slice(0, i) + TO + text.slice(i + FROM.length)
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(TARGET, BACKUP)
    console.log('已备份 → ' + path.basename(BACKUP))
  }
  write(next)
  console.log('已应用（注意：还需要 build 才生效）。')
  report()
  process.exit(0)
}

if (mode === 'revert') {
  const text = read()
  const st = stateOf(text)
  if (st === 'original') {
    console.log('本来就没打过，不动。')
    report()
    process.exit(0)
  }
  if (st === 'unknown') {
    console.log('当前状态认不出来，拒绝还原。')
    process.exit(1)
  }
  if (!fs.existsSync(BACKUP)) {
    console.log('找不到备份，只能用锚点原地还原。')
    const i = text.indexOf(TO)
    if (i === -1) {
      console.log('还原失败：找不到补丁后文本。')
      process.exit(1)
    }
    write(text.slice(0, i) + FROM + text.slice(i + TO.length))
  } else {
    write(fs.readFileSync(BACKUP, 'utf8'))
    console.log('已从备份还原。')
  }
  report()
  process.exit(0)
}
