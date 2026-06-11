import type { ServerDiagnostics } from "../server/ServerManager";

export type ServerDiagnosticsSnapshot = ServerDiagnostics & {
  logFile: string;
  statusFile: string;
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
      lastDisplayCommand: diagnostics.lastDisplayCommand,
      lastCwd: diagnostics.lastCwd,
      lastStdout: diagnostics.lastStdout,
      lastStderr: diagnostics.lastStderr,
      lastExitCode: diagnostics.lastExitCode,
      lastExitSignal: diagnostics.lastExitSignal,
      lastProcessErrorStack: diagnostics.lastProcessErrorStack,
      logFile: diagnostics.logFile,
      statusFile: diagnostics.statusFile,
    },
    null,
    2
  );
}

export function formatStartFailureNotice(diagnostics: ServerDiagnosticsSnapshot): string {
  const error = diagnostics.lastError?.trim();
  const firstLine = error
    ? `OpenCode failed to start: ${truncate(error, 120)}`
    : "OpenCode failed to start.";

  return `${firstLine} Run "Copy OpenCode diagnostics" for details. Log: ${diagnostics.logFile}`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
