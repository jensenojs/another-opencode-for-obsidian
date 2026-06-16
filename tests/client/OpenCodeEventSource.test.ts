import { afterEach, describe, expect, test } from "bun:test";
import * as http from "http";
import {
  OpenCodeEventSource,
  buildEventEndpoint,
  parseSseData,
  type OpenCodeEventSourceSnapshot,
} from "../../src/client/OpenCodeEventSource";

const servers: http.Server[] = [];
let nextPort = 18100;

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

describe("OpenCodeEventSource", () => {
  test("builds the v2 location event endpoint", () => {
    const endpoint = buildEventEndpoint("http://127.0.0.1:14096/", "/Users/oujinsai/Note/计算机");
    const url = new URL(endpoint);

    expect(url.pathname).toBe("/api/event");
    expect(url.searchParams.get("location[directory]")).toBe("/Users/oujinsai/Note/计算机");
  });

  test("parses SSE data frames", () => {
    expect(parseSseData('event: message\ndata: {"type":"server.connected"}')).toBe(
      '{"type":"server.connected"}'
    );
    expect(parseSseData(": keepalive")).toBeNull();
  });

  test("connects to /api/event and tracks current-session events", async () => {
    let requestedUrl = "";
    const server = await listen((req, res) => {
      requestedUrl = req.url ?? "";
      expect(req.headers["x-opencode-directory"]).toBe(encodeURIComponent("/vault"));

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      res.write(`data: ${JSON.stringify({ id: "evt_1", type: "server.connected", data: {} })}\n\n`);
      res.write(
        `data: ${JSON.stringify({
          id: "evt_2",
          type: "session.idle",
          data: { sessionID: "ses_current" },
        })}\n\n`
      );
    });

    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: server.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => "ses_current",
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();

    const snapshot = await waitForSnapshot(
      snapshots,
      (candidate) => candidate.currentSessionEventCount === 1
    );
    expect(new URL(requestedUrl, server.url).pathname).toBe("/api/event");
    expect(new URL(requestedUrl, server.url).searchParams.get("location[directory]")).toBe(
      "/vault"
    );
    expect(snapshot.state).toBe("connected");
    expect(snapshot.lastEventType).toBe("session.idle");
    expect(snapshot.lastEventSessionId).toBe("ses_current");
    expect(snapshot.lastSessionEventType).toBe("session.idle");
    expect(snapshot.eventCount).toBe(2);

    source.stop();
  });

  test("marks missing /api/event as unsupported", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: server.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();

    const snapshot = await waitForSnapshot(
      snapshots,
      (candidate) => candidate.state === "unsupported"
    );
    expect(snapshot.lastError).toContain("/api/event");
  });

  test("does not count session events when there is no current session", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({
          id: "evt_1",
          type: "session.idle",
          data: { sessionID: "ses_other" },
        })}\n\n`
      );
    });
    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: server.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();

    const snapshot = await waitForSnapshot(snapshots, (candidate) => candidate.eventCount === 1);
    expect(snapshot.state).toBe("connected");
    expect(snapshot.lastEventType).toBe("session.idle");
    expect(snapshot.lastEventSessionId).toBe("ses_other");
    expect(snapshot.currentSessionEventCount).toBe(0);
    expect(snapshot.lastSessionEventType).toBeNull();

    source.stop();
  });

  test("stop returns the source to idle", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "evt_1", type: "server.connected", data: {} })}\n\n`);
    });
    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: server.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();
    await waitForSnapshot(snapshots, (candidate) => candidate.state === "connected");
    source.stop();

    expect(source.getSnapshot().state).toBe("idle");
  });
});

async function listen(handler: http.RequestListener): Promise<http.Server & { url: string }> {
  const server = http.createServer(handler) as http.Server & { url: string };
  const port = nextPort++;
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });
  server.url = `http://127.0.0.1:${port}`;
  servers.push(server);
  return server;
}

async function waitForSnapshot(
  snapshots: OpenCodeEventSourceSnapshot[],
  predicate: (snapshot: OpenCodeEventSourceSnapshot) => boolean
): Promise<OpenCodeEventSourceSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2000) {
    const match = snapshots.find(predicate);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for snapshot; saw ${JSON.stringify(snapshots)}`);
}
