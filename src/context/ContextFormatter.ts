export interface SelectedTextContext {
  text: string;
  sourcePath: string;
  selectionStartLine?: number;
  selectionEndLine?: number;
}

export interface WorkspaceContextSnapshot {
  openNotePaths: string[];
  activeLocation: WorkspaceActiveLocation | null;
}

export interface WorkspaceActiveLocation {
  sourcePath: string;
  line: number;
}

export interface WorkspaceContextFormatOptions {
  maxOpenNotes: number;
  includeActiveLocation: boolean;
}

export function formatWorkspaceContext(
  snapshot: WorkspaceContextSnapshot,
  options: WorkspaceContextFormatOptions
): string | null {
  const openNotePaths = snapshot.openNotePaths.slice(0, Math.max(0, options.maxOpenNotes));
  const activeLocation = options.includeActiveLocation ? snapshot.activeLocation : null;

  if (openNotePaths.length === 0 && !activeLocation) {
    return null;
  }

  const lines: string[] = ["Obsidian workspace:"];

  if (activeLocation) {
    lines.push(`Active: ${activeLocation.sourcePath}:L${activeLocation.line}`);
  }

  if (openNotePaths.length > 0) {
    if (activeLocation) {
      lines.push("");
    }
    lines.push("Open notes:");
    for (const path of openNotePaths) {
      lines.push(`- ${path}`);
    }
  }

  return lines.join("\n");
}
