import type { ContextItem } from "../types";
import type { SelectedTextContext } from "./ContextFormatter";

interface AutoSelectionContextSourceDeps {
  isEnabled: () => boolean;
  addSelection: (selection: SelectedTextContext) => Promise<ContextItem | null>;
}

export class AutoSelectionContextSource {
  private lastFingerprint: string | null = null;

  constructor(private deps: AutoSelectionContextSourceDeps) {}

  async handleSelection(selection: SelectedTextContext | null): Promise<void> {
    if (!this.deps.isEnabled()) {
      return;
    }

    if (!selection) {
      this.reset();
      return;
    }

    const fingerprint = this.createFingerprint(selection);
    if (fingerprint === this.lastFingerprint) {
      return;
    }

    const item = await this.deps.addSelection(selection);
    if (item) {
      this.lastFingerprint = fingerprint;
    }
  }

  reset(): void {
    this.lastFingerprint = null;
  }

  private createFingerprint(selection: SelectedTextContext): string {
    return [
      selection.sourcePath,
      selection.selectionStartLine ?? "",
      selection.selectionEndLine ?? "",
      selection.text,
    ].join("\u0000");
  }
}
