import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "http";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  attachService,
  defaultServiceDir,
  discoverServices,
  summarizeService,
} from "../../src/server/ServiceDiscovery";
import { buildServerAuthHeader } from "../../src/client/ServerAuth";

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  );
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeServiceDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencode-service-"));
  tempDirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

function writeService(name: string, url: string, password = "secret"): Record<string, unknown> {
  return { [name]: { id: name, url, password } };
}

async function startServiceInfoServer(input: {
  password: string;
  version?: string;
  pid?: number;
}): Promise<string> {
  const expected = buildServerAuthHeader(input.password);
  const server = createServer((request, response) => {
    if (request.url !== "/api/info" || request.headers.authorization !== expected) {
      response.writeHead(401);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ version: input.version ?? "2.1.3", pid: input.pid ?? 4242 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("expected a bound tcp address");
  }
  return `http://127.0.0.1:${address.port}`;
}

function deadUrl(): string {
  return "http://127.0.0.1:1";
}

describe("defaultServiceDir", () => {
  test("follows XDG_STATE_HOME and falls back to the home state directory", () => {
    expect(defaultServiceDir({ XDG_STATE_HOME: "/tmp/state" })).toBe("/tmp/state/opencode");
    expect(defaultServiceDir({})).toMatch(/\/\.local\/state\/opencode$/);
  });
});

describe("discoverServices", () => {
  test("reads service files with service.json first and the rest sorted by name", async () => {
    const dir = await makeServiceDir({
      "service-zom.json": { url: deadUrl(), password: "zom" },
      "service.json": { url: deadUrl(), password: "main" },
      "service-alias.json": { url: deadUrl(), password: "alias" },
      "config.json": { url: deadUrl(), password: "ignored" },
    });

    const candidates = await discoverServices(dir);

    expect(candidates.map((candidate) => candidate.name)).toEqual([
      "service.json",
      "service-alias.json",
      "service-zom.json",
    ]);
    expect(candidates[0]).toEqual({
      name: "service.json",
      status: "readable",
      url: deadUrl(),
      password: "main",
    });
  });

  test("reports unreadable service files instead of throwing", async () => {
    const dir = await makeServiceDir({
      "service-broken.json": "{ not json",
      "service-incomplete.json": { password: "only-password" },
    });

    const candidates = await discoverServices(dir);

    expect(candidates.map((candidate) => [candidate.name, candidate.status])).toEqual([
      ["service-broken.json", "unreadable"],
      ["service-incomplete.json", "unreadable"],
    ]);
  });

  test("returns an empty list when the directory does not exist", async () => {
    expect(await discoverServices(join(tmpdir(), "opencode-service-missing-dir"))).toEqual([]);
  });
});

describe("attachService", () => {
  test("auto attaches to service.json when it is reachable", async () => {
    const url = await startServiceInfoServer({ password: "main", pid: 96699 });
    const dir = await makeServiceDir({
      ...writeService("service.json", url, "main"),
      ...writeService("service-zom.json", deadUrl(), "zom"),
    });

    const handle = await attachService({ dir, prefer: "auto" });

    expect(handle).toEqual({
      name: "service.json",
      url,
      password: "main",
      version: "2.1.3",
      pid: 96699,
    });
    expect(summarizeService(handle!)).toEqual({
      name: "service.json",
      url,
      version: "2.1.3",
      pid: 96699,
    });
  });

  test("auto skips a dead service and attaches to the next reachable one", async () => {
    const url = await startServiceInfoServer({ password: "zom" });
    const dir = await makeServiceDir({
      ...writeService("service.json", deadUrl(), "main"),
      ...writeService("service-zom.json", url, "zom"),
    });

    const handle = await attachService({ dir, prefer: "auto" });

    expect(handle?.name).toBe("service-zom.json");
    expect(handle?.password).toBe("zom");
  });

  test("honors the preferred service file over service.json", async () => {
    const mainUrl = await startServiceInfoServer({ password: "main", pid: 1 });
    const zomUrl = await startServiceInfoServer({ password: "zom", pid: 2 });
    const dir = await makeServiceDir({
      ...writeService("service.json", mainUrl, "main"),
      ...writeService("service-zom.json", zomUrl, "zom"),
    });

    const handle = await attachService({ dir, prefer: "service-zom.json" });

    expect(handle?.name).toBe("service-zom.json");
    expect(handle?.pid).toBe(2);
  });

  test("never substitutes another service when the preferred file is absent", async () => {
    const url = await startServiceInfoServer({ password: "main" });
    const dir = await makeServiceDir(writeService("service.json", url, "main"));

    expect(await attachService({ dir, prefer: "service-zom.json" })).toBeNull();
  });

  test("does not fall back when the preferred file is present but unreachable", async () => {
    const reachable = await startServiceInfoServer({ password: "main" });
    const dir = await makeServiceDir({
      ...writeService("service.json", reachable, "main"),
      ...writeService("service-zom.json", deadUrl(), "zom"),
    });

    expect(await attachService({ dir, prefer: "service-zom.json" })).toBeNull();
  });

  test("returns null when no candidate answers with valid info", async () => {
    const unauthorized = await startServiceInfoServer({ password: "different" });
    const dir = await makeServiceDir({
      ...writeService("service.json", deadUrl(), "main"),
      ...writeService("service-unauthorized.json", unauthorized, "main"),
    });

    expect(await attachService({ dir, prefer: "auto" })).toBeNull();
  });
});
