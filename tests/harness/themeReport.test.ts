import { describe, expect, test } from "bun:test";
import {
  buildThemeReport,
  extractInjectedTheme,
  proxyDisablesBackdropFilterSamplingCheck,
  proxyDocumentBackgroundLayerCheck,
  summarizeThemeReport,
} from "../../scripts/harness/themeReport";

const baseThemeVariables = {
  "--another-opencode-for-obsidian-page-background": "rgba(0, 0, 0, 0.25)",
  "--another-opencode-for-obsidian-background-primary": "#000000",
  "--obsidian-editor-background-image": 'url("https://example.test/bg.jpg")',
  "--obsidian-editor-background-opacity": "0.3",
  "--obsidian-editor-background-bluriness": "blur(5px)",
  "--obsidian-editor-background-position": "center",
  "--background-base": "color-mix(in srgb, rgb(29, 32, 33) 28%, transparent)",
  "--background-weak": "color-mix(in srgb, rgb(29, 32, 33) 36%, transparent)",
  "--background-strong": "transparent",
  "--background-stronger": "transparent",
  "--v2-background-bg-base": "color-mix(in srgb, rgb(29, 32, 33) 28%, transparent)",
  "--v2-background-bg-deep": "transparent",
  "--background-bg-base": "color-mix(in srgb, rgb(29, 32, 33) 28%, transparent)",
  "--obsidian-workspace-background-image": 'url("https://example.test/bg.jpg")',
  "--obsidian-workspace-background-opacity": "0.3",
  "--obsidian-workspace-background-position": "center",
  "--obsidian-workspace-background-size": "cover",
  "--obsidian-workspace-background-repeat": "no-repeat",
  "--obsidian-workspace-background-blend-mode": "overlay",
  "--another-opencode-for-obsidian-workspace-background-state": "enabled",
  "--another-opencode-for-obsidian-workspace-background-image":
    'url("https://example.test/bg.jpg")',
  "--another-opencode-for-obsidian-workspace-background-opacity": "0.3",
  "--another-opencode-for-obsidian-workspace-background-position": "center",
  "--another-opencode-for-obsidian-workspace-background-size": "cover",
  "--another-opencode-for-obsidian-workspace-background-repeat": "no-repeat",
  "--another-opencode-for-obsidian-workspace-background-blend-mode": "overlay",
};

const stableDocumentRoots = [
  {
    tag: "html",
    id: null,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    backgroundImage: "none",
  },
  {
    tag: "body",
    id: null,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    backgroundImage: "none",
  },
  {
    tag: "div",
    id: "root",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
  },
];

function transparentDocumentRoots() {
  return stableDocumentRoots.map((root) => ({
    ...root,
    backgroundColor: "rgba(0, 0, 0, 0)",
  }));
}

const inactivePseudo = {
  content: "none",
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  opacity: "0",
};

const iframeImageBackdrop = {
  content: '""',
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: 'url("https://example.test/bg.jpg")',
  opacity: "0.3",
  backgroundPosition: "50% 50%",
  backgroundSize: "cover",
  backgroundRepeat: "no-repeat",
  backgroundBlendMode: "normal",
  left: "0px",
  top: "0px",
  width: "528px",
  height: "747px",
};

function buildRuntimeReport(runtimeDiagnostics: unknown) {
  return buildThemeReport({
    vault: "/vault",
    source: "runtime",
    pluginDir: (vault) => `${vault}/.obsidian/plugins/another-opencode-for-obsidian`,
    formatPath: (path) => path,
    readJson: (path) => {
      if (path.endsWith("status.json")) {
        return {
          proxyUrl: "http://127.0.0.1:9/",
          serverState: "running",
          runtimeDiagnostics,
        };
      }
      if (path.endsWith("data.json")) {
        return {
          webViewAppearance: "obsidian",
        };
      }
      return null;
    },
  });
}

function themeDiagnostics(overrides: Record<string, unknown> = {}) {
  const variables =
    overrides.variables && typeof overrides.variables === "object"
      ? { ...baseThemeVariables, ...(overrides.variables as Record<string, string>) }
      : baseThemeVariables;
  const rest = { ...overrides };
  delete rest.variables;

  return {
    viewport: {
      width: 528,
      height: 747,
    },
    variables,
    sourceBoundary: {
      contract: "obsidian-workspace-background-v1",
      workspaceBackgroundContract: "v1",
      workspaceBackgroundState: "enabled",
      activeEditorProjected: false,
      paintedBackgroundImage: 'url("https://example.test/bg.jpg")',
    },
    appearanceBackground: iframeImageBackdrop,
    appearanceImageBackground: inactivePseudo,
    roots: stableDocumentRoots,
    injectionState: {
      bridgeScriptCount: 1,
      appearanceStyleCount: 1,
      themeScriptCount: 1,
      themeApplyCount: 2,
      parentThemeUpdateCount: 1,
      openCodeThemeMutationCount: 0,
      bodyElementMutationCount: 0,
      bodyMutationDiagnosticCount: 0,
    },
    visibleBackgrounds: [],
    largeElementSamples: [],
    backdropFilterSamples: [],
    ...rest,
  };
}

function iframeDiagnostics(overrides: Record<string, unknown> = {}) {
  return {
    appearance: "obsidian",
    iframe: {
      area: 100,
      width: 528,
      height: 747,
      allowTransparency: null,
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "none",
    },
    appearanceRoot: {
      backgroundColor: "rgba(0, 0, 0, 0)",
    },
    editorBackgroundVariables: {
      "--obsidian-editor-background-image": 'url("https://example.test/bg.jpg")',
      "--obsidian-editor-background-opacity": "0.3",
      "--obsidian-editor-background-bluriness": "blur(5px)",
      "--obsidian-editor-background-position": "50% 50%",
    },
    appearanceBackground: inactivePseudo,
    appearanceImageBackground: inactivePseudo,
    externalEditorBackgroundLayers: [
      {
        selector: ".workspace-leaf.mod-active .markdown-source-view .cm-editor",
        element: {
          tag: "div",
          id: null,
          className: "cm-editor",
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "none",
          area: 120000,
        },
        variables: {
          "--obsidian-editor-background-image": 'url("https://example.test/bg.jpg")',
          "--obsidian-editor-background-opacity": "0.3",
        },
        before: {
          content: '""',
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: 'url("https://example.test/bg.jpg")',
          opacity: "0.3",
          position: "absolute",
          zIndex: "auto",
        },
        after: inactivePseudo,
      },
    ],
    externalEditorBackgroundRules: [
      {
        href: null,
        owner: "style",
        text: ".markdown-reading-view::before, .cm-editor::before { background-image: var(--obsidian-editor-background-image); }",
      },
    ],
    workspaceFocus: {
      documentHasFocus: true,
      activeLeafViewType: "opencode-view",
      openCodeLeafIsActive: true,
      iframeIsDocumentActiveElement: true,
      focusedIframeWithoutActiveOpenCodeLeaf: false,
      activeElement: {
        tag: "iframe",
        className: "opencode-iframe",
        backgroundColor: "rgba(0, 0, 0, 0)",
        backgroundImage: "none",
        area: 120000,
      },
      activeLeafView: {
        tag: "div",
        className: "workspace-leaf-content",
        dataType: "opencode-view",
        backgroundColor: "rgba(0, 0, 0, 0)",
        backgroundImage: "none",
        area: 120000,
      },
      openCodeLeafView: {
        tag: "div",
        className: "workspace-leaf-content",
        dataType: "opencode-view",
        backgroundColor: "rgba(0, 0, 0, 0)",
        backgroundImage: "none",
        area: 120000,
      },
    },
    themeSyncHistory: [
      {
        sequence: 1,
        timestamp: 1781245035063,
        reason: "iframe-created",
        phase: "scheduled",
        clearedTimerCount: 0,
      },
      {
        sequence: 2,
        timestamp: 1781245035064,
        reason: "iframe-created",
        phase: "posted",
        changed: true,
        fingerprint: "a1b2c3d4",
        iframe: {
          left: 400,
          top: 24,
          width: 528,
          height: 747,
        },
      },
      {
        sequence: 3,
        timestamp: 1781245035300,
        reason: "obsidian-theme-source-mutated",
        phase: "skipped",
        cause: "theme-unchanged",
        fingerprint: "a1b2c3d4",
        iframe: {
          left: 400,
          top: 24,
          width: 528,
          height: 747,
        },
      },
    ],
    ancestors: [],
    ...overrides,
  };
}

function runtimeDiagnostics(themeOverrides = {}, iframeOverrides = {}) {
  return {
    theme: themeDiagnostics(themeOverrides),
    iframe: iframeDiagnostics(iframeOverrides),
  };
}

function findCheck(report: Awaited<ReturnType<typeof buildThemeReport>>, name: string) {
  return report.checks.find((check) => check.name.includes(name));
}

describe("proxyDocumentBackgroundLayerCheck", () => {
  test("passes current proxy HTML shape for the iframe workspace surface", () => {
    const check = proxyDocumentBackgroundLayerCheck(`
          <style data-another-opencode-for-obsidian-appearance>
            html,
            body {
              background: var(
                --another-opencode-for-obsidian-page-background,
                var(--another-opencode-for-obsidian-background-primary, transparent)
              ) !important;
            }
          #root {
            background: transparent !important;
          }
            body::before {
              content: "";
              position: fixed;
              left: 0;
              top: 0;
              width: 100vw;
              height: 100vh;
              background-repeat: var(--another-opencode-for-obsidian-workspace-background-repeat, no-repeat);
              background-position: var(--another-opencode-for-obsidian-workspace-background-position, center);
              background-size: var(--another-opencode-for-obsidian-workspace-background-size, cover);
              background-image: var(--another-opencode-for-obsidian-workspace-background-image, none);
              opacity: var(--another-opencode-for-obsidian-workspace-background-opacity, 0);
              filter: var(--another-opencode-for-obsidian-workspace-background-filter, none);
            }
            </style>
          <script>
              sourceBoundary:
                obsidian-workspace-background-v1
            injectionState: collectInjectionState()
            appearanceBackground: describePseudoElement(document.body, '::before')
            appearanceImageBackground: describePseudoElement(document.body, '::after')
        </script>
    `);

    expect(check.ok).toBe(true);
    expect(check.detail).toEqual({
      missingSnippets: [],
      presentForbiddenSnippets: [],
    });
  });

  test("flags proxy HTML that paints extra iframe document backdrops", () => {
    const check = proxyDocumentBackgroundLayerCheck(`
      <style data-another-opencode-for-obsidian-appearance>
        html,
        body,
        #root {
          background: transparent !important;
        }
          body {
            background: var(--another-opencode-for-obsidian-iframe-page-background, transparent) !important;
          }
          body::before {
            left: var(--another-opencode-for-obsidian-iframe-backdrop-left, 0px);
          background-image: var(--another-opencode-for-obsidian-editor-background-image, none);
        }
          body::after {
            background-color: var(--background-primary);
          }
        </style>
      <script data-another-opencode-for-obsidian-theme>
        var theme = {"colorScheme":"dark","variables":{"--another-opencode-for-obsidian-editor-background-image":"none"}};
        appearanceBackground: describePseudoElement(document.body, '::before')
      </script>
    `);

    expect(check.ok).toBe(false);
    expect(check.detail).toEqual({
      missingSnippets: [
        "--another-opencode-for-obsidian-page-background",
        "var(--another-opencode-for-obsidian-background-primary, transparent)",
        "left: 0;",
        "top: 0;",
        "width: 100vw;",
        "height: 100vh;",
        "background-repeat: var(--another-opencode-for-obsidian-workspace-background-repeat, no-repeat)",
        "--another-opencode-for-obsidian-workspace-background-position",
        "background-position: var(--another-opencode-for-obsidian-workspace-background-position, center)",
        "background-size: var(--another-opencode-for-obsidian-workspace-background-size, cover)",
        "background-image: var(--another-opencode-for-obsidian-workspace-background-image, none)",
        "opacity: var(--another-opencode-for-obsidian-workspace-background-opacity, 0)",
        "filter: var(--another-opencode-for-obsidian-workspace-background-filter, none)",
        "sourceBoundary:",
        "obsidian-workspace-background-v1",
        "injectionState: collectInjectionState()",
        "appearanceImageBackground: describePseudoElement(document.body, '::after')",
      ],
      presentForbiddenSnippets: [
        "body::after",
        "--another-opencode-for-obsidian-iframe-page-background",
        "--another-opencode-for-obsidian-iframe-backdrop-left",
        "--another-opencode-for-obsidian-editor-background-image",
      ],
    });
  });

  test("flags proxy HTML that makes the OpenCode app root own viewport height", () => {
    const check = proxyDocumentBackgroundLayerCheck(`
          <style data-another-opencode-for-obsidian-appearance>
            html,
            body {
              background: var(
                --another-opencode-for-obsidian-page-background,
                var(--another-opencode-for-obsidian-background-primary, transparent)
              ) !important;
            }
            #root {
              background: transparent !important;
              min-height: 100dvh;
            }
            body::before {
              content: "";
              position: fixed;
              left: 0;
              top: 0;
              width: 100vw;
              height: 100vh;
              background-repeat: var(--another-opencode-for-obsidian-workspace-background-repeat, no-repeat);
              background-position: var(--another-opencode-for-obsidian-workspace-background-position, center);
              background-size: var(--another-opencode-for-obsidian-workspace-background-size, cover);
              background-image: var(--another-opencode-for-obsidian-workspace-background-image, none);
              opacity: var(--another-opencode-for-obsidian-workspace-background-opacity, 0);
              filter: var(--another-opencode-for-obsidian-workspace-background-filter, none);
            }
            </style>
          <script>
              sourceBoundary:
                obsidian-workspace-background-v1
            injectionState: collectInjectionState()
            appearanceBackground: describePseudoElement(document.body, '::before')
            appearanceImageBackground: describePseudoElement(document.body, '::after')
        </script>
    `);

    expect(check.ok).toBe(false);
    expect(check.detail).toEqual({
      missingSnippets: [],
      presentForbiddenSnippets: ["min-height: 100dvh"],
    });
  });
});

describe("proxyDisablesBackdropFilterSamplingCheck", () => {
  test("passes when Obsidian appearance disables iframe backdrop sampling by capability", () => {
    const check = proxyDisablesBackdropFilterSamplingCheck(`
      <style data-another-opencode-for-obsidian-appearance>
        html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *,
        html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *::before,
        html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *::after {
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
      </style>
    `);

    expect(check.ok).toBe(true);
    expect(check.detail).toEqual({ missingSnippets: [] });
  });

  test("fails when the proxy does not disable backdrop sampling globally", () => {
    const check = proxyDisablesBackdropFilterSamplingCheck(`
      <style data-another-opencode-for-obsidian-appearance>
        .scroll-view__thumb::after {
          backdrop-filter: none !important;
        }
      </style>
    `);

    expect(check.ok).toBe(false);
    expect(check.detail).toEqual({
      missingSnippets: [
        'html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *',
        'html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *::before',
        'html[data-another-opencode-for-obsidian-appearance="obsidian"][data-another-opencode-for-obsidian-workspace-background="enabled"] *::after',
        "-webkit-backdrop-filter: none !important",
      ],
    });
  });
});

describe("extractInjectedTheme", () => {
  test("reads the injected theme payload from proxied HTML", () => {
    const html = `
      <html>
        <head>
          <script data-another-opencode-for-obsidian-theme>
            (function() {
              var theme = {"colorScheme":"dark","variables":{"--background-base":"rgba(0, 0, 0, 0.25)"}};
            })();
          </script>
        </head>
      </html>
    `;

    expect(extractInjectedTheme(html)).toEqual({
      colorScheme: "dark",
      variables: {
        "--background-base": "rgba(0, 0, 0, 0.25)",
      },
    });
  });

  test("returns null for missing or malformed theme payloads", () => {
    expect(extractInjectedTheme("<html></html>")).toBeNull();
    expect(extractInjectedTheme("var theme = {invalid};")).toBeNull();
  });
});

describe("buildThemeReport", () => {
  test("prints vault paths through the shared path formatter", async () => {
    const report = await buildThemeReport({
      vault: "/home/alice/vault",
      source: "runtime",
      pluginDir: (vault) => `${vault}/.obsidian/plugins/another-opencode-for-obsidian`,
      formatPath: () => "~/vault",
      readJson: (path) => {
        if (path.endsWith("data.json")) {
          return {
            webViewAppearance: "obsidian",
          };
        }
        return null;
      },
    });

    expect(report.ok).toBe(false);
    expect(report.actions).toContain("Run `bun run dev:install --vault ~/vault`.");
  });

  test("explains legacy runtime diagnostics from an older loaded plugin bundle", async () => {
    const report = await buildRuntimeReport({
      theme: {
        variables: {
          "--background-base": "rgba(0, 0, 0, 0.25)",
        },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            backgroundImage: "none",
          },
        ],
        opaqueBackgrounds: [],
      },
      iframe: {
        iframe: { area: 100, allowTransparency: "true" },
        ancestors: [],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime theme diagnostics came from an older loaded plugin bundle."
    );
    expect(report.actions).toContain(
      "Run `obsidian plugin:reload id=another-opencode-for-obsidian`."
    );
  });

  test("fails when active workspace background mode still has iframe backdrop sampling", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics({
        backdropFilterSamples: [
          {
            owner: {
              tag: "div",
              id: null,
              className: "upstream-glass-surface",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              backgroundImage: "none",
              area: 1200,
            },
            pseudoElement: "::after",
            backdropFilter: "blur(4px)",
            webkitBackdropFilter: "blur(4px)",
            area: 1200,
          },
        ],
      })
    );
    const samplingCheck = findCheck(report, "backdrop-filter sampling");

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime OpenCode iframe still has backdrop-filter sampling enabled."
    );
    expect(samplingCheck?.ok).toBe(false);
    expect(samplingCheck?.detail).toMatchObject({
      workspaceBackgroundState: "enabled",
      backgroundSamplingUnsafe: true,
      sampleCount: 1,
    });
  });

  test("allows iframe backdrop sampling when workspace background mode is disabled", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics({
        variables: {
          "--another-opencode-for-obsidian-workspace-background-state": "disabled",
        },
        sourceBoundary: {
          workspaceBackgroundState: "disabled",
        },
        backdropFilterSamples: [
          {
            owner: {
              tag: "div",
              id: null,
              className: "upstream-glass-surface",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              backgroundImage: "none",
              area: 1200,
            },
            pseudoElement: null,
            backdropFilter: "blur(4px)",
            webkitBackdropFilter: "blur(4px)",
            area: 1200,
          },
        ],
      })
    );
    const samplingCheck = findCheck(report, "backdrop-filter sampling");

    expect(samplingCheck?.ok).toBe(true);
    expect(samplingCheck?.detail).toMatchObject({
      workspaceBackgroundState: "disabled",
      backgroundSamplingUnsafe: false,
      sampleCount: 1,
    });
  });

  test("does not report a painted iframe background when iframe diagnostics are missing", async () => {
    const report = await buildRuntimeReport({});

    expect(report.ok).toBe(false);
    expect(report.summary).not.toBe(
      "Runtime OpenCode iframe document does not match the Obsidian workspace background contract."
    );
  });

  test("passes when the iframe document uses one pane backdrop", async () => {
    const report = await buildRuntimeReport(runtimeDiagnostics());
    const hostBackgroundCheck = findCheck(report, "Obsidian appearance host stays transparent");
    const documentBackgroundCheck = findCheck(
      report,
      "OpenCode document uses the iframe workspace backdrop"
    );
    const observedVariablesCheck = findCheck(
      report,
      "Obsidian editor background variables are observed"
    );
    const externalEditorBackgroundCheck = findCheck(report, "parent editor background layers");
    const workspaceFocusCheck = findCheck(report, "iframe focus and Obsidian active leaf");
    const themeSyncHistoryCheck = findCheck(report, "theme sync history");

    expect(report.ok).toBe(true);
    expect(hostBackgroundCheck?.ok).toBe(true);
    expect(documentBackgroundCheck?.ok).toBe(true);
    expect(observedVariablesCheck?.ok).toBe(true);
    expect(externalEditorBackgroundCheck?.ok).toBe(true);
    expect(workspaceFocusCheck?.ok).toBe(true);
    expect(themeSyncHistoryCheck?.ok).toBe(true);
    expect(themeSyncHistoryCheck?.detail).toMatchObject({
      eventCount: 3,
      scheduledCount: 1,
      postedCount: 1,
      skippedCount: 1,
      changedPostCount: 1,
      unchangedPostCount: 0,
      uniquePostedFingerprintCount: 1,
      reasonCounts: {
        "iframe-created": 2,
        "obsidian-theme-source-mutated": 1,
      },
      recent: [
        {},
        {},
        {
          phase: "skipped",
          reason: "obsidian-theme-source-mutated",
          cause: "theme-unchanged",
          fingerprint: "a1b2c3d4",
        },
      ],
    });
    expect(externalEditorBackgroundCheck?.detail).toMatchObject({
      observedActiveLayer: true,
      layerCount: 1,
      activeLayerCount: 1,
      rules: [
        {
          owner: "style",
        },
      ],
    });
    expect(hostBackgroundCheck?.detail).toMatchObject({
      hasEditorBackground: true,
      expectedImage: 'url("https://example.test/bg.jpg")',
      expectedOpacity: "0.3",
      hostRootTransparent: true,
      baseLayerInactive: true,
      imageLayerInactive: true,
      hostBackdropInactive: true,
    });
    expect(documentBackgroundCheck?.detail).toMatchObject({
      htmlBodyUseObsidianBase: true,
      appRootTransparent: true,
      actualImage: 'url("https://example.test/bg.jpg")',
      beforeLayerActive: true,
      beforeLayerValid: true,
      beforeLayerImageMatches: true,
      afterLayerInactive: true,
      documentBackdropStable: true,
    });
  });

  test("reports when iframe focus and Obsidian active leaf disagree", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics(
        {},
        {
          workspaceFocus: {
            documentHasFocus: true,
            activeLeafViewType: "markdown",
            openCodeLeafIsActive: false,
            iframeIsDocumentActiveElement: true,
            focusedIframeWithoutActiveOpenCodeLeaf: true,
            activeElement: {
              tag: "iframe",
              className: "opencode-iframe",
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: "none",
              area: 120000,
            },
            activeLeafView: {
              tag: "div",
              className: "workspace-leaf-content",
              dataType: "markdown",
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: "none",
              area: 120000,
            },
            openCodeLeafView: {
              tag: "div",
              className: "workspace-leaf-content",
              dataType: "opencode-view",
              backgroundColor: "rgba(0, 0, 0, 0)",
              backgroundImage: "none",
              area: 120000,
            },
          },
        }
      )
    );
    const workspaceFocusCheck = findCheck(report, "iframe focus and Obsidian active leaf");

    expect(report.ok).toBe(true);
    expect(workspaceFocusCheck?.ok).toBe(true);
    expect(workspaceFocusCheck?.detail).toMatchObject({
      activeLeafViewType: "markdown",
      openCodeLeafIsActive: false,
      iframeIsDocumentActiveElement: true,
      focusedIframeWithoutActiveOpenCodeLeaf: true,
    });
  });

  test("fails when iframe document roots are transparent", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics({
        roots: transparentDocumentRoots(),
      })
    );
    const documentBackgroundCheck = findCheck(
      report,
      "OpenCode document uses the iframe workspace backdrop"
    );

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime OpenCode iframe document does not match the Obsidian workspace background contract."
    );
    expect(documentBackgroundCheck?.ok).toBe(false);
    expect(documentBackgroundCheck?.detail).toMatchObject({
      beforeLayerActive: true,
      htmlBodyUseObsidianBase: false,
      appRootTransparent: true,
      documentBackdropStable: false,
    });
  });

  test("fails when the iframe backdrop repeats the editor image as multiple layers", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics({
        appearanceBackground: {
          ...iframeImageBackdrop,
          backgroundImage: 'url("https://example.test/bg.jpg"), url("https://example.test/bg.jpg")',
          backgroundPosition: "50% 50%, center",
          backgroundSize: "cover, cover",
        },
      })
    );
    const documentBackgroundCheck = findCheck(
      report,
      "OpenCode document uses the iframe workspace backdrop"
    );

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime OpenCode iframe document does not match the Obsidian workspace background contract."
    );
    expect(documentBackgroundCheck?.ok).toBe(false);
    expect(documentBackgroundCheck?.detail).toMatchObject({
      beforeLayerInactive: false,
      actualImage: 'url("https://example.test/bg.jpg"), url("https://example.test/bg.jpg")',
      documentBackdropStable: false,
    });
  });

  test("passes when Obsidian ancestors own the base backdrop without an editor image", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics(
        {
          variables: {
            "--obsidian-editor-background-image": "none",
            "--obsidian-editor-background-opacity": "0",
            "--obsidian-workspace-background-image": "none",
            "--obsidian-workspace-background-opacity": "0",
            "--another-opencode-for-obsidian-workspace-background-state": "disabled",
            "--another-opencode-for-obsidian-workspace-background-image": "none",
            "--another-opencode-for-obsidian-workspace-background-opacity": "0",
          },
          sourceBoundary: {
            contract: "obsidian-workspace-background-v1",
            workspaceBackgroundContract: "v1",
            workspaceBackgroundState: "disabled",
            activeEditorProjected: false,
            paintedBackgroundImage: null,
          },
          appearanceBackground: inactivePseudo,
        },
        {
          editorBackgroundVariables: {
            "--obsidian-editor-background-image": "none",
            "--obsidian-editor-background-opacity": "0",
          },
          appearanceImageBackground: {
            content: '""',
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
            opacity: "0",
          },
          externalEditorBackgroundLayers: [],
        }
      )
    );
    const hostBackgroundCheck = findCheck(report, "Obsidian appearance host stays transparent");
    const documentBackgroundCheck = findCheck(
      report,
      "OpenCode document uses the iframe workspace backdrop"
    );

    expect(report.ok).toBe(true);
    expect(hostBackgroundCheck?.ok).toBe(true);
    expect(documentBackgroundCheck?.ok).toBe(true);
    expect(hostBackgroundCheck?.detail).toMatchObject({
      hasEditorBackground: false,
      actualAfterImage: "none",
      actualAfterOpacity: "0",
      baseLayerInactive: true,
      imageLayerInactive: true,
      hostBackdropInactive: true,
    });
  });

  test("fails when the iframe app root paints an extra background", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics({
        roots: [
          stableDocumentRoots[0],
          stableDocumentRoots[1],
          {
            ...stableDocumentRoots[2],
            backgroundColor: "rgb(42, 42, 42)",
          },
        ],
      })
    );
    const documentBackgroundCheck = findCheck(
      report,
      "OpenCode document uses the iframe workspace backdrop"
    );

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime OpenCode iframe document does not match the Obsidian workspace background contract."
    );
    expect(documentBackgroundCheck?.ok).toBe(false);
    expect(documentBackgroundCheck?.detail).toMatchObject({
      htmlBodyUseObsidianBase: true,
      appRootTransparent: false,
      documentBackdropStable: false,
    });
  });

  test("fails when the host root paints a base background", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics(
        {},
        {
          appearanceRoot: {
            backgroundColor: "rgb(40, 40, 40)",
          },
        }
      )
    );
    const hostBackgroundCheck = findCheck(report, "Obsidian appearance host stays transparent");

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime Obsidian host pane is painting a backdrop outside the iframe."
    );
    expect(hostBackgroundCheck?.ok).toBe(false);
    expect(hostBackgroundCheck?.detail).toMatchObject({
      actualRootBackground: "rgb(40, 40, 40)",
      hostRootTransparent: false,
      baseLayerInactive: true,
      imageLayerInactive: true,
      hostBackdropInactive: false,
    });
  });

  test("fails when the iframe declares transparent compositing", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics(
        {},
        {
          iframe: { area: 100, allowTransparency: "true" },
        }
      )
    );
    const transparentIframeCheck = findCheck(report, "avoids transparent compositing");

    expect(report.ok).toBe(false);
    expect(report.summary).toBe("Runtime iframe is still using transparent compositing.");
    expect(transparentIframeCheck?.ok).toBe(false);
    expect(transparentIframeCheck?.detail).toEqual({
      allowTransparency: "true",
    });
  });

  test("fails when the Obsidian appearance iframe element paints a black backdrop", async () => {
    const report = await buildRuntimeReport(
      runtimeDiagnostics(
        {},
        {
          iframe: {
            area: 100,
            width: 528,
            height: 747,
            allowTransparency: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
        }
      )
    );
    const hostPaintCheck = findCheck(report, "does not paint a black Obsidian backdrop");

    expect(report.ok).toBe(false);
    expect(report.summary).toBe(
      "Runtime OpenCode iframe element is still painting a black Obsidian backdrop."
    );
    expect(hostPaintCheck?.ok).toBe(false);
    expect(hostPaintCheck?.detail).toMatchObject({
      backgroundColor: "rgb(0, 0, 0)",
      backgroundAlpha: 1,
      transparent: false,
    });
  });
});

describe("summarizeThemeReport", () => {
  test("keeps the default theme output short and points to --full", () => {
    const summary = summarizeThemeReport({
      ok: true,
      summary: "ok",
      actions: [],
      mode: "obsidian",
      url: "http://127.0.0.1:4098/",
      http: { ok: true, status: 200, contentType: "text/html" },
      injection: { hasAppearanceStyle: true, hasThemeScript: true, colorScheme: "dark" },
      tokens: {
        rootBackground: {},
        surfaces: {},
        textAndBorder: {},
      },
      scriptDiagnostics: {
        variables: {
          "--background-base": "rgba(0, 0, 0, 0.25)",
          "--background-bg-layer-01": "rgba(0, 0, 0, 0.10)",
        },
        roots: [],
        visibleBackgrounds: Array.from({ length: 10 }, (_, index) => ({
          tag: "div",
          id: null,
          className: `sample-${index}`,
          backgroundColor: "rgba(0, 0, 0, 0.25)",
          backgroundImage: "none",
          area: index,
        })),
      },
      runtimeDiagnostics: null,
      iframeDiagnostics: null,
      checks: [],
    }) as any;

    expect(summary).toHaveProperty(
      "fullReport",
      "Run `bun run dev:theme --full` for the complete diagnostics payload."
    );
    expect((summary as any).diagnostics.theme.visibleBackgrounds.count).toBe(10);
    expect((summary as any).diagnostics.theme.visibleBackgrounds.largest).toHaveLength(6);
    expect((summary as any).checkCounts).toEqual({
      passed: 0,
      failed: 0,
      total: 0,
    });
    expect((summary as any).failedChecks).toEqual([]);
    expect((summary as any).checks).toBeUndefined();
  });
});
