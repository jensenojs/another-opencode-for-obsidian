import type {
  NativePromptContextProjection,
  PromptContextProjectionFailure,
} from "../context/PromptContextProjection";
import type { ContextCandidate } from "../types";
import type { NativePromptContextProjectionSyncResult } from "./NativePromptContextBridge";
import {
  openCodePromptContextItemKey,
  type OpenCodeFileContextItem,
  type OpenCodePromptContextItem,
} from "./OpenCodePromptContextAdapter";

export interface PromptContextSurfaceTrace {
  reason: string;
  checkedAt: string;
  syncRevision?: number;
  consistent: boolean;
  statusBar: {
    candidateCount: number;
    includedCandidateCount: number;
    nativeProjectionCount: number;
    projectionFailureCount: number;
    nativeSyncFailureCount: number;
    candidates: PromptContextCandidateTrace[];
    nativeProjections: PromptContextNativeProjectionTrace[];
    projectionFailures: PromptContextProjectionFailureTrace[];
    nativeSyncFailures: PromptContextNativeSyncFailureTrace[];
  };
  webUi: {
    itemCount: number;
    items: PromptContextWebUiItemTrace[];
  };
  mismatch: PromptContextSurfaceMismatch | null;
}

export interface PromptContextSurfaceTraceSummary {
  reason: string;
  checkedAt: string;
  syncRevision?: number;
  consistent: boolean;
  statusBar: {
    candidateCount: number;
    includedCandidateCount: number;
    nativeProjectionCount: number;
    projectionFailureCount: number;
    nativeSyncFailureCount: number;
  };
  webUi: {
    itemCount: number;
  };
  mismatch: PromptContextSurfaceMismatch | null;
}

export interface PromptContextCandidateTrace {
  id: string;
  sourceId: string;
  sourceKind: ContextCandidate["sourceKind"];
  identityKey: string;
  included: boolean;
  lifetime: ContextCandidate["lifetime"];
  status: ContextCandidate["status"];
  sourceFile: string;
  navigationSourceFile: string | null;
  startLine: number | null;
  endLine: number | null;
  sourceDataKind: string | null;
}

export interface PromptContextNativeProjectionTrace {
  projectionId: string;
  candidateId: string;
  sourceId: string;
  sourceKind: ContextCandidate["sourceKind"];
  key: string;
  path: string;
  selection: OpenCodeFileContextItem["selection"] | null;
  commentID: string | null;
  commentOrigin: OpenCodeFileContextItem["commentOrigin"] | null;
  clickActionType: NativePromptContextProjection["clickAction"]["type"];
}

export interface PromptContextProjectionFailureTrace {
  candidateId: string;
  projectionId: string;
  reason: PromptContextProjectionFailure["reason"];
  sourcePath: string;
}

export interface PromptContextNativeSyncFailureTrace {
  projectionId: string;
  candidateId: string | null;
  key: string | null;
  status: NativePromptContextProjectionSyncResult["status"];
  reason: string | null;
}

export interface PromptContextWebUiItemTrace {
  key: string;
  path: string;
  selection: OpenCodePromptContextItem["selection"] | null;
  commentID: string | null;
  commentOrigin: OpenCodePromptContextItem["commentOrigin"] | null;
  hasComment: boolean;
  previewLength: number | null;
}

export interface PromptContextSurfaceMismatch {
  expectedNativeCardCount: number;
  webUiItemCount: number;
  missingExpectedKeys: string[];
  unexpectedWebUiKeys: string[];
  duplicateExpectedKeys: string[];
  duplicateWebUiKeys: string[];
  failedNativeSyncProjectionIds: string[];
  failedNativeSyncKeys: string[];
}

export interface PromptContextSurfaceCleanupPlan {
  removeKeys: string[];
  skipped: PromptContextSurfaceCleanupSkippedItem[];
}

export interface PromptContextSurfaceCleanupSkippedItem {
  key: string;
  reason: "comment-item";
}

export function buildPromptContextSurfaceTrace(input: {
  reason: string;
  checkedAt?: Date;
  syncRevision?: number;
  candidates: ContextCandidate[];
  nativeProjections: NativePromptContextProjection[];
  projectionFailures: PromptContextProjectionFailure[];
  nativeSyncResults?: NativePromptContextProjectionSyncResult[];
  webUiItems: OpenCodePromptContextItem[];
}): PromptContextSurfaceTrace {
  const nativeProjections = input.nativeProjections.map(summarizeNativeProjection);
  const webUiItems = input.webUiItems.map(summarizeWebUiItem);
  const nativeSyncFailures = summarizeNativeSyncFailures(
    input.nativeSyncResults ?? [],
    nativeProjections
  );
  const expectedKeys = nativeProjections.map((projection) => projection.key);
  const webUiKeys = webUiItems.map((item) => item.key);
  const mismatch = buildMismatch(expectedKeys, webUiKeys, nativeSyncFailures);

  return {
    reason: input.reason,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
    syncRevision: input.syncRevision,
    consistent: mismatch === null,
    statusBar: {
      candidateCount: input.candidates.length,
      includedCandidateCount: input.candidates.filter((candidate) => candidate.included).length,
      nativeProjectionCount: nativeProjections.length,
      projectionFailureCount: input.projectionFailures.length,
      nativeSyncFailureCount: nativeSyncFailures.length,
      candidates: input.candidates.map(summarizeCandidate),
      nativeProjections,
      projectionFailures: input.projectionFailures.map(summarizeProjectionFailure),
      nativeSyncFailures,
    },
    webUi: {
      itemCount: webUiItems.length,
      items: webUiItems,
    },
    mismatch,
  };
}

export function summarizePromptContextSurfaceTrace(
  trace: PromptContextSurfaceTrace
): PromptContextSurfaceTraceSummary {
  return {
    reason: trace.reason,
    checkedAt: trace.checkedAt,
    syncRevision: trace.syncRevision,
    consistent: trace.consistent,
    statusBar: {
      candidateCount: trace.statusBar.candidateCount,
      includedCandidateCount: trace.statusBar.includedCandidateCount,
      nativeProjectionCount: trace.statusBar.nativeProjectionCount,
      projectionFailureCount: trace.statusBar.projectionFailureCount,
      nativeSyncFailureCount: trace.statusBar.nativeSyncFailureCount,
    },
    webUi: {
      itemCount: trace.webUi.itemCount,
    },
    mismatch: trace.mismatch ? cloneMismatch(trace.mismatch) : null,
  };
}

export function planPromptContextSurfaceCleanup(
  trace: PromptContextSurfaceTrace
): PromptContextSurfaceCleanupPlan {
  if (!trace.mismatch) {
    return { removeKeys: [], skipped: [] };
  }

  const unexpectedKeys = new Set(trace.mismatch.unexpectedWebUiKeys);
  const removeKeys: string[] = [];
  const skipped: PromptContextSurfaceCleanupSkippedItem[] = [];

  for (const item of trace.webUi.items) {
    if (!unexpectedKeys.has(item.key)) {
      continue;
    }
    if (item.commentID || item.hasComment) {
      skipped.push({ key: item.key, reason: "comment-item" });
      continue;
    }
    removeKeys.push(item.key);
  }

  return { removeKeys, skipped };
}

function summarizeCandidate(candidate: ContextCandidate): PromptContextCandidateTrace {
  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    sourceKind: candidate.sourceKind,
    identityKey: candidate.identityKey,
    included: candidate.included,
    lifetime: candidate.lifetime,
    status: candidate.status,
    sourceFile: candidate.sourceFile,
    navigationSourceFile: candidate.navigationSourceFile ?? null,
    startLine: candidate.startLine ?? null,
    endLine: candidate.endLine ?? null,
    sourceDataKind: candidate.sourceData?.kind ?? null,
  };
}

function summarizeNativeProjection(
  projection: NativePromptContextProjection
): PromptContextNativeProjectionTrace {
  return {
    projectionId: projection.projectionId,
    candidateId: projection.candidateId,
    sourceId: projection.sourceId,
    sourceKind: projection.sourceKind,
    key: openCodePromptContextItemKey(projection.item),
    path: projection.item.path,
    selection: projection.item.selection ?? null,
    commentID: projection.item.commentID ?? null,
    commentOrigin: projection.item.commentOrigin ?? null,
    clickActionType: projection.clickAction.type,
  };
}

function summarizeProjectionFailure(
  failure: PromptContextProjectionFailure
): PromptContextProjectionFailureTrace {
  return {
    candidateId: failure.candidateId,
    projectionId: failure.projectionId,
    reason: failure.reason,
    sourcePath: failure.sourcePath,
  };
}

function summarizeNativeSyncFailures(
  results: NativePromptContextProjectionSyncResult[],
  nativeProjections: PromptContextNativeProjectionTrace[]
): PromptContextNativeSyncFailureTrace[] {
  const expectedProjectionIds = new Set(
    nativeProjections.map((projection) => projection.projectionId)
  );
  return results
    .filter((result) => {
      if (!expectedProjectionIds.has(result.projectionId)) {
        return false;
      }
      return result.status !== "synced" && result.status !== "unchanged";
    })
    .map((result) => ({
      projectionId: result.projectionId,
      candidateId: result.candidateId ?? null,
      key: result.key ?? null,
      status: result.status,
      reason: result.reason ?? null,
    }));
}

function summarizeWebUiItem(item: OpenCodePromptContextItem): PromptContextWebUiItemTrace {
  return {
    key: item.key || openCodePromptContextItemKey(item),
    path: item.path,
    selection: item.selection ?? null,
    commentID: item.commentID ?? null,
    commentOrigin: item.commentOrigin ?? null,
    hasComment: typeof item.comment === "string" && item.comment.length > 0,
    previewLength: item.preview?.length ?? null,
  };
}

function buildMismatch(
  expectedKeys: string[],
  webUiKeys: string[],
  nativeSyncFailures: PromptContextNativeSyncFailureTrace[]
): PromptContextSurfaceMismatch | null {
  const missingExpectedKeys = multisetDifference(expectedKeys, webUiKeys);
  const unexpectedWebUiKeys = multisetDifference(webUiKeys, expectedKeys);
  const duplicateExpectedKeys = duplicateKeys(expectedKeys);
  const duplicateWebUiKeys = duplicateKeys(webUiKeys);
  const failedNativeSyncProjectionIds = nativeSyncFailures.map((failure) => failure.projectionId);
  const failedNativeSyncKeys = nativeSyncFailures
    .map((failure) => failure.key)
    .filter((key): key is string => Boolean(key));
  const countMismatch = expectedKeys.length !== webUiKeys.length;

  if (
    !countMismatch &&
    missingExpectedKeys.length === 0 &&
    unexpectedWebUiKeys.length === 0 &&
    duplicateExpectedKeys.length === 0 &&
    duplicateWebUiKeys.length === 0 &&
    failedNativeSyncProjectionIds.length === 0
  ) {
    return null;
  }

  return {
    expectedNativeCardCount: expectedKeys.length,
    webUiItemCount: webUiKeys.length,
    missingExpectedKeys,
    unexpectedWebUiKeys,
    duplicateExpectedKeys,
    duplicateWebUiKeys,
    failedNativeSyncProjectionIds,
    failedNativeSyncKeys,
  };
}

function cloneMismatch(mismatch: PromptContextSurfaceMismatch): PromptContextSurfaceMismatch {
  return {
    expectedNativeCardCount: mismatch.expectedNativeCardCount,
    webUiItemCount: mismatch.webUiItemCount,
    missingExpectedKeys: [...mismatch.missingExpectedKeys],
    unexpectedWebUiKeys: [...mismatch.unexpectedWebUiKeys],
    duplicateExpectedKeys: [...mismatch.duplicateExpectedKeys],
    duplicateWebUiKeys: [...mismatch.duplicateWebUiKeys],
    failedNativeSyncProjectionIds: [...mismatch.failedNativeSyncProjectionIds],
    failedNativeSyncKeys: [...mismatch.failedNativeSyncKeys],
  };
}

function multisetDifference(left: string[], right: string[]): string[] {
  const counts = new Map<string, number>();
  for (const key of right) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const diff: string[] = [];
  for (const key of left) {
    const count = counts.get(key) ?? 0;
    if (count <= 0) {
      diff.push(key);
      continue;
    }
    counts.set(key, count - 1);
  }
  return diff;
}

function duplicateKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      duplicates.add(key);
      continue;
    }
    seen.add(key);
  }
  return Array.from(duplicates);
}
