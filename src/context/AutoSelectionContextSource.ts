import type { SelectedTextContext } from "./ContextFormatter";
import type {
  ContextCandidateInput,
  ContextSourceDriver,
  ContextSourceResult,
} from "./ContextSourceDriver";
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
    if (!this.deps.isEnabled() || !selection) {
      return null;
    }

    return {
      type: "upsert",
      candidate: buildSelectionCandidate(selection, this.deps.maxCharsPerSnippet()),
    };
  }

  reset(): void {}
}

// Shared by automatic selection capture and the explicit "add selection"
// command: one identity space, one truncation rule.
export function buildSelectionCandidate(
  selection: SelectedTextContext,
  maxCharsPerSnippet: number
): ContextCandidateInput {
  const fingerprint = createFingerprint(selection);
  return {
    sourceId: SELECTION_SOURCE_ID,
    sourceKind: "selection",
    identityKey: `selection:${hashFingerprint(fingerprint)}`,
    fingerprint,
    label: formatSelectionLabel(selection),
    text: truncateText(selection.text, maxCharsPerSnippet),
    sourceFile: selection.sourcePath,
    navigationSourceFile: selection.sourcePath,
    startLine: selection.selectionStartLine,
    endLine: selection.selectionEndLine,
    lifetime: "one-shot",
  };
}

function createFingerprint(selection: SelectedTextContext): string {
  return [
    selection.sourcePath,
    selection.selectionStartLine ?? "",
    selection.selectionEndLine ?? "",
    selection.text,
  ].join("\u0000");
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
