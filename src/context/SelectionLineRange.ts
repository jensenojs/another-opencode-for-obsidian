export type EditorSelectionLineRange = {
  anchor: { line: number; ch?: number };
  head: { line: number; ch?: number };
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

export function hasSelectedEditorRange(selection: EditorSelectionLineRange | undefined): boolean {
  if (!selection) {
    return false;
  }

  if (selection.anchor.line !== selection.head.line) {
    return true;
  }

  if (Number.isInteger(selection.anchor.ch) && Number.isInteger(selection.head.ch)) {
    return selection.anchor.ch !== selection.head.ch;
  }

  return false;
}
