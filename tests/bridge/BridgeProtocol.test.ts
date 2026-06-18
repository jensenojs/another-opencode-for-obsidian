import { describe, expect, test } from "bun:test";
import {
  BRIDGE_MESSAGES,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  isBridgeMessage,
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
        type: BRIDGE_MESSAGES.viewToggle,
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
    expect(isBridgeMessage({ type: BRIDGE_MESSAGES.viewToggle })).toBe(false);
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
});
