import { describe, expect, test } from "bun:test";
import { ContextAutoSources } from "../../src/context/ContextAutoSources";
import type { ContextItem } from "../../src/types";

const item: ContextItem = {
  id: "ctx-1",
  type: "auto",
  label: "Auto",
  text: "text",
  sourceFile: "note.md",
  createdAt: 123,
};

describe("ContextAutoSources", () => {
  test("routes editor changes through selection, backlinks, and cursor sources", async () => {
    const calls: string[] = [];
    const sources = new ContextAutoSources({
      isSelectionEnabled: () => true,
      isBacklinksEnabled: () => true,
      isCursorEnabled: () => true,
      addSelection: async (selection) => {
        calls.push(`selection:${selection.text}`);
        return { ...item, type: "manual" };
      },
      addBacklinks: async (filePath, text) => {
        calls.push(`backlinks:${filePath}:${text.includes("<obsidian-backlinks")}`);
        return item;
      },
      removeBacklinks: async () => {
        calls.push("remove-backlinks");
        return true;
      },
      addCursor: async (cursor) => {
        calls.push(`cursor:${cursor.sourcePath}:${cursor.line}:${cursor.column}`);
        return item;
      },
      removeCursor: async () => {
        calls.push("remove-cursor");
        return true;
      },
      getResolvedLinks: () => ({
        "source.md": {
          "note.md": 2,
        },
      }),
    });

    await sources.handleEditorChanged({
      filePath: "note.md",
      selection: {
        text: "selected",
        sourcePath: "note.md",
        selectionStartLine: 1,
        selectionEndLine: 1,
      },
      cursor: {
        sourcePath: "note.md",
        line: 3,
        column: 5,
      },
    });

    expect(calls).toEqual(["selection:selected", "backlinks:note.md:true", "cursor:note.md:3:5"]);
  });

  test("active markdown changes refresh backlinks and cursor without adding selection", async () => {
    const calls: string[] = [];
    const sources = new ContextAutoSources({
      isSelectionEnabled: () => true,
      isBacklinksEnabled: () => true,
      isCursorEnabled: () => true,
      addSelection: async (selection) => {
        calls.push(`selection:${selection.text}`);
        return { ...item, type: "manual" };
      },
      addBacklinks: async (filePath) => {
        calls.push(`backlinks:${filePath}`);
        return item;
      },
      removeBacklinks: async () => false,
      addCursor: async (cursor) => {
        calls.push(`cursor:${cursor.line}:${cursor.column}`);
        return item;
      },
      removeCursor: async () => false,
      getResolvedLinks: () => ({
        "source.md": {
          "note.md": 1,
        },
      }),
    });

    await sources.handleActiveMarkdownChanged({
      filePath: "note.md",
      cursor: {
        sourcePath: "note.md",
        line: 4,
        column: 2,
      },
    });

    expect(calls).toEqual(["backlinks:note.md", "cursor:4:2"]);
  });

  test("metadata changes refresh backlinks for the current active markdown path", async () => {
    const calls: string[] = [];
    const sources = new ContextAutoSources({
      isSelectionEnabled: () => false,
      isBacklinksEnabled: () => true,
      isCursorEnabled: () => false,
      addSelection: async () => null,
      addBacklinks: async (filePath) => {
        calls.push(`backlinks:${filePath}`);
        return item;
      },
      removeBacklinks: async () => false,
      addCursor: async () => null,
      removeCursor: async () => false,
      getResolvedLinks: () => ({
        "source.md": {
          "note.md": 1,
        },
      }),
    });

    await sources.handleActiveMarkdownChanged({ filePath: "note.md", cursor: null });
    await sources.handleMetadataChanged();

    expect(calls).toEqual(["backlinks:note.md"]);
  });
});
