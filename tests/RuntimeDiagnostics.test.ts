import { describe, expect, test } from "bun:test";
import { getRuntimePaths } from "../src/debug/RuntimeDiagnostics";

describe("RuntimeDiagnostics", () => {
  test("uses XDG_STATE_HOME as the runtime state root", () => {
    const paths = getRuntimePaths({
      XDG_STATE_HOME: "/tmp/another-opencode-for-obsidian-state",
    });

    expect(paths.stateDir).toBe(
      "/tmp/another-opencode-for-obsidian-state/another-opencode-for-obsidian"
    );
    expect(paths.logFile).toBe(
      "/tmp/another-opencode-for-obsidian-state/another-opencode-for-obsidian/another-opencode-for-obsidian.log"
    );
    expect(paths.statusFile).toBe(
      "/tmp/another-opencode-for-obsidian-state/another-opencode-for-obsidian/status.json"
    );
  });
});
