import { describe, expect, test } from "bun:test";
import { AutoSelectionContextSource } from "../../src/context/AutoSelectionContextSource";

describe("AutoSelectionContextSource", () => {
  test("returns one-shot upsert results for repeated selections so the registry can restore intent", () => {
    const source = new AutoSelectionContextSource({
      isEnabled: () => true,
      maxCharsPerSnippet: () => 2000,
    });

    const first = source.handleSelection({
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    });
    const duplicate = source.handleSelection({
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    });
    const changed = source.handleSelection({
      sourcePath: "note.md",
      text: "new selected text",
      selectionStartLine: 4,
      selectionEndLine: 4,
    });

    expect(first).toMatchObject({
      type: "upsert",
      candidate: {
        sourceId: "selection",
        sourceKind: "selection",
        text: "selected text",
        sourceFile: "note.md",
        navigationSourceFile: "note.md",
        startLine: 2,
        endLine: 3,
        lifetime: "one-shot",
      },
    });
    expect(
      first?.type === "upsert" ? first.candidate.identityKey.startsWith("selection:") : false
    ).toBe(true);
    expect(duplicate).toMatchObject({
      type: "upsert",
      candidate: {
        identityKey: first?.type === "upsert" ? first.candidate.identityKey : "",
        fingerprint: first?.type === "upsert" ? first.candidate.fingerprint : "",
        text: "selected text",
      },
    });
    expect(changed).toMatchObject({
      type: "upsert",
      candidate: {
        label: "Selection: note.md:4",
        text: "new selected text",
        lifetime: "one-shot",
      },
    });
  });

  test("ignores disabled selections and empty selections", () => {
    let enabled = true;
    const source = new AutoSelectionContextSource({
      isEnabled: () => enabled,
      maxCharsPerSnippet: () => 2000,
    });
    const selection = {
      sourcePath: "note.md",
      text: "selected text",
      selectionStartLine: 2,
      selectionEndLine: 3,
    };

    enabled = false;
    expect(source.handleSelection(selection)).toBeNull();
    enabled = true;
    expect(source.handleSelection(selection)?.type).toBe("upsert");
    expect(source.handleSelection(null)).toBeNull();
    source.reset();
    expect(source.handleSelection(selection)?.type).toBe("upsert");
  });

  test("truncates candidate text before it reaches the registry", () => {
    const source = new AutoSelectionContextSource({
      isEnabled: () => true,
      maxCharsPerSnippet: () => 3,
    });

    const result = source.handleSelection({
      sourcePath: "note.md",
      text: "abcdef",
    });

    expect(result).toMatchObject({
      type: "upsert",
      candidate: {
        text: "abc... [truncated]",
      },
    });
  });
});
