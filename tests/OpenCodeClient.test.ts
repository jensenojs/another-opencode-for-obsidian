import { describe, expect, test } from "bun:test";
import * as http from "http";
import type { AddressInfo } from "net";
import { OpenCodeClient } from "../src/client/OpenCodeClient";

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
        expect(requestUrl).toBe(
          `/session?directory=${encodeURIComponent(projectDirectory)}`
        );
      } finally {
        await close(server);
      }
    });
  }
});
