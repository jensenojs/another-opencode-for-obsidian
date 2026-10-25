# Another OpenCode for Obsidian

[English](README.md) · [简体中文](README_CN.md)

在 Obsidian 里运行 [OpenCode](https://opencode.ai/)，同时保留 Obsidian 里真正有用的部分：pane、主题、链接、context 和本地 diagnostics。

插件 attach 到本机已经在跑的 OpenCode service。它读取 `~/.local/state/opencode/service*.json`，
通过本地代理提供 Web UI，并把 vault context 作为文件附件交给 prompt。它不启动、不停止、不重启那个
service。

0.6.0 是破坏性版本：不再有插件托管的进程，只说 v2 HTTP API。见[升级到 0.6.0](#升级到-060)。

_这是第三方 fork。它不隶属于 OpenCode 或 Obsidian。_

## 亮点

- **两种视图**：OpenCode 可以放在侧边栏，也可以用 `Mod+Shift+L` 打开主编辑区 deep view。
- **只 attach，不管理进程**：选择要连的 OpenCode service，插件显示它的 `pid`、version 和 URL，
  服务回来时自己接上。
- **贴近 Obsidian 的 Web UI**：可选 Obsidian 派生外观，不 patch OpenCode 组件 class name。
- **从 OpenCode 回到 vault**：file path、wikilink、heading、block、footnote、diff row 和 markdown
  path 都可以打开已有 Obsidian 笔记。
- **context 走 prompt 附件**：included workspace 和 selection candidates 作为 `data:` 文件附件
  随下一条 prompt 发出。
- **可用的 diagnostics**：service attach 状态、事件流状态、theme 状态和 XDG status 文件都能看到。

## 快速入口

- [安装](#安装)
- [基本使用](#基本使用)
- [设置](#设置)
- [Diagnostics](#diagnostics)
- [可能的后续工作](#可能的后续工作)

## 这个插件有什么不同

### 让 OpenCode 在 Obsidian 里可用

这个 fork 的主要工作是集成。OpenCode 仍然是 OpenCode：Web UI 还是主要对话界面，插件不重写一套聊天界面。插件负责 Obsidian 才知道的部分。

| 领域           | 这个 fork 做了什么                                                                                                                              | 为什么对 Obsidian 有用                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 视图位置       | OpenCode 可以放在侧边栏，也可以放在主编辑区。deep view 默认快捷键是 `Mod+Shift+L`，再按一次会回到之前的 editor leaf。                           | 阅读时可以把 OpenCode 当侧栏；需要专注时可以把它放到主编辑区，同时保留返回原笔记的路径。 |
| 主题适配       | Web UI 可以保留 OpenCode 原生外观，也可以使用 Obsidian 派生外观。Obsidian 模式消费稳定主题变量，不 patch OpenCode 组件 class。                  | iframe 不会像一个贴在 vault 上的外部应用；主题修复也能绑定到稳定 token 面。              |
| Attach 控制    | 插件列出注册的 service（`service*.json`），用 `GET /api/info` 验活，可以按文件名 pin 一个。`auto` 取第一个可达的服务。                          | 一条规则决定你在跟哪个 OpenCode 二进制、哪个版本对话。                                   |
| 点击导航       | OpenCode 里显示的 vault path、wikilink、heading、block、footnote、diff row 和 markdown path 可以打开已有 Obsidian 笔记。缺失目标不会创建文件。  | OpenCode 看到的文件引用可以直接变成 vault 导航，同时仍由 Obsidian 判断目标是否真实存在。 |
| Context 可见性 | included workspace 和 selection candidates 作为 `data:` 文件附件随下一条 prompt 发出。status bar 显示候选队列，以及上一条 prompt 带了几个附件。 | 你能看到下一条 prompt 会带什么 context、它来自哪里，又不在 transcript 里多出一条消息。   |
| Diagnostics    | runtime diagnostics 包含 service attach 状态、service 身份、事件流状态、theme 状态和 XDG log/status 路径。                                      | 出问题时，插件能说清是没找到服务、鉴权失败，还是中途丢了服务。                           |

bridge 只处理 iframe 状态必须进入 Obsidian 的地方：theme payload、vault 导航请求和 diagnostics。
prompt context 不在其中：它由插件自己写进 prompt request body。

### GraphRAG 是可能的后续探索

GraphIndex 已经通过 Obsidian `Vault` 和 `MetadataCache` 给插件提供 vault link 的事实视图。GraphRAG
以后可以放在它上面，但当前插件不依赖 GraphRAG 才能成立。

当前产品没有 ranking layer 也已经足够完整。后续 GraphRAG 更适合作为个人探索，除非它能直接改善现有的 OpenCode-in-Obsidian 工作流。

## 当前状态

现在可以用的能力：

- attach 到正在运行的 OpenCode v2 service，显示它的 `pid`、version 和 URL。
- 在侧边栏或主编辑区打开 OpenCode Web UI。
- 使用 OpenCode 原生外观，或使用 Obsidian 派生外观。
- 可以在侧边栏打开 OpenCode，也可以用 `Mod+Shift+L` 打开 deep view。
- 把 included Obsidian workspace / selection candidates 作为文件附件随下一条 prompt 发送。
- 在 Obsidian status bar 中查看候选队列，以及上一条 prompt 带了多少个附件。
- 把 context candidate 导航回已有 vault 内容，不创建缺失文件。
- 复制 diagnostics，包含 service 身份、attach 状态、事件流状态和 runtime 路径，但不复制笔记正文。
- 以只读 diagnostics 消费 OpenCode `/api/event`，并把断流当作服务消失。

仍然偏实验的部分：

- Obsidian-style Web UI 外观可用，但兼容性取决于 Obsidian theme、Electron 渲染和 OpenCode token 变化。
- 自动 context source 对本地工作流有用，但仍然保持保守、可见。
- GraphRAG ranking 和派生知识发现不属于当前产品面。

## 安装

### BRAT

用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 安装 beta 版本。

1. 在 Obsidian Community Plugins 中安装 BRAT。
2. 打开 BRAT 设置。
3. 点击 **Add Beta plugin**。
4. 输入：

   ```text
   jensenojs/another-opencode-for-obsidian
   ```

5. 选择最新 release。
6. 在 Obsidian Settings -> Community Plugins 中启用 **Another OpenCode for Obsidian**。

BRAT 需要 GitHub release 附带 `manifest.json`、`main.js` 和 `styles.css`。这个 fork 的 release 会按这个路径发布。

### 手动安装

从最新 release 下载这些文件，放到：

```text
<vault>/.obsidian/plugins/another-opencode-for-obsidian/
```

必需文件：

- `manifest.json`
- `main.js`
- `styles.css`

然后重载 Obsidian 并启用插件。

### 开发安装

```bash
git clone https://github.com/jensenojs/another-opencode-for-obsidian.git
cd another-opencode-for-obsidian
bun install
bun run build
bun run harness install --vault /path/to/vault
```

## 升级到 0.6.0

0.6.0 移除了插件自己的进程管理。

- 插件不再启动 `opencode serve`。改由 `opencode service start`，或 opencode 自己的 service
  manager 常驻。
- 设置里删掉 `port`、`hostname`、`autoStart`、`opencodePath`、`startupTimeout`、`customCommand`、
  `useCustomCommand` 和 `keyboardBridge`。加载时忽略，也不再写回；替代项是 `serviceName` 和
  `projectDirectory`。
- 键盘桥和终端主题 patch 一并删除。它们依赖 OpenCode Web UI 的 bundle 锚点，2.1.3 已经没有这些
  锚点，快捷键归属回到 Obsidian 和 OpenCode 各自处理。

插件只说 v2 HTTP API（`/api/*`），需要 OpenCode 2.1 或更新版本。

## 依赖

- Obsidian desktop。
- OpenCode 2.1 或更新版本，并且 service 已在运行。
- 开发和本地构建需要 Bun。

terminal 环境、`PATH` 和 shell profile 现在归 service 进程负责。终端里能跑的服务，插件就能连上。

## 基本使用

- 先跑一次 `opencode service start`，或让 opencode 自己的 service manager 常驻。
- 用 ribbon icon 或 command palette 打开 OpenCode pane。
- 用 ribbon icon、command palette 或 Obsidian hotkeys 切换侧边栏。
- 用 `Mod+Shift+L` 在主编辑区切换 deep view。
- 正常使用 OpenCode Web UI。
- 用 Obsidian command 添加当前笔记或选中文本 context。
- 用 status bar context surface 查看、切换或移除待发送的 candidates。

当找不到服务时，pane 会显示要跑的命令和一个 reconnect 按钮。服务出现在 state 目录后，插件自动
接上，不需要重启 Obsidian。

## Vault 导航和链接解析

Vault navigation 只打开已有 Obsidian evidence。插件通过 Obsidian API 和 GraphIndex fact layer 解析 vault path、wikilink、heading、block、footnote，然后用 `WorkspaceLeaf.openFile()` 打开解析出的 `TFile`。

这个 resolver contract 服务于当前 context navigation，也服务于以后可能的 graph 实验。未来 graph 功能应该消费同一套 vault facts，不应该另写一套 link parser。

相关 Obsidian API：

- [MetadataCache](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)
- [MetadataCache.getFirstLinkpathDest](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFirstLinkpathDest)
- [parseLinktext](https://docs.obsidian.md/Reference/TypeScript+API/parseLinktext)
- [getLinkpath](https://docs.obsidian.md/Reference/TypeScript+API/getLinkpath)
- [resolveSubpath](https://docs.obsidian.md/Reference/TypeScript+API/resolveSubpath)
- [WorkspaceLeaf.openFile](https://docs.obsidian.md/Reference/TypeScript+API/WorkspaceLeaf/openFile)
- [Workspace.openLinkText](https://docs.obsidian.md/Reference/TypeScript+API/Workspace/openLinkText) 只是 Obsidian link-open 的参考，不是本插件的 evidence navigation 入口。

## 设置

### OpenCode service

- **Service**：`auto` 会 attach 到第一个能回应 `GET /api/info` 的注册服务。填入文件名（如
  `service-zom.json`）可以把插件 pin 到那个服务；pin 住的名字不会回落到别的服务。
- **Project directory**：session 调用里作为 `directory=` 发送的 vault 路径。留空则用 vault 根目录。

插件不启动服务，也不拥有它的生命周期。启动、停止、端口、provider 和 MCP 配置都归
`opencode service`。

attach 失败时，设置页会显示原因（state 目录里没有 `service*.json`，或找到的服务都不可达）以及
XDG log 路径。

### Web View 外观

有两个模式：

- `OpenCode`：保留 OpenCode 自己的 Web UI 样式。
- `Obsidian`：从当前 Obsidian theme 派生 OpenCode Web UI tokens。

Obsidian appearance mode 把稳定的 Obsidian CSS variables 映射到 OpenCode appearance tokens。它不 patch OpenCode 组件 class name。目标是让嵌入式 Web UI 像 Obsidian 工作区的一部分，同时保留 OpenCode UI 自身结构。

相关上游面：

- [Obsidian CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables)
- [OpenCode v2 theme tokens](https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css)
- [OpenCode Tailwind color entry](https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css)

### Context Assist

included candidates 会作为文件附件随下一条 prompt 发出。每个附件是
`data:text/plain;base64,<body>`，名字为 `obsidian-context:<kind>:<label>`；body 里带 label、
带行号范围的来源路径和正文。

第一阶段来源：

- workspace clues：当前打开的笔记和可选 active location；
- selected text：最近选中文本，作为 one-shot candidates，发送成功后移除；
- manual：`Add selection to context` 和 `Add current note to context`。

prompt request 成功后，one-shot candidates 被消费，dynamic workspace context 保留给后续 prompt。
如果 request 失败，included candidates 保留在本地并标记 failed。status bar 会记录上一条 prompt
带了多少个附件。

candidate 只活在插件里，没有 restore 路径：candidate 指向什么，唯一依据是 vault 文件本身。

未来 backlink、block-reference、summary 或 graph-derived sources 应该喂同一套 candidate
lifecycle，不应该直接写 OpenCode session。

## Diagnostics

Runtime logs 和 status 位于 XDG state directory：

```bash
$XDG_STATE_HOME/another-opencode-for-obsidian/another-opencode-for-obsidian.log
$XDG_STATE_HOME/another-opencode-for-obsidian/status.json
```

如果没有设置 `XDG_STATE_HOME`，插件使用：

```text
~/.local/state/another-opencode-for-obsidian/
```

常用命令：

```bash
bun run dev:status
bun run dev:logs
bun run dev:doctor
bun run dev:bridge
bun run dev:theme
bun run dev:theme:fixture
```

`dev:bridge` 检查本地 OpenCode 和 Obsidian contract files，不 fetch remote URLs。

`dev:theme` 检查正在运行的 Obsidian 插件实例。`dev:theme:fixture` 检查当前 workspace code，不需要 Obsidian reload。

## 开发

```bash
bun install
bun run build
bun test
bun run check
```

`bun run check` 会运行 formatting checks、lint、typecheck、production build 和 tests。

部分测试会在 `127.0.0.1` 启动临时 HTTP server。在 sandboxed agent 环境里，这可能需要 loopback listen 权限。

## 可能的后续工作

当前主产品目标是稳定的 OpenCode-in-Obsidian 工作流：

- OpenCode 继续作为文本交互界面。
- Obsidian 提供可见 context、vault evidence、安全导航和 diagnostics。
- 用户能看到发送了什么 context，以及它来自哪里。

这个目标是当前重点。可能的后续工作包括 Obsidian vault 上的 GraphRAG：

- GraphIndex 是 Obsidian `Vault` 和 `MetadataCache` 之上的事实层。
- 派生 indexes 可以帮助发现关系、缺口和 context candidates。
- recommendation 和 ranking policy 应该位于 GraphIndex 之上，而不是写进 GraphIndex 内部。

这是可选研究工作。它不应该静默自动注入 context，也不应该把 vault graph 变成隐藏 ranking system。

## 排查和反馈问题

插件会尽量把 attach 失败变成可观察信息。找不到服务时，view 和设置页会显示原因、重连状态，以及
XDG log 和 status 路径。**Copy diagnostics** 命令会复制同一批字段，并附带 service 身份。它不会
复制笔记正文，也不会复制 service password。

报告问题时请包含：

- Obsidian 版本和 OS。
- OpenCode 版本（`opencode --version`，或 `status.json` 里的 `version`）。
- 插件版本。
- 选中的 service：`auto`，或 pin 住的文件名（如 `service-zom.json`）。
- OpenCode pane 是恢复了已有 session，还是创建了新 session。
- 从插件 UI 或 `status.json` 复制的 diagnostics。
- XDG log 中相关的最近日志。

`status.json` 里有 `serviceState`、`service`（`name`、`url`、`version`、`pid`）、
`serviceError`、`proxyPort` 和 `runtimeDiagnostics`。这几个字段比日志更快区分「没有注册服务」、
「pin 的服务不存在」和「服务中途死了」。

事件流也参与判断：插件认为自己 attached 时，如果 `GET /api/event` 断开，它把这次断开当作服务
消失，切回 unavailable，并每 10 秒重试 attach。
