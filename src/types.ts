export type ViewLocation = "sidebar" | "main";
export type WebViewAppearance = "opencode" | "obsidian";

export interface WebViewTheme {
  colorScheme: "light" | "dark";
  variables: Record<string, string>;
}

export interface ServerEndpoint {
  hostname: string;
  port: number;
  apiBaseUrl: string;
  uiBaseUrl: string;
  healthUrl: string;
  encodedProjectDirectory: string;
}

export type ContextItemType = "manual" | "auto" | "inbound";

export interface ContextItem {
  id: string;
  type: ContextItemType;
  label: string;
  text: string;
  sourceFile: string;
  startLine?: number;
  endLine?: number;
  messageId?: string;
  partId?: string;
  createdAt: number;
}

export interface ContextSuggestion {
  id: string;
  label: string;
  text: string;
  sourceFile: string;
  startLine?: number;
  endLine?: number;
  priority: number;
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
  autoAddSelectionContext: boolean;
  autoAddBacklinksContext: boolean;
  autoAddCursorContext: boolean;
  maxNotesInContext: number;
  maxSelectionLength: number;
  customCommand: string;
  useCustomCommand: boolean;
  webViewAppearance: WebViewAppearance;
  lastSessionUrl: string;
}

export const CUSTOM_COMMAND_EXAMPLE =
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
  autoAddSelectionContext: false,
  autoAddBacklinksContext: false,
  autoAddCursorContext: false,
  maxNotesInContext: 20,
  maxSelectionLength: 2000,
  customCommand: "",
  useCustomCommand: false,
  webViewAppearance: "obsidian",
  lastSessionUrl: "",
};

export const OPENCODE_VIEW_TYPE = "opencode-view";

export function getExplicitCustomCommand(
  settings: Pick<OpenCodeSettings, "customCommand">
): string {
  return settings.customCommand.trim();
}

export function usesExplicitCustomCommand(
  settings: Pick<OpenCodeSettings, "customCommand" | "useCustomCommand">
): boolean {
  return settings.useCustomCommand && getExplicitCustomCommand(settings).length > 0;
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
