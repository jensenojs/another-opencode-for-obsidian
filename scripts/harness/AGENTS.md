# Harness Module Instructions

`scripts/harness/` 是本地开发和运行态取证入口。它可以读取 vault 插件安装状态、XDG runtime 日志、OpenCode/Obsidian 本地声明、Obsidian CDP 状态，但不能成为生产功能的依赖。

## 边界

- 这里的代码只服务 `bun run harness ...` 和 `dev:*` 脚本。
- 不要从 `src/**` 生产代码导入 harness 模块。
- harness 可以调用插件公开的调试入口，例如 `startServer()`、`stopServer()`、`open-opencode-view`，但不能绕过插件自己的生命周期去手动拼出生产状态。
- 运行态 reload、theme、bridge 检查必须输出可复制的结构化 JSON 或 tabular check 结果。
- CDP 调试只面向本机 Obsidian 开发会话。默认端口可以是 `9222`，但必须允许参数覆盖。
- CDP 里的 DOM 读取只能用于取证和摘要，例如列出 iframe URL、computed style 或 runtime diagnostics。不要把 CDP selector 读到的事实搬回生产路径当作同步机制。
- 失败时报告具体缺失条件，例如 Obsidian 未用 remote debugging 启动、插件未加载、OpenCode health 不通；不要静默成功。

## 设计约束

- harness 可以做观测、重载、验证和摘要，不能把 localStorage/sessionStorage、DOM class selector 或临时 UI patch 当作生产成功路径。
- 新增 harness 能力时优先放到独立模块，再在 `scripts/harness.ts` 做命令分发。
- 不要把一次性的 CDP 临时脚本散落在对话里长期复用；重复出现的调试动作应收敛成 harness 命令。
- 输出中可以包含 URL、端口、路径和健康检查结果，但不要输出完整环境变量值或 secret-like key 的值。

## 模块组织

- `scripts/harness.ts` 只负责参数解析、命令分发和顶层输出。命令的主要逻辑放在 `scripts/harness/*.ts`。
- 与真实运行态交互的模块要有独立测试。测试优先覆盖参数、目标选择、payload 生成、错误输出和 race 防护，不依赖正在运行的 Obsidian。
- 重载插件时先停旧插件实例拥有的 server，再 disable/enable，再按参数决定是否启动 server 和打开 view。不要依赖 disable 阶段的异步清理顺序。
- harness 输出如果用于人工调试，字段名要稳定；新增字段可以追加，避免改名导致旧排查记录失去对照。
