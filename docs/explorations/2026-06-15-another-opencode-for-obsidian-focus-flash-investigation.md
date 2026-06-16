# OpenCode Obsidian 插件：主编辑器随 OpenCode 滚动弹闪的排查记录

## 0. 一句话结论

在 Obsidian 外观模式下，OpenCode iframe 内部任何使用 `backdrop-filter` 的元素在滚动时，都可能触发 Chromium/Electron 合成器对背景像素的跨层重采样。当前抓到的具体样本是自定义滚动条 thumb，但根因不能绑定到这个 selector；上游随时可以新增、移动或改名使用 `backdrop-filter` 的元素。由于 editor background 插件把主编辑器和大量 Obsidian 容器设为透明、把背景图放在 `body::before` 上，这种合成层面的扰动直接表现为**左侧主编辑器区域的亮度/暗度弹闪**。

生产契约：在 Obsidian 外观模式下，强制禁用 OpenCode iframe 内部所有 `backdrop-filter`。保留半透明 alpha surface、border、shadow、scrim；不保留真正采样背后像素的毛玻璃 blur。

---

## 1. 问题现象

在以下组合下出现：

- Obsidian 桌面版（Electron/Chromium 内核）。
- 安装了本插件 `another-opencode-for-obsidian`，并且 `webViewAppearance` 设为 `obsidian`。
- 安装了 editor background 类社区插件，给 Obsidian 主窗口加了背景图。
- 右侧 OpenCode 侧边栏处于运行状态。

具体表现：

- 在右侧 OpenCode Web UI 里用触控板上下滑动，左侧主编辑器某块区域会短暂变亮或变暗。
- 有时点击 OpenCode 内部也会出现类似弹闪。
- 弹闪区域不一定紧挨着滑动位置，而是主编辑器中间或对应高度的一块矩形区域。
- 复现不稳定，但滑动是相对稳定的触发方式。

关键观察：弹闪不是持续存在的，而是发生在**滚动事件边界**（开始滚、结束滚、sticky header 状态切换）的短暂时刻。

---

## 2. 前置知识（写给没有前端背景的自己）

### 2.1 浏览器页面 = DOM + CSS

你可以把浏览器页面想象成一座大楼：

- **DOM（文档对象模型）**：大楼的骨架。每个标签（`div`、`iframe`、`p`）是一根柱子或一面墙，它们的嵌套关系就是大楼结构。
- **CSS（层叠样式表）**：大楼的装修。决定墙的颜色、透明度、高度、位置、是否模糊等。
- **Computed Style（计算后样式）**：某面墙最终实际长什么样。它由 DOM 结构 + 所有适用的 CSS 规则 + 浏览器默认值共同计算得出。

如果页面某块区域突然变亮/变暗，传统思路是：找到那块区域对应的 DOM 元素，看它前后的 Computed Style 有没有变化。例如：class 从 `mod-active` 变成 `mod-inactive`，导致背景色变了；或者 `opacity` 从 1 变成 0.5。

### 2.2 浏览器是怎么把页面画出来的

浏览器显示一页内容，要经过几个阶段：

1. **解析 HTML/CSS**：知道有什么元素、它们该长什么样。
2. **Layout（布局）**：计算每个元素的几何尺寸和位置（宽、高、坐标）。
3. **Paint（绘制）**：把每个元素画成一张小图片（位图 bitmap）。
4. **Composite（合成）**：把所有小图片按层级叠起来，输出到屏幕。

为了性能，浏览器不会每滚一帧都重新画所有东西。它会把一些元素提前画到独立的“图层”（layer）里，滚动时只移动这些图层。这个工作通常由 GPU 完成，所以叫 **GPU compositing**。

### 2.3 什么是 Compositor Layer

想象你在 Photoshop 里做设计，每个元素一个图层：

- 背景图层（body::before 背景图）。
- 左侧编辑器图层。
- 右侧 OpenCode iframe 图层。
- iframe 内部的滚动条、sticky header 等小图层。

**Compositor（合成器）** 就是把这些图层叠起来显示到屏幕的环节。

哪些元素容易被提升为独立图层？

- `iframe`（天然独立 layer）。
- `position: fixed`、`position: sticky`。
- `transform`、`opacity`。
- `will-change: transform`。
- **`backdrop-filter`**。
- 3D 变换、canvas、video 等。

图层的好处是性能高，代价是图层数量、大小、透明度变化时，合成器需要重新分配 GPU 内存（backing texture），这个切换过程可能产生视觉异常。

### 2.4 什么是 backdrop-filter

`backdrop-filter: blur(4px)` 是一种特殊效果：

> 元素本身不自带背景图，而是把**它背后那一块屏幕像素**实时拿过来，模糊一下，再显示在这个元素下方。

举例：

- 毛玻璃效果的面板常用 `backdrop-filter: blur(...)`。
- macOS 的 Finder 侧边栏、iOS 控制中心都用了类似原理。

为什么它危险？

因为它需要读取“背后的像素”。在简单页面里，背后的像素就是父元素；但在复杂场景里，背后可能是：

- 另一个 iframe；
- 透明层下面的 fixed 背景图；
- GPU 上已经合成好的 layer texture。

当这些图层在滚动或焦点变化时更新，`backdrop-filter` 的采样边界就可能短暂出错，出现闪烁、残影、黑块或亮度变化。

### 2.5 为什么 editor background 插件让这个问题更明显

editor background 插件（如 `obsidian-editor-background`）的工作方式：

1. 在 `body::before` 上放一张全屏 fixed 背景图。
2. 把 `.app-container`、`.workspace`、`.workspace-leaf`、`.cm-editor` 等大量元素设为 `background: transparent`。
3. 于是整个 Obsidian 窗口的视觉背景都依赖 `body::before` 那张图。

结果是：主编辑器本身是透明的，你看到的编辑器背景其实是 body::before 透过层层透明元素显示出来的。一旦合成器对透明层的处理方式短暂出错，用户会直接看到编辑器区域亮度变化。

---

## 3. 环境里的关键代码证据

### 3.1 本插件把宿主容器做成隔离的 paint 层

`styles.css`：

```css
.opencode-appearance-obsidian {
  position: relative;
  isolation: isolate;
  contain: paint;
  background-color: transparent;
}
```

`isolation: isolate` 创建新的 stacking context；`contain: paint` 告诉浏览器这个元素的绘制可以被裁剪和独立管理。这在大多数情况下是好设计，但也意味着 OpenCode pane 与父窗口其余部分之间存在明确的合成边界。

### 3.2 iframe 注入样式里也用了 isolation

`src/proxy/ProxyInjection.ts` 注入 iframe 的 CSS：

```css
body {
  position: relative;
  isolation: isolate;
}
```

iframe body 本身是独立的 document，这个 `isolation` 进一步把 iframe 内部的 stacking context 和父窗口分开。

### 3.3 OpenCode UI 里大量使用 position: sticky

在 OpenCode 上游源码里搜索到的：

- `packages/ui/src/components/sticky-accordion-header.css`：`position: sticky; background-color: var(--background-stronger);`
- `packages/ui/src/components/session-turn.css`：`[data-slot="session-turn-diffs-header"] { position: sticky; ... }`
- `packages/ui/src/components/file.css`、`list.css`、`message-part.css` 里也有 sticky 元素。

sticky 元素在滚动时会触发 compositor layer promotion/demotion。

### 3.4 OpenCode UI 的自定义滚动条 thumb 用了 backdrop-filter

OpenCode 的滚动容器 `.scroll-view__viewport` 隐藏原生滚动条，使用自定义滚动条。滚动条 thumb 的伪元素使用了 `backdrop-filter: blur(4px)`。

这是本次问题里抓到的**直接触发样本**：滑动 → thumb 出现/移动/透明度变化 → `backdrop-filter` 采样背景像素 → 合成器扰动 → 父窗口视觉异常。后续验证证明，只禁这个 selector 仍会闪动，所以生产修复不能依赖 `.scroll-view__thumb::after` 这个上游 class。

### 3.5 Obsidian 外观模式下 --background-stronger 是透明的

`src/theme/WebViewTheme.ts`：

```typescript
"--background-stronger": "transparent",
```

注释说明：

> OpenCode uses this legacy token for the full session canvas. The Obsidian host view owns the backdrop; the session shell must not add a second large surface over it.

这意味着 OpenCode 的 sticky header 在 Obsidian 外观下背景是透明的，不会自己产生暗层；但它们的位置切换和 layer promotion 仍然会扰动合成器。

---

## 4. 排查过程（逐轮记录）

### 4.1 第一轮假设：OpenCode 内部某个 hover/active 元素样式泄漏

想法：点击或滑动时，OpenCode 内部某个按钮、菜单、composer 被激活，它的大面积 shadow 或背景透过 iframe 边界影响到了父窗口。

验证：查看 OpenCode 内部是否有 `position: fixed` 或巨大 `box-shadow` 的元素，会在滚动/点击时出现。

结果：

- OpenCode 的 elevation shadow 使用的是 `box-shadow`，理论上不会透出 iframe。
- 用户后来补充：**滑动也能复现**，而且这个现象不是只在点击位置下方。

结论：不是某个具体元素的 hover/active 状态。因为滑动时不一定 hover 到特定元素。

### 4.2 第二轮假设：iframe focus 导致 Obsidian active leaf 切换

想法：点击/滑动 iframe 时，iframe 获得焦点，Obsidian 自动把 active leaf 从左侧编辑器切到右侧 OpenCode leaf。这会导致 `.cm-line.cm-active`、`.mod-active` 等状态重绘，产生亮度变化。

验证：

- 代码层面搜索 `setActiveLeaf`，只在 `ViewManager.toggleView()` 里使用，普通点击/滑动不会调用。
- AGENTS.md 明确禁止在普通 iframe 点击时调用 `setActiveLeaf`。
- 用 trace 监听父窗口的 `.cm-focused`、`.cm-line.cm-active`、`.workspace-leaf.mod-active`、active element。

结果：**父窗口 DOM 没有变化，没有 active line 变化，没有 active leaf 变化，没有 focused editor 变化。**

结论：不是 iframe 窃取焦点导致的父窗口 DOM 重绘。

### 4.3 第三轮假设：主题同步反复重写 CSS 变量

想法：`OpenCodeView.ts` 里有 `ResizeObserver`，会在 iframe 布局变化时触发 `scheduleThemeSync("opencode-layout-resized")`，重新计算并发送 CSS 变量。如果滑动时 ResizeObserver 反复触发，父窗口可能频繁重排。

验证：

- 检查 `syncThemeToIframe`：它确实会获取 iframe rect、计算 theme fingerprint、postMessage 给 iframe。
- 但 theme 变量只发送给 iframe，不会直接修改父窗口样式。
- trace 显示父窗口 Computed Style 没有变化。

结论：不是主题同步导致的父窗口样式抖动。

### 4.4 第四轮假设：Chromium/Electron 合成器层面的问题

经过前面三轮，DOM/CSS 变化被排除，问题只能落在 Paint/Composite 阶段。

验证思路：用 Chrome DevTools 的 **Paint flashing** 区分是 paint 还是 composite：

- 如果主编辑器出现 repaint 边框：说明 iframe 滚动让父窗口被 invalidated，需要找父窗口的 invalidation 来源。
- 如果只有 OpenCode iframe 内部 repaint：说明父窗口视觉变化不是来自 CPU 重绘，而是 GPU 合成 artifact。
- 如果没有 paint flashing：说明 CDP overlay 在当前 Electron surface 不生效，需要换实验手段。

用户同时观察到：打开 paint flashing 后滑动，主编辑器还有“光线渐变”效果。这进一步加强了合成器方向的怀疑。

### 4.5 第五轮：单变量实验定位 backdrop-filter

基于 OpenCode UI 源码中自定义滚动条 thumb 使用 `backdrop-filter: blur(4px)`，以及 sticky header / dock 等可能触发 layer promotion 的元素，设计最小可撤销实验：

> 在 Obsidian 外观模式下，临时强制 iframe 内所有元素的 `backdrop-filter` 为 `none`。

代码：

```css
html[data-another-opencode-for-obsidian-appearance="obsidian"] *,
html[data-another-opencode-for-obsidian-appearance="obsidian"] *::before,
html[data-another-opencode-for-obsidian-appearance="obsidian"] *::after {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
```

结果：**弹闪消失。**

这意味着：

- 根因确实与 `backdrop-filter` 有关。
- 不是 `position: sticky` 本身的问题（sticky 还在，只是 backdrop-filter 没了）。
- 不是 OpenCode 内部 box-shadow 或 elevation 的问题。

---

## 5. 根因机制详解

### 5.1 正常情况下的图层结构

```
屏幕输出
  ├── body::before                    # editor background 全屏背景图（fixed, z-index 0）
  ├── .app-container                  # 透明，isolation: isolate, z-index 1
  │     ├── 左侧 Markdown editor      # 透明，显示 body::before 背景
  │     └── 右侧 OpenCode pane        # 透明宿主容器
  │           └── iframe              # 独立 compositor layer
  │                 ├── OpenCode 内容  # 透明/半透明层叠
  │                 └── 滚动条 thumb   # backdrop-filter: blur(4px)
```

### 5.2 滚动时发生了什么

1. 用户在 iframe 内滑动。
2. iframe 内 `.scroll-view__viewport` 的 `scrollTop` 变化。
3. 自定义滚动条 thumb 出现/移动/透明度变化。
4. thumb 使用 `backdrop-filter: blur(4px)`，需要采样它背后的像素。
5. 在 Chromium 内部，带 `backdrop-filter` 的元素通常被提升为独立 compositor layer。
6. iframe 本身也是独立 layer。当 iframe 内部 layer 树变化时，Chromium 重新评估 iframe 的 backing texture。
7. 由于父窗口 `.opencode-appearance-obsidian` 有 `isolation: isolate; contain: paint`，并且 `.app-container` 也有 `isolation: isolate`，整个父窗口的图层树比较复杂。
8. 在 iframe layer 更新 backing texture 的瞬间，合成器对透明层和背景图的采样/混合出现短暂不一致。
9. 因为左侧编辑器是透明的，这种不一致直接表现为编辑器区域亮度/暗度变化。

### 5.3 为什么点击也会触发

点击 iframe 时，不一定触发滚动，但会触发：

- iframe 获得焦点；
- 内部可能有 focus/hover 状态变化；
- 某些带 `backdrop-filter` 的面板、菜单、弹层可能出现或消失；
- 这些都会让 iframe 内部 layer 树变化，同样触发合成器重评估。

### 5.4 为什么不是 DOM/CSS 变化

因为 trace 已经证明：

- 父窗口 body class 没变；
- `.cm-focused` 数量没变；
- `.cm-line.cm-active` 没变；
- `.workspace-leaf.mod-active` 没变；
- 主编辑器采样点的 backgroundColor、opacity、filter 等 Computed Style 没变。

如果 DOM/CSS 没变但视觉变了，问题一定在浏览器绘制/合成阶段。

---

## 6. 修复与权衡

### 6.1 当前生产契约

当前生产契约只在高风险组合里禁止 iframe 内部真实毛玻璃采样：

- `webViewAppearance: "obsidian"`；
- Background/workspace 图片有效，`--another-opencode-for-obsidian-workspace-background-state: enabled`；
- iframe document 自己通过 `body::before` 画 workspace 背景图。

对应规则在 `src/proxy/ProxyInjection.ts`：

```css
html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *,
html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *::before,
html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *::after {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
```

效果：

- ✅ OpenCode 滑动/点击时，主编辑器不再弹闪。
- ✅ 半透明面板、菜单、settings surface、border、shadow、scrim 仍然保留。
- ✅ Background 未启用时，Obsidian 外观仍然使用普通 Obsidian material，不触发这条禁用。
- ⚠️ 真正依赖 `backdrop-filter` 采样背后像素的毛玻璃 blur 失效。

这是当前设计边界。Obsidian 外观模式通过背景图和 alpha surface 表达材料感；`backdrop-filter` 需要读取元素背后的合成像素，在 iframe + Background 图片组合里不稳定。需要更厚的“像毛玻璃的背景”时，只调 `src/theme/WebViewTheme.ts` 的 material token，或让 iframe `body::before` 对自己绘制的 background image 使用普通 `filter`。普通 `filter` 处理的是 iframe 自己画出的图片层，不读取背后的合成像素。

### 6.2 为什么不收窄到滚动条 thumb

精确到 `.scroll-view__thumb::after` 的实验不能作为生产契约。当前本地 OpenCode 源码里直接使用 `backdrop-filter` 的位置确实是这个滚动条伪元素，但上游可以新增、移动或改名任何带 `backdrop-filter` 的元素。更稳的模型是禁用高风险组合里的采样能力：

| 方向 | 结论 | 原因 |
|------|------|------|
| 只禁滚动条 thumb | 放弃 | selector 依赖上游内部 class，后续新增 `backdrop-filter` 后会复发 |
| 在 `obsidian + workspace background enabled` 里禁用 iframe 内 `backdrop-filter` | 采用 | 覆盖的是合成采样能力，不依赖上游 class 名 |
| 给 iframe 稳定 compositor hint | 暂不采用 | `body { will-change: opacity; }` 实验不闪，但用户看不出视觉收益 |
| 去掉宿主 `contain: paint` | 暂不采用 | 会扩大宿主绘制影响面，可能引入新的裁剪和性能问题 |
| 上游提供嵌入模式 | 可长期考虑 | 仍然需要表达同一个契约：嵌入透明宿主时不要使用 backdrop sampling |

### 6.3 为什么不能用“隐藏 .cm-active”之类的补丁

AGENTS.md 里的视觉异常诊断纪律明确禁止这种方向：

> `.cm-line.cm-active` 是光标所在行高亮，属于 Obsidian/CodeMirror 编辑器状态，不属于 OpenCode Web UI。不要在 `another-opencode-for-obsidian` 里 patch `.cm-editor`、`.markdown-reading-view` 或用户 vault 的 background 插件文件。

因为 trace 已经证明 `.cm-line.cm-active` 没有变化，去 patch 它就是破坏案发现场、引入本体负担。

---

## 7. 排查工具与命令清单

### 7.1 采样父窗口 DOM/Computed Style

用 `obsidian eval` 执行自定义 JS，记录：

- `document.activeElement`
- `document.querySelectorAll('.cm-focused').length`
- `document.querySelector('.cm-line.cm-active')`
- `document.querySelectorAll('.workspace-leaf.mod-active').length`
- `document.elementsFromPoint(x, y)` 各层样式

### 7.2 派发真实鼠标/滚轮事件

```bash
obsidian dev:cdp method=Input.dispatchMouseEvent \
  params='{"type":"mouseMoved","x":1200,"y":700,"button":"none"}'
obsidian dev:cdp method=Input.dispatchMouseEvent \
  params='{"type":"mousePressed","x":1200,"y":700,"button":"left","clickCount":1}'
obsidian dev:cdp method=Input.dispatchMouseEvent \
  params='{"type":"mouseReleased","x":1200,"y":700,"button":"left","clickCount":1}'
```

### 7.3 Chrome DevTools Rendering 面板

- **Paint flashing**：绿色/红色边框标注重绘区域。
- **Layer borders**：黄色/橙色边框标注 compositor layer 边界。
- **Composited layer borders**：看哪些元素被提升为独立 layer。

打开方式：Obsidian 中 `Cmd+Opt+I` 或 `obsidian dev:cdp` 创建 DevTools session。

### 7.4 单变量 CSS 实验

在 `src/proxy/ProxyInjection.ts` 的 `createObsidianAppearanceStyle()` 里临时加规则，build 后 reload 插件，观察现象。例如：

```css
/* 实验 1：在 Background 启用时禁用 backdrop-filter */
html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] * {
  backdrop-filter: none !important;
}

/* 实验 2：禁用所有 box-shadow */
html[data-another-opencode-for-obsidian-appearance="obsidian"] * {
  box-shadow: none !important;
}

/* 实验 3：禁用所有 opacity 动画 */
html[data-another-opencode-for-obsidian-appearance="obsidian"] * {
  transition: none !important;
}
```

每次只改一个变量，build → reload → 复现 → 记录。

方案 3 额外试过：

```css
body {
  will-change: opacity;
}
```

这个实验的目标是让 iframe 内部建立更稳定的 Backdrop Root。用户验收结果是“不闪，但视觉没有可见收益”；关回当前 baseline 后也不闪。这个方向不进入生产代码。

---

## 8. 失败假设清单（这次踩过的坑）

| 假设 | 为什么看起来合理 | 为什么被排除 |
|------|----------------|-------------|
| OpenCode 内部 hover/active 元素样式泄漏 | 弹闪发生在点击/滑动时 | 滑动不依赖具体 hover 目标，且弹闪区域不限于点击位置下方 |
| iframe 窃取焦点导致 active leaf 切换 | 点击 iframe 会改变焦点 | trace 显示 `.cm-focused`、active line、active leaf 都没变 |
| 主题同步反复重写 CSS 变量 | `ResizeObserver` 会触发 theme sync | theme 变量只发送给 iframe，父窗口 Computed Style 没变 |
| sticky header 背景不透明 | OpenCode 有多个 sticky header | Obsidian 外观下 `--background-stronger` 被 alias 为 `transparent` |
| OpenCode elevation shadow 透出 iframe | elevation 使用 box-shadow | iframe 边界会裁剪内部 shadow，且禁用 shadow 后问题仍在 |
| 父窗口 editor background 插件重绘 | 背景图在 body::before | body::before 本身不动，是合成器混合方式短暂出错 |

---

## 9. 经验教训

1. **DOM/CSS 不变 ≠ 没有问题**。视觉异常可能发生在 Paint/Composite 阶段，传统 DOM trace 抓不到。
2. **复杂透明图层 + iframe + backdrop-filter 是高风险组合**。三者同时出现时，优先怀疑合成器跨层采样问题。
3. **单变量 CSS 实验比写大量诊断脚本更快**。找到可疑效果后，临时禁掉直接验收，效率最高。
4. **先验证根因，再谈修复**。这次先用全局禁用确认是 `backdrop-filter`，再用精确滚动条 selector 证明 selector 级收窄不成立，最终收敛成“Obsidian 外观禁用 iframe 内 backdrop sampling”的结构规则。
5. **不要 patch 不是自己的东西**。`.cm-active`、editor background 插件文件、OpenCode 上游组件都不应该被当作修复入口。
6. **保留完整的失败假设清单**。几个月后回看，能避免重蹈覆辙。

---

## 10. 相关代码位置

- `src/proxy/ProxyInjection.ts`
  - `createObsidianAppearanceStyle()`：注入 iframe 的 Obsidian 外观样式，包含 workspace background `body::before` 和 Background 启用时的 `backdrop-filter` 禁用。
  - `createBridgeScript()`：iframe 内与父窗口通信的脚本。
- `src/theme/WebViewTheme.ts`
  - `createV2ObsidianVariables()`：把 Obsidian token 映射到 OpenCode v2 token。
  - `OBSIDIAN_MATERIAL_ALPHA` / `OBSIDIAN_WORKSPACE_BACKGROUND_MATERIAL_ALPHA`：普通 Obsidian 外观和 Background 图片外观的 material 密度入口。
  - `GRUVBOX_DARK_MEDIUM` / `OBSIDIAN_ACCENT_ALPHA` / `OBSIDIAN_STATE_ALPHA`：让 OpenCode links、accent、focus border、state colors 收敛到 gruvbox-dark-medium，避免主题亮绿色进入 iframe 内容区。
  - `createLegacyAliasesFromV2()`：定义 `--background-stronger: transparent` 等 Obsidian 外观 alias。
- `styles.css`
  - `.opencode-appearance-obsidian`：宿主容器的 `isolation: isolate; contain: paint;`。
- OpenCode 上游（`~/Projects/ai-cli/opencode/packages/ui/src/`）
  - `components/scroll-view.css`：自定义滚动条，thumb 使用 `backdrop-filter`。
  - `components/sticky-accordion-header.css`、`components/session-turn.css`：sticky header。
  - `components/dock-surface.css`：dock surface 的 `box-shadow`。
- editor background 插件（`~/Projects/obsidian-editor-background/`）
  - `styles.css`：`body::before` 全屏背景图，大量元素 `background: transparent`。
  - `src/Plugin.ts`：`UpdateBackground()` 设置 CSS 变量。

---

## 11. 如果下次再遇到类似问题

按这个顺序排查：

1. **确认触发动作**：点击？滑动？resize？focus？
2. **采样父窗口 DOM/CSS**：用 `obsidian eval` + `MutationObserver` 看弹闪前后什么变了。
3. **如果 DOM/CSS 没变**：打开 Chrome DevTools Paint flashing / Layer borders，区分 paint 还是 composite。
4. **如果是 composite**：重点怀疑 iframe、透明层、fixed 背景图、backdrop-filter、sticky/fixed 元素。
5. **做单变量 CSS 实验**：依次禁用 `backdrop-filter`、`box-shadow`、`opacity` 动画、`transition`、`transform`，build 后 reload 验证。
6. **确认根因后再写最终修复**：如果根因是某个具体 selector，就收敛到 selector；如果根因是浏览器能力本身和宿主渲染模型冲突，就收敛成能力边界。这次属于后者。
