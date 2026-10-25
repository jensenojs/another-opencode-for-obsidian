# Context Module

这个目录拥有 Obsidian context 的事实与生命周期。

Owners：

- `ContextManager.ts` 协调 workspace/editor 事件、source driver、候选生命周期和 prompt 注入计划。
- `ContextAutoSources.ts` 把 Obsidian 观察转成 source result。
- `CandidateRegistry.ts` 拥有候选状态：identity、included/skipped、source clear、有界队列、one-shot 消费、失败状态。
- `PromptAttachments.ts` 把候选转成 prompt 文件附件。
- `PromptContextInjector.ts` 在发送边界写 `body.files`，并记录 `PromptDelivery`。
- `ContextItemNavigator.ts` 从候选安全导航到已有 vault 文件。
- `WorkspaceContext.ts` / `ContextFormatter.ts` / `AutoSelectionContextSource.ts` / `SelectionLineRange.ts` 拥有 workspace 与 selection 事实。

Flow：

```text
Obsidian workspace/editor facts
  -> source driver result
  -> CandidateRegistry
  -> buildPromptAttachments()
  -> prompt body.files
```

```text
candidate click
  -> ContextItemNavigator
  -> Obsidian vault / metadata / GraphIndex resolution
  -> WorkspaceLeaf.openFile
```

候选只有一个模型（`CandidateRegistry`），只有一个出口（prompt `files`）。不要为 UI 可见性另建状态：status bar 从 registry 派生。候选只在本地存活，没有服务端 message 生命周期，也没有 restore 路径。

StatusBar 和 prompt 附件是同一份候选状态的两种视图：

- status bar toggle 写 `CandidateRegistry.setIncluded(candidateId, included)`。
- 移除与 skip 是两个动作：移除删掉候选，skip 保留可恢复。
- one-shot 候选只由显式移除或发送成功后消费掉。
- dynamic workspace 候选走 skip-on-next-send，由 `consumeSent()` 恢复。

Workspace 与 selection 是不同事实：

- workspace 拥有 active file/line；折叠光标属于 workspace dynamic candidate。
- selection 只认非空选中文本。折叠编辑器里过期的 selected text 不作为 selection 输入。
- 重复或重叠的真实选区在 registry 里 upsert，并恢复 `included=true`，因为新的选区是新的用户意图。

需要判断“这条会不会发出去”时从 `CandidateRegistry` 派生，不要新增本地状态库。

关闭某个 source 时清掉它的候选。`included=false` 是单条候选的 skip 状态；不要为了让被禁用的 source 继续显示而保留它运行。
