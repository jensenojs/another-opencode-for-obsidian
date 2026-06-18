import { describe, expect, test } from "bun:test";
import { delimiter } from "path";
import { collectEnvironmentDiagnostics } from "../../src/server/EnvironmentDiagnostics";

describe("EnvironmentDiagnostics", () => {
  test("captures the PATH visible to the Obsidian process", () => {
    const pathEntries = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
    const path = pathEntries.join(delimiter);
    const diagnostics = collectEnvironmentDiagnostics({
      PATH: path,
      SHELL: "/bin/zsh",
      HOME: "/Users/alice",
      OPENAI_API_KEY: "sk-not-copied",
    });

    expect(diagnostics.pathKey).toBe("PATH");
    expect(diagnostics.path).toBe(path);
    expect(diagnostics.pathEntries).toEqual(pathEntries);
    expect(diagnostics.shell).toBe("/bin/zsh");
    expect(diagnostics.envKeys).toEqual(["HOME", "OPENAI_API_KEY", "PATH", "SHELL"]);
    expect(diagnostics.secretLikeEnvKeys).toEqual(["OPENAI_API_KEY"]);
    expect(JSON.stringify(diagnostics)).not.toContain("sk-not-copied");
  });
});
