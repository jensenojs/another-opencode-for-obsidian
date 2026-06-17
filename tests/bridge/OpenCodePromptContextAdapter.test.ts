import { describe, expect, test } from "bun:test";
import type { ContextCandidate } from "../../src/types";
import {
  OPENCODE_PROMPT_CONTEXT_OWNER,
  candidateToOpenCodePromptContextCard,
} from "../../src/bridge/OpenCodePromptContextAdapter";

describe("OpenCodePromptContextAdapter", () => {
  test("maps a candidate to an OpenCode file context card", () => {
    const card = candidateToOpenCodePromptContextCard(
      makeCandidate({
        id: "candidate-selection",
        sourceId: "selection",
        sourceFile: "notes/source.md",
        navigationSourceFile: "notes/nav.md",
        startLine: 12,
        endLine: 14,
      })
    );

    expect(card).toEqual({
      owner: OPENCODE_PROMPT_CONTEXT_OWNER,
      candidateId: "candidate-selection",
      sourceId: "selection",
      item: {
        type: "file",
        path: "notes/nav.md",
        selection: {
          startLine: 12,
          startChar: 0,
          endLine: 14,
          endChar: 0,
        },
      },
    });
  });

  test("normalizes reversed line ranges", () => {
    const card = candidateToOpenCodePromptContextCard(
      makeCandidate({
        startLine: 20,
        endLine: 18,
      })
    );

    expect(card?.item.selection).toEqual({
      startLine: 18,
      startChar: 0,
      endLine: 20,
      endChar: 0,
    });
  });

  test("omits selection when the candidate has no line range", () => {
    const card = candidateToOpenCodePromptContextCard(
      makeCandidate({
        startLine: undefined,
        endLine: undefined,
      })
    );

    expect(card?.item).toEqual({
      type: "file",
      path: "notes/source.md",
      selection: undefined,
    });
  });
});

function makeCandidate(overrides: Partial<ContextCandidate> = {}): ContextCandidate {
  return {
    id: "candidate-1",
    sourceId: "workspace",
    sourceKind: "workspace",
    identityKey: "active",
    fingerprint: "fp-1",
    label: "Workspace",
    text: "workspace context",
    sourceFile: "notes/source.md",
    included: true,
    lifetime: "dynamic",
    status: "active",
    createdAt: 1760000000000,
    updatedAt: 1760000000000,
    ...overrides,
  };
}
