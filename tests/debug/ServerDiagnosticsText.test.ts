import { describe, expect, test } from "bun:test";
import {
  formatServerDiagnosticsForClipboard,
  formatStartFailureNotice,
  type ServerDiagnosticsSnapshot,
} from "../../src/debug/ServerDiagnosticsText";

function diagnostics(
  overrides: Partial<ServerDiagnosticsSnapshot> = {}
): ServerDiagnosticsSnapshot {
  return {
    state: "error",
    lastError: "Process exited unexpectedly (exit code 127): opencode missing from gui shell",
    lastHealthError: "http://127.0.0.1:4096/global/health is not reachable: ECONNREFUSED",
    lastCommand: "opencode",
    lastCommandArgs: ["serve", "--hostname", "127.0.0.1", "--port", "4096"],
    lastDisplayCommand: "opencode serve --hostname 127.0.0.1 --port 4096",
    lastStartMode: "custom",
    lastUsesShell: true,
    lastCwd: "/Users/alice/Notes",
    lastStdout: null,
    lastStderr: "opencode missing from gui shell",
    lastExitCode: 127,
    lastExitSignal: null,
    lastProcessErrorStack: null,
    processEnvironment: {
      platform: "darwin",
      pathKey: "PATH",
      path: "/usr/bin:/bin",
      pathEntries: ["/usr/bin", "/bin"],
      shell: "/bin/zsh",
      envKeys: ["HOME", "OPENAI_API_KEY", "PATH", "SHELL"],
      secretLikeEnvKeys: ["OPENAI_API_KEY"],
    },
    lastSpawnEnvironment: {
      platform: "darwin",
      pathKey: "PATH",
      path: "/usr/bin:/bin",
      pathEntries: ["/usr/bin", "/bin"],
      shell: "/bin/zsh",
      envKeys: ["HOME", "NODE_USE_SYSTEM_CA", "OPENAI_API_KEY", "PATH", "SHELL"],
      secretLikeEnvKeys: ["OPENAI_API_KEY"],
    },
    lastResolvedExecutable: null,
    hint: "Custom command exited with 127. Check the executable path visible to Obsidian.",
    logFile:
      "/Users/alice/.local/state/another-opencode-for-obsidian/another-opencode-for-obsidian.log",
    statusFile: "/Users/alice/.local/state/another-opencode-for-obsidian/status.json",
    ...overrides,
  };
}

describe("ServerDiagnosticsText", () => {
  test("formats the same server diagnostics for copyable issue evidence", () => {
    const text = formatServerDiagnosticsForClipboard(diagnostics());
    const payload = JSON.parse(text);

    expect(payload.lastError).toContain("exit code 127");
    expect(payload.hint).toContain("executable path");
    expect(payload.lastCommand).toBe("opencode");
    expect(payload.lastUsesShell).toBe(true);
    expect(payload.lastCommandArgs).toEqual(["serve", "--hostname", "127.0.0.1", "--port", "4096"]);
    expect(payload.lastStderr).toBe("opencode missing from gui shell");
    expect(payload.processEnvironment.path).toBe("/usr/bin:/bin");
    expect(payload.lastSpawnEnvironment.envKeys).toContain("NODE_USE_SYSTEM_CA");
    expect(payload.processEnvironment.secretLikeEnvKeys).toEqual(["OPENAI_API_KEY"]);
    expect(JSON.stringify(payload)).not.toContain("sk-");
    expect(payload.logFile).toBe(
      "/Users/alice/.local/state/another-opencode-for-obsidian/another-opencode-for-obsidian.log"
    );
    expect(payload.statusFile).toBe(
      "/Users/alice/.local/state/another-opencode-for-obsidian/status.json"
    );
  });

  test("makes start failure notices point to the diagnostics command and XDG log", () => {
    const notice = formatStartFailureNotice(diagnostics());

    expect(notice).toContain("OpenCode failed to start");
    expect(notice).toContain("Copy OpenCode diagnostics");
    expect(notice).toContain(
      "/Users/alice/.local/state/another-opencode-for-obsidian/another-opencode-for-obsidian.log"
    );
  });
});
