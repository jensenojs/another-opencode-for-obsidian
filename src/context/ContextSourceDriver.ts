import type {
  CandidateLifetime,
  ContextCandidateSourceData,
  ContextCandidateSourceKind,
  OpenCodeSettings,
} from "../types";

// Contract for Obsidian-side context sources. Drivers produce source results;
// managers and adapters decide how those candidates reach OpenCode.
export interface ContextCandidateInput {
  sourceId: string;
  sourceKind: ContextCandidateSourceKind;
  identityKey: string;
  fingerprint: string;
  label: string;
  text: string;
  sourceFile: string;
  navigationSourceFile?: string;
  startLine?: number;
  endLine?: number;
  lifetime: CandidateLifetime;
  sourceData?: ContextCandidateSourceData;
}

export type ContextSourceResult =
  | { type: "upsert"; candidate: ContextCandidateInput }
  | { type: "remove"; sourceId: string; identityKey: string }
  | { type: "clear-source"; sourceId: string }
  | { type: "failed"; sourceId: string; identityKey: string; reason: string };

export interface ContextSourceDriver {
  readonly sourceId: string;
  start(): void;
  stop(): void;
  reset(): void;
  updateSettings(settings: OpenCodeSettings): void;
}
