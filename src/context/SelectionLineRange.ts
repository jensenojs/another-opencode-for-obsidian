export type EditorSelectionLineRange = {
  anchor: { line: number };
  head: { line: number };
};

export type SelectionLineRange = {
  selectionStartLine?: number;
  selectionEndLine?: number;
};

export function getSelectionLineRange(
  selection: EditorSelectionLineRange | undefined
): SelectionLineRange {
  if (!selection) {
    return {};
  }

  return {
    selectionStartLine: Math.min(selection.anchor.line, selection.head.line) + 1,
    selectionEndLine: Math.max(selection.anchor.line, selection.head.line) + 1,
  };
}
