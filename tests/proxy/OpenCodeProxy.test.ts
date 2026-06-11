import { afterEach, describe, expect, test } from "bun:test";
import * as http from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { OpenCodeProxy } from "../../src/proxy/OpenCodeProxy";
import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE } from "../../src/bridge/BridgeProtocol";

process.env.XDG_STATE_HOME = mkdtempSync(join(tmpdir(), "opencode-obsidian-proxy-test-"));

let proxy: OpenCodeProxy | null = null;
let targetServer: http.Server | null = null;

afterEach(async () => {
  proxy?.stop();
  proxy = null;

  if (targetServer) {
    await new Promise<void>((resolve, reject) => {
      targetServer?.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    targetServer = null;
  }
});

describe("OpenCodeProxy", () => {
  test("injects the bridge script into HTML and removes CSP", async () => {
    const targetPort = await listenTarget((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/html",
        "content-security-policy": "script-src 'self'",
      });
      res.end("<html><head></head><body>OpenCode</body></html>");
    });

    proxy = new OpenCodeProxy("127.0.0.1", targetPort);
    const started = await proxy.start();

    expect(started).toBe(true);

    const response = await fetch(proxy.getProxyUrl("project"));
    const body = await response.text();

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(body).toContain(BRIDGE_NAMESPACE);
    expect(body).toContain(BRIDGE_MESSAGES.proxyLoaded);
    expect(body).toContain(BRIDGE_MESSAGES.viewToggle);
    expect(body).not.toContain("data-opencode-obsidian-appearance");
  });

  test("injects Obsidian appearance style when configured", async () => {
    const targetPort = await listenTarget((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/html",
      });
      res.end("<html><head></head><body>OpenCode</body></html>");
    });

    proxy = new OpenCodeProxy("127.0.0.1", targetPort, "obsidian");
    const started = await proxy.start();

    expect(started).toBe(true);

    const response = await fetch(proxy.getProxyUrl("project"));
    const body = await response.text();

    expect(body).toContain("data-opencode-obsidian-appearance");
    expect(body).toContain("background: transparent");
  });

  test("injects Obsidian theme variables when provided", async () => {
    const targetPort = await listenTarget((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/html",
      });
      res.end("<html><head></head><body>OpenCode</body></html>");
    });

    proxy = new OpenCodeProxy("127.0.0.1", targetPort, "obsidian", {
      colorScheme: "dark",
      variables: {
        "--background-base": "#000000",
        "--text-strong": "#f1f1f1",
        "background-base": "invalid",
      },
    });
    const started = await proxy.start();

    expect(started).toBe(true);

    const response = await fetch(proxy.getProxyUrl("project"));
    const body = await response.text();

    expect(body).toContain("data-opencode-obsidian-theme");
    expect(body).toContain('"--background-base":"#000000"');
    expect(body).toContain('"--text-strong":"#f1f1f1"');
    expect(body).not.toContain("background-base\":\"invalid");
  });
});

async function listenTarget(
  handler: http.RequestListener
): Promise<number> {
  targetServer = http.createServer(handler);

  await new Promise<void>((resolve) => {
    targetServer?.listen(0, "127.0.0.1", resolve);
  });

  const address = targetServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate target port");
  }

  return address.port;
}
