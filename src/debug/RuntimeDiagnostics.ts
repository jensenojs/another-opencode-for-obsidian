import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimePaths {
  stateDir: string;
  logFile: string;
  statusFile: string;
}

export interface RuntimeStatusSnapshot {
  lifecycle: string;
  serverState: string;
  lastError: string | null;
  lastHealthError: string | null;
  lastCommand: string | null;
  lastDisplayCommand: string | null;
  lastStartMode: string | null;
  lastUsesShell: boolean | null;
  lastCwd: string | null;
  lastStdout: string | null;
  lastStderr: string | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastProcessErrorStack: string | null;
  processEnvironment: unknown;
  lastSpawnEnvironment: unknown;
  lastResolvedExecutable: string | null;
  diagnosticHint: string | null;
  pid: number | null;
  hostname: string;
  port: number;
  apiBaseUrl: string;
  uiBaseUrl: string;
  healthUrl: string;
  proxyUrl: string | null;
  proxyPort: number | null;
  projectDirectory: string;
  useCustomCommand: boolean;
  webViewAppearance: string;
  runtimeDiagnostics: RuntimeDiagnosticsSnapshot;
  autoStart: boolean;
  logFile: string;
  statusFile: string;
}

export interface RuntimeDiagnosticsSnapshot {
  theme: unknown | null;
  iframe: unknown | null;
}

const LOG_MAX_BYTES = 1024 * 1024;
const LOG_PREFIX = "[OpenCode]";

export function getRuntimePaths(env: NodeJS.ProcessEnv = process.env): RuntimePaths {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  const stateDir = join(stateHome, "opencode-obsidian");

  return {
    stateDir,
    logFile: join(stateDir, "opencode-obsidian.log"),
    statusFile: join(stateDir, "status.json"),
  };
}

export class RuntimeLogger {
  constructor(private component: string) {}

  debug(message: string, data?: unknown): void {
    this.write("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.write("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.write("error", message, data);
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    const paths = getRuntimePaths();
    const entry = {
      time: new Date().toISOString(),
      level,
      component: this.component,
      message,
      data,
    };

    ensureDir(paths.stateDir);
    rotateIfNeeded(paths.logFile);
    appendFileSync(paths.logFile, stringifyRuntimeJson(entry) + "\n", "utf8");
    mirrorToConsole(level, this.component, message, data);
  }
}

export function createLogger(component: string): RuntimeLogger {
  return new RuntimeLogger(component);
}

export function writeRuntimeStatus(snapshot: RuntimeStatusSnapshot): void {
  const paths = getRuntimePaths();
  const payload = {
    updatedAt: new Date().toISOString(),
    ...snapshot,
  };

  ensureDir(paths.stateDir);
  writeFileSync(paths.statusFile, stringifyRuntimeJson(payload, 2) + "\n", "utf8");
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function rotateIfNeeded(logFile: string): void {
  if (!existsSync(logFile)) {
    return;
  }

  const size = statSync(logFile).size;
  if (size < LOG_MAX_BYTES) {
    return;
  }

  const rotated = `${logFile}.1`;
  renameSync(logFile, rotated);
}

function mirrorToConsole(
  level: LogLevel,
  component: string,
  message: string,
  data?: unknown
): void {
  const prefix = `${LOG_PREFIX} ${component}: ${message}`;
  if (level === "error") {
    console.error(prefix, data ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(prefix, data ?? "");
    return;
  }
  console.log(prefix, data ?? "");
}

function stringifyRuntimeJson(value: unknown, spaces?: number): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (key, item) => {
      const redacted = redactSecrets(key, item);
      if (redacted !== item) {
        return redacted;
      }
      if (item instanceof Error) {
        return {
          name: item.name,
          message: item.message,
          stack: item.stack,
        };
      }
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) {
          return "[circular]";
        }
        seen.add(item);
      }
      if (typeof item === "undefined") {
        return null;
      }
      return item;
    },
    spaces
  );
}

function redactSecrets(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase();
  if (
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie")
  ) {
    return "[redacted]";
  }
  return value;
}
