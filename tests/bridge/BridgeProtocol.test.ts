import { describe, expect, test } from "bun:test";
import {
  BRIDGE_MESSAGES,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  isBridgeMessage,
} from "../../src/bridge/BridgeProtocol";

describe("BridgeProtocol", () => {
  test("accepts versioned bridge messages", () => {
    expect(isBridgeMessage({
      ns: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      type: BRIDGE_MESSAGES.viewToggle,
    })).toBe(true);
  });

  test("rejects unscoped messages", () => {
    expect(isBridgeMessage({ type: BRIDGE_MESSAGES.viewToggle })).toBe(false);
    expect(isBridgeMessage({
      ns: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      type: "unknown",
    })).toBe(false);
  });
});
