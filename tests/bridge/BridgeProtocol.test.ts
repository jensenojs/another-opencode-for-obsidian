import { describe, expect, test } from "bun:test";
import {
  BRIDGE_MESSAGES,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  isBridgeMessage,
  isKeyboardCatalogPayload,
  isKeyboardDispatchPayload,
  isKeyboardPolicyUpdatePayload,
  isPromptContextChangedPayload,
  isPromptContextRemovedPayload,
  isVaultFileOpenPayload,
} from "../../src/bridge/BridgeProtocol";

describe("BridgeProtocol", () => {
  test("accepts versioned bridge messages", () => {
    expect(
      isBridgeMessage({
        ns: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: BRIDGE_MESSAGES.proxyLoaded,
      })
    ).toBe(true);
    expect(
      isBridgeMessage({
        ns: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: BRIDGE_MESSAGES.vaultFileOpen,
        payload: { path: "Notes/A.md" },
      })
    ).toBe(true);
  });

  test("rejects unscoped messages", () => {
    expect(isBridgeMessage({ type: "keyboard:dispatch" })).toBe(false);
    expect(
      isBridgeMessage({
        ns: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "unknown",
      })
    ).toBe(false);
  });

  test("validates vault file open payloads", () => {
    expect(isVaultFileOpenPayload({ path: "Notes/A.md" })).toBe(true);
    expect(isVaultFileOpenPayload({ path: "Notes/A.md", line: 12 })).toBe(true);
    expect(isVaultFileOpenPayload({ path: "  " })).toBe(false);
    expect(isVaultFileOpenPayload({ path: "Notes/A.md", line: 0 })).toBe(false);
    expect(isVaultFileOpenPayload({ path: "Notes/A.md", line: 1.5 })).toBe(false);
    expect(isVaultFileOpenPayload({ href: "Notes/A.md" })).toBe(false);
  });

  test("validates prompt context changed payloads", () => {
    expect(
      isPromptContextChangedPayload({
        origin: "opencode-comment-add",
        items: [
          {
            key: "file:/repo/a.ts:1:1:c=c1",
            type: "file",
            path: "/repo/a.ts",
            selection: { startLine: 1, startChar: 0, endLine: 1, endChar: 0 },
            comment: "check this",
            commentID: "c1",
            commentOrigin: "review",
          },
        ],
        transactionId: "tx1",
      })
    ).toBe(true);
    expect(isPromptContextChangedPayload({ origin: "bridge-sync", items: [] })).toBe(true);
    expect(
      isPromptContextChangedPayload({ origin: "unknown", items: [{ path: "/repo/a.ts" }] })
    ).toBe(false);
  });

  test("only treats card-close as a prompt context removed user intent", () => {
    expect(
      isPromptContextRemovedPayload({
        key: "file:/repo/a.ts:1:1",
        origin: "card-close",
      })
    ).toBe(true);
    expect(
      isPromptContextRemovedPayload({
        key: "file:/repo/a.ts:1:1",
        origin: "bridge-sync",
      })
    ).toBe(false);
  });

  test("validates keyboard catalog payloads", () => {
    expect(
      isKeyboardCatalogPayload({
        available: true,
        options: [{ id: "settings.open", title: "Settings", keybind: "mod+comma" }],
        catalog: [{ id: "input.focus", title: "Focus input", keybind: "ctrl+l" }],
      })
    ).toBe(true);
    expect(
      isKeyboardCatalogPayload({
        available: true,
        options: [{ title: "Settings", keybind: "mod+comma" }],
        catalog: [],
      })
    ).toBe(false);
  });

  test("validates keyboard policy and dispatch payloads", () => {
    expect(
      isKeyboardPolicyUpdatePayload({
        revision: 1,
        entries: [
          {
            signature: "meta+comma",
            display: "⌘,",
            owner: "obsidian",
            commandId: "app:open-settings",
            reason: "user-conflict-policy",
          },
        ],
      })
    ).toBe(true);
    expect(
      isKeyboardPolicyUpdatePayload({
        revision: 1,
        entries: [{ signature: "Cmd+,", owner: "obsidian", reason: "user-conflict-policy" }],
      })
    ).toBe(false);
    expect(
      isKeyboardDispatchPayload({
        signature: "meta+l",
        commandId: "another-opencode-for-obsidian:toggle-opencode-view",
      })
    ).toBe(true);
    expect(isKeyboardDispatchPayload({ signature: "meta+l" })).toBe(false);
  });
});
