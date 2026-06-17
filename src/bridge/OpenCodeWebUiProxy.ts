import * as http from "http";
import { EventEmitter } from "events";
import { createLogger } from "../debug/RuntimeDiagnostics";
import { injectOpenCodeWebUiProxyHtml } from "./ProxyInjection";
import type { BridgeInjectionOptions } from "./BridgeInjection";
import type { WebViewAppearance, WebViewTheme } from "../types";

type WebViewThemeProvider = () => WebViewTheme | null;
type WebViewThemeSource = WebViewTheme | WebViewThemeProvider | null;

// HTTP boundary for the embedded OpenCode Web UI. It owns bridge transport,
// injected HTML assets, and narrow hooks that hand request/UI facts to typed
// plugin adapters.
export interface PromptRequestHookInput {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export interface PromptRequestHookResult {
  body: Buffer;
  headers?: http.OutgoingHttpHeaders;
  planId?: string;
}

export type PromptRequestHook = (
  input: PromptRequestHookInput
) => Promise<PromptRequestHookResult | null>;

export type PromptRequestOutcomeHook = (
  planId: string,
  outcome: { ok: boolean; statusCode?: number; error?: string }
) => void;

export class OpenCodeWebUiProxy extends EventEmitter {
  private server: http.Server | null = null;
  private targetHost: string;
  private targetPort: number;
  private appearance: WebViewAppearance;
  private theme: WebViewThemeSource;
  private bridgeOptions: BridgeInjectionOptions = {};
  private effectivePort: number = 0;
  private logger = createLogger("proxy");
  private promptRequestHook: PromptRequestHook | null = null;
  private promptRequestOutcomeHook: PromptRequestOutcomeHook | null = null;
  private static readonly START_PORT = 4097;
  private static readonly MAX_ATTEMPTS = 10;

  constructor(
    targetHost: string,
    targetPort: number,
    appearance: WebViewAppearance = "opencode",
    theme: WebViewThemeSource = null
  ) {
    super();
    this.targetHost = targetHost;
    this.targetPort = targetPort;
    this.appearance = appearance;
    this.theme = theme;
  }

  getPort(): number {
    return this.effectivePort;
  }

  getOrigin(): string {
    return `http://127.0.0.1:${this.effectivePort}`;
  }

  updateTarget(targetHost: string, targetPort: number): void {
    this.targetHost = targetHost;
    this.targetPort = targetPort;
  }

  updateAppearance(appearance: WebViewAppearance, theme: WebViewThemeSource = null): void {
    this.appearance = appearance;
    this.theme = theme;
  }

  updateBridgeOptions(options: BridgeInjectionOptions): void {
    this.bridgeOptions = options;
  }

  updatePromptRequestHook(
    hook: PromptRequestHook | null,
    outcomeHook: PromptRequestOutcomeHook | null = null
  ): void {
    this.promptRequestHook = hook;
    this.promptRequestOutcomeHook = outcomeHook;
  }

  async start(): Promise<boolean> {
    if (this.server) return true;

    for (
      let port = OpenCodeWebUiProxy.START_PORT;
      port < OpenCodeWebUiProxy.START_PORT + OpenCodeWebUiProxy.MAX_ATTEMPTS;
      port++
    ) {
      const ok = await this.tryListen(port);
      if (ok) {
        this.effectivePort = port;
        this.logger.info("proxy listening", { port });
        return true;
      }
    }

    this.logger.error("failed to find available proxy port");
    return false;
  }

  private tryListen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const srv = http.createServer(
        (clientReq: http.IncomingMessage, clientRes: http.ServerResponse) => {
          this.handleRequest(clientReq, clientRes);
        }
      );

      srv.on(
        "upgrade",
        (
          clientReq: http.IncomingMessage,
          clientSocket: import("net").Socket,
          clientHead: Buffer
        ) => {
          this.handleUpgrade(clientReq, clientSocket, clientHead);
        }
      );

      srv.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          this.logger.error("unexpected proxy server error", err);
          resolve(false);
        }
      });

      srv.listen(port, "127.0.0.1", () => {
        this.server = srv;
        resolve(true);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  getProxyUrl(encodedPath: string): string {
    return `http://127.0.0.1:${this.effectivePort}/${encodedPath}`;
  }

  private handleRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    if (this.shouldHandlePromptRequest(clientReq)) {
      void this.handlePromptRequest(clientReq, clientRes);
      return;
    }

    this.forwardRequest(clientReq, clientRes);
  }

  private async handlePromptRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse
  ): Promise<void> {
    let body: Buffer;
    try {
      body = await readRequestBody(clientReq);
    } catch (error) {
      this.logger.error("failed to read prompt request body", {
        error: error instanceof Error ? error.message : String(error),
        path: clientReq.url,
      });
      clientRes.writeHead(400);
      clientRes.end();
      return;
    }

    let requestBody = body;
    let requestHeaders: http.OutgoingHttpHeaders | undefined;
    let planId: string | undefined;

    if (this.promptRequestHook) {
      try {
        const hookResult = await this.promptRequestHook({
          method: clientReq.method ?? "GET",
          path: clientReq.url ?? "/",
          headers: clientReq.headers,
          body,
        });
        if (hookResult) {
          requestBody = hookResult.body;
          requestHeaders = hookResult.headers;
          planId = hookResult.planId;
        }
      } catch (error) {
        this.logger.error("prompt request hook failed", {
          error: error instanceof Error ? error.message : String(error),
          path: clientReq.url,
        });
      }
    }

    this.forwardRequest(clientReq, clientRes, requestBody, requestHeaders, planId);
  }

  private forwardRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    body?: Buffer,
    extraHeaders: http.OutgoingHttpHeaders = {},
    planId?: string
  ): void {
    const headers: http.OutgoingHttpHeaders = {
      ...clientReq.headers,
      ...extraHeaders,
      host: `${this.targetHost}:${this.targetPort}`,
    };

    if (body) {
      headers["content-length"] = String(body.byteLength);
      delete headers["transfer-encoding"];
    }

    const options = {
      hostname: this.targetHost,
      port: this.targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers,
    };

    const proxyReq = http.request(options, (proxyRes: http.IncomingMessage) => {
      const contentType = proxyRes.headers["content-type"] || "";
      if (planId) {
        this.reportPromptRequestOutcome(planId, {
          ok: isSuccessStatus(proxyRes.statusCode),
          statusCode: proxyRes.statusCode,
        });
      }

      if (this.shouldInject(contentType)) {
        let body = "";
        proxyRes.on("data", (chunk: Buffer) => (body += chunk.toString()));
        proxyRes.on("end", () => {
          const injected = this.injectScript(body);
          const headers = { ...proxyRes.headers };
          delete headers["content-security-policy"];
          delete headers["content-length"];
          headers["content-length"] = String(Buffer.byteLength(injected));
          clientRes.writeHead(proxyRes.statusCode || 200, headers);
          clientRes.end(injected);
        });
      } else {
        clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(clientRes);
      }
    });

    proxyReq.on("error", (error: Error) => {
      if (planId) {
        this.reportPromptRequestOutcome(planId, { ok: false, error: error.message });
      }
      this.logger.error("proxy request failed", {
        error: error.message,
        targetHost: this.targetHost,
        targetPort: this.targetPort,
        path: clientReq.url,
      });
      clientRes.writeHead(502);
      clientRes.end();
    });

    if (body) {
      proxyReq.end(body);
    } else {
      clientReq.pipe(proxyReq);
    }
  }

  private handleUpgrade(
    clientReq: http.IncomingMessage,
    clientSocket: import("net").Socket,
    _clientHead: Buffer
  ): void {
    const options = {
      hostname: this.targetHost,
      port: this.targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: { ...clientReq.headers, host: `${this.targetHost}:${this.targetPort}` },
    };

    const proxyReq = http.request(options);
    proxyReq.end();

    proxyReq.on(
      "upgrade",
      (_proxyRes: http.IncomingMessage, proxySocket: import("net").Socket, _proxyHead: Buffer) => {
        clientSocket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
        proxySocket.pipe(clientSocket);
        clientSocket.pipe(proxySocket);
      }
    );

    proxyReq.on("error", (error: Error) => {
      this.logger.error("proxy upgrade failed", {
        error: error.message,
        targetHost: this.targetHost,
        targetPort: this.targetPort,
        path: clientReq.url,
      });
      clientSocket.end();
    });
  }

  private shouldInject(contentType: string): boolean {
    return contentType.includes("text/html");
  }

  private shouldHandlePromptRequest(clientReq: http.IncomingMessage): boolean {
    if (clientReq.method !== "POST") {
      return false;
    }
    return extractPromptSessionId(clientReq.url ?? null) !== null;
  }

  private reportPromptRequestOutcome(
    planId: string,
    outcome: { ok: boolean; statusCode?: number; error?: string }
  ): void {
    this.promptRequestOutcomeHook?.(planId, outcome);
  }

  private injectScript(body: string): string {
    return injectOpenCodeWebUiProxyHtml(
      body,
      this.appearance,
      this.resolveTheme(),
      this.bridgeOptions
    );
  }

  private resolveTheme(): WebViewTheme | null {
    return typeof this.theme === "function" ? this.theme() : this.theme;
  }
}

export function extractPromptSessionId(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const pathname = new URL(path, "http://proxy.local").pathname;
  const match = pathname.match(/(?:^|\/)(?:api\/)?session\/([^/]+)\/message$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function isSuccessStatus(statusCode: number | undefined): boolean {
  return typeof statusCode === "number" && statusCode >= 200 && statusCode < 300;
}
