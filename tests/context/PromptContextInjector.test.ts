import { describe, expect, test } from "bun:test";
import { CandidateRegistry } from "../../src/context/CandidateRegistry";
import { PromptContextInjector } from "../../src/context/PromptContextInjector";
import type { ContextCandidate } from "../../src/types";

describe("PromptContextInjector", () => {
  test("appends included candidates as synthetic text parts without noReply", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(
      makeCandidate({ id: "workspace", sourceKind: "workspace", lifetime: "dynamic" })
    );
    registry.upsert(makeCandidate({ id: "skipped", identityKey: "skipped", included: false }));
    const injector = new PromptContextInjector(registry);

    const plan = injector.prepare("ses_1", {
      parts: [{ type: "text", text: "user prompt" }],
    });

    expect(plan?.candidateIds).toEqual(["workspace"]);
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

    expect(injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] })).toBeNull();
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
    const plan = injector.prepare("ses_1", requestBody);

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

    expect(injector.prepare("ses_1", { prompt: "unknown" })).toBeNull();
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
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] });

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([{ id: "workspace", lifetime: "dynamic" }]);
  });

  test("fail keeps candidates and records the reason", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection" }));
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { parts: [{ type: "text", text: "user" }] });

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
