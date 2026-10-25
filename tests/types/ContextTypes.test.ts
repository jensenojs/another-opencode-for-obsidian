import { expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  normalizeOpenCodeSettings,
  type ContextCandidate,
} from "../../src/types";

type UnexpectedContextCandidateKeys = Extract<
  keyof ContextCandidate,
  "messageId" | "partId" | "sourceData"
>;
const candidateHasNoCommittedKeys: UnexpectedContextCandidateKeys extends never ? true : false =
  true;

test("ContextCandidate is local pre-send state with an explicit lifetime", () => {
  const candidate = {
    id: "candidate-1",
    sourceId: "selection",
    sourceKind: "selection",
    identityKey: "selection:1",
    fingerprint: "fp-1",
    label: "Selection",
    text: "candidate context",
    sourceFile: "notes/example.md",
    startLine: 3,
    endLine: 6,
    included: true,
    lifetime: "one-shot",
    status: "active",
    createdAt: 1760000000000,
    updatedAt: 1760000000000,
  } satisfies ContextCandidate;

  expect(candidate.lifetime).toBe("one-shot");
  expect(candidateHasNoCommittedKeys).toBe(true);
});

test("normalizeOpenCodeSettings defaults to prompt-coupled context assist", () => {
  const settings = normalizeOpenCodeSettings(null);

  expect(settings.contextAssist).toEqual(DEFAULT_SETTINGS.contextAssist);
  expect("contextCommitMode" in settings).toBe(false);
  expect("candidateSources" in settings).toBe(false);
  expect("injectWorkspaceContext" in settings).toBe(false);
});

test("normalizeOpenCodeSettings drops old oc-ctx fields instead of migrating them", () => {
  const legacyData = {
    contextCommitMode: "manual",
    candidateSources: {
      workspace: false,
      selection: false,
      backlinks: true,
      cursor: true,
    },
    maxNotesInContext: 40,
    maxSelectionLength: 5000,
    injectWorkspaceContext: true,
    autoAddSelectionContext: true,
    autoAddBacklinksContext: false,
    autoAddCursorContext: true,
  };
  const settings = normalizeOpenCodeSettings(
    legacyData as unknown as Parameters<typeof normalizeOpenCodeSettings>[0]
  );

  expect(settings.contextAssist).toEqual(DEFAULT_SETTINGS.contextAssist);
  expect("contextCommitMode" in settings).toBe(false);
  expect("candidateSources" in settings).toBe(false);
  expect("maxNotesInContext" in settings).toBe(false);
  expect("maxSelectionLength" in settings).toBe(false);
  expect("autoAddBacklinksContext" in settings).toBe(false);
  expect("autoAddCursorContext" in settings).toBe(false);
});

test("normalizeOpenCodeSettings merges the new contextAssist shape", () => {
  const settings = normalizeOpenCodeSettings({
    contextAssist: {
      enabled: false,
      workspace: {
        enabled: true,
        maxOpenNotes: 4,
        includeActiveLocation: false,
      },
      selection: {
        enabled: true,
        maxSnippets: 2,
        maxCharsPerSnippet: 1200,
      },
    },
  });

  expect(settings.contextAssist).toEqual({
    enabled: false,
    workspace: {
      enabled: true,
      maxOpenNotes: 4,
      includeActiveLocation: false,
    },
    selection: {
      enabled: true,
      maxSnippets: 2,
      maxCharsPerSnippet: 1200,
    },
  });
});
