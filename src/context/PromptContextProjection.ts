import { isAbsolute, join, normalize, sep } from "path";
import type { ContextCandidate } from "../types";
import type { OpenCodeFileContextItem } from "../bridge/OpenCodePromptContextAdapter";

export type PromptContextClickAction =
  | { type: "obsidian-open"; path: string; line?: number; endLine?: number }
  | { type: "opencode-open-comment" }
  | { type: "none" };

export interface NativePromptContextProjection {
  projectionId: string;
  candidateId: string;
  candidateIds?: string[];
  sourceId: string;
  sourceKind: ContextCandidate["sourceKind"];
  fingerprint: string;
  label: string;
  item: OpenCodeFileContextItem;
  clickAction: PromptContextClickAction;
}

export type PromptContextProjection =
  | {
      kind: "native-file-card";
      projectionId: string;
      candidateId: string;
      candidateIds?: string[];
      native: NativePromptContextProjection;
    }
  | {
      kind: "synthetic-text";
      projectionId: string;
      candidateId: string;
      candidateIds?: string[];
      text: string;
    }
  | {
      kind: "status-only";
      projectionId: string;
      candidateId: string;
      candidateIds?: string[];
      label: string;
      clickAction?: PromptContextClickAction;
      reason?: string;
    };

export type OpenCodePathResolution =
  | { status: "ok"; path: string }
  | {
      status: "unreadable";
      reason:
        | "missing-vault-file"
        | "outside-project-directory"
        | "path-not-normalized"
        | "unsupported-path"
        | "vault-base-path-unavailable";
    };

export interface PromptContextProjectionFailure {
  candidateId: string;
  projectionId: string;
  reason: OpenCodePathResolution extends infer T
    ? T extends { status: "unreadable"; reason: infer R }
      ? R
      : never
    : never;
  sourcePath: string;
}

export interface PromptContextProjectionBuildResult {
  projections: PromptContextProjection[];
  failures: PromptContextProjectionFailure[];
}

export interface OpenCodeContextPathResolver {
  toOpenCodePath(vaultRelativePath: string): OpenCodePathResolution;
  toObsidianNavigationPath(input: {
    vaultRelativePath: string;
    line?: number;
    endLine?: number;
  }): PromptContextClickAction;
}

const NATIVE_FILE_CARD_MERGE_GAP_LINES = 50;

interface OpenCodeContextPathResolverOptions {
  vaultBasePath: string | null;
  fileExists?: (vaultRelativePath: string) => boolean;
}

export function createOpenCodeContextPathResolver(
  options: OpenCodeContextPathResolverOptions
): OpenCodeContextPathResolver {
  return {
    toOpenCodePath(vaultRelativePath: string): OpenCodePathResolution {
      const normalized = normalizeVaultRelativePath(vaultRelativePath);
      if (!normalized) {
        return { status: "unreadable", reason: "unsupported-path" };
      }

      if (!isAbsolute(normalized) && options.fileExists && !options.fileExists(normalized)) {
        return { status: "unreadable", reason: "missing-vault-file" };
      }

      if (isAbsolute(normalized)) {
        return { status: "ok", path: normalize(normalized) };
      }

      if (!options.vaultBasePath) {
        return { status: "unreadable", reason: "vault-base-path-unavailable" };
      }

      return { status: "ok", path: normalize(join(options.vaultBasePath, normalized)) };
    },

    toObsidianNavigationPath(input): PromptContextClickAction {
      return {
        type: "obsidian-open",
        path: input.vaultRelativePath,
        line: input.line,
        endLine: input.endLine,
      };
    },
  };
}

export function buildPromptContextProjections(
  candidates: ContextCandidate[],
  resolver: OpenCodeContextPathResolver
): PromptContextProjectionBuildResult {
  const projections: PromptContextProjection[] = [];
  const failures: PromptContextProjectionFailure[] = [];

  for (const candidate of candidates) {
    const projection = buildCandidateProjection(candidate, resolver);
    projections.push(...projection.projections);
    failures.push(...projection.failures);
  }

  return { projections: mergeNearbyNativeFileCardProjections(projections), failures };
}

export function filterSyntheticTextProjections(
  projections: PromptContextProjection[]
): Extract<PromptContextProjection, { kind: "synthetic-text" }>[] {
  return projections.filter(
    (projection): projection is Extract<PromptContextProjection, { kind: "synthetic-text" }> =>
      projection.kind === "synthetic-text"
  );
}

export function filterNativeFileCardProjections(
  projections: PromptContextProjection[]
): Extract<PromptContextProjection, { kind: "native-file-card" }>[] {
  return projections.filter(
    (projection): projection is Extract<PromptContextProjection, { kind: "native-file-card" }> =>
      projection.kind === "native-file-card"
  );
}

function buildCandidateProjection(
  candidate: ContextCandidate,
  resolver: OpenCodeContextPathResolver
): PromptContextProjectionBuildResult {
  if (!candidate.included) {
    return {
      projections: [
        {
          kind: "status-only",
          projectionId: statusProjectionId(candidate),
          candidateId: candidate.id,
          label: candidate.label,
          clickAction: clickActionForCandidate(candidate, resolver),
          reason: "skipped",
        },
      ],
      failures: [],
    };
  }

  if (candidate.sourceKind === "opencode-native-comment") {
    return buildNativeCommentProjection(candidate);
  }

  if (candidate.sourceKind === "workspace" || candidate.sourceKind === "selection") {
    return buildNativeFileProjection(candidate, resolver);
  }

  return {
    projections: [
      {
        kind: "synthetic-text",
        projectionId: syntheticProjectionId(candidate),
        candidateId: candidate.id,
        text: formatCandidateForPrompt(candidate),
      },
    ],
    failures: [],
  };
}

function buildNativeFileProjection(
  candidate: ContextCandidate,
  resolver: OpenCodeContextPathResolver
): PromptContextProjectionBuildResult {
  if (candidate.sourceKind === "workspace" && !candidate.navigationSourceFile) {
    return {
      projections: [
        {
          kind: "synthetic-text",
          projectionId: syntheticProjectionId(candidate),
          candidateId: candidate.id,
          text: formatCandidateForPrompt(candidate),
        },
      ],
      failures: [],
    };
  }

  const sourcePath = candidate.navigationSourceFile ?? candidate.sourceFile;
  const openCodePath = resolver.toOpenCodePath(sourcePath);
  if (openCodePath.status !== "ok") {
    return {
      projections: [
        {
          kind: "synthetic-text",
          projectionId: syntheticProjectionId(candidate),
          candidateId: candidate.id,
          text: formatCandidateForPrompt(candidate),
        },
      ],
      failures: [
        {
          candidateId: candidate.id,
          projectionId: nativeProjectionId(candidate),
          reason: openCodePath.reason,
          sourcePath,
        },
      ],
    };
  }

  const projectionId = nativeProjectionId(candidate);
  return {
    projections: [
      {
        kind: "native-file-card",
        projectionId,
        candidateId: candidate.id,
        native: {
          projectionId,
          candidateId: candidate.id,
          candidateIds: [candidate.id],
          sourceId: candidate.sourceId,
          sourceKind: candidate.sourceKind,
          fingerprint: candidate.fingerprint,
          label: candidate.label,
          item: {
            type: "file",
            path: openCodePath.path,
            selection: lineSelection(candidate.startLine, candidate.endLine),
          },
          clickAction: resolver.toObsidianNavigationPath({
            vaultRelativePath: sourcePath,
            line: candidate.startLine,
            endLine: candidate.endLine,
          }),
        },
      },
    ],
    failures: [],
  };
}

function mergeNearbyNativeFileCardProjections(
  projections: PromptContextProjection[]
): PromptContextProjection[] {
  const mergeable = projections.filter(isMergeableNativeFileCardProjection);
  if (mergeable.length < 2) {
    return projections;
  }

  const replacements = new Map<PromptContextProjection, PromptContextProjection | null>();
  const byPath = new Map<
    string,
    Extract<PromptContextProjection, { kind: "native-file-card" }>[]
  >();

  for (const projection of mergeable) {
    const path = projection.native.item.path;
    byPath.set(path, [...(byPath.get(path) ?? []), projection]);
  }

  for (const pathProjections of byPath.values()) {
    const sorted = [...pathProjections].sort((a, b) => nativeRange(a).start - nativeRange(b).start);
    let cluster: Extract<PromptContextProjection, { kind: "native-file-card" }>[] = [];
    let clusterRange: { start: number; end: number } | null = null;

    for (const projection of sorted) {
      const range = nativeRange(projection);
      if (
        cluster.length === 0 ||
        (clusterRange && range.start <= clusterRange.end + NATIVE_FILE_CARD_MERGE_GAP_LINES + 1)
      ) {
        cluster.push(projection);
        clusterRange = clusterRange
          ? {
              start: Math.min(clusterRange.start, range.start),
              end: Math.max(clusterRange.end, range.end),
            }
          : range;
        continue;
      }

      recordMergedCluster(replacements, cluster, clusterRange!);
      cluster = [projection];
      clusterRange = range;
    }

    if (cluster.length > 1) {
      recordMergedCluster(replacements, cluster, clusterRange!);
    }
  }

  if (replacements.size === 0) {
    return projections;
  }

  const result: PromptContextProjection[] = [];
  for (const projection of projections) {
    if (!replacements.has(projection)) {
      result.push(projection);
      continue;
    }

    const replacement = replacements.get(projection);
    if (replacement) {
      result.push(replacement);
    }
  }
  return result;
}

function isMergeableNativeFileCardProjection(
  projection: PromptContextProjection
): projection is Extract<PromptContextProjection, { kind: "native-file-card" }> {
  return (
    projection.kind === "native-file-card" &&
    (projection.native.sourceKind === "selection" ||
      projection.native.sourceKind === "workspace") &&
    !projection.native.item.commentID &&
    !projection.native.item.comment &&
    Boolean(projection.native.item.selection)
  );
}

function mergeNativeFileCardCluster(
  cluster: Extract<PromptContextProjection, { kind: "native-file-card" }>[],
  range: { start: number; end: number }
): Extract<PromptContextProjection, { kind: "native-file-card" }> {
  const primary =
    cluster.find((projection) => projection.native.sourceKind === "selection") ?? cluster[0];
  const candidateIds = uniqueStrings(cluster.flatMap(projectionCandidateIds));
  const projectionId = `native:merged:${primary.native.item.path}:${range.start}-${range.end}:${candidateIds.join(",")}`;
  const clickAction =
    primary.native.clickAction.type === "obsidian-open"
      ? { ...primary.native.clickAction, line: range.start, endLine: range.end }
      : primary.native.clickAction;

  return {
    kind: "native-file-card",
    projectionId,
    candidateId: primary.candidateId,
    candidateIds,
    native: {
      ...primary.native,
      projectionId,
      candidateId: primary.candidateId,
      candidateIds,
      fingerprint: cluster.map((projection) => projection.native.fingerprint).join("\n"),
      item: {
        ...primary.native.item,
        selection: lineSelection(range.start, range.end),
      },
      clickAction,
    },
  };
}

function recordMergedCluster(
  replacements: Map<PromptContextProjection, PromptContextProjection | null>,
  cluster: Extract<PromptContextProjection, { kind: "native-file-card" }>[],
  range: { start: number; end: number }
): void {
  const merged = mergeNativeFileCardCluster(cluster, range);
  cluster.forEach((projection, index) => {
    replacements.set(projection, index === 0 ? merged : null);
  });
}

function projectionCandidateIds(projection: PromptContextProjection): string[] {
  return projection.candidateIds ?? [projection.candidateId];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function nativeRange(projection: Extract<PromptContextProjection, { kind: "native-file-card" }>): {
  start: number;
  end: number;
} {
  const selection = projection.native.item.selection!;
  return {
    start: Math.min(selection.startLine, selection.endLine),
    end: Math.max(selection.startLine, selection.endLine),
  };
}

function buildNativeCommentProjection(
  candidate: ContextCandidate
): PromptContextProjectionBuildResult {
  const sourceData = candidate.sourceData;
  if (sourceData?.kind !== "opencode-native-comment") {
    return {
      projections: [
        {
          kind: "status-only",
          projectionId: statusProjectionId(candidate),
          candidateId: candidate.id,
          label: candidate.label,
          reason: "missing native comment sourceData",
        },
      ],
      failures: [],
    };
  }

  const projectionId = nativeProjectionId(candidate);
  return {
    projections: [
      {
        kind: "native-file-card",
        projectionId,
        candidateId: candidate.id,
        native: {
          projectionId,
          candidateId: candidate.id,
          sourceId: candidate.sourceId,
          sourceKind: candidate.sourceKind,
          fingerprint: candidate.fingerprint,
          label: candidate.label,
          item: { ...sourceData.item, selection: cloneSelection(sourceData.item.selection) },
          clickAction: { type: "opencode-open-comment" },
        },
      },
    ],
    failures: [],
  };
}

function clickActionForCandidate(
  candidate: ContextCandidate,
  resolver: OpenCodeContextPathResolver
): PromptContextClickAction {
  if (candidate.sourceKind === "opencode-native-comment") {
    return { type: "opencode-open-comment" };
  }
  const sourcePath = candidate.navigationSourceFile ?? candidate.sourceFile;
  if (!sourcePath) {
    return { type: "none" };
  }
  return resolver.toObsidianNavigationPath({
    vaultRelativePath: sourcePath,
    line: candidate.startLine,
    endLine: candidate.endLine,
  });
}

function nativeProjectionId(candidate: ContextCandidate): string {
  return `native:${candidate.sourceId}:${candidate.identityKey}`;
}

function syntheticProjectionId(candidate: ContextCandidate): string {
  return `synthetic:${candidate.sourceId}:${candidate.identityKey}`;
}

function statusProjectionId(candidate: ContextCandidate): string {
  return `status:${candidate.sourceId}:${candidate.identityKey}`;
}

function lineSelection(startLine?: number, endLine?: number) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return undefined;
  }
  if (!startLine || !endLine || startLine <= 0 || endLine <= 0) {
    return undefined;
  }

  const start = Math.min(startLine, endLine);
  const end = Math.max(startLine, endLine);
  return {
    startLine: start,
    startChar: 0,
    endLine: end,
    endChar: 0,
  };
}

function formatCandidateForPrompt(candidate: ContextCandidate): string {
  const source = formatCandidateSource(candidate);
  const header = source
    ? `Obsidian context: ${candidate.label}\nSource: ${source}`
    : `Obsidian context: ${candidate.label}`;
  return `${header}\n\n${candidate.text}`;
}

function formatCandidateSource(candidate: ContextCandidate): string | null {
  const sourceFile = candidate.navigationSourceFile ?? candidate.sourceFile;
  if (!sourceFile) {
    return null;
  }

  if (candidate.startLine === undefined) {
    return sourceFile;
  }

  if (candidate.endLine === undefined || candidate.startLine === candidate.endLine) {
    return `${sourceFile}:L${candidate.startLine}`;
  }

  return `${sourceFile}:L${candidate.startLine}-L${candidate.endLine}`;
}

function normalizeVaultRelativePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  if (trimmed.includes("\u0000") || trimmed.includes("\r") || trimmed.includes("\n")) {
    return null;
  }

  const normalized = normalize(trimmed);
  if (!isAbsolute(normalized) && (normalized === ".." || normalized.startsWith(`..${sep}`))) {
    return null;
  }
  return normalized;
}

function cloneSelection<T extends object | undefined>(selection: T): T {
  return selection ? ({ ...selection } as T) : selection;
}
