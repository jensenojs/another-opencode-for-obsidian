import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CandidateRegistry } from "../../src/context/CandidateRegistry";
import type { ContextCandidate } from "../../src/types";

describe("CandidateRegistry", () => {
  test("upserts candidates by source identity and keeps stable local state", () => {
    const registry = new CandidateRegistry();
    const first = makeCandidate({ id: "candidate-1", fingerprint: "fp-1", text: "first" });
    const inserted = registry.upsert(first);

    expect(inserted).toEqual(first);
    expect(registry.getCandidates()).toEqual([first]);

    registry.setIncluded("candidate-1", false);
    const updated = registry.upsert(
      makeCandidate({ id: "candidate-2", fingerprint: "fp-2", text: "second" })
    );

    expect(updated.id).toBe("candidate-1");
    expect(updated.fingerprint).toBe("fp-2");
    expect(updated.text).toBe("second");
    expect(updated.included).toBe(false);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(registry.getCandidates()).toEqual([updated]);
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

  test("enforces bounded source queues with FIFO eviction", () => {
    const registry = new CandidateRegistry();
    registry.setSourceLimit("selection", 2);
    registry.upsert(makeCandidate({ id: "first", identityKey: "first", createdAt: 1 }));
    registry.upsert(makeCandidate({ id: "second", identityKey: "second", createdAt: 2 }));
    registry.upsert(makeCandidate({ id: "third", identityKey: "third", createdAt: 3 }));

    expect(registry.getCandidates().map((candidate) => candidate.id)).toEqual(["second", "third"]);
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

    const changed = registry.consumeSent(["selection"]);

    expect(changed.map((candidate) => candidate.id)).toEqual(["selection", "workspace"]);
    expect(registry.getCandidates()).toMatchObject([
      { id: "workspace", lifetime: "dynamic", included: true },
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
