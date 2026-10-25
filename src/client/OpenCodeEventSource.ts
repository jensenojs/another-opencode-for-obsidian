import * as http from "http";
import { createLogger } from "../debug/RuntimeDiagnostics";
import { buildServerAuthHeader } from "./ServerAuth";

export type OpenCodeEventSourceState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "unsupported";

export type OpenCodeEventSourceSnapshot = {
  state: OpenCodeEventSourceState;
  endpoint: string | null;
  connectedAt: number | null;
  disconnectedAt: number | null;
  lastError: string | null;
  lastEventAt: number | null;
  lastEventType: string | null;
  lastEventId: string | null;
  lastEventSessionId: string | null;
  lastSessionEventAt: number | null;
  lastSessionEventType: string | null;
  eventCount: number;
  currentSessionEventCount: number;
};

export type OpenCodeEventSourceOptions = {
  apiBaseUrl: string;
  projectDirectory: string;
  getCurrentSessionId: () => string | null;
  getAuthPassword?: () => string | null;
  onSnapshot?: (snapshot: OpenCodeEventSourceSnapshot) => void;
};

type EventPayload = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
  location?: unknown;
};

export class OpenCodeEventSource {
  private apiBaseUrl: string;
  private projectDirectory: string;
  private request: http.ClientRequest | null = null;
  private buffer = "";
  private snapshot: OpenCodeEventSourceSnapshot = createSnapshot();
  private getCurrentSessionId: () => string | null;
  private getAuthPassword?: () => string | null;
  private onSnapshot?: (snapshot: OpenCodeEventSourceSnapshot) => void;
  private logger = createLogger("events");

  constructor(options: OpenCodeEventSourceOptions) {
    this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
    this.projectDirectory = options.projectDirectory;
    this.getCurrentSessionId = options.getCurrentSessionId;
    this.getAuthPassword = options.getAuthPassword;
    this.onSnapshot = options.onSnapshot;
  }

  updateConnection(apiBaseUrl: string, projectDirectory: string): void {
    this.apiBaseUrl = normalizeBaseUrl(apiBaseUrl);
    this.projectDirectory = projectDirectory;
  }

  start(): void {
    const endpoint = buildEventEndpoint(this.apiBaseUrl);
    if (this.request) {
      if (this.snapshot.endpoint === endpoint) {
        return;
      }
      // The plugin attached to a different service. The live request still
      // points at the previous endpoint, so drop it: from here on its callbacks
      // are stale and must not touch the stream this method is about to open.
      this.request.destroy();
      this.request = null;
    }

    const url = new URL(endpoint);
    const authHeader = buildServerAuthHeader(this.getAuthPassword?.() ?? null);
    this.buffer = "";
    this.setSnapshot({ state: "connecting", endpoint });

    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      },
      (response) => {
        if (this.request !== request) {
          response.resume();
          return;
        }

        const status = response.statusCode ?? 0;
        if (status === 404) {
          this.finish(request, "unsupported", "OpenCode /api/event route is not available");
          response.resume();
          return;
        }
        if (status < 200 || status >= 300) {
          this.finish(request, "failed", `OpenCode event stream returned HTTP ${status}`);
          response.resume();
          return;
        }

        const contentType = String(response.headers["content-type"] ?? "");
        if (!contentType.includes("text/event-stream")) {
          this.finish(
            request,
            "failed",
            "OpenCode event stream returned an unexpected content type"
          );
          response.resume();
          return;
        }

        this.setSnapshot({ state: "connected", connectedAt: Date.now() });
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          if (this.request !== request) {
            return;
          }
          this.consumeChunk(chunk);
        });
        response.on("end", () => {
          if (this.request !== request) {
            return;
          }
          this.request = null;
          this.setSnapshot({ state: "disconnected", disconnectedAt: Date.now() });
        });
      }
    );

    request.on("error", (error) => {
      this.finish(request, "failed", error instanceof Error ? error.message : String(error));
    });

    this.request = request;
    request.end();
  }

  stop(): void {
    this.buffer = "";
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
    this.setSnapshot({ state: "idle" });
  }

  getSnapshot(): OpenCodeEventSourceSnapshot {
    return this.snapshot;
  }

  private consumeChunk(chunk: string): void {
    this.buffer += chunk;
    let frameEnd = this.buffer.indexOf("\n\n");
    while (frameEnd >= 0) {
      const frame = this.buffer.slice(0, frameEnd);
      this.buffer = this.buffer.slice(frameEnd + 2);
      this.consumeFrame(frame);
      frameEnd = this.buffer.indexOf("\n\n");
    }
  }

  private consumeFrame(frame: string): void {
    const data = parseSseData(frame);
    if (!data) {
      return;
    }

    let payload: EventPayload;
    try {
      payload = JSON.parse(data) as EventPayload;
    } catch {
      this.logger.warn("failed to parse event payload");
      return;
    }

    // /api/event is a global stream: every frame carries the directory it
    // belongs to, and only this project's frames are plugin events.
    if (getEventDirectory(payload) !== this.projectDirectory) {
      return;
    }

    const eventType = typeof payload.type === "string" ? payload.type : null;
    const eventId = typeof payload.id === "string" ? payload.id : null;
    const sessionId = getEventSessionId(payload);
    const currentSessionId = this.getCurrentSessionId();
    const now = Date.now();

    const next: Partial<OpenCodeEventSourceSnapshot> = {
      lastEventAt: now,
      lastEventType: eventType,
      lastEventId: eventId,
      lastEventSessionId: sessionId,
      eventCount: this.snapshot.eventCount + 1,
    };

    if (currentSessionId && sessionId === currentSessionId) {
      next.lastSessionEventAt = now;
      next.lastSessionEventType = eventType;
      next.currentSessionEventCount = this.snapshot.currentSessionEventCount + 1;
    }

    this.setSnapshot(next);
  }

  private finish(
    request: http.ClientRequest,
    state: "unsupported" | "failed",
    reason: string
  ): void {
    if (this.request !== request) {
      return;
    }
    this.request = null;
    this.setSnapshot({ state, lastError: reason });
  }

  private setSnapshot(patch: Partial<OpenCodeEventSourceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onSnapshot?.(this.snapshot);
  }
}

export function buildEventEndpoint(apiBaseUrl: string): string {
  return `${normalizeBaseUrl(apiBaseUrl)}/api/event`;
}

export function parseSseData(frame: string): string | null {
  const lines = frame.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

function getEventDirectory(payload: EventPayload): string | null {
  const location = payload.location;
  if (!location || typeof location !== "object") {
    return null;
  }
  const directory = (location as { directory?: unknown }).directory;
  return typeof directory === "string" ? directory : null;
}

function getEventSessionId(payload: EventPayload): string | null {
  const candidates = [payload.data, (payload as { properties?: unknown }).properties];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const sessionID = (candidate as { sessionID?: unknown }).sessionID;
    if (typeof sessionID === "string") {
      return sessionID;
    }
  }
  return null;
}

function createSnapshot(): OpenCodeEventSourceSnapshot {
  return {
    state: "idle",
    endpoint: null,
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
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
