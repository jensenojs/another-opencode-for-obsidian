import type { SelectedTextContext } from "./ContextFormatter";
import { AutoSelectionContextSource, SELECTION_SOURCE_ID } from "./AutoSelectionContextSource";
import type { ContextSourceResult } from "./ContextSourceDriver";

interface ContextAutoSourcesDeps {
  isSelectionEnabled: () => boolean;
  maxSelectionChars: () => number;
}

export class ContextAutoSources {
  private selectionSource: AutoSelectionContextSource;

  constructor(private deps: ContextAutoSourcesDeps) {
    this.selectionSource = new AutoSelectionContextSource({
      isEnabled: deps.isSelectionEnabled,
      maxCharsPerSnippet: deps.maxSelectionChars,
    });
  }

  async handleActiveMarkdownChanged(_params: {
    filePath: string | null;
  }): Promise<ContextSourceResult[]> {
    return [];
  }

  async handleEditorChanged(params: {
    filePath: string | null;
    selection: SelectedTextContext | null;
  }): Promise<ContextSourceResult[]> {
    return [this.refreshSelection(params.selection)].filter(isContextSourceResult);
  }

  async handleMetadataChanged(): Promise<ContextSourceResult[]> {
    return [];
  }

  reset(): void {
    this.selectionSource.reset();
  }

  stopSelection(): void {
    this.selectionSource.stop();
  }

  private refreshSelection(selection: SelectedTextContext | null): ContextSourceResult | null {
    return this.runSource(
      () => this.selectionSource.handleSelection(selection),
      SELECTION_SOURCE_ID
    );
  }

  private runSource(
    refresh: () => ContextSourceResult | null,
    sourceId: string
  ): ContextSourceResult | null {
    try {
      return refresh();
    } catch (error) {
      return {
        type: "failed",
        sourceId,
        identityKey: "source-error",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function isContextSourceResult(result: ContextSourceResult | null): result is ContextSourceResult {
  return result !== null;
}
