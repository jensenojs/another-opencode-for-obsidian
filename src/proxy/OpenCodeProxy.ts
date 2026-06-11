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
    function post(type, payload) {
      window.parent.postMessage({ ns: ns, version: version, type: type, payload: payload }, '*');
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

    for (
      let port = OpenCodeProxy.START_PORT;
      port < OpenCodeProxy.START_PORT + OpenCodeProxy.MAX_ATTEMPTS;
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
      function isVisibleOpaqueBackground(style) {
        var color = style.backgroundColor || '';
        var image = style.backgroundImage || '';
        var hasOpaqueColor = color !== '' &&
          color !== 'transparent' &&
          color !== 'rgba(0, 0, 0, 0)' &&
          !/rgba\\([^)]*,\\s*0\\)/.test(color);
        return hasOpaqueColor || image !== 'none';
      }
    function describeElement(element) {
      if (!element) return null;
      var style = getComputedStyle(element);
      var rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className.slice(0, 180) : null,
        dataComponent: element.getAttribute('data-component'),
        dataSlot: element.getAttribute('data-slot'),
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        area: Math.round(rect.width * rect.height)
      };
    }
    function rootVariables() {
      var style = getComputedStyle(document.documentElement);
      var names = [
        '--background-base',
        '--background-weak',
        '--background-strong',
        '--background-stronger',
        '--v2-background-bg-base',
        '--v2-background-bg-deep',
        '--surface-raised-base',
        '--input-base'
      ];
      return names.reduce(function(result, name) {
        result[name] = style.getPropertyValue(name).trim();
        return result;
      }, {});
    }
    function collectOpaqueBackgrounds() {
      var minArea = Math.max(2000, window.innerWidth * window.innerHeight * 0.04);
      return Array.prototype.slice.call(document.body.querySelectorAll('*'))
        .map(function(element) {
          var style = getComputedStyle(element);
          var rect = element.getBoundingClientRect();
          return { element: element, style: style, rect: rect, area: rect.width * rect.height };
        })
        .filter(function(item) {
          return item.area >= minArea && isVisibleOpaqueBackground(item.style);
        })
        .sort(function(left, right) {
          return right.area - left.area;
        })
        .slice(0, 12)
        .map(function(item) {
          return describeElement(item.element);
        });
    }
    function postThemeDiagnostics(reason) {
      var payload = {
        reason: reason,
        url: location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        variables: rootVariables(),
        roots: [
          describeElement(document.documentElement),
          describeElement(document.body),
          describeElement(document.getElementById('root'))
        ],
        opaqueBackgrounds: collectOpaqueBackgrounds()
      };
      window.parent.postMessage({
        ns: ${JSON.stringify(BRIDGE_NAMESPACE)},
        version: ${JSON.stringify(BRIDGE_VERSION)},
        type: ${JSON.stringify(BRIDGE_MESSAGES.themeDiagnostics)},
        payload: payload
      }, '*');
    }
    function scheduleThemeDiagnostics(reason) {
      requestAnimationFrame(function() {
        setTimeout(function() {
          postThemeDiagnostics(reason);
        }, 120);
      });
    }
    applyTheme();
    scheduleThemeDiagnostics('initial');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        applyTheme();
        scheduleThemeDiagnostics('dom-content-loaded');
      }, { once: true });
    }
    window.addEventListener('load', function() {
      applyTheme();
      scheduleThemeDiagnostics('load');
    }, { once: true });
  })();
  </script>
  `;
}
