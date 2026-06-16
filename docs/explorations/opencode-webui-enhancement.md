# OpenCode Web UI 增强与扩展可行性分析

## 概述

本报告分析在 iframe 嵌入的 opencode Web UI 中通过本地代理注入脚本、追加 UI 元素的可行性。基于对 opencode v1.15.5 Web UI 源码（anomalyco/opencode `packages/app`）、运行时 HTML/CSS/JS bundle 分析，以及社区项目的调研。

## 关键文件

- `packages/app/src/entry.tsx` — Solid.js 应用入口，`render(() => <App />, document.getElementById("root"))`
- `packages/app/src/app.tsx` — 路由配置，包含所有 Context Provider（SDK、Sync、File、Layout 等）
- `packages/app/src/pages/session.tsx` — 会话主页面，组合 MessageTimeline + SessionSidePanel + Composer
- `packages/app/src/pages/session/session-side-panel.tsx` — 侧边面板（文件树 / Review / Context 标签页）
- `packages/app/src/components/session/session-context-tab.tsx` — **已存在的** Context 标签页（token 用量分析）
- `packages/app/src/components/session-context-usage.tsx` — 会话上下文用量指示器
- `packages/app/src/components/session/session-context-metrics.ts` — Token 计算逻辑
- `packages/app/src/components/session/session-context-breakdown.ts` — 上下文 token 分布估算
- `packages/app/src/components/prompt-input.tsx` — 输入框组件
- `packages/app/index.html` — HTML 入口，`<div id="root">` + Vite 模块脚本
- `src/proxy/OpenCodeProxy.ts` — obsidian 插件本地代理（剥离 CSP、注入脚本）

## 调研发现

### A. Web UI 技术架构

#### 前端框架

| 项目 | 详情 |
|------|------|
| **框架** | **Solid.js**（非 React） |
| **路由** | `@solidjs/router` |
| **数据获取** | `@tanstack/solid-query`（TanStack Query 的 Solid 版） |
| **UI 组件库** | `@opencode-ai/ui`（自研，使用 `data-component` / `data-slot` 模式） |
| **状态管理** | Solid.js signals + stores（`createStore`、`createSignal`）+ React Query 缓存 |
| **构建** | Vite |
| **CSS** | Tailwind + CSS 自定义属性（`var(--background-base)` 等设计 token） |

#### HTML DOM 结构

```html
<html lang="en" style="background-color: var(--background-base)">
  <head>
    <!-- 主题预加载脚本（内联，用于避免 FOUC） -->
    <script id="oc-theme-preload-script">...</script>
    <!-- Vite 构建的主 bundle -->
    <script type="module" crossorigin src="/assets/index-C-S6yi7W.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-CTjUd93I.css">
  </head>
  <body class="antialiased overscroll-none text-12-regular overflow-hidden">
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <!-- 唯一的 React/Solid 挂载点 -->
    <div id="root" class="flex flex-col h-dvh p-px"></div>
  </body>
</html>
```

**关键点**：
- 整个应用只有一个挂载点：`<div id="root">`
- 没有语义化的 HTML id 或 class 标识侧边栏、对话区域等——所有 UI 由 Solid.js 动态渲染
- CSS 使用原子化 Tailwind + 组件级 `[data-component=...]` 选择器

#### 全局变量

从 JS bundle 中提取到的 `window` 全局暴露：

| 全局变量 | 用途 |
|----------|------|
| `window.__INSTANCE` | 主应用实例（滚动管理相关） |
| `window.__TOGGLE` | 切换函数（控制滚动位置） |
| `window.__TAURI__` | Tauri 桌面环境检测 |

**没有暴露**：`window.__STORE__`、`window.__OPECODE__` 之类的全局状态对象。Solid.js 的 stores 和 signals 封装在组件作用域内。

#### 组件层次结构（会话页面）

```
Session 页面 (pages/session.tsx)
├── SessionHeader
├── 主布局区域（flex row）
│   ├── SessionSidePanel（左侧可缩放面板）
│   │   ├── Tab: FileTree（文件树）
│   │   ├── Tab: Review（diff 查看）
│   │   └── Tab: Context（SessionContextTab）★ 已存在
│   ├── MessageTimeline（消息时间线）
│   └── 终端面板（可选的底部终端）
└── SessionComposerRegion（底部输入区域）
    └── PromptInput（输入框 + 文件附件 + 历史）
```

### B. Web UI 中已有的上下文功能

opencode Web UI **已经有上下文相关的 UI**，但功能与我们需要的不同：

#### SessionContextTab（已存在的 Context 标签页）

位于侧边面板的第三个标签页，显示：
- 模型信息（Provider、Model、Context Limit）
- Token 用量（Input / Output / Reasoning / Cache Read+Write）
- 费用估算（USD）
- **上下文分布条**（按 system / user / assistant / tool 着色）
- 每条消息的展开式 raw JSON 查看

**但这显示的是 LLM 上下文窗口的 token 指标，不是「AI 收到了哪些 Obsidian 上下文」。**

#### SessionContextUsage（上下文用量指示器）

一个按钮/指示器，显示上下文窗口使用百分比，点击后打开 Context 标签页。

### C. 注入可行性分析

#### 1. 通过注入脚本追加 UI 元素

**技术上可行，但脆弱。**

**可行点**：
- 代理已经成功剥离了 CSP 头（`OpenCodeProxy.injectScript()`），可以注入任意 JS
- 注入脚本可以通过 `document.querySelector` 找到 `#root` 或其他 DOM 节点
- 可以在 `#root` 外部（`<body>` 下）追加额外的绝对定位面板
- 可以使用 Shadow DOM 隔离样式，避免与 opencode 的 CSS 冲突

**脆弱点**：
- Solid.js 使用细粒度响应式更新，DOM 可能在任意时刻被替换
- opencode 升级可能改变内部 DOM 结构
- 不存在稳定的 `data-*` 属性或 id 来锚定注入点
- 如果尝试插入到 `#root` 内部，Solid.js 的 reconciliation 可能会移除注入的元素

**推荐方案**：在 `#root` 外部（`document.body`）创建一个独立的绝对定位面板，通过 Shadow DOM 隔离样式。

```javascript
// 注入脚本示例
(function() {
  // 在 #root 外部创建独立面板
  const panel = document.createElement('div');
  panel.id = 'obsidian-context-panel';
  panel.attachShadow({ mode: 'open' });
  // 使用 Shadow DOM 避免样式冲突
  panel.shadowRoot.innerHTML = `
    <style>
      :host { /* 样式隔离 */ }
    </style>
    <div class="context-panel">...</div>
  `;
  document.body.appendChild(panel);
})();
```

#### 2. 注入脚本能否调用 opencode 内部 API？

**部分可行，但不可靠。**

- `window.__INSTANCE` 存在但用途有限（主要是滚动管理）
- Solid.js 的 stores 和 signals 没有暴露到全局
- **推荐方式**：不依赖 opencode 内部状态，而是通过 `fetch('/api/...')` 直接调用 HTTP API

#### 3. 通过同源 fetch 调用 opencode API

**完全可行，且这是最优路径。**

由于代理使 iframe 和 opencode 服务器同源：
- 注入脚本可以直接 `fetch('/api/session/:id/message')` 获取消息列表
- 可以解析消息中的 text parts，过滤 `!synthetic && !ignored` 得到有效上下文
- 不需要依赖 opencode 的任何内部状态

```javascript
// 注入脚本中的 fetch 示例
async function getContextMessages(sessionId) {
  const resp = await fetch(`/api/session/${sessionId}/message`);
  const messages = await resp.json();
  // 过滤出实际上下文内容
  return messages
    .filter(m => m.info.role === 'user')
    .flatMap(m => m.parts)
    .filter(p => p.type === 'text' && !p.synthetic && !p.ignored)
    .map(p => p.text);
}
```

#### 4. 更优雅的方式

| 方案 | 优雅度 | 可靠性 | 开发量 | 说明 |
|------|--------|--------|--------|------|
| **纯注入方案** | 低 | 低 | 中 | DOM 注入 + fetch API，依赖 opencode DOM 结构 |
| **混合方案 A：注入脚本 + Obsidian 面板** | 中 | 高 | 高 | 注入脚本通过 postMessage 发送上下文数据到 Obsidian，在 Obsidian 侧展示面板 |
| **混合方案 B：注入脚本 + iframe 内面板** | 中 | 中 | 中 | 注入脚本在 iframe 内追加 UI，通过 fetch 获取数据 |
| **外部方案：Obsidian 侧独立面板** | 高 | 高 | 中 | 不在 iframe 内做任何事，在 Obsidian 侧通过 Node.js `http.request`（已有 OpenCodeClient）展示上下文面板 |
| **使用 opencode SDK** | 最高 | 高 | 低 | opencode 没有浏览器端 SDK，只有 Node.js SDK。不适合 |

### D. 最优路径建议

**推荐：混合方案 B — 注入脚本在 iframe 内追加上下文面板 + 同源 fetch 获取数据**

理由：
1. **openCode Web UI 已经有 Context 标签页**，但它显示的是 token 指标而非「AI 收到的 Obsidian 上下文内容」。我们可以在这个基础上**追加一个自定义的上下文预览面板**，或增强现有的 Context 标签页。
2. 注入脚本通过同源 `fetch('/api/...')` 获取消息数据，不依赖 opencode 内部状态——可靠且持久。
3. 我们已有本地代理，CSP 剥离和脚本注入的基础设施就绪。

#### 具体实现策略

```
Obsidian 侧                       iframe 内（opencode Web UI）
┌──────────────────┐              ┌─────────────────────────────┐
│ OpenCodeProxy    │  剥离CSP     │ injected-script.js           │
│ (CSP剥离+注入)   │ ═══════════> │                              │
│                  │              │ 1. 监听 URL 变化检测 session │
│                  │              │ 2. fetch(/api/session/:id/   │
│                  │              │    message) 获取上下文消息    │
│ ContextManager   │              │ 3. 过滤 synthetic/ignored    │
│ (Obsidian上下文) │              │    parts                     │
│       │          │              │ 4. 在 iframe 内渲染面板      │
│       ▼          │              │                              │
│ OpenCodeClient   │  noReply:true│ 面板内容：                   │
│ (注入上下文)     │ ═══════════> │ • 打开的笔记列表             │
│                  │              │ • 选中文本预览               │
│                  │              │ • 最后更新时间               │
└──────────────────┘              └─────────────────────────────┘
```

#### 注入脚本伪代码

```javascript
// 通过代理注入到 opencode Web UI 的脚本
(function() {
  'use strict';

  let lastSessionId = null;
  let panelEl = null;
  const POLL_INTERVAL = 3000;

  // 从 URL 提取 session ID
  function getSessionId() {
    const match = location.pathname.match(/\/session\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  // 通过同源 fetch 获取上下文消息
  async function fetchContext(sessionId) {
    const resp = await fetch(`/api/session/${sessionId}/message`);
    const messages = await resp.json();
    const contextParts = [];

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === 'text' && !part.synthetic && !part.ignored) {
          // 检测 obsidian 上下文标记
          if (part.text.includes('<obsidian-context>')) {
            contextParts.push(part.text);
          }
        }
      }
    }
    return contextParts;
  }

  // 创建上下文预览面板
  function createPanel() {
    const host = document.createElement('div');
    host.id = 'obsidian-ctx-panel';
    host.style.cssText = 'position:fixed;top:48px;right:8px;z-index:100;max-width:320px;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .panel { background: var(--surface-raised-base); border: 1px solid var(--border-weak-base);
                 border-radius: 8px; padding: 12px; font-size: 12px; max-height: 60vh; overflow: auto; }
        .title { color: var(--text-strong); font-weight: 600; margin-bottom: 8px; }
        .item  { color: var(--text-base); padding: 2px 0; }
        .empty { color: var(--text-weak); font-style: italic; }
      </style>
      <div class="panel">
        <div class="title">Obsidian Context</div>
        <div id="ctx-content" class="empty">Loading...</div>
      </div>
    `;
    document.body.appendChild(host);
    return { host, content: shadow.getElementById('ctx-content') };
  }

  // 更新面板内容
  async function updatePanel() {
    const sessionId = getSessionId();
    if (!sessionId || sessionId === lastSessionId) return;
    lastSessionId = sessionId;

    if (!panelEl) {
      const result = createPanel();
      panelEl = result;
    }

    const contexts = await fetchContext(sessionId);
    if (contexts.length === 0) {
      panelEl.content.innerHTML = '<div class="empty">No Obsidian context</div>';
    } else {
      panelEl.content.innerHTML = contexts
        .map(ctx => `<pre class="item">${escapeHtml(ctx)}</pre>`)
        .join('');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 启动轮询
  setInterval(updatePanel, POLL_INTERVAL);
  updatePanel();
})();
```

#### 方案对比：为什么不用纯外部方案？

| 维度 | 混合方案 B（注入+fetch） | 外部方案（Obsidian 独立面板） |
|------|--------------------------|------------------------------|
| 用户可见位置 | iframe 内，与 Web UI 一体 | Obsidian 侧边栏独立区域 |
| 开发复杂度 | 中（注入脚本 + DOM 创建） | 低（复用 Obsidian ItemView） |
| 样式一致性 | 部分一致（可引用 CSS 变量） | 完全独立样式 |
| opencode 升级影响 | 中等（依赖 URL 路由和 API，不依赖 DOM） | 无影响 |
| 是否需要代理 | 需要（CSP 剥离） | 不需要 |
| 实时性 | 轮询（3 秒） | 插件侧事件触发 |

**混合方案 B 的优势**：上下文面板与 AI 对话在同一个视口内，用户无需在 Obsidian 侧边栏和 iframe 之间切换注意力。而且 opencode 的 API 是稳定的（出自 OpenAPI spec），不依赖 DOM 结构。

### E. 已知限制与风险

1. **opencode 版本升级**：CSS 变量名（`var(--surface-raised-base)` 等）来自 `@opencode-ai/ui` 设计系统，主版本升级可能改变变量名。但这些都是 opencode 自身的 CSS 变量，注入面板直接引用它们与 opencode UI 保持视觉一致，即使变量改名也只是样式失效，不会导致功能出错。

2. **认证问题**：如果 opencode 启用了 `OPENCODE_SERVER_PASSWORD`，fetch 请求需要携带认证头。注入脚本可以从 `localStorage` 或 cookie 中获取凭证，或由 Obsidian 插件通过 postMessage 传递。

3. **会话切换检测**：当前方案通过 URL 轮询检测会话变化，可以优化为监听 `popstate` 事件和 `history.pushState` monkey-patch。

4. **上下文内容解析**：opencode 的上下文消息格式是自由文本，obsidian 插件通过 `<obsidian-context>` 标记包裹上下文，注入脚本可以解析此标记来展示结构化内容。

5. **Shadow DOM 限制**：Shadow DOM 内部无法直接引用宿主页面的 CSS 变量。需要通过 `inherited: true` 或手动读取 `getComputedStyle(document.documentElement)` 来获取设计 token。更简单的方式是不使用 Shadow DOM，而是给面板元素设置足够高的 `z-index` 和独立的 CSS 作用域。

### F. 社区项目参考

| 项目 | Stars | 方式 | 说明 |
|------|-------|------|------|
| [hosenur/portal](https://github.com/hosenur/portal) | 671 | **替代 UI** | Mobile-first web UI，直接调用 opencode API |
| [joelhooks/opencode-vibe](https://github.com/joelhooks/opencode-vibe) | 177 | **替代 UI** | Next.js 16 web UI，React Server Components |
| [chris-tse/opencode-web](https://github.com/chris-tse/opencode-web) | 125 | **替代 UI** | Web-based UI 调用 opencode API |
| [shuv1337/oc-web](https://github.com/shuv1337/oc-web) | 65 | **替代 UI** | 最早的社区 web UI，TanStack Start + React |
| [prokube/pk-opencode-webui](https://github.com/prokube/pk-opencode-webui) | 26 | **替代 UI** | Prefix-aware web UI |

**关键发现**：所有社区项目都是**替代 UI（alternative UI）**，即完全替换 opencode 原生的 Web UI，通过 opencode HTTP API 自行构建前端。**没有任何项目尝试注入/增强现有的 opencode Web UI。** 我们的 iframe 嵌入 + 代理注入方案是独特的。

这也说明社区倾向于「重新实现 UI」而非「注入增强」，主要是因为：
1. opencode API 是稳定的 OpenAPI spec，直接调用更可靠
2. Web UI 作为 Solid.js SPA，内部状态不对外暴露，注入维护成本高
3. 替代 UI 可以完全控制用户体验

## 总结

1. **opencode Web UI 使用 Solid.js 构建**，DOM 结构完全动态生成，没有稳定的锚点。
2. **已存在的 Context 标签页**显示 token 指标而非上下文内容，但我们需要的「AI 收到了什么 Obsidian 上下文」仍有空白。
3. **注入脚本 + 同源 fetch 是最优方案**：不依赖 opencode DOM 结构，只依赖稳定的 HTTP API。
4. **社区无人做注入增强**——都在做替代 UI。我们的代理注入方案是差异化路径。
5. **Shadow DOM 隔离样式**可以避免注入 UI 与 opencode 自身样式冲突。
6. **fetch 同源请求**无需认证（代理使 iframe 与 opencode 同源），除非启用了 `OPENCODE_SERVER_PASSWORD`。
