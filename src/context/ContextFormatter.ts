export interface SelectedTextContext {
  text: string;
  sourcePath: string;
}

export interface WorkspaceContextSnapshot {
  openNotePaths: string[];
  selection: SelectedTextContext | null;
}

export interface WorkspaceContextFormatOptions {
  maxNotes: number;
  maxSelectionLength: number;
}

export function formatWorkspaceContext(
  snapshot: WorkspaceContextSnapshot,
  options: WorkspaceContextFormatOptions
): string | null {
  const openNotePaths = snapshot.openNotePaths.slice(0, Math.max(0, options.maxNotes));
  const selection = truncateSelection(snapshot.selection, options.maxSelectionLength);

  if (openNotePaths.length === 0 && !selection) {
    return null;
  }

  const lines: string[] = ["<obsidian-context>"];

  if (openNotePaths.length > 0) {
    lines.push("Currently open notes in Obsidian:");
    for (const path of openNotePaths) {
      lines.push(`- ${path}`);
    }
  }

  if (selection) {
    lines.push("");
    lines.push(`Selected text (from ${selection.sourcePath}):`);
    lines.push('"""');
    lines.push(selection.text);
    lines.push('"""');
  }

  lines.push("</obsidian-context>");
  return lines.join("\n");
}

function truncateSelection(
  selection: SelectedTextContext | null,
  maxSelectionLength: number
): SelectedTextContext | null {
  if (!selection) {
    return null;
  }

  if (selection.text.length <= maxSelectionLength) {
    return selection;
  }

  return {
    ...selection,
    text: selection.text.slice(0, Math.max(0, maxSelectionLength)) + "... [truncated]",
  };
}
