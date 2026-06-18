import { describe, expect, test } from "bun:test";
import {
  buildPromptContextProjections,
  createOpenCodeContextPathResolver,
  filterNativeFileCardProjections,
  filterSyntheticTextProjections,
} from "../../src/context/PromptContextProjection";
import type { ContextCandidate } from "../../src/types";

describe("PromptContextProjection", () => {
  test("projects workspace to one native file card for the active location", () => {
    const result = buildPromptContextProjections(
      [
        makeCandidate({
          id: "workspace",
          sourceId: "workspace",
          sourceKind: "workspace",
          identityKey: "current",
          lifetime: "dynamic",
          sourceFile: "Obsidian workspace",
          navigationSourceFile: "notes/active.md",
          startLine: 12,
          endLine: 12,
        }),
      ],
      resolver()
    );

    expect(filterNativeFileCardProjections(result.projections)).toHaveLength(1);
    expect(filterSyntheticTextProjections(result.projections)).toHaveLength(0);
    expect(result.projections[0]).toMatchObject({
      kind: "native-file-card",
      projectionId: "native:workspace:current",
      native: {
        item: {
          type: "file",
          path: "/vault/notes/active.md",
          selection: {
            startLine: 12,
            startChar: 0,
            endLine: 12,
            endChar: 0,
          },
        },
        clickAction: { type: "obsidian-open", path: "notes/active.md", line: 12 },
      },
    });
  });

  test("projects workspace to a native file card when it has a file target without an active line", () => {
    const result = buildPromptContextProjections(
      [
        makeCandidate({
          id: "workspace",
          sourceId: "workspace",
          sourceKind: "workspace",
          identityKey: "current",
          lifetime: "dynamic",
          sourceFile: "Obsidian workspace",
          navigationSourceFile: "notes/active.md",
          startLine: undefined,
          endLine: undefined,
        }),
      ],
      resolver()
    );

    expect(filterNativeFileCardProjections(result.projections)).toHaveLength(1);
    expect(filterSyntheticTextProjections(result.projections)).toHaveLength(0);
    expect(result.projections[0]).toMatchObject({
      kind: "native-file-card",
      projectionId: "native:workspace:current",
      native: {
        item: {
          type: "file",
          path: "/vault/notes/active.md",
          selection: undefined,
        },
        clickAction: { type: "obsidian-open", path: "notes/active.md" },
      },
    });
    expect(result.failures).toEqual([]);
  });

  test("keeps workspace aggregate synthetic when it has no concrete file target", () => {
    const result = buildPromptContextProjections(
      [
        makeCandidate({
          id: "workspace",
          sourceId: "workspace",
          sourceKind: "workspace",
          identityKey: "current",
          lifetime: "dynamic",
          sourceFile: "Obsidian workspace",
          navigationSourceFile: undefined,
          startLine: undefined,
          endLine: undefined,
        }),
      ],
      resolver()
    );

    expect(filterNativeFileCardProjections(result.projections)).toEqual([]);
    expect(filterSyntheticTextProjections(result.projections)).toHaveLength(1);
    expect(result.failures).toEqual([]);
  });

  test("projects selection to a one-shot native range card", () => {
    const result = buildPromptContextProjections([makeCandidate()], resolver());

    expect(result.failures).toEqual([]);
    expect(filterNativeFileCardProjections(result.projections)[0].native.item).toEqual({
      type: "file",
      path: "/vault/notes/example.md",
      selection: {
        startLine: 3,
        startChar: 0,
        endLine: 5,
        endChar: 0,
      },
    });
  });

  test("uses synthetic text when a path cannot be converted to an OpenCode-readable path", () => {
    const result = buildPromptContextProjections(
      [
        makeCandidate({
          id: "bad-selection",
          navigationSourceFile: "https://example.com/A.md",
        }),
      ],
      resolver()
    );

    expect(filterNativeFileCardProjections(result.projections)).toEqual([]);
    expect(filterSyntheticTextProjections(result.projections)).toHaveLength(1);
    expect(result.failures).toEqual([
      {
        candidateId: "bad-selection",
        projectionId: "native:selection:selection",
        reason: "unsupported-path",
        sourcePath: "https://example.com/A.md",
      },
    ]);
  });

  test("does not create synthetic text for candidates already projected as native cards", () => {
    const result = buildPromptContextProjections(
      [
        makeCandidate(),
        makeCandidate({
          id: "manual",
          sourceId: "manual",
          sourceKind: "manual",
          identityKey: "manual",
        }),
      ],
      resolver()
    );

    expect(
      filterNativeFileCardProjections(result.projections).map((item) => item.candidateId)
    ).toEqual(["selection"]);
    expect(
      filterSyntheticTextProjections(result.projections).map((item) => item.candidateId)
    ).toEqual(["manual"]);
  });

  test("restores native OpenCode comment cards from candidate sourceData", () => {
    const result = buildPromptContextProjections(
      [
        makeCandidate({
          id: "comment",
          sourceId: "opencode-native-comment",
          sourceKind: "opencode-native-comment",
          identityKey: "opencode-comment:/repo/a.ts:c1",
          sourceFile: "/repo/a.ts",
          navigationSourceFile: "/repo/a.ts",
          sourceData: {
            kind: "opencode-native-comment",
            key: "file:/repo/a.ts:7:7:c=c1",
            item: {
              type: "file",
              path: "/repo/a.ts",
              selection: { startLine: 7, startChar: 0, endLine: 7, endChar: 0 },
              comment: "check this",
              commentID: "c1",
              commentOrigin: "review",
              preview: "const a = 1",
            },
          },
        }),
      ],
      resolver()
    );

    expect(filterNativeFileCardProjections(result.projections)[0].native).toMatchObject({
      item: {
        type: "file",
        path: "/repo/a.ts",
        comment: "check this",
        commentID: "c1",
        commentOrigin: "review",
      },
      clickAction: { type: "opencode-open-comment" },
    });
  });
});

function resolver() {
  return createOpenCodeContextPathResolver({
    vaultBasePath: "/vault",
    fileExists: (path) => path === "notes/example.md" || path === "notes/active.md",
  });
}

function makeCandidate(overrides: Partial<ContextCandidate> = {}): ContextCandidate {
  return {
    id: "selection",
    sourceId: "selection",
    sourceKind: "selection",
    identityKey: "selection",
    fingerprint: "fp-1",
    label: "Selection",
    text: "selected text",
    sourceFile: "notes/example.md",
    navigationSourceFile: "notes/example.md",
    startLine: 3,
    endLine: 5,
    included: true,
    lifetime: "one-shot",
    status: "active",
    createdAt: 1760000000000,
    updatedAt: 1760000000000,
    ...overrides,
  };
}
