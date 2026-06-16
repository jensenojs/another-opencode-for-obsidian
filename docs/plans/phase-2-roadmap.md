# Phase 2 — P0 机制消费路线

P0 做完后，ContextManager 暴露 `addManual()` / `removeItem()` / `restoreFromServer()` 三个出口。后续需求本质上是**什么时候调这三个出口**。适配层就是薄 proxy——只做事件 → 方法调用的转发。

## 代理层

```
外部事件                         代理                          P0 机制
────────                         ────                          ──────
nvim visual 模式 L 键    →  addCommand 回调            →  ContextManager.addManual()
鼠标选中文本变动          →  editor-change 回调         →  ContextManager.addManual()
反向链接缓存更新          →  metadataCache.on('changed')→  ContextManager.addAutoItem()
opencode SSE 入站         →  SSE 监听器                 →  ContextManager.addInboundItem()
```

代理不新增模块——现有 Obsidian 事件监听机制（`workspace.on`、`addCommand`）+ `ContextManager` 公开方法就是代理。

## 第一个后续：辅助输入

**鼠标选中自动追加**
- 监听 `editor-change` → diff selection → 调 `addManual(sessionId, text, file, startLine, endLine)`
- toggle 开关控制是否启用（Settings 或 StatusBar 浮层内）

**nvim 模式追加**
- Obsidian Hotkeys 面板中绑 `add-selection-to-context` 到 `L`
- `addCommand` 已注册，无需新代码

## 第二个后续：获取更多信号

**反向链接自动上下文**
- 监听 `metadataCache.on('changed')` → `getBacklinksForFile(file)` → `addAutoItem()`

**光标位置上下文**
- 监听 `active-leaf-change` → `getCursor()` → `addAutoItem()`

## 第三个后续：双向桥接

**opencode → Obsidian 通知**
- 监听 opencode SSE → `postMessage` → Obsidian Notice

**openCode 改文件 → 打开笔记**
- SSE 监听器 + `app.workspace.openLinkText()`
