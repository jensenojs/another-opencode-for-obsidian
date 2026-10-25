import { describe, expect, test } from "bun:test";
import { CandidateRegistry } from "../../src/context/CandidateRegistry";
import { PromptContextInjector } from "../../src/context/PromptContextInjector";
import type { ContextCandidate } from "../../src/types";

describe("PromptContextInjector", () => {
  test("appends file attachments to the prompt body and leaves parts untouched", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "manual", sourceKind: "manual" }));
    registry.upsert(makeCandidate({ id: "skipped", identityKey: "skipped", included: false }));
    const injector = new PromptContextInjector(registry);
    const parts = [{ type: "text", text: "user prompt" }];

    const plan = injector.prepare("ses_1", { text: "user prompt", parts });

    expect(plan?.candidateIds).toEqual(["manual"]);
    const body = plan?.requestBody as {
      text: string;
      parts: unknown;
      files: Array<{ uri: string; name: string }>;
    };
    expect(body.parts).toEqual(parts);
    expect(body.files.map((file) => file.name)).toEqual([
      "obsidian-context:manual:Selection-notes-example.md-3-5",
    ]);
    expect(decodeAttachment(body.files[0].uri)).toBe(
      "Obsidian context: Selection: notes/example.md:3-5\nSource: notes/example.md:L3-L5\n\nselected text"
    );
  });

  test("keeps file attachments already present on the body", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "manual", sourceKind: "manual" }));
    const injector = new PromptContextInjector(registry);
    const existing = { uri: "data:text/plain;base64,bw==", name: "user-upload.txt" };

    const plan = injector.prepare("ses_1", { text: "hi", files: [existing] });
    const body = plan?.requestBody as { files: Array<{ name: string }> };

    expect(body.files.map((file) => file.name)).toEqual([
      "user-upload.txt",
      "obsidian-context:manual:Selection-notes-example.md-3-5",
    ]);
  });

  test("returns no-op when there are no included candidates", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    const injector = new PromptContextInjector(registry);

    expect(injector.prepare("ses_1", { text: "user" })).toBeNull();
  });

  test("resets skipped dynamic candidates after a successful prompt", () => {
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

    const requestBody = { text: "user" };
    const plan = injector.prepare("ses_1", requestBody);

    expect(plan?.candidateIds).toEqual([]);
    expect(plan?.requestBody).toEqual(requestBody);
    injector.complete(plan!.id);
    expect(registry.getCandidates()).toMatchObject([{ id: "workspace", included: true }]);
  });

  test("marks included candidates failed when the prompt body is not an object", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection" }));
    const injector = new PromptContextInjector(registry);

    expect(injector.prepare("ses_1", "not a body")).toBeNull();
    expect(registry.getCandidates()).toMatchObject([
      {
        id: "selection",
        status: "failed",
        statusReason: "OpenCode prompt body is not a JSON object",
      },
    ]);
  });

  test("complete consumes one-shot candidates, keeps dynamic candidates, records delivery", () => {
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
    const plan = injector.prepare("ses_1", { text: "user" });

    injector.complete(plan!.id);

    expect(registry.getCandidates()).toMatchObject([{ id: "workspace", lifetime: "dynamic" }]);
    expect(injector.getLastDelivery()).toMatchObject({
      count: 2,
      labels: ["Selection: notes/example.md:3-5", "Selection: notes/example.md:3-5"],
    });
  });

  test("fail keeps candidates and marks them for retry", () => {
    const registry = new CandidateRegistry();
    registry.setSession("ses_1");
    registry.upsert(makeCandidate({ id: "selection" }));
    const injector = new PromptContextInjector(registry);
    const plan = injector.prepare("ses_1", { text: "user" });

    injector.fail(plan!.id, "prompt request failed");

    expect(registry.getCandidates()).toMatchObject([
      { id: "selection", status: "failed", statusReason: "prompt request failed" },
    ]);
    expect(injector.getLastDelivery()).toBeNull();
  });
});

function decodeAttachment(uri: string): string {
  const base64 = uri.slice("data:text/plain;base64,".length);
  return Buffer.from(base64, "base64").toString("utf8");
}

function makeCandidate(overrides: Partial<ContextCandidate>): ContextCandidate {
  return {
    id: "selection",
    sourceId: "selection",
    sourceKind: "selection",
    identityKey: "selection:1",
    fingerprint: "fp-1",
    label: "Selection: notes/example.md:3-5",
    text: "selected text",
    sourceFile: "notes/example.md",
    startLine: 3,
    endLine: 5,
    included: true,
    lifetime: "one-shot",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
