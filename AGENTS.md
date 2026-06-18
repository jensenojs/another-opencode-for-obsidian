# AGENTS.md - Another OpenCode for Obsidian

AI 编码代理在 Another OpenCode for Obsidian 插件上工作的指南。

## 项目概述

这个插件把 OpenCode 接进 Obsidian，但产品中心不是 iframe 里的 Web UI。Web UI 只是一个入口。插件真正负责的是 Obsidian-native evidence/control：把当前 session 使用了哪些 vault context 说清楚，保留 provenance，用安全导航回到已有笔记，提供 GraphIndex 事实层和 XDG diagnostics，让终端 OpenCode TUI 仍可作为主要对话入口。

当前第一阶段的产品顺序：

1. Safe context navigation：context source 只能跳到已有 vault 内容，不能通过 Obsidian link 语义创建文件。
2. Context provenance/control：当前 OpenCode session 的 context 必须可见、可诊断、可显式移除或排除候选。
3. GraphIndex：消费 Obsidian Vault + MetadataCache，提供 vault link graph 的事实 read model。
4. GraphRAG derived layer：在 GraphIndex 之上做派生证据和候选关系，不把推荐策略塞进 GraphIndex。
5. OpenCode event bridge：上游稳定 event surface 是 OpenCode dev 的 `GET /api/event` / `v2.event.subscribe`。第一阶段只接 read-only session diagnostics，不复制 Web UI 已有的 permission/question 弹窗。

产品定位文档：

- [docs/explorations/another-opencode-for-obsidian-product-positioning.md](docs/explorations/another-opencode-for-obsidian-product-positioning.md)
- [docs/explorations/graphrag-known-to-unknown.md](docs/explorations/graphrag-known-to-unknown.md)
- [docs/plans/opencode-event-source-contract.md](docs/plans/opencode-event-source-contract.md)

**技术栈:** TypeScript · Obsidian Plugin API · esbuild · Node.js child_process / http

## 构建命令

```bash
bun install          # 安装依赖
bun run build        # 生产构建（类型检查 + esbuild 打包）
bun run harness      # 查看 harness 命令
bun run dev:status   # 查看 vault 插件状态 + XDG runtime 状态
bun run dev:logs     # 查看 XDG 日志
bun run dev:bridge   # 检查本地桥接契约
bun run dev:theme    # 检查真实 vault 里的 Web UI 外观注入
```

输出: `main.js`（CommonJS 单一 bundle）

## 项目结构

```
src/
├── main.ts              # 插件入口，extends Plugin
├── types.ts             # Settings 接口、常量定义
├── icons.ts             # SVG 图标注册（openCode、cut）
├── client/
│   └── OpenCodeClient.ts  # HTTP API 客户端（用 Node.js http.request 绕开 CORS）
├── server/
│   ├── ServerManager.ts   # 进程生命周期管理、/global/health JSON 健康检查
│   ├── ExecutableResolver.ts  # opencode 可执行文件路径解析
│   ├── types.ts           # 服务端相关类型
│   └── process/
│       ├── OpenCodeProcess.ts   # 进程抽象（平台无关接口）
│       ├── PosixProcess.ts      # Unix/macOS 进程实现
│       └── WindowsProcess.ts    # Windows 进程实现
├── bridge/
│   ├── OpenCodeWebUiProxy.ts # 本地 Web UI HTTP 代理：剥离 CSP 头、注入 iframe hook
│   ├── ProxyInjection.ts  # HTML/CSS/JS 注入入口
│   ├── BridgeInjection.ts # iframe 内 UI hook 安装
│   ├── BridgeProtocol.ts  # 本项目自己的 iframe -> Obsidian postMessage 协议
│   ├── OpenCodeBridge.ts  # OpenCode server event diagnostics
│   └── OpenCodePromptContextAdapter.ts # future native prompt context card adapter contract
├── debug/
│   └── RuntimeDiagnostics.ts # XDG 日志、status.json、运行时路径
├── context/
│   ├── ContextManager.ts    # 监听 Obsidian workspace 事件，维护本地上下文候选
│   ├── CandidateRegistry.ts # 本地候选状态：include、source clear、one-shot 消费、bounded queue
│   ├── PromptContextInjector.ts # 在发送边界把 included candidate 追加到 prompt request
│   ├── ContextSyncer.ts     # legacy/manual context message 的写入、删除、恢复
│   ├── ContextProvenance.ts # context marker + provenance 载荷格式
│   ├── ContextItemNavigator.ts # context source 安全打开入口
│   ├── ContextSessionResolver.ts # 当前 OpenCode session id 的唯一解析入口
│   ├── ContextAutoSources.ts # 自动上下文编排：第一阶段只路由 selection source
│   ├── AutoSelectionContextSource.ts # 自动选区策略：fingerprint 去重、截断、产出 one-shot candidate
│   └── WorkspaceContext.ts  # 收集打开的笔记路径 + 活动位置
├── graph/
│   └── GraphIndex.ts        # Obsidian Vault + MetadataCache 的内存图索引和查询 API
├── ui/
│   ├── OpenCodeView.ts      # ItemView：iframe + 基于状态的渲染
│   └── ViewManager.ts       # 切换逻辑、焦点管理、会话 URL
└── settings/
    └── SettingsTab.ts       # 插件设置 UI（PluginSettingTab）
scripts/
└── harness.ts        # dev harness：安装、状态、日志、doctor、bridge contract checks
```

## 模块职责

### `main.ts` — 插件生命周期

- `onload()`: 注册视图、命令、设置；加载并启动 opencode 服务器；初始化 ContextManager
- `onunload()`: 清理定时器、关闭上下文监听、终止服务器进程、移除 postMessage 监听
- 状态变更时写入 XDG `status.json`

### `OpenCodeClient.ts` — API 客户端

- 封装对 opencode HTTP API 的调用（`/session`、`/session/{id}/message` 等）
- **关键**: 使用 Node.js `http.request` 而非 `fetch`——因为 opencode 服务器默认没有 `--cors app://obsidian.md`，浏览器 fetch 会被 CORS 阻止，但 Node.js 的 http 模块不受此限制
- `x-opencode-directory` 必须使用 `encodeURIComponent(projectDirectory)`。OpenCode JS SDK 也是这样发送 header，server 侧会 decode；原始中文路径会被 Node.js 拒绝为非法 header value
- 在插件主线程中执行（非渲染进程），通过 IPC 或直接调用

### `ServerManager.ts` — 服务器生命周期

- `start()`: 先检查现有 `/global/health` → 构造启动计划 → 启动子进程 → 轮询健康检查
- 空 `customCommand` 使用 path 模式：解析 `opencodePath`，直接 spawn executable + args，不经过 shell
- 非空 `customCommand` 使用 custom 模式：模板替换后通过 shell 执行，调用者需要为 PATH 和绝对路径负责
- `stop()`: 发送 SIGTERM → 等待退出 → 超时 SIGKILL
- 健康检查: 请求 `http://{hostname}:{port}/global/health`，响应必须是 JSON 且 `healthy === true`
- `getDiagnostics()` 是 UI、设置页、XDG `status.json` 消费启动错误、stderr、命令、hint 的唯一结构化入口
- 状态机: `stopped | starting | running | error`
- 通过回调通知 UI 状态变更

### `ExecutableResolver.ts`

- 在 PATH 中查找 `opencode` 可执行文件
- 支持用户手动指定路径（设置项 `opencodePath`）

### `OpenCodeBridge.ts` — Obsidian/OpenCode bridge 入口

- 这是产品层 Obsidian/OpenCode 互联互通入口。它承接 OpenCode event diagnostics：
  根据 server lifecycle 启停 `OpenCodeEventSource`，把 read-only OpenCode event
  facts 写入 runtime diagnostics。
- hooks / callbacks / events 类能力先看本地 export surface：`node_modules/obsidian/obsidian.d.ts`、
  OpenCode package exports、`@opencode-ai/plugin` hooks、TUI API、SDK generated
  client、Web UI app exports。官方文档用于确认版本背景。
- 生产代码 owner map：
  - `src/context/*` 拥有 Obsidian context source、candidate lifecycle、GraphRAG 派生入口、
    Obsidian link/subpath resolution 和 safe navigation。
  - `src/bridge/*` 拥有 OpenCode Web UI transport、HTML 注入、iframe 内 UI hook 安装、
    iframe 本地 message shape、OpenCode server event diagnostics 和 future Web UI bridge 执行点。
  - `OpenCodePromptContextAdapter` 是 future OpenCode Web UI prompt context adapter 的
    生产类型位置；它表达 Web UI `PromptProvider` / `prompt.context.add(item)` 这类
    internal source contract，并把 internal shape 集中在一个代码入口。
- harness 的角色是本地 OpenCode/Obsidian 版本漂移检查。生产边界由上面的 owner map、
  TypeScript imports 和 adapter 类型表达。

### `OpenCodeWebUiProxy.ts` — bridge 内的本地 Web UI HTTP 代理

- 启动本地代理服务器（端口从 4097 起自动检测）
- 转发请求到 opencode 服务器，同时在响应中:
  1. **剥离 Content-Security-Policy 头**——否则注入的脚本会被浏览器阻止执行
  2. **注入键盘监听脚本**——拦截 iframe 内的 `Cmd+L` / `Ctrl+L`，通过 `BridgeProtocol.ts` 定义的 `postMessage` 协议发送到父窗口
  3. **注入文件点击监听脚本**——只从 OpenCode iframe DOM 中提取用户点击的 vault path 字符串，并发送 `vault-file:open` 本地 bridge message；proxy 不解析 wikilink，不判断文件是否存在
- 注入层 UI hook 是插件的产品能力之一。它用于承接“事实发生在 OpenCode iframe
  里，但结果需要 Obsidian API 或 vault 事实完成”的动作，例如插件拥有的
  context card 点击后跳回 Obsidian。hook 可以捕获 iframe 里的 UI 事实，也可以在
  iframe/Web UI bridge 中执行已经由 context 层决定好的 OpenCode UI 动作，例如
  future `prompt.context.add(item)`。hook 不能拥有 context source 策略、GraphRAG
  策略、link resolver、selection queue 或 OpenCode prompt 写入策略。
- OpenCode 原生 review / diff comment card 继续交给 OpenCode 自己处理。本插件
  写入的 Obsidian-owned card 不允许伪造 `commentID` 或 `commentOrigin: "review"`；
  若无法稳定识别 ownership marker，注入层必须不拦截点击，并把证据写入
  diagnostics。
- `webViewAppearance === "obsidian"` 时读取 Obsidian 当前 CSS 变量，并在 proxied HTML 里覆盖 OpenCode 的设计 token
- Obsidian 外观的 theme payload 必须在 proxy 注入 HTML 时读取当前 CSS 变量。不要在插件 `onload()` 早期缓存 theme 快照；Obsidian layout、社区主题和 CSS snippets 可能还没把变量写到最终容器上，早期快照会让重启后的首次 iframe 使用陈旧背景。proxy 初始注入只是首帧快照；`OpenCodeView` 必须在 iframe 创建、iframe load、`proxy:loaded` 后通过本地 `theme:update` bridge 把父窗口当前 `WebViewTheme` 推给 iframe。冷启动验收以这个运行态同步后的 diagnostics 为准。
- Obsidian 外观模式的 theme source 优先当前 active Markdown/editor view，其次才回退到 OpenCode ItemView 和 `body`。Obsidian 主题和社区插件常把最终颜色写到编辑器容器上；从 OpenCode pane 或 `body` 早读会拿到不匹配的背景。
- Obsidian 外观模式不能依赖透明 iframe 露出父窗口像素。Electron 在 focus/leaf 切换时可能把透明 iframe 背板合成为黑色或留下残影，点击后还可能留下可叠加的合成残留。当前契约是：OpenCode iframe document 自己拥有最终像素，iframe 元素不声明 `allowtransparency`，iframe document 的 `html` 和 `body` 使用 Obsidian page/base color，`#root` 保持透明。
- Background 类社区插件的真实稳定面是写在 `document.body` 上的 CSS custom properties。当前实证来源是本机 `/Users/oujinsai/Projects/obsidian-editor-background/src/Plugin.ts` 和 `/Users/oujinsai/Projects/obsidian-editor-background/styles.css`；上游位置是 https://github.com/shmolf/obsidian-editor-background/blob/master/src/Plugin.ts 和 https://github.com/shmolf/obsidian-editor-background/blob/master/styles.css。它把 `--obsidian-editor-background-image`、`--obsidian-editor-background-opacity`、`--obsidian-editor-background-bluriness`、`--obsidian-editor-background-position` 写到 body，再让每个 `.markdown-reading-view::before` / `.cm-editor::before` 自己用 `background-size: cover`、`background-repeat: no-repeat`、`background-blend-mode: overlay` 画一层。
- OpenCode iframe 在 Obsidian 外观下只允许 iframe 内部 `body::before` 画唯一 workspace background 层。当前生产合同是 `sourceBoundary.contract: "obsidian-workspace-background-v1"`：有有效 Background 图片时，iframe 使用 Background 插件写在 `document.body` 上的 workspace/body CSS variables，单图层、`background-size: cover`、`background-repeat: no-repeat`；没有有效图片时不画图片，只保留 Obsidian base color 和局部 material。不要恢复 active editor projection，不读取 active editor rect、iframe rect 或图片尺寸去追求跨 pane 连续背景。不要恢复宿主伪层、透明 iframe 合成、旧 `--another-opencode-for-obsidian-editor-background-*` 变量、旧 `--another-opencode-for-obsidian-iframe-*` 变量、多层 `background-image` 或 `repeat`。
- 2026-06-16 几何收敛结论：OpenCode iframe 的 workspace background 是 iframe-local 背景，不是父窗口大平面的切片。`body::before` 固定为 `left: 0; top: 0; width: 100vw; height: 100vh`，只消费 `--another-opencode-for-obsidian-workspace-background-*` paint variables。`OpenCodeView` 不能把 `window.innerWidth/innerHeight`、iframe rect、负 offset 或 `--another-opencode-for-obsidian-workspace-background-plane-*` 写进 theme payload。拖宽 pane 后让 iframe 自己用 `background-size: cover` 重新裁切；这是当前用户验收通过的最简单模型。父窗口/iframe geometry 只允许作为临时 diagnostics evidence，不能作为生产绘制输入。
- OpenCode 宿主 `.opencode-appearance-obsidian` 不拥有背景伪元素。宿主本体保持透明，宿主 `::before` / `::after` 必须 inactive 或不存在。不要写回宿主，不要 patch 用户 vault 的 background 插件文件。父窗口 editor / iframe 几何只允许作为 diagnostics evidence；不要把父窗口 union rect、大画布或宿主背景层合进生产背景算法。
- Background 插件给出的 source variables 和 iframe 允许绘制的 paint variables 必须分开。source variables 是父窗口事实，例如 `--obsidian-editor-background-*` / `--obsidian-workspace-background-*`；paint variables 是 proxy 写进 iframe 的 `--another-opencode-for-obsidian-workspace-background-*`。桥接只做命名、过滤和派生，不把父窗口 editor selector、CodeMirror 状态、Obsidian active leaf 状态或父窗口几何搬进 iframe。source variables 缺失时应降级到无图片的 Obsidian material，而不是造假变量或复用上一帧图片状态。
- 父窗口里的 Markdown editor 可能由其它 Obsidian 插件画背景层，例如 `.markdown-reading-view::before` 或 `.cm-editor::before` 消费 `--obsidian-editor-background-image`。`OpenCodeView` 的父窗口 diagnostics 会采样这些外部 editor background layer 和来源规则；这只是解释主编辑区闪动、残影、暗层的现场证据，不是本插件的修复入口。不要在 `another-opencode-for-obsidian` 里 patch `.cm-editor`、`.markdown-reading-view` 或用户 vault 的 background 插件文件。
- 左侧 Markdown editor 的当前行高亮会表现为 `.cm-line.cm-active` 背景层。它属于 Obsidian/CodeMirror 编辑器状态，不属于 OpenCode Web UI。`OpenCodeView` diagnostics 可以记录它，harness 可以解释它，但不要从本插件覆盖 `.cm-line.cm-active`、`.cm-active` 或其它编辑器主题 selector。
- 普通点击 OpenCode iframe 不能调用 `workspace.setActiveLeaf()`。active leaf 只由 `ViewManager` 的显式打开/切换命令管理。点击 iframe 时强行切 Obsidian active leaf 会让父 Markdown editor 在 `mod-active` / focus 状态之间重绘，放大 `.cm-line.cm-active`、table row、codeblock 等编辑器层的视觉问题。
- 主题桥接的真相源是稳定变量面:
  - Obsidian CSS variables: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
  - OpenCode tokens: https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css
  - OpenCode legacy Tailwind color entry: https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css
- 不要用 OpenCode 内部组件 class/data selector 重写主题。当前可验收路径是打开 proxy URL 或 Obsidian iframe，读取内部 DOM 的 computed style，确认 root elements、`--v2-background-bg-deep` 和 `--background-stronger` 为透明，确认 `--background-base`、`--v2-background-bg-base`、`--surface-raised-base`、`--surface-raised-stronger-non-alpha`、`--text-strong`、`--border-weak-base` 等局部 surface/token 已影响页面。
- Obsidian 外观的局部 surface 必须是 Obsidian-derived material，不是实体背景。基础背景、正文、muted text、border、font 继续来自 Obsidian 当前主题。OpenCode 自己需要补出来的链接、按钮、focus border、success/warning/danger/info 状态色走 `GRUVBOX_DARK_MEDIUM`，再用 `OBSIDIAN_ACCENT_ALPHA` / `OBSIDIAN_STATE_ALPHA` 混入 Obsidian text/background/border；不要裸用社区主题的 `--interactive-accent` 或 `--color-green`，它们在 iframe 内容区容易变成荧光绿。`src/theme/WebViewTheme.ts` 里的 `OBSIDIAN_MATERIAL_ALPHA`、`OBSIDIAN_WORKSPACE_BACKGROUND_MATERIAL_ALPHA`、`OBSIDIAN_BORDER_ALPHA`、`OBSIDIAN_TEXT_MIX_ALPHA`、`OBSIDIAN_ACCENT_ALPHA`、`OBSIDIAN_STATE_ALPHA`、`OBSIDIAN_OVERLAY_ALPHA` 是唯一调参入口。Background 图片启用时用 `OBSIDIAN_WORKSPACE_BACKGROUND_MATERIAL_ALPHA` 加厚 material，形成不采样背后像素的 glass-like 背景；Background 未启用时继续用普通 `OBSIDIAN_MATERIAL_ALPHA`，不要把所有 Obsidian 外观都压暗。当前人工验收过的方向是：加厚 panel/dialog/composer/dock material，弱化 border，提升正文和 thinking 的 muted/faint 文本可读性。不要为了某个截图 patch `dialog-v2`、`settings-v2`、`session.tsx`、scrollbar 或其它 OpenCode 内部 class。`--surface-raised-stronger-non-alpha` 这类 OpenCode legacy “non-alpha” token 在本模式下仍只能 alias 到 v2 Obsidian material，不能改成实体黑色。
- iframe `body::before` 可以使用 `--another-opencode-for-obsidian-workspace-background-filter` 处理它自己绘制的 workspace/background 图片层。这个 `filter` 只模糊 iframe 自己的图片，不读取元素背后的合成像素。不要把它和 `backdrop-filter` 混用；`backdrop-filter` 在 `obsidian + workspace background enabled` 里仍然必须禁用。
- 低配毛玻璃只能由 iframe 自己拥有的层实现：加厚 alpha surface、scrim、border、shadow，或对 iframe 自己绘制的 `body::before` 图片使用普通 `filter`。`backdrop-filter` 的含义是采样元素背后的合成像素；在透明 Obsidian + Background 图片组合里，这会把 iframe 内滚动、sticky、scrollbar 等局部状态带到 Electron compositor 路径上。不要把“想要毛玻璃”翻译成恢复 `backdrop-filter`。如果后续重新实验真实毛玻璃，必须开实验分支，写明单一假设和人工视觉收益，不能合进默认路径。
- OpenCode v2 dialog overlay 消费 `--v2-overlay-simple-overlay-scrim`。Obsidian 外观模式下，dark 模式的 scrim 必须从 `--background-primary` 派生暗色 alpha，用来压低背景图和底层 session 文本噪声；light 模式才从 `--text-normal` 派生暗化 scrim。背景字透出、正文偏暗、边框太硬时，先调 `WebViewTheme.ts` 的 token 常量，再运行 theme tests 和手动验收。
- OpenCode session 主体大面消费 legacy `--background-stronger`。Obsidian 外观模式下这个 token 必须透明，因为 iframe document roots 已经使用 Obsidian page/base color；再给 session shell 加 panel material 会制造左右边界和正文区域的额外暗层。输入框、弹层、tabs、局部控件继续使用 `--v2-background-*` 和 surface tokens。黑屏、色差或残影要先看 `runtimeDiagnostics.theme.largeElementSamples` 中 `bg-background-stronger` 的 computed background；不要 patch `session.tsx` 或 settings component 的 class。
- 2026-06-15 实证结论：OpenCode Web UI 在透明 Obsidian 外观里滚动时，父 Markdown editor 的局部亮暗弹闪来自 iframe 内部的 `backdrop-filter` 合成采样。复现路径是右侧 OpenCode iframe 内触控板 `wheel/scroll`；一次性 trace 捕捉到大量 iframe 内 `wheel` / `scroll`，同时父窗口没有 `cm-focused`、active line、workspace active leaf、主编辑区 computed style 或 background layer 变化；随后在 iframe 内禁用 `backdrop-filter` 后，用户手动验收确认弹闪消失。精确到当前 OpenCode 源码 `/Users/oujinsai/Projects/ai-cli/opencode/packages/ui/src/components/scroll-view.css` 的 `.scroll-view__thumb::after` 不足以稳定解决，因为上游可以新增、移动或改名任何带 `backdrop-filter` 的元素；上游位置是 https://github.com/sst/opencode/blob/dev/packages/ui/src/components/scroll-view.css。生产契约因此不是 patch 某个 OpenCode class，而是在 `webViewAppearance: "obsidian"` 的透明/背景图模式下禁止 iframe 内部跨像素背景采样。可以保留半透明 alpha surface、border、shadow、scrim 和 token 派生出的材料层；不能保留真正的 `backdrop-filter` 毛玻璃模糊。不要把这条结论扩展成 patch `.cm-editor`、`.markdown-reading-view`、Background 插件、host pane 背景层、OpenCode session shell 或其它 OpenCode 内部组件样式。
- 2026-06-15 方案 3 实验结论：`body { will-change: opacity; }` 可以作为 Backdrop Root 方向的单变量实验。MDN 说明 `backdrop-filter` 会处理元素背后的像素；Filter Effects Level 2 的 Backdrop Root 规则把 `filter`、`opacity < 1`、`backdrop-filter`、`mix-blend-mode`、以及指向这些属性的 `will-change` 都列为 Backdrop Root 触发条件。本地实验在 `obsidian + Background enabled` 下临时恢复真实 `backdrop-filter` 并给 iframe `body` 加 `will-change: opacity`，用户验收结果是“不闪，但视觉没有可见收益”；关回 baseline 后也不闪。结论是：当前 OpenCode 上游只有 scrollbar thumb 一处小面积 blur，保留真毛玻璃没有产品价值。不要把 `will-change: opacity`、`filter: opacity(1)`、`transform: translateZ(0)` 或 `contain: paint` 合进生产路径。后续只有在 OpenCode 上游出现大面积 backdrop-filter UI 且用户能看出收益时，才重新开实验分支。
- 视觉排查中已经排除的生产方向不要重新引入：active editor projection、workspace union rect、大画布负 offset、host pane 背景层、transparent iframe compositing、`allowtransparency`、hidden probe iframe、srcdoc probe、针对 `.scroll-view__thumb::after` 的上游 class patch、针对 `.cm-active` / `.cm-editor` / `.markdown-reading-view` 的父窗口 patch。这些路径的共同问题是把一个局部现象变成长期兼容层。后续如果有人想恢复其中任一路径，必须先说明它删除了哪一个现有前提，以及为什么当前 iframe-local 合同不能满足目标。
- `harness theme` 必须确认 editor/workspace background 变量能在父窗口 diagnostics 里看见，确认这些变量以原始 `--obsidian-editor-background-*` / `--obsidian-workspace-background-*` 名称进入 iframe theme payload，确认 iframe 元素没有声明 `allowtransparency="true"`，确认宿主 `.opencode-appearance-obsidian` 本体透明且没有 active `::before` / `::after` 背景层，确认 iframe document 的 `html` 和 `body` 使用 Obsidian base color、`#root` 透明，确认 iframe document 的 `body::before` 是唯一 iframe-local workspace background 层，并且该层不依赖 parent-window plane、负 offset 或 `--another-opencode-for-obsidian-workspace-background-plane-*` 变量。不要恢复 hidden probe iframe、srcdoc probe、父窗口几何负偏移、host pane background、透明 iframe 合成、旧 `--another-opencode-for-obsidian-editor-background-*` payload、`repeat`、多层 background image、或 OpenCode 内部组件 selector patch；它们会制造重复裁剪、色差、残影和误导性 diagnostics。
- proxy 注入脚本必须在 runtime `theme:diagnostics` 中写出 `sourceBoundary.contract: "obsidian-workspace-background-v1"`。`sourceBoundary` 只报告合同、图片状态和当前 paint image；不要恢复 `sourceBoundary.plane`。`bun run dev:theme` 看到缺失标记、旧 `--another-opencode-for-obsidian-editor-background-*` 变量、旧 `--another-opencode-for-obsidian-iframe-*` 变量、旧 `--another-opencode-for-obsidian-workspace-background-plane-*` 变量、host pane 背景层、多层 iframe 背景图、transparent iframe compositing、iframe app root 额外背景、或 workspace background 启用时仍有 iframe 内 `backdrop-filter` samples 时必须硬失败。
- OpenCode v2 token 是 Obsidian 外观桥接的主面。`--v2-background-*`、`--v2-text-*`、`--v2-icon-*`、`--v2-border-*`、`--v2-state-*`、`--v2-elevation-*`、`--v2-overlay-*` 等由 Obsidian CSS 变量派生；未加 `v2` 前缀的 OpenCode token 只能别名到对应 `--v2-*` 或保持透明，不能再维护一套颜色算法。legacy success/warning/critical/info token 也只能 alias 到对应 `--v2-state-*`
- `harness theme` 会读取本地 OpenCode `packages/ui/src/v2/styles/theme.css` 和 `packages/ui/src/styles/tailwind/colors.css`。如果 OpenCode 新增或改名 v2 appearance token，fixture/runtime 检查必须显示缺失 token；不要把这类上游事实改成插件里的手写清单。runtime diagnostics 必须包含 `largeElementSamples` 和相关 token 值，用来定位真正拥有大面积背景的 DOM 层；只看 root/token 不足以判定视觉问题已修好。
- 代理在插件卸载时自动关闭

### `OpenCodeView.ts` — 侧边栏视图

- `ItemView` 子类，使用 iframe 加载 opencode Web UI
- 基于状态的渲染: 根据服务器状态（stopped/starting/running/error）显示不同 UI
- 加载状态: spinner + "正在加载 OpenCode..."
- 错误状态: 错误信息、hint、启动命令、stderr、XDG log/status 路径、重试/设置/复制诊断按钮
- 运行状态: iframe 指向代理 URL
- 点击或聚焦 iframe 时只允许同步 Obsidian workspace active leaf 到 OpenCode leaf。不要在 iframe focus/pointer 事件里刷新 context、读取 Markdown editor 或触发 OpenCode message；context 只来自 workspace/editor 事件和显式命令。
- `syncThemeToIframe()` 只推送当前 `WebViewTheme`，不附加父窗口 geometry。`window-resize`、iframe load、`proxy:loaded`、theme source mutation 和 layout resize 只表示“重新读取当前 Obsidian 变量并推给 iframe”；它们不能生成 parent/iframe plane variables，也不能把 iframe rect 写入 theme payload。
- `ResizeObserver` 和 delayed theme sync 只用于跨过 Obsidian layout/theme 的异步稳定期。不要为某个视觉问题增加新的长尾延迟队列；如果需要观测瞬时问题，用临时 ring-buffer diagnostics，验收后删除或降级到 summary。
- 监听 `window` 的 `message` 事件，处理来自 iframe 的 postMessage:
  - `view:toggle`: 触发视图切换
  - `proxy:loaded`: iframe 初始化确认
  - `vault-file:open`: 对来自 Web UI 的文件点击请求走 `ContextItemNavigator.openSource()`；解析失败静默记录 diagnostics，不弹 Notice，不创建文件

### `ViewManager.ts` — 视图切换逻辑

- **三段式切换**:
  1. 侧边栏已展开 且 opencode 活跃 → 折叠侧边栏
  2. 侧边栏已展开 但其他 leaf 活跃 → 切换到 opencode leaf
  3. 侧边栏已折叠 → 展开侧边栏 + 聚焦 opencode iframe
- `previousEditorLeaf`: 聚焦 opencode 前保存编辑器的 leaf，折叠时恢复焦点到编辑器
- `lastSessionUrl`: 保存会话 URL 到插件设置，重启时恢复；同时通过时间戳比较查询服务器最新会话
- `toggle-opencode-view` 保留给用户快捷键；harness 和调试脚本使用 `open-opencode-view`，它只调用 `activateView()`，不会因为当前 leaf 已经活跃而折叠右侧栏

### `ContextManager.ts` — 上下文注入

- 监听 Obsidian workspace 事件（active-leaf-change、editor-change 等）
- 防抖后刷新 workspace candidate；editor-change 也会把选中文本交给 selection source
- 调用 `WorkspaceContext` 收集 workspace candidate 数据；自动来源不能直接通过 `OpenCodeClient` 写入 OpenCode 会话
- 当前 session id 只从 `CurrentContextSession` 获取。`ContextManager` 不解析 iframe URL，也不维护 cached iframe URL
- `add-selection-to-context` 和 `add-current-note-to-context` 仍走 legacy/manual `ContextItem` 路径；自动 oc-ctx 主路径不能调用它们
- `contextAssist.enabled` 是 oc-ctx 总开关；关闭时必须清空全部 candidate 并停止 source 监听
- `contextAssist.workspace.enabled` 控制动态 workspace candidate。workspace candidate 只包含打开笔记列表和可选活动位置；活动位置属于 workspace，不再有顶层 cursor source
- `contextAssist.selection.enabled` 控制 one-shot selection candidate。选区 source 只产候选，registry 负责最近 N 条 FIFO 队列
- 第一阶段不维护 backlinks source，不监听 metadata resolvedLinks，不把 backlinks 当默认候选。GraphRAG、块引用、链接证据以后必须作为新的 source driver 产出 candidate
- 关闭任一 source 时，`ContextManager.updateSettings()` 必须清掉该 source 已有候选；关闭总开关时必须清空 CandidateRegistry，避免已禁用来源随 prompt 发送
- oc-ctx 演进必须按 source driver → CandidateRegistry → PromptContextInjector → OpenCode prompt request parts 的链路收拢。source driver 不能直接写 OpenCode session。
- candidate 是本地 Obsidian 插件状态，没有 `messageId` / `partId`，toggle included/excluded 时不能调用 OpenCode API。committed context 才是 `ContextItem`，只属于 legacy/manual context message 生命周期。
- CandidateRegistry 第一阶段按当前 OpenCode session 作用域处理。`CurrentContextSession` 变化时必须清空候选，不能把旧 session 的 candidate attach 到新 session。
- source driver 输出必须表达 `upsert`、`remove`、`clear-source`、`failed`。不要把 source 消失、刷新失败或内容未变硬塞进 `ContextManager` 的临时分支。
- ContextStatusBar 是当前自动 oc-ctx 的用户可见控制面。用户在状态栏切换 included/skipped 或移除 one-shot 候选；发送成功后，PromptContextInjector 消费 one-shot candidates 并恢复临时跳过的 dynamic candidates。
- 旧 `ContextSuggestion` 不能和 `ContextCandidate` 作为两套运行时候选模型长期并存。实现 candidate 层时必须删除、迁移或明确降级它。
- oc-ctx 注入策略属于 `src/context`。source driver、CandidateRegistry、GraphRAG candidate lifecycle 留在 context 层；`src/bridge` 提供 Web UI transport、HTML 注入、iframe hook、本地 message protocol、prompt request hook 和 future native prompt context card adapter。
- 当前行为合同见 [docs/plans/2026-06-17-oc-ctx-prompt-coupled-behavior-design.md](docs/plans/2026-06-17-oc-ctx-prompt-coupled-behavior-design.md)。

### `PromptContextInjector.ts` — 自动 oc-ctx 到 prompt request

- 自动 oc-ctx 主路径不提前写独立 context message
- `PromptContextInjector` 只在 `POST /session/{id}/message` 的发送边界读取 included candidates
- injector 把候选追加为同一条 request 的 `synthetic: true` text parts
- 主路径不写 `noReply`
- OpenCode 返回 2xx 后才消费 one-shot candidates；非 2xx 或网络错误时保留候选并标记 failed

### `ContextSyncer.ts` / `ContextProvenance.ts` — legacy/manual context message 协议

- `ContextSyncer` 是 legacy/manual Obsidian → OpenCode context message 的写入、删除、恢复入口
- 自动 oc-ctx 主路径不调用 `ContextSyncer.add()`，也不依赖 `noReply`
- `ContextProvenance` 是 `<!-- oc-ctx -->` marker 和 `oc-ctx-provenance` JSON 注释的唯一格式化/解析模块
- 新写入的 context message 必须持久化 source path、range、type、label、textLength、createdAt
- `sourceFile` 是用户可见来源标签；`navigationSourceFile` 是可选 vault path 跳转目标。Workspace context 这类聚合来源必须保留 `sourceFile: "Obsidian workspace"`，有单一明确目标时才写 `navigationSourceFile`，禁止从 formatted context text 里解析 `- note.md` 来推导跳转
- 新写入的 context message 必须使用 OpenCode `TextPartInput.synthetic = true`。`noReply` 只表示不触发模型回复，不表示隐藏；OpenCode Web UI 以 `synthetic` 跳过用户可见 text part
- 插件移除自己创建的 context message 时必须删除整条 OpenCode message，不能只把 part 标成 `ignored`。OpenCode Web UI 会隐藏 ignored synthetic text，但仍会保留空的 timeline row，造成 session 中间大块空白和滚动到底异常。
- restore 时必须清理已经遗留的 ignored plugin context message。只有整条 message 的所有 part 都能解析为 `<!-- oc-ctx -->` context part 时才允许删除；混入普通用户 part 的 message 不能删。
- restore 时有有效 provenance 才输出 `provenanceStatus: "known"`；缺失或无效 provenance 必须输出 `provenanceStatus: "uncertain"`
- server start 成功后，如果 `CurrentContextSession` 已经能解析出当前 session id，插件必须调用 `ContextManager.restoreFromServer()`。这保证重启后可恢复 context provenance，也会清理旧版本遗留的 ignored plugin context message；不要把 cleanup 只绑在 OpenCode view 的 `ensureSessionUrl()` 上。
- diagnostics 可以显示 `textLength` 和 `provenanceStatus`，不能复制完整 context text

### Obsidian resolution contract

- Obsidian 已提供解析能力时，本项目优先消费 Obsidian API，不手写第二套 wikilink、heading、block、footnote resolver。
- GraphIndex 是 Obsidian Vault + MetadataCache 的事实层。GraphRAG 是它之上的派生层，只能消费 GraphIndex facts，不能替代 Obsidian resolver。
- UI surface、StatusBar、OpenCodeBridge、Web UI proxy 和 iframe bridge 不解析 wikilink，不维护独立 resolver，不从渲染文本里倒推 vault path。
- 解析和导航的生产路径是：Obsidian metadata/link API → GraphIndex facts → `ContextItemNavigator` → 已解析到的 `TFile` → `WorkspaceLeaf.openFile()`。
- API 面必须优先使用：
  - [`MetadataCache`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)
  - [`MetadataCache.getFirstLinkpathDest()`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFirstLinkpathDest)
  - [`parseLinktext()`](https://docs.obsidian.md/Reference/TypeScript+API/parseLinktext)
  - [`getLinkpath()`](https://docs.obsidian.md/Reference/TypeScript+API/getLinkpath)
  - [`resolveSubpath()`](https://docs.obsidian.md/Reference/TypeScript+API/resolveSubpath)
  - `Vault.getFileByPath()`
  - [`WorkspaceLeaf.openFile()`](https://docs.obsidian.md/Reference/TypeScript+API/WorkspaceLeaf/openFile)
- [`Workspace.openLinkText()`](https://docs.obsidian.md/Reference/TypeScript+API/Workspace/openLinkText) 表达 Obsidian link-open 语义；本项目 evidence navigation 的生产入口需要更窄的合同：先解析到已有 `TFile`，再打开。

### `ContextItemNavigator.ts` — context source opening

- 这是 context source opening 的唯一生产入口
- 只打开已有 vault file：使用 Obsidian `Vault.getFileByPath()` / `WorkspaceLeaf.openFile()`
- 禁止用 `workspace.openLinkText()` 作为 context source 的生产打开入口；它是 link-open API，不提供“已解析到既有 `TFile` 后再打开”的窄合同
- missing path、folder、URL、workspace synthetic source、restored uncertain source、unresolved heading/block subpath 都返回明确 unresolved reason
- 当前代码已通过 GraphIndex-backed resolution 解析 linkpath 和 heading/block/footnote subpath；生产入口仍保持单一
- 合法引用点击应打开已有目标 file/heading/block/footnote；非法引用点击应打开写出该坏引用的已有 source Markdown occurrence。永远不要尝试打开或创建 missing target。

### `ContextStatusBar.ts` — 轻量状态面

- StatusBar 第一阶段做 context count、当前 session context 胶囊、复制 diagnostics、安全导航和显式 session remove
- OpenCode session URL 确定后先 restore 当前 session 里已有的 plugin context message，再渲染 status bar。StatusBar 不能只反映本次插件窗口内存里刚创建的条目
- 默认 context 胶囊只显示 title 和 source；source、type、range、textLength、createdAt、provenanceStatus、navigation resolution 等审计字段进入详情或 diagnostics
- context 胶囊是紧凑可点击 cell：单击通过 `ContextItemNavigator` 或 GraphIndex-backed navigator 做 evidence navigation，双击切换 candidate included/excluded 或本地 dim/selected 状态。第一阶段不要恢复独立 `Open source` 按钮
- remove 必须是明确的 session-scoped 动作，可以用右侧小图标加 tooltip，但不能用含义不明的角落小叉，也不能暗示删除 vault 文件或撤回历史回答
- 后续 context panel 可以提供显式删除动作，但语义必须仍然是删除插件创建的 remote context message，不是 vault 内容删除
- ContextStatusBar 只负责把 context、candidate、broken-link evidence 和后续 permission/question/event/hook signals 渲染成 Obsidian-native 胶囊和交互。它不解析 wikilink、不消费 MetadataCache、不维护 GraphIndex、不直接调用 OpenCode API、不调用 `workspace.openLinkText()`。
- 默认胶囊只显示 title 和 source。`known`、`resolved`、字符数、createdAt、message id、part id 等审计字段进入详情或 diagnostics，不在默认行里堆 chip。异常状态用小的 warning accent 表达，点击后再看详情。
- 单击胶囊是 evidence navigation：合法引用跳目标，非法引用跳 source occurrence，普通 context 跳来源。双击和右侧状态图标用于 candidate included/excluded 切换；active session context 的 remove 仍是单独的显式动作。
- 参考设计文档：[docs/plans/context-control-surface.md](docs/plans/context-control-surface.md)

### `GraphIndex.ts` — Obsidian link graph 机制层

- GraphIndex 是内存 read model，唯一真相源是 Obsidian Vault + MetadataCache
- Graph path 使用 vault-relative `TFile.path`；vault root/name 只能作为 diagnostics/cache identity 单独携带
- Obsidian cache position 保持 0-based；UI 层负责转成 1-based display
- GraphIndex 可以从 mock Vault/MetadataCache bootstrap，并通过 changed/resolve/deleted/renamed/created 维护 snapshot
- Query API 返回事实：node、incoming/outgoing、references、unresolved、heading/block、≤3 hop neighborhood、orphan、degree、cross-root coverage
- GraphIndex 不返回 recommendation、score、shouldAddToContext，不写 vault，不读 note body
- GraphIndex 后续必须保留 reference occurrence：sourcePath、raw link/embed、linkpath、source position、target resolution、subpath resolution。broken link 是可维护的 Markdown evidence，surface 点击时应回到 source occurrence。
- 参考文档：[docs/plans/graph-index.md](docs/plans/graph-index.md)

### TUI / plugin coexistence

- Terminal OpenCode TUI 可以继续作为主要对话入口；插件负责 Obsidian-native evidence/control
- 默认插件能力不能依赖用户本地 patched OpenCode branch；patched serve/attach 只能通过 custom command 配置
- `ServerManager` 拥有 server lifecycle 和 health diagnostics；`CurrentContextSession` 拥有当前 session id；`ContextManager` 拥有 context 生命周期
- 后续 attach/session selection 需要单独 implementation bead，不能把用户 custom command 分支写成默认假设
- 参考文档：[docs/plans/tui-plugin-coexistence.md](docs/plans/tui-plugin-coexistence.md)

### `ContextAutoSources.ts` — 自动上下文编排

- 第一阶段只组合 `AutoSelectionContextSource`
- 只接收普通对象：file path 和选区 snapshot
- 不 import Obsidian，不调用 OpenCodeClient，不持有 ContextItem[]；新增自动源时先确认它是否必须存在，且必须产出 `ContextSourceResult`
- `ContextManager` 是唯一 Obsidian 事件监听入口；`ContextAutoSources` 是这些事件进入自动源策略前的唯一编排入口

### `ContextSessionResolver.ts` — 当前 session 解析

- `CurrentContextSession` 是当前 OpenCode session id 的唯一解析入口
- 输入只有 cached iframe URL、OpenCode leaf iframe URL 和 `OpenCodeClient.resolveSessionId`
- 输出只有 session id，并在 leaf URL 可解析时更新 cached iframe URL
- 它不知道 `ContextItem`、registry、syncer、auto source、workspace event、permission/question/event/tui 策略
- 新增 context panel、permission、question、event、tui 或 hooks 相关代码时，先消费这个入口，不要在策略层重新解析 iframe URL

### OpenCode event source contract

- 事件源合同见 [docs/plans/opencode-event-source-contract.md](docs/plans/opencode-event-source-contract.md)
- 新的 Obsidian-side event code 首选 OpenCode dev 的 `GET /api/event` / `v2.event.subscribe`，因为它携带 location 语义；`GET /event` 只作为 legacy compatibility 参考
- 产品层的 `src/bridge` 是 Obsidian 与 OpenCode 的互联互通代码边界，必须基于两边的金标准：OpenCode OpenAPI/source contract 和 Obsidian API/runtime facts
- `OpenCodeBridge.ts` 是广义 bridge 层的代码入口。当前通过 Node 侧 `src/client/OpenCodeEventSource.ts` 接 OpenCode event，状态写入 runtime diagnostics
- 具体实现类 `OpenCodeWebUiProxy.ts` 只负责 Web UI transport 和 HTML 注入。它可以透传 SSE 字节，但不能解析 OpenCode event 并维护插件状态
- `BridgeProtocol.ts` 只定义本项目 iframe 本地消息，不加入 `session.*`、`permission.*`、`question.*` 或 `tui.*` 这类上游 event name
- 第一阶段只做 connected/disconnected/failed/unsupported、last event、current-session read-only state diagnostics。不要复制 OpenCode Web UI 已有的 permission/question 交互弹窗

### `AutoSelectionContextSource.ts` — 自动选区策略

- 只处理自动选区策略：开关判断、fingerprint 去重、长度截断、产出 one-shot candidate
- 空选区不清空 selection queue。关闭 selection source 时由 `ContextManager` 通过 registry clear source
- 不持有 ContextItem[]，不调用 OpenCodeClient，不读取 Obsidian workspace
- registry 负责 bounded queue。不要在 source 内维护“最近 N 条”的第二套队列

### `WorkspaceContext.ts` — 上下文收集

- 获取当前打开的笔记文件路径列表
- 获取当前活动位置，转换为给模型看的 1-based 行号
- 不读取正文，不收集选中文本。选中文本属于 selection source

### `SettingsTab.ts` — 设置面板

- `opencodePath`: opencode 可执行文件路径
- `customCommand`: 非空时是 shell command template，必须包含 `{hostname}` 和 `{port}`
- textarea 显示真实配置值；示例命令只作为 placeholder。空字符串必须保持为空，因为它表示 path 模式
- `webViewAppearance`: 默认 `obsidian`，让 Web UI 继承 Obsidian pane 背景并使用半透明局部 surface；`opencode` 保留 OpenCode Web UI 原生风格
- `contextAssist` 是自动 oc-ctx 的运行时真相源。旧 `candidateSources`、`contextCommitMode`、`maxNotesInContext`、`maxSelectionLength`、`injectWorkspaceContext`、`autoAddSelectionContext`、`autoAddBacklinksContext`、`autoAddCursorContext` 加载时直接丢弃，不迁移、不保存回去
- 设置页只显示：上下文辅助、工作区线索、选中文本，以及各自必要的上限选项。不要恢复 backlinks、cursor、manual attach UI

### `RuntimeDiagnostics.ts` — 运行时观测

- 唯一运行时文件位置由 `getRuntimePaths()` 决定
- `$XDG_STATE_HOME/another-opencode-for-obsidian/another-opencode-for-obsidian.log`
- `$XDG_STATE_HOME/another-opencode-for-obsidian/status.json`
- 若 `XDG_STATE_HOME` 未设置，使用 `~/.local/state`
- 依据: [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/)

### 视觉异常诊断纪律

- probe 只有在命中用户描述的现象时才有解释力。若用户说的问题没有在本次采样中出现，结论只能写“本次未命中现象”。禁止把未命中的 probe 包装成“仍然有用”“已经排除一类问题”这类自我肯定，除非同时写出被排除对象的精确定义、采样范围、采样时间窗和仍未覆盖的方向。
- “排除方向”必须是可审查句子。例如：“在这一次 `pointerdown -> raf2` 时间窗内，采样点 A/B/C 的 `elementsFromPoint` top 8 层没有 `backgroundColor`、`opacity`、`filter`、`backdropFilter`、`transform` 变化。”禁止把它扩写成“主编辑区没有 DOM 问题”“问题更可能是合成层”这类超出证据的判断。
- 用户指出某个现象属于正常 UI 状态后，后续诊断必须删除这条证据。比如 `.cm-line.cm-active` 是光标所在行高亮时，只能记录为正常 CodeMirror 状态，不能继续把它当作异常黑条、色差或根因线索。
- 不稳定视觉异常不能用固定截图坐标建模。用户蓝框、截图标注、一次复现中的竖条位置都不是稳定 ROI。除非运行时能从真实元素、事件目标、layout rect 或用户明确指定的当前坐标推导区域，否则不要写“蓝框区域”“竖条区域”的固定像素采样逻辑。
- 像素采样默认不是根因定位工具。它只能服务两个目的：确认某一次自动 probe 是否真的命中了视觉差异；或作为回归验收的最后屏幕证据。像素采样不能说明是哪一层绘制了差异，不能替代 DOM、CSS rule、focus、mutation、compositor 边界的因果分析。若异常位置不稳定，固定区域像素比较直接无效。
- 对瞬时闪动、局部弹闪、焦点切换后的短暂残影，事后抓当前屏幕价值很低。可接受的观测方式是事件边界上的短时环形记录：在 `pointerdown`、`focusin/focusout`、workspace class mutation、editor class/style mutation、theme update 发生时记录前后状态。默认输出只给 summary；完整载荷只写文件路径，不把大 JSON、base64 screenshot 或完整 DOM 栈打进对话。
- 如果用户确认视觉现象已经复现，但事件边界 trace 只看到 iframe 内部 `wheel/scroll`，父窗口没有 focus、workspace、CodeMirror class/style、computed style 或 background layer 变化，下一步应转向 paint/compositor 边界或单一 CSS 合成特性实验。不要继续堆 DOM 字段。2026-06-15 的有效实验是禁用 iframe 内 `backdrop-filter`，它把 iframe 内部的背景采样从透明 iframe 合成路径中拿掉，并消除了主编辑区亮暗弹闪。这个一次性 probe 已经完成；不要长期保留专用 wheel/click trace harness。
- 新增 probe 前必须写清它要验证的单一假设、命中条件、未命中时的解释、会污染哪些运行路径。若 probe 会挂到普通点击、输入、滚动、focus 或 iframe message 路径上，它本身就是产品行为的一部分，必须证明负载足够小且默认不会持续运行。诊断代码不能制造新的闪动、重绘、日志洪水或 status 写入风暴。
- 视觉诊断输出必须区分三种状态：`observed` 表示本次命中用户现象并采到对应变化；`not-observed` 表示本次没有命中用户现象；`inconclusive` 表示采样点、时间窗或前提不够。禁止把 `not-observed` 或 `inconclusive` 写成“问题改善”“问题已排除”“方向有价值”。

### Chrome/CDP 视觉取证 SOP

- Chrome/CDP 只能用于只读取证：读取 DOM、layout rect、scroll metrics、computed style、DOMSnapshot、LayerTree/compositing reasons，或截取当前页面证据。它不能作为修改 OpenCode class、强制 scroll、强制 padding、隐藏按钮、增加延迟队列或改 compositor CSS 的理由。
- 隔离 Chrome profile 适合回答“同一个 proxied OpenCode URL 在普通浏览器里是否复现”。启动时必须使用独立 `--user-data-dir`，避免污染用户主 Chrome profile；取证后关闭进程并确认 remote-debugging 端口释放。若隔离 Chrome 未复现，只能记录为 `not-observed in standalone Chrome`，不能据此声称 Obsidian iframe 问题不存在。
- macOS 隔离 Chrome profile 的常用启动方式：
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9224 --user-data-dir=/tmp/another-opencode-for-obsidian-chrome-profile "http://127.0.0.1:4097/"`
- Obsidian/Electron 特有的视觉问题必须抓 Obsidian renderer。做法是让 Obsidian 以 `--remote-debugging-port=<port>` 启动，再通过 Chrome DevTools Protocol 连接对应 `app://obsidian.md` page/frame。采样目标必须是当前真实 OpenCode iframe，而不是单独打开的 proxy URL。
- macOS Obsidian renderer CDP 的常用启动方式：先完全退出 Obsidian，再执行
  `open -na "Obsidian" --args --remote-debugging-port=9223`
  然后连接 `http://127.0.0.1:9223/json`，选择当前 vault 对应的 `app://obsidian.md` target。
- 取证顺序固定为：先记录 session URL、session id、OpenCode session version、message/part/diff 摘要；再抓 scroll root 的 `scrollHeight/clientHeight/scrollTop`、timeline row rect、composer rect、jump button state；需要解释合成问题时再抓 `DOMSnapshot.captureSnapshot` 和 `LayerTree.compositingReasons`。
- 每次取证都要标记状态：`observed`、`not-observed` 或 `inconclusive`。如果只在隔离 Chrome 里采到正常状态，结论必须写“没有命中 Obsidian 错误状态”，下一步才是 Obsidian renderer CDP。不要把“普通浏览器正常”改写成“问题已排除”。
- 相关官方文档：
  - Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
  - `Runtime.evaluate`: https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate
  - `DOMSnapshot.captureSnapshot`: https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/#method-captureSnapshot
  - `LayerTree.compositingReasons`: https://chromedevtools.github.io/devtools-protocol/tot/LayerTree/#method-compositingReasons

### `harness bridge` — 桥接契约检查

- 一阶真相源只读本地依赖，不联网、不静默重试、不维护手写能力清单
- OpenCode HTTP 以 `/path/to/opencode/packages/sdk/openapi.json` 为准
- OpenCode hooks 以 `/path/to/opencode/packages/plugin/src/index.ts` 为准
- Obsidian workspace events、`Editor.getCursor()`、`MetadataCache.resolvedLinks` 以 `node_modules/obsidian/obsidian.d.ts` 为准
- `BridgeProtocol.ts` 只定义本项目自己的 postMessage 协议，不替 OpenCode 或 Obsidian 定义能力
- Event bridge 后续验收必须从本地 OpenCode OpenAPI 确认 `/api/event` / `v2.event.subscribe`，不能在插件里维护手写 event type 清单

### `harness theme` — Web UI 外观检查

- 默认读取 XDG `status.json` 里的 `proxyUrl`，只访问本机 proxy HTML，验正在运行的 Obsidian 插件实例
- `bun run dev:theme:fixture` 使用当前工作区代码启动本地 HTML fixture + `OpenCodeWebUiProxy`，再用 happy-dom 执行 proxied HTML 里的注入脚本并捕获 `theme:diagnostics`，不依赖 Obsidian 重载
- `dev:theme` 输出里的 `summary` 和 `actions` 是第一阅读入口。失败时先看这里判断是 server stopped、proxy 502、pane collapsed，还是 iframe 内部 theme diagnostics 未回写
- `obsidian` 模式要求 `data-another-opencode-for-obsidian-*` 注入存在、根背景 token 保持透明、iframe document 的 `html` 和 `body` 使用 Obsidian base color、`#root` 透明、iframe document 的 `body::before` 使用 `--another-opencode-for-obsidian-workspace-background-*` paint variables 画唯一 workspace background 层、宿主 `.opencode-appearance-obsidian::before` / `::after` inactive 或不存在、局部 surface token 半透明、dialog scrim 是 OpenCode alpha overlay、父窗口 diagnostics 能观测 Obsidian editor/workspace background 变量且证明它们没有被改写成旧 `--another-opencode-for-obsidian-editor-background-*` payload。Background 图片启用时，harness 还必须确认 iframe 内部没有 active `backdrop-filter` samples。
- `obsidian` 模式还要求 OpenCode v2 appearance token 覆盖来自本地 OpenCode 源码，旧 token 只作为 `--v2-*` alias。`--v2-elevation-*` 属于这个覆盖面，因为 OpenCode v2 输入框、菜单、弹窗、按钮会消费这些 shadow token
- fixture 模式要求脚本实际 post `theme:diagnostics`，并验证 computed variables 已解析成 Obsidian 背景、surface、text、border 值
- `opencode` 模式要求不注入 Obsidian 外观覆盖
- `runtimeDiagnostics.theme` 来自 proxy 注入脚本，检查 OpenCode iframe 内部 DOM；`runtimeDiagnostics.iframe` 来自 Obsidian 父窗口，检查 iframe 元素和 Obsidian 祖先链。两者必须分开，因为 iframe 加载后父窗口不能可靠读取 OpenCode 内部 DOM

## 关键架构决策

### 1. `http.request` 替代 `fetch` —— 绕过 CORS

opencode 服务器默认启动不带 `--cors` 参数，意味着它不会返回 `Access-Control-Allow-Origin: app://obsidian.md`。浏览器的 `fetch` 会因此拒绝请求。Node.js 的 `http` 模块运行在插件主线程，**不受浏览器 CORS 策略约束**，可以直接发 HTTP 请求。

### 2. 健康检查只认 `/global/health`

健康检查请求 `ServerEndpoint.healthUrl`，只接受 HTTP 200、JSON body、`healthy === true`。HTML 200、端口可连接、opaque response 都不能证明这是可用的 opencode server。

### 3. 本地 HTTP 代理 —— CSP 剥离 + 脚本注入

opencode 的 HTML 响应携带严格的 Content-Security-Policy，禁止内联脚本执行。代理在转发前剥离 CSP 头，从而可以注入自定义脚本：

- **键盘监听**: 拦截 `Cmd+L`（macOS）/ `Ctrl+L`（Windows/Linux），发送 `postMessage` 到 Obsidian 父窗口
- **自动端口检测**: 从 4097 开始递增尝试，找到第一个可用端口
- **协议来源**: `BridgeProtocol.ts` 是 message namespace、version、type 的唯一来源；父窗口只接受来自当前 proxy origin 的协议消息

### 4. `postMessage` 桥接

iframe 与 Obsidian 插件之间通过 `window.postMessage` 通信：

- `{ns:'another-opencode-for-obsidian', version:1, type:'view:toggle'}`: iframe 通知父窗口切换视图
- `{ns:'another-opencode-for-obsidian', version:1, type:'proxy:loaded'}`: 代理注入的脚本初始化完成，通知父窗口可以开始通信
- `{ns:'another-opencode-for-obsidian', version:1, type:'vault-file:open', payload:{path}}`: iframe 通知父窗口用户点击了一个文件路径；父窗口必须先用 Obsidian/GraphIndex 解析到已有 `TFile`，再 `WorkspaceLeaf.openFile()`
- 父窗口通过 `window.addEventListener('message', ...)` 监听

### 5. Bridge 开发纪律

新增 OpenCode API、hook、event、permission、question、tui 或 Obsidian workspace 消费时，先写实际消费代码，再跑：

```bash
bun run dev:bridge --opencode ~/Projects/ai-cli/opencode
```

harness 会从消费代码中抽取 path、method、body key、workspace event，再对本地金标准。不要新增手写能力清单。以后可以加表驱动策略，但表只能表达“本项目如何组合两边能力”，不能复制上游协议事实。

### 6. 三段式切换逻辑

```
当前状态                         →  操作
─────────────────────────────────────────────────
侧边栏展开 + opencode 活跃      →  折叠侧边栏
侧边栏展开 + 其他 leaf 活跃     →  切换到 opencode leaf
侧边栏折叠                      →  展开侧边栏 + focus iframe
```

这确保了快捷键的直觉行为：按一次展开，再按一次折叠，不会出现「展开了但需要再多按一下才能切到 opencode」的情况。

### 7. 焦点恢复

在聚焦 opencode iframe 前保存 `previousEditorLeaf`（当前活跃的编辑器 leaf）。用户通过 toggle 折叠侧边栏时，自动恢复到该 leaf，让用户可以无缝回到编辑状态。

### 8. 会话持久化

- 创建新会话时将 URL 保存到 `lastSessionUrl`（持久化在插件 data.json 中）
- 插件启动时先尝试恢复 `lastSessionUrl`
- 同时查询服务器 `/session`，比较时间戳，如果有更新的会话则优先使用
- `lastSessionUrl`、OpenCode leaf iframe URL 和 session id 解析通过 `CurrentContextSession` 收口；`ContextManager` 和 `ViewManager` 不各自实现“当前 session 是谁”的流程

### 9. Harness 与运行时真相源

- 插件写 XDG log 和 `status.json`
- harness 只读这些文件和 vault 插件目录，不通过 `obsidian eval` 获取常规状态
- `obsidian eval` 只能作为最后取证手段，不能写进默认调试流程
- 本机默认 vault 是 `~/obsidian`，也可用 `ANOTHER_OPENCODE_FOR_OBSIDIAN_VAULT` 或 `--vault` 覆盖；harness 会展开 `~`
- 错误 UI 先显示 `getDiagnostics()` 的错误、hint、命令、stderr、log/status 路径；harness 和 issue template 只搬运同一份证据，不能成为用户发现根因的前置要求
- 命令面板里的 `Copy OpenCode diagnostics` 和错误页里的 `Copy diagnostics` 必须复用 `formatServerDiagnosticsForClipboard()`，不要在 UI 里重新拼一份诊断结构
- `ServerManager.getDiagnostics()` 是启动环境证据的唯一入口：必须显示 Obsidian 进程看到的 PATH、PATH entries、env key 摘要、最近一次 spawn 环境、resolved executable、shell flag 和 cwd。不要在 harness、UI 或 issue template 里重新探测一套环境事实。

### 10. Custom Command 契约

- `CUSTOM_COMMAND_EXAMPLE` 只用于设置页 placeholder 和测试示例
- 空 `customCommand` 表示 path 模式：解析 `opencodePath`，直接 spawn `opencode serve --hostname ... --port ... --cors app://obsidian.md`
- 非空模板表示 custom 模式：通过 shell 执行，必须包含 `{hostname}` 和 `{port}`
- `{cors}` 和 `{projectDirectory}` 是可选变量
- macOS GUI 启动的 Obsidian 可能拿不到交互式 shell 的 PATH。custom 模式使用绝对路径或开头 `~` 的路径；path 模式由 `ExecutableResolver` 处理常见安装位置
- 产品默认不能自动 source `.zshrc`、`.bashrc`、`.profile`、PowerShell profile 或用户的 XDG shell 片段。这些文件可能有交互输出、prompt 初始化和版本管理器副作用。需要 shell 语义时只能由用户显式写 custom command；需要稳定补 PATH 时后续应做显式 `pathEntries` / `environment` 配置。
- 启动失败后不要在运行时自动从 path 模式切到 custom command，或从 custom command 切回 path 模式。失败时保留当前策略的命令、PATH、stderr、health error 和 hint，让用户选择下一种配置策略。

## 编码规范

| 类型                | 规范                           | 示例                                     |
| ------------------- | ------------------------------ | ---------------------------------------- |
| Classes             | PascalCase                     | `OpenCodePlugin`, `ServerManager`        |
| Interfaces/Types    | PascalCase                     | `OpenCodeSettings`, `ProcessState`       |
| Constants           | UPPER_CASE 或 camelCase        | `DEFAULT_SETTINGS`, `OPENCODE_VIEW_TYPE` |
| Variables/functions | camelCase                      | `getVaultPath`, `startServer`            |
| Private members     | camelCase（无前缀）            | `private processManager`                 |
| Files               | PascalCase（类）、小写（入口） | `ServerManager.ts`, `main.ts`            |

### TypeScript 模式

- `strictNullChecks` 启用——显式处理 null/undefined
- Union types 表示状态: `"stopped" | "starting" | "running" | "error"`
- `async/await` 优于 Promise 链
- 公共方法显式声明返回类型
- Node.js 内置模块用 `const http = require("http")` 内联引入（不用 `import`），因为 esbuild 将它们标记为 external

### Obsidian API 模式

```typescript
// 注册视图
this.registerView(OPENCODE_VIEW_TYPE, (leaf) => new OpenCodeView(leaf, this));
// 注册命令
this.addCommand({ id: "toggle-view", name: "Toggle panel", callback: () => this.toggleView() });
// 注册设置
this.addSettingTab(new SettingsTab(this.app, this));
```

### DOM 创建

```typescript
const container = this.contentEl.createDiv({ cls: "opencode-container" });
container.createEl("h3", { text: "Title" });
container.createEl("button", { text: "Click", cls: "mod-cta" });
```

### 状态管理

- 基于回调的订阅模式
- 状态集中在 Manager 类中
- 状态变更时立即通知订阅者
- 不在 View 中存储业务状态

## 部署

### 本地安装

```bash
# 1. 构建
bun run build

# 2. 以 symlink 方式安装到 vault
bun run harness install --vault ~/obsidian

# 3. 在 Obsidian 中启用插件
```

### GitHub Release

```bash
# 创建 release 并附加构建产物
gh release create v1.x.x main.js manifest.json styles.css \
  --title "v1.x.x" \
  --notes "发布说明"
```

## 测试与调试

```bash
# 查看 harness 命令
bun run harness

# 查看插件安装、配置、XDG status、最近日志
bun run harness status --vault ~/obsidian

# 查看 XDG 日志
bun run harness logs --lines 120

# 构建 + opencode 可执行文件 + runtime health 检查
bun run harness doctor --vault ~/obsidian

# 真实 Obsidian 插件里的主题注入和 iframe diagnostics 检查
bun run harness theme --vault ~/obsidian
```

`obsidian eval` 会读 Obsidian 内部对象，只在 XDG 日志和 status 文件不足以定位问题时使用。默认先看 `$XDG_STATE_HOME/another-opencode-for-obsidian/status.json` 和 `$XDG_STATE_HOME/another-opencode-for-obsidian/another-opencode-for-obsidian.log`。
Obsidian 命令面板中的 `Copy OpenCode diagnostics` 会复制同一份 server diagnostics，适合直接贴到 issue 或后续 agent 对话里。

## 分支策略

本仓库按自维护项目处理。先保证本地架构正确、可观测、可维护，再考虑上游兼容。不要为了兼容旧数据或旧上游行为引入补偿分支。

## 已知限制与后续工作

- **上下文面板仍需增强**: StatusBar 浮层只承担显示、复制 diagnostics 和安全导航。后续要补的是更强的手动选择入口、显式 remove / candidate exclude 控制，以及把 note/folder/search result 等候选来源统一接入现有 `ContextItem` 生命周期。
- **未使用的 opencode API**: `file.read`、`find.*`、`tui.*`、`event.subscribe`、`session.fork/diff/todo` 等 API 尚未集成，这些都是可增强双向交互的接口。
- **代理端口不可见**: 设置面板不显示代理端口（自动检测，目前工作正常但不够透明）。
- **代理扩展潜力**: 当前代理基础设施可以支持 Obsidian 与 opencode 之间的双向文件同步，但尚未实现。
- **仅限桌面端**: 使用 `child_process.spawn()` 等 Node.js API，不支持 Obsidian Mobile。

## esbuild 配置要点

```typescript
// esbuild.config.mjs 关键配置
{
  format: "cjs",
  target: "es2018",
  platform: "node",
  external: ["obsidian", "electron", "@codemirror/*", "child_process", "http", "net", "fs", "path", "os"],
  bundle: true,
  outfile: "main.js",
}
```

- `obsidian` 和 `electron` 标记为 external——由 Obsidian 运行时提供
- Node.js 内置模块（`http`、`child_process` 等）标记为 external——插件运行在 Node.js 环境
- 代码中使用 `require("http")` 而非 `import http from "http"`，因为 esbuild 不会转换 external 模块的 import 语句

<!-- bv-agent-instructions-v2 -->


## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for graph-aware triage. Issues are stored in `.beads/` and tracked in git.

### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects (.beads/beads.jsonl). Instead of parsing JSONL or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles _what to work on_ (triage, priority, planning). `br` handles creating, modifying, and closing beads.

**CRITICAL: Use ONLY --robot-\* flags. Bare bv launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:

- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

# Token-optimized output (TOON) for lower LLM context usage:
bv --robot-triage --format toon
```

#### Other bv Commands

| Command                                             | Returns                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--robot-plan`                                      | Parallel execution tracks with unblocks lists                                         |
| `--robot-priority`                                  | Priority misalignment detection with confidence                                       |
| `--robot-insights`                                  | Full metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles, k-core |
| `--robot-alerts`                                    | Stale issues, blocking cascades, priority mismatches                                  |
| `--robot-suggest`                                   | Hygiene: duplicates, missing deps, label suggestions, cycle breaks                    |
| `--robot-diff --diff-since <ref>`                   | Changes since ref: new/closed/modified issues                                         |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export                                                               |

#### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
```

### br Commands for Issue Management

```bash
br ready              # Show issues ready to work (no blockers)
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br create --title="..." --type=task --priority=2
br update <id> --status=in_progress
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once
br sync --flush-only  # Export DB to JSONL
```

### Workflow Pattern

1. **Triage**: Run `bv --robot-triage` to find the highest-impact actionable work
2. **Claim**: Use `br update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `br close <id>`
5. **Sync**: Always run `br sync --flush-only` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies

