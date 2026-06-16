import { describe, expect, test } from "bun:test";
import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE } from "../../src/bridge/BridgeProtocol";
import { injectOpenCodeProxyHtml } from "../../src/proxy/ProxyInjection";

const html = "<html><head></head><body>OpenCode</body></html>";

describe("ProxyInjection", () => {
  test("injects the bridge script without appearance overrides by default", () => {
    const body = injectOpenCodeProxyHtml(html, "opencode", null);

    expect(body).toContain(BRIDGE_NAMESPACE);
    expect(body).toContain(BRIDGE_MESSAGES.proxyLoaded);
    expect(body).toContain(BRIDGE_MESSAGES.viewToggle);
    expect(body).not.toContain("data-opencode-obsidian-appearance");
    expect(body).not.toContain("data-opencode-obsidian-theme");
  });

  test("injects into an HTML head tag with attributes", () => {
    const body = injectOpenCodeProxyHtml(
      '<html><head data-vite-dev-id="app"></head><body>OpenCode</body></html>',
      "opencode",
      null
    );

    expect(body).toContain('<head data-vite-dev-id="app">');
    expect(body.indexOf(BRIDGE_NAMESPACE)).toBeGreaterThan(body.indexOf("<head"));
    expect(body.indexOf(BRIDGE_NAMESPACE)).toBeLessThan(body.indexOf("</head>"));
  });

  test("injects Obsidian appearance tokens with one iframe workspace backdrop", () => {
    const body = injectOpenCodeProxyHtml(html, "obsidian", {
      colorScheme: "dark",
      variables: {
        "--background-base": "transparent",
        "--opencode-obsidian-page-background": "rgba(0, 0, 0, 0.25)",
        "--opencode-obsidian-background-primary": "#000000",
        "--surface-raised-base": "color-mix(in srgb, #222222 64%, transparent)",
        "background-base": "invalid",
        "--empty": "",
      },
    });

    expect(body).toContain("data-opencode-obsidian-appearance");
    expect(body).toContain("data-opencode-obsidian-theme");
    expect(body).toContain("data-opencode-obsidian-bridge");
    expect(body).toContain("body {");
    expect(body).toContain("position: relative;");
    expect(body).toContain("isolation: isolate;");
    expect(body).toContain("--opencode-obsidian-page-background,");
    expect(body).toContain("var(--opencode-obsidian-background-primary, transparent)");
    expect(body).toContain("#root {");
    expect(body).toContain("background: transparent !important;");
    expect(body).not.toContain("--opencode-obsidian-iframe-page-background");
    expect(body).not.toContain("--opencode-obsidian-pane-background");
    expect(body).not.toContain("--opencode-obsidian-pane-background-opacity");
    expect(body).toContain("body::before");
    expect(body).not.toContain("body::after");
    expect(body).toContain("position: fixed;");
    expect(body).toContain("left: 0;");
    expect(body).toContain("top: 0;");
    expect(body).toContain("width: 100vw;");
    expect(body).toContain("height: 100vh;");
    expect(body).not.toContain("--opencode-obsidian-workspace-background-plane");
    expect(body).toContain(
      "background-blend-mode: var(--opencode-obsidian-workspace-background-blend-mode, overlay)"
    );
    expect(body).toContain(
      "background-repeat: var(--opencode-obsidian-workspace-background-repeat, no-repeat)"
    );
    expect(body).toContain("--opencode-obsidian-workspace-background-position");
    expect(body).toContain(
      "background-position: var(--opencode-obsidian-workspace-background-position, center)"
    );
    expect(body).toContain(
      "background-size: var(--opencode-obsidian-workspace-background-size, cover)"
    );
    expect(body).toContain(
      "background-image: var(--opencode-obsidian-workspace-background-image, none)"
    );
    expect(body).toContain("opacity: var(--opencode-obsidian-workspace-background-opacity, 0)");
    expect(body).toContain("filter: var(--opencode-obsidian-workspace-background-filter, none);");
    expect(body).not.toContain("--opencode-obsidian-editor-background-position");
    expect(body).not.toContain("--opencode-obsidian-editor-background-opacity");
    expect(body).not.toContain("--opencode-obsidian-editor-background-bluriness");
    expect(body).not.toContain("--opencode-obsidian-iframe-background-position");
    expect(body).not.toContain("--opencode-obsidian-iframe-background-size");
    expect(body).not.toContain("--opencode-obsidian-iframe-backdrop-left");
    expect(body).not.toContain("--opencode-obsidian-iframe-backdrop-top");
    expect(body).not.toContain("--opencode-obsidian-iframe-backdrop-width");
    expect(body).not.toContain("--opencode-obsidian-iframe-backdrop-height");
    expect(body).not.toContain("--opencode-obsidian-parent-viewport-width");
    expect(body).not.toContain("--opencode-obsidian-iframe-left");
    expect(body).toContain(
      "appearanceBackground: describePseudoElement(document.body, '::before')"
    );
    expect(body).toContain(
      "appearanceImageBackground: describePseudoElement(document.body, '::after')"
    );
    expect(body).not.toContain('[data-component="dialog-v2"][data-variant="settings"]');
    expect(body).not.toContain("--opencode-obsidian-modal-surface");
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
    expect(body).toContain('"--opencode-obsidian-page-background":"rgba(0, 0, 0, 0.25)"');
    expect(body).not.toContain('"--opencode-obsidian-editor-background-image"');
    expect(body).toContain(`type: ${JSON.stringify(BRIDGE_MESSAGES.themeDiagnostics)}`);
    expect(body).toContain("visibleBackgrounds: collectVisibleBackgrounds()");
    expect(body).toContain("largeElementSamples: collectLargeElementSamples()");
    expect(body).not.toContain("opaqueBackgrounds");
    expect(body).not.toContain('background-base":"invalid');
    expect(body).not.toContain('"--empty"');
  });
});
