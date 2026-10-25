import type { ServiceSummary } from "../server/ServiceDiscovery";
import type { ServiceState } from "../server/types";
import { getRuntimePaths } from "./RuntimeDiagnostics";

export interface ServiceDiagnosticsSnapshot {
  state: ServiceState;
  service: ServiceSummary | null;
  reason: string | null;
  runtimeDiagnostics?: unknown;
}

export function formatServiceDiagnosticsForClipboard(snapshot: ServiceDiagnosticsSnapshot): string {
  const paths = getRuntimePaths();

  return JSON.stringify(
    {
      state: snapshot.state,
      service: snapshot.service,
      reason: snapshot.reason,
      runtimeDiagnostics: snapshot.runtimeDiagnostics ?? null,
      logFile: paths.logFile,
      statusFile: paths.statusFile,
    },
    null,
    2
  );
}
