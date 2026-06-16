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

来源：`src/proxy/OpenCodeProxy.ts`（注入脚本）和 `src/main.ts`（消息监听）。

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

**需求路径**：opencode SSE `message.part.updated`（检测到 `write` / `edit` 工具调用） → Obsidian `app.workspace.openLinkText(file, line)`

**当前架构承接情况**：❌ **不可承接**

**缺什么**：
- 没有监听 opencode SSE 事件的模块
- 没有从 opencode 事件到 Obsidian API 调用的转换层

**需要的模块**：一个 `OpenCodeEventListener`（或者叫 `InboundEventBridge`），类似于 `ContextSyncer` 但方向相反：
  - 通过 Node.js `http` 订阅 `GET /event` SSE 流
  - 解析事件，按类型分发
  - 调用 Obsidian API 执行操作（打开文件、弹出通知等）

**对架构的影响**：
- `ContextRegistry` 无需改动——它的职责是持有上下文条目状态，不涉及文件操作
- `ContextSyncer` 无需改动——它只负责 Obsidian → opencode 方向
- 新模块独立存在，监听 opencode SSE，产生 Obsidian 副作用
- postMessage 桥接可用于将事件细节广播到 iframe

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

缺失：
- **主动检测**：当用户在 opencode Web UI 内切换会话（URL 变为 `/session/new-id`），Obsidian 侧不知道
- 注入脚本可以通过 `location.pathname` 轮询或 `popstate` 事件检测 URL 变化 → `postMessage` 通知 Obsidian
- 或者通过 SSE `session.created` 事件感知新会话

**需要增加的**：
- 注入脚本增加 URL 变化监听 → `postMessage({ type: 'opencode-session-changed', payload: { sessionId } })`
- `main.ts` 的消息监听器处理此事件 → 更新 `cachedIframeUrl`

### 4.2 总缺口矩阵

| 方向 | 数据流 | 已有模块 | 缺口 | 严重程度 |
|------|--------|---------|------|---------|
| Obsidian → opencode | 用户上下文注入 | `ContextRegistry` + `ContextSyncer` | 无（Phase 1 可覆盖） | — |
| Obsidian → opencode | 自动上下文（反向链接等） | `ContextRegistry`（预留 `sourceKey`） | `ContextSource` 实现（Phase 2） | 低 |
| opencode → Obsidian | 文件修改通知 | **无** | `OpenCodeEventListener`（SSE → Obsidian API） | **高** |
| opencode → Obsidian | 任务/通知 | **无** | 同上，通过不同事件类型分发 | **高** |
| opencode → Obsidian | 会话切换追踪 | `ViewManager`（被动） | 注入脚本 URL 监听 + postMessage | 中 |
| iframe ↔ Obsidian | 双向结构化数据 | `postMessage`（仅 toggle） | 扩展 postMessage 协议 | 低 |

### 4.3 `ContextSyncer` 命名问题

`ContextSyncer` 的当前职责是「将 ContextRegistry 的变更同步到 opencode 服务器」，方向是 **Obsidian → opencode**。

如果 Phase 2 需要 opencode → Obsidian 方向的同步（例如从 opencode API 回读 AI 生成的 todo 作为上下文条目），`ContextSyncer` 的名字暗示「双向同步」但实际上只做了单向。

**建议**：
- 将 `ContextSyncer` 重命名为 `OutboundSyncer` 或 `ContextExporter`，明确表示 Obsidian → opencode 方向
- 预留 `InboundSyncer` 或 `OpenCodeEventListener` 的名字给 opencode → Obsidian 方向
- 或者拆分为 `ContextSyncOut` + `ContextSyncIn`，共享同一个 `ContextRegistry`

---

## 5. 最小接口建议

基于以上调研，三条现在就该冻结的接口设计决策：

### 决策 1：postMessage 协议版本化

**现在冻结**：

```typescript
// 消息的 type 字段使用命名空间前缀，避免与未来 opencode 自身的 postMessage 冲突
// 格式：opencode-obsidian:<action>
type ObsidianPostMessage =
  | { type: 'opencode-obsidian:proxy-loaded' }
  | { type: 'opencode-obsidian:toggle' }
  // Phase 2 预留：
  | { type: 'opencode-obsidian:session-changed', payload: { sessionId: string } }
  | { type: 'opencode-obsidian:notification', payload: { level: 'info'|'warn'|'error', message: string } }
  // 通用事件转发通道：
  | { type: 'opencode-obsidian:event', payload: { name: string, data: unknown } };
```

**理由**：
- 当前 `opencode-toggle` / `opencode-proxy-loaded` 的扁平命名在扩展时会混乱
- 命名空间前缀避免与 opencode 自身的 postMessage（如果未来有的话）冲突
- `opencode-obsidian:event` 作为通用转发通道，避免为每种 opencode SSE 事件类型都定义一个 postMessage type
- 不影响 Phase 1 功能，只是重命名现有字符串

**改动量**：`OpenCodeProxy.ts` 注入脚本中的两处字符串 + `main.ts` 中的两处字符串比较。

### 决策 2：ContextRegistry 预留 `sourceKey` 且冻结事件名

**Phase 1 已冻结（在 context-management 计划中）**，此处再次确认：

```typescript
// ContextRegistry 事件名冻结：
'context:added'    → { item: ContextItem }
'context:removed'  → { item: ContextItem }
'context:restored' → { items: ContextItem[] }

// ContextItem.sourceKey 语义冻结：
// - 自动源（BacklinkSource 等）通过 sourceKey 标识条目归属
// - removeBySourceKey(key) 用于 diff 删除旧条目
// - sourceKey 格式："{sourceName}:{stableId}"，如 "backlinks:path/to/file.md:42"
```

**理由**：
- `sourceKey` 是 Phase 2 自动上下文源（反向链接等）无需重构就能接入的关键字段
- 如果 Phase 1 不冻结此字段，Phase 2 的 BacklinkSource 将无法做增量 diff（只能全量删除重建，造成消息抖动）
- 事件名冻结确保 Phase 2 的 `OpenCodeEventListener` 可以直接监听这些事件，无需修改 ContextRegistry

### 决策 3：保留 `ContextManager` 作为 Obsidian 事件的唯一接入点

**冻结接口**：

```typescript
// ContextManager 是唯一监听 Obsidian workspace 事件的模块
// 其他模块不直接调用 app.workspace.on() / app.metadataCache.on()
// 如需感知 Obsidian 事件，通过以下方式之一：
//   1. ContextRegistry 事件（上下文条目变化）
//   2. 新增 ContextManager 回调（未来如需新的 Obsidian 事件类型）
```

**理由**：
- 当前 `ContextManager.updateListeners()` 已经集中管理了 6 种 Obsidian 事件监听
- 如果 Phase 2 的 `BacklinkSource` 或 `OpenCodeEventListener` 也各自监听 Obsidian 事件，会导致：
  - 同一 Obsidian 事件被多个模块重复监听（如 `metadataCache.on('changed')`）
  - 防抖逻辑分散，容易出现竞态
- ContextManager 作为「Obsidian → 插件内部事件总线」的适配层，保证事件流向清晰

**对 Phase 2 的影响**：
- `BacklinkSource` 不直接监听 `metadataCache`，而是由 ContextManager 在 `metadataCache.on('changed')` 时调用 `BacklinkSource.refresh()`
- 或者更简单：ContextManager 只在 `scheduleRefresh()` 中触发 `registry.add({ sourceKey, ... })`，BacklinkSource 只是一个**纯函数**，接收文件路径返回 `ContextSuggestion[]`

---

## 总结

当前架构的 `ContextRegistry` + `ContextSyncer` + `postMessage` 桥接**方向正确**，事件驱动解耦使 Phase 2 的扩展无需重构核心模块。但缺少一个对应 `ContextSyncer` 的反向模块来处理 **opencode → Obsidian** 方向的事件流。建议在 Phase 2 规划中新增 `OpenCodeEventListener`（名字待定），通过 Node.js `http` 订阅 `GET /event` SSE 流，将 opencode 事件转化为 Obsidian API 调用。

三条冻结决策的改动量极小（两条字符串重命名 + 确认已有冻结），现在执行不会阻塞 Phase 1 的交付。
