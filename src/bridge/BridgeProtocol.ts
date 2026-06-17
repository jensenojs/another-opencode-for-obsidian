// Local iframe protocol for plugin-owned facts captured inside the OpenCode Web
// UI and consumed by the Obsidian plugin main thread.
export const BRIDGE_NAMESPACE = "another-opencode-for-obsidian";
export const BRIDGE_VERSION = 1;

export const BRIDGE_MESSAGES = {
  proxyLoaded: "proxy:loaded",
  viewToggle: "view:toggle",
  themeDiagnostics: "theme:diagnostics",
  themeUpdate: "theme:update",
  vaultFileOpen: "vault-file:open",
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
