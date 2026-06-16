import { describe, expect, test } from "bun:test";
import { homedir } from "os";
import { join } from "path";
import {
  defaultOpenCodeSourcePath,
  defaultVaultPath,
  expandHomePath,
  formatHomePath,
  pluginDir,
  resolveHarnessPath,
} from "../../scripts/harness/pathHelpers";

describe("harness path helpers", () => {
  test("expandHomePath accepts ~ as a normal harness path", () => {
    expect(expandHomePath("~")).toBe(homedir());
    expect(expandHomePath("~/obsidian")).toBe(join(homedir(), "obsidian"));
    expect(resolveHarnessPath("~/obsidian")).toBe(join(homedir(), "obsidian"));
  });

  test("formatHomePath prints user-local paths with ~", () => {
    expect(formatHomePath(join(homedir(), "obsidian"))).toBe("~/obsidian");
    expect(formatHomePath("/tmp/obsidian")).toBe("/tmp/obsidian");
  });

  test("default path selection uses env first and home-relative defaults otherwise", () => {
    expect(defaultVaultPath({ ANOTHER_OPENCODE_FOR_OBSIDIAN_VAULT: "~/vault" })).toBe(
      join(homedir(), "vault")
    );
    expect(defaultOpenCodeSourcePath({ OPENCODE_SOURCE: "~/opencode" })).toBe(
      join(homedir(), "opencode")
    );
    expect(defaultVaultPath({})).toBe(join(homedir(), "obsidian"));
    expect(defaultOpenCodeSourcePath({})).toBe(join(homedir(), "Projects/ai-cli/opencode"));
  });

  test("pluginDir remains the single vault plugin path constructor", () => {
    expect(pluginDir("/vault")).toBe("/vault/.obsidian/plugins/another-opencode-for-obsidian");
  });
});
