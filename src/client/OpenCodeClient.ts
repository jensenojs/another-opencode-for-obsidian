import { request as httpRequest } from "http";
import { createLogger } from "../debug/RuntimeDiagnostics";
import { buildServerAuthHeader } from "./ServerAuth";

type SessionInfo = {
  id: string;
};

export type OpenCodeRequestResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

export class OpenCodeClient {
  private apiBaseUrl: string;
  private uiBaseUrl: string;
  private projectDirectory: string;
  private getAuthPassword?: () => string | null;
  private logger = createLogger("client");

  constructor(
    apiBaseUrl: string,
    uiBaseUrl: string,
    projectDirectory: string,
    getAuthPassword?: () => string | null
  ) {
    this.apiBaseUrl = normalizeBaseUrl(apiBaseUrl);
    this.uiBaseUrl = normalizeBaseUrl(uiBaseUrl);
    this.projectDirectory = projectDirectory;
    this.getAuthPassword = getAuthPassword;
  }

  updateBaseUrl(apiBaseUrl: string, uiBaseUrl: string, projectDirectory: string): void {
    this.apiBaseUrl = normalizeBaseUrl(apiBaseUrl);
    this.uiBaseUrl = normalizeBaseUrl(uiBaseUrl);
    this.projectDirectory = projectDirectory;
  }

  async initializeProject(): Promise<boolean> {
    const sessions = await this.listSessions(1, "asc");
    if (sessions) {
      this.logger.info("project initialized", { projectDirectory: this.projectDirectory });
      return true;
    }

    this.logger.warn("project initialization failed", {
      projectDirectory: this.projectDirectory,
    });
    return false;
  }

  getSessionUrl(sessionId: string): string {
    return `${this.uiBaseUrl}/session/${sessionId}`;
  }

  resolveSessionId(iframeUrl: string): string | null {
    const match = iframeUrl.match(/\/session\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  async createSession(): Promise<string | null> {
    const session = await this.request<SessionInfo>("POST", "/api/session", {
      title: "Obsidian",
      location: { directory: this.projectDirectory },
    });
    return session?.id ?? null;
  }

  async getLatestSessionId(): Promise<string | null> {
    const sessions = await this.listSessions(1, "desc");
    return sessions?.[0]?.id ?? null;
  }

  /// Path stays at the request call site: the bridge harness reads request paths
  /// from here, and a helper that returns the URL makes the endpoint invisible.
  private async listSessions(limit: number, order: "asc" | "desc"): Promise<SessionInfo[] | null> {
    return this.request<SessionInfo[]>(
      "GET",
      `/api/session?directory=${encodeURIComponent(this.projectDirectory)}&limit=${limit}&order=${order}`
    );
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const result = await this.requestResult<T>(method, path, body);
    return result.ok ? result.data : null;
  }

  private async requestResult<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<OpenCodeRequestResult<T>> {
    const url = new URL(`${this.apiBaseUrl}${path}`);
    const authHeader = buildServerAuthHeader(this.getAuthPassword?.() ?? null);
    const payload = body === undefined ? null : JSON.stringify(body);

    try {
      const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
        const request = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
              "Content-Type": "application/json",
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
          },
          (incoming) => {
            let text = "";
            incoming.setEncoding("utf8");
            incoming.on("data", (chunk: string) => {
              text += chunk;
            });
            incoming.on("end", () => resolve({ status: incoming.statusCode ?? 500, text }));
          }
        );
        request.on("error", reject);
        if (payload) {
          request.write(payload);
        }
        request.end();
      });

      if (response.status < 200 || response.status >= 300) {
        this.logger.error("api request failed", { method, path, status: response.status });
        return { ok: false, status: response.status, data: null };
      }

      const data = parseApiEnvelope<T>(response.text);
      if (data === null) {
        this.logger.error("api response was not an OpenCode envelope", {
          method,
          path,
          status: response.status,
          bodyLength: response.text.length,
        });
        return { ok: false, status: response.status, data: null };
      }

      return { ok: true, status: response.status, data };
    } catch (error) {
      this.logger.error("api request error", {
        method,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, status: 0, data: null };
    }
  }
}

export function parseApiEnvelope<T>(text: string): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const data = (parsed as { data?: T }).data;
  return data === undefined ? null : data;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
