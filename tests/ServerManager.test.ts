import { describe, expect, test } from "bun:test";
import { ServerManager } from "../src/server/ServerManager";
import type { OpenCodeSettings } from "../src/types";

function createTestSettings(port = 15000): OpenCodeSettings {
  return {
    port,
    hostname: "127.0.0.1",
    autoStart: false,
    opencodePath: "opencode",
    projectDirectory: "",
    startupTimeout: 10000,
    defaultViewLocation: "sidebar",
    injectWorkspaceContext: true,
    autoAddSelectionContext: false,
    autoAddBacklinksContext: false,
    autoAddCursorContext: false,
    maxNotesInContext: 20,
    maxSelectionLength: 2000,
    customCommand: "",
    useCustomCommand: false,
    webViewAppearance: "obsidian",
    lastSessionUrl: "",
  };
}

describe("ServerManager", () => {
  test("starts in stopped state with empty process diagnostics", () => {
    const manager = new ServerManager(createTestSettings(), "/vault");

    expect(manager.getState()).toBe("stopped");
    expect(manager.getPid()).toBeNull();
    expect(manager.getLastError()).toBeNull();
    expect(manager.getLastHealthError()).toBeNull();
    expect(manager.getDiagnostics()).toMatchObject({
      state: "stopped",
      lastCommand: null,
      lastDisplayCommand: null,
      lastStartMode: null,
      lastUsesShell: null,
      lastCwd: null,
      lastResolvedExecutable: null,
    });
  });

  test("returns UI and health URLs from the configured endpoint", () => {
    const settings = createTestSettings(15123);
    const manager = new ServerManager(settings, "/Users/oujinsai/Projects/opencode-obsidian");

    expect(manager.getUrl()).toBe(
      `http://127.0.0.1:15123/${Buffer.from("/Users/oujinsai/Projects/opencode-obsidian").toString(
        "base64"
      )}`
    );
    expect(manager.getHealthUrl()).toBe("http://127.0.0.1:15123/global/health");
  });

  test("updates project directory without starting a process", () => {
    const manager = new ServerManager(createTestSettings(), "/old-vault");
    const observed: string[] = [];
    manager.on("projectDirectoryChanged", (directory) => observed.push(directory));

    manager.updateProjectDirectory("/new-vault");

    expect(observed).toEqual(["/new-vault"]);
    expect(manager.getUrl()).toBe(
      `http://127.0.0.1:15000/${Buffer.from("/new-vault").toString("base64")}`
    );
    expect(manager.getPid()).toBeNull();
  });

  test("stop is a no-op when no process is running", async () => {
    const manager = new ServerManager(createTestSettings(), "/vault");

    await manager.stop();

    expect(manager.getState()).toBe("stopped");
    expect(manager.getPid()).toBeNull();
  });

  test("getUrl handles unicode project directories", () => {
    const paths = ["C:/用户/Notes", "/home/ユーザー/ノート", "/home/user/📁Notes"];

    for (const path of paths) {
      const manager = new ServerManager(createTestSettings(), path);

      expect(manager.getUrl()).toBe(
        `http://127.0.0.1:15000/${Buffer.from(path).toString("base64")}`
      );
    }
  });
});
