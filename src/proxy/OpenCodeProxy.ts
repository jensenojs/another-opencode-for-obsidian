import * as http from "http";
import { EventEmitter } from "events";
import { createLogger } from "../debug/RuntimeDiagnostics";
import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE, BRIDGE_VERSION } from "../bridge/BridgeProtocol";
import type { WebViewAppearance, WebViewTheme } from "../types";

const INJECTED_SCRIPT = `
<script>
(function() {
  var ns = ${JSON.stringify(BRIDGE_NAMESPACE)};
  var version = ${JSON.stringify(BRIDGE_VERSION)};
  var messages = ${JSON.stringify(BRIDGE_MESSAGES)};
  function post(type) {
    window.parent.postMessage({ ns: ns, version: version, type: type }, '*');
  }
  post(messages.proxyLoaded);
  function toggleHandler(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      post(messages.viewToggle);
    }
  }
  window.addEventListener('keydown', toggleHandler, true);
  document.addEventListener('keydown', toggleHandler, true);
})();
</script>
`;

const OBSIDIAN_APPEARANCE_STYLE = `
<style data-opencode-obsidian-appearance>
html,
body,
#root {
  background: transparent !important;
}
</style>
`;

export class OpenCodeProxy extends EventEmitter {
  private server: http.Server | null = null;
  private targetHost: string;
  private targetPort: number;
  private appearance: WebViewAppearance;
  private theme: WebViewTheme | null;
  private effectivePort: number = 0;
  private logger = createLogger("proxy");
  private static readonly START_PORT = 4097;
  private static readonly MAX_ATTEMPTS = 10;

  constructor(
    targetHost: string,
    targetPort: number,
    appearance: WebViewAppearance = "opencode",
    theme: WebViewTheme | null = null
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

  updateAppearance(appearance: WebViewAppearance, theme: WebViewTheme | null = null): void {
    this.appearance = appearance;
    this.theme = theme;
  }

  async start(): Promise<boolean> {
    if (this.server) return true;

    for (let port = OpenCodeProxy.START_PORT; port < OpenCodeProxy.START_PORT + OpenCodeProxy.MAX_ATTEMPTS; port++) {
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
      const srv = http.createServer((clientReq: http.IncomingMessage, clientRes: http.ServerResponse) => {
        this.handleRequest(clientReq, clientRes);
      });

      srv.on("upgrade", (clientReq: http.IncomingMessage, clientSocket: import("net").Socket, clientHead: Buffer) => {
        this.handleUpgrade(clientReq, clientSocket, clientHead);
      });

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
    const options = {
      hostname: this.targetHost,
      port: this.targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: { ...clientReq.headers, host: `${this.targetHost}:${this.targetPort}` },
    };

    const proxyReq = http.request(options, (proxyRes: http.IncomingMessage) => {
      const contentType = proxyRes.headers["content-type"] || "";

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
      this.logger.error("proxy request failed", {
        error: error.message,
        targetHost: this.targetHost,
        targetPort: this.targetPort,
        path: clientReq.url,
      });
      clientRes.writeHead(502);
      clientRes.end();
    });

    clientReq.pipe(proxyReq);
  }

  private handleUpgrade(
    clientReq: http.IncomingMessage,
    clientSocket: import("net").Socket,
    clientHead: Buffer
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

    proxyReq.on("upgrade", (_proxyRes: http.IncomingMessage, proxySocket: import("net").Socket, _proxyHead: Buffer) => {
      clientSocket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
    });

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

  private injectScript(body: string): string {
    return body.replace("<head>", "<head>" + INJECTED_SCRIPT + this.getAppearanceInjection());
  }

  private getAppearanceInjection(): string {
    if (this.appearance !== "obsidian") {
      return "";
    }

    return OBSIDIAN_APPEARANCE_STYLE + createThemeInjection(this.theme);
  }
}

function createThemeInjection(theme: WebViewTheme | null): string {
  if (!theme) {
    return "";
  }

  const safeTheme: WebViewTheme = {
    colorScheme: theme.colorScheme,
    variables: {},
  };
  for (const [name, value] of Object.entries(theme.variables)) {
    if (/^--[-_a-zA-Z0-9]+$/.test(name) && typeof value === "string" && value.length > 0) {
      safeTheme.variables[name] = value;
    }
  }

  const payload = JSON.stringify(safeTheme);

  return `
<script data-opencode-obsidian-theme>
(function() {
  var theme = ${payload};
  function applyTheme() {
    var root = document.documentElement;
    root.dataset.opencodeObsidianAppearance = 'obsidian';
    root.style.colorScheme = theme.colorScheme;
    Object.keys(theme.variables).forEach(function(name) {
      root.style.setProperty(name, theme.variables[name]);
    });
  }
  applyTheme();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
  }
  window.addEventListener('load', applyTheme, { once: true });
})();
</script>
`;
}
