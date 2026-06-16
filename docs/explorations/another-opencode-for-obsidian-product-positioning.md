# Obsidian + OpenCode：产品价值定位

本文记录 2026-06-12 对本项目的产品定位判断。判断依据来自当前仓库、用户真实 vault，以及已有的 GraphRAG 讨论文档。

结论先写清楚：这个插件的价值来自让 OpenCode 讨论直接发生在 Obsidian 的知识结构里。它要知道当前 session 带了哪些笔记、这些笔记在 vault 图里处于什么位置、哪些链接和块可以作为证据、哪些候选关系值得讨论、运行时状态是否可信。Web UI 只是一个可用入口；插件真正需要负责的是 Obsidian 原生的上下文、证据、导航和诊断。

## 实证依据

### Vault 形态

被观察的 vault 是 `/Users/oujinsai/Note/计算机`。

当前只读扫描结果：

- Markdown 文件：579
- Wikilink：1502
- Embed：257
- 最大内容区：
  - `1-实践/examples`：154 篇
  - `1-实践/基础设施`：104 篇
  - `0-理论/0`：49 篇
  - `0-理论/数据库系统`：46 篇
  - `1-实践/1`：23 篇
  - `0-理论/操作系统`：22 篇
  - `0-理论/人工智能`：21 篇

这个结构说明 vault 按技术研究系统生长：理论骨架、实践案例、基础设施诊断、数据库源码阅读、AI/RAG 研究同时存在，并通过 wikilink 和 embed 连接。

### 知识组织规则

根规则写在 [/Users/oujinsai/Note/计算机/AGENTS.md](/Users/oujinsai/Note/计算机/AGENTS.md)。

几个对本项目最关键的事实：

- 笔记质量先看 thesis 是否落在正确的问题收敛点。
- `0-理论/0` 和 `1-实践/1` 是骨架节点；领域集群是通向骨架节点的轨迹。
- 链接必须服务论证。链接出现的位置要让读者知道为什么能从这里跳过去。
- 块引用用于唯一真相来源。事实可以被嵌入，论证不能被嵌入替代。
- AI 对话直接复制成笔记是明确反模式。需要提炼 thesis、验证过的内容、不同意或困惑的地方。
- 整体审计会用入链、有限跳数、跨领域覆盖来判断哪些节点是真吸引子，哪些只是人工枢纽。

这组规则直接决定插件形态。插件要让用户和 agent 看到上下文从哪里来、为什么相关、能不能跳回原文、它在图上连接了什么。

### 理论侧证据

`0-理论/AGENTS.md` 和 `0-理论/0/AGENTS.md` 给出三个核心问题：

- 状态放置：状态放在哪里决定系统能力边界。
- 模型与现实的 gap：没有模型能消灭现实中的遗漏状态，只能改变 gap 的形状。
- 残留的动力学：偶然复杂度只能转移，转移方向决定后续发散或收敛。

代表笔记：

- [/Users/oujinsai/Note/计算机/0-理论/0/环境与状态.md](/Users/oujinsai/Note/计算机/0-理论/0/环境与状态.md)：强调程序运行受环境状态影响，诊断要把隐式状态显式化。
- [/Users/oujinsai/Note/计算机/0-理论/0/阳：虚拟化.md](/Users/oujinsai/Note/计算机/0-理论/0/阳：虚拟化.md)：把抽象理解为状态边界划分，抽象泄漏来自边界被击穿。
- [/Users/oujinsai/Note/计算机/0-理论/0/复杂度.md](/Users/oujinsai/Note/计算机/0-理论/0/复杂度.md)：关注 Simple 和 Easy 的区别，以及复杂度被转移后的传播。

这些笔记会把产品判断拉向一个方向：插件要降低隐藏状态。OpenCode server 是否在运行、当前 session 是谁、context 里有什么、某条链接是否可跳转、graph index 是否 stale，这些状态都应该可见。

### 实践侧证据

`1-实践/AGENTS.md` 给出三个核心问题：

- 把计算还原为状态转移。
- 判断边界从画下、失效到重画的生命周期。
- 从 failure 逆推 fault 的结构性困难。

代表笔记：

- [/Users/oujinsai/Note/计算机/1-实践/1/系统编程.md](/Users/oujinsai/Note/计算机/1-实践/1/系统编程.md)：反复在抽象承诺和底层状态转移之间切换。
- [/Users/oujinsai/Note/计算机/1-实践/基础设施/AGENTS.md](/Users/oujinsai/Note/计算机/1-实践/基础设施/AGENTS.md)：把基础设施理解为认知带宽和可见性问题。
- [/Users/oujinsai/Note/计算机/有价值未整理/local-llm-diagnosis-methodology.md](/Users/oujinsai/Note/计算机/有价值未整理/local-llm-diagnosis-methodology.md)：本地 LLM 故障诊断最后落到 tokenizer、词表、权重损坏、环境变量生效范围这些具体根因。

这些证据说明，插件要支持的高价值工作集中在两类：拿一个现象，沿着证据、代码、笔记和环境状态反推根因；拿一个技术问题，在理论骨架和实践案例之间来回走。

### AI/RAG 侧证据

`0-理论/人工智能/AGENTS.md` 把上下文工程看成参数化知识和非参数化知识之间的边界管理。它直接指出：

- 上下文是运行时环境。
- RAG 只解决知识注入，不解决上下文综合。
- 需要诊断边界管理失败；单纯增加检索结果解决不了上下文综合问题。

这和本项目完全重合。OpenCode 的模型能力是参数化知识，Obsidian vault 是非参数化知识，当前 session context 是两者接触的运行时边界。插件要让这条边界可见、可控、可审查。

## 产品价值

### 讨论发生在问题空间里

这个插件要让 OpenCode 讨论带着 Obsidian 的问题空间一起运行。

一次有价值的讨论至少应该知道：

- 当前 Obsidian active note、选区、光标位置。
- 当前 OpenCode session id。
- 已经注入 session 的 context item。
- 每个 context item 的来源文件、行号、类型、远端 message/part 状态。
- 当前 note 的出链、入链、断链、标题、块。
- 候选扩展为什么被推荐，它连接了哪些路径。

这样 OpenCode 的回答才可能进入用户笔记系统的问题位置。普通互联网回答缺少这些本地证据。

### 插件负责证据，不负责替用户判断

这个 vault 的规则很明确：AI dump 要被提炼，链接要服务论证，吸引子要通过追问和跨域覆盖验证。插件不能替用户自动写结论。

插件可以负责：

- 把证据找出来。
- 把证据排序。
- 把证据放进当前 session。
- 把证据跳回原文。
- 把证据路径复制出来。
- 告诉用户索引是否 fresh、partial、stale 或 failed。

插件不应自动：

- 创建新笔记。
- 修改已有链接。
- 把候选关系写入 vault。
- 把 GraphRAG 候选塞进 session。
- 把 AI 对话直接保存为正式笔记。

写入动作要由用户显式触发。插件应让用户更容易做正确动作；后台判断会破坏审查。

### TUI 可以继续是主交互面

用户已经可以在终端里用 OpenCode TUI。这个事实会约束产品定位。

TUI 的输入体验已经成立。插件应该提供 TUI 没有的 Obsidian 原生能力：

- 读取当前 Obsidian workspace 状态。
- 使用 Obsidian MetadataCache 解析链接、标题、块、入链、出链。
- 在 Obsidian 中安全跳转到已有笔记位置。
- 显示当前 session context 和 provenance。
- 展示 graph/index/diagnostics 状态。
- 把 Obsidian 证据作为可审查 context 交给 OpenCode。

终端可以负责长对话和代码操作。插件负责 Obsidian 证据面和控制面。两者可以共享同一个 OpenCode server/session。

## 核心工作流

### 讨论当前笔记

用户在 Obsidian 里阅读一篇笔记。插件识别 active note、选区、光标位置，并显示当前 session 已带入哪些上下文。用户可以把当前 note、选区、光标附近块、反链摘要加入 OpenCode session。

关键要求：

- 所有 context item 可见。
- 每条 item 能跳回已有文件和位置。
- 错误或不存在的目标只显示诊断和搜索入口，不创建文件。
- 复制 diagnostics 不复制全文，只复制来源、行号、长度、远端状态。

### 比较研究和吸引子审计

用户选择两到多篇笔记或当前 session 的多个 context item。插件用 GraphIndex 给出有限跳数内的共同路径、候选收敛点、跨域覆盖、结构缺口。

OpenCode 讨论应消费一组带证据路径的候选。纯文本检索结果缺少路径证据，无法支撑审查：

- seed 到候选的路径。
- 每条路径的源文件、heading、block、引用位置。
- 候选节点覆盖了哪些顶层目录。
- 加入候选后哪些距离缩短。
- 这个候选是否只是目录页、索引页或人工 hub。

这能服务“比较研究”和“发现尚未写出来的关系”。它也能降低回音壁风险，因为排序目标不只看已有中心，还看跨域覆盖和可达性变化。

### 调试和源码研究

用户在 OpenCode 里排查一个工具或仓库问题，同时 vault 里已有诊断方法论、源码阅读笔记和历史案例。插件可以把当前问题连接到这些证据：

- 当前 session 关联的 repo/vault 文件。
- 相关诊断笔记。
- 类似故障的历史路径。
- 当前插件自身的 XDG status/log。
- OpenCode server/proxy/theme/context 的 runtime diagnostics。

这里的价值是减少隐藏状态。故障可能出现在代码、PATH、XDG、server health、proxy、iframe、theme token、session URL、context message lifecycle 状态里。

### AI 对话提炼

AI 目录明确把 AI dump 当成需要清理的对象。插件可以帮助把讨论变成可写作材料：

- 标出本轮讨论用过哪些 vault 证据。
- 标出哪些回答没有 vault 证据。
- 标出用户显式同意、反驳、追问的位置。
- 支持把一段讨论作为草稿引用到已有笔记，但默认进入草稿或待整理区域。

第一阶段先做 provenance 和复制能力。正式写入、改链、生成笔记应放到后续策略层。

## 基础设施边界

### GraphIndex 是共同底座

GraphIndex 第一层只读 Obsidian 稳定事实：

- `TFile.path`
- `MetadataCache.getFileCache()`
- `resolvedLinks`
- `unresolvedLinks`
- `CachedMetadata.links`
- `embeds`
- `headings`
- `blocks`

这一层服务三个入口：

- 安全导航：只跳已有文件、heading、block。
- Context provenance：context item 可以回到 vault 证据。
- GraphRAG：派生索引用它做有限跳数、覆盖、结构缺口。

产品功能必须消费 Obsidian metadata 作为链接解析真相源。vault 里已有大量 wikilink、alias、heading、block、embed；手写解析很容易和 Obsidian 实际 resolver 不一致。脚本可以做辅助检测。

### GraphRAG 是派生层

已有文档 [docs/explorations/graphrag-known-to-unknown.md](./graphrag-known-to-unknown.md) 定义了 GraphRAG 问题：从已写出的关系中发现还没写出的关系。

这里保留它的分层：

- 第一层：精确事实索引。
- 第二层：后台维护的派生索引。
- 第三层：用户确认后的 context 扩展或写作动作。

派生索引可以缓存到 XDG state。它可以 stale，可以 partial，可以 failed。每个候选必须回到第一层证据路径。

### Bar 是 Obsidian 原生状态面

Bar 的职责超过计数。它应该成为当前 OpenCode session 在 Obsidian 里的最小可见状态面。

第一阶段它需要回答：

- 当前 session 是谁。
- 当前 session 有多少 context item。
- context 是否可跳转。
- graph/index 是否 fresh、stale、rebuilding、failed。
- 是否有诊断可复制。

Bar 的第一层应保持轻。点开后进入面板或 popover。高风险动作放在明确位置，不能作为一眼看不懂的小图标暴露。移除 context 的语义是删除插件创建的远端 context message，这件事要在 UI 里显示清楚。

### Proxy 是 OpenCode 与 Obsidian 的后端桥

Proxy 的价值不只在 CSP 和 theme 注入。它是 OpenCode Web UI、OpenCode server 事件和 Obsidian 插件之间的隔离层。

它适合承接：

- iframe postMessage。
- theme token 注入和 diagnostics。
- 未来 OpenCode event/question/permission/tui 信号。
- 与 OpenCode Web UI 相关的兼容处理。

Proxy 只处理跨边界通信。Obsidian graph 和 context 策略由 GraphIndex、ContextManager、Bar 各自消费稳定接口。

### Runtime diagnostics 是产品能力

当前 `RuntimeDiagnostics`、XDG log、status.json、harness theme/bridge 已经证明诊断属于产品能力。这个插件服务的是调试和研究型 workflow。运行时状态必须是产品的一部分。

用户遇到错误时，UI 应直接显示：

- server 状态。
- health URL 和检查结果。
- spawn command 或 custom command。
- stderr 摘要。
- XDG log/status 路径。
- proxy URL。
- theme diagnostics。
- context diagnostics。

harness 负责复现和搬运证据。UI 负责让用户第一眼知道去哪里看。

## 第一阶段目标

### 1. 安全导航

所有插件展示的 vault 引用都要能判断：

- resolved file 是否存在。
- heading 或 block 是否存在。
- linkpath 是 resolved、unresolved、ambiguous，还是 unsupported。
- 点击会打开哪个已有位置。

不存在的目标不能触发 Obsidian 新建文件流程。远端 URL 不纳入本阶段。

### 2. Context provenance 和控制面

现有 `ContextItem` 生命周期要继续作为唯一上下文模型。下一步应把 Bar 从轻量计数扩展为可审查面：

- 当前 context 列表。
- 来源、行号、文本长度。
- 自动来源和手动来源区分。
- 跳转、复制 diagnostics。
- 清楚表达远端 remove 的语义。

### 3. GraphIndex 第一层

先建事实索引和 API，不急着做复杂排序。

最小 API 应支持：

- file node lookup。
- outgoing/incoming references。
- unresolved references。
- headings/blocks lookup。
- link target resolution evidence。
- 当前 active note 的 graph snapshot。

这一层完成后，Bar、navigator、diagnostics、GraphRAG 都有共同底座。

### 4. GraphRAG 派生索引

在第一层稳定后，后台维护：

- bounded reachability。
- shortest path evidence。
- cross-root coverage。
- structural gaps。
- repeated unresolved。
- local bridge/articulation candidates。

排序结果只作为候选，不直接写入 vault 或 context。

### 5. OpenCode event bridge

当前 session resolver 已经存在。后续 permission、question、event、tui 都应该复用同一个当前 session 入口。

第一阶段只读显示事件和 diagnostics。写入 Obsidian、自动回答 permission、自动追加 context 都放在后续策略层。

## 暂缓方向

以下方向暂缓，因为它们会先增加隐藏状态：

- 自动生成 daily note 或按日期组织对话。
- 把 Web UI 做成主要产品面。
- 自动把 GraphRAG 候选写进 vault。
- 自动创建缺失链接目标。
- 全文 embedding 和生成式知识图谱。
- 在 iframe 内部重写 OpenCode 组件行为。

这些能力以后可能有用，但它们需要先建立证据、导航、context provenance、GraphIndex 和 diagnostics。

## 拆 goal 的依据

后续 beads 的产品主线按这个顺序验收：

1. 先保证所有显示出来的 vault 引用都能安全跳转或清楚失败。
2. 再把 current session context 做成 Obsidian 原生可审查面。
3. 再做 GraphIndex 第一层，统一 link/head/block/incoming/outgoing/unresolved 的事实 API。
4. 再做 GraphRAG 派生索引和候选展示。
5. 最后接 OpenCode event/question/permission/tui，并让这些事件消费已有 session/context/graph/diagnostics 入口。

这个顺序的原因很简单：OpenCode 讨论要依赖可信上下文；可信上下文要依赖可信导航和 provenance；GraphRAG 要依赖 Obsidian metadata 的事实索引；事件桥要依赖稳定的 session 和 context 表达。

GraphIndex 的事实索引可以和安全导航、context provenance 并行推进。它不能阻塞安全导航止血，也不能提前承载推荐、自动注入或写 vault 策略。

## Appendix A：真实 vault 路径样例

以下样例来自只读检索，不代表最终算法输出格式。它们的作用是给 GraphIndex 和 GraphRAG 任务提供具体证据形状。

### 系统编程到基础设施

Seed：

- `/Users/oujinsai/Note/计算机/1-实践/1/系统编程.md`

可观察路径：

- `系统编程.md:219` 链接到 `[[1-实践/基础设施/基础设施综述|基础设施]]`。
- `系统编程.md:221` embed `1-实践/基础设施/基础设施综述.md#^ce68b2`。
- `1-实践/基础设施/AGENTS.md:7` 把基础设施问题追踪到“思维中断的成本与当前管理的状态复杂度成正比”。
- `1-实践/基础设施/AGENTS.md:9` 把这个问题连接到 `[[0-理论/0/阳：虚拟化|阳]]` 和 `[[1-实践/1/阴：状态机|阴]]`。

这个样例说明，候选关系不能只给“相关笔记”。它需要给出源文件、行号、link/embed 类型、subpath 或 block id、路径长度，以及为什么它跨过了实践和理论边界。

### 环境与状态到调试案例

Seed：

- `/Users/oujinsai/Note/计算机/0-理论/0/环境与状态.md`

可观察路径：

- `环境与状态.md:15` 链接到 `[[0-理论/0/阳：虚拟化|宏观的抽象]]`。
- `环境与状态.md:66` 链接到 `[[1-实践/examples/一些bug(的诊断过程)/WezTerm配置：幽灵空文件导致配置屏蔽|WezTerm 调试记录]]`。
- `环境与状态.md:82` 明确把调试动作落到 `strace`、`lsof`、`env` 这类观察环境状态的工具。

这个样例说明，GraphRAG 的候选可能连接理论笔记、诊断案例和工具笔记。排序字段至少要能表达路径证据、跨 root segment、heading/block 精度和候选是否已有直接链接。

## Appendix B：context provenance 缺口样例

当前代码和旧计划已经暴露出一个恢复缺口。

可观察事实：

- `docs/plans/context-control-surface.md` 的恢复契约要求 text 以 `<!-- oc-ctx -->` 开头，并通过 `listSessionMessages()` 找到 messageId/partId。
- `src/context/ContextSyncer.ts` 当前恢复条目时使用固定 `label: "Restored context"` 和 `sourceFile: "OpenCode session"`。
- `tests/context/ContextSyncer.test.ts` 和 `tests/context/ContextManager.test.ts` 也验证了这个形状。

这个形状只能证明“这是插件注入过的上下文”。它不能证明原始 vault 文件、行号、类型和 provenance 状态。Context surface 如果直接把恢复后的条目当作 vault-backed context 展示，就会让用户误以为它可追溯。

后续实现需要让恢复结果至少分成两类：

- provenance known：有 source path、range、type、textLength、messageId、partId、createdAt，可以走安全导航。
- provenance uncertain：只能确认来自 OpenCode session，不能确认 vault 来源。UI 和 diagnostics 必须直接显示 uncertain。

## 参考

- Obsidian `MetadataCache`: https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache
- Obsidian `CachedMetadata`: https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata
- Obsidian `TFile`: https://docs.obsidian.md/Reference/TypeScript+API/TFile
- Obsidian `Workspace`: https://docs.obsidian.md/Reference/TypeScript+API/Workspace
- Microsoft GraphRAG: https://microsoft.github.io/graphrag/
- Microsoft GraphRAG repository: https://github.com/microsoft/graphrag
- beads_viewer graph algorithms: https://github.com/Dicklesworthstone/beads_viewer/tree/main/bv-graph-wasm/src/algorithms
- 本项目 GraphRAG 讨论：[docs/explorations/graphrag-known-to-unknown.md](./graphrag-known-to-unknown.md)
- 本项目上下文控制面计划：[docs/plans/context-control-surface.md](../plans/context-control-surface.md)
