import { describe, expect, test } from "bun:test";
import {
  buildReloadExpression,
  defaultDevtoolsListUrl,
  findObsidianPageTarget,
} from "../../scripts/harness/obsidianReload";

describe("obsidian reload harness", () => {
  test("uses the configured Chrome DevTools port", () => {
    expect(defaultDevtoolsListUrl(9444)).toBe("http://127.0.0.1:9444/json/list");
  });

  test("finds the Obsidian page target before iframe and worker targets", () => {
    const target = findObsidianPageTarget([
      {
        type: "iframe",
        url: "http://127.0.0.1:4097/session/ses_test",
        webSocketDebuggerUrl: "ws://iframe",
      },
      {
        type: "worker",
        url: "",
        webSocketDebuggerUrl: "ws://worker",
      },
      {
        id: "page",
        title: "Vault - Obsidian",
        type: "page",
        url: "app://obsidian.md/index.html",
        webSocketDebuggerUrl: "ws://page",
      },
    ]);

    expect(target?.id).toBe("page");
    expect(target?.webSocketDebuggerUrl).toBe("ws://page");
  });

  test("generated reload script uses plugin lifecycle APIs", () => {
    const expression = buildReloadExpression({
      pluginId: "another-opencode-for-obsidian",
      settleMs: 123,
      openView: true,
      restartServer: true,
    });

    expect(expression).toContain("obsidianApp.plugins.disablePlugin(pluginId)");
    expect(expression).toContain("obsidianApp.plugins.enablePlugin(pluginId)");
    expect(expression).toContain("beforePlugin.stopServer");
    expect(expression).toContain("plugin.startServer");
    expect(expression).toContain("open-opencode-view");
    expect(expression).toContain("iframeUrls");
    expect(expression).not.toContain("localStorage");
    expect(expression).not.toContain("sessionStorage");
  });
});
