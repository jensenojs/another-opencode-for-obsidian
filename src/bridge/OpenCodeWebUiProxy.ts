import * as http from "http";
import * as net from "net";
import { EventEmitter } from "events";
import { createLogger } from "../debug/RuntimeDiagnostics";
import { injectOpenCodeWebUiProxyHtml } from "./ProxyInjection";
import type { WebViewAppearance, WebViewTheme } from "../types";
import {
  mergePromptContextBundlePatchDiagnostics,
  patchOpenCodePromptContextBundle,
  type PromptContextBundlePatchDiagnostics,
} from "./OpenCodePromptContextBundlePatch";
import {
  mergeKeyboardBundlePatchDiagnostics,
  patchOpenCodeKeyboardBundle,
  type KeyboardBundlePatchDiagnostics,
} from "./OpenCodeKeyboardBundlePatch";
import {
  mergeTerminalBundlePatchDiagnostics,
  patchOpenCodeTerminalBundle,
  type TerminalBundlePatchDiagnostics,
} from "./OpenCodeTerminalBundlePatch";

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
  private effectivePort: number = 0;
  private logger = createLogger("proxy");
  private promptRequestHook: PromptRequestHook | null = null;
  private promptRequestOutcomeHook: PromptRequestOutcomeHook | null = null;
  private promptContextBundlePatch: PromptContextBundlePatchDiagnostics | null = null;
  private keyboardBundlePatch: KeyboardBundlePatchDiagnostics | null = null;
  private terminalBundlePatch: TerminalBundlePatchDiagnostics | null = null;
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

  updatePromptRequestHook(
    hook: PromptRequestHook | null,
    outcomeHook: PromptRequestOutcomeHook | null = null
  ): void {
    this.promptRequestHook = hook;
    this.promptRequestOutcomeHook = outcomeHook;
  }

  getPromptContextBundlePatchDiagnostics(): PromptContextBundlePatchDiagnostics | null {
    return this.promptContextBundlePatch;
  }

  getKeyboardBundlePatchDiagnostics(): KeyboardBundlePatchDiagnostics | null {
    return this.keyboardBundlePatch;
  }

  getTerminalBundlePatchDiagnostics(): TerminalBundlePatchDiagnostics | null {
    return this.terminalBundlePatch;
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
      } else if (this.shouldPatchJavaScriptAsset(clientReq.url ?? "", contentType)) {
        let body = "";
        proxyRes.on("data", (chunk: Buffer) => (body += chunk.toString()));
        proxyRes.on("end", () => {
          const patched = this.patchJavaScriptAsset(clientReq.url ?? "", body);
          const headers = { ...proxyRes.headers };
          delete headers["content-length"];
          headers["content-length"] = String(Buffer.byteLength(patched));
          clientRes.writeHead(proxyRes.statusCode || 200, headers);
          clientRes.end(patched);
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
    clientSocket: net.Socket,
    clientHead: Buffer
  ): void {
    const targetSocket = net.createConnection(
      { host: this.targetHost, port: this.targetPort },
      () => {
        forwardSocketData(targetSocket, clientSocket);
        forwardSocketData(clientSocket, targetSocket);
        targetSocket.write(
          formatRawHttpUpgradeRequest(clientReq, `${this.targetHost}:${this.targetPort}`)
        );
        if (clientHead.length > 0) {
          targetSocket.write(clientHead);
        }
      }
    );

    targetSocket.on("error", (error: Error) => {
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

  private shouldPatchJavaScriptAsset(path: string, contentType: string): boolean {
    if (
      !this.shouldPatchPromptContextBundle(path, contentType) &&
      !this.shouldPatchKeyboardBundle(path, contentType) &&
      !this.shouldPatchTerminalBundle(path, contentType)
    ) {
      return false;
    }
    return (
      contentType.includes("javascript") ||
      contentType.includes("application/octet-stream") ||
      contentType === ""
    );
  }

  private shouldPatchPromptContextBundle(path: string, _contentType: string): boolean {
    return /\/assets\/(?:index|session-composer-state)-[^/?]+\.js(?:$|[?#])/.test(path);
  }

  private shouldPatchKeyboardBundle(path: string, _contentType: string): boolean {
    return /\/assets\/index-[^/?]+\.js(?:$|[?#])/.test(path);
  }

  private shouldPatchTerminalBundle(path: string, _contentType: string): boolean {
    return /\/assets\/session-(?!composer-state-)[^/?]+\.js(?:$|[?#])/.test(path);
  }

  private patchJavaScriptAsset(path: string, body: string): string {
    let code = body;
    if (this.shouldPatchPromptContextBundle(path, "")) {
      const patched = patchOpenCodePromptContextBundle(code);
      this.promptContextBundlePatch = mergePromptContextBundlePatchDiagnostics(
        this.promptContextBundlePatch,
        path,
        patched
      );
      this.emit("promptContextBundlePatch", this.promptContextBundlePatch);
      this.logger.info("prompt context bundle patch", {
        status: this.promptContextBundlePatch.status,
        patches: this.promptContextBundlePatch.patches,
        assetStatus: patched.status,
        assetPatches: patched.patches,
        path,
      });
      code = patched.code;
    }
    if (this.shouldPatchKeyboardBundle(path, "")) {
      const patched = patchOpenCodeKeyboardBundle(code);
      this.keyboardBundlePatch = mergeKeyboardBundlePatchDiagnostics(
        this.keyboardBundlePatch,
        path,
        patched
      );
      this.emit("keyboardBundlePatch", this.keyboardBundlePatch);
      this.logger.info("keyboard bundle patch", {
        status: this.keyboardBundlePatch.status,
        patches: this.keyboardBundlePatch.patches,
        assetStatus: patched.status,
        assetPatches: patched.patches,
        path,
      });
      code = patched.code;
    }
    if (this.shouldPatchTerminalBundle(path, "")) {
      const patched = patchOpenCodeTerminalBundle(code);
      this.terminalBundlePatch = mergeTerminalBundlePatchDiagnostics(
        this.terminalBundlePatch,
        path,
        patched
      );
      this.emit("terminalBundlePatch", this.terminalBundlePatch);
      this.logger.info("terminal bundle patch", {
        status: this.terminalBundlePatch.status,
        patches: this.terminalBundlePatch.patches,
        assetStatus: patched.status,
        assetPatches: patched.patches,
        path,
      });
      code = patched.code;
    }
    return code;
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
    return injectOpenCodeWebUiProxyHtml(body, this.appearance, this.resolveTheme());
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

export function formatRawHttpUpgradeRequest(
  request: http.IncomingMessage,
  targetHostHeader: string
): string {
  const requestLine = `${request.method ?? "GET"} ${request.url ?? "/"} HTTP/${
    request.httpVersion || "1.1"
  }`;
  const headers: string[] = [requestLine];
  let wroteHost = false;
  const rawHeaders =
    request.rawHeaders.length > 0 ? request.rawHeaders : rawHeadersFromObject(request.headers);

  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (name.toLowerCase() === "host") {
      headers.push(`Host: ${targetHostHeader}`);
      wroteHost = true;
      continue;
    }
    headers.push(`${name}: ${value}`);
  }

  if (!wroteHost) {
    headers.push(`Host: ${targetHostHeader}`);
  }

  return `${headers.join("\r\n")}\r\n\r\n`;
}

function rawHeadersFromObject(headers: http.IncomingHttpHeaders): string[] {
  const rawHeaders: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        rawHeaders.push(name, item);
      }
      continue;
    }
    rawHeaders.push(name, String(value));
  }
  return rawHeaders;
}

function forwardSocketData(source: net.Socket, target: net.Socket): void {
  source.resume();
  source.on("data", (chunk) => {
    if (!target.destroyed) {
      target.write(chunk);
    }
  });
  source.on("end", () => {
    if (!target.destroyed) {
      target.end();
    }
  });
}
