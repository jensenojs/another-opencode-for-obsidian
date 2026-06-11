import type { ContextItem } from "../types";

interface CursorContextSourceDeps {
  isEnabled: () => boolean;
  addCursor: (cursor: CursorContextSnapshot) => Promise<ContextItem | null>;
  removeCursor: () => Promise<boolean>;
}

export interface CursorContextSnapshot {
  sourcePath: string;
  line: number;
  column: number;
}

export class CursorContextSource {
  private lastFingerprint: string | null = null;

  constructor(private deps: CursorContextSourceDeps) {}

  async refresh(cursor: CursorContextSnapshot | null): Promise<void> {
    if (!this.deps.isEnabled()) {
      return;
    }

    if (!cursor) {
      const removed = await this.deps.removeCursor();
      if (removed) {
        this.reset();
      }
      return;
    }

    const fingerprint = createCursorFingerprint(cursor);
    if (fingerprint === this.lastFingerprint) {
      return;
    }

    const item = await this.deps.addCursor(cursor);
    if (item) {
      this.lastFingerprint = fingerprint;
    }
  }

  reset(): void {
    this.lastFingerprint = null;
  }
}

export function formatCursorContext(cursor: CursorContextSnapshot): string {
  return `<obsidian-cursor file="${escapeAttribute(cursor.sourcePath)}" line="${cursor.line}" column="${cursor.column}" />`;
}

function createCursorFingerprint(cursor: CursorContextSnapshot): string {
  return [cursor.sourcePath, cursor.line, cursor.column].join("\u0000");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
