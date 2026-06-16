import { describe, expect, test } from "bun:test";
import {
  BRIDGE_MESSAGES,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  isBridgeMessage,
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
});
