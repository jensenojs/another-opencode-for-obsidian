import type { ServiceState } from "../server/types";
import {
  OpenCodeEventSource,
  type OpenCodeEventSourceSnapshot,
} from "../client/OpenCodeEventSource";

// Product-level bridge entry for OpenCode server events. It turns OpenCode
// event-stream facts into plugin diagnostics.
export interface OpenCodeBridgeOptions {
  apiBaseUrl: string;
  projectDirectory: string;
  getCurrentSessionId: () => string | null;
  getAuthPassword?: () => string | null;
  onEventSnapshot?: (snapshot: OpenCodeEventSourceSnapshot) => void;
}

// Single source of truth for "this snapshot means the event stream is gone".
// The plugin demotes the service to unavailable on a non-null result and owns
// the recovery path (attach retry), so the event source never reconnects here.
export function describeEventLoss(snapshot: OpenCodeEventSourceSnapshot): string | null {
  switch (snapshot.state) {
    case "disconnected":
      return "OpenCode event stream ended";
    case "failed":
      return `OpenCode event stream failed: ${snapshot.lastError ?? "unknown error"}`;
    case "unsupported":
      return `OpenCode event stream unsupported: ${snapshot.lastError ?? "/api/event"}`;
    default:
      return null;
  }
}

export class OpenCodeBridge {
  private eventSource: OpenCodeEventSource;

  constructor(options: OpenCodeBridgeOptions) {
    this.eventSource = new OpenCodeEventSource({
      apiBaseUrl: options.apiBaseUrl,
      projectDirectory: options.projectDirectory,
      getCurrentSessionId: options.getCurrentSessionId,
      getAuthPassword: options.getAuthPassword,
      onSnapshot: options.onEventSnapshot,
    });
  }

  updateOpenCodeLocation(apiBaseUrl: string, projectDirectory: string): void {
    this.eventSource.updateConnection(apiBaseUrl, projectDirectory);
  }

  syncServiceState(state: ServiceState): void {
    if (state === "attached") {
      this.eventSource.start();
      return;
    }
    this.eventSource.stop();
  }

  stop(): void {
    this.eventSource.stop();
  }
}
