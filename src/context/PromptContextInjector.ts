import type { ContextCandidate } from "../types";
import type { CandidateRegistry } from "./CandidateRegistry";

export interface PromptInjectionPlan {
  id: string;
  sessionId: string;
  candidateIds: string[];
  requestBody: unknown;
}

interface StoredPromptInjectionPlan {
  sessionId: string;
  candidateIds: string[];
}

interface PromptRequestBody {
  parts: unknown[];
  [key: string]: unknown;
}

// Prompt-request-coupled adapter. It turns included local candidates into
// synthetic parts on the same OpenCode prompt request.
export class PromptContextInjector {
  private plans = new Map<string, StoredPromptInjectionPlan>();

  constructor(private candidates: CandidateRegistry) {}

  prepare(sessionId: string, requestBody: unknown): PromptInjectionPlan | null {
    const included = this.candidates.snapshotIncluded(sessionId);
    const hasSkippedDynamic = this.candidates
      .getCandidates()
      .some((candidate) => candidate.lifetime === "dynamic" && !candidate.included);
    if (included.length === 0 && !hasSkippedDynamic) {
      return null;
    }

    if (!isPromptRequestBody(requestBody)) {
      if (included.length > 0) {
        this.candidates.markFailed(
          included.map((candidate) => candidate.id),
          "OpenCode prompt body did not expose a parts array"
        );
      }
      return null;
    }

    const planId = `prompt-plan:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const candidateParts = included.map((candidate) => ({
      type: "text",
      text: formatCandidateForPrompt(candidate),
      synthetic: true,
    }));
    const nextBody: PromptRequestBody = {
      ...requestBody,
      parts: [...requestBody.parts, ...candidateParts],
    };

    this.plans.set(planId, {
      sessionId,
      candidateIds: included.map((candidate) => candidate.id),
    });

    return {
      id: planId,
      sessionId,
      candidateIds: included.map((candidate) => candidate.id),
      requestBody: nextBody,
    };
  }

  complete(planId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) {
      return;
    }

    this.plans.delete(planId);
    this.candidates.consumeSent(plan.candidateIds);
  }

  fail(planId: string, reason: string): void {
    const plan = this.plans.get(planId);
    if (!plan) {
      return;
    }

    this.plans.delete(planId);
    this.candidates.markFailed(plan.candidateIds, reason);
  }
}

function isPromptRequestBody(value: unknown): value is PromptRequestBody {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { parts?: unknown }).parts)
  );
}

function formatCandidateForPrompt(candidate: ContextCandidate): string {
  const source = formatCandidateSource(candidate);
  const header = source
    ? `Obsidian context: ${candidate.label}\nSource: ${source}`
    : `Obsidian context: ${candidate.label}`;
  return `${header}\n\n${candidate.text}`;
}

function formatCandidateSource(candidate: ContextCandidate): string | null {
  const sourceFile = candidate.navigationSourceFile ?? candidate.sourceFile;
  if (!sourceFile) {
    return null;
  }

  if (candidate.startLine === undefined) {
    return sourceFile;
  }

  if (candidate.endLine === undefined || candidate.startLine === candidate.endLine) {
    return `${sourceFile}:L${candidate.startLine}`;
  }

  return `${sourceFile}:L${candidate.startLine}-L${candidate.endLine}`;
}
