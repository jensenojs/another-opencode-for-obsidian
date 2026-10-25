# AGENTS.md - Another OpenCode for Obsidian

AI 编码代理在 Another OpenCode for Obsidian 插件上工作的指南。

## 项目概述

这个插件把 OpenCode 接进 Obsidian。当前主目标已经收敛为：让 OpenCode 在
Obsidian 里可日常使用，同时保留 OpenCode 自己的 Web UI。

插件不拥有 OpenCode 进程。它读取 opencode 自己的运行时注册
（`~/.local/state/opencode/service*.json`），attach 到已在运行的服务，通过本地代理把
Web UI 嵌进 Obsidian，并在 prompt 发送边界把 Obsidian 上下文作为文件附件交给 OpenCode。
找不到服务时插件只显示状态和用户动作；它不启动、不重启、不终止任何进程。

当前产品边界：

1. OpenCode in Obsidian usability：服务发现与 attach、侧边栏视图、主编辑区 deep view、
   Obsidian 外观适配、status bar。
2. Safe vault navigation：context source 和 OpenCode iframe 里的 vault path 只能跳到已有
   vault 内容，不能通过 Obsidian link 语义创建文件。
3. Context attachments：Obsidian 上下文只有一个载体——prompt body 的 `files` 附件。候选由
   `CandidateRegistry` 管理，发送时转成 `data:` 附件。
4. GraphIndex：消费 Obsidian Vault + MetadataCache，提供 vault link graph 的事实 read
   model，供导航和以后可能的 graph 实验使用。
5. OpenCode event bridge：上游稳定 event surface 是 `GET /api/event`（SSE）。当前只接
   read-only session diagnostics，并把流结束当作服务死亡的权威信号。

GraphRAG 是可能的个人探索方向，不是当前产品主线。除非用户明确要求，不要主动把
GraphRAG 排进实现计划。任何 graph-derived source 都必须消费 GraphIndex facts，不能替代
Obsidian resolver，也不能绕过 CandidateRegistry。

产品与结构文档：

- [docs/explorations/another-opencode-for-obsidian-product-positioning.md](docs/explorations/another-opencode-for-obsidian-product-positioning.md)
- [docs/explorations/graphrag-known-to-unknown.md](docs/explorations/graphrag-known-to-unknown.md)
- [docs/plans/v2-attach-spec.md](docs/plans/v2-attach-spec.md)（当前结构的规范文档）

**技术栈:** TypeScript · Obsidian Plugin API · esbuild · Node.js `http` / `fs` / `os` /
`path`（桌面端 Electron 进程内；进程生命周期归 opencode 自己）

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
├── main.ts                     # 插件入口：attach 装配、命令、status.json
├── types.ts                    # Settings 接口、context 类型、常量
├── i18n.ts                     # EN / ZH 文案
├── icons.ts                    # SVG 图标注册
├── server/
│   ├── ServiceDiscovery.ts     # state 文件发现 + /api/info 探活 + attach
│   └── types.ts                # ServiceState / ServiceStatus
├── client/
│   ├── OpenCodeClient.ts       # v2 HTTP 客户端（只打 /api/*，{data} envelope）
│   ├── OpenCodeEventSource.ts  # /api/event SSE，按 location.directory 过滤
│   └── ServerAuth.ts           # Basic auth header
├── bridge/
│   ├── OpenCodeWebUiProxy.ts   # 本地 Web UI HTTP 代理 + prompt request hook
│   ├── ProxyInjection.ts       # HTML head 注入：外观 token、bridge 脚本、theme payload
│   ├── BridgeInjection.ts      # iframe 内 vault 文件点击与 proxy 就绪脚本
│   ├── BridgeProtocol.ts       # iframe <-> Obsidian 本地消息协议
│   └── OpenCodeBridge.ts       # event source 生命周期
├── context/
│   ├── ContextManager.ts       # Obsidian 事件 -> candidate 编排
│   ├── CandidateRegistry.ts    # candidate 状态：include、clear-source、one-shot 消费
│   ├── PromptAttachments.ts    # candidate -> PromptFileAttachment
│   ├── PromptContextInjector.ts# 发送边界把附件写进 prompt body.files
│   ├── ContextStatusBar.ts     # 候选控制面 + 上次投递摘要
│   ├── ContextItemNavigator.ts # context source 安全打开入口
│   ├── ContextSessionResolver.ts # 当前 OpenCode session id 的唯一解析入口
│   ├── ContextAutoSources.ts   # 自动来源编排
│   ├── AutoSelectionContextSource.ts # 选区策略
│   ├── ContextSourceDriver.ts  # source result / candidate input 类型
│   ├── ContextFormatter.ts     # workspace / selection 文本格式化
│   ├── SelectionLineRange.ts   # 选区行号
│   └── WorkspaceContext.ts     # 打开的笔记路径 + 活动位置
├── graph/
│   ├── GraphIndex.ts           # Obsidian link graph 内存索引
│   └── ObsidianGraphIndex.ts   # Vault + MetadataCache 适配
├── debug/
│   ├── RuntimeDiagnostics.ts   # XDG 日志、status.json
│   └── ServiceDiagnosticsText.ts # 诊断复制文本
├── settings/SettingsTab.ts     # 插件设置 UI
├── theme/WebViewTheme.ts       # Obsidian -> OpenCode 外观 token
└── ui/
    ├── OpenCodeView.ts         # ItemView：iframe + attached/unavailable 两态
    └── ViewManager.ts          # 切换逻辑、焦点管理、会话 URL
scripts/
└── harness.ts                  # dev harness：安装、状态、日志、doctor、bridge/theme 检查
```

## 模块职责

### `main.ts` — 插件生命周期

- `onload()`：读设置 → `new OpenCodeWebUiProxy("127.0.0.1", 0)` 并把 auth provider 指向当前
  attached handle → `proxy.start()` → `attachService()` → 构造 client / bridge /
  ContextManager / 导航 / status bar / ViewManager / 设置页 → 注册命令 → 已 attached 则
  `handleServiceAttached()`，否则 `startAttachRetry()`。
- `attachService()`：`defaultServiceDir()` + `settings.serviceName` → `attachService()`。成功时用
  `new URL(handle.url)` 更新 proxy target 并写入 `ServiceStatus{state:"attached"}`；失败时写入
  `{state:"unavailable", reason}`，reason 由候选文件列表拼出。
- `applyServiceStatus()` 是服务状态的唯一写入口：同步 `OpenCodeBridge.syncServiceState`、
  通知订阅者、`refreshClientState()`、`writeStatus()`。attached 时停止重试，unavailable 时启动
  10s 重试定时器。
- `handleServiceAttached()`：`initializeProject()` 探活式确认，然后交给
  `ContextManager.handleServiceAttached()`。服务从缺失恢复时由重试定时器接上，无需重启 Obsidian。
- `onEventSnapshot()`：SSE 状态为 `disconnected` 且当前 attached 时，把状态切回 unavailable，
  reason 为 `OpenCode event stream ended`，由同一重试定时器接管。
- 命令：`toggle-opencode-view`、`toggle-opencode-deep-view`、`open-opencode-view`、
  `copy-opencode-diagnostics`、`add-selection-to-context`、`add-current-note-to-context`。
  没有启动或停止服务的命令。
- `onunload()`：写 status、停止 bridge、`proxy.stop()`、销毁 status bar 与 ContextManager、
  `stopAttachRetry()`、detach leaves。不终止任何 opencode 进程。

### `server/ServiceDiscovery.ts` — 服务发现与 attach

- 唯一服务来源是 opencode 自己的运行时注册：`defaultServiceDir()` =
  `$XDG_STATE_HOME`（缺省 `~/.local/state`）+ `opencode`。
- `discoverServices(dir)` 只读目录，不验活；`readdir` 失败返回空数组。候选按
  `service.json` 优先、其余文件名字典序排列，非 `service*.json` 的文件忽略。
- `attachService({dir, prefer})` 依次对可读候选发 `GET <url>/api/info`（Basic auth，
  2s 超时，响应必须是 JSON 且带 `version: string` 与有限 `pid: number`），首个成功者返回
  `ServiceHandle{name,url,password,version,pid}`；全部失败返回 `null`。
- `prefer` 是严格匹配：指名某个文件时只连它，不存在或验活失败就返回 `null`，不会静默换连
  另一个服务。静默回落会让用户以为在用一个二进制，实际连到另一个。
- `summarizeService()` 是 password 的模块边界；诊断、status.json、UI 只用 summary。

### `client/OpenCodeClient.ts` — API 客户端

- 只打 `/api/*`，一次请求一种形状。成功判定是 HTTP 2xx + body 能经
  `parseApiEnvelope()` 解出 `{data: ...}`；其余一律失败并记日志。没有裸路径回落：v1 路径在
  2.1.3 上返回 200 + SPA HTML。
- 用 Node.js `http.request` 而不是 `fetch`：opencode 服务不返回
  `Access-Control-Allow-Origin: app://obsidian.md`，浏览器 fetch 会被 CORS 拒绝。
- 方法：`initializeProject()`（`GET /api/session?directory=&limit=1`）、
  `createSession()`（`POST /api/session`，body `{title, location:{directory}}`）、
  `getLatestSessionId()`（同 GET + `order=desc`）、`getSessionUrl()`、`resolveSessionId()`、
  `updateBaseUrl()`。
- 目录只走 query 参数 `directory=`，不放在请求头里。`POST /api/session` 忽略 query 与 header，
  目录必须写在 body 的 `location.directory`。
- 不读写 session message：上下文载体是 prompt 的 `files` 附件，不是独立 context message。

### `client/OpenCodeEventSource.ts` — event 源

- `GET /api/event`，`Accept: text/event-stream`。`buildEventEndpoint()` 不附加查询参数；
  upstream 不接受过滤参数。
- 帧形如 `data: {"id","type","data","created","location":{"directory"}}`。只有
  `payload.location.directory === projectDirectory` 的帧才计入 snapshot；目录过滤是客户端职责。
- 响应流进入终态时按状态归类：结束时 `disconnected`，读错误/非 2xx/content-type 不匹配时 `failed`，
  404 时 `unsupported`。三者都是「服务不可用」的证据，由 `describeEventLoss()` 交成诊断句给 main。
- `start()` 的语义是「幂等地把流连在当前目标上」：已有 request 且 endpoint 未变则不动，endpoint
  变了（attach 到了另一个服务）就销毁旧 request 并对新 endpoint 建连。旧 request 的回调按
  `this.request === request` 判身份，陈旧回调不许改 snapshot 或清槽位。

### `bridge/OpenCodeBridge.ts` — event bridge 生命周期

- `syncServiceState(state)`：attached 时 `eventSource.start()`，其余状态 `stop()`。
- `updateOpenCodeLocation(apiBaseUrl, projectDirectory)` 在 attach 后同步连接参数。
- event snapshot 由 main 写入 `runtimeDiagnostics.opencodeEvents`。

### `bridge/OpenCodeWebUiProxy.ts` — 本地 Web UI HTTP 代理

- 启动本地代理（端口从 4097 起，最多尝试 10 个），转发请求到当前 attach 的服务，并在转发时
  补 `authorization`（password 来自 ServiceHandle）。
- HTML 响应剥离 `Content-Security-Policy` 后交给 `ProxyInjection` 注入；JS/CSS asset 原样
  直通，不解析、不改写。
- `getV2ServerUrl()` 返回 `http://127.0.0.1:<proxyPort>/server/<base64(origin)>`，是 OpenCode
  v2 Web UI 的深链形态；`getProxyUrl(encodedPath)` 用于普通路径。
- prompt 请求 hook：只匹配 `POST /api/session/<id>/prompt`（`extractPromptSessionId()`），
  把 Obsidian 上下文附件交给 `PromptContextInjector`。

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

### `bridge/ProxyInjection.ts` / `bridge/BridgeInjection.ts` / `bridge/BridgeProtocol.ts`

- `ProxyInjection.injectOpenCodeWebUiProxyHtml()` 负责 HTML head 注入：外观 token、bridge
  脚本、首帧 theme payload。它只动 head 与已知 HTML 结构，不改 JS bundle。
- `BridgeInjection` 只承接 OpenCode Web UI DOM 才能观察的事实：vault 文件路径点击、proxy 就绪。
  它不解析 wikilink，不判断文件是否存在，不拥有 context 策略。
- `BridgeProtocol` 定义本项目 iframe 本地消息，当前只有 4 条：`proxy:loaded`、
  `theme:diagnostics`、`theme:update`、`vault-file:open`。不要加入上游 event name 或
  已删除机制的占位消息。

### `OpenCodeView.ts` — 侧边栏视图

- `ItemView` 子类，使用 iframe 加载 OpenCode Web UI。
- 两态渲染：`attached` 建 iframe 并同步主题；`unavailable` 显示未发现服务的原因、
  `opencode service start` 指令、log 路径，以及 retry / open settings / copy diagnostics 三个按钮。
- `syncThemeToIframe()` 只推送当前 `WebViewTheme`，不附加父窗口 geometry。`window-resize`、
  iframe load、`proxy:loaded`、theme source mutation 和 layout resize 只表示「重新读取当前
  Obsidian 变量并推给 iframe」。
- 点击或聚焦 iframe 时只允许同步 Obsidian workspace active leaf 到 OpenCode leaf。不要在 iframe
  focus/pointer 事件里刷新 context 或触发 OpenCode message。
- 监听 `window` 的 `message` 事件：`proxy:loaded`（重新同步主题）、`theme:diagnostics`
  （写入 runtime diagnostics）、`vault-file:open`（交给 `ContextItemNavigator`，解析失败静默记录，
  不弹 Notice，不创建文件）。

### `ViewManager.ts` — 视图切换逻辑

- **三段式切换**:
  1. 侧边栏已展开 且 opencode 活跃 → 折叠侧边栏
  2. 侧边栏已展开 但其他 leaf 活跃 → 切换到 opencode leaf
  3. 侧边栏已折叠 → 展开侧边栏 + 聚焦 opencode iframe
- deep view 使用 `toggle-opencode-deep-view`，默认快捷键 `Mod+Shift+L`。它把 OpenCode
  放到主编辑区；再次触发时返回进入 deep view 前的编辑/content leaf。
- `previousEditorLeaf`: 聚焦 opencode 前保存编辑器的 leaf，折叠时恢复焦点到编辑器
- `lastSessionUrl`: 保存会话 URL 到插件设置，重启时恢复；同时通过时间戳比较查询服务器最新会话
- `toggle-opencode-view` 保留给用户快捷键；harness 和调试脚本使用 `open-opencode-view`，它只调用 `activateView()`，不会因为当前 leaf 已经活跃而折叠右侧栏

### `ContextManager.ts` — 候选编排

- 监听 Obsidian workspace 事件（active-leaf-change、editor-change、layout-change），防抖后刷新
  workspace candidate；editor-change 也把选中文本交给 selection source。
- `CandidateRegistry` 是候选的唯一模型。`ContextManager` 透传
  `getCandidates/onCandidatesChanged/toggleCandidate/setCandidateIncluded/removeCandidate`，
  自身不维护第二套队列。
- `contextAssist.enabled` 是总开关；关闭时必须清空全部 candidate 并停止 source 监听。关闭任一
  source 时清掉该 source 已有候选。
- workspace candidate 只包含打开笔记列表和可选活动位置；selection source 产 one-shot candidate。
  不维护 backlinks source，不监听 resolvedLinks。
- `includeSelection(selection)` 和 `includeNote({path, text})` 是两条显式命令的入口，产出同一形状的
  candidate（`sourceKind` 分别是 `selection` / `manual`，后者 one-shot）。显式命令不受自动采集
  开关影响，但复用同一 fingerprint / 截断逻辑。
- `preparePromptContext(sessionId, requestBody)` 先绑定 session，再交给
  `PromptContextInjector`；`completePromptContext` / `failPromptContext` 表示转发结果。
- 候选只在本地存活，没有服务端 message 生命周期，也没有 restore 路径。session 切换时清空候选，
  不把旧 session 的 candidate 带到新 session。
- source driver 输出必须表达 `upsert`、`remove`、`clear-source`、`failed`。

### `PromptAttachments.ts` — candidate 到 prompt 附件

- `buildPromptAttachments(candidates)` 是唯一转换出口，产出
  `{uri: "data:text/plain;base64,<utf8 base64>", name: "obsidian-context:<sourceKind>:<label>"}`。
- body 保留人能读的来源：`Obsidian context: <label>` / `Source: <sourceFile>[:Lx-Ly]` / 正文。
- `name` 只做标识，不承担范围信息；范围已经在 label 与 body 的 `Source:` 行里。

### `PromptContextInjector.ts` — prompt body 附件

- `prepare(sessionId, requestBody)` 在发送边界读取 included candidates，把附件追加到
  `body.files`（已有 `files` 保留）。它不看 `parts`，也不因为缺 `parts` 记失败。
- 只有 skipped dynamic candidate、没有 included candidate 时不动 body，不写空 `files: []`。
- 请求成功转发后 `complete(planId)`：先记录 `PromptDelivery{at,count,labels}`，再消费 one-shot
  candidate、恢复临时跳过的 dynamic candidate。
- 失败时 `fail(planId, reason)` 标记候选 failed，保留候选供重试。

### Obsidian resolution contract

- Obsidian 已提供解析能力时，本项目优先消费 Obsidian API，不手写第二套 wikilink、heading、block、footnote resolver。
- GraphIndex 是 Obsidian Vault + MetadataCache 的事实层。GraphRAG 只是它之上的可选派生层，只能消费 GraphIndex facts，不能替代 Obsidian resolver。
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
- missing path、folder、URL、聚合来源、unresolved heading/block subpath 都返回明确 unresolved reason
- 当前代码已通过 GraphIndex-backed resolution 解析 linkpath 和 heading/block/footnote subpath；生产入口仍保持单一
- 合法引用点击应打开已有目标 file/heading/block/footnote；非法引用点击应打开写出该坏引用的已有 source Markdown occurrence。永远不要尝试打开或创建 missing target。

### `ContextStatusBar.ts` — 轻量候选控制面

- 状态栏显示 included/total 计数；popover 只渲染候选：label、source、included/skipped pill、
  failed pill、navigation pill、one-shot 的 remove 按钮。
- 单击做 evidence navigation（合法引用跳目标，非法引用跳写出坏引用的 source occurrence），
  双击切换 included/excluded，Enter/Space 打开。
- 顶部额外显示 `getLastPromptDelivery()` 的摘要：上一次 prompt 带了几个上下文附件。它只是事实
  展示，不代表服务端消息状态。
- `formatContextDiagnostics(candidates, resolveCandidate?)` 只输出候选摘要，不包含正文。
- 它不解析 wikilink、不消费 MetadataCache、不维护 GraphIndex、不直接调用 OpenCode API。

### `GraphIndex.ts` — Obsidian link graph 机制层

- GraphIndex 是内存 read model，唯一真相源是 Obsidian Vault + MetadataCache
- Graph path 使用 vault-relative `TFile.path`；vault root/name 只能作为 diagnostics/cache identity 单独携带
- Obsidian cache position 保持 0-based；UI 层负责转成 1-based display
- GraphIndex 可以从 mock Vault/MetadataCache bootstrap，并通过 changed/resolve/deleted/renamed/created 维护 snapshot
- Query API 返回事实：node、incoming/outgoing、references、unresolved、heading/block、≤3 hop neighborhood、orphan、degree、cross-root coverage
- GraphIndex 不返回 recommendation、score、shouldAddToContext，不写 vault，不读 note body
- GraphIndex 后续必须保留 reference occurrence：sourcePath、raw link/embed、linkpath、source position、target resolution、subpath resolution。broken link 是可维护的 Markdown evidence，surface 点击时应回到 source occurrence。
- 参考文档：[docs/plans/graph-index.md](docs/plans/graph-index.md)

### `ContextAutoSources.ts` / `AutoSelectionContextSource.ts`

- `ContextManager` 是唯一 Obsidian 事件监听入口；`ContextAutoSources` 是这些事件进入自动源策略前
  的唯一编排入口，只组合 `AutoSelectionContextSource`。
- 选区 source 只处理策略：开关、fingerprint 去重、长度截断、产出 one-shot candidate。
  `buildSelectionCandidate()` 是它对外唯一的候选构造入口，显式命令也复用它。
- 不 import Obsidian、不调用 OpenCodeClient、不持有候选队列。registry 负责 bounded queue。

### `ContextSessionResolver.ts` — 当前 session 解析

- `CurrentContextSession` 是当前 OpenCode session id 的唯一解析入口
- 输入只有 cached iframe URL、OpenCode leaf iframe URL 和 `OpenCodeClient.resolveSessionId`
- 输出只有 session id，并在 leaf URL 可解析时更新 cached iframe URL
- 它不知道 registry、auto source、workspace event、permission/question/event/tui 策略
- 新增 context panel、permission、question、event、tui 或 hooks 相关代码时，先消费这个入口，不要在策略层重新解析 iframe URL

### OpenCode event source contract

- 事件源合同见 [docs/plans/opencode-event-source-contract.md](docs/plans/opencode-event-source-contract.md)（历史记录，顶部有 superseded 说明）。
- 只使用 `GET /api/event`。它携带 `location.directory`，目录过滤在客户端完成；没有 legacy
  `/event` 回落路径。
- 产品层的 `src/bridge` 是 Obsidian 与 OpenCode 的互联互通代码边界，必须基于两边的金标准：
  OpenCode OpenAPI/source contract 和 Obsidian API/runtime facts。
- `OpenCodeWebUiProxy.ts` 只负责 Web UI transport 和 HTML 注入。它可以透传 SSE 字节，但不能
  解析 OpenCode event 并维护插件状态。
- 当前只做 connected/disconnected/failed/unsupported、last event、current-session read-only
  state diagnostics。

### `WorkspaceContext.ts` — 上下文收集

- 获取当前打开的笔记文件路径列表
- 获取当前活动位置，转换为给模型看的 1-based 行号
- 不读取正文，不收集选中文本。选中文本属于 selection source

### `SettingsTab.ts` — 设置面板

- 四组：`serviceConfiguration`（`serviceName` + `projectDirectory`）、behavior
  （`defaultViewLocation` + `webViewAppearance`）、contextAssist（workspace / selection 开关与上限）、
  `serviceStatus`（只读：attached 显示 name / url / version / pid，unavailable 显示原因与
  `opencode service start`，无启停按钮）。
- `serviceName` 是 `service*.json` 文件名或 `auto`；`auto` 表示按 `service.json` 优先、其余
  文件名字典序尝试。
- `projectDirectory` 校验绝对路径 / `~` / `C:\` 前缀、存在性、目录性；它只影响插件请求里的
  `directory` 参数，不改变服务注册。

### `RuntimeDiagnostics.ts` / `ServiceDiagnosticsText.ts` — 运行时观测

- 唯一运行时文件位置由 `getRuntimePaths()` 决定：`$XDG_STATE_HOME`（缺省 `~/.local/state`）下
  `another-opencode-for-obsidian/another-opencode-for-obsidian.log` 与 `status.json`。
  依据: [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/)
- `status.json` 只写事实：`lifecycle`、`serviceState`、`service{name,url,version,pid}`、
  `serviceError`、`proxyUrl`、`proxyPort`、`projectDirectory`、`webViewAppearance`、
  `runtimeDiagnostics{theme,iframe,opencodeEvents}`、`logFile`、`statusFile`。
- password 永远不进入日志、status.json、错误消息或测试快照。`RuntimeLogger` 按 key 名脱敏
  （token/secret/password/authorization/cookie）。
- `formatServiceDiagnosticsForClipboard()` 是「Copy OpenCode diagnostics」的唯一文本来源。

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

- 一阶真相源只读本地依赖，不联网、不静默重试、不维护手写能力清单。
- OpenCode HTTP 以本地 checkout 的 `packages/protocol/openapi.json` 为准；旧位置
  `packages/sdk/openapi.json` 只作为回退。
- Obsidian workspace events 以 `node_modules/obsidian/obsidian.d.ts` 为准。
- `BridgeProtocol.ts` 自己声明消息集合，harness 断言注入脚本实际发送的消息与它一致。
- 插件不消费 OpenCode plugin hooks，因此 harness 不检查 hooks 契约。

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

### 1. attach-only，不拥有进程

插件读取 opencode 自己的运行时注册并 attach。它不启动、不终止、不轮询进程，也没有启停命令。
找不到服务时唯一正确动作是显示「未发现服务」和用户要跑的命令（`opencode service start`），
然后由 10s 重试定时器在服务出现后自动接上。

### 2. `/api/info` 是 liveness 的唯一判据

服务是否可用由 `GET /api/info` 决定：2s 超时、HTTP 200、JSON body 带 `version` 与 `pid`。
端口可连接、HTML 200、空响应都不能证明这是可用的 opencode 服务。

### 3. 服务死亡由 SSE 断连表达

attach 之后不轮询。`/api/event` 的连接进入任一终态——响应流结束、读错误（进程被杀时的
`read ECONNRESET`）、或路由不可用——都代表服务端已经不可用，main 立刻把状态切成 unavailable，
再由重试定时器接管。判据只有一处：`bridge/OpenCodeBridge.ts` 的 `describeEventLoss(snapshot)`
把 snapshot 状态映射成诊断句，main 见到非 null 就降级，不在调用点重写条件。漏掉 `failed`
会让进程被杀后的插件一直显示 attached、事件流已死却永不重试。

### 4. v2 单协议，无回落

所有 HTTP 都走 `/api/*`，成功形状只有 `{data}` envelope。v1 路径在 opencode 2.1.3 上返回
200 + SPA HTML；任何「失败就换裸路径再试一次」的写法都会把 HTML 当 JSON 解析，把真实失败藏成
解析错误。

### 5. 本地 HTTP 代理 —— CSP 剥离 + head 注入

opencode 的 HTML 响应携带严格的 Content-Security-Policy，禁止内联脚本执行。代理在转发前剥离 CSP
头，把 HTML 交给 `ProxyInjection` 注入外观 token、bridge 脚本和首帧 theme payload。JS/CSS asset
原样直通；改写上游 bundle 需要跟随每个版本的内部锚点，这条兼容层会持续吞掉维护预算。

### 6. `postMessage` 桥接

iframe 与 Obsidian 插件通过 `window.postMessage` 通信。消息集合由 `BridgeProtocol.ts` 唯一定义：
`proxy:loaded`（注入脚本就绪）、`theme:diagnostics`（iframe 内外观采样）、`theme:update`
（父窗口推主题）、`vault-file:open`（用户点了 vault 路径，父窗口必须解析到已有 `TFile` 再打开）。
父窗口只接受来自当前 proxy origin 的协议消息。

### 7. 三段式切换逻辑

```
当前状态                         →  操作
─────────────────────────────────────────────────
侧边栏展开 + opencode 活跃      →  折叠侧边栏
侧边栏展开 + 其他 leaf 活跃     →  切换到 opencode leaf
侧边栏折叠                      →  展开侧边栏 + focus iframe
```

这确保了快捷键的直觉行为：按一次展开，再按一次折叠，不会出现「展开了但需要再多按一下才能切到 opencode」的情况。

### 8. 焦点恢复

在聚焦 opencode iframe 前保存 `previousEditorLeaf`（当前活跃的编辑器 leaf）。用户通过 toggle 折叠侧边栏时，自动恢复到该 leaf，让用户可以无缝回到编辑状态。

### 9. 会话持久化

- 创建新会话时将 URL 保存到 `lastSessionUrl`（持久化在插件 data.json 中）
- 插件启动时先尝试恢复 `lastSessionUrl`
- 同时查询最新会话（`order=desc&limit=1`），有更新的会话时优先使用
- `lastSessionUrl`、OpenCode leaf iframe URL 和 session id 解析通过 `CurrentContextSession` 收口；`ContextManager` 和 `ViewManager` 不各自实现“当前 session 是谁”的流程

### 10. Harness 与运行时真相源

- 插件写 XDG log 和 `status.json`。
- harness 只读这些文件和 vault 插件目录，不通过 `obsidian eval` 获取常规状态。
- `obsidian eval` 只能作为最后取证手段，不能写进默认调试流程。
- 本机默认 vault 是 `~/obsidian`，也可用 `ANOTHER_OPENCODE_FOR_OBSIDIAN_VAULT` 或 `--vault` 覆盖。
- 错误 UI、harness 和 issue template 只搬运同一份证据：`getServiceDiagnostics()`。

### 11. 上下文只有一个载体

Obsidian 上下文以 `data:text/plain;base64,` 文件附件进 prompt body 的 `files`。没有独立的 context
消息，没有额外的 text part，没有来源标记，也没有服务端 message id 参与状态。one-shot
candidate 的消费发生在请求成功转发之后，`PromptDelivery` 只记录事实。

### 12. Settings 只描述用户能决定的事

设置项只有：`serviceName`、`projectDirectory`、`defaultViewLocation`、`contextAssist`、
`webViewAppearance`、`lastSessionUrl`。端口、hostname、可执行文件路径、启动超时、自定义命令、
自动启动、键盘策略都不再是插件设置：它们属于 opencode 自己的配置或已删除的机制。

## 编码规范

| 类型                | 规范                           | 示例                                     |
| ------------------- | ------------------------------ | ---------------------------------------- |
| Classes             | PascalCase                     | `OpenCodePlugin`, `OpenCodeWebUiProxy`   |
| Interfaces/Types    | PascalCase                     | `OpenCodeSettings`, `ServiceStatus`      |
| Constants           | UPPER_CASE 或 camelCase        | `DEFAULT_SETTINGS`, `OPENCODE_VIEW_TYPE` |
| Variables/functions | camelCase                      | `getVaultPath`, `attachService`          |
| Private members     | camelCase（无前缀）            | `private serviceStatus`                  |
| Files               | PascalCase（类）、小写（入口） | `ServiceDiscovery.ts`, `main.ts`         |

### TypeScript 模式

- `strictNullChecks` 启用——显式处理 null/undefined
- Union types 表示状态: `ServiceState = "attached" | "unavailable"`
- `async/await` 优于 Promise 链
- 公共方法显式声明返回类型
- Node.js 内置模块按普通 ES import 引入（`import { request as httpRequest } from "http"`），esbuild 通过 `builtin-modules` 把它们全部标记为 external

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

# 构建 + opencode service attach 检查
bun run harness doctor --vault ~/obsidian

# OpenCode OpenAPI / Obsidian workspace event / 本地 bridge 消息契约检查
bun run dev:bridge --opencode ~/Projects/ai-cli/opencode

# 真实 Obsidian 插件里的主题注入和 iframe diagnostics 检查
bun run harness theme --vault ~/obsidian
```

`obsidian eval` 会读 Obsidian 内部对象，只在 XDG 日志和 status 文件不足以定位问题时使用。默认先看
`$XDG_STATE_HOME/another-opencode-for-obsidian/status.json` 和
`another-opencode-for-obsidian.log`。
Obsidian 命令面板中的 `Copy OpenCode diagnostics` 会复制同一份 service diagnostics。
`bun run dev:bridge` 需要本地 opencode 源码 checkout；它不联网。

## 分支策略

本仓库按自维护项目处理。先保证本地架构正确、可观测、可维护，再考虑上游兼容。不要为了兼容旧数据或旧上游行为引入补偿分支。

## 已知限制与后续工作

- **仅桌面端**: 使用 Node.js `http` / `fs` 等桌面 API，不支持 Obsidian Mobile。
- **不管理服务生命周期**: 服务的启动、停止、端口和 provider/MCP 配置归 opencode 自己的
  `opencode service` 命令；插件只 attach 和报告状态。
- **上下文面板仍是状态栏 popover**: 更强的手动选择入口、note/folder/search 候选来源尚未接入。
- **harness theme 依赖运行中的 Obsidian 与 proxy**: 未启动时看到的是前置条件缺失，不是外观缺陷。
- **graph-derived source 未接入**: GraphIndex 只提供事实，还没有产出 candidate 的 driver。

## esbuild 配置要点

```javascript
// esbuild.config.mjs 关键配置
{
  format: "cjs",
  target: "es2018",
  platform: "node",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
  bundle: true,
  outfile: "main.js",
}
```

- `obsidian` 和 `electron` 标记为 external——由 Obsidian 运行时提供
- Node.js 内置模块由 `builtin-modules` 展开进 external——插件运行在 Obsidian 的 Node 环境
- 源码用普通 ES import 引入 node 内置模块（`import { request as httpRequest } from "http"`），
  bundle 时保留为 `require` 调用

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
