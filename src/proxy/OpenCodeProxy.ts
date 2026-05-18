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
  private targetHost: string;
  private targetPort: number;
  private effectivePort: number;

  constructor(proxyPort: number, targetHost: string, targetPort: number) {
    super();
    this.effectivePort = proxyPort || 4097;
    this.targetHost = targetHost;
    this.targetPort = targetPort;
  }

  getPort(): number {
    return this.effectivePort;
  }

  async start(): Promise<boolean> {
    if (this.server) return true;

    const startPort = this.effectivePort;
    const maxAttempts = 10;

    for (let port = startPort; port < startPort + maxAttempts; port++) {
      const ok = await this.tryListen(port);
      if (ok) {
        this.effectivePort = port;
        console.log(`[OpenCode Proxy] Listening on port ${port}`);
        return true;
      }
    }

    console.error("[OpenCode Proxy] Failed to find available port");
    return false;
  }

  private tryListen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const srv = http.createServer((clientReq, clientRes) => {
        this.handleRequest(clientReq, clientRes);
      });

      srv.on("upgrade", (clientReq, clientSocket, clientHead) => {
        this.handleUpgrade(clientReq, clientSocket, clientHead);
      });

      srv.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          console.error("[OpenCode Proxy] Unexpected error:", err.message);
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
