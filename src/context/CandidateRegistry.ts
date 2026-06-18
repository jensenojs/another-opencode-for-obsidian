import type { ContextCandidate } from "../types";

type CandidateChangeCallback = (items: ContextCandidate[]) => void;

export interface CandidateSnapshotRef {
  id: string;
  identityKey: string;
  fingerprint: string;
}

type CandidateRef = string | CandidateSnapshotRef;

// Local pre-send candidate store. It owns identity, included/skipped state,
// source clearing, bounded queues, one-shot consumption, and failure status.
export class CandidateRegistry {
  private candidates: ContextCandidate[] = [];
  private sessionId: string | null = null;
  private changeCallbacks: CandidateChangeCallback[] = [];
  private sourceLimits = new Map<string, number>();

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSession(sessionId: string | null): ContextCandidate[] {
    if (this.sessionId === sessionId) {
      return [];
    }

    this.sessionId = sessionId;
    return this.clear();
  }

  getCandidates(): ContextCandidate[] {
    return this.candidates.map(copyCandidate);
  }

  setSourceLimit(sourceId: string, limit: number | null): ContextCandidate[] {
    if (limit === null) {
      this.sourceLimits.delete(sourceId);
      return [];
    }

    this.sourceLimits.set(sourceId, Math.max(0, Math.floor(limit)));
    const removed = this.applySourceLimit(sourceId);
    if (removed.length > 0) {
      this.emitCandidatesChanged();
    }
    return removed.map(copyCandidate);
  }

  onCandidatesChanged(callback: CandidateChangeCallback): () => void {
    this.changeCallbacks.push(callback);
    callback(this.getCandidates());
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index >= 0) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }

  upsert(candidate: ContextCandidate): ContextCandidate {
    const identityIndex = this.findIdentityIndex(candidate.sourceId, candidate.identityKey);
    const overlappingSelectionIndexes = this.findOverlappingSelectionIndexes(candidate);
    const index = identityIndex >= 0 ? identityIndex : (overlappingSelectionIndexes[0] ?? -1);

    if (index < 0) {
      this.candidates = [...this.candidates, copyCandidate(candidate)];
      this.applySourceLimit(candidate.sourceId);
      this.emitCandidatesChanged();
      return copyCandidate(candidate);
    }

    const existing = this.candidates[index];
    const duplicateSelectionIndexes = new Set(
      overlappingSelectionIndexes.filter((itemIndex) => itemIndex !== index)
    );
    if (duplicateSelectionIndexes.size === 0 && matchesSourceSnapshot(existing, candidate)) {
      if (shouldRestoreIncludedOnUpsert(candidate) && !existing.included) {
        const restored: ContextCandidate = {
          ...existing,
          included: true,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
        };
        this.candidates = replaceAt(this.candidates, index, restored);
        this.emitCandidatesChanged();
        return copyCandidate(restored);
      }
      return copyCandidate(existing);
    }

    const next: ContextCandidate = {
      ...candidate,
      id: existing.id,
      included: shouldRestoreIncludedOnUpsert(candidate) ? true : existing.included,
      createdAt: shouldRestoreIncludedOnUpsert(candidate)
        ? candidate.createdAt
        : existing.createdAt,
    };
    this.candidates = replaceAt(this.candidates, index, copyCandidate(next)).filter(
      (_item, itemIndex) => !duplicateSelectionIndexes.has(itemIndex)
    );
    this.applySourceLimit(candidate.sourceId);
    this.emitCandidatesChanged();
    return copyCandidate(next);
  }

  remove(candidateId: string): ContextCandidate | null {
    const candidate = this.find(candidateId);
    if (!candidate) {
      return null;
    }

    this.candidates = this.candidates.filter((item) => item.id !== candidateId);
    this.emitCandidatesChanged();
    return candidate;
  }

  removeByIdentity(sourceId: string, identityKey: string): ContextCandidate | null {
    const index = this.findIdentityIndex(sourceId, identityKey);
    if (index < 0) {
      return null;
    }

    const candidate = copyCandidate(this.candidates[index]);
    this.candidates = this.candidates.filter((_, itemIndex) => itemIndex !== index);
    this.emitCandidatesChanged();
    return candidate;
  }

  markSourceFailed(sourceId: string, identityKey: string, reason: string): ContextCandidate | null {
    const index = this.findIdentityIndex(sourceId, identityKey);
    if (index < 0) {
      return null;
    }

    const existing = this.candidates[index];
    if (existing.status === "failed" && existing.statusReason === reason) {
      return copyCandidate(existing);
    }

    const candidate: ContextCandidate = {
      ...existing,
      status: "failed",
      statusReason: reason,
      updatedAt: Date.now(),
    };
    this.candidates = replaceAt(this.candidates, index, candidate);
    this.emitCandidatesChanged();
    return copyCandidate(candidate);
  }

  markFailed(candidateRefs: CandidateRef[], reason: string): ContextCandidate[] {
    const marked: ContextCandidate[] = [];
    let changed = false;

    this.candidates = this.candidates.map((candidate) => {
      if (!matchesAnyCandidateRef(candidateRefs, candidate)) {
        return candidate;
      }
      if (candidate.status === "failed" && candidate.statusReason === reason) {
        marked.push(copyCandidate(candidate));
        return candidate;
      }

      changed = true;
      const next: ContextCandidate = {
        ...candidate,
        status: "failed",
        statusReason: reason,
        updatedAt: Date.now(),
      };
      marked.push(copyCandidate(next));
      return next;
    });

    if (changed) {
      this.emitCandidatesChanged();
    }
    return marked;
  }

  toggleIncluded(candidateId: string): ContextCandidate | null {
    const candidate = this.find(candidateId);
    if (!candidate) {
      return null;
    }

    return this.setIncluded(candidateId, !candidate.included);
  }

  setIncluded(candidateId: string, included: boolean): ContextCandidate | null {
    const index = this.candidates.findIndex((candidate) => candidate.id === candidateId);
    if (index < 0) {
      return null;
    }

    const existing = this.candidates[index];
    if (existing.included === included) {
      return copyCandidate(existing);
    }

    const candidate: ContextCandidate = { ...existing, included, updatedAt: Date.now() };
    this.candidates = replaceAt(this.candidates, index, candidate);
    this.emitCandidatesChanged();
    return copyCandidate(candidate);
  }

  snapshotIncluded(sessionId: string | null = this.sessionId): ContextCandidate[] {
    if (sessionId !== this.sessionId) {
      return [];
    }
    return this.candidates.filter((candidate) => candidate.included).map(copyCandidate);
  }

  consumeSent(
    candidateRefs: CandidateRef[],
    options: { restoreDynamicRefs?: CandidateRef[] } = {}
  ): ContextCandidate[] {
    const changed: ContextCandidate[] = [];
    const next: ContextCandidate[] = [];
    let mutated = false;
    const restoreDynamicRefs = options.restoreDynamicRefs ?? [];

    for (const candidate of this.candidates) {
      if (matchesAnyCandidateRef(candidateRefs, candidate) && candidate.lifetime === "one-shot") {
        changed.push(copyCandidate(candidate));
        mutated = true;
        continue;
      }

      if (
        candidate.lifetime === "dynamic" &&
        !candidate.included &&
        matchesAnyCandidateRef(restoreDynamicRefs, candidate)
      ) {
        const reset: ContextCandidate = {
          ...candidate,
          included: true,
          updatedAt: Date.now(),
        };
        changed.push(copyCandidate(reset));
        next.push(reset);
        mutated = true;
        continue;
      }

      next.push(candidate);
    }

    if (mutated) {
      this.candidates = next;
      this.emitCandidatesChanged();
    }
    return changed;
  }

  clearSource(sourceId: string): ContextCandidate[] {
    const removed = this.candidates.filter((candidate) => candidate.sourceId === sourceId);
    if (removed.length === 0) {
      return [];
    }

    this.candidates = this.candidates.filter((candidate) => candidate.sourceId !== sourceId);
    this.emitCandidatesChanged();
    return removed.map(copyCandidate);
  }

  clear(): ContextCandidate[] {
    if (this.candidates.length === 0) {
      return [];
    }

    const removed = this.getCandidates();
    this.candidates = [];
    this.emitCandidatesChanged();
    return removed;
  }

  private find(candidateId: string): ContextCandidate | null {
    const candidate = this.candidates.find((item) => item.id === candidateId);
    return candidate ? copyCandidate(candidate) : null;
  }

  private findIdentityIndex(sourceId: string, identityKey: string): number {
    return this.candidates.findIndex(
      (candidate) => candidate.sourceId === sourceId && candidate.identityKey === identityKey
    );
  }

  private findOverlappingSelectionIndexes(candidate: ContextCandidate): number[] {
    if (candidate.sourceKind !== "selection") {
      return [];
    }

    return this.candidates
      .map((existing, index) => ({ existing, index }))
      .filter(
        ({ existing }) =>
          existing.sourceId === candidate.sourceId &&
          existing.sourceKind === "selection" &&
          sameNavigationPath(existing, candidate) &&
          lineRangesOverlap(existing, candidate)
      )
      .map(({ index }) => index);
  }

  private emitCandidatesChanged(): void {
    const candidates = this.getCandidates();
    for (const callback of this.changeCallbacks) {
      callback(candidates);
    }
  }

  private applySourceLimit(sourceId: string): ContextCandidate[] {
    const limit = this.sourceLimits.get(sourceId);
    if (limit === undefined) {
      return [];
    }

    const sourceCandidates = this.candidates.filter((candidate) => candidate.sourceId === sourceId);
    if (sourceCandidates.length <= limit) {
      return [];
    }

    const toRemove = [...sourceCandidates]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, sourceCandidates.length - limit);
    const removeIds = new Set(toRemove.map((candidate) => candidate.id));
    this.candidates = this.candidates.filter((candidate) => !removeIds.has(candidate.id));
    return toRemove.map(copyCandidate);
  }
}

function copyCandidate(candidate: ContextCandidate): ContextCandidate {
  return {
    ...candidate,
    sourceData: candidate.sourceData ? JSON.parse(JSON.stringify(candidate.sourceData)) : undefined,
  };
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index + 1)];
}

function shouldRestoreIncludedOnUpsert(candidate: ContextCandidate): boolean {
  return candidate.sourceKind === "selection";
}

function matchesAnyCandidateRef(refs: CandidateRef[], candidate: ContextCandidate): boolean {
  return refs.some((ref) => matchesCandidateRef(ref, candidate));
}

function matchesCandidateRef(ref: CandidateRef, candidate: ContextCandidate): boolean {
  if (typeof ref === "string") {
    return candidate.id === ref;
  }
  return (
    candidate.id === ref.id &&
    candidate.identityKey === ref.identityKey &&
    candidate.fingerprint === ref.fingerprint
  );
}

function sameNavigationPath(a: ContextCandidate, b: ContextCandidate): boolean {
  return (a.navigationSourceFile ?? a.sourceFile) === (b.navigationSourceFile ?? b.sourceFile);
}

function lineRangesOverlap(a: ContextCandidate, b: ContextCandidate): boolean {
  const rangeA = lineRange(a);
  const rangeB = lineRange(b);
  if (!rangeA || !rangeB) {
    return false;
  }
  return rangeA.start <= rangeB.end && rangeB.start <= rangeA.end;
}

function lineRange(candidate: ContextCandidate): { start: number; end: number } | null {
  if (!Number.isInteger(candidate.startLine) || !Number.isInteger(candidate.endLine)) {
    return null;
  }
  if (!candidate.startLine || !candidate.endLine) {
    return null;
  }
  return {
    start: Math.min(candidate.startLine, candidate.endLine),
    end: Math.max(candidate.startLine, candidate.endLine),
  };
}

function matchesSourceSnapshot(a: ContextCandidate, b: ContextCandidate): boolean {
  return (
    a.sourceId === b.sourceId &&
    a.sourceKind === b.sourceKind &&
    a.identityKey === b.identityKey &&
    a.fingerprint === b.fingerprint &&
    a.lifetime === b.lifetime &&
    a.label === b.label &&
    a.text === b.text &&
    a.sourceFile === b.sourceFile &&
    a.navigationSourceFile === b.navigationSourceFile &&
    a.startLine === b.startLine &&
    a.endLine === b.endLine &&
    a.status === b.status &&
    a.statusReason === b.statusReason &&
    JSON.stringify(a.sourceData ?? null) === JSON.stringify(b.sourceData ?? null)
  );
}
