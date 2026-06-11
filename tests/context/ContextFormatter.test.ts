import { describe, expect, test } from "bun:test";
import { formatWorkspaceContext } from "../../src/context/ContextFormatter";

describe("formatWorkspaceContext", () => {
  test("returns null when there is no context to send", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: [],
          selection: null,
        },
        { maxNotes: 20, maxSelectionLength: 2000 }
      )
    ).toBeNull();
  });

  test("formats open notes and selected text", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: ["a.md", "b.md"],
          selection: {
            sourcePath: "a.md",
            text: "selected",
          },
        },
        { maxNotes: 20, maxSelectionLength: 2000 }
      )
    ).toBe(`<obsidian-context>
Currently open notes in Obsidian:
- a.md
- b.md

Selected text (from a.md):
"""
selected
"""
</obsidian-context>`);
  });

  test("applies formatting limits outside the Obsidian snapshot collector", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: ["a.md", "b.md"],
          selection: {
            sourcePath: "b.md",
            text: "abcdef",
          },
        },
        { maxNotes: 1, maxSelectionLength: 3 }
      )
    ).toBe(`<obsidian-context>
Currently open notes in Obsidian:
- a.md

Selected text (from b.md):
"""
abc... [truncated]
"""
</obsidian-context>`);
  });
});
