# 插件接入 opencode v2 服务：目标结构与删除面

状态：已实施（0.6.0）。目标 goal：`908e943b-0968-435b-93f6-7516aa214afc`。

## 一句话

插件从「自己起一个 opencode、用正则补丁改它的前端 bundle」改成「接入环境里已经在跑的 opencode 服务，按 v2 HTTP 契约把 Obsidian 上下文挂到 prompt 请求上」。

## 事实基线

2026-10-25 实测，opencode 2.1.3（pid 96699，`http://127.0.0.1:49374`，共享服务）。前端 bundle 从该服务实爬 601 个 asset，锚点用插件自己的正则测。

| 补丁点 | 目标 asset | 锚点命中 |
| --- | --- | --- |
| prompt-context port | `/assets/index-*.js` | 0 / 3 |
| prompt-context activation | 同上 | 0 |
| prompt-context close | 同上 | 0 |
| keyboard catalog port | `/assets/index-*.js` | 0（只在 `host-apis-*.js` 命中 1 次，非目标 asset） |
| keyboard sidebar.toggle | 同上 | 0 |
| terminal theme | `/assets/session-*.js` | 0 |
| terminal transparency | 同上 | 0 |

三个 bundle patch 子系统在当前版本上全部不生效，且不生效时只写一条日志。同一批实测还确认：

- V1 路径 `/global/health`、`/session`、`/event` 在 2.1.3 上返回 200，body 是 SPA 的 `index.html`。旧客户端拿到的是 HTML，不是错误。
- v2 唯一 prompt 入口是 `POST /api/session/{sessionID}/prompt`；`/api/session/{sessionID}/message` 只有 GET。
- 服务注册文件 `~/.local/state/opencode/service.json`（0600）给 `url/pid/version/password`；`GET /api/info` 回 `version/pid/urls/paths`。
- 带 env 的实例只有共享服务一个（`~/.config/opencode/service.json` 的 7 个 key）；插件自起的 4096 实例环境里 0 个 key。

结论：插件当前对 2.1.3 真正生效的只有「webview 壳 + HTML 外观注入 + Basic 鉴权代理」。上下文、键盘桥、终端主题三条都是静默失效。

## 结构（改后）

```
main.ts
├── ServiceDiscovery      读 ~/.local/state/opencode/service*.json → 选一个 → /api/info 验活
├── OpenCodeClient        v2 契约，base 用服务 url，Basic auth
├── OpenCodeEventSource   GET /api/event，按 location.directory 过滤
├── OpenCodeWebUiProxy    代理三件事：注入 Authorization、注入外观 HTML/CSS、拦 prompt 挂 files
├── ContextManager        CandidateRegistry + 投影 → promptAttachments()
└── ContextStatusBar      Obsidian 侧唯一的 context chips 面
```

数据流只有一条：`state 文件 → ServiceHandle{name,url,password,version,pid} → 三个消费者（client / events / proxy）`。密码只有这一个来源，不进 settings、不进日志、不进 argv。

## 删除面

删掉的理由不是「旧」，是「在目标版本上不起作用，且失效方式是静默的」。

- `bridge/OpenCodePromptContextBundlePatch.ts`、`OpenCodeKeyboardBundlePatch.ts`、`OpenCodeTerminalBundlePatch.ts` 及其诊断聚合、`OpenCodeWebUiProxy` 里的 `shouldPatchJavaScriptAsset` / `patchJavaScriptAsset` 分支。
- `bridge/NativePromptContextBridge.ts`、`OpenCodePromptContextAdapter.ts`、`PromptContextSurfaceTrace.ts`、`KeyboardShortcutIndex.ts`；`BridgeProtocol.ts` 里 prompt-context 与 keyboard 的全部消息类型与校验；`BridgeInjection.ts` 里对应的注入段。
- legacy 上下文链：`ContextSyncer.ts`、`ContextProvenance.ts`、`ContextItem`/`ContextRegistry`、`ContextManager.restoreFromServer`/`normalizeRestoredItems`/`removeItem` 的消息增删路径、`OpenCodeClient.addContextMessage`/`deleteMessage`/`listSessionMessages`。
- 自起服务的全部机制：`ServerManager` 的 spawn/stop/健康轮询/`createStartPlan`、`ExecutableResolver.ts`、`server/process/{Posix,Windows}Process.ts`、`EnvironmentDiagnostics.ts`、`parseServerPassword`（密码改由 state 文件提供）。
- settings：`port`、`hostname`、`autoStart`、`opencodePath`、`useCustomCommand`、`customCommand`、`startupTimeout`、`keyboardBridge`、`CUSTOM_COMMAND_EXAMPLE`、`createServerEndpoint`。
- harness 里验证 bundle patch 与外观类名的检查（`scripts/harness/themeChecks.ts` 凡依赖被删补丁的部分），保留纯函数级外观注入测试。

保留并改造：`ProxyInjection.injectOpenCodeWebUiProxyHtml`（HTML head 注入，位置稳定）、`getV2ServerUrl`（`/server/<b64(origin)>` 深链）、`GraphIndex`、`WorkspaceContext`、`AutoSelectionContextSource`、`ContextStatusBar` 的 candidate 渲染。

## 不变量

1. 插件永不 spawn opencode 进程；它不拥有任何进程生命周期，因此也没有 stop/kill 权限。
2. 服务唯一来源是 `~/.local/state/opencode/service*.json`。找不到或验活失败就是显式状态「未发现服务」，界面给用户动作（`opencode service start`），不做后备启动。
3. 所有 HTTP 走 `/api/*`；不带 `x-opencode-directory`；目录参数用 query `directory=`。
4. 上下文交付唯一载体是 prompt body 的 `files` 数组：`{uri: "data:text/plain;base64,<b64>", name: "obsidian-context:<kind>:<label>[:<range>]"}`。不产生 synthetic parts，不改前端 JS。
5. 代理只动两处字节：HTML head（外观）与请求/响应体（鉴权头、prompt 附件）。JS asset 原样转发。

## 接口冻结

```ts
export interface ServiceHandle {
  name: string;      // "service.json" | "service-zom.json"
  url: string;       // http://127.0.0.1:49374
  password: string;
  version: string;   // /api/info.version
  pid: number;       // /api/info.pid
}
export function discoverServices(dir: string): Promise<ServiceCandidate[]>; // 读目录，不验活
export function attachService(input: {dir: string; prefer: string | "auto"}): Promise<ServiceHandle | null>;
export function buildPromptAttachments(candidates: ContextCandidate[]): PromptFileAttachment[];
export function extractPromptSessionId(path: string): string | null; // 只认 /api/session/<id>/prompt
```

选择规则：`prefer` 指名某个文件时只认它，它不存在或验活失败就是「未发现服务」——回落默认顺序会让用户以为连的是 zom，实际连的是另一个二进制。`auto` 先 `service.json`，再按文件名序取第一个验活成功的；全部失败返回 null。

## 阶段

1. **attach**：ServiceDiscovery + settings 收拢 + main 装配 + 删自起机制。UI 三态：未发现服务 / 已连接 pid+version / 连接失败原因。
2. **client/events**：`OpenCodeClient` 与 `OpenCodeEventSource` 迁到 v2 契约，删 `/api` 前缀双探与 V1 回落；会话列表按 `directory` 过滤，事件按 `location.directory` 过滤。
3. **context**：candidates 为唯一模型，`buildPromptAttachments` 为唯一出口；prompt hook 认 `/prompt`；删 legacy 链与三个 bundle patch。
4. **docs/cleanup**：AGENTS.md 与 README 改写受影响的模块职责与架构决策（现行第 2 条「健康检查只认 `/global/health`」、第 10 条 Custom Command 契约作废），release notes 记 0.6.0 的破坏性变更，harness 收敛。

## 验收

自动化：`bun run check`（format:check + lint + build + test）全绿；测试基线重记。

真机（我自己跑，不接受汇报）：

- 观察面：Obsidian 里插件状态为 `attached pid=96699 v2.1.3`，web UI iframe 正常渲染。
- 上下文链路：Obsidian 选中一段文本 → 在 web UI 发 prompt → 用脚本 `GET /api/session/{id}/message` 读回该 prompt，`files` 里有 `obsidian-context:selection:...` 的 `data:text/plain` 附件，且正文可见文本没有被塞入 JSON。
- 服务缺失：停掉共享服务 → 插件显示未发现服务；`opencode service start` 后自动接上，不需要重启 Obsidian。
- 静态：`src/**` 无 `child_process`、`spawn(`、`ServerManager`、`x-opencode-directory`、`/global/health`、`patchOpenCode`。`scripts/**` 的 harness 允许用 `child_process` 跑构建与 git，它不进 bundle。
