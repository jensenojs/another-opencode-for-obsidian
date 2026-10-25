import { describe, expect, test } from "bun:test";
import {
  formatServiceDiagnosticsForClipboard,
  type ServiceDiagnosticsSnapshot,
} from "../../src/debug/ServiceDiagnosticsText";

function snapshot(overrides: Partial<ServiceDiagnosticsSnapshot> = {}): ServiceDiagnosticsSnapshot {
  return {
    state: "attached",
    service: {
      name: "service.json",
      url: "http://127.0.0.1:49374",
      version: "2.1.3",
      pid: 96699,
    },
    reason: null,
    ...overrides,
  };
}

describe("ServiceDiagnosticsText", () => {
  test("formats attached service facts as copyable issue evidence", () => {
    const text = formatServiceDiagnosticsForClipboard(snapshot());
    const payload = JSON.parse(text);

    expect(payload.state).toBe("attached");
    expect(payload.service).toEqual({
      name: "service.json",
      url: "http://127.0.0.1:49374",
      version: "2.1.3",
      pid: 96699,
    });
    expect(payload.reason).toBeNull();
    expect(payload.logFile).toContain("another-opencode-for-obsidian.log");
    expect(payload.statusFile).toContain("status.json");
  });

  test("keeps the attach failure reason when no service is reachable", () => {
    const text = formatServiceDiagnosticsForClipboard(
      snapshot({
        state: "unavailable",
        service: null,
        reason: "no reachable service among service.json, service-zom.json in /state/opencode",
      })
    );
    const payload = JSON.parse(text);

    expect(payload.state).toBe("unavailable");
    expect(payload.service).toBeNull();
    expect(payload.reason).toContain("no reachable service");
  });
});
