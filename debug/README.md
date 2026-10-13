# debug

调试 DSH Tavern 时写的一批小脚本。它们不属于插件本体，是**排查工具** —— 读游玩证据、扫全库找同类问题、给宿主打补丁。

**每个脚本里都有硬编码的绝对路径**（`C:/Users/213123543/...`）。它们是按当前这台机器的目录结构写的，**换机器要改路径才能跑**。这点是刻意的：与其做一套参数化配置，不如让路径显式躺在文件顶部、一眼可见。

## 读游玩证据

一局游玩结束后，落盘在 `data/chats/<chatId>/`：

- `journals/NNNNNNNNNNNN-open.jsonl` —— 事件流。每一步操作、每次变量落库、每次渲染捕获都在这里；
- `snapshots/*.json.gz` —— 完整快照。

| 脚本 | 用途 |
| --- | --- |
| `read-journal.mjs <chatId>` | 事件流、MVU 初始化状态（`openingInitialization.completedAt` / `status`）、变量落库情况、`stat_data` 结构、脚本执行证据。省略 chatId 则读最近一局 |
| `read-display.mjs <chatId>` | 展开 `display.capture`：每次渲染的 `panelId` / `placement` / `dom` / `network` / `errors` |
| `find-bad-img.mjs <chatId>` | 归类失败的资源与网络请求。用来区分「真加载失败」和「空 `src` 被解析成当前页地址」 |

**判读要点**：`tavern-helper.*` 事件数回答的是「脚本做了什么」，`display.capture` 回答的是「界面变成了什么」。**两者合起来才能回答「脚本跑了没有」** —— 界面类脚本天然不产生 `tavern-helper.variables`。

## 扫全库找同类问题

| 脚本 | 用途 |
| --- | --- |
| `scan-host-api.mjs` | 第一版：找卡内脚本用了、但环境给不出的宿主 API |
| `scan-host-api2.mjs` | 加了「剔除卡自有定义」—— `window.x =` 声明过的函数不算缺口 |
| `scan-host-api3.mjs` | **用这个**。按「引用」匹配而不是「调用」匹配，并且区分 `TavernHelper.x`（永远是宿主转发）与 `window.x`（可能是卡自有） |
| `scan-legacy-protocol.mjs` | 找「宿主有 `状态更新规则`、但旧的正文协议条目还在启用」的卡 —— 那种卡每轮同时收到两套相反指令 |
| `scan-parent-window.mjs` | 找**经 `TavernHelper` 命名空间**取宿主接口的卡（`TavernHelper.generate` 这类） |
| `scan-window-calls.mjs` | 找**在跨层 window 上直接调**宿主接口的卡（`topWin.createChatMessages` 这类） |

**后两个是一对，缺一会漏一半** —— 卡取宿主接口有两条路径，只扫命名空间那条抓不到直接调 window 的。实测全库只有两张卡会这么做：龙娘回廊（经 `TavernHelper`）和艹🐎大作战（经 `topWin.createChatMessages`）。

**`scan-window-calls.mjs` 的识别条件要收紧**：第一版把所有 `let X = …window.parent…` 的 X 都当窗口别名，于是压缩代码里的单字母局部变量（`e` / `n` / `r` / `t`）全被算进来，接着 `get()` / `set()` / `replace()` 这类**每个对象都有的方法**涌进来，**一张卡报了 33 个假缺口**。现在要求变量名 ≥3 字符且含窗口语义（`parent` / `top` / `win` / `frame` / `host` / `outer` / `root`）。

**通用一条**：静态扫"跨作用域取全局"时，**变量名识别宁紧勿松**。松了会被通用方法名冲垮判据；紧一点最多漏几个，而漏掉的可以靠"读那张卡取 helper 的原文"补回来。

**为什么留了三个版本**：它们是同一条排查思路的迭代记录。`scan-host-api.mjs` 会误报（把卡自己的函数算成缺口），`scan-host-api2.mjs` 会漏报（`typeof TavernHelper.generate` 这种写法扫不到）。**改判据的代价看得见，比只留最后一个版本更有参考价值。**

## 宿主补丁

补丁改的是 `apps/dsh-tavern/` 下的宿主文件，**都需要重启 DSH 生效**。无参数运行 = 查状态；`--apply` 应用；`--revert` 还原。**全部幂等、自动备份**。

**⚠ 改 `lib/` 会被 build 覆盖。** `lib/client.js` 是 `src/client/*.js` 的编译产物，宿主有 `check:client` 比对两者（`package.json` 里是 `prepublishOnly` 与所有 e2e 的前置）。**只在 `lib/` 上打补丁会让它被判"已过期"** —— 这正是"补丁报告成功、语法也过、也重启了，功能却不生效"的根源，曾为此绕了六轮。

### 一键重打（推荐）

```bash
node debug/patch-all.mjs          # 只查状态
node debug/patch-all.mjs --apply  # 缺的自动重打
# 之后重启 DSH
```

**面板上也有入口**：设置 → 错题库 → **宿主补丁** 页签，里面有「一键重打宿主补丁」「检查补丁状态」两个按钮，以及一份**按"服务于谁"分组的清单**（哪个补丁服务于哪张卡）。

### 其实不用手动跑 —— 插件启动时会自己检查

`dsh-wrongbook` 的 host half 在加载后**异步跑一次 `patch-all.mjs --apply`**（幂等：没缺失就一个字节都不改）。它住在 `.dsh/plugins/` 下，**DSH 升级碰不到它**，所以由它来照看宿主文件。

- 一切就绪 → 日志一行 `宿主补丁已就位`；
- 刚补过 → 日志 `⚠ 宿主补丁缺失，已自动补齐 —— 重启 DSH 后生效`，面板那行也会跟着变；
- **限制**：补丁改的是**宿主文件**，而插件是在这些文件已被读进内存之后才跑的 —— **本次启动补上、下次启动生效**。

面板页签顶部会显示带时间戳的结果（`✓ 本次启动已自动检查：全部就位（13:25:41）`），**"补丁还在不在"因此有一个看得见的答案**，不用手动点一次才知道。

### 顺序不是装饰

`patch-all.mjs` 自己处理依赖顺序，但手动跑时要注意：

| 顺序 | 脚本 | 改哪里 |
| --- | --- | --- |
| **1** | `patch-src.mjs` | `src/client/main.js` + `src/client/opening-preview.js`（**九处**） |
| **1-b** | `patch-reasoning-notice.mjs` | `src/client/main.js` —— 思考通道轮次的界面标注（**必须在 build 之前**，和源码补丁同一批） |
| **2** | `bin/build-tavern-client.mjs` | 重建 `lib/client.js` —— **会覆盖 `lib/` 上的一切直接注入** |
| **3** | `patch.mjs` | `lib/domain/tavern-helper-scripts.js` |
| **4** | `patch-test.mjs` | `lib/domain/card-response-test.js` |
| **5** | `patch-reasoning-fallback.mjs` | `lib/index.js` —— 思考通道兜底（正文空时用思考内容续走）+ 会话消息声明来源 + 替换坐标修正（**五处**） |

**1 和 1-b 都改 `src/`，所以都必须在 build 之前跑完。** `patch-all.mjs` 已经这么排：任一 src 类补丁需要应用，就跑完它们再 build（`SRC_IDS`）。单独跑 1-b 只改源码，不 build 不生效。

**创意工坊的域名例外已经并入 `patch-src.mjs`（⑦⑧）**，不再单独跑 —— 它原来改 `lib/client.js`，让 `check:client` 永远报"已过期"（src 有改动、lib 多出源码里没有的东西，两者必然对不上）。**别再去跑 `workshop-direct/patch.mjs`**，那样会把状态弄回不一致。

### 各补丁的作用

| 脚本 | 改的文件 | 作用 |
| --- | --- | --- |
| `patch-src.mjs` | `src/client/*.js`（**源码，九处**） | ① 消息 iframe 的四个 helper；②③ 同层的 `generate`；④⑤ facade 清单与 `window.generate`；⑥ 开场预览层；⑦⑧ 创意工坊域名例外；⑨ 补 `frame-sizing` 的两行 include（宿主漏了） |
| `verify-srcpatch.mjs` | —— | 断言**九处**同时进了源码和产物、**三处 `generate` 包装的归一化数量正确**（main.js 2 处、opening-preview.js 1 处）、**产物里含升级带进来的五个符号**、**`include` 总数 ≥40**、旧 lib 标记已清除 |
| `workshop-direct/patch.mjs` | `lib/client.js` | 创意工坊域名直连（否则 Build / 人设 / 拓展 / 世界书 都是空的） |
| `patch.mjs` | `domain/tavern-helper-scripts.js` | 放开 MVU 卡（卡内无脚本的）的纯 API 测试 |
| `patch-test.mjs` | `domain/card-response-test.js` | 超时记录里保留前台正文 |
| `patch-reasoning-notice.mjs` | `src/client/main.js`（**源码，需 build**） | 整条消息只有思考块（没有非空 `text` 块）时，把折叠标题写成「思考过程（本轮没有正文：以下为模型的思考内容）」并**默认展开**。内容一字不动，只是不再让思考草稿冒充成品回答。**这是唯一能改变"用户看到的东西"的位置** —— 原因见下节 |
| `patch-reasoning-fallback.mjs` | `lib/index.js` | 正文为空、思考通道有内容时，用思考内容续走 `finalize` —— 不再判本轮失败并抛错。**判据是"内容有没有生成"，而不是"它写在哪个通道"**；并把会话消息整条替换为「来源声明 + 正文」（⑩-b），同时修正替换坐标（⑩-c：原先用 events 下标当 seq，路径一直空转）。五处可分别增量补齐，`--revert` 按状态反向撤 |
| `patch-card-generate.mjs` | **卡内脚本** | 给龙娘回廊补 `generate` 并适配宿主的 `ordered_prompts` 契约；**不受升级影响**。判据是"接管 + 自有标记"（`__dshNormalized`），不是"存在就不管" —— 见下节 |
| ~~`patch-frame-helper.mjs`~~ | ~~`lib/client.js`~~ | **已退役** —— 六处补丁住进 `src/` 后由 build 带进 `lib/`，它的旧标记检测会误报「只打了一半」，属正常，别去"修" |
| ~~`workshop-direct/patch.mjs`~~ | ~~`lib/client.js`~~ | **已退役** —— 域名例外并入 `patch-src.mjs` 的 ⑦⑧。跑它会让 `check:client` 重新报"已过期" |

### 四条已经踩过的坑（都是"看起来正常"的那种）

**① 用旧备份整体覆盖 → 把宿主升级一起回滚了。**

`*.bak-srcpatch` 是"第一次打补丁前"拍的快照，而升级会整份替换 `apps/dsh-tavern/`。备份一旦早于某次升级，覆盖就等于回退升级 —— 实测抹掉了 `@include-domain indexed-array.js` 等三行，缺 `createIndexedArrayApi`，**整个前端崩**（不只是某个功能坏）。

**要重置就用 `--revert`** —— 它按锚点只撤本脚本加的东西，宿主内容一律保留。判据（revert → apply 往返）：

```bash
grep -c "^\s*//\s*@include" src/client/main.js   # 40 → 38（只少 ⑨ 那两条）→ 40
```

**38 而不是 35**，说明升级带进来的 `indexed-array` 那三行没被碰。

**② `replace` 静默替换第一处 → 改错位置而日志说成功。**

三处 `generate` 包装的代码几乎相同，一行缩进一样的 `else if (prompt && ...) Object.assign(config, prompt);` 在多个包装里都有。`sub()` 现在**拒绝不唯一的锚点并报出重复行号**，改写改用 `slice` 拼接。

**同类判据**：改完数命中数 —— `grep -c "config.ordered_prompts =" main.js` 期望 2、`opening-preview.js` 期望 1。

**③ 判据没跟上改动 → 绿灯的范围变小了，而绿灯看起来一样。**

补丁从六处长到九处，检查还停在六处 —— ⑨ 有没有落进产物**没有任何断言覆盖**，输出照样 `[ ok ]`。**失败会喊，缩小不会。**

**现在的判据**：数量跟着 `checks.length` 走；另外两条有判别力的断言 —— **产物里查升级带进来的符号**（缺文件产生合法 JS，构建和语法都过）、**`include` 总数基线 40**（掉下来就说明被旧备份覆盖过）。

**注意判据要分形态**：`@include` 是构建时**展开**的，产物里搜不到那行文本 —— 源码列查指令、产物列查展开后的符号。**写成一样会在正常的树上报失败**，而人倾向于相信断言，于是去改本来对的东西。

**④ 把"内容走错通道"当成"内容不存在" → 明明生成了，整轮被判失败。**

模型偶尔把整段回答写进 reasoning 通道，`text` 通道为空。宿主的判据是：

```js
reasoningOnly: text === '' && reasoningText !== ''   // lib/domain/session-turn-result.js:36
```

而 `lib/index.js` 据此 `recordFailure` + **`throw`** —— 跟在后面的这两行**都不会执行**：

```js
const saved = await foregroundHandoff.finalize({ ... })
if (saved.reply) replaceAssistantReply(session, assistant, saved.reply.sessionText)
```

于是正文不进存档交接、展示管线（正则 / MVU 美化）不跑、状态栏挂一条"本轮运行失败"的红字 —— **可界面上明明已经把那段内容显示出来了**。

该问的判据是**内容有没有生成**，而不是**它写在哪个通道**。`patch-reasoning-fallback.mjs` 在正文空而思考通道有内容时用 `reasoningText` 续走 `finalize`，只留一行 `warn` 供追溯；真正一个字都没有时，原报错分支原样保留。

**兜底 ≠ 观感正确（⑩-b，2026-09-27 追加）。** 只兜底的时候，用户反馈还是"又截断了"——因为只兜底时界面显示的仍是那条**只有 `reasoning` 块、没有 `text` 块**的消息（`content kinds=["reasoning"]`），而模型 `stop` 时 reasoning 里本来就是半成品，看着就像说到一半停住。用户原话：*"思考过程被当成了回复显示，然后又截断了。"*

⑩-b 把兜底轮次的会话消息整条替换成「来源声明 + 正文」，正文一个字不动。

**⑩-c 真因：两处叠加，而且第一处根本不在这段代码里。**

**① 前置条件在卡片模式下恒假（真正的病因）。** 原来写的是 `if (saved.reply) replaceAssistantReply(...)`，而 `finalize` 在**卡片模式**下两条返回路径**都没有 `reply` 字段**：

```js
// lib/domain/turn-orchestration.js
if (mode === 'card' && cardPath === '') { ... return { saved:true, mode, changed, chatId, cardName, createdCard } }   // 无 reply
if (mode === 'card')                   { ... return { saved:true, mode, changed, chatId, cardName } }                  // 无 reply
// 只有 story / script 那条路才 return { ..., reply }
```

**而用户一直在卡片工作台里测** —— 所以那次替换从来没有被调用过，跟坐标对不对无关。

**② 坐标也确实错了（即便调用也会抛）。** `replaceAssistantReply` 传的 `start` / `sourceEventSeqs` 是 `assistantResultForTurn()` 返回的 **events 数组下标**，而 `replaceSessionSurface` 要的是 **事件 seq**。注意字段名不是问题：`appendSessionEvent()` 会把 `{start, end}` 规范化成 DSH 原生形态 `{op:'replace', startSeq, endSeq}`，`surfaceReplacementRange()` 也兼容两种读法 —— 所以只要值给对（seq），写进去就是对的。

修法：**兜底轮次直接调 `replaceSessionSurface`，不经过 `replaceAssistantReply`，也不依赖 `saved.reply`**；坐标取 `assistant.event.seq`；外面包 `try/catch`，并把结果写回 `recordFailure` 的 message（`会话消息替换成功 / 替换失败：<原因>`），这样 journal 里直接能看到替换有没有落地：

```js
if (assistant !== null && assistant.text === '' && assistantText !== '') {
  const fallbackBody = saved.reply?.sessionText ?? assistantText
  const seqOfFallback = Number.isSafeInteger(assistant.event?.seq) ? assistant.event.seq : assistant.index
  try {
    replaceSessionSurface(session, 'assistant/message', {
      turn: Number(assistant.event?.data?.turn) || payload.turn,
      step: Number(assistant.event?.data?.step) || 1,
      message: { ...assistant.event.data.message, id: randomUUID(),
        source: { kind: 'model', provider: 'dsh-tavern', model: 'reply-projection' },
        content: [{ type: 'text', text: NOTICE + '\n\n' + fallbackBody }] }
    }, { start: seqOfFallback, end: seqOfFallback, sourceEventSeqs: [seqOfFallback] })
  } catch (error) { /* 记进 message，不影响存档 */ }
}
```

**判据（实测，不是推断）**：会话日志 `sessions/<sessionId>/session.v3.jsonl.zstd` 里 `"model":"reply-projection"` 出现 **0 次**，`surfaceOp.op` 分布是 `{append: 4351, replace: 37}` —— 那 37 次 replace **全是 DSH 自己的**（system / tool/result），Tavern 一次都没有。**"补丁在文件里"与"这条路径会被走到"是两件事**：要去找它本该产生的痕迹，不是看状态脚本。

**教训顺序**：先确认调用点会不会执行（前置条件在当前模式下成立吗），再谈坐标和逻辑对不对 —— 反过来查，会花两轮修一个根本没被执行的函数的内部细节。

**判据要跟着改动数量走**：`stateOf` 现在按五处逐项报 `[ ok ] / [ -- ] / [ !! ]`，缺哪补哪（历史中间状态可增量补齐），`--revert` 只反向撤"确实已应用"的那几处。写判据时踩到两个坑，都值得记住：

- **不能用 `to` 当"已应用"判据** —— B 的 `to`（`      assistantText`）是它自己 `from` 的前缀，两边都命中，判据直接失效。每处要另配一个"补丁后专有"的 done 标记。
- **锚点必须跨到插入点之后的一行** —— 否则补丁后原锚点仍在（它是新文本的前缀），状态永远认不出来。

**⚠ 但这套替换对用户不可见 —— 这是 DSH 的有意设计，不是 bug（2026-09-27 实测结论）。**

⑩-c 落地后数据层完全正确（`surfaceOp=replace` 指向原节点、`content` 从 `["reasoning"]` 变成 `["text"]`、发生在 `turn/end` 之前、journal 回执写「会话消息替换成功」），**可界面上还是一个样**。原因写在 DSH 前端源码里：

```js
// @deepseek-ai/dsh-client-ui-chat/lib/client.js:5686-5698
// Narrow an event to an append-origin surface event: one that entered the surface
// at its own log position and was never itself a replacement copy.
//
// The model-visible surface deliberately shadows replaced ranges, so it is the
// wrong source for a human transcript — a landed replacement would erase
// conversation the user already saw. Append-origin events are that transcript's
// durable source material; replacement copies stay model-only.
```

即：**替换只改"模型看到的 surface"，人类转录只认 `surfaceOp === "append"` 的事件**（`hasTextAssistant` / `visibleAssistantEvent` 都硬要求 append）。一个已落地的替换若也改写用户看过的对话，就等于抹掉他刚看过的内容 —— DSH 明确不这么做。

**所以：想改变"用户看到的东西"，只能在渲染层做 → 这就是 `patch-reasoning-notice.mjs`（⑪）存在的理由。** 判断一条修改属于哪一层，先问"用户看到的这份数据是从哪来的"。

**留一句话给后来的自己**：⑩-b/⑩-c 不是白做的 —— 它让**模型**在下一轮看到「这段内容来自思考通道」的声明（模型可见的那份 surface 被正确更新了），避免模型把思考草稿当正文继续写。但它永远不会出现在用户眼前。

实测规模（`chat-muean70p-ichmxt`，2026-09-27）：

```
09-24  stop  n=17  emptyLen=0     ← 正常
09-26  stop  n=40  emptyLen=0     ← 正常
09-27  stop  n=58  emptyLen=17    ← 29%，且成簇发作
```

**成簇**是这条的关键指纹：02:xx 全成功、14:13–14:20 连空 5 次、20:36 成功两次、20:57–21:09 又连空 7 次 —— 同一天里自相矛盾，所以**别拿它当配置问题去改提示词**（9/24、9/26 用的就是同一份提示词，收尾全部正常）。查这类"时好时坏"的故障，先按时间轴分簇，簇内的共同点才是嫌疑对象。

### 三处 `generate` 包装必须一致

宿主的 `generateRaw` 是**显式编排契约**（`lib/domain/helper-generation.js`）：只认 `ordered_prompts` / `user_input` / `max_chat_history` / `should_stream` / `should_silence` / `overrides` / `generation_id`，**没有 `prompt`**，且 `ordered_prompts` 必填非空。

所以每个把 ST 风格 `generate(prompt, options)` 映射过去的包装都要做两步归一化：

```js
if (cfg.prompt !== undefined) { if (cfg.user_input === undefined) cfg.user_input = cfg.prompt; delete cfg.prompt; }
if (!Array.isArray(cfg.ordered_prompts) || !cfg.ordered_prompts.length) cfg.ordered_prompts = ["user_input"];
```

**而这样的包装有三份**（各跑在不同的 frame，没法合并）：

| # | 位置 | 谁读它 |
| --- | --- | --- |
| ① | `src/client/main.js` 的 `tavernHelperScriptBootstrap`（`genNorm`） | 消息 iframe 里的脚本 |
| **⑤** | **`src/client/main.js` 的 `installTavernHelperFacade`** | **卡内脚本（经 `window.parent`）** |
| ⑥ | `src/client/opening-preview.js` 的 `installOpeningPreviewBridge` | 开场预览 |

**改了一份而漏了另两份，症状会变成"下一层的错"** —— 提示从「API 不可用」变成「需要显式 ordered_prompts」，看起来像前进了一步。**改完一定数一遍命中数**：

```bash
grep -c "config.ordered_prompts =" apps/dsh-tavern/tavern-plugin/src/client/main.js            # 期望 2
grep -c "config.ordered_prompts =" apps/dsh-tavern/tavern-plugin/src/client/opening-preview.js # 期望 1
```

（`verify-srcpatch.mjs` 和 `patch-all.mjs` 都把这两项算进判据了。）

**状态判读**：

- 「未打补丁（锚点齐全，可应用）」→ 直接 `--apply`；
- 「已打补丁」→ 不用动；
- 「⚠ 只打了一半」→ `--apply` 补齐；
- 「⭐ 锚点没匹配上」→ **停下来看**，宿主那段代码变了，锚点要重找。**别强行改。**

### 每次 DSH 升级后都要重跑

**补丁改的是宿主文件，升级是整份替换 —— 升级后补丁必然失效。** 而且是**静默失效**：不报错，功能悄悄回到补丁前，很容易被当成「升级引入的 bug」。**实测已发生三次。**

判据不是版本号。实测遇到过两次都是 `2.3.0`、只有 commit 变了（`64e721b` → `674a554d`），光看 `package.json` 发现不了。**跑 `patch-all.mjs` 看状态最快。**

**例外**：`patch-card-generate.mjs` 改的是**卡**，升级碰不到 —— 这正是"能修在卡里就别修在宿主里"的理由。

### 补 helper 要看清补哪一层

卡内脚本调宿主走的是 **postMessage RPC**，中间有 shim：

```
卡内脚本 → window.TavernHelper.xxx
             ↑ ③ iframe shim —— 属性是 getter：get: () => window[name]
             ↓ transport.request(method, args)
          ② 宿主白名单 allowedMethods（12 个 method，不在名单里静默丢弃）
             ↓
          ① 实现
```

**宿主有实现 ≠ 脚本能调到。** 三种缺口要分清：

| 情况 | 处理 |
| --- | --- |
| 名字在 iframe 清单里、`window.xxx` 没定义 | 只补 `window.xxx`，getter 自然读到 |
| 名字**不在**清单里（如 `generate`） | **先往清单加名字，再补 `window.xxx`** —— 少一步，`TavernHelper.generate` 连属性都不存在 |
| 宿主压根没实现（如 `generate` 的完整管线） | 要新加 RPC，不是补 shim |

**⚠ 有两个 `TavernHelper` 组装点**：主页面的（`helperNames`，逗号后有空格）和 iframe 的（在 `interactiveHelperShim` 字符串里，紧凑格式）。**卡内脚本读的是 iframe 那份** —— 改错地方会「状态显示已打补丁、但功能依然不可用」，很难察觉。

## 浏览器自动化

`open-in-browser.mjs` —— 用 Playwright 驱动 web 界面（`127.0.0.1:43120`）跑一局，绕开 `tavern_test_response` 在纯 API 下等不到结算的问题。

需要 DSH web 的**认证 cookie**（`HttpOnly`，只能从 DevTools 拿），通过 `DSH_AUTH_COOKIE_NAME` / `DSH_AUTH_COOKIE_VALUE` 传入。默认 headless，`DSH_HEADFUL=1` 看过程。

**已知不稳**：从「游玩历史」进对局那一步的 selector 不够可靠。
