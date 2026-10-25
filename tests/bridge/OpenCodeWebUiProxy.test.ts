import { describe, expect, test } from "bun:test";
import {
  extractPromptSessionId,
  formatRawHttpUpgradeRequest,
} from "../../src/bridge/OpenCodeWebUiProxy";

describe("OpenCodeWebUiProxy prompt path helpers", () => {
  test("extracts session ids from the v2 prompt path", () => {
    expect(extractPromptSessionId("/api/session/ses_456/prompt")).toBe("ses_456");
    expect(extractPromptSessionId("/api/session/ses_456/prompt?directory=%2Fvault")).toBe(
      "ses_456"
    );
    expect(extractPromptSessionId("/encoded/project/api/session/ses_789/prompt")).toBe("ses_789");
  });

  test("ignores non-prompt paths", () => {
    expect(extractPromptSessionId("/api/session/ses_123/message")).toBeNull();
    expect(extractPromptSessionId("/api/session/ses_123/prompt/msg_1")).toBeNull();
    expect(extractPromptSessionId("/api/session/ses_123")).toBeNull();
    expect(extractPromptSessionId("/api/event")).toBeNull();
  });
});

describe("OpenCodeWebUiProxy upgrade helpers", () => {
  test("formats raw upgrade requests for the upstream server", () => {
    const request = {
      method: "GET",
      url: "/api/pty/pty_test/connect?cursor=0",
      httpVersion: "1.1",
      rawHeaders: [
        "Host",
        "127.0.0.1:4097",
        "Connection",
        "Upgrade",
        "Upgrade",
        "websocket",
        "Sec-WebSocket-Key",
        "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version",
        "13",
      ],
      headers: {},
    };

    expect(formatRawHttpUpgradeRequest(request as any, "127.0.0.1:4096")).toBe(
      [
        "GET /api/pty/pty_test/connect?cursor=0 HTTP/1.1",
        "Host: 127.0.0.1:4096",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n")
    );
  });

  test("keeps upgrade headers when rawHeaders are unavailable", () => {
    const request = {
      method: "GET",
      url: "/api/pty/pty_test/connect",
      httpVersion: "1.1",
      rawHeaders: [],
      headers: {
        host: "127.0.0.1:4097",
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    };

    const raw = formatRawHttpUpgradeRequest(request as any, "127.0.0.1:4096");

    expect(raw).toContain("Host: 127.0.0.1:4096");
    expect(raw).toContain("connection: Upgrade");
    expect(raw).toContain("upgrade: websocket");
    expect(raw).toContain("sec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==");
  });
});
