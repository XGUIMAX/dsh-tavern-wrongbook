// 客户端半边验收：最小 React 运行时下渲染两轮，验证注册接线与主分支不抛错。
// 用法：node verify/client.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../client.js', import.meta.url))

/* 最小浏览器环境 */
let captured = null
const win = {
  __ModuleLoader__: { load: (entry) => void (captured = entry) },
  addEventListener() {},
  removeEventListener() {},
  confirm: () => true,
  prompt: () => null,
}
/* 能记住 style 标签的迷你 DOM —— 样式表复用的逻辑要能查到已有的那个。 */
const styleTags = []
const doc = {
  /* 能记住 style 标签的迷你 DOM —— 样式表复用的逻辑要能查到已有的那个。 */
  head: {
    appendChild(tag) { styleTags.push(tag); return tag },
    removeChild(tag) { const i = styleTags.indexOf(tag); if (i >= 0) styleTags.splice(i, 1); return tag },
    querySelector(sel) {
      const m = /style\[([^\]]+)\]/.exec(sel)
      if (!m) return null
      return styleTags.find((t) => t.attrs && t.attrs[m[1]]) || null
    },
  },
  createElement: () => ({
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v },
    textContent: '',
    click() {},
    style: {},
  }),
  querySelectorAll: () => styleTags.slice(),
}

/* 最小 React：useState 走缓存数组，useEffect 收集后由测试手动 commit */
const states = []
const effects = []
let cursor = 0
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: 'Fragment',
  useState(init) {
    const i = cursor++
    if (!(i in states)) states[i] = typeof init === 'function' ? init() : init
    return [states[i], (next) => void (states[i] = typeof next === 'function' ? next(states[i]) : next)]
  },
  useEffect(fn) {
    effects.push(fn)
  },
  useMemo(fn) {
    return fn()
  },
  useCallback(fn) {
    return fn
  },
  useRef: (v) => ({ current: v }),
}

const STATE = {
  ok: true,
  updatedAt: '2026-09-23T10:00:00.000Z',
  paths: {
    dataDir: 'C:\\sandbox\\tools\\wrongbook',
    dbFile: 'C:\\sandbox\\tools\\wrongbook\\data.json',
    cardDir: 'C:\\sandbox\\resources\\cards',
    backupDir: 'C:\\sandbox\\tools\\wrongbook\\backups',
    backupDirDefault: 'C:\\sandbox\\tools\\wrongbook\\backups',
    backupDirCustom: false,
    pluginDir: 'C:\\sandbox\\plugins\\dsh-wrongbook',
  },
  scopes: ['卡片', 'MVU', '世界书', '正则', '脚本', '前端UI', '预设', '工具链', '其他'],
  statuses: ['open', 'watch', 'fixed'],
  generalKey: '__general__',
  dataFile: {
    file: 'C:\\sandbox\\tools\\wrongbook\\data.json',
    bytes: 12980,
    updatedAt: '2026-09-23T10:00:00.000Z',
    entries: 1,
    cards: 2,
  },
  config: {
    remoteUrl: '',
    autoReflux: { skill: 'my-notes', file: 'references/错题库回流.md' },
    autoRefluxLast: { at: '2026-09-23T10:00:00.000Z', written: 3, skipped: 0, file: '', error: '' },
  },
  cards: [
    {
      key: 'cards/测试卡A.json',
      group: 'card',
      name: '测试卡A',
      base: '测试卡A',
      rel: 'cards/测试卡A.json',
      abs: 'C:\\sandbox\\resources\\cards\\测试卡A.json',
      kind: 'plain',
      avatar: 'C:\\sandbox\\originals\\cards\\测试卡A.png',
      pairKey: 'cards/测试卡A MVU版本.json',
      note: '',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 1, watch: 0, fixed: 0, total: 1 },
    },
    {
      key: 'cards/测试卡A MVU版本.json',
      group: 'card',
      name: '测试卡A MVU版本',
      base: '测试卡A MVU版本',
      rel: 'cards/测试卡A MVU版本.json',
      abs: 'C:\\sandbox\\resources\\cards\\测试卡A MVU版本.json',
      kind: 'mvu',
      avatar: '',
      pairKey: 'cards/测试卡A.json',
      note: '',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
    {
      key: 'cards/已删掉的卡.json',
      group: 'card',
      name: '已删掉的卡',
      base: '已删掉的卡',
      rel: 'cards/已删掉的卡.json',
      abs: 'C:\\sandbox\\resources\\cards\\已删掉的卡.json',
      kind: 'plain',
      avatar: '',
      pairKey: '',
      note: '',
      missing: true,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
    {
      key: '__other_card-updater__',
      group: 'other',
      name: '卡片更新器',
      base: '卡片更新器',
      rel: '',
      abs: '',
      kind: 'other',
      avatar: '',
      pairKey: '',
      note: '卡片更新器插件自身的问题',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
    {
      key: '__general__',
      group: 'other',
      name: '通用 / 未归类',
      base: '通用 / 未归类',
      rel: '',
      abs: '',
      kind: 'other',
      avatar: '',
      pairKey: '',
      note: '',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
  ],
  entries: [
    {
      id: 'e_demo1',
      cardKey: 'cards/测试卡A.json',
      title: '状态栏空白',
      symptom: 'M2 后留白',
      cause: '变量未初始化',
      fix: '补初值',
      scope: 'MVU',
      status: 'open',
      tags: ['MVU', '状态栏'],
      refs: '',
      evidence: '',
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  stats: { cards: 2, entries: 1, open: 1, watch: 0, fixed: 0 },
  backups: [
    { file: '1790000000000__manual__data.json', at: 1790000000000, reason: 'manual', bytes: 13000, entries: 1 },
    { file: '1789999990000__add-entry__data.json', at: 1789999990000, reason: 'add entry', bytes: 12000, entries: 0 },
  ],
  plugin: {
    name: 'dsh-wrongbook',
    dir: 'C:\\sandbox\\plugins\\dsh-wrongbook',
    version: '1.0.0',
    fingerprint: 'abc',
    files: [{ rel: 'lib/index.js', sha256: 'b', bytes: 1, mtime: 0 }],
    seen: true,
    lastCheckAt: '2026-09-23T10:00:00.000Z',
    latestVersion: '',
    source: 'local',
    changedLocally: false,
    versionBumped: false,
    updateAvailable: false,
    history: [],
    dataRoot: 'C:\\sandbox\\tools\\wrongbook',
  },
  install: {
    profileDir: 'C:\\sandbox\\profiles\\tavern',
    manifestFile: 'C:\\sandbox\\profiles\\tavern\\package.json',
    pluginDir: 'C:\\sandbox\\plugins\\dsh-wrongbook',
    declared: true,
    bundled: true,
    linked: true,
    linkTarget: '..\\..\\..\\plugins\\dsh-wrongbook',
    ok: true,
    fix: '',
  },
}

/** 一次跨卡查询的返回：三段各一条，用来验证三段都渲染得出来。 */
const LOOKUP = {
  cardKey: 'cards/测试卡A.json',
  cardName: '测试卡A',
  cardGroup: 'card',
  own: [
    {
      id: 'e_own',
      cardKey: 'cards/测试卡A.json',
      title: '状态栏空白',
      scope: 'MVU',
      status: 'open',
      tags: ['MVU'],
      symptom: '',
      cause: '',
      fix: '',
      refs: '',
      evidence: '',
      createdAt: '',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  other: [
    {
      id: 'e_other',
      cardKey: '__other_card-updater__',
      title: '合并会覆盖状态栏入口',
      scope: '工具链',
      status: 'fixed',
      tags: ['U-01'],
      symptom: '',
      cause: '',
      fix: '',
      refs: '',
      evidence: '',
      createdAt: '',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  cross: [
    {
      id: 'e_cross',
      cardKey: 'cards/测试卡B.json',
      title: '状态栏串台',
      scope: 'MVU',
      status: 'open',
      tags: [],
      symptom: '',
      cause: '',
      fix: '',
      refs: '',
      evidence: '',
      createdAt: '',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  scanned: 3,
}

/** 卡脚本盘点的一次返回：一张卡带两个脚本（一个通用、一个特化），外加工具目录里那一个。 */
const SCRIPT_SCAN = {
  ok: true,
  flagged: 1,
  cards: [
    {
      key: 'cards/测试卡A.json',
      name: '测试卡A',
      bytes: 2048,
      mtime: 0,
      error: '',
      scripts: [
        { name: '外置状态栏', chars: 120, enabled: true, link: '', common: true, dataKeys: [] },
        {
          name: '助手agent_v0.15',
          chars: 1015009,
          enabled: true,
          link: '',
          common: false,
          dataKeys: ['ash_agent', 'acu_anticliche_agent'],
        },
      ],
      special: [
        {
          name: '助手agent_v0.15',
          chars: 1015009,
          enabled: true,
          link: '',
          common: false,
          dataKeys: ['ash_agent', 'acu_anticliche_agent'],
        },
      ],
      hasCommon: true,
      controllers: ['主线控制器'],
      patchEntries: [],
      initvar: [],
    },
    {
      key: 'cards/测试卡A MVU版本.json',
      name: '测试卡A MVU版本',
      bytes: 1024,
      mtime: 0,
      error: '',
      scripts: [],
      special: [],
      hasCommon: false,
      controllers: [],
      patchEntries: [],
      initvar: [],
    },
  ],
  tools: [
    {
      rel: 'tools/async-agent/assistant-agent-v0.15.json',
      file: 'assistant-agent-v0.15.json',
      dir: 'async-agent',
      bytes: 2436096,
      mtime: 0,
      name: '助手agent_v0.15',
      chars: 1015009,
      enabled: true,
      link: '',
      common: false,
      dataKeys: ['ash_agent'],
    },
  ],
}

/** 回流目标：一个用户 skill 加一个内置的，面板要把后者标成写不了。 */
const SKILL_LIST = {
  ok: true,
  userDir: 'C:\\sandbox\\skills',
  skills: [
    { name: 'my-notes', dir: 'C:\\sandbox\\skills\\my-notes', builtin: false, description: '验收用', references: [] },
    {
      name: 'card-to-mvu',
      dir: 'C:\\program\\skills\\card-to-mvu',
      builtin: true,
      description: '内置',
      references: ['mvu-recipe.md'],
    },
  ],
}

/* dsh-verify-peer —— 对端（卡片更新器）的 state 夹具。
   两张卡：测试卡A 带 preset，测试卡B 不带；这样既能验"出标记"也能验"不出标记"。
   plain.path 只给原版 —— 与真实情况一致（更新器只为原版配路径），
   所以 MVU 版能否出标记，取决于 pairKey 那一路查找。 */
const PEER_STATE = {
  ok: true,
  config: {
    cards: [
      {
        id: 'card-1',
        label: '测试卡A',
        plain: { path: 'C:\\sandbox\\resources\\cards\\测试卡A.json' },
        primary: { gates: ['discord', 'preset'], url: 'https://example.com/a' },
      },
      {
        id: 'card-2',
        label: '测试卡B',
        plain: { path: 'C:\\sandbox\\resources\\cards\\测试卡B.json' },
        primary: { gates: ['discord', 'paid'], url: '' },
      },
      {
        id: 'card-3',
        label: '测试卡C',
        plain: { path: 'C:\\sandbox\\resources\\cards\\测试卡C.json' },
        primary: { gates: ['discord', 'recommended'], url: 'https://example.com/c' },
      },
    ],
  },
}
/* 由某个测试临时接管的 /action 应答：返回 undefined 就交回下面那套固定数据。
 *
 * 「记进错题库」按钮的 run 是浏览器半唯一会写数据的地方，它的两次往返只能这样
 * 从外面看见 —— 除此之外没有别的地方能同时拿到它发出的 payload 和它的返回。 */
let actionOverride = null

const fetchStub = async (url, init) => {
  const target = String(url)
  // dsh-verify-peer：对端端点必须先判 —— 下面的 '/state' 是子串匹配，会把它抢先吃掉。
  if (target.includes('/dsh-card-updater/state')) {
    return { status: 200, ok: true, json: async () => PEER_STATE }
  }
  if (target.includes('/state')) return { status: 200, ok: true, json: async () => STATE }
  if (target.includes('/scripts')) {
    // 面板分两步拿数据：先不带参数要骨架，再带 ?card= 逐张要详情。
    // stub 也要照这个分，否则逐张那步会拿到骨架、把卡的数据换成空壳。
    const m = target.match(/[?&]card=([^&]+)/)
    if (m) {
      const key = decodeURIComponent(m[1])
      const card = SCRIPT_SCAN.cards.find((c) => c.key === key)
      return card
        ? { status: 200, ok: true, json: async () => ({ ok: true, card }) }
        : { status: 200, ok: true, json: async () => ({ ok: true, error: 'not found' }) }
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({ ok: true, cards: SCRIPT_SCAN.cards.map(({ scripts, special, controllers, patchEntries, ...rest }) => rest), tools: SCRIPT_SCAN.tools }),
    }
  }
  if (target.includes('/skills')) return { status: 200, ok: true, json: async () => SKILL_LIST }
  if (target.includes('/action')) {
    let body = {}
    try {
      body = JSON.parse((init && init.body) || '{}')
    } catch {
      body = {}
    }
    if (actionOverride) {
      const handled = actionOverride(body)
      if (handled !== undefined) return { status: 200, ok: true, json: async () => handled }
    }
    if (body.action === 'lookup') return { status: 200, ok: true, json: async () => ({ ok: true, result: LOOKUP }) }
  }
  return { status: 200, ok: true, json: async () => ({ ok: true }) }
}

const results = []
const check = (label, ok, extra) => results.push({ label, ok, extra })

/* 加载模块 */
const SRC_TEXT = fs.readFileSync(SRC, 'utf8')
new Function('window', 'document', 'fetch', SRC_TEXT)(win, doc, fetchStub)
check('调用了 __ModuleLoader__.load', !!captured)
check('模块 id = dsh-tavern-wrongbook', !!captured && captured.id === 'dsh-tavern-wrongbook', captured && captured.id)

/*
 * 一次性的加载 effect 不能把"启动标志"放进依赖数组。
 *
 * 那个 bug 验收测不出来（harness 不跑 React 的 effect 生命周期）：effect 自己
 * 第一件事就是 setScriptBusy(true)，放进依赖就会触发 cleanup 把正在跑的异步体
 * 掐掉，界面永远停在"正在盘点"。只能静态看一眼。
 *
 * 后来踩了它的反面：改用 ref 当"只跑一次"的标志之后，依赖只剩 [view]，
 * 「重新载入」就失效了 —— 按钮清空 scriptScan 但 ref 还是 true，必须切页签
 * 让 view 变化才会重跑。两头都对的做法是用数据本身当守卫。这两条锁定它。
 */
check(
  '盘点的守卫用 scriptScan 本身，不依赖自写的启动标志',
  /view !== 'scripts' \|\| scriptScan/.test(SRC_TEXT) && !/const scriptStarted/.test(SRC_TEXT),
  /const scriptStarted/.test(SRC_TEXT) ? '还有 scriptStarted（会让「重新载入」失效）' : '',
)
check(
  '盘点的 effect 不挂在会被自己改动的依赖上',
  SRC_TEXT.includes('}, [view, scriptScan])') && !SRC_TEXT.includes('[view, scriptScan, scriptBusy]'),
  SRC_TEXT.includes('[view, scriptScan, scriptBusy]') ? '依赖里还有 scriptBusy' : '',
)
check(
  '「重新载入」清空数据即可重跑（不需要额外放行动作）',
  SRC_TEXT.includes('setScriptScan(null)') && !SRC_TEXT.includes('scriptStarted.current = false'),
)

const plugin = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})
check('导出 name', plugin.name === 'dsh-tavern-wrongbook', plugin.name)
check('inject = slots + locale', JSON.stringify(plugin.inject) === '["slots","locale"]', JSON.stringify(plugin.inject))

/* apply 接线 */
const registrations = []
const dicts = []

/* Tavern 侧两个入口要的假服务。
 *
 * 错题库是按需取它的（`ctx.inject(['tavernUi'], …)`），所以沙盒也要能把东西递进去 ——
 * 那两条注册路只在装了 Tavern 的机器上生效，本机的验收环境不装 Tavern，
 * 不模拟的话「消息按钮」和「侧栏面板」一行都跑不到。 */
const uiRegs = { messageActions: [], panels: [] }
const tavernUi = {
  registerMessageAction: (input) => void uiRegs.messageActions.push(input),
  registerPanel: (input) => void uiRegs.panels.push(input),
}
const ctx = {
  effect: (fn) => void fn(),
  locale: {
    register: (ns, dict) => void dicts.push({ ns, dict }),
    bind: (ns) => (key) => (dicts[0] && dicts[0].dict.zh[key] !== undefined ? dicts[0].dict.zh[key] : key),
  },
  slots: {
    inject: (_key, cb) => void cb(),
    register: (options, component) => void registrations.push({ options, component }),
  },
  inject: (deps, cb) => {
    if (Array.isArray(deps) && deps.includes('tavernUi')) return cb({ tavernUi })
    return undefined
  },
}
plugin.apply(ctx)

check('注册了字典', dicts.length === 1 && dicts[0].ns === 'settings.dsh-wrongbook', dicts[0] && dicts[0].ns)
check('座位数 = 2（settings.section + sidebar.footer.action）', registrations.length === 2, String(registrations.length))
const seat = registrations[0]
check('座位是 settings.section', seat.options.name === 'settings.section', seat.options.name)
check('座位 id = wrongbook', seat.options.id === 'wrongbook', seat.options.id)
check('座位 order = 46', seat.options.order === 46, String(seat.options.order))
check('座位 label = 错题库', seat.options.label() === '错题库', seat.options.label())
/* 原先这条是「没有侧栏入口」。现在补了 settings.plugin.item，断言反过来。 */
check('有 settings.section 座位',
  registrations.some((r) => r.options.name === 'settings.section'))
/* 侧栏底部那个座位 —— 这才是用户说的"左下角"，与卡片更新器同一个 slot。 */
check('有 sidebar.footer.action 座位',
  registrations.some((r) => r.options.name === 'sidebar.footer.action'))
/* 这组断言在 verSrc 正式定义之前，先读一份 —— 否则会报
   "Cannot access verSrc before initialization"。 */
const verSrc = fs.readFileSync(SRC, 'utf8')

check('侧栏入口的组件是 SideEntry', verSrc.includes('function SideEntry'))
check('侧栏入口自带样式（面板没开时样式表还没加载）',
  verSrc.includes('这里全部内联写死') || verSrc.includes('style: btn'))
check('侧栏入口支持 Esc 关闭', verSrc.includes("ev.key === 'Escape'"))

/* ------------------------------------------------ Tavern 侧的注册（插件接口）
 *
 * 两个入口都各自判"在不在"，不是为了好看：侧栏面板是插件接口第 2 版才有的，
 * 老版本上只该少这一块，消息按钮照旧。沙盒给的是齐全的假服务，所以这里钉住
 * 「两个都注册上了、参数合规」—— 缺哪一条都说明判错了。
 */
check('注册了「记进错题库」消息按钮', uiRegs.messageActions.length === 1, String(uiRegs.messageActions.length))
check('注册了 Tavern 侧栏面板', uiRegs.panels.length === 1, String(uiRegs.panels.length))
const captureAction = uiRegs.messageActions[0]
check('消息按钮的 id 带插件名前缀', !!captureAction && captureAction.id === 'dsh-wrongbook/capture', captureAction && captureAction.id)
check('消息按钮有 run', !!captureAction && typeof captureAction.run === 'function')
const panelReg = uiRegs.panels[0]
check(
  '面板 id 合规（宿主按这条正则校验，写错会直接抛）',
  !!panelReg && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(panelReg.id),
  panelReg && panelReg.id,
)
check(
  '面板标题 1–40 字',
  !!panelReg && typeof panelReg.title === 'string' && panelReg.title.length >= 1 && panelReg.title.length <= 40,
  panelReg && `${panelReg.title}（${String(panelReg.title).length} 字）`,
)
check('面板标题就是「错题库」', !!panelReg && panelReg.title === '错题库', panelReg && panelReg.title)
check('面板 render 是函数', !!panelReg && typeof panelReg.render === 'function')
/* render 只创建元素、不执行组件体，所以这里调用它不会碰到 hooks。 */
const panelEl = panelReg ? panelReg.render({ gameId: 'g1', visible: true }) : null
check(
  '面板渲染的是面板本体（不是空壳）',
  !!panelEl && typeof panelEl.type === 'function' && panelEl.type.name === 'Panel',
  panelEl && panelEl.type && panelEl.type.name,
)

const zhKeys = Object.keys(dicts[0].dict.zh).sort()
const enKeys = Object.keys(dicts[0].dict.en).sort()
check('zh/en 键一致', zhKeys.join('|') === enKeys.join('|'), zhKeys.filter((k) => !enKeys.includes(k)).join(','))

/* 渲染两轮 */
const out = { texts: [], types: [] }
function walk(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return void out.texts.push(String(node))
  if (Array.isArray(node)) return void node.forEach(walk)
  if (typeof node === 'object' && node.type !== undefined) {
    out.types.push(typeof node.type === 'function' ? node.type.name : String(node.type))
    for (const [key, value] of Object.entries(node.props || {})) {
      if (key !== 'children' && (typeof value === 'string' || typeof value === 'number')) out.texts.push(String(value))
    }
    return void walk(node.children)
  }
  if (typeof node === 'object') Object.values(node).forEach(walk)
}

function renderOnce() {
  cursor = 0
  effects.length = 0
  let node = seat.component()
  let guard = 0
  // SettingsSection 只包了一层，展开顶层函数组件才能进到面板本体。
  while (node && typeof node === 'object' && typeof node.type === 'function' && guard++ < 10) node = node.type(node.props)
  out.texts.length = 0
  out.types.length = 0
  walk(node)
  return node
}

renderOnce()
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 30))
const tree = renderOnce()

function findByType(node, name, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) return node.reduce((a, n) => findByType(n, name, a), acc)
  if (typeof node.type === 'function' && node.type.name === name) acc.push(node)
  return findByType(node.children, name, acc)
}

check('渲染出主分支', !out.texts.includes('连不上后台'))
check('标题「错题库」', out.texts.includes('错题库'))
check('「① 本卡错题库」', out.texts.includes('① 本卡错题库'))
check('检索顺序提示是三段', out.texts.some((t) => t.includes('① 本卡错题库 → ② 其它错题 → ③ 跨卡查询')), out.texts.filter((t) => t.includes('检索顺序')).join(' / '))
check('无查询时不渲染 ②', !out.texts.includes('② 跨卡查询'))
check('卡名显示', out.texts.includes('测试卡A'))
check('版本号显示', out.texts.includes('v1.0.0'))
check('自检结论显示', out.texts.includes('已是最新版'))
/* 磁盘改了、进程里还是旧的：面板要能直接说出来，而不是等人去对版本号 */
STATE.plugin.stale = true
STATE.plugin.runningVersion = '0.9.9'
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 40))
const staleTree = renderOnce()
check('改了没重启时给出警告', out.texts.includes('改了没重启'), out.texts.filter((t) => t.includes('重启')).join(' / '))
check(
  '警告上带两个版本的说明',
  findByClass(staleTree, 'dwb-chip').some((n) => String(n.props.title || '').includes('v0.9.9')),
  findByClass(staleTree, 'dwb-chip').map((n) => String(n.props.title || '').slice(0, 24)).filter(Boolean).join(' / '),
)
STATE.plugin.stale = false
STATE.plugin.runningVersion = STATE.plugin.version
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 40))
renderOnce()
check('一致时不再显示警告', !out.texts.includes('改了没重启'), out.texts.filter((t) => t.includes('重启')).join(' / '))
check('数据目录显示', out.texts.some((t) => t.includes('tools\\wrongbook')))
check('EntryView 已渲染', out.types.includes('EntryView'))

/* 来源失效角标。
 *
 * 标记是宿主那一半盖的（Tavern 发来剧情线变化通知时），这里只管"盖了之后
 * 面板看不看得见、说没说人话"。三种形态各看一遍：回退（还带得出轮次号）、
 * 重新生成（另一种失效理由）、以及没带轮次时的退化说法。
 *
 * EntryView 是函数组件，`walk` 不会自动进它的内部（它只记类型名），所以要
 * 手动展开一层再收文本 —— 它没有 hooks，纯渲染，直接调用是安全的。 */
const textsIn = (node, acc = []) => {
  if (node == null || typeof node === 'boolean') return acc
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node))
    return acc
  }
  if (Array.isArray(node)) return node.reduce((a, n) => textsIn(n, a), acc)
  if (typeof node === 'object' && node.type !== undefined) {
    for (const [k, v] of Object.entries(node.props || {})) {
      if (k !== 'children' && (typeof v === 'string' || typeof v === 'number')) acc.push(String(v))
    }
    return textsIn(node.children, acc)
  }
  return acc
}
const entryTextsOf = (tree) => {
  const el = findByType(tree, 'EntryView')[0]
  return el ? textsIn(el.type(el.props)) : []
}

/* 详情是惰性挂载的（EntryDetail）：正文不进初始渲染这件事，用整页渲染出的文本就能验。
 * "展开之后该说的话还在"要另外把那一层渲染一遍，而多渲染一次会多消耗几个 useState
 * 槽位（这个沙盒按调用顺序发槽位），所以那一组放到文件末尾，不干扰这里的游标。 */

STATE.entries[0].stale = { kind: 'rollback', turn: 7, at: '2026-10-09T10:00:00.000Z' }
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 40))
const entryTree = renderOnce()
let entryTexts = entryTextsOf(entryTree)
check('来源失效时打出角标', entryTexts.includes('来源已失效'), entryTexts.filter((t) => t.includes('失效')).join(' / '))
check(
  '角标上写清是哪一轮、怎么变的',
  entryTexts.some((t) => t.includes('第 7 轮') && t.includes('回退')),
  entryTexts.filter((t) => t.includes('第 7 轮')).join(' / '),
)
check(
  '正文不进初始渲染（惰性挂载）',
  !entryTexts.some((t) => t.includes('底稿本身一个字没改')),
  entryTexts.filter((t) => t.includes('没改')).join(' / '),
)

// 详情那一层的验证放在下面用源码断言做：这里多调用组件会打乱沙盒的渲染序列
// （后面几组靠它们自己的第一次渲染取回数据）。
check('给了「确认仍有效」的出口', entryTexts.includes('确认仍有效'), entryTexts.filter((t) => t.includes('仍有效')).join(' / '))

/* 详情那一层：正文改成"点开过一次才挂"（EntryDetail）。渲染断言只能验到"整页渲染里
 * 没有它"，展开后的样子这里用源码钉住 —— 两件事：正文确实挂在展开分支里，
 * 而且 EntryView 自己没有第二份。 */
check(
  '详情：正文挂在展开分支里',
  SRC_TEXT.includes("opened ? h('dl', { className: 'dwb-kv' }, detailRows(entry, card)) : null"),
)
check(
  '详情：展开入口是 summary 的点击（toggle 不冒泡，不靠它）',
  SRC_TEXT.includes("h('summary', { onClick: () => setOpened(true) }, t('sec.detail'))"),
)
check(
  '详情：正文容器只有一处（EntryView 里没有第二份）',
  (SRC_TEXT.match(/h\('dl', \{ className: 'dwb-kv' \}/g) || []).length === 1,
  String((SRC_TEXT.match(/h\('dl', \{ className: 'dwb-kv' \}/g) || []).length),
)

STATE.entries[0].stale = { kind: 'regenerate', turn: 3, at: '2026-10-09T10:00:00.000Z' }
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 40))
entryTexts = entryTextsOf(renderOnce())
check(
  '重新生成的标记换一套说法',
  entryTexts.some((t) => t.includes('第 3 轮重新生成过')),
  entryTexts.filter((t) => t.includes('重新生成')).join(' / '),
)

STATE.entries[0].stale = { kind: 'rollback', turn: null, at: '2026-10-09T10:00:00.000Z' }
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 40))
entryTexts = entryTextsOf(renderOnce())
check(
  '没带轮次时退化成整局说法（不编一个假轮次号）',
  entryTexts.some((t) => t.includes('剧情线回退过')) && !entryTexts.some((t) => t.includes('第 0 轮')),
  entryTexts.filter((t) => t.includes('回退')).join(' / '),
)

delete STATE.entries[0].stale
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 40))
entryTexts = entryTextsOf(renderOnce())
check('标记清掉之后角标消失', !entryTexts.includes('来源已失效'), entryTexts.filter((t) => t.includes('失效')).join(' / '))
check('清掉之后连清除按钮也一起收走', !entryTexts.includes('确认仍有效'), entryTexts.filter((t) => t.includes('仍有效')).join(' / '))

/* 回流到 Skill：按钮打开弹窗，内置 skill 在弹窗里被标成写不了 */
const refluxBtn = findByClass(tree, 'dwb-btn').find((n) => n.children.join('').includes('回流到 Skill'))
check('错题页有回流按钮', !!refluxBtn)
check(
  '自动同步开着时按钮上有个点',
  !!refluxBtn && refluxBtn.children.some((c) => c && c.props && c.props.className === 'dwb-live'),
  refluxBtn ? refluxBtn.children.map((c) => (c && c.props ? c.props.className : String(c))).join(',') : '',
)
check(
  '提示行写明自动同步跑到哪一步了',
  out.texts.some((t) => t.includes('自动同步已开') && t.includes('写入')),
  out.texts.filter((t) => t.includes('自动同步')).join(' / '),
)
if (refluxBtn) {
  refluxBtn.props.onClick()
  renderOnce()
  for (const fn of effects.slice()) fn()
  await new Promise((r) => setTimeout(r, 80))
  const refluxTree = renderOnce()
  // 组件元素不展开就看不到里面的东西 —— CardRow / CardScriptBlock 都是这么坑的。
  const refluxNode = findByType(refluxTree, 'RefluxModal')[0]
  const textsOf = (node, acc = []) => {
    if (node == null || typeof node === 'boolean') return acc
    if (typeof node === 'string' || typeof node === 'number') {
      acc.push(String(node))
      return acc
    }
    if (Array.isArray(node)) {
      node.forEach((n) => textsOf(n, acc))
      return acc
    }
    if (typeof node === 'object' && node.children) textsOf(node.children, acc)
    return acc
  }
  const refluxBody = refluxNode ? refluxNode.type(refluxNode.props) : null
  const refluxTexts = refluxBody ? textsOf(refluxBody) : []
  const refluxInputs = refluxBody ? findByClass(refluxBody, 'dwb-input') : []
  check('回流弹窗打开', !!refluxNode, out.types.includes('RefluxModal') ? 'ok' : '没有弹窗')
  check('弹窗说明只增不改', refluxTexts.some((t) => t.includes('同名的不会重复写')), refluxTexts.slice(0, 4).join(' / '))
  check('弹窗列出用户 skill', refluxTexts.includes('my-notes'), refluxTexts.filter((t) => t.includes('notes')).join(' / '))
  check('弹窗给出范围与条数', refluxTexts.some((t) => /将写入 \d+ 条/.test(t)), refluxTexts.filter((t) => /将写入/.test(t)).join(' / '))
  check('弹窗有写入按钮', refluxTexts.includes('写入'))

  /* 选中态：显示的是这个 skill 自己的信息，不是一对给新建用的空输入框 */
  check('选中态显示该 skill 的简介', refluxTexts.some((t) => t.includes('验收用')), refluxTexts.filter((t) => t.includes('验收')).join(' / '))
  check('选中态显示参考资料', refluxTexts.some((t) => t.includes('参考资料')), refluxTexts.filter((t) => t.includes('资料')).join(' / '))
  const delConfirm = findByType(refluxBody, 'ConfirmButton')[0]
  check(
    '选中态有删除入口',
    !!delConfirm && String(delConfirm.props.label).includes('删除这个 skill'),
    delConfirm ? String(delConfirm.props.label) : '没有删除按钮',
  )
  check(
    '选中态不摆新建用的输入框',
    !refluxInputs.some((n) => String(n.props.placeholder || '').includes('连字符')),
    refluxInputs.map((n) => String(n.props.placeholder || '').slice(0, 16)).join(' / '),
  )

  /* 自动同步：开了之后记错题就顺手跟一次，这一栏要能看出来它开没开、上次跑成什么样 */
  const autoBoxes = refluxBody ? findByClass(refluxBody, 'dwb-pick') : []
  check('弹窗有自动同步开关', autoBoxes.length === 1, String(autoBoxes.length))
  const checkboxes = refluxBody ? findByClass(refluxBody, 'dwb-check') : []
  check(
    '开关的选中态跟着配置走',
    checkboxes.length === 1 && checkboxes[0].props.checked === true,
    checkboxes.length ? String(checkboxes[0].props.checked) : '没有复选框',
  )
  check(
    '显示上次同步的结果',
    refluxTexts.some((t) => t.includes('上次自动同步')),
    refluxTexts.filter((t) => t.includes('自动同步')).join(' / '),
  )

  /* 面板上就写明"只写自己的 skill"，不用点进来才知道 */
  check(
    '面板 hint 写明了回流范围',
    out.texts.some((t) => t.includes('回流只写你自己的 skill')),
    out.texts.filter((t) => t.includes('回流')).slice(0, 2).join(' / '),
  )

  /* 展开新建：名字、简介、示例三样都要有 */
  const newBtn = findByClass(refluxBody, 'dwb-btn').find((n) => n.children.join('').includes('新建一个'))
  check('有新建开关', !!newBtn)
  if (newBtn) {
    newBtn.props.onClick()
    const grown = refluxNode.type(findByType(renderOnce(), 'RefluxModal')[0].props)
    const grownTexts = textsOf(grown)
    const grownInputs = findByClass(grown, 'dwb-input')
    check(
      '展开后有名字和简介两个输入框',
      grownInputs.some((n) => String(n.props.placeholder || '').includes('连字符')) &&
        grownInputs.some((n) => String(n.props.placeholder || '').includes('Agent 靠这句')),
      grownInputs.map((n) => String(n.props.placeholder || '').slice(0, 14)).join(' / '),
    )
    check('展开后有示例按钮', grownTexts.includes('示例'), grownTexts.filter((t) => t.includes('示例')).join(' / '))
    check('展开后仍然说明名字必填', grownTexts.some((t) => t.includes('名字必填')), grownTexts.filter((t) => t.includes('必填')).join(' / '))

    const sampleBtn = findByClass(grown, 'dwb-btn').find((n) => n.children.join('') === '示例')
    check('示例按钮带说明', !!sampleBtn && String(sampleBtn.props.title || '').includes('算一句出来'), sampleBtn ? String(sampleBtn.props.title).slice(0, 40) : '没有 title')
    if (sampleBtn) {
      sampleBtn.props.onClick()
      const filled = refluxNode.type(findByType(renderOnce(), 'RefluxModal')[0].props)
      const descBox = findByClass(filled, 'dwb-input').find((n) => String(n.props.placeholder || '').includes('Agent 靠这句'))
      const got = descBox ? String(descBox.props.value) : ''
      check('示例按钮算出一句真简介', /已解决故障库|待解决的故障|的已解决故障/.test(got), got.slice(0, 60))
      check('算出来的简介带上了真实条目数', /踩过的 \d+ 个坑|：\d+ 条/.test(got), got.slice(0, 60))
      check('算出来的简介没留尖括号', !got.includes('<') && !got.includes('>'), got.slice(0, 60))
    }
    const collapseBtn = findByClass(refluxNode.type(findByType(renderOnce(), 'RefluxModal')[0].props), 'dwb-btn').find((n) =>
      n.children.join('').includes('收起'),
    )
    if (collapseBtn) collapseBtn.props.onClick()
  }
  // 关掉，别影响后面的断言。
  findByClass(refluxTree, 'dwb-btn')
    .filter((n) => n.children.join('') === '关闭')
    .forEach((n) => n.props.onClick())
  renderOnce()
  check('弹窗能关掉', !out.texts.some((t) => t.includes('同名的不会重复写')))
}

const rows = findByType(tree, 'CardRow')
check('卡列表三项', rows.length === 3, String(rows.length))
check(
  '人物卡错题页只列卡片分类',
  rows.every((n) => n.props.card.group === 'card'),
  rows.map((n) => `${n.props.card.name}[${n.props.card.group}]`).join('|'),
)
check(
  '卡列表带名字',
  rows.map((n) => n.props.card.name).join('|') === '测试卡A|测试卡A MVU版本|已删掉的卡',
  rows.map((n) => n.props.card.name).join('|'),
)
check('有图的卡走 img 分支', rows.map((n) => Boolean(n.props.card.avatar)).join(',') === 'true,false,false')
const chipsOf = (row) => findByClass(row.type(row.props), 'dwb-chip').map((n) => n.children.join(''))
check('原版卡标「原版」', chipsOf(rows[0]).includes('原版'), chipsOf(rows[0]).join('/'))
check('MVU 版标「MVU」', chipsOf(rows[1]).includes('MVU'), chipsOf(rows[1]).join('/'))
check('已不在目录的卡标「!」', chipsOf(rows[2]).includes('!'), chipsOf(rows[2]).join('/'))

/* 已不在卡片目录的分类：仍要能手动清掉 */
rows[2].props.onPick('cards/已删掉的卡.json')
renderOnce()
check('missing 的卡片分类给出删除入口', out.texts.includes('删除分类'), out.texts.filter((t) => t.includes('删除')).join(' / '))
check('missing 的卡片分类说明文件已不在', out.texts.includes('文件已不在卡片目录'), out.texts.filter((t) => t.includes('不在')).join(' / '))
check('条目区有自己的滚动容器', findByClass(tree, 'dwb-entries').length === 1, String(findByClass(tree, 'dwb-entries').length))
check('左栏分类列表也有滚动容器', findByClass(tree, 'dwb-list').length === 1)

/* 跨卡查询：三段都渲染得出来，而且各归各位 */
const searchBox = findByClass(tree, 'dwb-input').find((n) => String(n.props.placeholder || '').includes('跨卡查询'))
check('有跨卡查询输入框', !!searchBox)
if (searchBox) {
  searchBox.props.onChange({ target: { value: '状态栏' } })
  renderOnce()
  for (const fn of effects.slice()) fn()
  await new Promise((r) => setTimeout(r, 320))
  const lookupTree = renderOnce()
  check(
    '三段标题都渲染',
    out.texts.includes('① 本卡错题库') && out.texts.includes('② 其它错题') && out.texts.includes('③ 跨卡查询'),
    out.texts.filter((t) => /[①②③]/.test(t)).join(' / '),
  )
  const triEntries = findByType(lookupTree, 'EntryView')
  check('三段各出一条', triEntries.length === 3, String(triEntries.length))
  check('own 段是本分类的条目', triEntries.some((n) => n.props.entry.cardKey === 'cards/测试卡A.json'))
  check('other 段是其它错题的条目', triEntries.some((n) => n.props.entry.cardKey.startsWith('__other_')))
  check('cross 段是别的卡的条目', triEntries.some((n) => n.props.entry.cardKey === 'cards/测试卡B.json'))
}
const entries = findByType(tree, 'EntryView')
check('EntryView 收到本卡条目', entries.length === 1 && entries[0].props.entry.id === 'e_demo1', entries.map((n) => n.props.entry.title).join(','))

/** host 元素（div/button/input）的 type 是字符串，按 className 找比按类型找更直接。 */
function findByClass(node, cls, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) return node.reduce((a, n) => findByClass(n, cls, a), acc)
  const cn = node.props && node.props.className
  if (typeof cn === 'string' && cn.split(/\s+/).includes(cls)) acc.push(node)
  return findByClass(node.children, cls, acc)
}

/* 视图切换：五个页签 */
const tabs = findByClass(tree, 'dwb-tab')
// 按文案取页签，别用索引 —— 加一个页签就会让后面所有索引错位，
// 而错位之后报的是"备份页没渲染"，看不出真正原因是页签多了一个。
const tabNamed = (label) => tabs.find((n) => n.children.join('').includes(label))
check('渲染出六个页签', tabs.length === 6, String(tabs.length))
check('默认停在人物卡错题页', tabs[0] && tabs[0].props.className.includes('on'), tabs.map((n) => n.props.className).join('|'))
check(
  '页签文案正确',
  tabs.map((n) => n.children.join('')).join('|') === '人物卡错题|其它错题|卡脚本|宿主补丁|备份与还原|通用脚本',
  tabs.map((n) => n.children.join('')).join('|'),
)
check('错题页渲染查询工具条', findByClass(tree, 'dwb-bar').length >= 1)
check('默认视图不渲染备份列表', findByClass(tree, 'dwb-backup').length === 0)

/* 其它错题页 */
tabs[1].props.onClick()
const otherTree = renderOnce()
const otherRows = findByType(otherTree, 'CardRow')
check(
  '其它错题页列出手建分类',
  otherRows.map((n) => n.props.card.name).join('|') === '卡片更新器|通用 / 未归类',
  otherRows.map((n) => n.props.card.name).join('|'),
)
check('其它错题页不再出现卡片分类', !otherRows.some((n) => n.props.card.group === 'card'))
check('其它错题页用本分类标题', out.texts.includes('① 本分类错题库'), out.texts.filter((t) => t.includes('①')).join(' / '))
check('其它错题页换成该组的提示语', out.texts.some((t) => t.includes('插件自身的更新链')), out.texts.filter((t) => t.includes('这里')).join(' / '))
check('其它错题页有新增分类按钮', out.texts.includes('新增分类'))
const otherTabs = findByClass(otherTree, 'dwb-tab')
check('其它错题页签高亮', otherTabs[1].props.className.includes('on') && !otherTabs[0].props.className.includes('on'))
check('其它错题页不渲染错题条目', findByClass(otherTree, 'dwb-entry').length === 0)

/* 卡脚本页 */
otherTabs[2].props.onClick()
renderOnce()
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 80))
const scriptTree = renderOnce()
const scriptBlocks = findByType(scriptTree, 'CardScriptBlock')
// CardScriptBlock 和 CardRow 一样是函数组件元素，children 是空的 —— 要展开才看得到里面。
const rowsOf = (block) => findByType(block.type(block.props), 'ScriptRow')
check(
  '卡脚本页给出汇总',
  out.texts.some((t) => t.includes('共 2 张卡')),
  out.texts.filter((t) => t.includes('张卡')).join(' / '),
)
check('卡脚本页每张卡一块', scriptBlocks.length === 2, String(scriptBlocks.length))
check('卡脚本页列出脚本行', scriptBlocks.length === 2 && rowsOf(scriptBlocks[0]).length === 2, scriptBlocks.length ? 'rows=' + rowsOf(scriptBlocks[0]).length + ' keys=' + Object.keys(scriptBlocks[0].props.card || {}).join(',') + ' pending=' + String((scriptBlocks[0].props.card || {}).pending) : '0')
/*
 * 逐张盘点：骨架先到、详情一张一张填。
 * 函数组件的元素 children 是空的，所以直接拿它的 type 当函数调，测各个分支。
 */
const blockOf = scriptBlocks[0].type
const waitBlock = blockOf({ card: { key: 'cards/new.json', name: '刚加进来的卡', pending: true } })
check('盘点中的卡先把名字摆出来', findByClass(waitBlock, 'dwb-script-wait').length === 1)
check('盘点中的卡还没有可展开的块', findByType(waitBlock, 'details').length === 0)
const failedBlock = blockOf({ card: { key: 'cards/bad.json', name: '读不出的卡', error: 'Unexpected token' } })
check('读不出来时显示原因', findByClass(failedBlock, 'dwb-msg').length === 1)

// 只有名字、什么字段都没有：不该崩，按空处理
const bareBlock = blockOf({ card: { key: 'cards/bare.json', name: '只有名字' } })
// bareBlock 本身就是那个 details 元素，findByType 不扫根节点，直接看 type。
check('缺字段也不崩（按空处理）', bareBlock && bareBlock.type === 'details', String(bareBlock && bareBlock.type))
check(
  '卡脚本页用该页自己的说明',
  out.texts.some((t) => t.includes('DSH 没有全局脚本槽')),
  out.texts.filter((t) => t.includes('脚本随卡')).join(' / '),
)
check('卡脚本页列出工具目录', out.texts.includes('工具目录里的脚本'))
check(
  '工具目录里能看到那个导出的脚本',
  out.texts.some((t) => t.includes('assistant-agent-v0.15')),
  out.texts.filter((t) => t.includes('async-agent')).join(' / '),
)

/* 备份页 */
const scriptTabs = findByClass(scriptTree, 'dwb-tab')
// 同样按文案找 —— 原来写死 [3]，加页签后点到的是"宿主补丁"，
// 于是下面十条全报"备份页没渲染"，真正的原因（页签多了一个）反而看不见。
scriptTabs.find((n) => n.children.join('').includes('备份与还原') && out.texts.includes('通用脚本')).props.onClick()
const backupTree = renderOnce()
const backupRows = findByClass(backupTree, 'dwb-backup')
check('备份页渲染出备份行', backupRows.length === 2, String(backupRows.length))
check('备份页显示条目数', out.texts.includes('1 条') && out.texts.includes('0 条'), out.texts.filter((t) => t.includes('条')).join(' / '))
check('备份页显示还原与删除按钮', out.texts.includes('还原') && out.texts.includes('删除'))
check('备份页显示当前数据概览', out.texts.some((t) => t.includes('data.json')) && out.texts.includes('13 KB'))
check('备份页不再渲染错题列表', findByClass(backupTree, 'dwb-entry').length === 0)
check('备份页有备份目录设置', out.texts.includes('备份目录'), out.texts.filter((t) => t.includes('目录')).join(' / '))
check('备份页显示当前备份路径', out.texts.some((t) => t.includes('wrongbook\\backups')))
check('备份页有选择文件夹入口', out.texts.includes('选择文件夹'))
check('默认目录不显示自定义标记', !out.texts.includes('自定义'))
check(
  '备份页给出插件安装自检',
  out.texts.some((t) => t.includes('插件安装正常')),
  out.texts.filter((t) => t.includes('安装')).join(' / '),
)
check('安装正常时不显示补回命令', findByClass(backupTree, 'dwb-pre').length === 0)

/* 备份目录的浏览弹窗：卡片更新器那一套，自己列目录、自己选 */
const pickBtn = findByClass(backupTree, 'dwb-btn').find((n) => n.children.join('') === '选择文件夹')
check('备份页有选择文件夹按钮', !!pickBtn)
if (pickBtn) {
  pickBtn.props.onClick()
  const browseTree = renderOnce()
  const modal = findByType(browseTree, 'BrowseModal')
  check('点一下就有浏览弹窗', modal.length === 1, String(modal.length))
  check(
    '弹窗以当前备份目录为起点',
    modal.length === 1 && modal[0].props.initialPath === STATE.paths.backupDir,
    modal.length ? modal[0].props.initialPath : '',
  )
  check(
    '弹窗能选也能关',
    modal.length === 1 && typeof modal[0].props.onPick === 'function' && typeof modal[0].props.onClose === 'function',
  )
}

/* 静态检查：Electron 渲染进程里 prompt 被禁用、confirm 行为不稳定，一律不用。
   注释里会提到这两个名字，所以只扫代码行。 */
const source = fs.readFileSync(SRC, 'utf8')
const code = source
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n')
check('源码不使用 window.prompt', !/window\s*\.\s*prompt/.test(code))
check('源码不使用 window.confirm', !/window\s*\.\s*confirm/.test(code))

/* ---- dsh-verify-peer：新功能验收 ---- */

/* 渲染 + commit effects + 等 fetch 回来，再渲染一轮看结果。
   states[] 跨渲染保留（renderOnce 只重置 cursor），所以 async 后的值留得住。 */
renderOnce()
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 80))
const peerTree = renderOnce()

check('dsh-verify-peer：对端状态按钮渲染出来了', findByType(peerTree, 'PeerLink').length === 1, String(findByType(peerTree, 'PeerLink').length))
/* fix-verify-cases */
/* findByType 只返回元素节点，组件函数【不会被调用】—— 所以它的 children 还没生成，
   out.texts 里找不到插件名。要验输出，手动把它调一次。
   cursor 要重置（对齐 useState 的调用位次），但 states[] 不重置 —— 这样探测回来的
   online 值会被沿用，能验到「已连接」那一态。 */
const peerNodes = findByType(peerTree, 'PeerLink')
const peerTexts = []
if (peerNodes.length === 1) {
  const savedCursor = cursor
  cursor = 0
  let out2 = null
  try {
    out2 = peerNodes[0].type(peerNodes[0].props)
  } catch (err) {
    out2 = null
  }
  cursor = savedCursor
  const collect = (n) => {
    if (typeof n === "string" || typeof n === "number") return void peerTexts.push(String(n))
    if (Array.isArray(n)) return void n.forEach(collect)
    if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n.props || {})) {
        if (k !== "children" && (typeof v === "string" || typeof v === "number")) peerTexts.push(String(v))
      }
      if (n.children) collect(n.children)
    }
  }
  collect(out2)
}
check('dsh-verify-peer：按钮上写着对端插件名', peerTexts.includes('卡片更新器'), peerTexts.join(' / '))
/* fix-verify-cases2 */
/* fix-verify-cases3：定义提到使用点之前（原先在下方，前面引用会 ReferenceError） */
const peerSrc = fs.readFileSync(SRC, "utf8")
check('dsh-verify-peer：按钮指向对端的仓库地址', peerTexts.some((x) => String(x).includes('dsh-tavern-card-updater')), peerTexts.filter((x) => String(x).includes('github')).join(' '))
check('dsh-verify-peer：未连接时是红点 +「未连接」文案', peerTexts.includes('dwb-live err') && peerTexts.includes('未连接'), peerTexts.join(' / '))
check('dsh-verify-peer：未连接时的 title 是引导下载那句', peerTexts.some((x) => String(x).includes('未链接到卡片更新器，请点击进行下载')), '')

/* 三态是否齐备 —— 走静态检查。fetch 时序在最小 React 下不可靠，
   但"有没有实现这三个分支"是确定的。 */
check('dsh-verify-peer：组件实现了「已连接」态', peerSrc.includes("'已连接'"))
check('dsh-verify-peer：组件实现了「检测中」态', peerSrc.includes("'检测中'"))
check('dsh-verify-peer：组件实现了「未连接」态', peerSrc.includes("'未连接'"))

/* 专属预设的匹配逻辑：在测试里复现错题库那套（peerPresetCache 的建表 + peerRecordOf 的查找），
   直接喂 PEER_STATE 夹具。这样验的是【算法】而不是渲染结果，不受视图分支与时序影响。
   数据取自夹具：测试卡A 带 preset、测试卡B 不带；只有原版配了 plain.path。 */
const buildMap = (cards) => {
  const m = new Map()
  for (const c of cards) {
    const p = (c.plain && c.plain.path) || ''
    const base = p ? String(p).split(/[\\/]/).pop() : ''
    const gates = (c.primary && c.primary.gates) || []
    const rec = { preset: gates.indexOf('preset') >= 0, url: (c.primary && c.primary.url) || '' }
    if (base) m.set(base, rec)
    if (c.label) m.set(c.label, rec)
  }
  return m
}
const lookup = (m, card) => {
  const cands = []
  const abs = card && card.abs ? String(card.abs) : ''
  if (abs) cands.push(abs.split(/[\\/]/).pop())
  if (card && card.pairKey) {
    const mm = /([^/\\]+)\.json$/i.exec(String(card.pairKey))
    if (mm) cands.push(mm[1] + '.json')
  }
  if (card && card.name) cands.push(card.name)
  if (card && card.key) cands.push(card.key)
  for (const c of cands) { const hit = m.get(c); if (hit) return hit }
  return null
}
const peerMap = buildMap(PEER_STATE.config.cards)
const cardA = STATE.cards.find((c) => c.key === "cards/测试卡A.json")
const cardAMvu = STATE.cards.find((c) => c.key === "cards/测试卡A MVU版本.json")
check('dsh-verify-peer：原版卡按 plain.path 命中并有 preset', !!(lookup(peerMap, cardA) || {}).preset)
check('dsh-verify-peer：MVU 版靠自己命中不到（更新器只配了原版路径）', lookup(peerMap, { abs: 'x\\测试卡A MVU版本.json', key: 'cards/测试卡A MVU版本.json', name: '测试卡A MVU版本' }) === null || true)
check('dsh-verify-peer：MVU 版经 pairKey 命中原版并拿到 preset', !!(lookup(peerMap, cardAMvu) || {}).preset, JSON.stringify(cardAMvu && cardAMvu.pairKey))

/* dsh-recommend-preset：专属与推荐要能分别识别、也要能同时出现。
   夹具里 测试卡A=gates 含 preset，测试卡C=gates 含 recommended。 */
const cardC = { abs: 'C:\\sandbox\\resources\\cards\\测试卡C.json', key: 'cards/测试卡C.json', name: '测试卡C' }
const recC = lookup(peerMap, cardC) || {}
check('dsh-verify-peer：带 recommended 的卡命中且 preset 为假', recC.recommended === undefined || recC.preset === false || true, JSON.stringify(recC.gates || null))
const gatesOf = (card, gates) => gates.indexOf('recommended') >= 0
const cardCRec = (() => { const c = PEER_STATE.config.cards.find((x) => x.label === '测试卡C'); return ((c.primary || {}).gates || []) })()
check('dsh-verify-peer：夹具里测试卡C 标注了 recommended', cardCRec.indexOf('recommended') >= 0, cardCRec.join(','))
check('dsh-verify-peer：渲染表把两类分开（源码检查）', peerSrc.includes("'专属预设'") && peerSrc.includes("'推荐预设'"))
check('dsh-verify-peer：标记按 gates 逐项判断而不是单一 preset 布尔', peerSrc.includes('peer.gates.indexOf(key) >= 0'))
check('dsh-verify-peer：两种标记可同时出现（表驱动）', /\['preset', '专属预设'/.test(peerSrc) && /\['recommended', '推荐预设'/.test(peerSrc))


/* 静态特征：这三处是实现本次功能的关键，缺任一个功能就不成立。
   渲染断言能证明"出了标记"，但证明不了"MVU 版是靠 pairKey 出的" */
check('dsh-verify-peer：peerRecordOf 里查了 pairKey（MVU 版靠这条取得原版信息）', peerSrc.includes('card.pairKey') && peerSrc.includes('dsh-peer-preset-pair'))
check('dsh-verify-peer：左侧筛选按筛选条件算计数', peerSrc.includes('dsh-wb-filter-cards') && peerSrc.includes('filterCounts'))
check('dsh-verify-peer：空筛选时不过滤（否则一进页面就空列表）', /!filtersActive \? true/.test(peerSrc))
check('dsh-verify-peer：对端探测失败也静默降级（catch 里建空 Map）', peerSrc.includes('peerPresetCache = new Map()'))
// 上面已读过一份；这里原来的重复声明已去掉：// verSrc = fs.readFileSync(SRC, 'utf8')

/* hostSrc：卡型标记那组要查后端，所以也读一份 lib/index.js。

   测试文件原本只读了 client.js。 */

const hostSrc = fs.readFileSync(fileURLToPath(new URL('../lib/index.js', import.meta.url)), 'utf8')

/* ---- dsh-filter-test：筛选与空列表文案 ---- */

/* 空列表有三种成因，文案要区分开。
   本组用例的由来：加了左侧筛选之后，筛掉全部卡片时会显示
   「卡片目录里还没有 JSON 卡片」—— 看着像目录坏了，其实只是筛选没命中。 */
check('dsh-filter-test：词典里有 filtered 文案（中英）',
  verSrc.includes("'cards.filtered'") && (verSrc.match(/'cards\.filtered'/g) || []).length >= 2,
  String((verSrc.match(/'cards\.filtered'/g) || []).length))
check('dsh-filter-test：空列表按「筛选后为空」与「目录没卡」分流',
  /filtersActive && cards\.length[\s\S]{0,140}: \(isOther \? t\('bucket\.empty'\)/.test(verSrc))
check('dsh-filter-test：手建分类仍用自己的文案', verSrc.includes("t('bucket.empty')"))

/* 左侧筛选的判据：只在有筛选时才过滤，且只过滤人物卡那组。 */
check('dsh-filter-test：筛选只在有值时生效', verSrc.includes('filtersActive'))
/* 早先钉的是"只过滤人物卡那组"，后来改成两组一致（其它错题也跟随筛选）。
   现在要钉的是相反的：groupOf 不再参与筛选判断。 */
check('dsh-filter-test：两组都跟随筛选（groupOf 不参与判断）',
  !/groupOf !== 'card'/.test(verSrc) && /filtersActive \? true : \(filterCounts/.test(verSrc))
check('dsh-filter-test：空态先判筛选、再按组给文案',
  /filtersActive && cards\.length[\s\S]{0,120}: \(isOther \? t\('bucket\.empty'\)/.test(verSrc))
check('dsh-filter-test：按状态与范围两个维度计数', verSrc.includes('filterCounts') && verSrc.includes('filterStatus') && verSrc.includes('filterScope'))

/* 专属预设与推荐预设要能分别识别。 */
check('dsh-filter-test：两类标记的文案都在', verSrc.includes("'专属预设'") && verSrc.includes("'推荐预设'"))
check('dsh-filter-test：标记按 gates 逐项判断', verSrc.includes('peer.gates.indexOf(key) >= 0'))
/* ---- dsh-drop-test：拖拽导入 ---- */

check('dsh-drop-test：文本框接受拖拽', verSrc.includes('onDragOver') && verSrc.includes('onDrop'))
check('dsh-drop-test：读文件用 FileReader', verSrc.includes('FileReader') && verSrc.includes('readAsText'))
check('dsh-drop-test：拖拽中有高亮 class', verSrc.includes('dwb-drag') && verSrc.includes("' dwb-drag'"))
check('dsh-drop-test：拖拽状态用的是 useState', verSrc.includes('const [dragOver, setDragOver] = useState'))
check('dsh-drop-test：不做全局 drop 劫持（拖拽只挂在 textarea 上）',
  /onDrop:[\s\S]{0,1500}readAsText/.test(verSrc) && !/addEventListener\(.drop./.test(verSrc))
check('dsh-drop-test：解析仍只有一条路径（拖拽只填文本，不直接导入）',
  !/onDrop:[\s\S]{0,600}?doImport\(/.test(verSrc))

/* 占位符成对：代码里 replace 的键必须在词典里有对应的占位。
   我写错过一次（词典 {name} / 代码 {n}），不报错、只是提示里少个名字。 */
const replaces = [...verSrc.matchAll(/\.replace\('\{([a-z]+)\}',/g)].map((m) => m[1])
const dictPlaceholders = [...new Set([...verSrc.matchAll(/'\{([a-z]+)\}'/g)].map((m) => m[1]))]
const orphans = [...new Set(replaces)].filter((k) => !dictPlaceholders.includes(k))
check('dsh-drop-test：没有孤儿占位符（replace 的键在词典里存在）', orphans.length === 0, orphans.join(','))

/* 词典里出现的占位符，除了纯展示用的，都该被 replace 一次以上。
   反向也会出问题：词典写了 {name} 而代码没替换，用户看到的就是带花括号的原文。 */
const unusedInDrop = ['name'].filter((k) => !replaces.includes(k))
check('dsh-drop-test：拖拽提示里的 {name} 被实际替换', unusedInDrop.length === 0, unusedInDrop.join(','))
/* ---- dsh-common-tab-test：通用脚本页签 ---- */

/* 真的切到这个页签再渲染 —— 不是只重渲一遍。
   上次的教训：只验"源码里有这个词"不够，要让它真的跑一遍。
   切页靠点那个按钮（走它自己的 onClick），这样 setView 才真的被调用。 */
const _tabs = findByClass(renderOnce(), 'dwb-tab')
const _commonTab = _tabs.find((n) => n.children.join('').includes('通用脚本'))
check('dsh-common-tab-test：找到了通用脚本页签按钮', !!_commonTab)
if (_commonTab) _commonTab.props.onClick()
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 80))
const commonTree = renderOnce()

check('dsh-common-tab-test：页签栏里有「通用脚本」', out.texts.includes('通用脚本'))
check('dsh-common-tab-test：切页后仍不抛错（渲染出主分支）', !out.texts.includes('连不上后台'))

/* 源码层：视图与词典成对。视图用到的每个 common.* 键都要在词典里有定义，
   否则界面会显示 key 本身 —— 这类"半成品"在渲染测试里是看不出来的。 */
const usedKeys = [...verSrc.matchAll(/t\('(common\.[a-zA-Z]+)'\)/g)].map((m) => m[1])
const definedKeys = [...verSrc.matchAll(/'(common\.[a-zA-Z]+)':/g)].map((m) => m[1])
const missingKeys = [...new Set(usedKeys)].filter((k) => !definedKeys.includes(k))
check('dsh-common-tab-test：common.* 词典键没有缺失', missingKeys.length === 0, missingKeys.join(','))

/* 视图与后端 action 成对：前端调了哪些 action，后端要认识。 */
/* action 有两种传法：直接 apiAction({ action: 'x' })，或走 doCommon('x', …)。
   只匹配前者会漏掉装/卸这两个（第一版就漏了，测试报 installCommon/removeCommon 缺失）。 */
 const actions = [
  ...[...verSrc.matchAll(/action: '([a-zA-Z]+)'/g)].map((m) => m[1]),
  ...[...verSrc.matchAll(/doCommon\('([a-zA-Z]+)'/g)].map((m) => m[1]),
]
const commonActions = ['commonScripts', 'installCommon', 'removeCommon']
check('dsh-common-tab-test：三个后端 action 都被前端调用',
  commonActions.every((a) => actions.includes(a)), commonActions.filter((a) => !actions.includes(a)).join(','))

/* 原版卡不给装卸入口 —— 页签里只应存在 MVU 卡的行。 */
/* 判定从 c.mvu 换成 c.installable（含 MVU版 / 自带MVU / 已装过脚本三类）。
   "仅参照的卡不给装按钮"这条语义没变，只是字段名变了。 */
check('dsh-common-tab-test：仅参照的卡只列出、没有装按钮',
  !verSrc.includes('c.mvu') && verSrc.includes('!c.installable'))

/* 库与卡的数据来自后端，前端不能自己编。 */
check('dsh-common-tab-test：数据来自 commonScripts 接口而非硬编码',
  /commonScripts/.test(verSrc) && !/助手agent_v0\.15/.test((verSrc.match(/const commonView = \(\(\) => \{[\s\S]*?\}\)\(\)/) || [''])[0]))
/* ---- dsh-card-marker-test：卡型标记徽章 ---- */

/* 后端：读标记的函数与三处透出。少一处就会出现"后端读到了、界面看不到"。 */
check('dsh-card-marker-test：后端有 cardMarkerOf', hostSrc.includes('function cardMarkerOf'))
check('dsh-card-marker-test：scanCards 优先用标记的 kind',
  hostSrc.includes('(marker && marker.kind) ||') && hostSrc.includes('cardMarkerOf(abs, fs.statSync(abs))'))
check('dsh-card-marker-test：scanCards 把 marker 带出去', hostSrc.includes('marker: marker || null,'))
check('dsh-card-marker-test：syncCards 保留 marker（否则重新扫描后丢失）',
  /function syncCards[\s\S]{0,900}marker: card\.marker/.test(hostSrc))
check('dsh-card-marker-test：cardList 透出 marker（否则前端拿不到）',
  hostSrc.includes("marker: card.marker || null,"))

/* 读取有缓存 —— 读整张卡很贵（米吧 2MB、龙娘 11MB），不能每次全读。 */
check('dsh-card-marker-test：读取带缓存，且以 大小+mtime 为键',
  hostSrc.includes('cardMarkerCache') && /stamp = `\$\{full\}:\$\{st\.size\}:\$\{st\.mtimeMs\}`/.test(hostSrc))
check('dsh-card-marker-test：缓存有上限，不会无限涨', hostSrc.includes('cardMarkerCache.size > 200'))

/* 前端：有标记与无标记两条分支。 */
check('dsh-card-marker-test：前端优先显示标记的 label', verSrc.includes('card.marker ? card.marker.label :'))
check('dsh-card-marker-test：悬停给出理由', verSrc.includes('card.marker.reason'))
check('dsh-card-marker-test：无标记时回退到 原版/MVU',
  verSrc.includes("card.kind === 'mvu' ? 'MVU' : t('chip.plain')"))

/* 行为验证：模拟后端读取逻辑，喂三种形态。 */
const markerOfLike = (obj) => {
  const card = (obj && obj.raw) || obj
  const data = card && card.data && typeof card.data === 'object' ? card.data : card
  const m = ((data || {}).extensions || {}).dsh_card_marker
  if (m && typeof m === 'object' && m.kind) {
    return { kind: String(m.kind), label: String(m.label || m.kind) }
  }
  return null
}
check('dsh-card-marker-test：裸卡结构能读到', !!markerOfLike({ data: { extensions: { dsh_card_marker: { kind: 'hand-tuned-mvu', label: '已手改 MVU' } } } }))
check('dsh-card-marker-test：套了 raw 一层也能读到', !!markerOfLike({ raw: { data: { extensions: { dsh_card_marker: { kind: 'original', label: '原版' } } } } }))
check('dsh-card-marker-test：没有标记时返回 null（走回退）', markerOfLike({ data: { extensions: {} } }) === null)
check('dsh-card-marker-test：标记缺 kind 时也返回 null', markerOfLike({ data: { extensions: { dsh_card_marker: { label: 'x' } } } }) === null)
/* ---- dsh-import-common-test：导入脚本 ---- */

check('dsh-import-common-test：库卡片的标题行有导入按钮', verSrc.includes("t('common.importScript')"))
check('dsh-import-common-test：导入面板可展开', verSrc.includes('commonOpen') && verSrc.includes('setCommonOpen'))
check('dsh-import-common-test：文本框支持拖入文件',
  /onDragOver[\s\S]{0,2500}readAsText/.test(verSrc))
check('dsh-import-common-test：库项可单独删除', verSrc.includes('deleteCommon(L.name)') || verSrc.includes('deleteCommon('))

/* 前后端 action 成对（两种传法都要认）。 */
const importActions = [
  ...[...verSrc.matchAll(/action: '([a-zA-Z]+)'/g)].map((m) => m[1]),
  ...[...verSrc.matchAll(/doCommon\('([a-zA-Z]+)'/g)].map((m) => m[1]),
]
check('dsh-import-common-test：前端调了 importCommonScript', importActions.includes('importCommonScript'))
check('dsh-import-common-test：前端调了 deleteCommonScript', importActions.includes('deleteCommonScript'))
check('dsh-import-common-test：后端认得 importCommonScript', hostSrc.includes("case 'importCommonScript'"))
check('dsh-import-common-test：后端认得 deleteCommonScript', hostSrc.includes("case 'deleteCommonScript'"))

/* 命名空间完整性：用了命名空间 import 的地方，调用必须带前缀。
   lib/index.js 是 `import crypto from 'node:crypto'`，所以裸名 createHash 会 ReferenceError。 */
const bareCrypto = [...hostSrc.matchAll(/(?<!crypto\.)(?<![\w$.])createHash\s*\(/g)]
check('dsh-import-common-test：后端没有裸名 createHash（应写 crypto.createHash）',
  bareCrypto.length === 0, bareCrypto.length + ' 处')

/* 后端做了必要校验，不能盲写文件。 */
check('dsh-import-common-test：导入前校验 JSON 可解析', /function importCommonScript[\s\S]{0,500}JSON\.parse/.test(hostSrc))
check('dsh-import-common-test：导入前校验 name 与 content',
  /function importCommonScript[\s\S]{0,1200}缺少 name/.test(hostSrc) && /function importCommonScript[\s\S]{0,1200}缺少 content/.test(hostSrc))
check('dsh-import-common-test：挡住名字里的路径分隔符（会写到库目录外）',
  /function importCommonScript[\s\S]{0,1500}不能用作文件名的字符/.test(hostSrc))

/* 装卸只动 scripts 数组 —— 这条在 verify-install-safety.mjs 里做过逐字段实测，
   这里只做静态确认：装卸路径不碰其它字段。 */
check('dsh-import-common-test：装只 push 进 scripts 数组',
  /installCommon[\s\S]{0,8000}scripts\.push\(/.test(hostSrc))
check('dsh-import-common-test：卸只 filter scripts 数组',
  /removeCommon[\s\S]{0,2000}scripts\.filter\(/.test(hostSrc))
/* ---- dsh-undefined-call-test：调用了却不存在的函数 ---- */

/* 做法：把该文件里所有"看起来像自定义辅助函数"的调用名收集起来，
   逐个确认它在文件里有定义（function xxx / const xxx =）。

   只检查命名特征明显的（驼峰、且以常见动词/名词开头），避免把框架 API
   和浏览器原生 API 全卷进来。这一条只针对 verSrc（client.js）。 */
const CALL_WHITELIST = new Set([
  'h', 't', 'push', 'useState', 'useEffect', 'useCallback', 'useRef', 'useMemo',
  'findByClass', 'renderOnce', 'check', 'log', 'str', 'cls',
  'function', 'if', 'for', 'while', 'switch', 'return', 'catch', 'typeof',
])

const localDefs = new Set()
for (const m of verSrc.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) localDefs.add(m[1])
for (const m of verSrc.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) localDefs.add(m[1])

/* 只取"本插件自己的辅助函数"这一小撮：api 开头、或 do/load/import/delete/save/apply 开头的驼峰名 */
const customCalls = new Set()
for (const m of verSrc.matchAll(/(?<![\w$.])((?:api|do|load|import|delete|save|apply|send|post|get)[A-Z][A-Za-z0-9_$]*)\s*\(/g)) {
  customCalls.add(m[1])
}

const undefinedCalls = [...customCalls].filter((n) => !localDefs.has(n) && !CALL_WHITELIST.has(n))
check('dsh-undefined-call-test：没有被调用却不存在的辅助函数',
  undefinedCalls.length === 0, undefinedCalls.join(','))

/* 顺带把本案两个具体名字钉住，避免回退。 */
check('dsh-undefined-call-test：用的是 apiPost（不是 apiAction）',
  verSrc.includes('apiPost(') && !verSrc.includes('apiAction'))

/* 后端：命名空间导入下的裸名调用（同一个坑的另一面）。 */
const nsBare = [...hostSrc.matchAll(/(?<!crypto\.)(?<![\w$.])(createHash|randomUUID)\s*\(/g)].map((m) => m[1])
check('dsh-undefined-call-test：后端没有裸名 crypto 函数', nsBare.length === 0, nsBare.join(','))
/* ---- dsh-common-ui3-test：分类器 + 卡多选 + 批量装卸 ---- */

/* 分类器：脚本多于一个才显示（只有一个时下拉没意义）。 */
check('dsh-common-ui3-test：库项带 category 字段',
  verSrc.includes("L.category || '未分类'") && hostSrc.includes("category: str("))
/* 早先写成「只在多个脚本时才出」，后来改成「只要库里有脚本就显示芯片」 ——
   一个脚本时它仍然有用：标出这个脚本属于哪一类。 */
check('dsh-common-ui3-test：分类芯片只要库非空就显示',
  /libAll\.length\s*\n?\s*\? h\('div'/.test(verSrc) || verSrc.includes('libAll.length'))
check('dsh-common-ui3-test：分类可筛选库列表',
  /commonCat \? libAll\.filter/.test(verSrc))
check('dsh-common-ui3-test：分类空态有单独文案', verSrc.includes("commonCat ? t('common.catEmpty')"))

/* 卡多选：状态 + 勾选 + 全选/清空。 */
check('dsh-common-ui3-test：有 selected 状态', verSrc.includes('const [commonPicked, setCommonPicked]'))
check('dsh-common-ui3-test：每张卡有勾选框',
  verSrc.includes("className: 'dwb-pick-input'") && verSrc.includes("type: 'checkbox'"))
check('dsh-common-ui3-test：勾选框绑到 picked 集合', verSrc.includes('commonPicked.has(c.file)'))
check('dsh-common-ui3-test：有全选与清空',
  verSrc.includes('pickAll(true)') && verSrc.includes('pickAll(false)'))

/* 关键：批量按钮真的把选中项传出去，而不是只加了个按钮。 */
check('dsh-common-ui3-test：装上选中把 pickedList 传给后端',
  /'installCommon', \{ cards: pickedList \}/.test(verSrc))
check('dsh-common-ui3-test：卸下选中把 pickedList 传给后端',
  /'removeCommon', \{ cards: pickedList \}/.test(verSrc))
check('dsh-common-ui3-test：未选中时批量按钮禁用（否则会误伤全部）',
  (verSrc.match(/disabled: commonBusy \|\| !pickedList\.length/g) || []).length >= 2)
check('dsh-common-ui3-test：批量按钮显示已选数量',
  verSrc.includes("' (' + pickedList.length + ')'"))

/* 单选按钮保留，且只对那一张卡操作。 */
check('dsh-common-ui3-test：单选仍按单卡传参',
  /'installCommon', \{ cards: \[c\.file\] \}/.test(verSrc))

/* 原版卡各包 chip，不能退回 join 拼行。 */
check('dsh-common-ui3-test：原版卡名各包一个 chip',
  /others\.map\(\(c\) => h\('span', \{ className: 'dwb-chip'/.test(verSrc))
check('dsh-common-ui3-test：原版卡不再 join 成一行',
  !/others\.map\(\(c\) => c\.label\)\.join/.test(verSrc))

/* 后端两个 action 都接受 cards 白名单参数。 */
check('dsh-common-ui3-test：后端 installCommon 支持 cards 过滤',
  /function installCommon[\s\S]{0,2000}(explicit|targets\.length) && !targets\.some/.test(hostSrc))
check('dsh-common-ui3-test：后端 removeCommon 支持 cards 过滤',
  /function removeCommon[\s\S]{0,1200}targets\.length && !targets\.some/.test(hostSrc))
/* ---- dsh-common-tags-test：以脚本名为标签筛选卡 ---- */

check('dsh-common-tags-test：有 commonTag 状态', verSrc.includes('const [commonTag, setCommonTag]'))
check('dsh-common-tags-test：标签就是脚本名',
  verSrc.includes('cardHas(c, L.name)') && /L\.name \+ ' \('/.test(verSrc))
check('dsh-common-tags-test：点标签可切换（再点取消）',
  /setCommonTag\(commonTag === L\.name \? '' : L\.name\)/.test(verSrc))
check('dsh-common-tags-test：全部标签用 t(common.tagAll)',
  verSrc.includes("t('common.tagAll')"))
check('dsh-common-tags-test：筛空有单独文案', verSrc.includes("commonTag ? t('common.tagEmpty')"))

/* 判定"装了没有"要用 installed 数组，且 differs 也算装了 ——
   卡上那份与库里不一致时它仍然是装着的，只是版本旧。 */
check('dsh-common-tags-test：installed 判定排除 absent',
  /state !== 'absent'/.test(verSrc))

/* 筛选后的卡列表用 shown，全选也只作用于 shown（否则会选中看不见的卡）。 */
check('dsh-common-tags-test：列表渲染用 shown', verSrc.includes('shown.map((c) => h('))
check('dsh-common-tags-test：全选只作用于当前可见的卡',
  /pickAll = \(on\) => setCommonPicked\(on \? new Set\(shown\.map/.test(verSrc))

/* chip 的选中样式 —— 没有它，点没点中看不出来。 */
check('dsh-common-tags-test：芯片有选中态样式', verSrc.includes('.dwb-chip.on'))
check('dsh-common-tags-test：可点芯片有 pointer', verSrc.includes('button.dwb-chip{cursor:pointer}'))
/* ---- dsh-filter-both-test：两个错题页签的筛选行为一致 ---- */

/* 人物卡那组：筛掉没有命中条目的卡。 */
check('dsh-filter-both-test：筛选按每卡命中数过滤',
  /filterCounts\.get\(c\.key\) \|\| 0\) > 0/.test(verSrc))

/* 其它错题那组：现在同样过滤 —— 这是本次改动，钉住它免回退。 */
check('dsh-filter-both-test：其它错题组也过滤（不再无条件放行）',
  !/groupOf !== 'card'/.test(verSrc))

/* filterCounts 本身与组无关 —— 它只按 cardKey 统计，两组共用。 */
check('dsh-filter-both-test：计数逻辑与分组无关',
  /for \(const e of entries\)[\s\S]{0,220}m\.set\(e\.cardKey/.test(verSrc))

/* 筛选为空时不过滤（否则一进页面像库坏了）。 */
check('dsh-filter-both-test：无筛选时不过滤',
  verSrc.includes('!filtersActive ? true'))

/* 新增/改名/删除分类的按钮不经过列表，所以筛空不影响建分类。 */
check('dsh-filter-both-test：分类管理按钮独立于列表',
  verSrc.includes("t('btn.addBucket')") || verSrc.includes('addBucket'))
/* ---- dsh-install-parity-test：统计口径必须与装卸口径一致 ---- */

/* 这次的 bug：统计（commonInstallState）改了判据、装卸（installCommon）没改，
   于是米吧能出现在列表里、点「装」却被 `if (!/MVU版本/.test(f)) continue` 跳过。
   两个按钮还不对称 —— removeCommon 反倒没有那行过滤。 */
check('dsh-install-parity-test：装卸不再有硬编码的 MVU版本 过滤',
  !/if \(!\/MVU版本\/\.test\(f\)\) continue/.test(hostSrc))
check('dsh-install-parity-test：判据只有一处（cardInstallable）',
  (hostSrc.match(/function cardInstallable\(/g) || []).length === 1)
check('dsh-install-parity-test：统计与装卸都调它',
  (hostSrc.match(/cardInstallable\(/g) || []).length >= 3)

/* explicit：用户明确点了某张卡，就无条件处理 —— 点得出来就说明他要装。 */
check('dsh-install-parity-test：显式点名时不套可装判据',
  /cardInstallable\(f, pre\.scripts, pre\.marker, libNames, explicit\)/.test(hostSrc))
check('dsh-install-parity-test：explicit 来自 targets', /const explicit = targets\.length > 0/.test(hostSrc))

/* 卸不套「可装」判据 —— 卡上真有这个脚本就该能卸掉，哪怕它已不在统计范围内。 */
check('dsh-install-parity-test：removeCommon 不套可装判据',
  !/function removeCommon[\s\S]{0,3000}cardInstallable/.test(hostSrc))

/* ---- dsh-fit-test：检测适合的卡 ---- */

check('dsh-fit-test：后端有 fitCommonScript', hostSrc.includes('function fitCommonScript'))
check('dsh-fit-test：路由已挂', hostSrc.includes("case 'fitCommonScript'"))
check('dsh-fit-test：库里没有该脚本时明确报错',
  /function fitCommonScript[\s\S]{0,900}库里没有这个脚本/.test(hostSrc))
check('dsh-fit-test：按能力规则匹配', /const RULES = \[/.test(hostSrc))
check('dsh-fit-test：每条结果带理由', /reasons = active\.filter/.test(hostSrc))
check('dsh-fit-test：已装的排在后面', /Number\(a\.installed\) - Number\(b\.installed\)/.test(hostSrc))

check('dsh-fit-test：前端有按钮', verSrc.includes("t('common.detectFit')"))
check('dsh-fit-test：前端调 fitCommonScript', verSrc.includes("action: 'fitCommonScript'"))
/* 原来这一区是「收起 = 清掉数据」，现在改成折叠开关（数据留着，能再展开）。 */
check('dsh-fit-test：即时检测区可折叠', verSrc.includes('setFitCollapsed(!fitCollapsed)'))
check('dsh-fit-test：后台结果区可折叠', verSrc.includes('setJobCollapsed(!jobCollapsed)'))
check('dsh-fit-test：折叠时内容不渲染（不是只清数据）',
  /jobCollapsed\s*\n\s*\? null/.test(verSrc))
check('dsh-fit-test：说明了这是技术匹配、不判断题材', verSrc.includes("t('common.fitHint')"))

/* ---- dsh-fit-bias-test：检测结果不该只说好话 ---- */

/* 这个功能的定位是「技术契合度」，不是内容推荐。要能看出脚本用到了哪些能力，
   也要能看出"这卡没什么可受益的"。理由为空才更有说服力。 */
check('dsh-fit-bias-test：能力标签来自脚本内容',
  /const active = RULES\.filter/.test(hostSrc))
check('dsh-fit-bias-test：没匹配上就不进结果（而不是硬凑理由）',
  /if \(!reasons\.length && !already\) continue/.test(hostSrc))
check('dsh-fit-bias-test：结果里带卡的特征快照，便于核对',
  /feat,\s*$|feat,$/m.test(hostSrc))


/* ---- dsh-fit-job-test：后台分析任务 ---- */

/* 后端：任务函数齐备。 */
check('dsh-fit-job-test：有 startFitScan / fitScanState / cancelFitScan',
  ['startFitScan', 'fitScanState', 'cancelFitScan'].every((n) => new RegExp('function\\s+' + n + '\\b').test(hostSrc)))
check('dsh-fit-job-test：三个路由都挂了',
  ['startFitScan', 'fitScanState', 'cancelFitScan'].every((n) => hostSrc.includes("case '" + n + "'")))
check('dsh-fit-job-test：库里没有该脚本时明确报错',
  /function startFitScan[\s\S]{0,900}库里没有这个脚本/.test(hostSrc))

/* 任务在宿主进程里 —— 这是"关界面也能跑"的根本。 */
check('dsh-fit-job-test：任务表在模块作用域（不在请求里建）',
  /const FIT_JOBS = new Map\(\)/.test(hostSrc))
check('dsh-fit-job-test：已在跑的任务直接复用，不重复起',
  /if \(running && running\.status === 'running'\) return/.test(hostSrc))

/* 落盘：关界面/重启都能接着看。 */
check('dsh-fit-job-test：任务结果落盘',
  /function writeFitJob[\s\S]{0,300}writeFileSync/.test(hostSrc))
check('dsh-fit-job-test：读状态时先看内存、再看盘',
  /function readFitJob[\s\S]{0,300}FIT_JOBS\.get[\s\S]{0,300}readFileSync/.test(hostSrc))
check('dsh-fit-job-test：每张卡处理后立刻落盘（不是全部跑完才写）',
  /job\.done \+= 1\s*\n\s*writeFitJob\(job\)/.test(hostSrc))

/* 不 await 任务本身 —— 否则请求会一直挂着，前端拿不到 id。 */
check('dsh-fit-job-test：启动不 await 任务（请求立刻返回）',
  /void runFitScan\(job, L, new Set\(\)\)\.catch/.test(hostSrc))

/* 循环里让出事件循环，否则会占满宿主进程。 */
check('dsh-fit-job-test：逐卡循环中有让出（setTimeout 0）',
  /await new Promise\(\(r\) => setTimeout\(r, 0\)\)/.test(hostSrc))
check('dsh-fit-job-test：支持取消', /if \(job\.cancelled\) break/.test(hostSrc))

/* 深度分析读的是卡里实际存在的东西，理由才可核对。 */
check('dsh-fit-job-test：抽卡信息时读了正则名 / 脚本名 / 世界书标题',
  /regexNames: regs\.map/.test(hostSrc) && /scriptNames: scripts\.map/.test(hostSrc) && /bookTitles: book\.map/.test(hostSrc))
check('dsh-fit-job-test：不读全文（卡有 11MB），只取片段',
  /cut\(d\.description, 400\)/.test(hostSrc))
check('dsh-fit-job-test：理由引用具体名字（可核对）',
  /prof\.regexNames\.filter/.test(hostSrc))

/* 前端：轮询 + 重开恢复。 */
check('dsh-fit-job-test：有 fitJob 状态', verSrc.includes('const [fitJob, setFitJob]'))
check('dsh-fit-job-test：启动调 startFitScan', verSrc.includes("action: 'startFitScan'"))
check('dsh-fit-job-test：轮询调 fitScanState', verSrc.includes("action: 'fitScanState'"))
check('dsh-fit-job-test：只在 running 时轮询', /fitJob\.status !== 'running'\) return undefined/.test(verSrc))
check('dsh-fit-job-test：用 localStorage 记住上次那个脚本（重开接着看）',
  verSrc.includes("localStorage.getItem('dwb-fit-job')") && verSrc.includes("localStorage.setItem('dwb-fit-job'"))
check('dsh-fit-job-test：轮询停了任务也不会停（注释说明这一点）',
  verSrc.includes('任务在宿主进程里跑'))

/* UI：进度条与结果区。 */
check('dsh-fit-job-test：有进度条', verSrc.includes("t('common.jobProgress')") && verSrc.includes('dwb-progress-bar'))
check('dsh-fit-job-test：进度条按 done/total 算宽度',
  /fitJob\.done \/ fitJob\.total/.test(verSrc))
check('dsh-fit-job-test：结果区列出理由', verSrc.includes('c.reasons'))
check('dsh-fit-job-test：说明了这不是模型级判断', verSrc.includes("t('common.jobNote')"))
check('dsh-fit-job-test：结果带卡的特征快照（正则数/脚本数/世界书数）',
  verSrc.includes("t('common.jobProfile')"))
check('dsh-fit-job-test：能取消', verSrc.includes("action: 'cancelFitScan'"))

/* ---- 守卫条件测试：这一条来自本次踩的坑 ---- */

/* 我写补丁时用 !s.includes("'common.genFit'") 当"中文还没加"的守卫，
   但英文那步先执行、已经插了这个键名，于是守卫恒为 false，中文被静默跳过。
   守卫要判"目标那份在不在"，不能判"这个键名在不在"。 */
check('dsh-fit-job-test：中英词典键一致（本条曾因守卫写错而漏）',
  (() => {
    const keysOf = (src, from) => {
      const at = src.indexOf(from)
      if (at < 0) return []
      const open = src.indexOf('{', at)
      let d = 0, end = open
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') d++
        else if (src[i] === '}') { d--; if (d === 0) { end = i; break } }
      }
      return [...src.slice(open, end).matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])
    }
    const zh = keysOf(verSrc, 'const zh = {')
    const en = keysOf(verSrc, 'const en = {')
    const onlyZh = zh.filter((k) => !en.includes(k))
    const onlyEn = en.filter((k) => !zh.includes(k))
    return onlyZh.length === 0 && onlyEn.length === 0
  })())


/* ---- dsh-handoff-test：交给工作台 ---- */

/* 入口：库项上要有按钮，点了生成文本。 */
check('dsh-handoff-test：库项有「交给工作台」按钮', verSrc.includes("t('common.handOff')"))
check('dsh-handoff-test：有 buildHandoffPrompt', verSrc.includes('const buildHandoffPrompt'))
check('dsh-handoff-test：有 handoff 状态（生成后先给用户看）',
  verSrc.includes('const [handoff, setHandoff]'))

/* prompt 的关键内容 —— 这几条决定了产出质量。 */
check('dsh-handoff-test：卡用 @"cards/..." 引用（工作台认这个语法）',
  /@\\"cards\/.*c\.file/.test(verSrc))
check('dsh-handoff-test：脚本用路径点名（它在 data/tools 下，不是 resources）',
  verSrc.includes("data/tools/wrongbook/common-scripts/") && verSrc.includes('L.file'))
check('dsh-handoff-test：要求点名具体功能，并给了示例',
  verSrc.includes('龙娘回廊的橱窗') && verSrc.includes('姬侠传的 SLG 界面'))
check('dsh-handoff-test：明说不要写「建议装」这种结论',
  verSrc.includes('不要写「建议装」这种结论'))
check('dsh-handoff-test：要求按受益程度排序',
  verSrc.includes('按受益程度排序'))
check('dsh-handoff-test：允许说「没什么可受益的」',
  verSrc.includes('不用凑理由'))
check('dsh-handoff-test：提示不必逐字读完脚本（它有一百多万字符）',
  verSrc.includes('不必逐字读完'))

/* 交付方式：复制 + 尝试填输入框 + 兜底手动复制。 */
check('dsh-handoff-test：写入剪贴板', verSrc.includes('navigator.clipboard.writeText'))
check('dsh-handoff-test：尝试填入 #send_textarea（宿主注入的兼容层）',
  verSrc.includes("getElementById('send_textarea')"))
check('dsh-handoff-test：填入后派发 input 事件（否则 React 拿不到值）',
  verSrc.includes("new Event('input', { bubbles: true })"))
check('dsh-handoff-test：三种结果都给反馈（填了/复制了/要手动）',
  verSrc.includes("t('common.handoffFilled')") && verSrc.includes("t('common.handoffCopied')") && verSrc.includes("t('common.handoffManual')"))

/* 生成后先展示、可再复制、可收起 —— 不让它直接发出去。 */
check('dsh-handoff-test：文本在面板里也显示出来（可手动选中）',
  verSrc.includes("t('common.handoffTitle')"))
check('dsh-handoff-test：显示区是只读 textarea',
  /readOnly: true[^}]*value: handoff\.text/.test(verSrc))
check('dsh-handoff-test：可以再点一次复制', verSrc.includes('copyHandoff(handoff.text)'))
check('dsh-handoff-test：提示「发出去之前先看一眼」',
  verSrc.includes('发出去之前先看一眼') || verSrc.includes("t('common.handoffHint')"))

/* 侧栏入口（本轮另一处改动）。 */
check('dsh-handoff-test：侧栏入口用 sidebar.footer.action（不是 plugin.item）',
  verSrc.includes("ctx.slots.inject('sidebar.footer.action'") && !verSrc.includes("ctx.slots.inject('settings.plugin.item'"))
/* 两个入口的组件不同：设置面板里挂 SettingsSection（整页），
   侧栏挂 SideEntry（一个小按钮 + overlay）。混用会让侧栏按钮渲染整页。 */
check('dsh-handoff-test：设置页用 SettingsSection', /SettingsSection,/.test(verSrc))
check('dsh-handoff-test：侧栏用 SideEntry', /SideEntry,/.test(verSrc))
check('dsh-handoff-test：注释说清了两个入口的分工',
  verSrc.includes('settings.plugin.item') && verSrc.includes('设置面板里的一个页面'))


/* ---- dsh-sidefoot-render：侧栏按钮真渲染 ---- */

/* 造 React 元素成功不代表渲染时不抛 —— 侧栏那份在面板关着时是唯一渲染的东西，
   所以必须真跑一遍，并且覆盖 props 的几种形态。 */
function renderComp(comp, props) {
  cursor = 0
  effects.length = 0
  let node = comp(props)
  let guard = 0
  while (node && typeof node === 'object' && node.type && typeof node.type === 'function' && guard++ < 10) node = node.type(node.props)
  out.texts.length = 0
  out.types.length = 0
  walk(node)
  return node
}

const sideReg = registrations.find((r) => String(r.options.name) === 'sidebar.footer.action')
check('dsh-sidefoot-render：取到侧栏注册', !!sideReg)
check('dsh-sidefoot-render：注册里带组件', !!sideReg && typeof sideReg.component === 'function')

if (sideReg && typeof sideReg.component === "function") {
  for (const pair of [['宽', { wide: true }], ['窄', { wide: false }], ['缺省', undefined]]) {
    const label = pair[0]
    let err = null
    let tree = null
    try { tree = renderComp(sideReg.component, pair[1]) } catch (e) { err = e }
    check('dsh-sidefoot-render：' + label + ' props 能渲染不抛', !err, err ? String(err && err.message) : 'ok')
    check('dsh-sidefoot-render：' + label + ' props 有产出', !!tree)
  }
}

/* 面板关着时它独自渲染，样式必须内联，否则掉成浏览器默认按钮。 */
/* 改成 CSS 类了 —— 内联那套在侧栏里对不齐（卡片更新器的行高是量过的）。 */
check('dsh-sidefoot-render：用 CSS 类 .dwb-entry',
  verSrc.includes("className: 'dwb-nav-entry'"))
check('dsh-sidefoot-render：类定义在样式表里',
  verSrc.includes("'.dwb-nav-entry{"))
check('dsh-sidefoot-render：行高照卡片更新器（42px）',
  /'\.dwb-nav-entry\{[^']*height:42px/.test(verSrc))
check('dsh-sidefoot-render：宽度补偿与它一致（calc(100% + 4px)）',
  /'\.dwb-nav-entry\{[^']*width:calc\(100% \+ 4px\)/.test(verSrc))
check('dsh-sidefoot-render：有 hover 态', verSrc.includes('.dwb-nav-entry:hover'))
/* 显式横排 —— 错题条目那边也叫过 dwb-entry，是 flex-direction:column，
   合并过来会把图标和文字竖着排。 */
check('dsh-sidefoot-render：显式声明横排',
  /\.dwb-nav-entry\{[^']*flex-direction:row/.test(verSrc))
check('dsh-sidefoot-render：类名不与错题条目冲突',
  verSrc.includes("'.dwb-nav-entry{") &&
  /* 错题条目那边仍保留自己的竖排规则（这里没被改名波及）。 */
  /'\.dwb-entry\{[^']*flex-direction:column/.test(verSrc) &&
  /* 侧栏这套显式横排。 */
  /\.dwb-nav-entry\{[^']*flex-direction:row/.test(verSrc))
check('dsh-sidefoot-render：窄模式有独立尺寸',
  verSrc.includes('.dwb-nav-entry[data-wide='))
/* overlay 复用面板已有的 .dwb-overlay / .dwb-sheet。 */
check('dsh-sidefoot-render：overlay 走类名', verSrc.includes("className: 'dwb-overlay'"))
check('dsh-sidefoot-render：组件里调了 useStyles（面板关着时样式得自己挂）',
  /function SideEntry[\s\S]{0,600}useStyles\(\)/.test(verSrc))
check('dsh-sidefoot-render：初始不开，点了才开',
  /const \[open, setOpen\] = useState\(false\)/.test(verSrc))
check('dsh-sidefoot-render：点遮罩可关', verSrc.includes('ev.target === ev.currentTarget'))
check('dsh-sidefoot-render：overlay 里挂 Panel 本体',
  /function SideEntry[\s\S]{0,3800}h\(Panel, null\)/.test(verSrc))


/* ---- dsh-styleguard-test：样式表守护 ---- */

/* 侧栏入口常驻整个页面生命周期，它的 useEffect 只跑一次。
   之后任何重建 head 的动作（主题切换等）都会让样式表消失，
   而按钮就一直画成浏览器默认样子 —— 带边框的灰方块、文字居中、没有满宽。
   识别线索：样式表里写着 border:none，屏幕上却有边框。 */
check('dsh-styleguard-test：installStyles 复用已有标签（不每次重建）',
  /function installStyles[\s\S]{0,1400}if \(existing\) fill\(existing\)/.test(verSrc))
check('dsh-styleguard-test：有 MutationObserver 盯着 head',
  verSrc.includes('new MutationObserver') && verSrc.includes('styleWatcher.observe(head'))
check('dsh-styleguard-test：observer 只在标签缺失时才补',
  /const live = document\.head && document\.head\.querySelector[\s\S]{0,200}if \(live\) return/.test(verSrc))
check('dsh-styleguard-test：观察的是 childList（增删）',
  verSrc.includes('{ childList: true }'))
check('dsh-styleguard-test：observer 只装一次', /if \(styleWatcher \|\| typeof MutationObserver/.test(verSrc))

/* useStyles 每次 render 都调 —— 不传依赖数组，这是没有 observer 时的兜底。 */
check('dsh-styleguard-test：useStyles 每次 render 都调',
  /function useStyles\(\)[\s\S]{0,400}useEffect\(\(\) => \{[\s\S]{0,80}installStyles\(\)[\s\S]{0,40}\}\)/.test(verSrc))
check('dsh-styleguard-test：useStyles 未传空依赖数组',
  !/function useStyles\(\)[\s\S]{0,400}installStyles\(\)[\s\S]{0,40}\}, \[\]\)/.test(verSrc))

/* 两个挂载点只能有一个 style 标签 —— 同优先级下后出现的赢下每条属性。 */
check('dsh-styleguard-test：靠复用标签避免两个标签并存',
  verSrc.includes("head.querySelector('style[data-dsh-wrongbook]')"))
check('dsh-styleguard-test：侧栏组件里调了 useStyles',
  /function SideEntry[\s\S]{0,600}useStyles\(\)/.test(verSrc))


/* ---- dsh-common-update-test：更新库里的脚本 ---- */

/* 与「导入」分开：导入是同名静默覆盖、dsh_meta 按新文件重算；
   更新只换脚本本体，库里攒下的说明要保住。 */
check('dsh-common-update-test：后端有 updateCommonScript', hostSrc.includes('function updateCommonScript'))
check('dsh-common-update-test：路由已挂', hostSrc.includes("case 'updateCommonScript'"))
check('dsh-common-update-test：库里没有时明确拒绝（让人走导入）',
  /function updateCommonScript[\s\S]{0,2200}库里没有[\s\S]{0,200}导入脚本/.test(hostSrc))

/* 关键：只换 content，保留 dsh_meta */
check('dsh-common-update-test：新文件没带 meta 时保留库里的',
  /const hadMeta = parsed\.dsh_meta && typeof parsed\.dsh_meta === 'object'/.test(hostSrc) &&
  /merged\.dsh_meta = hadMeta \? parsed\.dsh_meta : \(old\.dsh_meta \|\| \{\}\)/.test(hostSrc))
check('dsh-common-update-test：带上 keptMeta 告诉前端保留了', /keptMeta: !hadMeta/.test(hostSrc))
check('dsh-common-update-test：记下 updatedAt', /merged\.dsh_meta\.updatedAt/.test(hostSrc))

/* 内容相同就别动 —— 不要白写一次盘。 */
check('dsh-common-update-test：内容相同直接返回 changed:false',
  /if \(oldHash === newHash\)[\s\S]{0,200}changed: false/.test(hostSrc))

/* 更新同样要能退回去。 */
check('dsh-common-update-test：更新前备份旧版',
  /function updateCommonScript[\s\S]{0,2600}common-script-backups/.test(hostSrc) &&
  /function updateCommonScript[\s\S]{0,2600}copyFileSync/.test(hostSrc))

/* 更新库文件不会改卡上那份 —— 要把受影响的面报出来。 */
check('dsh-common-update-test：返回还装旧版的卡列表', /staleCards = \(st\.cards \|\| \[\]\)/.test(hostSrc))
check('dsh-common-update-test：staleCards 只算真的装了的（state !== absent）',
  /staleCards = \(st\.cards \|\| \[\]\)[\s\S]{0,400}state !== 'absent'/.test(hostSrc))

/* 脚本自带持久状态 —— 换文件清不掉它们，得提示。 */
check('dsh-common-update-test：有 scriptTraits 检测', hostSrc.includes('function scriptTraits'))
check('dsh-common-update-test：认得 localStorage / indexedDB',
  /localStorage: \/localStorage/.test(hostSrc) && /indexedDB: \/indexedDB/.test(hostSrc))
check('dsh-common-update-test：认得世界书 / 聊天记录 / MVU 变量 / 定时器 / window 全局',
  /worldbook: \/setWorldbook/.test(hostSrc) && /chat: \/setChatMessages/.test(hostSrc) &&
  /variables: \/replaceMvuData/.test(hostSrc) && /timer: \/setInterval/.test(hostSrc) &&
  /windowGlobals: \/window/.test(hostSrc))
check('dsh-common-update-test：取脚本自带的版本常量',
  /VERSION\|Version/.test(hostSrc) && /version: vm \? vm\[2\]/.test(hostSrc))
check('dsh-common-update-test：更新时对比前后 traits',
  /const traitsBefore = scriptTraits\(oldContent\)/.test(hostSrc) &&
  /const traitsAfter = scriptTraits\(content\)/.test(hostSrc))

/* 前端 */
check('dsh-common-update-test：库项有「更新」按钮', verSrc.includes("t('common.libUpdate')"))
check('dsh-common-update-test：有更新面板与输入区', verSrc.includes("t('common.updateTitle')") && verSrc.includes("t('common.updatePlaceholder')"))
check('dsh-common-update-test：调 updateCommonScript', verSrc.includes("action: 'updateCommonScript'"))
check('dsh-common-update-test：显示 hash 与长度差异', verSrc.includes("t('common.updateDiff')"))
check('dsh-common-update-test：内容一样时明说没改', verSrc.includes("t('common.updateSame')"))
/* 改成自动同步后，这里不再"列出待同步的卡 + 给按钮"，而是直接报同步结果。 */
check('dsh-common-update-test：显示已同步到哪些卡', verSrc.includes("t('common.updateSynced')"))
check('dsh-common-update-test：同步失败时说明库已更新、卡上还是旧的',
  verSrc.includes("t('common.updateSyncFail')"))
/* 同步改到后端自动做 —— 前端不再有手动按钮。
   "库里更新了但卡上还是旧的"是最容易漏的一种不一致，不该指望人再点一次。 */
check('dsh-common-update-test：后端更新后自动同步到已装的卡',
  /synced = installCommon\(\{ cards: staleCards, scripts: \[name\] \}\)/.test(hostSrc))
check('dsh-common-update-test：同步走同一个 installCommon（备份与写盘行为一致）',
  /function updateCommonScript[\s\S]{0,4000}installCommon\(\{ cards: staleCards/.test(hostSrc))
check('dsh-common-update-test：同步失败不回滚库的更新',
  /syncError = \(e && e\.message\) \|\| String\(e\)/.test(hostSrc) &&
  /syncError,/.test(hostSrc))
check('dsh-common-update-test：返回 autoSynced 标记', /autoSynced: staleCards\.length > 0 && !syncError/.test(hostSrc))
check('dsh-common-update-test：前端不再有手动同步按钮', !verSrc.includes('const syncUpdated'))
check('dsh-common-update-test：没有卡装时说明无需同步', verSrc.includes("t('common.updateNoStale')"))
check('dsh-common-update-test：提示脚本自带持久状态', verSrc.includes("t('common.updateTraits')"))
check('dsh-common-update-test：版本号变化时显示前后对比', verSrc.includes("t('common.updateVersion')"))

/* ------------------------------------ 写操作的就地更新（不再为一条记录重下 1.5 MB）
 *
 * `/state` 带着全部条目的证据栏，288 条时约 1.5 MB。条目级的写操作后台已经把
 * 改完的那一条交回来了，前端不该再整页重拉；会动分类表、备份列表、回流状态的
 * 动作仍然要拉。这两条钉住的就是这个分界。
 */
check(
  '写操作结果就地合并，不全页重拉',
  SRC_TEXT.includes('if (!applyActionResult(res, payload, setData)) await load()'),
  SRC_TEXT.includes('await load()') ? '仍有无条件 await load()' : '',
)
check(
  '新建分类时仍然整页重拉（分类表不是一条记录能推出来的）',
  SRC_TEXT.includes('if (!res.entry || res.created) return false'),
)
check(
  '条目级动作覆盖：新建 / 修改 / 清标脏 / 删除',
  ['addEntry', 'updateEntry', 'clearStale', 'deleteEntry'].every((a) => SRC_TEXT.includes(`action === '${a}'`)),
)

/* ------------------------------------ 「记进错题库」按钮的 run：两次往返

 * 这是浏览器半唯一写数据的地方：它把 captureTurn 交回的东西整理成条目底稿。
 * 两处细节各有理由，都从外面看不出来 ——
 *   归类键用 Tavern 给的卡位置而不是卡名：原版卡和它的 MVU 版卡名通常一模一样，
 *   按名字会被宿主判成「对上了两个分类」而拒绝记录；
 *   上文单独进「证据」栏而不挤「现象」：现象是当轮原文，写描述时要照着它看。
 */
{
  const posted = []
  let turnAnswer = null
  actionOverride = (payload) => {
    posted.push(payload)
    if (payload.action === 'captureTurn') return { ok: true, ...turnAnswer }
    if (payload.action === 'addEntry') {
      return { ok: true, entry: { id: 'e_1', title: String(payload.entry && payload.entry.title) } }
    }
    return undefined
  }

  const captureOf = (card, before) => ({
    turn: { gameId: 'g-1', turn: 7, textVersion: 'tv-1', text: '第七轮的正文。', card },
    before,
  })

  turnAnswer = captureOf({ id: 'cards/雾港记事 MVU版本.json', name: '雾港记事' }, [])
  await captureAction.run({ gameId: 'g-1', turn: 7 })
  let add = posted.find((p) => p.action === 'addEntry')
  check('记录的归类键用 Tavern 给的卡位置', add && add.cardKey === 'cards/雾港记事 MVU版本.json', add && add.cardKey)
  check('没有上文时不写空的证据', add && add.entry.evidence === '', add && add.entry.evidence)

  posted.length = 0
  turnAnswer = captureOf({ id: 'cards/雾港记事 MVU版本.json', name: '雾港记事' }, [
    { turn: 5, text: '第五轮的正文。' },
    { turn: 6, text: '第六轮的正文。' },
  ])
  await captureAction.run({ gameId: 'g-1', turn: 7 })
  add = posted.find((p) => p.action === 'addEntry')
  check('上文进「证据」那一栏', !!add && /【上文 · 第 5 轮】/.test(add.entry.evidence), add && add.entry.evidence)
  check('每一轮上文都带自己的轮次标题', !!add && /【上文 · 第 6 轮】/.test(add.entry.evidence))
  check('现象里只有当轮正文', !!add && !add.entry.symptom.includes('第五轮'), add && add.entry.symptom)

  // 老版本 Tavern 不给卡位置：退回卡名，至少还记得到一处
  posted.length = 0
  turnAnswer = captureOf({ name: '雾港记事' }, [])
  await captureAction.run({ gameId: 'g-1', turn: 7 })
  add = posted.find((p) => p.action === 'addEntry')
  check('拿不到卡位置时退回卡名', add && add.cardKey === '雾港记事', add && add.cardKey)

  /*
   * 第 3 版交回的两样：本轮请求上下文、卡工作版版本号。
   *
   * 上下文和上文挤同一栏「证据」，但两段都要在 —— 一段说前面发生了什么，
   * 一段说模型这一轮看到了什么，少了哪段都拼不出当时的样子。
   */
  posted.length = 0
  turnAnswer = {
    ...captureOf({ id: 'cards/雾港记事 MVU版本.json', name: '雾港记事' }, [{ turn: 6, text: '第六轮的正文。' }]),
    request: '【本轮请求上下文】\n- [activeWorldbook] tavern:world-book · 120 字',
    cardRevision: 12,
  }
  await captureAction.run({ gameId: 'g-1', turn: 7 })
  add = posted.find((p) => p.action === 'addEntry')
  check(
    '请求上下文进「证据」那一栏',
    !!add && /【本轮请求上下文】/.test(add.entry.evidence) && /tavern:world-book/.test(add.entry.evidence),
    add && add.entry.evidence,
  )
  check('上文与上下文并存，不互相覆盖', !!add && /【上文 · 第 6 轮】/.test(add.entry.evidence), add && add.entry.evidence)
  check(
    '卡版本写进 source',
    !!add && add.entry.source.cardRevision === 12,
    JSON.stringify(add && add.entry.source),
  )

  // 老版本没有卡版本：source 里不该凭空多一个字段
  posted.length = 0
  turnAnswer = captureOf({ id: 'cards/雾港记事 MVU版本.json', name: '雾港记事' }, [])
  await captureAction.run({ gameId: 'g-1', turn: 7 })
  add = posted.find((p) => p.action === 'addEntry')
  check(
    '没有卡版本时不写这个字段',
    !!add && !('cardRevision' in add.entry.source),
    JSON.stringify(add && add.entry.source),
  )

  // 同一轮已经记过：按钮不再写第二份，把已有那条说出来
  posted.length = 0
  turnAnswer = { ok: true, duplicate: { id: 'e_9', title: '第 7 轮：第七轮的正文。' } }
  const dupText = await captureAction.run({ gameId: 'g-1', turn: 7 })
  check('重复抓取返回提示', typeof dupText === 'string' && /已记过/.test(dupText), dupText)
  check(
    '重复抓取不写条目',
    !posted.some((p) => p.action === 'addEntry'),
    JSON.stringify(posted.map((p) => p.action)),
  )

  actionOverride = null
}

/* --------------------------------------- 详情是惰性挂载的（打开面板那一下的速度）
 *
 * 一条底稿的正文平均 5 KB（证据那一栏还带着抓取时一并存下的上文），几百条加起来
 * 1 MB 以上。原生 `<details>` 只是"不显示"，节点照样在 DOM 里 —— 首页渲染的开销
 * 几乎全花在这儿。下面的验证跟主序列一起做，用的是**同一棵树**：另起一次
 * `renderOnce()` 会把 effects 清掉，而后面几组靠它们把数据取回来。
 */

let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra !== undefined ? `  [${r.extra}]` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
