# oc-ctx prompt-coupled behavior design

日期：2026-06-17

## 本文档地位

本文档固定 oc-ctx 第一阶段的产品行为和实现边界。

它替代早期文档中把候选上下文先写成独立 OpenCode context message 的主路径。
早期的 `synthetic + noReply` 机制仍然可以作为历史机制理解，但它不再是第一阶段自动上下文的推荐实现。

第一阶段的主路径是：

```text
Obsidian 本地候选
-> 用户在状态栏临时包含、跳过或移除
-> 用户发送 OpenCode prompt
-> included 候选作为同一条 prompt 的 synthetic parts 一起提交
```

这样上下文和用户正文属于同一条 OpenCode user message。revert 这条 prompt 时，用户正文和随 prompt 提交的上下文一起回退。

## 问题存在性检查

当前设置面把内部来源直接暴露给用户：

```text
Workspace 候选来源
选中文本候选来源
反向链接候选来源
光标候选来源
上下文提交行为：manual
```

这些名字来自实现，不来自用户工作流。用户关心的是：

- 我发送 OpenCode 消息时，插件会不会自动带上 Obsidian 上下文；
- 会带哪些上下文；
- 我能不能在发送前临时跳过；
- 临时选中的文本会不会反复污染后续对话；
- 关闭某个能力后，它是否彻底停止。

因此第一阶段要收紧行为，而不是增加更多来源开关。

## 目标

- 默认提供有价值的轻量上下文，降低复制、切换和解释成本。
- 用户发送 OpenCode prompt 时，included 候选随同一条 prompt 一起提交。
- 关闭某个来源后，该来源停止采集、清空已有候选，也不继续空转。
- 选中文本是一次性候选，发送成功后消费完毕。
- 工作区线索是持续状态，每次发送取当下快照。
- StatusBar 提供发送前控制，不提前写 OpenCode session。
- 第一阶段不接入粗糙 backlinks，不接入 GraphRAG。

## 非目标

- 不实现 GraphRAG。
- 不展开块引用原文。
- 不默认注入 backlinks。
- 不靠 DOM `keydown` 或按钮点击猜测发送动作。
- 不让 proxy 拥有 context 策略。
- 不把用户未启用的来源继续维护在后台。
- 不通过独立 context message 表示下一条 prompt 的上下文。

## 设置界面预期

设置页只展示用户能理解的行为。

```text
上下文辅助                                      [ 开 ]
发送 OpenCode 消息时，插件会把已包含的 Obsidian 上下文随同一条消息发送。
状态栏里可以临时跳过或移除候选。选中文本发送成功后会自动清空。

  工作区线索                                    [ 开 ]
  把当前打开的 Obsidian 笔记和活动位置作为轻量背景随消息发送。

    打开的笔记数量上限                          [ 3 ]
    限制进入上下文的打开笔记数量

    包含当前活动位置                            [ 开 ]
    可用时包含当前笔记和行号

  选中文本                                      [ 开 ]
  把你最近在 Obsidian 中选中的文本作为一次性候选上下文。

    最近选中文本数量                            [ 3 ]
    只保留最近选中的若干段文本

    单段文本长度上限                            [ 500 ]
    选中文本进入上下文前先按这个长度截断
```

删除这些设置项：

```text
Workspace 候选来源
选中文本候选来源
反向链接候选来源
光标候选来源
上下文提交行为：manual
```

行为说明只出现一次。每个具体开关下面只解释它对下一条消息有什么影响，不重复解释 OpenCode session、candidate、synthetic part 等实现细节。

## 行为合同

### 总开关：上下文辅助

开启时：

```text
Obsidian 事件
-> 本地候选池
-> 用户在状态栏临时包含、跳过或移除
-> 下一条 OpenCode prompt 一起发送
```

关闭时：

```text
清空所有 oc-ctx 本地候选
停止监听上下文来源
发送 OpenCode prompt 时不注入任何 oc-ctx 内容
```

这里没有“关了但仍然维护候选”的状态。关就是停。

### 工作区线索

开启时：

- 维护一个动态 workspace candidate。
- 默认 included。
- 发送 prompt 时，把当时的打开笔记列表和活动位置作为 synthetic part 一起发送。
- 发送后不清空，因为它是持续状态。
- 用户可以在 StatusBar 对下一条消息临时跳过。
- 临时跳过只影响下一条消息，之后回到默认 included。

关闭时：

- 清空 workspace candidate。
- 不监听 workspace open notes、active file、cursor location。
- 不显示 workspace 胶囊。
- 工作区的子选项隐藏或禁用。

工作区线索格式要轻，不粘贴当前光标附近正文。

示例：

```text
Obsidian workspace:
Active: src/icons.ts:L8

Open notes:
- docs/plans/context-control-surface.md
- src/context/ContextManager.ts
```

活动位置属于 workspace 的一部分。`cursor` 不再是顶层功能。

### 选中文本

开启时：

- 用户在 Obsidian 中选中文本后，生成一次性 selection candidate。
- 默认 included。
- 同一段选择按 `file + startLine + endLine + text fingerprint` 去重。
- 最多保留 3 段。
- 超过上限时移除最旧的候选。
- 用户可以在 StatusBar 临时跳过、恢复、移除某一段。
- 成功随 prompt 发送后，已发送的 selection candidates 全部移除。
- 发送失败时保留候选，并标记失败原因。

关闭时：

- 清空 selection candidates。
- 不监听 selection 变化。
- 不显示 selection 胶囊。
- selection 的子选项隐藏或禁用。

选中文本表达的是“下一次讨论请看这里”。它不是“以后每轮都反复带上”。

### 用户 toggle

StatusBar 的 toggle 只改本地候选状态。

```text
included -> 下一条 prompt 会带上
skipped  -> 下一条 prompt 不带上
remove   -> 删除这个临时候选
```

toggle 不调用 OpenCode API，不提前写 session，不产生 message id。

## Prompt 提交流程

用户在 OpenCode Web UI 里发送消息时：

```text
POST /session/{id}/message
  -> proxy 识别这是一条 prompt 请求
  -> context 模块读取当前 included candidates
  -> 把这些候选追加到同一个 request body 的 parts 里，标记 synthetic: true
  -> 请求继续发给 OpenCode
  -> OpenCode 创建一条 user message，里面同时有用户正文和 synthetic context
  -> 成功后清空已消费的一次性 selection candidates
```

主路径不使用 `noReply`。

`noReply` 只适合旧机制：单独写一条 context message，但不触发 assistant 回复。
第一阶段的自动上下文不需要先写独立 message，因此不需要 `noReply`。
如果后续没有明确的调试或手动同步用途，应删除这条旧路径。

## Revert 行为

因为上下文和用户正文在同一条 OpenCode message 里：

```text
revert 这条 prompt
  -> 用户正文消失
  -> 随 prompt 提交的 context 也一起消失
```

这避免独立 context message、空 timeline row、删除 context 后残留空白等问题。

## StatusBar 预期

闭合状态：

```text
OpenCode ctx   [工作区] [选区 1] [选区 2]
```

展开状态：

```text
下一条消息将包含

✓ 工作区线索
  2 个打开笔记，当前位置 src/icons.ts:L8
  [跳过一次]

✓ 选中文本
  src/context/ContextManager.ts:L120-L136
  [跳过] [移除]

○ 选中文本
  docs/plans/context-control-surface.md:L40-L52
  [包含] [移除]
```

规则：

- `✓` 表示 included。
- `○` 表示 skipped。
- 工作区是动态状态，提供“跳过一次”，不提供“移除”。
- 选中文本是一次性候选，提供“跳过/包含”和“移除”。
- 没有候选时，不显示主动作按钮。
- 不再把 “Attach” 作为主要行为文案。

## 代码形状

目标调用链：

```text
ContextSourceDriver
  -> CandidateRegistry
    -> ContextStatusBar toggle
      -> PromptContextInjector
        -> OpenCodeWebUiProxy prompt request hook
```

模块职责：

- `ContextSourceDriver`：只产出本地候选。
- `CandidateRegistry`：维护候选、included/skipped、一次性消费状态。
- `ContextStatusBar`：只渲染和委托用户动作。
- `PromptContextInjector`：把 included candidates 转成 OpenCode prompt parts。
- `OpenCodeWebUiProxy`：识别 prompt POST，调用注入器，转发修改后的 JSON body。
- `ContextManager`：根据 settings 管理 source driver 生命周期。

`OpenCodeWebUiProxy` 不能拥有上下文策略。它只知道这是不是一条 OpenCode prompt 请求，以及修改后的 body 要怎么转发。

新增或收紧：

- `PromptContextInjector`：把 included candidates 转成 OpenCode prompt `parts`。
- `CandidateRegistry.consumeSentCandidates()`：成功发送后清理一次性候选。
- `CandidateRegistry.clearSource()`：来源关闭时立即清空对应候选。
- `ContextManager`：负责 settings 到 source driver 生命周期，不让关闭的 source 空转。

删除或降级：

- 自动主路径不再调用 `ContextSyncer.addContextMessage(... noReply: true ...)`。
- 设置页不再显示 `contextCommitMode`。
- `cursor` source 并入 workspace active location。
- `backlinks` source 从第一阶段 UI 移出。

## 设置 shape 草案

旧的 `candidateSources.workspace/selection/backlinks/cursor` 不做兼容迁移。
加载旧设置时直接丢弃这些旧键，使用新的默认设置。

建议 shape：

```ts
interface ContextAssistSettings {
  enabled: boolean;
  workspace: {
    enabled: boolean;
    maxOpenNotes: number;
    includeActiveLocation: boolean;
  };
  selection: {
    enabled: boolean;
    maxSnippets: number;
    maxCharsPerSnippet: number;
  };
}
```

默认值：

```ts
contextAssist: {
  enabled: true,
  workspace: {
    enabled: true,
    maxOpenNotes: 3,
    includeActiveLocation: true,
  },
  selection: {
    enabled: true,
    maxSnippets: 3,
    maxCharsPerSnippet: 500,
  },
}
```

## 验收标准

### 设置默认值

- `contextAssist.enabled = true`
- `contextAssist.workspace.enabled = true`
- `contextAssist.workspace.maxOpenNotes = 3`
- `contextAssist.workspace.includeActiveLocation = true`
- `contextAssist.selection.enabled = true`
- `contextAssist.selection.maxSnippets = 3`
- `contextAssist.selection.maxCharsPerSnippet = 500`
- 设置页没有独立 `cursor`、`backlinks`、`contextCommitMode`。

### 关闭行为

- 关闭总开关会清空所有候选，并停止 source listener。
- 关闭 workspace 会清空 workspace candidate。
- 关闭 selection 会清空 selection queue。
- 被关闭的来源不继续维护候选。

### 选中文本

- 重复选择不新增。
- 第 4 段选择会顶掉第 1 段。
- skipped 候选不进入 prompt parts。
- 成功发送后，已发送 selection candidates 被移除。
- 发送失败时，selection candidates 保留并标记 failed。

### prompt 注入

- OpenCode prompt body 被追加 `synthetic: true` text parts。
- 用户正文仍是普通 text part。
- 主路径不写 `noReply`。
- 非 prompt 请求原样转发。
- 一次 prompt 只产生一条 user message。

### session UI 和 revert

- 不产生独立 plugin-owned context message。
- 不产生空 timeline row。
- revert prompt 后，用户正文和随 prompt 提交的 context 一起消失。

### 结构检查

实现完成后执行：

```bash
rg "contextCommitMode|Backlink.*Candidate|Cursor.*Candidate|Attach included" src tests
rg "noReply" src/context src/proxy src/client tests
bun run check
```

允许 `noReply` 出现在历史文档或明确的 legacy/debug 测试里。
自动 prompt 注入主路径不允许依赖 `noReply`。

## 依据

当前本仓库相关文件：

- `src/types.ts`
- `src/context/CandidateRegistry.ts`
- `src/context/ContextCommitPolicy.ts`
- `src/context/ContextManager.ts`
- `src/context/AutoSelectionContextSource.ts`
- `src/context/CursorContextSource.ts`
- `src/context/BacklinkContextSource.ts`
- `src/proxy/OpenCodeWebUiProxy.ts`
- `src/settings/SettingsTab.ts`

本地 OpenCode 源码中，`PromptInput` 支持 `parts`、`synthetic` 和 `noReply`：

- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/src/session/prompt.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/components/prompt-input/build-request-parts.ts`

这些依据说明两件事：

- `synthetic` 是表达“给模型看的上下文，但不是普通用户正文”的合适标记。
- `noReply` 只适合独立写 message 后不触发回复，不适合第一阶段主路径。
