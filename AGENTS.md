# AGENTS.md - Obsidian OpenCode Plugin

AI 编码代理在 obsidian-opencode 插件上工作的指南。

## 项目概述

在 Obsidian 侧边栏中嵌入 OpenCode AI 助手。启动本地 opencode 服务器进程，通过 iframe 展示其 Web UI，并将 Obsidian 工作区上下文注入 opencode 会话。

**技术栈:** TypeScript · Obsidian Plugin API · esbuild · Node.js child_process / http

## 构建命令

```bash
bun install          # 安装依赖
bun run build        # 生产构建（类型检查 + esbuild 打包）
bun run harness      # 查看 harness 命令
bun run dev:status   # 查看 vault 插件状态 + XDG runtime 状态
bun run dev:logs     # 查看 XDG 日志
bun run dev:bridge   # 检查本地桥接契约
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
├── proxy/
│   └── OpenCodeProxy.ts   # 本地 HTTP 代理：剥离 CSP 头、注入键盘监听
├── bridge/
│   └── BridgeProtocol.ts  # 本项目自己的 iframe -> Obsidian postMessage 协议
├── debug/
│   └── RuntimeDiagnostics.ts # XDG 日志、status.json、运行时路径
├── context/
│   ├── ContextManager.ts    # 监听 Obsidian workspace 事件，触发上下文刷新
│   ├── AutoSelectionContextSource.ts # 自动选区策略：去重、空选区重置、失败重试
│   ├── BacklinkContextSource.ts # 反向链接策略：消费 resolvedLinks、生成 active note backlink context
│   ├── CursorContextSource.ts # 光标位置策略：消费 active editor cursor snapshot、维护单个 cursor auto item
│   └── WorkspaceContext.ts  # 收集打开的笔记路径 + 选中文本
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

### `OpenCodeProxy.ts` — 本地 HTTP 代理

- 启动本地代理服务器（端口从 4097 起自动检测）
- 转发请求到 opencode 服务器，同时在响应中:
  1. **剥离 Content-Security-Policy 头**——否则注入的脚本会被浏览器阻止执行
  2. **注入键盘监听脚本**——拦截 iframe 内的 `Cmd+L` / `Ctrl+L`，通过 `BridgeProtocol.ts` 定义的 `postMessage` 协议发送到父窗口
- `webViewAppearance === "obsidian"` 时读取 Obsidian 当前 CSS 变量，并在 proxied HTML 里覆盖 OpenCode 的设计 token
- Obsidian 外观模式的默认行为是让 OpenCode 页面底色使用 Obsidian `--background-primary`，输入框、浮层、会话面板等局部 surface 使用 Obsidian 变量派生出的半透明 token。只有 Obsidian CSS 变量缺失时才退回 `.app-container` 的 computed background；代码消费稳定变量面，不消费 Obsidian 或 OpenCode 的内部组件 class。
- 主题桥接的真相源是稳定变量面:
  - Obsidian CSS variables: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
  - OpenCode tokens: https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css
  - OpenCode Tailwind entry: https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/tailwind.css
- 不要用 OpenCode 内部组件 class selector 重写主题。当前可验收路径是打开 proxy URL 或 Obsidian iframe，读取内部 DOM 的 computed style，确认 `--background-base`/`--v2-background-bg-base` 使用 `--opencode-obsidian-page-background`，同时 `--surface-raised-base`、`--text-strong`、`--border-weak-base` 等 token 已影响页面
- OpenCode v2 组件同时消费 `--v2-*` token 和未加 v2 前缀的组件 token。未加前缀 token 必须别名到 `--v2-*`，不能复制一套颜色算法
- 代理在插件卸载时自动关闭

### `OpenCodeView.ts` — 侧边栏视图

- `ItemView` 子类，使用 iframe 加载 opencode Web UI
- 基于状态的渲染: 根据服务器状态（stopped/starting/running/error）显示不同 UI
- 加载状态: spinner + "正在加载 OpenCode..."
- 错误状态: 错误信息、hint、启动命令、stderr、XDG log/status 路径、重试/设置/复制诊断按钮
- 运行状态: iframe 指向代理 URL
- 监听 `window` 的 `message` 事件，处理来自 iframe 的 postMessage:
  - `view:toggle`: 触发视图切换
  - `proxy:loaded`: iframe 初始化确认

### `ViewManager.ts` — 视图切换逻辑

- **三段式切换**:
  1. 侧边栏已展开 且 opencode 活跃 → 折叠侧边栏
  2. 侧边栏已展开 但其他 leaf 活跃 → 切换到 opencode leaf
  3. 侧边栏已折叠 → 展开侧边栏 + 聚焦 opencode iframe
- `previousEditorLeaf`: 聚焦 opencode 前保存编辑器的 leaf，折叠时恢复焦点到编辑器
- `lastSessionUrl`: 保存会话 URL 到插件设置，重启时恢复；同时通过时间戳比较查询服务器最新会话

### `ContextManager.ts` — 上下文注入

- 监听 Obsidian workspace 事件（active-leaf-change、editor-change 等）
- 防抖 2 秒后触发上下文刷新
- 调用 `WorkspaceContext` 收集数据，通过 `OpenCodeClient` 发送到 opencode 会话
- `injectWorkspaceContext` 控制自动 workspace 摘要（打开笔记路径 + 当前选区）是否作为一个 auto item 维护
- `autoAddSelectionContext` 控制 editor-change 后是否把变化后的选区追加为 manual item；它复用 `addSelectionForCurrentSession()`，不新增 ContextItem 身份字段或第二套状态源
- `autoAddBacklinksContext` 控制 active note 的反向链接是否作为 auto item 维护；`ContextManager` 只路由 workspace/metadataCache 事件和当前文件路径，不在这里解析 backlink 图
- `autoAddCursorContext` 控制 active note 光标位置是否作为 auto item 维护；`ContextManager` 只消费 Obsidian `MarkdownView.editor.getCursor()`，并把 0-based `EditorPosition` 转成给模型看的 1-based 行列
- workspace auto item 由固定 label 和 source file 替换；backlink auto item 只表示当前 active note，切换 active note 时先删除既有 backlink auto item
- cursor auto item 只表示当前 active editor 的一个光标位置，切换文件或移动光标时先删除既有 cursor auto item

### `AutoSelectionContextSource.ts` — 自动选区策略

- 只处理自动选区策略：开关判断、fingerprint 去重、空选区重置、失败后允许同一选区重试
- 不持有 ContextItem[]，不调用 OpenCodeClient，不读取 Obsidian workspace
- 自动选区只在成功创建 ContextItem 后记录 fingerprint。没有 active session 或 OpenCode 拒收时，后续相同选区仍可重试

### `BacklinkContextSource.ts` — 反向链接策略

- 只处理反向链接策略：开关判断、从 `resolvedLinks` 反查 source notes、fingerprint 去重、无 backlink 时删除 stale auto item
- 消费的稳定面是本地 `node_modules/obsidian/obsidian.d.ts` 暴露的 `MetadataCache.resolvedLinks: Record<string, Record<string, number>>`
- `changed` 和 `resolve` 事件只作为刷新触发器；反向链接事实来自 `resolvedLinks`
- 不 import Obsidian，不调用 OpenCodeClient，不持有 ContextItem[]。新增 backlink 文本格式时先改这里的纯函数和测试

### `CursorContextSource.ts` — 光标位置策略

- 只处理光标位置策略：开关判断、fingerprint 去重、无 active cursor 时删除 stale auto item、失败后允许同一位置重试
- 消费的稳定面是本地 `node_modules/obsidian/obsidian.d.ts` 暴露的 `Editor.getCursor()` 和 `EditorPosition { line, ch }`
- source module 只接收普通对象 `{ sourcePath, line, column }`。这里的 `line` 和 `column` 已经是 1-based，转换只允许发生在 `ContextManager.getCursorSnapshot()`
- 不 import Obsidian，不调用 OpenCodeClient，不持有 ContextItem[]。新增 cursor 文本格式时先改这里的纯函数和测试

### `WorkspaceContext.ts` — 上下文收集

- 获取当前打开的笔记文件路径列表
- 获取当前编辑器中的选中文本
- 序列化为 opencode 可接收的上下文格式

### `SettingsTab.ts` — 设置面板

- `opencodePath`: opencode 可执行文件路径
- `customCommand`: 非空时是 shell command template，必须包含 `{hostname}` 和 `{port}`
- textarea 显示真实配置值；示例命令只作为 placeholder。空字符串必须保持为空，因为它表示 path 模式
- `webViewAppearance`: 默认 `obsidian`，让 Web UI 继承 Obsidian pane 背景并使用半透明局部 surface；`opencode` 保留 OpenCode Web UI 原生风格
- `autoAddSelectionContext`: 默认关闭。开启后，编辑器选区变化会自动追加到当前 OpenCode session；关闭后只能通过命令手动添加选区
- `autoAddCursorContext`: 默认关闭。开启后，active note 的当前光标位置会作为单个 auto item 维护

### `RuntimeDiagnostics.ts` — 运行时观测

- 唯一运行时文件位置由 `getRuntimePaths()` 决定
- `$XDG_STATE_HOME/opencode-obsidian/opencode-obsidian.log`
- `$XDG_STATE_HOME/opencode-obsidian/status.json`
- 若 `XDG_STATE_HOME` 未设置，使用 `~/.local/state`
- 依据: [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/)

### `harness bridge` — 桥接契约检查

- 一阶真相源只读本地依赖，不联网、不静默重试、不维护手写能力清单
- OpenCode HTTP 以 `/path/to/opencode/packages/sdk/openapi.json` 为准
- OpenCode hooks 以 `/path/to/opencode/packages/plugin/src/index.ts` 为准
- Obsidian workspace events、`Editor.getCursor()`、`MetadataCache.resolvedLinks` 以 `node_modules/obsidian/obsidian.d.ts` 为准
- `BridgeProtocol.ts` 只定义本项目自己的 postMessage 协议，不替 OpenCode 或 Obsidian 定义能力

### `harness theme` — Web UI 外观检查

- 读取 XDG `status.json` 里的 `proxyUrl`，只访问本机 proxy HTML
- `obsidian` 模式要求 `data-opencode-obsidian-*` 注入存在、根背景 token 使用 Obsidian 页面背景变量、局部 surface token 半透明
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

- `{ns:'opencode-obsidian', version:1, type:'view:toggle'}`: iframe 通知父窗口切换视图
- `{ns:'opencode-obsidian', version:1, type:'proxy:loaded'}`: 代理注入的脚本初始化完成，通知父窗口可以开始通信
- 父窗口通过 `window.addEventListener('message', ...)` 监听

### 5. Bridge 开发纪律

新增 OpenCode API、hook、event、permission、question、tui 或 Obsidian workspace 消费时，先写实际消费代码，再跑：

```bash
bun run dev:bridge --opencode /Users/oujinsai/Projects/ai-cli/opencode
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

### 9. Harness 与运行时真相源

- 插件写 XDG log 和 `status.json`
- harness 只读这些文件和 vault 插件目录，不通过 `obsidian eval` 获取常规状态
- `obsidian eval` 只能作为最后取证手段，不能写进默认调试流程
- 本机默认 vault 是 `/Users/oujinsai/obsidian`，也可用 `OPENCODE_OBSIDIAN_VAULT` 或 `--vault` 覆盖
- 错误 UI 先显示 `getDiagnostics()` 的错误、hint、命令、stderr、log/status 路径；harness 和 issue template 只搬运同一份证据，不能成为用户发现根因的前置要求

### 10. Custom Command 契约

- `CUSTOM_COMMAND_EXAMPLE` 只用于设置页 placeholder 和测试示例
- 空 `customCommand` 表示 path 模式：解析 `opencodePath`，直接 spawn `opencode serve --hostname ... --port ... --cors app://obsidian.md`
- 非空模板表示 custom 模式：通过 shell 执行，必须包含 `{hostname}` 和 `{port}`
- `{cors}` 和 `{projectDirectory}` 是可选变量
- macOS GUI 启动的 Obsidian 可能拿不到交互式 shell 的 PATH。custom 模式使用绝对路径或开头 `~` 的路径；path 模式由 `ExecutableResolver` 处理常见安装位置

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
bun run harness install --vault /Users/oujinsai/obsidian

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
bun run harness status --vault /Users/oujinsai/obsidian

# 查看 XDG 日志
bun run harness logs --lines 120

# 构建 + opencode 可执行文件 + runtime health 检查
bun run harness doctor --vault /Users/oujinsai/obsidian
```

`obsidian eval` 会读 Obsidian 内部对象，只在 XDG 日志和 status 文件不足以定位问题时使用。默认先看 `$XDG_STATE_HOME/opencode-obsidian/status.json` 和 `$XDG_STATE_HOME/opencode-obsidian/opencode-obsidian.log`。

## 分支策略

本仓库按自维护项目处理。先保证本地架构正确、可观测、可维护，再考虑上游兼容。不要为了兼容旧数据或旧上游行为引入补偿分支。

## 已知限制与后续工作

- **上下文注入不可见**: 当前将打开笔记路径和选中文本作为静默后台上下文发送，用户看不到发送了什么、也没有控制权。计划添加可见的上下文面板和手动控制。
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

---

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

### Session Protocol

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads changes to JSONL
git commit -m "..."     # Commit everything
git push                # Push to remote
```

<!-- end-bv-agent-instructions -->
