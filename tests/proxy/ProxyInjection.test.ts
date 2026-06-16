import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE } from "../../src/bridge/BridgeProtocol";
import { injectOpenCodeWebUiProxyHtml } from "../../src/proxy/ProxyInjection";

const html = "<html><head></head><body>OpenCode</body></html>";
type PostedBridgeMessage = {
  ns?: string;
  version?: number;
  type?: string;
  payload?: unknown;
};

function runInjectedBridge(bodyMarkup: string): {
  document: any;
  messages: PostedBridgeMessage[];
  window: Window;
} {
  const injected = injectOpenCodeWebUiProxyHtml(html, "opencode", null);
  const script = extractBridgeScript(injected);
  const window = new Window({ url: "http://127.0.0.1:4097" });
  const messages: PostedBridgeMessage[] = [];
  const parent = window.parent as unknown as {
    postMessage: (message: PostedBridgeMessage, targetOrigin: string) => void;
  };
  parent.postMessage = (message) => {
    messages.push(message);
  };
  window.document.body.innerHTML = bodyMarkup;
  Function(
    "window",
    "document",
    "Element",
    "Number",
    script
  )(window, window.document, window.Element, Number);
  return { document: window.document, messages, window };
}

function extractBridgeScript(injected: string): string {
  const match = injected.match(
    /<script data-another-opencode-for-obsidian-bridge>\s*([\s\S]*?)\s*<\/script>/
  );
  if (!match) {
    throw new Error("Bridge script was not injected");
  }
  return match[1];
}

function click(window: Window, element: any): void {
  element.dispatchEvent(
    new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
    })
  );
}

function clickTextOffset(window: Window, text: Text, offset: number): void {
  const ownerDocument = text.ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  ownerDocument.caretRangeFromPoint = () => {
    const range = ownerDocument.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    return range;
  };
  const element = text.parentElement;
  if (!element) {
    throw new Error("Expected text node parent element");
  }
  element.dispatchEvent(
    new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      clientX: 12,
      clientY: 16,
    }) as unknown as Event
  );
}

function pointerMoveTextOffset(window: Window, text: Text, offset: number): void {
  const ownerDocument = text.ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  ownerDocument.caretRangeFromPoint = () => {
    const range = ownerDocument.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    return range;
  };
  const element = text.parentElement;
  if (!element) {
    throw new Error("Expected text node parent element");
  }
  element.dispatchEvent(
    new window.MouseEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: 12,
      clientY: 16,
    }) as unknown as Event
  );
}

function lastMessage(messages: PostedBridgeMessage[]): PostedBridgeMessage {
  const message = messages[messages.length - 1];
  if (!message) {
    throw new Error("Expected at least one bridge message");
  }
  return message;
}

describe("ProxyInjection", () => {
  test("injects the bridge script without appearance overrides by default", () => {
    const body = injectOpenCodeWebUiProxyHtml(html, "opencode", null);

    expect(body).toContain(BRIDGE_NAMESPACE);
    expect(body).toContain(BRIDGE_MESSAGES.proxyLoaded);
    expect(body).toContain(BRIDGE_MESSAGES.viewToggle);
    expect(body).toContain(BRIDGE_MESSAGES.vaultFileOpen);
    expect(body).toContain("vaultFileClickRules");
    expect(body).toContain('data-slot="session-review-trigger-content"');
    expect(body).toContain('data-slot="apply-patch-trigger-content"');
    expect(body).toContain('data-component="edit-trigger"');
    expect(body).toContain('data-component="write-trigger"');
    expect(body).toContain('data-slot="message-part-title-filename"');
    expect(body).toContain('data-slot="apply-patch-filename"');
    expect(body).toContain('data-slot="session-review-filename"');
    expect(body).toContain("composedPath");
    expect(body).toContain("session-review-line");
    expect(body).toContain("tool-file-line");
    expect(body).toContain("basic-tool-path-text");
    expect(body).toContain("absoluteFilesystemRootPattern");
    expect(body).toContain("lineNumberFromPath");
    expect(body).not.toContain("data-another-opencode-for-obsidian-appearance");
    expect(body).not.toContain("data-another-opencode-for-obsidian-theme");
  });

  test("posts a vault file open message for a session review file path", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-slot="session-review-accordion-item" data-file="/0-理论/计算机体系结构/A.md">
        <div id="target" data-slot="session-review-trigger-content">
          <span data-slot="session-review-filename">A.md</span>
        </div>
      </div>
    `);

    click(window, document.getElementById("target")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "0-理论/计算机体系结构/A.md" },
    });
  });

  test("does not post vault navigation for absolute filesystem paths", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-slot="session-review-accordion-item" data-file="/Users/oujinsai/Note/计算机/A.md">
        <div id="target" data-slot="session-review-trigger-content">
          <span data-slot="session-review-filename">A.md</span>
        </div>
      </div>
    `);

    click(window, document.getElementById("target")!);

    expect(messages).toEqual([
      {
        ns: BRIDGE_NAMESPACE,
        version: 1,
        type: BRIDGE_MESSAGES.proxyLoaded,
        payload: undefined,
      },
    ]);
  });

  test("posts a line-aware message from shadow DOM file content", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-slot="session-review-accordion-item" data-file="/0-理论/计算机体系结构/A.md">
        <div id="host" data-component="file"></div>
      </div>
    `);
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <div data-file>
        <div data-line="159"><span id="line">content</span></div>
      </div>
    `;

    click(window, shadow.getElementById("line")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "0-理论/计算机体系结构/A.md", line: 159 },
    });
  });

  test("posts a line-aware message from tool file content", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-scope="apply-patch">
        <div data-slot="accordion-item">
          <div data-slot="apply-patch-trigger-content">
            <span data-slot="apply-patch-directory">/0-理论/计算机体系结构/</span>
            <span data-slot="apply-patch-filename">A.md</span>
          </div>
          <div id="host" data-component="file"></div>
        </div>
      </div>
    `);
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div data-diff><div data-line="161"><span id="line">content</span></div></div>`;

    click(window, shadow.getElementById("line")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "0-理论/计算机体系结构/A.md", line: 161 },
    });
  });

  test("normalizes the logged double slash tool path shape", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-scope="apply-patch">
        <div data-slot="accordion-item">
          <div id="target" data-slot="apply-patch-trigger-content">
            <span data-slot="apply-patch-directory">/0-理论/计算机体系结构/</span>
            <span data-slot="apply-patch-filename">浮点数的编码：精度与范围的位宽争夺.md</span>
          </div>
        </div>
      </div>
    `);

    click(window, document.getElementById("target")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "0-理论/计算机体系结构/浮点数的编码：精度与范围的位宽争夺.md" },
    });
  });

  test("posts the clicked accordion item path from multi-file tool content", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-scope="apply-patch">
        <div data-slot="accordion-item">
          <div data-slot="apply-patch-trigger-content">
            <span data-slot="apply-patch-directory">Folder</span>
            <span data-slot="apply-patch-filename">First.md</span>
          </div>
          <div data-component="file"></div>
        </div>
        <div data-slot="accordion-item">
          <div data-slot="apply-patch-trigger-content">
            <span data-slot="apply-patch-directory">Folder</span>
            <span data-slot="apply-patch-filename">Second.md</span>
          </div>
          <div id="host" data-component="file"></div>
        </div>
      </div>
    `);
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div data-diff><div data-line="42"><span id="line">content</span></div></div>`;

    click(window, shadow.getElementById("line")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "Folder/Second.md", line: 42 },
    });
  });

  test("posts a vault file open message from a basic tool file summary", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-component="tool-trigger">
        <div id="target" data-slot="basic-tool-tool-trigger-content">
          <span data-slot="basic-tool-tool-title">读取</span>
          <span data-slot="basic-tool-tool-subtitle">浮点数的编码：精度与范围的位置竞争.md</span>
          <span data-slot="basic-tool-tool-arg">offset=31</span>
        </div>
      </div>
    `);

    click(window, document.getElementById("target")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "浮点数的编码：精度与范围的位置竞争.md" },
    });
  });

  test("posts a vault file open message from a basic tool subtitle with spaces", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-component="tool-trigger">
        <div data-slot="basic-tool-tool-trigger-content">
          <span data-slot="basic-tool-tool-title">读取</span>
          <span id="target" data-slot="basic-tool-tool-subtitle">Note With Spaces.md</span>
          <span data-slot="basic-tool-tool-arg">offset=31</span>
        </div>
      </div>
    `);

    click(window, document.getElementById("target")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "Note With Spaces.md" },
    });
  });

  test("posts a line-aware message from session turn diff content", () => {
    const { document, messages, window } = runInjectedBridge(`
        <div data-component="session-turn-diffs-content">
          <div data-slot="accordion-item">
            <div data-slot="session-turn-diff-trigger">
              <span data-slot="session-turn-diff-directory">0-理论/计算机体系结构</span>
              <span data-slot="session-turn-diff-filename">向量-SIMD和GPU体系结构中的数据并行.md</span>
            </div>
            <div id="host" data-component="file"></div>
          </div>
        </div>
      `);
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div data-diff><div data-line="739"><span id="line">content</span></div></div>`;

    click(window, shadow.getElementById("line")!);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: { path: "0-理论/计算机体系结构/向量-SIMD和GPU体系结构中的数据并行.md", line: 739 },
    });
  });

  test("posts a vault file open message from a clicked Obsidian wikilink in markdown", () => {
    const { document, messages, window } = runInjectedBridge(`
        <div data-component="markdown">
          <p id="target">方向链接到 [[0-理论/数据库系统/Bottom Up/RDBMS/2-Execution/Query Executor Overview|火山模型]]。</p>
        </div>
      `);
    const text = document.getElementById("target")!.firstChild as Text;
    const offset = text.textContent!.indexOf("火山模型");

    clickTextOffset(window, text, offset);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: {
        path: "[[0-理论/数据库系统/Bottom Up/RDBMS/2-Execution/Query Executor Overview|火山模型]]",
      },
    });
  });

  test("does not post a wikilink message when the clicked offset is outside the link", () => {
    const { document, messages, window } = runInjectedBridge(`
        <div data-component="markdown">
          <p id="target">方向链接到 [[0-理论/数据库系统/Bottom Up/RDBMS/2-Execution/Query Executor Overview|火山模型]]。</p>
        </div>
      `);
    const text = document.getElementById("target")!.firstChild as Text;

    clickTextOffset(window, text, 1);

    expect(messages).toEqual([
      {
        ns: BRIDGE_NAMESPACE,
        version: 1,
        type: BRIDGE_MESSAGES.proxyLoaded,
        payload: undefined,
      },
    ]);
  });

  test("posts a vault file open message from a clicked bare vault path in markdown", () => {
    const { document, messages, window } = runInjectedBridge(`
          <div data-component="markdown">
            <p id="target">• 0-理论/计算机体系结构/向量-SIMD和GPU体系结构中的数据并行.md: primary file being edited</p>
          </div>
        `);
    const text = document.getElementById("target")!.firstChild as Text;
    const offset = text.textContent!.indexOf("向量-SIMD");

    clickTextOffset(window, text, offset);

    expect(lastMessage(messages)).toEqual({
      ns: BRIDGE_NAMESPACE,
      version: 1,
      type: BRIDGE_MESSAGES.vaultFileOpen,
      payload: {
        path: "0-理论/计算机体系结构/向量-SIMD和GPU体系结构中的数据并行.md",
      },
    });
  });

  test("marks a clickable markdown path as a pointer hover without opening it", () => {
    const { document, messages, window } = runInjectedBridge(`
          <div data-component="markdown">
            <p id="target">• 0-理论/计算机体系结构/向量-SIMD和GPU体系结构中的数据并行.md: primary file being edited</p>
          </div>
        `);
    const text = document.getElementById("target")!.firstChild as Text;
    const offset = text.textContent!.indexOf("向量-SIMD");

    pointerMoveTextOffset(window, text, offset);

    expect(document.documentElement.style.cursor).toBe("pointer");
    expect(document.body.style.cursor).toBe("pointer");
    expect(messages).toEqual([
      {
        ns: BRIDGE_NAMESPACE,
        version: 1,
        type: BRIDGE_MESSAGES.proxyLoaded,
        payload: undefined,
      },
    ]);

    document.dispatchEvent(
      new window.MouseEvent("pointerleave", { bubbles: true }) as unknown as Event
    );

    expect(document.documentElement.style.cursor).toBe("");
    expect(document.body.style.cursor).toBe("");
  });

  test("does not post a bare path message when the clicked offset is outside the path token", () => {
    const { document, messages, window } = runInjectedBridge(`
          <div data-component="markdown">
            <p id="target">• 0-理论/计算机体系结构/向量-SIMD和GPU体系结构中的数据并行.md: primary file being edited</p>
          </div>
        `);
    const text = document.getElementById("target")!.firstChild as Text;
    const offset = text.textContent!.indexOf("primary");

    clickTextOffset(window, text, offset);

    expect(messages).toEqual([
      {
        ns: BRIDGE_NAMESPACE,
        version: 1,
        type: BRIDGE_MESSAGES.proxyLoaded,
        payload: undefined,
      },
    ]);
  });

  test("does not create a path from a custom tool trigger without BasicTool subtitle", () => {
    const { document, messages, window } = runInjectedBridge(`
      <div data-component="tool-trigger">
        <div id="target" data-component="edit-trigger">
          <div data-slot="message-part-title-area">
            <div data-slot="message-part-title">
              <span data-slot="message-part-title-text">编辑编辑</span>
              <span>浮点数的编码：精度与范围的位宽争夺.md</span>
            </div>
          </div>
        </div>
      </div>
    `);

    click(window, document.getElementById("target")!);

    expect(messages).toEqual([
      {
        ns: BRIDGE_NAMESPACE,
        version: 1,
        type: BRIDGE_MESSAGES.proxyLoaded,
        payload: undefined,
      },
    ]);
  });

  test("injects into an HTML head tag with attributes", () => {
    const body = injectOpenCodeWebUiProxyHtml(
      '<html><head data-vite-dev-id="app"></head><body>OpenCode</body></html>',
      "opencode",
      null
    );

    expect(body).toContain('<head data-vite-dev-id="app">');
    expect(body.indexOf(BRIDGE_NAMESPACE)).toBeGreaterThan(body.indexOf("<head"));
    expect(body.indexOf(BRIDGE_NAMESPACE)).toBeLessThan(body.indexOf("</head>"));
  });

  test("injects Obsidian appearance tokens with one iframe workspace backdrop", () => {
    const body = injectOpenCodeWebUiProxyHtml(html, "obsidian", {
      colorScheme: "dark",
      variables: {
        "--background-base": "transparent",
        "--another-opencode-for-obsidian-page-background": "rgba(0, 0, 0, 0.25)",
        "--another-opencode-for-obsidian-background-primary": "#000000",
        "--surface-raised-base": "color-mix(in srgb, #222222 64%, transparent)",
        "background-base": "invalid",
        "--empty": "",
      },
    });

    expect(body).toContain("data-another-opencode-for-obsidian-appearance");
    expect(body).toContain("data-another-opencode-for-obsidian-theme");
    expect(body).toContain("data-another-opencode-for-obsidian-bridge");
    expect(body).toContain("body {");
    expect(body).toContain("position: relative;");
    expect(body).toContain("isolation: isolate;");
    expect(body).toContain("--another-opencode-for-obsidian-page-background,");
    expect(body).toContain("var(--another-opencode-for-obsidian-background-primary, transparent)");
    expect(body).toContain("#root {");
    expect(body).toContain("background: transparent !important;");
    expect(body).not.toContain("min-height: 100dvh");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-page-background");
    expect(body).not.toContain("--another-opencode-for-obsidian-pane-background");
    expect(body).not.toContain("--another-opencode-for-obsidian-pane-background-opacity");
    expect(body).toContain("body::before");
    expect(body).not.toContain("body::after");
    expect(body).toContain("position: fixed;");
    expect(body).toContain("left: 0;");
    expect(body).toContain("top: 0;");
    expect(body).toContain("width: 100vw;");
    expect(body).toContain("height: 100vh;");
    expect(body).not.toContain("--another-opencode-for-obsidian-workspace-background-plane");
    expect(body).toContain(
      "background-blend-mode: var(--another-opencode-for-obsidian-workspace-background-blend-mode, overlay)"
    );
    expect(body).toContain(
      "background-repeat: var(--another-opencode-for-obsidian-workspace-background-repeat, no-repeat)"
    );
    expect(body).toContain("--another-opencode-for-obsidian-workspace-background-position");
    expect(body).toContain(
      "background-position: var(--another-opencode-for-obsidian-workspace-background-position, center)"
    );
    expect(body).toContain(
      "background-size: var(--another-opencode-for-obsidian-workspace-background-size, cover)"
    );
    expect(body).toContain(
      "background-image: var(--another-opencode-for-obsidian-workspace-background-image, none)"
    );
    expect(body).toContain(
      "opacity: var(--another-opencode-for-obsidian-workspace-background-opacity, 0)"
    );
    expect(body).toContain(
      "filter: var(--another-opencode-for-obsidian-workspace-background-filter, none);"
    );
    expect(body).not.toContain("--another-opencode-for-obsidian-editor-background-position");
    expect(body).not.toContain("--another-opencode-for-obsidian-editor-background-opacity");
    expect(body).not.toContain("--another-opencode-for-obsidian-editor-background-bluriness");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-background-position");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-background-size");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-backdrop-left");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-backdrop-top");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-backdrop-width");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-backdrop-height");
    expect(body).not.toContain("--another-opencode-for-obsidian-parent-viewport-width");
    expect(body).not.toContain("--another-opencode-for-obsidian-iframe-left");
    expect(body).toContain(
      "appearanceBackground: describePseudoElement(document.body, '::before')"
    );
    expect(body).toContain(
      "appearanceImageBackground: describePseudoElement(document.body, '::after')"
    );
    expect(body).not.toContain('[data-component="dialog-v2"][data-variant="settings"]');
    expect(body).not.toContain("--another-opencode-for-obsidian-modal-surface");
    expect(body).toContain(
      "replaceRootVariables(root, theme.variables, appliedThemeVariableNames)"
    );
    expect(body).toContain("root.style.removeProperty(name)");
    expect(body).toContain("root.style.setProperty(name, variables[name], 'important')");
    expect(body).toContain(
      "appliedAliasVariableNames = replaceOpenCodeV2Aliases(root, appliedAliasVariableNames)"
    );
    expect(body).toContain(BRIDGE_MESSAGES.themeUpdate);
    expect(body).toContain("function replaceTheme(nextTheme, reason)");
    expect(body).toContain("replaceTheme(message.payload, 'parent-theme-update')");
    expect(body).toContain("injectionState: collectInjectionState()");
    expect(body).toContain("sourceBoundary: sourceBoundary()");
    expect(body).toContain("backgroundRepeat: style.backgroundRepeat");
    expect(body).toContain("backgroundBlendMode: style.backgroundBlendMode");
    expect(body).toContain("obsidian-workspace-background-v1");
    expect(body).toContain("activeEditorProjected");
    expect(body).toContain("workspaceBackgroundState");
    expect(body).toContain("paintedBackgroundImage: paintedBackgroundImage || null");
    expect(body).not.toContain("plane:");
    expect(body).toContain("backdropFilterSamples: collectBackdropFilterSamples()");
    expect(body).toContain("appearanceStyleCount");
    expect(body).toContain("observeOpenCodeThemeMutations()");
    expect(body).toContain("observeBodyMutations()");
    expect(body).toContain("body-mutated");
    expect(body).toContain("observedOpenCodeTheme");
    expect(body).toContain('"--background-base":"transparent"');
    expect(body).toContain(
      '"--surface-raised-base":"color-mix(in srgb, #222222 64%, transparent)"'
    );
    expect(body).toContain(
      '"--another-opencode-for-obsidian-page-background":"rgba(0, 0, 0, 0.25)"'
    );
    expect(body).not.toContain('"--another-opencode-for-obsidian-editor-background-image"');
    expect(body).toContain(`type: ${JSON.stringify(BRIDGE_MESSAGES.themeDiagnostics)}`);
    expect(body).toContain("visibleBackgrounds: collectVisibleBackgrounds()");
    expect(body).toContain("largeElementSamples: collectLargeElementSamples()");
    expect(body).not.toContain("opaqueBackgrounds");
    expect(body).not.toContain('background-base":"invalid');
    expect(body).not.toContain('"--empty"');
  });
});
