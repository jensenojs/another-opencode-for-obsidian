import type { SelectedTextContext } from "./ContextFormatter";
import type { ContextSourceDriver, ContextSourceResult } from "./ContextSourceDriver";
import type { OpenCodeSettings } from "../types";

export const SELECTION_SOURCE_ID = "selection";

interface AutoSelectionContextSourceDeps {
  isEnabled: () => boolean;
  maxCharsPerSnippet: () => number;
}

export class AutoSelectionContextSource implements ContextSourceDriver {
  readonly sourceId = SELECTION_SOURCE_ID;

  constructor(private deps: AutoSelectionContextSourceDeps) {}

  start(): void {}

  stop(): void {
    this.reset();
  }

  updateSettings(_settings: OpenCodeSettings): void {
    this.reset();
  }

  handleSelection(selection: SelectedTextContext | null): ContextSourceResult | null {
    if (!this.deps.isEnabled()) {
      return null;
    }

    if (!selection) {
      return null;
    }

    const fingerprint = this.createFingerprint(selection);
    const text = truncateText(selection.text, this.deps.maxCharsPerSnippet());
    const identityKey = `selection:${hashFingerprint(fingerprint)}`;
    return {
      type: "upsert",
      candidate: {
        sourceId: this.sourceId,
        sourceKind: "selection",
        identityKey,
        fingerprint,
        label: formatSelectionLabel(selection),
        text,
        sourceFile: selection.sourcePath,
        navigationSourceFile: selection.sourcePath,
        startLine: selection.selectionStartLine,
        endLine: selection.selectionEndLine,
        lifetime: "one-shot",
      },
    };
  }

  reset(): void {}

  private createFingerprint(selection: SelectedTextContext): string {
    return [
      selection.sourcePath,
      selection.selectionStartLine ?? "",
      selection.selectionEndLine ?? "",
      selection.text,
    ].join("\u0000");
  }
}

function formatSelectionLabel(selection: SelectedTextContext): string {
  if (selection.selectionStartLine === undefined || selection.selectionEndLine === undefined) {
    return `Selection: ${selection.sourcePath}`;
  }
  if (selection.selectionStartLine === selection.selectionEndLine) {
    return `Selection: ${selection.sourcePath}:${selection.selectionStartLine}`;
  }
  return `Selection: ${selection.sourcePath}:${selection.selectionStartLine}-${selection.selectionEndLine}`;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars))}... [truncated]`;
}

function hashFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
