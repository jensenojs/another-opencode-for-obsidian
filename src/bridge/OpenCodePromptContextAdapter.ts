import type { ContextCandidate } from "../types";

export const OPENCODE_PROMPT_CONTEXT_OWNER = "another-opencode-for-obsidian";

export interface OpenCodeFileSelection {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

export interface OpenCodeFileContextItem {
  type: "file";
  path: string;
  selection?: OpenCodeFileSelection;
  comment?: string;
  commentID?: string;
  commentOrigin?: "review" | "file";
  preview?: string;
}

export interface OpenCodePromptContextCard {
  owner: typeof OPENCODE_PROMPT_CONTEXT_OWNER;
  candidateId: string;
  sourceId: string;
  item: OpenCodeFileContextItem;
}

export type OpenCodePromptContextItem = OpenCodeFileContextItem & { key: string };

export type PromptContextAddResult =
  | {
      status: "inserted";
      key: string;
      item: OpenCodePromptContextItem;
    }
  | {
      status: "already-owned";
      key: string;
      item: OpenCodePromptContextItem;
      projectionId: string;
    }
  | {
      status: "conflict";
      key: string;
      existing: OpenCodePromptContextItem;
      reason: "key-owned-by-opencode" | "key-owned-by-other-projection";
    };

export type PromptContextRemoveResult =
  | {
      status: "removed";
      key: string;
      item: OpenCodePromptContextItem;
    }
  | {
      status: "missing";
      key: string;
    };

export type PromptContextUpdateResult =
  | {
      status: "updated";
      key: string;
      previous: OpenCodePromptContextItem;
      item: OpenCodePromptContextItem;
    }
  | {
      status: "missing";
      path: string;
      commentID: string;
    };

export interface PromptContextReplaceResult {
  status: "replaced";
  keys: string[];
}

export interface OpenCodePromptContextPort {
  items(): Promise<OpenCodePromptContextItem[]>;
  add(
    item: OpenCodeFileContextItem,
    projectionId: string,
    clickAction?: unknown
  ): Promise<PromptContextAddResult>;
  remove(key: string): Promise<PromptContextRemoveResult>;
  removeComment(path: string, commentID: string): Promise<PromptContextRemoveResult>;
  updateComment(
    path: string,
    commentID: string,
    next: Partial<OpenCodeFileContextItem> & { comment?: string }
  ): Promise<PromptContextUpdateResult>;
  replaceComments(items: OpenCodeFileContextItem[]): Promise<PromptContextReplaceResult>;
}

// Type boundary for OpenCode Web UI's PromptProvider context card shape. The
// source of truth is the local OpenCode app source listed in this directory's
// AGENTS.md; runtime hook installation still belongs to BridgeInjection.
export function candidateToOpenCodePromptContextCard(
  candidate: ContextCandidate
): OpenCodePromptContextCard | null {
  const path = (candidate.navigationSourceFile ?? candidate.sourceFile).trim();
  if (!path) {
    return null;
  }

  return {
    owner: OPENCODE_PROMPT_CONTEXT_OWNER,
    candidateId: candidate.id,
    sourceId: candidate.sourceId,
    item: {
      type: "file",
      path,
      selection: lineSelection(candidate.startLine, candidate.endLine),
    },
  };
}

export function openCodePromptContextItemKey(item: OpenCodeFileContextItem): string {
  const start = item.selection?.startLine;
  const end = item.selection?.endLine;
  const key = `${item.type}:${item.path}:${start}:${end}`;

  if (item.commentID) {
    return `${key}:c=${item.commentID}`;
  }

  const comment = item.comment?.trim();
  if (!comment) {
    return key;
  }

  return `${key}:c=${checksum(comment).slice(0, 8)}`;
}

export function isOpenCodeFileContextItem(value: unknown): value is OpenCodeFileContextItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<OpenCodeFileContextItem>;
  return (
    candidate.type === "file" &&
    typeof candidate.path === "string" &&
    candidate.path.trim().length > 0 &&
    isOpenCodeFileSelection(candidate.selection) &&
    (candidate.comment === undefined || typeof candidate.comment === "string") &&
    (candidate.commentID === undefined || typeof candidate.commentID === "string") &&
    (candidate.commentOrigin === undefined ||
      candidate.commentOrigin === "review" ||
      candidate.commentOrigin === "file") &&
    (candidate.preview === undefined || typeof candidate.preview === "string")
  );
}

export function isOpenCodePromptContextItem(value: unknown): value is OpenCodePromptContextItem {
  return (
    isOpenCodeFileContextItem(value) &&
    typeof (value as { key?: unknown }).key === "string" &&
    (value as unknown as { key: string }).key.trim().length > 0
  );
}

function lineSelection(startLine?: number, endLine?: number): OpenCodeFileSelection | undefined {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return undefined;
  }
  if (!startLine || !endLine || startLine <= 0 || endLine <= 0) {
    return undefined;
  }

  const start = Math.min(startLine, endLine);
  const end = Math.max(startLine, endLine);
  return {
    startLine: start,
    startChar: 0,
    endLine: end,
    endChar: 0,
  };
}

function isOpenCodeFileSelection(value: unknown): value is OpenCodeFileSelection | undefined {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<OpenCodeFileSelection>;
  return (
    Number.isInteger(candidate.startLine) &&
    Number.isInteger(candidate.startChar) &&
    Number.isInteger(candidate.endLine) &&
    Number.isInteger(candidate.endChar)
  );
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
