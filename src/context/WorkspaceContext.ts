import { App, MarkdownView } from "obsidian";
import type {
  SelectedTextContext,
  WorkspaceActiveLocation,
  WorkspaceContextSnapshot,
} from "./ContextFormatter";
import { getSelectionLineRange, hasSelectedEditorRange } from "./SelectionLineRange";

export class WorkspaceContext {
  private app: App;
  private lastMarkdownView: MarkdownView | null = null;

  constructor(app: App) {
    this.app = app;
  }

  trackViewSelection(view: MarkdownView | null): SelectedTextContext | null {
    if (view) {
      this.lastMarkdownView = view;
    }

    const selectionContext = this.getSelectionContext(view);
    return selectionContext;
  }

  gatherContext(): WorkspaceContextSnapshot {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const paths = new Set<string>();

    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      const path = view.file?.path;
      if (path) {
        paths.add(path);
      }
    }

    const openNotePaths = Array.from(paths);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView) ?? this.lastMarkdownView;

    return {
      openNotePaths,
      activeLocation: this.getActiveLocation(view),
    };
  }

  private getActiveLocation(view: MarkdownView | null): WorkspaceActiveLocation | null {
    const sourcePath = view?.file?.path;
    const cursor = view?.editor?.getCursor?.();

    if (!view || !sourcePath || !cursor) {
      return null;
    }

    return {
      sourcePath,
      line: cursor.line + 1,
    };
  }

  private getSelectionContext(view: MarkdownView | null): SelectedTextContext | null {
    const sourcePath = view?.file?.path;
    const selection = view?.editor?.getSelection() ?? "";
    const range = view?.editor?.listSelections()[0];

    if (!view || !sourcePath || !selection.trim() || !hasSelectedEditorRange(range)) {
      return null;
    }

    return {
      text: selection,
      sourcePath,
      ...getSelectionLineRange(range),
    };
  }
}
