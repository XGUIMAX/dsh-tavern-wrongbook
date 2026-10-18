// 隔离验收：在临时 data root 上跑一遍 host 半边的全链路。
// 用法：node verify/host.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 沙盒按真实布局搭：`<根>/profile-data/tavern/data` 是数据根，
// `<根>/profiles/tavern` 是 profile —— 安装自检要从数据根反推 profile 名，
// 布局不像的话那条推算就没被真正验证。
const ROOT = path.join(os.tmpdir(), 'dsh-wrongbook-sandbox')
fs.rmSync(ROOT, { recursive: true, force: true })
const SANDBOX = path.join(ROOT, 'profile-data', 'tavern', 'data')
const CARDS = path.join(SANDBOX, 'resources', 'cards')
const ORIG = path.join(SANDBOX, 'originals', 'cards')
fs.mkdirSync(CARDS, { recursive: true })
fs.mkdirSync(ORIG, { recursive: true })
fs.writeFileSync(path.join(CARDS, '测试卡A.json'), '{"name":"测试卡A"}', 'utf8')
fs.writeFileSync(path.join(CARDS, '测试卡A MVU版本.json'), '{"name":"A MVU"}', 'utf8')
fs.writeFileSync(path.join(CARDS, '测试卡B.json'), '{"name":"测试卡B"}', 'utf8')
fs.writeFileSync(path.join(ORIG, '测试卡A.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))

// profile 侧照抄真实那两处：dependencies 里一条 link:、dsh.profile.bundles 里一条名字。
const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url))
const PROFILE_DIR = path.join(ROOT, 'profiles', 'tavern')
const PROFILE_MODULES = path.join(PROFILE_DIR, 'node_modules')
fs.mkdirSync(PROFILE_MODULES, { recursive: true })
fs.writeFileSync(
  path.join(PROFILE_DIR, 'package.json'),
  JSON.stringify(
    {
      name: 'dsh-profile-tavern',
      private: true,
      dependencies: { 'dsh-tavern-wrongbook': `link:${PLUGIN_DIR.replace(/\\/g, '/')}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-tavern-wrongbook'] } },
      dshTavern: {
        source: path.join(ROOT, 'apps', 'dsh-tavern'),
        managedBundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
        managedDependencies: [],
      },
    },
    null,
    2,
  ),
  'utf8',
)

// 两种 skill 各造一个：用户的能写，内置的必须被拒。
fs.mkdirSync(path.join(SANDBOX, 'skills', 'my-notes', 'references'), { recursive: true })
fs.writeFileSync(
  path.join(SANDBOX, 'skills', 'my-notes', 'SKILL.md'),
  '---\nname: my-notes\ndescription: "验收用的用户 skill"\n---\n\n# my-notes\n',
  'utf8',
)
const BUILTIN_DIR = path.join(ROOT, 'apps', 'dsh-tavern', 'presets', 'tavern', 'skills')
fs.mkdirSync(path.join(BUILTIN_DIR, 'builtin-x', 'references'), { recursive: true })
fs.writeFileSync(
  path.join(BUILTIN_DIR, 'builtin-x', 'SKILL.md'),
  '---\nname: builtin-x\ndescription: "验收用的内置 skill"\n---\n\n# builtin-x\n',
  'utf8',
)
let linked = false
try {
  fs.symlinkSync(PLUGIN_DIR, path.join(PROFILE_MODULES, 'dsh-tavern-wrongbook'), 'junction')
  linked = true
} catch {
  /* Windows 上建不出链接就算了，那条断言会跳过 */
}

// 必须在 import 之前设置：host 半边在模块求值时解析数据根。
process.env.DSH_HOME = ROOT
process.env.DSH_TAVERN_DATA = SANDBOX
const mod = await import(new URL('../lib/index.js', import.meta.url).href)

const routes = []
const tools = []
const sections = []
const webServer = { register: (r) => (routes.push(r), () => {}) }
const toolsApi = { register: (d) => (tools.push(d), () => {}) }
const promptApi = { section: (s) => (sections.push(s), () => {}) }
/* 假的 Tavern 宿主服务。
 *
 * 错题库是按需取它的（`ctx.inject(['tavern'], …)`），所以沙盒要能把东西递进去 ——
 * 否则「注册剧情线变化通知」和「给底稿标脏」这两条路一行都跑不到，而它们正是
 * 装了 Tavern 之后才会发生的事。
 *
 * `getTurn` 读的是外面这个变量，测试里换掉它就能造各种那一轮的样子。 */
let fakeTurn = null
/* 往回读的那几轮、这次读的范围，以及让它失败的办法 —— 三样都由测试来换。 */
let fakeHistory = []
let fakeHistoryError = ''
const historyCalls = []
const timelineHandlers = []
/* 第 3 版的两样：这一轮请求的上下文，和卡工作版的版本号。 */
let fakeRequest = null
let fakeRequestError = ''
const requestCalls = []
let fakeCardRevision = 12
const cardRevisionCalls = []
const cardHandlers = []
let tavernInjected = false
const fakeTavern = {
  apiVersion: 3,
  getTurn: async () => fakeTurn,
  getHistory: async ({ from, to }) => {
    historyCalls.push({ from, to })
    if (fakeHistoryError) throw new Error(fakeHistoryError)
    return fakeHistory.filter((row) => row.turn >= from && row.turn <= to)
  },
  getRequestContext: async ({ gameId, turn }) => {
    requestCalls.push({ gameId, turn })
    if (fakeRequestError) throw new Error(fakeRequestError)
    return fakeRequest
  },
  cardRevision: async ({ card }) => {
    cardRevisionCalls.push({ card })
    return fakeCardRevision
  },
  onCardChanged: (handler) => {
    cardHandlers.push(handler)
    return () => {
      const at = cardHandlers.indexOf(handler)
      if (at >= 0) cardHandlers.splice(at, 1)
    }
  },
  onTimelineChanged: (handler) => {
    timelineHandlers.push(handler)
    return () => {
      const at = timelineHandlers.indexOf(handler)
      if (at >= 0) timelineHandlers.splice(at, 1)
    }
  },
}
const ctx = {
  // 服务按注入的方式挂在 ctx 上（插件用 `export const inject` 声明）。
  // `get` 故意拿不到东西：真实环境里它拿不到未注入的服务，而这正是工具
  // 少注册了半年的原因 —— 面板照常工作，模型侧空空如也。
  tools: toolsApi,
  systemPrompt: promptApi,
  get: () => undefined,
  inject: (deps, cb) => {
    const wantsTavern = Array.isArray(deps) && deps.includes('tavern')
    if (wantsTavern) tavernInjected = true
    return cb({
      webServer,
      tavern: wantsTavern ? fakeTavern : undefined,
      effect: (fn) => void fn(),
    })
  },
  effect: (fn) => void fn(),
}

const results = []
const check = (label, ok, extra) => results.push({ label, ok, extra })

check('name 导出', mod.name === 'dsh-tavern-wrongbook', mod.name)
check('apply 是函数', typeof mod.apply === 'function')
check(
  '声明了 tools 与 systemPrompt 注入',
  Array.isArray(mod.inject) && mod.inject.includes('tools') && mod.inject.includes('systemPrompt'),
  JSON.stringify(mod.inject),
)
mod.apply(ctx)
const toolMap = Object.fromEntries(tools.map((d) => [d.name, d]))
check('注册了 7 条路由', routes.length === 7, routes.map((r) => r.path).join(', '))
// 数字之外再钉住具体路径 —— 加路由时数字会对不上，但漏改期望列表就不会被这条挡住
for (const want of ['/dsh-wrongbook/state', '/dsh-wrongbook/avatar', '/dsh-wrongbook/list', '/dsh-wrongbook/scripts', '/dsh-wrongbook/skills', '/dsh-wrongbook/patch', '/dsh-wrongbook/action']) {
  check('路由存在 ' + want, routes.some((r) => r.path === want), want)
}
check('注册了 3 个工具', tools.length === 3, tools.map((d) => d.name).join(', '))

/* 文本文件不能带 BOM。
   PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会偷偷加一个，而 JSON.parse 见到就炸 ——
   表现是插件读自己的 package.json 失败、版本号变成空的。这条挡的是"手改一次文件就把它弄挂"。 */
for (const rel of ['package.json', 'client.js', 'lib/index.js', 'cordis.patch.yml']) {
  const buf = fs.readFileSync(path.join(PLUGIN_DIR, rel))
  check(
    `${rel} 不带 BOM`,
    !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `前 3 字节 ${buf.slice(0, 3).toString('hex')}`,
  )
}
check(
  'package.json 能被 JSON.parse 读回',
  (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8')).name === 'dsh-tavern-wrongbook'
    } catch {
      return false
    }
  })(),
)

/* 提示段：工具注册只解决「能用」，这一段解决「会用」 */
const promptSection = sections.find((s) => s.name === 'dsh-wrongbook')
check('注入了错题库提示段', !!promptSection, sections.map((s) => s.name).join(', '))
if (promptSection) {
  const promptText = promptSection.text()
  check('提示段给出三段检索顺序', promptText.includes('① 本分类 → ② 其它错题 → ③ 跨卡查询'))
  check('提示段要求归档后回报「已归档」', promptText.includes('已归档到错题库'))
  check('提示段要求回执加粗', promptText.includes('整句用') && promptText.includes('加粗'))
  check('提示段点名两个工具', promptText.includes('wrongbook_lookup') && promptText.includes('wrongbook_record'))
  check('提示段禁止再写进 md 文件', promptText.includes('不要再把错题写进 md'))
  check('提示段把转 MVU 纳入必查场景', promptText.includes('转 MVU 版'))
  check(
    '提示段点出脚本被转换清空后不会自己回来',
    promptText.includes('被转换清空之后不会自己回来'),
    promptText.includes('差异判定') ? 'ok' : '缺差异判定',
  )
  check('提示段顺序值不与别家撞车', promptSection.order === 5100, String(promptSection.order))

}

function fakeRes() {
  return {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(code, headers) {
      this.statusCode = code
      this.headers = headers || {}
      return this
    },
    end(chunk) {
      if (chunk) this.body += chunk
      return this
    },
  }
}

function fakeReq(method, url, body) {
  const handlers = {}
  const req = {
    method,
    url,
    on(event, fn) {
      ;(handlers[event] = handlers[event] || []).push(fn)
      return req
    },
  }
  setTimeout(() => {
    if (body !== undefined && handlers.data) handlers.data.forEach((fn) => fn(Buffer.from(JSON.stringify(body))))
    if (handlers.end) handlers.end.forEach((fn) => fn())
  }, 0)
  return req
}

async function call(routePath, method, body, query) {
  const route = routes.find((r) => r.path === routePath)
  if (!route) throw new Error(`route missing: ${routePath}`)
  const res = fakeRes()
  await route.handler(fakeReq(method, `${routePath}${query || ''}`, body), res)
  await new Promise((r) => setTimeout(r, 15))
  return { status: res.statusCode, headers: res.headers, body: res.body }
}

const state = async () => JSON.parse((await call('/dsh-wrongbook/state', 'GET')).body)
const action = async (payload) => JSON.parse((await call('/dsh-wrongbook/action', 'POST', payload)).body)

const s1 = await state()
const cardA = s1.cards.find((c) => c.key === 'cards/测试卡A.json')
const cardAmvu = s1.cards.find((c) => c.key === 'cards/测试卡A MVU版本.json')
check('state.ok', s1.ok === true)
check('分类 = 3 张卡 + 3 个其它分类', s1.cards.length === 6, String(s1.cards.length))
check('卡片组 3 个', s1.cards.filter((c) => c.group === 'card').length === 3, s1.cards.filter((c) => c.group === 'card').map((c) => c.name).join(','))
check('其它组 3 个', s1.cards.filter((c) => c.group === 'other').length === 3, s1.cards.filter((c) => c.group === 'other').map((c) => c.name).join(','))
check('预置了卡内故障分类', s1.cards.some((c) => c.group === 'other' && c.name === '卡内故障'))
check('预置了卡片更新器分类', s1.cards.some((c) => c.group === 'other' && c.name === '卡片更新器'))
check('通用分类归在其它组', (s1.cards.find((c) => c.key === s1.generalKey) || {}).group === 'other')
check('返回 scopes/statuses', Array.isArray(s1.scopes) && Array.isArray(s1.statuses))
check('返回 plugin 版本', typeof s1.plugin.version === 'string' && s1.plugin.version.length > 0, s1.plugin.version)
check('卡名取到', !!cardA && cardA.name === '测试卡A', cardA && cardA.name)
check('头像解析到原版卡目录', !!cardA && cardA.avatar.endsWith('测试卡A.png'), cardA && cardA.avatar)
check('MVU 版标记', !!cardAmvu && cardAmvu.kind === 'mvu', cardAmvu && cardAmvu.kind)
check('配对互指', !!cardA && cardA.pairKey === 'cards/测试卡A MVU版本.json', cardA && cardA.pairKey)
check('通用分类存在', s1.cards.some((c) => c.key === s1.generalKey))

const addA = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡A.json',
  entry: { title: '状态栏空白', symptom: 'M2 后留白', cause: '变量未初始化', scope: 'MVU', tags: 'MVU, 状态栏' },
})
check('addEntry 到卡A', addA.ok === true && !!addA.entry && addA.entry.id.startsWith('e_'), addA.entry && addA.entry.id)
check('标签按逗号切开', JSON.stringify(addA.entry.tags) === JSON.stringify(['MVU', '状态栏']), JSON.stringify(addA.entry.tags))

const addB = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '状态栏串台', scope: 'MVU', tags: '状态栏' },
})
check('addEntry 到卡B', addB.ok === true)

const lk = await action({ action: 'lookup', card: '测试卡A', query: '状态栏' })
check('① 本卡命中 1 条', lk.result.own.length === 1, JSON.stringify(lk.result.own.map((e) => e.title)))
check('② 跨卡命中 1 条', lk.result.cross.length === 1, JSON.stringify(lk.result.cross.map((e) => e.title)))
check('本卡命中确实是卡A 的', lk.result.own[0] && lk.result.own[0].cardKey === 'cards/测试卡A.json')
check('跨卡命中确实是别的卡的', lk.result.cross[0] && lk.result.cross[0].cardKey === 'cards/测试卡B.json')
check('卡名片段可解析', (await action({ action: 'lookup', card: '测试卡B', query: '状态栏' })).result.own.length === 1)
check('无关键词时列出全部', (await action({ action: 'lookup', card: '测试卡A' })).result.own.length === 1)

const text = (await toolMap['wrongbook_lookup'].execute({ card: '测试卡A', query: '状态栏' }, {})).text
const iOwn = text.indexOf('① 本卡错题库')
const iOther = text.indexOf('② 其它错题')
const iCross = text.indexOf('③ 跨卡查询')
check('工具输出含三段标记', iOwn >= 0 && iOther >= 0 && iCross >= 0, `${iOwn}/${iOther}/${iCross}`)
check('工具输出顺序：本卡 → 其它错题 → 跨卡', iOwn < iOther && iOther < iCross, `${iOwn} < ${iOther} < ${iCross}`)
check('工具输出含本卡标题', text.includes('状态栏空白'))
check('工具输出含跨卡卡片名', text.includes('测试卡B'))

check('wrongbook_record 落库', /已归档到错题库/.test((await toolMap['wrongbook_record'].execute({ card: '测试卡A', title: '图标错位' }, {})).text))
check('wrongbook_update 改状态', /fixed/.test((await toolMap['wrongbook_update'].execute({ id: addA.entry.id, status: 'fixed' }, {})).text))

const avatar = await call('/dsh-wrongbook/avatar', 'GET', undefined, '?card=cards%2F%E6%B5%8B%E8%AF%95%E5%8D%A1A.json')
check('头像路由 200', avatar.status === 200, String(avatar.status))
check('头像 content-type', avatar.headers['content-type'] === 'image/png', avatar.headers['content-type'])
check('缺图卡返回 404', (await call('/dsh-wrongbook/avatar', 'GET', undefined, '?card=cards%2F%E6%B5%8B%E8%AF%95%E5%8D%A1B.json')).status === 404)

const c1 = await action({ action: 'checkSelf' })
check('checkSelf 首次 = up-to-date', c1.plugin.verdict === 'up-to-date', c1.plugin.verdict)
const c2 = await action({ action: 'checkSelf' })
check('checkSelf 复检仍 = up-to-date', c2.plugin.verdict === 'up-to-date', c2.plugin.verdict)
check('checkSelf 记录历史', Array.isArray(c2.plugin.history) && c2.plugin.history.length >= 2, String(c2.plugin.history.length))

const copyRes = await action({ action: 'copyEntry', id: addA.entry.id, toCardKey: 'cards/测试卡A MVU版本.json' })
check('copyEntry 保留原条目', copyRes.ok === true && copyRes.keptSource === true)
check('复制后条目 +1', (await state()).entries.length === 4)
check('deleteEntry', (await action({ action: 'deleteEntry', id: copyRes.entry.id })).removed === 1)
check('renameCard', (await action({ action: 'renameCard', key: 'cards/测试卡B.json', name: '乙卡' })).card.name === '乙卡')
check('exportAll', JSON.parse((await action({ action: 'exportAll' })).json).entries.length === 3)
check('未知操作报错', (await action({ action: 'nope' })).ok === false)

check('data.json 落盘', fs.existsSync(path.join(SANDBOX, 'tools', 'wrongbook', 'data.json')))
check('selfcheck.json 落盘', fs.existsSync(path.join(SANDBOX, 'tools', 'wrongbook', 'selfcheck.json')))
const backupDir = path.join(SANDBOX, 'tools', 'wrongbook', 'backups')
check('写盘前产生备份', fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0)
check('通用分类可写', (await action({ action: 'addEntry', entry: { title: '整库通用坑' } })).entry.cardKey === s1.generalKey)
check('rescan 可用', (await action({ action: 'rescan' })).scanned === 3)

/* 「其它错题」这一组：分类可建可删，删分类不删记录 */
const nb = await action({ action: 'addBucket', name: '测试主题' })
check('addBucket 建出其它分类', nb.ok === true && nb.card.group === 'other', nb.card && nb.card.key)
check('addBucket 拒绝重名', (await action({ action: 'addBucket', name: '测试主题' })).ok === false)
check('addBucket 拒绝空名', (await action({ action: 'addBucket', name: '   ' })).ok === false)

const inBucket = await action({ action: 'addEntry', cardKey: nb.card.key, entry: { title: '主题里的坑' } })
check('往其它分类记条目', inBucket.ok === true && inBucket.entry.cardKey === nb.card.key)

const lkOther = await action({ action: 'lookup', card: '卡片更新器' })
check('lookup 认其它分类名', lkOther.ok === true && lkOther.result.cardKey === '__other_card-updater__', lkOther.result.cardKey)

const del2 = await action({ action: 'deleteBucket', key: nb.card.key })
check('deleteBucket 迁走记录而不是删掉', del2.ok === true && del2.moved === 1, JSON.stringify(del2))
check(
  '被删分类的条目落到通用',
  (await state()).entries.some((e) => e.title === '主题里的坑' && e.cardKey === s1.generalKey),
)
check('deleteBucket 拒绝删卡片分类', (await action({ action: 'deleteBucket', key: 'cards/测试卡A.json' })).ok === false)
check('deleteBucket 拒绝删兜底分类', (await action({ action: 'deleteBucket', key: s1.generalKey })).ok === false)

/* ================= 全量回归：归类、解析、自动建分类、三段检索 ================= */

const resolve = async (card) => (await action({ action: 'lookup', card })).result.cardKey
const groupOfKey = async (key) => {
  const found = (await state()).cards.find((c) => c.key === key)
  return found ? found.group : ''
}

/* 归类：写进去的条目必须落在指定分类下，不能串门 */
for (const target of [
  'cards/测试卡A.json',
  'cards/测试卡B.json',
  'cards/测试卡A MVU版本.json',
  '__other_card-cases__',
  '__other_card-updater__',
  s1.generalKey,
]) {
  const r = await action({ action: 'addEntry', cardKey: target, entry: { title: `归类 ${target}` } })
  check(`addEntry 落在 ${target}`, r.ok === true && r.entry.cardKey === target, r.entry ? r.entry.cardKey : r.error)
}
const knownKeys = (await state()).cards.map((c) => c.key)
const strayEntries = (await state()).entries.filter((e) => !knownKeys.includes(e.cardKey))
check('没有条目挂在已不存在的分类下', strayEntries.length === 0, strayEntries.map((e) => e.cardKey).join(','))

/* 卡名解析：精确优先；模糊只认同一张卡的版本，否则不猜 */
check('解析：完整相对路径', (await resolve('cards/测试卡B.json')) === 'cards/测试卡B.json')
check('解析：带扩展名的卡名', (await resolve('测试卡B.json')) === 'cards/测试卡B.json')
check('解析：精确卡名', (await resolve('测试卡B')) === 'cards/测试卡B.json')
check('解析：精确 MVU 卡名', (await resolve('测试卡A MVU版本')) === 'cards/测试卡A MVU版本.json')
check('解析：其它分类名', (await resolve('卡片更新器')) === '__other_card-updater__')
check('解析：新分类名', (await resolve('卡内故障')) === '__other_card-cases__')
check('解析：通用别名', (await resolve('通用')) === s1.generalKey)
check('解析：未归类别名', (await resolve('未归类')) === s1.generalKey)
check('解析：空输入', (await resolve('')) === s1.generalKey)
check('解析：没听说过的名字', (await resolve('完全不存在的名字')) === s1.generalKey)
check('解析：唯一模糊命中直接采用', (await resolve('测试卡A MVU版')) === 'cards/测试卡A MVU版本.json', await resolve('测试卡A MVU版'))
check('解析：命中多张卡时不猜', (await resolve('测试卡')) === s1.generalKey, await resolve('测试卡'))
check('解析：同一输入两次结果一致', (await resolve('测试卡A MVU')) === (await resolve('测试卡A MVU')))

/* 原版卡和它的 MVU 版是两个分类：对上两个就不许猜 */
const pair = (await action({ action: 'lookup', card: '卡A' })).result
check('解析：同一张卡的两个版本也不猜', pair.cardKey === s1.generalKey, pair.cardKey)
check(
  '解析：带回候选让人补全',
  pair.candidates.length === 2 && pair.candidates.includes('测试卡A MVU版本'),
  pair.candidates.join('、'),
)
const refused = await action({ action: 'addEntry', card: '卡A', entry: { title: '不该落进来' } })
check('多候选时 refuse 记录', refused.ok === false && /对上了 2 个分类/.test(refused.error || ''), refused.error)
const pairText = (await toolMap['wrongbook_lookup'].execute({ card: '卡A' }, {})).text
check('多候选时工具输出给出提示', pairText.includes('对上了 2 个分类') && pairText.includes('请写全名字'), (pairText.split('\n')[1] || '').trim())

/* 名字不认识时建分类，而不是静默落兜底 */
const madeUp = await action({ action: 'addEntry', card: '某个新插件', entry: { title: '新插件的问题' } })
check('陌生名字建出新分类', madeUp.ok === true && madeUp.created === '某个新插件', madeUp.created || madeUp.error)
check('新分类落在其它组', (await groupOfKey(madeUp.entry.cardKey)) === 'other', await groupOfKey(madeUp.entry.cardKey))
check('同名再记一次不重复建', (await action({ action: 'addEntry', card: '某个新插件', entry: { title: '第二条' } })).created === '')

const pathLike = await action({ action: 'addEntry', card: 'cards/不存在的卡.json', entry: { title: '路径式名字' } })
check('路径式陌生名字不建分类', pathLike.created === '' && pathLike.entry.cardKey === s1.generalKey, pathLike.entry.cardKey)
const explicitGeneral = await action({ action: 'addEntry', card: '通用', entry: { title: '显式兜底' } })
check('显式「通用」不建分类', explicitGeneral.created === '' && explicitGeneral.entry.cardKey === s1.generalKey)

/* 三段检索：每一段只装该装的东西 */
const tri = (await action({ action: 'lookup', card: '测试卡A', query: '归类' })).result
check('三段都是数组', Array.isArray(tri.own) && Array.isArray(tri.other) && Array.isArray(tri.cross))
check('own 只装本分类', tri.own.every((e) => e.cardKey === 'cards/测试卡A.json'), tri.own.map((e) => e.cardKey).join(','))
check('other 只装其它错题组', tri.other.every((e) => e.cardKey === s1.generalKey || e.cardKey.startsWith('__other_')), tri.other.map((e) => e.cardKey).join(','))
check('cross 只装卡片', tri.cross.every((e) => e.cardKey.startsWith('cards/')), tri.cross.map((e) => e.cardKey).join(','))
check('卡片视角 cardGroup=card', tri.cardGroup === 'card', tri.cardGroup)

const triOther = (await action({ action: 'lookup', card: '卡片更新器', query: '归类' })).result
check('其它视角：own 是它自己', triOther.own.every((e) => e.cardKey === '__other_card-updater__'), triOther.own.map((e) => e.cardKey).join(','))
check('其它视角：other 是其余其它错题', triOther.other.every((e) => e.cardKey === s1.generalKey || e.cardKey.startsWith('__other_')), triOther.other.map((e) => e.cardKey).join(','))
check('其它视角：cross 是卡片', triOther.cross.every((e) => e.cardKey.startsWith('cards/')), triOther.cross.map((e) => e.cardKey).join(','))
check('其它视角 cardGroup=other', triOther.cardGroup === 'other', triOther.cardGroup)

/* 无关键词时 ② ③ 要压缩，不能把 ① 淹掉 */
for (let i = 0; i < 10; i += 1) {
  await action({ action: 'addEntry', cardKey: '__other_card-cases__', entry: { title: `批量用例 ${i}` } })
}
const printed = (text) =>
  text
    .split('② 其它错题')[1]
    .split('③ 跨卡查询')[0]
    .split('\n')
    .filter((l) => /^- \[/.test(l.trim())).length

const wide = (await toolMap['wrongbook_lookup'].execute({ card: '测试卡A' }, {})).text
check('无关键词时 ② 只印前 8 条', printed(wide) === 8, String(printed(wide)))
check('压缩时说明总数', wide.includes('共 1'), wide.split('\n').filter((l) => l.includes('共 ')).join(' / '))

const narrow = (await toolMap['wrongbook_lookup'].execute({ card: '测试卡A', query: '批量用例' }, {})).text
check('带关键词时 ② 全列', printed(narrow) === 10, String(printed(narrow)))

/* 分段的截断必须各算各的：本分类的低分条目不能被跨卡的高分条目挤出名额 */
const bullies = []
for (let i = 0; i < 20; i += 1) bullies.push({ cardKey: '__other_card-cases__', title: `压制用例 ${i}` })
await action({ action: 'importEntries', json: JSON.stringify({ entries: bullies }) })
const squeezed = (await action({ action: 'lookup', card: 'cards/测试卡A.json', limit: 2 })).result
check('limit 很小也留得住本分类', squeezed.own.length >= 1, `own=${squeezed.own.length} other=${squeezed.other.length}`)
check('other 段被 limit 限制', squeezed.other.length === 2, String(squeezed.other.length))
check('各段带回真实总数', squeezed.otherTotal > squeezed.other.length, `other=${squeezed.other.length}/${squeezed.otherTotal}`)

/* 分类计数一次算完，结果要跟逐条数一致 */
const counted = await state()
const cardAView = counted.cards.find((c) => c.key === 'cards/测试卡A.json')
const manual = counted.entries.filter((e) => e.cardKey === 'cards/测试卡A.json').length
check('分类计数与实际条目数一致', cardAView.count.total === manual, `${cardAView.count.total} vs ${manual}`)
check(
  '分类计数按状态细分',
  cardAView.count.open + cardAView.count.watch + cardAView.count.fixed === cardAView.count.total,
  JSON.stringify(cardAView.count),
)

/* 每次写入都要留下自己那份备份：同毫秒撞名会静默覆盖掉其中一份 */
const beforeBackups = (await state()).backups.length
for (let i = 0; i < 3; i += 1) {
  await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: `备份计数 ${i}` } })
}
const afterBackups = (await state()).backups.length
check('三次连续写入留下三份备份', afterBackups === beforeBackups + 3, `${beforeBackups} → ${afterBackups}`)
const backupNames = (await state()).backups.map((b) => b.file)
check('备份文件名互不重复', new Set(backupNames).size === backupNames.length, String(backupNames.length))

/* 导入时名字对上多个分类：跳过并计数，不是整批失败 */
const ambiguous = await action({ action: 'importEntries', json: JSON.stringify({ entries: [{ cardKey: '卡A', title: '模棱两可' }] }) })
check('导入跳过模棱两可的条目并计数', ambiguous.ambiguous === 1 && ambiguous.added === 0, JSON.stringify(ambiguous))

/* 导入去重：同分类同标题算重，不同分类不算 */const dup = await action({
  action: 'importEntries',
  json: JSON.stringify({
    entries: [
      { cardKey: 'cards/测试卡A.json', title: '状态栏空白' },
      { cardKey: 'cards/测试卡B.json', title: '状态栏空白' },
    ],
  }),
})
check('同分类同标题算重复', dup.added === 1 && dup.skipped === 1, JSON.stringify(dup))

/* 搬运：目标分类要对，源分类要空 */
const moveSrc = await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: '搬运用例' } })
const moved = await action({ action: 'moveEntry', id: moveSrc.entry.id, toCardKey: 'cards/测试卡B.json' })
check('moveEntry 落到目标分类', moved.ok === true && moved.entry.cardKey === 'cards/测试卡B.json', moved.entry && moved.entry.cardKey)
check('moveEntry 不在原分类留副本', (await state()).entries.filter((e) => e.id === moveSrc.entry.id).length === 0)

/* 卡消失之后，分类留不留，取决于它下面有没有东西 */

const ghostPath = path.join(CARDS, '幽灵卡.json')
fs.writeFileSync(ghostPath, '{}', 'utf8')
check('新出现的卡会被扫出来', (await state()).cards.some((c) => c.key === 'cards/幽灵卡.json'))
fs.unlinkSync(ghostPath)
check('空记录的分类跟着卡一起消失', !(await state()).cards.some((c) => c.key === 'cards/幽灵卡.json'))

const keeperPath = path.join(CARDS, '留有记录的卡.json')
fs.writeFileSync(keeperPath, '{}', 'utf8')
await state()
await action({ action: 'addEntry', cardKey: 'cards/留有记录的卡.json', entry: { title: '这张卡上有结论' } })
fs.unlinkSync(keeperPath)
const keptView = await state()
const kept = keptView.cards.find((c) => c.key === 'cards/留有记录的卡.json')
check('有记录的分类标成已不在卡片目录', !!kept && kept.missing === true, kept ? String(kept.missing) : '分类没了')
check('记录没有跟着丢', keptView.entries.some((e) => e.cardKey === 'cards/留有记录的卡.json'))

const lifted = await action({ action: 'deleteBucket', key: 'cards/留有记录的卡.json' })
check('missing 的卡片分类允许手动删除', lifted.ok === true, lifted.error)
check(
  '手动删掉后记录迁到兜底',
  (await state()).entries.some((e) => e.title === '这张卡上有结论' && e.cardKey === s1.generalKey),
)
check('在册的卡片分类仍然拒绝删除', (await action({ action: 'deleteBucket', key: 'cards/测试卡A.json' })).ok === false)

/* 卡内脚本盘点 */

const scripted = {
  raw: {
    data: {
      extensions: {
        tavern_helper: {
          scripts: [
            { name: '外置状态栏', content: 'x'.repeat(50), enabled: true },
            { name: '某卡特化脚本', content: 'y'.repeat(500), enabled: false },
          ],
        },
        // 两条正则抢同一个占位符，其中一条还是停用的 —— 正是 C-06 那种坑的形态。
        regex_scripts: [
          { scriptName: '状态栏', findRegex: '/<StatusPlaceHolderImpl\\/>/g', replaceString: 'aaa', disabled: false, markdownOnly: true },
          { scriptName: '旧状态栏', findRegex: '/<StatusPlaceHolderImpl\\/>/g', replaceString: 'bbb', disabled: true },
          { scriptName: '对 AI 隐藏', findRegex: '/<pic>([\\s\\S]*?)<\\/pic>/g', replaceString: '', promptOnly: true },
        ],
        someUnknownExt: [1, 2, 3],
      },
      character_book: {
        entries: [
          { comment: '主线控制器', content: '' },
          { comment: '普通条目', content: 'json_patch 什么的' },
        ],
      },
    },
  },
}
fs.writeFileSync(path.join(CARDS, '带脚本的卡.json'), JSON.stringify(scripted), 'utf8')
// 卡脚本分两步取：先骨架（不解析卡内容），再按 key 拿那一张的详情。
const scanned = JSON.parse((await call('/dsh-wrongbook/scripts', 'GET')).body)
const cardDetail = async (key) =>
  JSON.parse((await call('/dsh-wrongbook/scripts', 'GET', undefined, `?card=${encodeURIComponent(key)}`)).body).card
const scriptedCard = await cardDetail('cards/带脚本的卡.json')
check('扫得到卡内脚本', !!scriptedCard && scriptedCard.scripts.length === 2, scriptedCard ? String(scriptedCard.scripts.length) : '没扫到这张卡')
check('外层 raw 包装被剥掉', !!scriptedCard && scriptedCard.scripts.length === 2, '少剥一层就会是 0')
check(
  '通用脚本不算特化',
  !!scriptedCard && scriptedCard.special.length === 1 && scriptedCard.special[0].name === '某卡特化脚本',
  scriptedCard ? scriptedCard.special.map((s) => s.name).join(',') : '',
)
check('停用状态读得出来', !!scriptedCard && scriptedCard.special[0].enabled === false)
check('控制器条目挑出来', !!scriptedCard && scriptedCard.controllers.includes('主线控制器'), scriptedCard ? scriptedCard.controllers.join(',') : '')
check('含 json_patch 的条目挑出来', !!scriptedCard && scriptedCard.patchEntries.includes('普通条目'), scriptedCard ? scriptedCard.patchEntries.join(',') : '')
/*
 * 正则脚本是卡里项数最多的一块，之前完全没盘点 —— "这张卡带了什么"只答了其中一部分。
 */
const regexCard = await cardDetail('cards/带脚本的卡.json')
check('盘点了正则脚本', (regexCard.regexes || []).length === 3, String((regexCard.regexes || []).length))
check(
  '正则条目报出名字与启停',
  (regexCard.regexes || []).every((r) => typeof r.name === 'string' && typeof r.disabled === 'boolean'),
  JSON.stringify((regexCard.regexes || [])[0] || null),
)
check('数出停用的正则', regexCard.regexDisabled === 1, String(regexCard.regexDisabled))
check(
  '报出抢同一占位符的正则',
  regexCard.regexClashes.length === 1 && regexCard.regexClashes[0].names.length === 2,
  JSON.stringify(regexCard.regexClashes),
)
check(
  '正则条目能读出占位符',
  (regexCard.regexes[0].markers || []).includes('<StatusPlaceHolderImpl/>'),
  JSON.stringify(regexCard.regexes[0].markers),
)
check(
  '正则条目能读出作用层',
  regexCard.regexes[0].where.includes('仅显示') && regexCard.regexes[2].where.includes('仅提示词'),
  regexCard.regexes.map((r) => r.where).join(' / '),
)
check(
  '列出不认识的扩展字段',
  regexCard.otherExtensions.some((o) => o.key === 'someUnknownExt' && o.items === 3),
  JSON.stringify(regexCard.otherExtensions),
)
check('没脚本的卡也照实返回', (await cardDetail(scanned.cards[0].key)).scripts.length === 0)
check('工具目录一并扫了', Array.isArray(scanned.tools), String(scanned.tools.length))

/* 备份的删除与清理 */
const bk = await action({ action: 'backupNow' })
check('backupNow 报告份数', bk.ok === true && bk.backups >= 1, String(bk.backups))
const list1 = (await state()).backups
check('备份列表带条目数', list1.length >= 1 && list1.every((b) => typeof b.entries === 'number'), JSON.stringify(list1.map((b) => b.entries)))
const del1 = await action({ action: 'deleteBackup', file: list1[0].file })
check('deleteBackup 生效', del1.ok === true && del1.backups === list1.length - 1, `${del1.backups} vs ${list1.length - 1}`)
check('deleteBackup 挡住路径穿越', (await action({ action: 'deleteBackup', file: '../../data.json' })).ok === false)
check('deleteBackup 报不存在的文件', (await action({ action: 'deleteBackup', file: 'nope.json' })).ok === false)

const prune = await action({ action: 'pruneBackups', keep: 2 })
check('pruneBackups 保留最近 N 份', prune.ok === true && prune.keep === 2 && prune.backups <= 2, JSON.stringify(prune))

/* 自定义备份目录 */
const defaultBackups = path.join(SANDBOX, 'tools', 'wrongbook', 'backups')
const customDir = path.join(SANDBOX, 'custom-backups')
const sd = await action({ action: 'setBackupDir', dir: customDir })
check('setBackupDir 建出并切到新目录', sd.ok === true && sd.custom === true && sd.backupDir === customDir, sd.backupDir || sd.error)
check('切换后 paths 指向新目录', (await state()).paths.backupDir === customDir)
await action({ action: 'backupNow' })
check(
  '手动备份写进了新目录',
  fs.existsSync(customDir) && fs.readdirSync(customDir).some((n) => n.endsWith('.json')),
  fs.existsSync(customDir) ? String(fs.readdirSync(customDir).length) : 'missing',
)
check('旧目录里的备份没被搬走', fs.readdirSync(defaultBackups).length > 0, String(fs.readdirSync(defaultBackups).length))
check('setBackupDir 拒绝文件路径', (await action({ action: 'setBackupDir', dir: path.join(CARDS, '测试卡A.json') })).ok === false)
check('setBackupDir 拒绝写不进去的路径', (await action({ action: 'setBackupDir', dir: path.join(CARDS, '测试卡A.json', 'sub') })).ok === false)
const reset = await action({ action: 'setBackupDir', dir: '' })
check('setBackupDir 空值恢复默认', reset.ok === true && reset.custom === false && reset.backupDir === defaultBackups, reset.backupDir)
check('恢复默认后 paths 跟着回来', (await state()).paths.backupDir === defaultBackups)

/* 自定义目录里混着别人的 JSON：不能进列表，更不能被清理带走 */
const foreignDir = path.join(SANDBOX, 'foreign')
fs.mkdirSync(foreignDir, { recursive: true })
const foreignFile = path.join(foreignDir, '别人的备份.json')
fs.writeFileSync(foreignFile, '{"mine":false}', 'utf8')
await action({ action: 'setBackupDir', dir: foreignDir })
await action({ action: 'backupNow' })
const mixed = (await state()).backups
check(
  '只列本插件写的备份',
  mixed.length === 1 && mixed.every((b) => /^\d+__.*__data\.json$/.test(b.file)),
  mixed.map((b) => b.file).join(','),
)
await action({ action: 'pruneBackups', keep: 1 })
check('清理不动别人的文件', fs.existsSync(foreignFile))
check('deleteBackup 拒绝外来文件名', (await action({ action: 'deleteBackup', file: '别人的备份.json' })).ok === false)

/* 安装自检：profile 侧那两处都造好了，应当判定为正常 */

const install = (await state()).install
check('安装自检有结论', !!install && typeof install.ok === 'boolean', JSON.stringify(install && install.ok))
check('profile 目录从数据根反推得出来', install.profileDir === PROFILE_DIR, install.profileDir)
check('认得出 dependencies 里那条 link', install.declared === true)
check('认得出 dsh.profile.bundles 里那条名字', install.bundled === true)
check('链接状态有结论', typeof install.linked === 'boolean', String(install.linked))
check('两处都在时判定为正常', install.ok === (install.linked === true), `ok=${install.ok} linked=${install.linked}`)
check('正常时不啰嗦补回命令', install.ok ? install.fix === '' : install.fix.length > 0)

/* 把 bundles 里那条名字拿掉：应当立刻判定为缺失，并给出补回命令 */
const manifestPath = path.join(PROFILE_DIR, 'package.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base']
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
const broken = (await state()).install
check('少一条名字就判定为缺失', broken.ok === false && broken.bundled === false, `ok=${broken.ok} bundled=${broken.bundled}`)
check('缺失时给出补回命令', broken.fix.includes('dsh plugin add'), (broken.fix.split('\n')[1] || '').trim())
check(
  '补回命令点名两处该补的地方',
  broken.fix.includes('dsh.profile.bundles') && broken.fix.includes('dependencies'),
  broken.fix.split('\n').slice(-2).join(' / '),
)
manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-tavern-wrongbook']
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
check('补回后重新判定为正常', (await state()).install.bundled === true)
/* 自检里要能看出「磁盘上的版本」和「进程里跑的版本」是不是同一个 */

const selfNow = (await state()).plugin
check(
  '自检带上运行版本',
  typeof selfNow.runningVersion === 'string' && selfNow.runningVersion.length > 0,
  String(selfNow.runningVersion),
)
check(
  '刚加载完时磁盘与运行一致，不报需要重启',
  selfNow.runningVersion === selfNow.version && selfNow.stale === false,
  `disk=${selfNow.version} run=${selfNow.runningVersion} stale=${selfNow.stale}`,
)

/* 回流到 Skill：只写用户自己的，内置的当场说清不给写 */

const skillList = JSON.parse((await call('/dsh-wrongbook/skills', 'GET')).body)
check('列出用户 skill', skillList.skills.some((s) => s.name === 'my-notes' && !s.builtin), skillList.skills.map((s) => s.name).join(','))
check('内置 skill 也列出来并带标记', skillList.skills.some((s) => s.name === 'builtin-x' && s.builtin))
check('用户 skill 排在前面', skillList.skills[0] && skillList.skills[0].builtin === false, skillList.skills[0] && skillList.skills[0].name)
check('认得出 skill 的 references', skillList.skills.find((s) => s.name === 'my-notes').references.includes('x') === false)

const firstEntry = (await state()).entries[0]
const firstId = firstEntry.id
const reflux1 = await action({ action: 'refluxToSkill', skill: 'my-notes', ids: [firstId] })
check('回流写入一条', reflux1.ok === true && reflux1.written === 1, JSON.stringify(reflux1).slice(0, 120))
const refluxText = fs.readFileSync(reflux1.file, 'utf8')
check('写出来的是条目正文', refluxText.includes(`### ${firstEntry.title}`), refluxText.slice(0, 60))
check('带上分类与状态', refluxText.includes('错题库回流：') && refluxText.includes('·'), refluxText.split('\n').find((l) => l.startsWith('>')) || '')
check('有现象就写进现象', !firstEntry.symptom || refluxText.includes(firstEntry.symptom))
check('有修法就写进修法', !firstEntry.fix || refluxText.includes(firstEntry.fix))
check('开头写清哪些段落会被保护', refluxText.includes('手工改过的段落不会再被覆盖'))

const reflux2 = await action({ action: 'refluxToSkill', skill: 'my-notes', ids: [firstId] })
check('同名条目不会写第二遍', reflux2.written === 0 && reflux2.skipped === 1, JSON.stringify(reflux2))

const toBuiltin = await action({ action: 'refluxToSkill', skill: 'builtin-x', ids: [firstId] })
check('内置 skill 拒绝回流', toBuiltin.ok === false, toBuiltin.error)
check('拒绝时说清了为什么', /程序目录|更新会整份覆盖/.test(toBuiltin.error || ''), toBuiltin.error)
check('内置 skill 目录没被写脏', !fs.existsSync(path.join(BUILTIN_DIR, 'builtin-x', 'references', '错题库回流.md')))

check(
  '目标文件不许跑出 skill 目录',
  (await action({ action: 'refluxToSkill', skill: 'my-notes', file: '../../x.md', ids: [firstId] })).ok === false,
)
check('skill 名不许带路径', (await action({ action: 'refluxToSkill', skill: '../evil', ids: [firstId] })).ok === false)
check('没选条目时拒绝', (await action({ action: 'refluxToSkill', skill: 'my-notes', ids: [] })).ok === false)

const made = await action({ action: 'createSkill', name: 'new-notes' })
check('能建出新 skill', made.ok === true && fs.existsSync(path.join(SANDBOX, 'skills', 'new-notes', 'SKILL.md')))
check(
  '新 skill 默认引用了回流文件',
  fs.readFileSync(path.join(SANDBOX, 'skills', 'new-notes', 'SKILL.md'), 'utf8').includes('references/错题库回流.md'),
)
check('重名拒绝', (await action({ action: 'createSkill', name: 'new-notes' })).ok === false)
check('名字不合法拒绝', (await action({ action: 'createSkill', name: 'Bad Name' })).ok === false)
check('新 skill 立刻能作为回流目标', (await action({ action: 'refluxToSkill', skill: 'new-notes', ids: [firstId] })).ok === true)

/* 简介决定 Agent 会不会自动加载这个 skill，默认值不能是一句空话 */
const defaultSkillText = fs.readFileSync(path.join(SANDBOX, 'skills', 'new-notes', 'SKILL.md'), 'utf8')
check('默认简介写的是什么时候读它', defaultSkillText.includes('排查同类问题、动手之前先读一遍'), defaultSkillText.split('\n')[2])
check('默认简介不重复 skill 名', !defaultSkillText.includes('new-notes：'), defaultSkillText.split('\n')[2])

await action({ action: 'createSkill', name: 'with-desc', description: '排查某类问题时读一遍' })
const withDesc = fs.readFileSync(path.join(SANDBOX, 'skills', 'with-desc', 'SKILL.md'), 'utf8')
check('自己写的简介会进 frontmatter', withDesc.includes('description: "排查某类问题时读一遍"'), withDesc.split('\n')[2])

/* 删 skill：先整份备份再删，内置的拒绝 */
const removed = await action({ action: 'deleteSkill', name: 'with-desc' })
check('能删用户 skill', removed.ok === true && !fs.existsSync(path.join(SANDBOX, 'skills', 'with-desc')), removed.error)
check('删前留了整份备份', !!removed.backup && fs.existsSync(path.join(removed.backup, 'SKILL.md')), removed.backup)
check(
  '备份落在数据目录下，不跟着 skill 一起没',
  String(removed.backup).startsWith(path.join(SANDBOX, 'tools', 'wrongbook')),
  String(removed.backup),
)
check('删完就不在列表里了', !(await call('/dsh-wrongbook/skills', 'GET')).body.includes('with-desc'))
check('内置 skill 不许删', (await action({ action: 'deleteSkill', name: 'builtin-x' })).ok === false)
check('内置目录没被动过', fs.existsSync(path.join(BUILTIN_DIR, 'builtin-x', 'SKILL.md')))
check('删不存在的拒绝', (await action({ action: 'deleteSkill', name: 'nope-nope' })).ok === false)
check('名字带路径拒绝', (await action({ action: 'deleteSkill', name: '../evil' })).ok === false)

/* 自动回流：配了目标之后，记错题就顺手同步一次 */

const autoOn = await action({ action: 'setAutoReflux', skill: 'new-notes' })
check(
  '能打开自动同步',
  autoOn.ok === true && autoOn.autoReflux && autoOn.autoReflux.skill === 'new-notes',
  JSON.stringify(autoOn.autoReflux),
)
check('打开时先同步一次', typeof autoOn.synced === 'number', String(autoOn.synced))

const refluxFile = path.join(SANDBOX, 'skills', 'new-notes', 'references', '错题库回流.md')
check('打开时就写出了文件', fs.existsSync(refluxFile))
// 按标题逐条核对，别去数 `### ` —— 条目正文里也可能有小标题，数出来的不是条数。
const titles = (await state()).entries.map((e) => e.title)
const textAtOn = fs.readFileSync(refluxFile, 'utf8')
const missing = titles.filter((t) => !textAtOn.includes(`### ${t}`))
check('打开时把已有条目一次补齐', missing.length === 0, missing.length ? `缺 ${missing.length} 条：${missing[0]}` : `${titles.length} 条都在`)

await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: '自动同步用例' } })
check('记一条新错题就自动跟进去', fs.readFileSync(refluxFile, 'utf8').includes('自动同步用例'), '没写进去')
check('自动同步没把文件头冲掉', fs.readFileSync(refluxFile, 'utf8').includes('dsh-wrongbook 从错题库回流而来'), '文件头没了')

const withAuto = await state()
check(
  'state 带上自动同步目标',
  !!withAuto.config.autoReflux && withAuto.config.autoReflux.skill === 'new-notes',
  JSON.stringify(withAuto.config.autoReflux),
)
check(
  'state 带上上次同步结果',
  !!withAuto.config.autoRefluxLast && withAuto.config.autoRefluxLast.written >= 1,
  JSON.stringify(withAuto.config.autoRefluxLast),
)
check('上次同步记录里没有错误', withAuto.config.autoRefluxLast.error === '', withAuto.config.autoRefluxLast.error)
check('内置 skill 不能设为自动目标', (await action({ action: 'setAutoReflux', skill: 'builtin-x' })).ok === false)

const autoOff = await action({ action: 'setAutoReflux', skill: '' })
check('能关掉自动同步', autoOff.ok === true && autoOff.autoReflux === null, JSON.stringify(autoOff.autoReflux))

/*
 * 归档回执：工具返回的那段文本是 Agent 唯一的信息来源。
 * 它必须带全「写到哪、写入多少、对方现在共多少」—— 少一项，回复里就少一项。
 */
const recordTool = tools.find((d) => d.name === 'wrongbook_record')
check('注册了 wrongbook_record', !!recordTool)

await action({ action: 'setAutoReflux', skill: 'new-notes' })
const withSync = await recordTool.execute({ card: 'new-notes', title: '回执断言用例（开同步）', scope: '工具链' })
check('回执写明已归档', withSync.text.includes('已归档到错题库：'), withSync.text.slice(0, 40))
/*
 * 卡脚本分两步拿：先骨架（卡清单 + 工具，不解析内容），再带 ?card= 逐张要详情。
 * 分两步是为了让面板立刻有东西可看 —— 骨架要是也解析了，就等于没分。
 */
const head = JSON.parse((await call('/dsh-wrongbook/scripts', 'GET')).body)
check('骨架返回卡清单', Array.isArray(head.cards) && head.cards.length >= 1, `cards=${(head.cards || []).length}`)
check('骨架里的卡只有文件信息', !('scripts' in head.cards[0]), Object.keys(head.cards[0] || {}).join(','))
check('骨架也带上工具脚本', Array.isArray(head.tools), `tools=${(head.tools || []).length}`)

const oneKey = head.cards[0].key
const one = JSON.parse((await call('/dsh-wrongbook/scripts', 'GET', undefined, `?card=${encodeURIComponent(oneKey)}`)).body)
check('带 card 就只回那一张', !!one.card && one.card.key === oneKey, JSON.stringify(one.card && one.card.key))
check('单张才带解析结果', Array.isArray(one.card.scripts), Array.isArray(one.card.scripts) ? 'ok' : 'missing')
check(
  '卡名不许跑出目录',
  (await call('/dsh-wrongbook/scripts', 'GET', undefined, '?card=..%2Fescape.json')).status === 500,
)
check('回执带上分类名', withSync.text.includes('「new-notes」分类'), withSync.text.slice(0, 60))
check('回执带上条目标题', withSync.text.includes('《回执断言用例（开同步）》'), withSync.text.slice(0, 70))
check('回执报出写进了哪个 skill', /已写进 skill「new-notes」/.test(withSync.text), withSync.text.split('\n')[1])
check('回执报出本次条数', /本次新增 \d+ 条/.test(withSync.text), withSync.text.split('\n')[1])
check('回执报出对方现在共多少', /现在共 \d+ 条/.test(withSync.text), withSync.text.split('\n')[1])
check(
  '渲染出来的就是这段原文',
  recordTool.output.render({}, withSync)[0].text === withSync.text,
  recordTool.output.render({}, withSync)[0].text.slice(0, 50),
)

await action({ action: 'setAutoReflux', skill: '' })
const noSync = await recordTool.execute({ card: 'new-notes', title: '回执断言用例（没开同步）', scope: '工具链' })
check('没开同步时回执明说', noSync.text.includes('自动同步没开'), noSync.text.split('\n')[1])
check('没开同步时仍报出归档结果', noSync.text.includes('已归档到错题库：'), noSync.text.slice(0, 40))
/*
 * 回流现在会跟着错题库更新，但有个前提：只改「我们自己写的、且没人动过」的段落。
 * 手工改过的一律绕开 —— 否则每次同步都会把你改的东西顶掉，改一次白改一次。
 */
await action({ action: 'createSkill', name: 'sync-notes', description: '同步行为用' })
const mk = async (title, symptom) =>
  (await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title, symptom } })).entry
const sA = await mk('同步甲', '现象甲')
const sB = await mk('同步乙', '现象乙')
const syncIds = [sA.id, sB.id]
const syncFile = path.join(SANDBOX, 'skills', 'sync-notes', 'references', '错题库回流.md')

const first = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: syncIds })
check('首次回流写入两条', first.written === 2 && first.total === 2, JSON.stringify(first).slice(0, 80))
check('每条下面盖了标记', (fs.readFileSync(syncFile, 'utf8').match(/^<!-- wrongbook:/gm) || []).length === 2, String((fs.readFileSync(syncFile, 'utf8').match(/^<!-- wrongbook:/gm) || []).length))

const again = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: syncIds })
check('内容没变就一个字不动', again.written === 0 && again.updated === 0 && again.unchanged === 2, JSON.stringify(again).slice(0, 80))
check('字节数也没变', again.bytes === first.bytes, `${first.bytes} → ${again.bytes}`)

await action({ action: 'updateEntry', id: sA.id, patch: { status: 'fixed' } })
const bumped = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: syncIds })
check('方案改了状态，段落原地更新', bumped.updated === 1 && bumped.written === 0, JSON.stringify(bumped).slice(0, 80))
check('文件里的状态跟着变', /已修复/.test(fs.readFileSync(syncFile, 'utf8')), '')

fs.writeFileSync(syncFile, fs.readFileSync(syncFile, 'utf8').replace('现象甲', '现象甲（我改的）'), 'utf8')
await action({ action: 'updateEntry', id: sA.id, patch: { status: 'watch' } })
const guarded = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: syncIds })
check('手工改过的段落被跳过', guarded.editedByHand === 1 && guarded.updated === 0, JSON.stringify(guarded).slice(0, 80))
check('手工改的内容还在', fs.readFileSync(syncFile, 'utf8').includes('现象甲（我改的）'))
check('同文件里没被改的那条照常更新', fs.readFileSync(syncFile, 'utf8').includes('同步乙'))

// 条目正文里出现 ### 小标题时，不能把段落切坏（修法里贴 markdown 很常见）
const sC = await mk('带小标题的条目', '现象里有个小标题：\n\n### 小标题\n\n这是正文')
const withSub = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: [sC.id] })
check(
  '正文含 ### 也不影响条数统计',
  withSub.written === 1 && withSub.total === 3,
  `written=${withSub.written} updated=${withSub.updated} unchanged=${withSub.unchanged} total=${withSub.total}`,
)
const settle = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: [sC.id] })
check('正文含 ### 的条目也能识别成"没变"', settle.unchanged === 1 && settle.written === 0, JSON.stringify(settle).slice(0, 80))

// 条目正文里写到"标记本身长什么样"时（讲格式的时候必然会写），不能凭空多出一条假条目
const sD = await mk(
  '讲标记格式的条目',
  '示例：\n\n```\n### 标题\n<!-- wrongbook:<id>|<status>|<hash> -->\n> 错题库回流：…\n```\n\n正文里的这一行只是举例。',
)
const withFake = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: [sD.id] })
check(
  '正文里的示例标记不会变出假条目',
  withFake.written === 1 && withFake.total === 4,
  `written=${withFake.written} total=${withFake.total}`,
)
const settleD = await action({ action: 'refluxToSkill', skill: 'sync-notes', ids: [sD.id] })
check('含示例标记的条目也能识别成"没变"', settleD.unchanged === 1, JSON.stringify(settleD).slice(0, 80))
const sizeBefore = fs.readFileSync(refluxFile, 'utf8').length
await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: '关掉之后不该再出现' } })
check(
  '关掉之后记错题就不再回写',
  fs.readFileSync(refluxFile, 'utf8').length === sizeBefore &&
    !fs.readFileSync(refluxFile, 'utf8').includes('关掉之后不该再出现'),
)

await action({ action: 'setBackupDir', dir: '' })

/* 目录浏览：面板里「选择文件夹」的后台 */
const listDrivesRes = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, '?path=')).body)
check('空路径列出驱动器', listDrivesRes.drives === true && Array.isArray(listDrivesRes.entries), String(listDrivesRes.entries.length))
const listSandbox = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, `?path=${encodeURIComponent(SANDBOX)}`)).body)
check(
  '列出子目录',
  ['resources', 'tools'].every((n) => listSandbox.entries.some((e) => e.name === n)),
  listSandbox.entries.map((e) => e.name).join(','),
)
check('只列目录不列文件', listSandbox.entries.every((e) => e.type === 'directory'))
check('给出上一级', listSandbox.parent === path.dirname(SANDBOX), listSandbox.parent)
const listCards = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, `?path=${encodeURIComponent(CARDS)}`)).body)
check('叶子目录没有子项', listCards.entries.length === 0, String(listCards.entries.length))
const listFile = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, `?path=${encodeURIComponent(path.join(CARDS, '测试卡A.json'))}`)).body)
check('路径指到文件时报错', !!listFile.error, listFile.error)
const listDriveOnly = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, '?path=C%3A')).body)
check('只写盘符也能解析成根', listDriveOnly.dir === 'C:\\', listDriveOnly.dir)

/*
 * 这里原本有一条实跑 openBackupDir 的用例，已经删掉。
 *
 * 它是整个套件里唯一有外部副作用的检查：真的会弹出一个资源管理器窗口，而窗口
 * 指向的目录一旦在事后被删（沙盒会），资源管理器就弹「位置不可用」——比不测还烦。
 * 中途试过两种补丁（保留沙盒、把目标挪到沙盒外的常驻目录），但窗口本身仍然会留下，
 * 这类检查就不该待在自动化里。
 *
 * 「打开目录」属于人工验证项：重启后在面板上点一下，看窗口落到哪儿、面板上回的
 * via 是哪一级回退。脚本只管到动作被正确分派为止，不碰外部程序。
 */

/* ------------------------------------------------------------ Tavern 插件接口
 *
 * 装了 Tavern 之后错题库多两个入口：游玩时记录（消息按钮）、游玩时查看（侧栏面板）。
 * 面板和按钮是界面上的东西，肉眼扫一眼就够；但「哪条底稿在什么条件下被标脏」是纯逻辑，
 * 光看日志看不出对不对 —— 这里把宿主那一侧真跑一遍，全走 action，不直接调内部函数。
 */
check('按需取到了 Tavern 接口', tavernInjected === true)
check('注册了剧情线变化通知', timelineHandlers.length === 1, String(timelineHandlers.length))

const fireTimeline = (event) => {
  for (const handler of [...timelineHandlers]) handler(event)
}
const staleOf = async (id) => {
  const snap = await state()
  const found = snap.entries.find((e) => e.id === id)
  return found ? found.stale || null : undefined
}

// 抓一轮底稿：captureTurn 是「记进错题库」按钮在宿主侧的落点。
fakeTurn = {
  gameId: 'game-1',
  turn: 7,
  textVersion: 'tv-1',
  text: '第七轮的正文，玩家在这里发现了不对劲的地方。',
  card: { id: 'cards/测试卡A.json', name: '测试卡A' },
}
const cap = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check('captureTurn 交回正文', cap.ok === true && String(cap.turn.text).includes('第七轮'), cap.turn && cap.turn.text)
check('captureTurn 交回正文版本号', cap.turn.textVersion === 'tv-1', cap.turn.textVersion)

/*
 * 上文：往回抓两轮，单独交回，让「证据」那一栏自己带上上下文。
 *
 * 结算漂移、状态栏连着错几轮这类问题，单看当轮说不清「从哪一轮开始不对」。但它
 * 只是加分项 —— 读不到就不读，记录本身不能因此失败（老版本 Tavern 连这个接口都没有）。
 */
fakeHistory = [
  { turn: 5, input: '继续', text: '第五轮的正文。' },
  { turn: 6, input: '继续', text: '第六轮的正文。' },
  { turn: 7, input: '继续', text: '第七轮的正文。' },
]
historyCalls.length = 0
const withBefore = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '往回读的范围是这一轮之前的两轮',
  historyCalls.length === 1 && historyCalls[0].from === 5 && historyCalls[0].to === 6,
  JSON.stringify(historyCalls),
)
check(
  '上文按轮次交回',
  Array.isArray(withBefore.before) && withBefore.before.length === 2 && withBefore.before[0].turn === 5,
  JSON.stringify(withBefore.before),
)
check(
  '上文只带正文，不带玩家输入',
  withBefore.before[0].text === '第五轮的正文。' && withBefore.before[0].input === undefined,
  JSON.stringify(withBefore.before[0]),
)

// 第 1 轮之前没有东西可读：连读都不去读。
historyCalls.length = 0
fakeTurn = { gameId: 'game-1', turn: 1, textVersion: 'tv-1', text: '开场白。', card: { id: 'cards/测试卡A.json', name: '测试卡A' } }
const atFirst = await action({ action: 'captureTurn', gameId: 'game-1', turn: 1 })
check('第一轮不去读上文', historyCalls.length === 0, String(historyCalls.length))
check('第一轮的上文是空的', Array.isArray(atFirst.before) && atFirst.before.length === 0)

// 读上文失败：底稿照旧，只是少一栏。
fakeTurn = {
  gameId: 'game-1',
  turn: 7,
  textVersion: 'tv-1',
  text: '第七轮的正文，玩家在这里发现了不对劲的地方。',
  card: { id: 'cards/测试卡A.json', name: '测试卡A' },
}
fakeHistoryError = '读不了'
const brokenCapture = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '抓不到上文也照样交回底稿',
  brokenCapture.ok === true && String(brokenCapture.turn.text).includes('第七轮'),
  JSON.stringify(brokenCapture),
)
check('失败时上文留空，不留半条', Array.isArray(brokenCapture.before) && brokenCapture.before.length === 0)
fakeHistoryError = ''

// 第 1 版的 Tavern 没有 getHistory：同样不调用、不报错。
const savedHistory = fakeTavern.getHistory
delete fakeTavern.getHistory
const oldApi = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '老版本 Tavern 上照样能记录',
  oldApi.ok === true && Array.isArray(oldApi.before) && oldApi.before.length === 0,
  JSON.stringify(oldApi && oldApi.before),
)
fakeTavern.getHistory = savedHistory

/*
 * 第 3 版：抓底稿时把「这一轮请求实际用掉的上下文」和卡的版本号一起带上。
 *
 * 两样都是给事后判断用的：世界书该触发没触发，正文里看不出来；结论是对哪一版
 * 卡得出的，卡名也认不出。老版本 Tavern 上都没有，记录照旧能记。
 */
fakeRequest = {
  turn: 7,
  input: '我推门进去。',
  sections: [
    { slot: 'activeWorldbook', origin: 'tavern:world-book', text: '世界书正文'.repeat(10) },
    { slot: 'currentStateProjection', origin: 'plugin', plugin: 'memory', name: 'recent', text: '记忆摘要' },
  ],
}
requestCalls.length = 0
const withContext = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '第 3 版：读了这一轮的请求上下文',
  requestCalls.length === 1 && requestCalls[0].turn === 7,
  JSON.stringify(requestCalls),
)
check(
  '上下文按段列出位置与来源',
  /【本轮请求上下文】/.test(withContext.request) && /\[activeWorldbook\] tavern:world-book/.test(withContext.request),
  withContext.request,
)
check('插件段落带上插件名与段名', /plugin:memory\/recent/.test(withContext.request), withContext.request)
check(
  '上下文只写字数，不搬正文',
  !String(withContext.request).includes('世界书正文'),
  withContext.request,
)
check('第 3 版：交回卡的版本号', withContext.cardRevision === 12, String(withContext.cardRevision))

// 段数太多：只列前 24 段，其余说明还剩几段 —— 摘要不能变成第二个几万字的正文。
const savedRequest = fakeRequest
fakeRequest = {
  turn: 7,
  input: '',
  sections: Array.from({ length: 30 }, () => ({ slot: 'activeWorldbook', origin: 'tavern:world-book', text: 'x' })),
}
const manySections = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '段数过多时只列前 24 段并说明剩余',
  String(manySections.request).split('\n').length === 26 && /另有 6 段/.test(manySections.request),
  manySections.request,
)
fakeRequest = savedRequest

// 读上下文失败：记录照旧，只是少一栏。
fakeRequestError = '读不了'
const brokenContext = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '上下文读不到时照常交回底稿',
  brokenContext.ok === true && brokenContext.request === '',
  JSON.stringify(brokenContext.request),
)
fakeRequestError = ''

// 第 2 版的 Tavern 没有这两个接口：两栏都空着，不报错。
const savedRequestContext = fakeTavern.getRequestContext
const savedCardRevisionApi = fakeTavern.cardRevision
fakeTavern.apiVersion = 2
delete fakeTavern.getRequestContext
delete fakeTavern.cardRevision
const v2Capture = await action({ action: 'captureTurn', gameId: 'game-1', turn: 7 })
check(
  '第 2 版 Tavern：不读上下文，底稿照旧',
  v2Capture.ok === true && v2Capture.request === '' && v2Capture.cardRevision === null,
  JSON.stringify({ request: v2Capture.request, revision: v2Capture.cardRevision }),
)
fakeTavern.getRequestContext = savedRequestContext
fakeTavern.cardRevision = savedCardRevisionApi
fakeTavern.apiVersion = 3

// 卡版本进 source：读回来还在，非法值不写。
const revEntry = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡A.json',
  entry: { title: '带卡版本的条目', source: { gameId: 'game-1', turn: 7, cardRevision: 12 } },
})
check(
  '来源里保留卡版本',
  revEntry.entry.source && revEntry.entry.source.cardRevision === 12,
  JSON.stringify(revEntry.entry.source),
)
const badRev = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡A.json',
  entry: { title: '非法卡版本', source: { gameId: 'game-1', turn: 7, cardRevision: -1 } },
})
check(
  '负的卡版本不写进来源',
  badRev.entry.source && badRev.entry.source.cardRevision === undefined,
  JSON.stringify(badRev.entry.source),
)

// 改卡通知：注册了，触发时不抛错（真正的重扫在 300ms 去抖之后，这里只钉住接线）。
check('第 3 版：注册了改卡通知', cardHandlers.length === 1, String(cardHandlers.length))
let cardChangeThrew = null
try {
  for (const handler of [...cardHandlers]) handler({ card: 'cards/测试卡A.json', revision: 3 })
} catch (e) {
  cardChangeThrew = e
}
check('改卡通知触发不抛错', cardChangeThrew === null, cardChangeThrew && cardChangeThrew.message)

const draft = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡A.json',
  entry: {
    title: '第 7 轮：第七轮的正文…',
    symptom: cap.turn.text,
    refs: `第 ${cap.turn.turn} 轮 · ${cap.turn.gameId}`,
    status: 'open',
    source: { gameId: cap.turn.gameId, turn: cap.turn.turn, textVersion: cap.turn.textVersion },
  },
})
const idDraft = draft.entry.id
check(
  '底稿存下了结构化来源',
  draft.entry.source && draft.entry.source.turn === 7 && draft.entry.source.gameId === 'game-1',
  JSON.stringify(draft.entry.source),
)
check('刚抓的底稿没有被标脏', !draft.entry.stale, JSON.stringify(draft.entry.stale))

// ① 回退到它那一轮
fireTimeline({ gameId: 'game-1', kind: 'rollback', turn: 7 })
let st = await staleOf(idDraft)
check('回退到来源轮次：标脏', st && st.kind === 'rollback', JSON.stringify(st))

// ② 撤销回退：轮次又读得到了，标记该自己消失
fireTimeline({ gameId: 'game-1', kind: 'undo-rollback', turn: 7 })
st = await staleOf(idDraft)
check('撤销回退：回退造成的标记自动清掉', st === null, JSON.stringify(st))

// ③ 回退到更早的轮次，第 7 轮同样读不到了
fireTimeline({ gameId: 'game-1', kind: 'rollback', turn: 3 })
st = await staleOf(idDraft)
check('回退到更早的轮次：同样标脏', st && st.kind === 'rollback', JSON.stringify(st))

// ④ 重新生成：轮次还在、正文换了 —— 和回退是两种不同的失效
fireTimeline({ gameId: 'game-1', kind: 'regenerate', turn: 7 })
st = await staleOf(idDraft)
check('重新生成来源轮次：标脏', st && st.kind === 'regenerate', JSON.stringify(st))

// ⑤ 撤销回退不该顺手清掉它：这不是回退造成的
fireTimeline({ gameId: 'game-1', kind: 'undo-rollback' })
st = await staleOf(idDraft)
check('撤销回退不动「重新生成」的标记', st && st.kind === 'regenerate', JSON.stringify(st))

// ⑥ 编辑正文
fireTimeline({ gameId: 'game-1', kind: 'edit', turn: 7 })
st = await staleOf(idDraft)
check('编辑来源轮次：标记改成 edit', st && st.kind === 'edit', JSON.stringify(st))

// ⑦⑧⑨⑩ 四种"与我无关"
fireTimeline({ gameId: 'game-1', kind: 'regenerate', turn: 2 })
st = await staleOf(idDraft)
check('重新生成别的轮次：不受影响', st && st.kind === 'edit', JSON.stringify(st))

fireTimeline({ gameId: 'game-2', kind: 'rollback', turn: 7 })
st = await staleOf(idDraft)
check('别的局回退：不受影响', st && st.kind === 'edit', JSON.stringify(st))

fireTimeline({ gameId: 'game-1', kind: 'fork', fromGameId: 'game-0' })
st = await staleOf(idDraft)
check('分叉：原局底稿不动', st && st.kind === 'edit', JSON.stringify(st))

fireTimeline({ gameId: 'game-1', kind: 'brand-new-kind', turn: 7 })
st = await staleOf(idDraft)
check('不认识的 kind：按接口约定忽略', st && st.kind === 'edit', JSON.stringify(st))

// ⑪ 没带轮次：拿不到更细的粒度，退化成按整局标
fireTimeline({ gameId: 'game-1', kind: 'rollback' })
st = await staleOf(idDraft)
check('回退没给轮次：按整局标且 turn 记 null', st && st.kind === 'rollback' && st.turn === null, JSON.stringify(st))

// ⑫ 标脏是自动的，"这条还算不算数"只能人判 —— 给一条手动清的路
const cleared = await action({ action: 'clearStale', id: idDraft })
check('手工清除标记', cleared.ok === true && !cleared.entry.stale, JSON.stringify(cleared.entry.stale))
st = await staleOf(idDraft)
check('清除之后读回来确实是空的', st === null, JSON.stringify(st))

const clearMissing = await action({ action: 'clearStale', id: 'e_not_there' })
check(
  '清除不存在的条目：报错而不是静默成功',
  clearMissing.ok === false && String(clearMissing.error).includes('未找到条目'),
  clearMissing.error,
)

// ⑬ 老条目：那时只写了人读的 refs，没有结构化来源 —— 永远不该被标脏
const legacy = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '没有来源的老条目', refs: '第 7 轮 · game-1' },
})
check('没有 source 时该字段是 null（不是缺省）', legacy.entry.source === null, JSON.stringify(legacy.entry.source))
check('没有 stale 时该字段是 null', legacy.entry.stale === null, JSON.stringify(legacy.entry.stale))
fireTimeline({ gameId: 'game-1', kind: 'rollback', turn: 7 })
const legacyBack = (await state()).entries.find((e) => e.id === legacy.entry.id)
check('没有来源的老条目不会被标脏', !!legacyBack && !legacyBack.stale, JSON.stringify(legacyBack && legacyBack.stale))

// ⑭ 来源写残了：当作没有来源，而不是留个半截对象
const partial = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '来源写残了', source: { turn: 3 } },
})
check('gameId 缺失：来源被丢弃', partial.entry.source === null, JSON.stringify(partial.entry.source))
const partial2 = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '轮次不是数', source: { gameId: 'game-1', turn: 'x' } },
})
check('turn 不是数：来源被丢弃', partial2.entry.source === null, JSON.stringify(partial2.entry.source))
const partial3 = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '轮次是 null', source: { gameId: 'game-1', turn: null } },
})
check(
  'turn 是 null：来源被丢弃（Number(null) 会把它变成第 0 轮）',
  partial3.entry.source === null,
  JSON.stringify(partial3.entry.source),
)

/* 标记从磁盘读回来时也要保住"没带轮次"。它是合法状态（宿主没给精确轮次时
   就按整局标），一旦被读成 0，重启之后面板就会说"第 0 轮被回退了"。 */
const staleNull = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '没带轮次的标脏', stale: { kind: 'rollback', turn: null, at: '2026-10-09T10:00:00.000Z' } },
})
check(
  '标脏的 null 轮次不会被读成第 0 轮',
  !!staleNull.entry.stale && staleNull.entry.stale.turn === null,
  JSON.stringify(staleNull.entry.stale),
)

// 宿主事件里 turn 写成 null（而不只是缺席）时，同样该退化成按整局标
fireTimeline({ gameId: 'game-1', kind: 'rollback', turn: null })
st = await staleOf(idDraft)
check('事件里 turn 是 null：也按整局标，不当第 0 轮', st && st.turn === null, JSON.stringify(st))

// ⑮ 标脏得落盘：不是在内存里飘着
const persisted = (await state()).entries.find((e) => e.id === idDraft)
check(
  '标脏挂在数据里（重读一次还在）',
  !!persisted && !!persisted.stale && persisted.stale.kind === 'rollback',
  JSON.stringify(persisted && persisted.stale),
)
const dbFile = (await state()).paths.dbFile
const onDisk = JSON.parse(fs.readFileSync(dbFile, 'utf8'))
const diskEntry = onDisk.entries.find((e) => e.id === idDraft)
check(
  '标脏写进了 data.json',
  !!diskEntry && !!diskEntry.stale && diskEntry.stale.kind === 'rollback',
  JSON.stringify(diskEntry && diskEntry.stale),
)
check(
  '来源也写进了 data.json',
  !!diskEntry && !!diskEntry.source && diskEntry.source.turn === 7 && diskEntry.source.textVersion === 'tv-1',
  JSON.stringify(diskEntry && diskEntry.source),
)

let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra !== undefined ? `  [${r.extra}]` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} passed`)
// 沙盒用完即删：这里没有任何检查会打开外部程序，所以不会留下指着被删目录的窗口。
fs.rmSync(SANDBOX, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
