import type { ServerDiagnostics } from "../server/ServerManager";
import type { RuntimeDiagnosticsSnapshot } from "./RuntimeDiagnostics";
import { getText } from "../i18n";

export type ServerDiagnosticsSnapshot = ServerDiagnostics & {
  logFile: string;
  statusFile: string;
  runtimeDiagnostics?: RuntimeDiagnosticsSnapshot;
};

export function formatServerDiagnosticsForClipboard(
  diagnostics: ServerDiagnosticsSnapshot
): string {
  return JSON.stringify(
    {
      state: diagnostics.state,
      lastError: diagnostics.lastError,
      hint: diagnostics.hint,
      lastHealthError: diagnostics.lastHealthError,
      lastCommand: diagnostics.lastCommand,
      lastCommandArgs: diagnostics.lastCommandArgs,
      lastStartMode: diagnostics.lastStartMode,
      lastUsesShell: diagnostics.lastUsesShell,
      lastDisplayCommand: diagnostics.lastDisplayCommand,
      lastCwd: diagnostics.lastCwd,
      lastStdout: diagnostics.lastStdout,
      lastStderr: diagnostics.lastStderr,
      lastExitCode: diagnostics.lastExitCode,
      lastExitSignal: diagnostics.lastExitSignal,
      lastProcessErrorStack: diagnostics.lastProcessErrorStack,
      processEnvironment: diagnostics.processEnvironment,
      lastSpawnEnvironment: diagnostics.lastSpawnEnvironment,
      lastResolvedExecutable: diagnostics.lastResolvedExecutable,
      runtimeDiagnostics: diagnostics.runtimeDiagnostics,
      logFile: diagnostics.logFile,
      statusFile: diagnostics.statusFile,
    },
    null,
    2
  );
}

export function formatStartFailureNotice(diagnostics: ServerDiagnosticsSnapshot): string {
  const text = getText();
  const error = diagnostics.lastError?.trim();
  const firstLine = text.notices.startFailureLine(error ? truncate(error, 120) : null);

  return text.notices.startFailure(firstLine, diagnostics.logFile);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
