# OpenCode native prompt context bridge

日期：2026-06-18

## 文档地位

本文固定下一阶段 oc-ctx 机制方向：Obsidian 侧继续负责上下文发现和候选生命周期，OpenCode 原生 prompt context card 负责能表示为文件线索的发送前可见层。

它补足 `2026-06-17-oc-ctx-prompt-coupled-behavior-design.md` 里没有落下来的部分：

- 最小实验已经证明可以从插件侧把真实 Obsidian 文件线索送进 OpenCode 原生 context card；
- OpenCode 原生 context card 支持查询、增加、删除、comment 更新；
- 普通 file card 的更新需要由 bridge adapter 封装成 remove old key + add new item；
- StatusBar 可以继续存在，但它只能作为 `CandidateRegistry` 的另一个视图，不能成为第二份状态源。

本文不要求修改 OpenCode 上游源码。正式实现应只修改本插件仓库。

## 问题存在性检查

当前自动上下文主路径把 included candidates 追加为同一条 OpenCode prompt 的 `synthetic` text parts。这个路径解决了“上下文随用户 prompt 一起提交”的问题，也避免了旧的独立 context message 和空 timeline row。

它没有解决发送前可见层的问题。用户在 OpenCode Web UI 输入框上方已经能看到原生 context card，能点叉移除，能点击 comment。插件再用 StatusBar 表示同一批“下一条消息上下文”，会出现两个问题：

- 用户需要同时理解 StatusBar 和 OpenCode context card；
- 原生 card 点叉以后，StatusBar 如果没有回写，会继续显示已经被用户移除的候选。

所以这里需要一个机制：文件型 Obsidian 候选进入 OpenCode 原生 context card，并且 OpenCode 原生 card 的移除动作回写到 Obsidian 候选状态。

## 本地事实源

OpenCode 本地源码事实：

- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/context/prompt.tsx`
  - `FileContextItem`
  - `ContextItem`
  - `prompt.context.items/add/remove/removeComment/updateComment/replaceComments`
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/components/prompt-input/context-items.tsx`
  - 原生 context card 渲染和叉号删除行为
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/app/src/components/prompt-input/build-request-parts.ts`
  - 发送时把 context card 转成 file parts；comment card 额外生成 synthetic note
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/plugin/src/index.ts`
  - server plugin hooks 没有暴露 Web UI 当前 prompt draft / context card API
- `/Users/oujinsai/Projects/ai-cli/opencode/packages/plugin/src/tui.ts`
  - TUI 有 `TuiPromptRef.set()`，但它属于 TUI，不覆盖嵌入式 Web UI

本插件源码事实：

- `src/context/CandidateRegistry.ts`
  - 候选状态源
- `src/context/PromptContextInjector.ts`
  - 当前 prompt-request-coupled synthetic text 注入路径
- `src/bridge/OpenCodePromptContextAdapter.ts`
  - Obsidian candidate 到 OpenCode file context shape 的类型边界
- `src/bridge/BridgeInjection.ts`
  - iframe 内 UI hook 安装和 future live Web UI action 执行点
- `src/bridge/OpenCodeWebUiProxy.ts`
  - OpenCode Web UI proxy transport；未来 JS bundle patch 应放在这里或它调用的 bridge helper 中

上游跟踪：

- [anomalyco/opencode#14679](https://github.com/anomalyco/opencode/issues/14679)
  - OpenCode Web UI “Add to chat / Quick edit” 相关产品诉求。
  - 这个 issue 说明上游也在讨论类似方向，但当前没有可用的外部 Web UI draft API。
- [anomalyco/opencode#28202](https://github.com/anomalyco/opencode/issues/28202)
  - plugin async prompt 与 Web `prompt_async` 并发问题。
  - 这个 issue 提醒插件不应把 server prompt API 当成 Web UI 草稿卡片入口。

## 最小实验复现

### 启动 Obsidian CDP

完全退出 Obsidian 后启动：

```bash
/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222 2>&1 | tee /tmp/obsidian-debug.log
```

检查 CDP：

```bash
curl -fsS http://127.0.0.1:9222/json/version
curl -fsS http://127.0.0.1:9222/json/list
```

应看到：

```text
type=page
url=app://obsidian.md/index.html

type=iframe
url=http://127.0.0.1:4097/<dirBase64>/session/<sessionId>
```

### 启动临时代理

实验使用临时代理，不改仓库，不改 OpenCode 源码：

```text
127.0.0.1:5097 -> 127.0.0.1:4096
```

代理只处理一个资源：

```text
GET /assets/index-*.js
```

它从 `4096` 取原始 bundle，查找 OpenCode `PromptProvider` 返回值中的唯一锚点：

```text
context:{items:()=>l().context.items(),add:u=>l().context.add(u),remove:u=>l().context.remove(u),removeComment:(u,d)=>l().context.removeComment(u,d),updateComment:(u,d,f)=>l().context.updateComment(u,d,f),replaceComments:u=>l().context.replaceComments(u)}
```

实验观察值：

```json
{
  "event": "bundle-patch",
  "path": "/assets/index-UupoAUKC.js",
  "status": "patched",
  "anchorCount": 1,
  "originalLength": 1699240,
  "patchedLength": 1699666
}
```

`anchorCount` 必须等于 1。等于 0 或大于 1 时实验应停止。

### 暴露临时 prompt context port

patch 后在 iframe window 上暴露：

```ts
window.__anotherOpenCodeForObsidianPromptContext = {
  items,
  add,
  remove,
  removeComment,
  updateComment,
  replaceComments,
};
```

把 Obsidian 里的 OpenCode iframe 临时从 `4097` 切到 `5097`：

```text
http://127.0.0.1:4097/<dirBase64>/session/<sessionId>
-> http://127.0.0.1:5097/<dirBase64>/session/<sessionId>
```

CDP 验证：

```json
{
  "portType": "object",
  "methods": [
    "add",
    "items",
    "remove",
    "removeComment",
    "replaceComments",
    "updateComment"
  ],
  "itemCount": 0,
  "cards": 0
}
```

### 增加真实 Obsidian 文件卡片

调用：

```ts
window.__anotherOpenCodeForObsidianPromptContext.add({
  type: "file",
  path: "0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md",
  selection: {
    startLine: 157,
    startChar: 0,
    endLine: 157,
    endChar: 0,
  },
  preview: "Obsidian live bridge experiment: real vault file line 157",
});
```

观察结果：

```json
{
  "itemCount": 1,
  "cards": 1,
  "cardTexts": [
    "浮点数的编码：精度与….md:157"
  ]
}
```

同时 storage 中出现同一个 context item：

```json
{
  "key": "file:0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md:157:157",
  "path": "0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md",
  "selection": {
    "startLine": 157,
    "startChar": 0,
    "endLine": 157,
    "endChar": 0
  }
}
```

### 删除验证

点击 OpenCode 原生卡片叉号后：

```json
{
  "before": {
    "items": 1,
    "cards": 1
  },
  "removed": true,
  "afterRemove": {
    "items": 0,
    "cards": 0
  }
}
```

这证明卡片通过 OpenCode 自己的 prompt context store 生效，原生 UI、原生删除和原生 storage 都参与了状态变化。

### SOP：原生评论卡片关闭取证

这段是后续调试和人工验收的固定路径。它验证的是 OpenCode 自己的 comment card：用户在 review/file diff 中写评论，评论自动进入 prompt context card；点击 card 叉号后，上游默认回调会改哪些状态。

前置条件：

```bash
/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222 2>&1 | tee /tmp/obsidian-debug.log
```

确认 iframe target：

```bash
curl -fsS http://127.0.0.1:9222/json/list
```

选择：

```text
type=iframe
url=http://127.0.0.1:4097/<dirBase64>/session/<sessionId>
```

复现步骤：

1. 在 Obsidian 里打开 OpenCode review/file 面板。
2. 在右侧 diff 里把鼠标移动到目标行的行号 gutter。
3. 确认 `diffs-container` 的 `shadowRoot` 是 open。
4. 在 `shadowRoot` 中确认行号和正文：

```js
document.querySelector("diffs-container").shadowRoot
```

5. 鼠标 hover 后，评论按钮会从 `0x0` 变成真实 rect。例如这次验收里：

```json
{
  "aria": "评论",
  "rect": { "x": 540, "y": 178, "w": 20, "h": 20 }
}
```

6. 点击这个按钮，真实评论 textarea 出现：

```json
{
  "placeholder": "添加评论"
}
```

7. 输入测试评论并提交。
8. 检查当前 session 的两个 persisted store：

```text
opencode.workspace.<scope>.dat:session:<sessionId>:comments
opencode.workspace.<scope>.dat:session:<sessionId>:prompt
```

评论提交后，两个 store 同时出现同一个 comment：

```json
{
  "comments": {
    "<path>": [
      {
        "id": "057d57ef-af63-4c14-83e3-a622adb427ad",
        "file": "0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md",
        "selection": { "start": 120, "end": 120 },
        "comment": "oc-ctx bridge hook probe"
      }
    ]
  },
  "prompt": {
    "context": {
      "items": [
        {
          "key": "file:0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md:120:120:c=057d57ef-af63-4c14-83e3-a622adb427ad",
          "type": "file",
          "path": "0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md",
          "selection": {
            "startLine": 120,
            "endLine": 120,
            "startChar": 0,
            "endChar": 0
          },
          "comment": "oc-ctx bridge hook probe",
          "commentID": "057d57ef-af63-4c14-83e3-a622adb427ad",
          "commentOrigin": "file"
        }
      ]
    }
  }
}
```

9. 在 document capture phase 安装点击探针，目标是 prompt card 的叉号：

```text
button[aria-label="从上下文移除文件"]
button[aria-label="Remove file from context"]
```

10. 点击 card 叉号。

本次验收得到的事实：

```json
{
  "phase": "after-close-diff",
  "removedPromptItems": [
    {
      "commentID": "057d57ef-af63-4c14-83e3-a622adb427ad",
      "comment": "oc-ctx bridge hook probe"
    }
  ],
  "removedComments": [
    {
      "id": "057d57ef-af63-4c14-83e3-a622adb427ad",
      "comment": "oc-ctx bridge hook probe"
    }
  ],
  "afterPromptItems": [],
  "afterComments": []
}
```

结论：

- OpenCode 原生评论创建路径会同时写 `comments` store 和 `prompt.context` store。
- OpenCode 原生 prompt card 叉号当前会同时删除 `comments` store 和 `prompt.context` store。
- 这条默认删除语义不适合作为本插件的 skip 语义。skip 只应该让这条 comment 不进入下一次 prompt；comment 事实必须保留，StatusBar 才能恢复它。
- bundle patch 需要在 `PromptContextItems` 的 close button handler 里接管 comment card 关闭。对要接入 registry 的 comment card，patch 应阻止上游 `props.remove(item)` 继续执行，改为调用 `prompt.context.removeComment(item.path, item.commentID)` 或 `prompt.context.remove(item.key)`，并向父窗口发送 `native-card-close`。
- 只有显式删除评论气泡或 OpenCode 自己的 line-comment delete menu，才应该删除 `comments` store。

源码锚点：

```text
packages/app/src/components/prompt-input/context-items.tsx:65-75
packages/app/src/components/prompt-input.tsx:1537-1540
packages/app/src/components/prompt-input.tsx:1710-1712
packages/app/src/context/comments.tsx:101-118
packages/app/src/context/prompt.tsx:210-222
packages/app/src/components/prompt-input/submit.ts:258-276
```

### 清理实验状态

把 iframe 切回原插件代理：

```text
http://127.0.0.1:4097/<dirBase64>/session/<sessionId>
```

停掉临时 `5097` 代理。

清理后确认：

```json
{
  "bridge": true,
  "port": "undefined",
  "cards": 0,
  "sessionPromptStorage": [
    {
      "contextItems": 0
    }
  ]
}
```

## OpenCode prompt context API 形状

正式 bridge port 暴露的低层能力：

```ts
interface OpenCodePromptContextPort {
  items(): OpenCodePromptContextItem[];
  add(item: OpenCodePromptContextItemInput): PromptContextAddResult;
  remove(key: string): PromptContextRemoveResult;
  removeComment(path: string, commentID: string): PromptContextRemoveResult;
  updateComment(
    path: string,
    commentID: string,
    next: Partial<OpenCodeFileContextItem> & { comment?: string }
  ): PromptContextUpdateResult;
  replaceComments(items: OpenCodeFileContextItem[]): PromptContextReplaceResult;
}
```

低层 port 不能把 OpenCode 原生 `add()` 的 `void` 暴露给插件主逻辑。OpenCode 原生 `add()` 遇到相同 key 会直接返回，调用方无法知道这张卡片是自己刚插入的，还是 OpenCode 已经存在的同 key 卡片。正式 port 需要在调用原生 `add()` 前后读 `items()`，返回插入结果：

```ts
type PromptContextAddResult =
  | {
      status: "inserted";
      key: string;
      item: OpenCodePromptContextItem;
    }
  | {
      status: "already-owned";
      key: string;
      item: OpenCodePromptContextItem;
      projectionId: string;
    }
  | {
      status: "conflict";
      key: string;
      existing: OpenCodePromptContextItem;
      reason: "key-owned-by-opencode" | "key-owned-by-other-projection";
    };

type PromptContextRemoveResult =
  | {
      status: "removed";
      key: string;
      item: OpenCodePromptContextItem;
    }
  | {
      status: "missing";
      key: string;
    };

type PromptContextUpdateResult =
  | {
      status: "updated";
      key: string;
      previous: OpenCodePromptContextItem;
      item: OpenCodePromptContextItem;
    }
  | {
      status: "missing";
      path: string;
      commentID: string;
    };

type PromptContextReplaceResult = {
  status: "replaced";
  keys: string[];
};
```

`conflict` 是硬失败状态。bridge 不能为冲突 key 注册 activation entry，也不能把 candidate 标记为已同步。

OpenCode file context item：

```ts
interface OpenCodeFileContextItem {
  type: "file";
  path: string;
  selection?: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
  comment?: string;
  commentID?: string;
  commentOrigin?: "review" | "file";
  preview?: string;
}
```

路径合同：

- `OpenCodeFileContextItem.path` 是 OpenCode 发送路径。OpenCode 发送时会把相对路径拼到 `sessionDirectory` 下，绝对路径按原样发送。
- `clickAction.path` 是 Obsidian 导航路径，可以是 vault-relative path、heading/block subpath，或以后导航层支持的其他 Obsidian path。
- `OpenCodePromptContextAdapter` 必须把 Obsidian vault-relative path 显式转换成 OpenCode 可读取 path。第一阶段推荐使用绝对路径。
- 无法转换成 OpenCode 可读取 path 的 candidate 不能生成 `native-file-card`。它只能生成 `synthetic-text` 或 `status-only`，并把原因写入 sync result 和 diagnostics。

这个合同比显示效果更重要。native card 不只是 UI 胶囊，OpenCode 会把它发送成 file part。

路径转换需要一个唯一入口，不能散在 `ContextManager`、projection policy 和 bridge adapter 里。建议增加：

```ts
interface OpenCodeContextPathResolver {
  toOpenCodePath(vaultRelativePath: string): OpenCodePathResolution;
  toObsidianNavigationPath(input: {
    vaultRelativePath: string;
    line?: number;
    endLine?: number;
    subpath?: string;
  }): PromptContextClickAction;
}

type OpenCodePathResolution =
  | { status: "ok"; path: string }
  | {
      status: "unreadable";
      reason:
        | "missing-vault-file"
        | "outside-project-directory"
        | "path-not-normalized"
        | "unsupported-path";
    };
```

第一阶段可以用绝对路径作为 `OpenCodeFileContextItem.path`，但这个决定也必须经过 resolver。这样中文路径、大小写、symlink、vault 在 projectDirectory 外、相对路径拼接和 OpenCode key 计算都能在一个地方验收。

OpenCode 原生 key 规则：

```text
file:<path>:<startLine>:<endLine>
file:<path>:<startLine>:<endLine>:c=<commentID>
file:<path>:<startLine>:<endLine>:c=<commentDigest>
```

这个 key 来自 OpenCode `contextItemKey()`。普通 file card 没有稳定 id，path 或 selection 变化后 key 就变化。

`remove(key)` 和 `removeComment(path, commentID)` 分开，是因为 OpenCode 有两种删除地址：

- 普通 file card 只能按 `contextItemKey(item)` 删除；
- comment card 有稳定的 `commentID`，可以按 `path + commentID` 删除。

`removeComment(path, commentID)` 更适合 OpenCode review/comment 的生命周期。comment 的行号、正文或 preview 变化时，`commentID` 仍然表达同一个 comment。普通 plugin-owned file projection 没有 `commentID`，只能由 bridge 记录旧 key，再调用 `remove(oldKey)`。

插件内部 API 不应该把这个选择暴露给 `context/`。`context/` 只表达“移除某个 projection”。`bridge/` 根据 projection 的 item shape 选择 `remove(key)` 或 `removeComment(path, commentID)`。

## 插件侧高层 API

`context/` 不直接调用低层 port。`bridge/` 应提供插件侧高层 API：

```ts
type NativePromptContextOwner = "another-opencode-for-obsidian";

interface NativePromptContextProjection {
  owner: NativePromptContextOwner;
  projectionId: string;
  candidateId: string;
  sourceId: string;
  identityKey: string;
  fingerprint: string;
  item: OpenCodeFileContextItem;
  clickAction?: PromptContextClickAction;
}

type PromptContextClickAction =
  | {
      type: "opencode-open-comment";
    }
  | {
      type: "obsidian-open";
      path: string;
      line?: number;
      endLine?: number;
      subpath?: string;
    }
  | {
      type: "candidate-detail";
      candidateId: string;
    }
  | {
      type: "none";
    };

interface NativePromptContextBridge {
  status(): NativePromptContextBridgeStatus;
  sync(projections: NativePromptContextProjection[]): Promise<NativePromptContextSyncResult>;
  removeProjection(projectionId: string): Promise<NativePromptContextProjectionSyncResult>;
  clearOwner(owner: NativePromptContextOwner): Promise<NativePromptContextSyncResult>;
}

type NativePromptContextBridgeStatus =
  | {
      type: "available";
      bundle: string;
      patches: {
        port: { status: "patched"; anchorCount: 1 };
        activation: { status: "patched"; anchorCount: 1 };
        close: { status: "patched"; anchorCount: 1 };
      };
    }
  | { type: "missing-anchor"; bundle?: string }
  | { type: "ambiguous-anchor"; bundle?: string; anchorCount: number }
  | { type: "port-not-loaded" }
  | { type: "iframe-not-ready" };

interface NativePromptContextSyncResult {
  status: "ok" | "partial" | "failed";
  projections: NativePromptContextProjectionSyncResult[];
}

type NativePromptContextProjectionSyncResult =
  | {
      status: "synced" | "replaced";
      projectionId: string;
      candidateId: string;
      key: string;
    }
  | {
      status: "removed" | "missing";
      projectionId: string;
      candidateId: string;
      key?: string;
    }
  | {
      status: "conflict";
      projectionId: string;
      candidateId: string;
      key: string;
      existing: OpenCodePromptContextItem;
      reason: "key-owned-by-opencode" | "key-owned-by-other-projection";
    }
  | {
      status: "failed";
      projectionId: string;
      candidateId: string;
      reason: string;
    }
  | {
      status: "skipped";
      projectionId: string;
      candidateId: string;
      reason: "unreadable-opencode-path" | "unsupported-projection";
    };
```

`sync()` 的职责：

- 接收 context 层已经构建好的 included native-file-card projections；
- 比较上一次插件写入的 `projectionId -> OpenCode key`；
- 对已消失的 projection 调用 `remove(oldKey)`；
- 对新增 projection 调用 `add(item)`；
- 只有 `add()` 返回 `inserted` 或 `already-owned` 时，才注册 activation entry；
- `add()` 返回 `conflict` 时，不注册 activation entry，不把 projection 当作已同步；
- 对普通 file projection 的内容变化调用 `remove(oldKey)` 后 `add(newItem)`；
- 对 comment projection 的内容变化优先调用 `updateComment(path, commentID, next)`；
- 每个 projection 都必须写入 `NativePromptContextSyncResult`，不能只返回总成功。

`NativePromptContextBridge` 不能从 `CandidateRegistry` 读取候选。candidate 到 projection 的选择发生在 context 层；bridge 只消费 projection、同步 OpenCode prompt context store、返回 sync result。candidate 删除也不走 `removeCandidate(candidateId)`。删除先进入 `CandidateRegistry.remove()`，再由 projection rebuild 让 `sync()` 移除已经消失的 projection。

`bridge/` 维护 OpenCode key 映射和 activation action 映射。`context/` 只知道 candidate id、source id、fingerprint、是否 included，以及这个 projection 被点击时应该执行什么动作。

`candidateId` 和 `projectionId` 需要分开。一个 candidate 可以没有 native card，也可以对应多张 native card。GraphRAG 尤其需要这个形状：一个 GraphRAG candidate 可能包含一个摘要、三条 evidence file projection，以及一个只在 StatusBar 展示的分组说明。

`projectionId` 是同一 candidate 的同一呈现槽位。它不能包含 fingerprint、OpenCode key、line range、active line 这类会随内容变化的字段。workspace 的 active location projection 应该固定成类似：

```text
workspace:native-active-location
```

GraphRAG evidence projection 应该来自 evidence 自身稳定 id。fingerprint 变化只表示同一 projection 的内容变化，不能让这个 projection 变成另一个 projection。

## CRUD 语义

| 动作 | OpenCode 低层能力 | 插件侧语义 |
|---|---|---|
| 查 | `items()` | 读取当前 OpenCode 原生 card，用于 diagnostics、同步差异和回写 |
| 增 | `add(item)` | 新 candidate projection 进入原生 card |
| 删 | `remove(key)` / `removeComment(path, commentID)` | `removeProjection()`、source clear、one-shot 发送后消费、原生叉号回写 |
| 改 comment | `updateComment(path, commentID, next)` | 保持 comment card 原位置，更新正文、preview 或 metadata |
| 改普通 file | `remove(oldKey)` + `add(newItem)` | path 或 selection 变化时替换 projection |

comment 更新必须走 `updateComment()`。它用 `items.map()` 原地替换，不改变 comment 在列表中的顺序。

普通 file card 没有 update API。普通 file card 更新后会按 OpenCode 当前行为进入列表末尾。第一阶段只有 workspace active projection 和 selection projection 使用普通 file card，这个行为可以接受。后续如果必须保持普通 file card 原位，需要在 Web UI adapter 中暴露更低层的 replace-at-index 能力，并单独验收。

删除行为的高层规则：

```text
removeProjection(projectionId)
  -> lookup projection ownership and last OpenCode item
  -> if item.commentID exists:
       removeComment(item.path, item.commentID)
     else:
       remove(item.key)

native close button
  -> patched PromptContextItems close handler receives item/key
  -> bridge classifies item ownership
  -> if plugin-owned file card:
       remove prompt context item
       write back to CandidateRegistry
  -> if mirrored OpenCode comment card:
       remove prompt context item only
       keep comments store
       write back to CandidateRegistry
  -> if unclassified OpenCode card:
       allow original handler
       diagnostics records unclassified close
```

这样 `context/` 不需要知道 OpenCode 为什么有两种删除函数。它只维护候选和 projection 的生命周期。

remove 回写只能来自原生卡片叉号。bridge 自己为了同步调用 `remove(oldKey)`、OpenCode submit 过程中移除 comment context、编辑历史恢复时清空 context，都不能回写成用户删除候选。实现上有四条约束：

- patch `PromptContextItems` 的 close button handler，不包住所有 `prompt.context.remove()` 调用；
- comment card close 如果接入 `CandidateRegistry`，必须接管原回调，不能继续执行 `comments.remove()`；
- comment card skip 只调用 prompt context remove，不删除 comments store；
- `PromptContextRemovedPayload` 必须带 `origin: "card-close"`。如果实现需要从更底层拦截 remove，必须加 transaction id 或 suppression，确保 bridge 自己触发的 remove 不回写 `CandidateRegistry`。

## 设计方案

### 状态源

唯一状态源：

```text
CandidateRegistry
```

两个可见层：

```text
StatusBar
OpenCode native prompt context card
```

StatusBar 和 OpenCode native card 都从 `CandidateRegistry` 派生或回写。它们不能各自维护独立 truth。

### 双显示，单维护

用户会看到两个表面：

- Obsidian StatusBar：展示全部本地 candidates，包括 included、skipped、failed、status-only；
- OpenCode native prompt context card：只展示已经 included 且成功同步到 OpenCode draft 的 native-file-card projections。

维护单元只有一个：

```text
ContextCandidate + PromptContextProjection
```

StatusBar 不维护候选状态。它只把用户 intent 发给 `ContextManager`：

```text
StatusBar toggle
  -> CandidateRegistry.setIncluded(candidateId, nextIncluded)
  -> projection policy rebuilds projections
  -> NativePromptContextBridge.sync()

StatusBar remove
  -> CandidateRegistry.remove(candidateId)
  -> projection policy rebuilds projections
  -> NativePromptContextBridge.sync()
```

OpenCode native prompt context card 也不维护插件候选状态。它只是 OpenCode draft prompt context store 里的显示和发送表面。plugin-owned card 叉号要回写同一个 registry：

```text
Plugin-owned native card close
  -> prompt-context:removed { origin: "card-close", key, item }
  -> resolve key to plugin-owned projection
  -> CandidateRegistry.setIncluded(candidateId, false)
  -> projection policy rebuilds projections
  -> NativePromptContextBridge.sync()
```

这里的 close 语义是“下一条消息不发送这个 candidate”，不是删除 candidate。用户可以在 StatusBar 里重新 toggle included。真正删除只来自 StatusBar 的显式 remove，或 one-shot candidate 在发送成功后被 `consumeSent()` 消费。

OpenCode-owned comment card 也应镜像进 `CandidateRegistry`：

```text
OpenCode review/file comment submit
  -> OpenCode comments.add(...)
  -> OpenCode prompt.context.add(...)
  -> bridge observes prompt context item with commentID
  -> CandidateRegistry.upsert(native-comment candidate, included=true)

OpenCode comment card close
  -> patched close handler receives item/key
  -> prompt.context.removeComment(path, commentID)
  -> comments store remains unchanged
  -> CandidateRegistry.setIncluded(candidateId, false)
```

这类 candidate 的 identity 应来自 OpenCode comment 事实：

```text
sourceId = "opencode-native-comment"
identityKey = "opencode-comment:<path>:<commentID>"
fingerprint = hash(path + selection + comment + preview)
lifetime = one-shot
included = true when prompt context card exists
```

StatusBar 可以显示这类候选。用户在 StatusBar 里重新 include 时，bridge 用 registry 中保存的 `path / selection / comment / commentID / commentOrigin / preview` 恢复 `prompt.context` card。因为 close 时保留了 `comments` store，恢复后的 card 点击仍能打开 OpenCode 的 comment/review 位置。

OpenCode-owned plain file card 是否镜像进 registry 需要单独判断。普通 file card 没有 commentID，只有 OpenCode key；它的恢复价值和点击语义都不如 comment card 明确。第一阶段优先处理 OpenCode comment card。

OpenCode prompt context 的 persisted storage 只是 OpenCode Web UI 自己的持久化细节。插件不能把 localStorage 当状态源，也不能直接写 storage 来制造同步。插件只能通过 live PromptProvider port 同步 native-file-card projections，并通过 sync result 判断是否成功。

旧的 `synthetic + noReply` message 模型不参与这套维护状态。它写的是 OpenCode session message，不是当前 prompt draft；它无法表达 StatusBar toggle 和 native card close 的同一状态。第一阶段主路径应使用 native prompt context card；纯摘要类 projection 可以在真正发送时走 prompt request synthetic text part，但那是 submit 边界的 projection，不是提前提交一条 context message。

所以这里有两个显示表面，但没有两份可维护状态。StatusBar 的 `included=false` 和 native card 的“不显示”是同一个状态在两个表面的投影。

### 主数据流

```text
Obsidian workspace/editor/vault facts
  -> ContextSourceDriver
  -> CandidateRegistry
  -> Context projection policy
  -> OpenCodePromptContextAdapter
  -> NativePromptContextBridge.sync()
  -> OpenCode prompt.context.add/remove/updateComment
  -> OpenCode native PromptContextItems
```

OpenCode 原生 card 删除回写：

```text
User clicks native card close
  -> patched PromptContextItems close handler receives item/key
  -> if item.commentID and mirrored native-comment candidate:
       prompt.context.removeComment(item.path, item.commentID)
       postMessage(prompt-context:removed, { key, item, origin: "card-close", preservedComment: true })
     else:
       run owner-specific remove path
       postMessage(prompt-context:removed, { key, item, origin: "card-close" })
  -> main.ts validates bridge message
  -> ContextManager sets matching candidate included=false
  -> StatusBar rerenders from CandidateRegistry
```

OpenCode 原生 card 点击回写：

```text
User clicks native prompt context card
  -> patched activation hook receives item/key
  -> resolve key to PromptContextClickAction
  -> if action is opencode-open-comment:
       call original OpenCode openComment(item)
     if action is obsidian-open or candidate-detail:
       postMessage(prompt-context:activated, { key, item })
       main.ts validates bridge message
       ContextManager resolves projectionId
       ContextManager executes projection.clickAction
     if action is none:
       stop
```

这个路径让所有胶囊都先归一到 `clickAction`。OpenCode comment 的点击动作是 `opencode-open-comment`，workspace 的点击动作是 `obsidian-open`，没有自然落点的候选可以是 `none`。bridge 只解析 key 和执行 action，不在 iframe 里判断 workspace、selection 或 GraphRAG 应该做什么。

发送时：

```text
OpenCode submit
  -> OpenCode reads prompt.context.items()
  -> OpenCode buildRequestParts()
  -> file-like cards become file parts
  -> comment cards become synthetic comment note + file part
```

发送成功后：

```text
one-shot candidates
  -> CandidateRegistry.consumeSent()
  -> NativePromptContextBridge.sync()
  -> remove consumed native cards

dynamic candidates
  -> retained
  -> future workspace update calls sync again
```

### Projection policy 形状

`ContextCandidate` 是候选状态。projection 是“这个候选在下一条 prompt 区如何呈现”。两者分开以后，后续策略可以扩展，bridge 仍然只处理它能处理的 native file card。

```ts
type PromptContextProjection =
  | {
      kind: "native-file-card";
      native: NativePromptContextProjection;
    }
  | {
      kind: "synthetic-text";
      projectionId: string;
      candidateId: string;
      text: string;
    }
  | {
      kind: "status-only";
      projectionId: string;
      candidateId: string;
      label: string;
      clickAction?: PromptContextClickAction;
    };
```

处理边界：

- `NativePromptContextBridge` 只消费 `native-file-card`；
- `PromptContextInjector` 只消费 `synthetic-text`；
- `StatusBar` 可以展示三类 projection，但状态仍来自 `CandidateRegistry`；
- `status-only` 不进入 OpenCode prompt context store。

### Candidate 到 card 的投影策略

#### Workspace

Workspace 是一个动态 candidate：

```text
id: workspace
sourceKind: workspace
lifetime: dynamic
identityKey: workspace
```

Workspace 不拆成多个 OpenCode file cards。

Workspace 文本内容可以包含：

```text
Obsidian workspace:
Active: path:L157

Open notes:
- A.md
- B.md
- C.md
```

OpenCode native card 投影只表示当前 active cursor。显示上可以看到：

```text
path:L157
```

真正写入 `item.path` 的值必须是 OpenCode 可读取路径。第一阶段优先写绝对路径。这里不粘贴活动行附近正文。agent 如果需要文件内容，可以根据 file part 或工具读取。

Workspace projection 的点击行为：

```ts
clickAction: {
  type: "obsidian-open",
  path: activeVaultRelativePath,
  line: activeLine,
}
```

点击 workspace 胶囊时跳到当前活动文件和行号。这里的 `path` 是 Obsidian 导航路径，不是 OpenCode 发送路径。活动位置高频移动，所以 workspace 的 `fingerprint` 必须包含 active path/line。`NativePromptContextBridge.sync()` 看到 fingerprint 变化后更新原生 card。

Workspace 更新：

```text
active path/line changed
  -> workspace candidate fingerprint changed
  -> bridge removes old active projection
  -> bridge adds new active projection
```

如果普通 file card 的 remove/add 导致顺序变化，而这个顺序对用户可见体验造成问题，需要在 bridge adapter 中补一个明确的 batch replace 能力。这个能力只应该服务 plugin-owned projections，不能顺手重排 OpenCode 自己的 comment card。

#### Selection

Selection 是 one-shot candidate。

每段选中文本可以投影为一张 native file card：

```text
path:Lstart-Lend
```

显示路径可以是 vault-relative path。`item.path` 仍必须是 OpenCode 可读取路径，`clickAction.path` 才是 Obsidian 导航路径。

选中文本正文是否进入 prompt text 由策略决定。第一阶段可以保守处理：

- native card 提供文件和行范围；
- prompt text 可以只包含来源说明；
- 发送成功后移除 one-shot selection card。

Selection projection 的点击行为优先打开选区起始行。未来如果 Obsidian 侧可以稳定高亮范围，再把 `endLine` 接入导航层。

#### Comment

OpenCode comment card 属于 OpenCode 原生能力。插件不伪造 comment。插件需要镜像 OpenCode 自己创建的 comment card，因为它也是“下一条 prompt 是否带上”的候选。

OpenCode comment card 也要归一成 activation entry：

```ts
clickAction: {
  type: "opencode-open-comment",
}
```

第一阶段不创建 plugin-owned comment card。Obsidian workspace、selection、GraphRAG evidence 默认不能设置 `comment`、`commentID` 或 `commentOrigin`。原因是 OpenCode 原生 comment 同时涉及 comments store 和 prompt context store。只写 prompt context item 会制造一个看起来像 comment、但不属于 OpenCode comment lifecycle 的对象。

OpenCode 原生 comment 的 close 语义由本插件接管：

```text
native comment card close
  -> CandidateRegistry.setIncluded(candidateId, false)
  -> remove prompt context card
  -> keep comments store
```

这样 StatusBar 可以恢复这条 comment candidate。恢复动作只需要把保存的 comment item 写回 `prompt.context`。评论气泡的显式删除仍走 OpenCode 原生 line-comment delete 行为，并删除 comments store。

如果未来 Obsidian evidence 需要带用户注释，必须单独写一版设计，明确：

- `commentID` 如何生成；
- owner 如何表达；
- 是否写入 OpenCode comments store；
- 删除 card 时是否删除 comment 事实；
- 发送时 synthetic comment note 是否符合产品语义。

#### GraphRAG

GraphRAG 第一阶段不实现。

未来 GraphRAG 输出需要分流：

- 具体 evidence file / heading / block 来源：可以投影为 native file card；
- 综合摘要、推理解释、ranking rationale：继续走 prompt text；
- 大量 evidence：默认聚合，不把每个 evidence 都刷成独立 card。

GraphRAG 接入点是 projection policy：

```text
GraphRAG source
  -> produces ContextCandidate
  -> projection policy chooses:
       native-file-card for concrete evidence
       synthetic-text for summary/rationale
       status-only for grouped explanation
  -> bridge only syncs native-file-card projections
  -> PromptContextInjector handles synthetic-text projections
```

GraphRAG 不能直接调用 bridge，也不能直接写 OpenCode prompt store。它只产出 candidate 和 evidence facts。是否显示成 native card、是否写成 prompt text、是否只在 StatusBar 展示，由 projection policy 决定。

GraphRAG projection 的点击行为必须是可选的：

- evidence 能解析到 Obsidian 文件、heading、block 或行号时，点击打开对应位置；
- evidence 只是一段摘要或 ranking rationale 时，点击可以打开候选详情；
- evidence 没有自然落点时，`clickAction: { type: "none" }`。

这个可选点击动作是行为建模的一部分。不能因为 OpenCode card 本身可点击，就给每一种上下文硬造一个跳转位置。

## StatusBar 与 native card 的关系

StatusBar 可以保留，因为它表达更细的 Obsidian 候选控制：

- workspace 是否 included；
- selection 是否 included；
- source 失败原因；
- one-shot 候选是否已消费；
- future GraphRAG evidence 分组和摘要。

OpenCode native card 表达下一条消息中可见的 file-like attachments。

同步规则：

```text
StatusBar include
  -> CandidateRegistry.included = true
  -> NativePromptContextBridge.sync()
  -> add/upsert native card

StatusBar skip
  -> CandidateRegistry.included = false
  -> NativePromptContextBridge.sync()
  -> remove native card

StatusBar remove
  -> CandidateRegistry.remove(candidateId)
  -> NativePromptContextBridge.sync()
  -> remove native card

Native card close
  -> PromptContextItems close handler
  -> BridgeProtocol prompt-context:removed { origin: "card-close" }
  -> CandidateRegistry.setIncluded(candidateId, false)
  -> StatusBar rerenders
```

这里有两个视图，没有两份状态。

StatusBar toggle 和 native card close 的心智模型必须一致：

- toggle off：candidate 留在 registry，`included=false`，native card 消失；
- native close：candidate 留在 registry，`included=false`，StatusBar 显示 skipped；
- toggle on：candidate 仍在 registry，`included=true`，native card 重新出现；
- remove：candidate 从 registry 删除，两个表面都不再显示；
- send success：one-shot candidate 从 registry 删除，dynamic candidate 恢复 `included=true`。

这套语义让 StatusBar 成为可恢复控制面，OpenCode native card 成为发送前附件面。两个表面都操作同一个 candidate 状态。

对 OpenCode 原生 comment 来说，native close 也按这个语义执行。它不删除 comment fact，只让 prompt context card 暂时消失。显式删除评论是另一类动作，来自 review/file comment 菜单。

## 胶囊点击行为

OpenCode 原生 card 现在的点击语义来自 `PromptContextItems`：

```tsx
onClick={() => props.openComment(item)}
```

对 OpenCode 自己的 review comment 来说，`clickAction` 是 `opencode-open-comment`。对插件写入的 Obsidian workspace 或 selection 来说，`clickAction` 通常是 `obsidian-open`。两类行为都走同一个 activation 模型。

bridge 需要维护这张表：

```text
OpenCode key -> activation entry
```

activation entry 的形状：

```ts
type PromptContextActivationEntry =
  | {
      owner: "opencode";
      key: string;
      action: { type: "opencode-open-comment" };
    }
  | {
      owner: "another-opencode-for-obsidian";
      key: string;
      projectionId: string;
      candidateId: string;
      action: PromptContextClickAction;
    };
```

插件写入的 projection 在 `sync()` 时注册 activation entry。OpenCode 自己的 comment card 可以在点击时从 item shape 推导出 `opencode-open-comment`，也可以在 port ready 后扫描 `items()` 注册。两种实现都必须归一成 activation entry。

OpenCode key 不是 owner id。bridge 只能在以下条件成立时，把 key 注册给插件 projection：

- port `add()` 返回 `inserted`；
- 或 key 已经在 bridge 上一次同步记录里归属于同一个 `projectionId`，port 返回 `already-owned`。

如果 `items()` 里已经存在同 key item，但 bridge 没有这个 projection 的 ownership 记录，结果必须是 `conflict`。conflict 时不能注册 activation entry，不能回写 CandidateRegistry 为 synced，不能调用 remove 去“整理”那张已有卡片。

点击发生时，bridge 按 key 判断：

- action 是 `opencode-open-comment`：执行原来的 `openComment(item)`；
- action 是 `obsidian-open`：发 `prompt-context:activated`，主线程打开 Obsidian 文件或 subpath；
- action 是 `candidate-detail`：发 `prompt-context:activated`，主线程打开候选详情；
- action 是 `none`：不创建跳转行为，只保留卡片可删除和可发送的能力。

这个设计让点击动作注册在 activation entry 上。插件拥有的 activation entry 来自 projection。OpenCode 自己的 comment activation entry 来自 OpenCode item shape。source driver 负责事实，CandidateRegistry 负责状态，projection policy 负责“这个事实在 OpenCode prompt 区如何呈现、点击后做什么”。bridge 不拥有 workspace、selection 或 GraphRAG 策略。

## BridgeProtocol 增量

需要新增本地 iframe message。名称示例：

```ts
promptContextReady: "prompt-context:ready";
promptContextUnavailable: "prompt-context:unavailable";
promptContextRemoved: "prompt-context:removed";
promptContextActivated: "prompt-context:activated";
promptContextChanged: "prompt-context:changed";
```

payload 示例：

```ts
type PromptContextRemovedPayload = {
  key: string;
  origin: "card-close";
  item?: OpenCodeFileContextItem;
};

type PromptContextChangedPayload = {
  origin:
    | "opencode-comment-add"
    | "opencode-comment-delete"
    | "opencode-submit-clear"
    | "bridge-sync"
    | "unknown";
  items: OpenCodeFileContextItem[];
  transactionId?: string;
};

type PromptContextActivatedPayload = {
  key: string;
  item?: OpenCodeFileContextItem;
};

type PromptContextUnavailablePayload = {
  reason:
    | "missing-anchor"
    | "ambiguous-anchor"
    | "port-not-loaded"
    | "iframe-not-ready";
  bundle?: string;
  anchorCount?: number;
};
```

父窗口继续校验：

- namespace；
- version；
- current proxy origin；
- message type；
- payload shape。

`prompt-context:removed` 只表示用户点原生 card 叉号。bridge 自己为了同步调用 remove、OpenCode submit 清空 prompt context、OpenCode explicit comment delete，都不能复用这个 origin。需要保留 `transactionId` 或 suppression 标记，让 bridge 自己触发的低层 remove 不回写 `CandidateRegistry`。

显式删除 OpenCode comment 需要进入 `prompt-context:changed`，并让 `ContextManager` 删除或标记失效对应 `opencode-native-comment` candidate。否则用户在 StatusBar 里可能恢复一条 OpenCode comments store 已经不存在的 comment card。

## Bundle patch 合同

正式实现应新增一个纯函数：

```ts
patchOpenCodePromptContextBundle(input: string): {
  status: "patched" | "missing-anchor" | "ambiguous-anchor";
  code: string;
  patches: {
    port: { status: "patched" | "missing-anchor" | "ambiguous-anchor"; anchorCount: number };
    activation: { status: "patched" | "missing-anchor" | "ambiguous-anchor"; anchorCount: number };
    close: { status: "patched" | "missing-anchor" | "ambiguous-anchor"; anchorCount: number };
  };
};
```

合同：

- 只 patch OpenCode Web UI `index-*.js`；
- patch 点限于两个 OpenCode Web UI 源码事实：
  - `PromptProvider` prompt context 返回对象，用来暴露 `items/add/remove/removeComment/updateComment/replaceComments`；
  - `PromptContextItems` 的 card activation 边界，用来区分 plugin-owned projection click 和 OpenCode 原生 comment click；
- `PromptContextItems` 的 close button handler，用来把 card close 变成可审计的 skip intent；
- 每个 patch anchor count 必须等于 1；
- `missing-anchor` 和 `ambiguous-anchor` 不转入降级注入；
- patch outcome 写入 diagnostics；
- 测试覆盖当前 bundle snippet、missing anchor、ambiguous anchor；
- 不把 minified 变量名散落到其他模块。

禁用项：

- 不用 DOM selector、class name 或布局结构寻找卡片；
- 不写 `localStorage`、`sessionStorage` 或 OpenCode persisted prompt storage 作为成功路径；
- 不用测试 harness 制造“看起来同步成功”的状态；
- patch 失败只能暴露 diagnostics，不能自动切到另一套不可见写入机制。

`OpenCodeWebUiProxy` 的职责：

```text
GET text/html
  -> 注入 BridgeInjection / theme script

GET /assets/index-*.js
  -> patchOpenCodePromptContextBundle()
  -> 返回 patched JS 或原 JS
  -> diagnostics 记录 status

其他请求
  -> 原样转发
```

## 失败合同

bridge 不可用时：

- diagnostics 明确显示 `missing-anchor`、`ambiguous-anchor`、`port-not-loaded` 或 `iframe-not-ready`；
- file-like candidates 保留在 `CandidateRegistry`；
- StatusBar 继续显示候选和失败原因；
- 不自动创建伪卡片；
- 不把 file-like candidates 静默转成另一套用户看不见的写入方式。

发送 prompt 时，如果 native bridge 不可用，仍可让 `PromptContextInjector` 处理纯文本摘要类上下文。file-like native projection 是否降级成 synthetic text 需要显式产品决策，不能由 bridge 私自决定。

## Implementation Shape Audit

这一节把设计收敛到当前代码能承接的形状。它的目标是让后续实现先改结构，再接行为，避免把 native card、StatusBar、synthetic injector 三条路径写成三份状态。

### 当前代码能承接的部分

当前 `src/context/CandidateRegistry.ts` 已经具备这些能力：

- 按当前 session 管理候选；
- `included` 本地切换；
- source clear；
- one-shot 发送后消费；
- dynamic candidate 发送后保留；
- bounded queue；
- failure reason。

这说明 `CandidateRegistry` 可以继续作为状态源。后续不需要再为 OpenCode native card 增加一份平行状态表。

当前 `src/context/ContextStatusBar.ts` 已经通过 `ContextManager` 委托 `toggleCandidate` / `removeCandidate`，它没有自己保存候选真相。这个方向是对的。后续 native card close 回写以后，StatusBar 只需要重渲染 registry 的状态。

当前 `src/context/PromptContextInjector.ts` 已经能在 `POST /session/{id}/message` 边界追加 `synthetic: true` text parts。它可以继续处理摘要类、解释类、无法转换成 OpenCode file part 的文本 projection。它不应该继续承担 file-like candidate 的默认主路径。

当前 `src/bridge/OpenCodePromptContextAdapter.ts` 只是一个单 candidate 到 OpenCode file item 的雏形。它可以保留，但需要扩展成 projection builder 和 OpenCode key ownership 的类型边界。

当前 `src/context/ContextStatusBar.ts` 还没有接收 bridge sync result。native card 上线后，StatusBar 需要能显示 projection 同步失败，例如 unreadable OpenCode path、key conflict、port unavailable、bundle patch failure。这些失败默认属于 projection sync state，不属于 source discovery failure。`ContextCandidate.status="failed"` 继续用于 source 本身失败。

### 当前代码缺的部分

`src/types.ts` 里的 `ContextCandidateSourceKind` 目前没有 native OpenCode comment 来源：

```ts
export type ContextCandidateSourceKind =
  | "workspace"
  | "selection"
  | "manual"
  | "graph"
  | "diagnostic";
```

实现 mirrored OpenCode comment 时，不能把它塞进 `manual` 或 `diagnostic`。它有明确来源、明确生命周期、明确恢复行为。需要增加一个显式 source kind，例如：

```ts
| "opencode-native-comment"
```

`ContextCandidate` 目前只能保存通用路径、行号和正文：

```ts
sourceFile
navigationSourceFile?
startLine?
endLine?
text
```

这不足以恢复 OpenCode 原生 comment card。恢复 comment card 需要保存：

- OpenCode prompt context key；
- OpenCode 发送路径；
- selection 的 startLine/startChar/endLine/endChar；
- comment；
- commentID；
- commentOrigin；
- preview。

这些数据必须跟随 candidate 留在 registry 中。只放在 bridge 的临时 map 里会制造第二份状态；StatusBar 重新 include 时就没有足够信息恢复 native card。

推荐增加一个有类型约束的 candidate source data 字段。字段名可以在实现时调整，但形状必须表达 source-specific data，不能做成无类型 `Record<string, unknown>`：

```ts
type ContextCandidateSourceData =
  | {
      type: "workspace";
      openCodePath?: string;
      navigationPath?: string;
      line?: number;
    }
  | {
      type: "selection";
      openCodePath?: string;
      navigationPath?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      type: "opencode-native-comment";
      openCodeKey: string;
      item: {
        type: "file";
        path: string;
        selection?: {
          startLine: number;
          startChar: number;
          endLine: number;
          endChar: number;
        };
        comment: string;
        commentID: string;
        commentOrigin?: "review" | "file";
        preview?: string;
      };
    };
```

这个字段属于 candidate 的 source fact。`bridge/` 仍然负责把它投影成 OpenCode Web UI action，`context/` 不需要知道 Solid store 或 bundle patch 细节。

### 预期模块拓扑

实现后，代码调用链应收敛成下面两条入口。

Obsidian source 入口：

```text
Obsidian workspace/editor/vault facts
  -> ContextManager
  -> ContextSourceDriver / ContextAutoSources
  -> CandidateRegistry.upsert / clearSource / setIncluded / remove
  -> buildPromptContextProjections(candidates)
       -> native-file-card projections
       -> synthetic-text projections
       -> status-only projections
  -> NativePromptContextBridge.sync(native-file-card projections)
  -> PromptContextInjector.prepare(synthetic-text projections, request body)
  -> ContextStatusBar.render(candidates, sync results)
```

OpenCode Web UI 入口：

```text
OpenCode PromptProvider / PromptContextItems
  -> patched bundle exposes prompt context port
  -> BridgeInjection receives port events
  -> BridgeProtocol prompt-context:changed / removed / activated
  -> main.ts validates origin/version/type
  -> ContextManager
       -> upsertOpenCodeNativeCommentCandidate()
       -> setCandidateIncluded(candidateId, false)
       -> executePromptContextClickAction()
  -> CandidateRegistry
  -> buildPromptContextProjections(candidates)
  -> NativePromptContextBridge.sync()
```

这两条入口最后都回到 `CandidateRegistry` 和 projection policy。OpenCode card 的变化不能绕过 registry 直接修改 StatusBar；StatusBar 的变化不能绕过 bridge 直接写 iframe。

### 建议文件形状

第一阶段建议把新增代码限定在这些文件或模块：

```text
src/types.ts
  - ContextCandidateSourceKind 增加 opencode-native-comment
  - ContextCandidate 增加有类型的 sourceData

src/context/PromptContextProjection.ts
  - buildPromptContextProjections(candidates, settings, vault/project facts)
  - 输出 native-file-card / synthetic-text / status-only
  - 负责决定 clickAction

src/context/ContextManager.ts
  - bridge event 的唯一 context 入口
  - upsertOpenCodeNativeCommentCandidate(input)
  - setNativePromptContextIncludedByKey(key, included)
  - executePromptContextClickAction(action)

src/bridge/OpenCodePromptContextBundlePatch.ts
  - patchOpenCodePromptContextBundle(input)
  - 只做 bundle 字符串 patch 和 anchor count

src/bridge/OpenCodePromptContextAdapter.ts
  - OpenCodePromptContextPort / result 类型
  - candidate projection 到 OpenCode item 的转换
  - OpenCode key 计算和 ownership 判定

src/bridge/NativePromptContextBridge.ts
  - sync(projections)
  - removeProjection(projectionId)
  - key -> projection ownership
  - key -> activation entry
  - diagnostics summary

src/bridge/BridgeInjection.ts
  - iframe 内安装 port ready / unavailable / card close / card activation hook
  - 只发 BridgeProtocol message，不执行 Obsidian source 策略

src/bridge/BridgeProtocol.ts
  - prompt-context:ready
  - prompt-context:unavailable
  - prompt-context:changed
  - prompt-context:removed
  - prompt-context:activated
```

可以不新增 `NativeCommentContextSource.ts`。第一阶段更直接的做法是让 `ContextManager` 接收 `prompt-context:changed`，把 OpenCode comment item 归一成 `opencode-native-comment` candidate。等 native comment mirror 行为稳定后，再决定是否拆成 source driver。

### 最小接口约束

`ContextManager` 需要给 bridge event 暴露窄入口：

```ts
interface OpenCodeNativeCommentInput {
  key: string;
  item: {
    type: "file";
    path: string;
    selection?: {
      startLine: number;
      startChar: number;
      endLine: number;
      endChar: number;
    };
    comment: string;
    commentID: string;
    commentOrigin?: "review" | "file";
    preview?: string;
  };
}

interface ContextManagerNativePromptContextApi {
  upsertOpenCodeNativeCommentCandidate(input: OpenCodeNativeCommentInput): ContextCandidate;
  setNativePromptContextIncludedByKey(key: string, included: boolean): ContextCandidate | null;
  handlePromptContextActivated(input: PromptContextActivatedPayload): Promise<void>;
}
```

`NativePromptContextBridge` 需要给 context 层暴露同步入口：

```ts
interface NativePromptContextBridge {
  sync(projections: NativePromptContextProjection[]): Promise<NativePromptContextSyncResult>;
  removeProjection(projectionId: string): Promise<NativePromptContextProjectionSyncResult>;
  clearOwner(owner: NativePromptContextOwner): Promise<NativePromptContextSyncResult>;
}
```

`ContextManager` 不应该调用 `port.add()`、`port.remove()`、`window.__anotherOpenCodeForObsidianPromptContext`。这些低层对象只属于 `bridge/`。

`BridgeInjection` 不应该调用 `CandidateRegistry`。它只能发本地 message。这样 iframe hook 失败时，失败停留在 bridge diagnostics，不会把 context 状态改坏。

### 状态和动作的归属

| 事实或动作 | Owner | 说明 |
|---|---|---|
| Obsidian workspace / selection / future GraphRAG source | `src/context` | 只产 candidate |
| included / skipped / failed / consumed | `CandidateRegistry` | 唯一候选状态 |
| candidate 到 native card / synthetic text 的选择 | `PromptContextProjection.ts` | 策略入口 |
| OpenCode file item shape / key / conflict | `src/bridge` | Web UI 适配入口 |
| OpenCode native card close | `BridgeInjection` -> `BridgeProtocol` -> `ContextManager` | close 表达 skip |
| OpenCode native comment facts | OpenCode comments store + mirrored candidate | comment fact 由 OpenCode 保存，是否发送由 registry 保存 |
| StatusBar toggle | `ContextStatusBar` -> `ContextManager` -> `CandidateRegistry` | 不调用 OpenCode API |
| native card click | `BridgeInjection` -> activation entry | action 来自 projection |
| send-time synthetic text | `PromptContextInjector` | 只处理 text projection |

这张表是后续实现的复杂度验收点。新增代码如果让 `StatusBar` 直接写 Web UI，或者让 bridge 决定 GraphRAG 策略，都应该退回重写。

### close / skip / remove / delete 的统一语义

| 用户动作 | Registry 结果 | OpenCode prompt context 结果 | OpenCode comments store 结果 |
|---|---|---|---|
| StatusBar toggle off | candidate 保留，`included=false` | 对应 native card 移除 | 保留 |
| native card close, plugin-owned | candidate 保留，`included=false` | 对应 native card 移除 | 无 comment store |
| native card close, mirrored comment | candidate 保留，`included=false` | comment card 移除 | 保留 comment |
| StatusBar toggle on | candidate 保留，`included=true` | native card 恢复 | 保留 |
| StatusBar remove | candidate 删除 | native card 移除 | mirrored comment 第一阶段保留 comment |
| OpenCode comment UI 显式删除评论 | mirrored candidate 删除或标记失效 | comment card 移除 | 删除 comment |
| send success, one-shot | candidate 消费删除 | native card 移除 | mirrored comment 是否删除需要按 OpenCode submit 行为验收 |
| send success, dynamic | candidate 保留 | dynamic native card 保留或按策略刷新 | 保留 |

`mirrored comment` 的 StatusBar remove 是否删除 OpenCode comment fact，第一阶段建议保留 comment fact。原因是 StatusBar remove 表达“插件控制面不再维护这个候选”，而 OpenCode 评论事实属于 review/file comment lifecycle。删除 comment fact 需要用户在 OpenCode comment UI 做显式删除。

实现 mirrored native comment 前，必须先用 CDP 验证 OpenCode submit 成功后这三处状态如何变化：

```text
prompt.context.items
comments store
rendered prompt context cards
```

这会决定 `opencode-native-comment` candidate 的 post-send policy。当前设计先按 one-shot 建模，但这个假设要由运行态证据确认。

### 设置开关和 included 的关系

设置开关控制 source 是否运行：

```text
contextAssist.enabled = false
  -> stop all source drivers
  -> CandidateRegistry.clear()
  -> NativePromptContextBridge.clearOwner()

workspace.enabled = false
  -> stop workspace/cursor refresh
  -> CandidateRegistry.clearSource("workspace")
  -> bridge sync removes workspace projection

selection.enabled = false
  -> stop selection listener
  -> CandidateRegistry.clearSource("selection")
  -> bridge sync removes selection projections
```

candidate 的 `included` 控制下一条消息是否带上：

```text
included=true
  -> eligible for native-file-card or synthetic-text projection

included=false
  -> retained in CandidateRegistry
  -> hidden from OpenCode native prompt area
  -> recoverable from StatusBar
```

source 开关关闭时不维护 skipped candidate。这个规则符合当前“关闭即停”的产品要求，也避免 disabled source 继续空转。

### 同步并发和 session 边界

`NativePromptContextBridge.sync()` 必须按 session/owner 串行执行。source refresh、StatusBar toggle、native card close、OpenCode comment add、iframe reload 都可能连续触发 sync。实现上至少需要一个 revision：

```text
ContextManager computes projection revision N
  -> NativePromptContextBridge.sync(revision N, projections)
  -> if newer revision exists before completion:
       result is stale
       do not overwrite sync state
```

bridge 的 `projectionId -> OpenCode key` map 和 activation table 必须绑定 session。`CandidateRegistry.setSession()` 清空候选时，也要触发 `NativePromptContextBridge.clearOwner()` 或等价的 projection rebuild，让旧 session 的 plugin-owned cards 从 OpenCode draft 中移除。

iframe reload 后，bridge 需要重新读取 port `items()`，再根据当前 registry projection 重建 ownership。重建时只能 claim 上一次 sync 记录里属于本插件的 projection key；遇到同 key 但无 ownership 记录的 card，按 conflict 处理。

### 实现前必须解决的检查点

第一，native comment 的 source data 需要落进 `ContextCandidate`。如果只保存在 `NativePromptContextBridge` 的 ownership map 里，StatusBar toggle on 无法恢复 card。这会把 bridge 变成第二个状态源。

第二，`PromptContextInjector` 要改成只消费 `synthetic-text` projection。当前它直接读取 included candidates。native-file-card 上线后，继续直接读取 candidates 会让同一个 workspace 或 selection 同时进入 native card 和 synthetic text。

第三，`CandidateRegistry.consumeSent()` 当前会把所有 skipped dynamic candidate 恢复成 included。这个行为适合“跳过一次”的 workspace，但不一定适合 mirrored OpenCode comment。native comment 是 one-shot，所以发送成功后会被消费；如果未来某类 dynamic candidate 需要长期 skipped，`CandidateLifetime` 可能需要增加更明确的 post-send policy。第一阶段先不扩展类型，但实现 mirrored comment 时要确认它保持 `one-shot`。

第四，OpenCode comment 显式删除需要有事件入口。card close 表达 skip，comment delete 表达评论事实消失。没有这个事件入口时，StatusBar 可能恢复一条 OpenCode comments store 已删除的 comment。

第五，bridge patch status 需要按 port / activation / close 分开。能 add card 不等于能捕获 close；能捕获 close 不等于能拦截 activation。diagnostics 必须报告具体缺口。

## Change Manifest

| File / module | Symbol / area | Action | Reason | Acceptance |
|---|---|---|---|---|
| `src/types.ts` | `ContextCandidateSourceKind` | add `opencode-native-comment` | mirrored OpenCode comment has its own source identity | TypeScript can distinguish native comment candidates from manual/diagnostic candidates |
| `src/types.ts` | `ContextCandidate` | add typed `sourceData` | skipped native comment must be restorable from registry | comment key/path/selection/comment/commentID/commentOrigin/preview survive StatusBar toggle off/on |
| `src/context/PromptContextProjection.ts` | new projection builder | add native-file-card / synthetic-text / status-only projection types | candidate state and presentation need separate shapes | workspace/selection/comment/GraphRAG can choose different projection kinds without changing registry |
| `src/context/PromptContextProjection.ts` | path resolver use | add single OpenCode path conversion call | OpenCode send path and Obsidian navigation path have different contracts | unreadable path returns skipped projection result, not a fake card |
| `src/context/PromptContextInjector.ts` | `prepare()` input | change from included candidates to synthetic-text projections | avoid duplicate native card + synthetic text send | native-file-card candidate is not formatted as synthetic text |
| `src/context/CandidateRegistry.ts` | post-send policy | keep current one-shot consume and workspace skip-on-next-send, document future policy | avoid hiding dynamic behavior in injector | consume behavior is triggered by send completion, not by synthetic injector existence |
| `src/context/ContextManager.ts` | bridge prompt context API | add native comment upsert, included-by-key, activation handler | bridge events need one context entry point | BridgeInjection never imports CandidateRegistry |
| `src/context/ContextStatusBar.ts` | render deps | accept projection sync result | UI must show sync conflicts and bridge unavailable state | key conflict/unreadable path/port unavailable can be surfaced without marking source failed |
| `src/bridge/BridgeProtocol.ts` | message constants and validators | add prompt-context ready/unavailable/changed/removed/activated | native card events need typed local protocol | removed payload always carries `origin: "card-close"` |
| `src/bridge/OpenCodePromptContextBundlePatch.ts` | new pure patch function | patch port, activation, close anchors separately | diagnostics must say which hook exists | missing/ambiguous anchor reports per patch point |
| `src/bridge/OpenCodePromptContextAdapter.ts` | item/key/result types | narrow to OpenCode shape and conversion | adapter should not own lifecycle | adapter has no registry or activation table |
| `src/bridge/NativePromptContextBridge.ts` | new sync owner | own projection sync, key ownership, activation entries, suppression | bridge needs a single execution boundary | bridge self-remove does not write back to CandidateRegistry |
| `src/bridge/BridgeInjection.ts` | iframe hook install | emit prompt-context messages and expose port status | iframe code should not own strategy | hook emits typed messages; it does not resolve Obsidian paths |
| `src/bridge/OpenCodeWebUiProxy.ts` | JS asset handling | call bundle patch for `index-*.js` | patch belongs to proxy transport path | non-OpenCode JS assets are untouched |
| `src/debug/RuntimeDiagnostics.ts` | prompt context diagnostics | record patch status and sync summary | runtime evidence is needed for brittle Web UI adapter | diagnostics show port/activation/close patch state |

## 实现切片

### Slice 0：结构落点，不 patch bundle

这一片先消掉双源状态和重复发送风险，再碰 OpenCode Web UI bundle。

- `ContextCandidate` 增加 typed `sourceData`。
- 增加 `opencode-native-comment` source kind。
- 新增 `PromptContextProjection.ts`，定义 native-file-card / synthetic-text / status-only。
- `PromptContextInjector` 改成消费 synthetic-text projections。
- `BridgeProtocol` 增加 prompt-context payload 类型和 validator。
- `ContextStatusBar` 增加 projection sync result 输入。
- 明确 send completion 触发 candidate consume / dynamic restore，不再让 synthetic injector 成为唯一触发点。
- 写类型和 registry/projection 单测。

验收：

```text
workspace/selection candidate 不会同时进入 native-file-card 和 synthetic-text
native comment sourceData 足以恢复 card item
prompt-context:removed 只能表达 origin=card-close
bridge sync result 能传到 StatusBar
ContextManager 不调用 port.add/remove
BridgeInjection 不导入 CandidateRegistry
```

### Slice 1：正式化 bundle patch 与 port

- 新增 `src/bridge/OpenCodePromptContextBundlePatch.ts`。
- `OpenCodeWebUiProxy` 对 `index-*.js` 应用 patch。
- `BridgeInjection` 监听 port ready/unavailable。
- `BridgeInjection` 监听 native card activation/remove。
- `BridgeInjection` 或 bundle patch 监听 OpenCode 原生 comment card close，并在 close 前接管默认 remove 行为。
- diagnostics 输出 bundle patch 状态。
- 测试 prompt context port patch 成功、缺失、歧义。
- 测试 card activation hook patch 成功、缺失、歧义。
- 测试不使用 DOM selector、class name、storage 写入作为成功路径。

验收：

```text
CDP: typeof window.__anotherOpenCodeForObsidianPromptContext === "object"
CDP: Object.keys(port) 包含 add/items/remove/updateComment
port.add(existing-key) returns conflict
CDP: plugin-owned card click emits prompt-context:activated
CDP: opencode-open-comment action calls original openComment
CDP: OpenCode comment card close removes prompt context item but keeps comments store
```

### Slice 2：bridge 高层 sync

- `OpenCodePromptContextAdapter` 从单个 mapping 扩展为 projection builder。
- 新增 `NativePromptContextBridge.sync(projections)`。
- 维护 `OpenCode key -> activation entry`。
- 普通 file 更新走 remove/add。
- comment 更新走 updateComment。
- native close 回写 `CandidateRegistry.setIncluded(candidateId, false)`。
- OpenCode comment card close 也回写 mirrored native-comment candidate。
- native-comment close 保留 OpenCode comments store。
- native activation 按 activation entry action 分发。
- sync result 返回每个 projection 的 synced/replaced/conflict/missing/failed/skipped。
- 无法转换为 OpenCode 可读取路径的 projection 返回 skipped，不生成 native card。

验收：

```text
StatusBar include -> 原生 card 出现
StatusBar skip -> 原生 card 移除
原生 card 点叉 -> payload origin=card-close -> StatusBar candidate included=false
OpenCode comment card 点叉 -> prompt context item 消失，comments store 保留
StatusBar toggle on mirrored comment -> comment card 恢复，点击仍打开原 OpenCode comment
bridge 自己 remove old key -> 不回写 CandidateRegistry
OpenCode 内部 submit/edit 清 context -> 不回写 CandidateRegistry
workspace active line 更新 -> 仍只有一张 workspace active projection
workspace projectionId 不随 active line 变化
OpenCode key conflict -> 不注册 activation entry，不回写 synced
workspace native card click -> Obsidian 打开 active file/line
opencode-open-comment action -> 调用 OpenCode openComment
clickAction none -> 不调用 openComment，不硬造 Obsidian 跳转
```

### Slice 3：接入 workspace 与 selection

- workspace 作为一个 dynamic candidate，不拆成多个 file cards。
- workspace native projection 只投影 active path/line。
- selection 作为 one-shot candidate，投影为 file range card。
- 发送成功后移除 one-shot native cards。
- projection policy 输出 native-file-card / synthetic-text / status-only 三类 projection。
- native-file-card 的 `item.path` 使用 OpenCode 可读取路径，`clickAction.path` 使用 Obsidian 导航路径。
- 第一阶段不创建 plugin-owned comment card。

验收：

```text
workspace 有多个 open notes -> OpenCode native card 不刷成多张
active location 变化 -> workspace projection 更新
selection 发送成功 -> selection card 消失
dynamic workspace 发送成功 -> workspace candidate 保留
selection card click -> Obsidian 打开选区起始行
无法转换成 OpenCode 可读取路径的 selection -> 不生成 native card，diagnostics 说明原因
```

## 验收清单

- `OpenCodePromptContextBundlePatch` 对当前 bundle anchor 返回 `patched`。
- anchor count 为 0 时返回 `missing-anchor`。
- anchor count 大于 1 时返回 `ambiguous-anchor`。
- patched iframe 暴露 `items/add/remove/removeComment/updateComment/replaceComments`。
- `add(file item)` 后 OpenCode 原生卡片立刻出现。
- `add(file item)` 返回 inserted/already-owned/conflict，不用 void 判断同步成功。
- key conflict 时不注册 activation entry，不把 projection 标记为 synced。
- `item.path` 是 OpenCode 发送路径；`clickAction.path` 是 Obsidian 导航路径。
- OpenCode 原生叉号删除后，port `items()` 变少。
- OpenCode 原生叉号删除后，插件收到 `prompt-context:removed`，payload 带 `origin: "card-close"`。
- OpenCode 原生 comment card 叉号删除后，`prompt.context.items` 变少，`comments` store 保留同一个 comment id。
- mirrored OpenCode comment candidate 在 StatusBar 中变成 skipped，并可恢复。
- bridge 自己调用 remove、OpenCode submit/edit 清 context 时，不回写 CandidateRegistry。
- 插件拥有的原生卡片点击后，插件收到 `prompt-context:activated`。
- OpenCode 自己的 comment card 通过 `opencode-open-comment` 打开 OpenCode comment/review 行为。
- comment update 使用 `updateComment()`，顺序不变。
- comment 删除使用 `removeComment(path, commentID)`。
- 第一阶段不创建 plugin-owned comment card。
- 普通 file 更新使用 remove/add，diagnostics 可说明 key 变化。
- projectionId 不包含 fingerprint、OpenCode key、line range 或 active line。
- workspace 多 open notes 不生成多张 native cards。
- workspace card 点击打开当前 active file/line。
- 没有自然点击落点的 projection 可以显示和删除，但不会硬造跳转。
- GraphRAG source 可以输出 native-file-card、synthetic-text、status-only 的混合 projections。
- 同 URL 去重按 OpenCode `buildRequestParts()` 行为验收；UI 有 card 不等于发送 parts 一定重复包含该文件。
- StatusBar 只从 `CandidateRegistry` 读状态。
- native bridge 不可用时 diagnostics 明确暴露原因。
- bundle patch 不使用 DOM selector、class name、localStorage、sessionStorage 或 persisted prompt storage 作为成功路径。
- 不修改 OpenCode 上游源码。

## 当前结论

机制方向可行。正式实现应把易变的 OpenCode Web UI adapter 限定在 `src/bridge`，把候选策略留在 `src/context`。

实现前必须先落下这些硬合同：

- OpenCode 发送路径和 Obsidian 导航路径分开；
- `add()` / `remove()` 返回可审计结果；
- key conflict 不注册 ownership；
- remove 回写只来自 `origin: "card-close"`；
- mirrored OpenCode comment card close 只移除 prompt context item，保留 comments store；
- `projectionId` 是稳定呈现槽位；
- 第一阶段不创建 plugin-owned comment card。

第一阶段应该先实现 live port、sync、native close 回写、mirrored native-comment candidate 和 activation entry，再决定 StatusBar 的最终视觉形状。没有 close 回写时，StatusBar 与 OpenCode native card 会产生状态不一致；有回写后，它们是同一个候选状态的两个视图。
