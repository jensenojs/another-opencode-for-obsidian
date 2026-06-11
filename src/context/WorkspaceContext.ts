import { App, MarkdownView } from "obsidian";
import type { SelectedTextContext, WorkspaceContextSnapshot } from "./ContextFormatter";

export class WorkspaceContext {
  private app: App;
  private lastSelection: { text: string; sourcePath: string } | null = null;
  private lastMarkdownView: MarkdownView | null = null;

  constructor(app: App) {
    this.app = app;
  }

  trackViewSelection(view: MarkdownView | null): void {
    if (view) {
      this.lastMarkdownView = view;
    }

    const sourcePath = view?.file?.path;
    const selection = view?.editor?.getSelection() ?? "";

    if (sourcePath && selection.trim()) {
      this.lastSelection = {
        text: selection,
        sourcePath,
      };
    }
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

    this.trackViewSelection(view);

    const sourcePath = view?.file?.path;
    const selection = view?.editor?.getSelection() ?? "";
    let selectionContext: SelectedTextContext | null = null;

    if (sourcePath && selection.trim()) {
      selectionContext = {
        text: selection,
        sourcePath,
      };
      this.lastSelection = selectionContext;
    } else if (this.lastSelection) {
      selectionContext = this.lastSelection;
    }

    return {
      openNotePaths,
      selection: selectionContext,
    };
  }
}
