import type { ContextItem } from "../types";
import type { SelectedTextContext } from "./ContextFormatter";
import { AutoSelectionContextSource } from "./AutoSelectionContextSource";
import { BacklinkContextSource, type ResolvedLinks } from "./BacklinkContextSource";
import { CursorContextSource, type CursorContextSnapshot } from "./CursorContextSource";

interface ContextAutoSourcesDeps {
  isSelectionEnabled: () => boolean;
  isBacklinksEnabled: () => boolean;
  isCursorEnabled: () => boolean;
  addSelection: (selection: SelectedTextContext) => Promise<ContextItem | null>;
  addBacklinks: (filePath: string, text: string) => Promise<ContextItem | null>;
  removeBacklinks: () => Promise<boolean>;
  addCursor: (cursor: CursorContextSnapshot) => Promise<ContextItem | null>;
  removeCursor: () => Promise<boolean>;
  getResolvedLinks: () => ResolvedLinks;
}

export class ContextAutoSources {
  private activeMarkdownPath: string | null = null;
  private selectionSource: AutoSelectionContextSource;
  private backlinkSource: BacklinkContextSource;
  private cursorSource: CursorContextSource;

  constructor(private deps: ContextAutoSourcesDeps) {
    this.selectionSource = new AutoSelectionContextSource({
      isEnabled: deps.isSelectionEnabled,
      addSelection: deps.addSelection,
    });
    this.backlinkSource = new BacklinkContextSource({
      isEnabled: deps.isBacklinksEnabled,
      addBacklinks: (params) => deps.addBacklinks(params.filePath, params.text),
      removeBacklinks: deps.removeBacklinks,
    });
    this.cursorSource = new CursorContextSource({
      isEnabled: deps.isCursorEnabled,
      addCursor: deps.addCursor,
      removeCursor: deps.removeCursor,
    });
  }

  async handleActiveMarkdownChanged(params: {
    filePath: string | null;
    cursor: CursorContextSnapshot | null;
  }): Promise<void> {
    this.activeMarkdownPath = params.filePath;
    await Promise.all([this.refreshBacklinks(), this.refreshCursor(params.cursor)]);
  }

  async handleEditorChanged(params: {
    filePath: string | null;
    selection: SelectedTextContext | null;
    cursor: CursorContextSnapshot | null;
  }): Promise<void> {
    this.activeMarkdownPath = params.filePath;
    await Promise.all([
      this.selectionSource.handleSelection(params.selection),
      this.refreshBacklinks(),
      this.refreshCursor(params.cursor),
    ]);
  }

  async handleMetadataChanged(): Promise<void> {
    await this.refreshBacklinks();
  }

  reset(): void {
    this.activeMarkdownPath = null;
    this.selectionSource.reset();
    this.backlinkSource.reset();
    this.cursorSource.reset();
  }

  private async refreshBacklinks(): Promise<void> {
    await this.backlinkSource.refresh(this.activeMarkdownPath, this.deps.getResolvedLinks());
  }

  private async refreshCursor(cursor: CursorContextSnapshot | null): Promise<void> {
    await this.cursorSource.refresh(cursor);
  }
}
