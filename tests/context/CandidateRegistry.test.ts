import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CandidateRegistry } from "../../src/context/CandidateRegistry";
import type { ContextCandidate } from "../../src/types";

describe("CandidateRegistry", () => {
  test("upserts candidates by source identity and keeps stable local state", () => {
    const registry = new CandidateRegistry();
    const first = makeCandidate({
      id: "candidate-1",
      sourceId: "workspace",
      sourceKind: "workspace",
      lifetime: "dynamic",
      fingerprint: "fp-1",
      text: "first",
    });
    const inserted = registry.upsert(first);

    expect(inserted).toEqual(first);
    expect(registry.getCandidates()).toEqual([first]);

    registry.setIncluded("candidate-1", false);
    const updated = registry.upsert(
      makeCandidate({
        id: "candidate-2",
        sourceId: "workspace",
        sourceKind: "workspace",
        lifetime: "dynamic",
        fingerprint: "fp-2",
        text: "second",
      })
    );

    expect(updated.id).toBe("candidate-1");
    expect(updated.fingerprint).toBe("fp-2");
    expect(updated.text).toBe("second");
    expect(updated.included).toBe(false);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(registry.getCandidates()).toEqual([updated]);
  });

  test("selection upsert restores included state as a fresh user intent", () => {
    const registry = new CandidateRegistry();
    const first = makeCandidate({ id: "selection", included: true, createdAt: 1, updatedAt: 1 });
    registry.upsert(first);
    registry.setIncluded("selection", false);

    const restored = registry.upsert(
      makeCandidate({ id: "selection-recreated", createdAt: 3, updatedAt: 3 })
    );

    expect(restored).toMatchObject({
      id: "selection",
      included: true,
      createdAt: 3,
      updatedAt: 3,
    });
    expect(registry.getCandidates()[0]).toMatchObject({
      id: "selection",
      included: true,
      createdAt: 3,
      updatedAt: 3,
    });
  });

  test("does not emit a changed snapshot when the source fingerprint is unchanged", () => {
    const registry = new CandidateRegistry();
    const snapshots: ContextCandidate[][] = [];
    registry.onCandidatesChanged((items) => snapshots.push(items));

    const candidate = makeCandidate();
    registry.upsert(candidate);
    registry.upsert(makeCandidate({ id: "candidate-recreated", updatedAt: 1760000000999 }));

    expect(snapshots).toHaveLength(2);
    expect(registry.getCandidates()[0]).toEqual(candidate);
  });

  test("toggles included state locally without committed message ids", () => {
    const registry = new CandidateRegistry();
    registry.upsert(makeCandidate({ id: "candidate-1", included: true }));

    const toggled = registry.toggleIncluded("candidate-1");
    const snapshot = registry.getCandidates()[0];

    expect(toggled?.included).toBe(false);
    expect(snapshot.included).toBe(false);
    expect("messageId" in snapshot).toBe(false);
    expect("partId" in snapshot).toBe(false);
  });

  test("snapshots only included candidates for the current session", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "included", identityKey: "included", included: true }));
    registry.upsert(makeCandidate({ id: "excluded", identityKey: "excluded", included: false }));

    expect(registry.snapshotIncluded("ses_1").map((candidate) => candidate.id)).toEqual([
      "included",
    ]);
    expect(registry.snapshotIncluded("ses_2")).toEqual([]);
  });

  test("clears candidates by source and identity", () => {
    const registry = new CandidateRegistry();
    registry.upsert(
      makeCandidate({ id: "selection", sourceId: "selection", identityKey: "active" })
    );
    registry.upsert(
      makeCandidate({ id: "graph", sourceId: "graph", sourceKind: "graph", identityKey: "active" })
    );
    registry.upsert(
      makeCandidate({ id: "graph-2", sourceId: "graph", sourceKind: "graph", identityKey: "other" })
    );

    const removedSelection = registry.removeByIdentity("selection", "active");
    const removedGraph = registry.clearSource("graph");

    expect(removedSelection?.id).toBe("selection");
    expect(removedGraph.map((candidate) => candidate.id)).toEqual(["graph", "graph-2"]);
    expect(registry.getCandidates()).toEqual([]);
  });

  test("marks existing candidates as failed and keeps them included for retry", () => {
    const registry = new CandidateRegistry();
    registry.upsert(
      makeCandidate({
        id: "workspace",
        sourceId: "workspace",
        identityKey: "current",
        included: true,
      })
    );

    const failed = registry.markFailed(["workspace"], "OpenCode rejected context");

    expect(failed[0].status).toBe("failed");
    expect(failed[0].statusReason).toBe("OpenCode rejected context");
    expect(failed[0].included).toBe(true);
    expect(registry.snapshotIncluded()[0].status).toBe("failed");
  });

  test("preserves native comment sourceData across equivalent source updates", () => {
    const registry = new CandidateRegistry();
    const candidate = makeCandidate({
      id: "comment",
      sourceId: "opencode-native-comment",
      sourceKind: "opencode-native-comment",
      identityKey: "opencode-comment:/repo/a.ts:c1",
      sourceData: {
        kind: "opencode-native-comment",
        key: "file:/repo/a.ts:1:1:c=c1",
        item: {
          type: "file",
          path: "/repo/a.ts",
          selection: { startLine: 1, startChar: 0, endLine: 1, endChar: 0 },
          comment: "check this",
          commentID: "c1",
          commentOrigin: "review",
        },
      },
    });

    registry.upsert(candidate);
    registry.setIncluded("comment", false);
    registry.upsert(makeCandidate({ ...candidate, id: "comment-recreated" }));

    expect(registry.getCandidates()[0]).toMatchObject({
      id: "comment",
      included: false,
      sourceData: candidate.sourceData,
    });
  });

  test("enforces bounded source queues with FIFO eviction", () => {
    const registry = new CandidateRegistry();
    registry.setSourceLimit("selection", 2);
    registry.upsert(
      makeCandidate({ id: "first", identityKey: "first", startLine: 1, endLine: 1, createdAt: 1 })
    );
    registry.upsert(
      makeCandidate({
        id: "second",
        identityKey: "second",
        startLine: 3,
        endLine: 3,
        createdAt: 2,
      })
    );
    registry.upsert(
      makeCandidate({ id: "third", identityKey: "third", startLine: 5, endLine: 5, createdAt: 3 })
    );

    expect(registry.getCandidates().map((candidate) => candidate.id)).toEqual(["second", "third"]);
  });

  test("upserts overlapping selection ranges in the same note", () => {
    const registry = new CandidateRegistry();
    const first = makeCandidate({
      id: "selection-a",
      identityKey: "selection-a",
      fingerprint: "note:10-20:a",
      text: "first selection",
      startLine: 10,
      endLine: 20,
      createdAt: 1,
    });
    registry.upsert(first);
    registry.setIncluded("selection-a", false);

    const updated = registry.upsert(
      makeCandidate({
        id: "selection-b",
        identityKey: "selection-b",
        fingerprint: "note:15-25:b",
        text: "overlapping selection",
        startLine: 15,
        endLine: 25,
        createdAt: 2,
      })
    );

    expect(updated).toMatchObject({
      id: "selection-a",
      identityKey: "selection-b",
      fingerprint: "note:15-25:b",
      text: "overlapping selection",
      startLine: 15,
      endLine: 25,
      included: true,
      createdAt: 2,
    });
    expect(registry.getCandidates()).toEqual([updated]);
  });

  test("coalesces multiple existing selection ranges when the next selection overlaps them", () => {
    const registry = new CandidateRegistry();
    registry.upsert(
      makeCandidate({
        id: "selection-a",
        identityKey: "selection-a",
        startLine: 10,
        endLine: 12,
        createdAt: 1,
      })
    );
    registry.upsert(
      makeCandidate({
        id: "selection-b",
        identityKey: "selection-b",
        fingerprint: "note:14-16:b",
        text: "second selection",
        startLine: 14,
        endLine: 16,
        createdAt: 2,
      })
    );

    const updated = registry.upsert(
      makeCandidate({
        id: "selection-c",
        identityKey: "selection-c",
        fingerprint: "note:12-14:c",
        text: "bridging selection",
        startLine: 12,
        endLine: 14,
        createdAt: 3,
      })
    );

    expect(updated.id).toBe("selection-a");
    expect(registry.getCandidates()).toEqual([updated]);
    expect(updated).toMatchObject({
      identityKey: "selection-c",
      text: "bridging selection",
      startLine: 12,
      endLine: 14,
      createdAt: 3,
    });
  });

  test("keeps refreshed overlapping selections ahead of older source-limit entries", () => {
    const registry = new CandidateRegistry();
    registry.setSourceLimit("selection", 2);
    registry.upsert(
      makeCandidate({
        id: "selection-a",
        identityKey: "selection-a",
        startLine: 10,
        endLine: 12,
        createdAt: 1,
      })
    );
    registry.upsert(
      makeCandidate({
        id: "selection-b",
        identityKey: "selection-b",
        fingerprint: "note:20-22:b",
        text: "second selection",
        startLine: 20,
        endLine: 22,
        createdAt: 2,
      })
    );

    registry.upsert(
      makeCandidate({
        id: "selection-a-new",
        identityKey: "selection-a-new",
        fingerprint: "note:11-13:a-new",
        text: "refreshed first selection",
        startLine: 11,
        endLine: 13,
        createdAt: 3,
      })
    );
    registry.upsert(
      makeCandidate({
        id: "selection-c",
        identityKey: "selection-c",
        fingerprint: "note:30-32:c",
        text: "third selection",
        startLine: 30,
        endLine: 32,
        createdAt: 4,
      })
    );

    expect(registry.getCandidates().map((candidate) => candidate.id)).toEqual([
      "selection-a",
      "selection-c",
    ]);
  });

  test("keeps adjacent selection ranges separate", () => {
    const registry = new CandidateRegistry();
    registry.upsert(
      makeCandidate({
        id: "selection-a",
        identityKey: "selection-a",
        startLine: 10,
        endLine: 12,
      })
    );
    registry.upsert(
      makeCandidate({
        id: "selection-b",
        identityKey: "selection-b",
        fingerprint: "note:13-15:b",
        text: "next selection",
        startLine: 13,
        endLine: 15,
      })
    );

    expect(registry.getCandidates().map((candidate) => candidate.id)).toEqual([
      "selection-a",
      "selection-b",
    ]);
  });

  test("consumes one-shot candidates after send and keeps dynamic candidates", () => {
    const registry = new CandidateRegistry();
    registry.upsert(
      makeCandidate({ id: "selection", identityKey: "selection", lifetime: "one-shot" })
    );
    registry.upsert(
      makeCandidate({
        id: "workspace",
        sourceId: "workspace",
        sourceKind: "workspace",
        identityKey: "current",
        lifetime: "dynamic",
        included: false,
      })
    );

    const changed = registry.consumeSent(["selection"], { restoreDynamicRefs: ["workspace"] });

    expect(changed.map((candidate) => candidate.id)).toEqual(["selection", "workspace"]);
    expect(registry.getCandidates()).toMatchObject([
      { id: "workspace", lifetime: "dynamic", included: true },
    ]);
  });

  test("does not restore skipped dynamic candidates outside the send snapshot", () => {
    const registry = new CandidateRegistry();
    registry.upsert(
      makeCandidate({
        id: "workspace",
        sourceId: "workspace",
        sourceKind: "workspace",
        identityKey: "current",
        lifetime: "dynamic",
        included: false,
      })
    );

    const changed = registry.consumeSent([]);

    expect(changed).toEqual([]);
    expect(registry.getCandidates()).toMatchObject([
      { id: "workspace", lifetime: "dynamic", included: false },
    ]);
  });

  test("clears candidates when the current OpenCode session changes", () => {
    const registry = new CandidateRegistry();
    registry.setSession("session-a");
    registry.upsert(makeCandidate({ id: "candidate-a" }));

    const removed = registry.setSession("session-b");

    expect(removed.map((candidate) => candidate.id)).toEqual(["candidate-a"]);
    expect(registry.getSessionId()).toBe("session-b");
    expect(registry.snapshotIncluded()).toEqual([]);
  });

  test("does not import OpenCode, bridge, or Obsidian resolver modules", () => {
    const source = readFileSync("src/context/CandidateRegistry.ts", "utf8");

    expect(source).not.toContain("../client");
    expect(source).not.toContain("../bridge");
    expect(source).not.toContain("obsidian");
    expect(source).not.toContain("ContextSyncer");
  });
});

function makeCandidate(overrides: Partial<ContextCandidate> = {}): ContextCandidate {
  return {
    id: "candidate-1",
    sourceId: "selection",
    sourceKind: "selection",
    identityKey: "active",
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
