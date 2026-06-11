import { describe, expect, test } from "bun:test";
import { CursorContextSource, formatCursorContext } from "../../src/context/CursorContextSource";
import type { ContextItem } from "../../src/types";

const item: ContextItem = {
  id: "ctx-1",
  type: "auto",
  label: "Cursor: target.md:3:5",
  text: "cursor",
  sourceFile: "target.md",
  createdAt: 123,
};

describe("CursorContextSource", () => {
  test("formats cursor context with escaped file attributes", () => {
    expect(formatCursorContext({ sourcePath: 'target "quote".md', line: 3, column: 5 })).toBe(
      '<obsidian-cursor file="target &quot;quote&quot;.md" line="3" column="5" />'
    );
  });

  test("adds changed cursor context and skips duplicate fingerprints", async () => {
    const calls: string[] = [];
    const source = new CursorContextSource({
      isEnabled: () => true,
      addCursor: async (cursor) => {
        calls.push(formatCursorContext(cursor));
        return item;
      },
      removeCursor: async () => true,
    });

    await source.refresh({ sourcePath: "target.md", line: 3, column: 5 });
    await source.refresh({ sourcePath: "target.md", line: 3, column: 5 });
    await source.refresh({ sourcePath: "target.md", line: 4, column: 1 });

    expect(calls).toEqual([
      '<obsidian-cursor file="target.md" line="3" column="5" />',
      '<obsidian-cursor file="target.md" line="4" column="1" />',
    ]);
  });

  test("does not mark cursor as handled when add fails", async () => {
    const calls: string[] = [];
    let accepted = false;
    const source = new CursorContextSource({
      isEnabled: () => true,
      addCursor: async (cursor) => {
        calls.push(cursor.sourcePath);
        return accepted ? item : null;
      },
      removeCursor: async () => true,
    });

    await source.refresh({ sourcePath: "target.md", line: 3, column: 5 });
    accepted = true;
    await source.refresh({ sourcePath: "target.md", line: 3, column: 5 });

    expect(calls).toEqual(["target.md", "target.md"]);
  });

  test("removes stale cursor context when active cursor disappears", async () => {
    const removed: string[] = [];
    const source = new CursorContextSource({
      isEnabled: () => true,
      addCursor: async () => item,
      removeCursor: async () => {
        removed.push("cursor");
        return true;
      },
    });

    await source.refresh(null);
    await source.refresh(null);

    expect(removed).toEqual(["cursor", "cursor"]);
  });
});
