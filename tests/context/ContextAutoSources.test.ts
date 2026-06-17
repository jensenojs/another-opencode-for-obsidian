import { describe, expect, test } from "bun:test";
import { ContextAutoSources } from "../../src/context/ContextAutoSources";

describe("ContextAutoSources", () => {
  test("routes editor changes only into selection source results in the first phase", async () => {
    const sources = new ContextAutoSources({
      isSelectionEnabled: () => true,
      maxSelectionChars: () => 2000,
    });

    const results = await sources.handleEditorChanged({
      filePath: "note.md",
      selection: {
        text: "selected",
        sourcePath: "note.md",
        selectionStartLine: 1,
        selectionEndLine: 1,
      },
    });

    expect(results).toMatchObject([
      {
        type: "upsert",
        candidate: {
          sourceId: "selection",
          sourceKind: "selection",
          text: "selected",
          lifetime: "one-shot",
        },
      },
    ]);
  });

  test("active markdown and metadata changes do not produce first-phase candidates", async () => {
    const sources = new ContextAutoSources({
      isSelectionEnabled: () => true,
      maxSelectionChars: () => 2000,
    });

    expect(await sources.handleActiveMarkdownChanged({ filePath: "note.md" })).toEqual([]);
    expect(await sources.handleMetadataChanged()).toEqual([]);
  });

  test("reports selection source failures without requiring ContextManager branches", async () => {
    const sources = new ContextAutoSources({
      isSelectionEnabled: () => true,
      maxSelectionChars: () => {
        throw new Error("selection settings unavailable");
      },
    });

    const results = await sources.handleEditorChanged({
      filePath: "note.md",
      selection: {
        text: "selected",
        sourcePath: "note.md",
      },
    });

    expect(results).toEqual([
      {
        type: "failed",
        sourceId: "selection",
        identityKey: "source-error",
        reason: "selection settings unavailable",
      },
    ]);
  });
});
