# AGENTS.md - Obsidian OpenCode Plugin

AI 编码代理在 obsidian-opencode 插件上工作的指南。

## 项目概述

在 Obsidian 侧边栏中嵌入 OpenCode AI 助手。启动本地 opencode 服务器进程，通过 iframe 展示其 Web UI，并将 Obsidian 工作区上下文注入 opencode 会话。

**技术栈:** TypeScript · Obsidian Plugin API · esbuild · Node.js child_process / http

## 构建命令

```bash
bun install          # 安装依赖
bun run build        # 生产构建（类型检查 + esbuild 打包）
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
│   ├── ServerManager.ts   # 进程生命周期管理、健康检查（含 no-cors 回退）
│   ├── ExecutableResolver.ts  # opencode 可执行文件路径解析
│   ├── types.ts           # 服务端相关类型
│   └── process/
│       ├── OpenCodeProcess.ts   # 进程抽象（平台无关接口）
│       ├── PosixProcess.ts      # Unix/macOS 进程实现
│       └── WindowsProcess.ts    # Windows 进程实现
├── proxy/
│   └── OpenCodeProxy.ts   # 本地 HTTP 代理：剥离 CSP 头、注入键盘监听
├── context/
│   ├── ContextManager.ts    # 监听 Obsidian workspace 事件，触发上下文刷新
│   └── WorkspaceContext.ts  # 收集打开的笔记路径 + 选中文本
├── ui/
│   ├── OpenCodeView.ts      # ItemView：iframe + 基于状态的渲染
│   └── ViewManager.ts       # 切换逻辑、焦点管理、会话 URL
└── settings/
    └── SettingsTab.ts       # 插件设置 UI（PluginSettingTab）
```

## 模块职责

### `main.ts` — 插件生命周期
- `onload()`: 注册视图、命令、设置；加载并启动 opencode 服务器；初始化 ContextManager
- `onunload()`: 清理定时器、关闭上下文监听、终止服务器进程、移除 postMessage 监听
- 对外暴露 `getSettings()`、`getServerManager()`、`getOpenCodeClient()` 供其他模块使用

### `OpenCodeClient.ts` — API 客户端
- 封装对 opencode HTTP API 的调用（`/v1/sessions`、`/v1/sessions/{id}` 等）
- **关键**: 使用 Node.js `http.request` 而非 `fetch`——因为 opencode 服务器默认没有 `--cors app://obsidian.md`，浏览器 fetch 会被 CORS 阻止，但 Node.js 的 http 模块不受此限制
- 在插件主线程中执行（非渲染进程），通过 IPC 或直接调用

### `ServerManager.ts` — 服务器生命周期
- `start()`: 解析可执行文件路径 → 启动子进程 → 轮询健康检查
- `stop()`: 发送 SIGTERM → 等待退出 → 超时 SIGKILL
- 健康检查: 先尝试带 CORS 头的请求；失败则用 `no-cors` 模式回退——即使服务器不返回 CORS 头，也能通过 network error 的有无来判断进程是否存活
- 状态机: `stopped | starting | running | error`
- 通过回调通知 UI 状态变更

### `ExecutableResolver.ts`
- 在 PATH 中查找 `opencode` 可执行文件
- 支持用户手动指定路径（设置项 `binPath`）

### `OpenCodeProxy.ts` — 本地 HTTP 代理
- 启动本地代理服务器（端口从 4097 起自动检测）
- 转发请求到 opencode 服务器，同时在响应中:
  1. **剥离 Content-Security-Policy 头**——否则注入的脚本会被浏览器阻止执行
  2. **注入键盘监听脚本**——拦截 iframe 内的 `Cmd+L` / `Ctrl+L`，通过 `postMessage` 发送 `{type:'opencode-toggle'}` 到父窗口
- 代理在插件卸载时自动关闭

### `OpenCodeView.ts` — 侧边栏视图
- `ItemView` 子类，使用 iframe 加载 opencode Web UI
- 基于状态的渲染: 根据服务器状态（stopped/starting/running/error）显示不同 UI
- 加载状态: spinner + "正在加载 OpenCode..."
- 错误状态: 错误信息 + 重试按钮
- 运行状态: iframe 指向代理 URL
- 监听 `window` 的 `message` 事件，处理来自 iframe 的 postMessage:
  - `opencode-toggle`: 触发视图切换
  - `opencode-proxy-loaded`: iframe 初始化确认

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

### `WorkspaceContext.ts` — 上下文收集
- 获取当前打开的笔记文件路径列表
- 获取当前编辑器中的选中文本
- 序列化为 opencode 可接收的上下文格式

### `SettingsTab.ts` — 设置面板
- `binPath`: opencode 可执行文件路径（留空则自动从 PATH 解析）
- 扩展点: 未来可添加代理端口、主题等设置

## 关键架构决策

### 1. `http.request` 替代 `fetch` —— 绕过 CORS
opencode 服务器默认启动不带 `--cors` 参数，意味着它不会返回 `Access-Control-Allow-Origin: app://obsidian.md`。浏览器的 `fetch` 会因此拒绝请求。Node.js 的 `http` 模块运行在插件主线程，**不受浏览器 CORS 策略约束**，可以直接发 HTTP 请求。

### 2. 健康检查 `no-cors` 回退
第一轮健康检查带 CORS 头（期望完整响应）。如果失败，用 `mode: 'no-cors'` 发起 opaque 请求——即使读不到响应体，**network error 的有无**足以判断服务器是否在监听端口。这样即使服务器完全没有 CORS 支持，也能正确检测进程状态。

### 3. 本地 HTTP 代理 —— CSP 剥离 + 脚本注入
opencode 的 HTML 响应携带严格的 Content-Security-Policy，禁止内联脚本执行。代理在转发前剥离 CSP 头，从而可以注入自定义脚本：
- **键盘监听**: 拦截 `Cmd+L`（macOS）/ `Ctrl+L`（Windows/Linux），发送 `postMessage` 到 Obsidian 父窗口
- **自动端口检测**: 从 4097 开始递增尝试，找到第一个可用端口

### 4. `postMessage` 桥接
iframe 与 Obsidian 插件之间通过 `window.postMessage` 通信：
- `{type: 'opencode-toggle'}`: iframe 通知父窗口切换视图
- `{type: 'opencode-proxy-loaded'}`: 代理注入的脚本初始化完成，通知父窗口可以开始通信
- 父窗口通过 `window.addEventListener('message', ...)` 监听

### 5. 三段式切换逻辑
```
当前状态                         →  操作
─────────────────────────────────────────────────
侧边栏展开 + opencode 活跃      →  折叠侧边栏
侧边栏展开 + 其他 leaf 活跃     →  切换到 opencode leaf
侧边栏折叠                      →  展开侧边栏 + focus iframe
```
这确保了快捷键的直觉行为：按一次展开，再按一次折叠，不会出现「展开了但需要再多按一下才能切到 opencode」的情况。

### 6. 焦点恢复
在聚焦 opencode iframe 前保存 `previousEditorLeaf`（当前活跃的编辑器 leaf）。用户通过 toggle 折叠侧边栏时，自动恢复到该 leaf，让用户可以无缝回到编辑状态。

### 7. 会话持久化
- 创建新会话时将 URL 保存到 `lastSessionUrl`（持久化在插件 data.json 中）
- 插件启动时先尝试恢复 `lastSessionUrl`
- 同时查询服务器 `/v1/sessions`，比较时间戳，如果有更新的会话则优先使用

## 编码规范

| 类型 | 规范 | 示例 |
|------|------|------|
| Classes | PascalCase | `OpenCodePlugin`, `ServerManager` |
| Interfaces/Types | PascalCase | `OpenCodeSettings`, `ProcessState` |
| Constants | UPPER_CASE 或 camelCase | `DEFAULT_SETTINGS`, `OPENCODE_VIEW_TYPE` |
| Variables/functions | camelCase | `getVaultPath`, `startServer` |
| Private members | camelCase（无前缀） | `private processManager` |
| Files | PascalCase（类）、小写（入口） | `ServerManager.ts`, `main.ts` |

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

# 2. 复制到 vault 的插件目录
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/opencode-obsidian/

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
# 重新加载插件（Obsidian CLI）
obsidian plugin:reload id=opencode-obsidian

# 查看插件错误
obsidian dev:errors

# 检查插件状态
obsidian eval code="app.plugins.plugins['opencode-obsidian']"

# 验证快捷键绑定
obsidian hotkeys

# 手动触发切换命令
obsidian command id=opencode-obsidian:toggle-opencode-view
```

## 分支策略

所有功能分支基于 `upstream/main` 创建，保持干净的 PR 历史。

### 当前功能分支（已合并到本地 main）
- `fix/cors-api` — API 调用和健康检查的 CORS 绕过
- `feature/remember-session` — 跨重启会话持久化
- `feature/proxy` — 本地代理、CSP 剥离、postMessage 桥接
- `feature/focus-management` — 三段式切换逻辑和焦点恢复

### 开发流程
```bash
git fetch upstream
git checkout -b feature/xxx upstream/main
# 开发...
git checkout main && git merge feature/xxx
```

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
