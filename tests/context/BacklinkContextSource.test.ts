import { describe, expect, test } from "bun:test";
import {
  BacklinkContextSource,
  formatBacklinkContext,
  getBacklinks,
} from "../../src/context/BacklinkContextSource";
import type { ContextItem } from "../../src/types";

const item: ContextItem = {
  id: "ctx-1",
  type: "auto",
  label: "Backlinks: target.md",
  text: "backlinks",
  sourceFile: "target.md",
  createdAt: 123,
};

describe("BacklinkContextSource", () => {
  test("finds backlinks from Obsidian resolvedLinks", () => {
    expect(
      getBacklinks("target.md", {
        "a.md": { "target.md": 2 },
        "b.md": { "other.md": 1 },
        "c.md": { "target.md": 1 },
      })
    ).toEqual([
      { sourcePath: "a.md", count: 2 },
      { sourcePath: "c.md", count: 1 },
    ]);
  });

  test("formats backlink context with escaped file attributes", () => {
    expect(formatBacklinkContext('target "quote".md', [{ sourcePath: "source.md", count: 2 }]))
      .toBe(`<obsidian-backlinks file="target &quot;quote&quot;.md">
- source.md (2)
</obsidian-backlinks>`);
  });

  test("adds changed backlink context and skips duplicate fingerprints", async () => {
    const calls: string[] = [];
    const source = new BacklinkContextSource({
      isEnabled: () => true,
      addBacklinks: async (params) => {
        calls.push(params.text);
        return item;
      },
      removeBacklinks: async () => true,
    });
    const resolvedLinks: Record<string, Record<string, number>> = {
      "source.md": { "target.md": 2 },
    };

    await source.refresh("target.md", resolvedLinks);
    await source.refresh("target.md", resolvedLinks);
    resolvedLinks["other.md"] = { "target.md": 1 };
    await source.refresh("target.md", resolvedLinks);

    expect(calls).toEqual([
      `<obsidian-backlinks file="target.md">
- source.md (2)
</obsidian-backlinks>`,
      `<obsidian-backlinks file="target.md">
- other.md (1)
- source.md (2)
</obsidian-backlinks>`,
    ]);
  });

  test("does not mark backlinks as handled when add fails", async () => {
    const calls: string[] = [];
    let accepted = false;
    const source = new BacklinkContextSource({
      isEnabled: () => true,
      addBacklinks: async (params) => {
        calls.push(params.filePath);
        return accepted ? item : null;
      },
      removeBacklinks: async () => true,
    });
    const resolvedLinks = { "source.md": { "target.md": 1 } };

    await source.refresh("target.md", resolvedLinks);
    accepted = true;
    await source.refresh("target.md", resolvedLinks);

    expect(calls).toEqual(["target.md", "target.md"]);
  });

  test("removes stale backlink context when the active note has no backlinks", async () => {
    const removed: string[] = [];
    const source = new BacklinkContextSource({
      isEnabled: () => true,
      addBacklinks: async () => item,
      removeBacklinks: async (filePath) => {
        removed.push(filePath);
        return true;
      },
    });

    await source.refresh("target.md", {});
    await source.refresh("target.md", {});

    expect(removed).toEqual(["target.md"]);
  });
});
