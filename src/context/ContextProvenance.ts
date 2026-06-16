import type { ContextItemType, ContextProvenanceStatus } from "../types";

export const CONTEXT_MESSAGE_PREFIX = "<!-- oc-ctx -->";
const CONTEXT_PROVENANCE_PREFIX = "<!-- oc-ctx-provenance ";
const CONTEXT_PROVENANCE_SUFFIX = " -->";

export type ContextMessageProvenance = {
  version: 1;
  type: ContextItemType;
  label: string;
  sourceFile: string;
  navigationSourceFile?: string;
  startLine?: number;
  endLine?: number;
  textLength: number;
  createdAt: number;
};

export type ParsedContextMessage = {
  text: string;
  provenanceStatus: ContextProvenanceStatus;
  provenance?: ContextMessageProvenance;
};

export function formatContextMessageText(
  text: string,
  provenance?: ContextMessageProvenance
): string {
  const lines = [CONTEXT_MESSAGE_PREFIX];
  if (provenance) {
    lines.push(
      `${CONTEXT_PROVENANCE_PREFIX}${JSON.stringify(provenance)}${CONTEXT_PROVENANCE_SUFFIX}`
    );
  }
  lines.push(text);
  return lines.join("\n");
}

export function parseContextMessageText(text: string): ParsedContextMessage | null {
  if (!text.startsWith(CONTEXT_MESSAGE_PREFIX)) {
    return null;
  }

  const withoutMarker = text.slice(CONTEXT_MESSAGE_PREFIX.length).replace(/^\n/, "");
  if (!withoutMarker.startsWith(CONTEXT_PROVENANCE_PREFIX)) {
    return {
      text: withoutMarker,
      provenanceStatus: "uncertain",
    };
  }

  const provenanceEnd = withoutMarker.indexOf(CONTEXT_PROVENANCE_SUFFIX);
  if (provenanceEnd === -1) {
    return {
      text: withoutMarker,
      provenanceStatus: "uncertain",
    };
  }

  const encoded = withoutMarker.slice(CONTEXT_PROVENANCE_PREFIX.length, provenanceEnd);
  const body = withoutMarker
    .slice(provenanceEnd + CONTEXT_PROVENANCE_SUFFIX.length)
    .replace(/^\n/, "");
  const provenance = parseProvenance(encoded, body.length);

  return {
    text: body,
    provenanceStatus: provenance ? "known" : "uncertain",
    provenance,
  };
}

function parseProvenance(
  encoded: string,
  textLength: number
): ContextMessageProvenance | undefined {
  try {
    const value = JSON.parse(encoded);
    if (!isContextMessageProvenance(value) || value.textLength !== textLength) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function isContextMessageProvenance(value: unknown): value is ContextMessageProvenance {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ContextMessageProvenance>;
  return (
    candidate.version === 1 &&
    isContextItemType(candidate.type) &&
    typeof candidate.label === "string" &&
    typeof candidate.sourceFile === "string" &&
    optionalString(candidate.navigationSourceFile) &&
    optionalNumber(candidate.startLine) &&
    optionalNumber(candidate.endLine) &&
    typeof candidate.textLength === "number" &&
    Number.isFinite(candidate.textLength) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt)
  );
}

function isContextItemType(value: unknown): value is ContextItemType {
  return value === "manual" || value === "auto" || value === "inbound";
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
