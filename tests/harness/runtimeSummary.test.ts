import { describe, expect, test } from "bun:test";
import {
  parseLogEntry,
  summarizeLogEvents,
  summarizeLogLine,
  summarizeRuntimeStatus,
  summarizeSettings,
} from "../../scripts/harness/runtimeSummary";

describe("summarizeSettings", () => {
  test("reports the service selection and context assist settings", () => {
    expect(
      summarizeSettings({
        serviceName: "service-zom.json",
        projectDirectory: "/Users/alice/Notes",
        defaultViewLocation: "main",
        webViewAppearance: "obsidian",
        lastSessionUrl: "http://127.0.0.1:4097/server/abc",
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
    ).toEqual({
      serviceName: "service-zom.json",
      projectDirectory: "/Users/alice/Notes",
      defaultViewLocation: "main",
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
      lastSessionUrl: "http://127.0.0.1:4097/server/abc",
    });
  });

  test("ignores retired start-mode settings", () => {
    const summary = summarizeSettings({
      port: 4096,
      hostname: "127.0.0.1",
      autoStart: true,
      useCustomCommand: true,
      customCommand: "opencode serve --hostname {hostname} --port {port}",
      opencodePath: "opencode",
    });

    expect(summary).toMatchObject({
      serviceName: null,
      defaultViewLocation: undefined,
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
    expect(JSON.stringify(summary)).not.toContain("customCommand");
    expect(JSON.stringify(summary)).not.toContain("autoStart");
  });
});

describe("summarizeRuntimeStatus", () => {
  test("keeps service facts while shortening large diagnostic fields", () => {
    const summary = summarizeRuntimeStatus({
      serviceState: "unavailable",
      service: null,
      serviceError: "no reachable service among service.json in /state/opencode",
      runtimeDiagnostics: {
        theme: {
          variables: {
            "--background-base": "rgba(0, 0, 0, 0.25)",
          },
        },
      },
    });

    expect(summary.serviceState).toBe("unavailable");
    expect(summary.service).toBeNull();
    expect(summary.serviceError).toContain("no reachable service");
    expect(summary.runtimeDiagnostics).toEqual({
      theme: { keys: ["variables"] },
    });
  });
});

describe("runtime log summaries", () => {
  test("parses runtime JSON log entries and summarizes important events", () => {
    const lines = [
      JSON.stringify({
        time: "2026-06-11T21:00:00.000Z",
        level: "info",
        component: "plugin",
        message: "attached opencode service",
        data: { service: { name: "service.json", version: "2.1.3", pid: 96699 } },
      }),
      JSON.stringify({
        time: "2026-06-11T21:00:01.000Z",
        level: "warn",
        component: "plugin",
        message: "prompt context sync failed",
        data: { reason: "bridge timeout" },
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
      component: "plugin",
      message: "attached opencode service",
    });
    expect(summarizeLogLine("plain stderr fallback")).toEqual({ raw: "plain stderr fallback" });
    expect(summarizeLogEvents(lines)).toMatchObject({
      linesScanned: 4,
      parsedLines: 3,
      byLevel: { info: 2, warn: 1 },
      byComponent: { plugin: 3 },
      lastProblem: {
        level: "warn",
        component: "plugin",
        message: "prompt context sync failed",
      },
      lastThemeDiagnostics: {
        level: "info",
        component: "plugin",
        message: "theme diagnostics",
      },
    });
  });
});
