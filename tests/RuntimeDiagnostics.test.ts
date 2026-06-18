import { describe, expect, test } from "bun:test";
import { join } from "path";
import { getRuntimePaths } from "../src/debug/RuntimeDiagnostics";

describe("RuntimeDiagnostics", () => {
  test("uses XDG_STATE_HOME as the runtime state root", () => {
    const stateRoot = "/tmp/another-opencode-for-obsidian-state";
    const paths = getRuntimePaths({
      XDG_STATE_HOME: stateRoot,
    });
    const stateDir = join(stateRoot, "another-opencode-for-obsidian");

    expect(paths.stateDir).toBe(stateDir);
    expect(paths.logFile).toBe(join(stateDir, "another-opencode-for-obsidian.log"));
    expect(paths.statusFile).toBe(join(stateDir, "status.json"));
  });
});
