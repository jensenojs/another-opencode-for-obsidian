import { describe, expect, test } from "bun:test";
import {
  getSelectionLineRange,
  hasSelectedEditorRange,
} from "../../src/context/SelectionLineRange";

describe("getSelectionLineRange", () => {
  test("returns 1-based line numbers", () => {
    expect(
      getSelectionLineRange({
        anchor: { line: 2 },
        head: { line: 4 },
      })
    ).toEqual({
      selectionStartLine: 3,
      selectionEndLine: 5,
    });
  });

  test("normalizes reversed selections", () => {
    expect(
      getSelectionLineRange({
        anchor: { line: 9 },
        head: { line: 6 },
      })
    ).toEqual({
      selectionStartLine: 7,
      selectionEndLine: 10,
    });
  });

  test("returns an empty range when there is no selection", () => {
    expect(getSelectionLineRange(undefined)).toEqual({});
  });
});

describe("hasSelectedEditorRange", () => {
  test("returns false for collapsed cursor ranges", () => {
    expect(
      hasSelectedEditorRange({
        anchor: { line: 5, ch: 3 },
        head: { line: 5, ch: 3 },
      })
    ).toBe(false);
  });

  test("returns true for same-line text selections", () => {
    expect(
      hasSelectedEditorRange({
        anchor: { line: 5, ch: 3 },
        head: { line: 5, ch: 12 },
      })
    ).toBe(true);
  });

  test("returns true for multi-line selections", () => {
    expect(
      hasSelectedEditorRange({
        anchor: { line: 5, ch: 3 },
        head: { line: 7, ch: 0 },
      })
    ).toBe(true);
  });
});
