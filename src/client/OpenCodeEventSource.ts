import * as http from "http";
import { createLogger } from "../debug/RuntimeDiagnostics";

export type OpenCodeEventSourceState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "unsupported";

export interface OpenCodeEventSourceSnapshot {
  state: OpenCodeEventSourceState;
  endpoint: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  lastEventId: string | null;
  lastEventSessionId: string | null;
  lastSessionEventAt: string | null;
  lastSessionEventType: string | null;
  eventCount: number;
  currentSessionEventCount: number;
}

export interface OpenCodeEventSourceOptions {
  apiBaseUrl: string;
  projectDirectory: string;
  getCurrentSessionId: () => string | null;
  onSnapshot?: (snapshot: OpenCodeEventSourceSnapshot) => void;
}

type EventPayload = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
  properties?: unknown;
};

export class OpenCodeEventSource {
  private apiBaseUrl: string;
  private projectDirectory: string;
  private getCurrentSessionId: () => string | null;
  private onSnapshot?: (snapshot: OpenCodeEventSourceSnapshot) => void;
  private request: http.ClientRequest | null = null;
  private buffer = "";
  private stopped = true;
  private logger = createLogger("event-source");
  private snapshot: OpenCodeEventSourceSnapshot = {
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

  constructor(options: OpenCodeEventSourceOptions) {
    this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
    this.projectDirectory = options.projectDirectory;
    this.getCurrentSessionId = options.getCurrentSessionId;
    this.onSnapshot = options.onSnapshot;
  }

  updateConnection(apiBaseUrl: string, projectDirectory: string): void {
    const nextApiBaseUrl = normalizeBaseUrl(apiBaseUrl);
    if (nextApiBaseUrl === this.apiBaseUrl && projectDirectory === this.projectDirectory) {
      return;
    }

    const wasRunning = this.request !== null;
    this.stop();
    this.apiBaseUrl = nextApiBaseUrl;
    this.projectDirectory = projectDirectory;
    if (wasRunning) {
      this.start();
    }
  }

  start(): void {
    if (this.request) {
      return;
    }

    this.stopped = false;
    this.buffer = "";
    const endpoint = buildEventEndpoint(this.apiBaseUrl, this.projectDirectory);
    this.setSnapshot({
      state: "connecting",
      endpoint,
      lastError: null,
    });

    const url = new URL(endpoint);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "x-opencode-directory": encodeURIComponent(this.projectDirectory),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status === 404) {
          this.finishUnsupported("OpenCode /api/event route is not available");
          res.resume();
          return;
        }
        if (status < 200 || status >= 300) {
          this.finishFailed(`OpenCode event stream returned HTTP ${status}`);
          res.resume();
          return;
        }
        if (!contentType.includes("text/event-stream")) {
          this.finishFailed(
            `OpenCode event stream returned ${contentType || "unknown content type"}`
          );
          res.resume();
          return;
        }

        this.setSnapshot({
          state: "connected",
          connectedAt: new Date().toISOString(),
          disconnectedAt: null,
          lastError: null,
        });

        res.on("data", (chunk: Buffer) => {
          this.consumeChunk(chunk.toString("utf8"));
        });
        res.on("end", () => {
          this.request = null;
          if (!this.stopped) {
            this.setSnapshot({
              state: "disconnected",
              disconnectedAt: new Date().toISOString(),
            });
          }
        });
      }
    );

    this.request = req;
    req.on("error", (error) => {
      this.request = null;
      if (this.stopped) {
        return;
      }
      this.finishFailed(error.message);
    });
    req.end();
  }

  stop(): void {
    this.stopped = true;
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
    this.buffer = "";
    this.setSnapshot({
      state: "idle",
      disconnectedAt: new Date().toISOString(),
    });
  }

  getSnapshot(): OpenCodeEventSourceSnapshot {
    return { ...this.snapshot };
  }

  private consumeChunk(chunk: string): void {
    this.buffer += chunk.replace(/\r\n/g, "\n");
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
    } catch (error) {
      this.logger.warn("failed to parse OpenCode event payload", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.setSnapshot({ lastError: "Failed to parse OpenCode event payload" });
      return;
    }

    const eventType = typeof payload.type === "string" ? payload.type : null;
    const eventId = typeof payload.id === "string" ? payload.id : null;
    const sessionId = extractSessionId(payload);
    const now = new Date().toISOString();
    const currentSessionId = this.getCurrentSessionId();
    const isCurrentSessionEvent = Boolean(
      sessionId && currentSessionId && sessionId === currentSessionId
    );

    this.setSnapshot({
      lastEventAt: now,
      lastEventType: eventType,
      lastEventId: eventId,
      lastEventSessionId: sessionId,
      eventCount: this.snapshot.eventCount + 1,
      ...(isCurrentSessionEvent
        ? {
            lastSessionEventAt: now,
            lastSessionEventType: eventType,
            currentSessionEventCount: this.snapshot.currentSessionEventCount + 1,
          }
        : {}),
    });
  }

  private finishUnsupported(message: string): void {
    this.request = null;
    this.setSnapshot({
      state: "unsupported",
      lastError: message,
      disconnectedAt: new Date().toISOString(),
    });
  }

  private finishFailed(message: string): void {
    this.request = null;
    this.setSnapshot({
      state: "failed",
      lastError: message,
      disconnectedAt: new Date().toISOString(),
    });
  }

  private setSnapshot(update: Partial<OpenCodeEventSourceSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...update,
    };
    this.onSnapshot?.(this.getSnapshot());
  }
}

export function buildEventEndpoint(apiBaseUrl: string, projectDirectory: string): string {
  const url = new URL(`${normalizeBaseUrl(apiBaseUrl)}/api/event`);
  url.searchParams.set("location[directory]", projectDirectory);
  return url.toString();
}

export function parseSseData(frame: string): string | null {
  const dataLines = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

function extractSessionId(payload: EventPayload): string | null {
  return sessionIdFromObject(payload.data) ?? sessionIdFromObject(payload.properties);
}

function sessionIdFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const sessionID = (value as { sessionID?: unknown }).sessionID;
  return typeof sessionID === "string" ? sessionID : null;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
