import type { ServerState } from "../server/ServerManager";
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
  onEventSnapshot?: (snapshot: OpenCodeEventSourceSnapshot) => void;
}

export class OpenCodeBridge {
  private eventSource: OpenCodeEventSource;

  constructor(options: OpenCodeBridgeOptions) {
    this.eventSource = new OpenCodeEventSource({
      apiBaseUrl: options.apiBaseUrl,
      projectDirectory: options.projectDirectory,
      getCurrentSessionId: options.getCurrentSessionId,
      onSnapshot: options.onEventSnapshot,
    });
  }

  updateOpenCodeLocation(apiBaseUrl: string, projectDirectory: string): void {
    this.eventSource.updateConnection(apiBaseUrl, projectDirectory);
  }

  syncServerState(state: ServerState): void {
    if (state === "running") {
      this.eventSource.start();
      return;
    }
    this.eventSource.stop();
  }

  stop(): void {
    this.eventSource.stop();
  }
}
