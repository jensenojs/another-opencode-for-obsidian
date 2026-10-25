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
