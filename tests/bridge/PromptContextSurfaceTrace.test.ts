import { describe, expect, test } from "bun:test";
import {
  buildPromptContextSurfaceTrace,
  planPromptContextSurfaceCleanup,
  summarizePromptContextSurfaceTrace,
} from "../../src/bridge/PromptContextSurfaceTrace";
import type { NativePromptContextProjection } from "../../src/context/PromptContextProjection";
import type { ContextCandidate } from "../../src/types";

describe("PromptContextSurfaceTrace", () => {
  test("reports consistency when StatusBar native projections match Web UI items", () => {
    const projection = makeProjection();
    const trace = buildPromptContextSurfaceTrace({
      reason: "test",
      checkedAt: new Date("2026-06-18T00:00:00.000Z"),
      syncRevision: 7,
      candidates: [makeCandidate()],
      nativeProjections: [projection],
      projectionFailures: [],
      webUiItems: [
        {
          key: "file:/vault/a.md:2:2",
          ...projection.item,
        },
      ],
    });

    expect(trace).toMatchObject({
      reason: "test",
      checkedAt: "2026-06-18T00:00:00.000Z",
      syncRevision: 7,
      consistent: true,
      statusBar: {
        candidateCount: 1,
        includedCandidateCount: 1,
        nativeProjectionCount: 1,
        projectionFailureCount: 0,
      },
      webUi: {
        itemCount: 1,
      },
      mismatch: null,
    });
  });

  test("records a trace when Web UI has items not represented by StatusBar projections", () => {
    const trace = buildPromptContextSurfaceTrace({
      reason: "prompt-context-ready",
      checkedAt: new Date("2026-06-18T00:00:00.000Z"),
      candidates: [
        makeCandidate({
          sourceKind: "workspace",
          sourceFile: "Obsidian workspace",
          navigationSourceFile: undefined,
        }),
      ],
      nativeProjections: [],
      projectionFailures: [],
      webUiItems: [
        {
          key: "file:/vault/orphan.md:undefined:undefined",
          type: "file",
          path: "/vault/orphan.md",
        },
      ],
    });

    expect(trace.consistent).toBe(false);
    expect(trace.mismatch).toEqual({
      expectedNativeCardCount: 0,
      webUiItemCount: 1,
      missingExpectedKeys: [],
      unexpectedWebUiKeys: ["file:/vault/orphan.md:undefined:undefined"],
      duplicateExpectedKeys: [],
      duplicateWebUiKeys: [],
    });
    expect(trace.statusBar.candidates[0]).toMatchObject({
      sourceKind: "workspace",
      sourceFile: "Obsidian workspace",
      navigationSourceFile: null,
    });
    expect(trace.webUi.items[0]).toMatchObject({
      key: "file:/vault/orphan.md:undefined:undefined",
      path: "/vault/orphan.md",
      selection: null,
    });
  });

  test("does not share mismatch objects between summary and full trace", () => {
    const trace = buildPromptContextSurfaceTrace({
      reason: "prompt-context-ready",
      checkedAt: new Date("2026-06-18T00:00:00.000Z"),
      candidates: [makeCandidate()],
      nativeProjections: [],
      projectionFailures: [],
      webUiItems: [
        {
          key: "file:/vault/orphan.md:undefined:undefined",
          type: "file",
          path: "/vault/orphan.md",
        },
      ],
    });
    const summary = summarizePromptContextSurfaceTrace(trace);

    expect(summary.mismatch).toEqual(trace.mismatch);
    expect(summary.mismatch).not.toBe(trace.mismatch);
    expect(summary.mismatch?.unexpectedWebUiKeys).not.toBe(trace.mismatch?.unexpectedWebUiKeys);
  });

  test("plans cleanup for unexpected non-comment Web UI file cards", () => {
    const trace = buildPromptContextSurfaceTrace({
      reason: "prompt-context-ready",
      checkedAt: new Date("2026-06-18T00:00:00.000Z"),
      candidates: [makeCandidate()],
      nativeProjections: [],
      projectionFailures: [],
      webUiItems: [
        {
          key: "file:/vault/orphan.md:undefined:undefined",
          type: "file",
          path: "/vault/orphan.md",
        },
      ],
    });

    expect(planPromptContextSurfaceCleanup(trace)).toEqual({
      removeKeys: ["file:/vault/orphan.md:undefined:undefined"],
      skipped: [],
    });
  });

  test("does not plan cleanup for unexpected OpenCode comment cards", () => {
    const trace = buildPromptContextSurfaceTrace({
      reason: "prompt-context-ready",
      checkedAt: new Date("2026-06-18T00:00:00.000Z"),
      candidates: [makeCandidate()],
      nativeProjections: [],
      projectionFailures: [],
      webUiItems: [
        {
          key: "file:/repo/file.ts:10:10:c=comment-1",
          type: "file",
          path: "/repo/file.ts",
          selection: { startLine: 10, startChar: 0, endLine: 10, endChar: 0 },
          commentID: "comment-1",
          commentOrigin: "review",
          comment: "comment text is intentionally not copied into the trace",
        },
      ],
    });

    expect(planPromptContextSurfaceCleanup(trace)).toEqual({
      removeKeys: [],
      skipped: [{ key: "file:/repo/file.ts:10:10:c=comment-1", reason: "comment-item" }],
    });
  });
});

function makeCandidate(overrides: Partial<ContextCandidate> = {}): ContextCandidate {
  return {
    id: "candidate:a",
    sourceId: "selection",
    sourceKind: "selection",
    identityKey: "selection:a",
    fingerprint: "fp-a",
    label: "Selection",
    text: "text is intentionally omitted from traces",
    sourceFile: "a.md",
    navigationSourceFile: "a.md",
    startLine: 2,
    endLine: 2,
    included: true,
    lifetime: "one-shot",
    status: "active",
    createdAt: 1760000000000,
    updatedAt: 1760000000000,
    ...overrides,
  };
}

function makeProjection(
  overrides: Partial<NativePromptContextProjection> = {}
): NativePromptContextProjection {
  return {
    projectionId: "native:selection:selection:a",
    candidateId: "candidate:a",
    sourceId: "selection",
    sourceKind: "selection",
    fingerprint: "fp-a",
    label: "Selection",
    item: {
      type: "file",
      path: "/vault/a.md",
      selection: { startLine: 2, startChar: 0, endLine: 2, endChar: 0 },
    },
    clickAction: { type: "obsidian-open", path: "a.md", line: 2, endLine: 2 },
    ...overrides,
  };
}
