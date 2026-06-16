# GraphRAG：从已知关系推导未知关系

## 问题

当前 GraphIndex 的第一层目标很清楚：读取 Obsidian metadata，得到文件、标题、块、wikilink、embed、resolved link、unresolved link、alias、position、入链、出链这些事实。它能回答“图里已经写了什么”。

这个目标还不够。比较研究、吸引子识别、对话上下文扩展关心的是另一个问题：如何从已经写出来的关系中，找到还没有被明确写出来的关系。

这就是本项目里的 GraphRAG 问题。本文关注的是让 agent 和用户看到：

- 哪些节点共享很多证据路径，但正文没有直接链接。
- 哪些不同领域的路径正在收敛到同一个上游问题。
- 哪些笔记看起来像普通领域笔记，但被多个跨域短路径反复经过。
- 哪些 unresolved linkpath 反复出现，说明语言里已经有概念，结构里还没有笔记。
- 哪些 alias 指向同一目标或相同 alias 指向不同目标，暴露命名漂移。
- 当前 session 已经带入的上下文，再加入哪几篇能减少图上的跳步。

这里的“未知”来自结构痕迹：它还没有被写成显式链接、显式笔记、显式 thesis，但已经在路径、alias、断链、共同邻居或上下文扩展里出现。

## 已知是什么

第一阶段的已知来自稳定面：

- Obsidian `MetadataCache`：`getFileCache()`、`resolvedLinks`、`unresolvedLinks`、`CachedMetadata.links`、`embeds`、`headings`、`blocks`。
- Vault 文件结构：`TFile.path`、顶层目录、basename、rename/delete/create 事件。
- Obsidian wikilink 局部证据：raw link、display text、heading subpath、block subpath、0-based position。
- 当前 OpenCode session context：已经进入模型上下文的 vault 来源、行号、类型、文本长度、provenance 状态。
- 后续可接入的事件：OpenCode question、permission、event、tui、tool diff；这些先走 proxy 或独立事件监听，不污染 GraphIndex 第一层。

这些已知有一个共同点：它们是可审查的。UI 可以跳回原文，harness 可以输出路径和位置，agent 可以把证据交给用户检查。

## 未知是什么

本项目关心的未知有四类。

### 缺失关系

两个节点没有直接链接，但它们共享很多来源、目标或短路径。这个候选关系可能意味着：

- 需要补一条正文中的 wikilink。
- 需要新建一篇比较笔记。
- 需要把已有某篇笔记提升为桥接笔记。
- 需要承认两者只是结构相似，语义无关。

GraphIndex 只能返回证据。是否写链接、写比较、写新笔记，是策略层和用户判断。

### 收敛候选

多条表面路径在 2 到 3 跳内到达同一个节点。这个节点可能是吸引子候选。

收敛候选的关键证据是不同起点是否从不同方向抵达同一处。入度高的索引页、目录页、AGENTS 文件可能只是人工路由点。收敛候选需要保留每条路径的来源、长度、root segment、引用位置。

### 结构缺口

图中已经反复出现某个名字或路径模式，但没有稳定目标：

- repeated unresolved linkpath
- alias drift
- heading/block subpath 失效
- 同一概念在多个目录下分裂成多个笔记
- 跨理论/实践的路径存在，但没有承接这条路径的桥接节点

这类缺口比普通断链更重要。普通断链常常只是维护问题；结构缺口说明知识结构已经在生长，但还没有形成稳定表达。

### 上下文扩展候选

当前 OpenCode session 已经有一组 context。候选节点的价值取决于它加入后带来的边际变化：

- 新增多少可达节点。
- 缩短哪些重要节点的距离。
- 覆盖哪些新的顶层目录。
- 是否连接了原本分离的局部集群。
- 是否带来 heading/block 级证据。
- 是否只是一个泛化 hub。

这类候选服务于对话中的 GraphRAG。对话时不能临时跑全图重计算，必须消费已经维护好的派生索引。

## 索引策略

GraphIndex 第一层是事实索引。GraphRAG 需要第二层派生索引。

第一层必须精确，来源是 Obsidian metadata。第二层可以带局部误差，因为它服务排序、候选发现和注意力分配。只要每个候选都能回到第一层证据，局部误差可以通过重新索引和人工审查修正。

### 基础索引

基础索引随 metadata event 增量维护：

- `nodesByPath`
- `referencesBySource`
- `outgoingBySource`
- `incomingByTarget`
- `unresolvedBySource`
- `unresolvedByLinkpath`
- `headingsByPath`
- `blocksByPath`
- `aliasByTarget`

这一层是所有 UI、navigator、diagnostics 的共同入口。

### 派生索引

派生索引用后台任务维护：

- bounded reachability：每个节点在 1 到 3 跳内可达的节点集合。
- shortest path cache：常用 seed 到候选节点的短路径证据。
- coverage index：节点或节点集合加入后能覆盖的新增邻域。
- bridge index：连接不同 root segment 或不同局部集群的节点和边。
- structural gap index：共享邻居但没有直接链接、repeated unresolved、alias drift。
- local centrality：局部 PageRank、局部 betweenness、HITS hub/authority、k-core 等指标。

派生索引需要持久缓存。对话触发时才计算会错过交互窗口。合理做法是把派生结果作为可删除缓存写入 XDG state，使用 `vault id/path + graph snapshot version + plugin version + algorithm version` 作为 cache key。

缓存只保存派生结果。缓存缺失、过期、局部错误时，系统显示分析状态并后台重建。所有候选都携带证据路径，最终审查仍回到基础索引和原文。

### 后台更新

Obsidian vault 的图不会以毫秒级疯狂变化。派生索引可以接受延迟。

推荐流程：

- metadata event 到来后，基础索引立即更新。
- 派生索引标记为 stale，记录影响的 source/target。
- 后台任务 debounce 后增量更新局部可达性和缺口样本。
- 大范围 rename/delete 或初次加载后，后台全量重建派生索引。
- UI 读取时显示 `computed | stale | rebuilding | partial | failed`。

这样 Bar 可以立刻显示已有事实，同时把算法结果标为旧或部分可用。

## 排序目标

排序如果只按入度、出度或 PageRank，会把已有中心继续放大。

更适合本项目的排序目标是可达性变化。

### 减少跳步

候选节点加入当前集合后，如果能让更多目标在 1 到 3 跳内可达，或降低平均最短路径，它就有排序价值。

需要返回的证据：

- 加入前距离。
- 加入后距离。
- 新增可达节点数量。
- 受影响目标列表。
- 每条变化对应的路径。

### 增加跨域覆盖

候选节点如果连接新的 root segment，它可能让当前问题离开单一领域回音。

需要返回的证据：

- 覆盖的 root segment。
- 每个 root segment 的新增节点数。
- 跨域路径样本。
- 候选节点是否只是目录页或索引页。

### 暴露共同收敛

多个 seed path 在有限跳数内到达同一个节点。排序时应优先显示覆盖 seed 数更多、路径更短、来源 root 更分散的候选。

需要返回的证据：

- 覆盖的 seed 列表。
- 每个 seed 到候选的最短路径。
- 路径中的引用位置。
- heading/block 精度。

### 暴露结构缺口

候选关系没有直接边，但共享证据足够多。排序时应显示缺口类型和证据强度。

需要返回的证据：

- shared source count
- shared target count
- bridge path count
- repeated unresolved count
- alias conflict count
- direct edge exists

这里可以有排序分数，但分数必须可拆解。UI 和 diagnostics 必须显示数字背后的证据字段。

## 算法来源与取舍

`beads_viewer` 对本项目最有价值的启发是两点：图指标分阶段计算；每个指标暴露计算状态。它把快指标和慢指标分开，并在 robot 输出里暴露 `computed | approx | timeout | skipped`。这个设计适合 Obsidian 插件，因为 UI 不能等待慢指标完成。

可以借鉴的算法方向：

- coverage set：选出能覆盖最多邻域的候选节点。
- top-k what-if：模拟加入一个候选后带来的边际变化。
- articulation points / bridges：识别连接不同局部结构的节点和边。
- bounded BFS：为当前 seed set 提供 1 到 3 跳可达性和路径证据。
- betweenness：识别桥接节点，成本较高，适合后台或近似。
- HITS：区分 hub 型索引笔记和 authority 型被指向笔记。
- k-core：识别稳定集群。
- PageRank / eigenvector：作为全局结构指标，只能进入解释因子或 diagnostics。

需要谨慎的算法：

- topological sort、critical path、slack 更适合任务依赖图。Obsidian wikilink 图天然有环，环常常是概念互相解释的结果。
- cycles 在知识图里不应默认当错误。只有在显式建模“依赖关系子图”时，环才可能是诊断对象。

## GraphRAG 分层

本项目的 GraphRAG 可以分三层推进。

### 结构 GraphRAG

只使用 Obsidian metadata 和当前 session context。

能力：

- 安全跳转。
- 入链/出链/断链/孤岛。
- heading/block 精确证据。
- bounded reachability。
- coverage 和 what-if 排序。
- structural gaps。

这是当前最应该先做的层。它可审查、成本低、与 Obsidian 的已有链接习惯一致。

### 语境 GraphRAG

在结构证据上增加局部文本摘要，但仍保持证据可跳转。

可能输入：

- 引用位置附近的段落。
- heading 下的小节摘要。
- 当前 session 中用户和模型刚讨论过的命题。
- OpenCode tool/event/question 的状态。

这一层可以帮助判断“共享邻居”是否真的有语义关系。它需要更谨慎的隐私和缓存策略，因为它开始处理正文内容。

### 生成 GraphRAG

由 LLM 从笔记全文或对话中抽取实体、关系、社区摘要。

Microsoft GraphRAG 的公开实现就是这一路径：从文本中构造知识图谱，再用社区摘要和图机器学习输出来增强查询时提示。这个方向很强，但它会引入新的真相源、成本、误差和重建策略。当前项目可以学习它的问题意识，先不把它作为第一阶段目标。

## 误差边界

派生图算法可以有误差。需要守住几条边界：

- 错误候选不能修改 vault。
- 错误候选不能自动进入 OpenCode context。
- 每个候选都能展示证据路径。
- 指标状态必须可见。
- 缓存可以删除重建。
- 基础索引错误才是高优先级问题。
- 派生索引 stale 是正常状态，不能伪装成最新。

这意味着 GraphRAG 可以大胆做后台预计算，但用户可见动作仍要经过显式控制。

## 产品入口

Bar 是第一产品面。它需要显示当前 context，也需要显示 GraphRAG 候选和分析状态。

它可以显示几类内容：

- 当前 session 已经携带的 context。
- 当前 context 的 provenance 和可跳转状态。
- reachability 状态：fresh、stale、rebuilding。
- 候选扩展：加入后能减少跳步或增加覆盖的笔记。
- 结构缺口：可能值得写链接、写比较、修 alias、补吸引子笔记的地方。
- 复制 diagnostics：输出基础索引状态、派生索引状态、候选证据，不输出全文。

这些入口都应先显示事实和证据。任何写入 vault、加入 session context、创建链接、创建笔记的动作都要用户显式触发。

## 后续拆分

这篇文档先保留大问题。后续 beads 可以从这里拆出：

- 基础 GraphIndex 数据模型和事件维护。
- 派生索引 cache key、状态机和 XDG 存储。
- bounded reachability 和 shortest path evidence。
- context expansion what-if 排序。
- structural gap index。
- Graph diagnostics 和 harness 输出。
- Bar 对 GraphRAG 候选的只读展示。
- 用户确认后的 context expansion 动作。

拆 beads 时要保持一个边界：beads 写可执行任务，本文保留问题定义和取舍依据。

## 参考资料

- Obsidian `MetadataCache` 文档：https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache
- Obsidian `CachedMetadata` 文档：https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata
- Microsoft GraphRAG 项目：https://github.com/microsoft/graphrag
- GraphRAG 论文：https://arxiv.org/abs/2404.16130
- Microsoft GraphRAG 文档：https://microsoft.github.io/graphrag/
- `beads_viewer` README：https://github.com/Dicklesworthstone/beads_viewer
- `beads_viewer` WASM 图算法目录：https://github.com/Dicklesworthstone/beads_viewer/tree/main/bv-graph-wasm/src/algorithms
- `coverage_set` 实现：https://github.com/Dicklesworthstone/beads_viewer/blob/main/bv-graph-wasm/src/algorithms/coverage.rs
- `topk_set` 实现：https://github.com/Dicklesworthstone/beads_viewer/blob/main/bv-graph-wasm/src/algorithms/topk_set.rs
- articulation / bridges 实现：https://github.com/Dicklesworthstone/beads_viewer/blob/main/bv-graph-wasm/src/algorithms/articulation.rs
- `beads_viewer` performance note：https://github.com/Dicklesworthstone/beads_viewer/blob/main/docs/performance.md
