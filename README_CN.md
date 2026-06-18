# Another OpenCode for Obsidian

[English](README.md) · [简体中文](README_CN.md)

在 Obsidian 里运行 [OpenCode](https://opencode.ai/)，同时保留 Obsidian 里真正有用的部分：pane、主题、快捷键、链接、context 和本地 diagnostics。

上游插件证明了一个简单想法：OpenCode 的 Web UI 可以跑在 Obsidian pane 里。这个 fork
保留这个想法，并补齐日常使用需要的部分：视图位置、Obsidian 主题适配、快捷键归属、vault
导航、context provenance 和 diagnostics。

这个 fork 仍然是 beta 软件。它可以用于本地使用和 BRAT 安装。

_这是第三方 fork。它不隶属于 OpenCode 或 Obsidian。_

## 亮点

- **两种视图**：`Mod+Shift+O` 打开侧边栏，`Mod+Shift+L` 打开主编辑区 deep view。
- **贴近 Obsidian 的 Web UI**：可选 Obsidian 派生外观，不 patch OpenCode 组件 class name。
- **快捷键冲突控制**：Obsidian 和 OpenCode 快捷键会放进同一份 index，冲突在插件设置页处理。
- **从 OpenCode 回到 vault**：file path、wikilink、heading、block、footnote、diff row 和 markdown path 都可以打开已有 Obsidian 笔记。
- **带 provenance 的 context**：workspace 和 selection context 保留来源信息、恢复状态和安全导航目标。
- **可用的 diagnostics**：server、bridge、keyboard、theme 和 context 状态会写到插件界面和 XDG status 文件。

## 快速入口

- [安装](#安装)
- [基本使用](#基本使用)
- [设置](#设置)
- [Diagnostics](#diagnostics)
- [可能的后续工作](#可能的后续工作)

## 这个插件有什么不同

### 让 OpenCode 在 Obsidian 里可用

这个 fork 的主要工作是集成。OpenCode 仍然是 OpenCode：Web UI 还是主要对话界面，插件不重写一套聊天界面。插件负责 Obsidian 才知道的部分。

| 领域           | 这个 fork 做了什么                                                                                                                                                      | 为什么对 Obsidian 有用                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 视图位置       | OpenCode 可以放在侧边栏，也可以放在主编辑区。deep view 默认快捷键是 `Mod+Shift+L`，再按一次会回到之前的 editor leaf。                                                   | 阅读时可以把 OpenCode 当侧栏；需要专注时可以把它放到主编辑区，同时保留返回原笔记的路径。        |
| 主题适配       | Web UI 可以保留 OpenCode 原生外观，也可以使用 Obsidian 派生外观。Obsidian 模式消费稳定主题变量，不 patch OpenCode 组件 class。                                          | iframe 不会像一个贴在 vault 上的外部应用；主题修复也能绑定到稳定 token 面。                     |
| 快捷键归属     | Obsidian hotkeys 和 OpenCode keybinds 会归一化到同一个 shortcut index。冲突会显示在插件设置页，可以选择归 Obsidian 或 OpenCode 处理。                                   | panel toggle、deep view、OpenCode sidebar toggle、settings 等快捷键可以共存，不需要硬编码特例。 |
| 点击导航       | OpenCode 里显示的 vault path、wikilink、heading、block、footnote、diff row 和 markdown path 可以打开已有 Obsidian 笔记。缺失目标不会创建文件。                          | OpenCode 看到的文件引用可以直接变成 vault 导航，同时仍由 Obsidian 判断目标是否真实存在。        |
| Context 可见性 | workspace 和 selection context 带 source metadata、provenance、restore state 和安全导航目标。Web UI 暴露可用端口时，status bar 和 OpenCode context surface 会保持同步。 | 你可以看到下一条 prompt 可能带上什么 context、它来自哪里、是否还能打开回源位置。                |
| Diagnostics    | runtime diagnostics 包含 server 启动状态、bridge 状态、快捷键 policy、context projection 状态、theme 状态和 XDG log/status 路径。                                       | 出问题时，插件能报告具体 Obsidian/OpenCode 边界，而不是只说 iframe 失败。                       |

bridge 只处理 iframe 状态必须进入 Obsidian 的地方：theme payload、快捷键决策、vault
导航请求、prompt context card 和 diagnostics。

### GraphRAG 是可能的后续探索

GraphIndex 已经通过 Obsidian `Vault` 和 `MetadataCache` 给插件提供 vault link 的事实视图。GraphRAG
以后可以放在它上面，但当前插件不依赖 GraphRAG 才能成立。

当前产品没有 ranking layer 也已经足够完整。后续 GraphRAG 更适合作为个人探索，除非它能直接改善现有的 OpenCode-in-Obsidian 工作流。

## 当前状态

现在可以用的能力：

- 从 Obsidian 启动或 attach 到 OpenCode server。
- 在侧边栏或主编辑区打开 OpenCode Web UI。
- 使用 OpenCode 原生外观，或使用 Obsidian 派生外观。
- 使用 `Mod+Shift+O` 打开侧边栏，使用 `Mod+Shift+L` 打开 deep view。
- 在插件设置页查看快捷键冲突，并选择由 Obsidian 或 OpenCode 处理。
- 把 included Obsidian workspace / selection candidates 随同一条 OpenCode prompt 发送为 synthetic text parts。
- 避免把自动 context 写进可见 OpenCode transcript，也避免制造单独的空 context message。
- 在 Obsidian status bar 中查看下一条消息的 context candidates；可用时同步 OpenCode 原生 context cards。
- 把 context item 导航回已有 vault 内容，不创建缺失文件。
- session reload 后按 `known` 或 `uncertain` provenance 恢复插件 context。
- 复制 diagnostics，包含 metadata、message/part ID、text length、provenance 状态、server 启动状态和 runtime 路径，但不复制笔记正文。
- 以只读 diagnostics stream 消费 OpenCode `/api/event`。

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

## 依赖

- Obsidian desktop。
- OpenCode CLI，或一个能启动 `opencode serve` 的 custom command。
- 开发和本地构建需要 Bun。

macOS 和 Linux 上，通过 GUI 启动的 Obsidian 可能拿不到 terminal 里的同一份 `PATH`。如果找不到 OpenCode 或本地 MCP tools，优先配置绝对 `opencodePath` 或显式 custom command。

## 基本使用

- 用 ribbon icon 或 command palette 打开 OpenCode pane。
- 用 `Mod+Shift+O` 切换侧边栏。
- 用 `Mod+Shift+L` 在主编辑区切换 deep view。
- 从插件控件启动 OpenCode server，或配置 auto-start。
- 正常使用 OpenCode Web UI。
- 用 Obsidian command 添加当前笔记或选中文本 context。
- 用 status bar context surface 查看、导航或忽略将要发送的 context。
- 用插件设置页查看快捷键冲突。

插件不会在 context source 导航时创建缺失 vault 文件。如果 source 无法解析，会记录为 unresolved，而不是走 Obsidian 的 link-open 行为。

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

### Server 启动

默认 path mode 会直接解析并运行 `opencode serve`。它不会启动 shell，也不会读取 `.zshrc`、`.bashrc`、PowerShell profile 或其它 shell startup 文件。

OpenCode server 继承 Obsidian desktop 进程的环境变量，插件只额外加入 `NODE_USE_SYSTEM_CA=1`。这是很多启动问题的来源。Obsidian 是 GUI app，插件看到的环境可能比 terminal 里的环境更少，也可能只是另一份不同的环境。如果 `opencode serve` 在 Terminal 里能跑，但从 Obsidian 启动失败，优先检查 Obsidian 进程能不能看到同一份 `PATH`、Node version manager、proxy variables、MCP tool paths 和 API token variables。

这些情况优先用 path mode：

- `opencode` 安装在插件能解析到的常见位置；
- OpenCode executable path 已经配置成绝对路径；
- OpenCode 启动前不需要 shell-only setup。

如果 path mode 失败，复制 diagnostics 后先看这些字段：

- `processEnvironment.pathEntries`：Obsidian 能看到的 PATH entries；
- `processEnvironment.envKeys`：Obsidian 能看到的环境变量名；
- `lastSpawnEnvironment.pathEntries`：传给 OpenCode server 的 PATH entries；
- `lastSpawnEnvironment.envKeys`：传给 OpenCode server 的环境变量名；
- `lastDisplayCommand`：placeholder 展开后的最终命令；
- `lastResolvedExecutable`：path mode 使用的 executable path；
- `lastStderr` 和 `lastHealthError`：启动后失败的位置。

只有当 path mode 无法提供 OpenCode 需要的环境，或者 OpenCode 必须通过 version manager、wrapper script、shell profile、proxy setup、managed runtime 启动时，才启用 **Use custom command**。这个 command 是 shell template，应该包含 `{hostname}` 和 `{port}`。

可用 placeholder：

- `{hostname}`
- `{port}`
- `{cors}` 展开为 `app://obsidian.md`
- `{projectDirectory}`

基础示例：

```bash
opencode serve --hostname {hostname} --port {port} --cors {cors}
```

macOS/Linux 上，如果知道 executable path，推荐这样写：

```bash
zsh -lc 'exec "$HOME/.local/bin/opencode" serve --hostname {hostname} --port {port} --cors {cors}'
```

如果 `opencode` 来自 shell setup 文件，可以显式 source：

```bash
zsh -lc 'source "$HOME/.zshrc"; exec opencode serve --hostname {hostname} --port {port} --cors {cors}'
```

如果 OpenCode server 需要额外 flag，可以放在同一个模板里：

```bash
zsh -lc 'exec "$HOME/.local/bin/opencode" serve --hostname {hostname} --port {port} --cors {cors} --shutdown-after-last-client'
```

额外 flag 只在你安装的 OpenCode 版本支持时使用。这个模板的重点是明确 process environment：shell 入口、binary path 或显式 source 的 setup 文件，以及 `serve` 需要的 placeholders。

Windows 模板：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& 'C:\path\to\opencode.exe' serve --hostname {hostname} --port {port} --cors {cors}"
```

Custom command mode 是显式配置。它仍然从 Obsidian 的 process environment 开始，所以缺失的 executable path、profile source、proxy variables、MCP paths 或 token setup 需要写进模板。

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

自动 context 正在向 OpenCode 原生 prompt context cards 收拢。插件保留 Obsidian-specific 的策略工作：发现 workspace clues、selected text 和未来可能的 vault evidence。只要 context 能表示为 OpenCode 原生 card，OpenCode Web UI 就应该拥有发送前的可见层。

bridge 仍然是产品价值的一部分。OpenCode 拥有自己的 Web UI，Obsidian 拥有 vault navigation，所以插件可以加入窄的 iframe hooks，处理需要两边协作的动作。插件拥有的 context card 可以出现在 OpenCode 原生 prompt context 区域里；点击导航时再 post 回 Obsidian，打开已有 vault 文件。

早期 prompt-coupled 路径把 candidates 放在 Obsidian status bar，并在 prompt 发送时追加为 `synthetic` parts。这个路径仍然是历史机制，但不应该继续扩张成主要用户控制面。

当前 bridge 方向：

- [bridge module guide](src/bridge/AGENTS.md) 记录本地 Obsidian 和 OpenCode source anchors。
- [native prompt context bridge design](docs/plans/2026-06-18-opencode-native-prompt-context-bridge.md) 记录 live experiment、bridge API 和 candidate-to-card sync 设计。
- `src/bridge/OpenCodePromptContextAdapter.ts` 记录 OpenCode 原生 prompt context card shape。
- 使用 live Web UI bridge，在 OpenCode `PromptProvider` tree 内调用 `prompt.context.add(item)`。直接写 prompt storage 只能作为调试证据，因为它不会更新当前 Solid store。
- Obsidian-owned cards 不伪造 OpenCode review comments。原生 card 可以展示、移除和提交；回到 Obsidian 的导航属于插件 injection bridge。

第一阶段来源：

- workspace clues：当前打开的笔记和可选 active location；
- selected text：最近选中文本，作为 one-shot candidates，发送成功后移除。

自动路径不会创建单独 context message，也不使用 `noReply`。发送成功后，one-shot selected text candidates 会被消费，dynamic workspace context 会保留给后续 prompt。如果 prompt request 失败，included candidates 会保留在本地并标记 failed。

Legacy/manual context messages 仍然可以恢复和移除。恢复后的 context 会谨慎处理：

- 有效 plugin provenance 恢复为 `known`；
- 旧 context 或 invalid provenance 恢复为 `uncertain`；
- `uncertain` context 显示为来自 OpenCode session，而不是可信 vault 文件。

未来 backlink、block-reference、summary 或 graph-derived sources 应该使用同一套 candidate lifecycle，不应该直接写 OpenCode session。

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

插件会尽量把启动和 bridge 失败变成可观察信息。如果 OpenCode 启动失败，view 和设置页会显示 mode、command、working directory、health check result、stderr、log path 和 status path。**Copy diagnostics** 命令会复制同一批字段，并附带简短的 process environment 摘要。它不会复制完整笔记正文。

报告问题时请包含：

- Obsidian 版本和 OS。
- OpenCode 版本。
- 插件版本。
- 启动模式：path mode 或 custom command。
- 如果使用 path mode，提供设置里的 OpenCode path，以及 **Autodetect** 是否找到了路径。
- 如果使用 custom command mode，提供完整 custom command。
- OpenCode pane 是恢复了已有 session，还是创建了新 session。
- 从插件 UI 或 `status.json` 复制的 diagnostics。
- XDG log 中相关的最近日志。

常见启动问题通常能从这些字段看出来：

- `lastDisplayCommand`：插件实际尝试运行的命令；
- `lastResolvedExecutable`：path mode 下解析出的 executable path；
- `lastCwd`：作为 process working directory 的 vault/project directory；
- `lastStderr`：OpenCode process 的 stderr；
- `lastHealthError`：configured health endpoint 为什么没有被接受；
- `processEnvironment` 和 `lastSpawnEnvironment`：Obsidian 和 spawned process 能看到的 PATH / shell 信息。
