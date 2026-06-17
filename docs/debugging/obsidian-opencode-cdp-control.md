# Obsidian OpenCode CDP control SOP

日期：2026-06-17

## 结论

调试 Obsidian 里的 OpenCode Web UI 时，可以直接控制 Obsidian 的 Electron
renderer 和其中的 OpenCode iframe。多数取证和最小交互 demo 不需要
Computer Use。

这个能力很重要，因为 OpenCode Web UI 运行在 Obsidian iframe 里。截图和
鼠标坐标只能看到表面状态；CDP 可以直接读取真实 DOM、shadow DOM、事件
路径、layout rect、localStorage、注入脚本内容，也可以发送真实
`mouseMoved` / `mousePressed` / `mouseReleased` 事件。

官方依据：

- Chrome DevTools Protocol 总览：
  https://chromedevtools.github.io/devtools-protocol/
- `Runtime.evaluate`：
  https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate
- `Input.dispatchMouseEvent`：
  https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent
- Electron `--remote-debugging-port`：
  https://www.electronjs.org/docs/latest/api/command-line-switches#--remote-debugging-portport

## 启动方式

先完全退出 Obsidian，避免旧进程没有 remote debugging port。

推荐启动命令：

```bash
/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222 2>&1 | tee /tmp/obsidian-debug.log
```

检查 CDP target：

```bash
curl -s http://127.0.0.1:9222/json/list
```

典型 target 有两类：

```text
type=page
url=app://obsidian.md/index.html

type=iframe
url=http://127.0.0.1:<proxyPort>/<dirBase64>/session/<sessionId>
```

`page` target 用来调用 Obsidian API，例如读取 active file、重载插件、
执行 command。

`iframe` target 用来检查和操作 OpenCode Web UI，例如读取 shadow DOM、
触发 review comment、检查 prompt context card、读取 localStorage。

## 基础 CDP 连接脚本

后续脚本都可以复用这个连接骨架。

```js
const targets = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json());
const top = targets.find((t) => t.type === "page" && t.url === "app://obsidian.md/index.html");
const iframe = targets.find((t) => t.type === "iframe" && t.url.includes("127.0.0.1"));

function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg);
  });

  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
  }

  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve({ ws, send }), { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
}
```

执行表达式：

```js
await conn.send("Runtime.evaluate", {
  expression: "(() => location.href)()",
  returnByValue: true,
  awaitPromise: true,
});
```

发送真实鼠标事件：

```js
await conn.send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x,
  y,
  button: "none",
  buttons: 0,
});
await conn.send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x,
  y,
  button: "left",
  buttons: 1,
  clickCount: 1,
});
await conn.send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x,
  y,
  button: "left",
  buttons: 0,
  clickCount: 1,
});
```

## Obsidian target 可做的事

Obsidian target 可以直接调用 Obsidian runtime API。

### 读取当前 vault 上下文

```js
(() => {
  const activeFile = app.workspace.getActiveFile?.();
  const leaves = app.workspace.getLeavesOfType?.("markdown") || [];
  const openNotes = leaves.map((leaf) => leaf.view?.file?.path).filter(Boolean);

  let line = null;
  try {
    const view = app.workspace.getActiveViewOfType?.(MarkdownView);
    const cursor = view?.editor?.getCursor?.();
    if (cursor) line = cursor.line + 1;
  } catch {}

  return {
    activePath: activeFile?.path || openNotes[0] || null,
    line,
    openNotes: Array.from(new Set(openNotes)).slice(0, 8),
  };
})();
```

### 重载插件

```js
(async () => {
  const id = "another-opencode-for-obsidian";
  await app.plugins.disablePlugin(id);
  await app.plugins.enablePlugin(id);
  await app.commands.executeCommandById(id + ":open-opencode-view");
  return { enabled: Boolean(app.plugins.plugins[id]) };
})();
```

这个操作会真实影响当前 Obsidian 状态。只在需要验证新构建产物时执行。

## OpenCode iframe target 可做的事

### 深度遍历 shadow DOM

OpenCode diff viewer 使用 shadow DOM。普通 `document.querySelector()` 看不到
里面的行号、内容行和评论控件。调试脚本需要深度遍历。

```js
function allDeep(root, out = []) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = root.nodeType === 1 ? root : walker.nextNode();
  while (node) {
    out.push(node);
    if (node.shadowRoot) allDeep(node.shadowRoot, out);
    node = walker.nextNode();
  }
  return out;
}
```

### 检查注入脚本版本

```js
(() => {
  const scripts = Array.from(
    document.querySelectorAll("script[data-another-opencode-for-obsidian-bridge]"),
  );
  const source = scripts.map((s) => s.textContent || "").join("\n");
  return {
    scriptCount: scripts.length,
    hasOldColumnTrigger: source.includes("[data-line], [data-alt-line], [data-column-number]"),
    hasOldColumnContentTrigger: source.includes("[data-line], [data-alt-line], [data-column-content]"),
    hasOldContentWrapperTrigger: source.includes(
      "[data-line], [data-alt-line], [data-column-content], [data-content]",
    ),
    hasNewLineTrigger: source.includes("[data-line], [data-alt-line]"),
  };
})();
```

这次 review comment 回归修复的验收就是用这个检查确认 live iframe 里已经
没有旧的宽 selector。

### 打开 OpenCode 原生 review comment

不要只用 `button.click()`。OpenCode 的 hover utility 会参与选择当前行。
应该先移动鼠标到行号列，再点击出现的 `+`。

```js
const line = allDeep(document)
  .filter((el) => el.matches?.("[data-column-number]"))
  .map((el) => {
    const r = el.getBoundingClientRect();
    return {
      line: el.getAttribute("data-column-number"),
      x: r.left + r.width / 2,
      y: r.top + Math.min(18, r.height / 2),
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    };
  })
  .find((item) => item.line === "37");
```

然后用 `Input.dispatchMouseEvent` 发送 `mouseMoved`，等待一小段时间，再点击
可见的 `+` 按钮。

## 这次 native context demo 的过程

这次调研用 CDP 做了两个最小 demo。

### Demo A：走 OpenCode 原生评论入口

1. 从 Obsidian target 读取真实 workspace context：

```text
Active: 0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md
Open notes:
- 0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md
```

2. 在 OpenCode iframe 里用真实鼠标事件打开 review line comment。

3. 把这段真实 context 写入 OpenCode 原生 textarea。

4. 点击 OpenCode 原生“评论”按钮。

运行态结果：

```text
bodyContainsWorkspace: true
rawContainsWorkspace: true
```

OpenCode prompt storage 中出现真实 `context.items`：

```json
{
  "type": "file",
  "path": "0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md",
  "selection": {
    "startLine": 37,
    "endLine": 37,
    "startChar": 0,
    "endChar": 0
  },
  "comment": "Obsidian workspace context\nActive: ...\nOpen notes:\n- ...",
  "commentOrigin": "review"
}
```

结论：OpenCode 原生“下一条消息 context 卡片”可以承载插件产生的真实
Obsidian context。它会立刻刷新 UI，也会写入 OpenCode 自己的 prompt
store。

### Demo B：直接改 localStorage

1. 找到当前 session 的 prompt storage key：

```text
opencode.workspace.L1VzZXJzL291.15w3e0t.dat:session:ses_14b42c145ffeebLTdhoIIPYl6s:prompt
```

2. 直接往 `context.items` 里追加真实 file context item。

3. 手动 dispatch `StorageEvent`。

运行态结果：

```text
directWrite.ok: true
afterDirect.bodyContainsDirect: false
```

这表示 storage 写入成功，但当前 Solid prompt store 没有刷新。这个 direct
item 随后已经清理掉，避免 Obsidian / OpenCode 重载后出现残留。

结论：直接写 `localStorage` 不能作为正式机制。它只能改持久化数据，不能
稳定驱动当前 UI。

## 使用边界

CDP 可以做两类事：

- 只读取证：DOM、shadow DOM、layout rect、event path、computed style、
  localStorage、注入脚本内容、OpenCode prompt store。
- 最小交互 demo：真实鼠标事件、textarea 输入、按钮点击、插件 reload。

CDP 不应该变成长期产品机制。

这些做法不进入正式实现：

- 长期依赖 CDP 操作用户页面。
- 直接写 OpenCode `localStorage` 当作 prompt context API。
- 用插件注入脚本伪造一套看起来像 OpenCode 原生卡片的 DOM。
- 用固定像素坐标决定业务行为。

## 取证状态命名

每次调试结论必须标记状态：

- `observed`：本次命中用户现象，并采到对应证据。
- `not-observed`：本次没有命中用户现象。
- `inconclusive`：采样点、时间窗或前提不足。

不要把 `not-observed` 写成“问题已排除”。不要把一次普通浏览器结果写成
Obsidian iframe 结论。

## 为什么它比 Computer Use 更适合这里

Computer Use 看的是屏幕。它适合人工可见流程，但很难回答这些问题：

- 当前点击事件的 `composedPath()` 是什么。
- OpenCode diff 行号列和文本列分别是什么 DOM。
- 黄色 hover indicator 的真实 rect 是哪一个元素给的。
- 当前 iframe 里跑的是旧注入脚本还是新注入脚本。
- OpenCode prompt context card 写到了哪个 storage key。
- `button.click()` 和真实鼠标事件为什么行为不同。

CDP 直接连接 renderer。它可以同时拿到 Obsidian API、OpenCode iframe DOM、
shadow DOM 和真实事件坐标。对 Obsidian-opencode 这种 iframe + proxy +
注入脚本的项目，它应该是第一调试工具。

