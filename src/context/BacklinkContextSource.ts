import type { ContextItem } from "../types";

export type ResolvedLinks = Record<string, Record<string, number>>;

interface BacklinkContextSourceDeps {
  isEnabled: () => boolean;
  addBacklinks: (params: BacklinkContextItemParams) => Promise<ContextItem | null>;
  removeBacklinks: (filePath: string) => Promise<boolean>;
}

export interface BacklinkContextItemParams {
  filePath: string;
  backlinks: BacklinkReference[];
  text: string;
}

export interface BacklinkReference {
  sourcePath: string;
  count: number;
}

export class BacklinkContextSource {
  private lastFingerprintByFile = new Map<string, string>();

  constructor(private deps: BacklinkContextSourceDeps) {}

  async refresh(filePath: string | null, resolvedLinks: ResolvedLinks): Promise<void> {
    if (!this.deps.isEnabled() || !filePath) {
      return;
    }

    const backlinks = getBacklinks(filePath, resolvedLinks);
    const fingerprint = createBacklinkFingerprint(backlinks);
    if (fingerprint === this.lastFingerprintByFile.get(filePath)) {
      return;
    }

    if (backlinks.length === 0) {
      const removed = await this.deps.removeBacklinks(filePath);
      if (removed) {
        this.lastFingerprintByFile.set(filePath, fingerprint);
      }
      return;
    }

    const item = await this.deps.addBacklinks({
      filePath,
      backlinks,
      text: formatBacklinkContext(filePath, backlinks),
    });
    if (item) {
      this.lastFingerprintByFile.set(filePath, fingerprint);
    }
  }

  reset(): void {
    this.lastFingerprintByFile.clear();
  }
}

export function getBacklinks(filePath: string, resolvedLinks: ResolvedLinks): BacklinkReference[] {
  return Object.entries(resolvedLinks)
    .flatMap(([sourcePath, destinations]) => {
      const count = destinations[filePath] ?? 0;
      return count > 0 ? [{ sourcePath, count }] : [];
    })
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

export function formatBacklinkContext(filePath: string, backlinks: BacklinkReference[]): string {
  const lines = [`<obsidian-backlinks file="${escapeAttribute(filePath)}">`];
  if (backlinks.length === 0) {
    lines.push("No resolved backlinks.");
  } else {
    for (const backlink of backlinks) {
      lines.push(`- ${backlink.sourcePath} (${backlink.count})`);
    }
  }
  lines.push("</obsidian-backlinks>");
  return lines.join("\n");
}

function createBacklinkFingerprint(backlinks: BacklinkReference[]): string {
  return backlinks
    .map((backlink) => `${backlink.sourcePath}\u0000${backlink.count}`)
    .join("\u0001");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
