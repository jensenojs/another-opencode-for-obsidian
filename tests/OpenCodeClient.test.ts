import { describe, expect, test } from "bun:test";
import * as http from "http";
import type { AddressInfo } from "net";
import { CONTEXT_MESSAGE_PREFIX, OpenCodeClient } from "../src/client/OpenCodeClient";

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return (server.address() as AddressInfo).port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("OpenCodeClient", () => {
  const projectDirectories = [
    "/Users/oujinsai/Note/计算机",
    "C:\\Users\\Alice\\Notes With Spaces",
    "\\\\server\\share\\团队笔记",
    "/tmp/100% complete/notes",
  ];

  for (const projectDirectory of projectDirectories) {
    test(`percent-encodes the project directory header for ${projectDirectory}`, async () => {
      let directoryHeader: string | string[] | undefined;
      let requestUrl: string | undefined;

      const server = http.createServer((req, res) => {
        directoryHeader = req.headers["x-opencode-directory"];
        requestUrl = req.url;
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
      });

      const port = await listen(server);
      const client = new OpenCodeClient(
        `http://127.0.0.1:${port}`,
        `http://127.0.0.1:${port}`,
        projectDirectory
      );

      try {
        const initialized = await client.initializeProject();

        expect(initialized).toBe(true);
        expect(directoryHeader).toBe(encodeURIComponent(projectDirectory));
        expect(requestUrl).toBe(`/session?directory=${encodeURIComponent(projectDirectory)}`);
      } finally {
        await close(server);
      }
    });
  }

  test("adds noReply context messages with the plugin context marker", async () => {
    let requestBody: any;
    let requestUrl: string | undefined;
    let requestMethod: string | undefined;

    const server = http.createServer((req, res) => {
      requestUrl = req.url;
      requestMethod = req.method;
      let data = "";
      req.on("data", (chunk: Buffer) => (data += chunk));
      req.on("end", () => {
        requestBody = JSON.parse(data);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            info: { id: "msg_1", sessionID: "ses_1" },
            parts: [
              {
                id: "prt_1",
                sessionID: "ses_1",
                messageID: "msg_1",
                type: "text",
                text: requestBody.parts[0].text,
              },
            ],
          })
        );
      });
    });

    const port = await listen(server);
    const client = new OpenCodeClient(
      `http://127.0.0.1:${port}`,
      `http://127.0.0.1:${port}`,
      "/vault"
    );

    try {
      const result = await client.addContextMessage("ses_1", "hello context");

      expect(result).toEqual({ messageId: "msg_1", partId: "prt_1" });
      expect(requestMethod).toBe("POST");
      expect(requestUrl).toBe("/session/ses_1/message");
      expect(requestBody.noReply).toBe(true);
      expect(requestBody.parts).toEqual([
        { type: "text", text: `${CONTEXT_MESSAGE_PREFIX}\nhello context` },
      ]);
    } finally {
      await close(server);
    }
  });

  test("ignores a part by reading the current part before patching it", async () => {
    const requests: Array<{ method?: string; url?: string; body?: any }> = [];

    const server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (chunk: Buffer) => (data += chunk));
      req.on("end", () => {
        const body = data ? JSON.parse(data) : undefined;
        requests.push({ method: req.method, url: req.url, body });

        res.writeHead(200, { "content-type": "application/json" });
        if (req.method === "GET") {
          res.end(
            JSON.stringify({
              info: { id: "msg_1", sessionID: "ses_1" },
              parts: [
                {
                  id: "prt_1",
                  sessionID: "ses_1",
                  messageID: "msg_1",
                  type: "text",
                  text: "context",
                },
              ],
            })
          );
          return;
        }

        res.end(JSON.stringify(body));
      });
    });

    const port = await listen(server);
    const client = new OpenCodeClient(
      `http://127.0.0.1:${port}`,
      `http://127.0.0.1:${port}`,
      "/vault"
    );

    try {
      const ignored = await client.ignorePart("ses_1", "msg_1", "prt_1");

      expect(ignored).toBe(true);
      expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
        "GET /session/ses_1/message/msg_1",
        "PATCH /session/ses_1/message/msg_1/part/prt_1",
      ]);
      expect(requests[1].body).toEqual({
        id: "prt_1",
        sessionID: "ses_1",
        messageID: "msg_1",
        type: "text",
        text: "context",
        ignored: true,
      });
    } finally {
      await close(server);
    }
  });

  test("treats missing parts as already ignored", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
    });

    const port = await listen(server);
    const client = new OpenCodeClient(
      `http://127.0.0.1:${port}`,
      `http://127.0.0.1:${port}`,
      "/vault"
    );

    try {
      await expect(client.ignorePart("ses_1", "msg_1", "prt_1")).resolves.toBe(true);
    } finally {
      await close(server);
    }
  });

  test("lists session messages", async () => {
    let requestUrl: string | undefined;

    const server = http.createServer((req, res) => {
      requestUrl = req.url;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ info: { id: "msg_1", sessionID: "ses_1" }, parts: [] }]));
    });

    const port = await listen(server);
    const client = new OpenCodeClient(
      `http://127.0.0.1:${port}`,
      `http://127.0.0.1:${port}`,
      "/vault"
    );

    try {
      const messages = await client.listSessionMessages("ses_1");

      expect(requestUrl).toBe("/session/ses_1/message");
      expect(messages?.[0]?.info.id).toBe("msg_1");
    } finally {
      await close(server);
    }
  });
});
