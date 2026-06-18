import {
  isOpenCodeFileContextItem,
  isOpenCodePromptContextItem,
  type OpenCodeFileContextItem,
  type OpenCodePromptContextItem,
} from "./OpenCodePromptContextAdapter";
import type { PromptContextClickAction } from "../context/PromptContextProjection";
import type { KeyboardBridgeShortcutOwner } from "../types";
import {
  isNormalizedShortcutSignature,
  type KeyboardPolicyEntry,
  type OpenCodeKeyboardCatalogItem,
} from "./KeyboardShortcutIndex";

// Local iframe protocol for plugin-owned facts captured inside the OpenCode Web
// UI and consumed by the Obsidian plugin main thread.
export const BRIDGE_NAMESPACE = "another-opencode-for-obsidian";
export const BRIDGE_VERSION = 1;

export const BRIDGE_MESSAGES = {
  proxyLoaded: "proxy:loaded",
  themeDiagnostics: "theme:diagnostics",
  themeUpdate: "theme:update",
  vaultFileOpen: "vault-file:open",
  keyboardReady: "keyboard:ready",
  keyboardUnavailable: "keyboard:unavailable",
  keyboardCatalogChanged: "keyboard:catalog-changed",
  keyboardPolicyUpdate: "keyboard:policy-update",
  keyboardDispatch: "keyboard:dispatch",
  keyboardDecision: "keyboard:decision",
  promptContextReady: "prompt-context:ready",
  promptContextUnavailable: "prompt-context:unavailable",
  promptContextChanged: "prompt-context:changed",
  promptContextRemoved: "prompt-context:removed",
  promptContextActivated: "prompt-context:activated",
  promptContextCommand: "prompt-context:command",
  promptContextCommandResult: "prompt-context:command-result",
} as const;

export type BridgeMessageType = (typeof BRIDGE_MESSAGES)[keyof typeof BRIDGE_MESSAGES];

export interface BridgeMessage {
  ns: typeof BRIDGE_NAMESPACE;
  version: typeof BRIDGE_VERSION;
  type: BridgeMessageType;
  payload?: unknown;
}

export interface VaultFileOpenPayload {
  path: string;
  line?: number;
}

export interface PromptContextReadyPayload {
  available: true;
  itemCount: number;
}

export interface PromptContextUnavailablePayload {
  reason:
    | "missing-anchor"
    | "ambiguous-anchor"
    | "port-not-loaded"
    | "iframe-not-ready"
    | "command-failed";
  bundle?: string;
  anchorCount?: number;
  message?: string;
}

export interface PromptContextChangedPayload {
  origin:
    | "opencode-comment-add"
    | "opencode-comment-delete"
    | "opencode-submit-clear"
    | "bridge-sync"
    | "unknown";
  items: OpenCodePromptContextItem[];
  transactionId?: string;
}

export interface PromptContextRemovedPayload {
  key: string;
  origin: "card-close";
  item?: OpenCodePromptContextItem;
}

export interface PromptContextActivatedPayload {
  key: string;
  item?: OpenCodePromptContextItem;
}

export type PromptContextCommandPayload =
  | { transactionId: string; action: "items" }
  | {
      transactionId: string;
      action: "add";
      projectionId: string;
      item: OpenCodeFileContextItem;
      clickAction: PromptContextClickAction;
    }
  | { transactionId: string; action: "remove"; key: string }
  | { transactionId: string; action: "removeComment"; path: string; commentID: string }
  | {
      transactionId: string;
      action: "updateComment";
      path: string;
      commentID: string;
      next: Partial<OpenCodeFileContextItem> & { comment?: string };
    }
  | { transactionId: string; action: "replaceComments"; items: OpenCodeFileContextItem[] };

export interface PromptContextCommandResultPayload {
  transactionId: string;
  action: PromptContextCommandPayload["action"];
  ok: boolean;
  result?: unknown;
  items?: OpenCodePromptContextItem[];
  error?: string;
}

export interface KeyboardCatalogPayload {
  available: true;
  options: OpenCodeKeyboardCatalogItem[];
  catalog: OpenCodeKeyboardCatalogItem[];
}

export interface KeyboardUnavailablePayload {
  reason:
    | "missing-anchor"
    | "ambiguous-anchor"
    | "port-not-loaded"
    | "iframe-not-ready"
    | "command-failed";
  bundle?: string;
  anchorCount?: number;
  message?: string;
}

export interface KeyboardPolicyUpdatePayload {
  revision: number;
  entries: KeyboardPolicyEntry[];
}

export interface KeyboardDispatchPayload {
  signature: string;
  commandId: string;
  display?: string;
}

export interface KeyboardDecisionPayload {
  signature: string;
  commandId?: string;
  owner: KeyboardBridgeShortcutOwner;
  handled: boolean;
  reason: string;
  at: number;
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BridgeMessage>;
  return (
    candidate.ns === BRIDGE_NAMESPACE &&
    candidate.version === BRIDGE_VERSION &&
    Object.values(BRIDGE_MESSAGES).includes(candidate.type as BridgeMessageType)
  );
}

export function isVaultFileOpenPayload(value: unknown): value is VaultFileOpenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<VaultFileOpenPayload>;
  return (
    typeof candidate.path === "string" &&
    candidate.path.trim().length > 0 &&
    (candidate.line === undefined || (Number.isInteger(candidate.line) && candidate.line > 0))
  );
}

export function isPromptContextReadyPayload(value: unknown): value is PromptContextReadyPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextReadyPayload>;
  return candidate.available === true && Number.isInteger(candidate.itemCount);
}

export function isPromptContextUnavailablePayload(
  value: unknown
): value is PromptContextUnavailablePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextUnavailablePayload>;
  return (
    typeof candidate.reason === "string" &&
    [
      "missing-anchor",
      "ambiguous-anchor",
      "port-not-loaded",
      "iframe-not-ready",
      "command-failed",
    ].includes(candidate.reason) &&
    (candidate.bundle === undefined || typeof candidate.bundle === "string") &&
    (candidate.anchorCount === undefined || Number.isInteger(candidate.anchorCount)) &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

export function isPromptContextChangedPayload(
  value: unknown
): value is PromptContextChangedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextChangedPayload>;
  return (
    typeof candidate.origin === "string" &&
    [
      "opencode-comment-add",
      "opencode-comment-delete",
      "opencode-submit-clear",
      "bridge-sync",
      "unknown",
    ].includes(candidate.origin) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isOpenCodePromptContextItem) &&
    (candidate.transactionId === undefined || typeof candidate.transactionId === "string")
  );
}

export function isPromptContextRemovedPayload(
  value: unknown
): value is PromptContextRemovedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextRemovedPayload>;
  return (
    typeof candidate.key === "string" &&
    candidate.key.trim().length > 0 &&
    candidate.origin === "card-close" &&
    (candidate.item === undefined || isOpenCodePromptContextItem(candidate.item))
  );
}

export function isPromptContextActivatedPayload(
  value: unknown
): value is PromptContextActivatedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextActivatedPayload>;
  return (
    typeof candidate.key === "string" &&
    candidate.key.trim().length > 0 &&
    (candidate.item === undefined || isOpenCodePromptContextItem(candidate.item))
  );
}

export function isPromptContextCommandPayload(
  value: unknown
): value is PromptContextCommandPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextCommandPayload>;
  if (typeof candidate.transactionId !== "string" || candidate.transactionId.length === 0) {
    return false;
  }
  switch (candidate.action) {
    case "items":
      return true;
    case "add":
      return (
        typeof candidate.projectionId === "string" &&
        isOpenCodeFileContextItem(candidate.item) &&
        isPromptContextClickAction(candidate.clickAction)
      );
    case "remove":
      return typeof candidate.key === "string" && candidate.key.length > 0;
    case "removeComment":
      return (
        typeof candidate.path === "string" &&
        candidate.path.length > 0 &&
        typeof candidate.commentID === "string" &&
        candidate.commentID.length > 0
      );
    case "updateComment":
      return (
        typeof candidate.path === "string" &&
        candidate.path.length > 0 &&
        typeof candidate.commentID === "string" &&
        candidate.commentID.length > 0 &&
        typeof candidate.next === "object" &&
        candidate.next !== null
      );
    case "replaceComments":
      return Array.isArray(candidate.items) && candidate.items.every(isOpenCodeFileContextItem);
  }
  return false;
}

export function isPromptContextCommandResultPayload(
  value: unknown
): value is PromptContextCommandResultPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextCommandResultPayload>;
  return (
    typeof candidate.transactionId === "string" &&
    typeof candidate.action === "string" &&
    ["items", "add", "remove", "removeComment", "updateComment", "replaceComments"].includes(
      candidate.action
    ) &&
    typeof candidate.ok === "boolean" &&
    (candidate.items === undefined ||
      (Array.isArray(candidate.items) && candidate.items.every(isOpenCodePromptContextItem))) &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

export function isKeyboardCatalogPayload(value: unknown): value is KeyboardCatalogPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeyboardCatalogPayload>;
  return (
    candidate.available === true &&
    Array.isArray(candidate.options) &&
    candidate.options.every(isOpenCodeKeyboardCatalogItem) &&
    Array.isArray(candidate.catalog) &&
    candidate.catalog.every(isOpenCodeKeyboardCatalogItem)
  );
}

export function isKeyboardUnavailablePayload(value: unknown): value is KeyboardUnavailablePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeyboardUnavailablePayload>;
  return (
    typeof candidate.reason === "string" &&
    [
      "missing-anchor",
      "ambiguous-anchor",
      "port-not-loaded",
      "iframe-not-ready",
      "command-failed",
    ].includes(candidate.reason) &&
    (candidate.bundle === undefined || typeof candidate.bundle === "string") &&
    (candidate.anchorCount === undefined || Number.isInteger(candidate.anchorCount)) &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

export function isKeyboardPolicyUpdatePayload(
  value: unknown
): value is KeyboardPolicyUpdatePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeyboardPolicyUpdatePayload>;
  return (
    Number.isInteger(candidate.revision) &&
    typeof candidate.revision === "number" &&
    candidate.revision >= 0 &&
    Array.isArray(candidate.entries) &&
    candidate.entries.every(isKeyboardPolicyEntry)
  );
}

export function isKeyboardDispatchPayload(value: unknown): value is KeyboardDispatchPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeyboardDispatchPayload>;
  return (
    isNormalizedShortcutSignature(candidate.signature) &&
    typeof candidate.commandId === "string" &&
    candidate.commandId.trim().length > 0 &&
    (candidate.display === undefined || typeof candidate.display === "string")
  );
}

export function isKeyboardDecisionPayload(value: unknown): value is KeyboardDecisionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeyboardDecisionPayload>;
  return (
    isNormalizedShortcutSignature(candidate.signature) &&
    (candidate.commandId === undefined || typeof candidate.commandId === "string") &&
    (candidate.owner === "obsidian" || candidate.owner === "opencode") &&
    typeof candidate.handled === "boolean" &&
    typeof candidate.reason === "string" &&
    Number.isFinite(candidate.at)
  );
}

function isPromptContextClickAction(value: unknown): value is PromptContextClickAction {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PromptContextClickAction>;
  if (candidate.type === "none" || candidate.type === "opencode-open-comment") {
    return true;
  }
  return (
    candidate.type === "obsidian-open" &&
    typeof candidate.path === "string" &&
    candidate.path.trim().length > 0 &&
    (candidate.line === undefined || Number.isInteger(candidate.line)) &&
    (candidate.endLine === undefined || Number.isInteger(candidate.endLine))
  );
}

function isOpenCodeKeyboardCatalogItem(value: unknown): value is OpenCodeKeyboardCatalogItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<OpenCodeKeyboardCatalogItem>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    (candidate.description === undefined || typeof candidate.description === "string") &&
    (candidate.category === undefined || typeof candidate.category === "string") &&
    (candidate.keybind === undefined || typeof candidate.keybind === "string") &&
    (candidate.disabled === undefined || typeof candidate.disabled === "boolean") &&
    (candidate.hidden === undefined || typeof candidate.hidden === "boolean")
  );
}

function isKeyboardPolicyEntry(value: unknown): value is KeyboardPolicyEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeyboardPolicyEntry>;
  return (
    isNormalizedShortcutSignature(candidate.signature) &&
    typeof candidate.display === "string" &&
    (candidate.owner === "obsidian" || candidate.owner === "opencode") &&
    (candidate.commandId === undefined || typeof candidate.commandId === "string") &&
    (candidate.reason === "bridge-owned" ||
      candidate.reason === "user-conflict-policy" ||
      candidate.reason === "default-obsidian")
  );
}
