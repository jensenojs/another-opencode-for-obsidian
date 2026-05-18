import http from "http";
import { EventEmitter } from "events";

const INJECTED_SCRIPT = `
<script>
(function() {
  window.parent.postMessage({ type: 'opencode-proxy-loaded' }, '*');
  function toggleHandler(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.parent.postMessage({ type: 'opencode-toggle' }, '*');
    }
  }
  window.addEventListener('keydown', toggleHandler, true);
  document.addEventListener('keydown', toggleHandler, true);
  // Re-register after a short delay in case the SPA clobbers listeners
  setTimeout(function() {
    window.addEventListener('keydown', toggleHandler, true);
    document.addEventListener('keydown', toggleHandler, true);
  }, 2000);
})();
</script>
`;

export class OpenCodeProxy extends EventEmitter {
  private server: http.Server | null = null;
  private proxyPort: number;
  private targetHost: string;
  private targetPort: number;

  constructor(proxyPort: number, targetHost: string, targetPort: number) {
    super();
    this.proxyPort = proxyPort;
    this.targetHost = targetHost;
    this.targetPort = targetPort;
  }

  async start(): Promise<boolean> {
    if (this.server) return true;

    return new Promise((resolve) => {
      this.server = http.createServer((clientReq, clientRes) => {
        this.handleRequest(clientReq, clientRes);
      });

      this.server.on("upgrade", (clientReq, clientSocket, clientHead) => {
        this.handleUpgrade(clientReq, clientSocket, clientHead);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.log("[OpenCode Proxy] Port already in use, assuming proxy is running");
          resolve(true);
        } else {
          console.error("[OpenCode Proxy] Server error:", err.message);
          resolve(false);
        }
      });

      this.server.listen(this.proxyPort, "127.0.0.1", () => {
        console.log(`[OpenCode Proxy] Listening on port ${this.proxyPort}`);
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
    return `http://127.0.0.1:${this.proxyPort}/${encodedPath}`;
  }

  private handleRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    const options = {
      hostname: this.targetHost,
      port: this.targetPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: { ...clientReq.headers, host: `${this.targetHost}:${this.targetPort}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
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

    proxyReq.on("error", () => {
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

    proxyReq.on("upgrade", (_proxyRes, proxySocket, _proxyHead) => {
      clientSocket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
    });

    proxyReq.on("error", () => {
      clientSocket.end();
    });
  }

  private shouldInject(contentType: string): boolean {
    return contentType.includes("text/html");
  }

  private injectScript(body: string): string {
    return body.replace("<head>", "<head>" + INJECTED_SCRIPT);
  }
}
