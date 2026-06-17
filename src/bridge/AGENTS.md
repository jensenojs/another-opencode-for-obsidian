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

## Owners

- `OpenCodeWebUiProxy.ts` 拥有嵌入式 OpenCode Web UI 的 HTTP proxy transport。
- `ProxyInjection.ts` 拥有注入到 HTML 的 CSS/JS asset 组装。
- `BridgeInjection.ts` 拥有 iframe 内 UI hook 安装和未来 live Web UI action 执行点。
- `BridgeProtocol.ts` 拥有 iframe 到 Obsidian 主线程的本地 message shape。
- `OpenCodeBridge.ts` 拥有 OpenCode server event diagnostics。
- `OpenCodePromptContextAdapter.ts` 拥有 Obsidian context 到 OpenCode 原生 prompt context card 的 future adapter contract。

`context/` 拥有 Obsidian facts 和 candidate decisions。`bridge/` 拥有把这些 decisions 送进 OpenCode UI 的执行边界，也拥有把 OpenCode iframe 里的用户动作送回 Obsidian 的执行边界。

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
  -> bridge/OpenCodePromptContextAdapter maps it to OpenCode file context item
  -> bridge/BridgeInjection executes prompt.context.add(item) when a stable Web UI entry exists
  -> OpenCode renders PromptContextItems
```

这里的 adapter 只做形状转换和 ownership 标记。source discovery、候选 included/skipped 状态、GraphRAG 策略、Obsidian link/subpath 解析仍在 `context/` 或 `graph/`。

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
