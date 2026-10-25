# Source Owner Map

两边的金标准都是本机可读的实体：

- Obsidian public plugin API：`node_modules/obsidian/obsidian.d.ts`
- OpenCode HTTP 契约：`<checkout>/packages/protocol/openapi.json`
- OpenCode Web UI source：`<checkout>/packages/app/src/**`（只在 `bridge/` 的注入脚本里消费）

Owner map：

- `server/` 拥有服务发现与 attach（`ServiceDiscovery.ts`）以及 `ServiceState` / `ServiceStatus`。
- `client/` 拥有对 OpenCode `/api/*` 的 HTTP 调用和 `/api/event` SSE 连接。
- `context/` 拥有 Obsidian facts：workspace/editor 事件、候选生命周期、prompt 附件构造、安全导航。
- `bridge/` 拥有执行边界：本地代理、HTML 注入、iframe 内 hook、本地 message、事件诊断、外观注入。
- `ui/` 拥有 ItemView 渲染和用户可见控件。
- `graph/` 拥有 vault 元数据事实层，供导航和后续派生使用。

数据流：

```text
~/.local/state/opencode/service*.json
  -> server/ServiceDiscovery        (GET /api/info 验活)
  -> ServiceHandle{name,url,password,version,pid}
    -> client/OpenCodeClient        (/api/session*)
    -> client/OpenCodeEventSource   (/api/event)
    -> bridge/OpenCodeWebUiProxy    (Web UI + auth 透传)
  -> main.ts 装配与状态
```

```text
Obsidian workspace/selection facts
  -> context source driver
  -> CandidateRegistry
  -> PromptContextInjector -> prompt body files
```

```text
OpenCode iframe action
  -> BridgeInjection -> BridgeProtocol message
  -> main.ts 校验 -> ContextItemNavigator / ViewManager / theme sync / diagnostics
```

OpenCode 的 public package export 或 OpenAPI 端点可以直接消费。只存在于 Web UI 内部的能力必须收敛在 `bridge/` 的一个执行点里；不要把它扩散进 `context/`、`ui/` 或 `main.ts`。
