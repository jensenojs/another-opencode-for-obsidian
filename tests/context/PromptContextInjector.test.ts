import { describe, expect, test } from "bun:test";
import { CandidateRegistry } from "../../src/context/CandidateRegistry";
import { PromptContextInjector } from "../../src/context/PromptContextInjector";
import type { ContextCandidate } from "../../src/types";
import type { PromptContextProjection } from "../../src/context/PromptContextProjection";

describe("PromptContextInjector", () => {
  test("appends synthetic-text projections without noReply", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "manual", sourceKind: "manual" }));
    registry.upsert(makeCandidate({ id: "skipped", identityKey: "skipped", included: false }));
    const injector = new PromptContextInjector(registry);

    const plan = injector.prepare(
      "ses_1",
      {
        parts: [{ type: "text", text: "user prompt" }],
      },
      [syntheticProjection("manual")]
    );

    expect(plan?.candidateIds).toEqual(["manual"]);
    expect(plan?.requestBody).toEqual({
      parts: [
        { type: "text", text: "user prompt" },
        {
          type: "text",
          text: "Obsidian context: Selection\nSource: notes/example.md:L3-L5\n\nselected text",
          synthetic: true,
        },
      ],
    });
    expect(JSON.stringify(plan?.requestBody)).not.toContain("noReply");
  });

  test("returns no-op when there are no included candidates", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    const injector = new PromptContextInjector(registry);

    expect(injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [])).toBeNull();
  });

  test("creates an unchanged plan to reset skipped dynamic candidates after a successful prompt", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
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
    const injector = new PromptContextInjector(registry);

    const requestBody = { parts: [{ type: "text", text: "user" }] };
    const plan = injector.prepare("ses_1", requestBody, []);

    expect(plan?.candidateIds).toEqual([]);
    expect(plan?.requestBody).toEqual(requestBody);
    injector.complete(plan!.id);
    expect(registry.getCandidates()).toMatchObject([{ id: "workspace", included: true }]);
  });

  test("marks included candidates failed when the request body is unknown", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection" }));
    const injector = new PromptContextInjector(registry);

    expect(
      injector.prepare("ses_1", { prompt: "unknown" }, [syntheticProjection("selection")])
    ).toBeNull();
    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        status: "failed",
        statusReason: "OpenCode prompt body did not expose a parts array",
      },
    ]);
  });

  test("complete consumes one-shot candidates and keeps dynamic candidates", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection", lifetime: "one-shot" }));
    registry.upsert(
      makeCandidate({
        id: "workspace",
        identityKey: "workspace",
        sourceKind: "workspace",
        lifetime: "dynamic",
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      nativeProjection("selection"),
      nativeProjection("workspace"),
    ]);

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([{ id: "workspace", lifetime: "dynamic" }]);
  });

  test("complete consumes every one-shot candidate represented by a merged native projection", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection-a", identityKey: "selection-a" }));
    registry.upsert(
      makeCandidate({ id: "selection-b", identityKey: "selection-b", startLine: 10, endLine: 12 })
    );
    registry.upsert(
      makeCandidate({
        id: "workspace",
        identityKey: "workspace",
        sourceKind: "workspace",
        lifetime: "dynamic",
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      {
        ...nativeProjection("selection-a"),
        candidateIds: ["selection-a", "selection-b", "workspace"],
      },
    ]);

    expect(plan?.candidateIds).toEqual(["selection-a", "selection-b", "workspace"]);

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([{ id: "workspace", lifetime: "dynamic" }]);
  });

  test("complete does not consume an overlapping selection created after prepare", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(
      makeCandidate({
        id: "selection",
        identityKey: "selection-old",
        fingerprint: "old",
        startLine: 3,
        endLine: 5,
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      nativeProjection("selection"),
    ]);

    registry.upsert(
      makeCandidate({
        id: "selection-new",
        identityKey: "selection-new",
        fingerprint: "new",
        text: "new overlapping selection",
        startLine: 4,
        endLine: 6,
      })
    );

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        identityKey: "selection-new",
        fingerprint: "new",
        text: "new overlapping selection",
        lifetime: "one-shot",
      },
    ]);
  });

  test("complete does not consume the same selection recreated in a newer session", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(
      makeCandidate({
        id: "selection",
        identityKey: "selection-same",
        fingerprint: "same",
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      nativeProjection("selection"),
    ]);

    registry.setSession("ses_2");
    registry.upsert(
      makeCandidate({
        id: "selection",
        identityKey: "selection-same",
        fingerprint: "same",
      })
    );

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        identityKey: "selection-same",
        fingerprint: "same",
        lifetime: "one-shot",
      },
    ]);
  });

  test("fail does not mark an overlapping selection created after prepare", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(
      makeCandidate({
        id: "selection",
        identityKey: "selection-old",
        fingerprint: "old",
        startLine: 3,
        endLine: 5,
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      syntheticProjection("selection"),
    ]);

    registry.upsert(
      makeCandidate({
        id: "selection-new",
        identityKey: "selection-new",
        fingerprint: "new",
        text: "new overlapping selection",
        startLine: 4,
        endLine: 6,
      })
    );

    injector.fail(plan!.id, "HTTP 500");

    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        identityKey: "selection-new",
        fingerprint: "new",
        status: "active",
      },
    ]);
    expect(registry.getCandidates()[0].statusReason).toBeUndefined();
  });

  test("fail does not mark the same selection recreated in a newer session", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(
      makeCandidate({
        id: "selection",
        identityKey: "selection-same",
        fingerprint: "same",
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      syntheticProjection("selection"),
    ]);

    registry.setSession("ses_2");
    registry.upsert(
      makeCandidate({
        id: "selection",
        identityKey: "selection-same",
        fingerprint: "same",
      })
    );

    injector.fail(plan!.id, "HTTP 500");

    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        identityKey: "selection-same",
        fingerprint: "same",
        status: "active",
      },
    ]);
  });

  test("complete restores only dynamic candidates skipped when prepare ran", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(
      makeCandidate({
        id: "workspace",
        sourceId: "workspace",
        sourceKind: "workspace",
        identityKey: "current",
        fingerprint: "workspace-old",
        lifetime: "dynamic",
        included: false,
      })
    );
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, []);

    registry.upsert(
      makeCandidate({
        id: "graph",
        sourceId: "graph",
        sourceKind: "graph",
        identityKey: "current",
        fingerprint: "graph-new",
        lifetime: "dynamic",
        included: false,
      })
    );

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([
      { id: "workspace", lifetime: "dynamic", included: true },
      { id: "graph", lifetime: "dynamic", included: false },
    ]);
  });

  test("fail keeps candidates and records the reason", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection" }));
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] }, [
      syntheticProjection("selection"),
    ]);

    injector.fail(plan!.id, "HTTP 500");

    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        status: "failed",
        statusReason: "HTTP 500",
      },
    ]);
  });
});

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

function syntheticProjection(candidateId: string): PromptContextProjection {
  return {
    kind: "synthetic-text",
    projectionId: `synthetic:${candidateId}`,
    candidateId,
    text: "Obsidian context: Selection\nSource: notes/example.md:L3-L5\n\nselected text",
  };
}

function nativeProjection(candidateId: string): PromptContextProjection {
  return {
    kind: "native-file-card",
    projectionId: `native:${candidateId}`,
    candidateId,
    native: {
      projectionId: `native:${candidateId}`,
      candidateId,
      sourceId: candidateId,
      sourceKind: candidateId === "workspace" ? "workspace" : "selection",
      fingerprint: "fp-1",
      label: "Selection",
      item: {
        type: "file",
        path: "/vault/notes/example.md",
        selection: {
          startLine: 3,
          startChar: 0,
          endLine: 5,
          endChar: 0,
        },
      },
      clickAction: { type: "obsidian-open", path: "notes/example.md", line: 3, endLine: 5 },
    },
  };
}
