import { describe, expect, test } from "bun:test";
import { collectEnvironmentDiagnostics } from "../../src/server/EnvironmentDiagnostics";

describe("EnvironmentDiagnostics", () => {
  test("captures the PATH visible to the Obsidian process", () => {
    const diagnostics = collectEnvironmentDiagnostics({
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      SHELL: "/bin/zsh",
      HOME: "/Users/alice",
      OPENAI_API_KEY: "sk-not-copied",
    });

    expect(diagnostics.pathKey).toBe("PATH");
    expect(diagnostics.path).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
    expect(diagnostics.pathEntries).toEqual(["/usr/bin", "/bin", "/usr/sbin", "/sbin"]);
    expect(diagnostics.shell).toBe("/bin/zsh");
    expect(diagnostics.envKeys).toEqual(["HOME", "OPENAI_API_KEY", "PATH", "SHELL"]);
    expect(diagnostics.secretLikeEnvKeys).toEqual(["OPENAI_API_KEY"]);
    expect(JSON.stringify(diagnostics)).not.toContain("sk-not-copied");
  });
});
