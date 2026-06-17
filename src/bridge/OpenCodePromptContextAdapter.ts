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
