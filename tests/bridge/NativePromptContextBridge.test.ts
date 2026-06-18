import { describe, expect, test } from "bun:test";
import { NativePromptContextBridge } from "../../src/bridge/NativePromptContextBridge";
import {
  openCodePromptContextItemKey,
  type OpenCodeFileContextItem,
  type OpenCodePromptContextItem,
  type OpenCodePromptContextPort,
  type PromptContextAddResult,
  type PromptContextRemoveResult,
  type PromptContextReplaceResult,
  type PromptContextUpdateResult,
} from "../../src/bridge/OpenCodePromptContextAdapter";
import type { NativePromptContextProjection } from "../../src/context/PromptContextProjection";

describe("NativePromptContextBridge", () => {
  test("adds, replaces, and removes native projections by OpenCode key", async () => {
    const port = new FakePromptContextPort();
    const bridge = new NativePromptContextBridge(port);

    await bridge.sync([projection({ projectionId: "workspace", path: "/repo/a.md", line: 1 })]);
    expect(port.calls).toEqual(["add:file:/repo/a.md:1:1"]);
    expect(bridge.getActivationAction("file:/repo/a.md:1:1")).toEqual({
      type: "obsidian-open",
      path: "notes/a.md",
      line: 1,
    });

    port.calls = [];
    await bridge.sync([projection({ projectionId: "workspace", path: "/repo/a.md", line: 2 })]);
    expect(port.calls).toEqual(["remove:file:/repo/a.md:1:1", "add:file:/repo/a.md:2:2"]);

    port.calls = [];
    await bridge.sync([]);
    expect(port.calls).toEqual(["remove:file:/repo/a.md:2:2"]);
  });

  test("does not register activation entries when OpenCode reports a key conflict", async () => {
    const port = new FakePromptContextPort();
    port.conflictKeys.add("file:/repo/a.md:1:1");
    const bridge = new NativePromptContextBridge(port);

    const result = await bridge.sync([
      projection({ projectionId: "workspace", path: "/repo/a.md", line: 1 }),
    ]);

    expect(result.results[0]).toMatchObject({
      projectionId: "workspace",
      status: "conflict",
      key: "file:/repo/a.md:1:1",
    });
    expect(bridge.getActivationAction("file:/repo/a.md:1:1")).toBeNull();
  });

  test("removes mirrored comment cards by key without deleting the comment store", async () => {
    const port = new FakePromptContextPort();
    const bridge = new NativePromptContextBridge(port);
    const item: OpenCodeFileContextItem = {
      type: "file",
      path: "/repo/a.md",
      selection: { startLine: 3, startChar: 0, endLine: 3, endChar: 0 },
      comment: "check this",
      commentID: "comment-1",
      commentOrigin: "file",
    };

    await bridge.sync([commentProjection(item)]);

    port.calls = [];
    await bridge.sync([]);

    expect(port.calls).toEqual(["remove:file:/repo/a.md:3:3:c=comment-1"]);
    expect(port.commentRemoveCalls).toEqual([]);
  });

  test("clearOwner removes owned projection cards before the bridge is discarded", async () => {
    const port = new FakePromptContextPort();
    const bridge = new NativePromptContextBridge(port);

    await bridge.sync([projection({ projectionId: "workspace", path: "/repo/a.md", line: 1 })]);

    port.calls = [];
    const result = await bridge.clearOwner();

    expect(result.results).toEqual([
      {
        projectionId: "workspace",
        candidateId: "workspace",
        key: "file:/repo/a.md:1:1",
        status: "removed",
      },
    ]);
    expect(port.calls).toEqual(["remove:file:/repo/a.md:1:1"]);
    expect(bridge.getActivationAction("file:/repo/a.md:1:1")).toBeNull();
  });

  test("removes a raw Web UI item by key for surface cleanup", async () => {
    const port = new FakePromptContextPort();
    const bridge = new NativePromptContextBridge(port);
    port.itemsStore.set("file:/repo/orphan.md:undefined:undefined", {
      key: "file:/repo/orphan.md:undefined:undefined",
      type: "file",
      path: "/repo/orphan.md",
    });

    const result = await bridge.removeWebUiItem("file:/repo/orphan.md:undefined:undefined");

    expect(result).toMatchObject({
      status: "removed",
      key: "file:/repo/orphan.md:undefined:undefined",
    });
    expect(port.calls).toEqual(["remove:file:/repo/orphan.md:undefined:undefined"]);
    expect(port.itemsStore.has("file:/repo/orphan.md:undefined:undefined")).toBe(false);
  });
});

class FakePromptContextPort implements OpenCodePromptContextPort {
  itemsStore = new Map<string, OpenCodePromptContextItem>();
  conflictKeys = new Set<string>();
  calls: string[] = [];
  commentRemoveCalls: string[] = [];

  async items(): Promise<OpenCodePromptContextItem[]> {
    return Array.from(this.itemsStore.values());
  }

  async add(item: OpenCodeFileContextItem, projectionId: string): Promise<PromptContextAddResult> {
    const key = openCodePromptContextItemKey(item);
    this.calls.push(`add:${key}`);
    const existing = this.itemsStore.get(key);
    if (existing && !this.conflictKeys.has(key)) {
      return { status: "already-owned", key, item: existing, projectionId };
    }
    if (existing || this.conflictKeys.has(key)) {
      return {
        status: "conflict",
        key,
        existing: existing ?? { key, ...item },
        reason: "key-owned-by-opencode",
      };
    }
    const inserted = { key, ...item };
    this.itemsStore.set(key, inserted);
    return { status: "inserted", key, item: inserted };
  }

  async remove(key: string): Promise<PromptContextRemoveResult> {
    this.calls.push(`remove:${key}`);
    const item = this.itemsStore.get(key);
    this.itemsStore.delete(key);
    return item ? { status: "removed", key, item } : { status: "missing", key };
  }

  async removeComment(path: string, commentID: string): Promise<PromptContextRemoveResult> {
    this.commentRemoveCalls.push(`${path}:${commentID}`);
    const item = Array.from(this.itemsStore.values()).find(
      (candidate) => candidate.path === path && candidate.commentID === commentID
    );
    return this.remove(item?.key ?? "");
  }

  async updateComment(
    path: string,
    commentID: string,
    next: Partial<OpenCodeFileContextItem> & { comment?: string }
  ): Promise<PromptContextUpdateResult> {
    const previous = Array.from(this.itemsStore.values()).find(
      (candidate) => candidate.path === path && candidate.commentID === commentID
    );
    if (!previous) {
      return { status: "missing", path, commentID };
    }
    const item = { ...previous, ...next };
    this.itemsStore.delete(previous.key);
    const key = openCodePromptContextItemKey(item);
    const updated = { ...item, key };
    this.itemsStore.set(key, updated);
    return { status: "updated", key, previous, item: updated };
  }

  async replaceComments(items: OpenCodeFileContextItem[]): Promise<PromptContextReplaceResult> {
    const keys = items.map(openCodePromptContextItemKey);
    return { status: "replaced", keys };
  }
}

function projection(input: {
  projectionId: string;
  path: string;
  line: number;
}): NativePromptContextProjection {
  return {
    projectionId: input.projectionId,
    candidateId: input.projectionId,
    sourceId: "workspace",
    sourceKind: "workspace",
    fingerprint: `${input.path}:${input.line}`,
    label: "Workspace",
    item: {
      type: "file",
      path: input.path,
      selection: {
        startLine: input.line,
        startChar: 0,
        endLine: input.line,
        endChar: 0,
      },
    },
    clickAction: {
      type: "obsidian-open",
      path: "notes/a.md",
      line: input.line,
    },
  };
}

function commentProjection(item: OpenCodeFileContextItem): NativePromptContextProjection {
  return {
    projectionId: `native-comment:${item.path}:${item.commentID}`,
    candidateId: `candidate:${item.commentID}`,
    sourceId: "opencode-native-comment",
    sourceKind: "opencode-native-comment",
    fingerprint: JSON.stringify(item),
    label: "OpenCode comment",
    item,
    clickAction: { type: "opencode-open-comment" },
  };
}
