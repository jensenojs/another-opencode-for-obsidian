import { describe, expect, test } from "bun:test";
import { formatWorkspaceContext } from "../../src/context/ContextFormatter";

describe("formatWorkspaceContext", () => {
  test("returns null when there is no workspace clue to send", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: [],
          activeLocation: null,
        },
        { maxOpenNotes: 20, includeActiveLocation: true }
      )
    ).toBeNull();
  });

  test("formats open notes and active location", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: ["a.md", "b.md"],
          activeLocation: {
            sourcePath: "a.md",
            line: 8,
          },
        },
        { maxOpenNotes: 20, includeActiveLocation: true }
      )
    ).toBe(`Obsidian workspace:
Active: a.md:L8

Open notes:
- a.md
- b.md`);
  });

  test("can omit active location while keeping open notes", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: ["a.md"],
          activeLocation: {
            sourcePath: "a.md",
            line: 8,
          },
        },
        { maxOpenNotes: 20, includeActiveLocation: false }
      )
    ).toBe(`Obsidian workspace:
Open notes:
- a.md`);
  });

  test("applies open note limits outside the Obsidian snapshot collector", () => {
    expect(
      formatWorkspaceContext(
        {
          openNotePaths: ["a.md", "b.md"],
          activeLocation: null,
        },
        { maxOpenNotes: 1, includeActiveLocation: true }
      )
    ).toBe(`Obsidian workspace:
Open notes:
- a.md`);
  });
});
