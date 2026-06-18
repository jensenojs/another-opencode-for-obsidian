import {
  openCodePromptContextItemKey,
  type OpenCodeFileContextItem,
  type OpenCodePromptContextItem,
  type OpenCodePromptContextPort,
  type PromptContextAddResult,
  type PromptContextRemoveResult,
  type PromptContextReplaceResult,
  type PromptContextUpdateResult,
} from "./OpenCodePromptContextAdapter";
import type {
  PromptContextCommandPayload,
  PromptContextCommandResultPayload,
} from "./BridgeProtocol";
import type {
  NativePromptContextProjection,
  PromptContextClickAction,
} from "../context/PromptContextProjection";

type PromptContextCommandInput =
  | { action: "items" }
  | {
      action: "add";
      projectionId: string;
      item: OpenCodeFileContextItem;
      clickAction: PromptContextClickAction;
    }
  | { action: "remove"; key: string }
  | { action: "removeComment"; path: string; commentID: string }
  | {
      action: "updateComment";
      path: string;
      commentID: string;
      next: Partial<OpenCodeFileContextItem> & { comment?: string };
    }
  | { action: "replaceComments"; items: OpenCodeFileContextItem[] };

export type NativePromptContextProjectionSyncStatus =
  | "synced"
  | "removed"
  | "unchanged"
  | "conflict"
  | "missing"
  | "failed";

export interface NativePromptContextProjectionSyncResult {
  projectionId: string;
  candidateId?: string;
  key?: string;
  status: NativePromptContextProjectionSyncStatus;
  reason?: string;
}

export interface NativePromptContextSyncResult {
  revision: number;
  results: NativePromptContextProjectionSyncResult[];
}

interface ProjectionRecord {
  projection: NativePromptContextProjection;
  key: string;
}

export class NativePromptContextBridge {
  private revision = 0;
  private projectionRecords = new Map<string, ProjectionRecord>();
  private activationEntries = new Map<
    string,
    { projectionId: string; candidateId: string; clickAction: PromptContextClickAction }
  >();

  constructor(private port: OpenCodePromptContextPort) {}

  async sync(projections: NativePromptContextProjection[]): Promise<NativePromptContextSyncResult> {
    const revision = ++this.revision;
    const desired = new Map(projections.map((projection) => [projection.projectionId, projection]));
    const results: NativePromptContextProjectionSyncResult[] = [];

    for (const [projectionId, record] of Array.from(this.projectionRecords.entries())) {
      if (desired.has(projectionId)) {
        continue;
      }
      results.push(await this.removeRecord(record));
    }

    for (const projection of projections) {
      results.push(await this.syncProjection(projection));
    }

    return { revision, results };
  }

  async clearOwner(): Promise<NativePromptContextSyncResult> {
    const revision = ++this.revision;
    const results: NativePromptContextProjectionSyncResult[] = [];
    for (const record of Array.from(this.projectionRecords.values())) {
      results.push(await this.removeRecord(record));
    }
    this.projectionRecords.clear();
    this.activationEntries.clear();
    return { revision, results };
  }

  async getWebUiItems(): Promise<OpenCodePromptContextItem[]> {
    return this.port.items();
  }

  async removeWebUiItem(key: string): Promise<PromptContextRemoveResult> {
    return this.port.remove(key);
  }

  getActivationAction(key: string): PromptContextClickAction | null {
    return this.activationEntries.get(key)?.clickAction ?? null;
  }

  getCandidateIdForKey(key: string): string | null {
    return this.activationEntries.get(key)?.candidateId ?? null;
  }

  resolveCommandResult(payload: PromptContextCommandResultPayload): void {
    if (this.port instanceof PostMessagePromptContextPort) {
      this.port.resolveCommandResult(payload);
    }
  }

  private async syncProjection(
    projection: NativePromptContextProjection
  ): Promise<NativePromptContextProjectionSyncResult> {
    const nextKey = openCodePromptContextItemKey(projection.item);
    const existing = this.projectionRecords.get(projection.projectionId);

    if (
      existing &&
      existing.key === nextKey &&
      existing.projection.fingerprint === projection.fingerprint
    ) {
      return {
        projectionId: projection.projectionId,
        candidateId: projection.candidateId,
        key: nextKey,
        status: "unchanged",
      };
    }

    try {
      if (existing && existing.key !== nextKey) {
        await this.removeRecord(existing);
      }

      const result =
        existing && shouldUpdateComment(existing.projection.item, projection.item)
          ? await this.port.updateComment(
              projection.item.path,
              projection.item.commentID!,
              projection.item
            )
          : await this.port.add(projection.item, projection.projectionId, projection.clickAction);

      return this.applySyncResult(projection, result);
    } catch (error) {
      return {
        projectionId: projection.projectionId,
        candidateId: projection.candidateId,
        key: nextKey,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private applySyncResult(
    projection: NativePromptContextProjection,
    result: PromptContextAddResult | PromptContextUpdateResult
  ): NativePromptContextProjectionSyncResult {
    if (result.status === "conflict") {
      this.projectionRecords.delete(projection.projectionId);
      this.activationEntries.delete(result.key);
      return {
        projectionId: projection.projectionId,
        candidateId: projection.candidateId,
        key: result.key,
        status: "conflict",
        reason: result.reason,
      };
    }

    if (result.status === "missing") {
      return {
        projectionId: projection.projectionId,
        candidateId: projection.candidateId,
        status: "missing",
      };
    }

    const item = result.item;
    this.projectionRecords.set(projection.projectionId, {
      projection,
      key: item.key,
    });
    this.activationEntries.set(item.key, {
      projectionId: projection.projectionId,
      candidateId: projection.candidateId,
      clickAction: projection.clickAction,
    });
    return {
      projectionId: projection.projectionId,
      candidateId: projection.candidateId,
      key: item.key,
      status: "synced",
    };
  }

  private async removeRecord(
    record: ProjectionRecord
  ): Promise<NativePromptContextProjectionSyncResult> {
    try {
      const result = await this.port.remove(record.key);
      this.projectionRecords.delete(record.projection.projectionId);
      this.activationEntries.delete(record.key);
      return {
        projectionId: record.projection.projectionId,
        candidateId: record.projection.candidateId,
        key: record.key,
        status: result.status === "removed" ? "removed" : "missing",
      };
    } catch (error) {
      return {
        projectionId: record.projection.projectionId,
        candidateId: record.projection.candidateId,
        key: record.key,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class PostMessagePromptContextPort implements OpenCodePromptContextPort {
  private pending = new Map<
    string,
    {
      resolve: (payload: PromptContextCommandResultPayload) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private sendCommand: (payload: PromptContextCommandPayload) => void,
    private timeoutMs = 3000
  ) {}

  resolveCommandResult(payload: PromptContextCommandResultPayload): void {
    const pending = this.pending.get(payload.transactionId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(payload.transactionId);
    if (!payload.ok) {
      pending.reject(new Error(payload.error ?? "prompt context command failed"));
      return;
    }
    pending.resolve(payload);
  }

  async items(): Promise<OpenCodePromptContextItem[]> {
    const payload = await this.execute({ action: "items" });
    return payload.items ?? [];
  }

  async add(
    item: OpenCodeFileContextItem,
    projectionId: string,
    clickAction: PromptContextClickAction = { type: "none" }
  ): Promise<PromptContextAddResult> {
    const payload = await this.execute({ action: "add", item, projectionId, clickAction });
    return payload.result as PromptContextAddResult;
  }

  async remove(key: string): Promise<PromptContextRemoveResult> {
    const payload = await this.execute({ action: "remove", key });
    return payload.result as PromptContextRemoveResult;
  }

  async removeComment(path: string, commentID: string): Promise<PromptContextRemoveResult> {
    const payload = await this.execute({ action: "removeComment", path, commentID });
    return payload.result as PromptContextRemoveResult;
  }

  async updateComment(
    path: string,
    commentID: string,
    next: Partial<OpenCodeFileContextItem> & { comment?: string }
  ): Promise<PromptContextUpdateResult> {
    const payload = await this.execute({ action: "updateComment", path, commentID, next });
    return payload.result as PromptContextUpdateResult;
  }

  async replaceComments(items: OpenCodeFileContextItem[]): Promise<PromptContextReplaceResult> {
    const payload = await this.execute({ action: "replaceComments", items });
    return payload.result as PromptContextReplaceResult;
  }

  private execute(payload: PromptContextCommandInput): Promise<PromptContextCommandResultPayload> {
    const transactionId = `prompt-context:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const command = {
      ...payload,
      transactionId,
    } as PromptContextCommandPayload;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(transactionId);
        reject(new Error("prompt context command timed out"));
      }, this.timeoutMs);

      this.pending.set(transactionId, { resolve, reject, timer });
      this.sendCommand(command);
    });
  }
}

function shouldUpdateComment(
  previous: OpenCodeFileContextItem,
  next: OpenCodeFileContextItem
): boolean {
  return Boolean(
    previous.commentID &&
    next.commentID &&
    previous.commentID === next.commentID &&
    previous.path === next.path
  );
}
