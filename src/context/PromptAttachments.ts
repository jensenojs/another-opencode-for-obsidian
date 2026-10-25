import type { ContextCandidate } from "../types";

export interface PromptFileAttachment {
  uri: string;
  name: string;
}

// The single prompt-context carrier: every included candidate becomes one
// inline text file on the prompt request body.
export function buildPromptAttachments(candidates: ContextCandidate[]): PromptFileAttachment[] {
  return candidates.map((candidate) => ({
    uri: `data:text/plain;base64,${Buffer.from(formatAttachmentBody(candidate), "utf8").toString("base64")}`,
    name: formatAttachmentName(candidate),
  }));
}

function formatAttachmentBody(candidate: ContextCandidate): string {
  const range = formatRange(candidate);
  return `Obsidian context: ${candidate.label}\nSource: ${candidate.sourceFile}${range}\n\n${candidate.text}`;
}

function formatAttachmentName(candidate: ContextCandidate): string {
  return ["obsidian-context", candidate.sourceKind, sanitizePart(candidate.label)].join(":");
}

function formatRange(candidate: ContextCandidate): string {
  if (candidate.startLine === undefined) {
    return "";
  }
  return candidate.endLine === undefined || candidate.endLine === candidate.startLine
    ? `:L${candidate.startLine}`
    : `:L${candidate.startLine}-L${candidate.endLine}`;
}

function sanitizePart(value: string): string {
  return value.replace(/[\s/\\:*?"<>|]+/g, "-");
}
