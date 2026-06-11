export type ViewLocation = "sidebar" | "main";

export interface ServerEndpoint {
  hostname: string;
  port: number;
  apiBaseUrl: string;
  uiBaseUrl: string;
  healthUrl: string;
  encodedProjectDirectory: string;
}

export interface OpenCodeSettings {
  port: number;
  hostname: string;
  autoStart: boolean;
  opencodePath: string;
  projectDirectory: string;
  startupTimeout: number;
  defaultViewLocation: ViewLocation;
  injectWorkspaceContext: boolean;
  maxNotesInContext: number;
  maxSelectionLength: number;
  customCommand: string;
  useCustomCommand: boolean;
  lastSessionUrl: string;
}

export const DEFAULT_CUSTOM_COMMAND =
  "opencode serve --hostname {hostname} --port {port} --cors {cors}";

export const DEFAULT_SETTINGS: OpenCodeSettings = {
  port: 14096,
  hostname: "127.0.0.1",
  autoStart: false,
  opencodePath: "opencode",
  projectDirectory: "",
  startupTimeout: 45000,
  defaultViewLocation: "sidebar",
  injectWorkspaceContext: false,
  maxNotesInContext: 20,
  maxSelectionLength: 2000,
  customCommand: DEFAULT_CUSTOM_COMMAND,
  useCustomCommand: false,
  lastSessionUrl: "",
};

export const OPENCODE_VIEW_TYPE = "opencode-view";

export function getCustomCommandTemplate(
  settings: Pick<OpenCodeSettings, "customCommand">
): string {
  return settings.customCommand.trim() || DEFAULT_CUSTOM_COMMAND;
}

export function createServerEndpoint(
  settings: Pick<OpenCodeSettings, "hostname" | "port">,
  projectDirectory: string
): ServerEndpoint {
  const encodedProjectDirectory = Buffer.from(projectDirectory).toString("base64");
  const apiBaseUrl = `http://${settings.hostname}:${settings.port}`;

  return {
    hostname: settings.hostname,
    port: settings.port,
    apiBaseUrl,
    uiBaseUrl: `${apiBaseUrl}/${encodedProjectDirectory}`,
    healthUrl: `${apiBaseUrl}/global/health`,
    encodedProjectDirectory,
  };
}
