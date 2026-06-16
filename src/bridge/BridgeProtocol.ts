// Local iframe protocol only. OpenCode and Obsidian contracts are checked from
// their own local gold standards by `bun run harness bridge`.
export const BRIDGE_NAMESPACE = "opencode-obsidian";
export const BRIDGE_VERSION = 1;

export const BRIDGE_MESSAGES = {
  proxyLoaded: "proxy:loaded",
  viewToggle: "view:toggle",
  themeDiagnostics: "theme:diagnostics",
  themeUpdate: "theme:update",
} as const;

export type BridgeMessageType = (typeof BRIDGE_MESSAGES)[keyof typeof BRIDGE_MESSAGES];

export interface BridgeMessage {
  ns: typeof BRIDGE_NAMESPACE;
  version: typeof BRIDGE_VERSION;
  type: BridgeMessageType;
  payload?: unknown;
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
