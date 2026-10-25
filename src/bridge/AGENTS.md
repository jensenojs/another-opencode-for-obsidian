# Bridge Module

这个目录拥有 Obsidian 与 OpenCode 的执行边界：本地 HTTP 代理、HTML head 注入、iframe 内 hook、本地 message 协议、事件诊断、外观注入。哪些上下文该进 prompt 不在这里决定。

## Local Gold Standards

先看本地导出面，再看文档。

- Obsidian public API：`node_modules/obsidian/obsidian.d.ts`
- OpenCode HTTP 契约：`<checkout>/packages/protocol/openapi.json`
- OpenCode Web UI DOM 事实：`<checkout>/packages/app/src/**`

Web UI 内部 shape 只允许出现在注入脚本里。不要把它扩散到 `context/`、`ui/` 或 `main.ts`。

## Owners

- `ProxyInjection.ts` 组装注入进 HTML 的 CSS/JS：外观 token、bridge 脚本、首帧 theme payload。
- `OpenCodeWebUiProxy.ts` 拥有代理 transport：端口探测、auth 头注入、HTML 注入、prompt 请求 hook、`extractPromptSessionId()`。JS/CSS asset 原样直通。
- `BridgeInjection.ts` 拥有 iframe 内 hook：从 OpenCode DOM 取出被点击的 vault path，发 `vault-file:open`；注入完成后发 `proxy:loaded`。
- `BridgeProtocol.ts` 拥有本地 message：`proxy:loaded`、`theme:diagnostics`、`theme:update`、`vault-file:open`。
- `OpenCodeBridge.ts` 拥有 `/api/event` 连接生命周期和 diagnostics。

## Flows

```text
OpenCode iframe user action
  -> BridgeInjection
  -> BridgeProtocol message
  -> main.ts origin/type/version 校验
  -> ContextItemNavigator / ViewManager / theme sync / diagnostics
```

```text
Obsidian prompt request
  -> OpenCodeWebUiProxy prompt hook
  -> main.ts preparePromptContext(sessionId, body)
  -> prompt body.files
```

```text
OpenCode /api/event
  -> OpenCodeBridge
  -> RuntimeDiagnostics
```

## Prompt Hook Contract

`extractPromptSessionId(path)` 只认 `POST /api/session/<id>/prompt`。命中后 proxy 调用
`updatePromptRequestHook()` 注册的 hook，再调用 outcome hook：

```ts
interface PromptRequestHookInput {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

interface PromptRequestHookResult {
  body: Buffer;
  headers?: http.OutgoingHttpHeaders;
  planId?: string;
}
```

hook 返回 null 表示不改写请求；返回结果时 proxy 用新的 body/headers 转发。outcome hook 收到
`{ ok, statusCode?, error? }` 和 `planId`，插件据此消费 one-shot candidate 或标记失败。附件只追加到
prompt body 的 `files`，不读也不改 `parts`。

## Obsidian Appearance Baseline

- iframe document 自己拥有最终像素。不要恢复透明 iframe 依赖父窗口透出的路径。
- Background 插件启用时，iframe 内部只允许 `body::before` 画一层 workspace background，合同是 `obsidian-workspace-background-v1`。
- source variables 是父窗口事实，例如 `--obsidian-editor-background-*` / `--obsidian-workspace-background-*`；paint variables 是 iframe 内 `--another-opencode-for-obsidian-workspace-background-*`。桥接只做命名、过滤和派生。
- 不把 active editor rect、iframe rect、负 offset、workspace union rect、父窗口大画布或 host pane background 写回生产绘制输入。
- OpenCode v2 tokens 是主题桥接主面。legacy token 只能 alias 到 v2 token 或保持透明。
- Obsidian appearance 下禁用 iframe 内 `backdrop-filter` 跨像素采样。允许 alpha surface、border、shadow、scrim，以及对 iframe 自己背景图做普通 `filter`。
- theme diagnostics 和 harness theme check 必须能说明 root 背景、workspace background layer、large element samples 和 backdrop-filter samples。

这组规则的目的很窄：让 OpenCode 看起来像 Obsidian 里的工作面，同时避免 Electron iframe 透明合成、滚动采样和多层背景带来的残影或闪动。不要为了单张截图恢复旧实验路径。

## Code Rule

新增 bridge 能力时先标出它消费的本地来源：Obsidian public API、OpenCode OpenAPI 端点，还是 Web UI source。属于 Web UI source 的能力只能通过 `BridgeInjection.ts` / `ProxyInjection.ts` 的注入脚本表达。不要把 Web UI 内部 selector、Solid store shape、localStorage key 分散进 `context/`、`ui/`、`main.ts` 或 harness。

改写 OpenCode JS asset 来注入 UI 需要跟随每个版本的内部锚点；2.1.3 上这些锚点已不存在，这条路径已经删掉，不要重新引入。
