import type { CandidateRegistry, CandidateSnapshotRef } from "./CandidateRegistry";
import type { PromptContextProjection } from "./PromptContextProjection";

export interface PromptInjectionPlan {
  id: string;
  sessionId: string;
  candidateIds: string[];
  requestBody: unknown;
}

interface StoredPromptInjectionPlan {
  sessionId: string;
  candidateRefs: CandidateSnapshotRef[];
  skippedDynamicRefs: CandidateSnapshotRef[];
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

  prepare(
    sessionId: string,
    requestBody: unknown,
    projections: PromptContextProjection[]
  ): PromptInjectionPlan | null {
    const synthetic = projections.filter(
      (projection): projection is Extract<PromptContextProjection, { kind: "synthetic-text" }> =>
        projection.kind === "synthetic-text"
    );
    const candidateIds = uniqueCandidateIds(
      projections
        .filter((projection) => projection.kind !== "status-only")
        .flatMap(projectionCandidateIds)
    );
    const hasSkippedDynamic = this.candidates
      .getCandidates()
      .some((candidate) => candidate.lifetime === "dynamic" && !candidate.included);
    if (candidateIds.length === 0 && !hasSkippedDynamic) {
      return null;
    }

    if (synthetic.length > 0 && !isPromptRequestBody(requestBody)) {
      this.candidates.markFailed(
        synthetic.flatMap(projectionCandidateIds),
        "OpenCode prompt body did not expose a parts array"
      );
      return null;
    }

    const planId = `prompt-plan:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const candidateParts = synthetic.map((projection) => ({
      type: "text",
      text: projection.text,
      synthetic: true,
    }));
    const nextBody =
      candidateParts.length > 0 && isPromptRequestBody(requestBody)
        ? {
            ...requestBody,
            parts: [...requestBody.parts, ...candidateParts],
          }
        : requestBody;

    const currentCandidates = this.candidates.getCandidates();
    this.plans.set(planId, {
      sessionId,
      candidateRefs: snapshotCandidateRefs(currentCandidates, candidateIds),
      skippedDynamicRefs: snapshotSkippedDynamicRefs(currentCandidates),
    });

    return {
      id: planId,
      sessionId,
      candidateIds,
      requestBody: nextBody,
    };
  }

  complete(planId: string): void {
    const plan = this.plans.get(planId);
    if (!plan) {
      return;
    }

    this.plans.delete(planId);
    if (this.candidates.getSessionId() !== plan.sessionId) {
      return;
    }
    this.candidates.consumeSent(plan.candidateRefs, {
      restoreDynamicRefs: plan.skippedDynamicRefs,
    });
  }

  fail(planId: string, reason: string): void {
    const plan = this.plans.get(planId);
    if (!plan) {
      return;
    }

    this.plans.delete(planId);
    if (this.candidates.getSessionId() !== plan.sessionId) {
      return;
    }
    this.candidates.markFailed(plan.candidateRefs, reason);
  }
}

function isPromptRequestBody(value: unknown): value is PromptRequestBody {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { parts?: unknown }).parts)
  );
}

function uniqueCandidateIds(candidateIds: string[]): string[] {
  return Array.from(new Set(candidateIds));
}

function projectionCandidateIds(projection: PromptContextProjection): string[] {
  return projection.candidateIds ?? [projection.candidateId];
}

function snapshotCandidateRefs(
  candidates: { id: string; identityKey: string; fingerprint: string }[],
  candidateIds: string[]
): CandidateSnapshotRef[] {
  const candidateIdSet = new Set(candidateIds);
  return candidates
    .filter((candidate) => candidateIdSet.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      identityKey: candidate.identityKey,
      fingerprint: candidate.fingerprint,
    }));
}

function snapshotSkippedDynamicRefs(
  candidates: {
    id: string;
    identityKey: string;
    fingerprint: string;
    lifetime: string;
    included: boolean;
  }[]
): CandidateSnapshotRef[] {
  const skippedDynamicIds = candidates
    .filter((candidate) => candidate.lifetime === "dynamic" && !candidate.included)
    .map((candidate) => candidate.id);
  return snapshotCandidateRefs(candidates, skippedDynamicIds);
}
