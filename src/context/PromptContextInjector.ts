import type { ContextCandidate } from "../types";
import type { CandidateRegistry, CandidateSnapshotRef } from "./CandidateRegistry";
import { buildPromptAttachments } from "./PromptAttachments";

export type PromptDelivery = {
  at: number;
  count: number;
  labels: string[];
};

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
  labels: string[];
}

interface PromptRequestBody {
  files?: unknown;
  [key: string]: unknown;
}

// Prompt-request-coupled adapter. Included candidates become `files`
// attachments on the OpenCode /api/session/{id}/prompt body.
export class PromptContextInjector {
  private plans = new Map<string, StoredPromptInjectionPlan>();
  private lastDelivery: PromptDelivery | null = null;

  constructor(private candidates: CandidateRegistry) {}

  getLastDelivery(): PromptDelivery | null {
    return this.lastDelivery;
  }

  prepare(sessionId: string, requestBody: unknown): PromptInjectionPlan | null {
    const candidates = this.candidates.getCandidates();
    const included = candidates.filter((candidate) => candidate.included);
    const skippedDynamicRefs = snapshotRefs(
      candidates.filter((candidate) => candidate.lifetime === "dynamic" && !candidate.included)
    );
    if (included.length === 0 && skippedDynamicRefs.length === 0) {
      return null;
    }

    const body = isPromptRequestBody(requestBody) ? requestBody : null;
    if (included.length > 0 && !body) {
      this.candidates.markFailed(
        snapshotRefs(included),
        "OpenCode prompt body is not a JSON object"
      );
      return null;
    }

    const planId = `prompt-plan:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    let nextBody = requestBody;
    if (body && included.length > 0) {
      const files = Array.isArray(body.files) ? body.files : [];
      nextBody = { ...body, files: [...files, ...buildPromptAttachments(included)] };
    }

    this.plans.set(planId, {
      sessionId,
      candidateRefs: snapshotRefs(included),
      skippedDynamicRefs,
      labels: included.map((candidate) => candidate.label),
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
    if (this.candidates.getSessionId() !== plan.sessionId) {
      return;
    }
    this.lastDelivery =
      plan.labels.length === 0
        ? this.lastDelivery
        : { at: Date.now(), count: plan.labels.length, labels: plan.labels };
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotRefs(candidates: ContextCandidate[]): CandidateSnapshotRef[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    identityKey: candidate.identityKey,
    fingerprint: candidate.fingerprint,
  }));
}
