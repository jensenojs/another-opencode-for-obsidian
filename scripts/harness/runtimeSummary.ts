import { getExplicitCustomCommand, usesExplicitCustomCommand } from "../../src/types";

export type LogEntry = {
  time: string | null;
  level: string | null;
  component: string | null;
  message: string | null;
  data: unknown;
};

export function summarizeSettings(data: any): unknown {
  const customCommand = String(data.customCommand ?? "");
  const useCustomCommand = Boolean(data.useCustomCommand);

  return {
    port: data.port,
    hostname: data.hostname,
    autoStart: data.autoStart,
    useCustomCommand,
    customCommand,
    explicitCustomCommand: getExplicitCustomCommand({ customCommand }) || null,
    effectiveStartMode: usesExplicitCustomCommand({
      customCommand,
      useCustomCommand,
    })
      ? "custom"
      : "path",
    webViewAppearance: data.webViewAppearance,
    projectDirectory: data.projectDirectory,
    startupTimeout: data.startupTimeout,
    lastSessionUrl: data.lastSessionUrl,
  };
}

export function summarizeRuntimeStatus(status: any): any {
  return {
    ...status,
    processEnvironment: summarizeEnvironmentDiagnostics(status.processEnvironment),
    lastSpawnEnvironment: summarizeEnvironmentDiagnostics(status.lastSpawnEnvironment),
    lastStdout: summarizeLogValue(status.lastStdout, 0),
    lastStderr: summarizeLogValue(status.lastStderr, 0),
    lastProcessErrorStack: summarizeLogValue(status.lastProcessErrorStack, 0),
    runtimeDiagnostics: summarizeLogValue(status.runtimeDiagnostics, 0),
  };
}

export function summarizeEnvironmentDiagnostics(environment: any): unknown {
  if (!environment || typeof environment !== "object") {
    return null;
  }

  const envKeys = Array.isArray(environment.envKeys) ? environment.envKeys : [];
  const secretLikeEnvKeys = Array.isArray(environment.secretLikeEnvKeys)
    ? environment.secretLikeEnvKeys
    : [];

  return {
    platform: environment.platform ?? null,
    pathKey: environment.pathKey ?? null,
    path: environment.path ?? null,
    pathEntries: Array.isArray(environment.pathEntries) ? environment.pathEntries : [],
    shell: environment.shell ?? null,
    envKeyCount: envKeys.length,
    envKeySample: envKeys.slice(0, 12),
    secretLikeEnvKeys,
  };
}

export function summarizeLogLine(line: string): unknown {
  const entry = parseLogEntry(line);
  if (entry) {
    return {
      time: entry.time,
      level: entry.level,
      component: entry.component,
      message: entry.message,
      data: summarizeLogValue(entry.data, 0),
    };
  }

  return { raw: truncateText(line, 240) };
}

export function parseLogEntry(line: string): LogEntry | null {
  try {
    const entry = JSON.parse(line);
    if (!entry || typeof entry !== "object") {
      return null;
    }

    return {
      time: typeof entry.time === "string" ? entry.time : null,
      level: typeof entry.level === "string" ? entry.level : null,
      component: typeof entry.component === "string" ? entry.component : null,
      message: typeof entry.message === "string" ? entry.message : null,
      data: entry.data,
    };
  } catch {
    return null;
  }
}

export function summarizeLogEvents(lines: string[]): unknown {
  const entries = lines
    .map((line) => parseLogEntry(line))
    .filter((entry): entry is LogEntry => !!entry);
  const byLevel: Record<string, number> = {};
  const byComponent: Record<string, number> = {};

  for (const entry of entries) {
    incrementCount(byLevel, entry.level ?? "unknown");
    incrementCount(byComponent, entry.component ?? "unknown");
  }

  const recentProblems = entries
    .filter((entry) => entry.level === "error" || entry.level === "warn")
    .slice(-5)
    .map((entry) => summarizeLogEntryForSummary(entry));

  return {
    linesScanned: lines.length,
    parsedLines: entries.length,
    byLevel,
    byComponent,
    lastProblem: summarizeLast(
      entries,
      (entry) => entry.level === "error" || entry.level === "warn"
    ),
    lastServerStart: summarizeLast(
      entries,
      (entry) => entry.component === "server" && entry.message === "starting server"
    ),
    lastServerExit: summarizeLast(
      entries,
      (entry) => entry.component === "server" && entry.message === "process exited"
    ),
    lastStderr: summarizeLast(
      entries,
      (entry) => entry.component === "server" && entry.message === "process stderr"
    ),
    lastThemeDiagnostics: summarizeLast(
      entries,
      (entry) => entry.component === "plugin" && entry.message === "theme diagnostics"
    ),
    lastIframeDiagnostics: summarizeLast(
      entries,
      (entry) => entry.component === "plugin" && entry.message === "iframe diagnostics"
    ),
    recentProblems,
  };
}

function summarizeLast(
  entries: LogEntry[],
  predicate: (entry: LogEntry) => boolean
): unknown | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (predicate(entries[index])) {
      return summarizeLogEntryForSummary(entries[index]);
    }
  }
  return null;
}

function summarizeLogEntryForSummary(entry: LogEntry): unknown {
  return {
    time: entry.time,
    level: entry.level,
    component: entry.component,
    message: entry.message,
    data: summarizeLogValue(entry.data, 0),
  };
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarizeLogValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return truncateText(value, 240);
  }
  if (
    value === null ||
    typeof value === "undefined" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    const result: Record<string, unknown> = { count: value.length };
    if (depth === 0 && value.length > 0) {
      result.sample = value.slice(0, 3).map((item) => summarizeLogValue(item, depth + 1));
    }
    return result;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (depth >= 1) {
      return { keys: entries.map(([key]) => key) };
    }

    return Object.fromEntries(
      entries.map(([key, item]) => [key, summarizeLogValue(item, depth + 1)])
    );
  }

  return String(value);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
