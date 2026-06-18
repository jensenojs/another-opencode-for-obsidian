# Bridge Module

这个目录拥有 Obsidian 和 OpenCode 的边界。这里的 bridge 包含 HTTP proxy、HTML 注入、iframe 内 hook、本地 message 协议、OpenCode server event diagnostics，以及未来把 Obsidian context 送进 OpenCode 原生 prompt context card 的适配器。

## Local Gold Standards

先看本地导出面，再看文档或 issue。

Obsidian 的稳定来源：

- `node_modules/obsidian/obsidian.d.ts`
- 这里确认 `Plugin`、`Workspace`、`WorkspaceLeaf`、`Vault`、`MetadataCache`、`TFile`、`getLanguage()` 等 public API。

OpenCode 的稳定来源：

- `/Users/oujinsai/Projects/ai-cli/opencode/packages/plugin/package.json`
  - `@opencode-ai/plugin` exports: `.`, `./tool`, `./tui`
  - `packages/plugin/src/index.ts` 定义 server plugin `Hooks`
  - `packages/plugin/src/tui.ts` 定义 TUI plugin API
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/sdk/js/package.json`
  - `@opencode-ai/sdk` exports: `.`, `./client`, `./server`, `./v2`, `./v2/client`, `./v2/gen/client`, `./v2/server`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/opencode/package.json`
  - `opencode` package export 是 `./* -> ./src/*.ts`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/server/package.json`
  - `@opencode-ai/server` package export 是 `./* -> ./src/*.ts`

OpenCode Web UI 的当前来源：

- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/context/prompt.tsx`
  - `ContextItem`
  - `FileContextItem`
  - `PromptProvider`
  - `prompt.context.add/remove/removeComment/updateComment/replaceComments`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/components/prompt-input/context-items.tsx`
  - prompt context card 的渲染和点击/移除行为
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/components/prompt-input/submit.ts`
  - prompt 发送时读取 `prompt.context.items()`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/pages/session/use-session-commands.tsx`
  - session 页面命令入口
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/pages/session/file-tabs.tsx`
  - session 文件 tab 行为

Web UI prompt context 现在属于 OpenCode app 内部 source，不属于 `@opencode-ai/plugin` 或 SDK 的公开导出。插件侧如果使用它，代码入口放在 `OpenCodePromptContextAdapter.ts`，并把内部 shape 限定在这个文件和 `BridgeInjection.ts` 的执行点里。

当前设计文档：

- `docs/plans/2026-06-18-opencode-native-prompt-context-bridge.md`
  - 记录 live bundle patch 实验复现；
  - 固定 `window.__anotherOpenCodeForObsidianPromptContext` 的低层 API；
  - 固定 `CandidateRegistry -> native prompt context card` 的同步方案；
  - 固定 native card 删除回写 `CandidateRegistry` 的要求。

## Owners

- `OpenCodeWebUiProxy.ts` 拥有嵌入式 OpenCode Web UI 的 HTTP proxy transport。
- `ProxyInjection.ts` 拥有注入到 HTML 的 CSS/JS asset 组装。
- `BridgeInjection.ts` 拥有 iframe 内 UI hook 安装和未来 live Web UI action 执行点。
- `BridgeProtocol.ts` 拥有 iframe 到 Obsidian 主线程的本地 message shape。
- `OpenCodeBridge.ts` 拥有 OpenCode server event diagnostics。
- `OpenCodePromptContextAdapter.ts` 拥有 Obsidian context 到 OpenCode 原生 prompt context card 的 future adapter contract。

`context/` 拥有 Obsidian facts 和 candidate decisions。`bridge/` 拥有把这些 decisions 送进 OpenCode UI 的执行边界，也拥有把 OpenCode iframe 里的用户动作送回 Obsidian 的执行边界。

Expected native prompt context bridge shape:

```text
OpenCodeWebUiProxy
  -> OpenCodePromptContextBundlePatch
  -> BridgeInjection
    -> BridgeProtocol prompt-context:* messages
    -> NativePromptContextBridge
      -> OpenCodePromptContextAdapter
```

`OpenCodePromptContextBundlePatch` owns minified bundle patching and anchor counts. `BridgeInjection` owns iframe-side hook installation and message emission. `NativePromptContextBridge` owns sync, OpenCode key ownership, and activation entries. `OpenCodePromptContextAdapter` owns OpenCode prompt context item shape, key/result types, and conversion only.

Do not put source policy, GraphRAG policy, selection queue, or Obsidian link resolution in these bridge files. Those decisions belong to `context/` and `graph/`; bridge only executes already-decided projections.

## Prompt Context Card Contract

OpenCode 原生 prompt context card 当前接受 file context item：

```ts
type FileContextItem = {
  type: "file";
  path: string;
  selection?: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
  comment?: string;
  commentID?: string;
  commentOrigin?: "review" | "file";
  preview?: string;
};
```

Obsidian context candidate 进入 native card 的预期形状：

```text
src/context
  -> decides ContextCandidate
  -> context/PromptContextProjection builds native-file-card projections
  -> bridge/NativePromptContextBridge syncs projection lifecycle
  -> bridge/OpenCodePromptContextAdapter maps projection to OpenCode file context item
  -> bridge port calls window.__anotherOpenCodeForObsidianPromptContext.add/remove/updateComment
  -> OpenCode renders PromptContextItems
```

这里的 adapter 只做 OpenCode item/key/result 类型与转换。source discovery、候选 included/skipped 状态、GraphRAG 策略、Obsidian link/subpath 解析仍在 `context/` 或 `graph/`。OpenCode key ownership map 和 activation table 属于 `NativePromptContextBridge`，不属于 adapter。

## Flows

Obsidian context 到 OpenCode Web UI：

```text
Obsidian workspace/editor/vault facts
  -> context source driver
  -> CandidateRegistry
  -> OpenCodePromptContextAdapter
  -> BridgeInjection or future PromptProvider bridge
  -> OpenCode native prompt context card
```

OpenCode Web UI action 到 Obsidian：

```text
OpenCode iframe user action
  -> BridgeInjection
  -> BridgeProtocol message
  -> main.ts origin/type/version validation
  -> ContextItemNavigator / ViewManager / theme sync / diagnostics
```

OpenCode server event 到 diagnostics：

```text
OpenCode server event stream
  -> OpenCodeBridge
  -> RuntimeDiagnostics
```

## Code Rule

新增 bridge 能力时先标出它消费的本地来源：

- Obsidian public API: `node_modules/obsidian/obsidian.d.ts`
- OpenCode package export: package `exports`
- OpenCode SDK endpoint: `@opencode-ai/sdk` generated client
- OpenCode Web UI source: `packages/app/src/**`

属于 Web UI source 的能力要经过 `BridgeInjection.ts` 或 future adapter 文件表达。不要把 Web UI 内部 selector、Solid store shape、localStorage key、PromptProvider shape 分散进 `context/`、`ui/`、`main.ts` 或测试 harness。

实现 native prompt context card 时：

- `OpenCodeWebUiProxy.ts` 或 bridge helper 负责 patch OpenCode `index-*.js`；
- patch anchor 必须唯一；
- patch 失败必须写 diagnostics；
- `OpenCodeFileContextItem.path` 是 OpenCode 发送路径；Obsidian 导航路径只能放在 projection `clickAction`；
- 无法转换成 OpenCode 可读取路径的 candidate 不能生成 native file card；
- `projectionId` 是稳定呈现槽位，不能包含 fingerprint、OpenCode key、line range 或 active line；
- `add()` / `remove()` / `removeComment()` 必须返回可审计结果，不能用 OpenCode 原生 `void` 当同步成功依据；
- key conflict 时不能注册 activation entry，不能回写 CandidateRegistry 为 synced；
- 普通 file card 更新用 remove old key + add new item；
- comment card 更新用 `updateComment(path, commentID, next)`，保持顺序；
- 删除 projection 时，bridge 根据 item shape 选择 `remove(key)` 或 `removeComment(path, commentID)`，`context/` 只表达 projection 生命周期；
- OpenCode 原生卡片叉号删除后，bridge 必须回写 `CandidateRegistry`，payload 必须带 `origin: "card-close"`；
- plugin-owned native card close 的语义是 `CandidateRegistry.setIncluded(candidateId, false)`，不是删除 candidate；StatusBar 可以重新 toggle 恢复；
- OpenCode 自己创建的 comment card 也要镜像成 registry candidate；comment card close 的语义是 skip，不是删除评论事实；
- mirrored OpenCode comment card close 必须接管 `PromptContextItems` 的 close handler，只移除 prompt context item，保留 OpenCode comments store；
- 显式删除评论气泡或 review/file comment menu 时，才允许删除 OpenCode comments store；
- bridge 自己触发 remove、OpenCode submit/edit 清 context 时，不得回写 `CandidateRegistry`；
- OpenCode 原生卡片点击后，bridge 先按 key 解析 activation entry；OpenCode comment 使用 `opencode-open-comment`，workspace、selection、GraphRAG 使用各自注册的 `clickAction`；
- 第一阶段不创建 plugin-owned comment card；
- 禁止用 DOM selector、class name、localStorage、sessionStorage 或 persisted prompt storage 作为 native card 成功路径；
- OpenCode prompt context persisted storage 只是 OpenCode Web UI 的持久化细节，不是插件状态源；
- `StatusBar` 和 OpenCode native card 可以同时存在，但只能表达同一份候选状态。
