import { afterEach, describe, expect, test } from "bun:test";
import * as http from "http";
import type { AddressInfo } from "net";
import { OpenCodeClient, parseApiEnvelope } from "../../src/client/OpenCodeClient";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
  servers.length = 0;
});

describe("OpenCodeClient", () => {
  test("unwraps the OpenCode data envelope", () => {
    expect(parseApiEnvelope<{ id: string }>('{"data":{"id":"ses_1"},"cursor":{}}')).toEqual({
      id: "ses_1",
    });
    expect(parseApiEnvelope("<html><body>spa</body></html>")).toBeNull();
    expect(parseApiEnvelope('{"version":"2.1.3"}')).toBeNull();
    expect(parseApiEnvelope('{"data":null}')).toBeNull();
  });

  test("lists sessions with an encoded directory query and no directory header", async () => {
    const projectDirectory = "/Users/oujinsai/Note/计算机 课程";
    const requests: Array<{ url: string; auth?: string; directoryHeader?: string }> = [];
    const server = await listen((req, res) => {
      requests.push({
        url: req.url ?? "",
        auth: req.headers.authorization,
        directoryHeader: req.headers["x-opencode-directory"] as string | undefined,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "ses_latest" }], cursor: { previous: null } }));
    });

    const client = new OpenCodeClient(server.url, server.url, projectDirectory, () => "secret");

    expect(await client.getLatestSessionId()).toBe("ses_latest");
    expect(requests).toHaveLength(1);
    const request = new URL(requests[0].url, server.url);
    expect(request.pathname).toBe("/api/session");
    expect(request.searchParams.get("directory")).toBe(projectDirectory);
    expect(request.searchParams.get("limit")).toBe("1");
    expect(request.searchParams.get("order")).toBe("desc");
    expect(requests[0].directoryHeader).toBeUndefined();
    expect(requests[0].auth).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`);
  });

  test("creates a session through POST /api/session", async () => {
    let method = "";
    let body = "";
    const server = await listen((req, res) => {
      method = req.method ?? "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: { id: "ses_created" } }));
      });
    });

    const client = new OpenCodeClient(server.url, server.url, "/vault");

    expect(await client.createSession()).toBe("ses_created");
    expect(method).toBe("POST");
    expect(JSON.parse(body)).toEqual({
      title: "Obsidian",
      location: { directory: "/vault" },
    });
  });

  test("treats a non-2xx response as failure without falling back to another route", async () => {
    const paths: string[] = [];
    const server = await listen((req, res) => {
      paths.push(req.url ?? "");
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
    });

    const client = new OpenCodeClient(server.url, server.url, "/vault");

    expect(await client.initializeProject()).toBe(false);
    expect(paths).toEqual(["/api/session?directory=%2Fvault&limit=1&order=asc"]);
  });

  test("treats an HTML body as failure even on 200", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><html><body>app</body></html>");
    });

    const client = new OpenCodeClient(server.url, server.url, "/vault");

    expect(await client.getLatestSessionId()).toBeNull();
    expect(await client.initializeProject()).toBe(false);
  });

  test("resolves session urls and ids", () => {
    const client = new OpenCodeClient(
      "http://127.0.0.1:49374/",
      "http://127.0.0.1:4097/",
      "/vault"
    );

    expect(client.getSessionUrl("ses_1")).toBe("http://127.0.0.1:4097/session/ses_1");
    expect(client.resolveSessionId("http://127.0.0.1:4097/session/ses_2?x=1")).toBe("ses_2");
    expect(client.resolveSessionId("http://127.0.0.1:4097/server/abc")).toBeNull();
  });
});

async function listen(handler: http.RequestListener): Promise<http.Server & { url: string }> {
  const server = http.createServer(handler) as http.Server & { url: string };
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  server.url = `http://127.0.0.1:${address.port}`;
  servers.push(server);
  return server;
}
