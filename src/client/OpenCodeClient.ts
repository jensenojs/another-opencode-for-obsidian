import { createLogger } from "../debug/RuntimeDiagnostics";

export const CONTEXT_MESSAGE_PREFIX = "<!-- oc-ctx -->";

type OpenCodePart = {
  id: string;
  messageID: string;
  sessionID: string;
  type: string;
  text?: string;
  ignored?: boolean;
  synthetic?: boolean;
  metadata?: Record<string, unknown>;
  time?: {
    start: number;
    end?: number;
  };
};

type OpenCodeMessageInfo = {
  id: string;
  sessionID: string;
};

type OpenCodeMessageWithParts = {
  info: OpenCodeMessageInfo;
  parts: OpenCodePart[];
};

export type OpenCodeContextMessageRef = {
  messageId: string;
  partId: string;
};

export type OpenCodeMessage = OpenCodeMessageWithParts;

type OpenCodeSession = {
  id?: string;
  time?: {
    created?: number;
    updated?: number;
  };
  created?: number;
  updated?: number;
  createdAt?: string | number;
  updatedAt?: string | number;
};

type OpenCodeResponse<T> = T | { data?: T } | { message?: T } | null;

type OpenCodeRequestResult<T> = {
  ok: boolean;
  status: number;
  value: OpenCodeResponse<T>;
};

export class OpenCodeClient {
  private apiBaseUrl: string;
  private uiBaseUrl: string;
  private projectDirectory: string;
  private logger = createLogger("client");

  constructor(apiBaseUrl: string, uiBaseUrl: string, projectDirectory: string) {
    this.apiBaseUrl = this.normalizeBaseUrl(apiBaseUrl);
    this.uiBaseUrl = this.normalizeBaseUrl(uiBaseUrl);
    this.projectDirectory = projectDirectory;
  }

  updateBaseUrl(apiBaseUrl: string, uiBaseUrl: string, projectDirectory: string): void {
    const nextApiUrl = this.normalizeBaseUrl(apiBaseUrl);
    const nextUiUrl = this.normalizeBaseUrl(uiBaseUrl);
    if (
      nextApiUrl !== this.apiBaseUrl ||
      nextUiUrl !== this.uiBaseUrl ||
      projectDirectory !== this.projectDirectory
    ) {
      this.apiBaseUrl = nextApiUrl;
      this.uiBaseUrl = nextUiUrl;
      this.projectDirectory = projectDirectory;
    }
  }

  async initializeProject(): Promise<boolean> {
    try {
      const response = await this.request<unknown>(
        "GET",
        `/session?directory=${encodeURIComponent(this.projectDirectory)}`
      );

      if (response) {
        this.logger.info("project initialized", { projectDirectory: this.projectDirectory });
        return true;
      } else {
        this.logger.warn("project initialization failed");
        return false;
      }
    } catch (error) {
      this.logger.error("project initialization error", error);
      return false;
    }
  }

  getSessionUrl(sessionId: string): string {
    return `${this.uiBaseUrl}/session/${sessionId}`;
  }

  resolveSessionId(iframeUrl: string): string | null {
    const match = iframeUrl.match(/\/session\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  async createSession(): Promise<string | null> {
    const result = await this.request<OpenCodeSession>("POST", "/session", {
      title: "Obsidian",
    });
    const session = this.unwrap(result);
    return session?.id ?? null;
  }

  async getLatestSessionId(): Promise<string | null> {
    const result = await this.request<OpenCodeSession[]>(
      "GET",
      `/session?directory=${encodeURIComponent(this.projectDirectory)}`
    );
    const sessions = this.unwrap(result);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return null;
    }

    const latestSession = sessions.reduce((latest, session) => {
      return this.getSessionTimestamp(session) > this.getSessionTimestamp(latest)
        ? session
        : latest;
    });

    return latestSession.id ?? null;
  }

  async addContextMessage(
    sessionId: string,
    contextText: string
  ): Promise<OpenCodeContextMessageRef | null> {
    if (contextText.trim().length === 0) {
      return null;
    }

    const text = `${CONTEXT_MESSAGE_PREFIX}\n${contextText}`;
    const result = await this.request<OpenCodeMessageWithParts>(
      "POST",
      `/session/${sessionId}/message`,
      {
        noReply: true,
        parts: [{ type: "text", text }],
      }
    );

    this.logger.info("injected context message", {
      sessionId,
      contextLength: contextText.length,
    });

    const message = this.unwrap(result);
    const part = message?.parts.find((candidate) => candidate.type === "text");
    if (!message?.info?.id || !part?.id) {
      this.logger.error("failed to inject context message", { sessionId });
      return null;
    }

    return {
      messageId: message.info.id,
      partId: part.id,
    };
  }

  async ignorePart(sessionId: string, messageId: string, partId: string): Promise<boolean> {
    const messageResult = await this.requestResult<OpenCodeMessageWithParts>(
      "GET",
      `/session/${sessionId}/message/${messageId}`
    );

    if (!messageResult.ok) {
      return messageResult.status === 404;
    }

    const message = this.unwrap(messageResult.value);
    const part = message?.parts.find((candidate) => candidate.id === partId);
    if (!part) {
      return true;
    }

    const updateResult = await this.requestResult<OpenCodePart>(
      "PATCH",
      `/session/${sessionId}/message/${messageId}/part/${partId}`,
      {
        ...part,
        ignored: true,
      }
    );

    if (!updateResult.ok) {
      return updateResult.status === 404;
    }

    return Boolean(this.unwrap(updateResult.value));
  }

  async listSessionMessages(sessionId: string): Promise<OpenCodeMessage[] | null> {
    const result = await this.request<OpenCodeMessage[]>("GET", `/session/${sessionId}/message`);
    const messages = this.unwrap(result);
    return Array.isArray(messages) ? messages : null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<OpenCodeResponse<T>> {
    const result = await this.requestResult<T>(method, path, body);
    return result.ok ? result.value : null;
  }

  private async requestResult<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<OpenCodeRequestResult<T>> {
    try {
      const url = `${this.apiBaseUrl}${path}`;
      const urlObj = new URL(url);
      const http = require("http");
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          "Content-Type": "application/json",
          // OpenCode's JS SDK percent-encodes this header; the server decodes it before loading the instance.
          "x-opencode-directory": encodeURIComponent(this.projectDirectory),
        },
      };
      const response = await new Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      }>((resolve, reject) => {
        const req = http.request(options, (res: import("http").IncomingMessage) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk));
          res.on("end", () => {
            resolve({
              ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
              status: res.statusCode ?? 500,
              json: async () => {
                try {
                  return JSON.parse(data || "null");
                } catch {
                  return null;
                }
              },
            });
          });
        });
        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      });

      if (!response.ok) {
        this.logger.error("api request failed", {
          path,
          status: response.status,
        });
        return {
          ok: false,
          status: response.status,
          value: null,
        };
      }

      const json = await response.json();
      return {
        ok: true,
        status: response.status,
        value: json as OpenCodeResponse<T>,
      };
    } catch (error) {
      this.logger.error("api request error", error);
      return {
        ok: false,
        status: 0,
        value: null,
      };
    }
  }

  private unwrap<T>(result: OpenCodeResponse<T>): T | null {
    if (!result) {
      return null;
    }
    if (typeof result === "object") {
      const payload = result as { data?: T; message?: T };
      if (payload.data) {
        return payload.data;
      }
      if (payload.message) {
        return payload.message;
      }
    }
    return result as T;
  }

  private getSessionTimestamp(session: OpenCodeSession): number {
    return Math.max(
      this.toTimestamp(session.time?.updated),
      this.toTimestamp(session.updated),
      this.toTimestamp(session.updatedAt),
      this.toTimestamp(session.time?.created),
      this.toTimestamp(session.created),
      this.toTimestamp(session.createdAt)
    );
  }

  private toTimestamp(value: string | number | undefined): number {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? 0 : timestamp;
    }
    return 0;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
  }
}
