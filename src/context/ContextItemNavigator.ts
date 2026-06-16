import { Notice, type App, type OpenViewState } from "obsidian";
import type { GraphIndex, GraphReference, GraphSubpathKind } from "../graph/GraphIndex";
import type { ContextItem } from "../types";

export type ContextNavigationUnresolvedReason =
  | "empty-source"
  | "synthetic-source"
  | "external-url"
  | "missing-file"
  | "folder"
  | "unresolved-heading"
  | "unresolved-block"
  | "unresolved-footnote"
  | "unresolved-subpath";

export type ContextNavigationResult =
  | { status: "opened"; path: string; line: number | null }
  | {
      status: "unresolved";
      reason: ContextNavigationUnresolvedReason;
      sourceFile: string;
      subpath?: string;
    };

export type ContextNavigationResolution =
  | { status: "resolved"; path: string; line: number | null }
  | Extract<ContextNavigationResult, { status: "unresolved" }>;

const SYNTHETIC_CONTEXT_SOURCES = new Set(["Obsidian workspace", "OpenCode session"]);

export class ContextItemNavigator {
  constructor(
    private app: App,
    private graphIndex?: GraphIndex
  ) {}

  resolve(item: ContextItem): ContextNavigationResolution {
    const sourceFile = item.navigationSourceFile ?? item.sourceFile;
    const target = resolveSourceTarget(sourceFile);
    if (!target) {
      return unresolved("empty-source", sourceFile);
    }
    if (target.kind === "external-url") {
      return unresolved("external-url", sourceFile);
    }
    if (SYNTHETIC_CONTEXT_SOURCES.has(target.path)) {
      return unresolved("synthetic-source", sourceFile);
    }

    if (this.app.vault.getFolderByPath(target.path)) {
      return unresolved("folder", sourceFile);
    }
    const file = this.resolveVaultFile(target.path, sourceFile);
    if (!file) {
      return unresolved("missing-file", sourceFile);
    }
    if (target.subpath) {
      const subpathResolution = this.graphIndex?.resolveSubpath(file.path, target.subpath);
      if (!subpathResolution || subpathResolution.status === "unresolved") {
        return unresolvedSubpath(sourceFile, target.subpath);
      }
      return {
        status: "resolved",
        path: file.path,
        line: subpathResolution.position.start.line,
      };
    }

    const line = toEditorLine(item.startLine);
    return {
      status: "resolved",
      path: file.path,
      line,
    };
  }

  resolveReference(reference: GraphReference): ContextNavigationResolution {
    if (reference.resolution === "resolved" && reference.targetPath) {
      const file = this.app.vault.getFileByPath(reference.targetPath);
      if (!file) {
        return unresolved("missing-file", reference.targetPath);
      }
      return {
        status: "resolved",
        path: file.path,
        line: reference.subpathPosition?.start.line ?? null,
      };
    }

    const sourceFile = this.app.vault.getFileByPath(reference.sourcePath);
    if (!sourceFile) {
      return unresolved("missing-file", reference.sourcePath);
    }
    return {
      status: "resolved",
      path: sourceFile.path,
      line: reference.position.start.line,
    };
  }

  async open(item: ContextItem): Promise<ContextNavigationResult> {
    const resolution = this.resolve(item);
    return this.openResolution(resolution, item.navigationSourceFile ?? item.sourceFile);
  }

  async openReference(reference: GraphReference): Promise<ContextNavigationResult> {
    const resolution = this.resolveReference(reference);
    return this.openResolution(resolution, reference.sourcePath);
  }

  private resolveVaultFile(path: string, sourcePath: string) {
    const directFile = this.app.vault.getFileByPath(path);
    if (directFile) {
      return directFile;
    }
    const graphNode = this.graphIndex?.resolveLinkpath(path, sourcePath);
    return graphNode ? this.app.vault.getFileByPath(graphNode.path) : null;
  }

  private async openResolution(
    resolution: ContextNavigationResolution,
    fallbackSourceFile: string
  ): Promise<ContextNavigationResult> {
    if (resolution.status === "unresolved") {
      return resolution;
    }

    const openState: OpenViewState = { active: true };
    if (resolution.line !== null) {
      openState.eState = { line: resolution.line };
    }
    const file = this.app.vault.getFileByPath(resolution.path);
    if (!file) {
      return unresolved("missing-file", fallbackSourceFile);
    }
    await this.app.workspace.getLeaf(false).openFile(file, openState);
    return {
      status: "opened",
      path: resolution.path,
      line: resolution.line,
    };
  }
}

export function formatNavigationResolution(resolution: ContextNavigationResolution): string {
  if (resolution.status === "resolved") {
    return resolution.line === null
      ? "source resolved"
      : `source resolved at line ${resolution.line + 1}`;
  }
  return formatUnresolvedReason(resolution);
}

export function noticeContextNavigationResult(result: ContextNavigationResult): void {
  if (result.status === "opened") {
    return;
  }

  new Notice(`OpenCode context source unavailable: ${formatUnresolvedReason(result)}`);
}

export function formatUnresolvedReason(
  result: Extract<ContextNavigationResult, { status: "unresolved" }>
): string {
  switch (result.reason) {
    case "empty-source":
      return "empty source";
    case "synthetic-source":
      return `${result.sourceFile} is a synthetic source`;
    case "external-url":
      return `${result.sourceFile} is outside this vault`;
    case "missing-file":
      return `${result.sourceFile} does not exist in this vault`;
    case "folder":
      return `${result.sourceFile} is a folder`;
    case "unresolved-heading":
      return `${result.sourceFile} contains an unresolved heading reference`;
    case "unresolved-block":
      return `${result.sourceFile} contains an unresolved block reference`;
    case "unresolved-footnote":
      return `${result.sourceFile} contains an unresolved footnote reference`;
    case "unresolved-subpath":
      return `${result.sourceFile} contains an unresolved subpath reference`;
  }
}

function resolveSourceTarget(
  sourceFile: string
): { kind: "vault-path"; path: string; subpath?: string } | { kind: "external-url" } | null {
  const trimmed = sourceFile.trim();
  if (!trimmed) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { kind: "external-url" };
  }

  const subpathIndex = trimmed.indexOf("#");
  if (subpathIndex === -1) {
    return { kind: "vault-path", path: trimmed };
  }

  return {
    kind: "vault-path",
    path: trimmed.slice(0, subpathIndex),
    subpath: trimmed.slice(subpathIndex + 1),
  };
}

function unresolved(
  reason: ContextNavigationUnresolvedReason,
  sourceFile: string
): Extract<ContextNavigationResult, { status: "unresolved" }> {
  return {
    status: "unresolved",
    reason,
    sourceFile,
  };
}

function unresolvedSubpath(
  sourceFile: string,
  subpath: string
): Extract<ContextNavigationResult, { status: "unresolved" }> {
  return {
    status: "unresolved",
    reason: unresolvedSubpathReason(subpath),
    sourceFile,
    subpath,
  };
}

function unresolvedSubpathReason(subpath: string): ContextNavigationUnresolvedReason {
  const kind = inferSubpathKind(subpath);
  if (kind === "heading") {
    return "unresolved-heading";
  }
  if (kind === "block") {
    return "unresolved-block";
  }
  if (kind === "footnote") {
    return "unresolved-footnote";
  }
  return "unresolved-subpath";
}

function inferSubpathKind(subpath: string): GraphSubpathKind | "unknown" {
  if (subpath.startsWith("^")) {
    return "block";
  }
  if (subpath.startsWith("[^")) {
    return "footnote";
  }
  if (subpath.trim()) {
    return "heading";
  }
  return "unknown";
}

function toEditorLine(startLine: number | undefined): number | null {
  if (startLine === undefined) {
    return null;
  }
  return Math.max(0, startLine - 1);
}
