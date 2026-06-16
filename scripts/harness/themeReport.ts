import { readFileSync } from "fs";
import { join } from "path";
import { getRuntimePaths } from "../../src/debug/RuntimeDiagnostics";
import { fetchText, type FetchTextResult } from "./httpText";
import { fetchFixtureThemeHtml, runThemeDiagnosticsFixture } from "./themeFixture";
import { openCodeThemeGoldStandardChecks } from "./themeGoldStandard";
import { runtimeThemeChecks, themeDiagnosticsResolvedChecks } from "./themeChecks";

type ThemeMode = "obsidian" | "opencode" | "unknown";

const proxyDocumentBackgroundCheckName =
  "runtime proxy HTML installs the iframe workspace backdrop";
const obsidianHostBackgroundCheckName = "runtime Obsidian appearance host stays transparent";
const openCodeDocumentBackgroundCheckName =
  "runtime OpenCode document uses the iframe workspace backdrop";
const obsidianDialogScrimPercent = {
  dark: 60,
  light: 34,
};
const themeBoundaryFiles = {
  stylesCss: "styles.css",
  proxyInjectionTs: join("src", "proxy", "ProxyInjection.ts"),
  webViewThemeTs: join("src", "theme", "WebViewTheme.ts"),
};

export interface ThemeReport {
  ok: boolean;
  summary: string;
  actions: string[];
  mode: ThemeMode;
  url: string | null;
  http: {
    ok: boolean;
    status?: number;
    contentType?: string | null;
    error?: string;
  };
  injection: {
    hasAppearanceStyle: boolean;
    hasThemeScript: boolean;
    colorScheme: string | null;
  };
  tokens: {
    rootBackground: Record<string, string | null>;
    surfaces: Record<string, string | null>;
    textAndBorder: Record<string, string | null>;
  };
  scriptDiagnostics: unknown | null;
  runtimeDiagnostics: unknown | null;
  iframeDiagnostics: unknown | null;
  checks: Array<{ name: string; ok: boolean; detail?: unknown }>;
}

interface ThemeRuntimeStatus {
  serverState?: unknown;
  healthProbe?: unknown;
}

export interface ThemeReportOptions {
  vault: string;
  source: "runtime" | "fixture";
  opencodeSource?: string;
  readJson(path: string): any | null;
  pluginDir(vault: string): string;
  formatPath(path: string): string;
}

export async function buildThemeReport(options: ThemeReportOptions): Promise<ThemeReport> {
  if (options.source === "fixture") {
    return buildFixtureThemeReport(options.opencodeSource);
  }

  const runtimeStatus = options.readJson(getRuntimePaths().statusFile);
  const runtimeThemeDiagnostics = runtimeStatus?.runtimeDiagnostics?.theme ?? null;
  const runtimeIframeDiagnostics = runtimeStatus?.runtimeDiagnostics?.iframe ?? null;
  const data = options.readJson(join(options.pluginDir(options.vault), "data.json"));
  const mode = themeMode(data?.webViewAppearance);
  const url = typeof runtimeStatus?.proxyUrl === "string" ? runtimeStatus.proxyUrl : null;
  const checks: ThemeReport["checks"] = [];

  checks.push({
    name: "settings.webViewAppearance is known",
    ok: mode !== "unknown",
    detail: data?.webViewAppearance,
  });
  checks.push({
    name: "runtime status has proxyUrl",
    ok: Boolean(url),
    detail: url,
  });
  checks.push(...themeSourceBoundaryChecks(readThemeBoundarySources()));

  if (!url) {
    return withThemeAdvice(
      {
        ok: false,
        summary: "",
        actions: [],
        mode,
        url,
        http: { ok: false, error: "status.json has no proxyUrl; start Obsidian/plugin first" },
        injection: { hasAppearanceStyle: false, hasThemeScript: false, colorScheme: null },
        tokens: emptyThemeTokens(),
        scriptDiagnostics: runtimeThemeDiagnostics,
        runtimeDiagnostics: runtimeThemeDiagnostics,
        iframeDiagnostics: runtimeIframeDiagnostics,
        checks,
      },
      {
        requireRuntimeDiagnostics: true,
        runtimeStatus,
        vault: options.vault,
        formatPath: options.formatPath,
      }
    );
  }

  const html = await fetchText(url);
  const canUseRuntimeDiagnostics = mode === "obsidian" && Boolean(runtimeThemeDiagnostics);
  checks.push({
    name: "proxy HTML is reachable or runtime theme diagnostics are available",
    ok: html.ok || canUseRuntimeDiagnostics,
    detail: html.ok
      ? { status: html.status, contentType: html.contentType }
      : { status: html.status, error: html.error, source: "runtimeDiagnostics" },
  });

  if (!html.ok) {
    const runtimeReport = buildThemeReportFromRuntimeDiagnostics({
      mode,
      url,
      http: html,
      runtimeDiagnostics: runtimeThemeDiagnostics,
      iframeDiagnostics: runtimeIframeDiagnostics,
      opencodeSource: options.opencodeSource,
      checks,
    });
    if (runtimeReport) {
      return withThemeAdvice(runtimeReport, {
        requireRuntimeDiagnostics: true,
        runtimeStatus,
        vault: options.vault,
        formatPath: options.formatPath,
      });
    }

    return withThemeAdvice(
      {
        ok: false,
        summary: "",
        actions: [],
        mode,
        url,
        http: html,
        injection: { hasAppearanceStyle: false, hasThemeScript: false, colorScheme: null },
        tokens: emptyThemeTokens(),
        scriptDiagnostics: runtimeThemeDiagnostics,
        runtimeDiagnostics: runtimeThemeDiagnostics,
        iframeDiagnostics: runtimeIframeDiagnostics,
        checks,
      },
      {
        requireRuntimeDiagnostics: true,
        runtimeStatus,
        vault: options.vault,
        formatPath: options.formatPath,
      }
    );
  }

  return withThemeAdvice(
    buildThemeReportFromHtml({
      mode,
      url,
      html,
      scriptDiagnostics: runtimeThemeDiagnostics,
      runtimeDiagnostics: runtimeThemeDiagnostics,
      iframeDiagnostics: runtimeIframeDiagnostics,
      opencodeSource: options.opencodeSource,
      checks,
      requireRuntimeDiagnostics: true,
    }),
    {
      requireRuntimeDiagnostics: true,
      runtimeStatus,
      vault: options.vault,
      formatPath: options.formatPath,
    }
  );
}

export function summarizeThemeReport(report: ThemeReport): unknown {
  const failedChecks = report.checks.filter((check) => !check.ok);
  return {
    ok: report.ok,
    summary: report.summary,
    actions: report.actions,
    mode: report.mode,
    url: report.url,
    http: report.http,
    injection: report.injection,
    tokens: report.tokens,
    diagnostics: {
      theme: summarizeThemeDiagnostics(report.runtimeDiagnostics ?? report.scriptDiagnostics),
      iframe: summarizeIframeDiagnosticsBrief(report.iframeDiagnostics),
    },
    checkCounts: {
      passed: report.checks.length - failedChecks.length,
      failed: failedChecks.length,
      total: report.checks.length,
    },
    failedChecks: failedChecks.map((check) => ({
      name: check.name,
      ok: check.ok,
      detail: check.detail,
    })),
    fullReport: "Run `bun run dev:theme --full` for the complete diagnostics payload.",
  };
}

function summarizeIframeDiagnosticsBrief(diagnostics: unknown): unknown {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const payload = diagnostics as any;
  return {
    reason: typeof payload.reason === "string" ? payload.reason : null,
    appearance: typeof payload.appearance === "string" ? payload.appearance : null,
    iframe: summarizeBackgroundSample(payload.iframe),
    workspaceFocus:
      payload.workspaceFocus && typeof payload.workspaceFocus === "object"
        ? summarizeWorkspaceFocus(payload.workspaceFocus)
        : null,
    sampleCounts: {
      externalEditorBackgroundLayers: Array.isArray(payload.externalEditorBackgroundLayers)
        ? payload.externalEditorBackgroundLayers.length
        : 0,
    },
    themeSync: summarizeThemeSyncHistory(payload),
  };
}

async function buildFixtureThemeReport(opencodeSource?: string): Promise<ThemeReport> {
  const html = await fetchFixtureThemeHtml();
  const checks: ThemeReport["checks"] = [
    {
      name: "fixture proxy HTML is reachable",
      ok: html.ok,
      detail: html.ok ? { status: html.status, contentType: html.contentType } : html.error,
    },
    ...themeSourceBoundaryChecks(readThemeBoundarySources()),
  ];

  if (!html.ok) {
    return withThemeAdvice(
      {
        ok: false,
        summary: "",
        actions: [],
        mode: "obsidian",
        url: html.url,
        http: html,
        injection: { hasAppearanceStyle: false, hasThemeScript: false, colorScheme: null },
        tokens: emptyThemeTokens(),
        scriptDiagnostics: null,
        runtimeDiagnostics: null,
        iframeDiagnostics: null,
        checks,
      },
      {
        requireRuntimeDiagnostics: false,
      }
    );
  }

  const scriptExecution = await runThemeDiagnosticsFixture(html.body, html.url);

  return withThemeAdvice(
    buildThemeReportFromHtml({
      mode: "obsidian",
      url: html.url,
      html,
      scriptDiagnostics: scriptExecution.diagnostics,
      scriptDiagnosticsError: scriptExecution.error,
      runtimeDiagnostics: null,
      iframeDiagnostics: null,
      opencodeSource,
      checks,
      requireRuntimeDiagnostics: false,
    }),
    {
      requireRuntimeDiagnostics: false,
    }
  );
}

function buildThemeReportFromRuntimeDiagnostics(input: {
  mode: ThemeReport["mode"];
  url: string | null;
  http: FetchTextResult;
  runtimeDiagnostics: unknown | null;
  iframeDiagnostics: unknown | null;
  opencodeSource?: string;
  checks: ThemeReport["checks"];
}): ThemeReport | null {
  if (input.mode !== "obsidian" || !input.runtimeDiagnostics) {
    return null;
  }

  const variables = themeDiagnosticsVariables(input.runtimeDiagnostics);
  const inlineVariables = input.opencodeSource
    ? themeDiagnosticsInlineVariables(input.runtimeDiagnostics)
    : {};
  const tokens = {
    rootBackground: pickVariables(variables, [
      "--background-strong",
      "--v2-background-bg-deep",
      "--background-bg-deep",
    ]),
    surfaces: pickVariables(variables, [
      "--v2-background-bg-base",
      "--background-base",
      "--background-bg-base",
      "--background-weak",
      "--background-stronger",
      "--background-bg-layer-01",
      "--background-bg-layer-02",
      "--background-bg-layer-03",
      "--background-bg-layer-04",
      "--surface-raised-base",
      "--surface-float-base",
      "--surface-raised-stronger-non-alpha",
      "--input-base",
      "--v2-background-bg-layer-01",
      "--v2-background-bg-layer-02",
      "--v2-background-bg-layer-03",
      "--v2-background-bg-layer-04",
      "--v2-elevation-button-neutral",
      "--elevation-button-neutral",
      "--v2-state-bg-success",
      "--v2-state-bg-warning",
      "--v2-state-bg-danger",
      "--v2-state-bg-info",
      "--v2-overlay-simple-overlay-scrim",
      "--overlay-simple-overlay-scrim",
    ]),
    textAndBorder: pickVariables(variables, ["--text-text-base", "--border-border-base"]),
  };
  const expectedRootBackground =
    typeof variables["--opencode-obsidian-page-background"] === "string"
      ? variables["--opencode-obsidian-page-background"]
      : typeof variables["--opencode-obsidian-background-primary"] === "string"
        ? variables["--opencode-obsidian-background-primary"]
        : null;

  input.checks.push({
    name: "runtime iframe theme diagnostics received",
    ok: true,
    detail: input.runtimeDiagnostics,
  });
  input.checks.push({
    name: "runtime theme variables include root background",
    ok: typeof expectedRootBackground === "string" && expectedRootBackground.length > 0,
    detail: tokens.rootBackground,
  });
  input.checks.push(...runtimeThemeChecks(input.runtimeDiagnostics, expectedRootBackground));
  if (input.opencodeSource) {
    input.checks.push({
      name: "runtime theme inline variables received",
      ok: Object.keys(inlineVariables).length > 0,
      detail: {
        count: Object.keys(inlineVariables).length,
      },
    });
    input.checks.push(...openCodeThemeGoldStandardChecks(input.opencodeSource, inlineVariables));
  }
  input.checks.push(openCodeDocumentBackgroundLayerCheck(input.runtimeDiagnostics));
  input.checks.push(sourceBoundaryContractCheck(input.runtimeDiagnostics));
  input.checks.push(backdropFilterSamplesCheck(input.runtimeDiagnostics));
  input.checks.push({
    name: "runtime iframe composition diagnostics received",
    ok: Boolean(input.iframeDiagnostics),
    detail:
      input.iframeDiagnostics ??
      "No iframe composition diagnostics in runtime status yet. Open the OpenCode view, or run `obsidian command id=opencode-obsidian:open-opencode-view`, then rerun this harness command.",
  });
  input.checks.push(iframeAvoidsTransparentCompositingCheck(input.iframeDiagnostics));
  input.checks.push(iframeAvoidsBlackHostPaintCheck(input.iframeDiagnostics));
  input.checks.push(obsidianAppearanceBackgroundCheck(input.iframeDiagnostics));
  input.checks.push(editorBackgroundVariablesObservedCheck(input.iframeDiagnostics));
  input.checks.push(workspaceFocusCoherenceCheck(input.iframeDiagnostics));
  input.checks.push(externalEditorBackgroundDiagnosticsCheck(input.iframeDiagnostics));
  input.checks.push(themeSyncHistoryDiagnosticsCheck(input.iframeDiagnostics));

  return {
    ok: input.checks.every((check) => check.ok),
    summary: "",
    actions: [],
    mode: input.mode,
    url: input.url,
    http: {
      ok: input.http.ok,
      status: input.http.status,
      contentType: input.http.contentType,
      error: input.http.error,
    },
    injection: { hasAppearanceStyle: false, hasThemeScript: false, colorScheme: null },
    tokens,
    scriptDiagnostics: input.runtimeDiagnostics,
    runtimeDiagnostics: input.runtimeDiagnostics,
    iframeDiagnostics: input.iframeDiagnostics,
    checks: input.checks,
  };
}

function buildThemeReportFromHtml(input: {
  mode: ThemeReport["mode"];
  url: string | null;
  html: FetchTextResult;
  scriptDiagnostics: unknown | null;
  scriptDiagnosticsError?: string | null;
  runtimeDiagnostics: unknown | null;
  iframeDiagnostics: unknown | null;
  opencodeSource?: string;
  checks: ThemeReport["checks"];
  requireRuntimeDiagnostics: boolean;
}): ThemeReport {
  const injectedTheme = extractInjectedTheme(input.html.body);
  const variables = injectedTheme?.variables ?? {};
  const tokens = {
    rootBackground: pickVariables(variables, [
      "--opencode-obsidian-page-background",
      "--background-strong",
      "--v2-background-bg-deep",
      "--background-bg-deep",
    ]),
    surfaces: pickVariables(variables, [
      "--v2-background-bg-base",
      "--background-base",
      "--background-bg-base",
      "--background-weak",
      "--background-stronger",
      "--surface-raised-base",
      "--surface-float-base",
      "--surface-raised-stronger-non-alpha",
      "--input-base",
      "--v2-background-bg-layer-01",
      "--v2-background-bg-layer-02",
      "--v2-background-bg-layer-03",
      "--v2-background-bg-layer-04",
      "--background-bg-layer-01",
      "--background-bg-layer-02",
      "--background-bg-layer-03",
      "--background-bg-layer-04",
    ]),
    overlays: pickVariables(variables, [
      "--v2-elevation-button-neutral",
      "--elevation-button-neutral",
      "--v2-state-bg-success",
      "--v2-state-bg-warning",
      "--v2-state-bg-danger",
      "--v2-state-bg-info",
      "--v2-overlay-simple-overlay-scrim",
      "--overlay-simple-overlay-scrim",
    ]),
    textAndBorder: pickVariables(variables, [
      "--text-strong",
      "--border-weak-base",
      "--text-text-base",
      "--border-border-base",
    ]),
  };
  const injection = {
    hasAppearanceStyle: input.html.body.includes("data-opencode-obsidian-appearance"),
    hasThemeScript: input.html.body.includes("data-opencode-obsidian-theme"),
    colorScheme: typeof injectedTheme?.colorScheme === "string" ? injectedTheme.colorScheme : null,
  };
  const expectedScrimSource =
    injection.colorScheme === "dark"
      ? "var(--opencode-obsidian-background-primary)"
      : "var(--opencode-obsidian-text-normal)";
  const expectedScrimPercent =
    injection.colorScheme === "dark"
      ? obsidianDialogScrimPercent.dark
      : obsidianDialogScrimPercent.light;

  if (input.mode === "obsidian") {
    input.checks.push({
      name: "Obsidian appearance style is injected",
      ok: injection.hasAppearanceStyle,
    });
    input.checks.push({
      name: "Obsidian theme script is injected",
      ok: injection.hasThemeScript,
    });
    input.checks.push(proxyDocumentBackgroundLayerCheck(input.html.body));
    input.checks.push(proxyDisablesBackdropFilterSamplingCheck(input.html.body));
    input.checks.push({
      name: "root background tokens stay transparent in Obsidian appearance",
      ok:
        typeof tokens.rootBackground["--opencode-obsidian-page-background"] === "string" &&
        tokens.rootBackground["--opencode-obsidian-page-background"]!.length > 0 &&
        Object.entries(tokens.rootBackground)
          .filter(
            ([name]) =>
              name !== "--opencode-obsidian-page-background" && name !== "--background-bg-deep"
          )
          .every(([, value]) => value === "transparent") &&
        tokens.rootBackground["--background-bg-deep"] === "var(--v2-background-bg-deep)",
      detail: tokens.rootBackground,
    });
    input.checks.push({
      name: "v2 panel surface tokens stay Obsidian-derived with legacy aliases through v2",
      ok:
        tokens.surfaces["--v2-background-bg-base"] ===
          "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 28%, transparent)" &&
        tokens.surfaces["--v2-background-bg-layer-01"] ===
          "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 36%, transparent)" &&
        tokens.surfaces["--v2-background-bg-layer-02"] ===
          "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 46%, transparent)" &&
        typeof tokens.surfaces["--v2-background-bg-layer-03"] === "string" &&
        tokens.surfaces["--v2-background-bg-layer-03"] ===
          "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 58%, transparent)" &&
        tokens.surfaces["--v2-background-bg-layer-04"] ===
          "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 68%, transparent)" &&
        tokens.surfaces["--background-base"] === "var(--v2-background-bg-base)" &&
        tokens.surfaces["--background-bg-base"] === "var(--v2-background-bg-base)" &&
        tokens.surfaces["--background-weak"] === "var(--v2-background-bg-layer-01)" &&
        tokens.surfaces["--background-stronger"] === "transparent" &&
        tokens.surfaces["--surface-raised-base"] === "var(--v2-background-bg-layer-02)" &&
        tokens.surfaces["--surface-float-base"] === "var(--v2-background-bg-layer-03)" &&
        tokens.surfaces["--surface-raised-stronger-non-alpha"] ===
          "var(--v2-background-bg-layer-04)" &&
        tokens.surfaces["--input-base"] === "var(--v2-background-bg-layer-01)" &&
        tokens.surfaces["--background-bg-layer-01"] === "var(--v2-background-bg-layer-01)" &&
        tokens.surfaces["--background-bg-layer-02"] === "var(--v2-background-bg-layer-02)" &&
        tokens.surfaces["--background-bg-layer-03"] === "var(--v2-background-bg-layer-03)" &&
        tokens.surfaces["--background-bg-layer-04"] === "var(--v2-background-bg-layer-04)",
      detail: tokens.surfaces,
    });
    input.checks.push({
      name: "v2 overlay and elevation tokens stay Obsidian-derived with legacy aliases through v2",
      ok:
        tokens.overlays["--v2-overlay-simple-overlay-scrim"] ===
          `color-mix(in srgb, ${expectedScrimSource} ${expectedScrimPercent}%, transparent)` &&
        tokens.overlays["--overlay-simple-overlay-scrim"] ===
          "var(--v2-overlay-simple-overlay-scrim)" &&
        typeof tokens.overlays["--v2-elevation-button-neutral"] === "string" &&
        tokens.overlays["--v2-elevation-button-neutral"]!.includes(
          "var(--opencode-obsidian-background-primary)"
        ) &&
        tokens.overlays["--elevation-button-neutral"] === "var(--v2-elevation-button-neutral)",
      detail: tokens.overlays,
    });
    input.checks.push({
      name: "legacy text and border tokens alias through v2",
      ok:
        tokens.textAndBorder["--text-strong"] === "var(--v2-text-text-base)" &&
        tokens.textAndBorder["--border-weak-base"] === "var(--v2-border-border-muted)" &&
        tokens.textAndBorder["--text-text-base"] === "var(--v2-text-text-base)" &&
        tokens.textAndBorder["--border-border-base"] === "var(--v2-border-border-base)",
      detail: tokens.textAndBorder,
    });
    input.checks.push(...openCodeThemeGoldStandardChecks(input.opencodeSource, variables));

    if (!input.requireRuntimeDiagnostics) {
      input.checks.push({
        name: "fixture theme script posts diagnostics",
        ok: Boolean(input.scriptDiagnostics),
        detail:
          input.scriptDiagnostics ??
          input.scriptDiagnosticsError ??
          "The fixture executed the proxied HTML, but no theme:diagnostics message was posted.",
      });
      input.checks.push(...themeDiagnosticsResolvedChecks(input.scriptDiagnostics, variables));
      input.checks.push(backdropFilterSamplesCheck(input.scriptDiagnostics));
    }

    if (input.requireRuntimeDiagnostics) {
      input.checks.push({
        name: "runtime iframe theme diagnostics received",
        ok: Boolean(input.runtimeDiagnostics),
        detail:
          input.runtimeDiagnostics ??
          "No iframe diagnostics in runtime status yet. Open the OpenCode view, or run `obsidian command id=opencode-obsidian:open-opencode-view`, then rerun this harness command.",
      });
      input.checks.push(
        ...runtimeThemeChecks(
          input.runtimeDiagnostics,
          typeof variables["--opencode-obsidian-page-background"] === "string"
            ? variables["--opencode-obsidian-page-background"]
            : typeof variables["--opencode-obsidian-background-primary"] === "string"
              ? variables["--opencode-obsidian-background-primary"]
              : null
        )
      );
      input.checks.push(openCodeDocumentBackgroundLayerCheck(input.runtimeDiagnostics));
      input.checks.push(sourceBoundaryContractCheck(input.runtimeDiagnostics));
      input.checks.push(backdropFilterSamplesCheck(input.runtimeDiagnostics));
      input.checks.push({
        name: "runtime iframe composition diagnostics received",
        ok: Boolean(input.iframeDiagnostics),
        detail:
          input.iframeDiagnostics ??
          "No iframe composition diagnostics in runtime status yet. Open the OpenCode view, or run `obsidian command id=opencode-obsidian:open-opencode-view`, then rerun this harness command.",
      });
      input.checks.push(iframeAvoidsTransparentCompositingCheck(input.iframeDiagnostics));
      input.checks.push(obsidianAppearanceBackgroundCheck(input.iframeDiagnostics));
      input.checks.push(editorBackgroundVariablesObservedCheck(input.iframeDiagnostics));
      input.checks.push(externalEditorBackgroundDiagnosticsCheck(input.iframeDiagnostics));
    }
  }

  if (input.mode === "opencode") {
    input.checks.push({
      name: "Obsidian appearance style is not injected",
      ok: !injection.hasAppearanceStyle,
    });
    input.checks.push({
      name: "Obsidian theme script is not injected",
      ok: !injection.hasThemeScript,
    });
  }

  return {
    ok: input.checks.every((check) => check.ok),
    summary: "",
    actions: [],
    mode: input.mode,
    url: input.url,
    http: {
      ok: input.html.ok,
      status: input.html.status,
      contentType: input.html.contentType,
    },
    injection,
    tokens,
    scriptDiagnostics: input.scriptDiagnostics,
    runtimeDiagnostics: input.runtimeDiagnostics,
    iframeDiagnostics: input.iframeDiagnostics,
    checks: input.checks,
  };
}

function withThemeAdvice(
  report: ThemeReport,
  options: {
    requireRuntimeDiagnostics: boolean;
    runtimeStatus?: ThemeRuntimeStatus | null;
    vault?: string;
    formatPath?: (path: string) => string;
  }
): ThemeReport {
  const advice = themeAdvice(report, options);
  return {
    ...report,
    summary: advice.summary,
    actions: advice.actions,
  };
}

function themeAdvice(
  report: ThemeReport,
  options: {
    requireRuntimeDiagnostics: boolean;
    runtimeStatus?: ThemeRuntimeStatus | null;
    vault?: string;
    formatPath?: (path: string) => string;
  }
): { summary: string; actions: string[] } {
  const vault = options.vault && options.formatPath ? options.formatPath(options.vault) : "<vault>";

  if (report.ok) {
    if (options.requireRuntimeDiagnostics && !report.http.ok) {
      return {
        summary: "Runtime theme diagnostics passed; the OpenCode server is no longer serving HTML.",
        actions: [
          "The iframe already reported computed theme values, so this is valid theme evidence.",
          "Run `obsidian command id=opencode-obsidian:start-opencode-server` before `bun run dev:theme` when you need to inspect live proxy HTML.",
        ],
      };
    }
    return {
      summary: options.requireRuntimeDiagnostics
        ? "Runtime theme checks passed against the running Obsidian plugin."
        : "Fixture theme checks passed against the current workspace code.",
      actions: [],
    };
  }

  if (!options.requireRuntimeDiagnostics) {
    return {
      summary: "Fixture theme check failed against the current workspace code.",
      actions: ["Run `bun run check` and inspect the failed theme checks above."],
    };
  }

  if (!report.url) {
    return {
      summary: "Obsidian runtime has not published a proxy URL yet.",
      actions: [
        `Run \`bun run dev:install --vault ${vault}\`.`,
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Run `obsidian command id=opencode-obsidian:start-opencode-server`.",
      ],
    };
  }

  if (hasLegacyThemeDiagnostics(report.runtimeDiagnostics)) {
    return {
      summary: "Runtime theme diagnostics came from an older loaded plugin bundle.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasStaleLoadedThemeBundle(report)) {
    return {
      summary:
        "Runtime theme diagnostics came from a loaded plugin bundle older than the current theme contract.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasMissingInlineThemeDiagnostics(report)) {
    return {
      summary:
        "Runtime theme diagnostics came from a loaded plugin bundle older than the current theme contract.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasPaintedProxyDocumentBackground(report)) {
    return {
      summary: "Runtime proxy HTML does not match the iframe backdrop contract.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasInvalidSourceBoundary(report)) {
    return {
      summary:
        "Runtime theme diagnostics came from a bundle without the iframe workspace background contract.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasInvalidOpenCodeDocumentBackdrop(report)) {
    return {
      summary:
        "Runtime OpenCode iframe document does not match the Obsidian workspace background contract.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasInvalidHostBackgroundLayer(report)) {
    return {
      summary: "Runtime Obsidian host pane is painting a backdrop outside the iframe.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasTransparentIframeCompositing(report)) {
    return {
      summary: "Runtime iframe is still using transparent compositing.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (hasBlackIframeHostPaint(report)) {
    return {
      summary: "Runtime OpenCode iframe element is still painting a black Obsidian backdrop.",
      actions: [
        "Run `bun run build`.",
        "Run `obsidian plugin:reload id=opencode-obsidian`.",
        "Open the OpenCode pane and rerun `bun run dev:theme`.",
      ],
    };
  }

  if (!report.http.ok) {
    const serverState = options.runtimeStatus?.serverState;
    if (serverState === "stopped" || report.http.status === 502) {
      return {
        summary:
          "Runtime proxy is reachable, but the OpenCode server behind it is not serving HTML.",
        actions: [
          "Run `obsidian command id=opencode-obsidian:start-opencode-server`.",
          "Then run `bun run dev:theme` before `--shutdown-after-last-client` exits the server.",
          "Use `bun run dev:theme:fixture` when you only need to verify current workspace theme code.",
        ],
      };
    }

    if (hasBackdropFilterSampling(report)) {
      return {
        summary: "Runtime OpenCode iframe still has backdrop-filter sampling enabled.",
        actions: [
          "Run `bun run build`.",
          "Run `obsidian plugin:reload id=opencode-obsidian`.",
          "Open the OpenCode pane and rerun `bun run dev:theme`.",
          "Inspect the failed `backdrop-filter sampling` check; it lists the remaining element or pseudo-element.",
        ],
      };
    }
    return {
      summary: "Runtime proxy HTML request failed.",
      actions: [
        `Run \`bun run dev:status --vault ${vault} --lines 40\`.`,
        "Inspect the `runtime.status.healthProbe` and recent proxy log entries.",
      ],
    };
  }

  if (!report.runtimeDiagnostics && isCollapsedIframeDiagnostics(report.iframeDiagnostics)) {
    return {
      summary:
        "Runtime proxy injection is valid, but the OpenCode iframe is inside a collapsed Obsidian pane.",
      actions: [
        "Open the OpenCode pane in Obsidian so the iframe has non-zero width and height.",
        "Run `obsidian command id=opencode-obsidian:open-opencode-view` to reveal the pane without toggling it closed.",
        "Rerun `bun run dev:theme` while the pane is visible.",
      ],
    };
  }

  if (!report.runtimeDiagnostics) {
    return {
      summary:
        "Runtime proxy injection is valid, but the iframe has not reported internal theme diagnostics.",
      actions: [
        "Keep the OpenCode pane visible and rerun `bun run dev:theme` after the iframe finishes loading.",
        "Use `obsidian command id=opencode-obsidian:open-opencode-view` when the pane state is unclear.",
        "Check `$XDG_STATE_HOME/opencode-obsidian/opencode-obsidian.log` for `theme diagnostics` entries.",
        "Use `bun run dev:theme:fixture` to isolate workspace code from Obsidian window state.",
      ],
    };
  }

  return {
    summary: "Runtime theme checks failed; inspect the failed check details above.",
    actions: ["Compare `runtimeDiagnostics.variables` with the injected `tokens` section."],
  };
}

function isCollapsedIframeDiagnostics(diagnostics: unknown): boolean {
  if (!diagnostics || typeof diagnostics !== "object") {
    return false;
  }

  const iframe = (diagnostics as any).iframe;
  const iframeArea = typeof iframe?.area === "number" ? iframe.area : null;
  if (iframeArea === 0) {
    return true;
  }

  const ancestors = Array.isArray((diagnostics as any).ancestors)
    ? (diagnostics as any).ancestors
    : [];
  return ancestors.some(
    (ancestor: any) =>
      typeof ancestor?.className === "string" &&
      ancestor.className.includes("is-sidedock-collapsed")
  );
}

function hasLegacyThemeDiagnostics(diagnostics: unknown): boolean {
  if (!diagnostics || typeof diagnostics !== "object") {
    return false;
  }

  const payload = diagnostics as any;
  return Array.isArray(payload.opaqueBackgrounds) && !Array.isArray(payload.visibleBackgrounds);
}

function hasStaleLoadedThemeBundle(report: ThemeReport): boolean {
  return report.checks.some((check) => {
    if (check.name !== "runtime iframe avoids transparent compositing" || check.ok) {
      return false;
    }

    const detail = check.detail;
    return Boolean(
      detail && typeof detail === "object" && (detail as any).allowTransparency === null
    );
  });
}

function hasTransparentIframeCompositing(report: ThemeReport): boolean {
  return report.checks.some(
    (check) => check.name === "runtime iframe avoids transparent compositing" && !check.ok
  );
}

function hasBlackIframeHostPaint(report: ThemeReport): boolean {
  return report.checks.some(
    (check) =>
      check.name === "runtime iframe element does not paint a black Obsidian backdrop" && !check.ok
  );
}

function hasMissingInlineThemeDiagnostics(report: ThemeReport): boolean {
  return report.checks.some(
    (check) => check.name === "runtime theme inline variables received" && !check.ok
  );
}

function hasPaintedProxyDocumentBackground(report: ThemeReport): boolean {
  return report.checks.some(
    (check) => check.name === proxyDocumentBackgroundCheckName && !check.ok
  );
}

function hasInvalidHostBackgroundLayer(report: ThemeReport): boolean {
  return report.checks.some((check) => check.name === obsidianHostBackgroundCheckName && !check.ok);
}

function hasInvalidOpenCodeDocumentBackdrop(report: ThemeReport): boolean {
  return report.checks.some((check) => {
    return check.name === openCodeDocumentBackgroundCheckName && !check.ok;
  });
}

function hasInvalidSourceBoundary(report: ThemeReport): boolean {
  return report.checks.some(
    (check) =>
      check.name === "runtime source boundary uses workspace background contract" && !check.ok
  );
}

function hasBackdropFilterSampling(report: ThemeReport): boolean {
  return report.checks.some(
    (check) => check.name === "iframe diagnostics report no backdrop-filter sampling" && !check.ok
  );
}

export function proxyDocumentBackgroundLayerCheck(body: string): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const requiredSnippets = [
    "#root",
    "--opencode-obsidian-page-background",
    "var(--opencode-obsidian-background-primary, transparent)",
    "background: transparent !important",
    "body::before",
    "left: 0;",
    "top: 0;",
    "width: 100vw;",
    "height: 100vh;",
    "background-repeat: var(--opencode-obsidian-workspace-background-repeat, no-repeat)",
    "--opencode-obsidian-workspace-background-position",
    "background-position: var(--opencode-obsidian-workspace-background-position, center)",
    "background-size: var(--opencode-obsidian-workspace-background-size, cover)",
    "background-image: var(--opencode-obsidian-workspace-background-image, none)",
    "opacity: var(--opencode-obsidian-workspace-background-opacity, 0)",
    "filter: var(--opencode-obsidian-workspace-background-filter, none)",
    "sourceBoundary:",
    "obsidian-workspace-background-v1",
    "injectionState: collectInjectionState()",
    "appearanceBackground: describePseudoElement(document.body, '::before')",
    "appearanceImageBackground: describePseudoElement(document.body, '::after')",
  ];
  const forbiddenSnippets = [
    "body::after",
    "--opencode-obsidian-iframe-page-background",
    "--opencode-obsidian-iframe-backdrop-left",
    "--opencode-obsidian-iframe-backdrop-top",
    "--opencode-obsidian-iframe-backdrop-width",
    "--opencode-obsidian-iframe-backdrop-height",
    "--opencode-obsidian-parent-viewport-width",
    "--opencode-obsidian-iframe-left",
    // Old projection/compositing contracts. If these return, the iframe is no
    // longer owning its local background and resize/focus artifacts can return.
    "--opencode-obsidian-workspace-background-plane",
    "sourceBoundary.plane",
    "plane:",
    "--opencode-obsidian-editor-background-image",
    "--opencode-obsidian-editor-background-opacity",
    "--opencode-obsidian-editor-background-position",
    "--opencode-obsidian-editor-background-bluriness",
    "var(--obsidian-editor-background-position, center)",
    "background-image: var(--obsidian-editor-background-image, none)",
    "opacity: var(--obsidian-editor-background-opacity, 0)",
    "filter: var(--obsidian-editor-background-bluriness, none)",
  ];
  const missingSnippets = requiredSnippets.filter((snippet) => !body.includes(snippet));
  const presentForbiddenSnippets = forbiddenSnippets.filter((snippet) => body.includes(snippet));

  return {
    name: proxyDocumentBackgroundCheckName,
    ok: missingSnippets.length === 0 && presentForbiddenSnippets.length === 0,
    detail: {
      missingSnippets,
      presentForbiddenSnippets,
    },
  };
}

export function proxyDisablesBackdropFilterSamplingCheck(body: string): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const requiredSnippets = [
    'html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] *',
    'html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] *::before',
    'html[data-opencode-obsidian-appearance="obsidian"][data-opencode-obsidian-workspace-background="enabled"] *::after',
    "-webkit-backdrop-filter: none !important",
    "backdrop-filter: none !important",
  ];
  const missingSnippets = requiredSnippets.filter((snippet) => !body.includes(snippet));

  return {
    name: "proxy disables iframe backdrop-filter sampling in Obsidian appearance",
    ok: missingSnippets.length === 0,
    detail: {
      missingSnippets,
    },
  };
}

function backdropFilterSamplesCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const payload = diagnostics && typeof diagnostics === "object" ? (diagnostics as any) : null;
  const samples = Array.isArray(payload?.backdropFilterSamples)
    ? payload.backdropFilterSamples
    : null;
  const workspaceBackgroundState = themeWorkspaceBackgroundState(diagnostics);
  const backgroundSamplingUnsafe = workspaceBackgroundState === "enabled";

  return {
    name: "iframe diagnostics report no backdrop-filter sampling",
    ok:
      Array.isArray(samples) &&
      typeof workspaceBackgroundState === "string" &&
      (!backgroundSamplingUnsafe || samples.length === 0),
    detail: {
      hasSamplesField: Array.isArray(samples),
      workspaceBackgroundState,
      backgroundSamplingUnsafe,
      sampleCount: Array.isArray(samples) ? samples.length : null,
      samples: Array.isArray(samples) ? samples.slice(0, 8).map(summarizeBackdropFilterSample) : [],
    },
  };
}

export interface ThemeBoundarySources {
  stylesCss: string;
  proxyInjectionTs: string;
  webViewThemeTs: string;
}

export function readThemeBoundarySources(): ThemeBoundarySources {
  return {
    stylesCss: readFileSync(themeBoundaryFiles.stylesCss, "utf8"),
    proxyInjectionTs: readFileSync(themeBoundaryFiles.proxyInjectionTs, "utf8"),
    webViewThemeTs: readFileSync(themeBoundaryFiles.webViewThemeTs, "utf8"),
  };
}

export function themeSourceBoundaryChecks(sources: ThemeBoundarySources): ThemeReport["checks"] {
  const stylesForbidden = forbiddenStyleMatches(sources.stylesCss);
  const proxyForbidden = forbiddenProxyMatches(sources.proxyInjectionTs);
  const themeForbidden = forbiddenThemeBridgeMatches(sources.webViewThemeTs);

  return [
    {
      name: "source boundary keeps the Obsidian host backdrop inactive",
      ok: stylesForbidden.length === 0,
      detail: {
        file: themeBoundaryFiles.stylesCss,
        forbidden: stylesForbidden,
      },
    },
    {
      name: "source boundary keeps iframe backdrop on the workspace background surface",
      ok: proxyForbidden.length === 0,
      detail: {
        file: themeBoundaryFiles.proxyInjectionTs,
        forbidden: proxyForbidden,
      },
    },
    {
      name: "source boundary keeps theme bridge on token surfaces",
      ok: themeForbidden.length === 0,
      detail: {
        file: themeBoundaryFiles.webViewThemeTs,
        forbidden: themeForbidden,
      },
    },
  ];
}

function forbiddenStyleMatches(source: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    [
      "Do not use background-attachment: fixed in the plugin host background layer.",
      /background-attachment\s*:\s*fixed/i,
    ],
    [
      "Do not add iframe pseudo background layers in plugin CSS.",
      /\.opencode-iframe::(?:before|after)/,
    ],
    ["Do not add hidden probe iframes for compositor diagnostics.", /\.opencode-iframe-probe/],
  ];
  return matchingPatternMessages(source, patterns);
}

function forbiddenProxyMatches(source: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    [
      "Do not use hidden probe iframes or srcdoc probes for compositor diagnostics.",
      /srcdocProbe|probeIframe/,
    ],
    ...forbiddenOpenCodeInternalSelectorPatterns(),
  ];
  return matchingPatternMessages(source, patterns);
}

function forbiddenThemeBridgeMatches(source: string): string[] {
  const patterns: Array<[string, RegExp]> = [...forbiddenOpenCodeInternalSelectorPatterns()];
  return matchingPatternMessages(source, patterns);
}

function forbiddenOpenCodeInternalSelectorPatterns(): Array<[string, RegExp]> {
  return [
    [
      "Do not patch OpenCode dialog/settings component selectors from the theme bridge.",
      /(?:dialog-v2|settings-v2|\[data-component=["']dialog-v2["']|\[data-variant=["']settings["'])/,
    ],
  ];
}

function matchingPatternMessages(source: string, patterns: Array<[string, RegExp]>): string[] {
  return patterns.filter(([, pattern]) => pattern.test(source)).map(([message]) => message);
}

export function extractInjectedTheme(
  body: string
): { colorScheme?: unknown; variables?: Record<string, string> } | null {
  const match = body.match(/var theme = (\{[\s\S]*?\});/);
  if (!match) {
    return null;
  }
  try {
    const payload = JSON.parse(match[1]);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function pickVariables(
  variables: Record<string, string>,
  names: string[]
): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, variables[name] ?? null]));
}

function themeDiagnosticsVariables(diagnostics: unknown): Record<string, string> {
  return themeDiagnosticsCustomProperties(diagnostics, "variables");
}

function themeDiagnosticsInlineVariables(diagnostics: unknown): Record<string, string> {
  return themeDiagnosticsCustomProperties(diagnostics, "inlineVariables");
}

function themeWorkspaceBackgroundState(diagnostics: unknown): string | null {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const payload = diagnostics as any;
  const sourceBoundaryState = payload.sourceBoundary?.workspaceBackgroundState;
  if (typeof sourceBoundaryState === "string" && sourceBoundaryState.length > 0) {
    return sourceBoundaryState;
  }

  const variables = themeDiagnosticsVariables(diagnostics);
  const variableState = variables["--opencode-obsidian-workspace-background-state"];
  return typeof variableState === "string" && variableState.length > 0 ? variableState : null;
}

function themeDiagnosticsCustomProperties(
  diagnostics: unknown,
  field: "variables" | "inlineVariables"
): Record<string, string> {
  const variables =
    diagnostics && typeof diagnostics === "object" ? (diagnostics as any)[field] : null;
  if (!variables || typeof variables !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(variables).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function editorBackgroundVariableNames(variables: Record<string, unknown>): string[] {
  return Object.keys(variables).filter((name) =>
    name.startsWith("--opencode-obsidian-editor-background-")
  );
}

function summarizeThemeDiagnostics(diagnostics: unknown): unknown {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const payload = diagnostics as any;
  const variables = themeDiagnosticsVariables(diagnostics);
  const roots = Array.isArray(payload.roots) ? payload.roots : [];
  const visibleBackgrounds = Array.isArray(payload.visibleBackgrounds)
    ? payload.visibleBackgrounds
    : [];
  const backdropFilterSamples = Array.isArray(payload.backdropFilterSamples)
    ? payload.backdropFilterSamples
    : [];

  return {
    reason: typeof payload.reason === "string" ? payload.reason : null,
    url: typeof payload.url === "string" ? payload.url : null,
    viewport: payload.viewport && typeof payload.viewport === "object" ? payload.viewport : null,
    observedOpenCodeTheme:
      payload.observedOpenCodeTheme && typeof payload.observedOpenCodeTheme === "object"
        ? payload.observedOpenCodeTheme
        : null,
    variables: {
      rootBackground: pickVariables(variables, [
        "--background-base",
        "--v2-background-bg-base",
        "--v2-background-bg-deep",
      ]),
      surfaces: pickVariables(variables, [
        "--background-bg-layer-01",
        "--surface-raised-base",
        "--input-base",
      ]),
      textAndBorder: pickVariables(variables, ["--text-text-base", "--border-border-base"]),
    },
    roots: roots.map(summarizeBackgroundSample),
    appearanceBackground:
      payload.appearanceBackground && typeof payload.appearanceBackground === "object"
        ? payload.appearanceBackground
        : null,
    visibleBackgrounds: {
      count: visibleBackgrounds.length,
      largest: visibleBackgrounds
        .slice()
        .sort((left: any, right: any) => (right?.area ?? 0) - (left?.area ?? 0))
        .slice(0, 6)
        .map(summarizeBackgroundSample),
    },
    backdropFilterSamples: {
      count: backdropFilterSamples.length,
      samples: backdropFilterSamples.slice(0, 6).map(summarizeBackdropFilterSample),
    },
  };
}

function summarizeIframeDiagnostics(diagnostics: unknown): unknown {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const payload = diagnostics as any;
  const ancestors = Array.isArray(payload.ancestors) ? payload.ancestors : [];
  const interestingAncestors = ancestors.filter((ancestor: any) => {
    const className = typeof ancestor?.className === "string" ? ancestor.className : "";
    return (
      className.includes("opencode") ||
      className.includes("workspace-leaf") ||
      className.includes("app-container")
    );
  });

  return {
    reason: typeof payload.reason === "string" ? payload.reason : null,
    appearance: typeof payload.appearance === "string" ? payload.appearance : null,
    iframe: summarizeBackgroundSample(payload.iframe),
    appearanceBackground:
      payload.appearanceBackground && typeof payload.appearanceBackground === "object"
        ? payload.appearanceBackground
        : null,
    appearanceImageBackground:
      payload.appearanceImageBackground && typeof payload.appearanceImageBackground === "object"
        ? payload.appearanceImageBackground
        : null,
    workspaceFocus:
      payload.workspaceFocus && typeof payload.workspaceFocus === "object"
        ? summarizeWorkspaceFocus(payload.workspaceFocus)
        : null,
    themeSync: summarizeThemeSyncHistory(payload),
    externalEditorBackground: summarizeExternalEditorBackground(payload),
    editorBackgroundVariables:
      payload.editorBackgroundVariables && typeof payload.editorBackgroundVariables === "object"
        ? payload.editorBackgroundVariables
        : null,
    ancestorCount: ancestors.length,
    ancestors: interestingAncestors.map(summarizeBackgroundSample),
  };
}

function obsidianAppearanceBackgroundCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const name = obsidianHostBackgroundCheckName;
  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      name,
      ok: false,
      detail: "No iframe composition diagnostics available.",
    };
  }

  const payload = diagnostics as any;
  const variables =
    payload.editorBackgroundVariables && typeof payload.editorBackgroundVariables === "object"
      ? (payload.editorBackgroundVariables as Record<string, unknown>)
      : {};
  const expectedImage = cssString(variables["--obsidian-editor-background-image"]);
  const expectedOpacity = cssString(variables["--obsidian-editor-background-opacity"]);
  const expectedOpacityNumber =
    expectedOpacity === null ? null : Number.parseFloat(expectedOpacity);
  const hasEditorBackground = Boolean(
    expectedImage &&
    !isCssNone(expectedImage) &&
    (expectedOpacityNumber === null || expectedOpacityNumber > 0)
  );
  const root =
    payload.appearanceRoot && typeof payload.appearanceRoot === "object"
      ? (payload.appearanceRoot as Record<string, unknown>)
      : null;
  const actualRootBackground = cssString(root?.backgroundColor);
  const hostRootTransparent = isTransparentCssColor(actualRootBackground);
  const baseLayer =
    payload.appearanceBackground && typeof payload.appearanceBackground === "object"
      ? (payload.appearanceBackground as Record<string, unknown>)
      : null;
  const imageLayer =
    payload.appearanceImageBackground && typeof payload.appearanceImageBackground === "object"
      ? (payload.appearanceImageBackground as Record<string, unknown>)
      : null;
  const actualContent = cssString(baseLayer?.content);
  const actualImageContent = cssString(imageLayer?.content);
  const actualImage = cssString(baseLayer?.backgroundImage);
  const actualBackgroundColor = cssString(baseLayer?.backgroundColor);
  const actualAfterImage = cssString(imageLayer?.backgroundImage);
  const actualAfterOpacity = cssString(imageLayer?.opacity);
  const actualAfterBackgroundColor = cssString(imageLayer?.backgroundColor);
  const baseLayerInactive = isPseudoLayerInactive(
    actualContent,
    actualBackgroundColor,
    actualImage
  );
  const imageLayerInactive = isPseudoLayerInactive(
    actualImageContent,
    actualAfterBackgroundColor,
    actualAfterImage
  );
  const hostBackdropInactive = hostRootTransparent && baseLayerInactive && imageLayerInactive;

  return {
    name,
    ok: hostBackdropInactive,
    detail: {
      hasEditorBackground,
      actualRootBackground,
      hostRootTransparent,
      expectedImage,
      expectedOpacity,
      actualContent,
      actualImageContent,
      actualImage,
      actualBackgroundColor,
      actualAfterImage,
      actualAfterOpacity,
      actualAfterBackgroundColor,
      baseLayerInactive,
      imageLayerInactive,
      hostBackdropInactive,
      appearanceRoot: root,
      editorBackgroundVariables: variables,
      appearanceBackground: baseLayer,
      appearanceImageBackground: imageLayer,
    },
  };
}

function iframeAvoidsTransparentCompositingCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const name = "runtime iframe avoids transparent compositing";
  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      name,
      ok: false,
      detail: "No iframe composition diagnostics available.",
    };
  }

  const iframe = (diagnostics as any).iframe;
  const allowTransparency =
    iframe && typeof iframe === "object" ? cssString(iframe.allowTransparency) : null;

  return {
    name,
    ok: allowTransparency !== "true",
    detail: {
      allowTransparency,
    },
  };
}

function iframeAvoidsBlackHostPaintCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const name = "runtime iframe element does not paint a black Obsidian backdrop";
  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      name,
      ok: false,
      detail: "No iframe composition diagnostics available.",
    };
  }

  const iframe = (diagnostics as any).iframe;
  const backgroundColor =
    iframe && typeof iframe === "object" ? cssString(iframe.backgroundColor) : null;
  const backgroundAlpha = cssAlphaValue(backgroundColor);
  const transparent = backgroundAlpha === 0;

  return {
    name,
    ok: transparent,
    detail: {
      backgroundColor,
      backgroundAlpha,
      transparent,
      iframe,
    },
  };
}

function openCodeDocumentBackgroundLayerCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const name = openCodeDocumentBackgroundCheckName;
  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      name,
      ok: false,
      detail: "No theme diagnostics available.",
    };
  }

  const payload = diagnostics as any;
  const baseLayer =
    payload.appearanceBackground && typeof payload.appearanceBackground === "object"
      ? (payload.appearanceBackground as Record<string, unknown>)
      : null;
  const afterLayer =
    payload.appearanceImageBackground && typeof payload.appearanceImageBackground === "object"
      ? (payload.appearanceImageBackground as Record<string, unknown>)
      : null;
  const actualImage = cssString(baseLayer?.backgroundImage);
  const actualOpacity = cssString(baseLayer?.opacity);
  const actualOpacityNumber = actualOpacity === null ? null : Number.parseFloat(actualOpacity);
  const actualBeforeContent = cssString(baseLayer?.content);
  const actualBackgroundPosition = cssString(baseLayer?.backgroundPosition);
  const actualBackgroundSize = cssString(baseLayer?.backgroundSize);
  const actualBackgroundRepeat = cssString(baseLayer?.backgroundRepeat);
  const actualBackgroundBlendMode = cssString(baseLayer?.backgroundBlendMode);
  const actualImageLayers = cssTopLevelList(actualImage);
  const actualBackgroundPositionLayers = cssTopLevelList(actualBackgroundPosition);
  const actualBackgroundSizeLayers = cssTopLevelList(actualBackgroundSize);
  const actualBackgroundRepeatLayers = cssTopLevelList(actualBackgroundRepeat);
  const actualBackgroundBlendModeLayers = cssTopLevelList(actualBackgroundBlendMode);
  const actualAfterContent = cssString(afterLayer?.content);
  const actualPseudoBackgroundColor = cssString(baseLayer?.backgroundColor);
  const actualAfterImage = cssString(afterLayer?.backgroundImage);
  const actualAfterBackgroundColor = cssString(afterLayer?.backgroundColor);
  const viewport =
    payload.viewport && typeof payload.viewport === "object"
      ? (payload.viewport as Record<string, unknown>)
      : {};
  const viewportWidth = typeof viewport.width === "number" ? viewport.width : null;
  const viewportHeight = typeof viewport.height === "number" ? viewport.height : null;
  const variables =
    payload.variables && typeof payload.variables === "object"
      ? (payload.variables as Record<string, unknown>)
      : {};
  const inlineVariables =
    payload.inlineVariables && typeof payload.inlineVariables === "object"
      ? (payload.inlineVariables as Record<string, unknown>)
      : {};
  const forbiddenRuntimeVariables = editorBackgroundVariableNames(variables);
  const forbiddenInlineVariables = editorBackgroundVariableNames(inlineVariables);
  const expectedImage =
    cssString(variables["--opencode-obsidian-workspace-background-image"]) ??
    cssString(variables["--obsidian-workspace-background-image"]);
  const expectedOpacity =
    cssString(variables["--opencode-obsidian-workspace-background-opacity"]) ??
    cssString(variables["--obsidian-workspace-background-opacity"]);
  const expectedBackgroundPosition =
    cssString(variables["--opencode-obsidian-workspace-background-position"]) ??
    cssString(variables["--obsidian-workspace-background-position"]);
  const expectedBackgroundSize =
    cssString(variables["--opencode-obsidian-workspace-background-size"]) ??
    cssString(variables["--obsidian-workspace-background-size"]);
  const expectedBackgroundBlendMode =
    cssString(variables["--opencode-obsidian-workspace-background-blend-mode"]) ??
    cssString(variables["--obsidian-workspace-background-blend-mode"]);
  const expectedOpacityNumber =
    expectedOpacity === null ? null : Number.parseFloat(expectedOpacity);
  const workspaceBackgroundState = themeWorkspaceBackgroundState(diagnostics);
  const hasWorkspaceBackground = Boolean(
    workspaceBackgroundState === "enabled" &&
    expectedImage &&
    !isCssNone(expectedImage) &&
    (expectedOpacityNumber === null || expectedOpacityNumber > 0)
  );
  const htmlRoot = findRuntimeRoot(payload.roots, "html");
  const bodyRoot = findRuntimeRoot(payload.roots, "body");
  const appRoot = findRuntimeRoot(payload.roots, "div", "root");
  const documentRoots = [htmlRoot, bodyRoot, appRoot].filter(
    (root): root is Record<string, unknown> => Boolean(root)
  );
  const sourceBoundary =
    payload.sourceBoundary && typeof payload.sourceBoundary === "object"
      ? (payload.sourceBoundary as Record<string, unknown>)
      : {};
  const beforeLayerInactive = isPseudoLayerInactive(
    actualBeforeContent,
    actualPseudoBackgroundColor,
    actualImage
  );
  const beforeLayerUsesSingleImage =
    hasWorkspaceBackground &&
    actualImageLayers.length === 1 &&
    actualBackgroundPositionLayers.length === 1 &&
    actualBackgroundSizeLayers.length === 1;
  const beforeLayerUsesStableComposition =
    !hasWorkspaceBackground ||
    (actualBackgroundRepeatLayers.length === 1 &&
      isNoRepeatBackground(actualBackgroundRepeatLayers[0]) &&
      actualBackgroundBlendModeLayers.length === 1);
  const beforeLayerImageMatches =
    hasWorkspaceBackground &&
    beforeLayerUsesSingleImage &&
    cssUrlEquivalent(actualImageLayers[0], expectedImage);
  const beforeLayerBlendMatches =
    !hasWorkspaceBackground ||
    expectedBackgroundBlendMode === null ||
    actualBackgroundBlendModeLayers[0] === expectedBackgroundBlendMode ||
    isNormalBlendMode(actualBackgroundBlendModeLayers[0]);
  const beforeLayerActive = hasWorkspaceBackground
    ? actualBeforeContent !== null &&
      actualBeforeContent !== "none" &&
      actualBeforeContent !== "normal" &&
      beforeLayerImageMatches &&
      opacityEquivalent(actualOpacityNumber, expectedOpacityNumber) &&
      cssAlphaValue(actualPseudoBackgroundColor) === 0
    : false;
  const beforeLayerValid = hasWorkspaceBackground ? beforeLayerActive : beforeLayerInactive;
  const beforeLayerPositionValid =
    !hasWorkspaceBackground ||
    expectedBackgroundPosition === null ||
    backgroundPositionEquivalent(actualBackgroundPosition ?? undefined, expectedBackgroundPosition);
  const beforeLayerSizeValid =
    !hasWorkspaceBackground ||
    expectedBackgroundSize === null ||
    actualBackgroundSize === expectedBackgroundSize;
  const afterLayerInactive = isPseudoLayerInactive(
    actualAfterContent,
    actualAfterBackgroundColor,
    actualAfterImage
  );
  const htmlBodyUseObsidianBase = Boolean(
    htmlRoot &&
    bodyRoot &&
    isPaintedRuntimeRoot(htmlRoot) &&
    isPaintedRuntimeRoot(bodyRoot) &&
    isCssNoneValue(cssString(htmlRoot.backgroundImage)) &&
    isCssNoneValue(cssString(bodyRoot.backgroundImage))
  );
  const appRootTransparent = Boolean(
    appRoot &&
    cssAlphaValue(cssString(appRoot.backgroundColor)) === 0 &&
    isCssNoneValue(cssString(appRoot.backgroundImage))
  );
  const documentBackdropStable = Boolean(
    htmlBodyUseObsidianBase &&
    appRootTransparent &&
    beforeLayerValid &&
    beforeLayerUsesStableComposition &&
    beforeLayerBlendMatches &&
    beforeLayerPositionValid &&
    beforeLayerSizeValid &&
    afterLayerInactive &&
    forbiddenRuntimeVariables.length === 0 &&
    forbiddenInlineVariables.length === 0
  );

  return {
    name,
    ok: documentBackdropStable,
    detail: {
      actualImage,
      actualImageLayers,
      actualOpacity,
      actualOpacityNumber,
      actualBeforeContent,
      actualBackgroundPosition,
      actualBackgroundPositionLayers,
      actualBackgroundSize,
      actualBackgroundSizeLayers,
      actualBackgroundRepeat,
      actualBackgroundRepeatLayers,
      actualBackgroundBlendMode,
      actualBackgroundBlendModeLayers,
      actualAfterContent,
      actualPseudoBackgroundColor,
      actualAfterImage,
      actualAfterBackgroundColor,
      viewportWidth,
      viewportHeight,
      expectedImage,
      expectedOpacity,
      expectedBackgroundPosition,
      expectedBackgroundSize,
      expectedBackgroundBlendMode,
      workspaceBackgroundState,
      hasWorkspaceBackground,
      sourceBoundary,
      forbiddenRuntimeVariables,
      forbiddenInlineVariables,
      documentRoots,
      htmlBodyUseObsidianBase,
      appRootTransparent,
      beforeLayerInactive,
      beforeLayerUsesSingleImage,
      beforeLayerImageMatches,
      beforeLayerUsesStableComposition,
      beforeLayerActive,
      beforeLayerValid,
      beforeLayerBlendMatches,
      beforeLayerPositionValid,
      beforeLayerSizeValid,
      afterLayerInactive,
      documentBackdropStable,
      appearanceBackground: baseLayer,
      appearanceImageBackground: afterLayer,
    },
  };
}

function sourceBoundaryContractCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const name = "runtime source boundary uses workspace background contract";
  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      name,
      ok: false,
      detail: "No theme diagnostics available.",
    };
  }

  const payload = diagnostics as any;
  const sourceBoundary =
    payload.sourceBoundary && typeof payload.sourceBoundary === "object"
      ? (payload.sourceBoundary as Record<string, unknown>)
      : null;
  const variables =
    payload.variables && typeof payload.variables === "object"
      ? (payload.variables as Record<string, unknown>)
      : {};
  const inlineVariables =
    payload.inlineVariables && typeof payload.inlineVariables === "object"
      ? (payload.inlineVariables as Record<string, unknown>)
      : {};
  const forbiddenRuntimeVariables = editorBackgroundVariableNames(variables);
  const forbiddenInlineVariables = editorBackgroundVariableNames(inlineVariables);
  const workspaceBackgroundState = themeWorkspaceBackgroundState(diagnostics);
  const expectedImage =
    cssString(variables["--opencode-obsidian-workspace-background-image"]) ??
    cssString(variables["--obsidian-workspace-background-image"]);
  const expectedOpacity =
    cssString(variables["--opencode-obsidian-workspace-background-opacity"]) ??
    cssString(variables["--obsidian-workspace-background-opacity"]);
  const expectedOpacityNumber =
    expectedOpacity === null ? null : Number.parseFloat(expectedOpacity);
  const hasWorkspaceBackground = Boolean(
    workspaceBackgroundState === "enabled" &&
    expectedImage &&
    !isCssNone(expectedImage) &&
    (expectedOpacityNumber === null || expectedOpacityNumber > 0)
  );
  const paintedBackgroundImage = cssString(sourceBoundary?.paintedBackgroundImage);
  const contractOk = sourceBoundary?.contract === "obsidian-workspace-background-v1";
  const stateOk = workspaceBackgroundState === "enabled" || workspaceBackgroundState === "disabled";
  const imageOk = hasWorkspaceBackground
    ? cssUrlEquivalent(paintedBackgroundImage, expectedImage)
    : isCssNoneValue(paintedBackgroundImage);
  const sourceOk = stateOk && sourceBoundary?.activeEditorProjected === false && imageOk;

  return {
    name,
    ok:
      contractOk &&
      sourceOk &&
      forbiddenRuntimeVariables.length === 0 &&
      forbiddenInlineVariables.length === 0,
    detail: {
      sourceBoundary,
      workspaceBackgroundState,
      expectedImage,
      expectedOpacity,
      hasWorkspaceBackground,
      paintedBackgroundImage,
      contractOk,
      stateOk,
      imageOk,
      forbiddenRuntimeVariables,
      forbiddenInlineVariables,
    },
  };
}

function cssPixelValue(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(-?[0-9.]+)px$/);
  return match ? Number.parseFloat(match[1]) : null;
}

function backgroundPositionEquivalent(actual: string | undefined, expected: string): boolean {
  if (!actual) {
    return false;
  }

  return normalizeBackgroundPosition(actual) === normalizeBackgroundPosition(expected);
}

function normalizeBackgroundPosition(value: string): string {
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return singleBackgroundPositionKeyword(parts[0]) ?? parts[0];
  }

  if (parts.length === 2) {
    const [first, second] = parts;
    const horizontalFirst = horizontalPositionValue(first);
    const verticalFirst = verticalPositionValue(first);
    const horizontalSecond = horizontalPositionValue(second);
    const verticalSecond = verticalPositionValue(second);

    if (horizontalFirst && verticalSecond) {
      return `${horizontalFirst} ${verticalSecond}`;
    }
    if (horizontalSecond && verticalFirst) {
      return `${horizontalSecond} ${verticalFirst}`;
    }
  }

  return parts.join(" ");
}

function singleBackgroundPositionKeyword(value: string): string | null {
  switch (value) {
    case "center":
      return "50% 50%";
    case "left":
      return "0% 50%";
    case "right":
      return "100% 50%";
    case "top":
      return "50% 0%";
    case "bottom":
      return "50% 100%";
    default:
      return null;
  }
}

function horizontalPositionValue(value: string): string | null {
  switch (value) {
    case "left":
      return "0%";
    case "center":
      return "50%";
    case "right":
      return "100%";
    default:
      return value.endsWith("%") || value.endsWith("px") ? value : null;
  }
}

function verticalPositionValue(value: string): string | null {
  switch (value) {
    case "top":
      return "0%";
    case "center":
      return "50%";
    case "bottom":
      return "100%";
    default:
      return value.endsWith("%") || value.endsWith("px") ? value : null;
  }
}

function isIframeViewportLayer(
  left: number | null,
  top: number | null,
  width: number | null,
  height: number | null,
  viewportWidth: number | null,
  viewportHeight: number | null
): boolean {
  if (
    left === null ||
    top === null ||
    width === null ||
    height === null ||
    viewportWidth === null ||
    viewportHeight === null
  ) {
    return false;
  }

  return (
    Math.abs(left) < 1 &&
    Math.abs(top) < 1 &&
    Math.abs(width - viewportWidth) < 1 &&
    Math.abs(height - viewportHeight) < 1
  );
}

function backgroundImageRectFromCss(
  backgroundPosition: string | null,
  backgroundSize: string | null
): BackdropImageRect | null {
  const position = cssPixelPair(backgroundPosition);
  const size = cssPixelPair(backgroundSize);

  if (!position || !size) {
    return null;
  }

  const [left, top] = position;
  const [width, height] = size;

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function backgroundImageViewportGaps(
  rect: BackdropImageRect | null,
  viewportWidth: number | null,
  viewportHeight: number | null
): { left: number; top: number; right: number; bottom: number } | null {
  if (!rect || viewportWidth === null || viewportHeight === null) {
    return null;
  }

  return {
    left: Math.max(0, rect.left),
    top: Math.max(0, rect.top),
    right: Math.max(0, viewportWidth - rect.right),
    bottom: Math.max(0, viewportHeight - rect.bottom),
  };
}

function isPaintedRuntimeRoot(root: Record<string, unknown>): boolean {
  return (
    cssAlphaValue(cssString(root.backgroundColor)) !== 0 ||
    !isCssNoneValue(cssString(root.backgroundImage))
  );
}

interface BackdropImageRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function cssPixelPair(value: string | null): [number, number] | null {
  if (!value) {
    return null;
  }

  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const first = cssPixelValue(parts[0]);
  const second = cssPixelValue(parts[1]);

  return first === null || second === null ? null : [first, second];
}

function findRuntimeRoot(roots: unknown, tag: string, id?: string): Record<string, unknown> | null {
  if (!Array.isArray(roots)) {
    return null;
  }
  const root = roots.find((item) => {
    return (
      item &&
      typeof item === "object" &&
      (item as any).tag === tag &&
      (typeof id === "undefined" || (item as any).id === id)
    );
  });
  return root && typeof root === "object" ? (root as Record<string, unknown>) : null;
}

function editorBackgroundVariablesObservedCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const name = "runtime Obsidian editor background variables are observed in parent diagnostics";
  if (!diagnostics || typeof diagnostics !== "object") {
    return {
      name,
      ok: false,
      detail: "No iframe composition diagnostics available.",
    };
  }

  const payload = diagnostics as any;
  const variables =
    payload.editorBackgroundVariables && typeof payload.editorBackgroundVariables === "object"
      ? (payload.editorBackgroundVariables as Record<string, unknown>)
      : {};
  const expectedImage = cssString(variables["--obsidian-editor-background-image"]);
  const expectedOpacity = cssString(variables["--obsidian-editor-background-opacity"]);

  return {
    name,
    ok: Object.keys(variables).length > 0,
    detail: {
      parentHasEditorBackground: Boolean(expectedImage && !isCssNone(expectedImage)),
      expectedImage,
      expectedOpacity,
      parentEditorBackgroundVariables: variables,
    },
  };
}

function externalEditorBackgroundDiagnosticsCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const detail = summarizeExternalEditorBackground(diagnostics);

  return {
    name: "advisory: runtime parent editor background layers are visible",
    ok: true,
    detail:
      detail ?? "No parent editor background layer was captured in iframe composition diagnostics.",
  };
}

function workspaceFocusCoherenceCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const detail = summarizeWorkspaceFocus(
    diagnostics && typeof diagnostics === "object" ? (diagnostics as any).workspaceFocus : null
  ) as any;

  return {
    name: "advisory: runtime iframe focus and Obsidian active leaf are visible",
    ok: true,
    detail:
      detail ?? "No workspace focus diagnostics were captured in iframe composition diagnostics.",
  };
}

function themeSyncHistoryDiagnosticsCheck(diagnostics: unknown): {
  name: string;
  ok: boolean;
  detail?: unknown;
} {
  const detail = summarizeThemeSyncHistory(diagnostics, { includeRecent: true });
  const invalidZeroRectPosts = zeroRectPostedImagePaintUpdates(diagnostics);

  return {
    name: "advisory: runtime theme sync history is visible",
    ok: invalidZeroRectPosts.length === 0,
    detail: detail
      ? {
          ...(detail as Record<string, unknown>),
          invalidZeroRectPostedPaintUpdates: invalidZeroRectPosts,
        }
      : "No theme sync history was captured in iframe composition diagnostics.",
  };
}

function summarizeExternalEditorBackground(diagnostics: unknown): unknown {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const payload = diagnostics as any;
  const layers = Array.isArray(payload.externalEditorBackgroundLayers)
    ? payload.externalEditorBackgroundLayers
        .map(summarizeExternalEditorBackgroundLayer)
        .filter(Boolean)
    : [];
  const activeLayers = layers.filter((layer: any) => layer?.before?.active || layer?.after?.active);
  const rules = Array.isArray(payload.externalEditorBackgroundRules)
    ? payload.externalEditorBackgroundRules.map((rule: any) => ({
        href: typeof rule?.href === "string" ? rule.href : null,
        owner: typeof rule?.owner === "string" ? rule.owner : null,
        text: typeof rule?.text === "string" ? rule.text : null,
      }))
    : [];

  return {
    observedActiveLayer: activeLayers.length > 0,
    layerCount: layers.length,
    activeLayerCount: activeLayers.length,
    layers,
    rules,
  };
}

function summarizeWorkspaceFocus(focus: unknown): unknown {
  if (!focus || typeof focus !== "object") {
    return null;
  }

  const payload = focus as any;
  return {
    documentHasFocus:
      typeof payload.documentHasFocus === "boolean" ? payload.documentHasFocus : null,
    activeLeafViewType:
      typeof payload.activeLeafViewType === "string" ? payload.activeLeafViewType : null,
    openCodeLeafIsActive:
      typeof payload.openCodeLeafIsActive === "boolean" ? payload.openCodeLeafIsActive : null,
    iframeIsDocumentActiveElement:
      typeof payload.iframeIsDocumentActiveElement === "boolean"
        ? payload.iframeIsDocumentActiveElement
        : null,
    focusedIframeWithoutActiveOpenCodeLeaf:
      typeof payload.focusedIframeWithoutActiveOpenCodeLeaf === "boolean"
        ? payload.focusedIframeWithoutActiveOpenCodeLeaf
        : null,
    activeElement: summarizeBackgroundSample(payload.activeElement),
    activeLeafView: summarizeBackgroundSample(payload.activeLeafView),
    openCodeLeafView: summarizeBackgroundSample(payload.openCodeLeafView),
    activeLeafRoot: summarizeBackgroundSample(payload.activeLeafRoot),
    openCodeLeafRoot: summarizeBackgroundSample(payload.openCodeLeafRoot),
  };
}

function summarizeThemeSyncHistory(
  diagnostics: unknown,
  options: { includeRecent?: boolean } = {}
): unknown {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const payload = diagnostics as any;
  const history = Array.isArray(payload.themeSyncHistory)
    ? payload.themeSyncHistory.filter((event: unknown) => event && typeof event === "object")
    : [];
  const scheduled = history.filter((event: any) => event.phase === "scheduled");
  const posted = history.filter((event: any) => event.phase === "posted");
  const skipped = history.filter((event: any) => event.phase === "skipped");
  const changedPosts = posted.filter((event: any) => event.changed === true);
  const unchangedPosts = posted.filter((event: any) => event.changed === false);

  const summary: Record<string, unknown> = {
    eventCount: history.length,
    scheduledCount: scheduled.length,
    postedCount: posted.length,
    skippedCount: skipped.length,
    changedPostCount: changedPosts.length,
    unchangedPostCount: unchangedPosts.length,
    uniquePostedFingerprintCount: uniqueStrings(
      posted.map((event: any) => stringOrNull(event.fingerprint))
    ).length,
    reasonCounts: countStrings(history.map((event: any) => stringOrNull(event.reason))),
  };
  if (options.includeRecent === true) {
    summary.recent = history.slice(-12).map(summarizeThemeSyncEvent);
  }
  return summary;
}

function zeroRectPostedImagePaintUpdates(diagnostics: unknown): unknown[] {
  if (!diagnostics || typeof diagnostics !== "object") {
    return [];
  }

  const payload = diagnostics as any;
  const history = Array.isArray(payload.themeSyncHistory)
    ? payload.themeSyncHistory.filter((event: unknown) => event && typeof event === "object")
    : [];

  return history
    .filter((event: any) => {
      if (event.phase !== "posted") {
        return false;
      }

      const width = typeof event.iframe?.width === "number" ? event.iframe.width : null;
      const height = typeof event.iframe?.height === "number" ? event.iframe.height : null;
      return width !== null && height !== null && (width <= 0 || height <= 0);
    })
    .map(summarizeThemeSyncEvent);
}

function summarizeThemeSyncEvent(event: unknown): unknown {
  if (!event || typeof event !== "object") {
    return null;
  }

  const payload = event as any;
  return {
    sequence: typeof payload.sequence === "number" ? payload.sequence : null,
    phase: stringOrNull(payload.phase),
    reason: stringOrNull(payload.reason),
    changed: typeof payload.changed === "boolean" ? payload.changed : null,
    cause: stringOrNull(payload.cause),
    clearedTimerCount:
      typeof payload.clearedTimerCount === "number" ? payload.clearedTimerCount : null,
    fingerprint: stringOrNull(payload.fingerprint),
    syncVisibility: stringOrNull(payload.syncVisibility),
    iframe:
      payload.iframe && typeof payload.iframe === "object"
        ? {
            left: typeof payload.iframe.left === "number" ? payload.iframe.left : null,
            top: typeof payload.iframe.top === "number" ? payload.iframe.top : null,
            width: typeof payload.iframe.width === "number" ? payload.iframe.width : null,
            height: typeof payload.iframe.height === "number" ? payload.iframe.height : null,
          }
        : null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function countStrings(values: Array<string | null>): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    if (!value) {
      return counts;
    }

    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeExternalEditorBackgroundLayer(layer: unknown): unknown {
  if (!layer || typeof layer !== "object") {
    return null;
  }

  const payload = layer as any;
  return {
    selector: typeof payload.selector === "string" ? payload.selector : null,
    element: summarizeBackgroundSample(payload.element),
    variables:
      payload.variables && typeof payload.variables === "object" ? payload.variables : null,
    before: summarizePseudoBackground(payload.before),
    after: summarizePseudoBackground(payload.after),
  };
}

function summarizePseudoBackground(pseudo: unknown): unknown {
  if (!pseudo || typeof pseudo !== "object") {
    return null;
  }

  const payload = pseudo as any;
  const content = cssString(payload.content);
  const backgroundImage = cssString(payload.backgroundImage);
  const backgroundColor = cssString(payload.backgroundColor);
  const active = Boolean(
    content &&
    content !== "none" &&
    content !== "normal" &&
    (!isCssNoneValue(backgroundImage) || cssAlphaValue(backgroundColor) !== 0)
  );

  return {
    active,
    content,
    backgroundColor,
    backgroundImage,
    opacity: cssString(payload.opacity),
    position: cssString(payload.position),
    zIndex: cssString(payload.zIndex),
    filter: cssString(payload.filter),
  };
}

function cssString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cssTopLevelList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const items: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      const item = current.trim();
      if (item) {
        items.push(item);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const item = current.trim();
  if (item) {
    items.push(item);
  }
  return items;
}

function cssUrlEquivalent(actual: string | null, expected: string | null): boolean {
  if (!actual || !expected) {
    return actual === expected;
  }
  return normalizeCssUrl(actual) === normalizeCssUrl(expected);
}

function normalizeCssUrl(value: string): string {
  return value
    .trim()
    .replace(/^url\((.*)\)$/i, "$1")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function opacityEquivalent(actual: number | null, expected: number | null): boolean {
  if (expected === null) {
    return actual !== null && actual > 0;
  }
  return actual !== null && Math.abs(actual - expected) < 0.001;
}

function isCssNone(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "none" || normalized === "initial" || normalized === "unset";
}

function isCssNoneValue(value: string | null): boolean {
  return value === null || isCssNone(value);
}

function isNoRepeatBackground(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "no-repeat" || normalized === "no-repeat no-repeat";
}

function isNormalBlendMode(value: string | null): boolean {
  return value?.trim().toLowerCase() === "normal";
}

function isPseudoLayerInactive(
  content: string | null,
  backgroundColor: string | null,
  backgroundImage: string | null
): boolean {
  const hasContent = content !== null && content !== "none" && content !== "normal";
  const hasBackgroundColor = cssAlphaValue(backgroundColor) !== 0;
  const hasBackgroundImage = !isCssNoneValue(backgroundImage);
  return !hasContent || (!hasBackgroundColor && !hasBackgroundImage);
}

function cssAlphaValue(value: string | null): number | null {
  if (!value) {
    return 0;
  }

  const color = value.trim().toLowerCase();
  if (color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return 0;
  }

  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)$/);
  if (rgba) {
    return Number.parseFloat(rgba[1]);
  }

  const slashAlpha = color.match(/\/\s*([0-9.]+)\s*\)?$/);
  if (slashAlpha) {
    return Number.parseFloat(slashAlpha[1]);
  }

  if (color.startsWith("rgb(") || color.startsWith("#") || color.startsWith("color(")) {
    return 1;
  }

  return null;
}

function isTransparentCssColor(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    normalized === "transparent" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    /^rgba\([^)]*,\s*0\)$/.test(normalized) ||
    /\/\s*0\)?$/.test(normalized)
  );
}

function summarizeBackdropFilterSample(sample: unknown): unknown {
  if (!sample || typeof sample !== "object") {
    return null;
  }

  const payload = sample as any;
  return {
    owner: summarizeBackgroundSample(payload.owner),
    pseudoElement: typeof payload.pseudoElement === "string" ? payload.pseudoElement : null,
    backdropFilter: typeof payload.backdropFilter === "string" ? payload.backdropFilter : null,
    webkitBackdropFilter:
      typeof payload.webkitBackdropFilter === "string" ? payload.webkitBackdropFilter : null,
    area: typeof payload.area === "number" ? payload.area : null,
  };
}

function summarizeBackgroundSample(sample: unknown): unknown {
  if (!sample || typeof sample !== "object") {
    return null;
  }

  const payload = sample as any;
  return {
    tag: payload.tag ?? null,
    id: payload.id ?? null,
    className: typeof payload.className === "string" ? compactClassName(payload.className) : null,
    dataType: payload.dataType ?? null,
    dataComponent: payload.dataComponent ?? null,
    backgroundColor: typeof payload.backgroundColor === "string" ? payload.backgroundColor : null,
    backgroundImage: typeof payload.backgroundImage === "string" ? payload.backgroundImage : null,
    area: typeof payload.area === "number" ? payload.area : null,
  };
}

function compactClassName(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length <= 8 ? parts.join(" ") : `${parts.slice(0, 8).join(" ")} ...`;
}

function emptyThemeTokens(): ThemeReport["tokens"] {
  return {
    rootBackground: {},
    surfaces: {},
    textAndBorder: {},
  };
}

function themeMode(value: unknown): ThemeMode {
  return value === "obsidian" || value === "opencode" ? value : "unknown";
}
