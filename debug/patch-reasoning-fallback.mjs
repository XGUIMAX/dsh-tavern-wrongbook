// ⑩ 思考通道兜底：正文为空、而思考通道有内容时，用思考内容续走流程。
//
// 用法：
//   node patch-reasoning-fallback.mjs            # 看状态
//   node patch-reasoning-fallback.mjs --apply    # 应用（幂等，自动备份）
//   node patch-reasoning-fallback.mjs --revert   # 还原
//
// ── 为什么 ───────────────────────────────────────────────────────────────
//
// 模型偶尔会把整段回答写进 reasoning 通道，text 通道为空。Tavern 的
//
//   assistantResultForTurn()  →  reasoningOnly = (text === '' && reasoningText !== '')
//
// 据此在 lib/index.js 里 recordFailure + throw。而那个 throw 之后就是：
//
//   const saved = await foregroundHandoff.finalize({ ... })
//   if (saved.reply) replaceAssistantReply(session, assistant, saved.reply.sessionText)
//
// 两行都不执行 —— 于是：正文不进存档交接、展示管线（正则/MVU 美化）不跑、
// 状态栏挂一条"本轮运行失败"的红字。**可是界面上明明已经把那段内容显示出来了。**
//
// 内容其实一代不少，只是走错了通道。判失败等于把它丢在地上。
//
// ── 实测（2026-09-27，chat-muean70p-ichmxt）──────────────────────────────
//
//   day         finish        n    emptyLen
//   2026-09-24  stop         17        0        ← 正常
//   2026-09-26  stop         40        0        ← 正常
//   2026-09-27  stop         58       17        ← 29% 正文为空，成簇发作
//
// 成簇表现：02:xx 全成功、14:13–14:20 连空 5 次、20:36 成功两次、
// 20:57–21:09 又连空 7 次。同一天里自相矛盾，所以不是配置问题，是运行时状态。
// journal 里 turn 117 在 21:09:58 写下 foregroundError{code:"reasoning-only"}，
// 对应的那次调用（21:09:51，finish=stop）正文长度正是 0。
//
// ── 兜底不掩盖事实 ───────────────────────────────────────────────────────
//
// 仍然往宿主日志打一行 warn，注明"本轮用了思考内容兜底"和 turn 号 ——
// 正文来源可追溯，只是不再把整轮判死。
//
// 保留原分支：真正一个字都没有（reasoning 也空）时，照旧 recordFailure + throw。
//
// ── ⑩-b 落库前声明来源（2026-09-27 追加）────────────────────────────────
//
// 只兜底不声明，用户的观感仍然是"截断"：内容虽然接住了，可它是模型的思考草稿 ——
// 落库后 replaceAssistantReply 把整条消息换成这段文字，于是"回复区"显示的其实是
// 思考原文；而模型 stop 时 reasoning 里本来就是半成品，看着就像说到一半停住。
// 用户原话："思考过程被当成了回复显示，然后又截断了。"
//
// 所以落库前插一行声明：正文第一行写明这段取自思考通道、未经模型作为正文输出。
// 标记加在展示管线（正则 / MVU 投影）**之后**，不会被动卡的正则二次加工；
// 内容一个字不动，只是不再让它冒充成品回答。
import fs from 'node:fs'
import path from 'node:path'

const TARGET = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/index.js'
const BACKUP = TARGET + '.bak-reasoning-fallback'

const MARK = '思考通道兜底'
const MARK2 = '兜底来源标记'

// 正文第一行的声明。放在展示管线之后，避免被卡内正则 / MVU 改写。
const NOTICE = '【本轮正文为空：以下内容取自模型的思考通道，未经模型作为正文输出】'

const A_FROM = `    const assistant = assistantResultForTurn(session, payload.turn)
    if (assistant === null || assistant.text === '') {`

const A_TO = `    const assistant = assistantResultForTurn(session, payload.turn)
    // ${MARK}：模型偶尔把整段回答写进 reasoning，text 通道为空。内容已经生成，
    // 只是走错了通道 —— 判成本轮失败会让它掉在地上（finalize 不执行、展示管线不跑、
    // 状态栏挂红字），而界面上明明已经把它显示出来了。
    const assistantText = assistant === null
      ? ''
      : (assistant.text !== '' ? assistant.text : (assistant.reasoningText || ''))
    if (assistant !== null && assistant.text === '' && assistantText !== '') {
      // 兜底不等于假装无事：本轮确实出了岔子，照常记录、界面要能看见 ——
      // 只是不再 throw，内容先用思考通道接住。
      // message 与"真·空正文"分开写，免得被"请重新生成"误导去重试一条其实已经成功的轮次。
      console.warn('dsh-tavern: 本轮正文为空、思考通道有内容，已用思考内容兜底（turn ' + payload.turn + '）')
      await turnOrchestrator.recordFailure({
        sessionId,
        turn: payload.turn,
        requestId,
        code: 'reasoning-only-fallback',
        message: '模型本轮把正文写进了思考过程，已自动接住（内容未丢失，无需重新生成）。'
      })
    }
    if (assistant === null || assistantText === '') {`

const B_FROM = `      assistantText: assistant === null ? '' : assistant.text`
const B_TO = `      assistantText`

const C_FROM = `    if (saved.reply) replaceAssistantReply(session, assistant, saved.reply.sessionText)`
const C_TO = `    if (assistant !== null && assistant.text === '' && assistantText !== '') {
      // ${MARK2}：兜底轮次的会话消息要换成「来源声明 + 正文」——
      // 否则界面上只剩一条只有思考块、没有 text 块的消息，看着就是"说到一半停住"。
      // 这里直接调 replaceSessionSurface，**不走 replaceAssistantReply**：
      // 后者靠 finalize 返回的 reply 驱动，而卡片模式（mode === 'card'）的两条
      // 返回路径都没有这个字段 —— 在卡片工作台里它永远不会执行（实测
      // reply-projection 事件 0 次，是被这个前置条件挡住的，不是坐标问题）。
      const fallbackBody = saved.reply && typeof saved.reply.sessionText === 'string'
        ? saved.reply.sessionText
        : assistantText
      const fallbackEvent = assistant.event && assistant.event.data ? assistant.event.data : null
      const seqOfFallback = assistant.event && Number.isSafeInteger(assistant.event.seq)
        ? assistant.event.seq
        : assistant.index
      let surfaceNote = '替换未执行'
      try {
        replaceSessionSurface(session, 'assistant/message', {
          turn: Number(fallbackEvent && fallbackEvent.turn) || payload.turn,
          step: Number(fallbackEvent && fallbackEvent.step) || 1,
          message: Object.assign({}, fallbackEvent && fallbackEvent.message, {
            id: randomUUID(),
            source: { kind: 'model', provider: 'dsh-tavern', model: 'reply-projection' },
            content: [{ type: 'text', text: '${NOTICE}\\n\\n' + fallbackBody }]
          })
        }, { start: seqOfFallback, end: seqOfFallback, sourceEventSeqs: [seqOfFallback] })
        surfaceNote = '替换成功'
      } catch (error) {
        surfaceNote = '替换失败：' + String((error && error.message) || error)
      }
      // 留痕：让"替换有没有落地"直接出现在 journal 里，不必靠界面猜。
      await turnOrchestrator.recordFailure({
        sessionId,
        turn: payload.turn,
        requestId,
        code: 'reasoning-only-fallback',
        message: '模型本轮把正文写进了思考过程，已自动接住（会话消息' + surfaceNote + '）。'
      })
    }`

// 坐标修正：surface 的 nodes 存的是 seq，而 assistantResultForTurn 返回的 index
// 是 events 数组下标。长会话里两者不等，用下标会让 replaceSessionSurface 直接抛
// 「消息替换目标已变化」—— session 日志里 reply-projection 事件 0 次，
// 说明这条替换路径从来没有成功过，声明也就永远到不了界面。
// 锚点必须跨到"插入点之后的一行"：否则补丁后原锚点仍在（它是新文本的前缀），
// 判据会永远认不出"已应用"。
const D_FROM = `    if (result === null || result.text === bodyText) return
    const previous = result.event && result.event.data && result.event.data.message`
const D_TO = `    if (result === null || result.text === bodyText) return
    // ${MARK2}：用事件自身的 seq 当替换坐标，别用 events 数组下标。
    const seqOfResult = result.event && Number.isSafeInteger(result.event.seq) ? result.event.seq : result.index
    const previous = result.event && result.event.data && result.event.data.message`

const E_FROM = `    }, { start: result.index, end: result.index, sourceEventSeqs: [result.index] })`
const E_TO = `    }, { start: seqOfResult, end: seqOfResult, sourceEventSeqs: [seqOfResult] })`

// 每处改动配一个"补丁后专有"的 done 标记：不能用 to 当判据 —— B 的 to
// （`      assistantText`）是它自己 from 的前缀，两边都会命中，判据直接失效。
const DONE_B = `      userContent,
      assistantText
    })`

const EDITS = [
  { name: '兜底文本计算 + 判空改判 assistantText', from: A_FROM, to: A_TO, done: 'reasoning-only-fallback' },
  {
    name: 'finalize 改用兜底文本',
    from: B_FROM,
    to: B_TO,
    done: DONE_B,
    undoFind: DONE_B,
    undoReplace: `      userContent,
      assistantText: assistant === null ? '' : assistant.text
    })`,
  },
  { name: '兜底轮次替换会话消息 + 来源声明', from: C_FROM, to: C_TO, done: '不走 replaceAssistantReply' },
  { name: '替换坐标改用事件 seq', from: D_FROM, to: D_TO, done: '用事件自身的 seq 当替换坐标' },
  { name: '替换范围传 seq', from: E_FROM, to: E_TO, done: 'sourceEventSeqs: [seqOfResult]' },
]

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

if (!fs.existsSync(TARGET)) {
  console.log('找不到宿主文件：' + TARGET)
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

/** 每一处改动当前是否就位：原锚点消失 + 补丁后专有标记在 = 已应用。 */
function editStates(text) {
  return EDITS.map(function (e) {
    const fromCount = countOf(text, e.from)
    const hasDone = text.includes(e.done)
    return { name: e.name, applied: fromCount === 0 && hasDone, pending: fromCount === 1 && !hasDone, fromCount, hasDone }
  })
}

/** 状态判据跟着改动数量走 —— 少一处必须能被看出来，不能因为标记在就当成完整补丁。 */
function stateOf(text) {
  const states = editStates(text)
  if (states.every(function (s) { return s.applied })) return 'patched'
  if (states.every(function (s) { return s.pending })) return 'original'
  if (states.every(function (s) { return s.applied || s.pending })) return 'partial'
  return 'unknown'
}

function report() {
  const text = read()
  const st = stateOf(text)
  console.log('宿主文件：' + TARGET)
  console.log('  修改时间：' + fs.statSync(TARGET).mtime.toLocaleString())
  if (fs.existsSync(BACKUP)) console.log('  备份：' + path.basename(BACKUP))
  const label = {
    original: '未打补丁（锚点齐全，可应用）',
    partial: '打过一部分（可增量补齐）',
    patched: '已打补丁（含来源声明与坐标修正）',
    unknown: '⭐ 锚点对不上 —— lib/index.js 这段可能被改过，需要人工看一眼',
  }
  console.log('  状态：' + label[st])
  for (const s of editStates(text)) {
    console.log('    [' + (s.applied ? ' ok ' : s.pending ? ' -- ' : ' !! ') + '] ' + s.name + (s.applied || s.pending ? '' : '（锚点 ' + s.fromCount + ' 次 / 补丁后标记 ' + (s.hasDone ? '在' : '不在') + '）'))
  }
  if (st === 'patched') console.log('  → 正文为空而思考通道有内容时，用思考内容续走流程，并把会话消息替换成"来源声明 + 正文"。')
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
    console.log('锚点没匹配上，拒绝改 —— 先确认宿主这段代码长什么样。')
    process.exit(1)
  }

  // 按"当前还缺哪几处"决定要做什么：全齐不动，缺哪补哪（历史版本的中间状态也能补上）。
  const states = editStates(text)
  const plan = EDITS.filter(function (_e, index) { return states[index].pending })
  if (plan.length === 0) {
    console.log('没有可补的锚点 —— 文件状态认不出来，拒绝改。')
    process.exit(1)
  }

  let next = text
  for (const e of plan) {
    const i = next.indexOf(e.from)
    if (i === -1) {
      console.log('拒绝应用：锚点「' + e.name + '」在写入过程中对不上了。')
      process.exit(1)
    }
    next = next.slice(0, i) + e.to + next.slice(i + e.from.length)
  }

  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(TARGET, BACKUP)
    console.log('已备份 → ' + path.basename(BACKUP))
  }
  write(next)
  console.log('已应用。')
  report()
  console.log('')
  console.log('需要重启 DSH 才生效。')
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
    console.log('当前状态认不出来，拒绝还原 —— 免得把宿主改得更乱。')
    process.exit(1)
  }
  if (!fs.existsSync(BACKUP)) {
    console.log('找不到备份，只能用锚点原地还原。')
    const states = editStates(text)
    let next = text
    // 只反向撤"确实已应用"的那几处，别去动没打过的锚点。
    for (let index = EDITS.length - 1; index >= 0; index -= 1) {
      if (!states[index].applied) continue
      const e = EDITS[index]
      const find = e.undoFind || e.to
      const replace = e.undoReplace || e.from
      if (countOf(next, find) !== 1) {
        console.log('还原失败：「' + e.name + '」的补丁后文本不唯一，停手。')
        process.exit(1)
      }
      const i = next.indexOf(find)
      next = next.slice(0, i) + replace + next.slice(i + find.length)
    }
    write(next)
  } else {
    write(fs.readFileSync(BACKUP, 'utf8'))
    console.log('已从备份还原。')
  }
  report()
  process.exit(0)
}
