import { describe, expect, test } from "bun:test";
import { AutoSelectionContextSource } from "../../src/context/AutoSelectionContextSource";
import type { ContextItem } from "../../src/types";

const item: ContextItem = {
  id: "ctx-1",
  type: "manual",
  label: "Selection",
  text: "selected text",
  sourceFile: "note.md",
  createdAt: 123,
};

describe("AutoSelectionContextSource", () => {
  test("adds changed selections and skips duplicate fingerprints", async () => {
    const calls: string[] = [];
    const source = new AutoSelectionContextSource({
      isEnabled: () => true,
      addSelection: async (selection) => {
        calls.push(selection.text);
        return item;
      },
    });

    await source.handleSelection({
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    });
    await source.handleSelection({
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    });
    await source.handleSelection({
      sourcePath: "note.md",
      text: "new selected text",
      selectionStartLine: 4,
      selectionEndLine: 4,
    });

    expect(calls).toEqual(["selected text", "new selected text"]);
  });

  test("does not mark a selection as handled when add fails", async () => {
    const calls: string[] = [];
    let accepted = false;
    const source = new AutoSelectionContextSource({
      isEnabled: () => true,
      addSelection: async (selection) => {
        calls.push(selection.text);
        return accepted ? item : null;
      },
    });
    const selection = {
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    };

    await source.handleSelection(selection);
    accepted = true;
    await source.handleSelection(selection);

    expect(calls).toEqual(["selected text", "selected text"]);
  });

  test("ignores selections while disabled and resets on empty selection", async () => {
    let enabled = true;
    const calls: string[] = [];
    const source = new AutoSelectionContextSource({
      isEnabled: () => enabled,
      addSelection: async (selection) => {
        calls.push(selection.text);
        return item;
      },
    });
    const selection = {
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    };

    enabled = false;
    await source.handleSelection(selection);
    enabled = true;
    await source.handleSelection(selection);
    await source.handleSelection(null);
    await source.handleSelection(selection);

    expect(calls).toEqual(["selected text", "selected text"]);
  });
});
