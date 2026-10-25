import type { ServiceHandle } from "./ServiceDiscovery";

export type ServiceState = "attached" | "unavailable";

export type ServiceStatus =
  | { state: "attached"; handle: ServiceHandle }
  | { state: "unavailable"; reason: string };
