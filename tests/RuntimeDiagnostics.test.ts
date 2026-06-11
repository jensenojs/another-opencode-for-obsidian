import { describe, expect, test } from "bun:test";
import { getRuntimePaths } from "../src/debug/RuntimeDiagnostics";

describe("RuntimeDiagnostics", () => {
  test("uses XDG_STATE_HOME as the runtime state root", () => {
    const paths = getRuntimePaths({
      XDG_STATE_HOME: "/tmp/opencode-obsidian-state",
    });

    expect(paths.stateDir).toBe("/tmp/opencode-obsidian-state/opencode-obsidian");
    expect(paths.logFile).toBe(
      "/tmp/opencode-obsidian-state/opencode-obsidian/opencode-obsidian.log"
    );
    expect(paths.statusFile).toBe("/tmp/opencode-obsidian-state/opencode-obsidian/status.json");
  });
});
