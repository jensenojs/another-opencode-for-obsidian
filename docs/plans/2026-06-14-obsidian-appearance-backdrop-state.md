# Obsidian 外观背景状态模型

这份文档是 `webViewAppearance: "obsidian"` 在启用 Obsidian Background 类插件时的设计依据。

## 2026-06-15 当前实现状态

这份文档保留了中间方案和失败路径。接手时先看本节，再按需看后面的历史分析。

当前生产合同：

- iframe document 自己拥有最终像素；
- iframe 元素不依赖 `allowtransparency`；
- 宿主 `.opencode-appearance-obsidian` 不画 `::before` / `::after` 背景；
- iframe 内只有 `body::before` 可以画 workspace/background 图片；
- `sourceBoundary.contract` 是 `obsidian-workspace-background-v1`；
- Background 图片有效时，iframe `body::before` 使用 `--another-opencode-for-obsidian-workspace-background-*` paint variables 画单图层；
- 不做 active editor projection；
- 不根据 editor rect、iframe rect 或图片 natural size 追求跨 pane 连续背景；
- 不恢复旧 `--another-opencode-for-obsidian-editor-background-*` / `--another-opencode-for-obsidian-iframe-*` 变量。

当前视觉 baseline：

- Background 未启用时，Obsidian 外观只用 Obsidian base color 和局部 material；
- Background 启用时，iframe 画同一张 workspace/background 图片，给 iframe 自己画的图片层设置最小 `blur(5px)`，并使用更厚的 material token 减少背景文字透出；
- 真 `backdrop-filter` 只在 `obsidian + workspace background enabled` 这个风险组合里禁用；
- “像毛玻璃”的效果由半透明 material、scrim、border、shadow 表达，不恢复 CSS `backdrop-filter`。
- 基础背景、正文、muted text、border、font 继续来自 Obsidian 当前主题；OpenCode 自己补出来的 links、accent、focus border、state colors 使用 gruvbox-dark-medium 色板再混入 Obsidian text/background/border。

当前调参入口集中在 `src/theme/WebViewTheme.ts`：

- `OBSIDIAN_MATERIAL_ALPHA`：普通 Obsidian 外观；
- `OBSIDIAN_WORKSPACE_BACKGROUND_MATERIAL_ALPHA`：Background 图片启用后的更厚 material；
- `OBSIDIAN_BORDER_ALPHA`：边框密度；
- `OBSIDIAN_TEXT_MIX_ALPHA`：正文、thinking、muted/faint 文本可读性；
- `OBSIDIAN_ACCENT_ALPHA` / `OBSIDIAN_STATE_ALPHA` / `GRUVBOX_DARK_MEDIUM`：链接、按钮、focus border、状态色的 gruvbox-dark-medium 调教；
- `OBSIDIAN_OVERLAY_ALPHA`：hover、pressed、dialog scrim、depth overlay。

当前不进入生产代码的实验：

- `body { will-change: opacity; }`；
- `filter: opacity(1)`；
- `transform: translateZ(0)`；
- `contain: paint`；
- 针对 `.scroll-view__thumb::after` 的 selector 级修复；
- 针对 `.cm-active`、`.cm-editor`、`.markdown-reading-view`、Background 插件文件的补丁。

这些实验的作用只限于复现和辨析。生产路径只保留能力边界：Background 图片启用时，iframe 内部不允许真实 backdrop sampling。

目标是让 OpenCode Web UI 融入 Obsidian，同时避免恢复这些路径：

- 针对 `.cm-active`、selection、table row、resize handle 的 selector patch；
- 宿主 `.opencode-appearance-obsidian::before` 背景层；
- 透明 iframe 合成；
- active editor projection，也就是用父窗口 editor rect、iframe rect 和图片尺寸去算跨渲染面的连续背景。

核心收敛是：**把外部 Background 插件给出的 source variables 和 OpenCode iframe 被允许绘制的 paint variables 分开。**

本文档冻结当前实现切片。iframe 只有两个绘制状态：

- `none`
- `body-css-background`

`hidden` 是父窗口同步条件，不是 iframe 绘制状态。iframe 不可见时，父窗口跳过会改变图片绘制变量的 theme update，并在父窗口 diagnostics 里记录跳过原因。

`body-css-background` 的含义很窄：iframe document 的 `body::before` 消费 Background 插件写在 `document.body` 上的原始变量，用单图层、`background-size: cover`、`background-repeat: no-repeat` 画同一张图。它不读取 active editor rect，不读取 iframe 与 editor 的相对几何，不追求左右边界图片连续。

## 用户目标

用户有一张有意义的 Obsidian 背景图。打开 OpenCode 后，不管 OpenCode 在右侧栏还是顶层/root tab，都不应该让这张图失去意义。

可以接受的损失：

- 边缘有一部分图片看不到；
- OpenCode 遮住一部分图片；
- 几何不够时局部露出 Obsidian base/material。

不能接受的结果：

- OpenCode 变成和 Obsidian 无关的实心黑块；
- 点击、拖动、切 tab 后出现黑框、亮度跳变或残留层；
- 为了遮住某次伪影而 patch CodeMirror、workspace chrome 或用户 vault 插件 selector。

现有外观开关继续作为产品边界：

- `webViewAppearance: "opencode"`：保留 OpenCode 原生外观。
- `webViewAppearance: "obsidian"`：使用 Obsidian 颜色、文字、边框、accent、半透明局部 surface；有条件时绘制 Background 图片。

## 已检查来源

本地代码：

- `src/theme/EditorBackdrop.ts`
- `src/theme/WebViewTheme.ts`
- `src/proxy/ProxyInjection.ts`
- `src/ui/OpenCodeView.ts`
- `scripts/harness/themeReport.ts`
- `tests/theme/EditorBackdrop.test.ts`
- `tests/proxy/ProxyInjection.test.ts`
- `tests/harness/themeReport.test.ts`
- `styles.css`
- `/Users/oujinsai/Projects/obsidian-editor-background/src/Plugin.ts`
- `/Users/oujinsai/Projects/obsidian-editor-background/styles.css`

外部参考链接：

- Background plugin 代码：
  <https://github.com/shmolf/obsidian-editor-background/blob/main/src/Plugin.ts>
- Background plugin 样式：
  <https://github.com/shmolf/obsidian-editor-background/blob/main/styles.css>
- OpenCode v2 token 来源：
  <https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css>
- OpenCode legacy Tailwind token 来源：
  <https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css>
- Obsidian CSS variables 参考入口：
  <https://docs.obsidian.md/Reference/CSS+variables/CSS+variables>

实际实现不能依赖外部网页实时可访问。运行时真相源仍然是当前 Obsidian document 的 computed style、本地 OpenCode 源码和 harness diagnostics。

## 当前事实

外部 Background 插件把这些变量写到 `document.body`：

- `--obsidian-editor-background-image`
- `--obsidian-editor-background-opacity`
- `--obsidian-editor-background-bluriness`
- `--obsidian-editor-background-input-contrast`
- `--obsidian-editor-background-line-padding`
- `--obsidian-editor-background-position`

它的 stylesheet 只在 editor surface 上画背景：

- `.markdown-reading-view::before`
- `.cm-editor::before`

这些伪元素使用：

- `background-image: var(--obsidian-editor-background-image)`
- `background-position: var(--obsidian-editor-background-position)`
- `background-size: cover`
- `background-repeat: no-repeat`
- `opacity: var(--obsidian-editor-background-opacity)`
- `filter: var(--obsidian-editor-background-bluriness)`

Background 插件没有提供稳定的全窗口图片平面。它源码里注释掉的 whole-app background 方案也说明了一个边界：用正 z-index 做全 app 背景会干扰交互。因此 `another-opencode-for-obsidian` 不应该恢复宿主层或全窗口伪层。

当前 OpenCode 插件链路：

```text
main.ts
  -> refreshProxyAppearance()
  -> getWebViewTheme()
  -> WebViewTheme.captureObsidianWebViewTheme()
  -> ProxyInjection 注入首帧 HTML theme

OpenCodeView
  -> createIframeTheme()
  -> collectIframeBackdropVariables()
  -> currentIframeBackdropSource()
  -> EditorBackdrop.createIframeBackdrop()
  -> postMessage theme:update 到 iframe

ProxyInjection
  -> replaceTheme()
  -> root.style.setProperty()
  -> body::before 绘制 iframe 背景层
```

当前 `OpenCodeView` 已经有这些重新同步入口：

- iframe 创建和 load；
- `proxy:loaded`；
- `window.resize`；
- OpenCode content element 上的 `ResizeObserver`；
- Background 图片尺寸加载完成；
- Obsidian theme source mutation。

所以当前问题不主要是缺少同步入口。问题是背景所有权和绘制模型是否稳定。

## 运行时证据

当前这些测试通过：

- `tests/theme/EditorBackdrop.test.ts`
- `tests/proxy/ProxyInjection.test.ts`
- `tests/harness/themeReport.test.ts`

当前实现把这个状态写成显式合同：有有效 Background 图片时，iframe 使用 `body-css-background`；没有有效图片时使用 `none`。测试不再要求 active editor projection。

旧 C 方案的真实 Obsidian 运行态曾抓到这条时间线：

```text
sequence 117
  phase: posted
  reason: opencode-layout-resized
  backdrop.mode: active-editor-projection
  iframe.width: 291
  iframe.height: 657

sequence 121
  phase: posted
  reason: opencode-layout-resized
  backdrop.mode: css-variables
  backdrop.hasImage: true
  iframe.width: 0
  iframe.height: 0
```

这说明投影模型会把“iframe 是否可见”和“图片是否可画”绑在一起。OpenCode leaf 隐藏、折叠、切到别的 tab、布局暂时归零时都可能触发这种问题。

iframe 内部 diagnostics 和父窗口 diagnostics 还出现了不一致：

- 父窗口说 `editorBackdropPlane.mode: "css-variables"`；
- iframe 内部仍然说 `sourceBoundary.editorBackgroundSource: "active-editor-projection"`。

当前实现保留 replacement cleanup，防止上一轮 paint variables 残留到下一轮状态。

## 问题存在性检查

这里有三类问题，不能混在一起修。

第一，OpenCode 要尊重 Obsidian 外观。这是真需求。Background 插件开不开都存在。

第二，Background 图片启用时，OpenCode 打开后仍然要让这张图有意义。这也是真需求。OpenCode 如果变成不透明原生黑 pane，就破坏了用户的视觉环境。

第三，`.cm-line.cm-active`、selection、table row、metadata input、`hr.workspace-leaf-resize-handle.tappable` 这些层会同时出现。它们是真观察，但不属于本插件的修复对象。它们来自 Obsidian、CodeMirror、当前主题、workspace chrome 或 Background 插件的 editor surface。`another-opencode-for-obsidian` 如果 patch 这些 selector，就是把 diagnostics 变成补偿代码。

因此修复入口收窄为：

```text
让 OpenCode iframe 的背景状态显式化。
只让 iframe 自己拥有最终图片像素。
父窗口 editor/local 层只保留为 diagnostics。
```

## Blast Radius

这不是单文件修复。变更会穿过 theme source capture、iframe paint CSS、父窗口 theme sync、iframe 注入脚本、runtime diagnostics 和 harness。它仍然是 theme bridge 范围内的变更，不触碰 context、server、GraphIndex、用户 vault 或外部 Background 插件。

Blast Radius 级别：BR2。

原因：

- 修改共享状态 shape：`EffectiveEditorBackdrop`、`EditorBackdropSourceMode`、runtime diagnostics payload。
- 修改 iframe 注入脚本：`ProxyInjection` 的 CSS 和 `theme:update` replacement 行为。
- 修改 runtime harness：`themeReport` 的硬失败条件会变化。
- 修改多组测试：theme、proxy、harness。

不升级到 BR3 的原因：

- 不改 OpenCode upstream 组件。
- 不改 Obsidian Background 插件。
- 不改用户 vault。
- 不改 context/session/server/GraphIndex 数据契约。

## Change Manifest

| 文件 | symbol / field | action | reason | acceptance |
| --- | --- | --- | --- | --- |
| `src/theme/EditorBackdrop.ts` | `EditorBackdropSourceMode` | 改成 `none \| body-css-background` | 删除 active editor projection | 单测证明 valid body image 直接进入 `body-css-background` |
| `src/theme/EditorBackdrop.ts` | `EffectiveEditorBackdrop` | 保留 `reason`，把 source variables 和 paint variables 分开 | diagnostics 和绘制命令必须可分开审计 | 每个 state 的变量清单符合本文“状态变量矩阵” |
| `src/theme/EditorBackdrop.ts` | projection helpers | 删除 | 不再维护 editor/iframe 几何桥接 | 源码中没有 active projection 状态和 helper |
| `src/ui/OpenCodeView.ts` | `syncThemeToIframe()` | iframe rect 为 0 时跳过会改变 paint variables 的 postMessage | 防止 hidden iframe 写入错误 paint update | theme sync history 中 zero rect + posted image paint update 判失败 |
| `src/ui/OpenCodeView.ts` | iframe diagnostics | 增加 parent-only `syncVisibility` / skip reason，不把 hidden 写成 iframe paint state | 解决 hidden 状态和“不发送 update”的冲突 | diagnostics 能同时显示 iframe 内 last applied state 和父窗口 zero rect skip |
| `src/proxy/ProxyInjection.ts` | `createObsidianAppearanceStyle()` | `body::before` 只消费 `--another-opencode-for-obsidian-backdrop-*` paint variables | raw source variable 不能直接绘制图片 | proxy test 断言不存在 `var(--obsidian-editor-background-image, none)` fallback |
| `src/proxy/ProxyInjection.ts` | `replaceTheme()` / `applyTheme()` | 首帧和后续 update 都通过同一个 replacement path，删除 stale bridge variables | 防止旧 paint variables 残留 | proxy test 覆盖 replacement cleanup |
| `src/proxy/ProxyInjection.ts` | `applyOpenCodeV2Aliases()` | 追踪并清理 bridge 写入的 alias，或每轮先删后重建 | 防止 alias 生命周期不清 | proxy test 覆盖 alias cleanup 不删除非 bridge 变量 |
| `src/proxy/ProxyInjection.ts` | `sourceBoundary()` | 输出 `obsidian-pane-background-v1` | iframe diagnostics 描述当前 D 模型 | harness 覆盖 state 与实际 paint layer 不一致时失败 |
| `scripts/harness/themeReport.ts` | `openCodeDocumentBackgroundLayerCheck()` | 检查 paint variables，而不是 raw source variables | 捕捉独立 cover 和 stale paint | 有 raw source image 但无 paint image 的 pending/none 可通过 |
| `scripts/harness/themeReport.ts` | `iframeBackdropPaintCheck()` | 验证 state-specific variable matrix | 防止只看 state 不看绘制层 | `body-css-background` 缺 paint image 必须失败 |
| `scripts/harness/themeReport.ts` | theme sync history summary/check | zero rect posted image update 硬失败 | 捕捉 sequence 117 -> 121 这种时间线 | runtime `dev:theme` 报出 zero rect posted image update |
| `tests/theme/EditorBackdrop.test.ts` | backdrop state tests | 覆盖 `none` / `body-css-background` | 冻结状态机 | 两个状态分别覆盖变量清单 |
| `tests/proxy/ProxyInjection.test.ts` | injection CSS / replacement tests | 增加 paint variable 和 cleanup 测试 | 冻结 iframe 绘制入口 | raw image fallback 和 stale variable 均失败 |
| `tests/harness/themeReport.test.ts` | runtime diagnostics tests | 覆盖旧 projection 状态失败、zero rect history、no-image | 冻结验收语义 | 当前已观测失败模式能在测试中复现 |
| `styles.css` | `.opencode-appearance-obsidian::before` | 保持 inactive | 禁止恢复宿主背景层 | harness 继续确认 host pseudo image inactive |

## A、B、C、D 模型

### A. 只使用 Obsidian material

OpenCode 不绘制 Background 图片。iframe document 使用 Obsidian base color 和从 Obsidian token 派生的半透明 OpenCode local surfaces。

使用场景：

- 没有有效 Background 图片；
- 图片为 `none`；
- opacity 等效为 0。

表现：

- resize、focus、切 tab、冷启动、关闭 Background 插件时都稳定；
- OpenCode 内部看不到背景图；
- 用户明确启用 Background 图片时，这个模型太保守。

### B. 透明 iframe 合成

OpenCode iframe 透明，让父窗口 Obsidian 像素透出来。

这个模型曾经最接近“整张图没有被打断”的观感，但 Electron 在 iframe focus、leaf 切换和 pane resize 时会把透明背板合成为黑色或留下残影。点击不同区域后亮度变化，就是这个模型最容易暴露的问题。这个模型不再作为实现入口。

### C. active editor projection

OpenCode 读取 active editor 背景 surface、图片尺寸和 iframe rect，然后计算同一个 editor 图片平面在 iframe 里应该处在什么位置。

这个模型追求左右边界的图片连续。它的代价是把左侧 editor 的局部状态拖进同一个视觉判断里：`.cm-active`、selection、table row、workspace resize handle、metadata input 等层都会变成“看起来没有同步”的东西。继续围绕这些层修，会变成 selector 补偿。

这个模型也会在拖宽 OpenCode pane 时暴露几何问题。editor 自己的 `cover` 图片平面不一定能覆盖 iframe viewport，右侧会露出 iframe base color，形成黑框。对投影结果做 clamp 或 scale 修正可以遮住黑框，但那会让算法从“镜像 editor 平面”变成“为了铺满 iframe 另做一套修正”。这个方向不再推进。

### D. iframe-owned body background

OpenCode iframe 自己画同一张 Background 插件图片。输入只来自 Background 插件写到 `document.body` 的稳定变量：

- `--obsidian-editor-background-image`
- `--obsidian-editor-background-opacity`
- `--obsidian-editor-background-bluriness`
- `--obsidian-editor-background-position`

iframe 内只有一个背景层：`body::before`。它使用 `background-size: cover`，不做 active editor projection，不读 editor rect，不读图片 natural dimensions，不根据点击焦点切换目标。

这个模型牺牲左右边界的严格图片连续。它保留用户真正关心的背景图存在感，也保留 OpenCode local surfaces 的透明质感。当前端到端截图显示，这个模型比 material-only A 更接近用户目标，也比 C 少掉了 editor 局部层和投影黑框问题。

## 推荐模型

保留一个 appearance switch，使用两个 iframe 背景绘制状态。

```text
webViewAppearance = opencode
  -> 不注入 Obsidian appearance

webViewAppearance = obsidian
  -> 始终应用 Obsidian color/material tokens
  -> Background 图片是否绘制由 backdrop state 决定
```

iframe 绘制状态：

```text
none
  没有有效 Background 图片、图片为 none、URL 无效，
  或 opacity 解析为 0
  -> 不画图片
  -> 使用 Obsidian material

body-css-background
  有有效 Background 图片，opacity 大于 0
  -> iframe body::before 画同一张图
  -> background-size: cover
  -> background-repeat: no-repeat
```

父窗口同步条件：

```text
iframe-hidden
  iframe rect 为 0，或 iframe 已断开
  -> 不发送会改变 paint variables 的 theme update
  -> 父窗口 diagnostics 记录 syncVisibility: "iframe-hidden"
  -> iframe 内仍然保留上一轮已经应用的绘制状态，直到重新可见后再更新
```

要删除的状态是 active editor projection。父窗口 editor layers 继续进入 diagnostics，但不进入 iframe paint algorithm。

## Source Variables 与 Paint Variables

当前实现把 source variables 当 paint variables 用，这是结构性问题。

保留 raw source variables：

- `--obsidian-editor-background-image`
- `--obsidian-editor-background-opacity`
- `--obsidian-editor-background-bluriness`
- `--obsidian-editor-background-position`

这些变量是 Background 插件给出的事实。它们可以被捕获、记录、作为算法输入。

新增由 `another-opencode-for-obsidian` 拥有的显式 paint variables：

- `--another-opencode-for-obsidian-backdrop-state`
- `--another-opencode-for-obsidian-backdrop-reason`
- `--another-opencode-for-obsidian-backdrop-background-image`
- `--another-opencode-for-obsidian-backdrop-background-opacity`
- `--another-opencode-for-obsidian-backdrop-background-filter`
- `--another-opencode-for-obsidian-backdrop-background-position`
- `--another-opencode-for-obsidian-backdrop-background-size`

`ProxyInjection` 里的 `body::before` 只消费 paint variables：

```css
body::before {
  background-image: var(--another-opencode-for-obsidian-backdrop-background-image, none);
  background-position: var(--another-opencode-for-obsidian-backdrop-background-position, center);
  background-size: var(--another-opencode-for-obsidian-backdrop-background-size, cover);
  opacity: var(--another-opencode-for-obsidian-backdrop-background-opacity, 0);
  filter: var(--another-opencode-for-obsidian-backdrop-background-filter, none);
}
```

paint 层不能 fallback 到 `--obsidian-editor-background-image`。只有 `EditorBackdrop.createIframeBackdrop()` 产出的 `--another-opencode-for-obsidian-backdrop-*` paint variables 能驱动 iframe 背景。

继续禁止旧变量名：

- `--another-opencode-for-obsidian-editor-background-*`
- `--another-opencode-for-obsidian-iframe-*`

新的 `--another-opencode-for-obsidian-backdrop-*` 变量不是旧变量的别名。它们是 iframe 内唯一 `body::before` 背景层的显式绘制命令。

### 状态变量矩阵

每个 state 必须冻结变量存在性。harness 不能只看 state 字段，还要检查实际 paint variables。

`none`：

- 必须发送：
  - `--another-opencode-for-obsidian-backdrop-state: none`
  - `--another-opencode-for-obsidian-backdrop-reason: <具体原因>`
- 必须不存在：
  - `--another-opencode-for-obsidian-backdrop-background-image`
  - `--another-opencode-for-obsidian-backdrop-background-opacity`
  - `--another-opencode-for-obsidian-backdrop-background-filter`
  - `--another-opencode-for-obsidian-backdrop-background-position`
  - `--another-opencode-for-obsidian-backdrop-background-size`
- CSS fallback 负责让 `body::before` 不画图。

`body-css-background`：

- 必须发送：
  - `--another-opencode-for-obsidian-backdrop-state: body-css-background`
  - `--another-opencode-for-obsidian-backdrop-background-image`
  - `--another-opencode-for-obsidian-backdrop-background-opacity`
  - `--another-opencode-for-obsidian-backdrop-background-filter`
  - `--another-opencode-for-obsidian-backdrop-background-position`
  - `--another-opencode-for-obsidian-backdrop-background-size: cover`
- 必须不存在：
  - `--another-opencode-for-obsidian-backdrop-reason`

`iframe-hidden`：

- 不是 iframe paint state。
- 不发送 theme payload 来改 paint variables。
- 父窗口 diagnostics 记录 skip reason 和 zero rect。
- harness 检查 theme sync history，不要求 iframe 内 state 变成 hidden。

## 背景算法

背景算法只做四个判断：

```text
sourceImage = --obsidian-editor-background-image
sourceOpacity = --obsidian-editor-background-opacity

if sourceImage missing or sourceImage == none:
  state = none, reason = no-background-image
elif sourceImage is not css url(...):
  state = none, reason = invalid-background-image
elif sourceOpacity parses to <= 0:
  state = none, reason = background-opacity-zero
else:
  state = body-css-background
  paint image = sourceImage
  paint opacity = sourceOpacity or 1
  paint filter = --obsidian-editor-background-bluriness or none
  paint position = --obsidian-editor-background-position or center
  paint size = cover
```

算法不读取 active editor rect、iframe rect、图片 natural dimensions。拖动宽度时，iframe 自己的 `cover` 规则重新裁剪图片。这个裁剪变化是模型允许的损失；它比投影黑框和 editor 局部层补偿更小。

## Theme Replacement

iframe 注入脚本里的 theme update 必须是真替换。

当前行为：

```text
for each variable in nextTheme.variables:
  root.style.setProperty(variable)
```

问题：

上一轮 theme 有、下一轮 theme 没有的变量不会被删除。paint variables 会残留到下一轮 `none` 状态里。

目标行为：

```text
previousNames = 上一轮 payload 写过的变量名
nextNames = nextTheme.variables 的变量名

for each name in previousNames - nextNames:
  root.style.removeProperty(name)

for each name in nextNames:
  root.style.setProperty(name, nextTheme.variables[name], "important")

previousNames = nextNames
```

首帧注入和后续 parent `theme:update` 必须走同一个 replacement path。也就是说，proxy HTML 里内联的初始 `theme` 不能绕过 `previousNames` 追踪。否则第一轮 parent update 无法删除首帧写入但下一轮缺失的变量。

cleanup 只能作用于 theme bridge 自己写过的变量，不能删除 OpenCode 自己 stylesheet 或浏览器拥有的变量。

`applyOpenCodeV2Aliases()` 也会写 alias。alias 生命周期必须显式：

```text
previousAliasNames = 上一轮 bridge 写过的 alias

先删除 previousAliasNames
再从当前 computed --v2-* token 重建 alias
记录 nextAliasNames
```

acceptance 必须覆盖两类情况：

- 首帧写入的 paint variables 在下一轮 `none` payload 后被删除；
- bridge 写入的 alias 会被清理，但非 bridge 拥有的 OpenCode 变量不会被删除。

## OpenCodeView 同步规则

`OpenCodeView.syncThemeToIframe()` 在 iframe 不可见时，不发送会改变 paint variables 的 theme。

当 `iframe.getBoundingClientRect()` 宽或高为 0：

- 记录 skipped theme sync，cause 为 `iframe-not-visible`；
- 父窗口 diagnostics 记录：
  - `syncVisibility: "iframe-hidden"`；
  - zero rect；
  - 本次没有 post theme payload；
- 不把 `syncVisibility` 写成 iframe paint state；
- 不因为 leaf 当前隐藏就把上一轮有效 paint state 替换掉。

iframe 内部 diagnostics 在这个阶段可以继续显示上一轮已经应用的 paint state。父窗口 diagnostics 必须能解释这种差异：iframe 内是 last applied state，父窗口当前同步条件是 `iframe-hidden`。

当 iframe 再次可见：

- 现有 `ResizeObserver`、`window.resize`、iframe load、`proxy:loaded` 路径继续触发 sync；
- 新的 visible sync 基于当前 Background body variables 重新计算状态；
- 如果当前输入不满足 `body-css-background`，则发送 `none`，并通过 replacement 删除旧 paint variables。

这可以阻止 hidden iframe 用零尺寸更新覆盖上一轮有效 paint state。

## Diagnostics 合约

父窗口 diagnostics 应输出：

```ts
editorBackdropPlane: {
  mode:
    | "none"
    | "body-css-background";
  reason: string | null;
  current: EditorBackdropSnapshot | null;
  effective: null;
  sourceVariables: Record<string, string>;
  variables: Record<string, string>;
}

themeSync: {
  syncVisibility: "visible" | "iframe-hidden";
  lastSkippedReason: string | null;
  postedThemeUpdate: boolean;
}
```

iframe 内 diagnostics 从显式 `--another-opencode-for-obsidian-backdrop-*` 变量读取 last applied paint state。

`sourceBoundary` 保留：

```ts
contract: "obsidian-pane-background-v1"
```

并暴露：

```ts
editorBackgroundSource:
  | "none"
  | "body-css-background";
reason: string | null;
bodyCssBackgroundActive: boolean;
backgroundPosition: string | null;
backgroundSize: string | null;
paintedBackgroundImage: string | null;
```

父窗口 `syncVisibility: "iframe-hidden"` 和 iframe 内 `editorBackgroundSource: "body-css-background"` 可以同时出现。这个组合表示：iframe 当前不可见，父窗口跳过了本轮 paint update，iframe 内部仍保留上一轮可见时的 last applied paint state。harness 检查 theme sync history，不要求 iframe 内 state 变成 hidden。

editor-local 层只作为 advisory diagnostics：

- `.cm-line.cm-active`
- selection layers
- table row backgrounds
- metadata input backgrounds
- workspace split resize handles
- workspace tab/header backgrounds

任何 check 都不应该建议把这些 selector 当修复入口。

## Harness 合约

`bun run dev:theme` 应覆盖这些情况。

没有有效 Background 图片：

- iframe document roots 使用 Obsidian base color；
- `#root` 保持透明；
- iframe `body::before` 没有图片；
- local surfaces 仍然是 Obsidian-derived 半透明 material。

有有效图片：

- state 是 `body-css-background`；
- `body::before` 使用单图层；
- 图片来自 `--another-opencode-for-obsidian-backdrop-background-image`；
- `background-size` 是 `cover`；
- `background-position` 来自 Background 插件变量，缺省为 `center`；
- raw source variable 不直接绘制 pseudo element；
- 宿主没有图片伪层。

iframe hidden 或 zero rect：

- 父窗口 diagnostics 写 `syncVisibility: "iframe-hidden"`；
- 不发送改变 paint variables 的 theme update；
- diagnostics 记录 zero rect；
- theme sync history 中任何 zero rect 且 posted image paint variables 的事件都硬失败；
- iframe 内可保留上一轮 last applied state，但不能新增 local cover。

state-specific paint matrix：

- `none` 带 paint image/position/size 时失败；
- `body-css-background` 缺少 paint image/position/size 时失败；
- raw `--obsidian-editor-background-image` 存在但 paint image 不存在时失败，除非 state 是 `none` 且 reason 说明图片无效或透明度为 0。

image load failure：

- URL 语法不可解析时进入 `none`，reason 为 `invalid-background-image`；
- `none` 必须删除旧 paint image/position/size；
- Background 插件关闭、opacity 0、图片从有效变无效，都按同类清理要求验收。

`webViewAppearance` 从 `obsidian` 切到 `opencode`：

- 当前运行中的 iframe 必须 reload 或清理到非 Obsidian injection 状态；
- 不得保留 `data-another-opencode-for-obsidian-appearance`；
- 不得保留 bridge 写入的 `--another-opencode-for-obsidian-backdrop-*` inline variables；
- runtime status 不能把旧 Obsidian theme diagnostics 当作当前 opencode 模式成功证据。

禁止：

- 宿主 `.opencode-appearance-obsidian::before` 绘制图片；
- iframe 设置 `allowtransparency="true"`；
- 用透明 iframe 合成作为视觉模型；
- iframe `body::before` fallback 到 raw `--obsidian-editor-background-image`；
- 旧 `--another-opencode-for-obsidian-editor-background-*` 变量；
- 旧 `--another-opencode-for-obsidian-iframe-*` 变量；
- iframe 多图片层；
- 背景图 repeat；
- patch CodeMirror active line、selection、table、split handle selector。

## 实现清单

需要修改：

- `src/theme/EditorBackdrop.ts`
  - 把 projection 状态收敛成 `none | body-css-background`。
  - 拆分 source variables 和 paint variables。
  - `none` 返回具体 `reason`。
  - `body-css-background` 只消费 Background 插件 body variables，不读 editor/iframe 几何。

- `src/proxy/ProxyInjection.ts`
  - `body::before` 只消费 `--another-opencode-for-obsidian-backdrop-*` paint variables。
  - 删除 raw Background image fallback。
  - 首帧 `applyTheme()` 和后续 `replaceTheme()` 走同一个 replacement path。
  - 跟踪上一轮变量并删除 stale 变量。
  - 跟踪或重建 bridge alias，避免 alias 残留或过删。
  - `sourceBoundary()` 输出 `obsidian-pane-background-v1`。

- `src/ui/OpenCodeView.ts`
  - iframe rect 为 0 时避免发送会改变图片状态的 theme update。
  - diagnostics 和 theme history 写入新 backdrop mode/reason。
  - 父窗口 diagnostics 单独写 `syncVisibility`，不把 hidden 写成 iframe paint state。
  - 父窗口 editor snapshot 只进入 diagnostics，不进入 iframe paint algorithm。
  - 保持 iframe focus/pointer events 只做 diagnostics。
  - `webViewAppearance` 切换到 `opencode` 时 reload 或清理当前 iframe 注入状态。

- `scripts/harness/themeReport.ts`
  - 接受并验证显式状态。
  - 有有效 Background 图片时，要求 `body-css-background`、单图层、`cover`、no-repeat。
  - zero rect posted image paint update 必须失败。
  - `obsidian` -> `opencode` 切换后旧注入残留必须失败。
  - editor-local layer checks 继续 advisory。

- `tests/theme/EditorBackdrop.test.ts`
  - 覆盖 `none`、`body-css-background`。
  - 覆盖无图、无效 image、opacity 0。
  - 覆盖 editor snapshot 只作为 diagnostics，不覆盖 body variables。

- `tests/proxy/ProxyInjection.test.ts`
  - 断言 `body::before` 没有
    `var(--obsidian-editor-background-image, none)` fallback。
  - 断言只有 paint variables 能驱动图片绘制。
  - 断言 initial theme 和 parent update 都会删除 stale variables。
  - 断言 bridge alias cleanup 不删除非 bridge 变量。

- `tests/harness/themeReport.test.ts`
  - 覆盖 body-css-background 和 no-image diagnostics。
  - 覆盖 parent-only `iframe-hidden` sync diagnostics。
  - 覆盖旧 projection/pending state 失败。
  - 覆盖 zero rect posted image paint update case。
  - 覆盖 `obsidian` -> `opencode` 旧注入残留 case。

不能修改：

- `/Users/oujinsai/Projects/obsidian-editor-background/**`
- 用户 vault 文件
- OpenCode upstream component class
- CodeMirror/editor selector 作为修复对象

## 改后数据流

```text
Background plugin 写 body source vars
  -> WebViewTheme 捕获 source vars 作为 theme payload 和 diagnostics 输入
  -> OpenCodeView 读取 body source vars
  -> EditorBackdrop 选择显式状态
  -> OpenCodeView 把 state + paint variables 发送到 iframe
  -> ProxyInjection 删除 stale variables，再应用新变量
  -> iframe body::before 只在 state 提供 paint variables 时绘制
  -> harness 校验 state 和 paint layer 一致
```

source facts 和 draw commands 分离。这是本方案的主要简化。

## 验收命令

单元测试：

```bash
bun test tests/theme/EditorBackdrop.test.ts \
  tests/proxy/ProxyInjection.test.ts \
  tests/theme/WebViewTheme.test.ts \
  tests/harness/themeReport.test.ts
```

构建：

```bash
bun run build
```

fixture harness：

```bash
bun run dev:theme:fixture
```

真实 Obsidian 插件 reload 后：

```bash
bun run dev:theme
```

手工运行态检查：

- OpenCode 在右侧栏，旁边是启用 Background 图片的 Markdown editor。
- 拖动右侧栏宽度。
- 点击 OpenCode，再点击 editor。
- 切 tab，让 OpenCode 隐藏，再切回来。
- 冷启动 Obsidian 后打开 OpenCode。
- 关闭 Background 图片，或把图片设为无效/零透明。
- 切换 `webViewAppearance` 到 `opencode`，确认没有 Obsidian injection。
- OpenCode 作为 top/root tab 打开，旁边没有可见 editor；仍然按同一套 `body-css-background` 或 `none` 规则运行。

## 风险

右侧 OpenCode pane 的 crop 会随 iframe 尺寸变化。这是当前模型允许的损失。它不追求和左侧 editor 的图片边界连续。

OpenCode iframe 仍然有自己的 `html/body` base color 和 local surface alpha。用户觉得过暗时，下一步应调整 material density，而不是恢复 active editor projection。

如果 Background 插件变量缺失、图片无效或 opacity 为 0，OpenCode 回到 material-only A。这个回退只由变量事实决定，不由 selector 失败决定。

## 回滚

回滚只影响 theme bridge：

- revert 实现清单中列出的文件；
- rebuild 插件；
- reload Obsidian 插件。

不会修改用户 vault，也不会修改 Background 插件。

## 未决问题

1. local surfaces 的 alpha 是否还偏暗。这个问题只涉及 OpenCode material density。

2. 是否需要把 `body-css-background` 的 `background-position` 暴露成插件设置。当前只尊重 Background 插件变量。

3. `iframe-hidden` 期间是否需要额外记录上一轮 visible paint state 的摘要。当前只在 theme sync history 里记录 skip。

## 2026-06-14 运行态验收补记

这一节记录后续真实 Obsidian 验收得到的新结论。它覆盖上面 D 方案文档里的乐观判断，但不删除原文，方便回看判断是怎样变化的。

### 用户目标重新表述

用户的真实目标不是“OpenCode pane 必须数学上延续左侧 editor 背景图”，而是：

- 用户启用了完整的 Obsidian 背景图。
- OpenCode 无论打开在侧边栏还是顶栏，都不应该大幅破坏这张图的意义。
- 可以接受边缘有部分看不到、轻微色差、OpenCode 自己的半透明 surface。
- 不能接受黑块、拖动宽度后的黑框、点击不同区域后亮度莫名变化。
- 不能接受通过隐藏 `.cm-active`、selection、table row、resize handle、workspace gap 等具体 selector 逐层补偿。

### A / C / D 的实测结果

#### A：material-only

实现含义：

- OpenCode iframe 不消费 `--obsidian-editor-background-image`。
- iframe 不画 Background 插件图片。
- OpenCode 只使用 Obsidian stable colors、text、border、accent 和 alpha surface。

实测结果：

- 中间边界错位和跨 pane 背景几何问题消失。
- 右侧 OpenCode 变成接近纯黑的大块区域。
- 用户真实截图显示，它稳定，但切掉了背景图的大面积意义。

结论：

A 适合作为稳定默认底线，但它没有满足用户“OpenCode 不要太影响完整背景图”的审美目标。若保留 A，只能继续调 material alpha，不能再恢复 editor image projection。

#### D：iframe-owned body CSS background

实现含义：

- OpenCode iframe 的 `body::before` 自己画 Background 插件图片。
- 使用 Background 插件 body 变量。
- `background-size: cover`，`background-position` 继承 Background 插件设置。
- 不读取 active editor rect，不做投影。

实测结果：

- 透明感和背景氛围最好。
- 右侧不再是死黑块，用户主观更喜欢。
- 但左右两边各自用自己的 pane 尺寸 `cover` 同一张图。
- 左侧 editor 和右侧 iframe 的宽高比不同，裁剪区域不同，中间边界会错位。
- 拖动宽度后，这个错位会继续变化。

结论：

D 是视觉上最接近用户偏好的方案，但它不应该被描述成“背景连续”。它只能作为 best-effort visual mode：好看、简单，但承认边界处可能错位。

#### C：active editor projection

实现含义：

- OpenCode iframe 仍然只在自己内部画一层背景。
- 但这层背景的 `background-position` / `background-size` 来自 active editor 的 rect、图片尺寸、Background 插件 position。
- 目标是让右侧 iframe 显示左侧 editor 背景图坐标系里的对应区域。

实测结果：

- 它能把“左右各自 cover”这个 D 的几何错误变小。
- 但真实 Obsidian 运行界面仍然出现明显暗带和断裂。
- 暗带来自父窗口 workspace split、tab/header、editor 局部层、Obsidian/主题暗化层等组合。
- OpenCode 插件只能控制 iframe 内部像素，不能控制父窗口这些层。

结论：

C 是理论上最接近“连续背景图”的方向，但在当前约束下不能干净收敛。继续推进会自然滑向 selector 补偿，和用户明确反对的方向冲突。

### 根本结论

在以下约束同时成立时，不能同时满足“稳定、背景图连续、无边界伪影”：

- 不修改用户 vault。
- 不 patch `/Users/oujinsai/Projects/obsidian-editor-background`。
- 不修改 Obsidian workspace / CodeMirror / Background 插件的 selector 行为。
- 不依赖透明 iframe 露出父窗口像素。
- 不通过具体 selector 隐藏 `.cm-active`、selection、resize handle、workspace gap 等局部层。

原因是 Background 插件的稳定面只提供 body CSS variables，并让每个 editor surface 自己 `cover` 绘制。它没有提供整窗口统一背景坐标。OpenCode iframe 是另一个渲染面。只要要求背景图跨这两个渲染面连续，就必须引入几何桥接；一旦引入几何桥接，父窗口 editor 局部层和 workspace 边界层会被暴露出来。继续处理这些层就是补偿代码。

### 推荐收敛

不要继续追求 C 作为默认生产模型。

推荐保留两个明确模式：

1. 稳定默认模式：material-only A。
   - 不消费 editor background image。
   - 不画 iframe 背景图。
   - 只调 Obsidian-derived surface alpha。
   - 目标是稳定、没有黑框、没有点击亮度跳变、没有跨 pane 几何问题。

2. 可选视觉模式：best-effort D。
   - iframe 自己画 Background 插件图片。
   - 明确声明它不保证跨 pane 连续。
   - 不引入 active editor projection。
   - 不增加 selector 补偿。
   - 适合用户更看重透明背景氛围、能接受边界轻微错位的场景。

如果只保留一个模式给当前用户使用，从主观视觉偏好看 D 比 A 更接近用户想要的效果；从插件默认行为和长期维护看 A 更稳。C 不建议继续作为主线。

### 后续实现约束

无论选择 A 还是 D，都应删除 C 的 projection 路径，避免继续维护半成品几何桥接。

如果选择 A：

- `createIframeBackdrop()` 永远不输出 `--another-opencode-for-obsidian-backdrop-background-image`。
- proxy HTML 不安装 iframe `body::before` 背景图层。
- harness 检查 iframe 没有 editor image paint variables。
- 只允许调整 OpenCode v2 / legacy surface token 的 alpha。

如果选择 D：

- 只允许 iframe document 内部 `body::before` 画一层图片。
- 使用 Background 插件原始 body variables。
- `background-size: cover`，`background-repeat: no-repeat`。
- 不读取 active editor rect、iframe rect、图片尺寸。
- 不写 host pane pseudo layer。
- 不恢复透明 iframe compositing。
- harness 只能检查“单层、无 host 背景、无透明 iframe、无 selector patch”，不能检查“左右连续”。

这份补记的目的不是证明某个方案已经成功，而是记录真实验收已经排除了哪些前提。后续代码应从这些排除结论出发，不再重复进入 C 的补偿路径。
