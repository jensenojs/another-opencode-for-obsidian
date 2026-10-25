> 2026-10-25 更新：本文评估的架构（`ContextRegistry` + `ContextSyncer` + postMessage 桥接）在 0.6.0 已整体删除。
> 当前形状见 [v2-attach-spec.md](../plans/v2-attach-spec.md)：候选由 `CandidateRegistry` 持有，随 prompt 请求以 `files` 附件发出；事件流只用于服务存活与诊断。
> 下面的调研与结论保留为当时的设计记录。

# 上下文事件架构双向集成验证

## 概述

验证 `ContextRegistry` + `ContextSyncer` + `postMessage` 桥接的事件驱动架构能否承接未来的双向集成需求（Obsidian ↔ opencode）。基于 Obsidian Plugin API v1.8.x 类型定义、opencode server API 文档（opencode.ai/docs/server）、GitHub issue #11616（Web UI 架构）和 #9650（SSE sessionID 过滤），以及插件源码分析。

**结论：架构方向正确，但存在一个关键缺口——缺少 opencode → Obsidian 方向的事件监听通道。修复此缺口不需要重构核心模块。**

## 1. Obsidian 可用事件清单

### 1.1 Workspace 事件（`app.workspace.on()`）

来源：`node_modules/obsidian/obsidian.d.ts` lines 6921–7023。

| 事件名 | 触发时机 | Payload | 版本 |
|--------|---------|---------|------|
| `active-leaf-change` | 活跃 leaf 切换 | `(leaf: WorkspaceLeaf \| null)` | 0.10.9 |
| `file-open` | 活跃文件变化（含嵌入） | `(file: TFile \| null)` | 0.10.9 |
| `layout-change` | 布局变更 | `()` | 0.9.20 |
| `editor-change` | 编辑器内容变更（含程序化） | `(editor: Editor, info: MarkdownView \| MarkdownFileInfo)` | 1.1.1 |
| `editor-paste` | 编辑器粘贴事件 | `(evt: ClipboardEvent, editor: Editor, info)` | 1.1.0 |
| `editor-drop` | 编辑器拖放事件 | `(evt: DragEvent, editor: Editor, info)` | 1.1.0 |
| `window-open` | 新弹出窗口创建 | `(win: WorkspaceWindow, window: Window)` | 0.15.3 |
| `window-close` | 弹出窗口关闭 | `(win: WorkspaceWindow, window: Window)` | 0.15.3 |
| `quick-preview` | 文件快速预览 | `(file: TFile, data: string)` | — |
| `resize` | WorkspaceItem 尺寸变化 | `()` | 0.9.7 |
| `css-change` | CSS 变更 | `()` | 0.9.7 |
| `quit` | 应用即将退出 | `(tasks: Tasks)` | 0.10.2 |
| `file-menu` | 文件右键菜单 | `(menu: Menu, file: TAbstractFile, source: string, leaf?)` | 0.9.12 |
| `files-menu` | 多文件右键菜单 | `(menu: Menu, files: TAbstractFile[], source: string, leaf?)` | 1.4.10 |
| `url-menu` | 外部 URL 右键菜单 | `(menu: Menu, url: string)` | 1.5.1 |
| `editor-menu` | 编辑器右键菜单 | `(menu: Menu, editor: Editor, info)` | 1.1.0 |

### 1.2 元数据缓存事件（`app.metadataCache.on()`）

来源：`obsidian.d.ts` lines 4094–4112。

| 事件名 | 触发时机 | Payload | 用途 |
|--------|---------|---------|------|
| `changed` | 文件索引完成，缓存可用 | `(file: TFile, data: string, cache: CachedMetadata)` | **反向链接更新的核心事件**。`cache` 包含 `links`、`embeds`、`headings`、`sections`、`frontmatter` 等 |
| `deleted` | 文件删除 | `(file: TFile, prevCache: CachedMetadata \| null)` | 清理反向链接引用 |
| `resolve` | 文件链接解析完成 | `(file: TFile)` | `resolvedLinks` / `unresolvedLinks` 更新 |
| `resolved` | 全部文件解析完成 | `()` | 初始化后链接全量可用 |

**关键结论**：`metadataCache.on('changed')` 可用于监控文件反向链接变化。`cache.links` 数组包含出链目标，`cache.embeds` 包含嵌入目标。但要从「某文件的入链」（反向链接）角度看，需要使用 `app.metadataCache.getBacklinksForFile(file)` 主动查询。

### 1.3 Vault 事件（`app.vault.on()`）

来源：`obsidian.d.ts` lines 6411–6429。

| 事件名 | 触发时机 | Payload |
|--------|---------|---------|
| `create` | 文件创建（含 vault 加载时的存量文件） | `(file: TAbstractFile)` |
| `modify` | 文件修改 | `(file: TAbstractFile)` |
| `delete` | 文件删除 | `(file: TAbstractFile)` |
| `rename` | 文件重命名 | `(file: TAbstractFile, oldPath: string)` |

### 1.4 已使用但未正式进入类型定义的事件

代码中通过 `(this.app.workspace as any).on(...)` 使用了两个不在 `obsidian.d.ts` 中的事件：

- **`file-close`** — 文件关闭时触发。payload 推测为 `(file: TFile)`。`ContextManager.updateListeners()` 使用此事件来调度上下文刷新。
- **`editor-selection-change`** — 编辑器选择区域变化。payload 推测为 `(editor: Editor, view: MarkdownView)`。`ContextManager.updateListeners()` 使用此事件追踪选中文本。

这两个事件在 Obsidian 运行时确实存在（否则监听不会有任何效果），但 Obsidian 团队未将其列入公共 API，可能在未来的 minor 版本中被移除或重命名。**建议在 `types.ts` 中注释标记这些事件为 `@unstable`**，并在 Phase 2 前迁移到稳定替代方案（如通过 `editor-change` + 手动 diff selection）。

### 1.5 当前插件监听的事件总览

```
ContextManager.updateListeners() 监听:
  workspace.on('active-leaf-change')      → scheduleRefresh(0)
  workspace.on('file-open')               → scheduleRefresh(300)
  workspace.on('file-close')   [unstable] → scheduleRefresh(300)
  workspace.on('layout-change')           → scheduleRefresh(300)
  workspace.on('editor-change')           → trackViewSelection + scheduleRefresh(500)
  workspace.on('editor-selection-change') [unstable] → trackViewSelection + scheduleRefresh(200)
```

---

## 2. OpenCode SSE 事件流

### 2.1 端点确认

来源：[opencode.ai/docs/server](https://opencode.ai/docs/server/#events)

| 端点 | 方法 | 说明 | 响应 |
|------|------|------|------|
| `/event` | `GET` | SSE 事件流。首条事件为 `server.connected`，之后为 bus 事件 | `text/event-stream` |
| `/global/event` | `GET` | 全局 SSE 事件流 | `text/event-stream` |

`/event` 端点**确实存在**，且已文档化。该端点广播**所有会话**的事件（当前不支持 `?sessionID=` 过滤——GitHub issue #9650 已提出 feature request 但尚未合并）。客户端需要自行按 `sessionID` 过滤。

### 2.2 事件类型清单

来源：GitHub issue #11616 记录的 web 接口架构。

**消息事件：**

| 事件名 | Payload | 说明 |
|--------|---------|------|
| `message.updated` | `{ sessionID, info: Message, parts: Part[] }` | 消息创建或更新 |
| `message.removed` | `{ sessionID, info: Message }` | 消息删除 |
| `message.part.updated` | `{ sessionID, part: Part, delta?: string }` | Part 更新（含增量文本流） |
| `message.part.removed` | `{ sessionID, part: Part }` | Part 删除 |

**会话事件：**

| 事件名 | 说明 |
|--------|------|
| `session.created` | 新会话创建 |
| `session.updated` | 会话属性更新（标题等） |
| `session.deleted` | 会话删除 |
| `session.diff` | 会话文件 diff 更新 |
| `session.error` | 会话错误 |
| `session.status` | 会话执行状态变化（idle/running/error 等） |

**其他事件：**

| 事件名 | 说明 |
|--------|------|
| `todo.updated` | Todo 列表更新 |
| `question.asked` | AI 请求用户输入 |
| `question.replied` | 用户回复问题 |
| `question.rejected` | 用户拒绝问题 |
| `permission.asked` | 权限请求 |
| `permission.replied` | 权限回复 |
| `server.connected` | SSE 连接建立首条事件 |

### 2.3 认证机制

如果设置了环境变量 `OPENCODE_SERVER_PASSWORD`，服务器启用 **HTTP Basic Auth**：
- 用户名默认为 `opencode`，可通过 `OPENCODE_SERVER_USERNAME` 覆盖
- 所有 HTTP 端点（包括 `/event` SSE）都需要 `Authorization: Basic <base64>` 头

对注入脚本的影响：
- 注入脚本在 iframe 内与 opencode 服务器**同源**（代理转发），可以直接 `fetch('/event')` 或 `new EventSource('/event')`
- 但 `EventSource` API **不支持自定义请求头**，无法发送 `Authorization` 头
- 如果启用了 Basic Auth，注入脚本需要使用 `fetch()` + `ReadableStream` 手动实现 SSE 解析
- 更可靠的方案：让 **Obsidian 侧（Node.js `http` 模块）** 订阅 SSE 流，因为它已经绕开了浏览器 CORS 限制，且可以携带任意请求头

### 2.4 注入脚本能否通过同源 fetch 订阅 SSE？

**技术上可行但有限制**：

- 代理使 iframe 与 opencode 服务器同源 → `fetch('/event')` 可用
- 无 Basic Auth 时直接 `new EventSource('/event')` 即可
- 有 Basic Auth 时需要 `fetch()` + 手动解析 `text/event-stream`，代码复杂度增加
- SSE 连接是**长连接**，注入脚本的生命周期与 iframe 绑定；iframe 刷新/导航会断开连接
- 考虑到连接稳定性，**推荐在 Obsidian 侧（Node.js 主线程）建立 SSE 连接**，然后将事件通过 postMessage 转发到 iframe

---

## 3. 代理双向桥接能力分析

### 3.1 当前 postMessage 协议

来源：`src/proxy/OpenCodeWebUiProxy.ts`（注入脚本）和 `src/main.ts`（消息监听）。

当前只定义了两种消息类型：

```typescript
// iframe → Obsidian
{ type: 'opencode-proxy-loaded' }  // 注入脚本初始化完成
{ type: 'opencode-toggle' }        // Cmd+L / Ctrl+L 触发视图切换
```

Obsidian 侧通过 `window.addEventListener('message', ...)` 监听，按 `event.data.type` 分发。

### 3.2 扩展 postMessage 的可行性

**完全可行**。当前消息协议只需要增加 `type` 枚举值：

```typescript
// 建议的扩展方向
type PostMessageEvent =
  | { type: 'opencode-toggle' }
  | { type: 'opencode-proxy-loaded' }
  // 未来方向:
  | { type: 'opencode-session-changed', payload: { sessionId: string } }
  | { type: 'opencode-task-complete', payload: { taskId: string; result: string } }
  | { type: 'opencode-file-modified', payload: { files: string[] } }
  | { type: 'opencode-notification', payload: { title: string; body: string } }
```

注入脚本（在 iframe 内运行）可以通过同源 `fetch('/api/...')` 获取数据后，`window.parent.postMessage(...)` 发送到 Obsidian。No new infrastructure needed.

### 3.3 注入脚本能否直接调 opencode API？

**可以**。代理使 iframe 与 opencode 同源，注入脚本可以用 `fetch()` 调用 opencode 的所有 HTTP API：

```javascript
// 注入脚本示例：获取会话消息列表
const resp = await fetch(`/session/${sessionId}/message`);
const messages = await resp.json();
// 过滤后通过 postMessage 发送到 Obsidian
window.parent.postMessage({
  type: 'opencode-context-update',
  payload: { messages }
}, '*');
```

限制：
- `fetch()` 可以发任意 HTTP 请求（包括携带 `Authorization` 头，如果启用了 Basic Auth）
- 无法调用 Node.js 特有 API（`child_process`、`fs` 等），但这不需要
- 注入脚本的代码通过代理注入到 `<head>` 中，会在每次页面加载时执行

---

## 4. 架构兼容性验证

### 4.1 场景逐一分析

#### 场景 A：AI 修改文件 → Obsidian 自动打开对应笔记

**当前导航契约**：本节保留早期探索价值。早期草案里直接调用
`workspace.openLinkText()` 的做法已经被当前 navigation contract 取代。
opencode 入站事件如果要打开 vault evidence，必须进入 safe navigator，先解析到已有
`TFile`，再调用 `WorkspaceLeaf.openFile()`。

**需求路径**：opencode SSE `message.part.updated`（检测到 `write` / `edit` 工具调用） → safe navigator → Obsidian `WorkspaceLeaf.openFile()`

**当前架构承接情况**：❌ **不可承接**

**缺什么**：
- 没有监听 opencode SSE 事件的模块
- 没有从 opencode 事件到 Obsidian API 调用的转换层

**当时设想的模块**：一个 `OpenCodeEventListener`（或 `InboundEventBridge`），方向与 `ContextSyncer` 相反——用 Node `http` 订阅 SSE、解析事件按类型分发、通过 safe navigator 调 Obsidian API 产生副作用。

**实际落地的是** `OpenCodeEventSource`：它订阅 `GET /api/event`，按 `location.directory` 过滤，只写诊断快照与「服务是否还活着」这一个信号。它不调 Obsidian API，不打开文件，不弹通知——把 opencode 事件翻译成 Obsidian 操作这条需求没有实现。

`ContextRegistry` 与 `ContextSyncer` 当时被判断为「无需改动」，它们在 0.6.0 整个删除。

#### 场景 B：AI 任务完成 → Obsidian 弹出通知

**需求路径**：opencode SSE `todo.updated`（全部完成）或 `session.status`（idle） → Obsidian `new Notice(...)`

**当前架构承接情况**：❌ **不可承接**（同场景 A，缺 SSE 监听模块）

#### 场景 C：Obsidian 笔记修改 → opencode 上下文自动更新

**需求路径**：Obsidian `workspace.on('editor-change')` / `vault.on('modify')` → `registry.add()` → `ContextSyncer` → opencode API

**当前架构承接情况**：⚠️ **部分可承接**

已有机制：
- `ContextManager.updateListeners()` 已监听 `editor-change` 等事件
- 但当前只调用 `WorkspaceContext.gatherContext()` 生成一条聚合上下文，不是逐条管理
- Phase 1 的 `ContextRegistry` + `ContextSyncer` 提供了**逐条增删**的机制

还需要：
- Phase 2 的 `BacklinkSource`（或其他 `ContextSource`）通过 `registry.add({ sourceKey, ... })` 写入自动上下文
- `WorkspaceContext.gatherContext()` 可以改造成调用 `registry.add()` 而不是直接调 `OpenCodeClient`
- 文档中的 context-management 计划已经预留了 `sourceKey` 字段和 `removeBySourceKey()` 方法用于自动源的 diff 增删

**结论**：Phase 1 的 ContextRegistry 事件架构可以承接此场景。关键是 ContextManager 的 `scheduleRefresh()` 需要改为写入 registry 而非直接调 API。

#### 场景 D：opencode 选择新会话 → Obsidian 侧 iframe 追踪新 session

**需求路径**：opencode SSE `session.created` / iframe URL 变化 → Obsidian `cachedIframeUrl` 更新

**当前架构承接情况**：⚠️ **部分可承接**

已有机制：
- `ViewManager.ensureSessionUrl()` 在视图激活时检查最新会话
- `OpenCodeView.onClose()` 将当前 iframe URL 缓存到 `cachedIframeUrl`

当时的缺口是：用户在 opencode Web UI 内切换会话时 Obsidian 侧不知道。

现在的做法不依赖注入脚本上报 URL：`CurrentContextSession` 从 OpenCode leaf 的 iframe URL 解析 session id，解析不出来时回落 `client.getLatestSessionId()`（`GET /api/session?directory=&order=desc&limit=1`），需要在 prompt 边界拿到 session 时才解析。本地 postMessage 没有会话变化消息，也不需要。

### 4.2 总缺口矩阵

| 方向 | 数据流 | 已有模块 | 缺口 | 严重程度 |
|------|--------|---------|------|---------|
| Obsidian → opencode | 用户上下文注入 | `ContextRegistry` + `ContextSyncer` | 无（Phase 1 可覆盖） | — |
| Obsidian → opencode | 自动上下文（反向链接等） | `ContextRegistry`（预留 `sourceKey`） | `ContextSource` 实现（Phase 2） | 低 |
| opencode → Obsidian | 文件修改通知 | **无** | `OpenCodeEventListener`（SSE → Obsidian API） | **高** |
| opencode → Obsidian | 任务/通知 | **无** | 同上，通过不同事件类型分发 | **高** |
| opencode → Obsidian | 会话切换追踪 | `ViewManager`（被动） | 注入脚本 URL 监听 + postMessage | 中 |
| iframe ↔ Obsidian | 双向结构化数据 | `postMessage`（仅 toggle） | 扩展 postMessage 协议 | 低 |

### 4.3 `ContextSyncer` 命名问题（已消失）

当时担心 `ContextSyncer` 的名字暗示双向同步、实际只做 Obsidian → opencode 单向，讨论过改名或拆成两个模块。

这个问题随 `ContextSyncer` 一起消失：0.6.0 不再有「把 Obsidian 改动同步成 opencode 消息」的模块，候选只在 prompt 请求边界变成 `files` 附件；opencode → Obsidian 方向的唯一消费者是 `OpenCodeEventSource`，它只写诊断快照与服务存活信号。

## 5. 当时的接口冻结决策

这一节原本冻结三件事：postMessage 命名空间化、`ContextRegistry` 事件名与 `ContextItem.sourceKey`、`ContextManager` 作为 Obsidian 事件唯一入口。

前两条的前提已经不存在：`ContextRegistry`、`ContextItem`、`ContextItem.sourceKey` 与 `ContextSyncer` 在 0.6.0 删除；本地 postMessage 只剩 4 条消息（`proxy:loaded`、`theme:diagnostics`、`theme:update`、`vault-file:open`）；上下文只剩 `CandidateRegistry` 一个模型。

第三条仍然成立，并已落进 `ContextManager` 的构造依赖：它依旧是 Obsidian workspace 与 editor 事件的唯一接入点。

## 总结

这次评估的前提后来被推翻：`ContextRegistry` + `ContextSyncer` + postMessage 的上下文链路整体删除，插件改成 attach-only，事件流只用于服务存活与诊断（`GET /api/event`，客户端按 `location.directory` 过滤）。评估里「需要一个反向监听模块」的判断以 `OpenCodeEventSource` 的形式落地，但它只产出诊断快照与服务存活信号，不写 vault 状态，也不把 opencode 事件翻译成 Obsidian 操作。

上面保留当时的调研与结论，作为为什么那样设计、后来为什么放弃的记录；当前形状以 [v2-attach-spec.md](../plans/v2-attach-spec.md) 为准。

