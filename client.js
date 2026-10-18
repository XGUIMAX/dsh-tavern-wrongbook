// dsh-wrongbook browser half: the settings section.
//
// 跟 dsh-card-updater 同一套挂载方式：面板本体是同一个 Panel，挂到四个座位上 ——
// 「设置 → 错题库」、「侧栏底部按钮」（点开一个覆盖层），以及装了 Tavern 时的
// 「每条消息下面的『记进错题库』」和「Tavern 右侧栏面板」。
//
// 后两个都在 Tavern 插件接口里（tavernUi），按需取、不写进 export const inject：
// 那里是硬依赖，缺一个整个浏览器半就不 apply，而 Tavern 是可选装的东西。
// The registration id MUST equal the package name (`package.json` name). The DSH
// client module system indexes graph rows by package name and its `arrive()` step
// throws "bundle ... loaded without registering \"<package name>\" via
// __ModuleLoader__.load" when the script registers under anything else, so an id
// that drifts from the package name fails the whole plugin at boot.
window.__ModuleLoader__.load({
  id: 'dsh-tavern-wrongbook',
  factory: (require) => {
    const react = require('react')
    const h = react.createElement
    const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = react

    const NS = 'settings.dsh-wrongbook'
    const BASE = '/dsh-wrongbook'

    let translate = (key) => key
    const t = (key) => {
      try {
        return translate(key)
      } catch {
        return key
      }
    }

    const zh = {
      nav: '错题库',
      'panel.title': '错题库',
      'panel.desc': '按卡片分类记下调试中踩过的坑；卡出问题时先查它自己的错题库，再跨卡查询。',
      'stale.badge': '来源已失效',
      'stale.rollback': '这条抓下来之后，第 {n} 轮被回退了 —— 那个轮次现在读不到，refs 里的出处已经指空。',
      'stale.rollbackAny': '这条抓下来之后剧情线回退过，出处轮次可能已经读不到。',
      'stale.regenerate': '第 {n} 轮重新生成过，正文和抓下来时不是同一段。',
      'stale.edit': '第 {n} 轮正文被编辑过，和抓下来时不是同一段。',
      'stale.any': '抓下这条之后剧情线变动过，出处轮次可能已经对不上。',
      'stale.note': '底稿本身一个字没改 —— 只是它指的那一轮变了。',
      'stale.clear': '确认仍有效',
      'tab.entries': '人物卡错题',
      'tab.other': '其它错题',
      'tab.scripts': '卡脚本',
      'tab.patch': '宿主补丁',
      'tab.backup': '备份与还原',
      'tab.common': '通用脚本',
      'common.libTitle': '通用脚本库',
      'common.importScript': '导入脚本',
      'common.importHint': '把脚本 JSON 粘贴进来，或直接把文件拖到下面的框里。就是「导出脚本」得到的那种格式（含 name 与 content）。',
      'common.importPlaceholder': '{ "name": "脚本名", "content": "…", "type": "script", "enabled": true }',
      'common.doImport': '写入库',
      'common.cancel': '取消',
      'common.libDelete': '删除',
      'common.libUpdate': '更新',
      'common.updateTitle': '更新脚本（',
      'common.updateHint': '粘贴或拖入脚本的新版 JSON。只换脚本本体，库里已有的分类/用途/建议会保留（新文件里显式带了 dsh_meta 才用它）。',
      'common.updatePlaceholder': '把新版脚本 JSON 拖到这里，或粘贴进来…',
      'common.updateDo': '确认更新',
      'common.updateFail': '更新失败。',
      'common.updateDone': '已更新：{n}',
      'common.updateSame': '内容和库里那份一样，没有改动。',
      'common.updateDiff': '内容已替换：{old} → {new} · {ob} → {nb} 字符',
      'common.updateKept': '库里原有的分类 / 用途 / 建议已保留。',
      'common.updateBackup': '旧版已备份到：',
      'common.updateStale': '有 {n} 张卡装的还是旧版 —— 更新库文件不会自动改卡上那份：',
      'common.updateSync': '同步到已装的卡',
      'common.updateNoStale': '没有卡装这个脚本，无需同步。',
      'common.updateSynced': '新版已同步到 {n} 张装了它的卡：',
      'common.updateSyncFail': '库已更新，但同步到卡上失败（卡上还是旧版）：{e}',
      'common.updateTraits': '注意：这个脚本自己会写 {list} —— 换掉库里的文件不会清掉那些数据，新版可能读到旧版留下的状态。',
      'common.traitWorldbook': '世界书',
      'common.traitChat': '聊天记录',
      'common.traitVars': 'MVU 变量',
      'common.traitTimer': '定时器',
      'common.updateVersion': '脚本版本：{before} → {after}',
      'common.updateNoVersion': '（没写版本号）',
      'common.catAll': '全部分类（{n} 个脚本）',
      'common.tagAll': '全部卡（{n}）',
      'common.kindHand': '自带 MVU',
      'common.tagEmpty': '没有卡装了这个脚本。',
      'common.catEmpty': '这个分类下没有脚本。',
      'common.pickAll': '全选',
      'common.pickNone': '清空',
      'common.installPicked': '装上选中',
      'common.removePicked': '卸下选中',
      'common.importEmpty': '内容为空。',
      'common.importOk': '已写入库：{name}',
      'common.importReplaced': '（覆盖了同名脚本）',
      'common.importFail': '导入失败 —— 看运行日志里的具体原因。',
      'common.importTooBig': '文件太大（超过 8 MB），确认一下是不是选错了。',
      'common.importReadFail': '读取失败 —— 检查文件权限，或改用粘贴。',
      'common.deleteOk': '已从库里移除：{name}',
      'common.deleteFail': '移除失败。',
      'common.libHint': '这些脚本不挑卡，装到哪张卡就能在哪张卡用。库目录在 data/tools/wrongbook/common-scripts/，不属于任何一张卡。',
      'common.libEmpty': '库里还没有脚本 —— 把脚本 JSON 放进 data/tools/wrongbook/common-scripts/ 即可。',
      'common.refresh': '刷新',
      'common.broken': '文件读取失败',
      'common.onCards': '已装 {n} 张',
      'common.recommend': '建议：',
      'common.cardsTitle': '可装脚本的卡（',
      'common.cardsHint': '含 MVU 版、自带 MVU 的卡（如米吧），以及已经装过脚本的卡。只作参照的原版卡不在此列、也不提供装卸入口。徽章：已装=库里同版；版本不同=卡上那份与库里不一致（库里更新过脚本时会出现）；未装=这张卡还没有。',
      'common.scripts': '{n} 个脚本',
      'common.cardsEmpty': '没找到可装脚本的卡。',
      'common.installed': '已装',
      'common.differs': '版本不同',
      'common.absent': '未装',
      'common.installAll': '全部装上',
      'common.removeAll': '全部卸下',
      'common.installOne': '装',
      'common.removeOne': '卸',
      'common.originalsTitle': '仅作参照、不给装卸入口（',
      'common.originalsHint': '原版卡是可对照的参照物，这里只列出、不提供装卸入口。要试脚本请改 MVU 版。',
      'common.done': '完成，处理了 {n} 张卡。',
      'common.fail': '失败 —— 看运行日志里的具体原因。',
      'search.ph': '跨卡查询：症状、标签、报错原文…',
      'filter.status': '全部状态',
      'filter.scope': '全部范围',
      'btn.checkSelf': '检测更新',
      'btn.save': '保存',
      'btn.reload': '重新载入',
      'btn.rescan': '重新扫描卡片目录',
      'btn.patchHost': '一键重打宿主补丁',
      // 宿主补丁改的是 apps/dsh-tavern/ 下的文件，DSH 升级会整份替换 —— 补丁静默失效，
      // 不报错，只是功能悄悄回到补丁前。所以升级后跑一次。
      'patch.autoOk': '本次启动已自动检查：全部就位',
      'patch.autoFixed': '本次启动自动补齐了补丁 —— 重启 DSH 后生效',
      'patch.autoFail': '本次启动的自动检查没跑成',
      'patch.usage': '用法（升级后跑一次）：先「检查」看哪些失效，再「重打」自动补齐，最后重启 DSH 生效。',
      'patch.hint': '宿主补丁会被 DSH 升级覆盖。',
      'ok.patchCheck': '检查完成，见下方输出',
      'ok.patchApply': '已重打，重启 DSH 后生效',
      'ok.patchNone': '全部就位，无需重打',
      'err.patch': '重打失败',
      'btn.patchCheck': '检查补丁状态',
      'btn.patchApply': '重打补丁',
      'btn.add': '新增条目',
      'btn.backup': '手动备份',
      'btn.openData': '打开数据目录',
      'btn.openBackup': '打开备份目录',
      'btn.import': '导入 JSON',
      'btn.export': '导出 JSON',
      'btn.close': '关闭',
      'btn.cancel': '取消',
      'btn.confirm': '确认',
      'btn.edit': '编辑',
      'btn.remove': '删除',
      'btn.restore': '还原',
      'btn.prune': '清理旧备份',
      'btn.copyTo': '复制到配对卡',
      'btn.rename': '改分类名',
      'btn.markFixed': '标记已修复',
      'order.hint': '调试检索顺序：① 本卡错题库 → ② 其它错题 → ③ 跨卡查询',
      'own.title': '① 本卡错题库',
      'own.title.other': '① 本分类错题库',
      'other.title': '② 其它错题',
      'cross.title': '③ 跨卡查询',
      'other.empty': '其它错题那一组里没有相似记录。',
      'own.empty': '这张卡还没有记录。第一次踩坑之后，把它记下来。',
      'cross.empty': '其余卡片里没有相似记录。',
      'cards.title': '卡片分类',
      'cards.title.other': '其它分类',
      'cards.empty': '卡片目录里还没有 JSON 卡片。',
      'cards.filtered': '没有符合当前筛选的卡片 —— 换个条件，或把状态/范围调回「全部」。',
      'cards.missing': '文件已不在卡片目录',
      'count.open': '未解决',
      'count.watch': '观察中',
      'count.fixed': '已修复',
      'status.open': '未解决',
      'status.watch': '观察中',
      'status.fixed': '已修复',
      'field.title': '症状',
      'field.title.ph': '一句话说清看到什么',
      'field.symptom': '现象',
      'field.symptom.ph': '什么条件下出现、具体表现',
      'field.cause': '根因',
      'field.cause.ph': '查到的真正原因',
      'field.fix': '修法',
      'field.fix.ph': '已验证的改法；没解决就留空',
      'field.scope': '范围',
      'field.status': '状态',
      'field.tags': '标签',
      'field.tags.ph': '逗号或空格分隔',
      'field.refs': '涉及',
  'field.cardRevision': '卡版本',
      'field.refs.ph': '文件路径或字段，如 /data/extensions/regex_scripts/0',
      'field.evidence': '证据',
      'field.evidence.ph': '日志、报错原文、游玩记录引用',
      'editor.add': '新增条目',
      'editor.edit': '编辑条目',
      'sec.own': '本卡记录',
      'sec.detail': '详情',
      'backup.current': '当前数据',
      'backup.list': '备份',
      'backup.empty': '还没有备份。写盘前会自动生成一份，也可以现在手动备份。',
      'backup.entries': '{n} 条',
      'backup.entriesUnknown': '—',
      'backup.keepHint': '超出这个数量的旧备份会被删掉；自动清理的上限是 60 份。',
      'scripts.hint':
        '卡内自带的自定义脚本与机制条目。DSH 没有全局脚本槽：脚本随卡加载，换一张卡就换一套，所以排查任何一张卡之前先看清它带了什么。',
      'scripts.loading': '正在盘点…（第一次要把卡和工具目录过一遍，之后有缓存）',
      'scripts.progress': '已盘点',
      'scripts.cardPending': '盘点中',
      'scripts.cardFailed': '这张读不出来',
      'scripts.summary': '共 {n} 张卡，其中 {flagged} 张带特化内容',
      'scripts.count': '{n} 个脚本',
      'scripts.specialCount': '特化 {n}',
      'scripts.controllerCount': '控制器 {n}',
      'scripts.none': '这张卡没有自带脚本。',
      'scripts.regex': '正则脚本',
      'scripts.regexDisabled': '停用 {n}',
      'scripts.regexClash': '占位符被抢',
      'scripts.on': '启用',
      'scripts.off': '停用',
      'scripts.otherExt': '其它扩展',
      'scripts.allOn': '（全部启用，行为取决于顺序）',
      'scripts.dup': '（同名重复）',
      'scripts.disabled': '停用',
      'scripts.controllers': '控制器条目',
      'scripts.patchEntries': '含 update / json_patch 的条目',
      'scripts.tools': '工具目录里的脚本',
      'scripts.toolsHint': 'data/tools 下不属于任何一张卡的脚本：从卡里导出来的，或为卡自制待命的那批。',
      'scripts.empty': '没有扫到脚本。',
      'scripts.otherCard': '其它张卡',
      'install.ok': '插件安装正常：profile 清单里有它，node_modules 的链接也通。Tavern 更新只重写自己托管的那几项，碰不到这里。',
      'install.bad': '插件在 profile 清单里不见了 —— 可能更新时被抹掉，也可能被手动移除过。补回：',
      'backup.dir.title': '备份目录',      'backup.dir.custom': '自定义',
      'backup.dir.pick': '选择文件夹',
      'backup.dir.reset': '恢复默认',
      'backup.dir.hint': '只影响之后写入的备份：旧目录里已有的备份不会搬动，也不会被删掉。请填绝对路径。',
      'reflux.open': '回流到 Skill',
      'reflux.title': '回流到 Skill',
      'reflux.hint':
        '把错题库里的条目写进某个 skill 的参考资料，以后做同类事情时 Agent 能读到。只增不改：同名的不会重复写，你手工改过的内容也不会被覆盖。',
      'reflux.skill': '目标 skill',
      'reflux.file': '目标文件（相对 skill 目录）',
      'reflux.scope': '范围',
      'reflux.scopeAll': '全部',
      'reflux.scopeCard': '当前分类',
      'reflux.scopeActive': '未解决的',
      'reflux.plan': '将写入 {n} 条',
      'reflux.builtinWarn': '内置 skill 在程序目录里，Tavern 更新会整份覆盖它，所以这里只写你自己的。',
      'reflux.noSkill': '还没有自己的 skill —— 先建一个，回流才有落脚处。',
      'reflux.create': '新建 skill',
      'reflux.createHint': '小写字母、数字、连字符，例如 mvu-migration-notes',
      'reflux.skillDescHint': '简介 —— 写清什么时候该读它，Agent 靠这句决定要不要自动加载',
      'reflux.createNeedsName': '名字必填（小写字母、数字、连字符）；简介可以不填，但不填就很难被自动想起。',
      'reflux.write': '写入',
      'reflux.done': '已写入 {n} 条到 {file}（跳过 {m} 条，文件里已有同名）',
      'reflux.doneAllSkip': '这 {n} 条都已经在 {file} 里了，没有需要写的。',
      'reflux.created': '已建好 skill「{name}」',
      'reflux.sample': '示例',
      'reflux.sampleTitle': '不知道怎么写？点一下，按当前范围和错题库里的实际条目算一句出来，可以直接用或改。',
      'reflux.skillEntries': '{n} 条',
      'reflux.deleteSkill': '删除这个 skill',
      'reflux.deleted': '已删掉「{name}」，删前整份备份在 {backup}',
      'reflux.refs': '参考资料',
      'reflux.noRefs': '（还没回流过东西）',
      'reflux.noDesc': '（这个 skill 没写简介 —— 没有简介它就很难被自动想起来）',
      'reflux.cancelCreate': '收起',
      'reflux.newSkill': '新建一个',
      'reflux.panelHint': '回流只写你自己的 skill：内置的在程序目录里，Tavern 更新会整份覆盖。',
      'ver.stale': '改了没重启',
      'ver.staleHint': '磁盘上已经是 v{disk}，但进程里跑的仍是 v{run} —— 插件在启动时就加载好了，完全退出 DSH 再启动才会读到新代码。',
      'reflux.auto': '以后新条目自动同步到这里',
      'reflux.autoOn': '已打开自动同步 → {name}；每记一条新错题就顺手跟一次。',
      'reflux.autoOff': '已关掉自动同步。',
      'reflux.autoLast': '上次自动同步 {when}，写入 {n} 条',
      'reflux.autoIdle': '还没同步过',
      'reflux.autoFailed': '上次自动同步失败：{err}',
      'reflux.buttonAuto': '回流到 Skill',
      'reflux.autoBar': '自动同步已开 → {name}（上次 {when}，写入 {n} 条）',
      'reflux.autoBarIdle': '自动同步已开 → {name}（还没跑过）',
      'reflux.autoBarFailed': '自动同步已开 → {name}，但上次失败了：{err}',
      'browse.title': '选择文件夹',
      'browse.go': '转到',
      'browse.drives': '驱动器',
      'browse.up': '上一级',
      'browse.pick': '用这个文件夹',
      'browse.pickHint': '点进一个文件夹，或粘贴路径后按「转到」',
      'browse.empty': '这一层没有子文件夹',
      'browse.hint': '点文件夹进去，也可以直接粘贴路径。空路径列出所有驱动器。',
      'ok.backupDir': '备份目录已改为 {dir}',
      'ok.backupDirReset': '备份目录已恢复默认',
      'import.hint': '粘贴错题库 JSON：整份导出文件（含 entries）或直接一个条目数组。同卡同标题的条目会跳过。',
      'import.dropOk': '已读入 {name} —— 确认内容后点「开始导入」。',
      'import.dropMulti': '拖入了多个文件，只读第一个（{name}）。',
      'import.dropTooBig': '文件太大（超过 4 MB），请确认是不是选错了文件。',
      'import.dropFail': '读取失败 —— 检查文件权限，或改用粘贴。',
      'import.submit': '开始导入',
      'rename.hint': '只改显示名，不动卡片文件；留空则回到卡片文件名。',
      'misc.updated': '更新于',
      'misc.created': '创建于',
      'misc.dataRoot': '数据目录',
      'misc.backups': '{n} 份备份',
      'misc.log': '运行日志',
      'misc.count': '共 {n} 条',
      'misc.entriesCount': '{n} 条记录',
      'misc.cardsCount': '{n} 个分类',
      'ver.upToDate': '已是最新版',
      'ver.changed': '本地有改动',
      'ver.available': '有新版本 {v}',
      'ver.unknown': '未检测',
      'ver.remote': '远端 {v}',
      'ver.lastAt': '上次检测 {at}',
      'ver.hint.changed': '自上次检测后这些文件变过：{files}',
      'ver.hint.remote': '远端清单：{url}',
      'ver.hint.noRemote': '未配置远端清单，检测比对的是插件自身文件指纹与版本号。',
      'ok.added': '已记入 {name}',
      'ok.updated': '条目已更新',
      'ok.removed': '条目已删除',
      'ok.cleared': '已清除来源失效标记',
      'ok.moved': '已复制到 {name}',
      'ok.saved': '已保存',
      'ok.backup': '已手动备份，现在共 {n} 份',
      'ok.rescan': '已重新扫描，{n} 张卡',
      'ok.renamed': '分类名已更新',
      'ok.restored': '已从备份恢复，{n} 条记录',
      'ok.restoredHint': '恢复后的内容立刻成为当前数据；恢复前的那一份也已经自动备份过。',
      'ok.deletedBackup': '已删除备份 {file}',
      'ok.pruned': '已清理 {n} 份，保留最近 {keep} 份',
      'ok.opened': '已交给资源管理器打开：{path}',
      'ok.imported': '导入 {added} 条，跳过 {skipped} 条',
      'ok.exported': '已导出 JSON 文件',
      'err.bridge': '连不上后台',
      'err.emptyImport': '先粘贴要导入的 JSON',
      'err.bucketName': '先写一个分类名',
      'bucket.add': '新增分类',
      'bucket.name.ph': '分类名，比如 卡片更新器',
      'bucket.new': '新分类',
      'bucket.empty': '这一组还没有分类。',
      'bucket.deleteHint': '删掉分类时，它下面的记录会移到「通用 / 未归类」，不会跟着一起消失。',
      'bucket.otherHint': '不挂在人物卡上的问题放这里：插件自身的更新链、合并策略、工具链、界面。',
      'chip.other': '其它',
      'chip.plain': '原版',
      'btn.deleteBucket': '删除分类',
      'ok.bucketAdded': '已新增分类「{name}」',
      'ok.bucketRemoved': '已删除分类，{n} 条记录移到「通用 / 未归类」',
      'field.card': '所属分类',
      'label.card': '卡片',
      'label.avatar': '头像',
      'common.detectFit': '检测适合的卡',
      'common.fitTitle': '适合装它的卡（',
      'common.fitClose': '收起',
      'common.fitCaps': '识别到的能力：',
      'common.fitNoCaps': '没识别出常见能力调用',
      'common.fitHint': '按契合度排序，每条给了理由。这是技术层面的匹配（脚本用到的能力 × 卡具备的特征），不代表题材上合不合适 —— 那种判断要读过卡才说得出来。',
      'common.fitEmpty': '没找到明显受益的卡。',
      'common.fitHas': '这张卡已有 {n} 个脚本',
      'common.fitFail': '检测失败。',
      'backup.dir.custom': '已自定义备份目录',
      'common.genFit': '生成精准建议',
      'common.genFitStarted': '已开始后台分析 —— 关掉这个面板也会继续。',
      'common.genFitFail': '启动失败。',
      'common.jobTitle': '后台分析（',
      'common.jobProgress': '已分析 {done} / {total}',
      'common.jobDone': '分析完成，共 {n} 张卡。',
      'common.jobNote': '这一步是逐张读卡的静态分析（读 description、正则名、脚本名、世界书标题），不是模型读完整卡的判断 —— 宿主没给插件模型接口。',
      'common.jobCancel': '取消',
      'common.jobCardsTitle': '分析结果（{n} 张）',
      'common.jobCardsHint': '每条理由都引用了卡里实际存在的东西（正则名、脚本名、世界书条数），可以照着核对。',
      'common.jobNoReason': '没找到明显的契合点。',
      'common.jobProfile': '正则 {r} 条 / {rc} 字符 · 脚本 {s} 个 · 世界书 {b} 条',
      'common.handOff': '生成建议',
      'common.handOffTip': '生成建议：读取这个脚本和全部卡，由工作台逐张分析每张卡具体哪个功能能被它接管。生成一段文本给你，你确认后再发 —— 不会替你自动发出。',
      'common.collapse': '收起',
      'common.expand': '展开',
      'common.jobClear': '清除',
      'common.handoffTitle': '交给工作台的文本（',
      'common.handoffHint': '这段文字已复制到剪贴板。对话页开着的话也帮你填进输入框了 —— 发出去之前先看一眼。它会让工作台逐张读卡，点名每张卡具体哪个功能能被这个脚本接管。',
      'common.handoffCopy': '复制',
      'common.handoffCopied': '已复制到剪贴板 —— 去对话页粘贴发送。',
      'common.handoffFilled': '已填进对话输入框（也复制了一份）—— 检查一下再发。',
      'common.handoffManual': '自动复制没成功，请手动选中下面的文本复制。',
    }

    const en = {
      nav: 'Wrongbook',
      'panel.title': 'Wrongbook',
      'panel.desc': 'Per-card defect ledger. When a card breaks, check its own entries first, then search the rest.',
      'stale.badge': 'Source stale',
      'stale.rollback': 'Turn {n} was rolled back after this was captured — that turn can no longer be read, so the reference points at nothing.',
      'stale.rollbackAny': 'The timeline was rolled back after this was captured; the source turn may no longer be readable.',
      'stale.regenerate': 'Turn {n} was regenerated; the text is no longer the one captured here.',
      'stale.edit': 'Turn {n} was edited; the text is no longer the one captured here.',
      'stale.any': 'The timeline changed after this was captured; the source turn may no longer match.',
      'stale.note': 'The entry itself is untouched — only the turn it points at changed.',
      'stale.clear': 'Still valid',
      'search.ph': 'Cross-card search: symptom, tag, error text…',
      'tab.entries': 'Card issues',
      'tab.other': 'Other issues',
      'tab.scripts': 'Card scripts',
      'tab.patch': 'Host patches',
      'tab.backup': 'Backups',
      'tab.common': 'Common scripts',
      'common.libTitle': 'Common script library',
      'common.importScript': 'Import script',
      'common.importHint': 'Paste the script JSON, or drop the file onto the box below. Same shape as Export gives you (name + content).',
      'common.importPlaceholder': '{ "name": "my-script", "content": "…", "type": "script", "enabled": true }',
      'common.doImport': 'Add to library',
      'common.cancel': 'Cancel',
      'common.libDelete': 'Delete',
      'common.libUpdate': 'Update',
      'common.updateTitle': 'Update script (',
      'common.updateHint': 'Paste or drop the new version of this script. Only the script body is replaced; the category/purpose/advice already in the library are kept (a dsh_meta in the new file overrides them).',
      'common.updatePlaceholder': 'Drop the new script JSON here, or paste it...',
      'common.updateDo': 'Apply update',
      'common.updateFail': 'Update failed.',
      'common.updateDone': 'Updated: {n}',
      'common.updateSame': 'Identical to the copy in the library, nothing changed.',
      'common.updateDiff': 'Body replaced: {old} -> {new} - {ob} -> {nb} chars',
      'common.updateKept': 'The library copy\'s category / purpose / advice were kept.',
      'common.updateBackup': 'Previous version backed up to: ',
      'common.updateStale': '{n} card(s) still carry the old version - updating the library file does not touch them:',
      'common.updateSync': 'Push to those cards',
      'common.updateNoStale': 'No card has this script, nothing to sync.',
      'common.updateSynced': 'New version pushed to {n} card(s) that had it:',
      'common.updateSyncFail': 'Library updated, but pushing to cards failed (they still carry the old version): {e}',
      'common.updateTraits': 'Note: this script writes {list} on its own - replacing the library file does not clear that data, so the new version may read what the old one left behind.',
      'common.traitWorldbook': 'worldbook entries',
      'common.traitChat': 'chat messages',
      'common.traitVars': 'MVU variables',
      'common.traitTimer': 'timers',
      'common.updateVersion': 'Script version: {before} -> {after}',
      'common.updateNoVersion': '(no version declared)',
      'common.catAll': 'All categories ({n} scripts)',
      'common.tagAll': 'All cards ({n})',
      'common.kindHand': 'own MVU',
      'common.detectFit': 'Find suitable cards',
      'common.fitTitle': 'Cards that would benefit (',
      'common.fitClose': 'Hide',
      'common.fitCaps': 'Capabilities detected: ',
      'common.fitNoCaps': 'no common capability calls found',
      'common.fitHint': 'Sorted by fit, each with a reason. This is a technical match (capabilities the script uses x features the card has) - it does not judge whether the theme suits, which needs reading the card.',
      'common.fitEmpty': 'No obviously benefiting card found.',
      'common.fitHas': 'this card already has {n} scripts',
      'common.fitFail': 'Detection failed.',
      'common.genFit': 'Deep analysis',
      'common.genFitStarted': 'Background analysis started - it keeps running if you close this panel.',
      'common.genFitFail': 'Could not start it.',
      'common.jobTitle': 'Background analysis (',
      'common.jobProgress': 'Analyzed {done} / {total}',
      'common.jobDone': 'Finished, {n} cards.',
      'common.jobNote': 'This reads each card and statically analyzes it (description, regex names, script names, worldbook titles). It is not a model reading the whole card - the host does not expose a model API to plugins.',
      'common.jobCancel': 'Cancel',
      'common.jobCardsTitle': 'Results ({n} cards)',
      'common.jobCardsHint': 'Every reason cites something that actually exists in the card (regex names, script names, worldbook count), so you can check it.',
      'common.jobNoReason': 'No clear fit found.',
      'common.jobProfile': '{r} regexes / {rc} chars - {s} scripts - {b} worldbook entries',
      'common.handOff': 'Get advice',
      'common.handOffTip': 'Get advice: reads the script and every card, then has the workspace analyze what each card would gain from it. Produces a block of text for you to review before sending - it never sends it for you.',
      'common.collapse': 'Collapse',
      'common.expand': 'Expand',
      'common.jobClear': 'Clear',
      'common.handoffTitle': 'Text for the workspace (',
      'common.handoffHint': 'Copied to your clipboard. If the chat page is open it is also filled into the input box - read it before sending. It asks the workspace to read every card and name what each one would gain.',
      'common.handoffCopy': 'Copy',
      'common.handoffCopied': 'Copied - paste it in the chat page.',
      'common.handoffFilled': 'Filled into the chat input (and copied) - check before sending.',
      'common.handoffManual': 'Auto-copy failed - select the text below and copy it manually.',
      'common.tagEmpty': 'No card has this script yet.',
      'common.catEmpty': 'No scripts in this category.',
      'common.pickAll': 'Select all',
      'common.pickNone': 'Clear',
      'common.installPicked': 'Install selected',
      'common.removePicked': 'Remove selected',
      'common.importEmpty': 'Nothing to import.',
      'common.importOk': 'Added to library: {name}',
      'common.importReplaced': ' (replaced the existing one)',
      'common.importFail': 'Import failed - see the run log.',
      'common.importTooBig': 'That file is over 8 MB - is it the right one?',
      'common.importReadFail': 'Could not read it - check permissions, or paste instead.',
      'common.deleteOk': 'Removed from library: {name}',
      'common.deleteFail': 'Remove failed.',
      'common.libHint': 'These scripts are not tied to any card. Drop them in and every card can use them. Location: data/tools/wrongbook/common-scripts/.',
      'common.libEmpty': 'The library is empty - put script JSON files into data/tools/wrongbook/common-scripts/.',
      'common.refresh': 'Refresh',
      'common.broken': 'unreadable',
      'common.onCards': 'on {n} cards',
      'common.recommend': 'Recommended: ',
      'common.cardsTitle': 'Cards that can take scripts (',
      'common.cardsHint': 'MVU builds, cards that carry their own MVU (like Miba), and any card that already has one of these scripts. Reference-only originals are excluded and get no install buttons. Badges: installed = same build as the library; differs = the copy on the card is not the one in the library; absent = not present.',
      'common.scripts': '{n} scripts',
      'common.cardsEmpty': 'No cards to install on.',
      'common.installed': 'installed',
      'common.differs': 'differs',
      'common.absent': 'absent',
      'common.installAll': 'Install on all',
      'common.removeAll': 'Remove from all',
      'common.installOne': 'Install',
      'common.removeOne': 'Remove',
      'common.originalsTitle': 'Reference only (no install buttons) (',
      'common.originalsHint': 'Originals are the reference copies; they are listed here but have no install buttons. Try scripts on the MVU build instead.',
      'common.done': 'Done - handled {n} cards.',
      'common.fail': 'failed - see the run log for the reason.',
      'search.ph': 'Cross-card search: symptom, tag, error text…',
      'filter.status': 'All statuses',
      'filter.scope': 'All scopes',
      'btn.checkSelf': 'Check update',
      'btn.save': 'Save',
      'btn.reload': 'Reload',
      'btn.rescan': 'Rescan card directory',
      'btn.patchHost': 'Reapply host patches',
      'patch.autoOk': 'Checked automatically at startup: all in place',
      'patch.autoFixed': 'Patches were reapplied at startup -- restart DSH to take effect',
      'patch.autoFail': 'The startup check did not run',
      'patch.usage': 'After a DSH upgrade, once: Check to see which patches went stale, Reapply to restore them, then restart DSH.',
      'patch.hint': 'A DSH upgrade replaces the host files the patches edit.',
      'ok.patchCheck': 'Check finished, see output below',
      'ok.patchApply': 'Reapplied, effective after restarting DSH',
      'ok.patchNone': 'All in place, nothing to reapply',
      'err.patch': 'Reapply failed',
      'btn.patchCheck': 'Check patches',
      'btn.patchApply': 'Reapply patches',
      'btn.add': 'New entry',
      'btn.backup': 'Backup now',
      'btn.openData': 'Open data directory',
      'btn.openBackup': 'Open backup directory',
      'btn.import': 'Import JSON',
      'btn.export': 'Export JSON',
      'btn.close': 'Close',
      'btn.cancel': 'Cancel',
      'btn.confirm': 'Confirm',
      'btn.edit': 'Edit',
      'btn.remove': 'Delete',
      'btn.restore': 'Restore',
      'btn.prune': 'Prune old backups',
      'btn.copyTo': 'Copy to paired card',
      'btn.rename': 'Rename bucket',
      'btn.markFixed': 'Mark fixed',
      'order.hint': 'Debug lookup order: (1) this card \u2192 (2) other issues \u2192 (3) the rest of the cards',
      'own.title': '1) This card',
      'own.title.other': '1) This bucket',
      'other.title': '2) Other issues',
      'cross.title': '3) Cross-card',
      'other.empty': 'Nothing similar in the other-issues group.',
      'own.empty': 'Nothing recorded for this card yet.',
      'cross.empty': 'No similar records on other cards.',
      'cards.title': 'Card buckets',
      'cards.title.other': 'Other buckets',
      'cards.empty': 'No card JSON found in the card directory.',
      'cards.filtered': 'No card matches the current filter - try another one, or set status/scope back to all.',
      'cards.missing': 'File no longer in the card directory',
      'count.open': 'open',
      'count.watch': 'watch',
      'count.fixed': 'fixed',
      'status.open': 'Open',
      'status.watch': 'Watching',
      'status.fixed': 'Fixed',
      'field.title': 'Symptom',
      'field.title.ph': 'One line: what you saw',
      'field.symptom': 'Details',
      'field.symptom.ph': 'When it happens, what exactly it looks like',
      'field.cause': 'Cause',
      'field.cause.ph': 'The actual root cause',
      'field.fix': 'Fix',
      'field.fix.ph': 'Verified fix; leave empty while unresolved',
      'field.scope': 'Scope',
      'field.status': 'Status',
      'field.tags': 'Tags',
      'field.tags.ph': 'comma or space separated',
      'field.refs': 'References',
  'field.cardRevision': 'Card revision',
      'field.refs.ph': 'file path or field, e.g. /data/extensions/regex_scripts/0',
      'field.evidence': 'Evidence',
      'field.evidence.ph': 'log, raw error, play-record reference',
      'editor.add': 'New entry',
      'editor.edit': 'Edit entry',
      'sec.own': 'Entries',
      'sec.detail': 'Details',
      'backup.current': 'Current data',
      'backup.list': 'Backups',
      'backup.empty': 'No backups yet. One is written before every save; you can also take one now.',
      'backup.entries': '{n} entries',
      'backup.entriesUnknown': '—',
      'backup.keepHint': 'Older backups beyond this count are deleted; automatic pruning caps at 60.',
      'scripts.hint':
        'Scripts a card ships with, plus the mechanism entries that steer it. DSH has no global script slot: scripts load with the card, so read what a card carries before debugging it.',
      'scripts.loading': 'Taking inventory… (first pass walks the cards and the tools folder; cached after that)',
      'scripts.progress': 'Checked',
      'scripts.cardPending': 'checking',
      'scripts.cardFailed': 'could not read this one',
      'scripts.summary': '{n} cards, {flagged} carrying something special',
      'scripts.count': '{n} scripts',
      'scripts.specialCount': '{n} special',
      'scripts.controllerCount': '{n} controllers',
      'scripts.none': 'This card ships no scripts.',
      'scripts.regex': 'Regex scripts',
      'scripts.regexDisabled': '{n} disabled',
      'scripts.regexClash': 'Contested placeholder',
      'scripts.on': 'on',
      'scripts.off': 'off',
      'scripts.otherExt': 'Other extensions',
      'scripts.allOn': ' (all enabled — order decides)',
      'scripts.dup': ' (same name twice)',
      'scripts.disabled': 'off',
      'scripts.controllers': 'Controller entries',
      'scripts.patchEntries': 'Entries carrying update / json_patch',
      'scripts.tools': 'Scripts under the tools folder',
      'scripts.toolsHint': 'Under data/tools, belonging to no card: exported from one, or waiting to be adapted.',
      'scripts.empty': 'Nothing scanned.',
      'scripts.otherCard': 'Other cards',
      'install.ok': 'Installed properly: it is in the profile manifest and the node_modules link resolves. Tavern updates only rewrite what they manage.',
      'install.bad': 'The plugin is missing from the profile manifest — an update may have dropped it, or it was removed by hand. To put it back:',
      'backup.dir.title': 'Backup folder',
      'backup.dir.custom': 'custom',
      'backup.dir.pick': 'Choose folder',
      'backup.dir.reset': 'Use default',
      'backup.dir.hint': 'Affects only backups written from now on: existing files in the old folder are neither moved nor deleted. Use an absolute path.',
      'browse.title': 'Choose folder',
      'reflux.open': 'Reflux to skill',
      'reflux.title': 'Reflux to skill',
      'reflux.hint':
        'Write ledger entries into a skill reference so agents read them before doing the same work again. Append-only: same-title entries are not repeated, and your own edits stay.',
      'reflux.skill': 'Target skill',
      'reflux.file': 'Target file (relative to the skill)',
      'reflux.scope': 'Scope',
      'reflux.scopeAll': 'Everything',
      'reflux.scopeCard': 'This bucket',
      'reflux.scopeActive': 'Unresolved',
      'reflux.plan': '{n} entries to write',
      'reflux.builtinWarn': 'Built-in skills live in the program directory and are replaced wholesale on update, so only your own are writable here.',
      'reflux.noSkill': 'No skill of your own yet — create one first, so the entries have somewhere to land.',
      'reflux.create': 'New skill',
      'reflux.createHint': 'lowercase letters, digits, hyphens, e.g. mvu-migration-notes',
      'reflux.skillDescHint': 'Description — say when to read it; agents decide whether to load this skill from that line',
      'reflux.createNeedsName': 'The name is required (lowercase letters, digits, hyphens); the description is optional, but without it the skill is rarely recalled.',
      'reflux.write': 'Write',
      'reflux.done': 'Wrote {n} entries into {file} ({m} skipped, already present)',
      'reflux.doneAllSkip': 'All {n} entries are already in {file}; nothing to write.',
      'reflux.created': 'Created skill "{name}"',
      'reflux.sample': 'Example',
      'reflux.sampleTitle': 'Not sure what to write? Click to have one computed from the current scope and the actual ledger entries — use it as is or edit it.',
      'reflux.skillEntries': '{n} entries',
      'reflux.deleteSkill': 'Delete this skill',
      'reflux.deleted': 'Deleted "{name}"; a full copy was kept at {backup}',
      'reflux.refs': 'References',
      'reflux.noRefs': '(nothing refluxed yet)',
      'reflux.noDesc': '(no description — without one it is rarely recalled)',
      'reflux.cancelCreate': 'Collapse',
      'reflux.newSkill': 'New one',
      'reflux.panelHint': 'Reflux only writes your own skills: built-ins live in the program directory and an update replaces them whole.',
      'ver.stale': 'edited, not restarted',
      'ver.staleHint': 'Disk says v{disk} but the process is still running v{run} — plugins load at startup, so only a full DSH restart picks up new code.',
      'reflux.auto': 'Keep new entries synced here automatically',
      'reflux.autoOn': 'Auto-sync is on → {name}; every new entry follows along.',
      'reflux.autoOff': 'Auto-sync is off.',
      'reflux.autoLast': 'Last auto-sync {when}, wrote {n}',
      'reflux.autoIdle': 'not synced yet',
      'reflux.autoFailed': 'Last auto-sync failed: {err}',
      'reflux.buttonAuto': 'Reflux to skill',
      'reflux.autoBar': 'Auto-sync on → {name} (last {when}, wrote {n})',
      'reflux.autoBarIdle': 'Auto-sync on → {name} (has not run yet)',
      'reflux.autoBarFailed': 'Auto-sync on → {name}, but the last run failed: {err}',
      'browse.go': 'Go',
      'browse.drives': 'Drives',
      'browse.up': 'Up one level',
      'browse.pick': 'Use this folder',
      'browse.pickHint': 'Open a folder, or paste a path and press Go',
      'browse.empty': 'No subfolders here',
      'browse.hint': 'Open a folder, or paste a path directly. An empty path lists every drive.',
      'ok.backupDir': 'Backup folder changed to {dir}',
      'ok.backupDirReset': 'Backup folder reset to default',
      'import.hint': 'Paste wrongbook JSON: a full export (with entries) or a bare array. Entries with the same card and title are skipped.',
      'import.dropOk': 'Loaded {name} - check it, then press Import.',
      'import.dropMulti': 'Several files were dropped; only the first ({name}) was read.',
      'import.dropTooBig': 'That file is over 4 MB - is it the right one?',
      'import.dropFail': 'Could not read it - check permissions, or paste instead.',
      'import.submit': 'Import',
      'rename.hint': 'Display name only; the card file is untouched. Empty falls back to the file name.',
      'misc.updated': 'updated',
      'misc.created': 'created',
      'misc.dataRoot': 'Data directory',
      'misc.backups': '{n} backups',
      'misc.log': 'Log',
      'misc.count': '{n} entries',
      'misc.entriesCount': '{n} records',
      'misc.cardsCount': '{n} buckets',
      'ver.upToDate': 'Up to date',
      'ver.changed': 'Changed locally',
      'ver.available': 'New version {v}',
      'ver.unknown': 'Not checked',
      'ver.remote': 'remote {v}',
      'ver.lastAt': 'checked {at}',
      'ver.hint.changed': 'These files changed since the last check: {files}',
      'ver.hint.remote': 'Remote manifest: {url}',
      'ver.hint.noRemote': 'No remote manifest configured; the check compares this plugin\u2019s own file fingerprint and version.',
      'ok.added': 'Added to {name}',
      'ok.updated': 'Entry updated',
      'ok.removed': 'Entry deleted',
      'ok.cleared': 'Stale mark cleared',
      'ok.moved': 'Copied to {name}',
      'ok.saved': 'Saved',
      'ok.backup': 'Backup written, {n} total',
      'ok.rescan': 'Rescanned, {n} cards',
      'ok.renamed': 'Bucket renamed',
      'ok.restored': 'Restored from backup, {n} records',
      'ok.restoredHint': 'The restored content is live now; the previous state was backed up first.',
      'ok.deletedBackup': 'Deleted backup {file}',
      'ok.pruned': 'Pruned {n}, kept the latest {keep}',
      'ok.opened': 'Handed to the file manager: {path}',
      'ok.imported': 'Imported {added}, skipped {skipped}',
      'ok.exported': 'JSON exported',
      'err.bridge': 'Cannot reach the host half',
      'err.emptyImport': 'Paste the JSON to import first',
      'err.bucketName': 'Give the bucket a name first',
      'bucket.add': 'New bucket',
      'bucket.name.ph': 'Bucket name, e.g. Card updater',
      'bucket.new': 'New bucket',
      'bucket.empty': 'This group has no buckets yet.',
      'bucket.deleteHint': 'Deleting a bucket moves its records to "General / Unsorted" instead of removing them.',
      'bucket.otherHint': 'Issues that do not belong to a character card: plugin update chains, merge policy, tooling, UI.',
      'chip.other': 'other',
      'chip.plain': 'plain',
      'btn.deleteBucket': 'Delete bucket',
      'ok.bucketAdded': 'Bucket "{name}" added',
      'ok.bucketRemoved': 'Bucket deleted, {n} records moved to "General / Unsorted"',
      'field.card': 'Bucket',
      'label.card': 'Card',
      'label.avatar': 'Avatar',
    }

    const CSS = [
      '.dwb-root{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}',
      '.dwb-wrap{display:flex;flex-direction:column;gap:12px;padding:8px 2px 28px}',
      '.dwb-header{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}',
      '.dwb-header-actions{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto;flex-wrap:wrap}',
      '.dwb-path{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));word-break:break-all;margin-top:2px}',
      '.dwb-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-tabs{display:flex;gap:3px;flex:none;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dwb-tab{height:26px;padding:0 12px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease}',
      '.dwb-tab:hover{color:var(--dsw-alias-label-primary)}',
      '.dwb-tab.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}',
      '.dwb-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dwb-col{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dwb-grow{flex:1 1 auto;min-width:0}',
  // 宿主补丁那条用法行 + 输出块。提示要一直可见（不藏在 title 里），所以单独一行。
  '.dwb-note{margin-top:8px;font-size:12px;line-height:1.6;color:var(--dsw-alias-text-tertiary,rgba(128,128,128,.95))}',
  '.dwb-patch-out{margin-top:8px;border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));border-radius:8px;padding:8px 10px}',
  '.dwb-patch-out>summary{cursor:pointer;font-size:12px;list-style:none;outline:none;color:var(--dsw-alias-text-secondary)}',
  '.dwb-pre{margin:8px 0 0;padding:8px;max-height:260px;overflow:auto;font-size:11px;line-height:1.55;white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--dsw-alias-bg-base,rgba(128,128,128,.08));border-radius:6px}',
      '.dwb-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;transition:border-color .15s ease}',
      '.dwb-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.dwb-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.dwb-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}',
      '.dwb-btn.ghost{background:transparent}',
      '.dwb-btn.ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dwb-btn.warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.dwb-btn.bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dwb-btn.tiny{height:24px;padding:0 9px;font-size:11px;border-radius:6px}',
      '.dwb-input,.dwb-select,.dwb-area{width:100%;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:5px 8px;font-family:inherit}',
      '.dwb-input,.dwb-select{height:28px;padding:0 8px}',
      '.dwb-area{min-height:56px;resize:vertical;line-height:1.5}',
      '.dwb-select{width:auto;min-width:96px}',
      '.dwb-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px;display:flex;flex-direction:column;gap:10px}',
      '.dwb-card.flat{background:var(--dsw-alias-bg-layer-2);gap:8px}',
      '.dwb-title{font-size:14px;font-weight:700}',
      '.dwb-sub{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.dwb-chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      // 分类/tag 芯片的选中态。用可点按钮做筛选，选中时给底色加边框，
      // 与"只读徽章"区分开（徽章是 span，不响应点击）。
      '.dwb-chip.on{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-bg-layer-3);font-weight:600}',
      'button.dwb-chip{cursor:pointer}',
      '.dwb-chip.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.dwb-chip.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.dwb-chip.bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dwb-chip.tag{border-style:dashed}',
      '.dwb-ver{font-family:ui-monospace,Consolas,monospace;letter-spacing:.02em;color:var(--dsw-alias-label-primary)}',
      '.dwb-hint{font-size:11px;color:var(--dsw-alias-label-secondary);padding:6px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px dashed var(--dsw-alias-border-l2)}',
      '.dwb-cols{display:grid;grid-template-columns:minmax(184px,236px) minmax(0,1fr);gap:12px;align-items:start}',
      '.dwb-list{display:flex;flex-direction:column;gap:3px;max-height:560px;overflow:auto;padding-right:2px;scrollbar-gutter:stable}',
      // 条目区自己滚：一栏十几条时，让它撑高整个设置页比让它内部滚动难用得多。
      // 标题留在容器外，滚动时还看得见自己在看哪一段。
      '.dwb-entries{display:flex;flex-direction:column;gap:8px;max-height:min(560px,52vh);overflow:auto;padding-right:2px;scrollbar-gutter:stable}',
      // 卡脚本：一张卡一个折叠块。details 不接受控的 open —— 接了之后 React 会在
      // 每次重渲染时把展开状态按回去，用户就收不起来了。
      '.dwb-script{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-script+.dwb-script{margin-top:6px}',
      '.dwb-script>summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;outline:none}',
      '.dwb-script>summary::-webkit-details-marker{display:none}',
      '.dwb-script>summary::before{content:"▸";color:var(--dsw-alias-label-secondary);font-size:10px;flex:none}',
      '.dwb-script[open]>summary::before{content:"▾"}',
      '.dwb-script-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all}',
      '.dwb-scripts{display:flex;flex-direction:column;gap:3px;margin-top:8px}',
      '.dwb-script-row{display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 4px;border-radius:6px;flex-wrap:wrap}',
      '.dwb-script-row.common{opacity:.55}',
      '.dwb-dot{flex:none;font-size:9px;color:var(--dsw-alias-state-success-primary)}',
      '.dwb-dot.off{color:var(--dsw-alias-label-secondary)}',
      // dsh-peer-preset：与普通 chip 区分，用虚线边框避免被当成状态标签
      '.dwb-chip.preset{border-style:dashed;opacity:.9}',
      // dsh-peer-state：状态文字比圆点更明确，且不依赖颜色辨识
      '.dwb-peer-state{font-size:10px;opacity:.75;margin-left:3px}',
      '.dwb-mono{font-family:ui-monospace,Consolas,monospace}',
      // 允许换行：窄容器（侧边栏）里三个子项挤不下时，计数徽章整块落到下一行，
      // 而不是让文字列收缩到 0、把里面的 chip 溢到邻居身上（表现为两个徽章叠在一起）。
      '.dwb-item{display:flex;align-items:center;gap:8px;row-gap:4px;flex-wrap:wrap;padding:6px 8px;border-radius:9px;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;width:100%;color:inherit;font:inherit}',
      '.dwb-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-item.on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-ava{width:30px;height:30px;border-radius:8px;object-fit:cover;flex:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dwb-ava-fb{width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.dwb-item-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  // 徽章不许被压 —— 卡名那一列是 flex:1，窄的时候会把 CountChips 挤到名字上，
  // 看起来就是两个徽章叠在一起。给文字列 min-width:0 + 一个最小基宽：
  // 挤不下时由 .dwb-item 的 flex-wrap 让计数徽章整块换行，文字列也不会缩到 0。
  '.dwb-item>.dwb-col{min-width:0;flex:1 1 7em}',
  // 徽章行在文字列内部（.dwb-item > .dwb-col > .dwb-row），用后代选择器才命中；
  // 原来写成子选择器 .dwb-item>.dwb-row 是不匹配的，靠一个内联 gap 样式兜着。
  '.dwb-item .dwb-row{gap:4px;flex-wrap:wrap;min-width:0}',
  '.dwb-item .dwb-chip{flex:0 0 auto;white-space:nowrap}',
  // 计数徽章的容器：真实节点 + 不参与收缩，这样它不会跟卡名抢宽度
  '.dwb-counts{display:flex;align-items:center;gap:4px;flex:0 0 auto;margin-left:auto}',
  // 宿主补丁列表：一条一块，和「卡脚本」的组织方式一致
  '.dwb-list{display:flex;flex-direction:column;gap:6px;margin-top:6px}',
  '.dwb-patch-item{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 10px;display:flex;flex-direction:column;gap:3px}',
  '.dwb-patch-title{font-size:12px;font-weight:600}',
  '.dwb-patch-target{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);word-break:break-all}',
  '.dwb-patch-why{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.dwb-item-sub{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-entry{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);padding:10px 11px;display:flex;flex-direction:column;gap:7px}',
      '.dwb-entry.fixed{opacity:.78}',
      '.dwb-entry-head{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}',
      '.dwb-entry-title{font-size:13px;font-weight:600;flex:1 1 180px;min-width:0;word-break:break-word}',
      '.dwb-details{border-top:1px dashed var(--dsw-alias-border-l1);padding-top:6px}',
      '.dwb-details summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary);outline:none}',
      '.dwb-kv{display:grid;grid-template-columns:56px minmax(0,1fr);gap:4px 8px;margin-top:6px;font-size:12px}',
      '.dwb-kv dt{color:var(--dsw-alias-label-secondary);font-size:11px;padding-top:1px}',
      '.dwb-kv dd{margin:0;word-break:break-word;white-space:pre-wrap}',
      '.dwb-msg{padding:8px 10px;border-radius:9px;font-size:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:3px}',
      '.dwb-msg.ok{border-color:var(--dsw-alias-state-success-primary)}',
      '.dwb-msg.bad{border-color:var(--dsw-alias-state-error-primary)}',
      '.dwb-pre{margin:6px 0 0;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all}',
      '.dwb-note{display:flex;flex-direction:column;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-pick{cursor:pointer;gap:6px}',
      '.dwb-pick input[type=checkbox]{flex:none;margin:0}',
      '.dwb-live{color:var(--dsw-alias-state-success-primary);font-size:9px;line-height:1;margin-right:3px}',
      // dsh-peer-link：未连接时的红点
      '.dwb-live.err{color:var(--dsw-alias-state-error-primary)}',
      '.dwb-progress-wrap{display:flex;flex-direction:column;gap:4px;margin:2px 0 8px}',
      '.dwb-progress{height:4px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);overflow:hidden}',
      '.dwb-progress-bar{height:100%;background:var(--dsw-alias-state-success-primary);transition:width .18s ease}',
      '.dwb-script-wait{opacity:.75}',
      '.dwb-log{font-family:ui-monospace,Consolas,monospace;font-size:11px;max-height:132px;overflow:auto;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}',
      '.dwb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.dwb-field{display:flex;flex-direction:column;gap:3px}',
      '.dwb-field>span{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-empty{padding:18px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-backups{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto}',
      '.dwb-backup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-backup-time{font-family:ui-monospace,Consolas,monospace;font-size:11px}',
      '.dwb-stat{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}',
      '.dwb-stat-cell{padding:7px 9px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dwb-stat-k{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-stat-v{font-size:12px;font-weight:600;word-break:break-all}',
      '.dwb-area.tall{min-height:110px;font-family:ui-monospace,Consolas,monospace;font-size:11px}',
      // dsh-common-ui3：卡列表的勾选框。flex:none 免得被卡名压扁。
      '.dwb-pick-input{flex:none;width:14px;height:14px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-success-primary)}',
      '.dwb-area.dwb-drag{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-bg-layer-3)}',
      '.dwb-input.narrow{width:64px;min-width:64px}',
      // 目录浏览弹窗：参照卡片更新器的做法，自己列目录、自己选，不赌宿主的选择器。
      /* 侧栏底部入口。尺寸照卡片更新器的 .dcu-entry 抄 —— 它那套是量过宿主行高的，
         类名刻意避开 .dwb-entry：那个名字早被"错题条目"占用，且那边是
         flex-direction:column 的竖排卡片 —— 合并过来会让图标和文字竖着排。
         这里显式写 flex-direction:row，多一道保险。
         自己拟一套（哪怕只差几个 px）在侧栏里就是对不齐。 */
      '.dwb-nav-entry{display:flex;flex-direction:row;align-items:center;gap:8px;width:calc(100% + 4px);height:42px;box-sizing:border-box;margin:4px -2px;padding:0 10px 0 8px;border:none;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.dwb-nav-entry:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dwb-nav-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dwb-nav-entry[data-wide="false"]{width:36px;height:36px;margin:0;padding:0;gap:0;justify-content:center;border-radius:50%;flex:0 0 auto}',
      '.dwb-nav-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dwb-sheet-wide{width:min(1100px,100%);max-height:min(860px,90vh)}',

      '.dwb-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);padding:24px}',
      '.dwb-sheet{width:min(560px,100%);max-height:min(620px,88vh);overflow:auto;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(0,0,0,.28)}',
      '.dwb-browse{display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:4px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-up{font-family:ui-monospace,Consolas,monospace}',
      '@media (max-width:640px){.dwb-cols{grid-template-columns:1fr}.dwb-grid2{grid-template-columns:1fr}}',
    ].join('\n')

    /** 每页只装一次；见 installStyles。 */
    let styleWatcher = null

    /**
     * 把样式表放进文档，并让它留在那里。
     *
     * 这里要同时满足两件事：
     *
     * ① 面板挂在两个地方（设置页与侧栏入口），所以不能同时存在两个 style 标签 ——
     *    同优先级下后出现的那个会赢下每一条属性，而先挂哪个取决于用户先点了什么，
     *    于是页面可能在旧版本样式下渲染。
     * ② 标签本身可能被别人拿掉。侧栏入口常驻整个页面生命周期，它的 useEffect 只跑
     *    一次；之后任何重建 head 的动作（比如切换主题）都会让样式表消失，而按钮
     *    就一直画成浏览器默认样子 —— 带边框的灰方块、文字居中、没有满宽。
     *    识别它的线索是：样式表里写着 border:none，屏幕上却有边框。
     *
     * 所以标签是「复用」而不是「每次重建」，并且用 MutationObserver 盯着 head，
     * 谁把它删了就补回来。只有标签存在、内容按需重写，文档顺序就不再影响胜负。
     */
    function installStyles() {
      const head = typeof document === 'undefined' ? null : document.head
      if (!head) return
      const fill = (tag) => {
        tag.setAttribute('data-dsh-wrongbook', '1')
        if (tag.textContent !== CSS) tag.textContent = CSS
        return tag
      }
      const existing = head.querySelector('style[data-dsh-wrongbook]')
      if (existing) fill(existing)
      else head.appendChild(fill(document.createElement('style')))

      if (styleWatcher || typeof MutationObserver !== 'function') return
      /* 回调只补缺失的标签，不动已存在的那个 —— 所以它自己 append 完再进来会立刻停下。 */
      styleWatcher = new MutationObserver(() => {
        const live = document.head && document.head.querySelector('style[data-dsh-wrongbook]')
        if (live) return
        const tag = document.createElement('style')
        tag.setAttribute('data-dsh-wrongbook', '1')
        tag.textContent = CSS
        document.head.appendChild(tag)
      })
      styleWatcher.observe(head, { childList: true })
    }

    function useStyles() {
      /*
       * 每次 render 都调，而不是只调一次。installStyles 是幂等的（一次查询 + 一次
       * 字符串比较），而任何一次 render 都是把丢失的样式表补回来的机会。
       * MutationObserver 是主防线；这一句负责没有 MutationObserver 的浏览器。
       */
      useEffect(() => {
        installStyles()
      })
    }

    async function apiGet() {
      const res = await fetch(`${BASE}/state`, { headers: { accept: 'application/json' } })
      const body = await res.json()
      if (!body || body.ok === false) throw new Error((body && body.error) || `HTTP ${res.status}`)
      return body
    }

    async function apiPost(payload) {
      const res = await fetch(`${BASE}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!body) throw new Error(`HTTP ${res.status}`)
      return body
    }

    const avatarUrl = (key) => `${BASE}/avatar?card=${encodeURIComponent(key)}`

    /* dsh-peer-link —— 对端插件状态按钮：对方宿主半在跑就显示绿点，否则红点并可点击前往仓库下载。 */
    const PEER = {
      base: '/dsh-card-updater',
      url: 'https://github.com/XGUIMAX/dsh-tavern-card-updater',
      name: '卡片更新器',
    }
    function PeerLink() {
      const [online, setOnline] = useState(null)
      useEffect(() => {
        let alive = true
        const probe = () => {
          fetch(PEER.base + '/state', { headers: { accept: 'application/json' } })
            .then((res) => { if (alive) setOnline(res.ok) })
            .catch(() => { if (alive) setOnline(false) })
        }
        probe()
        const timer = setInterval(probe, 15000)
        return () => { alive = false; clearInterval(timer) }
      }, [])
      const ok = online === true
      const hint = ok ? PEER.name + ' 已连接' : (online === null ? '正在检测' + PEER.name + '…' : '未链接到' + PEER.name + '，请点击进行下载')
      return h('a', {
        className: 'dwb-btn ghost',
        href: PEER.url,
        target: '_blank',
        rel: 'noreferrer',
        style: { textDecoration: "none" },
        title: hint,
      },
        h('span', { className: ok ? 'dwb-live' : 'dwb-live err', title: hint }, '●'),
        PEER.name,
        h('span', { className: 'dwb-peer-state' }, ok ? '已连接' : (online === null ? '检测中' : '未连接')),
      )
    }
    const statusClass = (status) => (status === 'fixed' ? 'ok' : status === 'watch' ? 'warn' : 'bad')
    const statusLabel = (status) => t(`status.${status}`)

    function fmtTime(value) {
      if (!value) return ''
      const ms = typeof value === 'number' ? value : Date.parse(value)
      if (!ms) return ''
      try {
        return new Date(ms).toLocaleString()
      } catch {
        return ''
      }
    }

    function fmtBytes(n) {
      const size = Number(n) || 0
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
      return `${(size / 1024 / 1024).toFixed(1)} MB`
    }

    /* ------------------------------------------------------------ pieces */

    /** 头像取不到就退回首字方块，卡片目录里没配图是常态。 */
    function Avatar({ card }) {
      const [broken, setBroken] = useState(false)
      const has = card && card.avatar
      useEffect(() => {
        setBroken(false)
      }, [card && card.key, has])
      if (!has || broken) {
        const ch = String((card && (card.name || card.base)) || '?').trim().slice(0, 1)
        return h('div', { className: 'dwb-ava-fb', 'aria-hidden': 'true' }, ch || '?')
      }
      return h('img', {
        className: 'dwb-ava',
        src: avatarUrl(card.key),
        alt: '',
        loading: 'lazy',
        onError: () => setBroken(true),
      })
    }

    function CountChips({ count }) {
      if (!count) return null
      const out = []
      if (count.open) out.push(h('span', { key: 'o', className: 'dwb-chip bad' }, `${count.open} ${t('count.open')}`))
      if (count.watch) out.push(h('span', { key: 'w', className: 'dwb-chip warn' }, `${count.watch} ${t('count.watch')}`))
      if (count.fixed) out.push(h('span', { key: 'f', className: 'dwb-chip ok' }, `${count.fixed} ${t('count.fixed')}`))
      // 必须包一层真实节点。返回 Fragment 的话这几个徽章会直接成为 .dwb-item 的
      // flex 子项，跟旁边的名字列抢空间 —— 窄的时候就被挤到卡名上，看着像两个徽章重叠。
      return out.length ? h('div', { className: 'dwb-counts' }, out) : null
    }

    /**
     * 二次确认按钮。
     *
     * 不弹系统对话框：Electron 的渲染进程不支持 prompt（返回 null 且不报错），
     * confirm 的行为各版本也不一致 —— 点下去没反应是最难查的一类故障。
     * 这里让按钮自己变成确认态，删除和还原都必须再点一次。
     */
    function ConfirmButton({ label, armed, onArm, onCancel, onConfirm }) {
      if (armed) {
        return h(
          Fragment,
          null,
          h('button', { type: 'button', className: 'dwb-btn tiny bad', onClick: onConfirm }, t('btn.confirm')),
          h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onCancel }, t('btn.cancel')),
        )
      }
      return h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onArm }, label)
    }

    /* dsh-peer-preset —— 「另附专用预设」标记（数据来自卡片更新器的 state，只读展示） */
    const PEER_STATE_URL = '/dsh-card-updater/state'
    let peerPresetCache = null
    let peerPresetPromise = null
    function loadPeerPresets() {
      if (peerPresetCache) return Promise.resolve(peerPresetCache)
      if (peerPresetPromise) return peerPresetPromise
      peerPresetPromise = fetch(PEER_STATE_URL, { headers: { accept: "application/json" } })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          const map = new Map()
          const cards = (body && body.config && body.config.cards) || []
          cards.forEach((c) => {
            const p = (c.plain && c.plain.path) || ""
            const base = p ? String(p).split(/[\\/]/).pop() : ""
            const gates = (c.primary && c.primary.gates) || []
            const rec = {
              preset: gates.indexOf("preset") >= 0,
              gates,
              url: (c.primary && c.primary.url) || "",
              label: c.label || "",
            }
            if (base) map.set(base, rec)
            if (rec.label) map.set(rec.label, rec)
          })
          peerPresetCache = map
          return map
        })
        .catch(() => { peerPresetCache = new Map(); return peerPresetCache })
        .finally(() => { peerPresetPromise = null })
      return peerPresetPromise
    }
    function usePeerPresets() {
      const [map, setMap] = useState(peerPresetCache)
      useEffect(() => {
        let alive = true
        loadPeerPresets().then((m) => { if (alive) setMap(m) })
        return () => { alive = false }
      }, [])
      return map
    }
    const peerRecordOf = (map, card) => {
      if (!map) return null
      const candidates = []
      const abs = card && card.abs ? String(card.abs) : ""
      if (abs) candidates.push(abs.split(/[\\/]/).pop())
      // dsh-peer-preset-pair：更新器只为原版卡配了路径，MVU 版会落空。
      // 借错题库自己的 pairKey（"cards/X.json" 与 "cards/X MVU版本.json" 互指）再试一次，
      // 这样 MVU 版那个分类也能看到原版的「另附专用预设」。
      if (card && card.pairKey) {
        const m = /([^/\\]+)\.json$/i.exec(String(card.pairKey))
        if (m) candidates.push(m[1] + ".json")
      }
      if (card && card.name) candidates.push(card.name)
      if (card && card.key) candidates.push(card.key)
      for (const c of candidates) { const hit = map.get(c); if (hit) return hit }
      return null
    }
    function CardRow({ card, active, onPick }) {
      const peerMap = usePeerPresets()
      const peer = peerRecordOf(peerMap, card)
      return h(
        'button',
        {
          type: 'button',
          className: `dwb-item${active ? ' on' : ''}`,
          onClick: () => onPick(card.key),
          title: card.abs || card.name,
        },
        h(Avatar, { card }),
        h(
          'div',
          { className: 'dwb-grow dwb-col' },
          h('div', { className: 'dwb-item-name' }, card.name),
          h(
            'div',
            { className: 'dwb-row', style: { gap: 4 } },
            card.group === 'other'
              ? h('span', { className: 'dwb-chip' }, t('chip.other'))
              /* dsh-card-marker-badge —— 有卡型标记时显示标记的 label（如「已手改 MVU」），
                 悬停看理由；没有标记的仍按原来的 原版/MVU 显示。 */
              : h(
                  'span',
                  {
                    className: `dwb-chip${card.marker ? ' ok' : card.kind === 'mvu' ? ' warn' : ''}`,
                    title: card.marker
                      ? [card.marker.label, card.marker.reason, card.marker.note].filter(Boolean).join('\n\n')
                      : '',
                  },
                  card.marker ? card.marker.label : card.kind === 'mvu' ? 'MVU' : t('chip.plain'),
                ),
            card.missing ? h('span', { className: 'dwb-chip warn' }, '!') : null,
            /* dsh-wb-recpreset-badge —— 专属与推荐分开显示。
             *
             * 两者语义不同：专属是作者随卡附带的预设（拿它开卡），
             * 推荐是作者建议你另找一份来搭配（可能是通用的或别人的）。
             * 混成一个标记，看的人不知道该去取什么。
             *
             * 用表驱动而不是再写一个三元分支 —— 渲染分支上堆条件出过事，
             * 一次异常就把整个面板拖成白屏。多一种类型只要往表里加一行。
             */
            ...[
              ['preset', '专属预设', '另附专用预设'],
              ['recommended', '推荐预设', '推荐/建议使用某个预设'],
            ]
              .filter(([key]) => peer && peer.gates && peer.gates.indexOf(key) >= 0)
              .map(([key, text, why]) =>
                h('span', {
                  key: 'peer-' + key,
                  className: 'dwb-chip preset',
                  title: '卡片更新器检测到这张卡' + why + (peer.url ? '（来源：' + peer.url + '）' : ''),
                }, text),
              ),
            h('span', { className: 'dwb-item-sub' }, `${(card.count && card.count.total) || 0}`),
          ),
        ),
        h(CountChips, { count: card.count }),
      )
    }

    /**
     * 失效标记说人话。
     *
     * 剧情线一变（回退 / 重新生成 / 编辑正文），Tavern 会告诉宿主是哪一局哪一轮；
     * 这条底稿如果正是从那一轮抓下来的，就会被盖上一枚标记。底稿内容一个字没动，
     * 这里只解释"它指的地方变了"，要不要重抓一条由人决定。
     */
    function staleText(stale) {
      if (!stale) return ''
      const kind = String(stale.kind || '')
      // `Number(null)` 是 0：直接把 null 交给 Number 会写成"第 0 轮"，
      // 而宿主那边的"没带轮次"是合法值（退化成按整局处理）。
      const raw = stale.turn
      const turn = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
      if (!Number.isFinite(turn)) return kind === 'rollback' ? t('stale.rollbackAny') : t('stale.any')
      const n = String(turn)
      if (kind === 'rollback') return t('stale.rollback').replace('{n}', n)
      if (kind === 'regenerate') return t('stale.regenerate').replace('{n}', n)
      if (kind === 'edit') return t('stale.edit').replace('{n}', n)
      return t('stale.any')
    }

    /**
     * 一条底稿的正文（现象 / 原因 / 修法 / 出处 / 证据）。
     *
     * 折叠仍旧用原生 `<details>`，但**内容不预先渲染**：一条底稿的正文平均 5 KB
     * （证据那一栏还带着抓取时一并存下的上文），几百条加起来能到 1 MB 以上，而原生
     * 折叠只是"不显示" —— 节点照样在 DOM 里。整个面板打开那一下，时间基本全花在
     * 这里。改成点开过一次才挂内容，收起也不卸载（免得来回闪）。
     *
     * 监听写在 `summary` 的点击上，而不是 `details` 的 `toggle`：toggle 事件不冒泡，
     * React 对它的支持随版本而变；而点 summary 一定会走到这里，键盘也一样
     * （Enter / 空格在 summary 上本来就是点击行为）。
     */
    function EntryDetail({ entry, card, open }) {
      // `open` 只是给验证留的入口：详情是惰性挂载的，而验证要检查这些文字就绕不过
      // "先展开"这一步，它又没有真 DOM 可以点。
      const [opened, setOpened] = useState(!!open)
      return h(
        'details',
        { className: 'dwb-details' },
        h('summary', { onClick: () => setOpened(true) }, t('sec.detail')),
        opened ? h('dl', { className: 'dwb-kv' }, detailRows(entry, card)) : null,
      )
    }

    /**
     * 详情里的每一行。
     *
     * 单独一个函数是为了让验证还能检查这些文字 —— 详情现在是惰性挂载的，从整页渲染
     * 的结果里再也看不到它们（见上面 EntryDetail 那段）。
     */
    function detailRows(entry, card) {
      return [
        entry.symptom ? h(Fragment, null, h('dt', null, t('field.symptom')), h('dd', null, entry.symptom)) : null,
        entry.cause ? h(Fragment, null, h('dt', null, t('field.cause')), h('dd', null, entry.cause)) : null,
        entry.fix ? h(Fragment, null, h('dt', null, t('field.fix')), h('dd', null, entry.fix)) : null,
        entry.refs ? h(Fragment, null, h('dt', null, t('field.refs')), h('dd', null, entry.refs)) : null,
        // 这条结论是对哪一版卡记的。卡后来又改过时，先看这里：版本号不同，
        // 说明当时的毛病可能已经被改掉了，别拿旧结论去套新卡。
        entry.source && Number.isSafeInteger(entry.source.cardRevision)
          ? h(Fragment, null, h('dt', null, t('field.cardRevision')), h('dd', null, `r${entry.source.cardRevision}`))
          : null,
        // 标脏的原因写在详情里：角标只说"失效了"，这里说清是哪一轮、怎么变的。
        entry.stale
          ? h(
              Fragment,
              null,
              h('dt', null, t('stale.badge')),
              h('dd', null, `${staleText(entry.stale)} ${t('stale.note')}`),
            )
          : null,
        entry.evidence ? h(Fragment, null, h('dt', null, t('field.evidence')), h('dd', null, entry.evidence)) : null,
        h('dt', null, t('label.card')),
        h('dd', null, card ? card.name : entry.cardKey),
      ]
    }

    function EntryView({ entry, cards, pending, setPending, onEdit, onDelete, onCopy, onStatus, onClearStale }) {
      const card = cards.find((c) => c.key === entry.cardKey)
      const pair = card && card.pairKey ? cards.find((c) => c.key === card.pairKey) : null
      const armKey = `entry:${entry.id}`
      return h(
        'div',
        { className: `dwb-entry${entry.status === 'fixed' ? ' fixed' : ''}` },
        h(
          'div',
          { className: 'dwb-entry-head' },
          h('span', { className: `dwb-chip ${statusClass(entry.status)}` }, statusLabel(entry.status)),
          entry.stale
            ? h('span', { className: 'dwb-chip warn', title: staleText(entry.stale) }, t('stale.badge'))
            : null,
          h('span', { className: 'dwb-entry-title' }, entry.title || '(无标题)'),
          h('span', { className: 'dwb-chip' }, entry.scope),
          entry.tags && entry.tags.length
            ? h(
                Fragment,
                null,
                entry.tags.slice(0, 4).map((tag) => h('span', { key: tag, className: 'dwb-chip tag' }, tag)),
              )
            : null,
        ),
        h(
          'div',
          { className: 'dwb-row' },
          h('span', { className: 'dwb-sub' }, `${entry.id} · ${t('misc.updated')} ${fmtTime(entry.updatedAt)}`),
          h('span', { className: 'dwb-grow' }),
          entry.status !== 'fixed'
            ? h(
                'button',
                { type: 'button', className: 'dwb-btn tiny', onClick: () => onStatus(entry, 'fixed') },
                t('btn.markFixed'),
              )
            : null,
          pair
            ? h(
                'button',
                { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => onCopy(entry, pair.key) },
                t('btn.copyTo'),
              )
            : null,
          entry.stale
            ? h(
                'button',
                { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => onClearStale(entry) },
                t('stale.clear'),
              )
            : null,
          h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => onEdit(entry) }, t('btn.edit')),
          h(ConfirmButton, {
            label: t('btn.remove'),
            armed: pending === armKey,
            onArm: () => setPending(armKey),
            onCancel: () => setPending(null),
            onConfirm: () => onDelete(entry),
          }),
        ),
        h(EntryDetail, { entry, card }),
      )
    }

    /**
     * 目录浏览弹窗。
     *
     * 参照卡片更新器的做法：不调宿主的目录选择器 —— 那个能力在不在、能不能用
     * 都不一定 —— 改成让 host 列一层目录、这里渲染一层。空路径列出所有驱动器，
     * 所以换到别的盘也走得到。
     */
    /** 一行脚本：名字、字符数、外链、data 键、启停。 */
    function ScriptRow({ script }) {
      return h(
        'div',
        { className: `dwb-script-row${script.common ? ' common' : ''}` },
        h('span', { className: `dwb-dot${script.enabled ? '' : ' off'}` }, script.enabled ? '●' : '○'),
        h('span', { className: 'dwb-mono dwb-grow' }, script.name),
        h('span', { className: 'dwb-sub' }, `${script.chars} 字符`),
        script.link ? h('span', { className: 'dwb-chip' }, script.link) : null,
        script.dataKeys.length ? h('span', { className: 'dwb-chip tag' }, `data: ${script.dataKeys.join(', ')}`) : null,
        script.enabled ? null : h('span', { className: 'dwb-chip warn' }, t('scripts.disabled')),
      )
    }

    /**
     * 一张卡的脚本块。
     *
     * `details` 刻意不接受控的 `open`：接了之后每次重渲染都会把展开状态按回初始值，
     * 用户就再也收不起来（或展不开）。默认收起，summary 上写清带了多少特化内容。
     */
    function CardScriptBlock({ card }) {
      // 盘点中的卡：先把名字摆出来，内容位置留个"盘点中"。逐张回来，逐张替换 ——
      // 界面立刻有东西，不用盯着一个转圈等全部读完。
      if (card.pending) {
        return h(
          'div',
          { className: 'dwb-script dwb-script-wait' },
          h('span', { className: 'dwb-script-name dwb-grow' }, card.name),
          h('span', { className: 'dwb-chip' }, t('scripts.cardPending')),
        )
      }
      // 字段给默认值：骨架阶段和出错分支都可能只带一部分，不该因此白屏。
      const scripts = card.scripts || []
      const special = card.special || []
      const controllers = card.controllers || []
      const patchEntries = card.patchEntries || []
      const regexes = card.regexes || []
      const regexDisabled = card.regexDisabled || 0
      const regexClashes = card.regexClashes || []
      const otherExtensions = card.otherExtensions || []
      const bits = [t('scripts.count').replace('{n}', scripts.length)]
      if (special.length) bits.push(t('scripts.specialCount').replace('{n}', special.length))
      if (controllers.length) bits.push(t('scripts.controllerCount').replace('{n}', controllers.length))
      return h(
        'details',
        { className: 'dwb-script' },
        h(
          'summary',
          null,
          h('span', { className: 'dwb-script-name dwb-grow' }, card.name),
          bits.map((bit, i) => h('span', { key: i, className: `dwb-chip${i === 1 ? ' warn' : ''}` }, bit)),
        ),
        card.error ? h('div', { className: 'dwb-msg bad' }, card.error) : null,
        scripts.length
          ? h(
              'div',
              { className: 'dwb-scripts' },
              scripts.map((script, i) => h(ScriptRow, { key: i, script })),
            )
          : h('div', { className: 'dwb-sub' }, t('scripts.none')),
        controllers.length
          ? h('div', { className: 'dwb-sub' }, `${t('scripts.controllers')}：${controllers.join('、')}`)
          : null,
        patchEntries.length
          ? h('div', { className: 'dwb-sub' }, `${t('scripts.patchEntries')}：${patchEntries.join('、')}`)
          : null,
        // 正则脚本是卡里项数最多的一块，之前完全没盘点。
        regexes.length
          ? h(
              'div',
              null,
              h(
                'div',
                { className: 'dwb-sub' },
                `${t('scripts.regex')}：${regexes.length}${regexDisabled ? `（${t('scripts.regexDisabled').replace('{n}', regexDisabled)}）` : ''}`,
              ),
              regexClashes.length
                ? h(
                    'div',
                    { className: 'dwb-msg bad' },
                    `${t('scripts.regexClash')}：${regexClashes
                      .map((c) => {
                        // 成对写（一条渲染、一条对 AI 隐藏）是常见设计，不算问题；
                        // 只有「全都启用」和「同名重复」才值得盯。
                        const mark = c.duplicated ? t('scripts.dup') : c.allOn ? t('scripts.allOn') : ''
                        return `${c.marker} ← ${c.names.join(' / ')}${mark}`
                      })
                      .join('；')}`,
                  )
                : null,
              h(
                'div',
                { className: 'dwb-scripts' },
                regexes.map((r, i) =>
                  h(
                    'div',
                    { key: i, className: 'dwb-script-row' },
                    h('span', { className: `dwb-chip${r.disabled ? ' warn' : ''}` }, r.disabled ? t('scripts.off') : t('scripts.on')),
                    h('span', { className: 'dwb-grow' }, r.name),
                    r.markers.length ? h('span', { className: 'dwb-mono dwb-sub' }, r.markers.join(' ')) : null,
                    r.where ? h('span', { className: 'dwb-sub' }, r.where) : null,
                  ),
                ),
              ),
            )
          : null,
        otherExtensions.length
          ? h(
              'div',
              { className: 'dwb-sub' },
              `${t('scripts.otherExt')}：${otherExtensions.map((o) => `${o.key}(${o.items})`).join(' · ')}`,
            )
          : null,
      )
    }

    /**
     * 回流弹窗：挑目标 skill、挑范围、看条数，然后写。
     *
     * 只列用户自己的 skill 能选；内置那些照实显示但写不了 —— 它们在程序目录里，
     * 下一次 Tavern 更新会整份覆盖，与其让人以为写成功了，不如当场说清。
     */
    function RefluxModal({ state, entries, selectedKey, onChange, onClose, onWrite, onCreate, onDelete, onSample, onToggleAuto }) {
      const skills = state.skills || []
      const mine = skills.filter((s) => !s.builtin)
      const current = mine.find((s) => s.name === state.skill) || null
      const count =
        state.scope === 'card'
          ? entries.filter((e) => e.cardKey === selectedKey).length
          : state.scope === 'active'
            ? entries.filter((e) => e.status !== 'fixed').length
            : entries.length
      const scopeLabel = { all: 'scopeAll', card: 'scopeCard', active: 'scopeActive' }

      return h(
        'div',
        {
          className: 'dwb-overlay',
          onClick: (ev) => {
            if (ev.target === ev.currentTarget) onClose()
          },
        },
        h(
          'div',
          { className: 'dwb-sheet' },
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-title dwb-grow' }, t('reflux.title')),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onClose }, t('btn.close')),
          ),
          h('div', { className: 'dwb-sub' }, t('reflux.hint')),

          // 选目标和新建是两件不同的事，原来混在一起：那对输入框看着像是
          // "当前选中 skill 的简介"，切一下下拉它们还是空的，像坏了。
          // 现在新建归到开关后面，选中态只显示那个 skill 自己的信息。
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-sub dwb-grow' }, t('reflux.skill')),
            h(
              'button',
              {
                type: 'button',
                className: `dwb-btn tiny${state.creating ? ' primary' : ' ghost'}`,
                onClick: () => onChange({ creating: !state.creating, confirmDelete: '' }),
              },
              state.creating ? t('reflux.cancelCreate') : `＋ ${t('reflux.newSkill')}`,
            ),
          ),

          state.creating
            ? null
            : state.busy && !skills.length
              ? h('div', { className: 'dwb-sub' }, t('scripts.loading'))
              : mine.length
                ? h(
                    'select',
                    { className: 'dwb-select', value: state.skill, onChange: (ev) => onChange({ skill: ev.target.value }) },
                    mine.map((s) => h('option', { key: s.name, value: s.name }, s.name)),
                  )
                : h('div', { className: 'dwb-sub' }, t('reflux.noSkill')),

          !state.creating && current
            ? h(
                'div',
                { className: 'dwb-note' },
                h('div', { className: 'dwb-sub' }, current.description || t('reflux.noDesc')),
                h(
                  'div',
                  { className: 'dwb-sub' },
                  `${t('reflux.refs')}：${(current.references || []).join('、') || t('reflux.noRefs')} · ${t('reflux.skillEntries').replace('{n}', current.entries || 0)}`,
                ),
              )
            : null,

          !state.creating && current
            ? h(
                'label',
                { className: 'dwb-row dwb-pick' },
                h('input', {
                  type: 'checkbox',
                  className: 'dwb-check',
                  checked: state.autoSkill === current.name,
                  onChange: () => onToggleAuto(state.autoSkill === current.name ? '' : current.name),
                }),
                h('span', { className: 'dwb-sub dwb-grow' }, t('reflux.auto')),
              )
            : null,

          !state.creating && state.autoSkill
            ? h(
                'div',
                { className: 'dwb-sub' },
                state.autoLast && state.autoLast.error
                  ? t('reflux.autoFailed').replace('{err}', state.autoLast.error)
                  : state.autoLast && state.autoLast.at
                    ? t('reflux.autoLast')
                        .replace('{when}', String(state.autoLast.at).slice(0, 16).replace('T', ' '))
                        .replace('{n}', state.autoLast.written || 0)
                    : t('reflux.autoIdle'),
              )
            : null,

          !state.creating && current
            ? h(
                'div',
                { className: 'dwb-row' },
                h('span', { className: 'dwb-grow' }),
                h(ConfirmButton, {
                  label: t('reflux.deleteSkill'),
                  armed: state.confirmDelete === current.name,
                  onArm: () => onChange({ confirmDelete: current.name }),
                  onCancel: () => onChange({ confirmDelete: '' }),
                  onConfirm: onDelete,
                }),
              )
            : null,

          state.creating
            ? h(
                Fragment,
                null,
                h('input', {
                  className: 'dwb-input',
                  placeholder: t('reflux.createHint'),
                  value: state.newName,
                  onChange: (ev) => onChange({ newName: ev.target.value }),
                }),
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('input', {
                    className: 'dwb-input dwb-grow',
                    placeholder: t('reflux.skillDescHint'),
                    value: state.newDesc || '',
                    onChange: (ev) => onChange({ newDesc: ev.target.value }),
                  }),
                  h('button', {
                    type: 'button',
                    className: 'dwb-btn ghost',
                    title: t('reflux.sampleTitle'),
                    onClick: onSample,
                  }, t('reflux.sample')),
                ),
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('span', { className: 'dwb-sub dwb-grow' }, state.newName ? '' : t('reflux.createNeedsName')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn ghost',
                      disabled: state.busy || !state.newName,
                      onClick: onCreate,
                    },
                    t('reflux.create'),
                  ),
                ),
              )
            : null,

          h('div', { className: 'dwb-sub' }, t('reflux.file')),
          h('input', {
            className: 'dwb-input',
            value: state.file,
            onChange: (ev) => onChange({ file: ev.target.value }),
          }),

          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-sub' }, t('reflux.scope')),
            ...['all', 'card', 'active'].map((scope) =>
              h(
                'button',
                {
                  key: scope,
                  type: 'button',
                  className: `dwb-btn tiny${state.scope === scope ? ' primary' : ' ghost'}`,
                  onClick: () => onChange({ scope }),
                },
                t(`reflux.${scopeLabel[scope]}`),
              ),
            ),
            h('span', { className: 'dwb-grow' }),
            h('span', { className: 'dwb-sub' }, t('reflux.plan').replace('{n}', count)),
          ),

          state.message ? h('div', { className: 'dwb-msg' }, state.message) : null,

          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-grow' }),
            h('button', { type: 'button', className: 'dwb-btn ghost', onClick: onClose }, t('btn.close')),
            h(
              'button',
              {
                type: 'button',
                className: 'dwb-btn primary',
                disabled: state.busy || state.creating || !state.skill || !count,
                onClick: onWrite,
              },
              t('reflux.write'),
            ),
          ),
        ),
      )
    }

    function BrowseModal({ initialPath, onPick, onClose }) {
      const [view, setView] = useState(null)
      const [typed, setTyped] = useState(String(initialPath || ''))
      const [busy, setBusy] = useState(false)
      const [failed, setFailed] = useState('')

      const load = useCallback(async (target) => {
        setBusy(true)
        setFailed('')
        try {
          const res = await fetch(`${BASE}/list?path=${encodeURIComponent(target == null ? '' : target)}`)
          const body = await res.json()
          setView(body)
          if (body && body.dir && !body.drives) setTyped(body.dir)
        } catch (e) {
          setFailed(String(e && e.message ? e.message : e))
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        void load(initialPath)
      }, [load, initialPath])

      useEffect(() => {
        const onKey = (ev) => {
          if (ev.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const entries = (view && view.entries) || []
      const pickable = !!(view && view.dir && !view.drives && !view.error)

      return h(
        'div',
        {
          className: 'dwb-overlay',
          onClick: (ev) => {
            if (ev.target === ev.currentTarget) onClose()
          },
        },
        h(
          'div',
          { className: 'dwb-sheet' },
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-title dwb-grow' }, t('browse.title')),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onClose }, t('btn.close')),
          ),
          h('div', { className: 'dwb-sub' }, t('browse.hint')),
          h(
            'div',
            { className: 'dwb-row' },
            h('input', {
              className: 'dwb-input dwb-grow',
              style: { flex: '1 1 220px' },
              value: typed,
              placeholder: 'D:\\TavernBackups',
              onChange: (ev) => setTyped(ev.target.value),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter') void load(typed)
              },
            }),
            h('button', { type: 'button', className: 'dwb-btn', onClick: () => void load(typed), disabled: busy }, t('browse.go')),
            h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void load(''), disabled: busy }, t('browse.drives')),
          ),
          failed ? h('div', { className: 'dwb-msg bad' }, failed) : null,
          view && view.error ? h('div', { className: 'dwb-msg bad' }, view.error) : null,
          h(
            'div',
            { className: 'dwb-browse' },
            view && view.parent
              ? h(
                  'button',
                  { type: 'button', className: 'dwb-item', onClick: () => void load(view.parent) },
                  h('span', { className: 'dwb-up' }, '..'),
                  h('span', { className: 'dwb-item-name' }, t('browse.up')),
                )
              : null,
            entries.length
              ? entries.map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.path,
                      type: 'button',
                      className: 'dwb-item',
                      onClick: () => void load(entry.path),
                      title: entry.path,
                    },
                    h('span', { className: 'dwb-up' }, entry.type === 'drive' ? '[·]' : '>'),
                    h('span', { className: 'dwb-item-name dwb-grow' }, entry.name),
                  ),
                )
              : h('div', { className: 'dwb-empty' }, t('browse.empty')),
          ),
          h(
            'div',
            { className: 'dwb-row' },
            h(
              'span',
              { className: 'dwb-sub dwb-grow' },
              view && view.dir && !view.drives ? view.dir : t('browse.pickHint'),
            ),
            h(
              'button',
              { type: 'button', className: 'dwb-btn primary', onClick: () => pickable && onPick(view.dir), disabled: !pickable },
              t('browse.pick'),
            ),
          ),
        ),
      )
    }

    function Field({ label, children }) {
      return h('label', { className: 'dwb-field' }, h('span', null, label), children)
    }

    /** 新增/编辑共用一张表单：字段一致，只有保存动作不同。 */
    function Editor({ state, cards, scopes, statuses, onChange, onSubmit, onCancel }) {
      const draft = state.draft
      const set = (key) => (ev) => onChange({ ...draft, [key]: ev.target.value })
      const tagText = Array.isArray(draft.tags) ? draft.tags.join(', ') : String(draft.tags || '')
      return h(
        'div',
        { className: 'dwb-card dwb-card flat' },
        h('div', { className: 'dwb-title' }, state.mode === 'edit' ? t('editor.edit') : t('editor.add')),
        h(
          'div',
          { className: 'dwb-grid2' },
          h(Field, { label: t('field.card') }, h(
            'select',
            { className: 'dwb-input', value: draft.cardKey, onChange: set('cardKey') },
            cards.map((c) => h('option', { key: c.key, value: c.key }, c.name)),
          )),
          h(Field, { label: t('field.title') }, h('input', {
            className: 'dwb-input',
            value: draft.title,
            placeholder: t('field.title.ph'),
            onChange: set('title'),
          })),
          h(Field, { label: t('field.status') }, h(
            'select',
            { className: 'dwb-input', value: draft.status, onChange: set('status') },
            statuses.map((s) => h('option', { key: s, value: s }, statusLabel(s))),
          )),
          h(Field, { label: t('field.scope') }, h(
            'select',
            { className: 'dwb-input', value: draft.scope, onChange: set('scope') },
            scopes.map((s) => h('option', { key: s, value: s }, s)),
          )),
        ),
        h(Field, { label: t('field.tags') }, h('input', {
          className: 'dwb-input',
          value: tagText,
          placeholder: t('field.tags.ph'),
          onChange: set('tags'),
        })),
        h(Field, { label: t('field.symptom') }, h('textarea', {
          className: 'dwb-area',
          value: draft.symptom,
          placeholder: t('field.symptom.ph'),
          onChange: set('symptom'),
        })),
        h(Field, { label: t('field.cause') }, h('textarea', {
          className: 'dwb-area',
          value: draft.cause,
          placeholder: t('field.cause.ph'),
          onChange: set('cause'),
        })),
        h(Field, { label: t('field.fix') }, h('textarea', {
          className: 'dwb-area',
          value: draft.fix,
          placeholder: t('field.fix.ph'),
          onChange: set('fix'),
        })),
        h(
          'div',
          { className: 'dwb-grid2' },
          h(Field, { label: t('field.refs') }, h('input', {
            className: 'dwb-input',
            value: draft.refs,
            placeholder: t('field.refs.ph'),
            onChange: set('refs'),
          })),
          h(Field, { label: t('field.evidence') }, h('input', {
            className: 'dwb-input',
            value: draft.evidence,
            placeholder: t('field.evidence.ph'),
            onChange: set('evidence'),
          })),
        ),
        h(
          'div',
          { className: 'dwb-row' },
          h(
            'button',
            { type: 'button', className: 'dwb-btn primary', onClick: onSubmit, disabled: !String(draft.title).trim() },
            t('btn.save'),
          ),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: onCancel }, t('btn.cancel')),
        ),
      )
    }

    /* ------------------------------------------------------------- panel */

    const EMPTY_DRAFT = {
      cardKey: '',
      title: '',
      symptom: '',
      cause: '',
      fix: '',
      scope: '卡片',
      status: 'open',
      tags: '',
      refs: '',
      evidence: '',
    }

    function Panel() {
      useStyles()

      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)
      const [log, setLog] = useState([])
      const [view, setView] = useState('entries')
      const [selectedKey, setSelectedKey] = useState('')
      const [query, setQuery] = useState('')
      const [filterStatus, setFilterStatus] = useState('')
      const [filterScope, setFilterScope] = useState('')
      const [editor, setEditor] = useState(null)
      const [lookup, setLookup] = useState(null)
      const [pending, setPending] = useState(null)
      const [importText, setImportText] = useState('')
      const [dragOver, setDragOver] = useState(false)
const [importOpen, setImportOpen] = useState(false)
      const [renameOpen, setRenameOpen] = useState(false)
      const [renameText, setRenameText] = useState('')
      const [bucketOpen, setBucketOpen] = useState(false)
      const [bucketText, setBucketText] = useState('')
      const [browse, setBrowse] = useState(null)
      const [scriptScan, setScriptScan] = useState(null)
      const [scriptBusy, setScriptBusy] = useState(false)
      /** 逐张盘点的进度：骨架到手后从 0/total 走到 total/total。 */
      const [scriptProgress, setScriptProgress] = useState({ done: 0, total: 0 })
      const [reflux, setReflux] = useState(null)
      const [keepCount, setKeepCount] = useState(20)

      const push = useCallback((text, kind) => {
        setLog((prev) => [{ t: new Date().toLocaleTimeString(), text, kind: kind || 'info' }, ...prev].slice(0, 30))
      }, [])

      const load = useCallback(async () => {
        try {
          const res = await apiGet()
          setData(res)
          setSelectedKey((prev) => (prev && res.cards.some((c) => c.key === prev) ? prev : (res.cards[0] && res.cards[0].key) || ''))
          return res
        } catch (e) {
          const text = String(e && e.message ? e.message : e)
          setMessage({ kind: 'bad', text: `${t('err.bridge')}（${text}）` })
          return null
        }
      }, [])

      useEffect(() => {
        void load()
      }, [load])

      /**
       * 所有写操作走这里，保证「点了必有回音」。
       *
       * okText 为字符串就直接显示；需要拼上返回值的地方（比如新条目 id、
       * 备份份数）把 okText 传成 null，由调用方拿返回值自己组消息再覆盖。
       */
      const run = useCallback(
        async (payload, okText, hint) => {
          setBusy(true)
          try {
            const res = await apiPost(payload)
            if (!res || res.ok === false) {
              const text = `${okText || payload.action}：${(res && res.error) || 'failed'}`
              setMessage({ kind: 'bad', text })
              push(text, 'bad')
              return null
            }
            if (okText) {
              setMessage({ kind: 'ok', text: okText, hint: hint || '' })
              push(okText, 'ok')
            }
            await load()
            return res
          } catch (e) {
            const text = String(e && e.message ? e.message : e)
            setMessage({ kind: 'bad', text })
            push(text, 'bad')
            return null
          } finally {
            setBusy(false)
          }
        },
        [load, push],
      )

      // 跨卡查询走后台的检索：顺序由后台固定成「本卡在前、跨卡在后」，
      // 跟 wrongbook_lookup 工具返回的是同一套结果，界面上看到的就是调试时拿到的。
      useEffect(() => {
        const q = query.trim()
        if (!q) {
          setLookup(null)
          return undefined
        }
        const timer = setTimeout(() => {
          void (async () => {
            try {
              const res = await apiPost({
                action: 'lookup',
                card: selectedKey,
                query: q,
                status: filterStatus,
                scope: filterScope,
              })
              setLookup(res && res.ok ? res.result : null)
            } catch {
              setLookup(null)
            }
          })()
        }, 220)
        return () => clearTimeout(timer)
      }, [query, filterStatus, filterScope, selectedKey, data && data.updatedAt])

      const cards = (data && data.cards) || []
      const entries = (data && data.entries) || []
      const generalKey = (data && data.generalKey) || '__general__'
      const backups = (data && data.backups) || []

      // 分类分两组：人物卡（来自卡片目录）和其它（手建的，比如卡片更新器）。
      // 两个错题页签共用同一套渲染，只是换掉数据源。
      const groupOf = view === 'other' ? 'other' : 'card'

      /* dsh-wb-filter-cards —— 让上方「状态 / 范围」筛选也作用于左侧分类列表。
       *
       * 原来这两个下拉只过滤右栏条目，左侧永远列出全部卡片；条目一多就分不出
       * 哪些卡还有活儿没干完。这里按当前筛选算出每张卡的命中条数，把 0 的隐藏掉。
       *
       * 两条边界：
       *   · 筛选为空时不过滤 —— 否则一进页面就是空列表，像是库读坏了；
       * 两组都筛。原先只筛人物卡那组，理由是「其它错题是手建分类、
       * 被筛空就没法往里记东西」—— 但新增/改名/删除分类的按钮在筛选栏上方、
       * 不经过这个列表，列表空了照样能建，所以两组统一行为更好理解。
       */
      const filterCounts = useMemo(() => {
        const m = new Map()
        for (const e of entries) {
          if (filterStatus && e.status !== filterStatus) continue
          if (filterScope && e.scope !== filterScope) continue
          m.set(e.cardKey, (m.get(e.cardKey) || 0) + 1)
        }
        return m
      }, [entries, filterStatus, filterScope])
      const filtersActive = Boolean(filterStatus || filterScope)
      const groupCards = cards
        .filter((c) => (c.group || 'card') === groupOf)
        .filter((c) => (!filtersActive ? true : (filterCounts.get(c.key) || 0) > 0))
      const isOther = groupOf === 'other'
      const currentCard = groupCards.find((c) => c.key === selectedKey) || null

      /** 切页签时把选中项挪到该组里，否则右栏会显示上一组的分类。 */
      /* dsh-common-tab —— 通用脚本页签的状态。
       *
       * 数据不放在 statePayload 里：那要读 8 张 MVU 卡（30MB+），
       * 每次开面板都扫会明显拖慢。改成切到这个页签时才拉一次。
       */
      const [common, setCommon] = useState(null)
      const [commonOpen, setCommonOpen] = useState(false)
      const [commonText, setCommonText] = useState('')
      const [commonDrag, setCommonDrag] = useState(false)
      /* dsh-common-ui3 —— 分类筛选与卡的多选。
       *
       * 脚本会有多个，平铺一层没法看，所以按 category 筛。
       * 卡这边要能"只对选中的几张"装卸 —— 原来只有全部，粒度太粗。
       * 选中集用文件名为键（卡可能改显示名，文件名才是稳定的）。 */
      const [commonCat, setCommonCat] = useState('')
      const [commonPicked, setCommonPicked] = useState(() => new Set())
      /* commonTagFilter —— 卡列表按「装了哪个通用脚本」筛。
       *
       * 用脚本当筛选标签，而不是给卡另设一套分类：脚本本身就是用户导入的、
       * 有明确含义的东西，再引入一层分类只会多一处要维护的映射。
       * '' 表示不筛（全部）。 */
      const [commonTag, setCommonTag] = useState('')
      /* 检测结果。每次只针对一个脚本，所以存单个对象。 */
      const [fit, setFit] = useState(null)
      /* dsh-fit-job —— 后台任务的状态。
       *
       * 任务在宿主进程里跑，所以关掉面板照样继续；这里只是"看一眼"。
       * 重开面板时靠 localStorage 记住上次看的是哪个脚本，接着轮询。 */
      const [fitJob, setFitJob] = useState(null)
      /* 交给工作台的那段文本。生成后先给用户看，再让他决定要不要发。 */
      const [handoff, setHandoff] = useState(null)
      /* dsh-common-update —— 更新库里已有的脚本。
       *
       * 与「导入」分开是有意的：导入是"新脚本进库"，同名时会连 dsh_meta 一起按新文件重算；
       * 更新是"库里的这份换新版"，只换脚本本体、保留库里攒下的说明。
       */
      const [updateFor, setUpdateFor] = useState(null)
      const [updateText, setUpdateText] = useState('')
      const [updateResult, setUpdateResult] = useState(null)
      const [updateDrag, setUpdateDrag] = useState(false)
      /* 两个结果区的展开状态。原来"收起"只是把数据清掉，
         既不能收起来看别的、也拿不回来；改成折叠开关。 */
      const [fitCollapsed, setFitCollapsed] = useState(false)
      const [jobCollapsed, setJobCollapsed] = useState(false)
      const [commonBusy, setCommonBusy] = useState(false)

      const loadCommon = useCallback(async () => {
        setCommonBusy(true)
        try {
          const r = await apiPost({ action: 'commonScripts' })
          if (r && r.ok) setCommon(r)
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }, [push])

      /* 首次切到这个页签时拉一次；之后靠手动刷新，避免每次点击都读盘。 */
      useEffect(() => {
        if (view === 'common' && !common && !commonBusy) void loadCommon()
      }, [view, common, commonBusy, loadCommon])

      /* 导入脚本：把粘贴或拖入的 JSON 交给后端写进库。 */
      const importCommon = async () => {
        if (!commonText.trim()) { push(t('common.importEmpty'), 'bad'); return }
        setCommonBusy(true)
        try {
          const r = await apiPost({ action: 'importCommonScript', json: commonText })
          if (!r || !r.ok) { push(t('common.importFail'), 'bad'); return }
          push(t('common.importOk').replace('{name}', r.name) + (r.replaced ? t('common.importReplaced') : ''), 'ok')
          setCommonText('')
          setCommonOpen(false)
          await loadCommon()
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }

      const deleteCommon = async (name) => {
        setCommonBusy(true)
        try {
          const r = await apiPost({ action: 'deleteCommonScript', name })
          if (!r || !r.ok) { push(t('common.deleteFail'), 'bad'); return }
          push(t('common.deleteOk').replace('{name}', name), 'ok')
          await loadCommon()
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }
      /* 检测某个脚本对哪些卡有实际用处。
       *
       * 给的是可验证的匹配（脚本用到的能力 × 卡的特征），不是内容层面的推荐 ——
       * "这张卡的界面能交给它"这种话要读懂卡才说得出来，关键词匹配给不出。 */
      /* 启动后台扫描。已经在跑的直接拿到现有任务。 */
      /*
       * 生成交给工作台的 prompt。
       *
       * 要点：
       *   · 脚本用绝对路径点名（它在 data/tools 下，不是 resources，没法用 @ 引用）；
       *   · 卡用 @ 引用（它们在 resources/cards 下，工作台认这个语法）；
       *   · 明确要求"点名具体功能"，否则模型只会回"界面类"这种笼统的话。
       */
      const buildHandoffPrompt = (L, cards) => {
        const list = (cards || []).map((c) => '@\"cards/' + c.file + '\"').join('\n')
        return [
          '请分析这个通用脚本，判断它适合装到哪些卡上。',
          '',
          '【脚本】',
          '路径：data/tools/wrongbook/common-scripts/' + L.file,
          '（' + Math.round((L.bytes || 0) / 1024) + ' KB。读之前先确认它调用了哪些宿主 API，不必逐字读完。）',
          '',
          '【候选卡】（' + (cards || []).length + ' 张：MVU 版与自带 MVU 的卡）',
          list,
          '',
          '【要求】',
          '1. 逐张读卡 —— 至少看 description、正则名、脚本名、世界书条目标题。',
          '2. 说清这张卡的【哪个具体功能】能被脚本接管。要点名，比如「龙娘回廊的橱窗」「姬侠传的 SLG 界面」「道渊的悬浮状态栏」；不要写「界面类」「状态栏」这种笼统的话。',
          '3. 不要写「建议装」这种结论 —— 给可核对的事实，让人自己判断。',
          '4. 最后按受益程度排序，并说清为什么前几名收益最大。',
          '5. 如果某张卡明显没什么可受益的，直接说，不用凑理由。',
        ].join('\n')
      }

      /* 复制到剪贴板，并尝试填入对话输入框（宿主注入了 #send_textarea 兼容层）。 */
      const handOff = async (L, cards) => {
        const text = buildHandoffPrompt(L, cards)
        setHandoff({ name: L.name, text })
        let copied = false
        let filled = false
        try {
          await navigator.clipboard.writeText(text)
          copied = true
        } catch { /* 无剪贴板权限，下面还有"手动复制"的入口 */ }
        try {
          const area = document.getElementById('send_textarea')
          if (area) {
            area.value = text
            area.dispatchEvent(new Event('input', { bubbles: true }))
            filled = true
          }
        } catch { /* 对话页没开，正常 */ }
        push(filled ? t('common.handoffFilled') : copied ? t('common.handoffCopied') : t('common.handoffManual'), filled ? 'ok' : 'info')
      }

      /* 手动复制（剪贴板 API 不可用时的兜底）。 */
      const copyHandoff = async (text) => {
        try {
          await navigator.clipboard.writeText(text)
          push(t('common.handoffCopied'), 'ok')
        } catch (e) {
          push(t('common.handoffManual'), 'bad')
        }
      }
      const genFit = async (name) => {
        setCommonBusy(true)
        try {
          const r = await apiPost({ action: 'startFitScan', name })
          if (!r || !r.ok) { push(t('common.genFitFail'), 'bad'); return }
          setFitJob(r.job)
          try { window.localStorage.setItem('dwb-fit-job', name) } catch { /* 无痕模式等，无所谓 */ }
          push(t('common.genFitStarted'), 'ok')
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }

      /*
       * 轮询任务进度。任务在前端断开后仍然继续，所以这里只是"读状态"，
       * 停了也不影响它跑。
       */
      useEffect(() => {
        if (view !== 'common') return undefined
        if (!fitJob || fitJob.status !== 'running') return undefined
        let stopped = false
        const tick = async () => {
          try {
            const r = await apiPost({ action: 'fitScanState', name: fitJob.name })
            if (!stopped && r && r.ok && r.job) setFitJob(r.job)
          } catch { /* 下一轮再试 */ }
        }
        const timer = setInterval(tick, 1000)
        return () => { stopped = true; clearInterval(timer) }
      }, [view, fitJob, fitJob && fitJob.name, fitJob && fitJob.status])

      /* 重开面板时接着看上次那个任务 —— 它可能还在跑，也可能已经跑完。 */
      useEffect(() => {
        if (view !== 'common' || fitJob) return undefined
        let name = ''
        try { name = window.localStorage.getItem('dwb-fit-job') || '' } catch { /* 忽略 */ }
        if (!name) return undefined
        let stopped = false
        void (async () => {
          try {
            const r = await apiPost({ action: 'fitScanState', name })
            if (!stopped && r && r.ok && r.job) setFitJob(r.job)
          } catch { /* 忽略 */ }
        })()
        return () => { stopped = true }
      }, [view, fitJob])
      /* 打开某个脚本的更新面板。 */
      const openUpdate = (name) => {
        setUpdateFor(name)
        setUpdateText('')
        setUpdateResult(null)
      }

      const doUpdate = async () => {
        if (!updateFor || !updateText.trim()) return
        setCommonBusy(true)
        try {
          const r = await apiPost({ action: 'updateCommonScript', name: updateFor, json: updateText })
          if (!r || !r.ok) { push(t('common.updateFail'), 'bad'); return }
          setUpdateResult(r)
          if (!r.changed) push(t('common.updateSame'), 'info')
          else push(t('common.updateDone').replace('{n}', r.name), 'ok')
          await loadCommon()
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }

      const detectFit = async (name) => {
        setCommonBusy(true)
        try {
          const r = await apiPost({ action: 'fitCommonScript', name })
          if (!r || !r.ok) { push(t('common.fitFail'), 'bad'); return }
          setFit(r)
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }
      const doCommon = async (action, payload, label) => {
        setCommonBusy(true)
        try {
          const r = await apiPost(Object.assign({ action }, payload))
          if (!r || !r.ok) { push(label + t('common.fail'), 'bad'); return }
          const list = Array.isArray(r.results) ? r.results : []
          const done = list.filter((x) => x.ok && !x.skipped).length
          push(label + t('common.done').replace('{n}', done), done ? 'ok' : 'info')
          await loadCommon()
        } catch (e) {
          push(String((e && e.message) || e), 'bad')
        } finally {
          setCommonBusy(false)
        }
      }
      const pickView = (next) => {
        setView(next)
        // 备份与卡脚本两页跟"选中哪个分类"无关，别去动它。
        if (next !== 'entries' && next !== 'other') return
        const group = next === 'other' ? 'other' : 'card'
        const list = cards.filter((c) => (c.group || 'card') === group)
        if (!list.some((c) => c.key === selectedKey)) setSelectedKey(list[0] ? list[0].key : '')
      }

      /*
       * 卡脚本盘点：两步走，为的是**立刻有东西可看**。
       *
       * 第一步只要骨架 —— 卡清单和工具脚本都不解析卡内容，几十毫秒就回来，
       * 界面马上把每张卡摆出来（都标着"盘点中"）。
       * 第二步一张一张取详情，每回来一张就替换那一行；进度条跟着走。
       *
       * 之前是一次拿全部，于是十几张卡读完之前界面只有一个转圈 —— 慢不慢另说，
       * 那种"什么都没有"的等待没法判断是在干活还是卡死了。
       *
       * 守卫用 `scriptScan` 本身，不用启动标志。
       *
       * 先前用过一个 ref 当"只跑一次"的标志 —— 它能挡住自我触发，但副作用是
       * 「重新载入」按钮失效了：那个按钮把 scriptScan 置空，而 ref 仍是 true，
       * 于是 effect 不重跑，必须切走页签再切回来（view 变了）才会加载。
       *
       * `scriptScan` 是**数据**不是启动标志，用它守卫两头都对：
       * 有数据就不重复加载；清空就重新加载。加载途中 it 会被赋值多次，
       * 但每次都被守卫挡住，不会自我触发。
       */
      useEffect(() => {
        if (view !== 'scripts' || scriptScan) return undefined
        setScriptBusy(true)
        ;(async () => {
          let head = null
          try {
            const res = await fetch(`${BASE}/scripts`)
            head = await res.json()
          } catch (e) {
            setScriptScan({ cards: [], tools: [], error: String((e && e.message) || e) })
            setScriptBusy(false)
            return
          }
          if (!head || !head.ok) {
            setScriptScan({ cards: [], tools: [], error: (head && head.error) || '' })
            setScriptBusy(false)
            return
          }
          const cards = (head.cards || []).map((c) => ({ ...c, pending: true, scripts: [], special: [], controllers: [], patchEntries: [], initvar: [] }))
          setScriptScan({ cards, tools: head.tools || [], error: '' })
          setScriptProgress({ done: 0, total: cards.length })
          setScriptBusy(false)

          // 逐张取。串行是故意的：并发读几张十几 MB 的卡只会互相拖慢，
          // 而且串行才看得到"一张一张出来"。
          for (let i = 0; i < cards.length; i += 1) {
            let one = null
            try {
              const res = await fetch(`${BASE}/scripts?card=${encodeURIComponent(cards[i].key)}`)
              one = await res.json()
            } catch {
              one = null
            }
            setScriptScan((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                cards: prev.cards.map((c) =>
                  c.key === cards[i].key
                    ? one && one.ok && one.card
                      ? { ...one.card, pending: false }
                      : // 拿不到详情就保住原有字段、只标失败：不能用一个空壳把它替换掉。
                        { ...c, pending: false, error: (one && one.error) || t('scripts.cardFailed') }
                    : c,
                ),
              }
            })
            setScriptProgress({ done: i + 1, total: cards.length })
          }
        })()
      }, [view, scriptScan])

      const ownEntries = useMemo(() => {
        return entries
          .filter((e) => e.cardKey === selectedKey)
          .filter((e) => (filterStatus ? e.status === filterStatus : true))
          .filter((e) => (filterScope ? e.scope === filterScope : true))
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      }, [entries, selectedKey, filterStatus, filterScope])

      const openEditor = useCallback(
        (entry) => {
          if (!entry) {
            setEditor({
              mode: 'add',
              draft: { ...EMPTY_DRAFT, cardKey: selectedKey || generalKey },
            })
            return
          }
          setEditor({
            mode: 'edit',
            id: entry.id,
            draft: {
              cardKey: entry.cardKey,
              title: entry.title || '',
              symptom: entry.symptom || '',
              cause: entry.cause || '',
              fix: entry.fix || '',
              scope: entry.scope || '其他',
              status: entry.status || 'open',
              tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : String(entry.tags || ''),
              refs: entry.refs || '',
              evidence: entry.evidence || '',
            },
          })
        },
        [selectedKey, generalKey],
      )

      const submitEditor = useCallback(async () => {
        if (!editor) return
        const draft = editor.draft
        if (!String(draft.title).trim()) return
        if (editor.mode === 'edit') {
          await run({ action: 'updateEntry', id: editor.id, patch: draft }, t('ok.updated'))
        } else {
          const res = await run({ action: 'addEntry', cardKey: draft.cardKey, entry: draft }, null)
          if (res) {
            const card = cards.find((c) => c.key === res.entry.cardKey)
            setMessage({ kind: 'ok', text: t('ok.added').replace('{name}', card ? card.name : res.entry.cardKey) })
          }
        }
        setEditor(null)
      }, [editor, run, cards])

      const removeEntry = useCallback(
        async (entry) => {
          setPending(null)
          await run({ action: 'deleteEntry', id: entry.id }, t('ok.removed'))
        },
        [run],
      )

      const setStatus = useCallback(
        async (entry, status) => {
          await run({ action: 'updateEntry', id: entry.id, patch: { status } }, t('ok.updated'))
        },
        [run],
      )

      /**
       * 清掉来源失效标记。
       *
       * 标记是 Tavern 在剧情线变动时自动盖的，但"这条错题现在还算不算数"只有人能判 ——
       * 回退之后重玩到同一处、问题没再出现，就该让它回到正常状态。
       */
      const clearStale = useCallback(
        async (entry) => {
          await run({ action: 'clearStale', id: entry.id }, t('ok.cleared'))
        },
        [run],
      )

      const copyTo = useCallback(
        async (entry, toCardKey) => {
          const res = await run({ action: 'copyEntry', id: entry.id, toCardKey }, null)
          if (res) {
            const card = cards.find((c) => c.key === toCardKey)
            setMessage({ kind: 'ok', text: t('ok.moved').replace('{name}', card ? card.name : toCardKey) })
          }
        },
        [run, cards],
      )

      const submitRename = useCallback(async () => {
        if (!currentCard) return
        await run({ action: 'renameCard', key: currentCard.key, name: renameText }, t('ok.renamed'))
        setRenameOpen(false)
      }, [currentCard, renameText, run])

      /** 新建「其它错题」分类，建完直接选中它，省一次点击。 */
      const submitBucket = useCallback(async () => {
        if (!bucketText.trim()) {
          setMessage({ kind: 'bad', text: t('err.bucketName') })
          return
        }
        const res = await run({ action: 'addBucket', name: bucketText }, null)
        if (res) {
          const text = t('ok.bucketAdded').replace('{name}', res.card.name)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
          setSelectedKey(res.card.key)
          setBucketOpen(false)
          setBucketText('')
        }
      }, [bucketText, run, push])

      /** 删分类不删记录：底下的条目会迁到「通用 / 未归类」。 */
      const removeBucket = useCallback(
        async (card) => {
          setPending(null)
          const res = await run({ action: 'deleteBucket', key: card.key }, null)
          if (res) {
            const text = t('ok.bucketRemoved').replace('{n}', res.moved)
            setMessage({ kind: 'ok', text, hint: t('bucket.deleteHint') })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      const checkSelf = useCallback(async () => {
        const res = await run({ action: 'checkSelf' }, null)
        if (!res || !res.plugin) return
        const p = res.plugin
        const verdict =
          p.verdict === 'update-available'
            ? t('ver.available').replace('{v}', p.latestVersion || '')
            : p.verdict === 'changed-locally'
              ? t('ver.changed')
              : t('ver.upToDate')
        setMessage({
          kind: p.verdict === 'up-to-date' ? 'ok' : 'bad',
          text: `${p.version} · ${verdict}`,
        })
      }, [run])

      const exportAll = useCallback(async () => {
        const res = await apiPost({ action: 'exportAll' })
        if (!res || res.ok === false) {
          setMessage({ kind: 'bad', text: `${t('btn.export')}：${(res && res.error) || 'failed'}` })
          return
        }
        try {
          const blob = new Blob([res.json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `wrongbook-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(url)
          setMessage({ kind: 'ok', text: t('ok.exported') })
          push(t('ok.exported'), 'ok')
        } catch (e) {
          setMessage({ kind: 'bad', text: String(e && e.message ? e.message : e) })
        }
      }, [push])

      const submitImport = useCallback(async () => {
        if (!importText.trim()) {
          setMessage({ kind: 'bad', text: t('err.emptyImport') })
          return
        }
        const res = await run({ action: 'importEntries', json: importText }, null)
        if (res) {
          const text = t('ok.imported').replace('{added}', res.added).replace('{skipped}', res.skipped)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
          setImportText('')
          setImportOpen(false)
        }
      }, [importText, run, push])

      const doBackup = useCallback(async () => {
        const res = await run({ action: 'backupNow' }, null)
        if (res) {
          const text = t('ok.backup').replace('{n}', res.backups)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
        }
      }, [run, push])

      const openDir = useCallback(
        async (which) => {
          const res = await run({ action: which === 'backup' ? 'openBackupDir' : 'openDataDir' }, null)
          if (res) {
            // 顺带报出走通了哪一级回退：这台机器上到底哪种方式有效，一眼可见。
            const via = res.via ? ` · ${res.via}` : ''
            const text = `${t('ok.opened').replace('{path}', res.opened || '')}${via}`
            setMessage({ kind: 'ok', text })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      const deleteBackup = useCallback(
        async (file) => {
          setPending(null)
          const res = await run({ action: 'deleteBackup', file }, null)
          if (res) {
            const text = t('ok.deletedBackup').replace('{file}', file)
            setMessage({ kind: 'ok', text })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      const restoreBackup = useCallback(
        async (file) => {
          setPending(null)
          const res = await run({ action: 'restoreBackup', file }, null)
          if (res) {
            setMessage({
              kind: 'ok',
              text: t('ok.restored').replace('{n}', res.restored),
              hint: t('ok.restoredHint'),
            })
            push(t('ok.restored').replace('{n}', res.restored), 'ok')
          }
        },
        [run, push],
      )

      const pruneBackups = useCallback(async () => {
        const res = await run({ action: 'pruneBackups', keep: keepCount }, null)
        if (res) {
          const text = t('ok.pruned').replace('{n}', res.removed).replace('{keep}', res.keep)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
        }
      }, [run, push, keepCount])

      /** 保存备份目录；dir 传空串就是恢复默认。 */
      const applyBackupDir = useCallback(
        async (dir) => {
          setBrowse(null)
          const res = await run({ action: 'setBackupDir', dir }, null)
          if (res) {
            const text = res.custom ? t('ok.backupDir').replace('{dir}', res.backupDir) : t('ok.backupDirReset')
            setMessage({ kind: 'ok', text, hint: t('backup.dir.hint') })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      /**
       * 打开目录浏览弹窗。
       *
       * 不用宿主的目录选择器 —— 参照卡片更新器的做法：那个能力在不在、
       * 能不能用都不一定，而「点一下什么也没发生」是最糟的结果。
       * 目录由 host 列，所以这条路一定有反应。
       */
      const chooseBackupDir = useCallback(() => {
        setBrowse({ initialPath: data ? data.paths.backupDir : '' })
      }, [data])

      const rescan = useCallback(async () => {
        const res = await run({ action: 'rescan' }, null)
        if (res) setMessage({ kind: 'ok', text: t('ok.rescan').replace('{n}', res.scanned) })
      }, [run])

      /* ------------------------------------------------- 宿主补丁 */

      // 宿主补丁改的是 apps/dsh-tavern/ 下的文件，而 DSH 升级是整份替换 ——
      // 补丁会静默失效（不报错，只是功能悄悄回到补丁前）。所以在这里给一个按钮，
      // 不用去命令行跑 patch-all.mjs。顺序（源码补丁 → build → 改 lib 的补丁）
      // 由 host 侧的脚本自己保证。
      const [patchOut, setPatchOut] = useState(null)
      const [patchBusy, setPatchBusy] = useState(false)
      // 启动时那次自动检查的结果（host 在插件加载后自己跑一遍，见 lib/index.js）。
      // 这样"补丁还在不在"不需要你记得点一次才知道。
      const [patchAuto, setPatchAuto] = useState(null)
      const patchHost = useCallback(
        async (apply) => {
          setPatchBusy(true)
          try {
            const res = await fetch(`${BASE}/patch`, { method: apply ? 'POST' : 'GET' })
            const payload = await res.json()
            const out = String(payload.output || payload.error || '（无输出）')
            setPatchOut(out)
            if (payload.auto) setPatchAuto(payload.auto)
            if (!payload.ok) {
              setMessage({ kind: 'err', text: t('err.patch') + '：' + String(payload.error || '') })
            } else if (!apply) {
              setMessage({ kind: 'ok', text: t('ok.patchCheck') })
            } else {
              // 脚本在"没有需要重打的"时也会打印「全部就位」，据此换一句话
              const nothing = /全部就位。$/.test(out.trim()) || out.includes('没有需要重打的')
              setMessage({ kind: 'ok', text: nothing ? t('ok.patchNone') : t('ok.patchApply') })
            }
          } catch (e) {
            setMessage({ kind: 'err', text: t('err.patch') + '：' + ((e && e.message) || String(e)) })
          } finally {
            setPatchBusy(false)
          }
        },
        [t],
      )

      /* ------------------------------------------------- 回流到 Skill */

      /** 一条条目落进哪个范围 —— 决定回流传哪些。 */
      const entriesInScope = (scope) => {
        if (scope === 'card') return entries.filter((e) => e.cardKey === selectedKey)
        if (scope === 'active') return entries.filter((e) => e.status !== 'fixed')
        return entries
      }

      /**
       * 打开回流弹窗。
       *
       * 内置 skill 也一并拉回来，但面板上标成不可选 —— 它们在程序目录里，
       * 写了也会被下次更新整份覆盖，与其让人以为写成功了，不如当场说清。
       */
      const openReflux = () => {
        setReflux({
          skills: null,
          skill: '',
          file: 'references/错题库回流.md',
          scope: 'all',
          busy: true,
          message: '',
          newName: '',
          newDesc: '',
          creating: false,
          confirmDelete: '',
          autoSkill: (data.config && data.config.autoReflux && data.config.autoReflux.skill) || '',
          autoLast: (data.config && data.config.autoRefluxLast) || null,
        })
        fetch(`${BASE}/skills`)
          .then((res) => res.json())
          .then((body) => {
            const list = (body && body.skills) || []
            const mine = list.filter((s) => !s.builtin)
            setReflux((prev) =>
              prev ? { ...prev, skills: list, skill: prev.skill || (mine[0] ? mine[0].name : ''), busy: false } : prev,
            )
          })
          .catch((e) => {
            setReflux((prev) => (prev ? { ...prev, skills: [], busy: false, message: String((e && e.message) || e) } : prev))
          })
      }

      /** 重新拉一遍 skill 列表；新建或删除之后用，免得本地拼出来的对象缺字段。 */
      const refreshSkills = async (selectName) => {
        try {
          const res = await fetch(`${BASE}/skills`)
          const body = await res.json()
          const list = (body && body.skills) || []
          const mine = list.filter((s) => !s.builtin)
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  skills: list,
                  skill: selectName || prev.skill || (mine[0] ? mine[0].name : ''),
                }
              : prev,
          )
        } catch {
          /* 拉不到就保持现状，别把已经能用的界面清空 */
        }
      }

      const createRefluxSkill = async () => {
        const name = String(reflux.newName || '').trim()
        if (!name) return
        setReflux({ ...reflux, busy: true, message: '' })
        try {
          const res = await apiPost({
            action: 'createSkill',
            name,
            description: String(reflux.newDesc || '').trim(),
          })
          if (!res || res.ok === false) {
            setReflux((prev) => (prev ? { ...prev, busy: false, message: (res && res.error) || '' } : prev))
            return
          }
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  newName: '',
                  // 建完就把新建区收起来：留着展开的话，手一快就会连建好几个空壳
                  // （这会已经有过两回）。
                  creating: false,
                  message: t('reflux.created').replace('{name}', name),
                }
              : prev,
          )
          // 本地拼一个对象塞进列表的话，简介和条目数都是残缺的 ——
          // 看着就像「新建完没简介，退出去重进才有」。所以重新拉一遍。
          await refreshSkills(name)
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, busy: false, message: String((e && e.message) || e) } : prev))
        }
      }

      /**
       * 按当前范围和错题库实况生成一句简介。
       *
       * 原来只塞一个带尖括号的模板 —— 等于没帮上忙：写的人还是不知道自己该填什么。
       * 这里把它算成真实的：多少条、覆盖哪些范围、涉及哪些分类，直接能当简介用。
       */
      const buildSampleDesc = () => {
        const picked = entriesInScope(reflux.scope)
        if (!picked.length) return ''
        const tally = {}
        for (const entry of picked) tally[entry.scope] = (tally[entry.scope] || 0) + 1
        const scopes = Object.keys(tally)
          .sort((a, b) => tally[b] - tally[a])
          .slice(0, 5)
          .join('、')
        const names = [...new Set(picked.map((e) => e.cardKey))].map((key) => {
          const found = cards.find((c) => c.key === key)
          return found ? found.name : key
        })
        const head = names.slice(0, 5).join('、')
        const tail = names.length > 5 ? ` 等 ${names.length} 处` : ''
        const n = picked.length

        if (reflux.scope === 'card') {
          return `${names[0] || '这张卡'} 的已解决故障：${n} 条（${scopes}）。用户调试这张卡、或排查同类异常时，先翻一遍 —— 每条含现象、根因与修法。`
        }
        if (reflux.scope === 'active') {
          return `待解决的故障：${n} 条，涉及 ${head}${tail}，范围集中在 ${scopes}。排查这些问题、或遇到同类症状时先看这里 —— 每条含现象、根因与待验证的修法。`
        }
        return `已解决故障库：DSH Tavern 调试中踩过的 ${n} 个坑（${scopes}），涉及 ${head}${tail}。用户排查卡片异常、转 MVU、或调试插件与宿主时，先翻一遍看有没有同一类 —— 每条含现象、根因、修法与实测证据。`
      }

      /** 把算出来的简介塞进输入框；算不出来（没条目）就维持原样。 */
      const fillSampleDesc = () =>
        setReflux((prev) => {
          if (!prev) return prev
          const text = buildSampleDesc()
          return text ? { ...prev, newDesc: text } : prev
        })

      const deleteRefluxSkill = async () => {
        const name = reflux.skill
        if (!name) return
        setReflux({ ...reflux, busy: true, message: '', confirmDelete: '' })
        try {
          const res = await apiPost({ action: 'deleteSkill', name })
          if (!res || res.ok === false) {
            setReflux((prev) => (prev ? { ...prev, busy: false, message: (res && res.error) || '' } : prev))
            return
          }
          const rest = (reflux.skills || []).filter((s) => s.name !== name)
          const next = rest.filter((s) => !s.builtin)[0]
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  skills: rest,
                  skill: next ? next.name : '',
                  message: t('reflux.deleted').replace('{name}', name).replace('{backup}', res.backup || ''),
                }
              : prev,
          )
          await refreshSkills(next ? next.name : '')
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, busy: false, message: String((e && e.message) || e) } : prev))
        }
      }

      const toggleAutoReflux = async (skill) => {
        try {
          const res = await apiPost({ action: 'setAutoReflux', skill, file: reflux.file })
          if (!res || res.ok === false) {
            setReflux((prev) => (prev ? { ...prev, message: (res && res.error) || '' } : prev))
            return
          }
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  autoSkill: skill,
                  autoLast: skill ? { at: new Date().toISOString(), written: res.synced || 0 } : null,
                  message: skill ? t('reflux.autoOn').replace('{name}', skill) : t('reflux.autoOff'),
                }
              : prev,
          )
          await load()
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, message: String((e && e.message) || e) } : prev))
        }
      }

      const doReflux = async () => {
        const picked = entriesInScope(reflux.scope)
        if (!reflux.skill || !picked.length) return
        setReflux({ ...reflux, busy: true, message: '' })
        const short = String(reflux.file).split('/').pop()
        try {
          const res = await apiPost({
            action: 'refluxToSkill',
            skill: reflux.skill,
            file: reflux.file,
            ids: picked.map((e) => e.id),
          })
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  message:
                    res && res.ok !== false
                      ? res.written
                        ? t('reflux.done').replace('{n}', res.written).replace('{file}', short).replace('{m}', res.skipped)
                        : t('reflux.doneAllSkip').replace('{n}', res.skipped).replace('{file}', short)
                      : (res && res.error) || '',
                }
              : prev,
          )
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, busy: false, message: String((e && e.message) || e) } : prev))
        }
      }

      if (!data) {
        return h(
          'div',
          { className: 'dwb-root' },
          h('div', { className: 'dwb-wrap' }, h('div', { className: 'dwb-empty' }, message ? message.text : t('err.bridge'))),
        )
      }

      const plugin = data.plugin || {}
      const verdictChip = () => {
        if (plugin.updateAvailable) {
          return h('span', { className: 'dwb-chip ok' }, t('ver.available').replace('{v}', plugin.latestVersion || ''))
        }
        if (plugin.changedLocally) return h('span', { className: 'dwb-chip warn' }, t('ver.changed'))
        if (plugin.lastCheckAt) return h('span', { className: 'dwb-chip ok' }, t('ver.upToDate'))
        return h('span', { className: 'dwb-chip' }, t('ver.unknown'))
      }

      /**
       * 自动同步到底有没有在跑 —— 面板上要能一眼看到，不用点进弹窗。
       *
       * 光写"已开"不够：开了之后不生效才是真正会出问题的情况。所以把「上次什么时候跑的、
       * 写进去几条」摆在按钮旁边 —— 记完一条错题回来，时间戳变了，就知道它真的在工作。
       */
      const autoReflux = (data.config && data.config.autoReflux) || null
      const autoBar = () => {
        if (!autoReflux) return ''
        const last = (data.config && data.config.autoRefluxLast) || null
        if (!last) return t('reflux.autoBarIdle').replace('{name}', autoReflux.skill)
        if (last.error) {
          return t('reflux.autoBarFailed').replace('{name}', autoReflux.skill).replace('{err}', last.error)
        }
        return t('reflux.autoBar')
          .replace('{name}', autoReflux.skill)
          .replace('{when}', String(last.at || '').slice(0, 16).replace('T', ' '))
          .replace('{n}', last.written || 0)
      }

      const selfHint = plugin.changedLocally
        ? t('ver.hint.changed').replace('{files}', (plugin.files || []).map((f) => f.rel).join(', '))
        : data.config && data.config.remoteUrl
          ? t('ver.hint.remote').replace('{url}', data.config.remoteUrl)
          : t('ver.hint.noRemote')

      /* --------------------------------------------------- 错题视图 */

      const entriesView = h(
        Fragment,
        null,
        h(
          'div',
          { className: 'dwb-hint' },
          view === 'scripts'
            ? t('scripts.hint')
            : isOther
              ? t('bucket.otherHint')
              : `${t('order.hint')} · ${selfHint} · ${t('reflux.panelHint')}${autoReflux ? ` · ${autoBar()}` : ''}`,
        ),
        // 工具条：跨卡查询与筛选。状态/范围筛选同时作用于本卡列表和跨卡检索。
        h(
          'div',
          { className: 'dwb-bar' },
          h('input', {
            className: 'dwb-input dwb-grow',
            style: { flex: '1 1 220px' },
            value: query,
            placeholder: t('search.ph'),
            onChange: (ev) => setQuery(ev.target.value),
          }),
          h(
            'select',
            { className: 'dwb-select', value: filterStatus, onChange: (ev) => setFilterStatus(ev.target.value) },
            h('option', { value: '' }, t('filter.status')),
            data.statuses.map((s) => h('option', { key: s, value: s }, statusLabel(s))),
          ),
          h(
            'select',
            { className: 'dwb-select', value: filterScope, onChange: (ev) => setFilterScope(ev.target.value) },
            h('option', { value: '' }, t('filter.scope')),
            data.scopes.map((s) => h('option', { key: s, value: s }, s)),
          ),
          h('span', { className: 'dwb-grow' }),
          h('button', { type: 'button', className: 'dwb-btn primary', onClick: () => openEditor(null) }, t('btn.add')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: rescan, disabled: busy }, t('btn.rescan')),
          h(
            'button',
            { type: 'button', className: 'dwb-btn ghost', onClick: openReflux, disabled: busy },
            autoReflux ? h('span', { className: 'dwb-live', title: autoBar() }, '●') : null,
            t('reflux.open'),
          ),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void load() }, t('btn.reload')),
          patchOut
            ? h(
                'details',
                { className: 'dwb-patch-out' },
                h('summary', null, t('btn.patchHost')),
                h('pre', { className: 'dwb-pre' }, patchOut),
              )
            : null,
        ),
        reflux
          ? h(RefluxModal, {
              state: reflux,
              entries,
              selectedKey,
              onChange: (patch) => setReflux({ ...reflux, ...patch }),
              onClose: () => setReflux(null),
              onWrite: doReflux,
              onCreate: createRefluxSkill,
              onDelete: deleteRefluxSkill,
              onSample: fillSampleDesc,
              onToggleAuto: toggleAutoReflux,
            })
          : null,
        editor
          ? h(Editor, {
              state: editor,
              cards: groupCards,
              scopes: data.scopes,
              statuses: data.statuses,
              onChange: (draft) => setEditor({ ...editor, draft }),
              onSubmit: submitEditor,
              onCancel: () => setEditor(null),
            })
          : null,
        h(
          'div',
          { className: 'dwb-cols' },
          h(
            'div',
            { className: 'dwb-card dwb-card flat' },
            h(
              'div',
              { className: 'dwb-row' },
              h('span', { className: 'dwb-sub dwb-grow' }, isOther ? t('cards.title.other') : t('cards.title')),
              isOther
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn tiny ghost',
                      onClick: () => {
                        setBucketText('')
                        setBucketOpen(true)
                      },
                    },
                    t('bucket.add'),
                  )
                : null,
              currentCard
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn tiny ghost',
                      onClick: () => {
                        setRenameText(currentCard.name)
                        setRenameOpen(true)
                      },
                    },
                    t('btn.rename'),
                  )
                : null,
              currentCard && currentCard.key !== generalKey && (isOther || currentCard.missing)
                ? h(ConfirmButton, {
                    label: t('btn.deleteBucket'),
                    armed: pending === `bucket:${currentCard.key}`,
                    onArm: () => setPending(`bucket:${currentCard.key}`),
                    onCancel: () => setPending(null),
                    onConfirm: () => removeBucket(currentCard),
                  })
                : null,
            ),
            // 新建分类也走内联输入：理由同改名。
            bucketOpen
              ? h(
                  'div',
                  { className: 'dwb-col' },
                  h('input', {
                    className: 'dwb-input',
                    value: bucketText,
                    placeholder: t('bucket.name.ph'),
                    onChange: (ev) => setBucketText(ev.target.value),
                  }),
                  h(
                    'div',
                    { className: 'dwb-row' },
                    h('button', { type: 'button', className: 'dwb-btn tiny primary', onClick: submitBucket }, t('btn.save')),
                    h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setBucketOpen(false) }, t('btn.cancel')),
                  ),
                )
              : null,
            // 改名走内联输入：window.prompt 在 Electron 渲染进程里没有实现。
            renameOpen && currentCard
              ? h(
                  'div',
                  { className: 'dwb-col' },
                  h('div', { className: 'dwb-sub' }, t('rename.hint')),
                  h('input', {
                    className: 'dwb-input',
                    value: renameText,
                    onChange: (ev) => setRenameText(ev.target.value),
                  }),
                  h(
                    'div',
                    { className: 'dwb-row' },
                    h('button', { type: 'button', className: 'dwb-btn tiny primary', onClick: submitRename }, t('btn.save')),
                    h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setRenameOpen(false) }, t('btn.cancel')),
                  ),
                )
              : null,
            groupCards.length
              ? h(
                  'div',
                  { className: 'dwb-list' },
                  groupCards.map((card) => h(CardRow, { key: card.key, card, active: card.key === selectedKey, onPick: setSelectedKey })),
                )
              // dsh-filter-fix —— 空列表有三种成因，别都说成"目录没有卡"：
              //   手建分类为空 / 筛选后为空 / 卡片目录真的没卡。
              // 第二种是我加了左侧筛选之后才有的，文案不对会看起来像坏了。
              : h('div', { className: 'dwb-empty' },
                    filtersActive && cards.length
                      ? t('cards.filtered')
                      : (isOther ? t('bucket.empty') : t('cards.empty')),
                ),
          ),
          h(
            'div',
            { className: 'dwb-col', style: { gap: 10 } },
            currentCard
              ? h(
                  'div',
                  { className: 'dwb-card dwb-card flat' },
                  h(
                    'div',
                    { className: 'dwb-row' },
                    h(Avatar, { card: currentCard }),
                    h('span', { className: 'dwb-title dwb-grow' }, currentCard.name),
                    h('span', { className: 'dwb-sub' }, t('misc.count').replace('{n}', currentCard.count ? currentCard.count.total : 0)),
                  ),
                  currentCard.note ? h('div', { className: 'dwb-sub' }, currentCard.note) : null,
                  currentCard.abs ? h('div', { className: 'dwb-path' }, currentCard.rel) : null,
                  currentCard.missing ? h('div', { className: 'dwb-chip warn' }, t('cards.missing')) : null,
                )
              : null,
            // ① 本卡错题库。查询时后台会把本卡命中一并返回，这里只渲染那一段。
            h(
              'div',
              { className: 'dwb-card' },
              h('div', { className: 'dwb-title' }, isOther ? t('own.title.other') : t('own.title')),
              h('div', { className: 'dwb-sub' }, currentCard ? currentCard.name : ''),
              (lookup ? lookup.own : ownEntries).length
                ? h(
                    'div',
                    { className: 'dwb-entries' },
                    (lookup ? lookup.own : ownEntries).map((entry) =>
                      h(EntryView, {
                        key: entry.id,
                        entry,
                        cards,
                        pending,
                        setPending,
                        onEdit: openEditor,
                        onDelete: removeEntry,
                        onCopy: copyTo,
                        onStatus: setStatus,
                        onClearStale: clearStale,
                      }),
                    ),
                  )
                : h('div', { className: 'dwb-empty' }, t('own.empty')),
            ),
            // ② 其它错题 → ③ 跨卡查询。
            //
            // 中间那一段是给「归类偏了」准备的：归档位置可能不精确，但内容还在库里，
            // 不该因为落错了组就检索不到。它排在跨卡之前，因为插件与工具链上的坑
            // 影响的往往不止一张卡。两段都空时给一句总提示，不摆两个空框。
            lookup && (lookup.other.length || lookup.cross.length)
              ? h(
                  Fragment,
                  null,
                  lookup.other.length
                    ? h(
                        'div',
                        { className: 'dwb-card' },
                        h('div', { className: 'dwb-title' }, t('other.title')),
                        h('div', { className: 'dwb-sub' }, `${t('cards.title.other')} · ${lookup.otherTotal ?? lookup.other.length}`),
                        h(
                          'div',
                          { className: 'dwb-entries' },
                          lookup.other.map((entry) =>
                            h(EntryView, {
                              key: entry.id,
                              entry,
                              cards,
                              pending,
                              setPending,
                              onEdit: openEditor,
                              onDelete: removeEntry,
                              onCopy: copyTo,
                              onStatus: setStatus,
                              onClearStale: clearStale,
                            }),
                          ),
                        ),
                      )
                    : null,
                  lookup.cross.length
                    ? h(
                        'div',
                        { className: 'dwb-card' },
                        h('div', { className: 'dwb-title' }, t('cross.title')),
                        h('div', { className: 'dwb-sub' }, `${t('cards.title')} · ${lookup.crossTotal ?? lookup.cross.length}`),
                        h(
                          'div',
                          { className: 'dwb-entries' },
                          lookup.cross.map((entry) =>
                            h(EntryView, {
                              key: entry.id,
                              entry,
                              cards,
                              pending,
                              setPending,
                              onEdit: openEditor,
                              onDelete: removeEntry,
                              onCopy: copyTo,
                              onStatus: setStatus,
                              onClearStale: clearStale,
                            }),
                          ),
                        ),
                      )
                    : null,
                )
              : lookup
                ? h('div', { className: 'dwb-card' }, h('div', { className: 'dwb-empty' }, t('cross.empty')))
                : null,
          ),
        ),
      )

      /* ----------------------------------------------------- 卡脚本视图 */

      const scriptsView = h(
        Fragment,
        null,
        h(
          'div',
          { className: 'dwb-card dwb-card flat' },
          h(
            'div',
            { className: 'dwb-row' },
            h(
              'div',
              { className: 'dwb-sub dwb-grow' },
              scriptScan
                ? (() => {
                    // flagged 自己数：骨架阶段服务端不解析卡内容，也就给不出这个数。
                    // 之前直接读 scriptScan.flagged，界面上显示的是 undefined。
                    const flagged = scriptScan.cards.filter(
                      (c) => (c.special || []).length || (c.controllers || []).length || (c.patchEntries || []).length,
                    ).length
                    const pending = scriptScan.cards.filter((c) => c.pending).length
                    const shown = pending === scriptScan.cards.length ? '—' : String(flagged)
                    return t('scripts.summary').replace('{n}', scriptScan.cards.length).replace('{flagged}', shown)
                  })()
                : t('scripts.loading'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dwb-btn tiny ghost',
                disabled: scriptBusy,
                onClick: () => {
                  // 清空即重新加载：守卫看的就是它。
                  setScriptScan(null)
                  setScriptProgress({ done: 0, total: 0 })
                },
              },
              t('btn.reload'),
            ),
          ),
          h('div', { className: 'dwb-hint' }, t('scripts.hint')),
          scriptScan && scriptScan.error ? h('div', { className: 'dwb-msg bad' }, scriptScan.error) : null,
          // 进度条：只在逐张盘点期间出现。它给的是"还剩几张"，不只是"在忙"。
          scriptProgress.total && scriptProgress.done < scriptProgress.total
            ? h(
                'div',
                { className: 'dwb-progress-wrap' },
                h(
                  'div',
                  { className: 'dwb-progress' },
                  h('div', {
                    className: 'dwb-progress-bar',
                    style: { width: `${Math.round((scriptProgress.done / scriptProgress.total) * 100)}%` },
                  }),
                ),
                h(
                  'div',
                  { className: 'dwb-sub' },
                  `${t('scripts.progress')} ${scriptProgress.done} / ${scriptProgress.total}`,
                ),
              )
            : null,
          h(
            'div',
            { className: 'dwb-entries' },
            scriptScan && scriptScan.cards.length
              ? scriptScan.cards.map((card) => h(CardScriptBlock, { key: card.key, card }))
              : h('div', { className: 'dwb-empty' }, scriptScan ? t('scripts.empty') : t('scripts.loading')),
          ),
        ),
        scriptScan && scriptScan.tools.length
          ? h(
              'div',
              { className: 'dwb-card dwb-card flat' },
              h('div', { className: 'dwb-title' }, t('scripts.tools')),
              h('div', { className: 'dwb-sub' }, t('scripts.toolsHint')),
              h(
                'div',
                { className: 'dwb-entries' },
                scriptScan.tools.map((tool) =>
                  h(
                    'div',
                    { key: tool.rel, className: 'dwb-script-row' },
                    h('span', { className: 'dwb-mono dwb-grow' }, tool.rel),
                    h('span', { className: 'dwb-sub' }, `${Math.round(tool.bytes / 1024)} KB`),
                    tool.chars ? h('span', { className: 'dwb-chip' }, `${tool.chars} 字符`) : null,
                    tool.dataKeys && tool.dataKeys.length
                      ? h('span', { className: 'dwb-chip tag' }, `data: ${tool.dataKeys.join(', ')}`)
                      : null,
                  ),
                ),
              ),
            )
          : null,
      )

      /* --------------------------------------------------- 备份视图 */

      /* dsh-common-tab —— 通用脚本页签。
       *
       * 回答三个问题：库里有什么、每张卡装没装、建议装哪些。
       * 未装/已装/版本不同用不同颜色的徽章区分 —— 版本不同那条尤其重要，
       * 库里更新过脚本但卡上还是旧的时候，只看"已装"是看不出来的。
       */
      /* dsh-common-ui3 —— 通用脚本页签。
       *
       * 三件事：库里有什么（按分类筛）、每张卡装没装、对选中的卡批量装卸。
       *
       * 卡的多选用文件名作键 —— 卡可能改显示名，文件名才是稳定的。
       * 分类来自脚本自带的 dsh_meta.category，没有就归「未分类」。
       */
      /* dsh-common-ui3 / commonTagFilter —— 通用脚本页签。
       *
       * 两块：库里有什么脚本（按分类 chip 筛）、每张卡装了哪些脚本。
       *
       * 卡这边用【脚本名】当筛选标签 —— 用户导入的脚本本身就是分类单位，
       * 再给卡另设一套分类只会多一层要同步的映射。
       *
       * 多选用文件名作键（卡可改显示名，文件名才稳定）；
       * 装卸是"对卡"的操作，所以选中粒度是卡，不是脚本。
       */
      const commonView = (() => {
        const libAll = (common && common.lib) || []
        const allCards = (common && common.cards) || []
        const cards = allCards.filter((c) => c.installable)
        const others = allCards.filter((c) => !c.installable)

        const cats = [...new Set(libAll.map((L) => L.category || '未分类'))]
        const lib = commonCat ? libAll.filter((L) => (L.category || '未分类') === commonCat) : libAll

        /* 卡筛选：commonTag 是脚本名。判定用后端给的 installed 数组。
           differs 也算装了 —— 卡上那份与库里不一致仍是装着的。 */
        const cardHas = (c, name) => (c.installed || []).some((i) => i.name === name && i.state !== 'absent')
        const shown = commonTag ? cards.filter((c) => cardHas(c, commonTag)) : cards

        const badge = (st) => {
          if (st === 'ok') return h('span', { className: 'dwb-chip ok' }, t('common.installed'))
          if (st === 'differs') return h('span', { className: 'dwb-chip warn' }, t('common.differs'))
          return h('span', { className: 'dwb-chip' }, t('common.absent'))
        }

        const toggle = (file) => setCommonPicked((prev) => {
          const next = new Set(prev)
          if (next.has(file)) next.delete(file); else next.add(file)
          return next
        })
        const pickAll = (on) => setCommonPicked(on ? new Set(shown.map((c) => c.file)) : new Set())
        const pickedList = [...commonPicked]
        const catChip = (on, label, onClick, key) =>
          h('button', { type: 'button', key, className: 'dwb-chip' + (on ? ' on' : ''), onClick }, label)

        return h(
          'div',
          { className: 'dwb-col', style: { gap: 10 } },

          /* ── 库 ── */
          h(
            'div',
            { className: 'dwb-card' },
            h(
              'div',
              { className: 'dwb-row' },
              h('span', { className: 'dwb-title dwb-grow' }, t('common.libTitle')),
              h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => setCommonOpen(!commonOpen) }, t('common.importScript')),
              h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => void loadCommon(), disabled: commonBusy }, t('common.refresh')),
            ),
            h('div', { className: 'dwb-hint' }, t('common.libHint')),
            /* 分类芯片：始终显示（原来只在 >1 个脚本时才出，一个脚本时看不见）。
               只有一个脚本时它仍有用 —— 它标出这个脚本属于哪一类。 */
            libAll.length
              ? h('div', { className: 'dwb-row', style: { gap: 4, flexWrap: 'wrap' } },
                  catChip(!commonCat, t('common.catAll').replace('{n}', libAll.length), () => setCommonCat(''), '__all'),
                  cats.map((cc) => catChip(commonCat === cc, cc + ' (' + libAll.filter((L) => (L.category || '未分类') === cc).length + ')', () => setCommonCat(commonCat === cc ? '' : cc), cc)),
                )
              : null,
            commonOpen
              ? h(
                  'div',
                  { className: 'dwb-col' },
                  h('div', { className: 'dwb-sub' }, t('common.importHint')),
                  h('textarea', {
                    className: 'dwb-area tall' + (commonDrag ? ' dwb-drag' : ''),
                    value: commonText,
                    onChange: (ev) => setCommonText(ev.target.value),
                    onDragOver: (ev) => {
                      ev.preventDefault();
                      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
                      if (!commonDrag) setCommonDrag(true);
                    },
                    onDragLeave: () => { if (commonDrag) setCommonDrag(false); },
                    onDrop: (ev) => {
                      ev.preventDefault();
                      setCommonDrag(false);
                      const files = (ev.dataTransfer && ev.dataTransfer.files) || [];
                      if (!files.length) return;
                      const file = files[0];
                      if (file.size > 8 * 1024 * 1024) {
                        push(t('common.importTooBig'), 'bad');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setCommonText(String(reader.result || ''));
                      reader.onerror = () => push(t('common.importReadFail'), 'bad');
                      reader.readAsText(file, 'utf-8');
                    },
                    placeholder: t('common.importPlaceholder'),
                  }),
                  h('div', { className: 'dwb-row' },
                    h('button', { type: 'button', className: 'dwb-btn primary', onClick: () => void importCommon(), disabled: commonBusy || !commonText.trim() }, t('common.doImport')),
                    h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => { setCommonOpen(false); setCommonText('') } }, t('common.cancel')),
                  ),
                )
              : null,
            lib.length
              ? h(
                  'div',
                  { className: 'dwb-col', style: { gap: 6 } },
                  lib.map((L) => {
                    const on = cards.filter((c) => cardHas(c, L.name)).length
                    return h(
                      'div',
                      { className: 'dwb-card flat', key: L.file },
                      h(
                        'div',
                        { className: 'dwb-row' },
                        h('span', { className: 'dwb-title dwb-grow' }, L.name),
                        h('span', { className: 'dwb-chip' }, L.category || '未分类'),
                        L.broken ? h('span', { className: 'dwb-chip bad' }, t('common.broken')) : null,
                        h('span', { className: 'dwb-sub' }, (L.bytes / 1024).toFixed(0) + ' KB'),
                        h('span', { className: 'dwb-sub' }, t('common.onCards').replace('{n}', on) + '/' + cards.length),
                        h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => openUpdate(L.name), disabled: commonBusy }, t('common.libUpdate')),
                        h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => void detectFit(L.name), disabled: commonBusy }, t('common.detectFit')),
                        h('button', { type: 'button', className: 'dwb-btn tiny primary', onClick: () => void handOff(L, cards), disabled: commonBusy }, t('common.handOff')),
                        h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => void deleteCommon(L.name), disabled: commonBusy }, t('common.libDelete')),
                      ),
                      /* 「生成建议」这条路的说明。它不即时出结果（要工作台读卡），
                         不写清会让人以为按钮坏了。 */
                      L.meta && L.meta.purpose ? h('div', { className: 'dwb-sub' }, L.meta.purpose) : null,
                      h('div', { className: 'dwb-hint' }, t('common.handOffTip')),
                      L.meta && L.meta.recommend ? h('div', { className: 'dwb-sub' }, t('common.recommend') + L.meta.recommend) : null,
                    )
                  }),
                )
              : h('div', { className: 'dwb-empty' }, commonCat ? t('common.catEmpty') : t('common.libEmpty')),
          ),

          /* ── 更新面板 ── */
          updateFor
            ? h(
                'div',
                { className: 'dwb-card' },
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('span', { className: 'dwb-title dwb-grow' }, t('common.updateTitle') + updateFor + ')'),
                  h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => { setUpdateFor(null); setUpdateResult(null) } }, t('common.cancel')),
                ),
                h('div', { className: 'dwb-hint' }, t('common.updateHint')),
                updateResult
                  ? h(
                      'div',
                      { className: 'dwb-col' },
                      h('div', { className: 'dwb-sub' }, updateResult.changed
                        ? t('common.updateDiff')
                            .replace('{old}', updateResult.oldHash)
                            .replace('{new}', updateResult.newHash)
                            .replace('{ob}', updateResult.oldBytes)
                            .replace('{nb}', updateResult.bytes)
                        : t('common.updateSame')),
                      updateResult.keptMeta ? h('div', { className: 'dwb-sub' }, t('common.updateKept')) : null,
                      /* 脚本自带持久状态 —— 换文件不会清掉它们。 */
                      (() => {
                        const tr = updateResult.traits || {}
                        const parts = []
                        if (tr.localStorage) parts.push('localStorage')
                        if (tr.indexedDB) parts.push('indexedDB')
                        if (tr.worldbook) parts.push(t('common.traitWorldbook'))
                        if (tr.chat) parts.push(t('common.traitChat'))
                        if (tr.variables) parts.push(t('common.traitVars'))
                        if (tr.timer) parts.push(t('common.traitTimer'))
                        if (tr.windowGlobals) parts.push('window.*')
                        if (!parts.length) return null
                        return h('div', { className: 'dwb-hint warn' }, t('common.updateTraits').replace('{list}', parts.join(' · ')))
                      })(),
                      updateResult.versionChanged
                        ? h('div', { className: 'dwb-sub' }, t('common.updateVersion')
                            .replace('{before}', updateResult.traitsBefore.version || t('common.updateNoVersion'))
                            .replace('{after}', updateResult.traits.version || t('common.updateNoVersion')))
                        : null,
                      updateResult.backupDir ? h('div', { className: 'dwb-sub dwb-path' }, t('common.updateBackup') + updateResult.backupDir) : null,
                      /* 已装的卡会被自动同步 —— 这一步不需要用户再点一次。 */
                      updateResult.autoSynced
                        ? h('div', { className: 'dwb-col', style: { gap: 6 } },
                            h('div', { className: 'dwb-hint' }, t('common.updateSynced').replace('{n}', updateResult.staleCards.length)),
                            h('div', { className: 'dwb-row', style: { gap: 4, flexWrap: 'wrap' } },
                              updateResult.staleCards.map((f) => h('span', { className: 'dwb-chip ok', key: f }, f.replace(/\.json$/, '')))),
                          )
                        : updateResult.syncError
                          ? h('div', { className: 'dwb-hint bad' }, t('common.updateSyncFail').replace('{e}', updateResult.syncError))
                          : h('div', { className: 'dwb-hint' }, t('common.updateNoStale')),
                    )
                  : h(
                      'div',
                      { className: 'dwb-col' },
                      h('textarea', {
                        className: 'dwb-area tall' + (updateDrag ? ' dwb-drag' : ''),
                        value: updateText,
                        onChange: (ev) => setUpdateText(ev.target.value),
                        onDragOver: (ev) => {
                          ev.preventDefault();
                          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
                          if (!updateDrag) setUpdateDrag(true);
                        },
                        onDragLeave: () => { if (updateDrag) setUpdateDrag(false); },
                        onDrop: (ev) => {
                          ev.preventDefault();
                          setUpdateDrag(false);
                          const files = (ev.dataTransfer && ev.dataTransfer.files) || [];
                          if (!files.length) return;
                          const file = files[0];
                          if (file.size > 8 * 1024 * 1024) {
                            push(t('common.importTooBig'), 'bad');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => setUpdateText(String(reader.result || ''));
                          reader.onerror = () => push(t('common.importReadFail'), 'bad');
                          reader.readAsText(file, 'utf-8');
                        },
                        placeholder: t('common.updatePlaceholder'),
                      }),
                      h('div', { className: 'dwb-row' },
                        h('button', { type: 'button', className: 'dwb-btn primary', onClick: () => void doUpdate(), disabled: commonBusy || !updateText.trim() }, t('common.updateDo')),
                        h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => setUpdateFor(null) }, t('common.cancel')),
                      ),
                    ),
              )
            : null,

          /* ── 交给工作台的文本 ── */
          handoff
            ? h(
                'div',
                { className: 'dwb-card' },
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('span', { className: 'dwb-title dwb-grow' }, t('common.handoffTitle') + handoff.name + ')'),
                  h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => void copyHandoff(handoff.text) }, t('common.handoffCopy')),
                  h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setHandoff(null) }, t('common.fitClose')),
                ),
                h('div', { className: 'dwb-hint' }, t('common.handoffHint')),
                h('textarea', { className: 'dwb-area tall', readOnly: true, value: handoff.text }),
              )
            : null,

          /* ── 后台任务进度（关掉面板也会继续） ── */
          fitJob
            ? h(
                'div',
                { className: 'dwb-card' },
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('span', { className: 'dwb-title dwb-grow' }, t('common.jobTitle') + fitJob.name + ')'),
                  fitJob.status === 'running'
                    ? h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => void apiPost({ action: 'cancelFitScan', name: fitJob.name }).then(() => setFitJob(null)) }, t('common.jobCancel'))
                    : null,
                  h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setJobCollapsed(!jobCollapsed) }, jobCollapsed ? t('common.expand') : t('common.collapse')),
                  h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => { setFitJob(null); setJobCollapsed(false) } }, t('common.jobClear')),
                ),
                /* 折叠时把进度条、完成提示、说明一起收起来 —— 只收下半部分等于没收。 */
                jobCollapsed
                  ? null
                  : h(Fragment, null,
                    fitJob.status === 'running'
                      ? h('div', { className: 'dwb-progress-wrap' },
                          h('div', { className: 'dwb-progress' },
                            h('div', { className: 'dwb-progress-bar', style: { width: (fitJob.total ? Math.round(fitJob.done / fitJob.total * 100) : 0) + '%' } }),
                          ),
                          h('div', { className: 'dwb-sub' }, t('common.jobProgress').replace('{done}', fitJob.done).replace('{total}', fitJob.total)),
                        )
                      : h('div', { className: 'dwb-hint' }, t('common.jobDone').replace('{n}', (fitJob.cards || []).length)),
                    h('div', { className: 'dwb-sub' }, t('common.jobNote')),
                    ),
              )
            : null,

          /* ── 深度分析结果 ── */
          fitJob && fitJob.status !== 'running' && (fitJob.cards || []).length && !jobCollapsed
            ? h(
                'div',
                { className: 'dwb-card' },
                h('div', { className: 'dwb-title' }, t('common.jobCardsTitle').replace('{n}', fitJob.cards.length)),
                h('div', { className: 'dwb-hint' }, t('common.jobCardsHint')),
                h('div', { className: 'dwb-col', style: { gap: 6 } },
                  fitJob.cards.map((c) => h(
                    'div',
                    { className: 'dwb-card flat', key: c.file },
                    h(
                      'div',
                      { className: 'dwb-row' },
                      h('span', { className: 'dwb-grow' }, c.label),
                      c.profile && c.profile.markerKind === 'hand-tuned-mvu' ? h('span', { className: 'dwb-chip' }, t('common.kindHand')) : null,
                      c.installed ? h('span', { className: 'dwb-chip ok' }, t('common.installed')) : null,
                      c.installable === false ? null : h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => void doCommon('installCommon', { cards: [c.file] }, t('common.installOne')), disabled: commonBusy }, t('common.installOne')),
                    ),
                    (c.reasons || []).map((why, i) => h('div', { className: 'dwb-sub', key: i }, '· ' + why)),
                    !(c.reasons || []).length ? h('div', { className: 'dwb-sub' }, t('common.jobNoReason')) : null,
                    c.profile
                      ? h('div', { className: 'dwb-sub' }, t('common.jobProfile')
                          .replace('{r}', c.profile.regexCount)
                          .replace('{rc}', (c.profile.regexChars || 0).toLocaleString())
                          .replace('{s}', (c.profile.scriptNames || []).length)
                          .replace('{b}', c.profile.bookCount))
                      : null,
                  )),
                ),
              )
            : null,

          /* ── 检测结果 ── */
          fit
            ? h(
                'div',
                { className: 'dwb-card' },
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('span', { className: 'dwb-title dwb-grow' }, t('common.fitTitle') + fit.name + ')'),
                  h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setFitCollapsed(!fitCollapsed) }, fitCollapsed ? t('common.expand') : t('common.collapse')),
                ),
                h('div', { className: 'dwb-sub' }, t('common.fitCaps') + (fit.capabilities.length ? fit.capabilities.join(' · ') : t('common.fitNoCaps'))),
                h('div', { className: 'dwb-hint' }, t('common.fitHint')),
                fitCollapsed ? null : (fit.cards.length
                  ? h(
                      'div',
                      { className: 'dwb-col', style: { gap: 6 } },
                      fit.cards.map((c) => h(
                        'div',
                        { className: 'dwb-card flat', key: c.file },
                        h(
                          'div',
                          { className: 'dwb-row' },
                          h('span', { className: 'dwb-grow' }, c.label),
                          c.installed ? h('span', { className: 'dwb-chip ok' }, t('common.installed')) : null,
                          c.installable ? h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => void doCommon('installCommon', { cards: [c.file] }, t('common.installOne')), disabled: commonBusy }, t('common.installOne')) : null,
                        ),
                        c.reasons.map((why, i) => h('div', { className: 'dwb-sub', key: i }, '· ' + why)),
                        c.feat && c.feat.scriptCount
                          ? h('div', { className: 'dwb-sub' }, t('common.fitHas').replace('{n}', c.feat.scriptCount))
                          : null,
                      )),
                    )
                  : h('div', { className: 'dwb-empty' }, t('common.fitEmpty')))
              )
            : null,

          /* ── 各 MVU 卡 ── */
          h(
            'div',
            { className: 'dwb-card' },
            h(
              'div',
              { className: 'dwb-row' },
              h('span', { className: 'dwb-title dwb-grow' }, t('common.cardsTitle') + cards.length + ')'),
              h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => pickAll(true) }, t('common.pickAll')),
              h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => pickAll(false) }, t('common.pickNone')),
              h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => void doCommon('installCommon', { cards: pickedList }, t('common.installPicked')), disabled: commonBusy || !pickedList.length }, t('common.installPicked') + (pickedList.length ? ' (' + pickedList.length + ')' : '')),
              h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => void doCommon('removeCommon', { cards: pickedList }, t('common.removePicked')), disabled: commonBusy || !pickedList.length }, t('common.removePicked')),
            ),
            /* 脚本 tag：点一下只看装了它的卡。脚本名就是标签，不再另设分类。 */
            libAll.length
              ? h('div', { className: 'dwb-row', style: { gap: 4, flexWrap: 'wrap' } },
                  catChip(!commonTag, t('common.tagAll').replace('{n}', cards.length), () => setCommonTag(''), '__tagall'),
                  libAll.map((L) => catChip(commonTag === L.name, L.name + ' (' + cards.filter((c) => cardHas(c, L.name)).length + ')', () => setCommonTag(commonTag === L.name ? '' : L.name), 'tag_' + L.file)),
                )
              : null,
            h('div', { className: 'dwb-hint' }, t('common.cardsHint')),
            shown.length
              ? h(
                  'div',
                  { className: 'dwb-col', style: { gap: 6 } },
                  shown.map((c) => h(
                    'div',
                    { className: 'dwb-card flat', key: c.file },
                    h(
                      'div',
                      { className: 'dwb-row' },
                      h('input', {
                        className: 'dwb-pick-input',
                        type: 'checkbox',
                        checked: commonPicked.has(c.file),
                        onChange: () => toggle(c.file),
                      }),
                      h('span', { className: 'dwb-grow' }, c.label),
                      c.markerKind ? h('span', { className: 'dwb-chip' }, c.markerKind === 'hand-tuned-mvu' ? t('common.kindHand') : c.markerKind) : null,
                      h('span', { className: 'dwb-sub' }, t('common.scripts').replace('{n}', c.scriptCount)),
                    ),
                    h(
                      'div',
                      { className: 'dwb-row' },
                      (c.installed || []).map((i) => h(
                        'span',
                        { className: 'dwb-row', key: i.name, style: { gap: 4 } },
                        h('span', { className: 'dwb-sub' }, i.name),
                        badge(i.state),
                      )),
                      h('span', { className: 'dwb-grow' }),
                      h('button', { type: 'button', className: 'dwb-btn tiny', onClick: () => void doCommon('installCommon', { cards: [c.file] }, t('common.installOne')), disabled: commonBusy }, t('common.installOne')),
                      h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => void doCommon('removeCommon', { cards: [c.file] }, t('common.removeOne')), disabled: commonBusy }, t('common.removeOne')),
                    ),
                  )),
                )
              : h('div', { className: 'dwb-empty' }, commonTag ? t('common.tagEmpty') : t('common.cardsEmpty')),
          ),

          /* ── 原版卡：只列出，不给装卸入口 ── */
          others.length
            ? h(
                'div',
                { className: 'dwb-card' },
                h('div', { className: 'dwb-title' }, t('common.originalsTitle') + others.length + ')'),
                h('div', { className: 'dwb-hint' }, t('common.originalsHint')),
                h(
                  'div',
                  { className: 'dwb-row', style: { gap: 4, flexWrap: 'wrap' } },
                  others.map((c) => h('span', { className: 'dwb-chip', key: c.file }, c.label)),
                ),
              )
            : null,
        )
      })()
      const backupView = h(
        Fragment,
        null,
        h(
          'div',
          { className: 'dwb-card dwb-card flat' },
          h('div', { className: 'dwb-title' }, t('backup.current')),
          h(
            'div',
            { className: 'dwb-stat' },
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, t('sec.own')),
              h('div', { className: 'dwb-stat-v' }, t('misc.entriesCount').replace('{n}', data.dataFile ? data.dataFile.entries : entries.length)),
            ),
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, t('cards.title')),
              h('div', { className: 'dwb-stat-v' }, t('misc.cardsCount').replace('{n}', cards.length)),
            ),
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, 'data.json'),
              h('div', { className: 'dwb-stat-v' }, fmtBytes(data.dataFile && data.dataFile.bytes)),
            ),
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, t('misc.updated')),
              h('div', { className: 'dwb-stat-v' }, fmtTime(data.dataFile && data.dataFile.updatedAt) || '—'),
            ),
          ),
          h('div', { className: 'dwb-path' }, data.dataFile ? data.dataFile.file : data.paths.dbFile),
          // 安装自检：Tavern 更新时会不会把插件从 profile 里抹掉，这里给个实时的答案。
          h(
            'div',
            { className: `dwb-msg ${data.install && data.install.ok ? 'ok' : 'bad'}` },
            data.install && data.install.ok
              ? t('install.ok')
              : h(
                  Fragment,
                  null,
                  h('div', null, t('install.bad')),
                  h('pre', { className: 'dwb-pre' }, (data.install && data.install.fix) || ''),
                ),
          ),
        ),
        // 备份目录可以改到别处（换盘、丢进同步盘都行）。改完只影响之后写入的备份。
        h(
          'div',
          { className: 'dwb-card dwb-card flat' },
          h(
            'div',
            { className: 'dwb-row' },
            h('div', { className: 'dwb-stat-k dwb-grow' }, t('backup.dir.title')),
            data.paths.backupDirCustom ? h('span', { className: 'dwb-chip warn' }, t('backup.dir.custom')) : null,
          ),
          h('div', { className: 'dwb-path' }, data.paths.backupDir),
          h(
            'div',
            { className: 'dwb-row' },
            h('button', { type: 'button', className: 'dwb-btn', onClick: chooseBackupDir, disabled: busy }, t('backup.dir.pick')),
            data.paths.backupDirCustom
              ? h(
                  'button',
                  { type: 'button', className: 'dwb-btn ghost', onClick: () => applyBackupDir(''), disabled: busy },
                  t('backup.dir.reset'),
                )
              : null,
          ),
        ),
        h(
          'div',
          { className: 'dwb-bar' },
          h('button', { type: 'button', className: 'dwb-btn primary', onClick: doBackup, disabled: busy }, t('btn.backup')),
          h('span', { className: 'dwb-grow' }),
          h('span', { className: 'dwb-sub' }, `${t('field.keep')} `),
          h('input', {
            className: 'dwb-input narrow',
            type: 'number',
            min: 1,
            max: 60,
            value: keepCount,
            onChange: (ev) => setKeepCount(Math.max(1, Math.min(60, Number(ev.target.value) || 1))),
          }),
          h('button', { type: 'button', className: 'dwb-btn', onClick: pruneBackups, disabled: busy }, t('btn.prune')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void openDir('backup') }, t('btn.openBackup')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void openDir('data') }, t('btn.openData')),
        ),
        h('div', { className: 'dwb-hint' }, t('backup.keepHint')),
        h(
          'div',
          { className: 'dwb-card' },
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-title dwb-grow' }, t('backup.list')),
            h('span', { className: 'dwb-sub' }, t('misc.backups').replace('{n}', backups.length)),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setImportOpen(!importOpen) }, t('btn.import')),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: exportAll }, t('btn.export')),
          ),
          // 导入用面板内的文本框：这里以前是 window.prompt，在 Electron 里没反应。
          importOpen
            ? h(
                'div',
                { className: 'dwb-col' },
                h('div', { className: 'dwb-sub' }, t('import.hint')),
                /* dsh-drag-import —— 支持把 .json 文件直接拖进来。
                 *
                 * 拖拽目标限定在这个文本框上，不做全局 drop：宿主自己也有拖拽行为，
                 * 全局接管会跟它打架。文本框只在导入面板打开时存在，所以效果上等同于
                 * "在导入区域拖放"。
                 *
                 * 只读文本、不解析 —— 解析仍交给「开始导入」那一条路径，
                 * 免得出现两套校验。多文件时取第一个并说明，静默忽略会让人误会。
                 */
                h('textarea', {
                  className: 'dwb-area tall' + (dragOver ? ' dwb-drag' : ''),
                  value: importText,
                  onChange: (ev) => setImportText(ev.target.value),
                  onDragOver: (ev) => {
                    ev.preventDefault();
                    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
                    if (!dragOver) setDragOver(true);
                  },
                  onDragLeave: () => { if (dragOver) setDragOver(false); },
                  onDrop: (ev) => {
                    ev.preventDefault();
                    setDragOver(false);
                    const files = (ev.dataTransfer && ev.dataTransfer.files) || [];
                    if (!files.length) return;
                    const file = files[0];
                    if (files.length > 1) push(t('import.dropMulti').replace('{name}', file.name), 'info');
                    if (file.size > 4 * 1024 * 1024) {
                      push(t('import.dropTooBig'), 'bad');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setImportText(String(reader.result || ''));
                      push(t('import.dropOk').replace('{name}', file.name), 'ok');
                    };
                    reader.onerror = () => push(t('import.dropFail'), 'bad');
                    reader.readAsText(file, 'utf-8');
                  },
                  placeholder: '{ "entries": [ { "cardKey": "cards/xxx.json", "title": "…" } ] }',
                }),
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('button', { type: 'button', className: 'dwb-btn primary', onClick: submitImport, disabled: busy }, t('import.submit')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn ghost',
                      onClick: () => {
                        setImportOpen(false)
                        setImportText('')
                      },
                    },
                    t('btn.cancel'),
                  ),
                ),
              )
            : null,
          backups.length
            ? h(
                'div',
                { className: 'dwb-backups' },
                backups.map((b) =>
                  h(
                    'div',
                    { key: b.file, className: 'dwb-backup' },
                    h('span', { className: 'dwb-backup-time dwb-grow' }, fmtTime(b.at)),
                    h('span', { className: 'dwb-chip' }, b.reason || '—'),
                    h('span', { className: 'dwb-chip' }, b.entries >= 0 ? t('backup.entries').replace('{n}', b.entries) : t('backup.entriesUnknown')),
                    h('span', { className: 'dwb-sub' }, fmtBytes(b.bytes)),
                    h(ConfirmButton, {
                      label: t('btn.restore'),
                      armed: pending === `restore:${b.file}`,
                      onArm: () => setPending(`restore:${b.file}`),
                      onCancel: () => setPending(null),
                      onConfirm: () => restoreBackup(b.file),
                    }),
                    h(ConfirmButton, {
                      label: t('btn.remove'),
                      armed: pending === `backup:${b.file}`,
                      onArm: () => setPending(`backup:${b.file}`),
                      onCancel: () => setPending(null),
                      onConfirm: () => deleteBackup(b.file),
                    }),
                  ),
                ),
              )
            : h('div', { className: 'dwb-empty' }, t('backup.empty')),
        ),
      )

      // 补丁清单。清单是固定的，所以直接写在这里 —— 不必让 host 再返一份结构化数据。
      // cards 为空 = 服务于整个宿主（不是某张卡）。
      const PATCH_LIST = [
        { title: '源码补丁（六处 helper）', target: 'src/client/main.js + opening-preview.js',
          cards: ['龙娘回廊！5.3 MVU版本'],
          why: '卡内脚本经 window.parent 读 TavernHelper.generate，而那一层缺 generate' },
        { title: '创意工坊直连域名', target: 'lib/client.js', cards: [],
          why: '让创意工坊的域名不走静态资源代理（否则 Build / 人设 / 拓展 / 世界书 都是空的）' },
        { title: 'MVU 卡纯 API 测试', target: 'lib/domain/tavern-helper-scripts.js', cards: [],
          why: '放开"卡内无脚本"的 MVU 卡在纯 API 下做测试（调试用，不针对某张卡）' },
        { title: '超时保留前台正文', target: 'lib/domain/card-response-test.js', cards: [],
          why: '超时记录里保留前台正文，否则只看得到超时、看不到正文' },
        { title: '卡内 generate 兜底', target: '卡内脚本 助手agent_v0.15 开头',
          cards: ['龙娘回廊！5.3 MVU版本'],
          why: '补 generate，并把 prompt 折成 user_input、兜底 ordered_prompts（宿主的显式编排契约）' },
      ]
      const patchCards = [...new Set(PATCH_LIST.flatMap((p) => p.cards))]
      const patchView = h(
        'div',
        { className: 'dwb-card dwb-card flat' },
        // 启动时 host 已经自动检查过一轮 —— 把结果显示出来，这样"补丁还在不在"
        // 不需要你记得手动点一次。刚补过的话明确提示要重启。
        patchAuto
          ? h(
              'div',
              { className: patchAuto.error || patchAuto.pendingRestart ? 'dwb-hint warn' : 'dwb-hint' },
              (patchAuto.error ? '⚠ ' : patchAuto.pendingRestart ? '⚠ ' : '✓ ') +
                t(patchAuto.error ? 'patch.autoFail' : patchAuto.pendingRestart ? 'patch.autoFixed' : 'patch.autoOk') +
                (patchAuto.checkedAt ? '（' + new Date(patchAuto.checkedAt).toLocaleTimeString() + '）' : '') +
                (patchAuto.error ? '：' + patchAuto.error : ''),
            )
          : null,
        h(
          'div',
          { className: 'dwb-row' },
          h('div', { className: 'dwb-sub' }, t('patch.usage')),
          h('span', { className: 'dwb-grow' }),
          h(
            'button',
            {
              type: 'button',
              className: 'dwb-btn primary',
              onClick: () => void patchHost(true),
              disabled: patchBusy || busy,
            },
            t('btn.patchHost'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dwb-btn ghost',
              onClick: () => void patchHost(false),
              disabled: patchBusy || busy,
            },
            t('btn.patchCheck'),
          ),
        ),
        patchOut
          ? h('details', { className: 'dwb-patch-out', open: true }, h('summary', null, t('patch.output')), h('pre', { className: 'dwb-pre' }, patchOut))
          : null,
        h('div', { className: 'dwb-hint' }, t('patch.hint')),
        // 按卡分组：先列"服务于整张宿主"的，再列每张卡专属的 —— 和「卡脚本」的组织方式一致
        h(
          'div',
          { className: 'dwb-sub', style: { marginTop: 10 } },
          t('patch.groupHost'),
        ),
        h(
          'div',
          { className: 'dwb-list' },
          PATCH_LIST.filter((p) => !p.cards.length).map((p) =>
            h(
              'div',
              { className: 'dwb-patch-item', key: p.title },
              h('div', { className: 'dwb-patch-title' }, p.title),
              h('div', { className: 'dwb-patch-target' }, p.target),
              h('div', { className: 'dwb-patch-why' }, p.why),
            ),
          ),
        ),
        patchCards.map((card) =>
          h(
            'div',
            { key: card },
            h('div', { className: 'dwb-sub', style: { marginTop: 10 } }, card),
            h(
              'div',
              { className: 'dwb-list' },
              PATCH_LIST.filter((p) => p.cards.includes(card)).map((p) =>
                h(
                  'div',
                  { className: 'dwb-patch-item', key: p.title },
                  h('div', { className: 'dwb-patch-title' }, p.title),
                  h('div', { className: 'dwb-patch-target' }, p.target),
                  h('div', { className: 'dwb-patch-why' }, p.why),
                ),
              ),
            ),
          ),
        ),
      )


      return h(
        'div',
        { className: 'dwb-root' },
        h(
          'div',
          { className: 'dwb-wrap' },
          // 头部：左是身份，右是检测更新和当前版本，跟卡片更新器同一版式。
          h(
            'div',
            { className: 'dwb-header' },
            h(
              'div',
              { className: 'dwb-grow' },
              h('div', { className: 'dwb-title' }, t('panel.title')),
              h('div', { className: 'dwb-sub' }, t('panel.desc')),
              h('div', { className: 'dwb-path' }, data.paths.dataDir),
            ),
            h(
              'div',
              { className: 'dwb-header-actions' },
              h(PeerLink),
              h(
                'span',
                {
                  className: `dwb-ver dwb-chip${plugin.stale || plugin.changedLocally ? ' warn' : ''}`,
                  title: plugin.stale
                    ? t('ver.staleHint').replace('{disk}', plugin.version || '?').replace('{run}', plugin.runningVersion || '?')
                    : '',
                },
                `v${plugin.version || '?'}`,
              ),
              // 磁盘改了、进程里还是旧的 —— 这是最容易被误判成"改动无效"的一种情况，
              // 所以直接说出来，而不是等人去对版本号。
              plugin.stale
                ? h(
                    'span',
                    {
                      className: 'dwb-chip warn',
                      title: t('ver.staleHint').replace('{disk}', plugin.version || '?').replace('{run}', plugin.runningVersion || '?'),
                    },
                    t('ver.stale'),
                  )
                : verdictChip(),
              h(
                'button',
                { type: 'button', className: 'dwb-btn', onClick: checkSelf, disabled: busy },
                t('btn.checkSelf'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dwb-row' },
            h(
              'div',
              { className: 'dwb-tabs' },
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'entries' ? ' on' : ''}`, onClick: () => pickView('entries') },
                t('tab.entries'),
              ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'other' ? ' on' : ''}`, onClick: () => pickView('other') },
                t('tab.other'),
              ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'scripts' ? ' on' : ''}`, onClick: () => pickView('scripts') },
                t('tab.scripts'),
              ),
                h(
                  'button',
                  { type: 'button', className: `dwb-tab${view === 'patch' ? ' on' : ''}`, onClick: () => pickView('patch') },
                  t('tab.patch'),
                ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'backup' ? ' on' : ''}`, onClick: () => pickView('backup') },
                t('tab.backup'),
              ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'common' ? ' on' : ''}`, onClick: () => pickView('common') },
                t('tab.common'),
              ),
            ),
            h('span', { className: 'dwb-grow' }),
            h('span', { className: 'dwb-sub' }, t('misc.entriesCount').replace('{n}', entries.length)),
          ),
          message
            ? h(
                'div',
                { className: `dwb-msg ${message.kind}` },
                h('span', null, message.text),
                message.hint ? h('span', { className: 'dwb-sub' }, message.hint) : null,
              )
            : null,
          view === 'backup' ? backupView : view === 'common' ? commonView : view === 'scripts' ? scriptsView : view === 'patch' ? patchView : entriesView,
          h(
            'div',
            { className: 'dwb-card dwb-card flat' },
            h('div', { className: 'dwb-sub' }, t('misc.log')),
            log.length
              ? h('div', { className: 'dwb-log' }, log.map((l) => `${l.t}  ${l.text}`).join('\n'))
              : h('div', { className: 'dwb-sub' }, '—'),
          ),
        ),
        browse
          ? h(BrowseModal, {
              initialPath: browse.initialPath,
              onPick: (dir) => void applyBackupDir(dir),
              onClose: () => setBrowse(null),
            })
          : null,
      )
    }

    /*
     * 侧栏底部那个入口。
     *
     * 面板关着的时候，这个按钮是整个插件唯一渲染的东西 —— 所以样式不能等
     * SettingsSection 挂载（那要等 tab 打开），这里全部内联写死。
     *
     * 组件形态照卡片更新器的 SideEntry：一个按钮，点开一个覆盖层，面板本体塞进去。
     */
    /** 侧栏入口的图标。线条风格与卡片更新器那个刷新图标一致。 */
    function WbGlyph({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M3 3.5h10v9H3z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M3 6.5h10', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M6.2 6.5v6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      )
    }

    /*
     * 侧栏底部那个入口。
     *
     * 样式走 CSS 类（.dwb-entry），尺寸照卡片更新器的 .dcu-entry 抄 ——
     * 面板关着时这个按钮是插件唯一渲染的东西，而 CSS 由 installStyles 挂，
     * 所以组件里必须自己调 useStyles()。
     */
    function SideEntry(props) {
      useStyles()
      const isWide = !props || props.wide !== false
      const [open, setOpen] = useState(false)

      useEffect(() => {
        if (!open) return undefined
        const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])

      const label = t('nav')

      return h(
        Fragment,
        null,
        h('button', {
          type: 'button',
          className: 'dwb-nav-entry',
          'data-wide': isWide ? 'true' : 'false',
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: isWide ? undefined : label,
          onClick: () => setOpen(true),
        },
          h(WbGlyph, { size: isWide ? 16 : 18 }),
          isWide ? h('span', { className: 'dwb-nav-label' }, label) : null,
        ),
        open
          ? h('div', {
              className: 'dwb-overlay',
              onClick: (ev) => { if (ev.target === ev.currentTarget) setOpen(false) },
            },
              h('div', { className: 'dwb-sheet dwb-sheet-wide' },
                h('div', { className: 'dwb-row' },
                  h('span', { className: 'dwb-title dwb-grow' }, label),
                  h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setOpen(false) }, t('btn.close')),
                ),
                h('div', { className: 'dwb-col' }, h(Panel, null)),
              ),
            )
          : null,
      )
    }
    function SettingsSection() {
      return h(Panel, null)
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-wrongbook: dictionary')
      const bound = ctx.locale.bind(NS)
      translate = (key) => {
        try {
          return bound(key)
        } catch {
          return key
        }
      }

      // 目录选择走自己的浏览弹窗（见 BrowseModal），不依赖宿主的目录选择器。

      /**
       * Tavern 侧的两个入口：游玩时记录（每条消息下面的按钮）、游玩时查看（右侧栏面板）。
       *
       * 错题的现场在游玩里 —— 正文写出问题的那一刻人正在游玩界面，而面板在设置页，
       * 要记下来得切过去手填，于是「等有空再记」通常等于不记。消息按钮把那一轮直接
       * 抓成一条底稿；侧栏面板让「记完补描述」也在同一个界面里完成，不必切回工作台。
       *
       * 正文要宿主侧去读（`getTurn` 是 Tavern 的宿主服务），所以按钮只负责发起，
       * 数据靠 `captureTurn` 那一趟往返。
       *
       * 用 `ctx.inject(['tavernUi'], …)` 按需取，不写进 `export const inject` ——
       * 那里是硬依赖，缺一个整个浏览器半就不 apply，而 Tavern 是可选装的东西。
       * 两个入口各自判在不在：侧栏面板是第 2 版才有的，老版本上只少这一块，按钮照旧。
       */
      if (typeof ctx.inject === 'function') ctx.inject(['tavernUi'], (scoped) => {
        const tavernUi = scoped && scoped.tavernUi
        if (!tavernUi) return

        if (typeof tavernUi.registerMessageAction === 'function') {
          tavernUi.registerMessageAction({
            id: 'dsh-wrongbook/capture',
            label: '记进错题库',
            run: async (context) => {
              const gameId = String((context && context.gameId) || '')
              const turn = Number(context && context.turn)
              const got = await apiPost({ action: 'captureTurn', gameId, turn })
              if (!got || got.ok === false) throw new Error((got && got.error) || '读不到这一轮的正文')
              const text = String(got.turn.text || '').trim()
              // 归类用 Tavern 给的卡位置（`cards/x.json`），不用卡名：原版卡和它的
              // MVU 版卡名通常一模一样，按名字会被判成「对上了两个分类」而拒绝记录，
              // 位置则只有一条能对上。名字留着兜底 —— 老版本 Tavern 不给 id。
              const card = got.turn.card || {}
              const cardId = String(card.id || '').trim()
              const cardName = String(card.name || '').trim()
              // 上文单独进「证据」那一栏，不挤「现象」：现象是当轮原文，写描述时要
              // 照着它看，混进别的轮次只会让它更难读。
              const before = (Array.isArray(got.before) ? got.before : [])
                .map((row) => `【上文 · 第 ${row.turn} 轮】\n${row.text}`)
                .join('\n\n')
              // 本轮请求上下文（Tavern 插件接口第 3 版）：哪几段真的进了这次请求、
              // 各自多少字。和「上文」是两件事 —— 上文说前面发生了什么，这一份说
              // 模型这一轮到底看到了什么。世界书该触发没触发时，只有它能指认。
              const request = String(got.request || '').trim()
              const evidence = [before, request].filter(Boolean).join('\n\n')
              // 标题先按"第几轮 + 正文开头"起一个，够在列表里认出是哪一条；现象放正文
              // 开头一段，具体描述留给面板里补 —— 记录时人在游玩，不该被要求当场把话
              // 组织好，否则就又变成"等有空再说"。
              const head = text.replace(/\s+/g, ' ').slice(0, 24)
              const title = `第 ${turn} 轮：${head}`
              const made = await apiPost({
                action: 'addEntry',
                // 位置对得上哪个分类就用哪个；对不上时宿主会自己建一个分类。
                cardKey: cardId || cardName,
                entry: {
                  title,
                  symptom: text.slice(0, 2000),
                  evidence,
                  refs: `第 ${turn} 轮 · ${gameId}`,
                  status: 'open',
                  // 出处另存一份结构化的：refs 那行是给人读的，这一份是给「来源失效」
                  // 判断用的 —— 剧情线一变，宿主拿 gameId + turn 回来对。
                  // cardRevision 是抓取时这张卡的工作版版本，用来说明「这条结论是
                  // 对哪一版卡得出的」；老版本 Tavern 不给，就不写。
                  source: {
                    gameId,
                    turn,
                    textVersion: String(got.turn.textVersion || ''),
                    ...(Number.isSafeInteger(got.cardRevision) ? { cardRevision: got.cardRevision } : {}),
                  },
                },
              })
              if (!made || made.ok === false) throw new Error((made && made.error) || '写入错题库失败')
              return title
            },
          })
        }

        // 侧栏面板：把面板本体放进 Tavern 游玩界面的右侧栏。
        //
        // 这一块补的是「记完之后」那一半 —— 之前记完还得切回卡片工作台的设置页去补
        // 描述，现在记、看、补都在游玩界面里。render 只拿 gameId，这里刻意不读它：
        // 面板打开时自己会列出有哪几张卡，不预选反而不会选错一张。
        if (typeof tavernUi.registerPanel === 'function') {
          tavernUi.registerPanel({
            id: 'dsh-wrongbook',
            title: t('nav'),
            render: () => h(Panel, null),
          })
        }
      })

      // 两个入口：
      //   settings.section     —— 设置面板里的一个页面
      //   settings.plugin.item —— 插件菜单那一层（与「插件市场 / 卡片更新器」同级）
      // 原先只有前者（注释写着不注册侧栏，是当时的取舍）；
      // 用户要求参照卡片更新器加一个入口，所以补上。
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'wrongbook',
            order: 46,
            label: () => t('nav'),
            locale: NS,
          },
          SettingsSection,
        ),
      )

      /* 侧栏底部。这才是"左下角"—— 与卡片更新器同一个座位。 */
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'wrongbook',
            order: 47,
            label: () => t('nav'),
            locale: NS,
            inject: () => ({ t }),
          },
          SideEntry,
        ),
      )

    }

    return { name: 'dsh-tavern-wrongbook', inject: ['slots', 'locale'], apply }
  },
})
