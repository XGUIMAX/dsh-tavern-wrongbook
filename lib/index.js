/**
 * dsh-wrongbook — Host half.
 *
 * 错题库按人物卡分类记录调试中踩过的坑，并给调试流程一个确定的检索顺序：
 * 先查出问题那张卡自己的错题库，再跨卡查询。
 *
 * 数据落在 Tavern 自己的数据根下（`<dataRoot>/tools/wrongbook`），不在程序安装目录里，
 * 所以 desktop 更新覆盖不到它。浏览器半边（./client.js）通过下面三条路由读写：
 *
 *   GET  /dsh-wrongbook/state    全量状态：卡片分类、条目、自检记录、备份
 *   GET  /dsh-wrongbook/avatar   卡片头像（?card=<key>）
 *   POST /dsh-wrongbook/action   全部写操作与自检
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

/** apply 时记下的 Host Context，用来解析可执行文件的真实路径。 */
let pluginCtx = null
/** Tavern 的插件接口，Tavern 装了才有；没装时整条「游玩时记录」的路都关着。 */
let tavernApi = null

/**
 * 记一条错题时，往回多抓几轮当上下文。
 *
 * 结算漂移、状态栏连着错几轮这类问题，单看当轮说不清「从哪一轮开始不对」；
 * 但也不该把整局拉进来 —— 再多只是把条目撑长，读的人还得自己找重点。
 */
const HISTORY_LOOKBACK = 2
const HISTORY_CHARS = 800

/**
 * 启动时那次宿主补丁自动检查的结果。
 * 面板读它来显示"上次自动检查是什么时候、补了没有、要不要重启"：
 *
 *   checkedAt       上次检查的时间戳
 *   pendingRestart  刚补过 → 本次启动未生效，要重启
 *   output          脚本的原始输出（面板折叠展示）
 *   error           检查失败的原因（有值就说明没跑成）
 */
const autoPatch = { checkedAt: 0, pendingRestart: false, output: '', error: '' }

export const name = 'dsh-tavern-wrongbook'

/**
 * 声明的服务会被注入成 `ctx.tools` / `ctx.systemPrompt`。
 *
 * 少了这行，`ctx.get('tools')` 拿不到东西，工具注册会静默跳过 ——
 * 面板照常工作（它走 HTTP 路由），但模型侧一个工具都看不到，归档自然落空。
 *
 * Tavern 的 `tavern` 服务**不在这里**：这里声明的都是硬依赖，缺一个整个插件就不
 * apply，而 Tavern 是可选装的东西。它走 apply 里的 `ctx.inject(['tavern'], …)`
 * 按需取（见下面）。
 */
export const inject = ['tools', 'systemPrompt']

/**
 * 写进 system prompt 的一段。
 *
 * 只注册工具不够：工具列表里多几个名字，模型不会因此去用它们。真发生过一次 ——
 * 让 Agent 归档时，它把错题写进了 `materials/错题库.md`，因为它只知道那儿。
 * 所以这里把「什么时候查、什么时候归档、归档完回报一句」明确写下来。
 *
 * 第 2 条是后加的：转 MVU 之后那个「副本比原版少了什么」的对照最容易漏，
 * 而漏掉的往往是作者自带的功能脚本 —— 它们被转换清空后不会自己回来，
 * 界面和逻辑静悄悄地少一块，卡看起来却一切正常。
 */
const WRONGBOOK_PROMPT = [
  '【错题库】本机装了 dsh-wrongbook，错题的唯一归档位置是它（面板入口：设置 → 错题库）。',
  '工具三个：`wrongbook_lookup` 查、`wrongbook_record` 归档、`wrongbook_update` 补写。',
  '',
  '**下面这些场景动手前都要先过一遍错题库**：',
  '',
  '1. 调试人物卡 —— `card` 填卡名。',
  '2. **转 MVU 版，以及转换后做「副本比原版少了什么」的差异对照。** 这一步最容易漏，漏掉的往往是作者自带的功能脚本：它们被转换清空之后不会自己回来，界面和逻辑静悄悄地少一块，卡看起来却一切正常。开查之前先在错题库里找「差异判定 / 脚本补回」—— 那里有四类差异的分法（预期移除 / 改名保留 / 有意停用 / 真缺失）和现成的对比工具。',
  '3. 排查 DSH / Tavern / 插件自身的问题 —— `card` 填「卡片更新器」「Tavern 本体」这类主题名。',
  '',
  '查的顺序是固定的：`wrongbook_lookup { card: "<卡名或主题>" }` 返回「① 本分类 → ② 其它错题 → ③ 跨卡查询」三段，前一段优先看。',
  '',
  '**凡是碰某张卡（调试它、转 MVU、对比原版与副本），第一步先盘点它带了什么：**',
  '',
  '- `node data/tools/card-scripts/scan.mjs --card "<卡名>"`；面板「卡脚本」页是同一份数据。',
  '- 要看的是**四类**，一样都不能少：**脚本**（含特化脚本与控制器）、**正则脚本**（含**停用的**和**抢同一占位符的**）、**控制器条目**（要求输出 `<update>` / `json_patch` 的）、**`[initvar]` 条目**。',
  '- 为什么必须机械地过一遍：卡带了什么**直接决定它怎么跑**，而这些东西在卡面上看不出来。凭印象判断一定会漏 —— 实测 17 张卡里 196 条正则、其中 40 条停用、13 张卡存在占位符互抢；这些数字靠"看一眼卡"是拿不到的。',
  '- 尤其是**停用的正则**和**占位符冲突**：前者多半是被替换掉的旧状态栏，留着会和行为不符；后者会让其中一条**永远不生效**（已知的 C-06）。',
  '',
  '**每修好一个问题都要归档，这是收尾动作的一部分：**',
  '',
  '- 判断标准放得很宽：改了代码、调了配置、修掉一个报错、排除一个故障、弄清一个"原来是这样" —— 都算。宁可多记一条，也不要漏。',
  '- **在回复用户之前归档**，不要等他提醒。没归档，等于这次调试只做了一半 —— 下次遇到同一个坑，还得从头再查一遍。',
  '- `wrongbook_record { card, title, symptom, cause, fix, scope, tags }`，现象、根因、证据、处理、防坑都写进去。分类名不认识会自动建。库里已有同一条就用 `wrongbook_update { id, status, cause, fix }` 补根因或标记已修复。',
  '- 归档完，在回复**末尾**带一句回执。**整句用 `**…**` 加粗**，措辞随意，但这几项信息一项都不能少：',
  '  说出「已归档到错题库」、归档到了**哪个分类**、**哪几条**（标题）、以及**自动同步的结果**（写进哪个 skill、这次多了几条、那个 skill 现在一共几条）。',
  '  这几项在工具的返回值里都有（`reflux` 字段带着 skill / written / skipped / total）；没开自动同步时它是 `null`，那几项就不写。',
  '  为什么要加粗：这行是用户确认「归档真的发生了」的唯一凭据，夹在正文里容易被当成普通叙述划过去。别省，也别含糊成"已记录"。',
  '',
  '不要再把错题写进 md 文件：`materials/错题库.md`、技能里的 `references/` 都已经迁走，写进去等于没归档 —— 面板查不到，下次调试也检索不到。',
].join('\n')

/* ------------------------------------------------------------ locations */

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** Tavern 数据根。DSH_TAVERN_DATA 优先，方便换 root 时不动代码。 */
const TAVERN_DATA =
  process.env.DSH_TAVERN_DATA || path.join(DSH_HOME, 'profile-data', 'tavern', 'data')
const RES_DIR = path.join(TAVERN_DATA, 'resources')
const CARD_DIR = path.join(RES_DIR, 'cards')
/** Tavern 保存的未改动原版卡，卡图也放在它旁边。 */
const ORIGINALS_DIR = path.join(TAVERN_DATA, 'originals', 'cards')
const DATA_DIR = path.join(TAVERN_DATA, 'tools', 'wrongbook')
const DB_FILE = path.join(DATA_DIR, 'data.json')
const SELF_FILE = path.join(DATA_DIR, 'selfcheck.json')
const BACKUP_DIR_DEFAULT = path.join(DATA_DIR, 'backups')
/**
 * 当前生效的备份目录。默认在数据目录旁边，也可以在面板上改到别处
 * （换盘、放到同步盘里之类）。改完只影响之后写入的备份，旧目录里已有的不搬。
 */
let BACKUP_DIR = BACKUP_DIR_DEFAULT

/** 包根目录：`<root>/lib/index.js`，所以是本文件的上一层。 */
const PLUGIN_DIR = (() => {
  try {
    return path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  } catch {
    return ''
  }
})()

const FALLBACK_VERSION = '1.0.0'
const MAX_BACKUPS = 60
/** 跨卡通用问题的落点；没有对应卡的条目都归到这里。 */
const GENERAL_KEY = '__general__'
/** 自检要盯的插件自身文件，指纹就是这几项串起来的哈希。 */
const SELF_FILES = ['package.json', 'lib/index.js', 'client.js']
const SCOPES = ['卡片', 'MVU', '世界书', '正则', '脚本', '前端UI', '预设', '工具链', '其他']
const STATUSES = ['open', 'watch', 'fixed']

/* ------------------------------------------------------------- helpers */

function log(...args) {
  try {
    console.log('[dsh-wrongbook]', ...args)
  } catch {
    /* 日志失败不该影响主流程 */
  }
}

function exists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true })
  } catch (e) {
    log('ensureDir failed:', p, e && e.message)
  }
}

function readJson(file, fallback) {
  try {
    if (!exists(file)) return fallback
    const text = fs.readFileSync(file, 'utf8')
    if (!text.trim()) return fallback
    return JSON.parse(text)
  } catch (e) {
    log('readJson failed:', file, e && e.message)
    return fallback
  }
}

/** 先写临时文件再改名，避免半截 JSON 覆盖掉上一份好的。 */
function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp-${process.pid}`
  const body = JSON.stringify(value, null, 2)
  fs.writeFileSync(tmp, body, 'utf8')
  fs.renameSync(tmp, file)
}

function nowIso() {
  return new Date().toISOString()
}

function str(value) {
  return value === undefined || value === null ? '' : String(value)
}

function uid() {
  return `e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function sha256File(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch {
    return ''
  }
}

function splitTags(value) {
  if (Array.isArray(value)) {
    return value.map(str).map((s) => s.trim()).filter(Boolean).slice(0, 12)
  }
  return str(value)
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
}

/* ---------------------------------------------------------------- store */

function emptyDb() {
  return { version: 1, updatedAt: '', cards: {}, entries: [] }
}

let db = emptyDb()

function loadDb() {
  const raw = readJson(DB_FILE, null)
  if (!raw || typeof raw !== 'object') {
    db = emptyDb()
    return
  }
  db = {
    version: 1,
    updatedAt: str(raw.updatedAt),
    cards: raw.cards && typeof raw.cards === 'object' ? raw.cards : {},
    entries: Array.isArray(raw.entries) ? raw.entries.map((e) => normalizeEntry(e, e && e.cardKey)) : [],
    config: raw.config && typeof raw.config === 'object' ? raw.config : { remoteUrl: '' },
  }
  lastWritten = JSON.stringify(db, null, 2)
}

/** 上一次真正落到盘上的内容，用来挡掉重复写和它带来的成串备份。 */
let lastWritten = null

function saveDb(reason) {
  try {
    db.updatedAt = nowIso()
    const body = JSON.stringify(db, null, 2)
    if (body === lastWritten) return false
    if (exists(DB_FILE)) backupDb(reason || 'save')
    writeJsonAtomic(DB_FILE, db)
    lastWritten = body
    return true
  } catch (e) {
    log('saveDb failed:', e && e.message)
    throw e
  }
}

/**
 * 备份文件名长这样：`<毫秒>__<起因>__data.json`。
 *
 * 自定义备份目录里可能同时躺着别人的 JSON（用户挑了一个通用备份文件夹）。
 * 保留策略是会删东西的，所以「是不是本插件写的」必须先按名字认出来，
 * 否则一次自动清理就会连别人的文件一起带走。
 */
const BACKUP_NAME_RE = /^\d{10,}__[A-Za-z0-9_-]*__data\.json$/

function isBackupName(name) {
  return BACKUP_NAME_RE.test(str(name))
}

function backupDb(reason) {
  ensureDir(BACKUP_DIR)
  try {
    const safe = str(reason || 'save').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40)
    const stamp = Date.now()
    // 同一毫秒里连着写两次会撞名，而撞名是静默覆盖 —— 一份备份就这么没了。
    // 撞上就加序号，文件名形状不变，`isBackupName` 与列表解析都还认得。
    let dest = path.join(BACKUP_DIR, `${stamp}__${safe}__data.json`)
    for (let n = 2; exists(dest); n += 1) {
      dest = path.join(BACKUP_DIR, `${stamp}__${safe}-${n}__data.json`)
    }
    fs.copyFileSync(DB_FILE, dest)
    pruneBackups()
  } catch (e) {
    log('backupDb failed:', e && e.message)
  }
}

/** 备份条目数的缓存：按键是「文件名:大小:修改时间」，任一变了就重新数。 */
const backupMeta = new Map()

function countBackupEntries(full, name, size, mtime) {
  const key = `${name}:${size}:${mtime}`
  if (backupMeta.has(key)) return backupMeta.get(key)
  let entries = -1
  try {
    const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
    entries = Array.isArray(raw && raw.entries) ? raw.entries.length : -1
  } catch {
    entries = -1
  }
  if (backupMeta.size > 400) backupMeta.clear()
  backupMeta.set(key, entries)
  return entries
}

/**
 * 备份列表，最新的在前。
 *
 * 带上条目数：还原之前要能看出这份备份是"当时只有几条"还是"和现在差不多"，
 * 只看时间的话，一份刚写出来的空备份和一份内容完整的备份长得一样。
 */
function listBackups() {
  if (!exists(BACKUP_DIR)) return []
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter(isBackupName)
      .map((n) => {
        const full = path.join(BACKUP_DIR, n)
        let st = null
        try {
          st = fs.statSync(full)
        } catch {
          /* 文件刚被删掉 */
        }
        if (!st) return null
        const [stamp, reason] = n.split('__')
        return {
          file: n,
          at: Number(stamp) || st.mtimeMs,
          reason: str(reason).replace(/-/g, ' '),
          bytes: st.size,
          entries: countBackupEntries(full, n, st.size, st.mtimeMs),
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.at - a.at)
      .slice(0, 200)
  } catch {
    return []
  }
}

function pruneBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(isBackupName)
      .map((n) => ({ n, t: Number(n.split('__')[0]) || 0 }))
      .sort((a, b) => b.t - a.t)
    for (const extra of files.slice(MAX_BACKUPS)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, extra.n))
      } catch {
        /* 已经被清掉了 */
      }
    }
  } catch {
    /* 目录不可读时保持原样 */
  }
}

/**
 * 这条错题是从哪一轮抓来的（结构化的一份）。
 *
 * 存在的唯一理由是"来源会失效"：回退、重新生成、编辑正文之后，那一轮的正文
 * 已经不是当初抓下来的那段，`refs` 里那句「第 N 轮」就成了指向空气的指针。
 * 有了 gameId + turn，Tavern 发来剧情线变化通知时才知道该给谁盖标记。
 *
 * `refs` 是给人读的一句话，这一份是给机器比对的，两者并存、互不替代。
 * 早期条目没有这个字段（那时只写了 refs），保持 null —— 标脏逻辑会跳过它们。
 */
/**
 * 轮次号只认真正的数字。
 *
 * `Number(null)`、`Number('')`、`Number(undefined)` 全是 0 —— 直接 `Number()` 会把
 * 「没带轮次」悄悄变成「第 0 轮」，而这两件事在下游的判断里完全不同：前者要退化成
 * 按整局处理，后者会被当成一个真实的（不存在的）轮次去比对。
 */
function turnOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const turn = Number(value)
  return Number.isFinite(turn) ? turn : null
}

function normalizeSource(raw) {
  const src = raw && typeof raw === 'object' ? raw : null
  if (!src) return null
  const gameId = str(src.gameId).trim()
  const turn = turnOrNull(src.turn)
  if (!gameId || turn === null) return null
  const out = { gameId, turn, textVersion: str(src.textVersion) }
  // 第 3 版起 Tavern 会给出人物卡工作版的版本号。它不参与标脏，只回答
  // 「这条错题是对哪一版卡记的」—— 卡改过之后同一个毛病可能已经不在了，
  // 而卡名一辈子都不会告诉你这件事。老条目没有这个字段，保持没有。
  const revision = Number(src.cardRevision)
  if (Number.isSafeInteger(revision) && revision >= 0) out.cardRevision = revision
  return out
}

/** 来源失效的标记：剧情线变化之后由 markStale 盖上，清掉只能手工确认。 */
function normalizeStale(raw) {
  const src = raw && typeof raw === 'object' ? raw : null
  if (!src) return null
  const kind = str(src.kind).trim()
  if (!kind) return null
  return { kind, turn: turnOrNull(src.turn), at: str(src.at) || nowIso() }
}

function normalizeEntry(raw, cardKey) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    id: str(src.id) || uid(),
    cardKey: str(src.cardKey) || str(cardKey) || GENERAL_KEY,
    title: str(src.title),
    symptom: str(src.symptom),
    cause: str(src.cause),
    fix: str(src.fix),
    scope: SCOPES.includes(src.scope) ? src.scope : '其他',
    status: STATUSES.includes(src.status) ? src.status : 'open',
    tags: splitTags(src.tags),
    refs: str(src.refs),
    evidence: str(src.evidence),
    source: normalizeSource(src.source),
    stale: normalizeStale(src.stale),
    createdAt: str(src.createdAt) || nowIso(),
    updatedAt: nowIso(),
  }
}

/* --------------------------------------------------- timeline-stale marking */

/**
 * 剧情线变了：给受影响的「游玩时记录」底稿盖一个来源失效标记。
 *
 * 只盖标记、不改内容 —— 底稿记的是当时发生的事，改它等于篡改记录。用户看到
 * 角标之后自己决定：重抓一条，还是确认过就把标记清掉。
 *
 * 处理的是 Tavern 的 `onTimelineChanged`（插件接口第 2 版）。`kind` 取
 * rollback / undo-rollback / regenerate / edit / fork；`turn` 可能不带 ——
 * 那说明宿主没给精确轮次，退化成按整局标。
 */
function markStale(event) {
  const gameId = str(event && event.gameId).trim()
  const kind = str(event && event.kind).trim()
  if (!gameId || !kind) return { touched: 0 }

  // fork 是"从某一局分叉出新的一局"：原局的底稿不受影响，新局里还没有底稿。
  // 将来若要支持"分叉后在新局继续记录"，在这里把 source.gameId 迁过去即可。
  if (kind === 'fork') return { touched: 0 }

  const turn = turnOrNull(event && event.turn)
  let touched = 0

  for (const entry of db.entries) {
    const source = entry.source
    if (!source || source.gameId !== gameId) continue

    if (kind === 'undo-rollback') {
      // 撤销回退：那些轮次又读得到了 —— 只清掉当初因回退盖上的那一枚。
      // 重新生成 / 编辑留下的不动，因为那些正文确实已经和底稿不一致了。
      if (entry.stale && entry.stale.kind === 'rollback') {
        delete entry.stale
        touched += 1
      }
      continue
    }

    if (kind === 'rollback') {
      // 被回退的那一轮及之后都读不到了。
      if (turn === null || source.turn >= turn) {
        entry.stale = { kind, turn, at: nowIso() }
        touched += 1
      }
      continue
    }

    if (kind === 'regenerate' || kind === 'edit') {
      // 只有被重写的那一轮变了。
      if (turn === null || source.turn === turn) {
        entry.stale = { kind, turn, at: nowIso() }
        touched += 1
      }
      continue
    }

    // 不认识的 kind：按接口约定忽略 —— 以后新增的类型各自定义语义。
  }

  if (touched) saveDb('timeline-stale')
  return { touched }
}

/* ---------------------------------------------------------- card scanning */

/**
 * 卡内脚本盘点。
 *
 * 作者经常随卡附带自定义脚本 —— 悬浮状态栏、地理数据加载、变量更新器、自动化流程 ——
 * 它们不在任何通用清单里，却决定了卡能不能正常跑。DSH 又没有全局脚本槽：脚本随卡加载，
 * 换一张卡就换一套脚本。所以排查任何一张卡之前，先看清它带了什么。
 *
 * 这份规则是从 `data/tools/card-scripts/scan.mjs` 搬进来的，那边是个命令行脚本，
 * 这里做成面板上随时能看的一栏。
 */
const COMMON_SCRIPTS = new Set(['外置状态栏', '小手机脚本', '创意工坊', '格式修复', '辅助计算脚本'])
const CONTROLLER_RE = /控制器|推演|播报|主线|副本控制/

function describeScript(raw) {
  const content = str(raw && raw.content)
  return {
    name: str(raw && raw.name).trim() || '（未命名）',
    chars: content.length,
    enabled: !(raw && raw.enabled === false),
    // 脚本可以用 `import '...'` 指向同一个目录下的另一份文件，那才是它的真身。
    link: (content.match(/^import\s+['"]([^'"]+)['"]/m) || [])[1] || '',
    common: COMMON_SCRIPTS.has(str(raw && raw.name).trim()),
    dataKeys: raw && raw.data && typeof raw.data === 'object' ? Object.keys(raw.data) : [],
  }
}

/**
 * 盘一张卡带的正则脚本。
 *
 * `regex_scripts` 是卡里**项数最多**的一块（实测 17 张卡共 196 条），状态栏渲染、
 * 占位符展开、格式修复全在里面。之前完全没盘点它 —— 于是"这张卡带了什么"这个问题，
 * 答出来的只是其中一部分。
 *
 * 每条约出：名字、匹配什么、是否停用、作用在哪一层。停用的要单独标出来 ——
 * 那多半是被替换掉的旧状态栏，留着会和新的一条抢同一个占位符（已知的 C-06 坑）。
 */
function describeRegex(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  const find = str(item.findRegex)
  // 占位符：`<StatusPlaceHolderImpl/>`、`<mvu-status/>` 这种。两条正则抢同一个位置
  // 是最容易出问题的地方，单独挑出来。
  //
  // 先在副本上还原被转义的斜杠：作者写正则时常写成 `<\/pic>`，那在字符串里是
  // `\\/`，直接匹配会一个占位符都提取不到 —— 冲突检测于是静默失效。
  const unescaped = find.replace(/\\\//g, '/')
  const markers = (unescaped.match(/<[A-Za-z][\w:.-]*\s*\/?>/g) || []).slice(0, 3)
  const where = []
  if (item.markdownOnly) where.push('仅显示')
  if (item.promptOnly) where.push('仅提示词')
  if (item.placement && !item.markdownOnly && !item.promptOnly) where.push(str(item.placement))
  return {
    name: str(item.scriptName) || '(未命名正则)',
    disabled: !!item.disabled,
    find,
    markers,
    where: where.join(' / '),
    replaceChars: str(item.replaceString).length,
  }
}

/** 从一张卡的完整 JSON 里把脚本与几类"机制条目"挑出来。 */
function cardScriptsOf(raw) {
  // 卡文件不一定就是卡本体：DSH 存盘时可能在外面套一层 `{ raw: … }`。
  // 少剥这一层，脚本数就永远是 0。
  const card = (raw && raw.raw) || raw
  const data = card && card.data && typeof card.data === 'object' ? card.data : card
  const extensions = (data || {}).extensions || {}
  const helper = extensions.tavern_helper || extensions.TavernHelper || {}
  const scripts = helper.scripts
  const entries = (((data || {}).character_book || {}).entries) || []
  const list = (Array.isArray(scripts) ? scripts : []).map(describeScript)
  const commentOf = (e) => str(e && e.comment)

  const regexes = (Array.isArray(extensions.regex_scripts) ? extensions.regex_scripts : []).map(describeRegex)
  /*
   * 抢同一个占位符的：同一个 marker 被多条正则匹配到，排在后面的永不生效。
   *
   * 但**光看"有几条"会误报** —— 卡作者经常成对地写：一条负责渲染、一条负责对 AI
   * 隐藏，或者"在线版 / 离线版"二选一（其中一条停用）。实测 25 处里大部分是这种。
   *
   * 所以再分一档：**全部启用**才是真可疑（谁也压不住谁，行为取决于排序）；
   * 有停用的就只是"设计上留了备选"。同名重复单独标出来 —— 那几乎总是复制粘贴的残留。
   */
  const byMarker = {}
  for (const r of regexes) {
    // 同一条正则可能在文本里出现同一个占位符多次（`(<Disclaimer>…</Disclaimer>)|<done>|…` 这种），
    // 不去重就会把一条当成两条、报成"同名重复"。去重按 marker+名字，一条只算一次。
    for (const m of new Set(r.markers)) {
      byMarker[m] = byMarker[m] || new Map()
      if (!byMarker[m].has(r.name)) byMarker[m].set(r.name, r)
    }
  }
  const clashes = Object.entries(byMarker)
    .map(([marker, map]) => ({ marker, items: [...map.values()] }))
    .filter(({ items }) => items.length > 1)
    .map(({ marker, items }) => ({
      marker,
      names: items.map((r) => r.name),
      allOn: items.every((r) => !r.disabled),
      duplicated: new Set(items.map((r) => r.name)).size < items.length,
    }))

  // 不认识的扩展字段照实列出来。盘点的价值在于"知道它有什么"，认不出来不等于不存在；
  // 漏掉一个字段就是一个排查时的盲区。
  const known = new Set(['tavern_helper', 'TavernHelper', 'regex_scripts', 'talkativeness', 'fav', 'world', 'depth_prompt'])
  const others = Object.entries(extensions)
    .filter(([k]) => !known.has(k))
    .map(([k, v]) => ({ key: k, items: Array.isArray(v) ? v.length : 1 }))

  return {
    scripts: list,
    special: list.filter((s) => !s.common),
    hasCommon: list.some((s) => s.common),
    controllers: entries.filter((e) => CONTROLLER_RE.test(commentOf(e))).map(commentOf),
    patchEntries: entries.filter((e) => /json_patch|UpdateVariable/.test(str(e && e.content))).map(commentOf),
    initvar: entries.filter((e) => /\[initvar\]/i.test(commentOf(e))).map(commentOf),
    regexes,
    regexDisabled: regexes.filter((r) => r.disabled).length,
    regexClashes: clashes,
    otherExtensions: others,
  }
}

/** 卡文件按「路径 + 大小 + 修改时间」缓存解析结果；命中就不必再读那几 MB。 */
const scriptScanCache = new Map()

/**
 * 只列卡文件，不解析内容 —— 毫秒级。
 *
 * 面板先拿它把骨架搭出来：每张卡一行、都标着"盘点中"。然后再一张一张去取详情。
 * 这样界面**立刻**有东西可看，而不是盯着一个转圈等全部读完。
 */
function listCardFiles() {
  const out = []
  let names = []
  try {
    names = fs.readdirSync(CARD_DIR)
  } catch {
    return out
  }
  for (const n of names) {
    if (n.startsWith('.') || !/\.json$/i.test(n)) continue
    const full = path.join(CARD_DIR, n)
    let st = null
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    out.push({ key: `cards/${n}`, name: n.replace(/\.json$/i, ''), bytes: st.size, mtime: st.mtimeMs })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  return out
}

/** 单张卡的脚本详情。带缓存 —— 第二次进来就是几次内存查找。 */
function scanOneCard(key) {
  const rel = str(key).replace(/^cards\//, '')
  if (!rel || rel.includes('/') || rel.includes('\\') || !/\.json$/i.test(rel)) {
    throw new Error(`卡名不合法：${key}`)
  }
  const full = path.join(CARD_DIR, rel)
  const st = fs.statSync(full)
  const stamp = `${full}:${st.size}:${st.mtimeMs}`
  let parsed = scriptScanCache.get(stamp)
  if (!parsed) {
    try {
      parsed = cardScriptsOf(JSON.parse(fs.readFileSync(full, 'utf8')))
    } catch (e) {
      parsed = {
        error: (e && e.message) || String(e),
        scripts: [],
        special: [],
        hasCommon: false,
        controllers: [],
        patchEntries: [],
        initvar: [],
      }
    }
    scriptScanCache.set(stamp, parsed)
  }
  return { key: `cards/${rel}`, name: rel.replace(/\.json$/i, ''), bytes: st.size, mtime: st.mtimeMs, ...parsed }
}

function scanCardScripts() {
  const out = []
  let names = []
  try {
    names = fs.readdirSync(CARD_DIR)
  } catch {
    return out
  }
  for (const n of names) {
    if (n.startsWith('.') || !/\.json$/i.test(n)) continue
    const full = path.join(CARD_DIR, n)
    let st = null
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    const stamp = `${full}:${st.size}:${st.mtimeMs}`
    let parsed = scriptScanCache.get(stamp)
    if (!parsed) {
      try {
        parsed = cardScriptsOf(JSON.parse(fs.readFileSync(full, 'utf8')))
      } catch (e) {
        parsed = {
          error: (e && e.message) || String(e),
          scripts: [],
          special: [],
          hasCommon: false,
          controllers: [],
          patchEntries: [],
          initvar: [],
        }
      }
      scriptScanCache.set(stamp, parsed)
    }
    out.push({ key: `cards/${n}`, name: n.replace(/\.json$/i, ''), bytes: st.size, mtime: st.mtimeMs, ...parsed })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const flagged = out.filter((c) => c.special.length || c.controllers.length || c.patchEntries.length)
  return { cards: out, flagged: flagged.length }
}

/**
 * `data/tools/` 下也躺着脚本：从卡里导出来的、或者为卡自制待命的。
 *
 * 它们不属于任何一张卡，但正是「卡出问题时拿来适配」的原料。判据只认 Tavern 的
 * 脚本形状 —— 有 name、有几百字以上的 content —— 免得把插件的状态文件也收进来。
 */
/** 这些目录里放的是插件自己的状态（备份、清单），不是脚本。 */
const TOOL_SKIP_DIRS = new Set(['wrongbook', 'card-updater', 'backup', 'backups', 'static-cache'])

/** 工具目录里的脚本上限。超过这个大小多半是整卡文件混进来了。 */
const TOOL_SCRIPT_MAX_BYTES = 4 * 1024 * 1024
function scanToolScripts() {
  const root = path.join(TAVERN_DATA, 'tools')
  const out = []
  const looksLikeScript = (obj) =>
    obj && typeof obj === 'object' && typeof obj.name === 'string' && typeof obj.content === 'string' && obj.content.length > 200
  const walk = (dir, depth) => {
    if (depth > 2) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // 插件自己的状态目录、以及任何叫 backup(s) 的目录都不进 —— 里面装的是
        // 整卡的备份，一个目录就上百 MB。全读一遍要好几秒，界面就一直转。
        if (TOOL_SKIP_DIRS.has(entry.name.toLowerCase())) continue
        walk(full, depth + 1)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (ext !== '.json' && ext !== '.mjs' && ext !== '.js') continue
      let st = null
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      // 大小上限：工具目录里的脚本不该有这么大，多半是整卡文件误入。
      if (st.size > TOOL_SCRIPT_MAX_BYTES) continue
      // wrongbook 自己的数据也在这个目录下，排除掉。
      if (full.startsWith(DATA_DIR)) continue
      const record = {
        rel: path.relative(TAVERN_DATA, full).replace(/\\/g, '/'),
        file: entry.name,
        dir: path.basename(dir),
        bytes: st.size,
        mtime: st.mtimeMs,
      }
      if (ext === '.json') {
        const stamp = `${full}:${st.size}:${st.mtimeMs}`
        let parsed = scriptScanCache.get(stamp)
        if (parsed === undefined) {
          try {
            const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
            parsed = looksLikeScript(raw) ? describeScript(raw) : null
          } catch {
            parsed = null
          }
          scriptScanCache.set(stamp, parsed)
        }
        if (!parsed) continue
        out.push({ ...record, ...parsed })
      } else {
        out.push({ ...record, name: entry.name, kind: 'module' })
      }
    }
  }
  walk(root, 0)
  return out.sort((a, b) => b.mtime - a.mtime)
}

/**
 * profile 名从数据根反推。
 *
 * 标准布局是 `<DSH_HOME>/profile-data/<名>/data`，所以先认 `profile-data` 这一级 ——
 * 比"上一级目录名"稳（后者在任何非标准布局下都会安静地给出一个错名字）。
 * 认不出才退回上一级目录名，聊胜于无。环境里没有现成的 profile 变量可用。
 */
function profileNameFrom(dataRoot) {
  const full = path.resolve(str(dataRoot))
  const parts = full.split(path.sep)
  const at = parts.lastIndexOf('profile-data')
  if (at >= 0 && parts.length > at + 1) return parts[at + 1]
  return path.basename(path.dirname(full))
}

function profileDirPath() {
  return path.join(DSH_HOME, 'profiles', profileNameFrom(TAVERN_DATA))
}

/**
 * 安装状态：profile 清单里还在不在、node_modules 那个链接通不通。
 *
 * Tavern 更新会重写 `profiles/<名>/package.json`，但它是读-改-写：只删自己上次托管的
 * （`previousManagedDependencies`）、只覆盖自己这次托管的，用户自己加的条目原样留着。
 * 所以 `link:` 那条依赖和 `dsh.profile.bundles` 里那个名字都动不到。
 *
 * 这里把它查实并显示出来 —— 万一哪天真被抹掉，面板上直接给补回命令，
 * 不用去翻 README 猜。
 */
function installState() {
  const profileDir = profileDirPath()
  const manifestFile = path.join(profileDir, 'package.json')
  const linked = path.join(profileDir, 'node_modules', 'dsh-tavern-wrongbook')
  const state = {
    profileDir,
    manifestFile,
    pluginDir: PLUGIN_DIR,
    declared: false,
    bundled: false,
    linked: false,
    linkTarget: '',
    ok: false,
    fix: '',
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    state.declared = !!(manifest.dependencies && manifest.dependencies['dsh-tavern-wrongbook'])
    const bundles = (((manifest.dsh || {}).profile || {}).bundles) || []
    state.bundled = Array.isArray(bundles) && bundles.includes('dsh-tavern-wrongbook')
  } catch {
    /* 读不到就当两样都缺 */
  }

  try {
    const st = fs.lstatSync(linked)
    if (!st.isSymbolicLink()) {
      // 打包安装是复制进来的，不算链接，但也不是问题。
      state.linked = true
      state.linkTarget = '(复制安装)'
    } else {
      state.linkTarget = fs.readlinkSync(linked)
      state.linked = path.resolve(path.dirname(linked), state.linkTarget) === path.resolve(PLUGIN_DIR)
    }
  } catch {
    /* 链接断了 */
  }

  state.ok = state.declared && state.bundled && state.linked
  if (!state.ok) {
    state.fix = [
      `cd "${profileDir}"`,
      `dsh plugin add "${PLUGIN_DIR}"`,
      '',
      '# 或手工补两处（都不属于 Tavern 会重写的那两份清单）：',
      `#   dependencies        : "dsh-tavern-wrongbook": "link:${PLUGIN_DIR.replace(/\\/g, '/')}"`,
      '#   dsh.profile.bundles : 追加一条 "dsh-tavern-wrongbook"',
    ].join('\n')
  }
  return state
}

/* ------------------------------------------------------------ skill 回流 */

/** 内置 skill 在程序目录里，Tavern 更新会整份覆盖，所以只读不写。 */
function builtinSkillDir() {
  const candidates = []
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDirPath(), 'package.json'), 'utf8'))
    const source = manifest && manifest.dshTavern && manifest.dshTavern.source
    if (source) candidates.push(path.join(source, 'presets', 'tavern', 'skills'))
  } catch {
    /* 读不到就退回默认位置 */
  }
  candidates.push(path.join(DSH_HOME, 'apps', 'dsh-tavern', 'presets', 'tavern', 'skills'))
  return candidates.find(exists) || ''
}

const userSkillDir = () => path.join(TAVERN_DATA, 'skills')

function skillDescriptionOf(file) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 3000)
    const m = head.match(/description:\s*"?([^"\n]+)"?/)
    return m ? m[1].trim().slice(0, 200) : ''
  } catch {
    return ''
  }
}

function listSkills() {
  const out = []
  const scan = (root, builtin) => {
    if (!root || !exists(root)) return
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return
    }
    for (const dirent of entries) {
      if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
      const dir = path.join(root, dirent.name)
      const skillFile = path.join(dir, 'SKILL.md')
      if (!exists(skillFile)) continue
      let references = []
      let entryCount = 0
      try {
        const refDir = path.join(dir, 'references')
        references = fs.readdirSync(refDir).filter((n) => n.endsWith('.md'))
        // 数一数各份参考资料里有多少条 `### ` —— 建重了、或者建完一直没用的 skill
        // 一眼就能看出来，不然列表里几个名字长得一模一样。
        for (const ref of references) {
          try {
            entryCount += (fs.readFileSync(path.join(refDir, ref), 'utf8').match(/^### /gm) || []).length
          } catch {
            /* 读不了就不计 */
          }
        }
      } catch {
        /* 没有 references 目录 */
      }
      out.push({ name: dirent.name, dir, builtin, description: skillDescriptionOf(skillFile), references, entries: entryCount })
    }
  }
  scan(userSkillDir(), false)
  scan(builtinSkillDir(), true)
  // 用户自己的排前面：内置的写不了，先让能写的露头。
  return out.sort((a, b) => (a.builtin === b.builtin ? a.name.localeCompare(b.name) : a.builtin ? 1 : -1))
}

/**
 * 段落的指纹。对**正文**算，不含标记行自己（否则自指，永远对不上）。
 * 尾随空白先归一化，免得编辑器的行尾处理把它算成"改过了"。
 */
function refluxDigest(body) {
  return crypto.createHash('sha1').update(String(body).replace(/\s+$/, ''), 'utf8').digest('hex').slice(0, 12)
}

/**
 * 截一段正文到能认出「是不是同一类坑」的长度。
 *
 * 优先落在句末，退而求其次停在字间 —— 半句话比截短更难读。`0` 表示整段不要：
 * 证据动辄几千字，它的用处是「怎么算验证过」，查详情时回错题库看更合适。
 */
function clipReflux(value, max) {
  const text = str(value).trim()
  if (!max || text.length <= max) return text
  const head = text.slice(0, max)
  const cut = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('；'),
    head.lastIndexOf('\n'),
    head.lastIndexOf('. '),
  )
  const kept = cut > max * 0.5 ? head.slice(0, cut + 1) : head
  return `${kept.replace(/\s+$/, '')}…`
}

/**
 * 段落的正文（不含标题行和标记行）。
 *
 * 写的是**摘要**，不是全文。按全文铺开，三百多条要占九十几万字符，Agent 打开这个
 * skill 等于把上下文全烧在索引上；而它真正需要的只是「这个坑我踩过没有」。
 * 所以每段截到能判类的长度，段末给错题 id —— 要细节就 lookup 那一条。
 */ function refluxBodyOf(entry) {
  const meta = [cardDisplayName(entry.cardKey), entry.scope, statusLabel(entry.status)]
  const stamp = str(entry.updatedAt).slice(0, 10)
  const lines = [`> 回流：${meta.join(' · ')}${stamp ? ` · ${stamp}` : ''}`]
  if (entry.tags && entry.tags.length) {
    // 标签按前 6 个截：一条错题可能挂十几个关键词，全写进来单是这一行就上百字。
    lines.push('', `标签：${entry.tags.slice(0, 6).join('、')}`)
  }
  for (const [label, value, max] of [
    ['现象', entry.symptom, 110],
    ['根因', entry.cause, 90],
    ['修法', entry.fix, 130],
    ['证据', entry.evidence, 0],
    ['引用', entry.refs, 120],
  ]) {
    const kept = clipReflux(value, max)
    if (!kept) continue
    lines.push('', `**${label}**`, '', kept)
  }
  lines.push('', `全文 \`${entry.id}\``)
  return lines.join('\n')
}

/**
 * 一段**没有标记**的正文，像不像我们写的？
 *
 * 用来一次性认领旧文件：标记是后加的，之前那版写进去的段落没有它。
 * 判据放宽到"结构对得上"就够 —— 元信息行 + 至少一个小标题。
 * 认领之后这段就纳入管理，你可以照常改它，改了以后同步会绕开。
 */
function looksLikeReflux(body) {
  const text = String(body)
  return /^> (?:错题库)?回流：/.test(text) && /\*\*(现象|根因|修法|证据|引用)\*\*/.test(text)
}

/**
 * 一条错题铺成 md 段落。
 *
 * 第二行那串 HTML 注释是标记：写着这条来自哪张错题（id）、写的时候什么状态、正文的指纹。
 * 回写时靠它分三种情况 —— 我们自己写的且没人动过（可以更新）、有人改过（不许动）、
 * 没有标记的（不是我们写的，也不许动）。注释不参与渲染，读的时候看不到。
 */
function refluxBlock(entry) {
  const body = refluxBodyOf(entry)
  const mark = `<!-- wrongbook:${entry.id}|${str(entry.status)}|${refluxDigest(body)} -->`
  return [`### ${entry.title}`, mark, '', body].join('\n')
}

/**
 * 把回流文件切成段落。
 *
 * 每段记下标题、id、标记里的状态与指纹、以及**正文**。没有标记的段落 id 为空 ——
 * 那可能是别人手工写的，也可能是更早那版插件写的（那版不带标记），两种情况都得当心。
 *
 * 起点判定有个讲究：**不能见到裸 `### ` 就切**。条目正文里太容易出现三级小标题
 * （修法里贴的那段 markdown 就常有），那样会把一条拦腰截成两半，后半截还会被
 * 当成"没有标记的手工段落"护起来 —— 于是那条永远不再更新，而且没人看得出原因。
 * 所以只认「`### ` 后面紧跟标记行或元信息行」的位置。
 */
/**
 * 标记行的完整格式。判条目起点时用它，别只判 `<!-- wrongbook:` 前缀 ——
 * 条目正文里写到标记的样子是常事（讲格式的时候必然要写），只看前缀会把
 * 那种示例行当成新条目开头，凭空多出一条假条目。
 */
const REFLUX_MARK_RE = /^<!-- wrongbook:([^|]+)\|([^|]*)\|([0-9a-f]{6,}) -->[ \t]*$/
function parseRefluxFile(text) {
  const lines = String(text).split('\n')
  const starts = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('### ')) continue
    const next = lines[i + 1] || ''
    const after = lines[i + 2] || ''
    // 判标记要**整行格式全对**，不能只看前缀。条目正文里难免写到标记的样子
    // （讲格式的时候就会写），只看前缀会把那种示例行当成新条目的开头 ——
    // 于是凭空多出一条标题是「标题」的假条目。
    //
    // 第三个条件是为更早那版写的段落留的（标题下空一行再跟元信息行），必须限定
    // next 是空行 —— 否则正文里依次写着「### 标题 / 标记示例 / 元信息行」的代码块
    // 照样会被当成条目。
    const looksUnmarked = next.trim() === '' && after.startsWith('> 回流：')
    if (REFLUX_MARK_RE.test(next) || next.startsWith('> 回流：') || looksUnmarked) {
      starts.push(i)
    }
  }

  const blank = { title: '', id: '', markedStatus: '', digest: '', body: '', marked: false }
  if (!starts.length) return [{ raw: String(text), ...blank }]

  const sections = []
  if (starts[0] > 0) sections.push({ raw: lines.slice(0, starts[0]).join('\n') + '\n', ...blank })

  for (let k = 0; k < starts.length; k += 1) {
    const from = starts[k]
    const to = k + 1 < starts.length ? starts[k + 1] : lines.length
    const firstLine = lines[from + 1] || ''
    const m = firstLine.match(REFLUX_MARK_RE)
    // 标记行后面那个空行也要去掉：留着的话它会被算进正文，指纹就永远对不上，
    // 于是每段都被误判成"手工改过"，整个更新机制静默失效。
    const rawBody = (m ? lines.slice(from + 2, to).join('\n') : lines.slice(from + 1, to).join('\n'))
    sections.push({
      raw: lines.slice(from, to).join('\n') + '\n',
      title: lines[from].replace(/^### /, '').trim(),
      id: m ? m[1] : '',
      markedStatus: m ? m[2] : '',
      digest: m ? m[3] : '',
      body: rawBody.replace(/^\n+/, '').replace(/\s+$/, ''),
      marked: !!m,
    })
  }
  return sections
}

const REFLUX_HEADER = [
  '> 由 dsh-wrongbook 从错题库回流而来。每个条目下面那行 `<!-- wrongbook:… -->` 是标记，记着它来自哪条错题。',
  '> 条目内容会跟着错题库更新（状态改了这里也跟着改）；但**你手工改过的段落不会再被覆盖** —— 动了哪段，哪段就归你。',
  '',
].join('\n')

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * 把选中的条目写进某个 skill 的 references 下。
 *
 * 只写用户 skill。内置 skill 在程序目录里，写了也会被下次更新整份覆盖 ——
 * 与其让人以为写成功了，不如直接说清，让他先建一个自己的。
 */
function refluxToSkill(payload) {
  const name = str(payload && payload.skill).trim()
  if (!SKILL_NAME_RE.test(name)) throw new Error(`skill 名不合法：${name}`)

  const target = listSkills().find((s) => s.name === name)
  if (target && target.builtin) {
    throw new Error(`「${name}」是内置 skill，在程序目录里，Tavern 更新会整份覆盖它。请先新建一个自己的 skill 再回流。`)
  }

  // 卷式回流：一次调用写多份文件，主文件只留索引。内部递归回本函数时带 oneVolume，
  // 走下面那份单文件逻辑 —— 合并、指纹比对、手改保护这些都还复用原来的判断。
  if (!payload || payload.oneVolume !== true) return refluxToSkillSplit(name, payload)

  const skillDir = target ? target.dir : path.join(userSkillDir(), name)
  const rel = str((payload && payload.file) || 'references/错题库回流.md').replace(/\\/g, '/')
  if (rel.startsWith('/') || rel.split('/').includes('..')) throw new Error(`目标文件不合法：${rel}`)
  const targetFile = path.resolve(skillDir, rel)
  if (!targetFile.startsWith(path.resolve(skillDir))) throw new Error(`目标文件跑到 skill 目录外面了：${rel}`)

  // 用 Set 查，别对每条 entry 扫一遍 ids —— 那和 importEntries 里换掉的是同一个坑：
  // 自动同步每次都传全部 id，8000 条时就是 6400 万次比较（实测这一段要 800 ms）。
  const wanted = new Set(Array.isArray(payload && payload.ids) ? payload.ids.map(String) : [])
  const picked = wanted.size ? db.entries.filter((e) => wanted.has(e.id)) : []
  if (!picked.length) throw new Error('没有选出任何条目')

  ensureDir(path.dirname(targetFile))
  const existed = exists(targetFile)
  const before = existed ? fs.readFileSync(targetFile, 'utf8') : ''
  const sections = existed ? parseRefluxFile(before) : []

  // 已经存在的段落，按标题和 id 各建一份索引
  const byTitle = new Map()
  const byId = new Map()
  for (const section of sections) {
    if (!section.title) continue
    if (!byTitle.has(section.title)) byTitle.set(section.title, section)
    if (section.id && !byId.has(section.id)) byId.set(section.id, section)
  }

  let written = 0 // 新追加
  let updated = 0 // 原地更新（主要是状态变了）
  let unchanged = 0 // 内容一字没变
  let editedByHand = 0 // 有标记但指纹对不上 → 你改过，不动
  let foreign = 0 // 压根没有标记 → 不是我们写的，不动
  const appends = []

  for (const entry of picked) {
    const fresh = refluxBodyOf(entry)
    const existing = byTitle.get(entry.title) || byId.get(entry.id)

    if (!existing) {
      appends.push(refluxBlock(entry))
      written += 1
      continue
    }

    if (existing.marked) {
      if (existing.digest !== refluxDigest(existing.body)) {
        // 指纹对不上 = 这段被人改过。改过就归他，之后同步一律绕开。
        editedByHand += 1
        continue
      }
      if (existing.body === fresh) {
        unchanged += 1
        continue
      }
      existing.raw = `${refluxBlock(entry)}\n`
      updated += 1
      continue
    }

    // 没有标记：多半是更早那版插件写的（那版不带标记），也可能是你手工加的。
    // 结构对得上就认领（补上标记，从此纳入管理）；对不上就当手工的护起来，永远不动。
    if (looksLikeReflux(existing.body)) {
      existing.raw = `${refluxBlock(entry)}\n`
      updated += 1
    } else {
      foreign += 1
    }
  }

  const touched = written + updated
  const total = sections.filter((s) => s.title).length + written

  if (!touched) {
    return {
      skill: name,
      file: targetFile,
      written: 0,
      updated: 0,
      unchanged,
      editedByHand,
      foreign,
      skipped: unchanged + editedByHand + foreign,
      bytes: Buffer.byteLength(before, 'utf8'),
      created: false,
      total,
    }
  }

  const rebuilt = sections.map((s) => s.raw).join('')
  const text = existed
    ? `${rebuilt.replace(/\s*$/, '')}${appends.length ? `\n\n${appends.join('\n\n')}` : ''}\n`
    : `${REFLUX_HEADER}${appends.join('\n\n')}\n`
  fs.writeFileSync(targetFile, text, 'utf8')
  return {
    skill: name,
    file: targetFile,
    written,
    updated,
    unchanged,
    editedByHand,
    foreign,
    skipped: unchanged + editedByHand + foreign,
    bytes: Buffer.byteLength(text, 'utf8'),
    created: !existed,
    total,
  }
}

/** 一个来源要攒到多少条，才值得单独成卷。 */
const REFLUX_VOLUME_MIN = 10

/** 卷名里的安全字符：文件名要能落盘，又不能太长。 */
function refluxVolumeSlug(text) {
  const slug = String(text)
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'untitled'
}

/**
 * 一条错题该写进哪个卷。
 *
 * 按来源分，因为查错题时脑子里先有的是「哪张卡、哪个工具」。大来源单独成卷，
 * 零碎的并进两本：卡片类的进「卡片」，工具类的进「杂项」。
 */
function refluxVolumeOf(entry, counts) {
  const key = String(entry.cardKey || '')
  const n = counts.get(entry.cardKey) || 0
  const card = db.cards[key]
  const label = (card && card.name) || key.replace(/^cards\//, '').replace(/\.json$/i, '')
  if (n >= REFLUX_VOLUME_MIN) return `references/回流-${refluxVolumeSlug(label)}.md`
  return key.startsWith('cards/') ? 'references/回流-卡片.md' : 'references/回流-杂项.md'
}

/**
 * 主文件：卷清单 + 一条一行的索引。
 *
 * 全量重写，不参与「手改保护」—— 它只是目录，改它没有意义，而留着手改会让
 * 目录和卷对不上。要改就去改错题库。
 */
function refluxIndexFile(name, groups, picked) {
  const target = listSkills().find((s) => s.name === name)
  const skillDir = target ? target.dir : path.join(userSkillDir(), name)
  const file = path.join(skillDir, 'references', '错题库回流.md')
  ensureDir(path.dirname(file))
  const lines = [
    '> 由 dsh-wrongbook 自动生成 —— **别手改这个文件**，要改就改错题库，下次同步会重写它。',
    '> 条目按来源分卷，卷里是摘要（现象 160 字 / 根因 120 字 / 修法 240 字）；要全文按 id 去错题库查。',
    '',
    '## 分卷',
    '',
  ]
  for (const [vol, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const label = vol.replace(/^references\/回流-/, '').replace(/\.md$/, '')
    lines.push(`- [${label}](${vol.replace(/^references\//, '')}) — ${list.length} 条`)
  }
  lines.push('', '## 全部条目', '')
  const order = [...picked].sort(
    (a, b) => String(a.cardKey).localeCompare(String(b.cardKey)) || String(a.title).localeCompare(String(b.title)),
  )
  for (const entry of order) {
    const title = String(entry.title).replace(/\s+/g, ' ').trim()
    lines.push(`- ${title} — ${statusLabel(entry.status)} · \`${entry.id}\``)
  }
  const text = `${lines.join('\n')}\n`
  fs.writeFileSync(file, text, 'utf8')
  return { file, bytes: Buffer.byteLength(text, 'utf8'), items: order.length }
}

/**
 * 卷式回流的总入口：分组、逐卷写、最后写索引。
 *
 * 为什么不再单文件：三百多条按全文铺开是九十几万字符，等于让 Agent 把上下文全
 * 烧在「翻目录」上；顺手也顶穿了 skill 参考文件 10 万字的上限（以后若改用
 * saveSkill 会当场被拒）。分卷后每本几万字，检索时只读相关那本。
 */
function refluxToSkillSplit(name, payload) {
  const wanted = new Set(Array.isArray(payload && payload.ids) ? payload.ids.map(String) : [])
  const picked = wanted.size ? db.entries.filter((e) => wanted.has(e.id)) : db.entries.slice()
  if (!picked.length) throw new Error('没有选出任何条目')

  const counts = new Map()
  for (const entry of picked) counts.set(entry.cardKey, (counts.get(entry.cardKey) || 0) + 1)

  const groups = new Map()
  for (const entry of picked) {
    const vol = refluxVolumeOf(entry, counts)
    if (!groups.has(vol)) groups.set(vol, [])
    groups.get(vol).push(entry)
  }

  const volumes = []
  const sum = { written: 0, updated: 0, unchanged: 0, editedByHand: 0, foreign: 0, bytes: 0 }
  for (const [vol, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const res = refluxToSkill({ skill: name, file: vol, ids: list.map((e) => e.id), oneVolume: true })
    volumes.push({ file: vol, count: list.length, bytes: res.bytes || 0 })
    for (const k of ['written', 'updated', 'unchanged', 'editedByHand', 'foreign']) sum[k] += res[k] || 0
    sum.bytes += res.bytes || 0
  }

  const index = refluxIndexFile(name, groups, picked)
  return {
    skill: name,
    file: index.file,
    split: true,
    volumes,
    written: sum.written,
    updated: sum.updated,
    unchanged: sum.unchanged,
    editedByHand: sum.editedByHand,
    foreign: sum.foreign,
    skipped: sum.unchanged + sum.editedByHand + sum.foreign,
    bytes: sum.bytes + index.bytes,
    created: false,
    total: picked.length,
  }
}

/**
 * 删掉一个用户 skill。
 *
 * 先整份复制到 `<数据根>/skill-backups/` 再删：references 里可能攒着几十条
 * 调出来的结论，那是真正花时间换来的东西，一次手滑不该全没。内置的一律拒绝 ——
 * 那在程序目录里，删了也会被更新装回来，只会留下一个半死不活的中间状态。
 */
function deleteUserSkill(payload) {
  const name = str(payload && payload.name).trim()
  if (!SKILL_NAME_RE.test(name)) throw new Error(`skill 名不合法：${name}`)

  const target = listSkills().find((s) => s.name === name)
  if (!target) throw new Error(`没有叫「${name}」的 skill`)
  if (target.builtin) throw new Error(`「${name}」是内置 skill，在程序目录里，这里删不了`)

  const userRoot = path.resolve(userSkillDir())
  const dir = path.resolve(target.dir)
  if (!dir.startsWith(userRoot + path.sep)) throw new Error(`只删用户 skill 目录下的东西：${dir}`)

  let backup = ''
  try {
    const backupDir = path.join(DATA_DIR, 'skill-backups')
    ensureDir(backupDir)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    backup = path.join(backupDir, `${name}-${stamp}`)
    fs.cpSync(dir, backup, { recursive: true })
  } catch (e) {
    // 备份不成就别删 —— 宁可留着，也不要悄悄丢内容。
    throw new Error(`备份没成功，先不删：${(e && e.message) || e}`)
  }

  fs.rmSync(dir, { recursive: true, force: true })
  return { removed: name, backup, files: fs.existsSync(dir) ? 0 : 1 }
}

/**
 * 错题库变了就顺手同步一次。
 *
 * 手动点「回流到 Skill」的实际结果是：记完错题就忘了回流，skill 停在几天前，
 * 下次调试读到的还是旧的那份。所以只要配了目标，写操作之后就自动跟一次 ——
 * 回流本身只增不改，重复调用没有副作用，写进去几条由标题去重决定。
 *
 * 元信息记进 config，面板能显示"上次同步是什么时候、写了几条"，
 * 免得自动跑的东西没人知道它到底跑没跑。
 */
/**
 * 工具回执里那半句自动同步的结果。
 *
 * 光说「已归档」不够：用户想知道东西到底写到哪儿去了、那个地方现在有多少。
 * 带上 skill 名、本次条数和总数，Agent 把这段照搬进回复就够用了；没开自动同步
 * 就明说（省得人不确定是没写还是没开）。
 */
function refluxNote(brief) {
  if (!brief) return '\n（自动同步没开，这条只存在错题库里。）'
  const parts = []
  if (brief.written) parts.push(`新增 ${brief.written} 条`)
  if (brief.updated) parts.push(`按最新状态更新 ${brief.updated} 条`)
  if (!parts.length) parts.push('没有需要改的')
  // 有人手工改过就点名 —— 不然"没更新"会被当成没跑起来。
  if (brief.editedByHand) parts.push(`另有 ${brief.editedByHand} 条你手工改过、已跳过`)
  return `\n自动同步：已写进 skill「${brief.skill}」，本次${parts.join('、')}；该 skill 现在共 ${brief.total} 条。`
}

/**
 * 归档回执要用的一小撮信息。
 *
 * 写完之后用户想知道三件事：写进哪个 skill 了、这次多了几条、那个 skill 里现在一共几条。
 * 工具返回值带上它，Agent 就能照格式报出来 —— 不用再去猜或省略。
 */
function refluxBrief(result) {
  if (!result) return null
  return {
    skill: result.skill,
    written: result.written,
    updated: result.updated || 0,
    skipped: result.skipped,
    editedByHand: result.editedByHand || 0,
    foreign: result.foreign || 0,
    total: result.total,
    created: !!result.created,
  }
}

function runAutoReflux() {
  const cfg = db.config && db.config.autoReflux
  if (!cfg || !cfg.skill) return null
  try {
    const result = refluxToSkill({ skill: cfg.skill, file: cfg.file, ids: db.entries.map((e) => e.id) })
    db.config.autoRefluxLast = {
      at: nowIso(),
      written: result.written,
      skipped: result.skipped,
      total: result.total,
      file: result.file,
      error: '',
    }
    return result
  } catch (e) {
    // 自动同步失败不该把"记错题"这件事一起弄挂，记下来让面板去说。
    db.config.autoRefluxLast = { at: nowIso(), written: 0, file: '', error: (e && e.message) || String(e) }
    return null
  }
}

function setAutoReflux(payload) {
  const skill = str(payload && payload.skill).trim()
  if (!skill) {
    db.config.autoReflux = null
    db.config.autoRefluxLast = null
    saveDb('auto-reflux-off')
    return { autoReflux: null, synced: 0 }
  }
  const target = listSkills().find((s) => s.name === skill)
  if (target && target.builtin) throw new Error(`「${skill}」是内置 skill，写不了`)
  db.config.autoReflux = { skill, file: str(payload && payload.file) || 'references/错题库回流.md' }
  const synced = runAutoReflux()
  saveDb('auto-reflux-on')
  return { autoReflux: db.config.autoReflux, synced: synced ? synced.written : 0 }
}

function createUserSkill(payload) {
  const name = str(payload && payload.name).trim()
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error('skill 名只能用 2–64 位小写字母、数字和连字符，例如 mvu-migration-notes')
  }
  const dir = path.join(userSkillDir(), name)
  const skillFile = path.join(dir, 'SKILL.md')
  if (exists(skillFile)) throw new Error(`已经有一个叫「${name}」的 skill 了`)

  // 默认简介刻意不带 skill 名（列表里本来就显示名字），改成写清"什么时候该读它" ——
  // description 是 Agent 判断要不要自动加载的唯一依据，一句空话等于这个 skill 白建。
  const description =
    str(payload && payload.description).trim() ||
    '已解决故障库：DSH Tavern 卡片调试与 MVU 转换踩过的坑，每条含现象、根因、修法与证据。排查同类问题、动手之前先读一遍。'
  const body = [
    '---',
    `name: ${name}`,
    `description: "${description.replace(/"/g, "'")}"`,
    '---',
    '',
    `# ${name}`,
    '',
    '这个 skill 用来沉淀「做这类事情时踩过的坑」。条目由错题库回流而来，动手前先读一遍下面这份。',
    '',
    '## 参考',
    '',
    '- [错题库回流](references/错题库回流.md)',
    '',
  ].join('\n')

  ensureDir(dir)
  fs.writeFileSync(skillFile, body, 'utf8')
  return { name, dir, file: skillFile, description }
}

function imageContentType(p) {
  const ext = path.extname(str(p)).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

/** `X MVU版本` 与 `X` 视为同一张卡的两个版本，互指一下方便把结论搬过去。 */
function pairKeyOf(key) {
  const m = /^cards\/(.+)\.json$/.exec(key)
  if (!m) return ''
  const base = m[1]
  const stripped = base.replace(/\s*MVU\s*版本$/i, '')
  const partner = stripped === base ? `${base} MVU版本` : stripped
  if (!partner || partner === base) return ''
  return `cards/${partner}.json`
}

/**
 * 原版卡目录 → 卡片目录，建一份 `basename → 图片路径` 的索引。
 *
 * 先扫 `originals`，所以原版卡图优先。原先每张卡要依次试 5 个路径，
 * 几百张卡就是上千次同步 stat；现在两个目录各列一次，之后全是查表。
 */
function buildAvatarIndex() {
  const index = new Map()
  const exts = ['.png', '.jpg', '.jpeg', '.webp']
  for (const dir of [ORIGINALS_DIR, CARD_DIR]) {
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const n of names) {
      const ext = path.extname(n).toLowerCase()
      if (!exts.includes(ext)) continue
      const base = n.slice(0, n.length - ext.length)
      if (!index.has(base)) index.set(base, path.join(dir, n))
    }
  }
  return index
}

/**
 * 扫描卡片目录。
 *
 * `withFileTypes` 一次拿到类型，不再逐个 `statSync`：那些 stat 只为判断
 * 「是不是文件」，而它顺手取回的 size/mtime 没有任何地方在用。
 */
/* dsh-card-marker-badge —— 卡型标记。
 *
 * 卡可以用 extensions.dsh_card_marker 声明自己是什么类型：
 *   hand-tuned-mvu  已手改 MVU（功能长在正则/脚本上，没有转换副本）
 *   original        原版卡，另有 MVU 副本
 *   converted       DSH 转换产生的 MVU 副本
 *
 * 读整张卡很贵（米吧 2MB、龙娘 11MB），所以按「路径:大小:mtime」缓存，
 * 与 scriptScanCache 同一套路子 —— 卡一动缓存自然失效。
 */
const cardMarkerCache = new Map()

function cardMarkerOf(full, st) {
  const stamp = `${full}:${st.size}:${st.mtimeMs}`
  if (cardMarkerCache.has(stamp)) return cardMarkerCache.get(stamp)
  let marker = null
  try {
    const j = JSON.parse(fs.readFileSync(full, 'utf8'))
    const card = (j && j.raw) || j
    const data = card && card.data && typeof card.data === 'object' ? card.data : card
    const m = ((data || {}).extensions || {}).dsh_card_marker
    if (m && typeof m === 'object' && m.kind) {
      marker = {
        kind: str(m.kind),
        label: str(m.label) || str(m.kind),
        reason: str(m.blockReason),
        note: str(m.note),
        conversionBlocked: !!m.conversionBlocked,
      }
    }
  } catch {
    /* 读不了就当没有标记，不阻断扫描 */
  }
  cardMarkerCache.set(stamp, marker)
  if (cardMarkerCache.size > 200) cardMarkerCache.clear()
  return marker
}
function scanCards() {
  if (!exists(CARD_DIR)) return []
  let dirents = []
  try {
    dirents = fs.readdirSync(CARD_DIR, { withFileTypes: true })
  } catch (e) {
    log('card dir unreadable:', e && e.message)
    return []
  }
  const avatars = buildAvatarIndex()
  const out = []
  for (const dirent of dirents) {
    const n = dirent.name
    if (n.startsWith('.') || !/\.json$/i.test(n)) continue
    if (!dirent.isFile()) continue
    const base = n.replace(/\.json$/i, '')
    const abs = path.join(CARD_DIR, n)
    // 优先用卡内声明；读不到才回退到文件名判断
    let marker = null
    try {
      marker = cardMarkerOf(abs, fs.statSync(abs))
    } catch {
      /* 取不到 stat 就当没标记 */
    }
    out.push({
      key: `cards/${n}`,
      name: base,
      rel: `cards/${n}`,
      abs,
      base,
      kind: (marker && marker.kind) || (/MVU/i.test(base) ? 'mvu' : 'plain'),
      marker: marker || null,
      avatar: avatars.get(base) || '',
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

/**
 * 把扫描结果并进分类表。
 *
 * 分类分两组：`card` 由卡片目录决定，`other` 是手建的。
 *
 * 卡片分类里已经不在目录中的不删除，只标 `missing` —— 卡片可能只是改名或被移走，
 * 而它上面记着的错题是调出来的结论，丢了就白调了。`other` 组不参与扫描，
 * 所以也不会因为文件消失被标记。
 */
function syncCards(scanned) {
  let changed = false
  const scannedKeys = new Set(scanned.map((c) => c.key))
  for (const card of scanned) {
    const cur = db.cards[card.key]
    const next = {
      key: card.key,
      group: 'card',
      name: cur && cur.name ? cur.name : card.name,
      autoName: card.name,
      rel: card.rel,
      abs: card.abs,
      kind: card.kind,
      marker: card.marker || null,
      base: card.base,
      avatar: card.avatar,
      pairKey: pairKeyOf(card.key),
      note: cur && cur.note ? cur.note : '',
      missing: false,
      updatedAt: cur && cur.updatedAt ? cur.updatedAt : nowIso(),
    }
    if (!cur || !sameCardView(cur, next)) {
      db.cards[card.key] = next
      changed = true
    }
  }
  const gone = []
  for (const key of Object.keys(db.cards)) {
    const card = db.cards[key]
    if (card.group !== 'card') {
      // 早期版本没有 group 字段：那时存在的非扫描分类都是手建的，补成 other。
      if (card.group === undefined) {
        card.group = 'other'
        changed = true
      }
      continue
    }
    if (scannedKeys.has(key)) continue
    if (!card.missing) {
      card.missing = true
      changed = true
    }
    gone.push(key)
  }

  // 卡不在了、分类下又一条记录都没有：留着只是噪音，直接清掉。
  //
  // 有记录的不动 —— 那些是调出来的结论，卡片改名、临时移走或手动换过文件名时
  // 不该跟着消失，标成「已不在卡片目录」留在列表里就是这个意思。
  if (gone.length) {
    const used = new Set(db.entries.map((entry) => entry.cardKey))
    for (const key of gone) {
      if (used.has(key)) continue
      delete db.cards[key]
      changed = true
    }
  }
  return changed
}

/**
 * 两张卡的登记是否一致。
 *
 * 逐字段比，不比整串 JSON：`stringify` 一张卡要把它整个序列化一遍，
 * 而这对每张卡每轮 `state` 都要做两次。
 */
function sameCardView(a, b) {
  for (const k of Object.keys(b)) {
    if (k === 'updatedAt') continue
    if (a[k] !== b[k]) return false
  }
  return true
}

/**
 * 「其它错题」那一组预置的分类。
 *
 * 卡片更新器是第一个落点，所以默认就建出来，打开就能往里记；
 * 名称、说明和分类本身都可以改也可以删。
 */
const OTHER_BUCKETS = [
  {
    key: '__other_card-cases__',
    name: '卡内故障',
    note: '卡本身出的故障：状态栏、变量结算、开场白入口、世界书、正则、卡内界面。',
  },
  {
    key: '__other_card-updater__',
    name: '卡片更新器',
    note: '卡片更新器插件自身的问题：更新链、合并策略、备份还原、链接检测。',
  },
  {
    key: GENERAL_KEY,
    name: '通用 / 未归类',
    // 早期版本的兜底分类叫这个名字；只在它还是旧默认值时才跟着改。
    legacyNames: ['通用 / 跨卡问题'],
    note: '不属于某一具体卡、也还没归到某个工具的问题。',
  },
]

function ensureOtherBuckets() {
  let changed = false
  for (const preset of OTHER_BUCKETS) {
    const cur = db.cards[preset.key]
    if (cur) {
      if (cur.group !== 'other') {
        cur.group = 'other'
        changed = true
      }
      // 改名只认旧默认值：用户自己改过的名字不覆盖。
      if (preset.legacyNames && preset.legacyNames.includes(cur.name)) {
        cur.name = preset.name
        cur.autoName = preset.name
        changed = true
      }
      continue
    }
    db.cards[preset.key] = {
      key: preset.key,
      group: 'other',
      name: preset.name,
      autoName: preset.name,
      rel: '',
      abs: '',
      kind: 'other',
      base: '',
      avatar: '',
      pairKey: '',
      note: preset.note,
      missing: false,
      updatedAt: nowIso(),
    }
    changed = true
  }
  return changed
}

/* ------------------------------------------------------------- retrieval */

/**
 * 检索，固定顺序：本分类 → 其它错题 → 跨卡，前一段永远排在后面几段之前。
 *
 * 顺序是刻意的：同分类的问题往往已经在这张卡上复现过，先看它；
 * 本分类没有答案时，先去「其它错题」那一组找 —— 归类可能偏，但内容还在库里；
 * 最后才是别的卡片。
 *
 * @param {{card?: string, query?: string, status?: string, scope?: string, limit?: number}} request
 * @returns {{cardKey: string, cardName: string, cardGroup: string, own: object[], other: object[], cross: object[], scanned: number}}
 */
function lookup(request) {
  const req = request || {}
  const query = str(req.query).trim().toLowerCase()
  const terms = query ? query.split(/\s+/).filter(Boolean) : []
  const status = STATUSES.includes(req.status) ? req.status : ''
  const scope = str(req.scope)

  const resolved = resolveCardKeyDetail(req.card)
  const cardKey = resolved.key
  const scored = []
  for (const entry of db.entries) {
    if (status && entry.status !== status) continue
    if (scope && entry.scope !== scope) continue
    const score = terms.length ? scoreEntry(entry, terms) : 1
    if (score <= 0) continue
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || String(b.entry.updatedAt).localeCompare(String(a.entry.updatedAt)))

  // 三段，顺序是刻意的：本分类 → 其它错题 → 跨卡查询。
  //
  // 中间那一段是给「卡的问题被记到了其它错题里」准备的：归类不可能永远分毫不差，
  // 而归档位置的偏差不该让检索漏掉它。它排在跨卡之前，因为插件与工具链上的坑
  // 影响的往往不止一张卡。
  // 分段独立截断。
  //
  // 原先边遍历边塞、总数到顶就停，而排序是全局的 —— 于是本分类里分数低的条目
  // 会被跨卡的高分条目挤出名额。而「① 一定看得到」是这东西存在的全部理由。
  // 现在整表扫一遍，每段各自留前 limit 条，同时记下各段的真实总数。
  const limit = Math.max(1, Math.min(200, Number(req.limit) || 80))
  const own = []
  const other = []
  const cross = []
  let ownTotal = 0
  let otherTotal = 0
  let crossTotal = 0
  for (const item of scored) {
    const key = item.entry.cardKey
    if (key === cardKey) {
      ownTotal += 1
      if (own.length < limit) own.push(item.entry)
    } else if (groupOf(key) === 'other') {
      otherTotal += 1
      if (other.length < limit) other.push(item.entry)
    } else {
      crossTotal += 1
      if (cross.length < limit) cross.push(item.entry)
    }
  }

  return {
    cardKey,
    cardName: cardDisplayName(cardKey),
    cardGroup: groupOf(cardKey),
    // 名字对上多个分类时带回去，让调用方知道该补全哪一个，而不是以为查到了。
    asked: str(req.card).trim(),
    candidates: resolved.candidates,
    own: own,
    other,
    cross,
    ownTotal,
    otherTotal,
    crossTotal,
    scanned: db.entries.length,
  }
}

/** 命中越靠前越值钱：标题 > 标签 > 现象 > 根因/修法 > 引用。 */
function scoreEntry(entry, terms) {
  const title = str(entry.title).toLowerCase()
  const tags = splitTags(entry.tags).join(' ').toLowerCase()
  const symptom = str(entry.symptom).toLowerCase()
  const cause = str(entry.cause).toLowerCase()
  const fix = str(entry.fix).toLowerCase()
  const refs = `${str(entry.refs)} ${str(entry.evidence)}`.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 6
    if (tags.includes(term)) score += 4
    if (symptom.includes(term)) score += 3
    if (cause.includes(term)) score += 2
    if (fix.includes(term)) score += 2
    if (refs.includes(term)) score += 1
  }
  return score
}

/** 传 key、卡名、文件名片段都能落到一张卡上。 */
/**
 * 把用户写的名字落到一个分类上，并回报对上的候选。
 *
 * 分层匹配，越精确越优先：完整路径 → 文件基名 → 分类显示名完全相等 → 名字包含。
 *
 * **模糊命中多个时不猜**，落回兜底分类并把候选带回去。这里特别要守住的一点：
 * 原版卡和它的 `MVU版本` 是**两个不同的分类**，同名问题往往只出在其中一张上
 * （MVU 版才是调试对象，坑也多半记在它头上）。替用户在两者之间挑一个，
 * 就是把结论记到不该记的地方，比让他补全名字贵得多。
 */
function resolveCardKeyDetail(input) {
  const raw = str(input).trim()
  if (!raw) return { key: GENERAL_KEY, candidates: [] }
  if (db.cards[raw]) return { key: raw, candidates: [] }
  if (isGeneralAlias(raw)) return { key: GENERAL_KEY, candidates: [] }

  const base = path.basename(raw).replace(/\.json$/i, '')
  if (!base) return { key: GENERAL_KEY, candidates: [] }
  const keys = Object.keys(db.cards)
  const nameOf = (k) => str(db.cards[k].name)
  const baseOf = (k) => str(db.cards[k].base)

  // 1) 文件基名或相对路径完全对上
  const exact = keys.find(
    (k) => (baseOf(k) && baseOf(k) === base) || k.toLowerCase() === `cards/${base}.json`.toLowerCase(),
  )
  if (exact) return { key: exact, candidates: [] }

  // 2) 分类显示名完全对上
  const byName = keys.find((k) => nameOf(k) === base)
  if (byName) return { key: byName, candidates: [] }

  // 3) 模糊：名字或文件基名包含它
  const fuzzy = keys.filter((k) => k !== GENERAL_KEY && (baseOf(k).includes(base) || nameOf(k).includes(base)))
  if (!fuzzy.length) return { key: GENERAL_KEY, candidates: [] }
  if (fuzzy.length === 1) return { key: fuzzy[0], candidates: [] }
  return { key: GENERAL_KEY, candidates: fuzzy.map(nameOf).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')) }
}

function resolveCardKey(input) {
  return resolveCardKeyDetail(input).key
}

const isGeneralAlias = (value) => /^(通用|跨卡|未归类|general|__general__)$/i.test(str(value).trim())

/** 分类属于哪一组；没登记过的 key 当卡片处理。 */
function groupOf(key) {
  const card = db.cards[key]
  return card ? str(card.group) || 'card' : 'card'
}

/**
 * 建一个手写分类；名字撞了就沿用已有的那个。
 *
 * 记一条「谁也不认识的名字」时用它，而不是默默塞进「通用 / 未归类」：
 * 建出来的分类在面板上看得见、能改名也能删，静默归类则连错在哪都看不出来。
 */
function createOtherBucket(name) {
  const clean = str(name).trim()
  const dup = Object.values(db.cards).find((c) => c.name === clean)
  if (dup) return dup.key
  const key = `__other_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}__`
  db.cards[key] = {
    key,
    group: 'other',
    name: clean,
    autoName: clean,
    rel: '',
    abs: '',
    kind: 'other',
    base: '',
    avatar: '',
    pairKey: '',
    note: '',
    missing: false,
    updatedAt: nowIso(),
  }
  return key
}

function cardDisplayName(key) {
  const card = db.cards[key]
  if (!card) return key === GENERAL_KEY ? '通用 / 未归类' : key
  return str(card.name) || str(card.base) || key
}

/* ------------------------------------------------------------- self check */

function readPackageVersion() {
  const manifest = readJson(path.join(PLUGIN_DIR, 'package.json'), null)
  return manifest && manifest.version ? str(manifest.version) : FALLBACK_VERSION
}

/**
 * 模块被读进来那一刻的版本号 —— **进程里真正在跑的就是这一版**。
 *
 * `readPackageVersion()` 读的是磁盘上的当下值，改完代码它立刻就变了，但进程里
 * 加载的仍是启动时抓的快照。两者不一致时外观上没有任何信号：面板显示新版本号，
 * 跑的是旧逻辑。留一份加载时的值作对照，面板就能直接说「磁盘已改，需要重启」。
 */
const RUNNING_VERSION = readPackageVersion()

/** 插件自身文件指纹：任何一个字节变了，指纹就变。 */
function selfFingerprint() {
  const files = SELF_FILES.map((rel) => {
    const abs = path.join(PLUGIN_DIR, rel)
    const hash = sha256File(abs)
    let mtime = 0
    let bytes = 0
    try {
      const st = fs.statSync(abs)
      mtime = st.mtimeMs
      bytes = st.size
    } catch {
      /* 文件缺了就是 0，指纹会体现出来 */
    }
    return { rel, sha256: hash, bytes, mtime }
  })
  const joined = files.map((f) => `${f.rel}:${f.sha256}`).join('|')
  return {
    files,
    fingerprint: crypto.createHash('sha256').update(joined).digest('hex'),
  }
}

function readSelfRecord() {
  const raw = readJson(SELF_FILE, null)
  if (!raw || typeof raw !== 'object') {
    return { lastCheckAt: '', version: '', fingerprint: '', latestVersion: '', source: '', history: [] }
  }
  return {
    lastCheckAt: str(raw.lastCheckAt),
    version: str(raw.version),
    fingerprint: str(raw.fingerprint),
    latestVersion: str(raw.latestVersion),
    source: str(raw.source),
    history: Array.isArray(raw.history) ? raw.history.slice(0, 20) : [],
  }
}

/** 不联网的即时视图：只用本地文件和已记录的结果。 */
function selfState() {
  const record = readSelfRecord()
  const version = readPackageVersion()
  const fp = selfFingerprint()
  // 首次检查时没有可比的历史：那时报「有改动」是假警报，只能报「已是最新」。
  const seen = !!record.fingerprint
  const changedLocally = seen && record.fingerprint !== fp.fingerprint
  const versionBumped = seen && !!record.version && record.version !== version
  return {
    name: 'dsh-wrongbook',
    dir: PLUGIN_DIR,
    version,
    // 磁盘上是 version，进程里跑的是 runningVersion。不一致 = 改了没重启。
    runningVersion: RUNNING_VERSION,
    stale: !!RUNNING_VERSION && RUNNING_VERSION !== version,
    fingerprint: fp.fingerprint,
    files: fp.files,
    seen,
    lastCheckAt: record.lastCheckAt,
    latestVersion: record.latestVersion,
    source: record.source,
    changedLocally,
    versionBumped,
    updateAvailable: !!record.latestVersion && record.latestVersion !== version,
    history: record.history,
    dataRoot: DATA_DIR,
  }
}

/**
 * 自检：算本地指纹并与上次记录比对；配了远端清单地址时再去问一次最新版本。
 *
 * 比对的是"插件自身"，所以远端可选：没有远端仓库时，这里报的是本地源码
 * 相对上次检查有没有动过 —— 手改过 lib/ 或 client.js 一样要能被看出来。
 */
async function checkSelf(config) {
  const version = readPackageVersion()
  const fp = selfFingerprint()
  const record = readSelfRecord()
  const remoteUrl = str(config && config.remoteUrl)

  let latestVersion = ''
  let source = 'local'
  let remoteError = ''

  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      latestVersion = str(body && (body.version || (body.dsh && body.dsh.version)))
      source = 'remote'
    } catch (e) {
      remoteError = e && e.message ? e.message : String(e)
      source = 'local'
    }
  }

  const changedLocally = !!record.fingerprint && record.fingerprint !== fp.fingerprint
  const versionMoved = !!record.fingerprint && !!record.version && record.version !== version
  const changedFiles = changedLocally
    ? fp.files
        .filter((f) => {
          const before = (record.files || []).find((x) => x.rel === f.rel)
          return !before || before.sha256 !== f.sha256
        })
        .map((f) => f.rel)
    : []

  const verdict = latestVersion && latestVersion !== version
    ? 'update-available'
    : changedLocally || versionMoved
      ? 'changed-locally'
      : 'up-to-date'

  const history = [
    {
      at: nowIso(),
      version,
      fingerprint: fp.fingerprint,
      latestVersion,
      verdict,
      changedFiles,
      remoteError,
    },
    ...(record.history || []),
  ].slice(0, 20)

  const next = {
    lastCheckAt: nowIso(),
    version,
    fingerprint: fp.fingerprint,
    files: fp.files,
    latestVersion,
    source,
    verdict,
    changedFiles,
    remoteError,
    history,
  }
  try {
    writeJsonAtomic(SELF_FILE, next)
  } catch (e) {
    log('selfcheck write failed:', e && e.message)
  }

  return { ...selfState(), lastCheckAt: next.lastCheckAt, latestVersion, verdict, changedFiles, remoteError, source }
}

/* ------------------------------------------------------- folder browsing */

/**
 * 「列出所有驱动器」这个视图的哨兵路径。
 *
 * Windows 上 Node 没有列盘的 API，`wmic` / `Shell.Application` 又要为一次请求
 * 起一个进程。直接探 26 个根各一次 stat：代价小，而且不可能说谎。
 */
const DRIVE_LIST = '::drives'

function listDrives() {
  const out = []
  for (let code = 65; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`
    try {
      if (fs.existsSync(root)) out.push({ name: root, path: root, type: 'drive' })
    } catch {
      /* 探不到的盘就不列出来 */
    }
  }
  return out
}

/**
 * 把用户敲进来的路径按他的意思读。
 *
 * 输入框要能接住复制来的路径：两边的引号、正反斜杠、`D:` 这种只写了盘符的、
 * 以及没写根目录的相对名。空框不是错误 —— 它是在要驱动器列表，
 * 而那正是让另一块盘可达的唯一入口。
 */
function resolveDirInput(raw) {
  const text = str(raw == null ? '' : raw)
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
  if (!text) return DRIVE_LIST
  if (text === DRIVE_LIST) return DRIVE_LIST
  const out = /^[A-Za-z]:$/.test(text)
    ? `${text}\\`
    : path.isAbsolute(text)
      ? path.normalize(text)
      : path.resolve(DATA_DIR, text)
  // normalize 会保留末尾分隔符，而「自己名字以分隔符结尾的目录」会被当成自己的父级，
  // 于是「上一级」变成一个按了没反应的按钮。盘根是唯一该留着那个斜杠的位置。
  if (!/^[A-Za-z]:[\\/]$/.test(out) && /[\\/]$/.test(out) && out.length > 1) {
    return out.replace(/[\\/]+$/, '')
  }
  return out
}

/** 上一级；已经在盘根就回到驱动器列表（dirname('C:\\') 返回它自己）。 */
function parentOf(dir) {
  if (dir === DRIVE_LIST) return DRIVE_LIST
  const up = path.dirname(dir)
  return up === dir ? DRIVE_LIST : up
}

/**
 * 列一层目录，供面板里的浏览弹窗用。
 *
 * 卡片更新器就是这么做选择目录的：不赌宿主提不提供目录选择器，自己列、自己选。
 * 这里只列文件夹 —— 选的是备份落在哪儿，文件没有意义。
 *
 * @param {string} target - 敲进来的路径、绝对目录，或空（要驱动器列表）。
 * @returns {{dir: string, parent: string, drives: boolean, entries: Array<{name: string, path: string, type: string}>, error?: string}}
 */
function listDirEntries(target) {
  const dir = resolveDirInput(target)
  if (dir === DRIVE_LIST) {
    return { dir: DRIVE_LIST, parent: '', drives: true, entries: listDrives() }
  }
  const out = { dir, parent: parentOf(dir), drives: false, entries: [] }
  try {
    if (!fs.statSync(dir).isDirectory()) {
      out.error = `这不是文件夹：${dir}`
      return out
    }
  } catch (e) {
    out.error = (e && e.message) || String(e)
    return out
  }

  let dirents = []
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    out.error = (e && e.message) || String(e)
    return out
  }

  const dirs = []
  for (const entry of dirents) {
    if (entry.name.startsWith('.')) continue
    let isDir = entry.isDirectory()
    if (!isDir && entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(path.join(dir, entry.name)).isDirectory()
      } catch {
        /* 断掉的符号链接当文件处理 */
      }
    }
    if (isDir) dirs.push({ name: entry.name, path: path.join(dir, entry.name), type: 'directory' })
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  out.entries = dirs
  return out
}

/* ------------------------------------------------------------- mutations */

function requireCard(key) {
  const { key: resolved, candidates } = resolveCardKeyDetail(key)
  if (candidates.length) {
    throw new Error(`「${key}」对上了 ${candidates.length} 个分类：${candidates.join('、')}。请写全名字指明是哪一个。`)
  }
  if (!db.cards[resolved]) {
    throw new Error(`未找到分类：${key}`)
  }
  return resolved
}

function addEntry(payload) {
  // 面板把字段放在 `entry` 里，工具调用则直接平铺在顶层：两处都认。
  const src = (payload && payload.entry) || payload || {}
  const wanted = str((payload && (payload.cardKey || payload.card)) || src.cardKey || src.card).trim()
  const { key: resolved, candidates } = resolveCardKeyDetail(wanted)
  let cardKey = resolved
  let createdBucket = ''

  // 名字对上了好几个分类：说清楚，让调用方补全，不替他挑。
  // 原版卡与它的 MVU 版就是最常见的一对，而问题往往只出在其中一张上。
  if (candidates.length) {
    throw new Error(`「${wanted}」对上了 ${candidates.length} 个分类：${candidates.join('、')}。请写全名字指明是哪一个。`)
  }

  // 名字谁也不认识：给它建一个分类。
  //
  // 不落回「通用 / 未归类」—— 那会把「分类其实记错了」藏起来：条目还在，
  // 但没人会想到去通用里找它。建出来的分类在面板上看得见，改名和删除都是一步的事。
  // 带路径或扩展名的输入除外：那种写法说明用户明确指向某个卡文件，找不到就是找不到。
  const looksLikePath = /[\\/]/.test(wanted) || /\.json$/i.test(wanted)
  if (wanted && cardKey === GENERAL_KEY && !isGeneralAlias(wanted) && !looksLikePath) {
    cardKey = createOtherBucket(wanted)
    createdBucket = cardKey
  }

  const title = str(src.title).trim()
  if (!title) throw new Error('标题不能为空')
  const entry = normalizeEntry(src, cardKey)
  entry.id = uid()
  entry.cardKey = cardKey
  entry.createdAt = nowIso()
  entry.updatedAt = entry.createdAt
  db.entries.unshift(entry)
  const reflux = runAutoReflux()
  saveDb('add-entry')
  return { entry, created: createdBucket ? cardDisplayName(createdBucket) : '', reflux: refluxBrief(reflux) }
}

function updateEntry(payload) {
  const id = str(payload && payload.id)
  const entry = db.entries.find((e) => e.id === id)
  if (!entry) throw new Error(`未找到条目：${id}`)
  const patch = (payload && payload.patch) || {}
  if (patch.title !== undefined) entry.title = str(patch.title)
  if (patch.symptom !== undefined) entry.symptom = str(patch.symptom)
  if (patch.cause !== undefined) entry.cause = str(patch.cause)
  if (patch.fix !== undefined) entry.fix = str(patch.fix)
  if (patch.refs !== undefined) entry.refs = str(patch.refs)
  if (patch.evidence !== undefined) entry.evidence = str(patch.evidence)
  if (patch.scope !== undefined && SCOPES.includes(patch.scope)) entry.scope = patch.scope
  if (patch.status !== undefined && STATUSES.includes(patch.status)) entry.status = patch.status
  if (patch.tags !== undefined) entry.tags = splitTags(patch.tags)
  if (patch.cardKey !== undefined) entry.cardKey = requireCard(patch.cardKey)
  entry.updatedAt = nowIso()
  const reflux = runAutoReflux()
  saveDb('update-entry')
  return { entry, reflux: refluxBrief(reflux) }
}

function deleteEntry(payload) {
  const id = str(payload && payload.id)
  const before = db.entries.length
  db.entries = db.entries.filter((e) => e.id !== id)
  if (db.entries.length === before) throw new Error(`未找到条目：${id}`)
  saveDb('delete-entry')
  return { removed: 1 }
}

/** 把一条记录搬到另一张卡下（复制或迁移），用于跨卡复用同一结论。 */
function moveEntry(payload, keepSource) {
  const id = str(payload && payload.id)
  const source = db.entries.find((e) => e.id === id)
  if (!source) throw new Error(`未找到条目：${id}`)
  const toCardKey = requireCard(payload && (payload.toCardKey || payload.card))
  const copy = { ...source, cardKey: toCardKey, id: uid(), createdAt: nowIso(), updatedAt: nowIso() }
  db.entries.unshift(copy)
  if (!keepSource) {
    db.entries = db.entries.filter((e) => e.id !== id)
  }
  saveDb(keepSource ? 'copy-entry' : 'move-entry')
  return { entry: copy, keptSource: !!keepSource }
}

function importEntries(payload) {
  const text = str(payload && payload.json)
  if (!text.trim()) throw new Error('导入内容为空')
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`JSON 解析失败：${e && e.message}`)
  }
  const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : []
  if (!incoming.length) throw new Error('没有可导入的条目')

  // 去重靠一张 Set，不靠对每条 incoming 扫一遍现有条目 —— 后者是 O(n×m)，
  // 几千条一起导会退化到几千万次比较。
  const seen = new Set(db.entries.map((e) => `${e.cardKey}\u0000${e.title}`))
  const fresh = []
  let skipped = 0
  let ambiguous = 0

  for (const raw of incoming) {
    const resolved = resolveCardKeyDetail(str(raw && raw.cardKey))
    if (resolved.candidates.length) {
      // 名字对上多个分类（最常见的是原版与它的 MVU 版）：整批失败不合适，
      // 跳过并计数，让人知道有几条没能落下来。
      ambiguous += 1
      skipped += 1
      continue
    }
    const title = str(raw && raw.title).trim()
    if (!title) {
      skipped += 1
      continue
    }
    const finger = `${resolved.key}\u0000${title}`
    if (seen.has(finger)) {
      skipped += 1
      continue
    }
    seen.add(finger)
    const entry = normalizeEntry(raw, resolved.key)
    entry.id = uid()
    entry.cardKey = resolved.key
    entry.createdAt = entry.createdAt || nowIso()
    entry.updatedAt = nowIso()
    fresh.push(entry)
  }

  let reflux = null
  if (fresh.length) {
    // 一条一条 unshift 是 O(n²)：八千条导进来会白搬几千万次。
    db.entries = [...fresh, ...db.entries]
    reflux = runAutoReflux()
    saveDb('import')
  }
  return { added: fresh.length, skipped, ambiguous, reflux: refluxBrief(reflux) }
}

function renameCard(payload) {
  const key = requireCard(payload && (payload.key || payload.cardKey))
  const card = db.cards[key]
  if (payload && payload.name !== undefined) card.name = str(payload.name).trim() || card.autoName
  if (payload && payload.note !== undefined) card.note = str(payload.note)
  card.updatedAt = nowIso()
  saveDb('rename-card')
  return { card }
}

/** 手建一个「其它错题」分类。key 用时间戳生成，不跟卡片分类的 `cards/...` 撞。 */
function addBucket(payload) {
  const name = str(payload && payload.name).trim()
  if (!name) throw new Error('分类名不能为空')
  const dup = Object.values(db.cards).find((c) => c.name === name)
  if (dup) throw new Error(`已经有叫「${name}」的分类了`)
  const key = `__other_${Date.now().toString(36)}__`
  db.cards[key] = {
    key,
    group: 'other',
    name,
    autoName: name,
    rel: '',
    abs: '',
    kind: 'other',
    base: '',
    avatar: '',
    pairKey: '',
    note: str(payload && payload.note),
    missing: false,
    updatedAt: nowIso(),
  }
  saveDb('add-bucket')
  return { card: db.cards[key] }
}

/**
 * 删掉一个分类。它下面的条目不会被一起删掉 —— 迁到「通用 / 未归类」，
 * 免得一次误点就把调出来的结论整片丢掉。
 */
function deleteBucket(payload) {
  const key = requireCard(payload && (payload.key || payload.cardKey))
  const card = db.cards[key]
  if (key === GENERAL_KEY) throw new Error('「通用 / 未归类」是兜底分类，不能删除')
  // 卡片分类由卡片目录决定 —— 除非那张卡已经不在了，那时它只是一条没有主人的记录，
  // 允许手动清掉（记录会先迁到兜底分类，不会跟着消失）。
  if ((card.group || 'card') !== 'other' && !card.missing) {
    throw new Error('卡片分类由卡片目录决定，不能在这里删除')
  }
  let moved = 0
  for (const entry of db.entries) {
    if (entry.cardKey === key) {
      entry.cardKey = GENERAL_KEY
      entry.updatedAt = nowIso()
      moved += 1
    }
  }
  delete db.cards[key]
  saveDb('delete-bucket')
  return { removed: key, moved }
}

function restoreBackup(payload) {
  const file = str(payload && payload.file)
  const full = path.join(BACKUP_DIR, path.basename(file))
  if (!file || !exists(full)) throw new Error(`备份不存在：${file}`)
  const raw = readJson(full, null)
  if (!raw || typeof raw !== 'object') throw new Error('备份内容不可读')
  backupDb('before-restore')
  db = {
    version: 1,
    updatedAt: nowIso(),
    cards: raw.cards && typeof raw.cards === 'object' ? raw.cards : {},
    entries: Array.isArray(raw.entries) ? raw.entries.map((e) => normalizeEntry(e, e && e.cardKey)) : [],
    config: raw.config && typeof raw.config === 'object' ? raw.config : db.config || { remoteUrl: '' },
  }
  writeJsonAtomic(DB_FILE, db)
  // 同步写入基线：不同步的话，下一次 saveDb 会拿旧基线做比较，可能把这次恢复当成"没变化"。
  lastWritten = JSON.stringify(db, null, 2)
  // 备份里记着的自定义备份目录也要跟着生效。
  BACKUP_DIR = db.config && db.config.backupDir ? path.resolve(db.config.backupDir) : BACKUP_DIR_DEFAULT
  ensureDir(BACKUP_DIR)
  return { restored: db.entries.length }
}

/**
 * 候选可执行路径，按可信度排。
 *
 * 裸名字（`explorer.exe`）在打包好的桌面客户端里经常解析不到：那种进程的 PATH
 * 可能被裁剪过，只剩几个目录。所以先问宿主自己的解析器（`ctx.subprocess`），
 * 再按系统根目录拼绝对路径，最后才把裸名字当兜底。
 *
 * @param {string} file - explorer.exe / open / xdg-open
 * @param {string[]} problems - 诊断信息收集器
 * @returns {Promise<string[]>}
 */
async function executableCandidates(file, problems) {
  const out = []
  const subprocess = pluginCtx && typeof pluginCtx.get === 'function' ? pluginCtx.get('subprocess') : null
  if (subprocess && typeof subprocess.resolveExecutable === 'function') {
    try {
      const resolved = await subprocess.resolveExecutable(file)
      if (resolved) out.push(resolved)
    } catch (e) {
      problems.push(`resolveExecutable(${file}): ${(e && e.code) || (e && e.message) || e}`)
    }
  }
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.windir
    if (root) out.push(path.join(root, 'explorer.exe'))
  }
  out.push(file)
  return out.filter((v, i) => v && out.indexOf(v) === i)
}

/**
 * 把目录交给系统的文件管理器。
 *
 * 两级回退，每一级的失败原因都留着：这台机器上到底哪一级能用是环境决定的，猜不如试。
 * 以前用 fire-and-forget 的 spawn，失败走异步 `error` 事件没人监听，表现就是
 * 「点了没反应、日志还写成功」；现在每一步都必须等到结果才罢休。
 *
 * 1. 宿主解析器 / `SystemRoot` 拼出的绝对路径，兜底才是裸命令名。
 * 2. Windows 上 `cmd /c start` —— 最原始的兜底，几乎不挑环境。
 *
 * 曾经还有一级是把目录交给宿主 Electron 自己的 shell，已经删掉：宿主跑的是它自己
 * 那份 node_modules，里面没有这个模块，那一级从来没成功过；但它会让静态健康检查
 * 判定插件依赖了一个没人提供的包。为一个从未生效的分支去声明一个宿主不一定有的包，
 * 不划算。
 *
 * explorer.exe 打开窗口时也返回非零退出码，所以它的退出码不作为判定；
 * 只有 ENOENT 才等于真的没找到可执行文件。
 *
 * @param {string} target - 绝对路径；不存在时先建出来，免得拒开一个还没用到的目录。
 * @returns {Promise<{opened: string, via: string}>}
 */
async function openPath(target) {
  const dir = target || DATA_DIR
  if (!exists(dir)) ensureDir(dir)
  const platform = process.platform
  const problems = []

  // dsh-open-path-fix —— Windows 先把 cmd start 放前面。
  //
  // 实测（测试目录确认存在的前提下，逐个跑一遍）：
  //   explorer.exe            → 退出码 1，窗口没出来（windowsHide 开或关都一样，
  //                             用全路径也一样）
  //   cmd /c start "" <dir>   → 退出码 0，窗口正常打开
  //
  // 原先的注释写着「explorer 把窗口转交给已有实例后自己退出，退出码非零但事情已经办成」，
  // 于是把任何非 ENOENT 的错误都当成功返回 —— 在这个环境里那个假设不成立：
  // 它确实返回 1，也确实没打开，而日志照样报「已交给资源管理器打开」。
  if (platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe'
    try {
      await execFileAsync(comspec, ['/c', 'start', '', dir], { timeout: 10000 })
      return { opened: dir, via: 'cmd start' }
    } catch (e) {
      problems.push(`cmd start: ${(e && e.code) || (e && e.message) || e}`)
    }
  }

  // Windows 之外：open / xdg-open。
  // 也保留 Windows 上的 explorer.exe 作为次选 —— 别的机器上它可能是好的，
  // 但这里【不再把退出码非零当作成功】，失败就如实报出来。
  const file = platform === 'win32' ? 'explorer.exe' : platform === 'darwin' ? 'open' : 'xdg-open'
  for (const candidate of await executableCandidates(file, problems)) {
    try {
      await execFileAsync(candidate, [dir], { timeout: 10000 })
      return { opened: dir, via: candidate }
    } catch (e) {
      problems.push(`${candidate}: ${(e && e.code) || (e && e.message) || e}`)
    }
  }

  // 都失败了就把现场交出去：包含哪一级错在哪，以及 PATH 长什么样。
  const pathHead = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ; ')
  throw new Error(
    `打不开 ${dir} → ${problems.join(' / ')} ｜ 环境：platform=${platform} SystemRoot=${
      process.env.SystemRoot || '(空)'
    } PATH前5项=${pathHead || '(空)'} 宿主=${pluginCtx ? '已注入' : '未注入'}`,
  )
}

/** 删掉一份备份。文件名只取 basename，路径穿越进不来。 */
function deleteBackup(payload) {
  const name = path.basename(str(payload && payload.file))
  if (!name || !isBackupName(name)) throw new Error('这个文件名不属于本插件的备份')
  const full = path.join(BACKUP_DIR, name)
  if (!exists(full)) throw new Error(`备份不存在：${name}`)
  fs.unlinkSync(full)
  return { deleted: name, backups: listBackups().length }
}

/** 只保留最近 N 份，其余删掉。清理上限跟自动清理一致。 */
function pruneBackupList(payload) {
  const keep = Math.max(1, Math.min(MAX_BACKUPS, Number(payload && payload.keep) || 20))
  const files = listBackups()
  let removed = 0
  for (const item of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, item.file))
      removed += 1
    } catch {
      /* 已经被删了 */
    }
  }
  return { removed, keep, backups: listBackups().length }
}

/* ---------------------------------------------------------------- routes */

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = []
    request.on('data', (c) => chunks.push(c))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        resolve({ raw: text })
      }
    })
    request.on('error', () => resolve({}))
  })
}

function countByStatus(cardKey) {
  const out = { open: 0, watch: 0, fixed: 0, total: 0 }
  for (const entry of db.entries) {
    if (entry.cardKey !== cardKey) continue
    out[entry.status] = (out[entry.status] || 0) + 1
    out.total += 1
  }
  return out
}

function cardList() {
  // 一次遍历把所有分类的计数算完。原先按卡调用 countByStatus，是
  // O(分类数 × 条目数)：几百张卡配几千条记录时会明显卡在打开面板这一步。
  const counts = new Map()
  for (const entry of db.entries) {
    let bucket = counts.get(entry.cardKey)
    if (!bucket) {
      bucket = { open: 0, watch: 0, fixed: 0, total: 0 }
      counts.set(entry.cardKey, bucket)
    }
    bucket[entry.status] = (bucket[entry.status] || 0) + 1
    bucket.total += 1
  }

  return Object.values(db.cards)
    .map((card) => ({
      key: card.key,
      group: card.group || 'card',
      name: card.name,
      autoName: card.autoName,
      base: card.base,
      rel: card.rel,
      abs: card.abs,
      kind: card.kind,
      marker: card.marker || null,
      avatar: card.avatar,
      pairKey: card.pairKey || '',
      note: card.note || '',
      missing: !!card.missing,
      updatedAt: card.updatedAt,
      count: counts.get(card.key) || { open: 0, watch: 0, fixed: 0, total: 0 },
    }))
    .sort((a, b) => {
      // 卡片组在前；其它组内按预置顺序排，预置之外的按名字。
      if (a.group !== b.group) return a.group === 'card' ? -1 : 1
      if (a.group === 'other') {
        const ai = OTHER_BUCKETS.findIndex((preset) => preset.key === a.key)
        const bi = OTHER_BUCKETS.findIndex((preset) => preset.key === b.key)
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      }
      return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
    })
}


/* ------------------------------------------------------------ dsh-common-scripts */

/**
 * 通用脚本库：放在 data 目录下，与人物卡分开管理。
 *
 * 这些脚本不属于某一张卡，而是可复用的能力（比如异步助手框架）。
 * 装卡时把条目原样推进该卡的 extensions.tavern_helper.scripts。
 */
const COMMON_DIR = path.join(DATA_DIR, 'common-scripts')

/** 库里的脚本：文件名即脚本名，另可带 dsh_meta 说明用途与推荐范围。 */
/**
 * 导入一个通用脚本：接受卡内脚本条目的 JSON（就是导出单个脚本得到的那种）。
 *
 * 只做三件必须的校验：能解析、有 name、有 content。
 * 名字里带路径分隔符要挡掉 —— 它会被当成文件名写入库。
 */
function importCommonScript(body) {
  const text = str(body && body.json)
  if (!text.trim()) throw new Error('没有内容')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error('不是合法 JSON：' + ((e && e.message) || e))
  }
  if (Array.isArray(parsed)) throw new Error('这是一组脚本，请一次导一个')
  if (!parsed || typeof parsed !== 'object') throw new Error('顶层要是对象')
  const name = str(parsed.name) || str(body && body.name)
  if (!name) throw new Error('缺少 name')
  const content = String(parsed.content || '')
  if (!content.trim()) throw new Error('缺少 content')
  if (/[\\/:*?"<>|]/.test(name)) throw new Error('名字里有不能用作文件名的字符')

  ensureDir(COMMON_DIR)
  const entry = Object.assign({}, parsed)
  entry.name = name
  delete entry.export_with
  /* 没带 dsh_meta 的，按内容生成一份草稿 —— 导入后界面上就能看到用途与分类，
     不用回头再补。带了的不覆盖，作者的说明优先。 */
  if (!entry.dsh_meta || typeof entry.dsh_meta !== 'object' || !entry.dsh_meta.purpose) {
    const guess = suggestCommonMeta(name, content)
    if (guess) entry.dsh_meta = Object.assign({}, entry.dsh_meta, guess)
  }
  entry.dsh_meta.addedAt = entry.dsh_meta.addedAt || new Date().toISOString().slice(0, 10)

  const dest = path.join(COMMON_DIR, name + '.json')
  const existed = exists(dest)
  fs.writeFileSync(dest, JSON.stringify(entry, null, 2), 'utf8')
  return { name, bytes: content.length, replaced: existed }
}

/**
 * 更新库里已有的脚本。
 *
 * 只换脚本本体，**保留库里攒下的 dsh_meta** —— 分类 / 用途 / 建议可能是用户在界面上
 * 改过的，不能因为新文件没带这段就把自动草稿盖上去。新文件显式带了 meta 才用它。
 *
 * 返回值里带上差异与"多少张卡装的是旧版"：更新库文件不会自动改已装到卡上的那份，
 * 这件事必须让用户看见，否则会出现"库里更新了但卡上还是旧的"这种静默不一致。
 */
/**
 * 认一个脚本【会写哪些持久状态】。
 *
 * 存在的理由：换掉库里的脚本文件，不会清掉脚本自己写下的东西（localStorage、
 * indexedDB、世界书条目…）。新版可能读到一份旧版留下的状态，表现成"更新完反而坏了"。
 * 更新时把这件事说明白，比事后查省事。
 *
 * 也顺手取一下脚本自己的版本常量 —— 有些脚本会写一个 VERSION，降级时值得提一句。
 */
function scriptTraits(content) {
  const c = String(content || '')
  const vm = /(?:const|let|var)\s+(\w*(?:VERSION|Version)\w*)\s*=\s*['"`]([^'"`]+)['"`]/.exec(c)
  return {
    localStorage: /localStorage\.(setItem|removeItem)/.test(c),
    indexedDB: /indexedDB/.test(c),
    worldbook: /setWorldbook|updateWorldbookWith|upsert_worldbook_profile|createWorldbookEntries/.test(c),
    chat: /setChatMessages|createChatMessages|deleteChatMessages/.test(c),
    variables: /replaceMvuData|insertOrAssignVariables|updateVariablesWith/.test(c),
    timer: /setInterval\s*\(/.test(c),
    windowGlobals: /window\.\w+\s*=/.test(c),
    version: vm ? vm[2] : '',
    versionName: vm ? vm[1] : '',
  }
}
function updateCommonScript(body) {
  const name = str(body && body.name)
  if (!name) throw new Error('缺少 name')
  const text = str(body && body.json)
  if (!text.trim()) throw new Error('没有新内容')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error('不是合法 JSON：' + ((e && e.message) || e))
  }
  if (Array.isArray(parsed)) throw new Error('这是一组脚本，请一次更新一个')
  if (!parsed || typeof parsed !== 'object') throw new Error('顶层要是对象')
  const content = String(parsed.content || '')
  if (!content.trim()) throw new Error('缺少 content')

  const dest = path.join(COMMON_DIR, name + '.json')
  if (!exists(dest)) throw new Error('库里没有 ' + name + '，请用「导入脚本」')

  let old
  try {
    old = JSON.parse(fs.readFileSync(dest, 'utf8'))
  } catch (e) {
    throw new Error('库里那份读不出来：' + ((e && e.message) || e))
  }

  const oldContent = String(old.content || '')
  const oldHash = shortHash(oldContent)
  const newHash = shortHash(content)
  if (oldHash === newHash) {
    return { name, changed: false, oldHash, newHash, bytes: content.length }
  }

  /* 备份旧版 —— 更新同样要能退回去。 */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const bakDir = path.join(DATA_DIR, 'common-script-backups', stamp)
  ensureDir(bakDir)
  try {
    fs.copyFileSync(dest, path.join(bakDir, name + '.json'))
  } catch (e) {
    log('common script backup failed:', (e && e.message) || e)
  }

  /* 新文件带了 dsh_meta 就用它的（显式覆盖），否则保留库里的。 */
  const hadMeta = parsed.dsh_meta && typeof parsed.dsh_meta === 'object'
  const merged = Object.assign({}, parsed)
  merged.name = name
  delete merged.export_with
  merged.dsh_meta = hadMeta ? parsed.dsh_meta : (old.dsh_meta || {})
  if (!merged.dsh_meta.addedAt) merged.dsh_meta.addedAt = old.dsh_meta && old.dsh_meta.addedAt
  merged.dsh_meta.updatedAt = stamp

  fs.writeFileSync(dest, JSON.stringify(merged, null, 2), 'utf8')

  /* 有多少张卡装的是旧版。它们接下来会被自动同步 —— 更新库文件不等于更新卡上那份，
     而"库里是新的、卡上是旧的"正是最容易漏掉的一种不一致，不该指望人再点一次。 */
  let staleCards = []
  try {
    const st = commonInstallState()
    staleCards = (st.cards || [])
      .filter((c) => (c.installed || []).some((i) => i.name === name && i.state !== 'absent'))
      .map((c) => c.file)
  } catch {
    /* 读不到卡目录就不报这个数，不影响更新本身 */
  }

  /*
   * 自动把新版推到那些卡上。
   *
   * 走的是同一个 installCommon，所以：备份、写盘、只动 scripts 数组这几件事都一致；
   * 用的内容就是刚才落盘的新版（installCommon 每次都重新读库）。
   *
   * 同步失败【不回滚库的更新】 —— 库已经换好了，那是主操作；
   * 卡这边没跟上只是部分完成，把错误报出来让人知道即可。
   */
  let synced = null
  let syncError = ''
  if (staleCards.length) {
    try {
      synced = installCommon({ cards: staleCards, scripts: [name] })
    } catch (e) {
      syncError = (e && e.message) || String(e)
      log('common script auto-sync failed:', syncError)
    }
  }

  /* 新旧两份各认一次"会写什么"，让前端能提示"更新后旧状态还在"。 */
  const traitsBefore = scriptTraits(oldContent)
  const traitsAfter = scriptTraits(content)

  /* 同步之后卡上那份已经是新版了，所以这两个计数是"当时"的。 */
  const syncedCards = staleCards.slice()

  return {
    name,
    changed: true,
    oldHash,
    newHash,
    oldBytes: oldContent.length,
    bytes: content.length,
    keptMeta: !hadMeta,
    staleCards: syncedCards,
    autoSynced: staleCards.length > 0 && !syncError,
    syncError,
    backupDir: bakDir,
    traits: traitsAfter,
    traitsBefore,
    /* 新版比旧版少写了某类持久状态 —— 值得知道，但不阻止更新。 */
    versionChanged: traitsBefore.version !== traitsAfter.version,
  }
}
/** 从库里移除一个脚本（只删库文件，不动已装到卡上的）。 */
function deleteCommonScript(body) {
  const name = str(body && body.name)
  if (!name) throw new Error('缺少 name')
  const dest = path.join(COMMON_DIR, name + '.json')
  if (!exists(dest)) throw new Error('库里没有 ' + name)
  fs.rmSync(dest)
  return { name }
}
/**
 * 从脚本内容推断一份 dsh_meta 草稿（用途 / 建议 / 分类）。
 *
 * 这是"导入时给点提示"用的，不是权威结论 —— 只做能站得住的两类判断：
 *   · 分类：看它主要在用哪一类宿主 API；
 *   · 用途：点名它调用了哪些具体能力，而不是泛泛说"这是个脚本"。
 *
 * 刻意不写"建议装到哪些卡"这种话：脚本能不能装跟卡无关（都是通用能力），
 * 硬编一个卡名单只会误导。改成说明"什么样的卡能受益"，那是可验证的。
 */
function suggestCommonMeta(name, content) {
  const c = String(content || '')
  if (!c) return null

  /* 它在用哪些宿主能力 —— 这些名字出现在脚本里就是真的在用 */
  const caps = []
  const cap = (label, re) => { if (re.test(c)) caps.push(label) }
  cap('读/写 MVU 变量', /getMvuData|replaceMvuData|insertOrAssignVariables/)
  cap('世界书读写', /getWorldbook|setWorldbook|worldbook_entry|updateWorldbookWith/)
  cap('监听消息事件', /eventOn\s*\(|tavern_events|MESSAGE_RECEIVED/)
  cap('直接调模型', /generateRaw|generate\s*\(|TavernHelper\.generate/)
  cap('读写聊天记录', /getChatMessages|setChatMessages|createChatMessages/)
  cap('变量表 / 数据库', /insertRow|updateRow|deleteRow|db_table|listTables/)
  cap('渲染界面 / 面板', /createElement|innerHTML|iframe|StatusPlaceHolder|document\.body/)
  cap('正则 / 格式修复', /format_fix|getFormatFix|regex_scripts/)

  /* 分类：按"最核心的那个能力"归，顺序有意从"后台逻辑"排到"界面渲染" */
  let category = '未分类'
  if (/generateRaw|TavernHelper\.generate|list_worldbook_profiles|upsert_worldbook_profile/.test(c)) category = '助手 / 后台'
  else if (/getMvuData|replaceMvuData|insertOrAssignVariables/.test(c)) category = '变量 / MVU'
  else if (/getChatMessages|setChatMessages|createChatMessages/.test(c)) category = '聊天 / 记录'
  else if (/createElement|innerHTML|StatusPlaceHolder|iframe/.test(c)) category = '界面 / 渲染'

  /* 用途：点名具体能力，不写套话 */
  const purpose = caps.length
    ? '这个脚本会用到的宿主能力：' + caps.join('、') + '。'
    : (c.length > 2000 ? '内容较长（' + c.length + ' 字符），但没有识别出常见的宿主 API 调用。' : '内容较短（' + c.length + ' 字符），可能是配置片段或薄封装。')

  return {
    category,
    purpose,
    recommend: caps.length
      ? '装了它能直接用上这些能力，不需要卡本身配合。'
      : '',
    note: '这份说明由导入时自动分析生成（脚本 ' + c.length + ' 字符），可以改。',
    autoGenerated: true,
  }
}
function listCommonLib() {
  const out = []
  let names = []
  try {
    names = fs.readdirSync(COMMON_DIR).filter((f) => f.endsWith('.json'))
  } catch {
    return out
  }
  for (const f of names) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(COMMON_DIR, f), 'utf8'))
      const content = String(j.content || '')
      out.push({
        file: f,
        name: str(j.name) || f.replace(/\.json$/, ''),
        id: str(j.id),
        bytes: content.length,
        hash: shortHash(content),
        meta: (j.dsh_meta && typeof j.dsh_meta === 'object') ? j.dsh_meta : null,
        // 分类：脚本自带声明优先，没有就归到「未分类」。
        // 界面上按它分组筛选 —— 脚本一多，平铺一层就找不到东西了。
        category: str((j.dsh_meta || {}).category) || '未分类',
      })
    } catch (e) {
      out.push({ file: f, name: f, broken: String((e && e.message) || e) })
    }
  }
  return out
}

function shortHash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12)
}

/**
 * 各 MVU 卡的安装情况。
 *
 * 只读 extensions.tavern_helper.scripts 的【名字与内容哈希】，不比对整张卡 ——
 * 卡可能有十几 MB，全量 JSON.stringify 太贵。
 */
/**
 * 一张卡能不能装通用脚本。统计与装卸必须用同一判据 ——
 * 之前 installCommon 单独写着 /MVU版本/，于是米吧在列表里能看见、点"装"却被跳过。
 *
 * explicit 为真表示用户明确点了这张卡：那就无条件处理，
 * 不再替他判断"这张卡适不适合" —— 点得出来就说明他要装。
 */
/*
 * 通用脚本的"能不能真跑起来"判据。
 *
 * 原来只看卡有没有界面正则 / 世界书 / MVU —— 这三样几乎所有 MVU 卡都有，
 * 于是任何卡都判"适合"，而实际装上以后脚本什么都干不了：
 * 它靠正文里的标记定位要处理的段落，卡不输出这些标记，面板打开就是空的。
 *
 * 所以判据改成【标记覆盖】：脚本读哪些标记，卡里能不能产出这些标记。
 *   · locate 是定位类：缺了脚本找不到要改的那段正文 → 空转；
 *   · struct 是结构类：决定它能拿到的上下文有多全。
 * 两者都从卡的正则（find + replace）、启用中的世界书条目、开场里找。
 */
const SCRIPT_MARKERS = {
  locate: ['scene_time', 'now_plot'],
  struct: ['summary', 'action', 'update'],
}

function cardMarkerFit(d) {
  const regs = (d.extensions || {}).regex_scripts || []
  const book = ((d.character_book || {}).entries) || []
  /*
   * 用数组逐段查，不把整张卡拼成一个大字符串 —— 龙娘 617 条书、道渊 356 条，
   * 每次点开「通用脚本」页签都要算一遍，拼接是白花的钱。
   */
  const segs = [
    ...regs.map((r) => String(r.findRegex ?? '')),
    ...regs.map((r) => String(r.replaceString ?? '')),
    ...book.filter((e) => e && e.enabled !== false).map((e) => String(e.content || '')),
    String(d.first_mes || ''),
    ...(Array.isArray(d.alternate_greetings) ? d.alternate_greetings : []).map(String),
  ]
  const has = (m) => segs.some((s) => s.includes(m))
  const hit = (k) => SCRIPT_MARKERS[k].filter(has)
  const locate = hit('locate')
  const struct = hit('struct')
  const total = SCRIPT_MARKERS.locate.length + SCRIPT_MARKERS.struct.length
  return {
    locate,
    struct,
    missing: [...SCRIPT_MARKERS.locate, ...SCRIPT_MARKERS.struct].filter((m) => !locate.includes(m) && !struct.includes(m)),
    covered: locate.length + struct.length,
    total,
    /* 定位类全缺 = 空转：脚本没有可处理的段落 */
    idle: locate.length === 0,
    /* 本卡配套：定位齐、结构也够 —— 作者原本就是给这类卡写的 */
    native: locate.length >= 1 && struct.length >= 2,
  }
}

/**
 * 装了通用脚本之后，这张卡还能不能走纯 API 自动测试。
 *
 * 测试器的判据是"启用中的卡内脚本数 > 0 就需要浏览器"，而这个脚本自己就占了那一个名额。
 * 所以卡里除通用脚本外没有别的启用脚本时，装上它 = 把这张卡从"可自动测"变成"只能手测"。
 */
function cardBlocksApiTest(scripts, libNames) {
  const others = (Array.isArray(scripts) ? scripts : []).filter(
    (s) => s && s.enabled !== false && s.disabled !== true && !libNames.has(str(s && s.name)),
  )
  return others.length === 0
}

function cardInstallable(f, scripts, marker, libNames, explicit) {
  if (explicit) return true
  if (/MVU版本/.test(f)) return true
  if (marker && marker.kind === 'hand-tuned-mvu') return true
  if (Array.isArray(scripts) && scripts.some((x) => libNames.has(str(x && x.name)))) return true
  return false
}
function commonInstallState() {
  const lib = listCommonLib()
  const out = []
  let files = []
  try {
    files = fs.readdirSync(CARD_DIR).filter((f) => f.endsWith('.json'))
  } catch {
    return { lib, cards: out }
  }
  for (const f of files) {
    const isMvu = /MVU版本/.test(f)
    let scripts = []
    let total = 0
    let marker = null
    let data = {}
    const full = path.join(CARD_DIR, f)
    try {
      const j = JSON.parse(fs.readFileSync(full, 'utf8'))
      const d = (j.raw && j.raw.data) || j.data || {}
      data = d
      scripts = (((d.extensions || {}).tavern_helper || {}).scripts) || []
      total = fs.statSync(full).size
      marker = cardMarkerOf(full, fs.statSync(full))
    } catch {
      continue
    }
    /*
     * 哪些卡算"该装通用脚本"。
     *
     * 原来只认文件名里的「MVU版本」，于是米吧（自带 MVU、已手改，但不叫 MVU版本）
     * 被算成不可装，统计里看不到它 —— 而它恰恰是装了脚本的。
     *
     * 改成三条任一即可：
     *   · 文件名是 MVU 版；
     *   · 卡自己声明了 hand-tuned-mvu（已手改 MVU）；
     *   · 已经装了库里的任何脚本（装了的当然要统计）。
     */
    const installedNames = new Set(lib.map((L) => L.name))
    const hasAny = scripts.some((x) => installedNames.has(str(x && x.name)))
    // 判据只写一处：统计与装卸共用 cardInstallable，避免两边口径不一致。
    const installable = cardInstallable(f, scripts, marker, installedNames, false)
    const installed = lib.map((L) => {
      const hit = scripts.find((s) => str(s && s.name) === L.name)
      if (!hit) return { name: L.name, state: 'absent' }
      const same = shortHash(String(hit.content || '')) === L.hash
      return {
        name: L.name,
        state: same ? 'ok' : 'differs',
        enabled: hit.enabled !== false && hit.disabled !== true,
        bytes: String(hit.content || '').length,
      }
    })
    out.push({
      file: f,
      label: f.replace(/\.json$/, ''),
      installable,
      mvu: isMvu,
      markerKind: (marker && marker.kind) || '',
      bytes: total,
      scriptCount: scripts.length,
      installed,
      /* 界面上的标签就靠这两个字段：标记覆盖 + 会不会堵掉纯 API 测试 */
      fit: cardMarkerFit(data),
      blocksApiTest: cardBlocksApiTest(scripts, installedNames),
    })
  }
  return { lib, cards: out }
}

/** 装：把库里指定脚本推进目标卡。返回每张卡的处理结果。 */
/**
 * 检测某个通用脚本对哪些卡有实际用处。
 *
 * 做法是可验证的匹配，不是内容层面的推荐：
 *   · 从脚本内容认出它调用了哪些宿主能力；
 *   · 看每张卡具备哪些特征（有没有 MVU、有多少正则产 UI、有没有脚本位）；
 *   · 两边对得上就给一条理由。
 *
 * 明确不做的事：不猜题材契合度。脚本是通用能力，跟卡讲什么故事无关。
 */
/* dsh-fit-job —— 后台生成"精准建议"。
 *
 * 与 fitCommonScript 的区别：那个是即时的关键词匹配，这个是【读卡内容】的深度分析。
 * 慢（要逐张读盘，卡有十几 MB），所以做成后台任务：
 *   · 任务状态在宿主进程里，关掉界面照样跑；
 *   · 结果落盘，重启 DSH 也不丢。
 *
 * 做不到的部分要说清：宿主没给插件暴露模型接口，所以这里的"建议"是
 * 基于提取到的事实写出来的，不是模型读完整卡后的判断。
 */
const FIT_JOBS = new Map()

/** 任务落盘路径：一个脚本一份，重跑覆盖。 */
function fitJobFile(name) {
  return path.join(DATA_DIR, 'fit-' + String(name).replace(/[\\/:*?"<>|]/g, '_') + '.json')
}

/** 读上次结果（含已完成与进行中）。界面重开时先拿这个。 */
function readFitJob(name) {
  const live = FIT_JOBS.get(name)
  if (live) return live
  try {
    return JSON.parse(fs.readFileSync(fitJobFile(name), 'utf8'))
  } catch {
    return null
  }
}

function writeFitJob(job) {
  try {
    ensureDir(DATA_DIR)
    fs.writeFileSync(fitJobFile(job.name), JSON.stringify(job), 'utf8')
  } catch (e) {
    log('fit job write failed:', (e && e.message) || e)
  }
}

/**
 * 从一张卡里抽"能用来判断契合度"的东西。
 *
 * 刻意不塞全文（有卡 11MB，全读进来没意义也慢）：只取
 * description / 正则名 / 脚本名与开头 / 世界书标题 / 开场开头。
 * 这几样足以说出"这卡在做什么、界面是不是正则撑的"。
 */
function cardProfile(f) {
  const p = path.join(CARD_DIR, f)
  let j
  try {
    j = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
  const d = (j.raw && j.raw.data) || j.data || {}
  const ext = d.extensions || {}
  const book = ((d.character_book || {}).entries) || []
  const scripts = ((ext.tavern_helper || {}).scripts) || []
  const regs = ext.regex_scripts || []
  const cut = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)

  const regChars = regs.reduce((n, r) => n + String(r.replaceString || '').length, 0)
  return {
    file: f,
    label: f.replace(/\.json$/, ''),
    description: cut(d.description, 400),
    firstMes: cut(d.first_mes, 160),
    regexNames: regs.map((r) => str(r.scriptName)).filter(Boolean).slice(0, 24),
    regexCount: regs.length,
    regexChars: regChars,
    scriptNames: scripts.map((x) => str(x && x.name)).filter(Boolean),
    enabledScriptNames: scripts.filter((x) => x && x.enabled !== false && x.disabled !== true).map((x) => str(x && x.name)).filter(Boolean),
    scriptChars: scripts.reduce((n, x) => n + String(x.content || '').length, 0),
    bookTitles: book.map((e) => str(e.comment || e.name)).filter(Boolean).slice(0, 30),
    bookCount: book.length,
    hasMvu: /\[mvu_update\]|\[initvar\]|getMvuData|registerMvuSchema/.test(JSON.stringify(ext) + JSON.stringify(book)),
    markerKind: (() => { try { const m = cardMarkerOf(p, fs.statSync(p)); return (m && m.kind) || '' } catch { return '' } })(),
    /* 标记覆盖：决定这个脚本在这张卡上有没有东西可处理 */
    fit: cardMarkerFit(d),
  }
}

/**
 * 给一张卡写建议。
 *
 * 每条都引用【卡里实际存在的东西】（正则名、脚本名、世界书标题、description 里的词），
 * 所以用户可以核对。不写"建议装"这种结论。
 */
function adviseFor(prof, caps) {
  const out = []
  const has = (re) => caps.some((c) => re.test(c))
  const nameHit = (re) => prof.regexNames.some((n) => re.test(n)) || prof.scriptNames.some((n) => re.test(n))

  /*
   * 第一判据：这张卡会不会产出脚本要读的标记。
   * 缺了就到此为止 —— 再列"世界书多 / 能读写变量"只会让人以为能装。
   */
  if (prof.fit && prof.fit.idle) {
    return [
      '缺正文定位标记（' + (prof.fit.missing || []).slice(0, 4).join(' / ') + '）：脚本靠这些标记找要处理的段落，' +
        '这张卡不产出它们 → 装上只会在面板里空转，不接管任何功能',
    ]
  }
  if (prof.fit && !prof.fit.native) {
    out.push('只覆盖了 ' + (prof.fit.locate || []).join(' / ') + '，缺 ' + (prof.fit.missing || []).slice(0, 4).join(' / ') + '：功能能用一部分')
  }

  /* 界面：卡有状态栏/正文美化这类正则，且脚本能渲染 —— 最实的一条 */
  if (has(/ui/) && (prof.regexChars > 50000 || nameHit(/状态栏|面板|美化|界面|HUD|立绘/))) {
    const which = prof.regexNames.filter((n) => /状态栏|面板|美化|界面|HUD|立绘/.test(n)).slice(0, 3)
    out.push('卡里的界面靠正则撑（' + prof.regexChars.toLocaleString() + ' 字符' + (which.length ? '，如「' + which.join('」「') + '」' : '') + '），脚本的界面能力可以接管这部分')
  }

  /* 世界书：脚本能条目级操作世界书 */
  if (has(/worldbook/) && prof.bookCount > 20) {
    out.push('世界书有 ' + prof.bookCount + ' 条，脚本能做条目级读写（前几条：「' + prof.bookTitles.slice(0, 3).join('」「') + '」）')
  }

  /* MVU：脚本直接读写变量 */
  if (has(/mvu/) && prof.hasMvu) {
    out.push(prof.markerKind === 'hand-tuned-mvu' ? '自带 MVU（已手改），脚本能直接读写它的变量' : '是 MVU 卡，脚本能直接读写它的变量')
  }

  /* 模型：卡需要后台生成内容（从 description 里的玩法词推断） */
  if (has(/model/)) {
    const gameplay = /结算|经营|直播|养成|回合|日程|打工|数值|成长|属性/.exec(prof.description)
    if (gameplay) out.push('玩法里有「' + gameplay[0] + '」这类需要逐步推进的部分，适合交给后台助手生成')
    else if (prof.bookCount > 10) out.push('世界书条目多，副 API 可以拿来做资料生成')
  }

  /* 已有脚本：提醒加载顺序，不当作好处 */
  if (prof.scriptNames.length) {
    out.push('这卡已有 ' + prof.scriptNames.length + ' 个脚本（' + prof.scriptNames.slice(0, 3).join('、') + (prof.scriptNames.length > 3 ? '…' : '') + '），装上后注意加载顺序')
  }
  return out
}

/** 跑一次扫描。逐张读盘 + 出建议，每张更新一次进度并落盘。 */
async function runFitScan(job, libEntry, names) {
  const caps = (() => {
    let content = ''
    try { content = String(JSON.parse(fs.readFileSync(path.join(COMMON_DIR, libEntry.file), 'utf8')).content || '') } catch { /* 空 */ }
    const found = []
    if (/generateRaw|TavernHelper\.generate/.test(content)) found.push('model')
    if (/getMvuData|replaceMvuData|insertOrAssignVariables/.test(content)) found.push('mvu')
    if (/getWorldbook|setWorldbook|worldbook_entry|upsert_worldbook_profile/.test(content)) found.push('worldbook')
    if (/getChatMessages|setChatMessages|createChatMessages/.test(content)) found.push('chat')
    if (/createElement|innerHTML|StatusPlaceHolder|iframe|Panel/.test(content)) found.push('ui')
    return found
  })()
  job.capabilities = caps

  let files = []
  try {
    files = fs.readdirSync(CARD_DIR).filter((f) => f.endsWith('.json'))
  } catch { /* 读不到就是空 */ }
  /* 库里所有脚本都算"通用件"，扣掉它们之后还剩几个启用脚本 = 会不会堵掉自动测试 */
  const libNames = new Set(listCommonLib().map((L) => L.name))
  job.total = files.length
  writeFitJob(job)

  for (const f of files) {
    if (job.cancelled) break
    try {
      const prof = cardProfile(f)
      if (prof) {
        const reasons = adviseFor(prof, caps)
        const installed = names.has(f)
        const otherScripts = (prof.enabledScriptNames || []).filter((n) => !libNames.has(n)).length
        job.cards.push({
          file: f, label: prof.label,
          installed,
          capabilities: caps,
          reasons,
          fit: prof.fit,
          verdict: prof.fit && prof.fit.idle ? 'idle' : prof.fit && prof.fit.native ? 'native' : 'partial',
          blocksApiTest: otherScripts === 0,
          profile: {
            regexCount: prof.regexCount, regexChars: prof.regexChars,
            scriptNames: prof.scriptNames, bookCount: prof.bookCount,
            hasMvu: prof.hasMvu, markerKind: prof.markerKind,
            description: prof.description.slice(0, 120),
          },
        })
      }
    } catch (e) {
      job.errors.push(f + ': ' + ((e && e.message) || e))
    }
    job.done += 1
    writeFitJob(job)
    /* 让出事件循环 —— 不这么做会占满宿主进程，界面卡住。 */
    await new Promise((r) => setTimeout(r, 0))
  }

  /* 不适合的排最后；其余按理由多少，同分时没装的排前面 */
  job.cards.sort(
    (a, b) =>
      Number(a.verdict === 'idle') - Number(b.verdict === 'idle') ||
      b.reasons.length - a.reasons.length ||
      Number(a.installed) - Number(b.installed),
  )
  job.status = job.cancelled ? 'cancelled' : 'done'
  job.finishedAt = new Date().toISOString()
  writeFitJob(job)
}

/** 启动（或复用）一次扫描。已经在跑的直接返回现有任务。 */
function startFitScan(body) {
  const name = str(body && body.name)
  const lib = listCommonLib()
  const L = name ? lib.find((x) => x.name === name) : null
  if (!L) throw new Error('库里没有这个脚本：' + (name || '(未指定)'))

  const running = FIT_JOBS.get(name)
  if (running && running.status === 'running') return { job: running, reused: true }

  const job = {
    name,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    done: 0, total: 0,
    capabilities: [],
    cards: [],
    errors: [],
    cancelled: false,
  }
  FIT_JOBS.set(name, job)
  writeFitJob(job)
  /* 不 await —— 请求立刻返回，任务在后台继续。 */
  void runFitScan(job, L, new Set()).catch((e) => {
    job.status = 'error'
    job.errors.push(String((e && e.message) || e))
    writeFitJob(job)
  })
  return { job, reused: false }
}

/** 查进度。界面重开时也走这个 —— 会读到落盘的任务。 */
function fitScanState(body) {
  const name = str(body && body.name)
  if (!name) throw new Error('缺少脚本名')
  return { job: readFitJob(name) }
}

/** 取消一个在跑的任务。 */
function cancelFitScan(body) {
  const name = str(body && body.name)
  const job = FIT_JOBS.get(name)
  if (!job || job.status !== 'running') return { cancelled: false }
  job.cancelled = true
  return { cancelled: true }
}
function fitCommonScript(body) {
  const name = str(body && body.name)
  const lib = listCommonLib()
  const L = name ? lib.find((x) => x.name === name) : null
  if (!L) throw new Error('库里没有这个脚本：' + (name || '(未指定)'))

  let content = ''
  try {
    content = String(JSON.parse(fs.readFileSync(path.join(COMMON_DIR, L.file), 'utf8')).content || '')
  } catch { /* 读不了按空处理，下面会给出"识别不出能力" */ }

  /* 脚本用到的能力 → 对应"什么样的卡受益" */
  const RULES = [
    { key: 'model', re: /generateRaw|TavernHelper\.generate/, need: (c) => c.regexCount > 0 || c.worldbook > 0,
      why: '卡里有正则/世界书内容，副 API 可以拿去后台生成东西' },
    { key: 'mvu', re: /getMvuData|replaceMvuData|insertOrAssignVariables/, need: (c) => c.hasMvu,
      why: '卡是 MVU 卡，脚本能直接读写它的变量' },
    { key: 'worldbook', re: /getWorldbook|setWorldbook|worldbook_entry|upsert_worldbook_profile/, need: (c) => c.worldbook > 0,
      why: '卡有世界书，脚本可以在上面做条目级操作' },
    { key: 'chat', re: /getChatMessages|setChatMessages|createChatMessages/, need: (c) => c.msgs > 0,
      why: '卡已经在用聊天记录，脚本能进一步读取/回填' },
    { key: 'ui', re: /createElement|innerHTML|StatusPlaceHolder|iframe|Panel/, need: (c) => c.uiRegex > 0 || c.bigRegex > 0,
      why: '卡里有大量指向前端的正则，脚本可以把界面部分接管掉' },
  ]
  const active = RULES.filter((r) => r.re.test(content))

  const out = []
  let files = []
  try {
    files = fs.readdirSync(CARD_DIR).filter((f) => f.endsWith('.json'))
  } catch { /* 目录读不到，返回空 */ }

  for (const f of files) {
    const p = path.join(CARD_DIR, f)
    let j
    try {
      j = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {
      continue
    }
    const d = (j.raw && j.raw.data) || j.data || {}
    const ext = d.extensions || {}
    const book = ((d.character_book || {}).entries) || []
    const scripts = ((ext.tavern_helper || {}).scripts) || []
    const regs = ext.regex_scripts || []
    const regChars = regs.reduce((n, r) => n + String(r.replaceString || '').length, 0)
    const marker = cardMarkerOf(p, fs.statSync(p))
    const js = JSON.stringify(ext) + JSON.stringify(book)

    const feat = {
      regexCount: regs.length,
      bigRegex: regChars > 100000,
      uiRegex: regs.some((r) => /StatusPlaceHolder|innerHTML|iframe|<\/div>/.test(String(r.replaceString || ''))),
      worldbook: book.length,
      hasMvu: /\[mvu_update\]|\[initvar\]|getMvuData|registerMvuSchema/.test(js),
      msgs: /getChatMessages|MESSAGE_RECEIVED|eventOn/.test(js),
      scriptCount: scripts.length,
      markerKind: (marker && marker.kind) || '',
    }

    const fit = cardMarkerFit(d)
    const blocksApiTest = cardBlocksApiTest(scripts, new Set([L.name]))

    /*
     * 先判"能不能用"。缺定位标记的卡，列一串"能读写变量 / 世界书多"的通用理由
     * 只会把人推向"装上试试"，所以那种卡只给一句话结论。
     */
    const reasons = fit.idle
      ? ['缺正文定位标记（' + SCRIPT_MARKERS.locate.join(' / ') + '）：脚本靠它找要处理的段落，这张卡里没有 → 装上只会空转']
      : active.filter((r) => r.need(feat)).map((r) => r.why)
    const already = scripts.some((x) => str(x && x.name) === L.name)
    if (!reasons.length && !already) continue

    out.push({
      file: f,
      label: f.replace(/\.json$/, ''),
      installable: cardInstallable(f, scripts, marker, new Set([L.name]), false),
      installed: already,
      reasons,
      feat,
      fit,
      verdict: fit.idle ? 'idle' : fit.native ? 'native' : 'partial',
      blocksApiTest,
    })
  }

  /* 不适合的沉底：理由多的排前面，同分按是否已装 —— 已装的沉下去 */
  out.sort(
    (a, b) =>
      Number(a.verdict === 'idle') - Number(b.verdict === 'idle') ||
      b.reasons.length - a.reasons.length ||
      Number(a.installed) - Number(b.installed),
  )
  return { name: L.name, capabilities: active.map((r) => r.key), cards: out }
}
function installCommon(body) {
  const want = Array.isArray(body && body.scripts) ? body.scripts.map(str).filter(Boolean) : []
  const targets = Array.isArray(body && body.cards) ? body.cards.map(str).filter(Boolean) : []
  const lib = listCommonLib()
  const chosen = want.length ? lib.filter((L) => want.includes(L.name)) : lib
  if (!chosen.length) throw new Error('没有可装的脚本')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const bakDir = path.join(DATA_DIR, 'common-script-backups', stamp)
  ensureDir(bakDir)

  const results = []
  const libNames = new Set(chosen.map((L) => L.name))
  const explicit = targets.length > 0
  for (const f of fs.readdirSync(CARD_DIR).filter((x) => x.endsWith('.json'))) {
    if (explicit && !targets.some((t) => f.includes(t))) continue
    const full0 = path.join(CARD_DIR, f)
    let pre = null
    try {
      const j0 = JSON.parse(fs.readFileSync(full0, 'utf8'))
      const d0 = (j0.raw && j0.raw.data) || j0.data || {}
      pre = {
        scripts: (((d0.extensions || {}).tavern_helper || {}).scripts) || [],
        marker: cardMarkerOf(full0, fs.statSync(full0)),
      }
    } catch {
      continue
    }
    /* 没点名要哪张卡时，只处理"可装"的 —— 判据与统计口径一致。 */
    if (!cardInstallable(f, pre.scripts, pre.marker, libNames, explicit)) continue
    const p = path.join(CARD_DIR, f)
    let j, d, scripts
    try {
      j = JSON.parse(fs.readFileSync(p, 'utf8'))
      d = (j.raw && j.raw.data) || j.data || {}
      d.extensions = d.extensions || {}
      d.extensions.tavern_helper = d.extensions.tavern_helper || {}
      d.extensions.tavern_helper.scripts = d.extensions.tavern_helper.scripts || []
      scripts = d.extensions.tavern_helper.scripts
    } catch (e) {
      results.push({ file: f, ok: false, error: String((e && e.message) || e) })
      continue
    }
    const need = chosen.filter((L) => !scripts.some((s) => str(s && s.name) === L.name))
    if (!need.length) {
      results.push({ file: f, ok: true, skipped: true, scriptCount: scripts.length })
      continue
    }
    try { fs.copyFileSync(p, path.join(bakDir, f)) } catch { /* 备份失败不阻断，下面会如实报 */ }
    for (const L of need) {
      try {
        const src = JSON.parse(fs.readFileSync(path.join(COMMON_DIR, L.file), 'utf8'))
        const entry = Object.assign({}, src)
        delete entry.export_with
        delete entry.dsh_meta
        if (entry.enabled === undefined) entry.enabled = true
        scripts.push(entry)
      } catch (e) {
        results.push({ file: f, ok: false, script: L.name, error: String((e && e.message) || e) })
      }
    }
    try {
      fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8')
      results.push({ file: f, ok: true, added: need.length, scriptCount: scripts.length })
    } catch (e) {
      results.push({ file: f, ok: false, error: String((e && e.message) || e) })
    }
  }
  return { results, backupDir: bakDir }
}

/** 卸：从目标卡移除库里同名脚本。 */
function removeCommon(body) {
  const want = Array.isArray(body && body.scripts) ? body.scripts.map(str).filter(Boolean) : []
  const targets = Array.isArray(body && body.cards) ? body.cards.map(str).filter(Boolean) : []
  const lib = listCommonLib()
  const chosen = want.length ? lib.filter((L) => want.includes(L.name)) : lib
  const names = new Set(chosen.map((L) => L.name))
  if (!names.size) throw new Error('没有可卸的脚本')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const bakDir = path.join(DATA_DIR, 'common-script-backups', stamp)
  ensureDir(bakDir)

  const results = []
  /* 卸只认"点了哪张卡"：没点名就全扫一遍，谁装了就卸谁。
     这里不套"可装"判据 —— 卡上真有这个脚本就该能卸掉，
     哪怕它现在已不在统计范围内（比如脚本文件被改过名）。 */
  for (const f of fs.readdirSync(CARD_DIR).filter((x) => x.endsWith('.json'))) {
    if (targets.length && !targets.some((t) => f.includes(t))) continue
    const p = path.join(CARD_DIR, f)
    let j, d, scripts
    try {
      j = JSON.parse(fs.readFileSync(p, 'utf8'))
      d = (j.raw && j.raw.data) || j.data || {}
      scripts = (((d.extensions || {}).tavern_helper || {}).scripts) || []
    } catch (e) {
      results.push({ file: f, ok: false, error: String((e && e.message) || e) })
      continue
    }
    const kept = scripts.filter((s) => !names.has(str(s && s.name)))
    if (kept.length === scripts.length) continue
    try { fs.copyFileSync(p, path.join(bakDir, f)) } catch { /* 同上 */ }
    d.extensions.tavern_helper.scripts = kept
    try {
      fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8')
      results.push({ file: f, ok: true, removed: scripts.length - kept.length, scriptCount: kept.length })
    } catch (e) {
      results.push({ file: f, ok: false, error: String((e && e.message) || e) })
    }
  }
  return { results, backupDir: bakDir }
}
function statePayload() {
  const scanned = scanCards()
  if (syncCards(scanned) || ensureOtherBuckets()) saveDb('rescan')
  const cards = cardList()
  const stats = { cards: cards.length, entries: db.entries.length, open: 0, watch: 0, fixed: 0 }
  for (const entry of db.entries) {
    if (stats[entry.status] !== undefined) stats[entry.status] += 1
  }
  return {
    ok: true,
    updatedAt: db.updatedAt,
    paths: {
      dataDir: DATA_DIR,
      dbFile: DB_FILE,
      cardDir: CARD_DIR,
      backupDir: BACKUP_DIR,
      backupDirDefault: BACKUP_DIR_DEFAULT,
      backupDirCustom: !!(db.config && db.config.backupDir),
      pluginDir: PLUGIN_DIR,
    },
    scopes: SCOPES,
    statuses: STATUSES,
    generalKey: GENERAL_KEY,
    dataFile: (() => {
      let bytes = 0
      try {
        bytes = fs.statSync(DB_FILE).size
      } catch {
        /* 还没写过 */
      }
      return {
        file: DB_FILE,
        bytes,
        updatedAt: db.updatedAt,
        entries: db.entries.length,
        cards: Object.keys(db.cards).length,
      }
    })(),
    config: {
      remoteUrl: str(db.config && db.config.remoteUrl),
      autoReflux: (db.config && db.config.autoReflux) || null,
      autoRefluxLast: (db.config && db.config.autoRefluxLast) || null,
    },
    cards,
    entries: db.entries,
    stats,
    backups: listBackups(),
    plugin: selfState(),
    install: installState(),
    // Tavern 插件接口连上了没有、到哪个版本。面板不画它 —— 没连上时那条
    // 「记进错题库」的按钮根本不会出现 —— 但宿主半自己的日志进不了宿主日志文件，
    // 从外部看"接上了"和"静默跳过"长得一模一样，所以状态里留一份。
    tavern: {
      connected: !!tavernApi,
      apiVersion: tavernApi ? Number(tavernApi.apiVersion) || 0 : 0,
      history: !!(tavernApi && typeof tavernApi.getHistory === 'function'),
      card: !!(tavernApi && typeof tavernApi.getCard === 'function'),
      // 第 3 版的能力：抓底稿时带上「本轮请求上下文」和卡版本；卡一改就把
      // 体检缓存作废。面板据此决定显示哪几栏，不看 Tavern 装没装。
      requestContext: !!(tavernApi && typeof tavernApi.getRequestContext === 'function'),
      cardRevision: !!(tavernApi && typeof tavernApi.cardRevision === 'function'),
      cardChanged: !!(tavernApi && typeof tavernApi.onCardChanged === 'function'),
    },
  }
}

/**
 * 把 Tavern 交回的「本轮请求上下文」压成几行。
 *
 * 原样存没有意义：那里的 `text` 是世界书整段、现场状态整段，几万字，进了错题
 * 也读不动。要回答的是「哪几段真的进了请求、各自多少字」，所以每段一行，
 * 只留位置、来源和字数 —— 字数本身就是线索：该触发的那条世界书如果是 0 段，
 * 名单里根本不会出现它。
 */
function summarizeRequestContext(context) {
  const sections = Array.isArray(context && context.sections) ? context.sections : []
  if (!sections.length) return ''
  const rows = []
  for (const section of sections.slice(0, 24)) {
    const slot = str(section && section.slot) || '?'
    const origin = str(section && section.origin) || '?'
    const plugin = str(section && section.plugin)
    const name = str(section && section.name)
    const source = origin === 'plugin' ? `plugin:${plugin}${name ? '/' + name : ''}` : origin
    rows.push(`- [${slot}] ${source} · ${str(section && section.text).length} 字`)
  }
  const hidden = sections.length - rows.length
  return ['【本轮请求上下文】', ...rows, hidden > 0 ? `- …另有 ${hidden} 段未列` : ''].filter(Boolean).join('\n')
}

async function handleAction(body) {
  const action = str(body && body.action)
  switch (action) {
    /**
     * 游玩时点「记进错题库」走的这一条：把那一轮的正文与卡名读出来，当好一条
     * 错题的底稿。
     *
     * 读正文是宿主侧的事 —— `getTurn` 是 Tavern 的宿主服务，浏览器半拿不到。
     * 所以按钮在浏览器侧、取数据在这里，中间就这一趟往返。
     */
    case 'captureTurn': {
      const tavern = tavernApi
      if (!tavern || typeof tavern.getTurn !== 'function') {
        throw new Error('没有连上 Tavern，读不到这一轮的正文')
      }
      if (Number(tavern.apiVersion) < 1) throw new Error('Tavern 插件接口版本过旧，读不到正文')
      const gameId = str(body.gameId)
      const turn = Number(body.turn)
      const found = await tavern.getTurn({ gameId, turn })
      if (!found) throw new Error('这一轮读不到（可能还没结算完）')
      const cardId = str(found.card && found.card.id).trim()
      /*
       * 同一局、同一轮、同一张卡已经记过：把已有的那条交回去，不再写第二份。
       *
       * 消息按钮连点两下、或者记完之后又点一次，会得到两条一模一样的底稿，
       * 之后每一条都要单独维护。按钮本来就只是「把这一轮抓下来」，抓过就够；
       * 真要为同一轮补第二个问题，面板里的「新建条目」不受这里影响。
       */
      const duplicate = db.entries.find(
        (e) =>
          e.source &&
          e.source.gameId === gameId &&
          Number(e.source.turn) === turn &&
          (!cardId || e.cardKey === cardId),
      )
      if (duplicate) {
        return { ok: true, action, duplicate: { id: duplicate.id, title: duplicate.title } }
      }
      // 往回再抓两轮当上下文。`getHistory` 是第 2 版才有的：老版本上这一栏空着，
      // 记录本身照旧 —— 上下文是加分项，不是记录的前提，所以失败只记日志不抛。
      let before = []
      if (typeof tavern.getHistory === 'function' && Number(tavern.apiVersion) >= 2) {
        const from = Math.max(1, turn - HISTORY_LOOKBACK)
        if (from < turn) {
          try {
            const rows = await tavern.getHistory({ gameId, from, to: turn - 1 })
            before = (Array.isArray(rows) ? rows : [])
              .map((row) => ({
                turn: Number(row && row.turn),
                text: str(row && row.text).slice(0, HISTORY_CHARS),
              }))
              .filter((row) => row.text.trim())
          } catch (e) {
            log('getHistory failed:', e && e.message ? e.message : e)
          }
        }
      }
      // 第 3 版起能读「这一轮正文请求实际用掉的上下文」。错题里最常见的一类是
      // 「该触发的那条世界书没触发」「插件段落没进去」—— 光看正文推不出来，
      // 这一段是唯一能直接指认的证据。读不到就不带，记录本身不因此失败。
      let request = ''
      if (typeof tavern.getRequestContext === 'function' && Number(tavern.apiVersion) >= 3) {
        try {
          request = summarizeRequestContext(await tavern.getRequestContext({ gameId, turn }))
        } catch (e) {
          log('getRequestContext failed:', e && e.message ? e.message : e)
        }
      }
      // 卡的版本号（第 3 版）：同一条错题只对某一次改动成立，卡名认不出这一点。
      let cardRevision = null
      if (cardId && typeof tavern.cardRevision === 'function' && Number(tavern.apiVersion) >= 3) {
        try {
          const revision = await tavern.cardRevision({ card: cardId })
          if (Number.isSafeInteger(revision) && revision >= 0) cardRevision = revision
        } catch (e) {
          log('cardRevision failed:', e && e.message ? e.message : e)
        }
      }
      return {
        ok: true,
        action,
        turn: {
          gameId,
          turn,
          // 版本号一并交回：面板把它存进 source，剧情线一变宿主才知道该给谁标脏。
          textVersion: str(found.textVersion),
          text: str(found.text),
          card: found.card || null,
        },
        before,
        request,
        cardRevision,
      }
    }
    case 'addEntry':
      return { ok: true, action, ...addEntry(body) }
    case 'updateEntry':
      return { ok: true, action, ...updateEntry(body) }
    case 'deleteEntry':
      return { ok: true, action, ...deleteEntry(body) }
    /**
     * 手工清掉来源失效标记。
     *
     * 标脏是自动的（剧情线一变就盖），但"这条错题现在还算不算数"只有人能判 ——
     * 回退之后重玩到同一处、问题没再出现，就该让它回到正常状态。
     */
    case 'clearStale': {
      const id = str(body && body.id)
      const entry = db.entries.find((e) => e.id === id)
      if (!entry) throw new Error(`未找到条目：${id}`)
      delete entry.stale
      const reflux = runAutoReflux()
      saveDb('clear-stale')
      return { ok: true, action, entry, reflux: refluxBrief(reflux) }
    }
    case 'moveEntry':
      return { ok: true, action, ...moveEntry(body, false) }
    case 'copyEntry':
      return { ok: true, action, ...moveEntry(body, true) }
    case 'renameCard':
      return { ok: true, action, ...renameCard(body) }
    case 'addBucket':
      return { ok: true, action, ...addBucket(body) }
    case 'deleteBucket':
      return { ok: true, action, ...deleteBucket(body) }
    case 'importEntries':
      return { ok: true, action, ...importEntries(body) }
    case 'refluxToSkill':
      return { ok: true, action, ...refluxToSkill(body) }
    case 'createSkill':
      return { ok: true, action, ...createUserSkill(body) }
    case 'deleteSkill':
      return { ok: true, action, ...deleteUserSkill(body) }
    case 'setAutoReflux':
      return { ok: true, action, ...setAutoReflux(body) }
    case 'restoreBackup':
      return { ok: true, action, ...restoreBackup(body) }
    case 'saveConfig':
      return { ok: true, action, ...saveConfig(body) }
    case 'setBackupDir':
      return { ok: true, action, ...setBackupDir(body) }
    case 'lookup':
      return { ok: true, action, result: lookup(body) }
    /**
     * 这一局正在玩的是哪张卡。
     *
     * 侧栏面板是在游玩界面里点开的，玩家多半刚在正文里发现问题；让他自己
     * 在一列卡名里找出那一张，是最没必要的一步。Tavern 的 `getCard`（第 2 版）
     * 直接给出卡名，这里再换成错题库的分类键。
     *
     * 读不到就返回空 key —— 面板保持原来的行为（不预选），不弹错误。
     */
    case 'gameCard': {
      const tavern = tavernApi
      if (!tavern || typeof tavern.getCard !== 'function' || Number(tavern.apiVersion) < 2) {
        return { ok: true, action, cardKey: '', name: '' }
      }
      const gameId = str(body && body.gameId)
      if (!gameId) return { ok: true, action, cardKey: '', name: '' }
      try {
        const card = await tavern.getCard({ gameId })
        const name = str(card && card.name).trim()
        if (!name) return { ok: true, action, cardKey: '', name: '' }
        const resolved = resolveCardKeyDetail(name)
        return { ok: true, action, cardKey: resolved.key || '', name }
      } catch (e) {
        return { ok: true, action, cardKey: '', name: '', error: (e && e.message) || String(e) }
      }
    }
    case 'checkSelf': {
      const plugin = await checkSelf(db.config)
      return { ok: true, action, plugin }
    }
    case 'backupNow':
      backupDb('manual')
      return { ok: true, action, backups: listBackups().length }
    case 'deleteBackup':
      return { ok: true, action, ...deleteBackup(body) }
    case 'pruneBackups':
      return { ok: true, action, ...pruneBackupList(body) }
    case 'openDataDir':
      return { ok: true, action, ...(await openPath(DATA_DIR)) }
    case 'openBackupDir':
      return { ok: true, action, ...(await openPath(BACKUP_DIR)) }
    case 'rescan': {
      const scanned = scanCards()
      syncCards(scanned)
      saveDb('rescan')
      return { ok: true, action, scanned: scanned.length }
    }
    case 'exportAll':
      return { ok: true, action, json: JSON.stringify({ version: 1, entries: db.entries }, null, 2) }
    case 'importCommonScript':
      return { ok: true, action, ...importCommonScript(body) }
    case 'deleteCommonScript':
      return { ok: true, action, ...deleteCommonScript(body) }
    case 'commonScripts':
      return { ok: true, action, ...commonInstallState() }
    case 'startFitScan':
      return { ok: true, action, ...startFitScan(body) }
    case 'fitScanState':
      return { ok: true, action, ...fitScanState(body) }
    case 'cancelFitScan':
      return { ok: true, action, ...cancelFitScan(body) }
    case 'fitCommonScript':
      return { ok: true, action, ...fitCommonScript(body) }
    case 'updateCommonScript':
      return { ok: true, action, ...updateCommonScript(body) }
    case 'installCommon':
      return { ok: true, action, ...installCommon(body) }
    case 'removeCommon':
      return { ok: true, action, ...removeCommon(body) }
    case 'state':
      return statePayload()
    default:
      throw new Error(`未知操作：${action}`)
  }
}

function saveConfig(body) {
  const config = body && body.config && typeof body.config === 'object' ? body.config : {}
  db.config = {
    remoteUrl: str(config.remoteUrl).trim(),
    backupDir: str(db.config.backupDir || ''),
  }
  saveDb('save-config')
  return { config: db.config }
}

/**
 * 改备份目录。
 *
 * 建目录、试写一个探针文件再删掉 —— 路径有问题要在按下保存的这一刻就报出来，
 * 而不是等到某次自动备份静默失败、回头看才发现这几天的备份都没落地。
 * 只影响之后写入的备份：旧目录里已有的不搬动也不删除。
 */
function setBackupDir(payload) {
  const raw = str(payload && payload.dir).trim()
  if (!raw) {
    db.config.backupDir = ''
    saveDb('set-backup-dir')
    BACKUP_DIR = BACKUP_DIR_DEFAULT
    ensureDir(BACKUP_DIR)
    return { backupDir: BACKUP_DIR, custom: false }
  }

  const dir = path.resolve(raw)
  if (!path.isAbsolute(dir)) throw new Error('请填绝对路径')
  if (exists(dir)) {
    let st = null
    try {
      st = fs.statSync(dir)
    } catch {
      /* 读不到就交给下面的写探针去报错 */
    }
    if (st && !st.isDirectory()) throw new Error(`这个路径不是文件夹：${dir}`)
  } else {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (e) {
      throw new Error(`建不了这个目录：${(e && e.message) || e}`)
    }
  }

  const probe = path.join(dir, `.wrongbook-write-test-${process.pid}`)
  try {
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
  } catch (e) {
    throw new Error(`这个目录写不进去：${(e && e.message) || e}`)
  }

  db.config.backupDir = dir
  // 这一份还落在旧目录里，等于给切换前的状态留个底。
  saveDb('set-backup-dir')
  BACKUP_DIR = dir
  ensureDir(BACKUP_DIR)
  return { backupDir: dir, custom: true }
}

/* ----------------------------------------------------------------- apply */

/**
 * Tavern 里改了一张卡：这张卡的体检结果就都过期了。
 *
 * 原来只能靠「大小 + 修改时间」判断缓存失效，而 Tavern 保存卡是「先写临时文件
 * 再改名」：同一毫秒里改两次、或者从备份恢复一份 mtime 更旧的卡，缓存都不会失效。
 * 表现在界面上就是「卡都改了，脚本盘点还是旧的」。第 3 版给了 `onCardChanged`，
 * 这件事由宿主主动说，不用再猜。
 *
 * 去抖 300ms：Tavern 的编辑器是自动保存，一次输入会连着发几次；每次重扫整目录
 * 没有必要，攒一批一起做。
 */
const pendingCardRefresh = new Set()
let cardRefreshTimer = null

function invalidateCardCaches(rel) {
  const prefix = `${path.join(CARD_DIR, rel)}:`
  for (const map of [scriptScanCache, cardMarkerCache]) {
    for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key)
  }
}

function scheduleCardRefresh(card) {
  const rel = path.basename(str(card).replace(/\\/g, '/'))
  if (!rel || !/\.json$/i.test(rel)) return
  pendingCardRefresh.add(rel)
  if (cardRefreshTimer) return
  cardRefreshTimer = setTimeout(() => {
    cardRefreshTimer = null
    const names = [...pendingCardRefresh]
    pendingCardRefresh.clear()
    for (const name of names) invalidateCardCaches(name)
    try {
      if (syncCards(scanCards())) saveDb('card-changed')
    } catch (e) {
      log('card refresh failed:', e && e.message)
    }
  }, 300)
  if (typeof cardRefreshTimer.unref === 'function') cardRefreshTimer.unref()
}

/**
 * Host 半边入口。
 *
 * 依赖声明成可选注入：webServer 不在时插件仍能加载，只是没有面板可读的状态；
 * tools 不在时少三个调试工具，数据层照旧。
 */
export function apply(ctx) {
  pluginCtx = ctx
  ensureDir(DATA_DIR)
  loadDb()
  if (!db.config || typeof db.config !== 'object') db.config = { remoteUrl: '' }
  BACKUP_DIR = db.config.backupDir ? path.resolve(db.config.backupDir) : BACKUP_DIR_DEFAULT
  ensureDir(BACKUP_DIR)
  // 首次启动就把分类表落盘：卡片目录是外部状态，下一次启动重新扫描没有意义，
  // 而写盘的时机越早，用户第一次打开面板看到的就是已分好类的列表。
  if (syncCards(scanCards()) || ensureOtherBuckets() || !exists(DB_FILE)) saveDb('bootstrap')
  log(`data ready: ${db.entries.length} entries, ${Object.keys(db.cards).length} card buckets`)

  /**
   * Tavern 的插件接口，装了才有。
   *
   * 按需取而不是写进 `export const inject`：那里是硬依赖，缺一个整个插件就不 apply，
   * 而 Tavern 是可选装的东西 —— 为了一条"游玩时记录"的便利，不该让整个错题库在没装
   * Tavern 的机器上起不来。
   */
  ctx.inject(['tavern'], (scoped) => {
    tavernApi = scoped && scoped.tavern ? scoped.tavern : null
    log(`tavern plugin api: ${tavernApi ? 'v' + tavernApi.apiVersion : '未连接'}`)

    // 剧情线一变，就给受影响的「游玩时记录」底稿标脏。
    //
    // 这条只认宿主说的话，不去翻 Tavern 的数据 —— 上次抓下来的那一轮，回退或
    // 重新生成之后已经读不到了，错题库自己无从察觉。事件里的 gameId + turn
    // 正好是 source 里存的那两份，对得上就盖个标记。
    //
    // 第 2 版才有这个方法；第 1 版上静默跳过，其余功能照旧。
    if (tavernApi && typeof tavernApi.onTimelineChanged === 'function') {
      tavernApi.onTimelineChanged((event) => {
        try {
          const { touched } = markStale(event)
          if (touched) log(`timeline ${str(event && event.kind)}: 标记 ${touched} 条底稿来源已失效`)
        } catch (e) {
          // 通知处理抛错不该反过来影响游玩 —— 自己兜住，只留一条日志。
          log('timeline stale marking failed:', e && e.message)
        }
      })
    }

    // 卡的工作版一改，这张卡的缓存就当没有过。第 3 版才有这个方法；旧版上
    // 静默跳过，仍按大小 + 修改时间判断。
    if (tavernApi && typeof tavernApi.onCardChanged === 'function') {
      tavernApi.onCardChanged((event) => {
        try {
          scheduleCardRefresh(event && event.card)
        } catch (e) {
          log('card change refresh failed:', e && e.message)
        }
      })
    }

    return () => {
      tavernApi = null
      pendingCardRefresh.clear()
      if (cardRefreshTimer) {
        clearTimeout(cardRefreshTimer)
        cardRefreshTimer = null
      }
    }
  })

  ctx.inject(['webServer'], (host) => {
    const routes = [
      {
        path: '/dsh-wrongbook/state',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            sendJson(response, 200, statePayload())
          } catch (e) {
            sendJson(response, 500, { ok: false, error: e && e.message ? e.message : String(e) })
          }
        },
      },
      {
        // 卡头像按 key 现取现给：原图可能十几 MB，浏览器用 object-fit 缩放，
        // 后台这边不做二次编码也就没有额外的进程和临时文件。
        path: '/dsh-wrongbook/avatar',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            const url = new URL(request.url || '/', 'http://127.0.0.1')
            const key = url.searchParams.get('card') || ''
            const card = db.cards[resolveCardKey(key)]
            const file = card && card.avatar && exists(card.avatar) ? card.avatar : ''
            if (!file) {
              response.writeHead(404, { 'cache-control': 'no-store' })
              response.end()
              return
            }
            const buffer = fs.readFileSync(file)
            response.writeHead(200, {
              'content-type': imageContentType(file),
              'content-length': buffer.length,
              'cache-control': 'public, max-age=3600',
            })
            response.end(buffer)
          } catch (e) {
            response.writeHead(500).end(String(e && e.message ? e.message : e))
          }
        },
      },
      {
        // 目录浏览：面板里的「选择文件夹」靠它列一层目录。
        // 跟卡片更新器同一套做法 —— 不赌宿主提不提供目录选择器，自己列、自己选。
        path: '/dsh-wrongbook/list',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            const url = new URL(request.url || '/', 'http://127.0.0.1')
            sendJson(response, 200, listDirEntries(url.searchParams.get('path')))
          } catch (e) {
            sendJson(response, 500, { ok: false, error: (e && e.message) || String(e) })
          }
        },
      },
      {
        // 卡内脚本盘点。只有切到「卡脚本」页签时才请求它 —— 它要读几张十几 MB 的卡，
        // 不该拖慢每次打开面板的那次 state。
        path: '/dsh-wrongbook/scripts',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            // 带 ?card= 就只解析那一张：面板是逐张取的，每回来一张就填一张。
            const url = new URL(request.url, 'http://localhost')
            const one = url.searchParams.get('card')
            if (one) {
              return sendJson(response, 200, { ok: true, card: scanOneCard(one) })
            }
            // 不带就是"骨架"：卡清单 + 工具脚本，都不解析卡内容，几十毫秒内回来。
            sendJson(response, 200, { ok: true, cards: listCardFiles(), tools: scanToolScripts() })
          } catch (e) {
            sendJson(response, 500, { ok: false, error: (e && e.message) || String(e) })
          }
        },
      },
      {
        // 可选的回流目标。内置 skill 一并列出但带 builtin 标记 —— 面板要据此把它们
        // 标成"写不了"，而不是让用户点下去才发现。
        path: '/dsh-wrongbook/skills',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            sendJson(response, 200, { ok: true, skills: listSkills(), userDir: userSkillDir() })
          } catch (e) {
            sendJson(response, 500, { ok: false, error: (e && e.message) || String(e) })
          }
        },
      },
      {
        // 一键重打宿主补丁。
        //
        // 宿主补丁改的是 apps/dsh-tavern/ 下的文件（src/ 与 lib/），而 DSH 升级是整份
        // 替换 —— 补丁会静默失效，不报错，只是功能悄悄回到补丁前。实测已发生三次。
        //
        // GET  查状态（只读）
        // POST 缺的重打（会依次：源码补丁 → build → 改 lib 的补丁）
        //
        // 注意顺序由 patch-all.mjs 自己保证：改 lib/client.js 的补丁必须排在 build 之后，
        // 否则下一次 build 会把它们抹掉。
        path: '/dsh-wrongbook/patch',
        handler: async (request, response) => {
          const apply = request.method === 'POST'
          const dataDir = path.dirname(DATA_DIR)
          const script = path.join(dataDir, 'mvu-api-test', 'patch-all.mjs')
          if (!fs.existsSync(script)) {
            return sendJson(response, 200, { ok: false, error: '找不到 patch-all.mjs：' + script })
          }
          try {
            const args = [script].concat(apply ? ['--apply'] : [])
            const { stdout, stderr } = await execFileAsync(process.execPath, args, {
              cwd: dataDir,
              timeout: 300000,
              maxBuffer: 4 * 1024 * 1024,
            })
            sendJson(response, 200, {
              ok: true,
              applied: apply,
              output: String(stdout || '') + String(stderr || ''),
              // 启动时那次自动检查的结果。面板据此显示"本次启动已经查过了"
              // 以及"刚补过、要重启才生效"，省得每次都手动点一遍。
              auto: autoPatch.checkedAt
                ? {
                    checkedAt: autoPatch.checkedAt,
                    pendingRestart: autoPatch.pendingRestart,
                    error: autoPatch.error,
                  }
                : null,
            })
          } catch (e) {
            // 子脚本非零退出时 stdout 里往往还有有用的信息，一并回给面板。
            sendJson(response, 200, {
              ok: false,
              applied: apply,
              error: (e && e.message) || String(e),
              output: String((e && e.stdout) || '') + String((e && e.stderr) || ''),
            })
          }
        },
      },
      {
        path: '/dsh-wrongbook/action',
        handler: async (request, response) => {
          if (request.method !== 'POST') return response.writeHead(405, { allow: 'POST' }).end()
          try {
            const body = await readBody(request)
            sendJson(response, 200, await handleAction(body))
          } catch (e) {
            sendJson(response, 200, { ok: false, error: e && e.message ? e.message : String(e) })
          }
        },
      },
    ]

    host.effect(() => {
      const disposers = routes.map((route) =>
        host.webServer.register({ kind: 'exact', path: route.path, handler: route.handler }),
      )
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 已经卸掉了 */
          }
        }
      }
    }, 'dsh-wrongbook: http routes')
    log('http routes ready')
  })

  // ── 启动时静默检查宿主补丁，缺的自动补齐 ──────────────────────────────
  //
  // 宿主补丁改的是 apps/dsh-tavern/ 下的文件，而 DSH 升级是整份替换 —— 补丁会
  // **静默失效**：不报错，功能悄悄回到补丁前（实测已发生三次，每次都要重新查一遍
  // "到底补丁还在不在"）。插件自己在 .dsh/plugins/ 下，升级碰不到，所以由它来照看。
  //
  // 跑的是 `--apply`（幂等）：没缺失时一个字节都不改，缺了就补上。
  // 补丁改的是**宿主文件**，本次启动它们已经进内存了 —— 所以要提示重启。
  void (async () => {
    try {
      const script = path.join(path.dirname(DATA_DIR), 'mvu-api-test', 'patch-all.mjs')
      if (!fs.existsSync(script)) {
        autoPatch.error = '找不到 patch-all.mjs'
        return
      }
      const { stdout } = await execFileAsync(process.execPath, [script, '--apply'], {
        cwd: path.dirname(DATA_DIR),
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024,
      })
      const out = String(stdout || '')
      autoPatch.output = out
      autoPatch.checkedAt = Date.now()
      // 脚本在"没有需要重打的"时会明说；否则说明刚补过，本次启动还没生效
      if (out.includes('没有需要重打的')) {
        autoPatch.pendingRestart = false
        log('宿主补丁已就位')
      } else {
        autoPatch.pendingRestart = true
        log('⚠ 宿主补丁缺失，已自动补齐 —— 重启 DSH 后生效')
      }
    } catch (e) {
      autoPatch.error = (e && e.message) || String(e)
      log('宿主补丁自动检查失败：' + autoPatch.error)
    }
  })()

  const tools = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : null)
  if (tools && typeof tools.register === 'function') {
    const disposers = [      tools.register({
        name: 'wrongbook_lookup',
        description:
          '查错题库。调试某张人物卡时先调它：按固定顺序返回三段 —— 「① 本分类」→「② 其它错题」→「③ 跨卡查询」，前一段永远排在后面几段之前。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            card: {
              type: 'string',
              description:
                '出问题的分类：卡片名、cards/xxx.json 路径或文件名片段，也可以是「其它错题」里的主题名（如 卡片更新器）。省略则在通用分类下检索。',
            },
            query: { type: 'string', description: '症状关键词，空格分隔多个词。省略则列出全部条目。' },
            status: { type: 'string', enum: STATUSES, description: '只保留某一种状态。' },
            scope: { type: 'string', enum: SCOPES, description: '只保留某一类问题。' },
            limit: { type: 'number', description: '每一部分最多返回多少条，默认 80。' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
          },
          render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
        },
        async execute(args) {
          const result = lookup(args)
          return { text: renderLookup(result, { compact: !str(args && args.query).trim() }) }
        },
      }),
      tools.register({
        name: 'wrongbook_record',
        description:
          '把调试中新发现的问题记进对应分类。名字不认识时会自动建一个新的「其它错题」分类，而不是默默塞进兜底 —— 建出来的分类在面板上看得见、能改名也能删。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['card', 'title'],
          properties: {
            card: { type: 'string', description: '问题所属的分类：卡名、cards/xxx.json，或「其它错题」里的主题名。填一个还不存在的名字会新建分类。' },
            title: { type: 'string', description: '一句话症状，作为条目标题。' },
            symptom: { type: 'string', description: '现象：看到什么、什么条件下复现。' },
            cause: { type: 'string', description: '根因。' },
            fix: { type: 'string', description: '已验证的修法；还没解决就留空。' },
            scope: { type: 'string', enum: SCOPES, description: '问题归类。' },
            tags: { type: 'array', items: { type: 'string' }, description: '检索用的标签。' },
            refs: { type: 'string', description: '涉及的文件或字段路径。' },
            evidence: { type: 'string', description: '证据：日志、游玩记录、报错原文。' },
            status: { type: 'string', enum: STATUSES, description: 'open 未解决 / watch 观察中 / fixed 已修复。' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
          },
          render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
        },
        async execute(args) {
          const out = addEntry(args || {})
          const created = out.created ? `（这个名字原先没有分类，已新建「${out.created}」）` : ''
          return {
            text: `已归档到错题库：「${cardDisplayName(out.entry.cardKey)}」分类 · 《${out.entry.title}》（${out.entry.id}）${created}${refluxNote(out.reflux)}`,
          }
        },
      }),
      tools.register({
        name: 'wrongbook_update',
        description: '更新错题库里已有条目：标记已修复、补上根因或修法、改状态。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: {
            id: { type: 'string', description: '条目 id，wrongbook_lookup 返回里的括号值。' },
            status: { type: 'string', enum: STATUSES, description: '新状态。' },
            cause: { type: 'string', description: '补写的根因。' },
            fix: { type: 'string', description: '补写的修法。' },
            symptom: { type: 'string', description: '修正后的现象描述。' },
            tags: { type: 'array', items: { type: 'string' }, description: '替换标签。' },
            evidence: { type: 'string', description: '补充证据。' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
          },
          render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
        },
        async execute(args) {
          const { id, ...patch } = args || {}
          const out = updateEntry({ id, patch })
          return {
            text: `已归档到错题库：「${cardDisplayName(out.entry.cardKey)}」分类 · 《${out.entry.title}》（${out.entry.id}）更新为 ${out.entry.status}${refluxNote(out.reflux)}`,
          }
        },
      }),
    ]
    ctx.effect(
      () => () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 已经卸掉了 */
          }
        }
      },
      'dsh-wrongbook: tools',
    )
    log(`tools registered: ${disposers.length}`)
  } else {
    log('tools service missing; skipping tool registration')
  }

  // 工具注册只解决「能用」，这一段解决「会用」。
  const prompt = ctx.systemPrompt || (typeof ctx.get === 'function' ? ctx.get('systemPrompt') : null)
  if (prompt && typeof prompt.section === 'function') {
    prompt.section({ name: 'dsh-wrongbook', order: 5100, text: () => WRONGBOOK_PROMPT })
    log('prompt section ready')
  } else {
    log('systemPrompt service missing; skipping prompt section')
  }
}

/* -------------------------------------------------------------- rendering */

function renderEntry(entry, withCard) {
  const head = `- [${statusLabel(entry.status)}] ${entry.title}（#${entry.id}）`
  const meta = [`范围=${entry.scope}`]
  if (withCard) meta.push(`卡片=${cardDisplayName(entry.cardKey)}`)
  if (entry.tags && entry.tags.length) meta.push(`标签=${entry.tags.join(', ')}`)
  const lines = [`${head} · ${meta.join(' · ')}`]
  if (entry.symptom) lines.push(`  现象：${entry.symptom}`)
  if (entry.cause) lines.push(`  根因：${entry.cause}`)
  if (entry.fix) lines.push(`  修法：${entry.fix}`)
  if (entry.refs) lines.push(`  涉及：${entry.refs}`)
  if (entry.evidence) lines.push(`  证据：${entry.evidence}`)
  return lines.join('\n')
}

function statusLabel(status) {
  if (status === 'fixed') return '已修复'
  if (status === 'watch') return '观察中'
  return '未解决'
}

/**
 * 检索结果渲染成给人看的文本，顺序本身就说明了该先看哪一段。
 *
 * 没给关键词时 ② ③ 只印前几条：全库几十条铺开会把 ① 淹掉，而 ① 才是这会儿要看的东西。
 * 给了关键词说明是有目的地在找，那就整段列出来。
 */
function renderLookup(result, options) {
  const compact = !!(options && options.compact)
  const cap = compact ? 8 : Infinity
  const clip = (list) => (list.length > cap ? list.slice(0, cap) : list)
  const note = (list, all) =>
    list.length > cap ? `（共 ${all} 条，这里先列 ${cap} 条；带上关键词可以筛）` : ''

  const inOther = result.cardGroup === 'other'
  const parts = [`【错题库检索】当前分类=${result.cardName} · 全库 ${result.scanned} 条`]
  if (result.candidates && result.candidates.length) {
    parts.push(
      `⚠ 「${result.asked || '（空）'}」对上了 ${result.candidates.length} 个分类：${result.candidates.join('、')}。`,
      '   这次按兜底分类检索的。原版卡和它的 MVU 版是两个分类，请写全名字再说一次。',
    )
  }
  parts.push('')

  // 条数报的是各段总数，不是这次取回来的条数：取回多少受 limit 和上面的
  // 压缩影响，报出来会让人以为库里就这么点。
  const totalOf = (list, key) => (typeof result[key] === 'number' ? result[key] : list.length)
  const section = (title, list, key, tagged) => {
    const all = totalOf(list, key)
    parts.push(`${title} · ${all} 条`)
    if (!all) {
      parts.push('（没有记录）')
      return
    }
    parts.push(clip(list).map((e) => renderEntry(e, tagged)).join('\n'))
    const more = note(list, all)
    if (more) parts.push(more)
  }

  section(`${inOther ? '① 本分类错题库' : '① 本卡错题库'}（${result.cardName}）`, result.own, 'ownTotal', false)
  parts.push('')
  section('② 其它错题（不挂在卡上的问题）', result.other, 'otherTotal', true)
  parts.push('')
  section('③ 跨卡查询（其余卡片）', result.cross, 'crossTotal', true)

  return parts.join('\n')
}
