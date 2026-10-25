import { readdir, readFile } from "fs/promises";
import { request as httpRequest } from "http";
import { homedir } from "os";
import { join } from "path";
import { buildServerAuthHeader } from "../client/ServerAuth";

export interface ServiceHandle {
  name: string;
  url: string;
  password: string;
  version: string;
  pid: number;
}

export interface ServiceSummary {
  name: string;
  url: string;
  version: string;
  pid: number;
}

export function summarizeService(handle: ServiceHandle): ServiceSummary {
  return { name: handle.name, url: handle.url, version: handle.version, pid: handle.pid };
}

export type ServiceCandidate =
  | { name: string; status: "readable"; url: string; password: string }
  | { name: string; status: "unreadable"; error: string };

interface ServiceInfo {
  version: string;
  pid: number;
}

const SERVICE_FILE_PATTERN = /^service.*\.json$/;
const DEFAULT_SERVICE_FILE = "service.json";
const INFO_TIMEOUT_MS = 2000;

export function defaultServiceDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "opencode");
}

export async function discoverServices(dir: string): Promise<ServiceCandidate[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => SERVICE_FILE_PATTERN.test(name));
  } catch {
    return [];
  }

  const candidates = await Promise.all(names.map((name) => readCandidate(dir, name)));
  return candidates.sort(
    (left, right) => rank(left.name) - rank(right.name) || left.name.localeCompare(right.name)
  );
}

export async function attachService(input: {
  dir: string;
  prefer: string | "auto";
}): Promise<ServiceHandle | null> {
  const candidates = await discoverServices(input.dir);

  for (const candidate of orderByPreference(candidates, input.prefer)) {
    if (candidate.status !== "readable") {
      continue;
    }

    const info = await probeService(candidate);
    if (!info) {
      continue;
    }

    return {
      name: candidate.name,
      url: candidate.url,
      password: candidate.password,
      version: info.version,
      pid: info.pid,
    };
  }

  return null;
}

function rank(name: string): number {
  return name === DEFAULT_SERVICE_FILE ? 0 : 1;
}

function orderByPreference(
  candidates: ServiceCandidate[],
  prefer: string | "auto"
): ServiceCandidate[] {
  if (prefer === "auto") {
    return candidates;
  }

  return candidates.filter((candidate) => candidate.name === prefer);
}

async function readCandidate(dir: string, name: string): Promise<ServiceCandidate> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(dir, name), "utf8"));
    const url = readField(parsed, "url");
    const password = readField(parsed, "password");
    if (url === null || password === null) {
      throw new Error("missing url or password");
    }
    return { name, status: "readable", url, password };
  } catch (error) {
    return {
      name,
      status: "unreadable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

function probeService(candidate: { url: string; password: string }): Promise<ServiceInfo | null> {
  const authHeader = buildServerAuthHeader(candidate.password);
  let target: URL;
  try {
    target = new URL("/api/info", candidate.url);
  } catch {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "GET",
        timeout: INFO_TIMEOUT_MS,
        headers: authHeader ? { authorization: authHeader } : {},
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () =>
          resolve(response.statusCode === 200 ? readServiceInfo(body) : null)
        );
      }
    );

    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(null));
    request.end();
  });
}

function readServiceInfo(body: string): ServiceInfo | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const { version, pid } = parsed as Record<string, unknown>;
  if (typeof version !== "string" || typeof pid !== "number" || !Number.isFinite(pid)) {
    return null;
  }

  return { version, pid };
}
