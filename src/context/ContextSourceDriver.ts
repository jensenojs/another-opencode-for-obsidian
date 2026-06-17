import type { CandidateLifetime, ContextCandidateSourceKind, OpenCodeSettings } from "../types";

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
