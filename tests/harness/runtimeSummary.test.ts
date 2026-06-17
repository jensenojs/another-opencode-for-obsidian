import { describe, expect, test } from "bun:test";
import {
  parseLogEntry,
  summarizeEnvironmentDiagnostics,
  summarizeLogEvents,
  summarizeLogLine,
  summarizeRuntimeStatus,
  summarizeSettings,
} from "../../scripts/harness/runtimeSummary";

describe("summarizeSettings", () => {
  test("reports the effective custom command mode from the shared settings helpers", () => {
    expect(
      summarizeSettings({
        port: 4096,
        hostname: "127.0.0.1",
        autoStart: true,
        useCustomCommand: true,
        customCommand: "opencode serve --hostname {hostname} --port {port}",
        webViewAppearance: "obsidian",
        contextAssist: {
          enabled: true,
          workspace: {
            enabled: true,
            maxOpenNotes: 3,
            includeActiveLocation: true,
          },
          selection: {
            enabled: true,
            maxSnippets: 3,
            maxCharsPerSnippet: 500,
          },
        },
      })
    ).toMatchObject({
      port: 4096,
      hostname: "127.0.0.1",
      autoStart: true,
      useCustomCommand: true,
      explicitCustomCommand: "opencode serve --hostname {hostname} --port {port}",
      effectiveStartMode: "custom",
      webViewAppearance: "obsidian",
      contextAssist: {
        enabled: true,
        workspace: {
          enabled: true,
          maxOpenNotes: 3,
          includeActiveLocation: true,
        },
        selection: {
          enabled: true,
          maxSnippets: 3,
          maxCharsPerSnippet: 500,
        },
      },
    });
  });

  test("ignores legacy context booleans", () => {
    const summary = summarizeSettings({
      injectWorkspaceContext: true,
      autoAddSelectionContext: false,
      autoAddBacklinksContext: true,
      autoAddCursorContext: false,
    });

    expect(summary).toMatchObject({
      contextAssist: {
        enabled: null,
        workspace: {
          enabled: null,
          maxOpenNotes: null,
          includeActiveLocation: null,
        },
        selection: {
          enabled: null,
          maxSnippets: null,
          maxCharsPerSnippet: null,
        },
      },
    });
    expect(JSON.stringify(summary)).not.toContain("legacyContextSourceBooleans");
    expect(JSON.stringify(summary)).not.toContain("injectWorkspaceContext");
  });

  test("reports missing context assist settings as unknown", () => {
    expect(
      summarizeSettings({
        hostname: "127.0.0.1",
      })
    ).toMatchObject({
      contextAssist: {
        enabled: null,
        workspace: {
          enabled: null,
          maxOpenNotes: null,
          includeActiveLocation: null,
        },
        selection: {
          enabled: null,
          maxSnippets: null,
          maxCharsPerSnippet: null,
        },
      },
    });
  });
});

describe("summarizeRuntimeStatus", () => {
  test("keeps status shape while shortening large diagnostic fields", () => {
    const summary = summarizeRuntimeStatus({
      serverState: "error",
      lastStdout: "ok",
      lastStderr: "x".repeat(260),
      lastProcessErrorStack: {
        name: "Error",
        frames: ["a", "b", "c", "d"],
      },
      runtimeDiagnostics: {
        theme: {
          variables: {
            "--background-base": "rgba(0, 0, 0, 0.25)",
          },
        },
      },
    });

    expect(summary.serverState).toBe("error");
    expect(summary.lastStdout).toBe("ok");
    expect(summary.lastStderr).toHaveLength(240);
    expect(summary.lastStderr.endsWith("...")).toBe(true);
    expect(summary.lastProcessErrorStack).toEqual({
      name: "Error",
      frames: { count: 4 },
    });
    expect(summary.runtimeDiagnostics).toEqual({
      theme: { keys: ["variables"] },
    });
  });

  test("summarizes process environment diagnostics without env values", () => {
    const environment = {
      platform: "darwin",
      pathKey: "PATH",
      path: "/usr/bin:/bin",
      pathEntries: ["/usr/bin", "/bin"],
      shell: "/bin/zsh",
      envKeys: ["HOME", "OPENAI_API_KEY", "PATH", "SHELL"],
      secretLikeEnvKeys: ["OPENAI_API_KEY"],
    };

    expect(summarizeEnvironmentDiagnostics(environment)).toEqual({
      platform: "darwin",
      pathKey: "PATH",
      path: "/usr/bin:/bin",
      pathEntries: ["/usr/bin", "/bin"],
      shell: "/bin/zsh",
      envKeyCount: 4,
      envKeySample: ["HOME", "OPENAI_API_KEY", "PATH", "SHELL"],
      secretLikeEnvKeys: ["OPENAI_API_KEY"],
    });

    const summary = summarizeRuntimeStatus({
      processEnvironment: environment,
      lastSpawnEnvironment: environment,
    });
    expect(summary.processEnvironment.envKeyCount).toBe(4);
    expect(JSON.stringify(summary)).not.toContain("sk-");
  });
});

describe("runtime log summaries", () => {
  test("parses runtime JSON log entries and summarizes important events", () => {
    const lines = [
      JSON.stringify({
        time: "2026-06-11T21:00:00.000Z",
        level: "info",
        component: "server",
        message: "starting server",
        data: { command: "opencode serve", args: ["serve"] },
      }),
      JSON.stringify({
        time: "2026-06-11T21:00:01.000Z",
        level: "warn",
        component: "server",
        message: "process stderr",
        data: { text: "warning" },
      }),
      JSON.stringify({
        time: "2026-06-11T21:00:02.000Z",
        level: "info",
        component: "plugin",
        message: "theme diagnostics",
        data: { variables: { "--background-base": "rgba(0, 0, 0, 0.25)" } },
      }),
      "plain stderr fallback",
    ];

    expect(parseLogEntry(lines[0])).toMatchObject({
      level: "info",
      component: "server",
      message: "starting server",
    });
    expect(summarizeLogLine("plain stderr fallback")).toEqual({ raw: "plain stderr fallback" });
    expect(summarizeLogEvents(lines)).toMatchObject({
      linesScanned: 4,
      parsedLines: 3,
      byLevel: { info: 2, warn: 1 },
      byComponent: { server: 2, plugin: 1 },
      lastProblem: {
        level: "warn",
        component: "server",
        message: "process stderr",
      },
      lastServerStart: {
        level: "info",
        component: "server",
        message: "starting server",
      },
      lastStderr: {
        level: "warn",
        component: "server",
        message: "process stderr",
      },
      lastThemeDiagnostics: {
        level: "info",
        component: "plugin",
        message: "theme diagnostics",
      },
    });
  });
});
