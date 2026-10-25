> 2026-10-25 更新：本文调研的上下文注入方式（`noReply` 静默消息、`updatePart`/`ignored` 的 part 生命周期、`updateContext()`）在 0.6.0 已全部删除。
> 当前形状见 [v2-attach-spec.md](../plans/v2-attach-spec.md)：上下文是 `POST /api/session/{id}/prompt` body 里的 `files` 附件，不写消息、不改 part。
> 下文的 API 行为记录保留为当时的调研；涉及「插件应该怎么做」的段落已按现状改写。

# OpenCode Server API 与 Web UI 上下文机制调研

## 概述

本报告调研 opencode server 的 HTTP API、Web UI / TUI 界面中上下文（context）的呈现方式，以及消息（message）和 part 的渲染机制。调研基于 opencode v0.0.55 源码（anomalyco/opencode）、官方文档（opencode.ai/docs）以及 another-opencode-for-obsidian 插件中的实际 API 调用模式。

2026-06-16 更新：本文记录的 `ignorePreviousPart()` / `ignored: true`
策略已经被当前 context lifecycle 合同取代。当前插件写入带 `<!-- oc-ctx
-->` marker 的 synthetic context message；移除插件 context 时删除整条
OpenCode message。真实 Obsidian + OpenCode Web UI 运行态已经证明：只把
synthetic context part 标成 `ignored` 会隐藏文本，但仍会留下空的
`UserMessage` timeline row，造成 session 中间大块空白和滚动到底异常。
旧段落保留为历史调研，不作为当前实现计划。

opencode 采用 client/server 架构：JS Hono HTTP 服务器暴露 OpenAPI 3.1 接口，Go TUI 和 Web UI 作为客户端通过 HTTP/SDK 与服务器通信。

## 关键文件

- `packages/opencode/src/session/prompt.ts` — `Session.prompt()` 核心逻辑，处理 `noReply` 和 `ignored` 字段
- `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts` — Session 相关 HTTP API 路由
- `packages/opencode/src/server/routes/instance/httpapi/groups/tui.ts` — TUI 控制 API（`appendPrompt`、`submitPrompt` 等）
- `packages/sdk/js/src/gen/types.gen.ts` — 自动生成的 TypeScript 类型定义（Session、Message、Part 等）
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` — TUI 消息/part 渲染逻辑
- `src/client/OpenCodeClient.ts` — obsidian 插件中 opencode API 调用实现
- `src/context/ContextManager.ts` — obsidian 插件上下文注入调度器

## 调研发现

### 1. Web UI / TUI 如何呈现上下文（Context）

**结论：openCode 没有专门的「上下文面板」。上下文以普通消息的形式出现在对话流中，且静默上下文（`noReply: true`）默认不可见。**

#### 上下文来源与展示方式

opencode 的上下文机制完全依赖于消息（Message）和 part 系统。没有独立的 `session.context` 端点或 UI 面板。上下文通过以下方式进入对话：

1. **用户手动输入** — 通过 TUI 输入框或 `session.prompt()` API
2. **静默注入**（`noReply: true`）— 插件/外部工具向会话注入背景信息
3. **系统提醒**（synthetic parts）— opencode 内部生成系统提醒（如 agent 切换、编辑器选中文本）
4. **文件附件**（FilePart）— 通过 `--file` 标志或拖拽添加

**在 TUI 中的呈现：**

- `UserMessage` 组件渲染用户消息时，只收集 `type === "text" && !synthetic` 的 text parts，**过滤掉 `synthetic` 和 `ignored` 的 parts**。
- 源码证据（`session/index.tsx` line 1312）:
  ```typescript
  const text = createMemo(() => {
    const texts = props.parts
      .map((x) => {
        if (x.type === "text" && !x.synthetic) {
          return x.text
        }
        return null
      })
      .filter(Boolean)
    return texts.join("\n\n")
  })
  ```
- **因此 `noReply: true` 注入的静默消息如果标记为 `synthetic: true`，在 TUI 中不可见。**
- 如果消息只包含 `synthetic` parts，整个 UserMessage 气泡都不渲染（`<Show when={text()}>`）。

**在 Web UI 中的呈现：**

Web UI 通过 SSE 事件流接收 `message.updated` / `message.part.updated` 事件，渲染逻辑与 TUI 一致——`synthetic` 和 `ignored` parts 默认不可见。但 Web UI 支持切换 `conceal` 模式来显示/隐藏代码块（非上下文）。

**当前 obsidian 插件的行为：**

插件在 `OpenCodeClient.updateContext()` 中通过 `session.prompt({ noReply: true, parts: [{ type: "text", text: contextText }] })` 注入上下文。此消息在 opencode 的 TUI/Web UI 中**不可见**——因为它是静默消息（无 AI 回复），而且如果后续被 `ignore` 后也看不到。

#### 上下文消息的生命周期（当时的设计，已废弃）

当时插件用「更新而非堆积」管理上下文：首次注入 `sendPrompt()` 建 UserMessage、上下文变化 `updatePart()` 改 part 文本、清空时 `ignorePreviousPart()` 标 `ignored`、切换会话 `resetTracking()` 重置。这条链路依赖 `POST /session/{id}/message` 与 PATCH part 两个 v1 接口，在 2.1.3 上都没有对应能力。

现在的做法不再有消息与 part 生命周期：候选由 `CandidateRegistry` 持有，prompt 请求边界把它们变成 `files` 附件，one-shot 候选在请求成功后消费，失败时保留并标 failed。没有「更新既有上下文消息」这一步。

### 2. 上下文管理相关 API

#### 核心 API 汇总

| 端点 | 方法 | 用途 | 与上下文的关系 |
|------|------|------|----------------|
| `/session/:id/message` | `POST` | 发送消息，等待 AI 回复 | `noReply: true` 时静默注入上下文，无 AI 回复 |
| `/session/:id/message/:mid/part/:pid` | `PATCH` | 更新 part（text、ignored 等） | 修改已有上下文消息的内容或可见性 |
| `/session/:id/message` | `GET` | 列出会话所有消息 | 获取完整对话历史，包含上下文消息 |
| `/session/:id/message/:mid` | `GET` | 获取单条消息详情 | 查看某条消息的所有 parts |
| `/session/:id/prompt_async` | `POST` | 异步发送消息（无等待） | 同 `session.prompt` 但不等待回复 |
| `/tui/append-prompt` | `POST` | 追加文本到 TUI 输入框 | 预填上下文到输入框（用户可见） |
| `/tui/submit-prompt` | `POST` | 提交当前输入框内容 | 触发提交（等于用户按回车） |
| `/session/:id/revert` | `POST` | 回退某条消息 | 撤销上下文注入（可选指定 partID） |

#### `session.prompt` 的 `noReply` 参数

这是 opencode 上下文管理的关键机制。

```typescript
// TypeScript SDK 用法
await client.session.prompt({
  path: { id: sessionId },
  body: {
    noReply: true,  // ← 关键参数
    parts: [{ type: "text", text: "You are a helpful assistant." }],
  },
})
```

- **`noReply: true`**：创建 UserMessage 后**立即返回**，不调用 AI 循环。返回 `UserMessage` 对象（不是 `AssistantMessage`）。
- **`noReply: false`（默认）**：创建 UserMessage 后调用 AI 循环（`loop()`），等待并返回 `AssistantMessage`。
- 源码证据（`session/prompt.ts` line 1228）:
  ```typescript
  if (input.noReply === true) return message
  return yield* loop({ sessionID: input.sessionID })
  ```

**`noReply: true` 的消息在 UI 中是否可见？**

- 如果消息的 text parts 包含 `synthetic: true`，则在 TUI 中**完全不可见**（被 `UserMessage` 组件过滤）。
- 如果 parts 是普通 text（无 `synthetic` 标记），则**可见**但**没有 AI 回复**，在对话流中显示为一条孤立的用户消息。
- obsidian 插件发送的静默上下文消息中，parts 没有标记 `synthetic`，理论上在 TUI 中可见。但插件随后会用 `ignored: true` 将其标记为忽略，使其在后续渲染中被过滤。

#### `message.part` 的 `ignored` 字段

`Part` 类型中的 `ignored?: boolean` 字段用于标记该 part 应被忽略。

- **在 UI 中**：被 `ignored: true` 标记的 parts **完全不显示**。源码在多个位置过滤：
  - 消息跳转逻辑：`parts.some((part) => part.type === "text" && !part.synthetic && !part.ignored)` — 跳转到「最后一条用户消息」时跳过 ignored parts
  - 可见消息查找：同上逻辑，不将 ignored parts 所在消息视为「可见」
  - 上下文压缩：`if (p.type !== "text" || p.ignored || p.synthetic) continue` — 压缩时跳过 ignored parts

- **在 API 中**：通过 `PATCH /session/:id/message/:mid/part/:pid` 修改 `{ ignored: true }`

**这意味着 `ignored` parts 不是「灰掉」，而是从 UI 中完全消失。** 但它们仍然存在于数据库中，可以通过 API 查询。

#### 是否有获取当前会话完整上下文列表的 API？

**没有专用的 `session.context` 端点。** 获取上下文的方式是：

- **`GET /session/:id/message`** — 列出会话所有消息及其 parts，过滤 `!ignored && !synthetic` 即可得到有效上下文
- **`GET /event`**（SSE 流）— 实时订阅 `message.updated`、`message.part.updated` 事件

Part 类型定义中包含以下可能有意义的字段：

| Part 类型 | 关键字段 | 用途 |
|-----------|---------|------|
| `TextPart` | `text`, `synthetic?`, `ignored?` | 文本内容（含系统提醒） |
| `FilePart` | `filename`, `url`, `mime`, `source?` | 文件附件 |
| `ToolPart` | `tool`, `state` (pending/running/completed/error) | 工具调用及结果 |
| `ReasoningPart` | `text` | AI 推理过程 |
| `SubtaskPart` | `prompt`, `description`, `agent` | 子任务 |
| `CompactionPart` | `auto` | 上下文压缩标记 |

### 3. 选中文本发送策略

#### `tui.appendPrompt(text)` API

- **端点**：`POST /tui/append-prompt`，body: `{ text: string }`
- **行为**：将文本**追加到 TUI 的输入框（prompt）中**，不会自动提交。
- **Web UI**：此 API 仅对 TUI 有效。Web UI 使用独立的输入机制。
- **用户可见性**：追加后用户可以在 TUI 输入框中看到文本，**可以继续编辑再手动发送**。

```typescript
// SDK 用法
await client.tui.appendPrompt({
  body: { text: "Add this to prompt" },
})
```

#### `tui.submitPrompt()` vs `session.prompt(noReply: false)`

| 特性 | `tui.submitPrompt()` | `session.prompt(noReply: false)` |
|------|---------------------|----------------------------------|
| **端点** | `POST /tui/submit-prompt` | `POST /session/:id/message` |
| **前提** | TUI 正在运行 | 任何 HTTP 客户端 |
| **输入来源** | TUI 输入框当前内容 | API body 直接提供 parts |
| **用户交互** | 等于用户按回车，输入框清空 | 无 TUI 交互 |
| **返回** | `boolean`（操作是否执行） | `{ info: AssistantMessage, parts: Part[] }` |
| **适用场景** | IDE 插件触发 TUI 提交 | 后台/脚本直接发消息 |

**区别总结**：`tui.submitPrompt()` 是「替用户按回车」，依赖 TUI 输入框的状态；`session.prompt()` 是直接 API 调用，不经过 TUI 输入框。

#### Web UI 如何处理 `tui.appendPrompt`？

`tui.appendPrompt` 是 TUI 专属 API，**Web UI 不支持此端点**。如果通过 HTTP 调用 `/tui/append-prompt`，它操作的是已连接的 TUI 客户端的输入框，不影响 Web UI。

### 4. 消息和 Part 的 UI 呈现

#### 一条 Message 包含多个 Parts 时如何渲染？

在 TUI 中（`session/index.tsx`）：

```
UserMessage 组件:
  收集所有 text parts（过滤 synthetic）→ 拼接成单一文本块显示
  收集所有 file parts → 显示为文件标签

AssistantMessage 组件:
  遍历 parts，根据 PART_MAPPING 动态渲染每个 part:
    text      → TextPart 组件（markdown 渲染）
    tool      → ToolPart 组件（根据 tool 名称分发到具体组件）
    reasoning → ReasoningPart 组件（可折叠的思考过程）
```

- **每个 part 是独立渲染的**，不是合并成一个气泡。
- TextPart 渲染为独立段落（`marginTop={1}`），通过 `margin` 分隔。
- ToolPart 根据工具类型分发到特化组件（Shell、Read、Write、Edit、Task 等）。
- 不同 parts 之间没有合并——即使是连续的两个 `text` parts 也会分别渲染。

#### `ignored: true` 的 Part 是否可见？

**不可见。** 在 TUI 和 Web UI 中，`ignored: true` 的 parts 被完全过滤，不参与任何渲染。具体过滤位置：

1. `UserMessage` 组件收集 text 时：只取 `!synthetic`（不排除 ignored，但实际 ignored parts 通常是之前已被标记的）
2. 消息跳转逻辑：`parts.some(part => part.type === "text" && !part.synthetic && !part.ignored)`
3. 上下文压缩：`if (p.ignored) continue`

被 ignore 的 parts 仍然存储在数据库中，可以通过 `GET /session/:id/message/:mid` API 查询到。

#### 用户能否在 Web UI / TUI 中手动操作 Part？

**不能直接操作 part。** 但可以通过以下间接方式：

- **Revert（回退）**：回退某条消息 → 恢复该消息之前的状态，可指定到某个 part
  - 命令：`session.revert`（快捷键或命令面板）
  - API：`POST /session/:id/revert { messageID, partID? }`
  - 用途：撤销上下文注入或错误回复
- **Fork（分叉）**：从某条消息分叉创建新会话
  - API：`POST /session/:id/fork { messageID? }`
- **Copy（复制）**：复制 assistant 消息的纯文本内容到剪贴板
- **消息动作对话框**（`DialogMessage`）：提供 Revert / Copy / Fork 三个选项

**没有删除、单独编辑 part 的 UI 操作。** Part 的修改只能通过 API（`PATCH`）完成。

---

## 总结

1. **上下文不可见问题**：`noReply` 静默消息在 opencode UI 中不可见，用户不知道 AI 收到了哪些 Obsidian 上下文。0.6.0 之后上下文通过 prompt `files` 附件随请求发出，Obsidian 侧 status bar 显示候选集与「上一次 prompt 带了几个附件」，UI 侧仍看不到这些内容——这一点没有解决，只是换了载体。

2. **v1 消息/part 操作已不可用**：`noReply`、`updatePart`、`ignored` 都挂在 v1 消息接口上，2.1.3 没有对应的写接口（`GET /api/session/{id}/message` 只读）。依赖它们的注入策略不能照搬。

3. **`tui.appendPrompt()` 路径**仍是把上下文交给用户编辑的候选方向，但它属于 TUI，插件当前没有接入。
