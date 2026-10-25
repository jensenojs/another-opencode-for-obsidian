import { describe, expect, test } from "bun:test";
import { describeEventLoss } from "../../src/bridge/OpenCodeBridge";
import type { OpenCodeEventSourceSnapshot } from "../../src/client/OpenCodeEventSource";

describe("describeEventLoss", () => {
  test("reports a closed stream as ended", () => {
    expect(describeEventLoss(snapshot({ state: "disconnected" }))).toBe(
      "OpenCode event stream ended"
    );
  });

  test("reports a failed stream with its error", () => {
    expect(describeEventLoss(snapshot({ state: "failed", lastError: "read ECONNRESET" }))).toBe(
      "OpenCode event stream failed: read ECONNRESET"
    );
  });

  test("reports a failed stream without an error as unknown", () => {
    expect(describeEventLoss(snapshot({ state: "failed" }))).toBe(
      "OpenCode event stream failed: unknown error"
    );
  });

  test("reports an unsupported stream with the route that is missing", () => {
    expect(
      describeEventLoss(
        snapshot({ state: "unsupported", lastError: "OpenCode /api/event route is not available" })
      )
    ).toBe("OpenCode event stream unsupported: OpenCode /api/event route is not available");
  });

  test("reports an unsupported stream without an error as the route itself", () => {
    expect(describeEventLoss(snapshot({ state: "unsupported" }))).toBe(
      "OpenCode event stream unsupported: /api/event"
    );
  });

  test("stays silent while the stream is starting or alive", () => {
    expect(describeEventLoss(snapshot({ state: "idle" }))).toBeNull();
    expect(describeEventLoss(snapshot({ state: "connecting" }))).toBeNull();
    expect(describeEventLoss(snapshot({ state: "connected" }))).toBeNull();
  });
});

function snapshot(
  patch: Partial<OpenCodeEventSourceSnapshot> & { state: OpenCodeEventSourceSnapshot["state"] }
): OpenCodeEventSourceSnapshot {
  const { state, ...rest } = patch;
  return {
    state,
    endpoint: "http://127.0.0.1:49374/api/event",
    connectedAt: null,
    disconnectedAt: null,
    lastError: null,
    lastEventAt: null,
    lastEventType: null,
    lastEventId: null,
    lastEventSessionId: null,
    lastSessionEventAt: null,
    lastSessionEventType: null,
    eventCount: 0,
    currentSessionEventCount: 0,
    ...rest,
  };
}
