import { Notice, getLinkpath, parseLinktext, type App, type OpenViewState } from "obsidian";
import type { GraphIndex, GraphReference, GraphSubpathKind } from "../graph/GraphIndex";
import type { ContextCandidate, ContextItem } from "../types";
import { getText } from "../i18n";

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

export type ContextNavigationSource = Pick<
  ContextItem | ContextCandidate,
  "sourceFile" | "navigationSourceFile" | "startLine" | "endLine"
>;

// Production entry for Obsidian evidence navigation. It only opens resolved TFiles.
export class ContextItemNavigator {
  constructor(
    private app: App,
    private graphIndex?: GraphIndex
  ) {}

  resolve(item: ContextNavigationSource): ContextNavigationResolution {
    const sourceFile = item.navigationSourceFile ?? item.sourceFile;
    return this.resolveSource(sourceFile, item.startLine);
  }

  resolveSource(sourceFile: string, startLine?: number): ContextNavigationResolution {
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

    const line = toEditorLine(startLine);
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

  async open(item: ContextNavigationSource): Promise<ContextNavigationResult> {
    const resolution = this.resolve(item);
    return this.openResolution(resolution, item.navigationSourceFile ?? item.sourceFile);
  }

  async openSource(sourceFile: string, startLine?: number): Promise<ContextNavigationResult> {
    const resolution = this.resolveSource(sourceFile, startLine);
    return this.openResolution(resolution, sourceFile);
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
  const text = getText();
  if (resolution.status === "resolved") {
    return resolution.line === null
      ? text.context.sourceResolved
      : text.context.sourceResolvedAtLine(resolution.line + 1);
  }
  return formatUnresolvedReason(resolution);
}

export function noticeContextNavigationResult(result: ContextNavigationResult): void {
  if (result.status === "opened") {
    return;
  }

  new Notice(getText().notices.contextSourceUnavailable(formatUnresolvedReason(result)));
}

export function formatUnresolvedReason(
  result: Extract<ContextNavigationResult, { status: "unresolved" }>
): string {
  const text = getText();
  switch (result.reason) {
    case "empty-source":
      return text.context.unresolved.emptySource;
    case "synthetic-source":
      return text.context.unresolved.syntheticSource(result.sourceFile);
    case "external-url":
      return text.context.unresolved.externalUrl(result.sourceFile);
    case "missing-file":
      return text.context.unresolved.missingFile(result.sourceFile);
    case "folder":
      return text.context.unresolved.folder(result.sourceFile);
    case "unresolved-heading":
      return text.context.unresolved.unresolvedHeading(result.sourceFile);
    case "unresolved-block":
      return text.context.unresolved.unresolvedBlock(result.sourceFile);
    case "unresolved-footnote":
      return text.context.unresolved.unresolvedFootnote(result.sourceFile);
    case "unresolved-subpath":
      return text.context.unresolved.unresolvedSubpath(result.sourceFile);
  }
}

function resolveSourceTarget(
  sourceFile: string
): { kind: "vault-path"; path: string; subpath?: string } | { kind: "external-url" } | null {
  const trimmed = sourceFile.trim();
  if (!trimmed) {
    return null;
  }
  const linktext = normalizeObsidianLinktext(trimmed);
  if (!linktext) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(linktext)) {
    return { kind: "external-url" };
  }

  const parsed = parseLinktext(linktext);
  const path = parsed.path || getLinkpath(linktext);
  if (!path) {
    return null;
  }
  const subpath = normalizeParsedSubpath(parsed.subpath);
  return subpath ? { kind: "vault-path", path, subpath } : { kind: "vault-path", path };
}

function normalizeObsidianLinktext(sourceFile: string): string {
  const wikilink = sourceFile.match(/^!?\[\[([\s\S]+)\]\]$/);
  const linktext = wikilink ? wikilink[1].trim() : sourceFile;
  const aliasIndex = linktext.indexOf("|");
  return aliasIndex === -1 ? linktext : linktext.slice(0, aliasIndex).trim();
}

function normalizeParsedSubpath(subpath: string): string {
  return subpath.replace(/^#/, "").trim();
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
