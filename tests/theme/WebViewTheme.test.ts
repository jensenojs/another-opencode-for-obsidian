import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  captureObsidianWebViewTheme,
  createOpenCodeWebViewTheme,
  findObsidianWebViewThemeSource,
} from "../../src/theme/WebViewTheme";

describe("createOpenCodeWebViewTheme", () => {
  test("maps Obsidian theme variables onto OpenCode design tokens", () => {
    const theme = createOpenCodeWebViewTheme({
      colorScheme: "dark",
      pageBackground: "rgba(0, 0, 0, 0.25)",
      backgroundPrimary: "#000000",
      backgroundPrimaryAlt: "rgb(38, 38, 39)",
      backgroundSecondary: "rgb(29, 32, 33)",
      backgroundModifierBorder: "rgb(60, 56, 54)",
      backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
      textNormal: "#f1f1f1",
      textMuted: "rgb(213, 196, 161)",
      textFaint: "rgb(146, 131, 116)",
      interactiveAccent: "hsl(41, 88%, 66%)",
      success: "rgb(84, 182, 122)",
      warning: "rgb(215, 166, 66)",
      danger: "rgb(219, 92, 92)",
      info: "rgb(95, 163, 231)",
      fontInterface: '"Monaco Nerd Font Mono", ui-sans-serif',
      editorBackgroundImage: 'url("https://example.test/bg.jpg")',
      editorBackgroundOpacity: "0.3",
      editorBackgroundBluriness: "blur(5px)",
      editorBackgroundPosition: "center",
    });

    expect(theme.colorScheme).toBe("dark");
    expect(theme.variables["--another-opencode-for-obsidian-page-background"]).toBe(
      "rgba(0, 0, 0, 0.25)"
    );
    expect(theme.variables["--another-opencode-for-obsidian-background-primary"]).toBe("#000000");
    expect(theme.variables["--another-opencode-for-obsidian-background-primary-alt"]).toBe(
      "rgb(38, 38, 39)"
    );
    expect(theme.variables["--another-opencode-for-obsidian-pane-background"]).toBeUndefined();
    expect(theme.variables["--another-opencode-for-obsidian-page-background"]).not.toBe(
      theme.variables["--another-opencode-for-obsidian-background-primary"]
    );
    expect(
      theme.variables["--another-opencode-for-obsidian-editor-background-image"]
    ).toBeUndefined();
    expect(
      theme.variables["--another-opencode-for-obsidian-editor-background-opacity"]
    ).toBeUndefined();
    expect(
      theme.variables["--another-opencode-for-obsidian-editor-background-position"]
    ).toBeUndefined();
    expect(
      theme.variables["--another-opencode-for-obsidian-editor-background-bluriness"]
    ).toBeUndefined();
    expect(theme.variables["--obsidian-editor-background-image"]).toBe(
      'url("https://example.test/bg.jpg")'
    );
    expect(theme.variables["--obsidian-editor-background-opacity"]).toBe("0.3");
    expect(theme.variables["--obsidian-editor-background-bluriness"]).toBe("blur(5px)");
    expect(theme.variables["--obsidian-editor-background-position"]).toBe("center");
    expect(theme.variables["--another-opencode-for-obsidian-modal-surface"]).toBeUndefined();
    expect(theme.variables["--background-base"]).toBe("var(--v2-background-bg-base)");
    expect(theme.variables["--background-strong"]).toBe("transparent");
    expect(theme.variables["--background-weak"]).toBe("var(--v2-background-bg-layer-01)");
    expect(theme.variables["--background-stronger"]).toBe("transparent");
    expect(theme.variables["--surface-raised-base"]).toBe("var(--v2-background-bg-layer-02)");
    expect(theme.variables["--surface-float-base"]).toBe("var(--v2-background-bg-layer-03)");
    expect(theme.variables["--input-base"]).toBe("var(--v2-background-bg-layer-01)");
    expect(theme.variables["--text-strong"]).toBe("var(--v2-text-text-base)");
    expect(theme.variables["--border-weak-base"]).toBe("var(--v2-border-border-muted)");
    expect(theme.variables["--text-interactive-base"]).toBe("var(--v2-text-text-accent)");
    expect(theme.variables["--text-link-base"]).toBe("var(--v2-text-text-accent)");
    expect(theme.variables["--text-base"]).toBe("var(--v2-text-text-base)");
    expect(theme.variables["--v2-text-text-muted"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-text-muted) 68%, var(--another-opencode-for-obsidian-text-normal))"
    );
    expect(theme.variables["--v2-text-text-faint"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-text-faint) 62%, var(--another-opencode-for-obsidian-text-normal))"
    );
    expect(theme.variables["--v2-border-border-base"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-border) 64%, transparent)"
    );
    expect(theme.variables["--v2-text-text-accent"]).toBe(
      "color-mix(in srgb, #d79921 72%, var(--another-opencode-for-obsidian-text-normal))"
    );
    expect(theme.variables["--v2-background-bg-accent"]).toBe(
      "color-mix(in srgb, #d79921 36%, var(--another-opencode-for-obsidian-background-secondary))"
    );
    expect(theme.variables["--v2-border-border-focus"]).toBe(
      "color-mix(in srgb, #d79921 52%, var(--another-opencode-for-obsidian-border))"
    );
    expect(theme.variables["--syntax-string"]).toBe(
      "color-mix(in srgb, #98971a 42%, var(--another-opencode-for-obsidian-text-normal))"
    );
    expect(theme.variables["--syntax-keyword"]).toBe(
      "color-mix(in srgb, #d79921 56%, var(--another-opencode-for-obsidian-text-normal))"
    );
    expect(theme.variables["--markdown-code"]).toBe("var(--v2-text-text-muted)");
    expect(theme.variables["--markdown-link"]).toBe("var(--v2-text-text-accent)");
    expect(theme.variables["--v2-background-bg-base"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 28%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-deep"]).toBe("transparent");
    expect(theme.variables["--v2-background-bg-layer-01"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 36%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-layer-03"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 58%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-layer-04"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 68%, transparent)"
    );
    expect(theme.variables["--v2-overlay-simple-overlay-scrim"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-primary) 70%, transparent)"
    );
    expect(theme.variables["--background-bg-base"]).toBe("var(--v2-background-bg-base)");
    expect(theme.variables["--background-bg-layer-01"]).toBe("var(--v2-background-bg-layer-01)");
    expect(theme.variables["--text-text-base"]).toBe("var(--v2-text-text-base)");
    expect(theme.variables["--border-border-base"]).toBe("var(--v2-border-border-base)");
    expect(theme.variables["--v2-elevation-button-neutral"]).toContain(
      "var(--another-opencode-for-obsidian-background-primary)"
    );
    expect(theme.variables["--elevation-button-neutral"]).toBe(
      "var(--v2-elevation-button-neutral)"
    );
    expect(theme.variables["--v2-state-bg-success"]).toContain("#689d6a");
    expect(theme.variables["--state-bg-success"]).toBe("var(--v2-state-bg-success)");
    expect(theme.variables["--surface-success-base"]).toBe("var(--v2-state-bg-success)");
    expect(theme.variables["--border-critical-base"]).toBe("var(--v2-state-border-danger)");
    expect(theme.variables["--icon-info-base"]).toBe("var(--v2-state-fg-info)");
    expect(theme.variables["--alpha-light-6"]).toBe("var(--v2-alpha-light-6)");
    expect(theme.variables["--font-family-sans"]).toBe("var(--v2-font-family-sans)");
    expect(theme.variables["--v2-font-family-sans"]).toBe('"Monaco Nerd Font Mono", ui-sans-serif');

    const legacyEntries = Object.entries(theme.variables).filter(
      ([name]) =>
        !name.startsWith("--v2-") &&
        !name.startsWith("--another-opencode-for-obsidian-") &&
        !name.startsWith("--obsidian-editor-background-") &&
        !name.startsWith("--obsidian-workspace-background-") &&
        !name.startsWith("--font-")
    );
    expect(
      legacyEntries.filter(
        ([, value]) =>
          value !== "transparent" &&
          !value.startsWith("var(--v2-") &&
          !value.startsWith("color-mix(")
      )
    ).toEqual([]);
  });

  test("uses denser material tokens when workspace background is enabled", () => {
    const theme = createOpenCodeWebViewTheme({
      colorScheme: "dark",
      pageBackground: "rgba(0, 0, 0, 0.25)",
      backgroundPrimary: "#000000",
      backgroundPrimaryAlt: "rgb(38, 38, 39)",
      backgroundSecondary: "rgb(29, 32, 33)",
      backgroundModifierBorder: "rgb(60, 56, 54)",
      backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
      textNormal: "#f1f1f1",
      textMuted: "rgb(213, 196, 161)",
      textFaint: "rgb(146, 131, 116)",
      interactiveAccent: "hsl(41, 88%, 66%)",
      success: "rgb(84, 182, 122)",
      warning: "rgb(215, 166, 66)",
      danger: "rgb(219, 92, 92)",
      info: "rgb(95, 163, 231)",
      fontInterface: '"Monaco Nerd Font Mono", ui-sans-serif',
      editorBackgroundImage: "none",
      editorBackgroundOpacity: "0",
      editorBackgroundBluriness: "none",
      editorBackgroundPosition: "center",
      workspaceBackgroundContract: "v1",
      workspaceBackgroundImage: 'url("https://example.test/bg.jpg")',
      workspaceBackgroundOpacity: "0.35",
      workspaceBackgroundFilter: "none",
      workspaceBackgroundPosition: "center",
      workspaceBackgroundSize: "cover",
      workspaceBackgroundRepeat: "no-repeat",
      workspaceBackgroundBlendMode: "overlay",
      workspaceBackgroundSurface: "transparent",
      workspaceBackgroundChrome: "transparent",
      workspaceBackgroundBorder: "transparent",
    });

    expect(theme.variables["--another-opencode-for-obsidian-workspace-background-state"]).toBe(
      "enabled"
    );
    expect(theme.variables["--another-opencode-for-obsidian-workspace-background-filter"]).toBe(
      "blur(5px)"
    );
    expect(theme.variables["--v2-background-bg-base"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 40%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-layer-01"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 50%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-layer-02"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 60%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-layer-04"]).toBe(
      "color-mix(in srgb, var(--another-opencode-for-obsidian-background-secondary) 80%, transparent)"
    );
    expect(theme.variables["--v2-background-bg-deep"]).toBe("transparent");
    expect(theme.variables["--background-stronger"]).toBe("transparent");
  });

  test("normalizes Background plugin named blur values before injecting CSS", () => {
    const theme = createOpenCodeWebViewTheme({
      colorScheme: "dark",
      pageBackground: "rgba(0, 0, 0, 0.25)",
      backgroundPrimary: "#000000",
      backgroundPrimaryAlt: "rgb(38, 38, 39)",
      backgroundSecondary: "rgb(29, 32, 33)",
      backgroundModifierBorder: "rgb(60, 56, 54)",
      backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
      textNormal: "#f1f1f1",
      textMuted: "rgb(213, 196, 161)",
      textFaint: "rgb(146, 131, 116)",
      interactiveAccent: "hsl(41, 88%, 66%)",
      success: "rgb(84, 182, 122)",
      warning: "rgb(215, 166, 66)",
      danger: "rgb(219, 92, 92)",
      info: "rgb(95, 163, 231)",
      fontInterface: '"Monaco Nerd Font Mono", ui-sans-serif',
      editorBackgroundImage: "none",
      editorBackgroundOpacity: "0",
      editorBackgroundBluriness: "none",
      editorBackgroundPosition: "center",
      workspaceBackgroundContract: "v1",
      workspaceBackgroundImage: 'url("https://example.test/bg.jpg")',
      workspaceBackgroundOpacity: "0.35",
      workspaceBackgroundFilter: "blur(low)",
      workspaceBackgroundPosition: "center",
      workspaceBackgroundSize: "cover",
      workspaceBackgroundRepeat: "no-repeat",
      workspaceBackgroundBlendMode: "overlay",
      workspaceBackgroundSurface: "transparent",
      workspaceBackgroundChrome: "transparent",
      workspaceBackgroundBorder: "transparent",
    });

    expect(theme.variables["--obsidian-workspace-background-filter"]).toBe("blur(low)");
    expect(theme.variables["--another-opencode-for-obsidian-workspace-background-filter"]).toBe(
      "blur(5px)"
    );
  });
});

describe("captureObsidianWebViewTheme", () => {
  test("uses the Obsidian chrome background for translucent themes", async () => {
    const window = new Window({
      settings: {
        enableJavaScriptEvaluation: false,
      },
    });
    const previousGetComputedStyle = globalThis.getComputedStyle;
    const previousHTMLElement = globalThis.HTMLElement;

    try {
      globalThis.getComputedStyle = window.getComputedStyle.bind(window) as typeof getComputedStyle;
      globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
      window.document.body.className = "theme-dark is-translucent";
      window.document.body.innerHTML = '<div class="app-container"></div>';
      window.document.body.style.setProperty("--background-primary", "#000");
      window.document.body.style.setProperty("--background-primary-alt", "rgb(38, 38, 39)");
      window.document.body.style.setProperty("--background-secondary", "rgb(29, 32, 33)");
      window.document.body.style.setProperty("--background-modifier-border", "rgb(60, 56, 54)");
      window.document.body.style.setProperty(
        "--background-modifier-hover",
        "rgba(255, 255, 255, 0.08)"
      );
      window.document.body.style.setProperty("--text-normal", "#f1f1f1");
      window.document.body.style.setProperty("--text-muted", "rgb(213, 196, 161)");
      window.document.body.style.setProperty("--text-faint", "rgb(146, 131, 116)");
      window.document.body.style.setProperty("--interactive-accent", "hsl(41, 88%, 66%)");
      window.document.body.style.setProperty("--color-green", "rgb(84, 182, 122)");
      window.document.body.style.setProperty("--color-yellow", "rgb(215, 166, 66)");
      window.document.body.style.setProperty("--color-red", "rgb(219, 92, 92)");
      window.document.body.style.setProperty("--color-blue", "rgb(95, 163, 231)");
      window.document.body.style.setProperty(
        "--font-interface",
        '"Monaco Nerd Font Mono", ui-sans-serif'
      );
      const appContainer = window.document.querySelector(
        ".app-container"
      ) as unknown as HTMLElement;
      appContainer.style.backgroundColor = "rgba(0, 0, 0, 0.25)";

      const theme = captureObsidianWebViewTheme(window.document.body as unknown as HTMLElement);

      expect(theme.variables["--another-opencode-for-obsidian-page-background"]).toBe(
        "rgb(29, 32, 33)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-primary"]).toBe("#000");
      expect(theme.variables["--another-opencode-for-obsidian-background-primary-alt"]).toBe(
        "rgb(38, 38, 39)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-pane-background"]).toBeUndefined();
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-image"]
      ).toBeUndefined();
      expect(theme.variables["--obsidian-editor-background-image"]).toBe("none");
      expect(theme.variables["--obsidian-editor-background-opacity"]).toBe("0");
      expect(theme.variables["--another-opencode-for-obsidian-success"]).toBe("rgb(84, 182, 122)");
      expect(theme.variables["--another-opencode-for-obsidian-info"]).toBe("rgb(95, 163, 231)");
    } finally {
      globalThis.getComputedStyle = previousGetComputedStyle;
      globalThis.HTMLElement = previousHTMLElement;
      await window.happyDOM.close();
    }
  });

  test("uses the Markdown view as the theme source when it is present", async () => {
    const window = new Window({
      settings: {
        enableJavaScriptEvaluation: false,
      },
    });
    const previousGetComputedStyle = globalThis.getComputedStyle;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousDocument = globalThis.document;

    try {
      globalThis.getComputedStyle = window.getComputedStyle.bind(window) as typeof getComputedStyle;
      globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
      globalThis.document = window.document as unknown as Document;
      window.document.body.className = "theme-dark is-translucent";
      window.document.body.innerHTML = `
        <div class="app-container"></div>
        <div class="workspace-leaf mod-active">
          <div class="markdown-source-view"></div>
        </div>
        <div class="opencode-appearance-obsidian"></div>
      `;
      window.document.body.style.setProperty("--background-primary", "#000");
      window.document.body.style.setProperty("--background-primary-alt", "rgb(36, 35, 34)");
      window.document.body.style.setProperty("--background-secondary", "rgb(29, 32, 33)");
      window.document.body.style.setProperty("--background-modifier-border", "rgb(60, 56, 54)");
      window.document.body.style.setProperty("--text-normal", "#f1f1f1");

      const appContainer = window.document.querySelector(
        ".app-container"
      ) as unknown as HTMLElement;
      appContainer.style.backgroundColor = "rgba(0, 0, 0, 0.25)";

      const view = findObsidianWebViewThemeSource();
      view.style.setProperty("--background-primary", "rgb(40, 40, 40)");
      view.style.setProperty("--background-primary-alt", "rgb(48, 46, 44)");
      view.style.setProperty("--background-secondary", "rgb(50, 48, 47)");
      view.style.setProperty("--background-modifier-border", "rgb(80, 73, 69)");
      view.style.setProperty("--text-normal", "rgb(235, 219, 178)");
      view.style.setProperty(
        "--obsidian-editor-background-image",
        "url('https://example.test/bg.jpg')"
      );
      view.style.setProperty("--obsidian-editor-background-opacity", "0.3");
      view.style.setProperty("--obsidian-editor-background-position", "center");

      const theme = captureObsidianWebViewTheme(view);

      expect(view.classList.contains("markdown-source-view")).toBe(true);
      expect(theme.colorScheme).toBe("dark");
      expect(theme.variables["--another-opencode-for-obsidian-page-background"]).toBe(
        "rgb(29, 32, 33)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-primary"]).toBe(
        "rgb(40, 40, 40)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-primary-alt"]).toBe(
        "rgb(48, 46, 44)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-secondary"]).toBe(
        "rgb(50, 48, 47)"
      );
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-image"]
      ).toBeUndefined();
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-opacity"]
      ).toBeUndefined();
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-position"]
      ).toBeUndefined();
      expect(theme.variables["--obsidian-editor-background-image"]).toBe(
        "url('https://example.test/bg.jpg')"
      );
      expect(theme.variables["--obsidian-editor-background-opacity"]).toBe("0.3");
      expect(theme.variables["--obsidian-editor-background-position"]).toBe("center");
    } finally {
      globalThis.getComputedStyle = previousGetComputedStyle;
      globalThis.HTMLElement = previousHTMLElement;
      globalThis.document = previousDocument;
      await window.happyDOM.close();
    }
  });

  test("uses the OpenCode pane chrome for the page background", async () => {
    const window = new Window({
      settings: {
        enableJavaScriptEvaluation: false,
      },
    });
    const previousGetComputedStyle = globalThis.getComputedStyle;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousDocument = globalThis.document;

    try {
      globalThis.getComputedStyle = window.getComputedStyle.bind(window) as typeof getComputedStyle;
      globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
      globalThis.document = window.document as unknown as Document;
      window.document.body.className = "theme-dark is-translucent";
      window.document.body.innerHTML = `
          <div class="workspace-split mod-root">
            <div class="workspace-leaf mod-active">
              <div class="markdown-source-view"></div>
            </div>
          </div>
          <div class="workspace-split mod-horizontal mod-sidedock mod-right-split">
            <div class="workspace-tabs mod-top">
              <div class="workspace-tab-container">
                <div class="workspace-leaf">
                  <div class="workspace-leaf-content" data-type="opencode-view">
                    <div class="view-content opencode-container opencode-appearance-obsidian"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      window.document.body.style.setProperty("--background-primary", "rgb(30, 30, 46)");
      window.document.body.style.setProperty("--background-primary-alt", "rgb(24, 24, 37)");
      window.document.body.style.setProperty("--background-secondary", "rgb(24, 24, 37)");
      window.document.body.style.setProperty("--text-normal", "rgb(205, 214, 244)");

      const view = findObsidianWebViewThemeSource();
      view.style.setProperty("--background-primary", "rgb(46, 38, 31)");
      view.style.setProperty("--background-primary-alt", "rgb(42, 36, 30)");
      view.style.setProperty("--background-secondary", "rgb(38, 33, 28)");
      view.style.setProperty("--text-normal", "rgb(235, 219, 178)");

      const pane = window.document.querySelector(
        ".opencode-appearance-obsidian"
      ) as unknown as HTMLElement;
      const paneContainer = window.document.querySelector(
        ".mod-right-split .workspace-tab-container"
      ) as unknown as HTMLElement;
      paneContainer.style.backgroundColor = "rgb(38, 33, 28)";

      const theme = captureObsidianWebViewTheme(view, { paneSource: pane });

      expect(theme.variables["--another-opencode-for-obsidian-page-background"]).toBe(
        "rgb(38, 33, 28)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-primary"]).toBe(
        "rgb(46, 38, 31)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-secondary"]).toBe(
        "rgb(38, 33, 28)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-text-normal"]).toBe(
        "rgb(235, 219, 178)"
      );
    } finally {
      globalThis.getComputedStyle = previousGetComputedStyle;
      globalThis.HTMLElement = previousHTMLElement;
      globalThis.document = previousDocument;
      await window.happyDOM.close();
    }
  });

  test("copies Background plugin variables only on their original Obsidian names", async () => {
    const window = new Window({
      settings: {
        enableJavaScriptEvaluation: false,
      },
    });
    const previousGetComputedStyle = globalThis.getComputedStyle;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousDocument = globalThis.document;

    try {
      globalThis.getComputedStyle = window.getComputedStyle.bind(window) as typeof getComputedStyle;
      globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
      globalThis.document = window.document as unknown as Document;
      window.document.body.className = "theme-dark is-translucent";
      window.document.body.innerHTML = `
        <div class="workspace-leaf mod-active">
          <div class="markdown-source-view"></div>
        </div>
        <div class="opencode-appearance-obsidian"></div>
      `;
      window.document.body.style.setProperty("--background-primary", "#000");
      window.document.body.style.setProperty("--background-primary-alt", "rgb(36, 35, 34)");
      window.document.body.style.setProperty("--background-secondary", "rgb(29, 32, 33)");
      window.document.body.style.setProperty("--background-modifier-border", "rgb(60, 56, 54)");
      window.document.body.style.setProperty("--text-normal", "#f1f1f1");

      const view = findObsidianWebViewThemeSource();
      view.style.setProperty("--background-primary", "rgb(40, 40, 40)");
      view.style.setProperty("--background-primary-alt", "rgb(48, 46, 44)");
      view.style.setProperty("--background-secondary", "rgb(50, 48, 47)");
      view.style.setProperty("--background-modifier-border", "rgb(80, 73, 69)");
      view.style.setProperty("--text-normal", "rgb(235, 219, 178)");
      const rawMarkdownView = window.document.querySelector(
        ".markdown-source-view"
      ) as unknown as HTMLElement;
      rawMarkdownView.style.setProperty(
        "--obsidian-editor-background-image",
        "url('https://example.test/editor-bg.jpg')"
      );
      rawMarkdownView.style.setProperty("--obsidian-editor-background-opacity", "0.35");
      rawMarkdownView.style.setProperty("--obsidian-editor-background-position", "top");
      const theme = captureObsidianWebViewTheme(view);

      expect(view.classList.contains("markdown-source-view")).toBe(true);
      expect(theme.variables["--another-opencode-for-obsidian-background-primary"]).toBe(
        "rgb(40, 40, 40)"
      );
      expect(theme.variables["--another-opencode-for-obsidian-background-primary-alt"]).toBe(
        "rgb(48, 46, 44)"
      );
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-image"]
      ).toBeUndefined();
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-opacity"]
      ).toBeUndefined();
      expect(
        theme.variables["--another-opencode-for-obsidian-editor-background-position"]
      ).toBeUndefined();
      expect(theme.variables["--obsidian-editor-background-image"]).toBe(
        "url('https://example.test/editor-bg.jpg')"
      );
      expect(theme.variables["--obsidian-editor-background-opacity"]).toBe("0.35");
      expect(theme.variables["--obsidian-editor-background-position"]).toBe("top");
    } finally {
      globalThis.getComputedStyle = previousGetComputedStyle;
      globalThis.HTMLElement = previousHTMLElement;
      globalThis.document = previousDocument;
      await window.happyDOM.close();
    }
  });
});
