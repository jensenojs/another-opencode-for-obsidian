import { afterEach, describe, expect, test } from "bun:test";
import * as http from "http";
import type { AddressInfo } from "net";
import {
  OpenCodeEventSource,
  buildEventEndpoint,
  parseSseData,
  type OpenCodeEventSourceSnapshot,
} from "../../src/client/OpenCodeEventSource";

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

describe("OpenCodeEventSource", () => {
  test("builds the v2 event endpoint without a directory query", () => {
    const endpoint = buildEventEndpoint("http://127.0.0.1:49374/");

    expect(endpoint).toBe("http://127.0.0.1:49374/api/event");
    expect(new URL(endpoint).search).toBe("");
  });

  test("parses SSE data frames", () => {
    expect(parseSseData('event: message\ndata: {"type":"server.connected"}')).toBe(
      '{"type":"server.connected"}'
    );
    expect(parseSseData(": keepalive")).toBeNull();
  });

  test("streams /api/event without a directory header and counts current-session events", async () => {
    let requestedUrl = "";
    const server = await listen((req, res) => {
      requestedUrl = req.url ?? "";
      expect(req.headers["x-opencode-directory"]).toBeUndefined();
      expect(req.headers.accept).toBe("text/event-stream");

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      res.write(
        `data: ${JSON.stringify({
          id: "evt_1",
          type: "server.connected",
          data: {},
          location: { directory: "/vault" },
        })}\n\n`
      );
      res.write(
        `data: ${JSON.stringify({
          id: "evt_2",
          type: "session.idle",
          data: { sessionID: "ses_current" },
          location: { directory: "/vault" },
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
    expect(requestedUrl).toBe("/api/event");
    expect(snapshot.state).toBe("connected");
    expect(snapshot.lastEventType).toBe("session.idle");
    expect(snapshot.lastEventSessionId).toBe("ses_current");
    expect(snapshot.lastSessionEventType).toBe("session.idle");
    expect(snapshot.eventCount).toBe(2);

    source.stop();
  });

  test("ignores events from other directories", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({
          id: "evt_1",
          type: "session.idle",
          data: { sessionID: "ses_other" },
          location: { directory: "/other/vault" },
        })}\n\n`
      );
      res.write(
        `data: ${JSON.stringify({
          id: "evt_2",
          type: "session.idle",
          data: { sessionID: "ses_mine" },
          location: { directory: "/vault" },
        })}\n\n`
      );
    });

    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: server.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => "ses_mine",
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();

    const snapshot = await waitForSnapshot(snapshots, (candidate) => candidate.eventCount === 1);
    expect(snapshot.lastEventId).toBe("evt_2");
    expect(snapshot.lastEventSessionId).toBe("ses_mine");
    expect(snapshot.eventCount).toBe(1);

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

  test("reports a closed stream as disconnected so the plugin can re-attach", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({
          id: "evt_1",
          type: "server.connected",
          data: {},
          location: { directory: "/vault" },
        })}\n\n`
      );
      res.end();
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
      (candidate) => candidate.state === "disconnected"
    );
    expect(typeof snapshot.disconnectedAt).toBe("number");
  });

  test("stop returns the source to idle", async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({
          id: "evt_1",
          type: "server.connected",
          data: {},
          location: { directory: "/vault" },
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
    await waitForSnapshot(snapshots, (candidate) => candidate.state === "connected");
    source.stop();

    expect(source.getSnapshot().state).toBe("idle");
  });
  test("reconnects to the service the plugin just attached to", async () => {
    let connected = 0;
    let previousClosed = false;
    const previous = await listen(() => {
      // Never responds, so the switch interrupts an in-flight request.
    });
    previous.on("connection", (socket) => {
      connected += 1;
      socket.on("close", () => {
        previousClosed = true;
      });
    });

    const requestedUrls: string[] = [];
    const next = await listen((req, res) => {
      requestedUrls.push(req.url ?? "");
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify(event("evt_next", "server.connected"))}\n\n`);
    });

    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: previous.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();
    await waitFor(() => connected === 1);

    source.updateConnection(next.url, "/vault");
    source.start();

    const snapshot = await waitForSnapshot(
      snapshots,
      (candidate) => candidate.state === "connected"
    );
    expect(snapshot.endpoint).toBe(buildEventEndpoint(next.url));
    expect(requestedUrls).toEqual(["/api/event"]);
    expect(source.getSnapshot().endpoint).toBe(buildEventEndpoint(next.url));

    await waitFor(() => previousClosed);
    expect(source.getSnapshot().state).toBe("connected");

    source.stop();
  });

  test("keeps the new stream when the previous request tears down", async () => {
    let connected = 0;
    const previous = await listen(() => {
      // Never responds: destroying this request emits ECONNRESET on it.
    });
    previous.on("connection", () => {
      connected += 1;
    });

    const next = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify(event("evt_b1", "server.connected"))}\n\n`);
      setTimeout(() => {
        res.write(`data: ${JSON.stringify(event("evt_b2", "session.idle"))}\n\n`);
      }, 120);
    });

    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: previous.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();
    await waitFor(() => connected === 1);

    source.updateConnection(next.url, "/vault");
    source.start();

    // The stale request errors within a few milliseconds of the switch; the
    // second event only arrives later, so reaching it proves nothing stale
    // cleared the slot or the snapshot.
    const snapshot = await waitForSnapshot(snapshots, (candidate) => candidate.eventCount === 2);
    expect(snapshot.state).toBe("connected");
    expect(snapshot.endpoint).toBe(buildEventEndpoint(next.url));
    expect(snapshots.some((candidate) => candidate.state === "failed")).toBe(false);

    source.stop();
  });

  test("stays idle when a stopped request tears down", async () => {
    let connected = 0;
    let closed = false;
    const server = await listen(() => {
      // Never responds: stop() destroys the request mid-flight.
    });
    server.on("connection", (socket) => {
      connected += 1;
      socket.on("close", () => {
        closed = true;
      });
    });

    const snapshots: OpenCodeEventSourceSnapshot[] = [];
    const source = new OpenCodeEventSource({
      apiBaseUrl: server.url,
      projectDirectory: "/vault",
      getCurrentSessionId: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    source.start();
    await waitFor(() => connected === 1);
    source.stop();
    await waitFor(() => closed);

    expect(source.getSnapshot().state).toBe("idle");
    expect(snapshots.some((candidate) => candidate.state === "disconnected")).toBe(false);
  });
});

async function listen(handler: http.RequestListener): Promise<http.Server & { url: string }> {
  const server = http.createServer(handler) as http.Server & { url: string };
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  server.url = `http://127.0.0.1:${port}`;
  servers.push(server);
  return server;
}

function event(id: string, type: string): Record<string, unknown> {
  return { id, type, data: {}, location: { directory: "/vault" } };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2000) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for condition");
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
