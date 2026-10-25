# Harness Module Instructions

`scripts/harness/` 是本地开发和运行态取证入口。它读 vault 插件安装状态、XDG runtime 日志、OpenCode/Obsidian 本地声明、Obsidian CDP 状态，不能成为生产功能的依赖。

## 边界

- 只服务 `bun run harness ...` 和 `dev:*` 脚本。
- 不要从 `src/**` 生产代码导入 harness 模块。
- harness 可以调用插件公开的调试入口（`attachService()`、`getServiceState()`、`open-opencode-view`），但不能自己拼出生产状态，也不能启动、停止或重启 opencode 服务。服务生命周期归 `opencode service`；harness 只读 `status.json` 判断 attach 结果。
- 运行态 reload、theme、bridge 检查必须输出可复制的结构化 JSON 或 tabular check 结果。
- CDP 只面向本机 Obsidian 开发会话，默认端口 `9222`，必须允许参数覆盖。CDP 里的 DOM 读取只用于取证和摘要。
- 失败时报告具体缺失条件：Obsidian 未开 remote debugging、插件未加载、`status.json` 缺失、服务未 attach。不要静默成功。

## 设计约束

- harness 可以做观测、重载、验证和摘要，不能把 localStorage、DOM class selector 或临时 UI patch 当作生产成功路径。
- 新增 harness 能力时优先放到独立模块，再在 `scripts/harness.ts` 做命令分发。
- 不要把一次性的 CDP 临时脚本散落在对话里长期复用；重复出现的调试动作应收敛成 harness 命令。
- 输出中可以包含 URL、端口、路径和 attach 结果，但不要输出完整环境变量值、service password 或 secret-like key 的值。

## 模块组织

- `scripts/harness.ts` 只负责参数解析、命令分发和顶层输出。命令的主要逻辑放在 `scripts/harness/*.ts`。
- 与真实运行态交互的模块要有独立测试。测试优先覆盖参数、目标选择、payload 生成、错误输出和 race 防护，不依赖正在运行的 Obsidian。
- 重载插件时先 disable，再 enable，再按参数决定是否重新 attach 和打开 view。不要依赖 disable 阶段的异步清理顺序。
- harness 输出如果用于人工调试，字段名要稳定；新增字段可以追加，避免改名导致旧排查记录失去对照。
