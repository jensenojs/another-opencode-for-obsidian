import { describe, expect, test } from "bun:test";
import { extractPromptSessionId } from "../../src/proxy/OpenCodeWebUiProxy";

describe("OpenCodeWebUiProxy prompt path helpers", () => {
  test("extracts session ids from legacy and v2 prompt paths", () => {
    expect(extractPromptSessionId("/session/ses_123/message")).toBe("ses_123");
    expect(extractPromptSessionId("/api/session/ses_456/message?directory=%2Fvault")).toBe(
      "ses_456"
    );
    expect(extractPromptSessionId("/encoded/project/session/ses_789/message")).toBe("ses_789");
  });

  test("ignores non-prompt paths", () => {
    expect(extractPromptSessionId("/session/ses_123/message/msg_1")).toBeNull();
    expect(extractPromptSessionId("/session/ses_123")).toBeNull();
    expect(extractPromptSessionId("/event")).toBeNull();
  });
});
